# Keepsake — cross-environment handoff & memory snapshot

> Portable copy of the durable memory that lives in the Windows Claude Code profile, so nothing is
> lost when moving to a Mac. Companion to `CLAUDE.md` (working style) and `PLAN.md` (the build plan,
> the source of truth). Update this if the project context changes.

## Project snapshot (memory: `keepsake-hackathon`)

**Keepsake** = adaptive Spaced Retrieval Training (SRT) tool for early-stage dementia,
caregiver-delivered, Claude-powered. Separate repo/product; builds on the SR + neuroscience knowledge
developed in the FrançaisFlow project but shares no code (see "New Work Only" below).

**Hackathon:** *Built with Claude: Life Sciences* (Anthropic × Gladstone Institutes × Cerebral
Valley). **Builder Track** ("Build Beyond the Bench").
- Build window: **Jul 7–13 2026**, submit **Jul 13, 9PM ET**.
- Async judging Jul 14–15 → top 3 per track → **live final Jul 16, 12PM ET**.
- **1st (Builder) = $30k API credits.** 2nd $10k, 3rd $5k. Plus a Gladstone Institutes Award ($10k)
  for the project with most potential to advance the field.
- Team ≤2. **Open-source required. New Work Only.**
- Deliverables: **3-min demo video + public repo + 100–200-word summary.**
- **User is aiming for 1st.**

**Judging rubric (weights):** **Demo 30% · Impact 25% · Claude Use 25% · Depth & Execution 20%.**
Demo is the biggest lever. (Full per-criterion strategy in `PLAN.md §1b`.)

**⚠️ "New Work Only":** cannot copy substantial FrançaisFlow source — rebuild fresh. Boilerplate +
OSS libs + patterns-in-head are fine. `PLAN.md §7` reframed accordingly.

## Key evidence-driven design pivots (from ~10 deep-research agents; all cited in `PLAN.md`)
- **Drop FSRS** as the core scheduler — wrong regime (sub-minute intervals), wrong population
  (impaired, cold-start). Use deterministic doubling/halving ladder (USMART / Camp-Bourgeois)
  within-session + simple monotone between-session. FSRS optimizer → V2 population-prior only.
- **Single-target, sequential-to-mastery** — not interleaved (interleaving is aphasia-only).
- **Errorless immediate correction**, NOT a cueing hierarchy (Bourgeois 2003: SR beat cueing
  hierarchy head-to-head).
- **Device is therapist, caregiver is companion** — app delivers the correction; defuses the
  tester/corrector dynamic that harms the relationship.
- **Adherence, not fidelity, is the real risk** (iCST RCT n=356: null on patient cognition, failed on
  adherence). Honest primary outcome = caregiver relationship/competence + item retention, never
  "better memory" (SR gains are item-specific and decay → boosters are core).
- **Regulatory:** wellness positioning for commercial (EU MDR strict; don't name dementia; "show
  data, never diagnosis") BUT hackathon/demo framing names the disease + cites neuroscience (research
  prototype to judges, not marketed product). Two deliberate framings — don't conflate.
- **Speech:** MVP = caregiver-tap-only (three-state: recall/miss/unclear); V1 = constrained
  phrase-hint ASR → fuzzy match → Haiku fallback, biased to accept (false-negatives are harmful).
- **Etiology tunes the protocol** (V1+): AD = small error increments; vascular = longer response
  windows; Lewy/Parkinson's = recognition-format probes, motor cues not free.

## Working-preference memory (carry into every session)
- **Subagent-driven always:** execute plans and research via fresh agents/tasks, not inline. Don't
  ask each time — just do it.
- **Subagents use opus/sonnet:** always pass model `opus` or `sonnet` to agent calls; never inherit a
  small model.
- **Frame blockers as access requests:** "we need X access to do Y", never "there's no way to do X."
- Communication rules are in `CLAUDE.md` (no validation openers, no intent-narration, concise, state
  uncertainty honestly, no closing fluff).

## v4 engineering pass (2026-07-07, Day 1) — what changed on top of v3
- **§4 protocol edge cases pinned as testable spec:** `unclear` = re-probe same interval, no
  correction, no ladder movement (2 consecutive → miss); success at MAX_INTERVAL ends
  within-session work → between-session handoff; session 1 opens with a 0s teach step; end-on-win
  unified (2 consecutive base misses, counter resets on success, always exit via guaranteed 0s
  success); mastery = 3 consecutive session-starts on **distinct calendar days, patient timezone**;
  sessions persist/resume same-day, discard gracefully otherwise.
- **§5 scheduler now has numbers:** first gap 1d; success ×1.5 (cap 14d); failure ÷2 (floor 1d) +
  within-session retraining; boosters 1wk→2wk→1mo→3mo, miss drops a step. All config constants.
- **§8b engineering practices added:** pure-reducer engine + injected clock (no `Date.now()` in
  core); `DEMO_SPEED` never touches stored data; text+CHECK not enums; `patients.timezone` +
  `is_demo`; RLS on ALL tables + cross-tenant denial test; hard delete + separate audit log (GDPR);
  pnpm workspaces (no Turborepo), Biome, lefthook; secrets hygiene + push protection Day 0;
  auth-gate + rate-limit AI routes (public repo = credit-drain vector); forced tool-use + zod +
  fallbacks for Claude calls; prompt caching; golden-set evals; a11y specifics (≥20–24px, 60px
  targets, 7:1 contrast, no UI timeouts).
- **MVP re-cut (~40% over budget → cuts, not sleep):** PL manual QA → V1 (scaffold stays);
  between-session/booster = engine+tests only, no UI; candidacy = engine fn + one-line UI; auth off
  the demo path (seeded caregiver); demo TTS lines pre-generated. Never-cut demo chain defined.
- **New Claude-use beats:** vision dual-coding photo QA, visible self-critique, extended-thinking
  etiology on screen, personalized distractor generator, canned RCT-in-a-box close. Voice memo =
  STT→Claude pipeline (no native audio input).
- **§15b day-by-day schedule Jul 7–13 with pre-committed cut lines**; scratch recording D5 PM,
  real video D6, submit D7 early afternoon. ⚠️ **Deadline = 03:00 Jul 14 Polish time** — treat
  Jul 13 afternoon local as the wire.
- **"New Work Only" wording fixed:** fresh `create-next-app`, no degit/FF files/FF git history.

## v4.1 pitch inversion (2026-07-07, pre-kickoff) — science-forward framing
- **Reframe #0 (PLAN §1b):** lead with the field's problem, not the family's — Keepsake is "a
  clinical-protocol instrument that generates the trial-level dataset SRT research has lacked for
  20 years, deployed through family caregivers." **Every install is a study site.** Marta/Lena =
  humane-deployment proof, not the thesis. Engine-generalizes as one slide-line.
- **Jaw-drop beat = RCT-in-a-box, live, MVP, never-cut** (degrades to fixture-replay, never
  absent): Claude analyzes real trial logs on camera → mini study report (acquisition rate,
  retention decay, interval band, booster rec, honest n=1 caveats) → extrapolation slide.
  Honesty guardrail: n=1 never "settles" a field question; the claim is the schema at scale.
- Beat sheet + §16.4 narration rewritten to the inverted arc; etiology beat moved to
  README/live-final Q&A.
- **⚠️ Kickoff ruling (Discord, organizers):** "all code must be produced during the hackathon";
  "any activity in your repo prior to the start of hacking will be flagged"; ideation is allowed.
  → Today's repo = practice run + ideation archive. **At 18:00 local: fresh repo, docs as first
  commit, everything regenerated live** (no file copies from the practice repo; knowledge and
  plan docs carry, code does not).

## First actions when work resumes (from `PLAN.md §15/§15b`)
1. Fresh `create-next-app` (never degit FF); `.env.example` before first commit + push protection;
   new Supabase project (**EU region**); Vercel; deploy hello-world.
2. Write the SR-engine tests **first** (`candidacy`, `ladder`, `session`, `scheduler`) — encode the
   protocol as failing tests **including the v4 edge decisions above**. Pure reducer + injected
   clock.
3. **SLP outreach Day 1** (call by Day 4, drop-dead Day 5 — named user + demo fallback = card +
   quote). Acquire the **Benigas/Brush/Elliott "Spaced Retrieval Step by Step"** manual.
4. Draft wellness-safe copy + the honesty ledger early (legally load-bearing).
5. Register the demo domain; demo-video script v0 in repo, updated daily; confirm submission-portal
   mechanics + ask the New-Work-Only scaffolding question in #questions.

## The four deliverables, restated
- 3-min demo video (emotional arc: relearning a grandchild's name across expanding intervals +
  device-delivered errorless correction + Claude clinician report; `DEMO_SPEED` compression
  profile — first interval real, accelerate only >60s; see PLAN.md §1b).
- Public repo, OSI license, README (problem · named user · Claude usage · architecture · run · the
  research trail · honest limitations).
- 100–200-word summary (impact + Claude-use forward).
- Separate 3-min cut ready for the live final (Jul 16).

## Files in this folder
- `PLAN.md` — the authoritative build plan (v4): science, protocol spec, scheduler, tiers, rubric
  strategy, schedule + cut lines (§15b), film production plan (§16), pilot design, risks, sources.
  **Source of truth.**
- `TASKS.md` — phase/task execution board (phases 0–8, checkboxes, done-when, cut-line tags).
  **Check work off here; update daily.**
- `CLAUDE.md` — working style + fast project context + non-negotiable design decisions.
- `HANDOFF.md` — this file (memory snapshot for cross-env continuity).
