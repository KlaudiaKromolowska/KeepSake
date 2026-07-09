/**
 * Keepsake AI core — SERVER-ONLY. Owns the single Anthropic client, quota enforcement, structured
 * generation, text streaming, and fixture replay. Every Phase-4 AI feature is a thin prompt +
 * schema over this module. Never import it from a Client Component or any browser-reachable path:
 * `ANTHROPIC_API_KEY` is read implicitly by the SDK and must never reach the client bundle.
 * `server-only` isn't an existing dependency (see lib/supabase/server.ts); this comment + code
 * review is the guard.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { loadFixture } from "@keepsake/core/prompts/fixtures";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { STREAM_JSON_SENTINEL } from "./stream-sentinel";

export type AiKind =
  | "wizard"
  | "vision"
  | "debrief"
  | "distractors"
  | "rct"
  | "grade"
  | "etiology"
  | "coach";

/** Per-user rolling-hour and global rolling-day caps. Public repo + demo login = credit-drain risk. */
export const AI_USER_HOURLY_LIMIT = 20;
export const AI_GLOBAL_DAILY_LIMIT = 200;

const MODEL_SONNET = "claude-sonnet-5";
const MODEL_HAIKU = "claude-haiku-4-5";
const GENERIC_UNAVAILABLE = "The assistant is unavailable right now.";

/** Quota (per-user or global) exceeded, or usage could not be verified/recorded. */
export class QuotaError extends Error {}
/** Any Anthropic failure — surfaced with a generic message, never the raw provider error text. */
export class AiUnavailableError extends Error {}

const fixturesEnabled = () => process.env.CLAUDE_FIXTURES === "1";

// Lazy, module-level singleton so fixture mode and unit tests never need a key or a live client.
let anthropic: Anthropic | null = null;
function client(): Anthropic {
  if (!anthropic) anthropic = new Anthropic({ maxRetries: 1 });
  return anthropic;
}

function logCacheUsage(usage: { cache_read_input_tokens?: number | null } | undefined): void {
  if (process.env.NODE_ENV === "production") return;
  // biome-ignore lint/suspicious/noConsole: dev-only cache-hit diagnostic (see PLAN prompt caching).
  console.debug(`ai cache_read_input_tokens=${usage?.cache_read_input_tokens ?? 0}`);
}

/**
 * Enforce quota BEFORE any Anthropic call, then record one usage row on the pass path. Per-user
 * count uses the RLS'd user client (own rows only); the global count uses the SECURITY DEFINER rpc.
 * The row is inserted as soon as the check passes — so a quota-passing call is counted even if the
 * model call later fails. Simplest honest accounting; over-counts only on a downstream failure.
 */
export async function assertAiQuota(
  supabase: SupabaseClient<Database>,
  kind: AiKind,
): Promise<void> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new QuotaError("You need to be signed in.");

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  // RLS restricts this to the caller's own rows, so it is the per-user hourly count directly.
  const { count, error: countErr } = await supabase
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .gte("created_at", hourAgo);
  if (countErr) {
    console.error("assertAiQuota: user count", countErr);
    throw new QuotaError("Could not verify usage limits.");
  }
  if ((count ?? 0) >= AI_USER_HOURLY_LIMIT) {
    throw new QuotaError("You've reached this hour's limit for AI help. Please try again later.");
  }

  const { data: globalCount, error: rpcErr } = await supabase.rpc("ai_calls_today");
  if (rpcErr) {
    console.error("assertAiQuota: global count", rpcErr);
    throw new QuotaError("Could not verify usage limits.");
  }
  if (Number(globalCount ?? 0) >= AI_GLOBAL_DAILY_LIMIT) {
    throw new QuotaError("The daily limit for AI help has been reached. Please try again later.");
  }

  const { error: insertErr } = await supabase
    .from("ai_usage")
    .insert({ caregiver_id: user.id, kind });
  if (insertErr) {
    console.error("assertAiQuota: insert", insertErr);
    throw new QuotaError("Could not record AI usage.");
  }
}

type Effort = "low" | "medium" | "high";

/** Sonnet caches thinking control via output_config.effort; Haiku supports neither effort nor thinking. */
function outputConfig<F>(model: string, effort: Effort | undefined, format: F) {
  if (model === MODEL_HAIKU) return { format };
  return { format, effort: effort ?? "medium" };
}

function systemBlocks(system: string) {
  return [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }];
}

/**
 * Structured generation with schema-validated JSON. Defaults to Sonnet 5; pass model
 * `claude-haiku-4-5` for cheap grading (effort is then ignored). A null parse (schema mismatch)
 * retries once, then throws AiUnavailableError. Fixture mode returns the recorded, schema-checked
 * object without touching the SDK.
 */
export async function generateStructured<T>(opts: {
  kind: AiKind;
  schema: z.ZodType<T>;
  system: string;
  user: Anthropic.MessageParam["content"];
  model?: string;
  maxTokens?: number;
  effort?: Effort;
}): Promise<T> {
  if (fixturesEnabled()) return opts.schema.parse(loadFixture(opts.kind));

  const model = opts.model ?? MODEL_SONNET;
  const request = {
    model,
    max_tokens: opts.maxTokens ?? 2048,
    system: systemBlocks(opts.system),
    messages: [{ role: "user" as const, content: opts.user }],
    output_config: outputConfig(model, opts.effort, zodOutputFormat(opts.schema)),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Awaited<ReturnType<ReturnType<typeof client>["messages"]["parse"]>>;
    try {
      response = await client().messages.parse(request);
    } catch (err) {
      console.error(`ai:${opts.kind} messages.parse failed`, err);
      throw new AiUnavailableError(GENERIC_UNAVAILABLE);
    }
    logCacheUsage(response.usage);
    if (response.parsed_output !== null) return response.parsed_output as T;
  }
  throw new AiUnavailableError(GENERIC_UNAVAILABLE);
}

/** One tool the model asked to run, in order — the ordered basis for the "analyses run" trail. */
export interface ToolCall {
  name: string;
  input: unknown;
}

/**
 * Agentic tool-use loop over an injected, side-effect-owning executor. The model calls tools from
 * `tools`, we run each via `runTool` and feed the JSON result back, until it answers with text
 * (or the tool-call budget is spent — the final turn forbids tools so it must answer). Returns the
 * final text plus the ordered list of tool calls that actually ran (the trail). Sonnet 5 only;
 * fixture replay is the caller's concern (per-feature result shape). Failures — SDK errors or an
 * exhausted loop with no text — surface as AiUnavailableError; a single tool that throws is
 * reported back to the model as an error result so it can recover, not fatal to the loop.
 */
export async function runToolLoop(opts: {
  kind: AiKind;
  system: string;
  user: string;
  tools: Anthropic.Tool[];
  runTool: (name: string, input: unknown) => unknown;
  maxToolCalls?: number;
  maxTokens?: number;
  effort?: Effort;
}): Promise<{ text: string; trail: ToolCall[] }> {
  const maxToolCalls = opts.maxToolCalls ?? 8;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.user }];
  const trail: ToolCall[] = [];
  let toolCallsUsed = 0;

  for (let turn = 0; turn <= maxToolCalls + 2; turn++) {
    const outOfBudget = toolCallsUsed >= maxToolCalls;
    let response: Anthropic.Message;
    try {
      response = await client().messages.create({
        model: MODEL_SONNET,
        max_tokens: opts.maxTokens ?? 4096,
        system: systemBlocks(opts.system),
        messages,
        tools: opts.tools,
        tool_choice: outOfBudget ? { type: "none" } : { type: "auto" },
        output_config: { effort: opts.effort ?? "medium" },
      });
    } catch (err) {
      console.error(`ai:${opts.kind} tool loop failed`, err);
      throw new AiUnavailableError(GENERIC_UNAVAILABLE);
    }
    logCacheUsage(response.usage);

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return { text, trail };
    }

    // Preserve the full assistant turn (incl. any thinking blocks) before answering tool calls.
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      let content: string;
      let isError = false;
      if (toolCallsUsed >= maxToolCalls) {
        content = "Analysis budget reached. Write the report from the analyses already run.";
        isError = true;
      } else {
        toolCallsUsed++;
        try {
          content = JSON.stringify(opts.runTool(block.name, block.input));
          trail.push({ name: block.name, input: block.input });
        } catch (err) {
          console.error(`ai:${opts.kind} tool ${block.name} failed`, err);
          content = "This analysis could not be completed.";
          isError = true;
        }
      }
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content,
        ...(isError ? { is_error: true } : {}),
      });
    }
    messages.push({ role: "user", content: results });
  }
  console.error(`ai:${opts.kind} tool loop exhausted turns without a final answer`);
  throw new AiUnavailableError(GENERIC_UNAVAILABLE);
}

const encoder = new TextEncoder();

function chunkedTextStream(text: string): ReadableStream<Uint8Array> {
  const size = 48;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < text.length; i += size) {
        controller.enqueue(encoder.encode(text.slice(i, i + size)));
      }
      controller.close();
    },
  });
}

/**
 * Stream a plain-text response as raw UTF-8 text-delta chunks (no SSE framing — a route handler
 * sets the streaming response + Content-Type and forwards this body; the client reads the body with
 * a ReadableStream reader and appends decoded text). Sonnet 5 only. Fixture mode streams the
 * recorded text in chunks. Failures surface as an AiUnavailableError on the stream.
 */
export function streamText(opts: {
  kind: AiKind;
  system: string;
  user: string;
  maxTokens?: number;
  effort?: Effort;
}): ReadableStream<Uint8Array> {
  if (fixturesEnabled()) return chunkedTextStream(String(loadFixture(opts.kind)));

  const request = {
    model: MODEL_SONNET,
    max_tokens: opts.maxTokens ?? 2048,
    system: systemBlocks(opts.system),
    messages: [{ role: "user" as const, content: opts.user }],
    output_config: { effort: opts.effort ?? "medium" },
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = client().messages.stream(request);
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        logCacheUsage((await stream.finalMessage()).usage);
        controller.close();
      } catch (err) {
        console.error(`ai:${opts.kind} stream failed`, err);
        controller.error(new AiUnavailableError(GENERIC_UNAVAILABLE));
      }
    },
  });
}

/** First balanced-ish `{…}` slice of model text — tolerates prose or code fences around the JSON. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start === -1 || end < start ? null : text.slice(start, end + 1);
}

/**
 * Extended-thinking stream (Sonnet 5 only): forwards Claude's VISIBLE reasoning (summarized
 * thinking blocks) as raw UTF-8 text, then a framed trailer — STREAM_JSON_SENTINEL followed by one
 * JSON line, the reconciled result `R`. The model's own text output is a JSON object (never streamed
 * to the client) validated with `schema`; on parse failure a non-thinking `generateStructured` call
 * is the fallback, and if that also fails `reconcile(null)` still yields a deterministic-only
 * result. `reconcile` is the code-side guard — model output is NEVER emitted without passing
 * through it, so a rec that contradicts the deterministic mapping can be overridden there.
 *
 * Note (Sonnet 5): thinking uses `{type:"adaptive", display:"summarized"}` — `budget_tokens` is
 * rejected with a 400 on this model, and the default display "omitted" streams empty thinking text.
 * Extended thinking is done via a plain text+thinking stream (no forced tool/`output_config.format`),
 * so it stays compatible with thinking; the fallback path is the one that uses structured outputs.
 */
export function streamThinkingJson<T, R>(opts: {
  kind: AiKind;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  reconcile: (modelRec: T | null) => R;
  maxTokens?: number;
  effort?: Effort;
}): ReadableStream<Uint8Array> {
  const trailer = (result: R) => encoder.encode(STREAM_JSON_SENTINEL + JSON.stringify(result));

  if (fixturesEnabled()) {
    const fixture = loadFixture(opts.kind) as { thinking?: unknown; recommendation?: unknown };
    const thinking = typeof fixture.thinking === "string" ? fixture.thinking : "";
    const parsed = opts.schema.safeParse(fixture.recommendation);
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < thinking.length; i += 48) {
          controller.enqueue(encoder.encode(thinking.slice(i, i + 48)));
        }
        controller.enqueue(trailer(opts.reconcile(parsed.success ? parsed.data : null)));
        controller.close();
      },
    });
  }

  const request = {
    model: MODEL_SONNET,
    max_tokens: opts.maxTokens ?? 2048,
    system: systemBlocks(opts.system),
    messages: [{ role: "user" as const, content: opts.user }],
    thinking: { type: "adaptive" as const, display: "summarized" as const },
    output_config: { effort: opts.effort ?? "medium" },
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let jsonBuffer = "";
      try {
        const stream = client().messages.stream(request);
        for await (const event of stream) {
          if (event.type === "content_block_delta") {
            if (event.delta.type === "thinking_delta") {
              controller.enqueue(encoder.encode(event.delta.thinking));
            } else if (event.delta.type === "text_delta") {
              jsonBuffer += event.delta.text;
            }
          }
        }
        logCacheUsage((await stream.finalMessage()).usage);
      } catch (err) {
        console.error(`ai:${opts.kind} thinking stream failed`, err);
        controller.error(new AiUnavailableError(GENERIC_UNAVAILABLE));
        return;
      }

      let modelRec: T | null = null;
      const raw = extractJsonObject(jsonBuffer);
      if (raw) {
        try {
          modelRec = opts.schema.parse(JSON.parse(raw));
        } catch {
          modelRec = null;
        }
      }
      if (modelRec === null) {
        // Reasoning already streamed; recover only the structured rec via a non-thinking call.
        try {
          modelRec = await generateStructured({
            kind: opts.kind,
            schema: opts.schema,
            system: opts.system,
            user: opts.user,
            ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
            ...(opts.effort !== undefined ? { effort: opts.effort } : {}),
          });
        } catch {
          modelRec = null;
        }
      }
      controller.enqueue(trailer(opts.reconcile(modelRec)));
      controller.close();
    },
  });
}
