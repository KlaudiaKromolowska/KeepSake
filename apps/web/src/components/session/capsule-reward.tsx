"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { CAPSULE_COPY } from "@/lib/capsules/copy";
import type { Capsule } from "@/lib/capsules/reward";

const C = CAPSULE_COPY.reward;

const HEADING_ID = "capsule-reward-heading";
// Tab-focusable descendants of the dialog — the video (when present) and the dismiss button.
// The heading (tabIndex=-1) is programmatically focusable but excluded from the Tab cycle.
const FOCUSABLE =
  'a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

/** Backup auto-dismiss. The reward is a brief warm glance, not a viewing — it also clears the moment
 * the engine reaches the next probe (SessionView drops it on `awaiting_probe`), so this is only the
 * fallback for the session-ending case where no further probe arrives. */
const AUTO_DISMISS_MS = 8000;

/**
 * The in-session memory-capsule reward: a large, gentle overlay shown ONLY after a genuine correct
 * recall (SessionView decides that via `isRewardableRecall`). It is purely presentational — it never
 * touches the SR runner, the interval timer, or the DEMO_SPEED wait, so it can never disrupt
 * progression or the end-on-win flow. Video is muted by default (no jarring autoplay audio) and does
 * not autoplay under `prefers-reduced-motion`; nothing flashes. A single large affordance dismisses
 * it, and it auto-dismisses as a backup.
 */
export function CapsuleReward({ capsule, onDismiss }: { capsule: Capsule; onDismiss: () => void }) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setReducedMotion(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    // Move focus into the dialog and restore it to the previously-focused control on close, so
    // keyboard focus can never fall through to the outcome buttons underneath (a stray tap there
    // would mis-record a trial).
    const previouslyFocused = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  useEffect(() => {
    const id = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [onDismiss]);

  // Trap Tab/Shift+Tab within the dialog: wrap focus at the first/last focusable descendant.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={HEADING_ID}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-white/95 px-6 text-center text-zinc-900 backdrop-blur-sm"
    >
      <h2 id={HEADING_ID} ref={headingRef} tabIndex={-1} className="text-3xl font-semibold">
        {C.heading}
      </h2>

      {capsule.kind === "video" ? (
        // muted by default — a calm kiosk never blares audio; controls let a caregiver unmute.
        <video
          src={capsule.url}
          muted
          playsInline
          controls
          autoPlay={!reducedMotion}
          className="max-h-[60vh] w-auto max-w-full rounded-3xl object-contain"
        />
      ) : (
        // Native <img> (not next/image): a signed, single-use family URL that never benefits from
        // the image optimizer — plain rendering also needs no remotePatterns config change.
        // biome-ignore lint/performance/noImgElement: signed one-off media, intentionally un-optimized
        <img
          src={capsule.url}
          alt={capsule.caption ?? C.heading}
          className="max-h-[60vh] w-auto max-w-full rounded-3xl object-contain"
        />
      )}

      {capsule.caption && <p className="max-w-2xl text-2xl text-zinc-700">{capsule.caption}</p>}

      <button
        type="button"
        onClick={onDismiss}
        className="min-h-[64px] rounded-2xl border-2 border-zinc-900 bg-zinc-900 px-8 text-2xl font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        {C.keepGoing}
      </button>
    </div>
  );
}
