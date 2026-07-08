-- Caregiver photo upload for memory-target dual-coding (V1). A PRIVATE storage bucket holding a
-- caregiver's own photo of the patient's world — treat it with the same RLS discipline as every
-- Article-9 table: objects are scoped per caregiver by path prefix, and a caregiver can only ever
-- read, write, or delete objects under their own `auth.uid()` folder. service_role (server-only,
-- never a user request path) bypasses RLS by design.
--
-- Object key layout: `<caregiver_id>/<uuid>.<ext>`. The FIRST path segment is the ownership key —
-- RLS compares `(storage.foldername(name))[1]` to the caller's uid, so the folder prefix is the
-- security boundary, not a naming convention.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'target-photos',
  'target-photos',
  false,           -- private: reads go through RLS + signed URLs, never a public CDN path
  5242880,         -- 5 MiB; the server-side zod check mirrors this (never trust the bucket alone)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by Supabase; add per-caregiver ownership policies scoped
-- to THIS bucket only (policies on storage.objects are global to the table, hence the bucket_id
-- guard and the `target_photos_` name prefix). `(select auth.uid())` initplan form matches the
-- public-schema policies — evaluated once per statement, not once per row.

create policy "target_photos_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'target-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "target_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'target-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "target_photos_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'target-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'target-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "target_photos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'target-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
