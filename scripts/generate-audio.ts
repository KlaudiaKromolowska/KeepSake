// Pre-generates the DEMO_MODE kiosk audio pack with Piper TTS (local, free, neural) — replaces the
// robotic Web Speech fallback that plays when `apps/web/public/audio/*.mp3` is missing
// (speech.ts's createDemoAudioBackend). Every line comes from the real AUDIO_LINES/buildCue in
// lines.ts — nothing here duplicates spoken copy.
//
// Usage: `pnpm audio:generate` (repo root). Regeneration is one command: re-run it any time
// lines.ts or DEMO_TARGETS below changes — every file is rebuilt from scratch, so there's nothing
// to invalidate by hand.
//
// Requires (installed to your environment, never the repo):
//   1. Piper CLI  — `pip install piper-tts` (adds a `piper` console script to PATH).
//   2. Voice model — `python -m piper.download_voices --download-dir <dir> en_US-lessac-high`
//      (or set PIPER_VOICE_DIR to wherever you already keep Piper voices).
//   3. ffmpeg on PATH — converts Piper's WAV output to mp3.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUDIO_LINES,
  type AudioCue,
  type AudioLineKey,
  buildCue,
  type SpokenTarget,
} from "@/lib/audio/lines";

const require = createRequire(import.meta.url);

// Swap the voice by changing this one line (fall back to "en_US-lessac-medium" or
// "en_US-amy-medium" if en_US-lessac-high has download trouble — docs/tts-decision.md).
const PIPER_VOICE = "en_US-lessac-high";
const VOICE_DIR = process.env.PIPER_VOICE_DIR ?? join(homeDir(), ".cache", "piper-voices");
const VOICE_MODEL_PATH = join(VOICE_DIR, `${PIPER_VOICE}.onnx`);

// Matches the product's Web Speech rate (speech.ts: `u.rate = 0.9`) — slightly slow reads as
// calmer, not patronizing, for an elderly listener.
const LENGTH_SCALE = "1.1";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "apps", "web", "public", "audio");

// Demo targets spoken by the kiosk — keep in sync with scripts/seed.ts (Lena on main;
// Kraków/Ewa added by the v2-multi-target branch's multi-target seed). Only question/answer
// feed the audio; anything not listed here simply won't have pre-generated target-line cues and
// falls back to live Web Speech (speech.ts), so it's safe to add a target late.
const DEMO_TARGETS: SpokenTarget[] = [
  { question: "What is your granddaughter's name?", answer: "Lena" },
  { question: "Where did you grow up?", answer: "Kraków" },
  { question: "What is your daughter's name?", answer: "Ewa" },
];

function homeDir(): string {
  return process.env.USERPROFILE ?? process.env.HOME ?? tmpdir();
}

/** Every cue this demo needs, deduped by slug — static lines (encourage-*, session-end*) collapse
 *  across targets since buildCue gives them the same slug regardless of target. */
function allCues(): AudioCue[] {
  const byslug = new Map<string, AudioCue>();
  const keys = Object.keys(AUDIO_LINES) as AudioLineKey[];
  for (const target of DEMO_TARGETS) {
    for (const key of keys) {
      const cue = buildCue(key, target);
      byslug.set(cue.slug, cue);
    }
  }
  return [...byslug.values()];
}

function checkPiperInstalled(): void {
  const result = spawnSync("piper", ["--help"], { encoding: "utf-8" });
  if (result.error) {
    console.error(
      "generate-audio: `piper` not found on PATH. Install it with `pip install piper-tts` " +
        "(or grab the Windows binary release from github.com/rhasspy/piper/releases) and re-run.",
    );
    process.exit(1);
  }
}

function checkVoiceModel(): void {
  if (existsSync(VOICE_MODEL_PATH)) return;
  console.error(
    `generate-audio: voice model not found at ${VOICE_MODEL_PATH}.\n` +
      `Download it with:\n` +
      `  python -m piper.download_voices --download-dir "${VOICE_DIR}" ${PIPER_VOICE}\n` +
      "(or set PIPER_VOICE_DIR to a directory that already has it — huggingface rhasspy/piper-voices).",
  );
  process.exit(1);
}

/** Resolves the ffmpeg binary: PATH first, then the optional `ffmpeg-static` devDependency if a
 *  project ever adds it for an environment without a system ffmpeg. */
function resolveFfmpeg(): string {
  if (!spawnSync("ffmpeg", ["-version"]).error) return "ffmpeg";
  try {
    // Optional: only present if a future environment needs it (see script header + PR body).
    const ffmpegStatic = require("ffmpeg-static") as string;
    if (ffmpegStatic) return ffmpegStatic;
  } catch {
    // fall through to the error below
  }
  console.error(
    "generate-audio: `ffmpeg` not found on PATH and `ffmpeg-static` isn't installed. Install " +
      "ffmpeg (e.g. via your OS package manager) or run `pnpm add -Dw ffmpeg-static`.",
  );
  process.exit(1);
}

function synthWav(text: string, wavPath: string): void {
  const result = spawnSync(
    "piper",
    ["-m", VOICE_MODEL_PATH, "--length-scale", LENGTH_SCALE, "-f", wavPath],
    { input: text, encoding: "utf-8" },
  );
  if (result.status !== 0) {
    throw new Error(`piper synth failed (exit ${result.status}): ${result.stderr}`);
  }
}

function convertToMp3(ffmpegBin: string, wavPath: string, mp3Path: string): void {
  const result = spawnSync(ffmpegBin, [
    "-y",
    "-loglevel",
    "error",
    "-i",
    wavPath,
    "-ac",
    "1",
    "-b:a",
    "64k",
    mp3Path,
  ]);
  if (result.status !== 0) {
    throw new Error(`ffmpeg convert failed (exit ${result.status}): ${result.stderr?.toString()}`);
  }
}

/** Flags (warns, doesn't fail) an implausible file — zero bytes always fails; wildly out of
 *  proportion to the line length just gets a warning since Piper's per-line timing varies with
 *  punctuation and pacing. ~700 bytes/char is the expected order of magnitude at 64kbps/~11 cps. */
function sanityCheck(slug: string, text: string, mp3Path: string): void {
  const bytes = statSync(mp3Path).size;
  if (bytes === 0) throw new Error(`${slug}.mp3 is empty (0 bytes)`);
  const expected = text.length * 700;
  if (bytes < expected * 0.25 || bytes > expected * 4) {
    console.error(
      `generate-audio: WARNING ${slug}.mp3 is ${bytes}B for ${text.length} chars — ` +
        "check it sounds right (docs/tts-decision.md).",
    );
  }
}

function main(): void {
  checkPiperInstalled();
  checkVoiceModel();
  const ffmpegBin = resolveFfmpeg();
  mkdirSync(OUT_DIR, { recursive: true });

  const cues = allCues();
  const workDir = mkdtempSync(join(tmpdir(), "keepsake-audio-"));
  try {
    for (const cue of cues) {
      const wavPath = join(workDir, `${cue.slug}.wav`);
      const mp3Path = join(OUT_DIR, `${cue.slug}.mp3`);
      synthWav(cue.text, wavPath);
      convertToMp3(ffmpegBin, wavPath, mp3Path);
      sanityCheck(cue.slug, cue.text, mp3Path);
      console.error(`generate-audio: wrote ${cue.slug}.mp3 (${statSync(mp3Path).size}B)`);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  console.error(`generate-audio: done — ${cues.length} files in apps/web/public/audio/`);
}

main();
