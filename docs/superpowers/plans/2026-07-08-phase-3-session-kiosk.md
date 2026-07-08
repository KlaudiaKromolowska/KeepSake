# Phase 3 — Session Kiosk UI Implementation Plan (v2, expert-feedback fold-in)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A caregiver-facing kiosk UI that runs a full §4.2 SR session in the browser — probe →
three-state tap → device-delivered errorless correction → distractor card with a visible interval
clock → end-on-win — persisting every trial to Supabase and resuming same-day interruptions.
v2 folds in practitioner feedback received 2026-07-08 (see `docs/expert-feedback-2026-07-08.md`):
caregiver-visible answer, **manual interval override mid-session**, session notes, answer-card
annotation, and no rigid scheduling copy.

**Architecture:** The pure SR engine (`@keepsake/core/sr`) gains ONE new event
(`interval_override`, Task 2 — TDD, purity rules unchanged); everything else in core stays
untouched. A plain-TS `SessionRunner` wraps `sessionReduce`, injects the real clock, and
schedules the distractor waits through a `DEMO_SPEED` compression profile. React components
render one screen per engine `phase`. Server actions (requireUser + zod, RLS user client)
persist trials as they happen and write the `target_state`/scheduler handoff at session end. The
serialized `SessionState` snapshot rides in `sessions.summary` for same-day resume.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4 (CSS-first), Vitest, zod,
supabase-js (existing patterns only — **no new dependencies**).

## Global Constraints

Copied verbatim from PLAN.md §4.2/§1b/§8b, CLAUDE.md, Phase-2 conventions, and the 2026-07-08
practitioner-feedback rulings. Every task's requirements implicitly include this section.

- **Engine purity:** `packages/core` is modified ONLY by Task 2 (the `interval_override` event),
  test-first. Zero `Date.now()`/`setTimeout` in core; the web layer injects timestamps into
  events (`at: Date.now()` at dispatch time) and owns all timers. The purity grep-guard and the
  full existing core suite must stay green.
- **`DEMO_SPEED` scales only the wall-clock wait, never persisted data.** Persisted
  `interval_sec` and all engine state are always real. Compression profile (PLAN §1b): intervals
  **≤ 60s play in real time** (the first 15s interval plays REAL with a visible interval clock);
  only intervals **> 60s** are scaled via `scaleWaitMs(realMs, demoSpeed)` from
  `@keepsake/core/sr`.
- **No database migrations.** The Phase-2 schema is frozen for this phase; new payloads
  (session note, annotations) ride in the existing `sessions.summary` jsonb. Every writer of
  `summary` merges into the existing object (`{ ...existing, ...patch }`) — never blind
  overwrite.
- **A11y floors (PLAN §8b) on every screen:** base body text ≥ 20px (`text-xl`) with primary
  copy ≥ 24px (`text-2xl`); primary content (question/answer) far larger; touch targets ≥ 60px
  (`min-h-[64px]`) with generous spacing; AAA 7:1 contrast for text (primary `text-zinc-900`,
  secondary no lighter than `text-zinc-700` on white); honor `prefers-reduced-motion`
  (`motion-reduce:` variants — countdown falls back to numeric-only); **no timeouts on
  caregiver UI actions** (protocol intervals are content timing — the distractor wait
  auto-advances, but no probe/correction/teach screen ever times out); **no color-only
  signals** (every outcome button = icon + text label); semantic HTML, `<h1>` per screen,
  focus moved to the heading on phase change.
- **Wellness-safe copy:** no disease naming in-product, no "wrong"/"fail"/"error" words, never a
  red X, miss button is neutral-colored. **No rigid scheduling copy anywhere** (practitioner
  ruling: no "next check-in: tomorrow" / cadence nags — acquisition shows in daily life; the
  scheduler stays engine-only data). All user-facing strings live in
  `apps/web/src/lib/session/copy.ts` (single module — next-intl retrofit lands later; do not
  hardcode strings in components).
- **The caregiver always sees question AND answer** (practitioner ruling): the probe screen
  carries a discreet labeled answer hint so the caregiver can focus on the interaction.
- **Device delivers the correction:** the correction screen shows the answer for the PATIENT to
  read off the screen; the caregiver only confirms ("We said it together").
- **Interval overrides are first-class data:** every manual override is logged into
  `sessions.summary.annotations` with from/to/timestamp — protocol deviations must be visible
  to later analysis, never silent.
- **Server-action pattern (Phase 2):** every action is `"use server"`, validates `input:
  unknown` with a zod `.strict()` schema via `safeParse`, calls `requireUser()` from
  `@/lib/actions`, uses the RLS **user** client only (never `createAdminClient`), and returns
  `ActionResult<T>` via `failAction(logLabel, error, userMessage)` — raw DB errors never reach
  the client.
- **Trials = source of truth.** Each trial row is inserted when the engine records it; the
  `SessionState` snapshot in `sessions.summary` is a resume convenience validated with zod
  before it is ever fed back to `resumeSession`.
- **Sessions always end on a win** — the engine guarantees it; the UI must faithfully render the
  `end_on_win` phase, never skip it.
- **No new dependencies.** No `dangerouslySetInnerHTML`. Delete replaced code. TDD: failing test
  first for every non-trivial function. Biome + `tsc --noEmit` run on pre-commit (lefthook);
  full suite on pre-push.
- Import the engine only via `@keepsake/core/sr` (transpilePackages is already configured).

## File Structure

```
packages/core/src/sr/session.ts        # Task 2 ONLY: + interval_override event (TDD)
apps/web/src/lib/session/
  schema.ts          # zod schemas: outcome, TrialRecord, TargetProgress, SessionState snapshot, action inputs
  actions.ts         # startSession / recordTrial / endSession / saveSessionNote / annotateSession
  wait-policy.ts     # demoWaitMs() compression profile + ladderRungs() (pure)
  runner.ts          # SessionRunner (plain TS, injected clock/timers)
  use-session-runner.ts  # thin React hook over SessionRunner
  copy.ts            # ALL kiosk strings (EN)
  distractors.ts     # static distractor prompts, deterministic rotation
apps/web/src/components/session/
  session-view.tsx   # client orchestrator: runner + per-phase screen + persistence + side controls
  outcome-buttons.tsx
  probe-screen.tsx   # question + photo + caregiver answer hint + outcome buttons
  answer-screen.tsx  # shared by teach / correction / end_on_win (copy varies)
  distractor-card.tsx  # prompt + interval clock + "Adjust wait" override control
  end-screen.tsx     # phase "ended" summary + mastered line + session-notes field
apps/web/src/app/(app)/session/page.tsx  # server component: load target/openSession, pre-session screen
```

---

### Task 1: Session data layer — zod schemas + server actions + scheduler handoff

**Files:**
- Create: `apps/web/src/lib/session/schema.ts`
- Create: `apps/web/src/lib/session/actions.ts`
- Test: `apps/web/src/lib/session/schema.test.ts`, `apps/web/src/lib/session/actions.test.ts`

**Interfaces:**
- Consumes (from `@keepsake/core/sr`): `SessionState`, `TargetProgress`, `TrialRecord`,
  `SrConfig`, `startSession(progress, {at, timeZone}, config)`, `canResume(state, at)`,
  `resumeSession(state, at, config)`, `defaultsForEtiology(etiology)`,
  `afterCeilingHandoff(at, config)`, `afterMastery(at, config)`,
  `onSessionStartOutcome(state, outcome, at, config)`, `ScheduleState`.
  From `@/lib/actions`: `requireUser`, `failAction`, `ActionResult<T>`.
- Produces (Tasks 5 relies on these exact names):
  ```ts
  export interface SessionTarget { id: string; question: string; answer: string; imageUrl: string | null }
  export interface StartSessionResult {
    sessionId: string; state: SessionState; target: SessionTarget; config: SrConfig; resumed: boolean;
  }
  export async function startSessionAction(input: unknown): Promise<ActionResult<StartSessionResult>>
  export async function recordTrialAction(input: unknown): Promise<ActionResult<null>>
  export async function endSessionAction(input: unknown): Promise<ActionResult<null>>
  export async function saveSessionNoteAction(input: unknown): Promise<ActionResult<null>>
  export async function annotateSessionAction(input: unknown): Promise<ActionResult<null>>
  ```

**Steps:**

- [ ] **Step 1: Write failing schema tests** (`schema.test.ts`): valid round-trip of a real
  `SessionState` produced by `startSession(...)` from core; rejection of: extra keys (strict),
  negative `intervalSec`, unknown `phase`, malformed `startedDay`, trials array > 500,
  non-integer `at`; annotation input accepts both kinds and rejects unknown `kind`; note
  length cap. Run `pnpm --filter web test` → FAIL (module missing).

- [ ] **Step 2: Implement `schema.ts`** — exact schemas:

```ts
import { z } from "zod";

export const outcomeSchema = z.enum(["recall", "miss", "unclear"]);

export const trialRecordSchema = z.object({
  intervalSec: z.number().int().min(0).max(86_400),
  outcome: outcomeSchema,
  isScreening: z.boolean(),
  corrected: z.boolean(),
  at: z.number().int().positive(),
}).strict();

export const targetProgressSchema = z.object({
  lastSuccessSec: z.number().int().min(0).nullable(),
  startStreak: z.number().int().min(0),
  lastStartSuccessDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  badSessions: z.number().int().min(0),
  mastered: z.boolean(),
  sessionCount: z.number().int().min(0),
}).strict();

export const sessionStateSchema = z.object({
  phase: z.enum(["teach", "distractor", "awaiting_probe", "correcting", "end_on_win", "ended"]),
  intervalSec: z.number().int().min(0),
  baseMisses: z.number().int().min(0),
  unclearRun: z.number().int().min(0),
  startedAt: z.number().int().positive(),
  startedDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().min(1),
  isStartProbe: z.boolean(),
  progress: targetProgressSchema,
  trials: z.array(trialRecordSchema).max(500),
  endReason: z.enum(["ceiling", "struggle", "caregiver", "mastered"]).nullable(),
  handoffToScheduler: z.boolean(),
  rescopeRequired: z.boolean(),
}).strict();

export const startSessionInputSchema = z.object({ targetId: z.string().uuid() }).strict();
export const recordTrialInputSchema = z.object({
  sessionId: z.string().uuid(),
  targetId: z.string().uuid(),
  trial: trialRecordSchema,
  snapshot: sessionStateSchema,
}).strict();
export const endSessionInputSchema = z.object({
  sessionId: z.string().uuid(),
  targetId: z.string().uuid(),
  snapshot: sessionStateSchema,
}).strict();
export const saveSessionNoteInputSchema = z.object({
  sessionId: z.string().uuid(),
  note: z.string().min(1).max(2000),
}).strict();
export const annotateSessionInputSchema = z.object({
  sessionId: z.string().uuid(),
  kind: z.enum(["answer_card", "interval_override"]),
  note: z.string().max(300).optional(),
  fromSec: z.number().int().min(0).optional(),
  toSec: z.number().int().min(0).optional(),
  at: z.number().int().positive(),
}).strict();
```

  **Important:** before finalizing, open `packages/core/src/sr/session.ts` and `types.ts` and
  verify every field name/type above matches `SessionState`/`TargetProgress`/`TrialRecord`
  exactly (they were transcribed from the current source — if core differs, core wins). Run
  tests → PASS. Commit `feat(web): session state zod schemas`.

- [ ] **Step 3: Write failing action tests** (`actions.test.ts`), following the existing mock
  pattern in `apps/web/src/lib/patients/actions.test.ts` (`vi.mock("@/lib/actions", ...)` +
  chained supabase client mock). Cases:
  1. `startSessionAction` fresh start: no open session → inserts `sessions` row with
     `summary.snapshot` = initial state and `summary.startProbe` = `state.isStartProbe`;
     returns `resumed: false`, config derived from patient etiology.
  2. Same-day open session with valid snapshot → `resumeSession` path, `resumed: true`, no new
     row inserted, snapshot updated.
  3. Stale (previous-day) open session → closed gracefully (`ended_at` set,
     `summary.discarded: true`) AND a fresh session started.
  4. Open session with corrupt snapshot (zod fails) → treated as stale-discard, fresh start.
  5. Target not active/maintenance → error result (no throw).
  6. `recordTrialAction`: inserts trial row mapping `TrialRecord` → columns
     (`interval_sec`, `outcome`, `is_screening`, `corrected`, `at: new Date(trial.at).toISOString()`)
     and updates `sessions.summary` by MERGE (snapshot replaced, other keys preserved); zod
     rejection on bad input returns error result.
  7. `endSessionAction`: rejects snapshot with `phase !== "ended"`; already-ended session →
     `{ data: null, error: null }` no-op (idempotent); writes `ended_at`, summary stats.
  8. `endSessionAction` scheduler mapping — four branches (assert exact `target_state` update
     payloads): (a) `endReason: "mastered"` → `afterMastery`, `targets.status = "mastered"`,
     `mastered_at` set; (b) no existing schedule + `endReason: "ceiling"` →
     `afterCeilingHandoff`; (c) existing schedule + session had a start probe whose first trial
     was `recall` → `onSessionStartOutcome` result persisted; (d) existing schedule, no start
     probe (session 1) → schedule unchanged.
  9. `saveSessionNoteAction`: merges `note` into existing summary (other keys preserved);
     rejects empty/oversized note.
  10. `annotateSessionAction`: appends to `summary.annotations` array (creates it when absent,
     preserves existing entries and other summary keys).
  Run → FAIL.

- [ ] **Step 4: Implement `actions.ts`.** Shape (follow the createPatient action structure —
  safeParse → requireUser → RLS queries → failAction):

```ts
"use server";
// startSessionAction outline
const parsed = startSessionInputSchema.safeParse(input);            // join issues on failure
const { user, supabase } = await requireUser();
// target + patient via RLS: targets!inner join patients (need question/answer/image_url/status,
// patient timezone + etiology). Reject unless status in ("active","maintenance").
const config = defaultsForEtiology(patient.etiology).config;
const now = Date.now();
// open session: sessions where patient_id = X and ended_at is null, newest first
//   snapshot = sessionStateSchema.safeParse(open.summary?.snapshot)
//   if valid && canResume(snapshot, now): state = resumeSession(snapshot, now, config)
//     if state: update summary.snapshot = state (merge) → return { resumed: true, ... }
//   otherwise: update open row { ended_at: iso(now), summary: { ...summary, discarded: true } }
// fresh: progress = rowToProgress(target_state row for targetId)  // null row → zeroed progress
const state = startSession(progress, { at: now, timeZone: patient.timezone }, config);
// insert sessions { patient_id, started_at: iso(now), summary: { snapshot: state, startProbe: state.isStartProbe } }
```

  `rowToProgress` (private helper): `last_success_interval_sec → lastSuccessSec`,
  `start_streak → startStreak`, `last_start_success_day → lastStartSuccessDay`,
  `bad_sessions → badSessions`, `mastered: mastered_at !== null`, `session_count → sessionCount`.

  `endSessionAction` scheduler block — implement exactly this logic (the session↔scheduler
  contract is documented in `packages/core/src/sr/scheduler.ts` lines 4–24 — read it first):

```ts
const at = Date.now();
const sessionRow = /* fetch by id; if ended_at already set → return { data: null, error: null } */;
const startProbe = sessionRow.summary?.startProbe === true;
const existing: ScheduleState | null = row.schedule_mode
  ? { mode: row.schedule_mode, gapDays: row.between_session_gap_days,
      boosterStep: row.booster_step, nextDueAt: Date.parse(row.next_due_at) }
  : null;
let sched = existing;
if (snapshot.endReason === "mastered") {
  sched = afterMastery(at, config);                    // between-mode result discarded per contract
} else {
  if (existing && startProbe && snapshot.trials.length > 0) {
    sched = onSessionStartOutcome(existing, snapshot.trials[0].outcome, at, config).state;
  }
  if (!existing && snapshot.endReason === "ceiling") sched = afterCeilingHandoff(at, config);
}
// target_state update: all progress fields verbatim + (sched ? schedule columns : leave null)
// + mastered_at: progress.mastered && !row.mastered_at ? iso(at) : row.mastered_at
// targets.status = "mastered" when progress.mastered
// sessions update: ended_at: iso(at), summary MERGE: { snapshot, stats: { recalls, misses, unclears,
//   endReason: snapshot.endReason, rescopeRequired: snapshot.rescopeRequired } }
```

  `saveSessionNoteAction` / `annotateSessionAction`: fetch the session row fresh (RLS), merge
  `{ ...summary, note }` / `{ ...summary, annotations: [...(summary.annotations ?? []), entry] }`,
  update. (`entry` = the validated input minus `sessionId`.) Run tests → PASS. Commit
  `feat(web): session server actions + scheduler handoff`.

- [ ] **Step 5: Self-review** against the Global Constraints (RLS user client only, no raw
  errors to client, summary always merged, no core edits) and re-run
  `pnpm --filter web test` + `pnpm typecheck`. Commit any fixes.

### Task 2: Engine — `interval_override` session event (practitioner-requested, TDD)

**Files:**
- Modify: `packages/core/src/sr/session.ts` (event union + reducer case)
- Test: `packages/core/src/sr/session.test.ts` (extend), `packages/core/src/sr/invariants.property.test.ts` (extend the event generator)

**Interfaces:**
- Produces (Tasks 3/5 rely on this): new member of `SessionEvent`:
  ```ts
  | { type: "interval_override"; intervalSec: number; at: number }
  ```
  Semantics (pinned — encode as tests): valid ONLY while `phase === "distractor"` (it adjusts
  the gap currently being waited out); in every other phase it is an identity no-op (same
  object-equality convention the reducer already uses for no-ops). Effect:
  `intervalSec = clamp(round(event.intervalSec), config.baseIntervalSec, config.maxIntervalSec)`.
  Nothing else changes: `unclearRun`, `baseMisses`, `progress`, `trials` untouched — the
  override moves the CURRENT rung only; provenance logging is the web layer's job
  (`sessions.summary.annotations`).

**Steps:**

- [ ] **Step 1: Read the reducer first.** Read `session.ts` fully; match its existing no-op and
  clamping conventions exactly (do not invent new helpers if `ladder.ts` already exposes
  suitable clamps).
- [ ] **Step 2: Failing tests** in `session.test.ts`:
  1. Override during `distractor` sets `intervalSec` to the given value (in-bounds case).
  2. Clamps below `baseIntervalSec` up to base; above `maxIntervalSec` down to max;
     non-integer values are rounded.
  3. Identity no-op in `teach`, `awaiting_probe`, `correcting`, `end_on_win`, `ended`.
  4. Recall after an overridden interval sets `progress.lastSuccessSec` to the overridden
     value and the next interval grows from it (`min(override × growth, max)`).
  5. Miss after an overridden interval reverts to `lastSuccessSec` exactly as before
     (override does not corrupt the reset rule).
  6. Override does not touch `unclearRun`/`baseMisses`/`trials`.
  Run `pnpm --filter @keepsake/core test` → FAIL.
- [ ] **Step 3: Implement** the reducer case (a few lines). Run → PASS.
- [ ] **Step 4: Extend the property-test event generator** in
  `invariants.property.test.ts` to emit `interval_override` events with arbitrary
  `intervalSec` (including out-of-range and float values) so the existing invariants
  (interval ∈ [BASE, MAX], reset never below last-success, `unclear` never moves the ladder,
  no illegal transitions) now also hold under overrides. Run the FULL core suite including
  the purity guard → all green (116+ tests).
- [ ] **Step 5: Commit** `feat(core): interval_override session event (practitioner feedback 2026-07-08)`.

### Task 3: Wait policy + SessionRunner (orchestration core, plain TS)

**Files:**
- Create: `apps/web/src/lib/session/wait-policy.ts`
- Create: `apps/web/src/lib/session/runner.ts`
- Create: `apps/web/src/lib/session/use-session-runner.ts`
- Test: `apps/web/src/lib/session/wait-policy.test.ts`, `apps/web/src/lib/session/runner.test.ts`

**Interfaces:**
- Consumes: `sessionReduce`, `SessionState`, `SessionEvent` (incl. Task 2's
  `interval_override`), `SrConfig`, `Outcome`, `scaleWaitMs` from `@keepsake/core/sr`.
- Produces (Tasks 4/5 rely on these exact names):

```ts
// wait-policy.ts
export const REALTIME_MAX_SEC = 60;
export function demoWaitMs(intervalSec: number, demoSpeed: number): number;
export function ladderRungs(config: SrConfig): number[];  // base, base×g, … capped+deduped at max (rounded ints)

// runner.ts
export interface RunnerDeps {
  now(): number;
  setTimer(ms: number, fn: () => void): () => void;   // returns a cancel function
  demoSpeed: number;
  config: SrConfig;
  onChange(state: SessionState, event: SessionEvent): void;
}
export interface CurrentWait { startedAtMs: number; durationMs: number; intervalSec: number }
export class SessionRunner {
  constructor(initial: SessionState, deps: RunnerDeps);
  readonly state: SessionState;
  readonly currentWait: CurrentWait | null;   // non-null only while phase === "distractor"
  probe(outcome: Outcome): void;              // dispatches { type: "probe_result", outcome, at: now() }
  teachDone(): void;                          // { type: "teach_done" } — also used for end_on_win confirm
  correctionDone(): void;
  endRequested(): void;
  overrideInterval(intervalSec: number): void; // { type: "interval_override", intervalSec, at: now() }
  dispose(): void;                            // cancels any pending timer
}

// use-session-runner.ts
export function useSessionRunner(
  initial: SessionState, config: SrConfig, demoSpeed: number,
  onChange: (state: SessionState, event: SessionEvent) => void,
): { state: SessionState; currentWait: CurrentWait | null; runner: SessionRunner };
```

**Steps:**

- [ ] **Step 1: Failing wait-policy tests:** `demoWaitMs(15, 60) === 15_000`,
  `demoWaitMs(30, 60) === 30_000`, `demoWaitMs(60, 60) === 60_000` (≤60s always real),
  `demoWaitMs(120, 60) === scaleWaitMs(120_000, 60)`, `demoWaitMs(960, 60) === scaleWaitMs(960_000, 60)`,
  `demoWaitMs(120, 1) === 120_000`, non-finite/≤1 speed behaves as 1× (delegate to `scaleWaitMs`).
  `ladderRungs`: default config (base 15, ×2, max 960) → `[15,30,60,120,240,480,960]`;
  growth 1.5 config → rounded ints, strictly increasing, first = base, last = max, no
  duplicates. Run → FAIL.

- [ ] **Step 2: Implement wait-policy** (delegating to core's `scaleWaitMs`, no reimplementation):

```ts
import { scaleWaitMs, type SrConfig } from "@keepsake/core/sr";
export const REALTIME_MAX_SEC = 60;
export function demoWaitMs(intervalSec: number, demoSpeed: number): number {
  const realMs = intervalSec * 1000;
  return intervalSec <= REALTIME_MAX_SEC ? realMs : scaleWaitMs(realMs, demoSpeed);
}
export function ladderRungs(config: SrConfig): number[] {
  const rungs: number[] = [];
  for (let sec = config.baseIntervalSec; sec < config.maxIntervalSec; sec *= config.growthFactor) {
    const r = Math.round(sec);
    if (rungs.at(-1) !== r) rungs.push(r);
  }
  if (rungs.at(-1) !== config.maxIntervalSec) rungs.push(config.maxIntervalSec);
  return rungs;
}
```

  Run → PASS. Commit `feat(web): DEMO_SPEED wait compression profile + ladder rungs`.

- [ ] **Step 3: Failing runner tests** with hand-rolled fake deps (a `FakeTimers` array of
  `{ms, fn, cancelled}` + a settable clock — no vi.useFakeTimers needed since timers are
  injected). Drive a real `SessionState` from `startSession(...)`:
  1. Construction in `distractor` phase schedules exactly one timer for
     `demoWaitMs(state.intervalSec, demoSpeed)`; firing it dispatches `wait_elapsed` and lands
     in `awaiting_probe`.
  2. `probe("recall")` → new state; if new phase is `distractor`, a new timer is scheduled with
     the grown interval; `currentWait` reflects `{startedAtMs, durationMs, intervalSec}`.
  3. `probe("unclear")` → re-enters distractor at the SAME `intervalSec` (engine behavior —
     assert the scheduled duration is unchanged).
  4. `overrideInterval(sec)` mid-wait cancels the pending timer and schedules a fresh one for
     `demoWaitMs(clampedSec, demoSpeed)`; `currentWait` reflects the new interval; an
     override in `awaiting_probe` schedules nothing (engine no-op).
  5. Phase leaving `distractor` by any event (e.g. `endRequested()` mid-wait) cancels the
     pending timer (assert `cancelled === true`) and `currentWait` becomes null.
  6. `onChange` fires once per dispatched event with the post-reduce state.
  7. `dispose()` cancels pending timers; dispatch after `dispose()` is a silent no-op
     (assert it).
  8. Terminal `ended` state never schedules a timer.
  Run → FAIL.

- [ ] **Step 4: Implement `runner.ts`.** Core shape: single private `dispatch(event)` that runs
  `sessionReduce`, calls `onChange`, then reconciles timers: cancel pending; if
  `state.phase === "distractor"`, schedule `setTimer(demoWaitMs(state.intervalSec, demoSpeed),
  () => this.dispatch({ type: "wait_elapsed", at: deps.now() }))` and set `currentWait`.
  Constructor runs the same reconciliation on the initial state. When a dispatch produces an
  identity no-op state in `distractor` (e.g. out-of-phase events), do NOT restart the running
  timer — only reconcile when the state object actually changed. Run → PASS. Commit
  `feat(web): SessionRunner orchestration with injected clock/timers`.

- [ ] **Step 5: Implement `use-session-runner.ts`** (thin, no separate unit test — logic lives
  in the class): instantiate once via `useState(() => new SessionRunner(...))` with real deps
  (`now: () => Date.now()`, `setTimer` via `setTimeout`/`clearTimeout`), re-render on
  `onChange` via a state counter, `dispose` on unmount. Keep the caller's `onChange` in a ref
  so a re-render never re-instantiates the runner. `pnpm typecheck` green. Commit.

### Task 4: Kiosk screens — probe + answer hint, three-state tap, answer screen, distractor card + clock + adjust-wait, end screen + notes

**Files:**
- Create: `apps/web/src/lib/session/copy.ts`
- Create: `apps/web/src/lib/session/distractors.ts`
- Create: `apps/web/src/components/session/outcome-buttons.tsx`
- Create: `apps/web/src/components/session/probe-screen.tsx`
- Create: `apps/web/src/components/session/answer-screen.tsx`
- Create: `apps/web/src/components/session/distractor-card.tsx`
- Create: `apps/web/src/components/session/end-screen.tsx`
- Test: `apps/web/src/lib/session/distractors.test.ts`

**Interfaces:**
- Consumes: `Outcome` from `@keepsake/core/sr` ONLY (deliberately independent of Tasks 1–3 so
  it can run in parallel).
- Produces (Task 5 composes these — exact props):

```tsx
export function ProbeScreen(props: { question: string; answer: string; imageUrl: string | null;
  onOutcome: (o: Outcome) => void }): JSX.Element;
export type AnswerVariant = "teach" | "correction" | "end_on_win";
export function AnswerScreen(props: { variant: AnswerVariant; question: string; answer: string;
  imageUrl: string | null; onDone: () => void }): JSX.Element;
// DistractorWait is defined HERE (not imported from the runner) so this task has zero
// dependency on Task 3; the runner's CurrentWait is structurally identical and Task 5 passes
// it straight through.
export interface DistractorWait { startedAtMs: number; durationMs: number; intervalSec: number }
export function DistractorCard(props: { prompt: string; wait: DistractorWait; rungOptions: number[];
  onOverride: (sec: number) => void }): JSX.Element;
export function EndScreen(props: { recalls: number; trials: number; mastered: boolean;
  rescopeRequired: boolean; onSaveNote: (note: string) => Promise<boolean>;
  onHome: () => void }): JSX.Element;
```

**Steps:**

- [ ] **Step 1: `copy.ts`** — every string the session UI shows, as a flat `export const
  SESSION_COPY = { ... } as const` object. Required entries (wellness-safe wording, final):
  - probe: heading `"Time to ask"`, caregiverPrompt `"Ask the question, then tap what happened."`,
    answerHint `"The answer is"` (rendered with the answer — caregiver reference)
  - outcomes: recall `"Remembered"`, miss `"Not this time"`, unclear `"Couldn't tell"`
  - teach: heading `"Let's learn this together"`, instruction `"Read the answer out loud together."`, done `"Done — let's begin"`
  - correction: heading `"Here's the answer"`, reassurance `"That's okay — it comes with practice."`, instruction `"Say it together, gently."`, done `"We said it together"`
  - endOnWin: heading `"One more time — together"`, instruction `"Say it together one last time."`, done `"We said it"`
  - distractor: heading `"While we wait"`, clockLabel `"Next question in"`, hint `"Keep chatting — the screen will tell you when it's time."`, adjustWait `"Adjust wait"`, adjustWaitHint `"Pick a different wait if it suits the moment."`
  - ended: heading `"Session complete"`, stats handled in component (`"Practised {trials} times · remembered {recalls}"`), closeLine `"Lovely work today. Practise again whenever suits you both."` (NO scheduling language), masteredLine `"Wonderful — this memory has taken hold."`, rescope `"This memory might need a different shape. We'll help you adjust it soon."`, notesLabel `"Session notes (just for you)"`, notesSave `"Save note"`, notesSaved `"Saved"`, home `"Back to home"`
  - annotations: answerCard `"Answer card"`, answerCardPrompt `"What does the card say?"`, answerCardSave `"Log the card"`
  - preSession: begin `"Begin today's session"`, resume `"Resume this morning's session"`
  - shared: endSession `"End session"`, saveError `"Couldn't save — check connection"`, retry `"Retry"`
  No component may contain a literal user-facing string.

- [ ] **Step 2: `distractors.ts` + failing test:** `export const DISTRACTOR_PROMPTS: readonly
  string[]` — 8 calm, concrete conversation prompts (e.g. `"Ask what they'd like for lunch
  today."`, `"Look out the window together — what's the weather doing?"`, `"Ask about a
  favourite song and hum a little of it."` — write all 8, warm and concrete, no quiz-like
  memory demands). `export function distractorForTrial(trialCount: number): string` —
  deterministic rotation `DISTRACTOR_PROMPTS[trialCount % length]` (demo reproducibility, no
  RNG). Test: rotation wraps, deterministic, all prompts non-empty and ≤ 90 chars. PASS →
  commit.

- [ ] **Step 3: Components.** Shared kiosk conventions (apply to all):
  full-height section `flex min-h-dvh flex-col items-center justify-center gap-8 bg-white
  px-6 text-center text-zinc-900` (kiosk deliberately forces light theme for demo
  consistency); `<h1 tabIndex={-1} className="text-3xl font-semibold">` receives focus from
  SessionView on phase change; body text `text-2xl text-zinc-700` minimum; buttons `min-h-[64px]
  rounded-2xl px-8 text-2xl font-medium focus-visible:outline-4 focus-visible:outline-offset-2
  focus-visible:outline-zinc-900`.
  - **`outcome-buttons.tsx`:** three buttons in a row (`flex flex-wrap gap-6 justify-center`),
    each ≥ 64px tall with icon + label (never color alone): Remembered = ✓ (inline SVG check)
    `border-2 border-emerald-700 bg-emerald-50 text-emerald-900`; Not this time = ↻ (inline SVG
    arrow-path) `border-2 border-zinc-500 bg-zinc-50 text-zinc-900` (neutral — NEVER red);
    Couldn't tell = ? (inline SVG) `border-2 border-amber-700 bg-amber-50 text-amber-900`.
  - **`probe-screen.tsx`:** question `text-5xl font-semibold leading-tight max-w-3xl`; photo
    (`next/image` if `imageUrl`, `rounded-3xl`, alt from question context, max-h ~40vh);
    caregiver prompt line; **answer hint**: a visually quiet but ≥20px block near the
    caregiver controls — `<p className="text-xl text-zinc-700">{answerHint}
    <strong className="text-zinc-900">{answer}</strong></p>`; `<OutcomeButtons onOutcome={...} />`.
  - **`answer-screen.tsx`:** variant-keyed copy from `SESSION_COPY`; question `text-3xl
    text-zinc-700`; **answer `text-7xl font-bold`** (the patient reads THIS off the screen);
    photo; instruction line; single Done button (`border-2 border-zinc-900 bg-zinc-900
    text-white` — 21:1). No auto-advance, no timeout.
  - **`distractor-card.tsx`:** prompt `text-4xl leading-snug max-w-2xl`; interval clock:
    remaining REAL seconds derived from wall progress —
    `remainingRealSec = Math.ceil(wait.intervalSec * (1 - elapsed / wait.durationMs))`
    ticked by a 250ms `setInterval` inside the component (UI-only cosmetics; the authoritative
    timer lives in the runner; clear on unmount/wait change). Render `{clockLabel}
    <span className="tabular-nums text-5xl font-semibold">m:ss</span>`; a thin progress bar
    underneath (`motion-reduce:hidden`, `aria-hidden`); clock container `aria-hidden` with a
    sibling visually-hidden `role="status"` announcing only `"Waiting"` once (no per-second
    SR spam). Under compression the clock visibly fast-ticks — intended (time-lapse read).
    **Adjust-wait control:** a disclosure `<button aria-expanded>` labeled `adjustWait`; when
    open, a wrap row of rung chips (`rungOptions` formatted `15s / 30s / 1m / 2m …`), each a
    ≥64px button, current interval marked with `aria-pressed` + a visible border (not
    color-only); tap → `onOverride(sec)` and the disclosure closes.
  - **`end-screen.tsx`:** heading; stats line (`tabular-nums`); `mastered ? masteredLine :
    closeLine` (masteredLine also gets a non-color icon, e.g. inline-SVG laurel/check);
    conditional rescope paragraph (`border-l-4 border-amber-700 bg-amber-50 p-4 text-left` +
    icon, not color-only); **session-notes field**: `<label>` `notesLabel` + `<textarea
    className="min-h-[120px] w-full max-w-xl rounded-xl border-2 border-zinc-500 p-4
    text-xl">` + Save button calling `onSaveNote` (disabled while empty; on resolve true show
    `notesSaved` inline `role="status"`; on false show `saveError` + `retry`); Home button.
  `pnpm typecheck` + `pnpm lint` green → commit `feat(web): kiosk session screens`.

### Task 5: Session page + SessionView integration + resume flow + dashboard entry

**Files:**
- Create: `apps/web/src/components/session/session-view.tsx`
- Create: `apps/web/src/lib/session/session-view-logic.ts`
- Create: `apps/web/src/app/(app)/session/page.tsx`
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx` (add "Start today's session" link)
- Test: `apps/web/src/lib/session/session-view-logic.test.ts`

**Interfaces:**
- Consumes: everything Tasks 1–4 produce (`startSessionAction`, `recordTrialAction`,
  `endSessionAction`, `saveSessionNoteAction`, `annotateSessionAction`, `StartSessionResult`,
  `useSessionRunner`, all screen components, `distractorForTrial`, `ladderRungs`,
  `SESSION_COPY`).
- Produces: route `/session` (auth-gated by the existing `(app)/layout.tsx`).

**Steps:**

- [ ] **Step 1: `page.tsx` (server component).** `requireUser()` → load the caregiver's demo
  patient's first target with `status in ("active","maintenance")` (RLS query; MVP =
  single target) + check for an open same-day session (read-only — do NOT mutate during
  render). Read `const demoSpeed = Number(process.env.DEMO_SPEED ?? "1")` server-side (not
  `NEXT_PUBLIC_`). Render a **pre-session screen** (kiosk styling per Task 4 conventions):
  target question as context, one big button — `preSession.begin`, or `preSession.resume`
  when an open same-day session exists. The button is the client boundary: `<SessionView
  targetId demoSpeed />` holds a `started` flag; `startSessionAction` runs on tap — session
  rows are only ever created by explicit user action.

- [ ] **Step 2: `session-view.tsx` (client) + `session-view-logic.ts`.** Responsibilities:
  1. On begin-tap: `startSessionAction({ targetId })` → hold `StartSessionResult`; error →
     calm inline error with retry button (no throw, no redirect).
  2. `useSessionRunner(result.state, result.config, demoSpeed, onChange)`.
  3. `onChange(state, event)`: (a) if the event added a trial
     (`state.trials.length > prevLen`), fire `recordTrialAction({ sessionId, targetId,
     trial: state.trials.at(-1), snapshot: state })` — await in the background; on error show
     a persistent non-blocking banner `saveError` + `retry` button (no auto-retry —
     double-insert risk; trials are source of truth); (b) if `event.type ===
     "interval_override"`, fire `annotateSessionAction({ sessionId, kind:
     "interval_override", fromSec: prevIntervalSec, toSec: state.intervalSec, at: event.at })`;
     (c) if `state.phase === "ended"`, fire `endSessionAction({ sessionId, targetId,
     snapshot: state })`.
  4. Render per phase: `teach` → `AnswerScreen variant="teach"` (onDone → `runner.teachDone()`);
     `awaiting_probe` → `ProbeScreen` (with `answer`, onOutcome → `runner.probe(o)`);
     `correcting` → `AnswerScreen variant="correction"` (onDone → `runner.correctionDone()`);
     `distractor` → `DistractorCard prompt={distractorForTrial(state.trials.length)}
     wait={currentWait} rungOptions={ladderRungs(config)} onOverride={sec =>
     runner.overrideInterval(sec)}`; `end_on_win` → `AnswerScreen variant="end_on_win"`
     (onDone → `runner.teachDone()`); `ended` → `EndScreen` (recalls = trials with outcome
     recall, mastered = `state.progress.mastered`, onSaveNote →
     `saveSessionNoteAction({sessionId, note})` mapped to boolean, onHome → router.push
     `/dashboard`).
  5. Persistent footer (visible in every non-ended phase): `endSession` button →
     `runner.endRequested()`; **`answerCard` button** → toggles a small inline panel
     (`answerCardPrompt` label + text input ≥60px + `answerCardSave` button) →
     `annotateSessionAction({ sessionId, kind: "answer_card", note, at: Date.now() })`,
     confirmation via `role="status"`. **Never a browser `confirm()`/`alert()`.**
  6. Focus management: `useEffect` on `state.phase` → focus the current screen's `<h1>`.
  Extract the pure decision helpers — `trialAdded(prev, next)`, `recallCount(trials)`,
  `screenForPhase(phase)` — into `session-view-logic.ts` and unit-test those
  (`session-view-logic.test.ts`); the JSX wiring itself is covered by the browser gate.

- [ ] **Step 3: Dashboard entry.** Add to `dashboard/page.tsx` a prominent kiosk-styled link
  card to `/session`: `"Start today's session"` + the target question as subtitle (string via
  `copy.ts`). Keep existing dashboard content intact.

- [ ] **Step 4: Full verification.** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  all green (core suite included — Task 2's engine change must not have regressed anything).
  Commit `feat(web): session kiosk page, resume flow, dashboard entry`.

---

## Post-review rulings (whole-branch review, 2026-07-08)

- **Override annotations are best-effort by design.** The `interval_override` annotation is
  fired un-queued (a retry could duplicate it); if it's lost to a network blip, the deviation
  remains reconstructable from the persisted trial `intervalSec` sequence — the analytic signal
  is never fully silent. Ruled acceptable for MVP; revisit only if annotation loss shows up in
  practice.
- **Client-snapshot trust boundary (V1 backlog).** `target_state`/`targets.status` writes derive
  from the client-computed engine snapshot (zod-validated for shape, not semantic legitimacy);
  blast radius is RLS-bounded to the caregiver's own patient. V1 hardening: server-side event
  replay so progress is derived from trials, not trusted state.

## Out of scope (do not build)

- TTS/audio playback (Web Speech or pre-gen) — Phase 5/6; the correction is read off the screen.
- next-intl wiring — strings are centralized in `copy.ts` for a later mechanical retrofit.
- Claude-personalized distractors (4.5), affect capture (5.4), acquisition chart (5.1),
  candidacy UI, between-session/booster UI.
- Practitioner-feedback items deferred to V1 (documented in
  `docs/expert-feedback-2026-07-08.md`): patient picker, per-person goal list, in-flight
  target Q/A editing, family handoff link, voice-dictated notes, PDF export.
- Any change under `packages/core` beyond Task 2's `interval_override` event.

## Verification gate (controller, after all tasks)

D3 gate (run a day early): `supabase start` → `pnpm seed` → `DEMO_SPEED=60 DEMO_MODE=1 pnpm dev`
→ one-tap demo login → full scripted session in the browser: begin → probe (answer hint visible)
→ deliberate miss → device-delivered correction → distractor with visible clock (≤60s intervals
real) → **manual interval override via Adjust wait** → recovery → end-on-win → ended screen with
session note saved; then verify `trials`/`sessions`/`target_state` rows in the local DB carry
REAL `interval_sec` values and `summary.annotations` records the override.
