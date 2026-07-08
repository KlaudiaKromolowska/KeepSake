// Thin browser shims for playback (docs/tts-decision.md §1): Web Speech as the product default
// (on-device — no patient data leaves the machine), pre-generated mp3s in DEMO_MODE. All decision
// logic lives in narration-logic.ts; this file only wraps browser APIs and is deliberately untested.

import type { AudioCue } from "./lines";

export interface SpeechBackend {
  /** Cancels anything still playing, then plays the cue — one voice, never two. */
  play(cue: AudioCue): void;
  cancel(): void;
}

const PREFERRED_VOICES = [
  "Google US English", // Chrome/Android — good prosody
  "Microsoft Aria Online (Natural)", // Edge/Windows — best available, neural
  "Samantha", // Safari/macOS default, decent
];

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return (
    PREFERRED_VOICES.map((name) => voices.find((v) => v.name === name)).find(Boolean) ??
    voices.find((v) => v.lang === "en-US") ??
    voices[0] ??
    null
  );
}

/** Null when the browser has no speechSynthesis — callers degrade to silence, never an error. */
export function createSpeechSynthesisBackend(): SpeechBackend | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const synth = window.speechSynthesis;

  // getVoices() is empty until `voiceschanged` fires on first load in Chrome — pick once there,
  // cache the result (tts-decision §1).
  let voice = pickVoice(synth.getVoices());
  const onVoices = () => {
    voice = pickVoice(synth.getVoices());
    synth.removeEventListener("voiceschanged", onVoices);
  };
  if (!voice) synth.addEventListener("voiceschanged", onVoices);

  return {
    play(cue) {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(cue.text);
      if (voice) u.voice = voice;
      u.rate = 0.9; // slower reads as calmer for an elderly listener; below 0.85 turns choppy
      u.pitch = 1.0;
      synth.speak(u);
    },
    cancel() {
      synth.cancel();
    },
  };
}

/**
 * DEMO_MODE backend: plays `/audio/<slug>.mp3` via `<audio>`. A missing or unplayable file (the
 * asset pass is a separate step) falls back to live speech, then to silence — a broken asset must
 * never block or error the session.
 */
export function createDemoAudioBackend(fallback: SpeechBackend | null): SpeechBackend {
  let current: HTMLAudioElement | null = null;

  const stop = () => {
    if (current) {
      current.pause();
      current.removeAttribute("src");
      current = null;
    }
    fallback?.cancel();
  };

  return {
    play(cue) {
      stop();
      const el = new Audio(`/audio/${cue.slug}.mp3`);
      current = el;
      // 404s surface as an error event or a rejected play() depending on the browser; the
      // `current === el` guard makes whichever fires first win so the fallback speaks only once.
      const fallBack = () => {
        if (current !== el) return;
        current = null;
        fallback?.play(cue);
      };
      el.addEventListener("error", fallBack);
      el.play().catch(fallBack);
    },
    cancel: stop,
  };
}
