import { describe, expect, it } from "vitest";
import { SESSION_COPY } from "@/lib/session/copy";
import {
  AUDIO_LINES,
  type AudioLineKey,
  buildCue,
  lineText,
  type SpokenTarget,
  slugify,
} from "./lines";

const TARGET: SpokenTarget = { question: "Where do you keep your keys?", answer: "Lena" };

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Lena")).toBe("lena");
    expect(slugify("The Blue Bowl")).toBe("the-blue-bowl");
  });

  it("collapses punctuation runs and trims edge dashes", () => {
    expect(slugify("  Grandma's  house! ")).toBe("grandma-s-house");
  });

  it("falls back to 'target' when nothing slug-safe remains", () => {
    expect(slugify("")).toBe("target");
    expect(slugify("!!!")).toBe("target");
  });
});

describe("buildCue", () => {
  it("suffixes target-embedding lines with the answer slug (mp3 named by content)", () => {
    expect(buildCue("correction", TARGET).slug).toBe("correction-lena");
    expect(buildCue("teach", TARGET).slug).toBe("teach-lena");
    expect(buildCue("probe", TARGET).slug).toBe("probe-lena");
    expect(buildCue("end-on-win", TARGET).slug).toBe("end-on-win-lena");
  });

  it("keeps static line slugs as their key", () => {
    expect(buildCue("encourage-1", TARGET).slug).toBe("encourage-1");
    expect(buildCue("session-end", TARGET).slug).toBe("session-end");
  });

  it("probe speaks exactly the question", () => {
    expect(buildCue("probe", TARGET).text).toBe(TARGET.question);
  });

  it("correction is the errorless line: answer given, then repeated for say-it-with-me", () => {
    const { text } = buildCue("correction", TARGET);
    expect(text).toContain("The answer is Lena.");
    expect(text).toContain("Say it with me: Lena.");
  });

  it("correction reassurance matches the on-screen copy verbatim", () => {
    expect(buildCue("correction", TARGET).text).toContain(SESSION_COPY.correction.reassurance);
  });

  it("session-end matches the on-screen close line verbatim", () => {
    expect(buildCue("session-end", TARGET).text).toBe(SESSION_COPY.ended.closeLine);
  });

  it("mastered close includes the mastered line and the close line", () => {
    const { text } = buildCue("session-end-mastered", TARGET);
    expect(text).toContain(SESSION_COPY.ended.masteredLine);
    expect(text).toContain(SESSION_COPY.ended.closeLine);
  });
});

describe("AUDIO_LINES", () => {
  const keys = Object.keys(AUDIO_LINES) as AudioLineKey[];

  it("every line renders non-empty text", () => {
    for (const key of keys) {
      expect(lineText(key, TARGET).trim().length, key).toBeGreaterThan(0);
    }
  });

  it("no line uses deficit wording (wellness-safe copy rule)", () => {
    for (const key of keys) {
      expect(lineText(key, TARGET).toLowerCase(), key).not.toMatch(/wrong|fail|error/);
    }
  });

  it("has three distinct encouragement variants", () => {
    const texts = new Set(
      (["encourage-1", "encourage-2", "encourage-3"] as const).map((k) => lineText(k, TARGET)),
    );
    expect(texts.size).toBe(3);
  });
});
