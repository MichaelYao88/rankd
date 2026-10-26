-- Puzzle suggestions from the Ranki.gg home page.
-- Project: fkxbqftqxvgqrtvkpglx (ranki). Apply on the live database.
-- Idempotent. Safe to re-run.
--
-- The browser inserts with the anon key (CONFIG.SUPABASE_ANON_KEY in app.js).
-- There is no select, update, or delete policy for anon or authenticated,
-- so a suggestion cannot be read back or edited from the client.
-- Use Prefer: return=minimal. return=representation needs a select policy
-- and will fail on purpose.
--
-- id and created_at are not granted to anon, so the client cannot choose them.
-- Read the rows in the SQL editor (table owner / service role bypasses RLS).

create table if not exists public.puzzle_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  question text not null,
  countries text,
  source_url text,
  handle text,
  user_agent text,
  anon_id text,
  constraint puzzle_submissions_question_len
    check (char_length(btrim(question)) between 1 and 280),
  constraint puzzle_submissions_countries_len
    check (countries is null or char_length(btrim(countries)) between 1 and 200),
  constraint puzzle_submissions_source_url_len
    check (
      source_url is null
      or (
        char_length(source_url) between 8 and 300
        and source_url ~* '^https?://[^[:space:]]+$'
      )
    ),
  constraint puzzle_submissions_handle_len
    check (handle is null or char_length(btrim(handle)) between 1 and 40),
  constraint puzzle_submissions_user_agent_len
    check (user_agent is null or char_length(user_agent) between 1 and 240),
  constraint puzzle_submissions_anon_id_len
    check (anon_id is null or char_length(anon_id) between 1 and 80)
);

comment on table public.puzzle_submissions is
  'Home-page puzzle suggestions. Anon may insert only. No client reads.';

comment on column public.puzzle_submissions.question is
  'Required stat or question, trimmed, 1–280 characters.';

comment on column public.puzzle_submissions.anon_id is
  'PostHog distinct id when the analytics stub has loaded a string id. Not an account.';

create index if not exists puzzle_submissions_created_at_idx
  on public.puzzle_submissions (created_at desc);

alter table public.puzzle_submissions enable row level security;

revoke all on table public.puzzle_submissions from anon, authenticated;

grant insert (
  question,
  countries,
  source_url,
  handle,
  user_agent,
  anon_id
) on table public.puzzle_submissions to anon;

drop policy if exists puzzle_submissions_anon_insert on public.puzzle_submissions;

create policy puzzle_submissions_anon_insert
  on public.puzzle_submissions
  for insert
  to anon
  with check (true);
