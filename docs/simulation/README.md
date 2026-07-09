# In-silico population simulation

**What this is:** 1,000 synthetic patients driven through the *actual, unmodified*
`packages/core/src/sr` engine — candidacy screen, within-session ladder, session state machine,
between-session scheduler, boosters — using a virtual clock and a simple synthetic memory model.
Zero app risk: this is `packages/core` + one script (`scripts/simulate.ts`), never
`apps/web`. No engine semantics were changed to make this work.

**What this is not:** a clinical validation. No real patient data was involved anywhere in this
process. The synthetic memory model below is a deliberately simple, illustrative stand-in for "how
a person forgets and relearns," calibrated only so the simulation exercises the engine's dynamics
in a plausible way — not fit to any dataset, not peer-reviewed, not a claim about real recall
probabilities. Treat every number on this page as "the engine behaves sensibly when driven this
way," not "patients master targets in N days."

## How it works

For each synthetic patient:

1. **Candidacy** (`candidacy.ts`): the Brush & Camp screen at 0s / 15s / 30s, exactly as coded —
   `candidacyReduce` driven with outcomes drawn from the memory model. A patient who fails never
   proceeds (`status: "not_candidate"`).
2. **Acquisition** (`session.ts`): daily sessions (`startSession` → drive the reducer through
   teach/distractor/probe/correction until `phase: "ended"`) until the target either reaches the
   within-session ceiling or the patient masters it via 3 distinct-day session-start recalls —
   whichever the engine's own state machine produces first. The **daily cadence pre-schedule is a
   simulation choice**, not an engine rule: the engine is silent on inter-session timing until a
   `ScheduleState` exists.
3. **Mastery → maintenance/boosters** (`scheduler.ts`): once a `ScheduleState` exists, subsequent
   sessions run at `schedule.nextDueAt`, dispatching each session-start outcome to
   `onSessionStartOutcome` (between mode) or `onBoosterOutcome` (booster mode) per the scheduler's
   own documented integration contract, mastery-discard rule included.
4. Simulated for up to 90 days total. A patient who hits `badSessionsToRescope` (3 consecutive
   struggle-closed sessions) is recorded as `rescoped` and stops there — the same safety valve the
   product uses for a genuinely mis-scoped target.

Every reducer call is the real one from `packages/core/src/sr` — the harness
(`packages/core/src/sim`) only supplies the clock and decides what outcome each probe returns.

## The synthetic memory model (read this before citing any number)

Each patient gets an **etiology** (uniform across the six the engine supports — a coverage sample,
*not* a prevalence-weighted one; we have no authoritative comorbidity-adjusted incidence numbers
to justify weighting) and an **ability** parameter in [0, 1) (mean of three uniform draws, for a
mild central tendency — not fit to any real ability distribution).

Each target has a hidden **strength** (seconds), which behaves like a half-life:

- `recallProbability = exp(-elapsedSeconds / strength)`, clamped to `[0.02, 0.98]` — never a hard
  certainty in either direction.
- A **successful unaided recall** grows strength toward (a multiple of) the interval just survived
  — the textbook spacing effect: succeeding at a gap is evidence the trace now survives at least
  that long.
- A **device-delivered errorless correction** (miss → shown the answer → patient repeats) *also*
  nudges strength up, more gently than an unaided recall. This mirrors the product's own
  errorless-learning rationale (PLAN.md) — repetition without failure still builds the trace — and
  without it, the simulation showed an implausibly high early-session dropout rate (patients
  oscillating at the base interval with no way to ever build strength).
- A **miss** shrinks strength, floored so it never collapses to zero.
- A flat, elapsed-independent **6% chance of an "unclear" response**, before the recall/miss draw —
  a stand-in for ambiguous verbal output. This does *not* model any real correlation between
  word-finding difficulty and etiology; that's future work, not this model.
- An **etiology decay multiplier** (lewy/parkinsons 1.3×, mixed 1.15×, others 1.0×) mirrors the same
  "DLB/PD forgets faster" rationale already encoded in `defaultsForEtiology` — illustrative, since
  no head-to-head trial exists to fit it against.

Full formulas: `packages/core/src/sim/memoryModel.ts`. Every function has a unit test
(`memoryModel.test.ts`) asserting the qualitative shape (monotonic decay, growth ≥ no-op, etc.), not
any specific number.

**Calibration note:** the untrained baseline strength was picked empirically so the candidacy
screen is a meaningful gate (not near-100% pass or near-100% fail) — around a 40% overall pass
rate in this run. This is a modeling choice for exercising the engine, not a validated screening
threshold.

## Reproducing this

```
pnpm sim                              # n=1000, seed=42, horizon=90d (this run)
pnpm sim -- --n=200 --seed=7          # override any of n / seed / horizonDays
```

Fully deterministic: one seeded `mulberry32` RNG stream (`packages/core/src/sim/rng.ts`), consumed
sequentially (sample patient → simulate patient fully → sample next patient). Same seed, same
population, same trial-by-trial outcomes, every time — see `simulate.test.ts`'s determinism tests.

## Headline results (n=1,000, seed=42, 90-day horizon)

| | |
|---|---|
| Candidacy pass rate | 43% |
| Of candidates: mastered within 90d | 61% (262/432) |
| Of candidates: rescoped (safety valve) | 34% (145/432) |
| Of candidates: still acquiring at day 90 | 6% (25/432) |
| Time to mastery — median | 23.3 days |
| Time to mastery — p10 / p90 | 6.5 / 60.5 days |

Per-etiology mastery rate (of candidacy passers) ranges from 44% (unspecified) to 76% (lewy) — see
`summary.json.perEtiology`. Full numbers, every field: [`summary.json`](./summary.json).

**A genuinely interesting emergent pattern:** lewy/parkinsons have the *lowest* candidacy pass rate
(28% / 36% — the faster decay multiplier makes the fixed 15s/30s screen harder) but the *highest*
mastery rate once a patient clears it (76% / 74%). That's consistent with `defaultsForEtiology`'s
tighter starting interval and gentler growth factor for those profiles doing real work — patients
who need it get an easier ladder, once they're through the door. This fell out of driving the real
reducers; it wasn't assumed going in.

**Booster survival:** 82% recall at the first (7-day) post-mastery check, 73% at 14 days, 83% at 30
days (n counts in `summary.json.boosterSurvival`; no patient's simulated trajectory reached a 90-day
booster within the horizon). The relatively high day-7 survival is *not* an assumption — it falls
out of the between-session gap-growth walk (`onSessionStartOutcome`, ×1.5 per success, capped at 14
days) that runs *before* mastery: by the time 3 distinct-day streak recalls complete, the tested gap
is often already several days, not one, so the strength built by mastery time already covers most of
the first booster gap.

## Charts (`docs/simulation/*.svg`)

- `time-to-mastery.svg` — percentile bars, days to mastery.
- `mastery-by-etiology.svg` — mastery rate per etiology (of candidacy passers).
- `booster-survival.svg` — recall rate at each nominal booster cadence step.
- `interval-distribution.svg` — histogram of every within-session trial interval, population-wide.

Hand-rolled SVG (`scripts/svg-chart.ts`), no charting dependency, self-contained (safe to embed
anywhere, including a slide).

## Honest limitations

- **The memory model is illustrative, not validated.** No real patient data informed the specific
  numbers (decay rates, growth factors, unclear probability). Treat every simulated statistic as
  "the engine's dynamics are sane," never as a clinical prediction.
- **No adherence/dropout modeling.** Every simulated caregiver runs every scheduled session exactly
  on time, for the whole 90 days. PLAN.md is explicit that real-world adherence — not fidelity — is
  the dominant failure mode; this simulation is silent on that entire dimension.
- **Perfect protocol delivery.** No modeling of caregiver error, distraction, or inconsistent
  correction delivery.
- **One target per patient.** No multi-target or interleaving dynamics.
- **`ability` is a single scalar**, not decomposed into distinct cognitive domains (e.g., encoding
  vs. retrieval vs. attention).
- **The pre-schedule daily cadence is a simulation choice**, not an engine rule — see "How it
  works" above.
- **An engine coupling this simulation surfaced — since resolved (PR #27):** `session.ts`'s
  `handleStartProbe` used to re-fire `endReason: "mastered"` on *every* distinct-day session-start
  recall after first mastery (it never guarded on `progress.mastered`), which discarded the
  in-flight booster result and called `afterMastery` — collapsing the booster cadence back to its
  shortest step instead of letting `onBoosterOutcome` grow it toward 14/30/90 days. The related
  app-side half was `endSessionAction` calling `onSessionStartOutcome` for *every* existing schedule
  regardless of `mode`. Both are now fixed: mastery is **transition-gated** (fires once, on
  `!mastered → mastered`, with `startStreak` capped at `masteryStreak`) and `endSessionAction`
  dispatches by `existing.mode` (`onBoosterOutcome` post-mastery, `onSessionStartOutcome`
  pre-mastery). This simulation already followed the correct mode-dispatched contract and guarded on
  `endReason !== "mastered"`, so the engine fix only makes it more faithful — no `simulate.ts`
  changes were needed.
- **Calibration was done by eye**, iterating until candidacy pass rate, mastery rate, and booster
  survival all looked plausible — not fit to any target distribution. A different, equally
  defensible set of constants would produce different headline numbers without changing any engine
  code. Note: the booster-survival figures were eyeballed against the pre-PR-#27 behavior; the
  headline time-to-mastery number is unaffected (mastery timing is unchanged by the booster fix).
