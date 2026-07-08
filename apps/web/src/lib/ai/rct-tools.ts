/**
 * RCT-in-a-box analysis tools (agentic V2). A FIXED, hand-written menu — never free-form SQL.
 * Each tool is a pure aggregation over the caller's own already-fetched, patient-scoped data
 * (fetched once through the RLS user client in the route — that single read is the security
 * boundary), and returns compact JSON aggregates: numbers, dates, and outcome codes only. No
 * free-text fields, no names — targets are referenced by their 1-based T-number (data
 * minimization). The model calls these through the tool-use loop to gather evidence for the report.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export type Outcome = "recall" | "miss" | "unclear";

/** One probe, normalized from a `trials` row (ids dropped for minimization; indices substituted). */
export interface AnalyticsTrial {
  sessionIndex: number;
  targetIndex: number;
  intervalSec: number;
  outcome: Outcome;
  corrected: boolean;
  isScreening: boolean;
}

/** One session, normalized (date in patient tz + optional two-tap affect). */
export interface AnalyticsSession {
  index: number;
  date: string;
  affectPre: "content" | "unsettled" | null;
  affectPost: "content" | "unsettled" | null;
}

/** Per-target persisted engine state — the between-session schedule + mastery counters. */
export interface AnalyticsTargetState {
  index: number;
  lastSuccessIntervalSec: number | null;
  startStreak: number;
  badSessions: number;
  sessionCount: number;
  mastered: boolean;
  scheduleMode: string | null;
  betweenSessionGapDays: number | null;
  boosterStep: number | null;
  nextDueAt: string | null;
}

export interface RctAnalyticsData {
  sessions: AnalyticsSession[];
  trials: AnalyticsTrial[];
  targets: AnalyticsTargetState[];
}

// --- pure aggregators -------------------------------------------------------------------------

const trialsFor = (data: RctAnalyticsData, targetIndex?: number): AnalyticsTrial[] =>
  targetIndex === undefined
    ? data.trials
    : data.trials.filter((t) => t.targetIndex === targetIndex);

/** Per session: trial count and the outcome breakdown, plus corrected/screening counts. */
export function getTrialCounts(data: RctAnalyticsData, targetIndex?: number) {
  const trials = trialsFor(data, targetIndex);
  return data.sessions.map((s) => {
    const rows = trials.filter((t) => t.sessionIndex === s.index);
    return {
      session: s.index,
      date: s.date,
      trials: rows.length,
      recall: rows.filter((t) => t.outcome === "recall").length,
      miss: rows.filter((t) => t.outcome === "miss").length,
      unclear: rows.filter((t) => t.outcome === "unclear").length,
      corrected: rows.filter((t) => t.corrected).length,
      screening: rows.filter((t) => t.isScreening).length,
    };
  });
}

/** Per session: the highest interval recalled and the last interval reached — the ladder climb. */
export function getIntervalProgression(data: RctAnalyticsData, targetIndex?: number) {
  const trials = trialsFor(data, targetIndex);
  return data.sessions.map((s) => {
    const rows = trials.filter((t) => t.sessionIndex === s.index);
    const recalled = rows.filter((t) => t.outcome === "recall" && !t.isScreening);
    const maxRecalledIntervalSec = recalled.length
      ? Math.max(...recalled.map((t) => t.intervalSec))
      : null;
    const last = rows.at(-1);
    return {
      session: s.index,
      date: s.date,
      maxRecalledIntervalSec,
      lastIntervalSec: last ? last.intervalSec : null,
    };
  });
}

/** Per session: the outcome/interval of the session-START probe — the mastery signal. */
export function getRetentionAtSessionStart(data: RctAnalyticsData, targetIndex?: number) {
  const trials = trialsFor(data, targetIndex);
  return data.sessions.map((s) => {
    const first = trials.find((t) => t.sessionIndex === s.index);
    return {
      session: s.index,
      date: s.date,
      startOutcome: first ? first.outcome : null,
      startIntervalSec: first ? first.intervalSec : null,
      corrected: first ? first.corrected : null,
    };
  });
}

/** Per target: the persisted between-session schedule + mastery counters. */
export function getBoosterHistory(data: RctAnalyticsData, targetIndex?: number) {
  const targets =
    targetIndex === undefined ? data.targets : data.targets.filter((t) => t.index === targetIndex);
  return targets.map((t) => ({
    target: t.index,
    scheduleMode: t.scheduleMode,
    betweenSessionGapDays: t.betweenSessionGapDays,
    boosterStep: t.boosterStep,
    nextDueAt: t.nextDueAt,
    startStreak: t.startStreak,
    badSessions: t.badSessions,
    sessionCount: t.sessionCount,
    lastSuccessIntervalSec: t.lastSuccessIntervalSec,
    mastered: t.mastered,
  }));
}

/** Pre/post two-tap comfort counts across sessions. `available:false` when no taps were captured. */
export function getAffectSummary(data: RctAnalyticsData) {
  const tally = (pick: (s: AnalyticsSession) => "content" | "unsettled" | null) => ({
    content: data.sessions.filter((s) => pick(s) === "content").length,
    unsettled: data.sessions.filter((s) => pick(s) === "unsettled").length,
    skipped: data.sessions.filter((s) => pick(s) === null).length,
  });
  const anyTap = data.sessions.some((s) => s.affectPre !== null || s.affectPost !== null);
  if (!anyTap) return { available: false as const };
  return {
    available: true as const,
    sessions: data.sessions.length,
    pre: tally((s) => s.affectPre),
    post: tally((s) => s.affectPost),
  };
}

// --- tool menu (definitions + zod input + executor + trail describer) --------------------------

/** Optional single-target drill-down: a 1-based T-number from the context. */
const targetInput = z.object({ target: z.number().int().positive().optional() }).strict();
const noInput = z.object({}).strict();

/** Validated tool input: an optional 1-based target index; all other keys rejected. */
type ToolInput = { target?: number };

type ToolDescriptor = {
  definition: Anthropic.Tool;
  // Concrete schemas differ per tool; `ZodTypeAny` decouples that from the executor signature
  // (Zod's `.optional()` output clashes with exactOptionalPropertyTypes on a narrow generic).
  inputSchema: z.ZodTypeAny;
  run: (data: RctAnalyticsData, input: ToolInput) => unknown;
  trail: (input: ToolInput) => string;
};

const targetObjectSchema = {
  type: "object" as const,
  properties: {
    target: {
      type: "integer" as const,
      description: "1-based target number (T-number) from the context; omit for all targets.",
    },
  },
  additionalProperties: false as const,
};
const emptyObjectSchema = {
  type: "object" as const,
  properties: {},
  additionalProperties: false as const,
};

const forTarget = (input: ToolInput, base: string): string =>
  input.target ? `${base} for target T${input.target}` : base;

const TOOLS: Record<string, ToolDescriptor> = {
  get_trial_counts: {
    definition: {
      name: "get_trial_counts",
      description:
        "Per-session trial counts: total trials and a breakdown by outcome (recall/miss/unclear), plus corrected and screening counts. Optionally scope to one target.",
      input_schema: targetObjectSchema,
    },
    inputSchema: targetInput,
    run: (data, input) => getTrialCounts(data, input.target),
    trail: (input) => forTarget(input, "Counted trials and outcomes per session"),
  },
  get_interval_progression: {
    definition: {
      name: "get_interval_progression",
      description:
        "Per-session interval progression: the highest interval (seconds) recalled and the last interval reached in each session, over time — the expanding-ladder climb. Optionally scope to one target.",
      input_schema: targetObjectSchema,
    },
    inputSchema: targetInput,
    run: (data, input) => getIntervalProgression(data, input.target),
    trail: (input) => forTarget(input, "Traced the best recalled interval reached per session"),
  },
  get_retention_at_session_start: {
    definition: {
      name: "get_retention_at_session_start",
      description:
        "Per-session start-probe outcome and interval — the session-start recall sequence that is the mastery signal. Optionally scope to one target.",
      input_schema: targetObjectSchema,
    },
    inputSchema: targetInput,
    run: (data, input) => getRetentionAtSessionStart(data, input.target),
    trail: (input) =>
      forTarget(input, "Checked the session-start recall sequence (the mastery signal)"),
  },
  get_booster_history: {
    definition: {
      name: "get_booster_history",
      description:
        "Per-target persisted engine state: schedule mode, between-session gap (days), booster step, next-due date, start-streak, bad-session count, session count, and mastery. Optionally scope to one target.",
      input_schema: targetObjectSchema,
    },
    inputSchema: targetInput,
    run: (data, input) => getBoosterHistory(data, input.target),
    trail: (input) => forTarget(input, "Read the between-session schedule and booster state"),
  },
  get_affect_summary: {
    definition: {
      name: "get_affect_summary",
      description:
        "Pre/post two-tap comfort counts across all sessions (content/unsettled/skipped). Returns available:false if no taps were captured.",
      input_schema: emptyObjectSchema,
    },
    inputSchema: noInput,
    run: (data) => getAffectSummary(data),
    trail: () => "Summarized pre/post comfort taps across sessions",
  },
};

/** The fixed tool menu handed to the model. */
export const RCT_TOOL_DEFINITIONS: Anthropic.Tool[] = Object.values(TOOLS).map((t) => t.definition);

/** Validate the model-supplied input and run the named tool. Throws on an unknown/invalid call. */
export function runRctTool(data: RctAnalyticsData, name: string, rawInput: unknown): unknown {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`unknown tool ${name}`);
  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) throw new Error(`invalid input for ${name}`);
  return tool.run(data, parsed.data as ToolInput);
}

/** One-line, human-readable description of an executed tool call — the "analyses run" trail. */
export function describeRctToolCall(name: string, rawInput: unknown): string {
  const tool = TOOLS[name];
  if (!tool) return `Ran ${name}`;
  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  return tool.trail(parsed.success ? (parsed.data as ToolInput) : {});
}
