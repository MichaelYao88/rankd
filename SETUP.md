# Ranki accounts and Premium

These steps are manual. The migrations are applied and the functions are deployed by hand.

Ranki project: `fkxbqftqxvgqrtvkpglx` (`https://fkxbqftqxvgqrtvkpglx.supabase.co`).

Ranki Premium covers ranki.gg only. It is sold through **Polar** at a flat **$5.67/month** and written to this project's entitlement table. WhereIsShe has its own separate Premium and checkout in its own Supabase project. A WhereIsShe purchase can still be claimed on Ranki by email (one-way), but a Ranki purchase does not grant WhereIsShe Premium.

## 1. Apply the migrations

In the Ranki SQL editor, run these in order. All are idempotent.

1. `supabase/migrations/20261027180000_accounts_premium.sql`
2. `supabase/migrations/20261027190000_premium_test_mode.sql`
3. `supabase/migrations/20261113120000_polar_premium.sql`
4. `supabase/migrations/20261113130000_claim_polar_ids.sql`

`accounts_premium` adds display name and avatar on `profiles`, source and email columns on `entitlements`, the service-role table `premium_by_email`, and `public.claim_premium_email()`. The privileged body is `private.claim_premium_email()`. It reads the confirmed email from `auth.users`; it does not trust `user_metadata`.

`polar_premium` adds the Polar id columns next to the Lemon ones. Lemon rows keep their values; Polar rows leave them null. `claim_polar_ids` makes the email claim copy Polar customer/subscription ids and the `test_mode` flag.

Do not add the `private` schema to Exposed schemas (Project Settings → Data API). Leave the exposed list as it is (`public` only, unless you already added something else).

## 2. Google sign-in

WhereIsShe has no Google client to copy. Create a new one.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a new project.
2. APIs & Services → OAuth consent screen. User type External. App name **Ranki**. Add your contact email. Scopes can stay the defaults (`openid`, `email`, `profile`).
3. APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
4. Authorized redirect URI, exactly:

   `https://fkxbqftqxvgqrtvkpglx.supabase.co/auth/v1/callback`

5. Supabase Dashboard → Authentication → Providers → Google. Enable it and paste the client id and client secret.

## 3. Email magic link

Authentication → Providers → Email. Leave the built-in email provider enabled. Do not add custom SMTP or Resend for now. The site calls `signInWithOtp`, which sends Supabase's magic link. Built-in email has a low hourly cap.

## 4. Redirect URLs

Authentication → URL configuration.

- Site URL: `https://ranki.gg`
- Redirect allow list:
  - `https://ranki.gg/**`
  - `https://www.ranki.gg/**`
  - `https://michaelyao88.github.io/rankd/**`

## 5. Polar product

Organization **rankigg** (`355729cb-5e2b-4099-b091-6a3f684756ae`), product **Ranki Premium** (`b360892f-f07d-4412-be09-6f19b8c87d71`).

One recurring USD price: **567** = **$5.67/month** (`690226b1-fb46-4d00-9bb4-c73e3fc800b3`).

The site does not link a static Polar checkout. The signed-in browser calls the `polar-checkout` function (`CONFIG.premium.checkoutFunction`), which creates a session with `external_customer_id` and `metadata.user_id` set to the Ranki auth user id. That is how the webhook finds the user even if checkout uses a different email.

## 6. Deploy the checkout function

```bash
supabase functions deploy polar-checkout --project-ref fkxbqftqxvgqrtvkpglx
```

JWT verification stays **on** (the default). The caller must be signed in; the user id comes from the verified token, never from the request body. The function returns CORS headers because the browser preflights it.

Secrets: `POLAR_ACCESS_TOKEN` (organization access token with `checkouts:write`) and `POLAR_PRODUCT_ID`.

## 7. Deploy the webhook function

In the Polar dashboard, add one webhook endpoint:

`https://fkxbqftqxvgqrtvkpglx.supabase.co/functions/v1/polar-webhook`

Subscribe it to the `subscription.*` events. The signing secret is `whsec_...`; you will paste it as `POLAR_WEBHOOK_SECRET`.

```bash
supabase functions deploy polar-webhook --project-ref fkxbqftqxvgqrtvkpglx --no-verify-jwt
```

`--no-verify-jwt` is required. Polar does not send a Supabase JWT. The Standard Webhooks signature is the authentication.

Deliveries are recorded in `lemon_events` with `lemon_event_id = "polar:<webhook-id>"`. That table name is historical; it is the shared event log, service-role only. Replays are deduped by webhook id.

What the function does:

- Bad or missing signature, or a delivery outside the five-minute window → 401. Missing secret or service key → 500. Invalid JSON → 400. A failed write → 500 so Polar retries.
- Any event for another product, a missing `POLAR_PRODUCT_ID`, or a non-`subscription.*` event → ignored (200).
- `active`, `trialing`, and `past_due` keep Premium until the current period end.
- `canceled` keeps Premium only until the period it already paid for ends.
- `revoked`, `unpaid`, `incomplete`, and anything else turn Premium off.
- The user id comes from `metadata.user_id`, falling back to the customer's `external_id`. Premium is written to that user's `entitlements` row when the user exists; the email row is always written to `premium_by_email` under the lowercased customer email.

## 8. Secrets

```bash
supabase secrets set --project-ref fkxbqftqxvgqrtvkpglx \
  POLAR_ACCESS_TOKEN='polar_oat_...' \
  POLAR_PRODUCT_ID='b360892f-f07d-4412-be09-6f19b8c87d71' \
  POLAR_WEBHOOK_SECRET='whsec_...'
```

- `POLAR_PRODUCT_ID` is required. It is read only from the function secret; no Lemon id is hardcoded as a fallback.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected.
- The webhook reads the service key from `SUPABASE_SERVICE_ROLE_KEY`, then `SUPABASE_SECRET_KEY`, then `SUPABASE_SECRET_KEYS` (`default` or `service_role`). Do not put the service role in the website.
- Polar is live-mode only here. There is no `RANKI_ALLOW_TEST_MODE` gate on the Polar webhook; a sandbox delivery is treated like a live one.

## 9. How Premium is claimed

On sign-in, and every time the profile reloads, the site calls `claim_premium_email`. That copies an active `premium_by_email` row onto the signed-in user when `auth.users.email` matches and `email_confirmed_at` is set, including the Polar customer/subscription ids. An active direct `user_id` grant is not turned off by an inactive email row. If both are active, the later end date is kept (a null end is open-ended).

This is one-way. A Ranki purchase does not grant WhereIsShe Premium.

## 10. WhereIsShe (do not change that repo from here)

WhereIsShe keeps its own Lemon checkout and its own Premium in its own Supabase project. The Ranki `lemonsqueezy-webhook` function remains deployed only so a WhereIsShe purchase can still be claimed on Ranki by email. If you ever drop that one-way path, delete the function and section 9 with it.

## 11. Going live

1. Confirm `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_ID`, and `POLAR_WEBHOOK_SECRET` are set in the Ranki project.
2. Confirm the Polar endpoint is enabled and subscribed to `subscription.*`.
3. Do a real $5.67 purchase, confirm the entitlement row, then refund/cancel and confirm Premium turns off.
4. Only then set `CONFIG.archiveGate = true` in `app.js`. It stays **off** until that full purchase → webhook → refund cycle has been verified live.
5. Publish Google's consent screen if it is still in testing, and add the live domain to the OAuth client if Google asks for one.
6. When a new daily page appears, run `tools/make_daily_og.ps1` (Windows, after `node tools/build_review_site.js`) and commit `og/daily/<date>.png`. Daily pages use it for `og:image` / `twitter:image` and fall back to `og.png` when a day has no image yet.

## Appendix: historical Lemon setup

Ranki used to sell through Lemon Squeezy. The old product was store **mikelyaps** (`504191`), checkout `ca1efbfa-7ab8-4fe6-b96a-694c1f5691fa`, variant `2280847` (WhereIsShe). Copy was **From $2.67/month · suggested $6.70**. That checkout is no longer used for Ranki. The `lemonsqueezy-webhook` function and its `LEMONSQUEEZY_*` secrets exist only for the one-way WhereIsShe → Ranki email claim described in section 9.
