/**
 * RCT-in-a-box report orchestration (agentic V2), SERVER-ONLY. Runs Claude's own analysis: the
 * model calls the fixed analysis-tool menu (rct-tools.ts) through the tool-use loop, sees the
 * aggregates, and writes the report — we return the report plus the ordered "analyses run" trail
 * (the on-camera proof of agency). Fixture mode replays a recorded {report, trail} so the film
 * degrades to fixtures, never absent. One quota unit per report is charged by the route.
 */
import { loadFixture } from "@keepsake/core/prompts/fixtures";
import { buildRctReportPrompt } from "@keepsake/core/prompts/rct-report";
import { z } from "zod";
import { runToolLoop } from "./core";
import {
  describeRctToolCall,
  RCT_TOOL_DEFINITIONS,
  type RctAnalyticsData,
  runRctTool,
} from "./rct-tools";

/** One executed analysis, as shown in the "How this report was produced" trail. */
export interface RctTrailEntry {
  tool: string;
  description: string;
}
export interface RctReportResult {
  report: string;
  trail: RctTrailEntry[];
}

/** Validates a result and the recorded fixture (extra keys like `_note` are stripped). */
export const rctReportResultSchema = z.object({
  report: z.string().min(1),
  trail: z.array(z.object({ tool: z.string(), description: z.string() })),
});

const MAX_TOOL_CALLS = 8;
const MAX_TOKENS = 4096;

const fixturesEnabled = () => process.env.CLAUDE_FIXTURES === "1";

/**
 * Produce the study report. In fixture mode, replay the recorded {report, trail}. Otherwise run
 * the agentic loop over the caller's patient-scoped analytics data; if the model answers without
 * calling any tool, the trail is simply empty and the report still returns (graceful degradation).
 */
export async function runRctReport(opts: {
  context: string;
  question: string;
  locale: string;
  data: RctAnalyticsData;
}): Promise<RctReportResult> {
  if (fixturesEnabled()) {
    const parsed = rctReportResultSchema.parse(loadFixture("rct"));
    return { report: parsed.report, trail: parsed.trail };
  }

  const { system, user } = buildRctReportPrompt({
    context: opts.context,
    question: opts.question,
    locale: opts.locale,
  });

  const { text, trail } = await runToolLoop({
    kind: "rct",
    system,
    user,
    tools: RCT_TOOL_DEFINITIONS,
    runTool: (name, input) => runRctTool(opts.data, name, input),
    maxToolCalls: MAX_TOOL_CALLS,
    maxTokens: MAX_TOKENS,
    effort: "high",
  });

  return {
    report: text,
    trail: trail.map((c) => ({ tool: c.name, description: describeRctToolCall(c.name, c.input) })),
  };
}
