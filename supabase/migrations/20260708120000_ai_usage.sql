-- ai_usage — per-call ledger for AI quota enforcement (Phase 4 Task 1). The ONLY schema change
-- this phase. Every AI entry point records one row here BEFORE calling Anthropic; the two limits
-- (per-user hourly, global daily) are read off this table. Append-only, like audit_log: caregivers
-- may INSERT and SELECT their own rows and nothing else. The global daily counter is exposed via a
-- SECURITY DEFINER function so a caregiver can check the shared ceiling without being able to read
-- (or count) any other caregiver's rows.

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references auth.users (id) on delete cascade,
  kind text not null
    check (kind in ('wizard', 'vision', 'debrief', 'distractors', 'rct')),
  created_at timestamptz not null default now()
);

-- (caregiver_id, created_at) serves the per-user rolling-hour count; (created_at) serves the
-- global rolling-day count inside ai_calls_today().
create index idx_ai_usage_caregiver_id_created_at on public.ai_usage (caregiver_id, created_at);
create index idx_ai_usage_created_at on public.ai_usage (created_at);

alter table public.ai_usage enable row level security;

create policy "ai_usage_insert_own" on public.ai_usage
  for insert to authenticated
  with check (caregiver_id = (select auth.uid()));

create policy "ai_usage_select_own" on public.ai_usage
  for select to authenticated
  using (caregiver_id = (select auth.uid()));

-- No update/delete policy: the ledger is immutable from the authenticated role. Defense-in-depth
-- beyond absence-of-policy, mirroring audit_log — a future migration that mistakenly adds an
-- update/delete policy still needs these grants to take effect.
revoke update, delete on public.ai_usage from authenticated, anon;

-- Global rolling-day counter. SECURITY DEFINER so it counts across ALL caregivers (bypassing the
-- per-row SELECT policy above) while returning only an aggregate — never any row's contents.
create function public.ai_calls_today()
  returns bigint
  language sql
  security definer
  set search_path = public
  stable
as $$
  select count(*) from public.ai_usage where created_at > now() - interval '1 day'
$$;

revoke all on function public.ai_calls_today() from public;
grant execute on function public.ai_calls_today() to authenticated;
