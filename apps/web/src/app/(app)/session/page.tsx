import { calendarDayInTz } from "@keepsake/core/sr";
import { SessionView } from "@/components/session/session-view";
import { requireUser } from "@/lib/actions";
import { SESSION_COPY } from "@/lib/session/copy";
import { personalizedDistractorsAction } from "@/lib/session/distractor-actions";
import { recognitionOptionsAction } from "@/lib/session/recognition-actions";
import { loadQueue } from "@/lib/targets/load";
import { selectSessionTarget } from "@/lib/targets/queue";

export const metadata = { title: "Session — Keepsake" };

const NO_TARGET_SECTION =
  "flex min-h-dvh flex-col items-center justify-center gap-8 bg-white px-6 text-center text-zinc-900";

/**
 * Kiosk session entry. Resolves WHICH of the patient's targets to practise (V2 multi-target: the
 * due target, acquisition winning ties — `selectSessionTarget`) and, read-only, checks for an open
 * same-day session (to choose begin vs. resume copy). No session row is created here — that happens
 * only when the caregiver taps begin inside <SessionView>. The kiosk trial UI itself is unchanged;
 * only the target it opens on is now queue-aware.
 */
export default async function SessionPage() {
  const { user, supabase } = await requireUser();

  const now = Date.now();
  const queue = await loadQueue(supabase, user.id);
  const selectedId = queue ? selectSessionTarget(queue.targets, now, queue.patient.timezone) : null;
  const target = queue?.targets.find((t) => t.id === selectedId) ?? null;

  if (!target || !queue) {
    return (
      <main className={NO_TARGET_SECTION}>
        <h1 tabIndex={-1} className="text-3xl font-semibold">
          {SESSION_COPY.preSession.noTarget}
        </h1>
      </main>
    );
  }

  const patient = queue.patient;
  let resumeAvailable = false;

  {
    const { data: open } = await supabase
      .from("sessions")
      .select("started_at, summary")
      .eq("patient_id", patient.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (open?.summary && typeof open.summary === "object" && !Array.isArray(open.summary)) {
      const summary = open.summary as Record<string, unknown>;
      const sameDay =
        calendarDayInTz(Date.parse(open.started_at), patient.timezone) ===
        calendarDayInTz(now, patient.timezone);
      resumeAvailable = summary.targetId === target.id && sameDay;
    }
  }

  const demoSpeed = Number(process.env.DEMO_SPEED ?? "1");
  // V1 speech assist — default OFF so the demo/film flow is byte-identical without the flag.
  const speechEnabled = process.env.NEXT_PUBLIC_SPEECH === "1";

  // Both AI extras are fetched once per page load (not per session/trial) so a slow or failing
  // Claude call never blocks or breaks the kiosk flow — any failure is swallowed and SessionView
  // falls back (static distractor list / free-recall probe). Hard 3s budget each; run concurrently
  // so the second never adds to the first's latency. `recognitionOptions` self-gates to
  // post-mastery BOOSTER targets only (null with no AI spend for acquisition + between, incl. the
  // demo) — recognition must never replace the free-recall probe that earns mastery.
  const budget = <T,>(p: Promise<{ data: T | null }>): Promise<{ data: T | null }> =>
    Promise.race([
      p,
      new Promise<{ data: null }>((r) => setTimeout(() => r({ data: null }), 3_000)),
    ]);

  let distractorPrompts: string[] | undefined;
  let recognitionOptions: string[] | undefined;
  try {
    const [distractors, recognition] = await Promise.all([
      budget(personalizedDistractorsAction(target.id)),
      budget(recognitionOptionsAction(target.id)),
    ]);
    if (distractors.data) distractorPrompts = distractors.data;
    if (recognition.data) recognitionOptions = recognition.data;
  } catch {
    distractorPrompts = undefined;
    recognitionOptions = undefined;
  }

  return (
    <main>
      <SessionView
        targetId={target.id}
        demoSpeed={demoSpeed}
        question={target.question}
        resumeAvailable={resumeAvailable}
        distractorPrompts={distractorPrompts}
        recognitionOptions={recognitionOptions}
        demoAudio={process.env.DEMO_MODE === "1"}
        speechEnabled={speechEnabled}
      />
    </main>
  );
}
