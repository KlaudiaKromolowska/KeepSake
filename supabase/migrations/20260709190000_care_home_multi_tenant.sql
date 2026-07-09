-- Care-home multi-tenant (PLAN §12 V3: "care-home multi-tenant, first B2B"). Lets a care-home
-- ORGANIZATION own patients and have several staff members, where a staff member can access ONLY
-- their own org's patients — never another org's, and never a solo family caregiver's. This is the
-- first B2B tenancy model. Scope here is the tenancy + access model ONLY: no billing/payments.
--
-- Design (a new table / a widened access surface is a security decision — justification):
--
--   * ADDITIVE, non-breaking. The solo family caregiver is untouched: their patients have
--     `org_id IS NULL`, every existing `caregiver_id = auth.uid()` policy is left exactly as-is, and
--     `is_org_member(NULL)`/`is_org_member_of_patient(<solo patient>)` are false — so no org member
--     can ever see a solo patient and the solo caregiver sees no org data. The org grants below are
--     brand-new policies OR'd on top (Postgres OR's permissive policies), never edits to the
--     caregiver policies.
--
--   * OWNERSHIP: a nullable `patients.org_id`, NOT an `org_patients` link table. A patient belongs to
--     at most ONE tenant, so a single nullable FK column is the simpler correct model — a link table
--     would model many-orgs-per-patient, which we explicitly do NOT want (a patient must not be
--     shared across care homes). To let an org patient be owned by the ORG rather than by any one
--     staff member (so it survives staff turnover and GDPR-erasure of an individual account), the
--     previously-NOT-NULL `caregiver_id` is made nullable and an org patient carries
--     `caregiver_id IS NULL, org_id = <org>`. A CHECK (`num_nonnulls(caregiver_id, org_id) = 1`) keeps
--     every patient owned by EXACTLY one of the two (never an orphan invisible to all, and never a
--     bridge row visible to both). Solo and org rows are kept strictly DISJOINT: the
--     existing caregiver INSERT/UPDATE WITH CHECKs are tightened by ONE conjunct — `org_id IS NULL` —
--     so the caregiver path only ever produces/edits solo patients and can NEVER inject a patient
--     into an org (setting org_id via the caregiver policy is denied). This is not a narrowing of
--     solo behavior: every existing solo patient already has org_id NULL, so the added conjunct is
--     always satisfied on the solo path. Org patients come exclusively from the admin-only
--     patients_insert_org policy (caregiver_id NULL). Onboarding an EXISTING solo patient into an org
--     is deliberately withheld from v1 (it would need an audited admin RPC that flips ownership) —
--     see the follow-ups note in the PR.
--
--   * ROLES: minimal — 'staff' | 'admin'. admin ONBOARDS/owns patients (sets `org_id`) and manages
--     membership; staff (and admin) DELIVER care (full read+write on the clinical child tables of the
--     org's patients: run sessions, manage targets). Two roles are the fewest that separate "who can
--     bring a patient into the home / add colleagues" from "who runs the practice sessions".
--
--   * NO self-service escalation. There is NO INSERT or UPDATE policy on organization_members at all,
--     so a user can neither add themselves to an org nor change their own role via the table. All
--     membership writes go through admin-gated SECURITY DEFINER RPCs; the sole bootstrap is
--     create_organization(), which makes its caller the first admin of a brand-new (memberless) org.
--
--   * RECURSION. Org SELECT policies on patients/organizations/organization_members must read
--     membership, and organization_members reading itself inside its own policy would raise 42P17
--     ("infinite recursion detected in policy"). Three SECURITY DEFINER helpers
--     (is_org_member / is_org_admin / is_org_member_of_patient) read membership WITHOUT re-entering
--     RLS — the same technique as #37's is_clinician_for(). Each returns only a boolean about the
--     CALLER (auth.uid()); none returns or leaks a row.

-- Tables ----------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organizations is
  'A care-home tenant (PLAN §12 V3). Created only via create_organization(), which atomically makes '
  'the caller its first admin. Members see it; admins may rename it.';

-- Membership link (many staff <-> many orgs). Role lives HERE (membership IS the grant) — there is
-- no separate global roles table. No updated_at / moddatetime: a row is immutable once created (no
-- UPDATE policy); a role change is a remove + re-add, and a grant is revoked by deletion.
create table public.organization_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'staff' check (role in ('staff', 'admin')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

comment on table public.organization_members is
  'Care-home staff membership + role (staff|admin). Membership IS the access grant. No INSERT/UPDATE '
  'policy exists — a user can never self-add or self-promote; all writes go through the admin-gated '
  'SECURITY DEFINER RPCs (create_organization / add_org_member). Removal (leave / admin-removes) is '
  'the only direct write, via the DELETE policy.';

-- The PK (org_id, user_id) serves the "who is in this org" lookup; this reverse index serves the
-- per-user "which orgs am I in" lookup used by every is_org_* helper (keyed on user_id = auth.uid()).
create index idx_organization_members_user_id on public.organization_members (user_id);

create trigger set_updated_at before update on public.organizations
  for each row execute function extensions.moddatetime(updated_at);

-- patients: add the org-ownership column, relax caregiver_id, keep every patient owned ------------

-- An org patient is owned by the ORG, not a person, so caregiver_id must be allowed to be null.
-- Existing solo rows keep their non-null caregiver_id and are wholly unaffected.
alter table public.patients alter column caregiver_id drop not null;

-- on delete SET NULL (not cascade): deleting an organization must NOT delete its patients' Article-9
-- data — the patient reverts to a plain (caregiver-owned) patient. Combined with the CHECK below,
-- that means an org patient can only be safely deleted, never silently orphaned.
alter table public.patients
  add column org_id uuid references public.organizations (id) on delete set null;

-- Every patient is owned by EXACTLY one of the two boundaries — never an orphan row that no policy
-- can reach, and never a "bridge" row visible to both a solo caregiver AND an org (which an
-- at-least-one check would permit if caregiver_id and org_id were ever both set). num_nonnulls(...)
-- = 1 makes the solo/org disjointness structural rather than merely an emergent property of today's
-- policies, so it still holds even if a future org-patient-UPDATE policy forgets to re-assert it.
alter table public.patients
  add constraint patients_owner_present
  check (num_nonnulls(caregiver_id, org_id) = 1);

-- Partial index: the vast majority of patients are solo (org_id null), so index only org rows — used
-- by the org SELECT policy and the org roster listing.
create index idx_patients_org_id on public.patients (org_id) where org_id is not null;

comment on column public.patients.org_id is
  'Owning care-home organization (PLAN §12 V3), or NULL for a solo family-caregiver patient. When '
  'set, caregiver_id is NULL and access is governed by org membership instead of caregiver_id.';

-- SECURITY DEFINER membership helpers -----------------------------------------------
-- All three read organization_members (and, for the third, patients) WITHOUT invoking those tables'
-- RLS — this is what breaks the mutual recursion the org policies would otherwise create. Each is
-- STABLE, sets an explicit search_path, and returns only a boolean about the CALLER's own
-- membership (auth.uid()); none can be used to read another user's rows.

create function public.is_org_member(p_org_id uuid)
  returns boolean
  language sql
  security definer
  set search_path = public
  stable
as $$
  select exists (
    select 1 from public.organization_members
    where org_id = p_org_id and user_id = auth.uid()
  );
$$;

create function public.is_org_admin(p_org_id uuid)
  returns boolean
  language sql
  security definer
  set search_path = public
  stable
as $$
  select exists (
    select 1 from public.organization_members
    where org_id = p_org_id and user_id = auth.uid() and role = 'admin'
  );
$$;

-- "Is the caller a member of the org that owns this patient?" — the workhorse for the clinical
-- child-table policies. Keyed on patient_id (like is_clinician_for) and joins to the patient's org
-- internally, so the child policies never re-read `patients` under RLS (no recursion, no leak).
create function public.is_org_member_of_patient(p_patient_id uuid)
  returns boolean
  language sql
  security definer
  set search_path = public
  stable
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.patients p on p.org_id = m.org_id
    where p.id = p_patient_id and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_admin(uuid) from public;
revoke all on function public.is_org_member_of_patient(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_org_member_of_patient(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

-- organizations policies ------------------------------------------------------------
-- SELECT: only members see their org. UPDATE: only an admin may rename it (and cannot move it out
-- from under themselves — WITH CHECK re-asserts admin on the new row). No INSERT policy (creation is
-- create_organization() only) and no DELETE policy (org teardown is an out-of-band/admin operation).
create policy "organizations_select_member" on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy "organizations_update_admin" on public.organizations
  for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- organization_members policies -----------------------------------------------------
-- SELECT: any member of an org sees that org's roster (their own row is included). DELETE: a member
-- may remove THEMSELVES (leave), or an admin may remove anyone in the org. Deliberately NO INSERT
-- and NO UPDATE policy: that is what structurally prevents self-add and self-promotion — every
-- membership write is forced through the admin-gated SECURITY DEFINER RPCs below.
create policy "organization_members_select_member" on public.organization_members
  for select to authenticated
  using (public.is_org_member(org_id));

create policy "organization_members_delete_self_or_admin" on public.organization_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_org_admin(org_id));

-- Tighten the existing caregiver INSERT/UPDATE WITH CHECKs to pin the caregiver path to SOLO
-- patients (org_id IS NULL). Without this, patients_update_own (which only checks caregiver_id)
-- would let a caregiver set org_id to ANY org and inject their own patient into that org's roster —
-- visible to members who never onboarded it. The added `org_id IS NULL` conjunct denies that while
-- leaving every solo operation unchanged (solo rows always have org_id NULL). USING is untouched, so
-- caregivers keep full read/update of their solo patients.
alter policy "patients_insert_own" on public.patients
  with check (caregiver_id = (select auth.uid()) and org_id is null);
alter policy "patients_update_own" on public.patients
  with check (caregiver_id = (select auth.uid()) and org_id is null);

-- patients: additive org access -----------------------------------------------------
-- SELECT: any member of the owning org sees the patient. INSERT: only an ADMIN may create an org
-- patient, and it must be org-owned (caregiver_id NULL, org_id set to an org the caller administers).
-- This is disjoint from the untouched caregiver INSERT policy (which requires caregiver_id =
-- auth.uid()), so the two never overlap. There is intentionally NO org UPDATE/DELETE policy on the
-- patient ROW in this first cut: the clinical child tables below carry the full care-delivery
-- surface, while re-tagging a patient's org or deleting the patient row is withheld (a member cannot
-- move a patient between orgs, and cannot delete an org patient) — a deliberately conservative
-- ownership surface. (Editing/removing the patient row for org patients is a documented follow-up.)
create policy "patients_select_org" on public.patients
  for select to authenticated
  using (public.is_org_member(org_id));

create policy "patients_insert_org" on public.patients
  for insert to authenticated
  with check (
    caregiver_id is null
    and org_id is not null
    and public.is_org_admin(org_id)
  );

-- Clinical child tables: full care-delivery capability for any org member -----------
-- targets / sessions / trials / target_state / consent — the "run sessions, manage targets" surface.
-- Each is a set of four additive policies (select/insert/update/delete) gated by
-- is_org_member_of_patient(...), mirroring the existing caregiver policies' shape one-for-one.
-- consent IS included (unlike the read-only clinician view): a staff member delivering the practice
-- must be able to see and manage the patient's consent state. memory_capsules is deliberately NOT
-- extended to org members — family-private media stays out of the tenancy surface (data minimization).

create policy "targets_select_org" on public.targets
  for select to authenticated
  using (public.is_org_member_of_patient(targets.patient_id));
create policy "targets_insert_org" on public.targets
  for insert to authenticated
  with check (public.is_org_member_of_patient(targets.patient_id));
create policy "targets_update_org" on public.targets
  for update to authenticated
  using (public.is_org_member_of_patient(targets.patient_id))
  with check (public.is_org_member_of_patient(targets.patient_id));
create policy "targets_delete_org" on public.targets
  for delete to authenticated
  using (public.is_org_member_of_patient(targets.patient_id));

create policy "sessions_select_org" on public.sessions
  for select to authenticated
  using (public.is_org_member_of_patient(sessions.patient_id));
create policy "sessions_insert_org" on public.sessions
  for insert to authenticated
  with check (public.is_org_member_of_patient(sessions.patient_id));
create policy "sessions_update_org" on public.sessions
  for update to authenticated
  using (public.is_org_member_of_patient(sessions.patient_id))
  with check (public.is_org_member_of_patient(sessions.patient_id));
create policy "sessions_delete_org" on public.sessions
  for delete to authenticated
  using (public.is_org_member_of_patient(sessions.patient_id));

create policy "trials_select_org" on public.trials
  for select to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = trials.session_id and public.is_org_member_of_patient(s.patient_id)
  ));
create policy "trials_insert_org" on public.trials
  for insert to authenticated
  with check (exists (
    select 1 from public.sessions s
    where s.id = trials.session_id and public.is_org_member_of_patient(s.patient_id)
  ));
create policy "trials_update_org" on public.trials
  for update to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = trials.session_id and public.is_org_member_of_patient(s.patient_id)
  ))
  with check (exists (
    select 1 from public.sessions s
    where s.id = trials.session_id and public.is_org_member_of_patient(s.patient_id)
  ));
create policy "trials_delete_org" on public.trials
  for delete to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = trials.session_id and public.is_org_member_of_patient(s.patient_id)
  ));

create policy "target_state_select_org" on public.target_state
  for select to authenticated
  using (exists (
    select 1 from public.targets t
    where t.id = target_state.target_id and public.is_org_member_of_patient(t.patient_id)
  ));
create policy "target_state_insert_org" on public.target_state
  for insert to authenticated
  with check (exists (
    select 1 from public.targets t
    where t.id = target_state.target_id and public.is_org_member_of_patient(t.patient_id)
  ));
create policy "target_state_update_org" on public.target_state
  for update to authenticated
  using (exists (
    select 1 from public.targets t
    where t.id = target_state.target_id and public.is_org_member_of_patient(t.patient_id)
  ))
  with check (exists (
    select 1 from public.targets t
    where t.id = target_state.target_id and public.is_org_member_of_patient(t.patient_id)
  ));
create policy "target_state_delete_org" on public.target_state
  for delete to authenticated
  using (exists (
    select 1 from public.targets t
    where t.id = target_state.target_id and public.is_org_member_of_patient(t.patient_id)
  ));

create policy "consent_select_org" on public.consent
  for select to authenticated
  using (public.is_org_member_of_patient(consent.patient_id));
create policy "consent_insert_org" on public.consent
  for insert to authenticated
  with check (public.is_org_member_of_patient(consent.patient_id));
create policy "consent_update_org" on public.consent
  for update to authenticated
  using (public.is_org_member_of_patient(consent.patient_id))
  with check (public.is_org_member_of_patient(consent.patient_id));
create policy "consent_delete_org" on public.consent
  for delete to authenticated
  using (public.is_org_member_of_patient(consent.patient_id));

-- SECURITY DEFINER RPCs (bootstrap + admin membership management) --------------------
-- Same pattern as link_clinician/list_clinicians_for_patient: elevation is confined to a vetted body
-- that re-checks the caller's authorization with auth.uid() before doing anything, and is called on
-- the USER's RLS client over RPC — never the service-role client on a request path.

-- Bootstrap: create a new org and atomically make the caller its first admin. This is the ONLY way
-- to gain a membership row without an existing admin (organization_members has no INSERT policy), and
-- the ONLY way to create an organization (organizations has no INSERT policy). Any authenticated user
-- may create their own org — that grants them nothing but a fresh, empty tenant they administer.
create function public.create_organization(p_name text)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org uuid;
  v_name text := trim(p_name);
begin
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 200 then
    raise exception 'invalid organization name' using errcode = '22023';
  end if;

  insert into public.organizations (name) values (v_name) returning id into v_org;
  insert into public.organization_members (org_id, user_id, role)
  values (v_org, auth.uid(), 'admin');

  return v_org;
end;
$$;

-- Admin adds a colleague by email. Re-checks the caller administers the org (else 42501), resolves
-- the invitee against auth.users (which `authenticated` cannot read directly — the reason this needs
-- definer), validates the role, and refuses an unknown email. on conflict do nothing: re-adding an
-- existing member is a harmless no-op and never changes an existing role (role changes are a
-- deliberate remove + re-add, so a stray re-invite can never silently promote/demote anyone).
create function public.add_org_member(p_org_id uuid, p_email text, p_role text default 'staff')
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_user uuid;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'not an admin of this organization' using errcode = '42501';
  end if;
  if p_role not in ('staff', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;

  select id into v_user
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_user is null then
    raise exception 'no account for that email' using errcode = 'P0002';
  end if;

  insert into public.organization_members (org_id, user_id, role)
  values (p_org_id, v_user, p_role)
  on conflict (org_id, user_id) do nothing;

  return v_user;
end;
$$;

-- Read side of the roster UI: an org member lists co-members by email. Guarded by membership; returns
-- only user_id + email + role + created_at (auth.users is not otherwise readable by `authenticated`).
create function public.list_org_members(p_org_id uuid)
  returns table (user_id uuid, email text, role text, created_at timestamptz)
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  return query
    select m.user_id, u.email::text, m.role, m.created_at
    from public.organization_members m
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org_id
    order by m.created_at;
end;
$$;

revoke all on function public.create_organization(text) from public;
revoke all on function public.add_org_member(uuid, text, text) from public;
revoke all on function public.list_org_members(uuid) from public;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.add_org_member(uuid, text, text) to authenticated;
grant execute on function public.list_org_members(uuid) to authenticated;
