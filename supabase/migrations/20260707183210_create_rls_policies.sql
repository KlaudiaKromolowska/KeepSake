-- Row Level Security — the security boundary for Article 9 health data held in this schema.
-- service_role (used only server-side, never on a user request path) bypasses RLS by design;
-- every policy below governs the `authenticated` role only. All predicates use the
-- `(select auth.uid())` initplan form rather than bare `auth.uid()` so Postgres evaluates it once
-- per statement, not once per row (performance, not just style).

alter table public.patients enable row level security;
alter table public.targets enable row level security;
alter table public.sessions enable row level security;
alter table public.trials enable row level security;
alter table public.target_state enable row level security;
alter table public.consent enable row level security;
alter table public.audit_log enable row level security;

-- patients: caregiver owns rows directly ------------------------------------------

create policy "patients_select_own" on public.patients
  for select to authenticated
  using (caregiver_id = (select auth.uid()));

create policy "patients_insert_own" on public.patients
  for insert to authenticated
  with check (caregiver_id = (select auth.uid()));

create policy "patients_update_own" on public.patients
  for update to authenticated
  using (caregiver_id = (select auth.uid()))
  with check (caregiver_id = (select auth.uid()));

create policy "patients_delete_own" on public.patients
  for delete to authenticated
  using (caregiver_id = (select auth.uid()));

-- targets: ownership joined up through patients -----------------------------------

create policy "targets_select_own" on public.targets
  for select to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = targets.patient_id and p.caregiver_id = (select auth.uid())
  ));

create policy "targets_insert_own" on public.targets
  for insert to authenticated
  with check (exists (
    select 1 from public.patients p
    where p.id = targets.patient_id and p.caregiver_id = (select auth.uid())
  ));

create policy "targets_update_own" on public.targets
  for update to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = targets.patient_id and p.caregiver_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.patients p
    where p.id = targets.patient_id and p.caregiver_id = (select auth.uid())
  ));

create policy "targets_delete_own" on public.targets
  for delete to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = targets.patient_id and p.caregiver_id = (select auth.uid())
  ));

-- sessions: ownership joined up through patients ----------------------------------

create policy "sessions_select_own" on public.sessions
  for select to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = sessions.patient_id and p.caregiver_id = (select auth.uid())
  ));

create policy "sessions_insert_own" on public.sessions
  for insert to authenticated
  with check (exists (
    select 1 from public.patients p
    where p.id = sessions.patient_id and p.caregiver_id = (select auth.uid())
  ));

create policy "sessions_update_own" on public.sessions
  for update to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = sessions.patient_id and p.caregiver_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.patients p
    where p.id = sessions.patient_id and p.caregiver_id = (select auth.uid())
  ));

create policy "sessions_delete_own" on public.sessions
  for delete to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = sessions.patient_id and p.caregiver_id = (select auth.uid())
  ));

-- consent: ownership joined up through patients -----------------------------------

create policy "consent_select_own" on public.consent
  for select to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = consent.patient_id and p.caregiver_id = (select auth.uid())
  ));

create policy "consent_insert_own" on public.consent
  for insert to authenticated
  with check (exists (
    select 1 from public.patients p
    where p.id = consent.patient_id and p.caregiver_id = (select auth.uid())
  ));

create policy "consent_update_own" on public.consent
  for update to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = consent.patient_id and p.caregiver_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.patients p
    where p.id = consent.patient_id and p.caregiver_id = (select auth.uid())
  ));

create policy "consent_delete_own" on public.consent
  for delete to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = consent.patient_id and p.caregiver_id = (select auth.uid())
  ));

-- trials: ownership joined up through sessions -> patients ------------------------

create policy "trials_select_own" on public.trials
  for select to authenticated
  using (exists (
    select 1 from public.sessions s
    join public.patients p on p.id = s.patient_id
    where s.id = trials.session_id and p.caregiver_id = (select auth.uid())
  ));

create policy "trials_insert_own" on public.trials
  for insert to authenticated
  with check (exists (
    select 1 from public.sessions s
    join public.patients p on p.id = s.patient_id
    where s.id = trials.session_id and p.caregiver_id = (select auth.uid())
  ));

create policy "trials_update_own" on public.trials
  for update to authenticated
  using (exists (
    select 1 from public.sessions s
    join public.patients p on p.id = s.patient_id
    where s.id = trials.session_id and p.caregiver_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.sessions s
    join public.patients p on p.id = s.patient_id
    where s.id = trials.session_id and p.caregiver_id = (select auth.uid())
  ));

create policy "trials_delete_own" on public.trials
  for delete to authenticated
  using (exists (
    select 1 from public.sessions s
    join public.patients p on p.id = s.patient_id
    where s.id = trials.session_id and p.caregiver_id = (select auth.uid())
  ));

-- target_state: ownership joined up through targets -> patients ------------------

create policy "target_state_select_own" on public.target_state
  for select to authenticated
  using (exists (
    select 1 from public.targets t
    join public.patients p on p.id = t.patient_id
    where t.id = target_state.target_id and p.caregiver_id = (select auth.uid())
  ));

create policy "target_state_insert_own" on public.target_state
  for insert to authenticated
  with check (exists (
    select 1 from public.targets t
    join public.patients p on p.id = t.patient_id
    where t.id = target_state.target_id and p.caregiver_id = (select auth.uid())
  ));

create policy "target_state_update_own" on public.target_state
  for update to authenticated
  using (exists (
    select 1 from public.targets t
    join public.patients p on p.id = t.patient_id
    where t.id = target_state.target_id and p.caregiver_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.targets t
    join public.patients p on p.id = t.patient_id
    where t.id = target_state.target_id and p.caregiver_id = (select auth.uid())
  ));

create policy "target_state_delete_own" on public.target_state
  for delete to authenticated
  using (exists (
    select 1 from public.targets t
    join public.patients p on p.id = t.patient_id
    where t.id = target_state.target_id and p.caregiver_id = (select auth.uid())
  ));

-- audit_log: append-only for authenticated -----------------------------------------
-- Insert-only, and only into their own caregiver_id — no SELECT/UPDATE/DELETE policy for
-- `authenticated` at all, so the ledger is unreadable and immutable from that role. Reads are
-- service-role/admin only (service_role bypasses RLS).

create policy "audit_log_insert_own" on public.audit_log
  for insert to authenticated
  with check (caregiver_id = (select auth.uid()));

-- Defense-in-depth beyond absence-of-policy: even if a future migration ever adds an
-- update/delete policy by mistake, these grants must exist for it to take effect at all.
revoke update, delete on public.audit_log from authenticated, anon;
