"use client";

import { useEffect, useState } from "react";
import { SESSION_COPY } from "@/lib/session/copy";

// The runner's CurrentWait is structurally identical; Task 5 passes it straight through.
export interface DistractorWait {
  startedAtMs: number;
  durationMs: number;
  intervalSec: number;
}

function formatClock(totalSec: number): string {
  const clamped = Math.max(0, totalSec);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatRung(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec % 60 === 0) return `${sec / 60}m`;
  return `${Math.floor(sec / 60)}m${sec % 60}s`;
}

export function DistractorCard({
  prompt,
  wait,
  rungOptions,
  onOverride,
}: {
  prompt: string;
  wait: DistractorWait;
  rungOptions: number[];
  onOverride: (sec: number) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [adjustOpen, setAdjustOpen] = useState(false);

  // Restart the tick whenever a new wait period begins (onOverride swaps `wait`).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `wait` intentionally resets the interval; the callback re-reads it via closure on the next render's props.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [wait]);

  const elapsedMs = Math.min(Math.max(now - wait.startedAtMs, 0), wait.durationMs);
  const remainingFraction = 1 - elapsedMs / wait.durationMs;
  const remainingRealSec = Math.ceil(wait.intervalSec * remainingFraction);
  const progressPct = (elapsedMs / wait.durationMs) * 100;

  return (
    <section className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-white px-6 text-center text-zinc-900">
      <h1 tabIndex={-1} className="text-3xl font-semibold">
        {SESSION_COPY.distractor.heading}
      </h1>
      <p className="max-w-2xl text-4xl leading-snug">{prompt}</p>
      <p className="text-2xl text-zinc-700">{SESSION_COPY.distractor.hint}</p>

      <div className="flex flex-col items-center gap-3">
        <div aria-hidden className="flex flex-col items-center gap-3">
          <p className="text-2xl text-zinc-700">
            {SESSION_COPY.distractor.clockLabel}{" "}
            <span className="tabular-nums text-5xl font-semibold">
              {formatClock(remainingRealSec)}
            </span>
          </p>
          <div className="h-2 w-64 overflow-hidden rounded-full bg-zinc-200 motion-reduce:hidden">
            <div
              className="h-full bg-zinc-900"
              style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
            />
          </div>
        </div>
        <span role="status" className="sr-only">
          Waiting
        </span>
      </div>

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          aria-expanded={adjustOpen}
          onClick={() => setAdjustOpen((open) => !open)}
          className="min-h-[64px] rounded-2xl border-2 border-zinc-500 bg-zinc-50 px-8 text-2xl font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          {SESSION_COPY.distractor.adjustWait}
        </button>
        {adjustOpen && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-xl text-zinc-700">{SESSION_COPY.distractor.adjustWaitHint}</p>
            <div className="flex flex-wrap justify-center gap-4">
              {rungOptions.map((sec) => {
                const isCurrent = sec === wait.intervalSec;
                return (
                  <button
                    key={sec}
                    type="button"
                    aria-pressed={isCurrent}
                    onClick={() => {
                      onOverride(sec);
                      setAdjustOpen(false);
                    }}
                    className={`min-h-[64px] rounded-2xl border-2 px-6 text-xl font-medium focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 ${
                      isCurrent
                        ? "border-zinc-900 bg-zinc-100 text-zinc-900"
                        : "border-zinc-300 bg-white text-zinc-700"
                    }`}
                  >
                    {formatRung(sec)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
