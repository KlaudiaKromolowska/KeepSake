"use client";

import type { SessionEvent, SessionState } from "@keepsake/core/sr";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNarration } from "@/lib/audio/use-narration";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import {
  annotateSessionAction,
  endSessionAction,
  recordTrialAction,
  type StartSessionResult,
  saveSessionAffectAction,
  saveSessionNoteAction,
  startSessionAction,
} from "@/lib/session/actions";
import { SESSION_COPY } from "@/lib/session/copy";
import { distractorForTrial } from "@/lib/session/distractors";
import { attemptSave, recallCount, trialAdded } from "@/lib/session/session-view-logic";
import { useSessionRunner } from "@/lib/session/use-session-runner";
import { ladderRungs } from "@/lib/session/wait-policy";
import { AffectScreen } from "./affect-prompt";
import { AnswerScreen } from "./answer-screen";
import { DistractorCard } from "./distractor-card";
import { EndScreen } from "./end-screen";
import { NarrationToggle } from "./narration-toggle";
import { ProbeScreen } from "./probe-screen";

const KIOSK_SECTION =
  "flex min-h-dvh flex-col items-center justify-center gap-8 bg-white px-6 text-center text-zinc-900";
const PRIMARY_BUTTON =
  "min-h-[64px] rounded-2xl border-2 border-zinc-900 bg-zinc-900 px-8 text-2xl font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

/**
 * The kiosk session client boundary. Owns the pre-session screen (no session row exists until the
 * caregiver taps begin) and, once started, hands off to `RunningSession` which drives the engine.
 */
export function SessionView({
  targetId,
  demoSpeed,
  question,
  resumeAvailable,
  distractorPrompts,
  demoAudio,
  speechEnabled = false,
}: {
  targetId: string;
  demoSpeed: number;
  question: string;
  resumeAvailable: boolean;
  distractorPrompts?: readonly string[];
  demoAudio?: boolean;
  /** NEXT_PUBLIC_SPEECH=1 — V1 speech assist on the probe screen (suggestion only, default off). */
  speechEnabled?: boolean;
}) {
  const [result, setResult] = useState<StartSessionResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [affectAsked, setAffectAsked] = useState(false);

  async function begin() {
    setStarting(true);
    setStartError(null);
    try {
      const res = await startSessionAction({ targetId });
      if (res.error !== null) {
        setStartError(res.error);
        setStarting(false);
        return;
      }
      setResult(res.data);
    } catch {
      setStartError(SESSION_COPY.preSession.startError);
      setStarting(false);
    }
  }

  if (result) {
    // Pre-affect (5.4): one tap or one skip, strictly before the first probe — RunningSession
    // (and with it the engine/timers) doesn't mount until this screen is dismissed. Resumed
    // sessions skip it (the patient already answered when this session first began). The save is
    // best-effort and never re-prompts: a lost affect tap is acceptable, a blocked session isn't.
    if (!affectAsked && !result.resumed)
      return (
        <AffectScreen
          onDone={(affect) => {
            setAffectAsked(true);
            if (affect)
              void attemptSave(() =>
                saveSessionAffectAction({ sessionId: result.sessionId, point: "pre", affect }),
              );
          }}
        />
      );
    return (
      <RunningSession
        result={result}
        demoSpeed={demoSpeed}
        distractorPrompts={distractorPrompts}
        demoAudio={demoAudio ?? false}
        speechEnabled={speechEnabled}
      />
    );
  }

  return (
    <section className={KIOSK_SECTION}>
      <h1 tabIndex={-1} className="text-3xl font-semibold">
        {SESSION_COPY.preSession.heading}
      </h1>
      <p className="max-w-2xl text-4xl font-semibold leading-tight">{question}</p>
      <p className="text-2xl text-zinc-700">{SESSION_COPY.preSession.prompt}</p>
      {startError && (
        <p role="alert" className="text-2xl text-zinc-900">
          {SESSION_COPY.preSession.startError}
        </p>
      )}
      <button
        type="button"
        onClick={begin}
        disabled={starting}
        className={`${PRIMARY_BUTTON} disabled:opacity-50`}
      >
        {resumeAvailable ? SESSION_COPY.preSession.resume : SESSION_COPY.preSession.begin}
      </button>
    </section>
  );
}

function RunningSession({
  result,
  demoSpeed,
  distractorPrompts,
  demoAudio,
  speechEnabled,
}: {
  result: StartSessionResult;
  demoSpeed: number;
  distractorPrompts?: readonly string[];
  demoAudio: boolean;
  speechEnabled: boolean;
}) {
  const router = useRouter();
  const { sessionId, target, config } = result;
  const targetId = target.id;

  const prevStateRef = useRef<SessionState>(result.state);
  // Durable, online-first offline queue (V3 — never lose a trial): tries the network first, and
  // only falls back to an IndexedDB-backed queue (flushed on reconnect / manual retry) on
  // failure, so a caregiver never silently loses a recorded outcome to flaky care-home Wi-Fi.
  const offlineQueue = useOfflineQueue();

  const onChange = useCallback(
    (state: SessionState, event: SessionEvent) => {
      const prev = prevStateRef.current;
      prevStateRef.current = state;

      // Interval overrides are best-effort provenance — never queued (a re-fire would duplicate
      // the annotation). Trials and the session close are queued so a save failure can be retried.
      if (event.type === "interval_override") {
        void annotateSessionAction({
          sessionId,
          kind: "interval_override",
          fromSec: prev.intervalSec,
          toSec: state.intervalSec,
          at: event.at,
        });
      }

      // Trial-then-close, sequenced: a single reduce can both add the final trial and end the
      // session (ceiling/mastery). Persisting the trial first keeps endSession's applied bundle
      // from being clobbered by a stale-read merge in recordTrial.
      void (async () => {
        if (trialAdded(prev, state)) {
          const trial = state.trials.at(-1);
          if (trial) {
            // trialId is the idempotency key: generated once here and reused verbatim on any
            // queued replay, so a retry after a lost response upserts onto the same row.
            const input = {
              sessionId,
              targetId,
              trialId: crypto.randomUUID(),
              trial,
              snapshot: state,
            };
            await offlineQueue.save(
              { id: input.trialId, action: "recordTrial", input, enqueuedAt: Date.now() },
              () => recordTrialAction(input),
            );
          }
        }
        if (state.phase === "ended") {
          const input = { sessionId, targetId, snapshot: state };
          await offlineQueue.save(
            { id: `${sessionId}:end`, action: "endSession", input, enqueuedAt: Date.now() },
            () => endSessionAction(input),
          );
        }
      })();
    },
    [sessionId, targetId, offlineQueue],
  );

  const handle = useSessionRunner(result.state, config, demoSpeed, onChange);
  const narration = useNarration(
    handle?.state ?? null,
    { question: target.question, answer: target.answer },
    demoAudio,
  );

  const screenRef = useRef<HTMLDivElement>(null);
  const phase = handle?.state.phase;
  // On each phase change, move focus to the new screen's heading (kiosk keyboard/AT flow).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `phase` is the intended trigger — the effect re-runs on every phase transition to move focus, though it reads only the ref.
  useEffect(() => {
    screenRef.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [phase]);

  // Null only for the first render before the mount effect constructs the runner.
  if (!handle) return <section className={KIOSK_SECTION} aria-busy="true" />;

  const { state, currentWait, runner } = handle;
  const q = target.question;
  const a = target.answer;
  const img = target.imageUrl;

  return (
    <div ref={screenRef}>
      <NarrationToggle muted={narration.muted} onToggle={narration.toggleMuted} />
      {offlineQueue.pendingCount > 0 && (
        <div
          role="alert"
          className="sticky top-0 z-10 flex flex-wrap items-center justify-center gap-4 bg-amber-100 px-6 py-3 text-xl text-amber-900"
        >
          {SESSION_COPY.shared.saveError}
          <button
            type="button"
            onClick={() => void offlineQueue.retry()}
            className="min-h-[64px] rounded-2xl border-2 border-amber-800 bg-white px-6 text-xl font-medium text-amber-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            {SESSION_COPY.shared.retry}
          </button>
        </div>
      )}

      {state.phase === "teach" && (
        <AnswerScreen
          variant="teach"
          question={q}
          answer={a}
          imageUrl={img}
          onDone={() => runner.teachDone()}
        />
      )}
      {state.phase === "awaiting_probe" && (
        <ProbeScreen
          question={q}
          answer={a}
          imageUrl={img}
          onOutcome={(o) => runner.probe(o)}
          {...(speechEnabled ? { speech: { targetId, aliases: target.acceptedVariants } } : {})}
        />
      )}
      {state.phase === "correcting" && (
        <AnswerScreen
          variant="correction"
          question={q}
          answer={a}
          imageUrl={img}
          onDone={() => runner.correctionDone()}
        />
      )}
      {state.phase === "distractor" && currentWait && (
        <DistractorCard
          prompt={distractorForTrial(state.trials.length, distractorPrompts)}
          wait={currentWait}
          rungOptions={ladderRungs(config)}
          onOverride={(sec) => runner.overrideInterval(sec)}
        />
      )}
      {state.phase === "end_on_win" && (
        <AnswerScreen
          variant="end_on_win"
          question={q}
          answer={a}
          imageUrl={img}
          onDone={() => runner.teachDone()}
        />
      )}
      {state.phase === "ended" && (
        <EndScreen
          sessionId={sessionId}
          recalls={recallCount(state.trials)}
          trials={state.trials.length}
          mastered={state.progress.mastered}
          rescopeRequired={state.rescopeRequired}
          onSaveNote={async (note) => {
            const res = await saveSessionNoteAction({ sessionId, note });
            return res.error === null;
          }}
          onAffect={(affect) =>
            void attemptSave(() => saveSessionAffectAction({ sessionId, point: "post", affect }))
          }
          onHome={() => router.push("/dashboard")}
        />
      )}

      {state.phase !== "ended" && (
        <SessionFooter sessionId={sessionId} onEnd={() => runner.endRequested()} />
      )}
    </div>
  );
}

/** Persistent footer for the active phases: end the session + log a physical answer card. */
function SessionFooter({ sessionId, onEnd }: { sessionId: string; onEnd: () => void }) {
  const [cardOpen, setCardOpen] = useState(false);
  const [cardText, setCardText] = useState("");
  const [saved, setSaved] = useState(false);
  const [cardError, setCardError] = useState(false);

  async function logCard() {
    const note = cardText.trim();
    if (note === "") return;
    setCardError(false);
    const ok = await attemptSave(() =>
      annotateSessionAction({ sessionId, kind: "answer_card", note, at: Date.now() }),
    );
    if (!ok) {
      setCardError(true);
      return;
    }
    setCardText("");
    setCardOpen(false);
    setSaved(true);
  }

  return (
    <footer className="flex flex-col items-center gap-4 border-t-2 border-zinc-200 bg-white px-6 py-6">
      <div className="flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={onEnd}
          className="min-h-[64px] rounded-2xl border-2 border-zinc-500 bg-white px-8 text-2xl font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          {SESSION_COPY.shared.endSession}
        </button>
        <button
          type="button"
          aria-expanded={cardOpen}
          onClick={() => {
            setCardOpen((open) => !open);
            setSaved(false);
            setCardError(false);
          }}
          className="min-h-[64px] rounded-2xl border-2 border-zinc-500 bg-zinc-50 px-8 text-2xl font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          {SESSION_COPY.annotations.answerCard}
        </button>
        {saved && (
          <span role="status" className="text-xl text-zinc-700">
            {SESSION_COPY.ended.notesSaved}
          </span>
        )}
      </div>
      {cardOpen && (
        <div className="flex w-full max-w-xl flex-col items-start gap-3">
          <label htmlFor="answer-card-note" className="text-xl text-zinc-700">
            {SESSION_COPY.annotations.answerCardPrompt}
          </label>
          <input
            id="answer-card-note"
            type="text"
            value={cardText}
            onChange={(e) => setCardText(e.target.value)}
            className="min-h-[64px] w-full rounded-xl border-2 border-zinc-500 p-4 text-xl"
          />
          <button
            type="button"
            onClick={logCard}
            disabled={cardText.trim() === ""}
            className="min-h-[64px] rounded-2xl border-2 border-zinc-900 bg-zinc-900 px-8 text-2xl font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
          >
            {SESSION_COPY.annotations.answerCardSave}
          </button>
          {cardError && (
            <p role="alert" className="text-xl text-zinc-900">
              {SESSION_COPY.shared.saveError}
            </p>
          )}
        </div>
      )}
    </footer>
  );
}
