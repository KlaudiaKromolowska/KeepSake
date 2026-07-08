// Pure transcript-assembly for wizard voice-memo dictation. No browser types here so it can be
// unit-tested without a Web Speech engine; the client hook maps `SpeechRecognitionResult`s into
// these plain segments and drives this reducer.

export interface TranscriptSegment {
  transcript: string;
  isFinal: boolean;
}

/**
 * Join two text fragments with a single separating space, so appended dictation neither fuses onto
 * the previous word nor doubles a space. Empty inputs pass through cleanly.
 */
export function joinPhrase(base: string, next: string): string {
  const a = base.replace(/\s+$/, "");
  const b = next.replace(/^\s+/, "");
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
}

/**
 * Fold the current speech-recognition results into (a) newly finalized text to append to the
 * textarea and (b) the live interim preview. `emittedCount` is how many leading results were already
 * committed as final in prior events; only finals at or beyond it are emitted, so a phrase is never
 * appended twice regardless of how the engine re-reports results. Finals are assumed contiguous at
 * the front of the list (the Web Speech contract), interims trailing.
 */
export function foldSegments(
  segments: readonly TranscriptSegment[],
  emittedCount: number,
): { finalized: string; interim: string; emittedCount: number } {
  let finalized = "";
  let interim = "";
  let count = emittedCount;
  segments.forEach((seg, i) => {
    if (seg.isFinal) {
      if (i >= emittedCount) {
        finalized = joinPhrase(finalized, seg.transcript);
        count = i + 1;
      }
    } else {
      interim = joinPhrase(interim, seg.transcript);
    }
  });
  return { finalized, interim: interim.trim(), emittedCount: count };
}
