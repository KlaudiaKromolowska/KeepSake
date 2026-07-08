// Verifies the pre-generated Piper mp3 pack (scripts/generate-audio.ts) actually lines up with
// what buildCue would ask the DEMO_MODE backend to fetch (speech.ts's
// `/audio/<slug>.mp3`) — the check called for by the audio-pack PR when running the full
// authenticated kiosk flow isn't practical in CI (no seeded Supabase stack / browser). This is
// the "small unit test instead" fallback: it can't confirm the file *plays*, but it does confirm
// every slug buildCue can produce for the demo targets resolves to a real, non-empty file.
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUDIO_LINES, type AudioLineKey, buildCue, type SpokenTarget } from "./lines";

const AUDIO_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "public",
  "audio",
);

// Mirrors scripts/generate-audio.ts's DEMO_TARGETS (Lena on main; Kraków/Ewa from the
// v2-multi-target branch's multi-target seed) — keep both lists in sync.
const DEMO_TARGETS: SpokenTarget[] = [
  { question: "What is your granddaughter's name?", answer: "Lena" },
  { question: "Where did you grow up?", answer: "Kraków" },
  { question: "What is your daughter's name?", answer: "Ewa" },
];

describe("pre-generated audio pack", () => {
  const keys = Object.keys(AUDIO_LINES) as AudioLineKey[];
  const slugs = new Set<string>();
  for (const target of DEMO_TARGETS) {
    for (const key of keys) slugs.add(buildCue(key, target).slug);
  }

  it("generated at least one cue per demo target and per static line", () => {
    // 4 target-embedded keys x 3 targets + 5 static keys, deduped = 17.
    expect(slugs.size).toBe(17);
  });

  for (const slug of slugs) {
    it(`/audio/${slug}.mp3 exists and is non-empty`, () => {
      const path = join(AUDIO_DIR, `${slug}.mp3`);
      expect(existsSync(path), `${path} is missing — run \`pnpm audio:generate\``).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(0);
    });
  }
});
