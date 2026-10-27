const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const lemon = require("../supabase/functions/lemonsqueezy-webhook/handler.js");
const indexSrc = fs.readFileSync(path.join(__dirname, "../supabase/functions/lemonsqueezy-webhook/index.ts"), "utf8");
const migration = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261027180000_accounts_premium.sql"), "utf8");

const NOW = Date.parse("2026-10-27T12:00:00.000Z");
const RENEWS = "2026-11-27T12:00:00.000Z";
const ENDS_FUTURE = "2026-11-15T12:00:00.000Z";
const ENDS_PAST = "2026-10-01T12:00:00.000Z";
const RANKI_USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";

function env(over) {
  return Object.assign({
    variantIds: "2280847,999001",
    storeId: "504191",
    allowTestMode: false,
  }, over);
}

function order(overAttrs, overMeta) {
  return {
    meta: Object.assign({
      event_name: "order_created",
      webhook_id: "wh_order",
      custom_data: { user_id: RANKI_USER, app: "ranki" },
      test_mode: false,
    }, overMeta),
    data: {
      type: "orders",
      id: "55",
      attributes: Object.assign({
        store_id: 504191,
        customer_id: 9,
        user_email: "Ada@Example.com",
        status: "paid",
        refunded: false,
        test_mode: false,
        first_order_item: { variant_id: 2280847, product_name: "Premium" },
      }, overAttrs),
    },
  };
}

function sub(event, status, extraAttrs, overMeta) {
  return {
    meta: Object.assign({
      event_name: event,
      webhook_id: "wh_" + event,
      custom_data: { user_id: RANKI_USER, app: "ranki" },
    }, overMeta),
    data: {
      type: "subscriptions",
      id: "77",
      attributes: Object.assign({
        store_id: 504191,
        customer_id: 9,
        order_id: 55,
        user_email: "ada@example.com",
        status: status,
        variant_id: 2280847,
        renews_at: RENEWS,
        ends_at: null,
        test_mode: false,
        product_name: "Premium",
      }, extraAttrs),
    },
  };
}

test("the webhook verifies HMAC-SHA256 hex of the raw body", async () => {
  const raw = '{"ok":true}';
  const secret = "ranki-secret";
  const good = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(await lemon.verifySignature(raw, good, secret), true);
  assert.equal(await lemon.verifySignature(raw, good.toUpperCase(), secret), true);
  assert.equal(await lemon.verifySignature(raw, "sha256=" + good, secret), true);
  assert.equal(await lemon.verifySignature(raw + " ", good, secret), false);
  assert.equal(await lemon.verifySignature(raw, good, "other"), false);
  assert.equal(await lemon.verifySignature(raw, "", secret), false);
  assert.equal(await lemon.verifySignature(raw, good, ""), false);
});

test("variant 2280847 is WhereIsShe and is not accepted unless the allow list says so", () => {
  assert.equal(lemon.WHEREISSHE_VARIANT_ID, "2280847");
  assert.equal(lemon.sourceProductFor("2280847"), "whereisshe");
  assert.equal(lemon.sourceProductFor("999001"), "ranki");

  const blocked = lemon.decideLemon(order(), env({ variantIds: "" }), NOW);
  assert.equal(blocked.ignore, true);
  assert.equal(blocked.reason, "variant_filter_unconfigured");

  const otherOnly = lemon.decideLemon(order(), env({ variantIds: "999001" }), NOW);
  assert.equal(otherOnly.ignore, true);
  assert.equal(otherOnly.reason, "variant_rejected");

  const allowed = lemon.decideLemon(order(), env(), NOW);
  assert.equal(allowed.ignore, false);
  assert.equal(allowed.grant.sourceProduct, "whereisshe");
  assert.equal(allowed.grant.variantId, "2280847");
  assert.equal(allowed.grant.sourceApp, "ranki");
});

test("a Ranki variant grants Premium and is marked ranki", () => {
  const payload = order({ first_order_item: { variant_id: 999001 } });
  const decision = lemon.decideLemon(payload, env(), NOW);
  assert.equal(decision.ignore, false);
  assert.equal(decision.grant.sourceProduct, "ranki");
  assert.equal(decision.grant.premium, true);
  assert.equal(decision.grant.until, null);
  assert.equal(decision.grant.status, "paid");
  assert.equal(decision.grant.email, "ada@example.com");
  assert.equal(decision.grant.userId, RANKI_USER);
});

test("store id and test mode are filters, and ignored cases stay ignorable", () => {
  assert.equal(lemon.decideLemon(order(), env({ storeId: "1" }), NOW).reason, "store_mismatch");
  assert.equal(lemon.decideLemon(order(), env({ storeId: "" }), NOW).ignore, false);
  const testOrder = order({ test_mode: true }, { test_mode: true });
  assert.equal(lemon.decideLemon(testOrder, env(), NOW).reason, "test_mode");
  assert.equal(lemon.decideLemon(testOrder, env({ allowTestMode: true }), NOW).ignore, false);
  assert.equal(lemon.envFlag("true"), true);
  assert.equal(lemon.envFlag("1"), true);
  assert.equal(lemon.envFlag("yes"), true);
  assert.equal(lemon.envFlag("on"), true);
  assert.equal(lemon.envFlag(""), false);
  assert.equal(lemon.envFlag("false"), false);
  assert.equal(lemon.decideLemon({ meta: { event_name: "license_key_created" } }, env(), NOW).reason, "event_ignored");
});

test("orders grant only when paid, and refunds turn Premium off", () => {
  const pending = lemon.decideLemon(order({ status: "pending" }), env(), NOW);
  assert.equal(pending.reason, "order_not_paid");
  const refundedFlag = lemon.decideLemon(order({ refunded: true }), env(), NOW);
  assert.equal(refundedFlag.reason, "order_not_paid");

  const refund = lemon.decideLemon(order({}, { event_name: "order_refunded" }), env(), NOW);
  assert.equal(refund.ignore, false);
  assert.equal(refund.grant.premium, false);
  assert.equal(refund.grant.status, "refunded");
});

test("subscription status decides the Premium window", () => {
  for (const status of ["active", "on_trial", "past_due"]) {
    const decision = lemon.decideLemon(sub("subscription_updated", status), env(), NOW);
    assert.equal(decision.grant.premium, true, status);
    assert.equal(decision.grant.until, new Date(RENEWS).toISOString(), status);
  }
  const cancelled = lemon.decideLemon(sub("subscription_cancelled", "cancelled", { ends_at: ENDS_FUTURE, renews_at: null }), env(), NOW);
  assert.equal(cancelled.grant.premium, true);
  assert.equal(cancelled.grant.until, new Date(ENDS_FUTURE).toISOString());

  const ended = lemon.decideLemon(sub("subscription_cancelled", "cancelled", { ends_at: ENDS_PAST }), env(), NOW);
  assert.equal(ended.grant.premium, false);

  const noEnd = lemon.decideLemon(sub("subscription_cancelled", "cancelled", { ends_at: null, renews_at: null }), env(), NOW);
  assert.equal(noEnd.grant.premium, false);

  for (const pair of [["subscription_expired", "expired"], ["subscription_paused", "paused"], ["subscription_updated", "unpaid"]]) {
    const decision = lemon.decideLemon(sub(pair[0], pair[1]), env(), NOW);
    assert.equal(decision.grant.premium, false, pair[0] + " " + pair[1]);
  }

  const resumed = lemon.decideLemon(sub("subscription_resumed", "active"), env(), NOW);
  assert.equal(resumed.grant.premium, true);
  const unpaused = lemon.decideLemon(sub("subscription_unpaused", "active"), env(), NOW);
  assert.equal(unpaused.grant.premium, true);
});

test("a user id that is not a Ranki account is stored by email only", () => {
  const payload = order({}, { custom_data: { user_id: OTHER_USER, app: "whereisshe" } });
  const decision = lemon.decideLemon(payload, env(), NOW);
  assert.equal(decision.grant.userId, OTHER_USER);
  assert.equal(decision.grant.email, "ada@example.com");
  assert.equal(decision.grant.sourceApp, "whereisshe");

  const missing = lemon.applyPlan(decision, false);
  assert.equal(missing.userRow, null);
  assert.equal(missing.emailRow.email, "ada@example.com");
  assert.equal(missing.emailRow.premium, true);
  assert.equal(missing.emailRow.source_product, "whereisshe");
  assert.equal(missing.emailGrantUpdate, true);

  const present = lemon.applyPlan(decision, true);
  assert.equal(present.userRow.user_id, OTHER_USER);
  assert.equal(present.userRow.grant_via, "user_id");
  assert.equal(present.emailRow.email, "ada@example.com");
  assert.equal(present.emailGrantUpdate, false);
});

test("garbage custom data does not invent a user id", () => {
  const payload = order({}, { custom_data: [] });
  const decision = lemon.decideLemon(payload, env(), NOW);
  assert.equal(decision.grant.userId, "");
  assert.equal(decision.grant.email, "ada@example.com");
  const plan = lemon.applyPlan(decision, true);
  assert.equal(plan.userRow, null);
  assert.ok(plan.emailRow);
});

test("the edge function verifies the signature, logs, and does not require a user JWT", () => {
  assert.match(indexSrc, /X-Signature/);
  assert.match(indexSrc, /verifySignature/);
  assert.match(indexSrc, /lemon_events/);
  assert.match(indexSrc, /premium_by_email/);
  assert.match(indexSrc, /getUserById/);
  assert.match(indexSrc, /--no-verify-jwt/);
  assert.match(indexSrc, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(indexSrc, /SUPABASE_SECRET_KEYS/);
  assert.match(indexSrc, /RANKI_ALLOW_TEST_MODE/);
  assert.match(indexSrc, /LEMONSQUEEZY_VARIANT_IDS/);
  assert.match(indexSrc, /LEMONSQUEEZY_STORE_ID/);
  assert.equal(indexSrc.includes("verify_jwt = true"), false);
});

test("the migration keeps entitlement writes on the service role and exposes email claim", () => {
  assert.match(migration, /premium_by_email/);
  assert.match(migration, /revoke all on table public\.entitlements from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.entitlements to authenticated/);
  assert.match(migration, /grant update \(display_name, avatar_url\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /auth\.users/);
  assert.match(migration, /email_confirmed_at/);
  assert.doesNotMatch(migration, /user_metadata/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /claim_premium_email/);
  assert.match(migration, /grant execute on function private\.sync_profile_from_auth\(\) to supabase_auth_admin/);
  assert.match(migration, /grant all on table public\.premium_by_email to service_role/);
  const claimStart = migration.indexOf("create or replace function public.claim_premium_email()");
  const claimEnd = migration.indexOf("create or replace function private.sync_profile_from_auth", claimStart);
  const claimFn = migration.slice(claimStart, claimEnd);
  assert.match(claimFn, /security invoker/);
  assert.doesNotMatch(claimFn, /security definer/);
});

test("premium_by_email rows carry only its own columns, and user rows carry user_email", () => {
  const migrationCols = ["email", "premium", "status", "current_period_end", "lemon_customer_id", "lemon_subscription_id",
    "lemon_order_id", "source_variant_id", "source_product", "source_app", "test_mode"];
  const decision = lemon.decideLemon(order({}, { custom_data: {} }), env(), NOW);
  const plan = lemon.applyPlan(decision, false);
  assert.equal("user_email" in plan.emailRow, false);
  for (const key of Object.keys(plan.emailRow)) assert.ok(migrationCols.includes(key), key);
  const direct = lemon.applyPlan(lemon.decideLemon(order(), env(), NOW), true);
  assert.equal(direct.userRow.user_email, "ada@example.com");
});

test("test-mode grants are marked test_mode", () => {
  const testOrder = order({ test_mode: true }, { test_mode: true, custom_data: {} });
  const plan = lemon.applyPlan(lemon.decideLemon(testOrder, env({ allowTestMode: true }), NOW), false);
  assert.equal(plan.emailRow.test_mode, true);
  const live = lemon.applyPlan(lemon.decideLemon(order(), env(), NOW), true);
  assert.equal(live.userRow.test_mode, false);
});

test("dedupe uses a per-event key, not meta.webhook_id, which is shared by every delivery", () => {
  const a = lemon.decideLemon(order({ updated_at: "2026-10-27T08:24:30Z" }), env(), NOW);
  const b = lemon.decideLemon(sub("subscription_created", "active", { updated_at: "2026-10-27T08:24:31Z" }, { webhook_id: "wh_order" }), env(), NOW);
  assert.equal(a.webhookId, b.webhookId);
  assert.notEqual(a.eventKey, b.eventKey);
  assert.equal(a.eventKey, "order_created:orders:55:2026-10-27T08:24:30.000Z");
  const retry = lemon.decideLemon(order({ updated_at: "2026-10-27T08:24:30Z" }), env(), NOW);
  assert.equal(retry.eventKey, a.eventKey);
  assert.doesNotMatch(indexSrc, /alreadyApplied\(admin, decision\.webhookId\)/);
  assert.match(indexSrc, /console\.error\("lemon apply_failed"/);
});

test("the test-mode migration adds the column and the claim copies it", () => {
  const m = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261027190000_premium_test_mode.sql"), "utf8");
  assert.match(m, /alter table public\.premium_by_email\s+add column if not exists test_mode/);
  assert.match(m, /alter table public\.entitlements\s+add column if not exists test_mode/);
  assert.match(m, /rec\.test_mode/);
  assert.match(m, /security definer/);
});
