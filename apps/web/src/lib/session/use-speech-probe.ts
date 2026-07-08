"use client";

import { matchAlternatives, suggestionForVerdict } from "@keepsake/core/speech";
import { useEffect, useRef, useState } from "react";
import { gradeRecallAction } from "./grade-actions";

/**
 * V1 speech assist (PLAN §9) — listens ONLY while the probe screen is mounted (the answer window)
 * and produces a *suggestion* the caregiver confirms with a tap. It never records an outcome.
 * Silence, no-speech, mic denial, low-confidence rejects, and every failure resolve to "no
 * suggestion" — never to a suggested miss (a false "not this time" is the harm we bias against).
 */
export type SpeechAssist =
  | { status: "off" } // flag off, API unsupported, or mic unavailable — render nothing
  | { status: "listening" }
  | { status: "checking" } // ambiguous middle band — server grader in flight
  | { status: "done"; suggestion: "recall" | "miss" | null };

// Minimal structural types for the Web Speech API (not in lib.dom; no new @types dependency).
interface SpeechAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechResultEventLike {
  results: ArrayLike<ArrayLike<SpeechAlternativeLike>>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  grammars: unknown;
  onresult: ((e: SpeechResultEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type SpeechWindow = {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  SpeechGrammarList?: new () => { addFromString(g: string, w: number): void };
  webkitSpeechGrammarList?: new () => { addFromString(g: string, w: number): void };
};

/** Below this top-alternative confidence a fuzzy REJECT is discarded (accepts always stand). */
const LOW_CONFIDENCE = 0.4;
/** The recognizer ends itself after short silences; restart a few times across a long think. */
const MAX_RESTARTS = 6;

export function useSpeechProbe(opts: {
  enabled: boolean;
  targetId: string;
  answer: string;
  aliases: readonly string[];
}): SpeechAssist {
  const [assist, setAssist] = useState<SpeechAssist>({ status: "off" });
  // Mount-time snapshot: the probe's facts never change while the screen is up (mirrors
  // use-session-runner); a re-render must not rebuild the recognizer mid-listen.
  const optsRef = useRef(opts);

  useEffect(() => {
    const { enabled, targetId, answer, aliases } = optsRef.current;
    if (!enabled) return;
    const w = window as unknown as SpeechWindow;
    const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Recognition) return; // graceful absence: tap flow unchanged

    let disposed = false;
    let restarts = 0;
    let gotResult = false;
    const recognition = new Recognition();
    recognition.lang = document.documentElement.lang || "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;

    // Phrase hints where the API allows (JSGF grammars are best-effort; a no-op on most engines).
    const GrammarList = w.SpeechGrammarList ?? w.webkitSpeechGrammarList;
    if (GrammarList) {
      const phrases = [answer, ...aliases].map((p) => p.replace(/[|;]/g, " ")).join(" | ");
      const grammars = new GrammarList();
      grammars.addFromString(`#JSGF V1.0; grammar keepsake; public <answer> = ${phrases};`, 1);
      recognition.grammars = grammars;
    }

    recognition.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      if (!last || last.length === 0) return;
      gotResult = true;
      const alternatives = Array.from({ length: last.length }, (_, i) => last[i]);
      const verdict = matchAlternatives(
        alternatives.map((a) => a.transcript),
        answer,
        aliases,
      );
      const topConfidence = Math.max(...alternatives.map((a) => a.confidence ?? 0));

      if (verdict === "ambiguous") {
        setAssist({ status: "checking" });
        void gradeRecallAction({ targetId, transcript: alternatives[0].transcript })
          .then((res) => {
            if (!disposed) setAssist({ status: "done", suggestion: res.data?.suggestion ?? null });
          })
          .catch(() => {
            if (!disposed) setAssist({ status: "done", suggestion: null });
          });
        return;
      }
      // A shaky-audio reject is treated as "couldn't tell" — never suggest a miss off bad audio.
      const suggestion =
        verdict === "reject" && topConfidence < LOW_CONFIDENCE
          ? null
          : suggestionForVerdict(verdict);
      setAssist({ status: "done", suggestion });
    };

    // Errors (no-speech, not-allowed, audio-capture…) fall through to onend, which decides.
    recognition.onerror = () => {};
    recognition.onend = () => {
      if (disposed || gotResult) return;
      if (restarts < MAX_RESTARTS) {
        restarts += 1;
        try {
          recognition.start();
        } catch {
          setAssist({ status: "off" });
        }
        return;
      }
      setAssist({ status: "done", suggestion: null });
    };

    try {
      recognition.start();
      setAssist({ status: "listening" });
    } catch {
      setAssist({ status: "off" });
    }

    return () => {
      disposed = true;
      recognition.onresult = null;
      recognition.onend = null;
      recognition.abort();
    };
  }, []);

  return assist;
}
