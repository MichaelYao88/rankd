# Ranki accounts and Premium

These steps are manual. This pull request does not apply the migration and does not deploy the function.

Ranki project: `fkxbqftqxvgqrtvkpglx` (`https://fkxbqftqxvgqrtvkpglx.supabase.co`).

One Premium covers Ranki and WhereIsShe. Both games use Lemon store **mikelyaps**, store id **504191**, and the same customer email. They use separate Supabase projects. Each Lemon webhook receives every event for the store, so a WhereIsShe purchase also reaches Ranki's webhook.

## 1. Apply the migration

In the Ranki SQL editor, run `supabase/migrations/20261027180000_accounts_premium.sql`.

It adds display name and avatar on `profiles`, source and email columns on `entitlements`, a service-role table `premium_by_email`, and `public.claim_premium_email()`. The privileged body is `private.claim_premium_email()`. It reads the confirmed email from `auth.users`. It does not trust `user_metadata`.

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

## 5. Lemon product

Store **mikelyaps**, store id **504191**.

The site already points at the existing WhereIsShe test checkout:

`https://mikelyaps.lemonsqueezy.com/checkout/buy/ca1efbfa-7ab8-4fe6-b96a-694c1f5691fa`

That link is `CONFIG.premium.checkoutUrl` in `app.js`. Checkout is opened with `checkout[custom][user_id]`, `checkout[custom][app]=ranki`, and `checkout[email]`.

Copy on the site is **From $2.67/month · suggested $6.70**. The pitch is that Premium unlocks Ranki and WhereIsShe (no ads, full archive, ad-free Practice).

If you later create a dedicated shared product, make it a **subscription**, **monthly**, **pay what you want**, minimum **$2.67**, suggested **$6.70**. Replace `checkoutUrl` with that product's link. Keep passing the same three checkout fields.

## 6. Lemon webhook

In the Lemon dashboard, add a webhook:

`https://fkxbqftqxvgqrtvkpglx.supabase.co/functions/v1/lemonsqueezy-webhook`

Signing secret: a long random string. You will paste it as `LEMONSQUEEZY_WEBHOOK_SECRET`.

Events:

- `order_created`
- `order_refunded`
- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_resumed`
- `subscription_expired`
- `subscription_paused`
- `subscription_unpaused`

Lemon signs the raw body. `X-Signature` is the HMAC-SHA256 hex digest.

## 7. Deploy the function

From this repo, with the Supabase CLI logged in:

```bash
supabase functions deploy lemonsqueezy-webhook --project-ref fkxbqftqxvgqrtvkpglx --no-verify-jwt
```

`--no-verify-jwt` is required. Lemon does not send a Supabase JWT. The signature check is the authentication.

## 8. Secrets

```bash
supabase secrets set --project-ref fkxbqftqxvgqrtvkpglx \
  LEMONSQUEEZY_WEBHOOK_SECRET='paste-the-signing-secret' \
  LEMONSQUEEZY_STORE_ID='504191' \
  LEMONSQUEEZY_VARIANT_IDS='2280847' \
  RANKI_ALLOW_TEST_MODE='true'
```

- `LEMONSQUEEZY_VARIANT_IDS` is required. If it is unset, every event is logged and ignored (HTTP 200) and nobody is granted Premium. `2280847` is the WhereIsShe variant. The current checkout sells that variant, so it must stay in the list. When a separate Ranki variant exists, append its id. Do not remove `2280847`.
- Variants not in the list are ignored, including other products in the same store.
- `RANKI_ALLOW_TEST_MODE=true` while the checkout is in test mode. Test-mode events are ignored when this is unset or not `true`/`1`/`yes`/`on`.
- `SUPABASE_URL` is injected. The service key is read from `SUPABASE_SERVICE_ROLE_KEY`, then `SUPABASE_SECRET_KEY`, then `SUPABASE_SECRET_KEYS` (`default` or `service_role`). Do not put the service role in the website.

What the function does:

- Bad signature → 401. Missing secret or service key → 500. Invalid JSON → 400. A failed write → 500 so Lemon retries.
- Ignored events (wrong store, variant not listed, test mode while the flag is off, unpaid order) → 200.
- `order_created` with status `paid` turns Premium on. `order_refunded` turns it off.
- Subscription `active`, `on_trial`, and `past_due` keep Premium until `renews_at`. `cancelled` keeps it until `ends_at` when that time is still in the future. `paused`, `expired`, `unpaid`, and a cancelled subscription with no future `ends_at` turn it off.
- If `meta.custom_data.user_id` is a Ranki auth user, Premium is written to that user's `entitlements` row (`grant_via = user_id`). Otherwise the row is stored in `premium_by_email` under the lowercased customer email. An email refund also updates `entitlements` rows already claimed with `grant_via = email` for that address.
- Variant `2280847` is marked `source_product = whereisshe`. Any other accepted variant is `ranki`. `custom_data.app` is stored as `source_app`.

## 9. How a WhereIsShe subscriber gets Ranki Premium

On sign-in, and every time the profile reloads, the site calls `claim_premium_email`. That copies an active `premium_by_email` row onto the signed-in user when `auth.users.email` matches and `email_confirmed_at` is set. An active direct `user_id` grant is not turned off by an inactive email row. If both are active, the later end date is kept (a null end is open-ended).

## 10. WhereIsShe (do not change that repo from here)

When a separate Ranki variant id exists, add it to WhereIsShe's `LEMONSQUEEZY_VARIANT_IDS`. Leave `2280847` in place. WhereIsShe's webhook should do the same match Ranki does: if `custom_data.user_id` is a WhereIsShe auth user, grant that user; otherwise store the entitlement under the lowercased Lemon customer email. On WhereIsShe sign-in, claim that email row only when it matches the confirmed auth email. Same Lemon store `504191`.

## 11. Going live

1. Switch the Lemon product and webhook out of test mode, or point `CONFIG.premium.checkoutUrl` at the live checkout if the URL changes.
2. Set `RANKI_ALLOW_TEST_MODE` to `false`, or unset it.
3. Use the live webhook signing secret.
4. Publish Google's consent screen if it is still in testing, and add the live domain to the OAuth client if Google asks for one.
