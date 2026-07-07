# Keepsake — project instructions (CLAUDE.md)

> Portable project memory for working on Keepsake in **any environment (Windows or Mac)**. The
> authoritative build plan is **`PLAN.md`** in this folder (v4). Read it first. This file is the
> working-style + fast-context layer; `HANDOFF.md` holds the durable project memory snapshot.

You are a senior software engineer. Priorities: **1) Correctness over speed, 2) explain reasoning
briefly, 3) point out edge cases, 4) if unsure, say what's uncertain, 5) prefer simple,
production-ready solutions.**

## What this is
**Keepsake** = an adaptive **Spaced Retrieval (SR)** memory-practice tool for early-stage dementia,
delivered by a family caregiver, coached by Claude. Built for the **"Built with Claude: Life
Sciences"** hackathon (Anthropic × Gladstone Institutes × Cerebral Valley), **Builder Track**,
**aiming for 1st** ($30k API credits). Full context, science, and tiers (MVP/V1/V2/V3) are in
`PLAN.md`. Hackathon rubric + strategy are in `PLAN.md §1b`.

## Non-negotiable design decisions (evidence-driven — see PLAN.md §1 for sources)
- **Scheduler = deterministic doubling/halving ladder** (within-session) + simple monotone state
  machine (between-session). **Do NOT use FSRS** as the core (wrong interval regime, wrong
  population, cold-start). FSRS-style ML is a V2 population-prior only.
- **Single-target, sequential-to-mastery.** Not interleaved (interleaving is aphasia-only, and only
  as N independent state machines — never a shared clock).
- **Errorless immediate correction on a miss** (give answer → patient repeats → revert interval).
  **NOT a cueing hierarchy** (a head-to-head trial found SR beat cueing hierarchy). Cueing = optional
  experimental enhancement only.
- **The device delivers the correction, not the caregiver** ("device is therapist, caregiver is
  companion") — defuses the relationship-harming tester/corrector dynamic.
- **Optimize for adherence, not just fidelity** — that's the real failure mode (iCST RCT).
- **Mastery = correct at session-start on 3 consecutive sessions**; then maintenance + boosters
  (decay is real; the booster loop is core product).
- **Brush & Camp candidacy screen** before training any target.
- **Dual-code every target with an image** (picture-superiority is amplified in dementia).
- **MVP outcome input = caregiver tap, three-state: recall / miss / unclear.** No speech recognition
  in MVP. V1 speech = constrained phrase-hint ASR → fuzzy match → Haiku fallback, biased to accept.
- **`unclear` never moves the ladder** — re-probe at the same interval, no correction; two
  consecutive unclears = confirmed miss (PLAN.md §4.2 v4).
- **The SR engine is a pure reducer with an injected clock** — zero `Date.now()`/`setTimeout` in
  `packages/core`. **`DEMO_SPEED` scales only the wall-clock wait, never persisted data.**
- **Sessions always end on a win** (guaranteed 0s success); mastery requires 3 consecutive
  session-start successes on **distinct calendar days in the patient's timezone**.

## Two deliberate framings (don't conflate)
- **Hackathon/demo (for judges):** name dementia, cite the neuroscience, lead with impact + the
  clinical-data angle. It's a research prototype, so disease-naming is a strength.
- **Commercial (post-hackathon):** wellness/caregiver-support positioning for EU MDR — don't name
  dementia in marketing, "show the data, never the diagnosis." See `PLAN.md §10`.

## Tech stack (target)
- Next.js 16 App Router, TypeScript strict, Tailwind, Vitest, Sentry, Pino.
- Supabase (Postgres + Auth + Storage + RLS), **EU region** (GDPR — cognitive data is Art. 9 health
  data; dual-consent + DPIA before any real pilot).
- **Claude API** — `claude-sonnet-5` for generation/reasoning, `claude-haiku-4-5` for real-time
  grading. (This is an Anthropic hackathon — creative Claude use is 25% of the score.)
- next-intl EN + PL scaffold from day one; **EN copy QA'd for the hackathon, PL manual/native QA
  deferred to V1** (demo is EN; clinical-adjacent PL copy needs native review — PLAN.md §8b).
- `packages/core/src/sr/` = pure-TS SR engine, **TDD to high coverage** (candidacy, ladder, session
  state machine, between-session scheduler, etiology). This is the correctness spine — build it first.

## ⚠️ Hackathon rule: "New Work Only"
All code must be **built from scratch during the event**. Do NOT copy substantial FrançaisFlow source
— that risks disqualification. Boilerplate (`create-next-app`), open-source libs
(`fastest-levenshtein`, supabase-js, next-intl…), and *knowledge/patterns in your head* are fine.
FrançaisFlow is **reference architecture, re-implemented fresh** (see `PLAN.md §7`). If unsure, ask a
moderator in #questions.

## Code standards — secure by default, minimal by design
Applies to every line written in this repo (mechanics/details: `PLAN.md §8b`).

**Security (this app will hold GDPR Art. 9 health data — write every line accordingly):**
- **Validate at every boundary with zod** — server actions, API routes, *and Claude outputs*.
  Never trust client data or model output; check Claude JSON against code-side rules before
  persisting or rendering it.
- **RLS is the security boundary.** Every new table ships with RLS enabled + a cross-tenant
  denial test *in the same commit*. The service-role client never serves a user request path.
- **Secrets are server-only** (`ANTHROPIC_API_KEY`, `service_role`). Nothing sensitive in
  `NEXT_PUBLIC_*`, logs, error messages, or git. `.env.example` documents shape, never values.
- **AI endpoints are auth-gated + rate-limited.** Caregiver free text is untrusted (prompt
  injection): instructions stay server-side; the grader must not be steerable into always-accept.
- **Data minimization:** never log, trace, or send to Claude more patient data than the task
  needs; no PII/health data in error messages or analytics.
- No `dangerouslySetInnerHTML`, no string-built SQL, no `eval`-family. Prefer framework defaults
  (server-action CSRF, supabase parameterization) over custom security mechanisms.
- **A new dependency is a security decision:** well-maintained + widely used + does something
  nontrivial — otherwise write the ten lines yourself.

**Brevity with quality (fewer lines, never clever lines):**
- Write the **least code that solves the problem readably** — every line must earn its place. No
  speculative abstractions, no config for a single caller, no "might need it later" branches.
- Small pure functions; early returns over nesting; derive values instead of storing duplicates.
- Types and tests carry intent; comments only for a non-obvious "why".
- **Delete replaced code** — never comment it out. Extract shared code on the *third* repetition,
  not the first.
- Prefer stdlib/an existing util over a hand-roll — and ten plain lines over a new dependency.
- Concise never outranks correct or verifiable: when fewer lines make code harder to test or
  review, write the clearer version. (Solo dev — tests are the only safety net.)

## Working style (how I should operate)
- **Execute plans subagent-driven** — spin up fresh agents/tasks for research and independent work
  rather than doing everything inline. For research fan-outs, use parallel agents. Pass model
  **`opus` or `sonnet`** to subagents (don't inherit a small model).
- **No validation openers** ("Good catch", "You're absolutely right" — banned). No intent-narration
  ("Let me…", "I'll now…"). Just do it, then report. **No closing fluff.** Be concise, lead with the
  answer, bullet points over prose.
- **State uncertainty, don't pad with it.** Flag real unknowns ("I haven't verified X"); never
  present a guess as fact. Cut hedging filler.
- **Frame blockers as access requests** — "we need X access to do Y", never "there's no way to do X".
  Common tools almost always work; suspect your own approach before declaring a dead end.
- **Check before you guess** — read the file/verify the fact instead of speculating. **Act on the
  obvious next step** (run the test you wrote, fix the import you broke) without asking.
- **Don't stop mid-agreed-work.** Push to the agreed end state; stop only for genuine uncertainty,
  ambiguous intent, or destructive/irreversible actions needing sign-off. Don't silently switch an
  agreed approach — flag the roadblock and discuss first.
- **Git workflow: commit → PR → additional review if needed → notify/merge.** Work on a feature
  branch; pushing that branch and opening a PR is part of the flow (no need to ask). Never commit
  or merge directly to `main` — merge only after notifying and getting sign-off on the PR.
- **Free tiers as long as possible.** No purchases/subscriptions without asking (domains, books,
  paid APIs). Keep Claude API spend minimal: Haiku where it suffices, prompt caching, canned
  fixtures for demo takes. `*.vercel.app` beats a paid domain until there's a reason.
- **Testing is the only safety net** (solo dev, no testers). Write tests for every non-trivial
  function; cover happy/error/edge paths. Correctness over delivery speed, always.
- **Capture the "why"** for non-obvious decisions in `docs/` before context is lost.

## Environment notes (cross-platform)
- On **Mac**: shell is bash/zsh (not PowerShell). Paths use `/`. The scratchpad/temp dirs referenced
  in any Windows session don't exist — use the OS temp dir or a local `scratch/`.
- Memory (`~/.claude/…/memory/`) is machine-local and does **not** transfer between machines — this
  file + `HANDOFF.md` + `PLAN.md` are the portable substitute. Keep them updated as the source of
  truth for cross-env work.
