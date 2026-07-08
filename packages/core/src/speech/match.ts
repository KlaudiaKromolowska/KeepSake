/**
 * V1 speech assist — fuzzy transcript matching (PLAN.md §9). Pure functions only: no browser API,
 * no clock, no network. The asymmetry is deliberate and clinical: near-misses lean "accept"
 * (a false "not this time" to a correct, vulnerable patient is a protocol-integrity failure),
 * "reject" fires only on a clearly different answer, and everything in between is "ambiguous" —
 * escalated to the Haiku grader, never decided harshly here.
 */
import { distance } from "fastest-levenshtein";

export type MatchVerdict = "accept" | "ambiguous" | "reject" | "no_speech";

/** Fuzzy verdict → suggested caregiver outcome; ambiguous/no_speech suggest nothing. */
export function suggestionForVerdict(verdict: MatchVerdict): "recall" | "miss" | null {
  if (verdict === "accept") return "recall";
  if (verdict === "reject") return "miss";
  return null;
}

/**
 * Lowercase, strip diacritics (NFD + combining marks; ł/Ł mapped by hand — they don't decompose),
 * turn punctuation into spaces, collapse whitespace. ASR output and target answers must meet on
 * the same plain-letter ground before any distance is computed.
 */
export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Accept when the edit distance is within ~a quarter of the answer length; exact-only under 4 chars. */
const acceptThreshold = (len: number) => (len <= 3 ? 0 : Math.ceil(len / 4));

/** Clear miss only well past the accept band — at least 60% of the answer edited away. */
const rejectThreshold = (len: number) => Math.max(acceptThreshold(len) + 2, Math.ceil(len * 0.6));

/** Min distance from a normalized candidate to the whole transcript or any same-word-count window. */
function bestDistance(normTranscript: string, candidate: string): number {
  let best = distance(normTranscript, candidate);
  const words = normTranscript.split(" ");
  const span = candidate.split(" ").length;
  for (let i = 0; i + span <= words.length; i++) {
    best = Math.min(best, distance(words.slice(i, i + span).join(" "), candidate));
  }
  return best;
}

/**
 * Grade a transcript against the target answer + accept-aliases.
 * - `no_speech`: nothing usable was said (or there is no answer to match against).
 * - `accept`: some candidate matches within its accept threshold — including embedded in a longer
 *   utterance ("her name is Lena").
 * - `reject`: EVERY candidate is clearly different (distance past its reject threshold).
 * - `ambiguous`: the middle band — the Haiku grader's job.
 */
export function matchTranscript(
  transcript: string,
  answer: string,
  aliases: readonly string[] = [],
): MatchVerdict {
  const normTranscript = normalizeSpeech(transcript);
  if (normTranscript === "") return "no_speech";

  const candidates = [answer, ...aliases].map(normalizeSpeech).filter((c) => c !== "");
  if (candidates.length === 0) return "no_speech";

  let allReject = true;
  for (const candidate of candidates) {
    const d = bestDistance(normTranscript, candidate);
    if (d <= acceptThreshold(candidate.length)) return "accept";
    if (d < rejectThreshold(candidate.length)) allReject = false;
  }
  return allReject ? "reject" : "ambiguous";
}

/**
 * Best verdict across ASR alternatives, biased to accept: any accept wins; otherwise ambiguous
 * beats reject (escalate to the grader rather than suggest a miss); reject only when every
 * alternative is clearly different.
 */
export function matchAlternatives(
  alternatives: readonly string[],
  answer: string,
  aliases: readonly string[] = [],
): MatchVerdict {
  let best: MatchVerdict = "no_speech";
  for (const alt of alternatives) {
    const v = matchTranscript(alt, answer, aliases);
    if (v === "accept") return "accept";
    if (v === "ambiguous") best = "ambiguous";
    else if (v === "reject" && best !== "ambiguous") best = "reject";
  }
  return best;
}
