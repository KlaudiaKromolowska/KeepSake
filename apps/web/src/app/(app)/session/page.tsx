import { calendarDayInTz } from "@keepsake/core/sr";
import { SessionView } from "@/components/session/session-view";
import { requireUser } from "@/lib/actions";
import { SESSION_COPY } from "@/lib/session/copy";
import { personalizedDistractorsAction } from "@/lib/session/distractor-actions";
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

  // Fetched once per page load (not per session/trial) so a slow or failing Claude call never
  // blocks or breaks the kiosk flow — any failure here is swallowed and SessionView falls back to
  // the static distractor list. Hard 3s budget: the live call took 3–17s in gate testing, and the
  // kiosk page must never feel broken while a nice-to-have personalization loads.
  let distractorPrompts: string[] | undefined;
  try {
    const timeout = new Promise<{ data: null }>((resolve) =>
      setTimeout(() => resolve({ data: null }), 3_000),
    );
    const { data } = await Promise.race([personalizedDistractorsAction(target.id), timeout]);
    if (data) distractorPrompts = data;
  } catch {
    distractorPrompts = undefined;
  }

  return (
    <main>
      <SessionView
        targetId={target.id}
        demoSpeed={demoSpeed}
        question={target.question}
        resumeAvailable={resumeAvailable}
        distractorPrompts={distractorPrompts}
        demoAudio={process.env.DEMO_MODE === "1"}
        speechEnabled={speechEnabled}
      />
    </main>
  );
}
