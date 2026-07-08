-- Explicit DML grants for the API roles (anon, authenticated, service_role).
--
-- Why: Supabase's public-schema privilege hardening means a freshly created database no longer
-- auto-grants table DML to the API roles — a local `db reset` on 2026-07-08 produced a database
-- where every PostgREST request failed with "permission denied" despite correct RLS policies.
-- Databases created before the hardening (CI at the pinned CLI, the original local stack, the
-- remote project) still carry the classic defaults, where these GRANTs are idempotent no-ops.
-- RLS remains the security boundary; grants only re-open the base capability RLS then filters.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Tables created by future migrations (as postgres) inherit the same base grants.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- Re-assert the deliberate immutability revokes AFTER the broad grants, so ordering can never
-- soften them (audit_log and ai_usage are append-only for user-facing roles by design).
revoke update, delete on public.audit_log from authenticated, anon;
revoke update, delete on public.ai_usage from authenticated, anon;
