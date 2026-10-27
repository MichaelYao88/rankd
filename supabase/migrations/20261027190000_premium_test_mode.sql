-- Ranki: mark Premium that came from a Lemon Squeezy test-mode event.
-- Project: fkxbqftqxvgqrtvkpglx. Idempotent.
-- The webhook writes test_mode on premium_by_email and entitlements, and the
-- email claim copies it, so test grants can be found and cleared before launch:
--   select * from public.entitlements where test_mode;

alter table public.premium_by_email
  add column if not exists test_mode boolean not null default false;

alter table public.entitlements
  add column if not exists test_mode boolean not null default false;

comment on column public.entitlements.test_mode is
  'true when the grant came from a Lemon Squeezy test-mode event (RANKI_ALLOW_TEST_MODE). Clear these before launch.';

comment on column public.premium_by_email.test_mode is
  'true when the grant came from a Lemon Squeezy test-mode event.';

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
    source_variant_id, source_product, source_app, grant_via, user_email, test_mode, updated_at
  ) values (
    uid, email_active, rec.status, rec.current_period_end,
    rec.lemon_customer_id, rec.lemon_subscription_id, rec.lemon_order_id,
    rec.source_variant_id, rec.source_product, rec.source_app, 'email', em, rec.test_mode, pg_catalog.now()
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
    test_mode = excluded.test_mode,
    updated_at = pg_catalog.now();

  update public.premium_by_email
    set claimed_by = uid, claimed_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where email = em;

  return jsonb_build_object('claimed', email_active, 'reason', 'email');
end;
$fn$;

notify pgrst, 'reload schema';
