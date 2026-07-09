-- patient_notes — move the free-text caregiver note off `patients` into its own table (GDPR data
-- minimization follow-up to #37 / #42).
--
-- Problem: `patients.notes` was a free-text Article-9 column. RLS is ROW-level, so ANY role that
-- holds a row-SELECT policy on `patients` reads every column of that row via the raw supabase-js /
-- PostgREST API, regardless of what the app UI selects. The read-only clinician role (#37) has
-- exactly such a policy (`patients_select_clinician`) — so a linked clinician could read the
-- caregiver's private, personalizing note, which was never meant for the clinical trend view. "RLS
-- is the boundary, not the query": narrowing the app's SELECT does not fix it; the column has to
-- move behind its own policy set.
--
-- Fix: a separate `patient_notes` table (1:1 with a patient, like `consent`/`target_state`) whose
-- RLS grants access to the CARE TEAM only —
--   * the solo family caregiver who OWNS the patient (mirrors the `patients` caregiver policies), and
--   * org staff who DELIVER that patient's care (via the existing `is_org_member_of_patient` helper
--     from #42) —
-- and DELIBERATELY has NO clinician SELECT policy. Unlike patients/targets/sessions/... (which each
-- gained an additive `*_select_clinician` policy in #37), nothing here references
-- `is_clinician_for`, so a linked clinician can never read it — the core fix.
--
-- Org-staff-sees-notes decision: YES. Org staff are the care team for an org patient (they already
-- have full read+write on its targets/sessions/trials/consent), and the note is care-delivery
-- context that personalizes the practice — analogous to `consent` (shared with org, not clinician),
-- NOT to `memory_capsules` (family-private, shared with neither). The external read-only clinician
-- is the sole role excluded here.

create table public.patient_notes (
  patient_id uuid primary key references public.patients (id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.patient_notes is
  'Free-text caregiver note (Article-9), 1:1 with a patient, personalizing the practice. '
  'Deliberately a SEPARATE table, not a patients column: the read-only clinician role holds a SELECT '
  'policy on patients, so a column there would be clinician-readable via the raw API even if the UI '
  'never asks for it. Access here is the CARE TEAM only (caregiver-owner + org staff); there is '
  'intentionally NO clinician SELECT policy.';

create trigger set_updated_at before update on public.patient_notes
  for each row execute function extensions.moddatetime(updated_at);

-- Migrate existing data, then drop the column. Only non-blank notes carry over (the new column is
-- NOT NULL; an empty/whitespace note carried no information and would fail the constraint).
insert into public.patient_notes (patient_id, note)
  select id, notes from public.patients
  where notes is not null and length(trim(notes)) > 0;

alter table public.patients drop column notes;

alter table public.patient_notes enable row level security;

-- Caregiver-owner policies — ownership joined up through `patients`, exactly mirroring the
-- consent_*_own policies (§20260707183210). The `caregiver_id = auth.uid()` predicate is what
-- excludes the clinician: even though a linked clinician CAN see the patients row, that predicate is
-- false for them, so EXISTS is false.
create policy "patient_notes_select_own" on public.patient_notes
  for select to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = patient_notes.patient_id and p.caregiver_id = (select auth.uid())
  ));

create policy "patient_notes_insert_own" on public.patient_notes
  for insert to authenticated
  with check (exists (
    select 1 from public.patients p
    where p.id = patient_notes.patient_id and p.caregiver_id = (select auth.uid())
  ));

create policy "patient_notes_update_own" on public.patient_notes
  for update to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = patient_notes.patient_id and p.caregiver_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.patients p
    where p.id = patient_notes.patient_id and p.caregiver_id = (select auth.uid())
  ));

create policy "patient_notes_delete_own" on public.patient_notes
  for delete to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = patient_notes.patient_id and p.caregiver_id = (select auth.uid())
  ));

-- Org care-team policies — additive, OR'd on top, gated by is_org_member_of_patient() (the #42
-- SECURITY DEFINER helper that reads membership without re-entering RLS). Full CRUD, matching the
-- consent_*_org shape: staff delivering the practice may see and maintain the note. There is
-- deliberately NO clinician policy anywhere in this file.
create policy "patient_notes_select_org" on public.patient_notes
  for select to authenticated
  using (public.is_org_member_of_patient(patient_notes.patient_id));

create policy "patient_notes_insert_org" on public.patient_notes
  for insert to authenticated
  with check (public.is_org_member_of_patient(patient_notes.patient_id));

create policy "patient_notes_update_org" on public.patient_notes
  for update to authenticated
  using (public.is_org_member_of_patient(patient_notes.patient_id))
  with check (public.is_org_member_of_patient(patient_notes.patient_id));

create policy "patient_notes_delete_org" on public.patient_notes
  for delete to authenticated
  using (public.is_org_member_of_patient(patient_notes.patient_id));
