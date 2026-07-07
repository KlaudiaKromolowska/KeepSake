# TTS voice strategy (TASKS.md 2.6)

| | Decision |
|---|---|
| Product default | Browser Web Speech API (`SpeechSynthesis`) |
| Demo pre-gen | `edge-tts` (Microsoft neural voices, free, no key) |
| Demo fallback | OpenAI `tts-1` API (~$0.01 total, pay-as-you-go) |
| Generate-by | Day 3 |
| Owner | solo dev |

## 1. Product default: Web Speech API

Use `window.speechSynthesis` — zero cost, zero setup, works offline, no patient data
leaves the device. Accept the quality variance for MVP; this is in-session narration,
not the demo reel.

**Voice selection heuristic** (run once, cache the pick):
```js
const voices = speechSynthesis.getVoices();
const preferred = [
  "Google US English",              // Chrome/Android — good prosody
  "Microsoft Aria Online (Natural)", // Edge/Windows — best available, neural
  "Samantha",                        // Safari/macOS default, decent
];
const voice =
  preferred.map(name => voices.find(v => v.name === name)).find(Boolean)
  ?? voices.find(v => v.lang === "en-US") // best-effort fallback
  ?? voices[0];
```
`getVoices()` is async on first call in Chrome — call it after the `voiceschanged`
event fires, not synchronously on mount.

**Rate/pitch for an elderly listener:** `rate: 0.9`, `pitch: 1.0`. Slower than default
(1.0) reads as calmer, not patronizing; don't drop below 0.85 (turns choppy).

**Why accept the variability in-product:** Web Speech quality is entirely OS/browser-
dependent (excellent on Chrome desktop, robotic-but-usable on some Android/Firefox
combos) and there's no free way to normalize it client-side without a network call per
utterance — which would send target phrases to a third party on every session. Not
worth it for MVP; revisit with a paid TTS API in V1 if caregiver feedback flags it.

## 2. Demo pre-gen: options compared

| Option | Cost | Quality | Verdict |
|---|---|---|---|
| **edge-tts** | Free, no key | Neural (same engine as Edge "Aria Natural") | **Primary** |
| OpenAI `tts-1` | $15/1M chars → ~$0.01 for 15 lines | Very natural, several voices | **Fallback** |
| ElevenLabs free tier | Free, 10k chars/mo | Best-in-class warmth | Rejected: free tier forbids commercial use, and output is capped at 2,500 chars/request — fine for volume here, but the license risk isn't worth it for a demo we may reuse post-hackathon |
| Google Cloud TTS free tier | Free (WaveNet: 1M chars/mo trial credit) | Good, less warm than ElevenLabs | Viable backup, skipped — no reason to add a third vendor/key when edge-tts is free and simpler |
| Record a human voice | Free | Best, but "robotic" is the risk we're managing, not "not-human" | Skipped: time cost (recording/editing ~15 lines, multiple takes) not worth it vs. edge-tts's quality |

**Verified:** `edge-tts` (github.com/rany2/edge-tts) is active, free, requires no API
key or Microsoft account — it calls the same backend as Edge's "Read Aloud" feature.
Verified OpenAI `tts-1` pricing ($15/1M chars) and ElevenLabs free-tier terms (10k
chars/mo, non-commercial, 2,500-char request cap) via current vendor docs, July 2026.

**Generation workflow (primary):**
```bash
pip install edge-tts
edge-tts --voice en-US-AriaNeural --rate=-10% \
  --text "The answer is Lena. Say it with me: Lena." \
  --write-media apps/web/public/audio/correction-lena.mp3
```
Repeat per line (~15 lines: recall prompts, the correction line, 2-3 encouragement
variants). `en-US-AvaNeural` is a warmer alternate voice if Aria reads too flat for a
given line — audition both, pick per-line if needed. `--rate=-10%` matches the 0.9x
product default for consistency between live and pre-gen audio.

## 3. Integration sketch

- Pre-gen files live at `apps/web/public/audio/<slug>.mp3`, one file per canned line,
  named by content not session (`correction-lena.mp3`, not `session3-line2.mp3`).
- An `AUDIO_LINES` map (slug → text) is the single source of truth; both the
  `DEMO_MODE` player and the Web Speech fallback read from it, so no line is ever
  hand-duplicated.
- `DEMO_MODE=true` makes the audio-orchestration layer play the matching
  `public/audio/*.mp3` file via `<audio>` instead of calling `speechSynthesis.speak()`;
  same call site, same trigger events, only the playback backend swaps.
- Audio is entirely an orchestration-layer concern (React component / hook) that
  reacts to SR engine state transitions — `packages/core` never imports Audio/Speech
  APIs and stays a pure reducer with an injected clock, per the existing rule.
