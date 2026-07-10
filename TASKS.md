# Keepsake — phase/task breakdown (execution board)

> Derived from `PLAN.md` v4 (§12 scope, §15/§15b schedule+cut lines, §16 film). This is the
> **living tracker**: check tasks off here; PLAN.md stays the *why/spec*, this file is the *what's
> left*. Portable across machines (memory isn't). Update daily with the demo script.
>
> **Legend:** ⛔ = never-cut demo chain (PLAN §12) · ✂️Dn = falls at the Day-n cut line (§15b) ·
> **Gate** = hard checkpoint; missing it triggers the cut line, not overtime.

**Dependency spine:** P0 foundation → P1 engine → (P2 data ∥ P3 UI) → P4 Claude → P5 polish/freeze
→ P6 film+repo → P7 submit. P8 (pilot prep) is post-hackathon.

---

## Phase 0 — Foundation & hackathon admin (Day 1 AM)

- [x] **0.1** Fresh scaffold: `create-next-app` (never FF files/degit — PLAN §7), pnpm workspace
  `apps/web` + `packages/core`, TS strict, Tailwind, Vitest, Biome, lefthook, `.nvmrc`.
  *Done:* lint + typecheck + test + build all green (D1).
- [x] **0.2** Secrets hygiene **before first commit**: `.gitignore` `.env*`, `.env.example`.
  *Deferred:* GitHub secret scanning + push protection are unavailable on this private repo —
  **enable the moment the repo goes public** (required before submission anyway).
- [x] **0.3** Supabase + Vercel live (D1):
  - Supabase: existing **"KeepSake's Project"** in org ClaudeScience-KeepSake, `eu-west-1`
    (Ireland — EU ✓), ref `enrhdnwazcwfccvqeoew`, empty schema. (New-project creation blocked by
    the 2-free-project account limit; existing EU project used instead.)
  - Vercel: project `keepsake` (rootDirectory `apps/web`, `ENABLE_EXPERIMENTAL_COREPACK=1`),
    prod: **https://keepsake-nu.vercel.app** — deployed via CLI, HTTP 200.
  - ⚠️ Follow-ups: fill `SUPABASE_SERVICE_ROLE_KEY` + `ANTHROPIC_API_KEY` in
    `apps/web/.env.local` **and** Vercel envs (server-only) · connect the Vercel GitHub app to
    the repo for auto-deploys (one-time browser approval) — until then, deploys are manual
    `vercel deploy --prod`.
- [x] **0.4** Repo hygiene: MIT LICENSE ✓, README stub ✓, `docs/demo-video.md` v0 ✓ (script
  §16.4), CI workflow (biome + tsc + vitest + build) ✓ — badge once CI has run on main.
- [ ] **0.5** Hackathon admin (external, time-sensitive — do not defer):
  - [x] SLP outreach sent → **practitioner response received D2** (a practitioner-trainer organisation —
    detailed feedback folded into Phase 3, see `docs/expert-feedback-2026-07-08.md`; consent
    ask for naming/quote drafted, ⚠️ human: send reply)
  - [ ] "New Work Only" scaffolding question in #questions
  - [ ] Submission-portal mechanics + AI-disclosure rules confirmed
  - [x] ~~Demo domain~~ → free `keepsake-nu.vercel.app` (no-spend rule) · ~~manual order~~ →
    deferred; asked its co-author (Brush) directly in outreach — buy only if proven necessary
  - [ ] SLP outreach emails sent (drafts ready in `docs/slp-outreach.md`, async format)

## Phase 1 — SR engine, the correctness spine (Day 1 PM → Day 2) ⛔

**Pure reducer + injected clock; zero `Date.now()`/`setTimeout` in core (PLAN §8b). Tests first.**

- [x] **1.1** `packages/core/src/sr/` types + named config constants (BASE/MAX/GROWTH,
  BASE_MISSES_TO_END=2, BAD_SESSIONS_TO_RESCOPE=3, UNCLEAR_CAP=2, scheduler numbers §5).
- [x] **1.2** Failing tests encoding the **entire v4 spec** (§4/§5): candidacy pass/advance rules ·
  ladder growth/reset-to-last-success · `unclear` = no correction, no movement, 2→miss ·
  MAX-ceiling handoff · end-on-win (consecutive, resets on success) · session-1 teach step ·
  distinct-day mastery (patient tz) · resume/discard · scheduler gaps + booster cadence ·
  etiology defaults.
- [x] **1.3** Implement reducers until green: `candidacy.ts`, `ladder.ts`, `session.ts`,
  `scheduler.ts`, `etiology.ts`.
- [x] **1.4** Property tests (fast-check): interval ∈ [BASE,MAX] · reset never below last-success ·
  mastery = exactly 3 distinct-day session-starts · `unclear` never moves the ladder · no illegal
  transitions. Seeded RNG (seed 42, reach tripwires so properties can't go vacuous).
- [x] **1.5** `DEMO_SPEED` as injected time-scale at the orchestration boundary — scales the *wait*
  only; **persisted `interval_sec` always real**. Test proves stored data is identical at 1× and 60×.
- [x] **Gate (D2 EOD): engine green, high coverage.** ✅ Done D1: 116 tests green (PR #2 merged),
  purity grep-guard, session↔scheduler integration contract pinned in `scheduler.ts` doc block.
  Engine⇄§8-schema drift notes for P2: `target_state` needs `last_start_success_day`,
  `session_count`, gap in **days** (not hours), `mastered_at`.

## Phase 2 — Data & auth layer (Day 2, overlaps P1)

- [x] **2.1** Migrations in-repo (§8 schema incl. `timezone`, `is_demo`, `is_screening`,
  text+CHECK, FK indexes, `moddatetime`, hard-delete CASCADE, `audit_log`). Engine-drift
  corrections applied: gap in **days**, `mastered_at`, `last_start_success_day`, `session_count`.
- [x] **2.2** **RLS on ALL tables** + cross-tenant denial test (two users, assert zero leakage).
  *Done when:* the denial test is green in CI. ✅ 37 assertions incl. re-parenting attacks +
  positive controls + non-persistence proofs; adversarially security-reviewed; `rls` CI job.
- [x] **2.3** TS typegen from DB + server-action pattern (`requireUser()` → `{data}|{error}` +
  `failAction()` generic-error helper — raw DB errors never reach the client).
- [x] **2.4** Minimal auth (email magic link, single role) + `DEMO_MODE` seeded caregiver
  auto-login (auth stays off the demo critical path). ⚠️ Pre-pilot debt: `signInWithOtp`
  auto-creates users — add `shouldCreateUser: false` + invite flow before any real pilot.
- [x] **2.5** Seed script: Marta (tz, etiology, `is_demo`) + screened target ("granddaughter's
  name" → "Lena") + photo-placeholder + **pre-run trial history** (5 days, engine-driven —
  `pnpm seed`). ⛔ Photo asset itself = §16.2 (Phase 6).
- [x] **2.6** TTS spike: decision in `docs/tts-decision.md` — Web Speech in-product (voice
  heuristic, rate 0.9), edge-tts pre-gen for demo lines. Pre-gen test = D3 with Phase 3.
- [x] **⚠️ Engine debt (found by 2.5) — DECIDED & fixed pre-merge:** the soft cap gates
  *starting* a new distractor interval, never *finishing* one (PLAN §4.2's own
  `withinSessionBounds()`-at-loop-top reading; a started wait always gets its probe — intervals
  are content timing, §8b). Makes the `"ceiling"` scheduler handoff reachable for every
  etiology config. Worst-case session ≈ cap + one in-flight interval (~36 min); caregiver can
  always end sooner.

## Phase 3 — Session kiosk UI (Day 3) ⛔

- [x] **3.1** Kiosk shell with a11y baseline baked in (≥20–24px type, 60px targets, 7:1 contrast,
  reduced-motion, no UI timeouts, no color-only signals — §8b).
- [x] **3.2** Probe screen + **three-state caregiver tap** (recall / miss / unclear).
- [x] **3.3** **Device-delivered errorless-correction screen** (answer on screen → patient repeats). ⛔
- [x] **3.4** Distractor card (static prompts now; Claude-personalized in 4.4) + **visible interval
  clock** + end-on-win flow.
- [x] **3.5** Session persist/resume (trials = source of truth; same-day resume at last-success
  rung, else graceful discard). ✅ Resume verified live against a genuinely crashed session.
- [x] **3.6** Wire trials → Supabase; `DEMO_SPEED` compression profile (first 15s real,
  accelerate >60s — §1b). DB-verified: real `interval_sec` at 60× compression.
- [x] **3.7** Practitioner-feedback fold-in (D2 email — `docs/expert-feedback-2026-07-08.md`):
  caregiver answer hint on probe · no rigid scheduling copy (mastery celebrated, never
  scheduled) · **`interval_override` engine event + "Adjust wait" control** (overrides logged
  as annotations) · session note field · "answer card introduced" annotation.
- [x] **Gate (D3 EOD): full scripted session runs in the browser at demo speed.** ✅ **PASSED D2**
  (a day early): full arc incl. deliberate miss → device correction → override → recovery →
  end-on-win; scheduler handoff verified in DB (gap 1→1.5d on start-probe recall).

## Phase 4 — Claude integration (Day 4)

- [x] **4.1** API plumbing (§8b): forced tool-use + `input_schema` + zod + 1 retry + **hand-entry
  fallback**; prompt cache on the SR-protocol system prompt; versioned prompts in
  `packages/core/prompts/`; `locale` passed through; pinned model IDs + SDK.
- [x] **4.2** AI routes auth-gated + rate-limited (public repo = credit-drain vector). **P0-security.**
- [x] **4.3** **Target wizard**: messy description → phrased target + variants + red-flag check +
  etiology-format rec + **visible self-critique** (rejected draft + reason). ⛔(one wizard call)
  ✂️D5→single call, no self-critique/etiology branch. ✂️D4→3 hand-authored seed targets +
  "Claude reviews your target."
- [x] **4.4** **Vision dual-coding QA** on the seeded photos (cluttered group shot → rejection +
  crop advice). ✂️D5.
- [x] **4.5** Claude-personalized distractor suggestions. ✂️D3 (falls back to static).
- [x] **4.6** Post-session **private debrief** (streamed, copyable). ⛔(one debrief call)
- [x] **4.7** Golden-set evals (~10 messy inputs → code-side red-flag/length rules pass); prompt
  tuning capped to this set.
- [ ] **4.8** SLP call happens ≤ today; fold feedback into defaults/copy; get named-user consent
  for quote/cameo.
- [x] **Gate (D4 EOD): wizard → session → debrief end-to-end** ✅ **PASSED D2 (local)** — all four beats live incl. RCT-in-a-box (5.6 pulled forward, streamed with correct numbers from real logs). Prod-URL verification pending deploy (manual until Vercel GitHub app connected).

## Phase 5 — Polish & feature freeze (Day 5; freeze 12:00)

- [x] **5.1** Per-target **acquisition chart** (non-color-reliant, describable). ⛔ ✅ **D2** (PR #8:
  log-scale SVG, no chart dep, grayscale-verified, aria summary + table twin; downbeat-summary copy
  fix in PR #11).
- [x] **5.2** a11y pass: axe run + keyboard/screen-reader once-over. ✅ **D2** (PR #11: Lighthouse
  a11y 100 on all 7 surfaces; evidence in docs/a11y-pass-2026-07-08.md; NVDA ear-pass still
  recommended before the film).
- [x] **5.3** Wellness-safe copy + crisis footer + "not a medical device" (EN; PL machine-translated
  only if ahead). ✅ **D2** (PR #6: audit found existing copy already clean; footer added; PL not done).
- [x] **5.4** Patient-affect two-tap capture (pre/post) — only if on schedule. ✂️D3. ✅ **D2** (PR #9:
  content/unsettled text columns via new migration — supersedes the smallint 1–5 sketch; skippable,
  never blocks the flow).
- [x] **5.5** **Canned-replay Claude fixtures** recorded from real outputs (wizard, self-critique,
  vision, debrief, RCT-in-a-box answer) for film takes + live final. ⛔ for the recording. ✅ **D2**
  (vision recorded once lena.jpg existed — verdict "good"; per-kind recording via
  `pnpm fixtures:record <kind>`; grade fixture is a placeholder until one live record run).
- [x] **5.6** *(pulled forward to D2, Phase 4)* **RCT-in-a-box mini study report** (§1b v4.1 jaw-drop — now MVP, in the never-cut
  chain): Claude analyzes real trial logs → acquisition rate, retention/decay, interval band,
  booster rec, n=1 caveats. Live on camera if on schedule; **degrades to fixture-replay, never
  cut.** Build the analysis prompt + rendering D4–D5; record fixture at D5 freeze.
- [ ] **5.7** Extended-thinking etiology beat (§1b #8) — moved out of the film to README/live-final
  Q&A; only build UI for it if D5 is ahead of schedule.
- [ ] **5.8 Gate (D5 PM, mandatory): scratch recording of the full beat sheet — watch it, fix
  what reads badly.** SLP drop-dead decision.

**Beyond-plan items shipped D2 (V1 pulls, all merged):** V1 speech-graded recall (PR #12 — ASR →
fuzzy → Haiku fallback, flag `NEXT_PUBLIC_SPEECH=1`, default OFF), practice-due status on dashboard
(PR #13 — booster-loop visibility), kiosk speech layer (PR #14 — device speaks the correction per
docs/tts-decision.md, mute toggle, DEMO_MODE mp3 swap; **not yet auditioned by ear**), AI-quality
batch (PR #10 — alias dedupe, vision gets target context, golden set confirmed 10/10).
**Deploy debt:** prod (keepsake-nu.vercel.app) still runs Phase 2; remote Supabase needs the three
new migrations (affect_two_tap, ai_usage_grade_kind, api_role_grants) via `supabase db push` before
or with the next `vercel deploy --prod`.

## Phase 6 — The film & the repo (Day 6) ⛔

- [ ] **6.1** Assets final (§16.2): persona photos, graphics (title / v1→v2→v3 slide / closing
  card / thumbnail), pre-gen audio lines, music bed.
- [ ] **6.2** **Record per-beat takes** (§16.3, morning) → edit → captions → QA checklist §16.5
  (incl. **cold-viewer test**) → upload + verify.
- [ ] **6.3** README to rubric spec: problem · named user · **Claude-usage map table** ·
  architecture · **clone→env→seed→run in 5 min (verified from a clean clone)** · research trail ·
  honest limitations · tests badge.
- [ ] **6.4** `docs/research-trail.md` (v1→v2→v3 scannable in 30s) + `docs/dataset-spec.md` +
  example CSV (Gladstone artifact).
- [ ] **6.5** Draft the 100–200-word summary (impact + Claude-use forward).

## Phase 7 — Submit & live final (Day 7 = Jul 13 → Jul 16)

- [ ] **7.1** Pickups/re-records only; no new features.
- [ ] **7.2** Final verification: prod URL = video build · secrets-clean history · seed works from
  clean clone · LICENSE · links live.
- [ ] **7.3** **Submit early afternoon local** (deadline = 03:00 Jul 14 CEST). Tag release.
- [ ] **7.4** Jul 14–15: live-final cut (§16.6, ~15% tighter) + 30s appendix slide + live-safe
  demo path (seeded prod, canned-Claude toggle). Update HANDOFF.md with outcomes.

## Phase 8 — Post-hackathon / V1 runway (no dates; PLAN §12 V1 + §13)

- [ ] V1 speech assist (§9) · pre-gen TTS · etiology-adaptive protocol · photo upload + consent copy
- [ ] Booster/between-session **UI** (engine already tested) · trend view ("show data, never
  diagnosis") · multi-patient + clinician read-only + CSV export
- [ ] PL native copy QA · coaching chat with anti-sycophancy guardrails · Sentry
- [ ] **Dual-consent flow + DPIA + Polish counsel sign-off** → then the 3–5-dyad pilot (§13
  measures: fidelity gap, adherence curve, Zarit, competence, relationship, affect, retention ±
  boosters, dropout interviews)
