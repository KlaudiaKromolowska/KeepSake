"use client";

import { useEffect, useRef } from "react";
import { SESSION_COPY } from "@/lib/session/copy";
import type { Affect } from "@/lib/session/schema";

const AFFECT_BUTTON =
  "flex min-h-[140px] min-w-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-zinc-500 bg-white px-8 py-6 text-3xl font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

/**
 * The two-tap affect choice (5.4) — patient-facing, so both options are oversized, icon-paired,
 * and equally weighted (no "good/bad" visual hierarchy, no clinical scale).
 */
export function AffectButtons({ onPick }: { onPick: (affect: Affect) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <button type="button" onClick={() => onPick("content")} className={AFFECT_BUTTON}>
        <SunIcon />
        {SESSION_COPY.affect.content}
      </button>
      <button type="button" onClick={() => onPick("unsettled")} className={AFFECT_BUTTON}>
        <CloudIcon />
        {SESSION_COPY.affect.unsettled}
      </button>
    </div>
  );
}

/**
 * Full-screen pre-session affect capture, shown once between "Begin" and the first probe.
 * Always answerable in exactly one tap: either affect, or skip — never blocks the session.
 */
export function AffectScreen({ onDone }: { onDone: (affect: Affect | null) => void }) {
  // Match the RunningSession focus-move: on appearance, move focus to this screen's heading so
  // keyboard/AT users land on (and hear) the new screen rather than a silent <body>.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-white px-6 text-center text-zinc-900">
      <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold">
        {SESSION_COPY.affect.preHeading}
      </h1>
      <p className="max-w-2xl text-4xl font-semibold leading-tight">
        {SESSION_COPY.affect.preQuestion}
      </p>
      <AffectButtons onPick={onDone} />
      <button
        type="button"
        onClick={() => onDone(null)}
        className="min-h-[64px] rounded-2xl border-2 border-zinc-500 bg-zinc-50 px-8 text-2xl font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        {SESSION_COPY.affect.skip}
      </button>
    </section>
  );
}

function SunIcon() {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, aria-hidden and paired with a visible text label
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-12 w-12"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
      />
    </svg>
  );
}

function CloudIcon() {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, aria-hidden and paired with a visible text label
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-12 w-12"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z"
      />
    </svg>
  );
}
