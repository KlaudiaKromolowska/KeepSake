-- Keepsake core schema (PLAN.md §8, corrected for engine drift).
-- Hard delete + ON DELETE CASCADE everywhere — no soft-delete columns (GDPR erasure requires
-- that deleting a patient, or an auth user, actually removes their Article-9 data).
-- status/outcome/candidacy/answer_format are text + CHECK, not native enums (they churn and
-- ALTER TYPE has lock/ordering friction). etiology is the one genuinely-closed set → native enum.

create type public.etiology as enum (
  'alzheimers',
  'vascular',
  'lewy',
  'parkinsons',
  'mixed',
  'unspecified'
);

-- patients ------------------------------------------------------------------

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  notes text,
  timezone text not null, -- IANA tz name; mastery/distinct-day math is computed patient-local
  is_demo boolean not null default false,
  etiology public.etiology not null default 'unspecified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.patients.timezone is
  'IANA timezone (e.g. Europe/Warsaw). Session start-probe distinct-day mastery streak is '
  'computed in this timezone, not UTC or server-local.';

-- targets ---------------------------------------------------------------------

create table public.targets (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  question text not null,
  answer text not null,
  image_url text,
  accepted_variants jsonb not null default '[]',
  answer_format text not null default 'free_recall'
    check (answer_format in ('free_recall', 'recognition')),
  candidacy text not null default 'unscreened'
    check (candidacy in ('passed', 'failed', 'unscreened')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'mastered', 'maintenance', 'paused', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- sessions --------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  summary jsonb,
  patient_affect_pre smallint check (patient_affect_pre between 1 and 5),
  patient_affect_post smallint check (patient_affect_post between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- trials ------------------------------------------------------------------------

create table public.trials (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  target_id uuid not null references public.targets (id) on delete cascade,
  interval_sec numeric not null check (interval_sec >= 0), -- real interval, never demo-scaled
  outcome text not null check (outcome in ('recall', 'miss', 'unclear')),
  is_screening boolean not null default false,
  latency_ms integer, -- UI-measured, nullable
  corrected boolean not null default false,
  at timestamptz not null, -- event timestamp from the engine (epoch ms -> tz)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- target_state ------------------------------------------------------------------
-- 1:1 carrier for the engine's persisted per-target state. Column names/semantics mirror
-- packages/core/src/sr/session.ts (TargetProgress) and scheduler.ts (ScheduleState) exactly —
-- that mapping is the whole point of this table, so do not rename loosely in future migrations.

create table public.target_state (
  target_id uuid primary key references public.targets (id) on delete cascade,

  -- TargetProgress (session.ts) --------------------------------------------
  last_success_interval_sec numeric, -- null until first within-session success (lastSuccessSec)
  start_streak integer not null default 0,
  last_start_success_day text, -- "YYYY-MM-DD" patient-tz calendar day (lastStartSuccessDay)
  bad_sessions integer not null default 0,
  mastered_at timestamptz, -- null = not mastered; engine's `mastered: boolean` <-> timestamp
  session_count integer not null default 0,

  -- ScheduleState (scheduler.ts) --------------------------------------------
  -- engine gaps are DAYS (DAY_MS-based), not hours — PLAN §8 said hours, the engine is
  -- authoritative and the engine uses days. schedule_mode null = still within-session only
  -- (no ScheduleState persisted yet).
  schedule_mode text check (schedule_mode in ('between', 'booster')),
  between_session_gap_days numeric,
  booster_step integer,
  next_due_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- consent -------------------------------------------------------------------------

create table public.consent (
  patient_id uuid primary key references public.patients (id) on delete cascade,
  patient_consent boolean not null default false,
  caregiver_role_ack boolean not null default false,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- audit_log -------------------------------------------------------------------------
-- Deliberately NOT like the other tables: no FK to auth.users (must survive caregiver/user
-- erasure so the audit trail itself isn't erasable by deleting the account), no updated_at or
-- moddatetime trigger (append-only ledger — rows are never updated, only inserted; enforced via
-- RLS/grants below, not a soft "don't do this" convention).

create table public.audit_log (
  id bigint primary key generated always as identity,
  caregiver_id uuid not null,
  action text not null
    check (action in (
      'consent_granted', 'consent_withdrawn', 'data_access', 'data_export', 'patient_deleted'
    )),
  detail jsonb not null default '{}', -- ids/timestamps only — no Article-9 payload, ever
  created_at timestamptz not null default now()
);

-- moddatetime triggers --------------------------------------------------------------

create trigger set_updated_at before update on public.patients
  for each row execute function extensions.moddatetime(updated_at);

create trigger set_updated_at before update on public.targets
  for each row execute function extensions.moddatetime(updated_at);

create trigger set_updated_at before update on public.sessions
  for each row execute function extensions.moddatetime(updated_at);

create trigger set_updated_at before update on public.trials
  for each row execute function extensions.moddatetime(updated_at);

create trigger set_updated_at before update on public.target_state
  for each row execute function extensions.moddatetime(updated_at);

create trigger set_updated_at before update on public.consent
  for each row execute function extensions.moddatetime(updated_at);

-- indexes -------------------------------------------------------------------------
-- One per FK (unless already covered by a PK or a named composite below), plus the four named
-- composite/covering indexes from the task brief.

create index idx_patients_caregiver_id on public.patients (caregiver_id);
create index idx_trials_session_id on public.trials (session_id);

-- named composite indexes
create index idx_targets_patient_id_status on public.targets (patient_id, status);
create index idx_trials_target_id_at on public.trials (target_id, at);
create index idx_sessions_patient_id_started_at on public.sessions (patient_id, started_at);
create index idx_target_state_next_due_at on public.target_state (next_due_at);

-- Not an FK (audit_log.caregiver_id deliberately has none) but every RLS predicate below filters
-- on it, so it earns an index on read/write performance grounds.
create index idx_audit_log_caregiver_id on public.audit_log (caregiver_id);
