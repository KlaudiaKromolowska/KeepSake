import { defaultsForEtiology } from "@keepsake/core/sr";
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

export const metadata = { title: "The plan — Keepsake" };

/**
 * Caregiver-facing schedule surface (/schedule): the between-session engine made visible — journey
 * stage, next practice window, mastery progress, and the booster rhythm. Everything is DERIVED from
 * the persisted target_state row (nothing new stored). Server component; every read runs on the RLS
 * user client (own patient only). Light theme forced (bg-white) to match sibling caregiver pages.
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

  const { data: target, error: targetErr } = await supabase
    .from("targets")
    .select("id, question")
    .eq("patient_id", patient.id)
    .in("status", ["active", "maintenance"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (targetErr) return <Shell body={C.unavailable} />;
  if (!target) return <Shell body={C.noTarget} />;

  const { data: state, error: stateErr } = await supabase
    .from("target_state")
    .select("schedule_mode, next_due_at, mastered_at, start_streak, booster_step")
    .eq("target_id", target.id)
    .maybeSingle();
  if (stateErr) return <Shell heading={target.question} body={C.unavailable} />;

  const { config } = defaultsForEtiology(patient.etiology);
  const plan = schedulePlan(
    {
      scheduleMode: state?.schedule_mode ?? null,
      nextDueAt: state?.next_due_at ?? null,
      masteredAt: state?.mastered_at ?? null,
      startStreak: state?.start_streak ?? 0,
      boosterStep: state?.booster_step ?? null,
    },
    config,
    Date.now(),
    patient.timezone,
  );

  return (
    <Shell heading={target.question}>
      <Journey steps={plan.steps} />
      <NextPractice window={plan.window} />
      <Mastery mastery={plan.mastery} />
      <Booster steps={plan.booster} mastered={plan.mastered} />
    </Shell>
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
function Shell({
  heading,
  body,
  children,
}: {
  heading?: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center gap-8 bg-white p-6 text-zinc-900">
      <div className="flex w-full max-w-3xl flex-col gap-3">
        <h1 className="text-3xl font-semibold">{C.title}</h1>
        <p className="text-lg text-zinc-700">{C.intro}</p>
        {heading && <p className="text-lg text-zinc-700">{heading}</p>}
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
