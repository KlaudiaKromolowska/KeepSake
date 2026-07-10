# Keepsake — hackathon submission writeup

*Built with Claude: Life Sciences (Anthropic × Gladstone Institutes × Cerebral Valley) · Builder Track — "Build Beyond the Bench."*

> A caregiver companion for shared memory practice. It extends **Spaced Retrieval (SR)** — an
> evidence-based clinical memory intervention for early-stage dementia — from the therapy room into
> the home, and turns every home session into the structured, trial-level dataset SR research has
> lacked for twenty years. **Every install is a study site.**
>
> *Research prototype. Fictional persona, no real patient data. Not a medical device; it does not
> diagnose, treat, or prevent any disease.*

---

## Inspiration

Spaced Retrieval Training has been helping people with dementia relearn what matters — a
grandchild's name, "my walker is by the door," a safe-swallowing strategy — **since the 1990s**. It
works by riding procedural memory, which stays relatively intact into moderate dementia: the person
recalls a functional fact at expanding time intervals, with immediate errorless correction on a
miss. It is ANCDS/ASHA-recognized, and the evidence has been stable for two decades.

And yet its biggest questions are *still open* — expanding vs. uniform intervals, errorless vs.
effortful correction, caregiver vs. clinician delivery — for one mundane reason: **the practice
happens at home, and the data dies on paper.** A clinician delivers it by hand, with a stopwatch and
index cards, one or two sessions a week. No trial has ever had structured, trial-level logs from
hundreds of home dyads.

Two problems collide here. The clinical one: SR should run *daily* at home, but a lay caregiver
can't reliably hold the interval-and-correction rules, and being cast as their parent's "tester"
damages the relationship — the failure mode the best analog RCT (iCST, n=356) actually hit was
**adherence**, not fidelity (22% did zero sessions). The scientific one: the field can't answer its
own questions because home practice is invisible.

Keepsake is one instrument aimed at both: the device carries the protocol so the caregiver can just
be family — and, by construction, every session it runs becomes a protocol-faithful trial log.

*Targets: Impact (names a real underserved population + a field-level "advance the bench" problem
statement), Depth (the honest framing of the field's twenty-year gap).*

---

## What it does

A speech-language pathologist (or the caregiver) names a functional memory target. From there:

1. **Claude turns a messy caregiver description into a clinically-shaped target** — one exact
   question, a stable answer, accepted answer variants, a red-flag safety split of multi-part or
   emotionally-loaded requests, and a recommended answer format — and **critiques and rejects its own
   first draft on screen** before the caregiver ever sees it.
2. **Claude vision-QAs the dual-coding photo** — is the subject one clear face, well-lit,
   distractor-free? It rejects a cluttered group shot and suggests the crop (picture-superiority is
   amplified in dementia).
3. **The app runs the SR session on a big, calm kiosk UI.** A pure, deterministic engine drives the
   expanding-interval ladder (15s → 30s → 1m → …). During each wait, the caregiver gets
   Claude-generated, dyad-personalized distractor conversation (clinically required — it prevents
   rote rehearsal). The caregiver taps a **three-state outcome: recall / miss / unclear.**
4. **On a miss, the *device* delivers the errorless correction** — the patient reads the answer off
   the screen, not off their daughter's face — and the interval steps back one rung, never to zero.
   Sessions **always end on a win.**
5. **Every probe is logged** as a structured trial (real interval, outcome, whether the device
   corrected, screening flag, timestamp in the patient's timezone).
6. **The jaw-drop: RCT-in-a-box.** The caregiver (or a researcher) asks a free-text research
   question over the dyad's real logs — *"What's her acquisition rate, and is her retention decaying
   between sessions?"* — and **Claude runs its own analysis**, choosing which analyses to execute,
   and returns a mini study report: acquisition trajectory, reset-and-recovery resilience, the
   interval band reached, booster state, and an honest **n=1 limitations** section. At n=1 it tunes
   one patient's protocol; at n=1000 the same schema answers questions the field has argued about
   since the 1990s.
7. **A private post-session debrief** streams to the caregiver — never raw pass/fail in the moment
   (which would invite pushing harder), just warmth and one gentle pattern.

The design principle underneath all of it: **the device is the therapist; the caregiver is the
companion.**

*Targets: Demo (the end-to-end emotional arc that the film shows), Impact (working software a
clinician could deploy without the builder in the room), Claude Use (previews the seven surfaces).*

---

## How we built it

- **Next.js 16 (App Router), TypeScript strict, Tailwind.** Kiosk-grade accessible UI: ≥20–24px
  type, 60px touch targets, 7:1 contrast, no color-only signaling (never a red X), no UI timeouts on
  caregiver actions.
- **pnpm workspaces monorepo** — a thin `apps/web` over a framework-free `packages/core`. No
  Turborepo (solo dev, 7 days); Next `transpilePackages` + Vitest read the TS source directly.
- **`packages/core/src/sr/` — the correctness spine, built first, test-driven.** A pure reducer
  `(state, event) → state` with an **injected clock**: zero `Date.now()` / `setTimeout` anywhere in
  the engine (enforced by a `purity.test.ts` grep test), so the whole protocol is testable as plain
  values. `candidacy.ts` (Brush & Camp screen), `ladder.ts` (within-session ×2 / reset-to-
  last-success), `session.ts` (the single-target state machine), `scheduler.ts` (between-session
  monotone state machine + boosters), `etiology.ts` (cue-format defaults). Property-based invariants
  (`fast-check`) sit on top of the unit cases: interval always ∈ [BASE, MAX]; reset never below
  last-success; mastery requires exactly 3 distinct-day session-starts; `unclear` never moves the
  ladder.
- **`DEMO_SPEED` scales only the wall-clock wait** at the orchestration boundary — never the
  persisted `interval_sec`. The data stays real even when the video compresses the on-screen wait.
- **Supabase (Postgres + Auth + Storage + RLS), EU region** (GDPR — cognitive scores tied to a named
  patient are Article 9 health data). All schema is versioned migrations in-repo; `status`/`outcome`/
  `candidacy` are `text` + CHECK (they churned all week); `etiology` is the one native enum;
  `patients.timezone` is required (mastery's distinct-days rule is patient-local).
- **Claude API** via `@anthropic-ai/sdk`: **`claude-sonnet-5`** for generation, reasoning, and the
  agentic report; **`claude-haiku-4-5`** for real-time, cheap grading and option generation. All
  Anthropic access flows through one server-only module (`apps/web/src/lib/ai/core.ts`) that owns the
  single client, quota enforcement, structured generation, streaming, extended thinking, the
  tool-use loop, and fixture replay.
- **Toolchain:** Biome (lint + format), lefthook pre-commit/pre-push, Vitest, Pino structured logs.
  A `CLAUDE_FIXTURES=1` replay mode lets the whole app run from recorded, schema-checked fixtures —
  so no demo take ever depends on a live API round-trip.

*Targets: Depth & Execution (real engineering craft — pure reducer, injected clock, property tests,
migrations-as-code), Demo (the fixture-replay + DEMO_SPEED machinery that makes the film reliable).*

---

## How we used Claude

Nine distinct Claude-powered surfaces, each chosen for a specific clinical job. Every one is
auth-gated and rate-limited (20 calls/user/hour, 200/day global, enforced server-side against a
Supabase table + `SECURITY DEFINER` RPC — a public repo plus a deployed URL is a credit-drain
vector). A shared, frozen SR-protocol system prompt (`SR_SYSTEM`) is **prompt-cached with
`cache_control: ephemeral` on every call**. All model output is validated with zod (via the SDK's
`zodOutputFormat` structured-output helper) before it is persisted or rendered — model output is
never trusted.

| # | Surface | Model | Why this model / technique |
|---|---|---|---|
| 1 | **Target wizard** | `claude-sonnet-5` | Clinical reasoning + **visible self-critique** |
| 2 | **Vision dual-coding QA** | `claude-sonnet-5` | Native multimodal image reasoning |
| 3 | **Etiology reasoning** | `claude-sonnet-5` | **Extended thinking, streamed on screen** |
| 4 | **RCT-in-a-box report** | `claude-sonnet-5` | **Agentic tool-use loop** over real logs |
| 5 | **Post-session debrief** | `claude-sonnet-5` | Streamed warm private narrative |
| 6 | **Caregiver coach** | `claude-sonnet-5` | Boundaried copilot + injection-safe |
| 7 | **Real-time grader** | `claude-haiku-4-5` | Sub-second, accept-biased, fallback-only |
| 8 | **Distractor prompts** | `claude-haiku-4-5` | Cheap, high-volume personalization |
| 9 | **Recognition lures** | `claude-haiku-4-5` | Cheap constrained generation, booster-gated |

**1 · The target wizard — clinical reasoning, not templating (`lib/wizard/actions.ts`).** A daughter
describes the memory in her own words; Sonnet returns one SR-valid target (exact question, stable
answer, accepted variants, a red-flag split of multi-part/emotional requests, a rationale) *and is
required by its output schema to reject its own first draft* — the rejected draft and the reason are
rendered on screen ("this combined two facts — splitting into two targets"). The caregiver
description is nonce-fenced as untrusted DATA. Code-side authoring rules (`rules.ts`) run after the
model; a violation triggers **one corrective re-ask** with the exact rule failures handed back; if it
still fails, the UI offers hand-entry — Claude can never block target creation.

**2 · Vision dual-coding QA (`lib/wizard/vision-actions.ts`).** A genuine multimodal call — an image
block plus a text block in one user message — judges whether a photo works as a memory cue (one
clear subject, lighting, low clutter) and returns `good`/`needs_work` with concrete crop advice.
Works on both a seeded stock photo (path allowlisted, traversal-checked) and a caregiver upload
(magic-byte validated, stored RLS-confined under `<caregiver_id>/<uuid>`, and deleted if the QA call
itself fails so no unchecked orphan survives).

**3 · Extended-thinking etiology reasoning (`api/etiology/route.ts`).** Sonnet's **visible
reasoning** is streamed live to the screen — `thinking: { type: "adaptive", display: "summarized" }`
at high effort — turning invisible clinical judgment into a demo visual ("Lewy body → free recall
will frustrate → recommend a recognition-format probe"). The streamed reasoning is followed by a
framed JSON trailer, and a deterministic code-side `reconcile()` guard **always overrides** any model
recommendation that contradicts the engine's own etiology→format mapping. This is the one surface
deliberately allowed to name a condition (it does not extend the wellness-framed shared prompt).

**4 · RCT-in-a-box — the agentic research view (`lib/ai/rct-report.ts`, `rct-tools.ts`).** This is
the surprising one. Claude is **not** handed the trial log. It is given a free-text research question
and a fixed, hand-written menu of five analysis tools — `get_trial_counts`,
`get_interval_progression`, `get_retention_at_session_start`, `get_booster_history`,
`get_affect_summary` — and a multi-turn tool-use loop (`runToolLoop`, `tool_choice: auto`, up to 8
tool calls, `effort: high`) lets it **choose which analyses to run**, see the aggregates, and write
the study report. The ordered list of tools it actually called is surfaced to the user as "how this
report was produced" — visible proof of agency. Guardrails: the tools are a fixed menu, never
free-form SQL; each is a pure aggregate over data already fetched once through the RLS user client
(that single read is the security boundary); tool results carry numbers, dates, and outcome codes
only — never names or ids (data minimization); and the report's **n=1 limitations section is
required**. Honesty guardrail baked into the prompt: *n=1 never settles a field question* — the claim
is the instrument and schema at scale.

**5 · Debrief (`api/debrief/route.ts`).** A short, warm, **private** post-session note streamed as
raw text — what went well, one pattern, one gentle non-scheduling suggestion. Private on purpose:
§6 keeps in-the-moment pass/fail away from the caregiver so they never push harder at their parent.

**6 · Caregiver coach (`api/coach/route.ts`).** A boundaried copilot with an anti-sycophancy design:
because the chat is stateless, the *entire* client-supplied transcript — including turns labeled
"assistant" — is packed into the untrusted user message as DATA; nothing verifies a client-supplied
assistant turn, so it earns no trust, and no turn can rewrite the model's role or steer the grader
into "always reassure." It emits an `escalate` safety flag that raises a crisis pointer (the crisis
footer is always present regardless). LLM sycophancy reinforcing a dementia delusion is a real safety
constraint, and the guardrail is structural.

**7 · Real-time grader (`lib/session/grade-actions.ts`).** V1 speech assist. A deterministic fuzzy/
phonetic matcher resolves the easy cases in milliseconds; **Haiku is called only on the ambiguous
middle band** — sub-second, `maxTokens: 256`, biased to accept, three-state (`recall`/`miss`/
`unclear`), and it only ever produces a *suggestion* the caregiver taps to confirm. It never records
an outcome or moves the ladder. The answer and aliases are re-read server-side and the fuzzy match
re-run there, so a manipulated client can't burn quota on a case the matcher already decides.

**8 · Distractor prompts (`lib/session/distractor-actions.ts`).** Haiku generates eight short,
dyad-personalized conversation openers for the wait gaps — explicitly *not* quizzes. Any failure
degrades to a static list; the session never blocks.

**9 · Recognition lures (`lib/session/recognition-actions.ts`).** For post-mastery **booster** checks
only (hard-gated to `schedule_mode === "booster"` — recognition must never let a patient reach
mastery without free recall), Haiku generates three plausible wrong options. Only the *wrong* options
come from the model; the real answer is injected code-side so the model can't omit or alter it.

**And the build itself.** Keepsake's design was shaped by a Claude Code **multi-agent literature
review** — ~10 parallel research agents ran the clinical-evidence review that overturned the initial
design *twice* (see below). Claude Code didn't just write the app; it did the neuroscience review
that reshaped it.

*Targets: Claude Use (25%) — nine purpose-fit surfaces spanning agentic tool-use, extended thinking,
vision, streaming, structured outputs, prompt caching, and a defense-in-depth prompt-injection
posture, with the model choice justified per call.*

---

## The science — why our design is evidence-driven

Keepsake's design is not our first idea; it's the idea evidence-tested. The full trail
(`docs/research-trail.md`, `PLAN.md §1`) documents where the literature overturned us:

- **Deterministic SR ladder, NOT FSRS.** Off-the-shelf spaced-repetition ML (FSRS) excludes
  sub-minute intervals from its own training, needs hundreds of reviews to personalize (a new patient
  has zero), and was fit on healthy motivated learners. The only RCT-validated *dementia* scheduler
  (USMART) is a deterministic doubling/halving ladder. We dropped FSRS from the core; ML is demoted to
  a possible V2 population-prior only.
- **Errorless immediate correction, NOT a cueing hierarchy.** Bourgeois et al. 2003 compared SR
  against a cueing hierarchy head-to-head — **SR won** on goals attained and maintenance. So on a
  miss we give the answer immediately, the patient repeats, and the interval reverts one rung.
- **The device is the therapist; the caregiver is the companion.** The tester/corrector dynamic
  damages the relationship, and the real RCT failure mode was adherence, not fidelity. The app
  delivers the prompt *and* the correction; the caregiver's job is presence and one tap.
- **Single-target, sequential-to-mastery** — classic dementia SR trains one target at a time;
  interleaving appears only in aphasia work, and even there as independent state machines, never a
  shared clock.
- **Mastery = correct at session-start on 3 consecutive sessions on *distinct calendar days*** (patient
  timezone) — ungameable, and it triggers a maintenance + booster loop, because SR gains are
  item-specific and decay. The booster loop is the product, not an add-on. We never promise "better
  memory."
- **Dual-code every target with an image** — picture-superiority is amplified in dementia.
- **Etiology tunes parameters** — Alzheimer's keeps error increments small (early AD loses learning
  from large errors); Lewy/Parkinson's prefers recognition-format probes. The deterministic engine
  owns the protocol; the science only tunes parameters; nothing is marketed as clinically proven.

**Mid-build practitioner validation.** While the session UI was still being planned, a **Polish
practitioner-trainer organisation that officially represents the SR adaptation for seniors** (the same
Camp/Brush tradition our protocol implements) reviewed the design by email — the first
*practitioner-driven* iteration on top of three literature-driven ones. It **validated** the 15s-then-
doubling ladder, the "3 consecutive session-starts = remembered, regardless of gap" mastery rule, and
the radical-simplicity accessibility floors — and it **changed** five things we folded in before a
single screen shipped: no rigid scheduling copy (real cadence drifts; rigid reminders instrumentalize
the person), the caregiver always sees question *and* answer, a manual mid-session interval override
(logged as a protocol-deviation annotation — deviations become data), a per-session caregiver note,
and an "answer card introduced" annotation. *(Name and quotes withheld pending consent.)*

*Targets: Depth & Execution (20%) — a documented v1→v2→v3→v4 where evidence forced us to drop two
central design choices — and Impact (real practitioner credibility).*

---

## Security & privacy

Cognitive scores tied to a named patient are **GDPR Article 9 health data**, so every line was
written accordingly.

- **EU-region Supabase**; all schema as versioned migrations in-repo (16 and counting), never
  dashboard clicks.
- **RLS is the security boundary, on every table** — `sessions`, `trials`, `target_state`, `consent`
  and the rest have no `caregiver_id` of their own, so each policy joins ownership up through
  `patients`. Forgetting one would be a cross-tenant read of Article 9 data.
- **A CI-enforced cross-tenant denial test** (`packages/db-tests/src/rls-denial.test.ts`, 89 cases)
  proves, for
  every table in the migrations: (1) a caregiver can read/write their **own** data (positive control,
  so the test can't pass vacuously), (2) a caregiver can **never** read, insert, update, or delete
  another caregiver's data, (3) an anonymous client gets nothing anywhere, and (4) `audit_log` is
  genuinely append-only, even for its owner.
- **Multi-tenant care-home model** — organizations own patients and staff are scoped by org, each
  boundary carrying its own RLS policy and denial coverage. `patient_notes` was split into its own
  table so clinicians in an org can't read a caregiver's private notes.
- **Secrets are server-only.** `ANTHROPIC_API_KEY` and the Supabase `service_role` key never appear
  in `NEXT_PUBLIC_*`, logs, or error messages; the entire AI core is a server-only module. Provider
  errors are surfaced with a single generic message — raw model/provider text never reaches the
  client.
- **AI endpoints are auth-gated and rate-limited** (per-user + global quotas), and every model output
  is zod-validated before it is persisted or rendered. Caregiver free text is treated as untrusted
  and never becomes instructions (nonce-fencing, transcript-as-DATA, server-side re-checks).
- **GDPR data hygiene** — hard delete with `ON DELETE CASCADE` (no retained Article 9 payloads), a
  separate append-only `audit_log` that holds Art. 30/32 evidence *without* health payloads, a
  dual-consent table, and strict data minimization into every Claude prompt (the research tools see
  numbers and codes, never names or ids).

*Targets: Depth & Execution (security craft as a first-class deliverable) and Impact (a tool that
could actually be piloted with real dyads under EU rules).*

---

## Challenges we ran into

- **Compressing a real protocol into a 3-minute film.** SR intervals are minutes to days. A flat 60×
  speedup makes the distractor phase vanish and the loop read as a glitch, so `DEMO_SPEED` is a
  *scripted compression profile* (first interval real, accelerate only the long ones) designed into
  the session runner, not bolted on in the edit.
- **Making the engine testable.** Getting to zero `Date.now()`/`setTimeout` in the core — a pure
  reducer with an injected clock — was the single most important early decision; it's what let the
  entire protocol (including the nasty edges: `unclear` semantics, end-on-win, distinct-day mastery,
  resume) be encoded as plain-value tests and property invariants (a `fast-check` suite fuzzes 7
  invariants over 200 seeded runs each, including deliberately out-of-range interval overrides).
- **Streaming extended thinking on Sonnet 5.** `budget_tokens` is rejected on this model and the
  default thinking display streams empty text; the etiology surface only works with
  `display: "summarized"` at high effort — and even then needs a deterministic reconcile guard so a
  streamed rationale can never ship a recommendation that contradicts the engine.
- **Prompt injection into a health tool.** Caregiver free text flows into the wizard, the grader, and
  the coach. The grader must not be steerable into always-accept; the coach must not be steerable into
  always-reassure. The fixes are structural (fencing, transcript-as-data, server-side re-checks,
  code-side output validation), not prompt pleading.
- **A public repo that is also a live API key.** Auth-gating + rate-limiting every AI route, plus
  push protection from day zero, so the credit-drain vector is closed.
- **Honest ambition.** Saying the true thing — SR gains are item-specific and decay; caregiver-
  delivered SR is near-evidence-free; n=1 settles nothing — while still building something that lands
  emotionally.

---

## Accomplishments we're proud of

- **The engine is a genuinely pure, property-tested clinical state machine** — the correctness spine
  a memory-practice tool has to earn, not fake.
- **RCT-in-a-box actually runs.** Claude chooses and executes its own analyses over real logs and
  writes an honest n=1 study report — a working pipeline, not a mockup, that degrades gracefully to
  fixtures for the film.
- **Nine Claude surfaces, each doing real clinical work**, spanning agentic tool-use, extended
  thinking, vision, streaming, and cheap real-time grading — with the model choice justified per call
  and a real prompt-injection posture.
- **A cross-tenant RLS denial test in CI** over every table — Article 9 data treated like Article 9
  data.
- **Mid-build validation from a real SR practitioner organisation**, folded in before the first
  session screen shipped.
- **The device-delivers-the-correction insight** — the caregiver never touches a stopwatch, never has
  to correct their own mother, and never sees a red X.

---

## What we learned

- **Evidence beats intuition — twice.** Our first instinct (reuse an ML scheduler; use a cueing
  hierarchy) was wrong on both counts, and the literature said so plainly. The documented reversal is
  the depth of the project, not an embarrassment.
- **The real failure mode is adherence, not fidelity.** Optimizing for a low-friction, relationship-
  safe daily ritual matters more than perfect protocol execution.
- **Structured data is the moat.** The same schema that debugs one patient's protocol at n=1 is what
  could answer the field's twenty-year-old questions at n=1000 — but only if it's protocol-faithful by
  construction, not an app event stream retrofitted for research.
- **In a health tool, "validate the model output" is not optional plumbing** — it's the boundary
  between a helpful suggestion and a protocol-integrity failure.

---

## What's next

- **V1 pilot (3–5 dyads):** measure the actually-unproven thesis — the fidelity gap (app enforcement
  vs. a clinician bootstrap), the real adherence curve, caregiver burden (Zarit) and sense of
  competence, relationship quality, patient affect around sessions, and item retention with/without
  boosters. Plus DPIA + dual-consent + Polish counsel sign-off before anyone is enrolled.
- **Speech assist, for real** — constrained phrase-hint ASR → fuzzy match → Haiku on the ambiguous
  band, three-state and biased to accept (a false "you're wrong" to a vulnerable patient is a harm,
  not a bug).
- **Etiology-adaptive protocols, a self-referenced trend view** ("discuss with your doctor," show the
  data never the diagnosis), a read-only clinician view, and CSV research export.
- **The engine generalizes** — any clinician-designed home protocol with scheduled probes + outcomes
  fits the same reducer + logging spine. SR is demo #1, not the ceiling.
- **At scale, the population-prior scheduler and the full agentic research view** — the structured,
  trial-level dataset the field has never had.

---

*Keepsake is a caregiver-support and cognitive-engagement tool. It is a research prototype built for
a hackathon, is not a medical device, and does not diagnose, treat, or prevent any disease. The demo
uses a fictional, consented persona and contains no real patient data.*
