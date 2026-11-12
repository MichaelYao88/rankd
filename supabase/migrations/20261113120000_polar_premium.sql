-- Polar is the payment provider for Ranki Premium. These columns hold Polar's ids
-- next to the Lemon ones. Lemon rows keep their values; Polar rows leave them null.
-- Idempotent.

alter table public.entitlements
  add column if not exists polar_customer_id text,
  add column if not exists polar_subscription_id text;

alter table public.premium_by_email
  add column if not exists polar_customer_id text,
  add column if not exists polar_subscription_id text;

comment on column public.entitlements.polar_subscription_id is
  'Polar subscription id for the Ranki Premium product. Written by the polar-webhook function.';
