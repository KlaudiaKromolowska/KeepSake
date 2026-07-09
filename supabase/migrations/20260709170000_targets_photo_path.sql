-- Link a caregiver's uploaded photo (private `target-photos` bucket, added in the photo-upload
-- migration) to the target it dual-codes. PR #20 uploaded the photo and QA'd it but discarded the
-- returned object key, so the kiosk still rendered only the seeded `image_url`. This column stores
-- that storage object key (`<caregiver_id>/<uuid>.<ext>`) so the session loader can mint a
-- short-lived signed URL for it at session start.
--
-- No new RLS is needed: `targets` already carries per-tenant row policies (a caregiver reads/writes
-- only their own patient's targets), and this column rides those. The stored value is an object KEY,
-- never a URL or a secret — reading the bytes still requires a signed URL, which storage RLS scopes
-- to the owning caregiver's folder. Nullable: a target without an uploaded photo falls back to
-- `image_url` (seeded/placeholder), so every existing target keeps working untouched.

alter table targets add column if not exists photo_path text;

comment on column targets.photo_path is
  'Storage object key in the private target-photos bucket (<caregiver_id>/<uuid>.<ext>) for the '
  'caregiver''s uploaded dual-coding photo. Null falls back to image_url. Rendered only via a '
  'short-lived signed URL minted server-side through the RLS user client.';
