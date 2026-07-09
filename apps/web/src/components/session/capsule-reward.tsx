"use client";

import { useEffect, useRef, useState } from "react";
import { CAPSULE_COPY } from "@/lib/capsules/copy";
import type { Capsule } from "@/lib/capsules/reward";

const C = CAPSULE_COPY.reward;

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
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setReducedMotion(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const id = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-label={C.heading}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-white/95 px-6 text-center text-zinc-900 backdrop-blur-sm"
    >
      <h2 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold">
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
