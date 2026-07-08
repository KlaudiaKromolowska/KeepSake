// Golden-set eval for the target wizard (Phase 4 Task 7, PLAN.md §4.7). LIVE Claude calls only —
// this is the one dev script allowed to hit the real API; it is NOT wired into CI. For each of
// the 10 messy caregiver descriptions in eval-inputs.json (this is the permanent regression set —
// see PLAN.md's tuning cap), drives the exact generateTargetAction composition via
// runWizardFlow(): buildWizardPrompt -> generateStructured -> validateTarget -> ONE corrective
// re-ask -> validateTarget again. A row passes when the final proposal clears validateTarget AND
// carries a non-empty selfCritique.reason. Prints a compact table, then exits 1 if fewer than
// 8/10 pass (root package.json: `pnpm eval:wizard`).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWebEnv } from "./env";
import { runWizardFlow } from "./wizard-flow";

const PASS_THRESHOLD = 8;
const HERE = dirname(fileURLToPath(import.meta.url));

interface EvalInput {
  id: number;
  label: string;
  description: string;
  etiologyHint?: string;
}

interface RowResult {
  id: number;
  label: string;
  pass: boolean;
  reAsked: boolean;
  violations: string[];
}

function loadInputs(): EvalInput[] {
  return JSON.parse(readFileSync(join(HERE, "eval-inputs.json"), "utf8")) as EvalInput[];
}

function printTable(rows: RowResult[]): void {
  console.error("");
  console.error("# | label                    | result | re-ask | violations");
  console.error("--|--------------------------|--------|--------|------------------------------");
  for (const r of rows) {
    const label = r.label.padEnd(24).slice(0, 24);
    const result = (r.pass ? "PASS" : "FAIL").padEnd(6);
    const reAsk = (r.reAsked ? "yes" : "no").padEnd(6);
    const violations = r.violations.length ? r.violations.join("; ") : "-";
    console.error(`${String(r.id).padStart(2)} | ${label} | ${result} | ${reAsk} | ${violations}`);
  }
  console.error("");
}

async function evalOne(input: EvalInput): Promise<RowResult> {
  try {
    const result = await runWizardFlow(input.description, input.etiologyHint);
    const selfCritiquePresent = Boolean(result.proposal.selfCritique?.reason?.trim());
    const finalOk = result.finalViolations.length === 0;
    const pass = finalOk && selfCritiquePresent;
    const violations = finalOk
      ? selfCritiquePresent
        ? []
        : ["selfCritique.reason missing/empty"]
      : result.finalViolations;
    return { id: input.id, label: input.label, pass, reAsked: result.reAsked, violations };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id: input.id, label: input.label, pass: false, reAsked: false, violations: [message] };
  }
}

async function main(): Promise<void> {
  loadWebEnv();
  if (process.env.CLAUDE_FIXTURES === "1") {
    console.error("eval-wizard: unset CLAUDE_FIXTURES=1 — this script requires live API calls.");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "eval-wizard: ANTHROPIC_API_KEY is not set (checked apps/web/.env.local). This script makes " +
        "live Claude API calls and cannot fall back to fixtures.",
    );
    process.exit(1);
  }

  const inputs = loadInputs();
  const rows: RowResult[] = [];
  for (const input of inputs) {
    rows.push(await evalOne(input));
  }

  printTable(rows);
  const passCount = rows.filter((r) => r.pass).length;
  console.error(
    `eval-wizard: ${passCount}/${rows.length} passed (need ${PASS_THRESHOLD}/${rows.length}).`,
  );
  if (passCount < PASS_THRESHOLD) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
