-- Abuse-prevention follow-up from #42's review: create_organization() was unrestricted, so any
-- authenticated user could mint UNLIMITED empty organizations (becoming admin of each) — no PHI
-- exposure (a fresh org is empty), but an obvious spam/scripted-abuse vector against the DB. This is
-- a NEW migration (CREATE OR REPLACE), not an edit to 20260709190000_care_home_multi_tenant.sql,
-- because that migration is already applied on main.
--
-- Enforcement is SERVER-SIDE inside the SECURITY DEFINER function body — not app-side only, which a
-- direct `supabase.rpc("create_organization", ...)` call (bypassing apps/web entirely) would evade.
-- The check counts the CALLER's own existing admin memberships (organization_members where
-- user_id = auth.uid() and role = 'admin') and denies once the count reaches the cap, BEFORE any
-- insert — so a denied call leaves both `organizations` and `organization_members` untouched.
--
-- Cap = 10, chosen generously: no legitimate care-home operator plausibly administers more than a
-- handful of tenants, so 10 is far above any real use, while still bounding a scripted loop to a
-- small, cheap-to-clean-up number of rows. The error is a single generic, non-enumerating message
-- (SQLSTATE 54000 program_limit_exceeded) — it reveals nothing about WHY beyond "try again later /
-- contact support"; apps/web's `failAction` already collapses all RPC errors into one caregiver-
-- facing string, so no caller-visible behavior changes beyond the new denial itself.
--
-- Every other aspect of the function (signature, search_path, EXECUTE grants, name-validation
-- behavior, the atomic org+admin-membership insert) is byte-identical to the original.
create or replace function public.create_organization(p_name text)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org uuid;
  v_name text := trim(p_name);
  v_cap constant int := 10;
  v_owned_count int;
begin
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 200 then
    raise exception 'invalid organization name' using errcode = '22023';
  end if;

  select count(*) into v_owned_count
  from public.organization_members
  where user_id = auth.uid() and role = 'admin';

  if v_owned_count >= v_cap then
    raise exception 'organization creation limit reached' using errcode = '54000';
  end if;

  insert into public.organizations (name) values (v_name) returning id into v_org;
  insert into public.organization_members (org_id, user_id, role)
  values (v_org, auth.uid(), 'admin');

  return v_org;
end;
$$;

revoke all on function public.create_organization(text) from public;
grant execute on function public.create_organization(text) to authenticated;
