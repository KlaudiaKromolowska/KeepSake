// Generates the film's full voiceover narration from the shot list (docs/film-script.md) via the
// ElevenLabs API — one warm clip per spoken beat → ./film-captures/narration/. Same voice as the
// demo audio pack (Sarah — mature, reassuring). The self-critique beat is silent, so it's omitted.
//
// Usage:  ELEVENLABS_API_KEY=... pnpm film:narration
// The key is read from the environment only — never written to disk or logged.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API_KEY = process.env.ELEVENLABS_API_KEY;
const MODEL_ID = "eleven_multilingual_v2";
// Warm narrator read: even and calm, a touch of expressive style, forward and clear.
const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.3,
  use_speaker_boost: true,
};
const PREFERRED_VOICES = ["Sarah", "Alice", "Lily", "Matilda"];
const OUT_DIR = join(process.cwd(), "film-captures", "narration");

// The spoken narration, in shot-list order (docs/film-script.md). Silent beats are omitted.
const LINES: { name: string; text: string }[] = [
  {
    name: "01-hook",
    text: "This is how we help someone with dementia relearn their granddaughter's name. A stopwatch. A stack of cards. And someone who loves them.",
  },
  {
    name: "02-problem",
    text: "It's called Spaced Retrieval, and it has worked since the nineteen-nineties. But its biggest questions are still open — because the practice happens at home, and the data dies on paper.",
  },
  {
    name: "03-strain",
    text: "And there's a harder problem. When family delivers it, they become the tester, the corrector — every miss a small wound to the relationship. The best trial we have failed here: not on the science, on the strain.",
  },
  {
    name: "04-neuroscience",
    text: "The neuroscience is elegant. Recall a fact at widening intervals and it rides procedural memory — the system dementia spares longest. Miss it, and you're given the answer at once, gently, then try again. Errorless. No struggling, no failure.",
  },
  {
    name: "05-keymove",
    text: "So we made one decision everything hangs on. The device is the therapist. The family is the companion. The screen corrects — never the daughter.",
  },
  {
    name: "06-demo-probe",
    text: "This is Marta, practising her granddaughter's name. Every target is paired with a picture — in dementia, an image makes a memory far easier to hold.",
  },
  {
    name: "07-demo-miss",
    text: "She misses. And this is the moment that matters. The device gives the answer — warm, immediate — and her daughter never has to be the one to correct her mother.",
  },
  {
    name: "08-demo-distractor",
    text: "In between, Claude suggests something to talk about — so the wait becomes connection, not a test. Then she remembers. And every session is built to end on a win.",
  },
  {
    name: "09-jawdrop",
    text: "Now watch what her session just became. We ask a research question over her real logs — and Claude runs the analysis itself, showing every step. At one patient, this tunes her practice. At a thousand, this exact schema answers questions the field has argued over for twenty years. Every install becomes a study site.",
  },
  {
    name: "10-credibility",
    text: "We didn't ship our first idea. Claude Code ran the literature review that overturned it — twice. And mid-build, a practitioner-trainer organisation that teaches this method validated the protocol we'd designed.",
  },
  {
    name: "11-close",
    text: "The caregiver never touched a stopwatch, never corrected her mother, never saw a red X. And the field finally gets its data.",
  },
];

async function pickVoice(): Promise<{ id: string; name: string }> {
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": API_KEY as string },
  });
  if (!res.ok) throw new Error(`voices list failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { voices: { voice_id: string; name: string }[] };
  const byFirst = new Map(data.voices.map((v) => [v.name.split(/[\s-]/)[0], v.voice_id]));
  for (const pref of PREFERRED_VOICES) {
    const id = byFirst.get(pref);
    if (id) return { id, name: pref };
  }
  const first = data.voices[0];
  if (!first) throw new Error("no voices available");
  return { id: first.voice_id, name: first.name };
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
      "generate-narration: ELEVENLABS_API_KEY is required (env only — never commit it).",
    );
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const voice = await pickVoice();
  console.error(`Voice: ${voice.name} · ${LINES.length} narration beats → ${OUT_DIR}`);
  for (const line of LINES) {
    const mp3 = await synth(voice.id, line.text);
    writeFileSync(join(OUT_DIR, `${line.name}.mp3`), mp3);
    console.error(`  ✓ ${line.name}.mp3`);
  }
  console.error("Done.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
