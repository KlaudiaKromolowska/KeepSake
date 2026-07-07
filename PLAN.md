# Keepsake — a caregiver companion for shared memory practice

**Hackathon build plan · v4** · Builder track · Solo developer · Claude-powered
Engine under the hood: **Spaced Retrieval (SR)**, an evidence-based memory-practice protocol.
Positioning above the hood: a **caregiver-support & cognitive-engagement** tool — *not* a
medical device, *not* "dementia therapy" (see §10 for why that wording is deliberate and legally
load-bearing).

> **Tier map (per request):** **MVP** = MUST have, 7-day hackathon · **V1** = SHOULD have, ~30-day
> pilot-ready · **V2** = the dream, no timeline · **V3** = MIGHT/COULD have, pragmatic
> productization.

> **v3 rewrite (2026-07-07).** After a second, deeper research pass (6 parallel deep dives:
> manualized protocol, scheduler design, speech tech, regulatory, caregiver-delivery evidence,
> competitive landscape), the plan **changed its mind on five things**. The evidence corrected my
> own v2 — that's the point of doing this. Start with §1.

> **v4 engineering pass (2026-07-07, Day 1).** Third review pass (3 parallel agents: engineering
> best-practices · rubric/Claude-use maximization · red-team + delivery planning). The science
> held; the **spec and the week** needed hardening. What changed: §4 protocol edge cases pinned
> (`unclear` outcome semantics, MAX-interval ceiling, end-on-win reconciled with §6, session
> bounds/resume, first-session teach step); §5 got exact implementable numbers; new **§8b
> engineering practices** (pure-reducer engine, injected clock, `DEMO_SPEED` isolation, RLS
> testing, secrets hygiene, a11y specifics) and **§15b day-by-day schedule with pre-committed cut
> lines**; §1b gained four new Claude-use beats + a timestamped demo beat sheet; MVP re-cut for
> demo visibility (PL manual QA and booster/between-session **UI** demoted; engine logic stays
> tested). ⚠️ **Deadline reality: Jul 13 9PM ET = 03:00 Jul 14 in Poland (CEST)** — the working
> deadline is **Jul 13 afternoon local**.

---

## 1. What the research changed (read this first)

Each row is a v2 assumption the evidence overturned, with the source and the build consequence.

| v2 assumed | Evidence says | v3 does |
|---|---|---|
| Reuse FrançaisFlow's **FSRS** scheduler as the core engine | FSRS excludes sub-minute intervals from its own training, needs 100s of reviews to personalize (new patient has 0), and was fit on healthy motivated learners. The only RCT-validated dementia scheduler (USMART) is a **deterministic doubling/halving ladder**. | **Drop FSRS from the core.** Two bespoke mechanisms: a deterministic expanding ladder (within-session) + a simple monotone state machine (between-session). FSRS-style ML is demoted to a *V2 population-prior*. (§5) |
| **Interleave 1–3 targets** per session (the "interval-packing micro-problem") | Classic dementia SR trains **one target at a time, sequentially to mastery**. Interleaving appears only in *aphasia* work (Fridriksson 2005), and even there as N *independent* state machines, never a shared clock. | **Single-target MVP.** Multi-target (V1+) = N independent state machines time-multiplexed, not a shared ladder. (§4) |
| On a miss, use a **cueing hierarchy** (semantic→phonemic→…) as the centerpiece | Bourgeois et al. 2003 compared SR vs a cueing-hierarchy approach head-to-head — **SR won** on goals attained and maintenance. Classic SR correction = *immediately give the answer, patient repeats, revert interval* (errorless). | **Errorless immediate correction is the spine.** Cueing hierarchy becomes an *optional, experimental* enhancement for hard targets only. (§4) |
| Position as **"SRT therapy for early-stage dementia"** | EU MDR reads past marketing to *intended purpose*; a disease-targeted "therapy" plausibly = medical device (Class IIa once it has trend features). Live enforcement exists (SeniorLife FDA warning 2025; Lumosity FTC $2M). | **Wellness/caregiver-support positioning**, EU-first, never name dementia in claims, "show the data, never the diagnosis." (§10) |
| Sell it on **"protocol fidelity enforcement"** for the caregiver | The best analog RCT (iCST, n=356) was **null on patient cognition** and failed on **adherence** (22% did zero sessions), not fidelity. The tester/corrector dynamic **harms the relationship**. Evidence-backed gains were **caregiver-side** (relationship quality, caregiver QoL). | **Device is the therapist; caregiver is the companion.** Optimize for daily adherence + relationship, not just correct execution. Honest primary outcome = caregiver relationship/competence + item retention, *never* general memory improvement. (§6) |

Net effect: the **MVP got simpler to build** (single target, tap-only, deterministic ladder) while
the **positioning and pilot design got more sophisticated** (wellness-safe, adherence-first,
measure the unproven thesis).

---

## 🏆 1b. Winning strategy — designing to the judging rubric (Builder Track, aiming for 1st)

**Event:** *Built with Claude: Life Sciences* (Anthropic × Gladstone Institutes × Cerebral Valley).
**Track:** Builder — *"Build Beyond the Bench."* **Build window:** Jul 7–13 (submit **Jul 13, 9PM
ET**). **Async judging** Jul 14–15 → top 3/track → **live final Jul 16, 12PM ET.** **1st (Builder) =
$30k API credits.** Team ≤2. **Open-source required. New Work Only.** Deliverables: **3-min demo
video + public repo + 100–200-word summary.**

### The rubric (verbatim weights) → where to invest
| Criterion | Weight | The question | Our lever |
|---|---|---|---|
| **Demo** | **30%** | Working, compelling, holds up as real software, *cool to watch* | **Biggest lever.** Emotional, end-to-end, `DEMO_SPEED` time-compression. Engineer it from Day 1. |
| **Impact** | **25%** | Real-world potential; who benefits; fits the track problem statement | Named clinical user + huge underserved population + "advance the field" data angle |
| **Claude Use** | **25%** | Creative use of Claude Code; beyond basic; *surprised even us* | Claude as clinical reasoner + real-time coach + report writer + the multi-agent build itself |
| **Depth & Execution** | **20%** | Pushed past first idea; sound engineering; real craft, not a hack | The documented v1→v2→v3 research trail *is* the depth story |

### Reframe #0 (v4.1, the pitch inversion) — an instrument, not an app
**Lead with the field's problem, not the family's.** Old pitch: "a caregiver app with an
emotional story" (consumer health — off-brief for a life-sciences panel). New pitch:
**"a clinical-protocol instrument that generates the trial-level dataset spaced-retrieval
research has lacked for 20 years — deployed through the people already in the room: family
caregivers."** SRT's open questions (expanding vs uniform, errorless vs effortful, caregiver vs
clinician delivery) have stayed open since the 1990s because home practice data lives on index
cards and dies there. Keepsake makes every home session a structured, protocol-faithful trial
log. **Every install is a study site.** Marta/Lena stays in the film — demoted from thesis to
*proof the instrument is humane enough to deploy*. One extra slide-line: **the engine
generalizes** — any clinician-designed home protocol with scheduled probes + outcomes fits the
same reducer + logging spine; SRT is demo #1, not the ceiling.

### The jaw-drop beat (v4.1) — RCT-in-a-box, live, honest
Elevated from V1/V2-stretch to **MVP demo feature**: on camera, ask Claude a research-style
question over the dyad's real trial logs and watch it run the analysis — per-patient acquisition
rate, reset resilience, retention/decay estimate, optimal interval band, booster recommendation,
each with honest n=1 caveats — rendered as a mini study report. Then the one-two: *"At n=1 this
tunes one patient's protocol. At n=1000 this exact schema answers expanding-vs-uniform — a
question the field has argued about for twenty years."* **Honesty guardrail: never claim the n=1
analysis settles a field question** — the claim is the *instrument + schema at scale*, and the
live analysis proves the pipeline is real, not hypothetical. Cut-line insurance (§15b): if
behind schedule it degrades to a fixture generated once from the real logs and replayed — the
beat survives every schedule slip.

### Reframe #1 — name your user (Impact + track fit)
The Builder prompt: *"start from a user you can name — a scientist, a lab, a clinic, a biotech — and
build the tool they're missing: working software they could use without you in the room, built to
outlast the week."* → **Name a real speech-language pathologist / memory clinic.** Recruit and
interview one during the event (you already planned an SLP call — elevate it: this is your named
user, feature them on camera). The tool they're missing = **extend their manual SRT into the home
AND return the structured acquisition data they currently lose to paper.** "Without you in the room"
= the app enforces the protocol; "outlast the week" = the booster loop + logging keep working after.

### Reframe #2 — two deliberate framings (resolve the tension with §10)
- **Hackathon/demo framing (for judges):** scientific, disease-named, neuroscience-grounded,
  impact-forward. **Name dementia, cite the evidence, show the clinical-data / "RCT-in-a-box" angle**
  — this fits a life-sciences hackathon and the Gladstone *"advance the field"* award. You are
  presenting a *research prototype to judges*, not marketing a product to consumers, so naming the
  disease is a **strength**, not the §10 regulatory risk. Only avoid *unsubstantiated efficacy
  claims* ("this treats/slows dementia").
- **Commercial framing (post-hackathon):** the §10 wellness positioning for EU MDR. Keep the two
  separate — don't let §10's caution mute the demo's ambition, and don't let the demo's disease-
  naming leak into future marketing copy.

### ⚠️ Compliance flag — "New Work Only" vs FrançaisFlow reuse (decide Day 0)
Rule: *"All projects must be started from scratch during the hackathon with no previous work."*
Copy-pasting substantial FrançaisFlow modules is a **disqualification risk**. Safe vs not:
- ✅ Safe: architecture/patterns/knowledge in your head; `create-next-app` boilerplate; open-source
  libraries (`fastest-levenshtein`, next-intl, supabase-js…).
- ❌ Risky: pasting bespoke prior-project source files as your own new work.
→ **Rebuild Keepsake fresh.** The SR engine is net-new anyway; grade-answer/string-utils are tiny
(rewrite or use OSS); the skeleton is standard scaffolding, not "previous work." **Revise §7 from
"transplant organs" to "reference architecture, written fresh."** This also *scores better* on Depth
& Execution (genuinely built, not assembled). If unsure, ask a moderator in #questions Day 0.

### Claude Use (25%) — go far beyond "we call the API to fill a card"
Build and *show in the video* Claude doing genuinely non-obvious clinical work:
1. **Messy caregiver voice-memo → full clinical target spec** — Claude produces canonical question
   phrasing, accepted variants, cueing, etiology-format rec, and a **red-flag safety split** of
   multi-part/emotionally-loaded targets. Clinical reasoning, not templating.
2. **Real-time session coach** — contextual, warm caregiver scripts + exact errorless-correction
   wording, per target, in the caregiver's language.
3. **Trial logs → clinician-grade narrative + structured acquisition summary** — the data that dies
   on paper, generated automatically.
4. **Etiology-aware protocol adaptation reasoning** (AD small-error / vascular long-window / Lewy
   recognition-format).
5. **Self-critique loop, made visible** — Claude checks its own generated target against the SR
   fidelity checklist *before* the caregiver ever sees it. **Show the rejected draft + the reason
   on screen** ("this combined two facts — splitting into two targets"). Visible self-correction is
   a memorable, non-obvious beat — elevate it from plumbing to a demo moment.
6. **Meta / the build itself** — Keepsake was designed via **Claude Code multi-agent research**: ~10
   parallel research agents ran the clinical-literature review that overturned FSRS and the cueing
   hierarchy (this very plan). *"Claude Code didn't just write the app — it did the neuroscience
   review that reshaped it."* This is the **"surprised even us"** angle; put the research trail in
   the repo and a beat of it in the video.
7. **Vision dual-coding QA (v4 add — highest-ROI new idea).** Claude analyzes the caregiver's
   chosen photo for picture-superiority suitability: is the grandchild's face clear, single-subject,
   distractor-free? Rejects a cluttered group shot, suggests the crop. One native vision call, thin
   to build, lands hard on camera. (Photo *upload* stays V1; the demo uses one seeded photo + one
   live vision call.)
8. **Extended thinking, shown transparently (v4 add).** Stream Claude's visible reasoning on the
   etiology call (#4) on screen — "Lewy body → free recall will frustrate → recommend
   recognition-format probe." Turns invisible clinical reasoning into a demo visual.
9. **Personalized distractor-activity generator (v4 add — MVP-cheap, high charm).** During interval
   gaps Claude suggests dyad-specific filler conversation ("ask her about the garden") — clinically
   required (prevents rehearsal) *and* creates connection. Directly serves the
   caregiver-as-companion arc.
10. **"RCT-in-a-box" canned close (v4 add).** One hardcoded-question analysis path over the trial
    logs ("did expanding intervals beat uniform for this dyad?") as the demo's Gladstone
    "advance-the-field" closing beat. Full agentic version stays V1/V2.

**Hero-beat ranking (weight the video toward these):** #1 safety-split, #5 visible self-critique,
#7 vision QA, #6 build story, #4/#8 etiology reasoning. #2 (coach scripts) and #3 (report) alone
read as "we called the API" — #3 earns its place as the *Impact* payload, #2 framed as
fidelity-enforcement (bug-in-ear for a lay caregiver), never "nice words."
**Correctness note:** Claude has no native audio input — "voice memo → target" is a pipeline
(browser STT/Whisper → text → Claude). Say "voice memo" in the demo; build transcribe-then-reason.
**Craft signals for the repo:** prompt-cache the long SR-protocol system prompt across all calls;
a README **Claude-usage map** (which model does what: Sonnet target-gen + reports, Haiku grading,
extended-thinking etiology, vision QA, cached protocol prompt) — judges scoring 25% will look for
exactly this table.

### Depth & Execution (20%) — the research trail is the proof
*"Did they push past their first idea?"* — you have a documented **v1→v2→v3 where evidence forced
you to drop FSRS and the cueing hierarchy.** Show it (a "what we changed and why" slide). Craft
signals to surface: the Brush & Camp candidacy screen, **fsrs.ts-level test coverage on the SR state
machine**, etiology tuning, three-state speech design, GDPR/dual-consent rigor. This is where a week
of real wrestling shows.

### Demo (30%) — the single biggest lever; engineer it from Day 1
- 3 min, **working end-to-end**, time-compressed — but see the `DEMO_SPEED` profile below.
- **Emotional arc with a real target:** a grandchild's name + photo. The most moving demo in a
  life-sciences hackathon is a person relearning their granddaughter's name across expanding
  intervals — lean into it (with a fictional/consented persona, not real patient data).
- **Killer close:** *"The caregiver never touched a stopwatch, never had to correct their mother, and
  never saw a red X — and the clinician gets data they've never had before."*
- **Trust signals** (judges ask "does it hold up / findings you trust"): show the repo, the passing
  tests, the named SLP on camera, the honesty about what's proven vs a pilot question.

**Beat sheet (3:00, v4.1 science-forward arc) — Show = on screen, Narrate = VO (production: §16):**
- **0:00–0:20 the field's problem (cold open — no product, no family yet).** Show: a stopwatch,
  index cards, a 1990s citation. Narrate: "Spaced retrieval works — it's been helping people with
  dementia relearn what matters since the 90s. But its biggest questions are still open, because
  the practice happens at home… and the data dies on paper."
- **0:20–0:40 the instrument claim + named user.** SLP cameo/card: "I can't be in their kitchen
  every day — and I never see what happens there." Narrate: "Keepsake turns every home practice
  session into a protocol-faithful, clinical-grade trial log — delivered by the person who was
  already going to be there: family."
- **0:40–1:05 Claude clinical reasoning (#1 + #5 + #7).** Messy caregiver description → generated
  target; Claude **rejects its own draft** ("two facts in one target — splitting"); Claude
  **rejects the photo** ("group shot — face unclear; crop to this"). Narrate: "Claude isn't
  filling a template — it's doing the clinician's reasoning, and checking its own work."
- **1:05–1:50 the session — Marta & Lena (the humane-deployment proof).** Kiosk UI, expanding
  intervals 15s→30s→1m, distractor prompts. **Deliberate miss → the device delivers the errorless
  correction (Marta reads the answer off the screen, not off her daughter's face) → interval drops
  back → later success.** Minimal VO; let it breathe. One line: "No stopwatch. No red X. Her
  daughter never has to correct her."
- **1:50–2:35 THE JAW-DROP — RCT-in-a-box, live.** Type a research question over the real trial
  logs ("What's Marta's acquisition rate, and is her retention decaying between sessions?") →
  Claude runs the analysis on screen → mini study report: acquisition curve, reset resilience,
  optimal interval band, booster recommendation, n=1 caveats stated. Then the extrapolation
  slide: *"At n=1 this tunes one patient's protocol. At n=1000 this exact schema answers
  expanding-vs-uniform — open since the 1990s. **Every install is a study site.**"* + one line:
  "and the engine generalizes to any clinician-designed home protocol."
- **2:35–2:50 "what we changed" (#6).** v1→v2→v3 slide (dropped FSRS, dropped the cueing
  hierarchy — a head-to-head trial told us to). "Claude Code ran the literature review that
  overturned our own design — twice."
- **2:50–3:00 close.** Marta says "Lena." *"The caregiver never touched a stopwatch, never had to
  correct her mother, never saw a red X — and the field gets data it has never had."*
- *(Etiology depth (#4/#8) moves from the film to the README/appendix + live-final Q&A — the
  jaw-drop needed its 45 seconds. If a take runs short, it returns as a 10s insert after 1:50.)*

**Demo-engineering rules (v4, from the red-team):**
- **`DEMO_SPEED` is a scripted compression profile, not a flat 60×.** At flat 60× a 15s interval
  is 250ms — the distractor phase disappears and the loop reads as a glitch/fake. Run the first
  15s interval **real**, show a visible interval clock, and accelerate (or jump-cut) only
  intervals >60s. Design this into the session runner from Day 2, not the video edit.
- **TTS: never let a robotic voice narrate the money shot.** Browser Web Speech varies wildly by
  OS/browser. Pre-generate the demo's few spoken lines as audio files (or record on a machine with
  a verified neural voice, e.g. Edge); live browser TTS stays the *product* default. Decide Day 2,
  test Day 3.
- **Canned-replay Claude fixtures for the recording** — record real wizard/vision/debrief outputs
  once, replay during takes so no take depends on a live API round-trip. Genuinely
  model-generated, pre-seeded inputs so the beats land every take — never faked.
- **Scratch take Day 5 PM (mandatory), real recording Day 6, Day 7 pickups only.** Pacing/TTS/
  compression problems are only visible on tape.

### Submission checklist (deadline Jul 13 9PM ET = **03:00 Jul 14 CEST — submit Jul 13 afternoon local**)
- [ ] 3-min video (YouTube/Loom), **captioned** — emotional arc + Claude-use beat + "what we
  changed" beat + on-camera "fictional persona / not a medical device" disclaimer
- [ ] Public repo, OSI license (MIT — file exists), README: problem · **named user** · **Claude-usage
  map table** · architecture · **clone→env→seed→run in 5 min** (verified from a clean clone) ·
  research trail · honest limitations · tests badge
- [ ] **Skimmable research-trail artifact** (`docs/research-trail.md` or README section) — judges
  won't read a 600-line PLAN.md; make v1→v2→v3 scannable in 30s. Plus `docs/dataset-spec.md` +
  example CSV (the "RCT-in-a-box" schema as a visible Gladstone artifact).
- [ ] **Deployed prod URL matches the video build** (judges may click) · no secrets anywhere in git
  history · AI routes auth-gated + rate-limited (public repo + your API key = credit-drain vector)
- [ ] 100–200-word summary — impact + Claude use forward (draft Day 6, not deadline night)
- [ ] Separate 3-min cut + live-runnable demo path (seeded data, canned-Claude toggle) ready for
  the **live final (Jul 16, 12PM ET = 18:00 CEST)**
- [ ] Day 1: confirm submission-portal mechanics + check rules for AI-disclosure requirements; ask
  the moderator the "New Work Only" scaffolding question in #questions

### Honest odds
This is a biomedical hackathon leaning bench-research (Gladstone; example projects are lab-notebook
/ trial-matcher tools). A clinical/caregiver tool is slightly off the modal example — **counter it**
by foregrounding the clinician-named-user, the structured-data/"advance-the-field" angle (Gladstone
award fit), and the neuroscience depth you already have. An emotionally powerful working demo +
documented research rigor + creative Claude use is a credible 1st-place Builder profile. Aim for 1st;
the floor is still a strong entry.

---

## 2. Problem & the honest thesis

**Spaced Retrieval (SR)** is an evidence-based memory-practice technique (Camp 1989; Brush & Camp
1998; ANCDS/ASHA-recognized, **Class II/III / moderate-quality** evidence, unchanged in 20 years).
A person relearns *functional* information — a grandchild's name, "my walker is by the door", a
swallowing strategy — by recalling it at **expanding time intervals**, with **immediate correction**
on a miss. It rides procedural/implicit memory, which stays relatively intact into moderate
dementia.

**Today it's delivered manually** by a clinician with a stopwatch and index cards, ~1–2 sessions a
week. It should run daily at home — but a lay caregiver can't reliably hold the interval and
correction rules, *and* the clinical protocol itself says caregivers should only be brought in
**after a clinician establishes the pattern**. Substituting software for that clinician-bootstrap is
the core bet.

**The honest thesis (with its own caveats built in):**
- SR reliably improves recall of the **specific trained item**. It does **not** generalize to other
  memory and it **decays** within weeks–months without boosters. So the *booster loop is the core
  product*, not an add-on, and we never promise "better memory."
- **Caregiver-delivered SR at home is near-evidence-free** (single case studies; no RCT; one
  real-world hand-off to care staff *failed on sustainability*). This is the weakest link in the
  whole plan — so the pilot is designed to *test it*, not assume it (§13).
- The defensible, evidence-aligned win is **caregiver-side**: a structured, low-friction shared
  activity that can improve the caregiver's sense of competence and the dyad's relationship, while
  the patient reliably re-learns a handful of items that matter to them.

---

## 3. Scientific & clinical foundation

Sourced from two research passes (2019–2026 priority). Confidence flagged; contested points said
plainly. **Rule: the deterministic engine owns protocol; the science tunes parameters; nothing is
marketed as "clinically proven."**

### 3.1 Which memory survives, and the honest uncertainty
- Procedural/implicit learning is broadly spared into moderate-to-severe AD (De Wit 2020 meta,
  N=670, g≈0.09). *But not uniformly* — cerebellar eyeblink conditioning is impaired; the spared
  system depends on the circuit. → **prefer verbal/semantic/contextual cues over motor-sequence
  cues.** *Moderate.*
- **SR's mechanism is genuinely unresolved** (Oren 2014 flags it). Working hypothesis (*inference,
  not citable*): SR draws on residual hippocampal binding early (MCI/mild AD) *plus* implicit
  conditioning that dominates as the disease progresses — which explains both why retrieval-attempt
  SR beats pure errorless learning early, and why it still works late.

### 3.2 Retrieval attempts vs errorless — reconciled
The v2 confusion, fixed: **the retrieval attempt IS the expanding-interval probe** (the patient
tries to recall at 15s, 30s, 1m…). That effortful attempt is what the testing-effect neuroscience
rewards (Haslam 2011: SR > errorless learning; striatal–prefrontal–hippocampal retrieval network).
The **correction on a miss** is a *separate* step, and there the evidence favors **immediate
errorless correction** (give answer → patient repeats) over a graded cueing hierarchy (Bourgeois
2003: SR beat cueing hierarchy). So: *let them attempt at each interval; on a miss, correct
immediately and errorlessly.* Errorless correction is also protocol-*safer* for a frail population,
and immediate (not delayed) correction is grounded in the reconsolidation window (Wimber 2020).

### 3.3 Etiology tunes the protocol (V1+)
| Etiology | Profile | Tuning |
|---|---|---|
| **Alzheimer's** | storage failure; procedural spared | keep error increments **small** (eNeuro 2024: early AD loses learning from *large* errors); gentle expansion |
| **Vascular** | retrieval/executive bottleneck; delayed recall often *better* than AD (Sokolovič 2023) | **longer response windows** (slow processing); invest in cue *structure* |
| **Parkinson's / DLB** | **recognition ≫ free recall**; DLB forgets faster (Filoteo 2009); basal ganglia is the disease's own target | prefer **recognition-format** probes; motor cues **not** free; tighter early intervals |

*Moderate; no head-to-head cross-etiology SR trial exists.* → V1 ships an etiology field setting
cue-modality + interval defaults.

### 3.4 Evidence-graded enhancement menu
1. **Dual-coding: pair every target with an image** — picture-superiority is *amplified* in dementia
   (PMC3483366). Cheap, strong. → MVP/V1.
2. **Personally-meaningful targets** — self-reference effect preserved in MCI/early AD (may fade in
   advanced AD). → MVP (it's the premise).
3. **Immediate errorless correction on SR** — additive over SR alone in an 8-week RCT (PMC4616083).
   → MVP.
4. **Morning-biased scheduling** (avoid midday; MCI morning working-memory advantage). Low-risk
   default, not a proven lever. → V1.
5. **Sleep-adjacent** pre-sleep re-test + next-morning check — mechanistically motivated,
   extrapolated (no dementia RCT). → V1/V2, flagged experimental.
6. **Music-cued recall** — sung > spoken in AD; spared melodic memory. → V2.
7. **Do NOT** build nap nudges (lengthening/morning naps are a *progression marker*) or **tDCS**
   (modest, dosage-unsettled, needs hardware). → out.

### 3.5 Digital signals — what the data can *honestly* say
Learning-curve/forgetting-rate features are the best-evidenced signal we collect for free (Jutten
2022 ties diminished practice-effects to amyloid/tau; Oravecz 2025). RT *variability* > mean RT
(Welhaf 2025; modest r≈.20). But confounds are severe (motor slowing, depression, meds, sleep,
device) and **no home signal has passed clinical validation**. → surface **within-person, self-
referenced trends only**, framed "discuss with your doctor," never "detect/diagnose." See §10 for
why this is also the regulatory red line.

---

## 4. The protocol we implement (exact spec)

Grounded in the manualized SR literature (Brush & Camp 1998; Benigas & Bourgeois; Tactus clinical
guide; USMART RCT). **Single-target, sequential-to-mastery. Errorless correction. No cueing
hierarchy in the core.**

### 4.1 Candidacy screen (Brush & Camp) — run once per target before training
Fixed order **0s → 15s → 30s**; up to 3 attempts per level; errorless correction after every
screening miss (same as training). **Level passed on first success → advance; all 3 attempts missed
at any level → not a candidate** (re-scope the target with the caregiver — never silent-fail).
Screening trials are logged to `trials` with `is_screening = true` (they're data too). This is a
real feature and a good "we respect the clinical protocol" signal. *(v4: pass/advance rules,
correction-during-screening, and logging were unspecified — now pinned as test cases.)*

### 4.2 Single-target session state machine (v4: edge cases pinned — encode ALL of this as tests)
```
BASE_INTERVAL = 15s ; MAX_INTERVAL = 16min ; GROWTH = ×2 ; reset = last successful rung
BASE_MISSES_TO_END = 2        # §6 end-on-win rule — consecutive, reset on any success
BAD_SESSIONS_TO_RESCOPE = 3   # abandonment threshold — config, not code (§4.4: unresolved)
UNCLEAR_CAP = 2               # consecutive unclears on one probe → treat as confirmed miss
SESSION_SOFT_CAP = ~20min     # or caregiver ends session — always closable, state serializes

startSession(target):                     # session-start 0-delay probe = the mastery datapoint
  if session_n == 1:
    teach(target)                         # show answer, patient repeats at 0s — errorless bootstrap
  else:
    if probe(target) == recall: target.start_streak += 1
    else:                       target.start_streak = 0
    # mastery = 3 consecutive session-starts on DISTINCT calendar days (patient timezone);
    # skipped days do NOT break the streak — count sessions, not days (§6: no guilt resets)
    if target.start_streak >= 3: target.mastered = true → maintenance + boosters; return
  interval = target.last_success or BASE_INTERVAL
  trialLoop(target)

trialLoop(target):
  base_misses = 0 ; unclear_run = 0
  while withinSessionBounds():
    fillWithDistractorActivity(interval)  # conversation/task — prevents working-memory rehearsal
    outcome = probe(target)               # caregiver tap: recall | miss | unclear
    if outcome == unclear:                # NO correction, NO ladder movement, NO base_misses
      unclear_run += 1
      if unclear_run >= UNCLEAR_CAP: outcome = miss   # fall through to confirmed miss
      else: continue                      # re-probe at the SAME interval
    unclear_run = 0
    if outcome == recall:
      base_misses = 0
      target.last_success = interval
      if interval >= MAX_INTERVAL:        # success ceiling: within-session work is DONE
        handoffToBetweenSession(target); return       # §5 scheduler takes over
      interval = min(interval * GROWTH, MAX_INTERVAL)
    else:                                 # confirmed miss → ERRORLESS CORRECTION (immediate)
      showCorrectAnswer(); patientRepeats()           # DEVICE delivers this, not the caregiver
      interval = target.last_success or BASE_INTERVAL # revert one rung, never to zero
      if interval <= BASE_INTERVAL:
        base_misses += 1
        if base_misses >= BASE_MISSES_TO_END:
          endOnWin(target)                # guaranteed 0s success — never end a session on failure
          target.bad_sessions += 1
          if target.bad_sessions >= BAD_SESSIONS_TO_RESCOPE:
            pause(target); promptCaregiver("re-scope this target")   # never silent retire
          return
  endOnWin(target) if lastOutcomeWasMiss  # sessions always close on a success
```
- **`unclear` semantics (was the plan's biggest hole):** the MVP's *primary input* is a three-state
  tap, but v3's machine only branched correct/else — an "I couldn't tell" wrongly triggered
  correction + revert. Now: unclear = re-probe at the same interval, no correction, no ladder
  movement, no abandonment counting; two consecutive unclears = treat as a miss.
- **Mastery** = correct at session-start on **3 consecutive sessions on distinct calendar days**
  (patient timezone) → maintenance + **periodic boosters** (decay is real; §2). Distinct-days rule
  makes mastery ungameable (3 back-to-back "sessions" in 10 minutes must not master a target).
- **Reset rule** = revert to last-successful interval (≡ halving under ×2). Not a full reset.
- **Interrupted sessions** (doorbell, agitation): trials are the source of truth; a session is
  resumable same-day at the last-success rung, otherwise discarded gracefully — **no penalty**.
- **End-on-win reconciled:** v3 had §6 saying 2-consecutive-base-misses→end-on-win while §4.2 had a
  *cumulative* `base_fails>=3`→break with no closing success. Now one rule: consecutive counter,
  reset on success, threshold 2 (config), always exit via a guaranteed 0s success.
- **Distractor activity** = filler conversation / an unrelated task in the gap (Claude-personalized
  to the dyad, §1b #9), so a correct recall reflects real retrieval, not rote holding.

### 4.3 Multi-target (V1+): N independent state machines, min-heap by due-time
Never a shared ladder. Each target keeps its own interval / last-success / streak. Default cap 1–2
active targets, hard cap 3.

### 4.4 Target construction rules (enforced in code + Claude wizard)
Single exact question, **identical phrasing every time**; concrete, functional, **stable** answer
within working-memory span; verbal or motor-behavioral. Avoid yes/no (*reasonable UX guardrail, not
a sourced rule — don't hard-fail on it*). Red-flag check splits multi-part/too-long/emotionally-
loaded targets.

*Genuinely unresolved in the literature (expose as configurable, don't hard-code a "validated"
number): exact starting interval (15s is modal, not universal), in-treatment abandonment threshold,
session-end rule, session frequency. A validated fidelity checklist likely exists only inside the
paywalled Benigas/Brush/Elliott manual — **acquire it before the pilot.**

---

## 5. Scheduler architecture — bespoke, not FSRS

**Conclusion from the deep dive: don't reuse FSRS/DSR as the core.** Its power comes from large-
sample, day-scale, healthy-learner data — none of which describes a new dementia patient with a
handful of targets at sub-minute-to-day intervals. FSRS's own authors excluded short-term reviews
from training; no published dementia-SR system uses an FSRS-like fitted model; USMART (the only
transparent, RCT-validated one) uses a deterministic ladder.

**Two mechanisms, two timescales (neuroscience says they're distinct processes — working-memory/
rapid binding vs overnight consolidation):**
1. **Within-session (s→~20min):** the §4.2 deterministic ×2 ladder with reset-to-last-success.
   Zero data needed, self-calibrating from trial 1, RCT-validated in this exact population.
2. **Between-session (days):** a simple monotone per-item state machine — transparent, hand-set,
   no fitting. **v4: pinned implementable defaults (all named config constants, not code):** first
   gap = **1 day** after the within-session ceiling is reached → session-start probe; success →
   gap **×1.5** (cap **14 days** pre-mastery); failure → gap **÷2** (floor 1 day) **+ the item
   returns to within-session re-training**. After mastery: booster cadence **1wk → 2wk → 1mo →
   3mo**; a booster miss drops one cadence step and re-opens within-session training. (v3's
   "+50–100%" range was not implementable; these numbers exist so `scheduler.test.ts` can be
   written Day 1 — they are defaults to tune, not claims.)
3. **Where ML earns its place (V2, not before):** a **population prior** — once dozens of patients ×
   weeks of logs exist, learn default expansion/reset behavior stratified by severity, and let each
   patient's own trials perturb it. This is where the FrançaisFlow FSRS *optimizer* machinery can be
   repurposed — as a prior, not a cold-start engine.

*Uncertainty flagged: no head-to-head trial compares an ML scheduler vs the deterministic ladder in
dementia; "ladder is better, not just simpler" is reasoned from the cold-start mismatch, not proven.
Braintrust markets an "ML forgetting-curve" but never disclosed the model — don't design against an
unverifiable competitor claim.*

---

## 6. Design principles the research forced

1. **The device is the therapist; the caregiver is the companion.** The app delivers the recall
   prompt *and the correction* (the patient reads the answer from the screen, not from their
   spouse's face). This directly defuses the documented **tester/corrector** dynamic that damages
   the relationship, and it moves fidelity off the caregiver. The caregiver's job is presence,
   warmth, and the outcome tap — not being a stopwatch or a examiner.
2. **Optimize for adherence, not just correct execution.** iCST failed because caregivers stopped
   showing up (22% zero sessions), *not* because they couldn't learn it. → sub-2-minute setup, one
   low-friction daily trigger, **graceful missed-day handling (no guilt-inducing streak resets)**,
   and **visible small wins** independent of whether the disease is objectively improving (it often
   won't).
3. **Never surface raw in-the-moment pass/fail to the caregiver in a way that invites pushing
   harder.** Debrief trends *privately, later* — decouple "noticing the error" from "reacting to it
   at your parent."
4. **Always end on a win.** Two consecutive lowest-rung misses → end on a guaranteed success (0s
   recall), shorten tomorrow. Protect dignity and mood; track patient affect around sessions as the
   key safety signal.
5. **Recognition over recall in the UI itself** (users are memory-impaired): big targets, gradual
   onboarding, no sudden interface changes — documented abandonment drivers.
6. **Show the data, never the diagnosis** (§10). The software never interprets a trend as decline.
7. **Booster loop is the product.** Because SR decays, maintenance/boosters are core, not polish.

---

## 7. Reference architecture from FrançaisFlow (revised — FSRS demoted; write fresh)

> **Hackathon constraint (§1b):** "New Work Only." Treat this table as **reference architecture and
> learned patterns to re-implement fresh**, *not* files to copy. The genuinely reusable value is the
> *knowledge* (what works, what the Supabase gotchas are, how the SR/recognition UI should feel) —
> which is not "previous work." Rebuild the code during the event.

The real reusable value is the **patterns, gotchas, and UI feel**, not the scheduler.

| Asset | Path | Reuse |
|---|---|---|
| Monorepo scaffold (Next 16, TS strict, Tailwind, Vitest, Sentry, Pino) | repo root | copy, delete French modules |
| Server-action pattern (`requireUser()`→`createClient()`→`{data}\|{error}`) | `src/lib/*/actions.ts` | all mutations |
| Supabase RLS + admin dual-client | `src/lib/supabase/server.ts` | caregiver-owns-patient RLS |
| `srs_state` + review-log schema | migrations, `src/lib/srs/review-log.ts` | template for `trial`/`target_state` |
| **Multiple-choice / recognition exercise UI** | conjugation practice components | **recognition-format probes for Lewy/PD (§3.3) — already built** |
| Answer grading + Levenshtein/phonetic | `packages/core/src/utils/grade-answer.ts`, `string-utils.ts` | fuzzy answer match (§9) |
| Image auto-suggest (Pexels) + `next/image` conventions | `flashcards/actions.ts` | **dual-coding images (§3.4 #1)** |
| Session recording, heatmap, streaks | `src/lib/dashboard/actions.ts` | adherence tracking (framed for caregivers, no dopamine) |
| Dashboard loader (`Promise.all` single action) | `loadFlashcardDashboard()` | caregiver dashboard |
| TTS pipeline + browser Web Speech | `scripts/generate-tts.ts`; conjugation | spoken prompts (browser TTS MVP, pre-gen V1) |
| next-intl EN/PL, ICU plurals | `src/messages/*` | bilingual day one (PL caregiver market is the real early user) |
| Middleware chain, auth, onboarding | `src/middleware.ts`, `(auth)/` | copy wholesale |
| UI kit | `src/components/ui/` | copy, restyle for accessibility (§6 #5) |
| **FSRS engine + optimizer** | `packages/core/src/srs/*`, `optimizer.ts` | **NOT the core scheduler** — optimizer → V2 population-prior only |
| AI action pattern (structured JSON, retry, rate limits) | `flashcards/actions.ts`, `api/extension/enrich` | swap Gemini → **Claude** (`sonnet` generation, `haiku` grading) |
| Billing (Lemon Squeezy MoR) | billing module | dormant → V3 caregiver-pay/B2B2C |

**Decision (v4 — wording fixed; the old "transplant" verbs contradicted New Work Only in a
history-inspectable public repo):** fresh repo scaffolded via `create-next-app` — **no `degit`, no
FF files, no FF git history**. Utils (grade-answer/string-utils) re-implemented clean or replaced
with OSS (`fastest-levenshtein`). Supabase/middleware/auth/ui rebuilt from the patterns in your
head. Build `packages/core/src/sr/` clean. New Supabase project, **EU region**. If any doubt, ask
a moderator in #questions Day 1.

---

## 8. Architecture & data model

```
keepsake/
├── apps/web/  (Next.js 16 App Router)
│   └── src/app/[locale]/(app)/{dashboard, targets, session, review}/
├── packages/core/src/
│   ├── sr/  ★ pure-TS, TDD'd like fsrs.ts
│   │   ├── candidacy.ts      # Brush&Camp screen
│   │   ├── ladder.ts         # within-session ×2 / reset-to-last-success
│   │   ├── session.ts        # single-target state machine (§4.2)
│   │   ├── scheduler.ts      # between-session monotone state machine (§5)
│   │   └── etiology.ts       # cue-modality + interval defaults (§3.3)
│   └── utils/                # grade-answer, string-utils (re-implemented fresh / OSS — §7)
```
```sql
patients     (id, caregiver_id→auth.users, display_name, notes, timezone text NOT NULL,
              is_demo bool DEFAULT false,
              etiology enum: alzheimers|vascular|lewy|parkinsons|mixed|unspecified)
targets      (id, patient_id, question, answer, image_url, accepted_variants jsonb,
              answer_format: free_recall|recognition, candidacy: passed|failed|unscreened,
              status: draft|active|mastered|maintenance|paused|retired)
sessions     (id, patient_id, started_at, ended_at, summary jsonb, patient_affect_pre/post
              smallint CHECK 1..5)
trials       (id, session_id, target_id, interval_sec, outcome: recall|miss|unclear,
              is_screening bool DEFAULT false, latency_ms, corrected bool, time_of_day, created_at)
target_state (target_id PK, last_success_interval, start_streak, bad_sessions, mastered_at,
              next_due_at, between_session_gap_hours, booster_step)
consent      (patient_id UNIQUE, patient_consent bool, caregiver_role_ack bool, granted_at,
              withdrawn_at)   -- MVP: SEEDED for the fictional demo persona, no consent UI (V1)
audit_log    (append-only: consent grant/withdraw + data-access events; NO Article-9 payload)
```
**v4 schema rules:**
- `status`/`outcome`/`candidacy` = **`text` + CHECK constraint, not native Postgres enums** — these
  will churn during the week and `ALTER TYPE` friction is real. Native enum only for stable
  `etiology`.
- `patients.timezone` is **required**: mastery's distinct-days rule, morning bias, and
  `next_due_at` are all computed in *patient-local* time. Never carry the FF `setUTCHours` pattern
  — that gotcha **is** a bug here.
- `created_at`/`updated_at` on every table + `moddatetime` trigger. **Index every FK** (Postgres
  doesn't auto-index them) plus `targets(patient_id,status)`, `trials(target_id,created_at)`,
  `sessions(patient_id,started_at)`, `target_state(next_due_at)`.
- **Hard delete + `ON DELETE CASCADE`, no soft-delete columns** — GDPR erasure (§10) forbids
  retained Article-9 payloads; the separate `audit_log` keeps Art. 30/32 evidence without them.
- **RLS on ALL tables**, not just `patients` — `sessions/trials/target_state/consent` have no
  `caregiver_id` and each needs a policy joining ownership up through `patients`. Forgetting one =
  cross-tenant read of Article-9 data. Ship an explicit **cross-tenant denial test** Day 1.
- All schema via **versioned migration files in-repo** (`supabase/migrations/`), never dashboard
  clicks; generate TS types from the DB. Remaining FF gotchas still apply (1000-row truncation,
  orphan cleanup on delete, `.in()` chunked ≤500). EU region + Supabase DPA (§10).

## 8b. Engineering practices (v4 — the build discipline the plan was missing)

**Engine correctness (P0, Day 1 — the single most important build decision):**
- `packages/core/src/sr/` contains **zero `Date.now()`/`setTimeout`**. Model `session.ts` as a
  **pure reducer `(state, event) → state`** where events carry an injected timestamp; a `Clock`
  interface (`now()`) is passed into anything that needs time. Fake timers then wrap only the thin
  UI runtime; the engine tests are plain values at 100% coverage. Enforce with a lint rule/grep test.
- **`DEMO_SPEED` never touches stored data.** It scales only the wall-clock *wait* at the
  orchestration boundary (1/speed); the **real** `interval_sec` is what's persisted. If it leaks
  into logged intervals or `next_due_at`, every chart and the between-session scheduler is wrong.
- **Property-based tests (fast-check)** for ladder/state-machine invariants on top of TDD cases:
  interval ∈ [BASE, MAX]; reset never below last-success; mastery requires exactly 3 distinct-day
  session-starts; no illegal transitions; `unclear` never moves the ladder. Seed any RNG
  (distractor pick) for deterministic tests and demo takes.

**Repo & toolchain (P0):**
- pnpm workspaces, flat `apps/web` + `packages/core` (`workspace:*`). **Skip Turborepo** (solo,
  7 days). No build step for `core` — Next `transpilePackages` + Vitest read TS source directly.
  Pin Node (`.nvmrc`/`engines`).
- **Biome** (one tool = lint + format) over ESLint+Prettier. **lefthook** pre-commit = biome +
  `tsc --noEmit` on staged only; full test suite on **pre-push** (keep the commit loop fast).
- CI (P1): one GitHub Actions workflow — tsc + biome + vitest + `next build`. Tests badge in
  README (judge trust signal). No matrix, no E2E in CI, no deploy step (Vercel auto-deploys).

**Secrets & abuse (P0 — public repo from Day 1):**
- `.gitignore` `.env*` + commit `.env.example` **before the first commit**; enable GitHub **push
  protection + secret scanning** Day 0. `ANTHROPIC_API_KEY` + Supabase `service_role` are
  server-only, never `NEXT_PUBLIC_`.
- **Auth-gate + rate-limit every AI route.** Public repo + deployed URL + your API key = a
  credit-drain vector the moment the repo goes public.

**Claude API engineering (P1, Day 3–4):**
- **Tool-use with a forced tool + `input_schema`** for the wizard's JSON (never parse free text);
  strict zod validation + one retry; **fallback = caregiver hand-enters the target** — Claude
  failure must never block a session.
- **Prompt-cache** the static SR-protocol/fidelity system prompt (`cache_control`) across wizard +
  grading + debrief calls. **Stream** the debrief for perceived latency. Cap `max_tokens`. Pin
  exact model-id snapshot strings + SDK version (verify current IDs before shipping).
- **Prompts as versioned files** (`packages/core/prompts/*.ts`), not inline strings — enables the
  self-critique eval and clean diffs; they'll be public, which is fine.
- **Golden-set evals**: ~10 messy caregiver inputs → assert the generated target passes the
  code-side red-flag/length rules. Doubles as the §1b #5 demo beat. Cap prompt-tuning iterations
  to this fixed set (rabbit-hole insurance).
- **Prompt-injection surface**: caregiver free text flows into Claude; the Haiku grader must not
  be steerable into always-accept. Keep grading instructions server-side and validate outputs
  against the accepted-variants list in code.

**Accessibility (P1 — the users are memory-impaired and 60+ caregivers):**
- WCAG 2.2 AA floor, **AAA (7:1) contrast** for body text; base font **≥ 20–24px** on the kiosk;
  touch targets **≥ 60px** with generous spacing (recall/miss/unclear must be un-misfirable);
  honor `prefers-reduced-motion`; **no timeouts on caregiver UI actions** (protocol intervals are
  content timing, not UI timing — keep them distinct); no color-only signaling (aligns with §6
  "never a red X"); linear nav + persistent home; semantic HTML + focus management; one `axe` run
  + one keyboard/screen-reader pass.

**i18n (decided):** next-intl scaffold EN+PL from Day 0 (cheap; satisfies the bilingual
commitment) — but **demo language = EN; PL copy is machine-translated with manual/native QA
deferred to V1** (clinical-adjacent copy needs native review; judges never see PL; 1–2 days of
non-demo work). Test PL ICU plurals (one/few/many/other) once. Claude outputs (wizard/debrief/
coach) must be generated *in the caregiver's locale* — pass `locale` through to the API layer.
Verify `[locale]` middleware ordering vs Supabase auth cookies (known FF-chain footgun).

**Observability:** Pino minimal structured logging — yes. **Sentry — skip in week 1** (no users);
V1 when pilot dyads exist.

---

## 9. Speech architecture

**MVP = caregiver-tap-only. No ASR.** The population (elderly + frequent dysarthria) sits in the
worst-WER band for every ASR system (+10pt WER just for aging voice; far worse with motor-speech
involvement); Web Speech API is cloud-only, no SLA, and degrades exactly on this speaker profile;
and a **false negative (telling a correct, vulnerable patient they're wrong) is a protocol-integrity
failure**, not a neutral bug. Tap-only also yields a clean labeled dataset (caregiver present) to
tune ASR later.

**V1 speech (assist layer under caregiver override):**
1. **Constrained, not open** recognition — feed the ASR a per-trial phrase-hint list (accepted
   answer + variants + near-misses). This is the single biggest accuracy lever and what makes the
   <1.5s budget realistic.
2. **Fuzzy/phonetic match first, Haiku only on the ambiguous middle band** — Levenshtein/token-sort
   (validated r=0.94 vs human graders) resolves most cases in ms; reserve the ~0.7–1s Claude Haiku
   round-trip for paraphrase/near-miss residue.
3. **Three-state outcome: `correct` / `incorrect` / `unclear`.** Silence, "I don't know," cross-
   talk, low confidence → `unclear` → caregiver confirms. **Never auto-mark `incorrect`.**
4. **Asymmetric thresholds** biased to accept; caregiver override always one tap.
5. **On-device preferred** (iOS `SpeechAnalyzer` / local Whisper) for privacy; cloud STT with
   phrase-hints only as fallback behind explicit consent.

---

## 10. Regulatory & data positioning (not legal advice — get counsel before the pilot)

**EU MDR is the binding constraint** (stricter than US FDA; judges *intended purpose*, reads past
marketing). Design to the EU line and the US follows.

- **Positioning:** a **caregiver-support / cognitive-*engagement* companion.** Do **not** name
  dementia/Alzheimer's as the target condition in claims, store listings, or marketing. "For
  caregivers supporting a loved one's daily cognitive engagement."
- **Safe verbs:** support, engage, practice, exercise, track, log, review. **Never:** treat,
  diagnose, mitigate, cure, prevent, "slow decline," "improve memory," "detect."
- **The trend feature is the sharpest classification risk.** Ship it only as a transparent,
  self-explanatory log the human interprets — no condition named, no clinical thresholds, no
  "decline" wording. **Show the data, never the diagnosis.** (Interpreting the trend → diagnostic
  SaMD in the US, monitoring MDSW ≈ Class IIa in the EU.)
- **No efficacy claims** without evidence — the FTC substantiates independently of the FDA (Lumosity
  $2M). Market the *specific* benefit (retention of chosen items), never brain-wide/disease-modifying.
- **DTx/prescription path is commercially fragile** (Pear went bankrupt *with* FDA clearance —
  reimbursement, not validity, killed it). → **caregiver-pay / B2B2C (memory clinics, senior living,
  AAAs)** from day one; never bet on reimbursement.
- **Trigger points that force a regulated (SaMD/MDR) decision:** claiming therapeutic benefit for
  dementia; software interpreting/flagging decline; naming dementia as intended purpose; pursuing
  reimbursement/prescription; marketing to clinicians as a decision tool.

**GDPR (EU/Poland pilot) — non-optional before enrolling anyone:**
- Cognitive scores tied to a named patient = **Article 9 health data.** Legal basis = **explicit
  consent.**
- **Capacity/proxy consent is a genuine unresolved risk:** GDPR has no proxy consent for
  incapacitated adults; if the patient retains capacity (typical early-stage), **the patient must
  consent — the caregiver entering data isn't the consenting subject.** Build a **dual-consent flow**
  (`consent` table above) and get a Polish lawyer to sign off.
- **DPIA is effectively mandatory** (special-category data + vulnerable subjects + profiling).
- **Article 30 processing record required** even for a solo dev (the <250-employee exemption doesn't
  apply to special-category data). EU-region hosting + Supabase DPA/SCCs, Art. 32 security (RLS +
  encryption + audit log), retention limits + erasure, 72-hour breach process.

---

## 11. Competitive landscape & differentiation

**The white space is real and specific.** No product combines: (1) AI *generation* of personalized
functional targets, (2) real-time caregiver coaching + fidelity enforcement, (3) structured
clinical logging.

- **Closest analog: Braintrust Memory Companion** (Blank Slate) — AI-personalized *scheduling*, but
  content is **hand-authored**, patient-self-directed, **no** caregiver-coaching or clinician logging.
  Its n=61 JMIR pilot is the best dementia-SR-app evidence and validates the mechanics; its algorithm
  is undisclosed.
- **Tactus SRT** = a manual 3-target interval timer, $9.99, no AI/library/logging.
- **Constant Therapy** = generic adaptive drills, not real SR.
- **Everything else** = reminiscence (Rendever, TimeSlips, Memory Lane), daily-living support
  (MapHabit), or brain-games (CogniFit) — none do personalized-fact retrieval training.
- **AI companions** (ElliQ, Nova) = conversation, not a fidelity-controlled protocol. Note: **LLM
  sycophancy can reinforce dementia delusions** — a real safety constraint on any chat surface.
- The full "AI target-gen + real-time lay-coaching + logging" stack exists only in *self-directed*
  PT (Sword/Kaia) — **never for a caregiver delivering to a patient.**

**Don't rebuild:** interval-scheduling ML (adopt the known ladder), reminiscence/companionship
(Rendever/ElliQ own it), or a brain-games engine (the Lumosity trap). **Learn real-time coaching
mechanics from ABA/SLP bug-in-ear telehealth** (fidelity 38%→82–95%), not from dementia apps (which
haven't cracked it).

**The 3 genuine differentiators:** (1) AI-generated personalized functional targets from a short
caregiver interview; (2) automated real-time caregiver coaching + fidelity enforcement (proven in
ABA/SLP, **unproven in dementia → must be validated, not assumed**); (3) structured logging that
makes the intervention legible and is the foundation for honest, product-specific evidence.

---

## 12. Build tiers

### MVP — MUST have (7 days; v4 re-cut for demo visibility — bottom-up estimate was ~9–10.5
dev-days into 7, so the margin comes from these cuts, not from sleep)

**The never-cut demo chain (this IS the demo — §15b cut lines never touch it):** §4.2 session
runner with device-delivered errorless correction · the deliberate-miss → interval-drop beat ·
trial logging + acquisition chart · one Claude wizard call · one Claude debrief · **the
RCT-in-a-box beat (live if on schedule, fixture-replay if not — never absent)** · `DEMO_SPEED`
compression profile · wellness-safe EN copy.

**Full MVP list:** minimal caregiver auth (email magic link, single role; **demo path uses a
seeded, hardcoded caregiver — auth is not on the emotional-demo critical path**) + one patient
(etiology field + timezone + `is_demo`) · candidacy screen as a **tested engine function surfaced
as one pass/fail line** (not a polished multi-screen flow) · Claude **target wizard** (dual-coded
target + accepted variants + red-flag check + etiology-format rec + **visible self-critique**) ·
**vision dual-coding QA** on the seeded photo (§1b #7, thin) · **single-target session runner**
(§4.2 machine incl. `unclear` semantics, device-delivered errorless correction,
Claude-personalized distractor prompts, end-on-win, big calm kiosk UI, session persist/resume) ·
**caregiver-tap outcome** (three-state: recall/miss/unclear) · deterministic within-session ladder
+ between-session scheduler/boosters as **engine + tests only, no UI** (invisible in a
single-session demo; a static "next check-in: tomorrow" line suffices) · trial logging +
per-target acquisition chart · **RCT-in-a-box mini study report** (§1b v4.1: Claude analyzes the
dyad's real trial logs — acquisition rate, retention/decay, interval band, booster rec, honest
n=1 caveats; live on camera if on schedule, fixture-replay otherwise) · patient-affect two-tap
capture (pre/post) *if on schedule* · Claude
post-session **private** caregiver debrief (copyable, streamed) · browser TTS in-product +
**pre-generated audio for the demo's spoken lines** · next-intl scaffold EN+PL, **EN copy only
QA'd** (§8b) · **wellness-safe copy, no disease naming in-product, "not a medical device", crisis
footer** (video names dementia per the §1b research-prototype framing — don't let §10 mute it).
*Demo:* per the §1b beat sheet.
*Explicitly out:* ASR, multi-target, cueing hierarchy, photo **upload** (one seeded photo + vision
QA only), trends, clinician portal, billing, offline, consent UI (table seeded for the fictional
persona; stated on camera), PL manual QA, Sentry, between-session/booster UI, tDCS/nap nudges.

### V1 — SHOULD have (~30 days, pilot-ready)
V1 speech assist (§9) · pre-gen TTS voice · etiology-adaptive protocol (experimental) · dual-coding
photo upload (consent copy) · **relapse-prevention boosters** as a first-class loop · **self-
referenced trend view** ("discuss with your doctor", show-data-never-diagnosis) + confounder logging
· morning nudge · multi-patient + read-only clinician view + CSV export · Claude caregiver coaching
chat (boundaried; anti-sycophancy guardrails) · distress guardrails + patient-affect logging · email
reminders · **DPIA + dual-consent + counsel sign-off + EU hosting** · **pilot: 3–5 dyads** (§13).

### V2 — the dream (no timeline)
Claude phone-calls the patient for maintenance probes (recognition-format, landline-compatible) ·
ambient/smart-speaker context-cued probes (target fires where the memory is needed) · family
photo/video "memory capsules" as recall rewards · learning-dynamics as an honest passive signal
(the best-evidenced biomarker family, consent-gated, "discuss with your doctor") · per-etiology
validated protocols · **per-patient population-prior scheduler** (repurpose the FSRS optimizer as a
*prior*, §5) · **RCT-in-a-box** — the structured trial-level dataset the field lacks, able to settle
its own open questions (expanding-vs-uniform, errorless-vs-attempt, caregiver-vs-clinician) ·
regulated DTx path *only after* real clinical-validation tiers are reached · AR wayfinding ·
music-cued recall · caregiver-burnout copilot · whole-family consented memory archive (the reason
it's called Keepsake). *Every clinical/biomarker claim here is gated on validation we don't yet
have — V2's superpower is that it generates the exact data needed to earn those claims.*

### V3 — MIGHT/COULD (pragmatic productization)
Tablet kiosk + offline-first PWA (care-home Wi-Fi is bad; never lose a trial) · care-home multi-
tenant (first B2B revenue; Lemon Squeezy wakes) · smart-speaker maintenance probes · photo/video
capsules · honest learning-dynamics trend flags for clinicians · population-prior scheduler ·
research export + one university/SLP-department partnership (starts the evidence base) · DE/FR/ES
locales.

---

## 13. The pilot: what must be proven (the plan's weakest link, made explicit)

The caregiver-delivered + real-time-coaching thesis is the least-evidenced part. The V1 pilot (3–5
dyads, mild-to-moderate stage) is designed to *test* it, not showcase it. Measure:
- **Fidelity gap:** app-logged adherence to protocol vs a blinded clinician-rated audio/video sample
  — does app enforcement actually reach the fidelity a clinician bootstrap does? (untested anywhere)
- **Real adherence curve:** % of assigned sessions completed at wk 1/4/8/12 (beat iCST's ~22%
  zero-session dropout — that's the base rate, not 0%).
- **Caregiver burden** (Zarit) baseline/4/12wk, split by adherence tertile (iCST: benefit only in
  high-adherers).
- **Caregiver sense-of-competence** (hypothesized mediator between delivery and burden).
- **Relationship quality** pre/post (the one place iCST found real signal).
- **Patient affect** around sessions (the key dignity/harm safety signal — untracked in the SR
  literature).
- **Dropout interviews:** *why* they stopped — "saw no improvement" / "felt like testing them" /
  "too much daily burden" / "tech friction" (the named failure modes; you need to know which one
  actually bites).
- **Item retention** at 1wk / 1mo / 3mo with and without boosters (validate the booster loop).

---

## 14. Risks & edge cases

| Risk | Mitigation |
|---|---|
| Wrong engine (FSRS) baked in | Fixed §5: deterministic ladder + monotone between-session; FSRS→V2 prior |
| Wrong protocol (interleaved / cueing hierarchy) | Fixed §4: single-target, errorless immediate correction |
| Regulatory (disease-targeted "therapy" = device) | §10 wellness positioning, EU-first, no disease naming, show-data-never-diagnosis; counsel before pilot |
| Relationship harm (caregiver as tester) | §6 device-delivers-correction; private trend debrief; end-on-win; affect logging |
| Adherence collapse (the real killer) | §6 low-friction, visible wins, no guilt streaks; §13 measures it honestly |
| Overclaiming efficacy/biomarkers | §2/§10 item-specific gains only, self-referenced trends, "discuss with your doctor" |
| Speech false-negative harms patient | §9 MVP tap-only; V1 three-state + caregiver override + accept-bias |
| Claude generates a bad target | red-flag check + mandatory caregiver review + hard length limits in code |
| LLM sycophancy reinforces delusions (chat) | §11 boundaried coaching, never validate false beliefs, escalate-to-professional lines |
| GDPR capacity/proxy consent | §10 dual-consent flow + Polish counsel before enrolling |
| Demo timing (real intervals are minutes) | `DEMO_SPEED` compression *profile* from Day 2 (§1b — flat 60× reads as fake) |
| Scope creep week 1 | MVP "explicitly out" list is a contract; Day-2 engine-with-tests before UI; §15b cut lines pre-committed |
| **Engine perfectionism eats Days 1–3** | §4 edge decisions are made *in this plan*; tests encode them Day 1; no re-litigating mid-week |
| **Robotic TTS undercuts the emotional close** (Demo=30%) | Pre-generate demo audio lines; curate voice Day 2, test Day 3 (§1b) |
| **Deadline timezone trap** (9PM ET = 03:00 Jul 14 CEST) | Submit Jul 13 afternoon local; Day 7 = buffer only, no new features |
| **Public repo + deployed app drains API credits** | Auth-gate + rate-limit AI routes; push protection Day 0 (§8b) |
| **Named SLP falls through** (external dependency) | Outreach Day 1, backup contact, drop-dead decision Day 5; demo works without them (card + quote fallback) |
| **Claude wizard reliability rabbit-hole** | Forced tool-use + zod + one retry + hand-authored seed-target fallback; tuning capped to the golden set (§8b) |
| **"New Work Only" provenance challenge** | Fresh `create-next-app`, clean-room utils, no FF git history (§7); moderator question Day 1 |

---

## 15. First actions (Day 1 — today)
1. **Fresh `create-next-app`** (never `degit`/FF files — §7); pnpm workspace + `packages/core`;
   `.env.example` + `.gitignore` **before the first commit**; push protection + secret scanning on;
   MIT LICENSE; new Supabase project (**EU**); Vercel; deploy hello-world.
2. Write `packages/core/src/sr/candidacy.test.ts` + `ladder.test.ts` + `session.test.ts` +
   `scheduler.test.ts` **first** — encode §4/§5 as failing tests **including the v4 edge
   decisions** (`unclear` semantics, MAX ceiling, end-on-win, distinct-day mastery, resume,
   candidacy pass rules, pinned scheduler numbers). Engine = pure reducer + injected clock (§8b).
3. **Send SLP outreach today** (long lead; call by Day 4, drop-dead Day 5). Acquire the
   Benigas/Brush/Elliott *Spaced Retrieval Step by Step* manual (likely the only real fidelity
   checklist).
4. Draft wellness-safe copy + the honesty ledger (§2/§10) early — legally load-bearing, not polish.
5. Demo URL = free `keepsake-nu.vercel.app` (no domain purchase — free tiers as long as
   possible; buy a domain only if something forces it). `docs/demo-video.md` (script v0, §16.4)
   in the repo, updated daily. Confirm submission-portal mechanics + AI-disclosure rules; ask the
   "New Work Only" scaffolding question in #questions.

## 15b. Day-by-day schedule (Jul 7–13) + pre-committed cut lines

> **Task-level breakdown lives in [`TASKS.md`](./TASKS.md)** (phases 0–8, checkboxes, done-when
> criteria, cut-line tags) — that's the living execution board; this section is the calendar view.

Principles: **engine before UI · feature freeze Day 5 · record Day 6 · Day 7 buffer + early
submit** (deadline is 03:00 Jul 14 local — aim Jul 13 afternoon).

| Day | Focus | Gate / deliverable |
|---|---|---|
| **D1 Mon Jul 7** | §15 items 1–5: fresh scaffold, Supabase EU + schema v1 + RLS (+ cross-tenant denial test), Vercel deploy, secrets hygiene. PM: **failing SR tests encoding all §4/§5 decisions**. SLP outreach. Demo-script v0. | Deployed skeleton; the protocol exists as tests |
| **D2 Tue** | **Green the engine** (candidacy/ladder/session/scheduler/etiology, property tests, high coverage). `DEMO_SPEED` time-scale abstraction. Seed script (persona "Marta" + granddaughter "Lena" + photo). Curate/test TTS voice. | **Gate: engine green EOD or invoke cut line 1** |
| **D3 Wed** | Session kiosk UI: big-type probe, 3-state tap, device-delivered correction screen, distractor card, end-on-win, persist/resume; wire trials→Supabase. TTS decision. Demo-script v1. | **Gate: full scripted session runs in browser at demo speed** |
| **D4 Thu** | Claude day: target wizard (forced tool-use + zod + self-critique) + vision QA + debrief (streamed) + distractor generator. **Mid-week integration checkpoint.** SLP call ≤ today; fold feedback into defaults/copy. Demo-script v2. | **Gate: wizard→session→debrief end-to-end on prod URL** |
| **D5 Fri** | **FEATURE FREEZE 12:00.** Acquisition chart polish, a11y pass (§8b), wellness copy + crisis footer (EN), affect capture if ahead, canned-replay Claude fixtures. **PM: mandatory scratch recording — watch it, fix what reads badly.** SLP drop-dead. | Feature-frozen build + scratch video |
| **D6 Sat** | **Record the real 3-min video** (morning, per-beat takes, §16.3) + edit + QA checklist (§16.5). README (problem · named user · Claude-usage map · architecture · clone→run-in-5-min verified from clean clone · research trail · limits) + `docs/research-trail.md` + `docs/dataset-spec.md`. Draft 100–200-word summary. | Video uploaded + QA'd; repo judge-ready |
| **D7 Sun Jul 13** | Buffer: pickups, final edits, tag release, verify prod URL = video build, secrets-clean history, seed works from clean clone. **Submit early afternoon local.** Stage the live-final cut + live-safe demo path (canned-Claude toggle). | Submitted with hours of margin |

**Pre-committed cut lines (drop scope immediately at a missed gate — never compress sleep):**
- **Behind D2 EOD:** candidacy → engine-only with seeded result; `unclear` UI → long-press
  modifier (engine keeps full semantics); PL → scaffold-only.
- **Behind D3 EOD:** cut affect capture; browser-default TTS only (no pre-gen); cut distractor
  *generator* (static prompts).
- **Behind D4 EOD:** wizard falls back to 3 hand-authored seed targets; Claude's surface shrinks
  to "review + red-flag your target" (still a real Claude beat); real auth → seeded caregiver.
- **Behind D5 EOD:** cut self-critique visibility + vision QA + etiology wizard branch (single
  Claude call); debrief canned-then-live.
- **Never cut:** the §12 never-cut demo chain.

**Live final (Jul 16, 18:00 CEST):** prep Jul 14–15 — separate tight 3-min cut + 30s "what we
changed" appendix slide; keep prod green + seeded; no live-API dependency on stage. (§16.6)

---

## 16. The 3-minute film — production plan (the submission artifact itself)

Judging is async: **for most judges the film IS the product** (Demo 30%, and it's also where
Impact/Claude-Use/Depth get *seen*). Treat it as a first-class build artifact with its own spec,
assets, and QA — not "record the app on Day 6." Beats/timestamps live in §1b; this section is how
the film actually gets made. The living script is **`docs/demo-video.md`** in the repo from Day 1,
updated daily (§15) — it doubles as a Depth signal (judges can see the film was engineered too).

### 16.1 Format & constraints
- **3:00 hard cap** · 1920×1080+ · **captioned** (manual-corrected; also helps non-native judges)
  · hosted YouTube (public/unlisted per rules) · linked in README + submission form.
- Screen-capture + voice-over as the spine; SLP cameo ≤20s (card + quote fallback, §14).
- **No live-API dependency in any take** — canned-replay Claude fixtures (§8b), genuinely
  model-generated, pre-seeded inputs; never faked.
- On-screen disclaimer beat: *"fictional persona · no real patient data · not a medical device."*
- **Two cuts:** submission cut (locked Jul 13) + live-final cut (staged Day 7, tightened Jul 14–15).

### 16.2 Asset list (build Days 2–5, not on recording day)
- **Persona assets:** "Marta" (74, patient) + granddaughter "Lena" — AI-generated or licensed
  photos (consistent faces across shots); one deliberately *cluttered group photo* for the
  vision-QA rejection beat + the clean crop Claude recommends.
- **Seeded demo DB (the seed script, §15b D2):** one patient, one screened target ("What is your
  granddaughter's name?" → "Lena"), plus a few days of pre-run trial history so the acquisition
  chart has a real curve to show.
- **Claude fixtures:** recorded real outputs for wizard, self-critique rejection, vision QA,
  etiology extended-thinking, debrief, RCT-in-a-box answer.
- **Audio:** pre-generated neural TTS (or recorded human) for the product's spoken lines heard on
  camera; quiet music bed (CC0/licensed — check the hackathon's music rules); VO track.
- **Graphics:** title card · "what we changed" v1→v2→v3 slide · closing card (repo URL + one-line
  summary) · thumbnail (Marta + Lena photo beats a UI screenshot).

### 16.3 Recording setup
- OBS (or equivalent) at 1080p; **clean browser profile** (no bookmarks/extensions/notifications),
  OS notifications off, `DEMO_MODE` auto-login; cursor visible, slow deliberate movement.
- **Record each beat as a separate take** against the §1b beat sheet and assemble in the edit —
  never one heroic continuous take. Re-record the weakest beat, not the whole film.
- **VO recorded separately** against the locked script (quiet room; phone mic + denoise is fine).
  Don't narrate live while driving the UI — pacing always suffers.
- Session beat runs the `DEMO_SPEED` compression profile with the visible interval clock (§1b) —
  the first 15s interval plays **real** so the expansion is legible and credible.
- Edit in CapCut / DaVinci Resolve (free): cuts, captions, music duck under VO, level check.

### 16.4 Narration script v1 (v4.1 science-forward arc — refine daily in `docs/demo-video.md`;
~140 wpm ⇒ ≤430 words)
- **0:00 the field's problem:** "Spaced retrieval has helped people with dementia relearn what
  matters since the nineties. But its biggest questions are still open — because the practice
  happens at home, and the data dies on paper."
- **0:20 the instrument:** *(SLP: "I can't be in their kitchen every day — and I never see what
  happens there.")* "Keepsake turns every home session into a protocol-faithful trial log —
  delivered by the person who was already going to be there: family."
- **0:40 Claude clinical reasoning:** "A daughter describes the memory in her own words. Claude
  does the clinician's work — phrasing, accepted answers, a safety check. It rejects its own first
  draft. It rejects the photo that wouldn't work."
- **1:05 the session:** "This is Marta. Fifteen seconds. Thirty. A minute. When she misses, the
  device gives her the answer — immediately, gently — so her daughter never has to correct her own
  mother. The interval steps back… and builds again." *(then let the UI breathe; minimal VO)*
- **1:50 the jaw-drop:** "Now watch what her session just became. We asked Claude a research
  question — over her real trial logs." *(analysis runs on screen; beat of silence)* "Acquisition
  rate. Retention decay. Her optimal interval band. At n-of-one, this tunes Marta's protocol.
  At n-of-a-thousand, this exact schema answers questions the field has argued about for twenty
  years. Every install is a study site — and the engine generalizes to any home protocol a
  clinician can specify."
- **2:35 what we changed:** "We didn't build our first idea. Claude Code ran the literature review
  that overturned it — twice."
- **2:50 close:** *(Marta says "Lena.")* "The caregiver never touched a stopwatch, never had to
  correct her mother, never saw a red X — and the field gets data it has never had."

### 16.5 Edit & QA checklist (Day 6, pickups only Day 7)
- [ ] ≤3:00 · captions corrected · audio levels even, music ducked · watch at 1× on laptop **and
  phone**
- [ ] **Cold-viewer test:** someone who's never seen it watches once — can they say what it does
  and why it matters? If not, fix the script, not the footage.
- [ ] Every §1b hero beat visibly lands (safety-split, self-critique rejection, vision QA, device
  correction, chart/report, "what we changed")
- [ ] Disclaimer beat present · repo URL on closing card · **on-screen app = deployed prod build**
- [ ] Upload Day 6 evening, verify playback quality/region, link in README + summary

### 16.6 Live-final cut (Jul 16, 18:00 CEST — prep Jul 14–15)
- Same beats, tightened ~15%; present it as **live narration over the cut** (safe) with the seeded
  prod app open in a second tab for Q&A (canned-Claude toggle on — no live-API dependency on
  stage). 30s "what we changed" appendix slide for judge questions.

---

## Appendix — key sources (verify before any external/clinical claim)
- **Protocol:** Brush & Camp 1998; Benigas/Brush/Elliott *SR Step by Step*; Bourgeois et al. 2003 (SR
  > cueing hierarchy); Fridriksson 2005 (aphasia interleaving); Tactus clinical guide; USMART RCT
  (PMC5461696).
- **Evidence/guidelines:** Hopper et al. 2005 (ANCDS/ASHA, Class II/III); Hogrefe 2023 meta; *Int.
  Psychogeriatrics* 2024 (3 RCTs/34 studies); Haslam 2011 (SR > errorless); REDALI-DEM 2017.
- **Neuro:** De Wit 2020; Sutter eNeuro 2024 (small-error learning); Sokolovič 2023 (AD vs vascular);
  Filoteo 2009 (DLB recognition); Wimber 2020 (reconsolidation); Oren 2014 (mechanism unresolved).
- **Scheduler:** USMART; FSRS learning-steps exclusion (Anki forums/Expertium); ACT-R MCI models
  (PMC4538765); Braintrust JMIR 2024 (undisclosed algorithm).
- **Caregiver:** iCST RCT (PLOS Med 2017, PMC5369684); caregiver-cognitive-intervention review
  (PMC10259075); corrector/supporter qualitative (PMC11475760); fidelity failure (PMC10872702);
  bug-in-ear coaching (PMC5622001).
- **Regulatory:** FDA General Wellness (rev. Jan 2026); Cures Act §3060; SeniorLife warning letter
  (2025); Lumosity FTC (2016); Pear bankruptcy; EU MDR / MDCG 2019-11; GDPR Art. 9/30/35; EDPB
  consent guidelines 05/2020.
- **Speech:** Speech Accessibility Project / Interspeech 2025; Google STT SpeechContext; Claude Haiku
  latency benchmarks; fuzzy-match validation (PMC8516752).
- **Competitive:** Braintrust (formative.jmir.org/2024/1/e51943); MapHabit (PMC8564643); Rendever
  NIH STTR; ElliQ.

*Confidence and contested points are flagged inline. Nothing is marketed as "clinically proven";
several core parameters and the caregiver-delivery thesis itself are genuinely unresolved and are
treated as configurable and as pilot questions, not as settled facts.*
