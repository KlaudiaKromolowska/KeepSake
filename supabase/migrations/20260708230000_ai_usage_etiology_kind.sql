-- Phase 5.7: the etiology extended-thinking surface is a new AI entry point and must be metered
-- like the rest — widen the ai_usage kind allowlist to include 'etiology'. No table/RLS changes.

alter table public.ai_usage drop constraint ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('wizard', 'vision', 'debrief', 'distractors', 'rct', 'grade', 'etiology'));
