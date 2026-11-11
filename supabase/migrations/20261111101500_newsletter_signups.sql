-- Future daily newsletter addresses. Nothing is sent yet.
-- Project: fkxbqftqxvgqrtvkpglx (ranki). Apply on the live database.
-- Idempotent. Safe to re-run.
--
-- The browser inserts with the anon key (CONFIG.SUPABASE_ANON_KEY in app.js).
-- Anon may insert email, source, and puzzle_date only. There is no select,
-- update, or delete policy, so the list cannot be read or changed from the
-- client. Use a plain POST with Prefer: return=minimal. Do NOT use
-- ?on_conflict=email (an upsert needs SELECT, which anon does not have).
-- A repeat address violates the unique constraint (409) and is a no-op.
--
-- Export (SQL editor or service role; RLS does not apply to the owner):
--   select email, created_at, source, puzzle_date
--   from public.newsletter_signups
--   order by created_at;

create extension if not exists citext;

create table if not exists public.newsletter_signups (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  created_at timestamptz not null default now(),
  source text not null,
  puzzle_date date,
  constraint newsletter_signups_email_unique unique (email),
  constraint newsletter_signups_email_format
    check (email::text ~ '^[a-z0-9._%+\-]+@[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$'),
  constraint newsletter_signups_email_len
    check (char_length(email::text) between 6 and 254),
  constraint newsletter_signups_source_chk
    check (source in ('results', 'home')),
  constraint newsletter_signups_puzzle_date_sane
    check (puzzle_date is null or puzzle_date between date '2020-01-01' and date '2100-01-01')
);

comment on table public.newsletter_signups is
  'Email addresses for a future ranki.gg daily. Anon may insert only. No client reads.';

comment on column public.newsletter_signups.email is
  'Stored case-insensitively (citext). Duplicates are ignored.';

comment on column public.newsletter_signups.source is
  'Where the address was collected: results or home.';

comment on column public.newsletter_signups.puzzle_date is
  'The daily date on the results screen, when source is results.';

create index if not exists newsletter_signups_created_at_idx
  on public.newsletter_signups (created_at desc);

create or replace function public.newsletter_signups_normalize()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email := lower(btrim(new.email::text))::citext;
  new.source := lower(btrim(new.source));
  return new;
end;
$$;

drop trigger if exists newsletter_signups_normalize on public.newsletter_signups;
create trigger newsletter_signups_normalize
  before insert on public.newsletter_signups
  for each row
  execute function public.newsletter_signups_normalize();

revoke all on function public.newsletter_signups_normalize() from public, anon, authenticated;

alter table public.newsletter_signups enable row level security;

revoke all on table public.newsletter_signups from anon, authenticated;

grant insert (email, source, puzzle_date) on table public.newsletter_signups to anon;

drop policy if exists newsletter_signups_anon_insert on public.newsletter_signups;

create policy newsletter_signups_anon_insert
  on public.newsletter_signups
  for insert
  to anon
  with check (true);
