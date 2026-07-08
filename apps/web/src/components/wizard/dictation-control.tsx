"use client";

import { WIZARD_COPY } from "@/lib/wizard/copy";
import { useSpeechDictation } from "@/lib/wizard/use-speech-dictation";

const C = WIZARD_COPY.dictation;

/**
 * Mic control for the description step — progressive enhancement over typing. Renders nothing where
 * the Web Speech API is absent and a gentle note where the mic is blocked; otherwise a toggle button
 * that appends finalized speech into the caregiver's textarea (via `onTranscript`) with a live
 * interim preview in a polite aria-live region. Recording state is shown by label + shape, not colour.
 */
export function DictationControl({ onTranscript }: { onTranscript: (text: string) => void }) {
  const { status, interim, start, stop } = useSpeechDictation(onTranscript);

  if (status === "unsupported") return null;
  if (status === "denied") {
    return <p className="text-base text-zinc-500">{C.unavailable}</p>;
  }

  const listening = status === "listening";
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-pressed={listening}
        onClick={listening ? stop : start}
        className="inline-flex min-h-[60px] items-center gap-3 self-start rounded-xl border-2 border-zinc-400 bg-white px-5 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center text-xl">
          {listening ? (
            <span className="h-3.5 w-3.5 rounded-full bg-zinc-900 motion-safe:animate-pulse" />
          ) : (
            "🎙"
          )}
        </span>
        {listening ? C.stop : C.start}
      </button>
      <p aria-live="polite" className="min-h-[1.5rem] text-base text-zinc-600">
        <span className="sr-only">{C.liveLabel}: </span>
        {listening ? interim || C.listening : ""}
      </p>
    </div>
  );
}
