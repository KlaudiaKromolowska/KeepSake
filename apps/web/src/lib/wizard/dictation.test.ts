import { describe, expect, it } from "vitest";
import { foldSegments, joinPhrase, type TranscriptSegment } from "./dictation";

describe("joinPhrase", () => {
  it("joins two fragments with a single space", () => {
    expect(joinPhrase("My daughter", "visits on Sunday")).toBe("My daughter visits on Sunday");
  });

  it("returns the other side when one is empty", () => {
    expect(joinPhrase("", "Sarah")).toBe("Sarah");
    expect(joinPhrase("Sarah", "")).toBe("Sarah");
    expect(joinPhrase("", "")).toBe("");
  });

  it("collapses trailing/leading whitespace into one separator", () => {
    expect(joinPhrase("Hello   ", "   there")).toBe("Hello there");
  });

  it("keeps internal whitespace of each fragment", () => {
    expect(joinPhrase("a b", "c d")).toBe("a b c d");
  });
});

const seg = (transcript: string, isFinal: boolean): TranscriptSegment => ({ transcript, isFinal });

describe("foldSegments", () => {
  it("returns only the live interim while nothing has finalized", () => {
    const r = foldSegments([seg("my daughter", false)], 0);
    expect(r).toEqual({ finalized: "", interim: "my daughter", emittedCount: 0 });
  });

  it("emits a finalized phrase and advances the emitted count", () => {
    const r = foldSegments([seg("My daughter visits.", true)], 0);
    expect(r.finalized).toBe("My daughter visits.");
    expect(r.emittedCount).toBe(1);
    expect(r.interim).toBe("");
  });

  it("does not re-emit finals already counted, but still previews the trailing interim", () => {
    const segments = [seg("My daughter visits.", true), seg("every sunday", false)];
    const r = foldSegments(segments, 1);
    expect(r.finalized).toBe("");
    expect(r.interim).toBe("every sunday");
    expect(r.emittedCount).toBe(1);
  });

  it("emits a newly-finalized phrase once an interim promotes to final", () => {
    const segments = [seg("My daughter visits.", true), seg("Every Sunday.", true)];
    const r = foldSegments(segments, 1);
    expect(r.finalized).toBe("Every Sunday.");
    expect(r.emittedCount).toBe(2);
    expect(r.interim).toBe("");
  });

  it("joins multiple new finals in one event with single spaces", () => {
    const segments = [seg("One.", true), seg("Two.", true), seg("Three.", true)];
    const r = foldSegments(segments, 0);
    expect(r.finalized).toBe("One. Two. Three.");
    expect(r.emittedCount).toBe(3);
  });

  it("previews concatenated interim segments", () => {
    const segments = [seg("she keeps", false), seg("forgetting", false)];
    const r = foldSegments(segments, 0);
    expect(r.finalized).toBe("");
    expect(r.interim).toBe("she keeps forgetting");
  });
});
