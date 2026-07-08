"use client";

// Orchestration-layer narration (docs/tts-decision.md §3): reacts to session state transitions and
// speaks the matching AUDIO_LINES cue. Interruption policy = cancel-and-replace — spoken audio
// must always match the current screen; a queued stale line finishing over a new screen would be
// actively confusing for a memory-impaired listener. packages/core stays a pure reducer.

import type { SessionState } from "@keepsake/core/sr";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SpokenTarget } from "./lines";
import { cueForTransition, type NarrationState } from "./narration-logic";
import { createDemoAudioBackend, createSpeechSynthesisBackend, type SpeechBackend } from "./speech";

const MUTE_KEY = "keepsake.narration.muted";

export interface Narration {
  muted: boolean;
  toggleMuted(): void;
}

/**
 * `state` is null until the session runner has mounted. `demoAudio` swaps the playback backend to
 * pre-generated mp3s (DEMO_MODE); triggers and call sites are identical. Default is speaking —
 * mute is an explicit caregiver choice, persisted per device.
 */
export function useNarration(
  state: SessionState | null,
  target: SpokenTarget,
  demoAudio: boolean,
): Narration {
  const [muted, setMuted] = useState(false);

  // Read in an effect, not during render: SSR-safe and hydration-identical to the server output.
  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
    } catch {
      // storage unavailable (private mode) — stay unmuted
    }
  }, []);

  const backendRef = useRef<SpeechBackend | null>(null);
  useEffect(() => {
    const speech = createSpeechSynthesisBackend();
    backendRef.current = demoAudio ? createDemoAudioBackend(speech) : speech;
    return () => {
      backendRef.current?.cancel();
      backendRef.current = null;
    };
  }, [demoAudio]);

  // muted/target read through refs so a toggle mid-session never re-fires the speak effect.
  const prevRef = useRef<NarrationState | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (!state) return;
    const prev = prevRef.current;
    prevRef.current = state;
    if (mutedRef.current) return;
    const cue = cueForTransition(prev, state, targetRef.current);
    if (cue) backendRef.current?.play(cue);
  }, [state]);

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        // best-effort persistence only
      }
      if (next) backendRef.current?.cancel(); // muting silences immediately, mid-line included
      return next;
    });
  }, []);

  return { muted, toggleMuted };
}
