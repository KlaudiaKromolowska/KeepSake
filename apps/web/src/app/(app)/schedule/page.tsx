import Link from "next/link";
import { requireUser } from "@/lib/actions";
import { SCHEDULE_PLAN_COPY as C } from "@/lib/schedule/copy";
import {
  type BoosterStep,
  type JourneyStep,
  type NextWindow,
  type SchedulePlan,
  schedulePlan,
} from "@/lib/schedule/plan";
import { srDefaultsForPatient } from "@/lib/sr/config";
import { TARGETS_COPY } from "@/lib/targets/copy";
import { classifyTargets, PRACTICABLE_STATUSES, type QueueTarget } from "@/lib/targets/queue";

export const metadata = { title: "The plan — Keepsake" };

const PHASE_ORDER = { acquiring: 0, due: 1, queued: 2, maintenance: 3 } as const;

/** Embedded 1:1 target_state — every field schedulePlan + classifyTargets need, in one query. */
interface TargetPlanRow {
  id: string;
  question: string;
  status: string;
  created_at: string;
  target_state: {
    schedule_mode: string | null;
    next_due_at: string | null;
    mastered_at: string | null;
    start_streak: number | null;
    booster_step: number | null;
  } | null;
}

/**
 * Caregiver-facing schedule surface (/schedule): the between-session engine made visible — journey
 * stage, next practice window, mastery progress, and the booster rhythm, now for EVERY target
 * (V2 multi-target), the acquisition memory first. Everything is DERIVED from the persisted
 * target_state rows (nothing new stored). Server component; every read runs on the RLS user client
 * (own patient only). Light theme forced (bg-white) to match sibling caregiver pages.
 */
export default async function SchedulePage() {
  const { supabase } = await requireUser();

  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("id, timezone, etiology")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (patientErr) return <Shell body={C.unavailable} />;
  if (!patient) return <Shell body={C.noTarget} />;

  const { data, error: targetsErr } = await supabase
    .from("targets")
    .select(
      "id, question, status, created_at, target_state(schedule_mode, next_due_at, mastered_at, start_streak, booster_step)",
    )
    .eq("patient_id", patient.id)
    .in("status", [...PRACTICABLE_STATUSES])
    .order("created_at", { ascending: true });
  if (targetsErr) return <Shell body={C.unavailable} />;

  const rows = (data ?? []) as unknown as TargetPlanRow[];
  if (rows.length === 0) return <Shell body={C.noTarget} />;

  const now = Date.now();
  const { config } = srDefaultsForPatient(patient.etiology);

  const queueTargets: QueueTarget[] = rows.map((r) => ({
    id: r.id,
    question: r.question,
    status: r.status,
    createdAt: r.created_at,
    scheduleMode: r.target_state?.schedule_mode ?? null,
    nextDueAt: r.target_state?.next_due_at ?? null,
    masteredAt: r.target_state?.mastered_at ?? null,
  }));
  const phaseById = new Map(
    classifyTargets(queueTargets, now, patient.timezone).map((c) => [c.target.id, c.phase]),
  );
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const ordered = [...queueTargets].sort(
    (a, b) =>
      PHASE_ORDER[phaseById.get(a.id) ?? "maintenance"] -
        PHASE_ORDER[phaseById.get(b.id) ?? "maintenance"] || a.createdAt.localeCompare(b.createdAt),
  );

  return (
    <Shell>
      {ordered.map((qt) => {
        const st = rowById.get(qt.id)?.target_state;
        const plan = schedulePlan(
          {
            scheduleMode: qt.scheduleMode,
            nextDueAt: qt.nextDueAt,
            masteredAt: qt.masteredAt,
            startStreak: st?.start_streak ?? 0,
            boosterStep: st?.booster_step ?? null,
          },
          config,
          now,
          patient.timezone,
        );
        return (
          <TargetPlan
            key={qt.id}
            question={qt.question}
            phaseLabel={TARGETS_COPY.phase[phaseById.get(qt.id) ?? "maintenance"].label}
            plan={plan}
            multi={ordered.length > 1}
          />
        );
      })}
    </Shell>
  );
}

/** One target's plan, headed by its question + phase badge when there is more than one target. */
function TargetPlan({
  question,
  phaseLabel,
  plan,
  multi,
}: {
  question: string;
  phaseLabel: string;
  plan: SchedulePlan;
  multi: boolean;
}) {
  return (
    <section
      className={`flex w-full flex-col gap-8 ${multi ? "rounded-2xl border border-zinc-200 p-5" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-2xl font-semibold text-zinc-900">{question}</h2>
        {multi && (
          <span className="rounded-full bg-zinc-200 px-3 py-0.5 text-sm font-semibold text-zinc-700">
            {phaseLabel}
          </span>
        )}
      </div>
      <Journey steps={plan.steps} />
      <NextPractice window={plan.window} />
      <Mastery mastery={plan.mastery} />
      <Booster steps={plan.booster} mastered={plan.mastered} />
    </section>
  );
}

function Journey({ steps }: { steps: JourneyStep[] }) {
  return (
    <section className="flex w-full flex-col gap-4" aria-labelledby="journey-heading">
      <h2 id="journey-heading" className="text-xl font-semibold">
        {C.journeyHeading}
      </h2>
      <ol className="flex flex-col gap-3">
        {steps.map((step) => {
          const copy = C.journey[step.key];
          const current = step.status === "current";
          return (
            <li
              key={step.key}
              aria-current={current ? "step" : undefined}
              className={`flex flex-col gap-1 rounded-xl border p-4 ${
                current ? "border-2 border-zinc-900 bg-zinc-50" : "border-zinc-300"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-lg font-semibold text-zinc-900">{copy.title}</span>
                <span
                  className={`text-base ${current ? "font-semibold text-zinc-900" : "text-zinc-600"}`}
                >
                  {C.stageStatus[step.status]}
                </span>
              </div>
              <p className="text-base text-zinc-700">{copy.note}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function NextPractice({ window }: { window: NextWindow }) {
  const text =
    window.kind === "weekday"
      ? C.window.weekday(window.label)
      : window.kind === "inDays"
        ? C.window.inDays(window.days)
        : C.window[window.kind];
  return (
    <section className="flex w-full flex-col gap-2" aria-labelledby="window-heading">
      <h2 id="window-heading" className="text-xl font-semibold">
        {C.windowHeading}
      </h2>
      <p className="text-lg text-zinc-700">{text}</p>
    </section>
  );
}

function Mastery({ mastery }: { mastery: SchedulePlan["mastery"] }) {
  return (
    <section className="flex w-full flex-col gap-2" aria-labelledby="mastery-heading">
      <h2 id="mastery-heading" className="text-xl font-semibold">
        {C.masteryHeading}
      </h2>
      {mastery === null ? (
        <p className="text-lg text-zinc-700">{C.mastery.settled}</p>
      ) : (
        <>
          <p className="text-lg text-zinc-700">
            {mastery.done === 0 ? C.mastery.none : C.mastery.count(mastery.done, mastery.total)}
          </p>
          <ul className="flex gap-2" aria-hidden="true">
            {Array.from({ length: mastery.total }, (_, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length ordinal pips, no reordering
                key={i}
                className={`h-4 w-4 rounded-full border-2 border-zinc-900 ${
                  i < mastery.done ? "bg-zinc-900" : "bg-white"
                }`}
              />
            ))}
          </ul>
          <p className="text-base text-zinc-600">{C.mastery.hint}</p>
        </>
      )}
    </section>
  );
}

function Booster({ steps, mastered }: { steps: BoosterStep[]; mastered: boolean }) {
  return (
    <section className="flex w-full flex-col gap-3" aria-labelledby="booster-heading">
      <h2 id="booster-heading" className="text-xl font-semibold">
        {C.boosterHeading}
      </h2>
      <p className="text-base text-zinc-700">{C.boosterIntro}</p>
      <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
        {steps.map((step, i) => (
          <li
            key={step.label}
            aria-current={step.current ? "step" : undefined}
            className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${
              step.current ? "border-2 border-zinc-900 bg-zinc-50" : "border-zinc-300"
            }`}
          >
            <span className="text-base text-zinc-500">{i + 1}.</span>
            <span
              className={`text-lg ${step.current ? "font-semibold text-zinc-900" : "text-zinc-800"}`}
            >
              {step.label}
            </span>
            {step.current && (
              <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-sm font-semibold text-white">
                {C.boosterCurrent}
              </span>
            )}
          </li>
        ))}
      </ol>
      {mastered && <p className="text-base text-zinc-600">{C.boosterHint}</p>}
    </section>
  );
}

/** Shared page frame so empty/error/data states stay visually identical (mirrors /progress). */
function Shell({ body, children }: { body?: string; children?: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center gap-8 bg-white p-6 text-zinc-900">
      <div className="flex w-full max-w-3xl flex-col gap-3">
        <h1 className="text-3xl font-semibold">{C.title}</h1>
        <p className="text-lg text-zinc-700">{C.intro}</p>
      </div>

      <div className="flex w-full max-w-3xl flex-1 flex-col gap-8">
        {body && <p className="text-xl text-zinc-700">{body}</p>}
        {children}
      </div>

      <Link
        href="/dashboard"
        className="flex min-h-[48px] items-center rounded-xl border border-zinc-300 px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        {C.backToHome}
      </Link>
    </main>
  );
}
