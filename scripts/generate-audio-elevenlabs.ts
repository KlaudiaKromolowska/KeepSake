// Pre-generates the DEMO_MODE kiosk audio pack with ElevenLabs (warm, caring neural TTS) — the
// film/demo voice. Cloud sibling of generate-audio.ts (Piper): identical cues, slugs, and OUT_DIR,
// so speech.ts's createDemoAudioBackend picks the files up unchanged. The product DEFAULT stays
// on-device Web Speech (speech.ts) so real patient audio never leaves the machine — this cloud
// pass is ONLY for the fixed, no-PII demo/film lines (docs/tts-decision.md).
//
// Usage:  ELEVENLABS_API_KEY=... pnpm audio:generate:eleven
//   Optional ELEVENLABS_VOICE_ID=<id> pins a voice; otherwise a warm premade voice is auto-picked.
// The API key is read from the environment only — never written to disk, never logged.
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUDIO_LINES,
  type AudioCue,
  type AudioLineKey,
  buildCue,
  type SpokenTarget,
} from "@/lib/audio/lines";

const API_KEY = process.env.ELEVENLABS_API_KEY;
// Highest-quality premade multilingual model — one-time generation, so quality over cost.
const MODEL_ID = "eleven_multilingual_v2";
// Calm, gentle delivery for an elderly listener: high stability for an even read, light style.
const VOICE_SETTINGS = {
  stability: 0.55,
  similarity_boost: 0.75,
  style: 0.25,
  use_speaker_boost: true,
};
// Preference order of warm/caring voices for an elderly listener — matched on the FIRST word of
// the account's voice name (names carry descriptors, e.g. "Sarah - Mature, Reassuring, Confident").
// Reassuring + clear first; first one present on the account wins.
const PREFERRED_VOICES = ["Sarah", "Alice", "Lily", "Bella", "Matilda", "Jessica", "Grace"];

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "apps", "web", "public", "audio");

// Keep in sync with scripts/generate-audio.ts + scripts/seed.ts (the demo persona's targets).
const DEMO_TARGETS: SpokenTarget[] = [
  { question: "What is your granddaughter's name?", answer: "Lena" },
  { question: "Where did you grow up?", answer: "Kraków" },
  { question: "What is your daughter's name?", answer: "Ewa" },
];

/** Every cue this demo needs, deduped by slug — static lines collapse across targets. */
function allCues(): AudioCue[] {
  const bySlug = new Map<string, AudioCue>();
  for (const target of DEMO_TARGETS) {
    for (const key of Object.keys(AUDIO_LINES) as AudioLineKey[]) {
      const cue = buildCue(key, target);
      bySlug.set(cue.slug, cue);
    }
  }
  return [...bySlug.values()];
}

async function listVoices(): Promise<Map<string, string>> {
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": API_KEY as string },
  });
  if (!res.ok) throw new Error(`voices list failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { voices: { voice_id: string; name: string }[] };
  return new Map(data.voices.map((v) => [v.name, v.voice_id]));
}

async function pickVoice(): Promise<{ id: string; name: string }> {
  const pinned = process.env.ELEVENLABS_VOICE_ID;
  if (pinned) return { id: pinned, name: "(pinned)" };
  const voices = await listVoices();
  // Match on the first word of the account's voice name ("Sarah - Mature, Reassuring…" → "Sarah").
  for (const pref of PREFERRED_VOICES) {
    for (const [name, id] of voices) {
      if (name.split(/[\s-]/)[0] === pref) return { id, name };
    }
  }
  const first = [...voices.entries()][0];
  if (!first) throw new Error("no voices available on this account");
  return { id: first[1], name: first[0] };
}

async function synth(voiceId: string, text: string): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY as string,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
  });
  if (!res.ok) throw new Error(`tts failed (${res.status}): ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error(
      "generate-audio-elevenlabs: ELEVENLABS_API_KEY is required (env only — never commit it).",
    );
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const voice = await pickVoice();
  console.error(`Voice: ${voice.name} (${voice.id.slice(0, 6)}…) · model ${MODEL_ID}`);

  const cues = allCues();
  for (const cue of cues) {
    const mp3 = await synth(voice.id, cue.text);
    const mp3Path = join(OUT_DIR, `${cue.slug}.mp3`);
    writeFileSync(mp3Path, mp3);
    const bytes = statSync(mp3Path).size;
    if (bytes === 0) throw new Error(`${cue.slug}.mp3 is empty (0 bytes)`);
    const preview = cue.text.length > 46 ? `${cue.text.slice(0, 46)}…` : cue.text;
    console.error(`  ✓ ${cue.slug}.mp3 (${bytes} B) — "${preview}"`);
  }
  console.error(`Done — ${cues.length} clips → apps/web/public/audio`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
