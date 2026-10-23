-- Ranki community plays: country + first/second guess.
-- Project: fkxbqftqxvgqrtvkpglx (ranki). Apply on the live database (Hao).
-- Idempotent. Safe to re-run.
--
-- Apply notes
-- 1. Run this file in the Ranki SQL editor (or `supabase db query`).
--    It does not read or store IP addresses.
-- 2. country_code already exists on the live table (nullable text, added
--    before this migration, all null as of 2026-10-23). This file keeps it,
--    adds a format check, and stops anon/authenticated inserts from setting it.
-- 3. first_guess / second_guess are jsonb. The same objects are also copied
--    into payload.firstGuess / payload.secondGuess so rows written before
--    these columns exist can still be aggregated.
-- 4. Deploy supabase/functions/submit-play (verify_jwt = false). It derives
--    country_code from the platform client IP (cf-connecting-ip, which
--    Cloudflare overwrites) via a country-only lookup, then inserts with the
--    service role. The browser never sends the IP and must not be trusted
--    for country_code. Until this migration is applied, submit-play retries
--    without first_guess/second_guess and still fills payload + country_code.
-- 5. community-stats already returns community_snapshots.doc unchanged, so
--    firstGuessWorld and firstGuessByCountry show up as soon as a snapshot
--    row contains them. Publish community-stats.json with
--    tools/rebuild_community_snapshot.py --publish once you have
--    SUPABASE_SERVICE_ROLE_KEY. Do not put that key in app.js.
-- 6. Direct SQL backfills that need to set country_code should run as
--    service_role (the column grant blocks anon). Bias-vs-region scoring is
--    intentionally not in this migration; first_guess and second_guess are
--    the raw submits that a later job can read.

alter table public.plays
  add column if not exists country_code text;

alter table public.plays
  add column if not exists first_guess jsonb;

alter table public.plays
  add column if not exists second_guess jsonb;

alter table public.plays drop constraint if exists plays_country_code_chk;
alter table public.plays
  add constraint plays_country_code_chk
  check (country_code is null or country_code ~ '^[A-Z]{2}$');

comment on column public.plays.country_code is
  'ISO 3166-1 alpha-2 derived by submit-play. Never a raw IP. Null when lookup fails. Anon cannot set this column.';

comment on column public.plays.first_guess is
  'First submit. rank {kind,order:[{name,emoji}]}; tier {kind,assign:[{name,emoji,tier,tierIndex}]}; match {kind,pairs:[{clueFor,person,personEmoji}]}; top5 {kind,name,emoji,hit,rank}. Mirrored in payload.firstGuess.';

comment on column public.plays.second_guess is
  'Second submit, same shape as first_guess, or null when the player stopped after one try. Not aggregated yet.';

comment on column public.plays.payload is
  'Final marks plus payload.firstGuess / payload.secondGuess. Practice is not inserted.';

create index if not exists plays_puzzle_country_idx
  on public.plays (puzzle_id, country_code);

-- Anon may insert a finished game, but not a country. submit-play uses the
-- service role, which keeps its existing table-wide privileges.
revoke insert, update on table public.plays from anon, authenticated;
grant insert (
  puzzle_id,
  day_key,
  mode,
  puzzle_type,
  solved,
  perfect,
  payload,
  first_guess,
  second_guess
) on table public.plays to anon, authenticated;
