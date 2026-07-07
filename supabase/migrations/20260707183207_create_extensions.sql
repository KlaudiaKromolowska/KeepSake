-- Extensions required by the Keepsake schema.
-- gen_random_uuid() is a Postgres 13+ builtin (this stack runs PG17), so pgcrypto is not needed.
-- moddatetime: trigger that stamps updated_at on every UPDATE (used on every table below except
-- audit_log, which is an append-only ledger with no updated_at column).
create extension if not exists moddatetime with schema extensions;
