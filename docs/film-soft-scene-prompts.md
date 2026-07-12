# KeepSake film — AI soft-scene prompt kit (ElevenCreative / Veo · Kling)

Ready-to-paste prompts for the **AI-generated soft scenes**. The app/product beats are captured
from the real app (`pnpm film:capture` → `film-captures/`), so those are **not** here. Pair these
with `docs/film-script.md` (shot list + timecodes) and its **Production & visual style** section.

## What's AI-video vs. editor
- **AI-video (below):** the human/kitchen beats — HOOK, THE PROBLEM, THE STRAIN, THE CLOSE — and,
  optionally, the neuroscience motion-graphic.
- **Editor motion-graphics (NOT AI-video — AI garbles text/logos):** the KEY-MOVE transition into
  the kiosk, the CREDIBILITY cards, the `n=1 → n=1000` slide, and **every lower-third / caption**.
  Build these as clean overlays in the editor and keep all on-screen text there.

## House style — append to every human-scene prompt
> *Warm, cinematic, high-key natural window light, shallow depth of field, soft film grain, muted
> warm palette (amber/cream), gentle steady handheld, 35mm look, tender and dignified, unhurried,
> photoreal. 16:9. No text, no captions, no logos, no on-screen UI, no watermark.*

## Consistency (the one thing to get right)
The mother + daughter appear in **THE STRAIN** and **THE CLOSE** — AI video won't match faces across
separate generations by default. Do this:
1. In ElevenCreative, **generate two reference stills first** — "Marta" and "the daughter" (prompts
   below) — lock the ones you like.
2. Use **image-to-video** from those stills for the STRAIN and CLOSE shots so the faces carry.
3. Keep the **same kitchen, wardrobe, and light** wording across both beats.
4. Where possible, favor **hands / over-the-shoulder / profile** framing — it hides face drift and
   reads more intimate anyway.
**Dignity note:** portray early dementia with warmth and full personhood — never a vacant or frail
stereotype. She is a whole person having a good moment.

### Reference stills (generate first)
- **Marta:** *Portrait of a gentle woman around 78, soft grey-white hair, kind lived-in face with
  warm eyes, wearing a soft cardigan, seated in a warm domestic kitchen, natural window light,
  photoreal, dignified. No text.*
- **Daughter:** *Portrait of a warm woman around 50, tired-but-loving expression, casual soft
  sweater, same warm kitchen, natural window light, photoreal. No text.*

---

## Shot prompts

### HOOK — 0:00–0:12 (2 clips, objects only)
**A1 (~6s):** *Extreme close-up: a vintage mechanical stopwatch ticking on a worn wooden kitchen
table beside a small stack of hand-written index cards. Soft early-morning light through a window.
Slow, almost imperceptible push-in. Quiet and intimate. Shallow depth of field, no people.* + house
style.

**A2 (~6s):** *Close-up of hand-written index cards resting on the table (handwriting soft and
out-of-focus, not legible); a gentle older hand sets the stopwatch down beside them and withdraws.
Warm morning light, shallow focus, tender.* + house style. *(Keep handwriting blurred — AI can't
render clean text.)*

### THE PROBLEM — 0:12–0:24 (1 clip)
**B1 (~8s):** *Slow cinematic push-in across a small stack of aged index cards on a kitchen table; a
mechanical stopwatch beside them winds down and is set aside, abandoned. The light cools a touch.
Quietly melancholic but still warm, film grain, shallow depth of field, no people.* + house style.

### THE STRAIN — 0:24–0:40 (image-to-video from the reference stills)
**C1 (~8s):** *A warm domestic kitchen. An elderly woman (~78, soft grey hair, cardigan) and her
adult daughter (~50) sit close at the table. The daughter holds a small index card and hesitates —
she looks at her mother with quiet love and reluctance, not wanting to test her. Soft natural window
light, intimate over-the-shoulder framing favoring the daughter's face and hands. Tender, real,
unhurried, no dialogue.* + house style.

**C2 (~6s, optional):** *Close-up: the elderly mother's face, gently searching, a flicker of
uncertainty; her daughter's hand reaches across and holds hers on the table. Warm light, shallow
focus, dignified.* + house style.

### THE CLOSE — 2:46–3:00 (image-to-video, the payoff — match STRAIN)
**D1 (~8s):** *The same warm kitchen, later, golden light. The elderly mother looks down at a small
framed photograph in her hands and softly speaks — a genuine, quiet smile of recognition breaks
across her face. Beside her, the daughter smiles back with relief and love, eyes bright. Intimate,
shallow depth of field, deeply tender.* + house style.

**D2 (~5s):** *Two-shot from the side: mother and daughter at the kitchen table, heads close, a quiet
shared moment of warmth as the light softly fades. Golden, hopeful, gentle.* + house style.

### NEUROSCIENCE — 0:40–0:58 (prefer editor; AI option)
Best built in the editor for precise interval labels. If generating: *Elegant abstract motion
graphic on a warm cream background: a soft glowing horizontal timeline; a gentle point of light is
recalled at expanding intervals, each success stretching the next gap wider; on a miss it springs
back one step. Minimal, calm, premium, warm palette, no text.* (Add the `15s → 30s → 1m → 2m` labels
as editor overlays.)

---

## Music — Suno / Udio prompt
> *Warm, minimal, cinematic score for a tender healthcare film. Soft solo piano over gentle warm
> pads, a subtle hopeful pulse that lifts slightly through the middle, then resolves to quiet
> warmth. Instrumental, unhurried, lots of space for silence, no heavy drums. ~3 minutes.*

## Practical tips
- Generate **2–3 variations per shot** and pick the best; regenerate faces that drift.
- Most models cap at ~5–10s — the ~14s beats are **two stitched clips** (already split above).
- Render 16:9, then **upscale to 4K** in ElevenCreative; keep the warm grade consistent with the
  real-app footage in the final edit.
- Sync to the **351-word VO** (`docs/film-script.md`) and honor the scripted **3–4s silences** on the
  correction and on "Lena."
