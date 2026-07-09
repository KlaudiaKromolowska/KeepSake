-- Memory capsules (PLAN §12 V2: "family photo/video memory capsules as recall rewards") — the
-- literal reason the app is called Keepsake. A caregiver curates a few family photos / short videos
-- for a patient; during a session the kiosk briefly plays ONE as a warm reward when the patient
-- correctly recalls a target. This is family-private Article-9-adjacent media, so it gets the same
-- RLS discipline as every other table here.
--
-- Two parts: a PRIVATE storage bucket (bytes) + a metadata table (which capsule belongs to which
-- patient). Ownership on both is the caregiver: the bucket object key is `<caregiver_id>/<uuid>.<ext>`
-- (first path segment = the RLS ownership key, mirroring `target-photos`), and the table row is
-- reachable only by the caregiver who owns the patient it hangs off.

-- Storage bucket --------------------------------------------------------------------
-- Private: reads go through RLS + short-lived signed URLs minted server-side on the USER client,
-- never a public CDN path. Size limit covers a short clip; the server-side zod check enforces a
-- tighter, per-kind bound (photos 5 MiB, videos 25 MiB) — never trust the bucket limit alone.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'memory-capsules',
  'memory-capsules',
  false,
  26214400,        -- 25 MiB — a short family clip; per-kind zod bounds are stricter (server-side)
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do nothing;

-- Per-caregiver ownership policies scoped to THIS bucket only (storage.objects policies are global
-- to the table, hence the bucket_id guard + the `memory_capsules_` name prefix). Identical folder-RLS
-- shape as `target-photos`: `(storage.foldername(name))[1]` (the caregiver uid) must equal the
-- caller. `(select auth.uid())` initplan form — evaluated once per statement, not per row.

create policy "memory_capsules_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'memory-capsules'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "memory_capsules_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'memory-capsules'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "memory_capsules_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'memory-capsules'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'memory-capsules'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "memory_capsules_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'memory-capsules'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Metadata table --------------------------------------------------------------------
-- kind is text + CHECK (not a native enum) per the §8 schema rule — churn-friendly. caption is
-- optional (data minimization; wellness-safe copy, no disease naming — §10). created_by records the
-- curating caregiver (== the storage folder owner). Hard delete + ON DELETE CASCADE: erasing a
-- patient (or the caregiver account) removes their capsules' metadata with them (§8 GDPR erasure);
-- the storage object itself is removed by the app on delete / re-seed.

create table public.memory_capsules (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('photo', 'video')),
  caption text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.memory_capsules is
  'Family photo/video memory capsules (PLAN §12 V2) shown as a warm reward on a correct recall. '
  'Family-private: a caregiver curates/sees only their own patient''s capsules. Deliberately NO '
  'clinician SELECT policy — capsules are never part of the read-only clinician trend view.';

comment on column public.memory_capsules.storage_path is
  'Object key in the private memory-capsules bucket (<caregiver_id>/<uuid>.<ext>). Rendered only via '
  'a short-lived signed URL minted server-side on the RLS user client.';

-- Index the patient FK (Postgres does not auto-index FKs) — the kiosk + manage screen both list a
-- patient's capsules by patient_id.
create index idx_memory_capsules_patient_id on public.memory_capsules (patient_id);

create trigger set_updated_at before update on public.memory_capsules
  for each row execute function extensions.moddatetime(updated_at);

alter table public.memory_capsules enable row level security;

-- RLS: ownership joined up through patients (a caregiver owns rows for patients they own) — the exact
-- shape used by targets/sessions/trials. There is deliberately NO clinician SELECT policy here: the
-- family's private media must never surface in the read-only clinician trend view (data minimization
-- + family privacy). Clinician visibility is intentionally excluded, not forgotten.

create policy "memory_capsules_select_own" on public.memory_capsules
  for select to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = memory_capsules.patient_id and p.caregiver_id = (select auth.uid())
  ));

create policy "memory_capsules_insert_own" on public.memory_capsules
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.patients p
      where p.id = memory_capsules.patient_id and p.caregiver_id = (select auth.uid())
    )
  );

create policy "memory_capsules_update_own" on public.memory_capsules
  for update to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = memory_capsules.patient_id and p.caregiver_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.patients p
    where p.id = memory_capsules.patient_id and p.caregiver_id = (select auth.uid())
  ));

create policy "memory_capsules_delete_own" on public.memory_capsules
  for delete to authenticated
  using (exists (
    select 1 from public.patients p
    where p.id = memory_capsules.patient_id and p.caregiver_id = (select auth.uid())
  ));
