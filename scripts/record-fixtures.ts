// Fixture recorder (Phase 4 Task 7, PLAN.md §4.7) — demo/live-final insurance. Makes ONE real
// Claude API call per AI kind against real seeded data (`pnpm seed` — Marta/Lena) and writes the
// verbatim response to packages/core/prompts/fixtures/<kind>.json in exactly the shape the AI
// core's fixture loader expects (packages/core/prompts/fixtures.ts + apps/web/src/lib/ai/core.ts):
// structured kinds (wizard, distractors, vision) write the parsed object; the streamed debrief kind
// writes a JSON-encoded string of the raw text; rct (agentic V2) writes the parsed {report, trail}
// object. LIVE API calls only — never run in CI. Optional args restrict which kinds are recorded
// (`pnpm fixtures:record vision`) so a single prompt change never forces re-spending on every kind.
//
// vision is recorded only if a seeded photo asset exists (apps/web/public/images/lena.jpg) —
// skipped with a note otherwise. rct runs the SAME agentic loop as the /api/rct-report route
// (buildRctInputs + runRctReport over the seeded DB), so the recorded fixture — report AND the
// analyses-run trail — matches what the live route actually produces.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDistractorsPrompt, DISTRACTORS_SYSTEM } from "@keepsake/core/prompts/distractors";
import { buildEtiologyUserMessage, ETIOLOGY_SYSTEM } from "@keepsake/core/prompts/etiology";
import { buildVisionUserText, VISION_SYSTEM_PROMPT } from "@keepsake/core/prompts/vision";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateStructured, streamText, streamThinkingJson } from "@/lib/ai/core";
import { buildRctInputs } from "@/lib/ai/rct-data";
import { runRctReport } from "@/lib/ai/rct-report";
import { STREAM_JSON_SENTINEL } from "@/lib/ai/stream-sentinel";
import { fetchDebriefAggregate } from "@/lib/debrief/aggregate";
import { etiologyRecSchema } from "@/lib/etiology/schema";
import type { Database, Json } from "@/lib/supabase/database.types";
import { mediaTypeFor, photoQaSchema } from "@/lib/wizard/vision-schema";
import { loadWebEnv, requireEnv } from "./env";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, "..", "packages", "core", "prompts", "fixtures");
const WEB_PUBLIC_IMAGES = join(HERE, "..", "apps", "web", "public", "images");

function writeStructuredFixture(kind: string, value: unknown): void {
  writeFileSync(join(FIXTURES_DIR, `${kind}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

function writeTextFixture(kind: string, text: string): void {
  writeFileSync(join(FIXTURES_DIR, `${kind}.json`), `${JSON.stringify(text)}\n`);
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

// --- Supabase (service-role, local stack only — dev script, not a user path) ------------------

function supabaseAdmin() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(url, serviceRoleKey);
}

type Admin = ReturnType<typeof supabaseAdmin>;

async function demoPatient(admin: Admin) {
  const { data, error } = await admin
    .from("patients")
    .select("id, display_name, notes, etiology, timezone")
    .eq("is_demo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`no seeded demo patient found — run \`pnpm seed\` first`);
  return data;
}

// --- wizard --------------------------------------------------------------------------------

async function recordWizard(): Promise<void> {
  const { runWizardFlow } = await import("./wizard-flow");
  const inputs = JSON.parse(readFileSync(join(HERE, "eval-inputs.json"), "utf8")) as Array<{
    description: string;
    etiologyHint?: string;
  }>;
  const first = inputs[0];
  if (!first) throw new Error("eval-inputs.json is empty");
  const { proposal, finalViolations } = await runWizardFlow(first.description, first.etiologyHint);
  if (finalViolations.length) {
    console.error(`record-fixtures: wizard — WARNING recorded proposal still fails rules:`);
    for (const v of finalViolations) console.error(`  - ${v}`);
  }
  writeStructuredFixture("wizard", proposal);
  console.error("record-fixtures: wizard — recorded");
}

// --- distractors -----------------------------------------------------------------------------

const distractorsSchema = z.object({ prompts: z.array(z.string()) });

async function recordDistractors(admin: Admin, patientId: string): Promise<void> {
  const { data: patient } = await admin
    .from("patients")
    .select("display_name, notes")
    .eq("id", patientId)
    .single();
  const { data: target } = await admin
    .from("targets")
    .select("answer")
    .eq("patient_id", patientId)
    .in("status", ["active", "maintenance"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!patient || !target)
    throw new Error("no seeded active/maintenance target found for demo patient");

  const { validateDistractors } = await import("@/lib/session/distractor-rules");
  const result = await generateStructured({
    kind: "distractors",
    schema: distractorsSchema,
    system: DISTRACTORS_SYSTEM,
    user: buildDistractorsPrompt({
      displayName: patient.display_name,
      notes: patient.notes,
      locale: "en",
    }),
    model: "claude-haiku-4-5",
    maxTokens: 1024,
  });
  if (!validateDistractors(result.prompts, target.answer)) {
    console.error(
      "record-fixtures: distractors — WARNING recorded prompts fail code-side re-check",
    );
  }
  writeStructuredFixture("distractors", result);
  console.error("record-fixtures: distractors — recorded");
}

// --- grade (V1 speech assist — Haiku recall grader) --------------------------------------------

async function recordGrade(admin: Admin, patientId: string): Promise<void> {
  const { data: target } = await admin
    .from("targets")
    .select("question, answer, accepted_variants")
    .eq("patient_id", patientId)
    .in("status", ["active", "maintenance"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!target) throw new Error("no seeded active/maintenance target found for demo patient");

  const { buildGradePrompt, GRADE_SYSTEM } = await import("@keepsake/core/prompts/grade");
  const { gradeVerdictSchema, aliasesFromJson } = await import("@/lib/session/grade-schema");
  // A genuinely ambiguous, hesitant utterance — the band that reaches Haiku in the live path.
  const result = await generateStructured({
    kind: "grade",
    schema: gradeVerdictSchema,
    system: GRADE_SYSTEM,
    user: buildGradePrompt({
      question: target.question,
      answer: target.answer,
      aliases: aliasesFromJson(target.accepted_variants),
      transcript: "oh dear, I want to say it... it's on the tip of my tongue",
      locale: "en",
    }),
    model: "claude-haiku-4-5",
    maxTokens: 256,
  });
  writeStructuredFixture("grade", result);
  console.error("record-fixtures: grade — recorded");
}

// --- vision (skip if no seeded photo asset) -------------------------------------------------

async function recordVision(admin: Admin, patientId: string): Promise<"recorded" | "skipped"> {
  const candidate = join(WEB_PUBLIC_IMAGES, "lena.jpg");
  if (!existsSync(candidate)) {
    console.error("record-fixtures: vision — skipped (apps/web/public/images/lena.jpg not found)");
    return "skipped";
  }
  // The live wizard flow sends the proposal's question + answer so crop advice points at the
  // target's subject — record with the seeded target for parity (undefined if none seeded yet).
  const { data: target } = await admin
    .from("targets")
    .select("question, answer")
    .eq("patient_id", patientId)
    .in("status", ["active", "maintenance"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const imagePath = "/images/lena.jpg";
  const base64 = readFileSync(candidate).toString("base64");
  const result = await generateStructured({
    kind: "vision",
    schema: photoQaSchema,
    system: VISION_SYSTEM_PROMPT,
    user: [
      {
        type: "image",
        source: { type: "base64", media_type: mediaTypeFor(imagePath), data: base64 },
      },
      { type: "text", text: buildVisionUserText("en", target ?? undefined) },
    ],
    effort: "medium",
    maxTokens: 2048,
  });
  writeStructuredFixture("vision", result);
  console.error("record-fixtures: vision — recorded");
  return "recorded";
}

// --- debrief ---------------------------------------------------------------------------------

async function recordDebrief(admin: Admin, patientId: string): Promise<void> {
  const { data: session } = await admin
    .from("sessions")
    .select("id")
    .eq("patient_id", patientId)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(1)
    .single();
  if (!session) throw new Error("no seeded ended session found for demo patient");

  const { buildDebriefUserMessage, DEBRIEF_SYSTEM } = await import(
    "@keepsake/core/prompts/debrief"
  );
  const { data: aggregate, error } = await fetchDebriefAggregate(admin, session.id);
  if (error || !aggregate) throw new Error(`fetchDebriefAggregate failed: ${error}`);

  const stream = streamText({
    kind: "debrief",
    system: DEBRIEF_SYSTEM,
    user: buildDebriefUserMessage(aggregate),
    maxTokens: 2048,
  });
  const text = await readStream(stream);
  writeTextFixture("debrief", text);
  console.error("record-fixtures: debrief — recorded");
}

// --- rct (agentic V2: same buildRctInputs + runRctReport path as the /api/rct-report route) ------

async function recordRct(
  admin: Admin,
  patient: { id: string; display_name: string; etiology: string; timezone: string },
): Promise<void> {
  const [targetsRes, statesRes, sessionsRes] = await Promise.all([
    admin
      .from("targets")
      .select("id, question, answer, status, candidacy")
      .eq("patient_id", patient.id)
      .order("created_at", { ascending: true }),
    admin
      .from("target_state")
      .select(
        "target_id, last_success_interval_sec, start_streak, bad_sessions, session_count, mastered_at, schedule_mode, between_session_gap_days, booster_step, next_due_at",
      ),
    admin
      .from("sessions")
      .select("id, started_at, affect_pre, affect_post")
      .eq("patient_id", patient.id)
      .order("started_at", { ascending: true }),
  ]);
  const sessions = sessionsRes.data ?? [];
  const sessionIds = sessions.map((s) => s.id);
  const trialsRes = sessionIds.length
    ? await admin
        .from("trials")
        .select("session_id, target_id, interval_sec, outcome, corrected, is_screening, at")
        .in("session_id", sessionIds)
        .order("at", { ascending: true })
    : { data: [], error: null };

  const { context, data } = buildRctInputs({
    patient,
    targets: targetsRes.data ?? [],
    states: statesRes.data ?? [],
    sessions,
    trials: trialsRes.data ?? [],
  });
  const question = "What is the acquisition rate, and is retention decaying between sessions?";
  const result = await runRctReport({ context, question, locale: "en", data });
  writeStructuredFixture("rct", result);
  console.error("record-fixtures: rct — recorded");
}

// --- etiology (extended-thinking format recommendation) ----------------------------------------

async function recordEtiology(
  admin: Admin,
  patient: { id: string; etiology: string },
): Promise<void> {
  const { data: target } = await admin
    .from("targets")
    .select("question, answer_format")
    .eq("patient_id", patient.id)
    .in("status", ["active", "maintenance"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // `reconcile: (r) => r` captures the RAW model recommendation (not the reconciled shape) so the
  // fixture is {thinking, recommendation} — exactly what streamThinkingJson's fixture branch reads.
  const stream = streamThinkingJson({
    kind: "etiology",
    system: ETIOLOGY_SYSTEM,
    user: buildEtiologyUserMessage({
      etiology: patient.etiology,
      question: target?.question ?? null,
      currentAnswerFormat: target?.answer_format ?? null,
      locale: "en",
    }),
    schema: etiologyRecSchema,
    reconcile: (r) => r,
    maxTokens: 2048,
    effort: "high",
  });
  const out = await readStream(stream);
  const idx = out.lastIndexOf(STREAM_JSON_SENTINEL);
  if (idx === -1) throw new Error("etiology stream missing the JSON sentinel");
  const thinking = out.slice(0, idx);
  const recommendation = JSON.parse(out.slice(idx + STREAM_JSON_SENTINEL.length)) as unknown;
  if (recommendation === null) {
    console.error("record-fixtures: etiology — WARNING model rec was null (fallback also failed)");
  }
  writeStructuredFixture("etiology", { thinking, recommendation });
  console.error("record-fixtures: etiology — recorded");
}

// --- main -------------------------------------------------------------------------------------

const ALL_KINDS = ["wizard", "distractors", "grade", "vision", "debrief", "rct", "etiology"];

async function main(): Promise<void> {
  loadWebEnv();
  if (process.env.CLAUDE_FIXTURES === "1") {
    console.error(
      "record-fixtures: unset CLAUDE_FIXTURES=1 — this script requires live API calls.",
    );
    process.exit(1);
  }
  requireEnv("ANTHROPIC_API_KEY");

  const args = process.argv.slice(2);
  const unknown = args.filter((k) => !ALL_KINDS.includes(k));
  if (unknown.length) {
    console.error(
      `record-fixtures: unknown kind(s) ${unknown.join(", ")} — use ${ALL_KINDS.join(", ")}`,
    );
    process.exit(1);
  }
  const kinds = new Set(args.length ? args : ALL_KINDS);

  const admin = supabaseAdmin();
  const patient = await demoPatient(admin);

  if (kinds.has("wizard")) await recordWizard();
  if (kinds.has("distractors")) await recordDistractors(admin, patient.id);
  if (kinds.has("grade")) await recordGrade(admin, patient.id);
  if (kinds.has("vision")) await recordVision(admin, patient.id);
  if (kinds.has("debrief")) await recordDebrief(admin, patient.id);
  if (kinds.has("rct")) await recordRct(admin, patient);
  if (kinds.has("etiology")) await recordEtiology(admin, patient);

  console.error("record-fixtures: done — see packages/core/prompts/fixtures/*.json");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
