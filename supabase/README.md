# Supabase (local development)

Local-only workflow for this repo — never `supabase link` or `db push` from a dev machine;
the linked EU project (`enrhdnwazcwfccvqeoew`) is touched only via CI/deploy, not ad hoc.

- `supabase start` — boot the local stack (Docker required).
- `supabase db reset` — drop + recreate the local DB and re-apply every migration in
  `supabase/migrations/` from scratch. Run this after adding/editing a migration.
- `supabase migration new <name>` — create a new timestamped migration file; never hand-name one.
- `supabase gen types typescript --local > packages/core/src/db/types.ts` (adjust path when the
  types package lands) — regenerate typed client bindings after a schema change.

## Engine ⇄ schema mapping (`target_state`)

`target_state` is a 1:1 row per target carrying the SR engine's persisted state exactly —
see `packages/core/src/sr/session.ts` (`TargetProgress`) and `scheduler.ts` (`ScheduleState`).
Two deliberate drifts from the original PLAN.md §8 sketch, both engine-authoritative:

- **Gaps are days, not hours.** `between_session_gap_days` mirrors `ScheduleState.gapDays`,
  which the scheduler computes in whole days (`DAY_MS`-based). PLAN.md §8 said hours; the engine
  disagreed, and the engine wins.
- **`mastered_at timestamptz` replaces a `mastered boolean`.** The engine's `TargetProgress.mastered`
  is a bool; the column stores the timestamp it flipped (`null` = not mastered) so mastery date is
  free instead of needing a second event lookup.

`schedule_mode` is `null` until a target first hands off to the between-session scheduler
(`handoffToScheduler: true` from `session.ts`); it never gets un-set afterwards.

## RLS

Every table has RLS enabled; ownership is always resolved back up to `patients.caregiver_id`
(direct on `patients`, joined for everything else). `audit_log` is insert-only for `authenticated`
and unreadable by that role — reads are service-role only. Table-boundary tests (deny-path pgTAP)
are Task 7, not this one.
