-- Ranki community plays: one first finish per puzzle per day, per device and per account.
-- Project: fkxbqftqxvgqrtvkpglx (ranki). Apply on the live database (Hao).
-- Idempotent. Safe to re-run. Do not apply from the app or from CI.
--
-- Apply notes
-- 1. Run this file in the Ranki SQL editor (or `supabase db query --linked`).
--    It does not read or store IP addresses.
-- 2. device_id is the browser id from rankd.device.v1. user_id is the signed-in
--    account id when there is one. Both are text UUIDs, nullable.
-- 3. A replay of the same puzzle on the same scheduled day is rejected.
--    A later day that reuses the puzzle id can still insert (day_key is in the key).
--    Null ids stay allowed: Postgres unique indexes treat nulls as distinct,
--    and these indexes are partial so legacy rows without an id are not collapsed.
-- 4. Deploy supabase/functions/submit-play after this. Until the columns exist
--    it retries without device_id and user_id. A unique violation (23505) is
--    returned as { ok: true, duplicate: true } and the client does not fall
--    back to a second insert.
-- 5. Anon and authenticated inserts cannot set device_id or user_id. submit-play
--    uses the service role. The browser REST fallback omits both columns.

alter table public.plays
  add column if not exists device_id text;

alter table public.plays
  add column if not exists user_id text;

alter table public.plays drop constraint if exists plays_device_id_chk;
alter table public.plays
  add constraint plays_device_id_chk
  check (device_id is null or device_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

alter table public.plays drop constraint if exists plays_user_id_chk;
alter table public.plays
  add constraint plays_user_id_chk
  check (user_id is null or user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

create unique index if not exists plays_puzzle_day_device_uidx
  on public.plays (puzzle_id, day_key, device_id)
  where device_id is not null;

create unique index if not exists plays_puzzle_day_user_uidx
  on public.plays (puzzle_id, day_key, user_id)
  where user_id is not null;

comment on column public.plays.device_id is
  'Browser id (rankd.device.v1). First completed play of this puzzle on this day. Replays are rejected. Anon cannot set this column.';

comment on column public.plays.user_id is
  'Signed-in account id when present. First completed play of this puzzle on this day for that account. Anon cannot set this column.';

revoke insert (device_id, user_id) on table public.plays from anon, authenticated;
