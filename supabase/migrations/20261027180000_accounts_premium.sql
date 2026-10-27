-- Ranki accounts + shared Premium (Ranki and WhereIsShe).
-- Project: fkxbqftqxvgqrtvkpglx. Apply in the SQL editor. Do not run from the site.
-- Idempotent. Safe to re-run.
--
-- One model:
--   profiles          the signed-in user (read own row; update display name and avatar only)
--   entitlements      Premium for that auth user (read own row; only the service role writes)
--   premium_by_email  Premium keyed by the Lemon customer email when the event's
--                     user_id is not a Ranki auth user (service role only)
--   lemon_events      every webhook call (service role only)
--
-- A signed-in user claims premium_by_email through public.claim_premium_email().
-- The function reads the confirmed email from auth.users. It does not trust
-- a client-supplied email or an editable profile claim. The privileged body lives in the
-- unexposed private schema.

create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------- profiles
alter table public.profiles
  add column if not exists display_name text,
  add column if not exists avatar_url text;

alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles add constraint profiles_display_name_len
  check (display_name is null or char_length(btrim(display_name)) between 1 and 80);

alter table public.profiles drop constraint if exists profiles_avatar_https;
alter table public.profiles add constraint profiles_avatar_https
  check (avatar_url is null or avatar_url ~* '^https://[^[:space:]]+$');

comment on table public.profiles is
  'Ranki account. Email is copied from auth.users. Display name and avatar are profile fields, not authorization.';

-- ---------------------------------------------------------------- entitlements
alter table public.entitlements
  add column if not exists source_variant_id text,
  add column if not exists source_product text,
  add column if not exists source_app text,
  add column if not exists grant_via text,
  add column if not exists user_email text,
  add column if not exists lemon_order_id text;

alter table public.entitlements drop constraint if exists entitlements_grant_via;
alter table public.entitlements add constraint entitlements_grant_via
  check (grant_via is null or grant_via in ('user_id', 'email'));

alter table public.entitlements drop constraint if exists entitlements_user_email_lower;
alter table public.entitlements add constraint entitlements_user_email_lower
  check (user_email is null or (user_email = lower(user_email) and char_length(user_email) <= 320));

alter table public.entitlements drop constraint if exists entitlements_source_product;
alter table public.entitlements add constraint entitlements_source_product
  check (source_product is null or source_product in ('ranki', 'whereisshe'));

comment on table public.entitlements is
  'Premium for one Ranki auth user. premium and current_period_end are the entitlement. Service role writes; the user can only read their row.';

comment on column public.entitlements.grant_via is
  'user_id: Lemon custom_data.user_id matched this Ranki account. email: claimed from premium_by_email.';

comment on column public.entitlements.source_product is
  'whereisshe for Lemon variant 2280847. ranki for any other accepted variant.';

comment on column public.entitlements.current_period_end is
  'Premium lasts until this time. Null while a paid order or an active subscription has no renews_at yet.';

create index if not exists entitlements_email_grant_idx
  on public.entitlements (user_email)
  where grant_via = 'email';

-- ---------------------------------------------------------------- premium by email
create table if not exists public.premium_by_email (
  email text primary key,
  premium boolean not null default false,
  status text,
  current_period_end timestamptz,
  lemon_customer_id text,
  lemon_subscription_id text,
  lemon_order_id text,
  source_variant_id text,
  source_product text,
  source_app text,
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint premium_by_email_email_shape
    check (email = lower(email) and char_length(email) between 3 and 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint premium_by_email_source_product
    check (source_product is null or source_product in ('ranki', 'whereisshe'))
);

comment on table public.premium_by_email is
  'Service-role only. A Lemon customer email that did not match a Ranki auth user, so a later sign-in with that verified email can claim it.';

create index if not exists premium_by_email_claimed_by_idx
  on public.premium_by_email (claimed_by);

-- ---------------------------------------------------------------- webhook log
alter table public.lemon_events
  add column if not exists signature_ok boolean,
  add column if not exists applied boolean not null default false,
  add column if not exists note text;

comment on table public.lemon_events is
  'Every Lemon Squeezy webhook call, including rejected signatures and ignored variants. Service role only.';

-- ---------------------------------------------------------------- privileges
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url) on table public.profiles to authenticated;

revoke all on table public.entitlements from public, anon, authenticated;
grant select on table public.entitlements to authenticated;

revoke all on table public.premium_by_email from public, anon, authenticated;
revoke all on table public.lemon_events from public, anon, authenticated;

-- The webhook uses the service role. Authenticated users never write these tables.
grant all on table public.profiles to service_role;
grant all on table public.entitlements to service_role;
grant all on table public.premium_by_email to service_role;
grant all on table public.lemon_events to service_role;

alter table public.profiles enable row level security;
alter table public.entitlements enable row level security;
alter table public.premium_by_email enable row level security;
alter table public.lemon_events enable row level security;

alter table public.premium_by_email force row level security;
alter table public.lemon_events force row level security;

drop policy if exists profiles_own_select on public.profiles;
create policy profiles_own_select
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists entitlements_own_select on public.entitlements;
create policy entitlements_own_select
  on public.entitlements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No insert, update, or delete policies on entitlements, premium_by_email, or lemon_events.

-- ---------------------------------------------------------------- claim
create or replace function private.claim_premium_email()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  uid uuid := auth.uid();
  em text;
  confirmed timestamptz;
  rec public.premium_by_email%rowtype;
  ent public.entitlements%rowtype;
  email_active boolean;
  ent_active boolean;
begin
  if uid is null then
    return jsonb_build_object('claimed', false, 'reason', 'signed_out');
  end if;

  select lower(pg_catalog.btrim(email)), email_confirmed_at
    into em, confirmed
  from auth.users
  where id = uid;

  if em is null or em = '' or confirmed is null then
    return jsonb_build_object('claimed', false, 'reason', 'email_unverified');
  end if;

  select * into rec from public.premium_by_email where email = em;
  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'none');
  end if;

  email_active := rec.premium
    and (rec.current_period_end is null or rec.current_period_end > pg_catalog.now());

  select * into ent from public.entitlements where user_id = uid;

  if found and ent.grant_via = 'user_id' then
    ent_active := ent.premium
      and (ent.current_period_end is null or ent.current_period_end > pg_catalog.now());
    if ent_active and not email_active then
      update public.premium_by_email
        set claimed_by = uid,
            claimed_at = coalesce(claimed_at, pg_catalog.now())
      where email = em;
      return jsonb_build_object('claimed', false, 'reason', 'kept_user_grant');
    end if;
    if ent_active and email_active then
      update public.entitlements
        set premium = true,
            current_period_end = case
              when ent.current_period_end is null or rec.current_period_end is null then null
              else greatest(ent.current_period_end, rec.current_period_end)
            end,
            updated_at = pg_catalog.now()
      where user_id = uid;
      update public.premium_by_email
        set claimed_by = uid, claimed_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where email = em;
      return jsonb_build_object('claimed', true, 'reason', 'merged');
    end if;
  end if;

  insert into public.entitlements (
    user_id, premium, status, current_period_end,
    lemon_customer_id, lemon_subscription_id, lemon_order_id,
    source_variant_id, source_product, source_app, grant_via, user_email, updated_at
  ) values (
    uid, email_active, rec.status, rec.current_period_end,
    rec.lemon_customer_id, rec.lemon_subscription_id, rec.lemon_order_id,
    rec.source_variant_id, rec.source_product, rec.source_app, 'email', em, pg_catalog.now()
  )
  on conflict (user_id) do update set
    premium = excluded.premium,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    lemon_customer_id = excluded.lemon_customer_id,
    lemon_subscription_id = excluded.lemon_subscription_id,
    lemon_order_id = excluded.lemon_order_id,
    source_variant_id = excluded.source_variant_id,
    source_product = excluded.source_product,
    source_app = excluded.source_app,
    grant_via = 'email',
    user_email = excluded.user_email,
    updated_at = pg_catalog.now();

  update public.premium_by_email
    set claimed_by = uid, claimed_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where email = em;

  return jsonb_build_object('claimed', email_active, 'reason', 'email');
end;
$fn$;

comment on function private.claim_premium_email() is
  'Copies premium_by_email for auth.uid() onto entitlements. Email comes from auth.users and must be confirmed.';

revoke all on function private.claim_premium_email() from public, anon;
grant execute on function private.claim_premium_email() to authenticated, service_role;

-- Exposed wrapper. security invoker so the Data API does not publish a
-- security-definer function. It only calls the private function above.
create or replace function public.claim_premium_email()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.claim_premium_email();
end;
$fn$;

comment on function public.claim_premium_email() is
  'Signed-in user claims a Premium row stored under their confirmed email. No arguments.';

revoke all on function public.claim_premium_email() from public, anon;
grant execute on function public.claim_premium_email() to authenticated;

-- ---------------------------------------------------------------- profile row
create or replace function private.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  em text := nullif(lower(pg_catalog.btrim(coalesce(new.email, ''))), '');
begin
  insert into public.profiles (user_id, email)
  values (new.id, em)
  on conflict (user_id) do update
    set email = excluded.email,
        updated_at = pg_catalog.now()
  where public.profiles.email is distinct from excluded.email;
  return new;
end;
$fn$;

revoke all on function private.sync_profile_from_auth() from public, anon, authenticated;

-- Auth inserts into auth.users as supabase_auth_admin. The trigger function is
-- security definer, so that role still needs EXECUTE after PUBLIC is revoked.
grant usage on schema private to supabase_auth_admin;
grant execute on function private.sync_profile_from_auth() to supabase_auth_admin;

drop trigger if exists ranki_sync_profile on auth.users;
create trigger ranki_sync_profile
  after insert or update of email on auth.users
  for each row execute function private.sync_profile_from_auth();

notify pgrst, 'reload schema';
