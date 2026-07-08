-- Patient-affect two-tap capture (TASKS.md 5.4). PLAN §8's schema sketch carried a 1–5 smallint
-- scale, but the shipped MVP interaction is PLAN §12's "patient-affect two-tap capture": exactly
-- two patient-tappable states, so the columns follow this schema's text + CHECK convention for
-- closed-but-churning sets. The smallint columns were never written by app code (seed only) —
-- dropped and replaced, nothing real to migrate. Null = the tap was skipped (capture is optional
-- and never blocks the session flow).

alter table public.sessions
  drop column patient_affect_pre,
  drop column patient_affect_post;

alter table public.sessions
  add column affect_pre text check (affect_pre in ('content', 'unsettled')),
  add column affect_post text check (affect_post in ('content', 'unsettled'));

comment on column public.sessions.affect_pre is
  'Patient two-tap affect before the first probe (content | unsettled); null = skipped.';
comment on column public.sessions.affect_post is
  'Patient two-tap affect after the end-on-win screen (content | unsettled); null = skipped.';
