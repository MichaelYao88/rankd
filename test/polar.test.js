const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const path = require("path");

const polar = require(path.join(__dirname, "..", "supabase", "functions", "polar-webhook", "handler.js"));

const PRODUCT = "b360892f-f07d-4412-be09-6f19b8c87d71";
const USER = "11111111-1111-4111-8111-111111111111";
const KEY = Buffer.from("0123456789abcdef0123456789abcdef");
const SECRET = "whsec_" + KEY.toString("base64");
const NOW = Date.parse("2026-11-13T12:00:00Z");
const NOW_S = Math.floor(NOW / 1000);

function sign(id, ts, raw, secret = SECRET) {
  const key = Buffer.from(secret.slice(6), "base64");
  return "v1," + crypto.createHmac("sha256", key).update(id + "." + ts + "." + raw).digest("base64");
}

function subscription(over) {
  return Object.assign({
    id: "sub_123",
    status: "active",
    product_id: PRODUCT,
    current_period_end: "2026-12-13T12:00:00Z",
    metadata: { user_id: USER, app: "ranki" },
    customer: { id: "cus_1", email: "Ada@Example.com", external_id: USER },
  }, over || {});
}

function event(type, data) {
  return { type, timestamp: "2026-11-13T12:00:00Z", data: data || subscription() };
}

test("a correctly signed delivery verifies, with the whsec_ key", async () => {
  const raw = JSON.stringify(event("subscription.active"));
  const id = "msg_abc";
  const ts = String(NOW_S);
  const headers = { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sign(id, ts, raw) };
  assert.equal(await polar.verifySignature(raw, headers, SECRET, NOW_S), true);
});

test("a signature header with an old and a new key still verifies", async () => {
  const raw = "{}";
  const id = "msg_rot";
  const ts = String(NOW_S);
  const old = sign(id, ts, raw, "whsec_" + Buffer.from("otherkey-otherkey-otherkey-xx").toString("base64"));
  const headers = { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": old + " " + sign(id, ts, raw) };
  assert.equal(await polar.verifySignature(raw, headers, SECRET, NOW_S), true);
});

test("a tampered body, a wrong secret, or a missing header fails", async () => {
  const raw = JSON.stringify(event("subscription.active"));
  const id = "msg_t";
  const ts = String(NOW_S);
  const good = { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sign(id, ts, raw) };
  assert.equal(await polar.verifySignature(raw.replace("active", "canceled"), good, SECRET, NOW_S), false);
  assert.equal(await polar.verifySignature(raw, good, "whsec_" + Buffer.from("wrong-wrong-wrong-wrong-wrong").toString("base64"), NOW_S), false);
  assert.equal(await polar.verifySignature(raw, { "webhook-id": id, "webhook-timestamp": ts }, SECRET, NOW_S), false);
  assert.equal(await polar.verifySignature(raw, good, "", NOW_S), false);
  assert.equal(await polar.verifySignature(raw, good, "notwhsec_" + KEY.toString("base64"), NOW_S), false);
});

test("a delivery outside the five-minute window is rejected (replay)", async () => {
  const raw = "{}";
  const id = "msg_old";
  const ts = String(NOW_S - 10 * 60);
  const headers = { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sign(id, ts, raw) };
  assert.equal(await polar.verifySignature(raw, headers, SECRET, NOW_S), false);
  const future = String(NOW_S + 10 * 60);
  const h2 = { "webhook-id": id, "webhook-timestamp": future, "webhook-signature": sign(id, future, raw) };
  assert.equal(await polar.verifySignature(raw, h2, SECRET, NOW_S), false);
});

test("an active subscription grants premium until its period end", () => {
  const d = polar.decidePolar(event("subscription.active"), { productId: PRODUCT }, "msg_1", NOW);
  assert.equal(d.ignore, false);
  assert.equal(d.grant.premium, true);
  assert.equal(d.grant.until, "2026-12-13T12:00:00.000Z");
  assert.equal(d.grant.userId, USER);
  assert.equal(d.grant.email, "ada@example.com");
  assert.equal(d.grant.subscriptionId, "sub_123");
  assert.equal(d.grant.customerId, "cus_1");
  assert.equal(d.webhookId, "msg_1");
});

test("trialing and past_due keep premium; revoked, unpaid and incomplete do not", () => {
  const ok = s => polar.decidePolar(event("subscription.updated", subscription({ status: s })), { productId: PRODUCT }, "m", NOW).grant.premium;
  assert.equal(ok("trialing"), true);
  assert.equal(ok("past_due"), true);
  assert.equal(ok("revoked"), false);
  assert.equal(ok("unpaid"), false);
  assert.equal(ok("incomplete"), false);
});

test("a canceled subscription keeps premium only until the period it paid for ends", () => {
  const before = polar.decidePolar(event("subscription.canceled", subscription({ status: "canceled" })), { productId: PRODUCT }, "m", NOW);
  assert.equal(before.grant.premium, true);
  const after = polar.decidePolar(event("subscription.canceled", subscription({ status: "canceled", current_period_end: "2026-11-01T00:00:00Z" })), { productId: PRODUCT }, "m", NOW);
  assert.equal(after.grant.premium, false);
});

test("events for another product, a missing product config, or a non-subscription event are ignored", () => {
  const other = polar.decidePolar(event("subscription.active", subscription({ product_id: "00000000-0000-4000-8000-000000000000" })), { productId: PRODUCT }, "m", NOW);
  assert.equal(other.ignore, true);
  assert.equal(other.reason, "product_rejected");
  const unset = polar.decidePolar(event("subscription.active"), { productId: "" }, "m", NOW);
  assert.equal(unset.reason, "product_unconfigured");
  const order = polar.decidePolar({ type: "order.paid", data: { id: "o1" } }, { productId: PRODUCT }, "m", NOW);
  assert.equal(order.ignore, true);
  assert.equal(order.reason, "event_ignored");
});

test("a delivery with no user and no email cannot be applied", () => {
  const d = polar.decidePolar(event("subscription.active", subscription({ metadata: {}, customer: { id: "c" } })), { productId: PRODUCT }, "m", NOW);
  assert.equal(d.ignore, true);
  assert.equal(d.reason, "no_recipient");
});

test("the user id falls back to the customer external_id", () => {
  const d = polar.decidePolar(event("subscription.active", subscription({ metadata: {} })), { productId: PRODUCT }, "m", NOW);
  assert.equal(d.grant.userId, USER);
});

test("applyPlan writes the Ranki user row when the user exists, and the email row always", () => {
  const d = polar.decidePolar(event("subscription.active"), { productId: PRODUCT }, "m", NOW);
  const plan = polar.applyPlan(d, true);
  assert.equal(plan.userRow.user_id, USER);
  assert.equal(plan.userRow.grant_via, "user_id");
  assert.equal(plan.userRow.polar_subscription_id, "sub_123");
  assert.equal(plan.userRow.polar_customer_id, "cus_1");
  assert.equal(plan.userRow.source_product, "ranki");
  assert.equal(plan.userRow.test_mode, false);
  assert.equal(plan.emailRow.email, "ada@example.com");
  assert.equal(plan.emailGrantUpdate, false);
});

test("applyPlan falls back to the email grant when the user does not exist yet", () => {
  const d = polar.decidePolar(event("subscription.active"), { productId: PRODUCT }, "m", NOW);
  const plan = polar.applyPlan(d, false);
  assert.equal(plan.userRow, null);
  assert.equal(plan.emailRow.email, "ada@example.com");
  assert.equal(plan.emailGrantUpdate, true);
});

test("an ignored decision writes nothing", () => {
  const plan = polar.applyPlan({ ignore: true, reason: "x", grant: null }, true);
  assert.equal(plan.userRow, null);
  assert.equal(plan.emailRow, null);
});

test("the Polar product id is only read from the function secret, never hardcoded to a Lemon id", () => {
  const src = require("fs").readFileSync(path.join(__dirname, "..", "supabase", "functions", "polar-webhook", "index.ts"), "utf8");
  assert.match(src, /Deno\.env\.get\("POLAR_PRODUCT_ID"\)/);
  assert.match(src, /Deno\.env\.get\("POLAR_WEBHOOK_SECRET"\)/);
  assert.doesNotMatch(src, /LEMONSQUEEZY/);
  assert.doesNotMatch(src, /lemonsqueezy/);
});

test("the checkout function answers the browser CORS preflight", () => {
  const src = require("fs").readFileSync(path.join(__dirname, "..", "supabase", "functions", "polar-checkout", "index.ts"), "utf8");
  assert.match(src, /Access-Control-Allow-Origin/);
  assert.match(src, /Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"/);
  assert.match(src, /if \(req\.method === "OPTIONS"\)/);
});

test("the email claim copies Polar ids and keeps the test_mode flag", () => {
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const files = require("fs").readdirSync(dir).filter(f => /\.sql$/i.test(f)).sort();
  const defs = files.filter(f => /create or replace function private\.claim_premium_email/i.test(require("fs").readFileSync(path.join(dir, f), "utf8")));
  assert.ok(defs.length > 0, "claim_premium_email is defined");
  const latest = require("fs").readFileSync(path.join(dir, defs[defs.length - 1]), "utf8");
  assert.match(latest, /polar_customer_id/);
  assert.match(latest, /polar_subscription_id/);
  assert.match(latest, /test_mode/);
});

test("the live claim ignores WhereIsShe rows so Ranki Premium stays Ranki-only", () => {
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const files = require("fs").readdirSync(dir).filter(f => /\.sql$/i.test(f)).sort();
  const defs = files.filter(f => /create or replace function private\.claim_premium_email/i.test(require("fs").readFileSync(path.join(dir, f), "utf8")));
  const latestFile = defs[defs.length - 1];
  assert.equal(latestFile, "20261113140000_ranki_only_claims.sql", "the newest definition carries the separation guard");
  const latest = require("fs").readFileSync(path.join(dir, latestFile), "utf8");
  assert.match(latest, /if rec\.source_product is distinct from 'ranki' then/);
  assert.match(latest, /'claimed', false, 'reason', 'other_product'/);
  // The guard has to run before anything is written to entitlements or premium_by_email.
  const guard = latest.indexOf("other_product");
  assert.ok(guard > 0 && guard < latest.indexOf("insert into public.entitlements"), "the guard precedes the entitlement write");
  assert.ok(guard < latest.indexOf("update public.premium_by_email"), "the guard precedes the email-row update");
  assert.match(latest, /Grants made before|grandfathered|Existing grants/i);
});

test("the Ranki project no longer hosts or configures a Lemon webhook", () => {
  const root = path.join(__dirname, "..");
  assert.equal(require("fs").existsSync(path.join(root, "supabase", "functions", "lemonsqueezy-webhook")), false);
  const setup = require("fs").readFileSync(path.join(root, "SETUP.md"), "utf8");
  assert.doesNotMatch(setup, /one-way/i);
  assert.match(setup, /Ranki-side `lemonsqueezy-webhook` function has been removed/);
  const functions = require("fs").readdirSync(path.join(root, "supabase", "functions"));
  assert.deepEqual(functions.sort(), ["community-stats", "polar-checkout", "polar-webhook", "submit-play"]);
});
