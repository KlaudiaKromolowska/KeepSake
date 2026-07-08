import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import {
  AI_GLOBAL_DAILY_LIMIT,
  AI_USER_HOURLY_LIMIT,
  AiUnavailableError,
  assertAiQuota,
  generateStructured,
  QuotaError,
  streamText,
  streamThinkingJson,
} from "./core";
import { STREAM_JSON_SENTINEL } from "./stream-sentinel";

// SDK + fixture loader are mocked so tests never touch the network or need an API key.
const { ctor, parseMock, streamMock } = vi.hoisted(() => {
  const parseMock = vi.fn();
  const streamMock = vi.fn();
  // Regular function (not arrow): the AI core calls `new Anthropic(...)`, and arrows aren't newable.
  // biome-ignore lint/complexity/useArrowFunction: mock must be usable as a constructor.
  const ctor = vi.fn(function () {
    return { messages: { parse: parseMock, stream: streamMock } };
  });
  return { ctor, parseMock, streamMock };
});
vi.mock("@anthropic-ai/sdk", () => ({ default: ctor }));
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({
  zodOutputFormat: (schema: unknown) => ({ type: "json_schema", schema }),
}));

const { loadFixtureMock } = vi.hoisted(() => ({ loadFixtureMock: vi.fn() }));
vi.mock("@keepsake/core/prompts/fixtures", () => ({ loadFixture: loadFixtureMock }));

const schema = z.object({ name: z.string() });

interface QuotaOpts {
  userCount?: number;
  globalCount?: number;
  countErr?: unknown;
  rpcErr?: unknown;
  insertErr?: unknown;
  user?: { id: string } | null;
}

function fakeSupabase(opts: QuotaOpts) {
  const insert = vi.fn(async () => ({ error: opts.insertErr ?? null }));
  const gte = vi.fn(async () => ({ count: opts.userCount ?? 0, error: opts.countErr ?? null }));
  const select = vi.fn(() => ({ gte }));
  const from = vi.fn(() => ({ select, insert }));
  const rpc = vi.fn(async () => ({ data: opts.globalCount ?? 0, error: opts.rpcErr ?? null }));
  const getUser = vi.fn(async () => ({
    data: { user: opts.user === undefined ? { id: "u1" } : opts.user },
    error: null,
  }));
  const client = { from, rpc, auth: { getUser } } as unknown as SupabaseClient<Database>;
  return { client, from, insert, rpc };
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CLAUDE_FIXTURES;
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  delete process.env.CLAUDE_FIXTURES;
});

describe("assertAiQuota", () => {
  it("records a usage row when under both limits", async () => {
    const { client, insert } = fakeSupabase({ userCount: 5, globalCount: 10 });
    await expect(assertAiQuota(client, "wizard")).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledWith({ caregiver_id: "u1", kind: "wizard" });
  });

  it("throws QuotaError at the per-user hourly limit and records nothing", async () => {
    const { client, insert } = fakeSupabase({ userCount: AI_USER_HOURLY_LIMIT, globalCount: 0 });
    await expect(assertAiQuota(client, "vision")).rejects.toBeInstanceOf(QuotaError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("throws QuotaError over the per-user hourly limit", async () => {
    const { client } = fakeSupabase({ userCount: AI_USER_HOURLY_LIMIT + 1, globalCount: 0 });
    await expect(assertAiQuota(client, "vision")).rejects.toBeInstanceOf(QuotaError);
  });

  it("throws QuotaError at the global daily limit and records nothing", async () => {
    const { client, insert } = fakeSupabase({ userCount: 0, globalCount: AI_GLOBAL_DAILY_LIMIT });
    await expect(assertAiQuota(client, "rct")).rejects.toBeInstanceOf(QuotaError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("throws QuotaError over the global daily limit", async () => {
    const { client } = fakeSupabase({ userCount: 0, globalCount: AI_GLOBAL_DAILY_LIMIT + 50 });
    await expect(assertAiQuota(client, "rct")).rejects.toBeInstanceOf(QuotaError);
  });

  it("throws QuotaError when the user count read fails (fail closed)", async () => {
    const { client, insert } = fakeSupabase({ countErr: { message: "boom" } });
    await expect(assertAiQuota(client, "wizard")).rejects.toBeInstanceOf(QuotaError);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("generateStructured — fixture mode", () => {
  it("returns the canned parsed object without constructing the SDK or needing a key", async () => {
    process.env.CLAUDE_FIXTURES = "1";
    loadFixtureMock.mockReturnValue({ name: "Ada" });

    const result = await generateStructured({
      kind: "wizard",
      schema,
      system: "sys",
      user: "hi",
    });

    expect(result).toEqual({ name: "Ada" });
    expect(loadFixtureMock).toHaveBeenCalledWith("wizard");
    expect(ctor).not.toHaveBeenCalled();
    expect(parseMock).not.toHaveBeenCalled();
  });
});

describe("generateStructured — live path", () => {
  it("returns parsed_output and caches the system prompt", async () => {
    parseMock.mockResolvedValue({
      parsed_output: { name: "Ada" },
      usage: { cache_read_input_tokens: 3 },
    });

    const result = await generateStructured({
      kind: "wizard",
      schema,
      system: "SR system",
      user: "hi",
    });

    expect(result).toEqual({ name: "Ada" });
    const req = parseMock.mock.calls[0][0];
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(req.system[0].text).toBe("SR system");
  });

  it("defaults to Sonnet with an effort setting; Haiku omits effort entirely", async () => {
    parseMock.mockResolvedValue({ parsed_output: { name: "x" }, usage: {} });

    await generateStructured({ kind: "wizard", schema, system: "s", user: "u", effort: "high" });
    const sonnetReq = parseMock.mock.calls[0][0];
    expect(sonnetReq.model).toBe("claude-sonnet-5");
    expect(sonnetReq.output_config.effort).toBe("high");

    parseMock.mockClear();
    await generateStructured({
      kind: "distractors",
      schema,
      system: "s",
      user: "u",
      model: "claude-haiku-4-5",
    });
    const haikuReq = parseMock.mock.calls[0][0];
    expect(haikuReq.model).toBe("claude-haiku-4-5");
    expect("effort" in haikuReq.output_config).toBe(false);
    expect("thinking" in haikuReq).toBe(false);
  });

  it("retries once on a null parse then throws AiUnavailableError", async () => {
    parseMock.mockResolvedValue({ parsed_output: null, usage: {} });

    await expect(
      generateStructured({ kind: "wizard", schema, system: "s", user: "u" }),
    ).rejects.toBeInstanceOf(AiUnavailableError);
    expect(parseMock).toHaveBeenCalledTimes(2);
  });

  it("wraps SDK errors in AiUnavailableError without leaking the message", async () => {
    parseMock.mockRejectedValue(new Error("rate_limit: secret internal detail"));

    let caught: unknown;
    try {
      await generateStructured({ kind: "wizard", schema, system: "s", user: "u" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AiUnavailableError);
    expect((caught as Error).message).not.toMatch(/secret internal/);
  });
});

describe("streamText — fixture mode", () => {
  it("streams the canned text in chunks without the SDK", async () => {
    process.env.CLAUDE_FIXTURES = "1";
    loadFixtureMock.mockReturnValue("A warm private note for the caregiver.");

    const text = await readStream(streamText({ kind: "debrief", system: "s", user: "u" }));

    expect(text).toBe("A warm private note for the caregiver.");
    expect(ctor).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
  });
});

// A fake Anthropic stream: async-iterable over `events`, plus a finalMessage() like the real SDK.
function fakeStream(events: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
    },
    finalMessage: async () => ({ usage: {} }),
  };
}
const thinkingDelta = (t: string) => ({
  type: "content_block_delta",
  delta: { type: "thinking_delta", thinking: t },
});
const textDelta = (t: string) => ({
  type: "content_block_delta",
  delta: { type: "text_delta", text: t },
});

const recSchema = z.object({ answerFormat: z.enum(["free_recall", "recognition"]) }).strict();
// The reconcile stand-in mirrors the real guard: it emits the deterministic value, not the model's.
const reconcile = (rec: { answerFormat: string } | null) => ({
  applied: "free_recall",
  model: rec?.answerFormat ?? null,
});

function splitStream(out: string) {
  const idx = out.lastIndexOf(STREAM_JSON_SENTINEL);
  return { reasoning: out.slice(0, idx), json: out.slice(idx + STREAM_JSON_SENTINEL.length) };
}

describe("streamThinkingJson — fixture mode", () => {
  it("streams recorded reasoning then a reconciled JSON trailer, no SDK", async () => {
    process.env.CLAUDE_FIXTURES = "1";
    loadFixtureMock.mockReturnValue({
      thinking: "Recognition suits this condition.",
      recommendation: { answerFormat: "recognition" },
    });

    const out = await readStream(
      streamThinkingJson({
        kind: "etiology",
        system: "s",
        user: "u",
        schema: recSchema,
        reconcile,
      }),
    );

    const { reasoning, json } = splitStream(out);
    expect(reasoning).toBe("Recognition suits this condition.");
    expect(JSON.parse(json)).toEqual({ applied: "free_recall", model: "recognition" });
    expect(ctor).not.toHaveBeenCalled();
  });

  it("reconciles null when the recorded recommendation fails the schema", async () => {
    process.env.CLAUDE_FIXTURES = "1";
    loadFixtureMock.mockReturnValue({ thinking: "…", recommendation: { answerFormat: "bogus" } });

    const out = await readStream(
      streamThinkingJson({
        kind: "etiology",
        system: "s",
        user: "u",
        schema: recSchema,
        reconcile,
      }),
    );
    expect(JSON.parse(splitStream(out).json)).toEqual({ applied: "free_recall", model: null });
  });
});

describe("streamThinkingJson — live path", () => {
  it("forwards thinking as reasoning, validates the text JSON, and requests adaptive thinking", async () => {
    streamMock.mockReturnValue(
      fakeStream([
        thinkingDelta("Because "),
        thinkingDelta("recognition helps."),
        textDelta('{"answerFormat": '),
        textDelta('"recognition"}'),
      ]),
    );

    const out = await readStream(
      streamThinkingJson({
        kind: "etiology",
        system: "sys",
        user: "u",
        schema: recSchema,
        reconcile,
      }),
    );

    const { reasoning, json } = splitStream(out);
    expect(reasoning).toBe("Because recognition helps.");
    expect(JSON.parse(json)).toEqual({ applied: "free_recall", model: "recognition" });

    const req = streamMock.mock.calls[0][0];
    expect(req.model).toBe("claude-sonnet-5");
    expect(req.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect("format" in req.output_config).toBe(false); // no forced structured output on the thinking call
    expect(parseMock).not.toHaveBeenCalled(); // no fallback when the text JSON parses
  });

  it("falls back to a non-thinking structured call when the text JSON is unparseable", async () => {
    streamMock.mockReturnValue(
      fakeStream([thinkingDelta("reasoning"), textDelta("sorry, no json here")]),
    );
    parseMock.mockResolvedValue({ parsed_output: { answerFormat: "recognition" }, usage: {} });

    const out = await readStream(
      streamThinkingJson({
        kind: "etiology",
        system: "s",
        user: "u",
        schema: recSchema,
        reconcile,
      }),
    );

    expect(parseMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(splitStream(out).json)).toEqual({
      applied: "free_recall",
      model: "recognition",
    });
  });

  it("reconciles null when both the stream JSON and the fallback fail", async () => {
    streamMock.mockReturnValue(fakeStream([thinkingDelta("reasoning"), textDelta("no json")]));
    parseMock.mockRejectedValue(new Error("boom"));

    const out = await readStream(
      streamThinkingJson({
        kind: "etiology",
        system: "s",
        user: "u",
        schema: recSchema,
        reconcile,
      }),
    );
    expect(JSON.parse(splitStream(out).json)).toEqual({ applied: "free_recall", model: null });
  });
});
