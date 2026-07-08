// Every line the kiosk speaks — the single source of truth (docs/tts-decision.md §3). The Web
// Speech backend speaks `text` live; DEMO_MODE plays the pre-generated `/audio/<slug>.mp3` for the
// same cue. Lines reuse SESSION_COPY verbatim where a screen shows the same words, so spoken and
// on-screen copy can never diverge in meaning.

import { SESSION_COPY } from "@/lib/session/copy";

export interface SpokenTarget {
  question: string;
  answer: string;
}

export const AUDIO_LINES = {
  teach: (t: SpokenTarget) =>
    `${SESSION_COPY.teach.heading}. ${t.question} The answer is ${t.answer}. Say it with me: ${t.answer}.`,
  probe: (t: SpokenTarget) => t.question,
  correction: (t: SpokenTarget) =>
    `${SESSION_COPY.correction.reassurance} The answer is ${t.answer}. Say it with me: ${t.answer}.`,
  "end-on-win": (t: SpokenTarget) =>
    `${SESSION_COPY.endOnWin.heading}. ${t.question} The answer is ${t.answer}. Say it with me: ${t.answer}.`,
  "encourage-1": () => "Well done — you remembered.",
  "encourage-2": () => "Lovely — that's it.",
  "encourage-3": () => "That's right — well done.",
  "session-end": () => SESSION_COPY.ended.closeLine,
  "session-end-mastered": () =>
    `${SESSION_COPY.ended.masteredLine} ${SESSION_COPY.ended.closeLine}`,
} as const;

export type AudioLineKey = keyof typeof AUDIO_LINES;

/** Keys whose line embeds the target — their mp3 is named by content (`correction-lena.mp3`). */
const TARGET_LINE_KEYS: readonly string[] = ["teach", "probe", "correction", "end-on-win"];

export interface AudioCue {
  /** Stable content-named id — the DEMO_MODE file is `/audio/<slug>.mp3`. */
  slug: string;
  /** The exact text the Web Speech backend speaks. */
  text: string;
}

/** Renders a line's text — widens the static `() => string` entries to the common call shape. */
export function lineText(key: AudioLineKey, target: SpokenTarget): string {
  const line: (t: SpokenTarget) => string = AUDIO_LINES[key];
  return line(target);
}

export function buildCue(key: AudioLineKey, target: SpokenTarget): AudioCue {
  const slug = TARGET_LINE_KEYS.includes(key) ? `${key}-${slugify(target.answer)}` : key;
  return { slug, text: lineText(key, target) };
}

/** "Lena" → "lena"; falls back to "target" so an all-symbol answer still yields a valid filename. */
export function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "target" : slug;
}
