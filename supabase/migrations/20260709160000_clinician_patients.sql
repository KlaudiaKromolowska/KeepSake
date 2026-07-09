-- clinician_patients — read-only clinician<->patient view grants (PLAN §12 V1: "multi-patient +
-- read-only clinician view"). The "discuss with your doctor" audience: a distinct role that may
-- VIEW a patient's trends/trial data and nothing more.
--
-- Design (a new table is a security decision — justification):
--   * patients.caregiver_id is already a plain FK, not unique, so the schema ALREADY supports many
--     patients per caregiver — multi-patient is a selection/UI concern, not a schema change. The
--     only new access surface is the clinician grant, and it needs its own table: it is a
--     many-to-many (a clinician may see several patients; a patient may be shared with several
--     clinicians) that cannot live as a column on either side.
--   * No separate global "role" column/table: membership in THIS table *is* the clinician grant.
--     There is no profiles/memberships table to hang a role enum on, and the link alone fully
--     expresses "clinician X may VIEW patient Y." A user can be a caregiver (owns patients) and a
--     clinician (linked here) at once; role is emergent from ownership vs. link, not a stored flag.
--   * Read-only is enforced STRUCTURALLY, not by a flag: linked clinicians get SELECT-only policies
--     on the clinical tables and NO insert/update/delete policy, so every write affects zero rows.
--   * The link is created by the patient's CAREGIVER (who owns the Article-9 data and consents to
--     sharing it) — never self-served by the clinician, or a clinician could grant themselves
--     access to any patient. Enforced in both the RLS WITH CHECK and the definer function below.

create table public.clinician_patients (
  clinician_id uuid not null references auth.users (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clinician_id, patient_id)
);

comment on table public.clinician_patients is
  'Read-only clinician<->patient VIEW grants. A row means clinician_id may VIEW patient_id '
  '(trends/progress) and never write. Created by the patient''s caregiver; never self-served by '
  'the clinician. Membership is the role grant — there is no separate clinician role column.';

-- The PK (clinician_id, patient_id) serves the clinician-side "which patients can I see" lookup;
-- the reverse index serves the caregiver-side "who can see this patient" lookup and every
-- patient_id RLS subquery below.
create index idx_clinician_patients_patient_id on public.clinician_patients (patient_id);

-- No moddatetime trigger and no updated_at column: a grant is immutable (no UPDATE policy). It is
-- created once and revoked by deletion — there is nothing to touch on update.

alter table public.clinician_patients enable row level security;

-- clinician_patients policies -------------------------------------------------------
-- SELECT: the clinician sees their own grants; the caregiver sees grants on patients they own.
create policy "clinician_patients_select" on public.clinician_patients
  for select to authenticated
  using (
    clinician_id = (select auth.uid())
    or exists (
      select 1 from public.patients p
      where p.id = clinician_patients.patient_id and p.caregiver_id = (select auth.uid())
    )
  );

-- INSERT: only the caregiver who OWNS the patient may create a grant, and never to themselves.
-- (`clinician_id <> auth.uid()` blocks a caregiver from pointlessly self-linking; the real
-- isolation guarantee is the ownership EXISTS — a clinician has no owned patient to satisfy it.)
create policy "clinician_patients_insert_by_caregiver" on public.clinician_patients
  for insert to authenticated
  with check (
    clinician_id <> (select auth.uid())
    and exists (
      select 1 from public.patients p
      where p.id = clinician_patients.patient_id and p.caregiver_id = (select auth.uid())
    )
  );

-- DELETE: the caregiver can revoke; the clinician can opt out of their own grant. No UPDATE policy
-- at all — a grant is immutable (to change it, revoke and re-create).
create policy "clinician_patients_delete" on public.clinician_patients
  for delete to authenticated
  using (
    clinician_id = (select auth.uid())
    or exists (
      select 1 from public.patients p
      where p.id = clinician_patients.patient_id and p.caregiver_id = (select auth.uid())
    )
  );

-- is_clinician_for(): "does the caller hold a clinician grant on this patient?" -----
-- SECURITY DEFINER so it reads clinician_patients WITHOUT invoking that table's RLS. This is what
-- breaks the otherwise-mutual recursion: the clinician SELECT policies below query
-- clinician_patients, and clinician_patients' own policies query patients — routing the lookup
-- through a definer function stops Postgres from re-entering RLS on clinician_patients (which would
-- raise 42P17 "infinite recursion detected in policy"). It leaks nothing: it returns only a boolean
-- about the CALLER's own grant (auth.uid()), never any row.
create function public.is_clinician_for(p_patient_id uuid)
  returns boolean
  language sql
  security definer
  set search_path = public
  stable
as $$
  select exists (
    select 1 from public.clinician_patients
    where patient_id = p_patient_id and clinician_id = auth.uid()
  );
$$;

revoke all on function public.is_clinician_for(uuid) from public;
grant execute on function public.is_clinician_for(uuid) to authenticated;

-- Additive read-only clinician SELECT policies on the clinical tables -----------------
-- Postgres OR's permissive policies, so each of these is purely ADDITIVE to the existing
-- caregiver-owns policies: a linked clinician gains SELECT on exactly the linked patient's rows,
-- and — because no matching insert/update/delete policy is added — cannot write any of them.
-- consent is deliberately NOT shared (data minimization: the trend view never needs it).

create policy "patients_select_clinician" on public.patients
  for select to authenticated
  using (public.is_clinician_for(patients.id));

create policy "targets_select_clinician" on public.targets
  for select to authenticated
  using (public.is_clinician_for(targets.patient_id));

create policy "sessions_select_clinician" on public.sessions
  for select to authenticated
  using (public.is_clinician_for(sessions.patient_id));

create policy "trials_select_clinician" on public.trials
  for select to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = trials.session_id and public.is_clinician_for(s.patient_id)
  ));

create policy "target_state_select_clinician" on public.target_state
  for select to authenticated
  using (exists (
    select 1 from public.targets t
    where t.id = target_state.target_id and public.is_clinician_for(t.patient_id)
  ));

-- Grant helpers (SECURITY DEFINER) --------------------------------------------------
-- Resolving a clinician by email, and listing a patient's clinicians by email, both require
-- reading auth.users, which is not exposed to `authenticated` via RLS. A SECURITY DEFINER function
-- called over RPC on the USER's client — NOT the service-role client on a request path — is the
-- sanctioned way (same pattern as ai_calls_today()): the elevation is confined to a vetted body
-- that re-checks caregiver ownership with auth.uid() before doing anything.

create function public.link_clinician(p_patient_id uuid, p_clinician_email text)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_clinician uuid;
begin
  -- Caller must own the patient whose data they are about to share.
  if not exists (
    select 1 from public.patients
    where id = p_patient_id and caregiver_id = auth.uid()
  ) then
    raise exception 'not authorized for this patient' using errcode = '42501';
  end if;

  select id into v_clinician
  from auth.users
  where lower(email) = lower(trim(p_clinician_email))
  limit 1;

  if v_clinician is null then
    raise exception 'no account for that email' using errcode = 'P0002';
  end if;
  if v_clinician = auth.uid() then
    raise exception 'cannot share with yourself' using errcode = '22023';
  end if;

  insert into public.clinician_patients (clinician_id, patient_id)
  values (v_clinician, p_patient_id)
  on conflict (clinician_id, patient_id) do nothing;

  return v_clinician;
end;
$$;

revoke all on function public.link_clinician(uuid, text) from public;
grant execute on function public.link_clinician(uuid, text) to authenticated;

-- Read side of the care-team UI: a caregiver lists who they've shared a patient with, by email.
-- Guarded by the same ownership check; returns only email + when it was granted, nothing else.
create function public.list_clinicians_for_patient(p_patient_id uuid)
  returns table (clinician_id uuid, email text, created_at timestamptz)
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if not exists (
    select 1 from public.patients
    where id = p_patient_id and caregiver_id = auth.uid()
  ) then
    raise exception 'not authorized for this patient' using errcode = '42501';
  end if;

  return query
    select cp.clinician_id, u.email::text, cp.created_at
    from public.clinician_patients cp
    join auth.users u on u.id = cp.clinician_id
    where cp.patient_id = p_patient_id
    order by cp.created_at;
end;
$$;

revoke all on function public.list_clinicians_for_patient(uuid) from public;
grant execute on function public.list_clinicians_for_patient(uuid) to authenticated;
