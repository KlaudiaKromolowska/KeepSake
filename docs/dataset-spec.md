# Dataset spec — the RCT-in-a-box schema

Spaced Retrieval Training's biggest open questions — expanding vs. uniform intervals, errorless vs.
effortful correction, caregiver vs. clinician delivery — have stayed open since the 1990s for one
mundane reason: home practice happens on index cards, and the data dies there. No trial has ever
had structured, trial-level logs from hundreds of home dyads. Keepsake's engine (`packages/core/src/sr/`)
is a pure reducer that emits one structured row per probe, so every home session a caregiver runs
is, by construction, a protocol-faithful trial log — not an app event stream retrofitted for
research. This document is that schema: what one session emits, and what becomes answerable once
enough dyads run it. Source of truth: `supabase/migrations/20260707183209_create_schema.sql` and
`packages/core/src/sr/session.ts`.

## The trial-level record (`trials` table)

One row per probe — screening or training, teach step or correction. Nothing here is
demo-scaled: `interval_sec` is the real wall-clock interval the patient waited, even when the UI
compresses that wait on screen for the video.

| Field | Type | What it captures |
|---|---|---|
| `interval_sec` | `numeric >= 0` | The real expanding-ladder interval at probe time (0 = teach/session-start/end-on-win). Never demo-scaled — the field the "expanding vs. uniform" question needs. |
| `outcome` | `recall \| miss \| unclear` | The literal caregiver tap, preserved three-state. `unclear` is not collapsed into a binary pass/fail — it's a distinct signal (ambiguous input, not a failure). |
| `is_screening` | `boolean` | True for Brush & Camp candidacy-screen trials (§4.1), false for training. Screening misses are logged too — they're data. |
| `corrected` | `boolean` | True whenever the device delivered the errorless correction (confirmed miss, teach step, or end-on-win) — the field the "errorless vs. effortful" question needs. |
| `latency_ms` | `integer`, nullable | UI-measured response latency; not engine logic, informational only. |
| `at` | `timestamptz` | Event timestamp from the engine's injected clock — never server-local time. Calendar-day rules (distinct-day mastery) resolve it through `patients.timezone`. |
| `session_id`, `target_id` | `uuid` FKs | Links the trial to its session and target for per-dyad, per-item analysis. |

## The per-target record (`target_state` table)

One row per target, mirroring the engine's persisted state exactly (`TargetProgress` in
`session.ts`, `ScheduleState` in `scheduler.ts`):

| Field | What it captures |
|---|---|
| `last_success_interval_sec` | The ladder rung the reset logic reverts to on a miss — never a full reset to base. |
| `start_streak` | Consecutive session-start recalls on *distinct calendar days* — the live mastery counter (3 → mastered). |
| `bad_sessions` | Consecutive sessions that ended via the struggle path (2 base-rung misses) — the abandonment/re-scope signal. |
| `schedule_mode`, `between_session_gap_days`, `booster_step`, `next_due_at` | Between-session state once a target reaches the within-session ceiling: the day-scale gap and post-mastery booster cadence. |

## Example: one session, protocol-correct (fictional persona — Marta relearning "Lena")

Traced directly against `sessionReduce()` in `session.ts`: session 1 (first-ever, so it opens with
the 0s teach step, not a start-probe), interval escalates 15→30→60, a miss at 60s reverts to
`last_success_interval_sec` (30 — never to zero, and not to base since 30 is the last successful
rung), recovers, and the session closes on its final recall (sessions always end on a win — no
extra padding trial is needed when the last logged trial is already a `recall`).

```csv
trial_id,session_id,target_id,interval_sec,outcome,is_screening,corrected,latency_ms,at
t1,sess_2026-07-07_01,target_lena_name,0,recall,false,true,4100,2026-07-07T09:00:00+02:00
t2,sess_2026-07-07_01,target_lena_name,15,recall,false,false,2300,2026-07-07T09:00:19+02:00
t3,sess_2026-07-07_01,target_lena_name,30,recall,false,false,2600,2026-07-07T09:00:51+02:00
t4,sess_2026-07-07_01,target_lena_name,60,miss,false,true,3900,2026-07-07T09:01:53+02:00
t5,sess_2026-07-07_01,target_lena_name,30,recall,false,false,2100,2026-07-07T09:02:25+02:00
t6,sess_2026-07-07_01,target_lena_name,60,recall,false,false,2400,2026-07-07T09:03:27+02:00
```
Row `t1` is the teach step (`corrected=true`: the device modeled the answer). Rows `t2`, `t3` are
clean expanding-interval successes. `t4` is the confirmed miss — `corrected=true` marks the
device-delivered errorless correction; the *next* row's `interval_sec` (30, not 15 or 0) is the
reset-to-last-success rule, not a full reset. `t5`–`t6` show recovery back up the ladder; `t6` is
the session's last trial and is a `recall`, so the session closes here — already ending on a win.

## What becomes answerable at scale

At n=1 this schema tunes one patient's protocol — it's a debugging and coaching tool. At n≈1000
home dyads, the same fields answer questions the field has argued about since the 1990s: does
expanding beat uniform spacing (compare `interval_sec` sequences across dyads with the schedule
held equal)? What's the real forgetting/decay curve by etiology, and does it justify different
booster cadences (`target_state.booster_step` vs. `interval_sec` at re-probe)? Does errorless
correction actually outperform effortful retry at scale, not just in one small RCT (`corrected`
vs. subsequent-trial outcome)? **Honesty guardrail: n=1 never settles a field question** — a single
dyad's trial log tunes that dyad's protocol; the claim here is the instrument and schema at scale,
not that one Marta-and-Lena session proves anything about spaced retrieval in general.
