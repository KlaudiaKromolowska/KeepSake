"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { foldSegments, type TranscriptSegment } from "./dictation";

/**
 * A small parallel to use-speech-probe (same Web Speech feature-detection + cleanup conventions),
 * but this one *transcribes* the wizard description (PLAN §1b Claude-beat #1): interimResults on,
 * finalized phrases handed back to append into the caregiver's textarea, the interim previewed live.
 * Progressive enhancement: no engine ⇒ "unsupported" (control renders nothing); mic blocked ⇒
 * "denied" (a gentle note). Zero server audio — browser STT → text → the unchanged wizard pipeline.
 */
export type DictationStatus = "unsupported" | "idle" | "listening" | "denied";

// Minimal structural types for the Web Speech API (not in lib.dom; no new @types dependency).
interface SpeechAlternativeLike {
  transcript: string;
}
interface SpeechResultLike extends ArrayLike<SpeechAlternativeLike> {
  isFinal: boolean;
}
interface SpeechResultEventLike {
  results: ArrayLike<SpeechResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechResultEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechWindow = {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export function useSpeechDictation(onFinalized: (text: string) => void): {
  status: DictationStatus;
  interim: string;
  start: () => void;
  stop: () => void;
} {
  const [status, setStatus] = useState<DictationStatus>("unsupported");
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // How many leading results were already appended as final — prevents re-appending a phrase across
  // events. Reset on each start(): a new recognition session restarts its results at index 0.
  const emittedRef = useRef(0);
  // Latest callback without re-running the setup effect (mirrors use-speech-probe's opts snapshot).
  const onFinalizedRef = useRef(onFinalized);
  onFinalizedRef.current = onFinalized;

  useEffect(() => {
    const w = window as unknown as SpeechWindow;
    const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Recognition) return; // stays "unsupported": the control renders nothing, typing is unchanged

    const recognition = new Recognition();
    recognition.lang = document.documentElement.lang || "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (e) => {
      const segments: TranscriptSegment[] = [];
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        segments.push({ transcript: r.length > 0 ? r[0].transcript : "", isFinal: r.isFinal });
      }
      const folded = foldSegments(segments, emittedRef.current);
      emittedRef.current = folded.emittedCount;
      if (folded.finalized) onFinalizedRef.current(folded.finalized);
      setInterim(folded.interim);
    };
    // Permission denial is the one error worth surfacing (gentle note); others just end the session.
    recognition.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setStatus("denied");
    };
    recognition.onend = () => {
      setInterim("");
      setStatus((s) => (s === "denied" ? "denied" : "idle"));
    };

    recognitionRef.current = recognition;
    setStatus("idle");

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    emittedRef.current = 0;
    setInterim("");
    try {
      recognition.start();
      setStatus("listening");
    } catch {
      // start() throws only if already started — we're already listening, so ignore.
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { status, interim, start, stop };
}
