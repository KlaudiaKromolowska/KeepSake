// Fixture recorder (Phase 4 Task 7, PLAN.md §4.7) — demo/live-final insurance. Makes ONE real
// Claude API call per AI kind against real seeded data (`pnpm seed` — Marta/Lena) and writes the
// verbatim response to packages/core/prompts/fixtures/<kind>.json in exactly the shape the AI
// core's fixture loader expects (packages/core/prompts/fixtures.ts + apps/web/src/lib/ai/core.ts):
// structured kinds (wizard, distractors, vision) write the parsed object; streamed kinds (debrief,
// rct) write a JSON-encoded string of the raw text. LIVE API calls only — never run in CI.
// Optional args restrict which kinds are recorded (`pnpm fixtures:record vision`) so a single
// prompt change never forces re-spending on every kind.
//
// vision is recorded only if a seeded photo asset exists (apps/web/public/images/lena.jpg) —
// skipped with a note otherwise. The rct dataset is built straight from the seeded DB using the
// SAME query shape and serializer as apps/web/src/app/api/rct-report/route.ts, so the recorded
// fixture matches what the live route actually sends.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDistractorsPrompt, DISTRACTORS_SYSTEM } from "@keepsake/core/prompts/distractors";
import {
  buildRctReportPrompt,
  type RctAnnotation,
  type RctSession,
  type RctTargetState,
  type RctTrial,
  serializeTrialLog,
} from "@keepsake/core/prompts/rct-report";
import { buildVisionUserText, VISION_SYSTEM_PROMPT } from "@keepsake/core/prompts/vision";
import { defaultsForEtiology, type Etiology } from "@keepsake/core/sr";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateStructured, streamText } from "@/lib/ai/core";
import { fetchDebriefAggregate } from "@/lib/debrief/aggregate";
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

/** ISO instant → YYYY-MM-DD in the given timezone (mirrors the rct-report route's dayInTz). */
function dayInTz(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
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

// --- rct (dataset built from the seeded DB, mirroring the /api/rct-report route exactly) -------

function asRecord(json: Json | null | undefined): Record<string, unknown> {
  return json && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, unknown>)
    : {};
}

/** Pull endReason from a session summary (stats or snapshot), tolerating null/legacy shapes. */
function endReasonOf(summary: Record<string, unknown>): string | null {
  const stats = asRecord(summary.stats as Json);
  const snap = asRecord(summary.snapshot as Json);
  const reason = stats.endReason ?? snap.endReason;
  return typeof reason === "string" ? reason : null;
}

function annotationsOf(summary: Record<string, unknown>): RctAnnotation[] {
  const raw = summary.annotations;
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => {
    const o = asRecord(a as Json);
    const note = typeof o.note === "string" ? o.note : undefined;
    const fromSec = typeof o.fromSec === "number" ? o.fromSec : undefined;
    const toSec = typeof o.toSec === "number" ? o.toSec : undefined;
    return {
      kind: typeof o.kind === "string" ? o.kind : "note",
      ...(note !== undefined ? { note } : {}),
      ...(fromSec !== undefined ? { fromSec } : {}),
      ...(toSec !== undefined ? { toSec } : {}),
    };
  });
}

const asOutcome = (o: string): RctTrial["outcome"] =>
  o === "miss" || o === "unclear" ? o : "recall";

async function buildRctDataset(
  admin: Admin,
  patient: { id: string; display_name: string; etiology: string; timezone: string },
): Promise<string> {
  const [targetsRes, statesRes, sessionsRes] = await Promise.all([
    admin
      .from("targets")
      .select("id, question, answer, status, candidacy")
      .eq("patient_id", patient.id),
    admin.from("target_state").select("*"),
    admin
      .from("sessions")
      .select("id, started_at, summary")
      .eq("patient_id", patient.id)
      .order("started_at", { ascending: true }),
  ]);
  const targets = targetsRes.data ?? [];
  const states = statesRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  const sessionIds = sessions.map((s) => s.id);

  const trialsRes = sessionIds.length
    ? await admin
        .from("trials")
        .select("session_id, target_id, interval_sec, outcome, corrected, is_screening, at")
        .in("session_id", sessionIds)
        .order("at", { ascending: true })
    : {
        data: [] as Pick<
          Database["public"]["Tables"]["trials"]["Row"],
          | "session_id"
          | "target_id"
          | "interval_sec"
          | "outcome"
          | "corrected"
          | "is_screening"
          | "at"
        >[],
      };
  const trials = trialsRes.data ?? [];

  const stateByTarget = new Map(states.map((s) => [s.target_id, s]));
  const answerByTarget = new Map(targets.map((t) => [t.id, t.answer]));

  const targetStates: RctTargetState[] = targets.map((t) => {
    const st = stateByTarget.get(t.id);
    return {
      question: t.question,
      answer: t.answer,
      status: t.status,
      candidacy: t.candidacy,
      lastSuccessIntervalSec: st?.last_success_interval_sec ?? null,
      startStreak: st?.start_streak ?? 0,
      badSessions: st?.bad_sessions ?? 0,
      sessionCount: st?.session_count ?? 0,
      mastered: st?.mastered_at != null,
      scheduleMode: st?.schedule_mode ?? null,
      betweenSessionGapDays: st?.between_session_gap_days ?? null,
      boosterStep: st?.booster_step ?? null,
      nextDueAt: st?.next_due_at ? dayInTz(st.next_due_at, patient.timezone) : null,
    };
  });

  const trialsBySession = new Map<string, typeof trials>();
  for (const tr of trials) {
    const list = trialsBySession.get(tr.session_id) ?? [];
    list.push(tr);
    trialsBySession.set(tr.session_id, list);
  }

  const rctSessions: RctSession[] = sessions.map((s) => {
    const summary = asRecord(s.summary);
    const sTrials = trialsBySession.get(s.id) ?? [];
    const targetId = sTrials[0]?.target_id;
    const note = typeof summary.note === "string" ? summary.note : null;
    return {
      date: dayInTz(s.started_at, patient.timezone),
      targetLabel: (targetId && answerByTarget.get(targetId)) || "target",
      endReason: endReasonOf(summary),
      note,
      annotations: annotationsOf(summary),
      trials: sTrials.map(
        (tr): RctTrial => ({
          intervalSec: tr.interval_sec,
          outcome: asOutcome(tr.outcome),
          corrected: tr.corrected,
          isScreening: tr.is_screening,
        }),
      ),
    };
  });

  const { config } = defaultsForEtiology(patient.etiology as Etiology);
  return serializeTrialLog({
    patientName: patient.display_name,
    etiology: patient.etiology,
    config: {
      baseIntervalSec: config.baseIntervalSec,
      maxIntervalSec: config.maxIntervalSec,
      growthFactor: config.growthFactor,
      masteryStreak: config.masteryStreak,
      firstGapDays: config.firstGapDays,
      boosterCadenceDays: config.boosterCadenceDays,
    },
    targets: targetStates,
    sessions: rctSessions,
  });
}

async function recordRct(
  admin: Admin,
  patient: { id: string; display_name: string; etiology: string; timezone: string },
): Promise<void> {
  const dataset = await buildRctDataset(admin, patient);
  const question = "What is the acquisition rate, and is retention decaying between sessions?";
  const { system, user } = buildRctReportPrompt({ dataset, question, locale: "en" });

  const stream = streamText({ kind: "rct", system, user, maxTokens: 8192, effort: "high" });
  const text = await readStream(stream);
  writeTextFixture("rct", text);
  console.error("record-fixtures: rct — recorded");
}

// --- main -------------------------------------------------------------------------------------

const ALL_KINDS = ["wizard", "distractors", "vision", "debrief", "rct"];

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
  if (kinds.has("vision")) await recordVision(admin, patient.id);
  if (kinds.has("debrief")) await recordDebrief(admin, patient.id);
  if (kinds.has("rct")) await recordRct(admin, patient);

  console.error("record-fixtures: done — see packages/core/prompts/fixtures/*.json");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
