// Pure Polar decision logic for the Ranki webhook.
// No Deno, no database. polar-webhook/index.ts performs the writes.
// Node tests load this file with require(); the edge function imports it
// and reads globalThis.RankiPolar.
(function (factory) {
  "use strict";
  var api = factory();
  var g = typeof globalThis !== "undefined" ? globalThis : this;
  g.RankiPolar = api;
  if (typeof module === "object" && module && module.exports) module.exports = api;
})(function () {
  "use strict";

  // Standard Webhooks allows five minutes of clock skew.
  var TOLERANCE_SECONDS = 5 * 60;

  function asObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value;
  }

  function normalizeEmail(value) {
    var s = String(value == null ? "" : value).trim().toLowerCase();
    if (!s || s.length > 320) return "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "";
    return s;
  }

  function normalizeUserId(value) {
    var s = String(value == null ? "" : value).trim().toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : "";
  }

  function textId(value) {
    var s = String(value == null ? "" : value).trim();
    if (!s || s === "null" || s === "undefined") return null;
    return s.slice(0, 80);
  }

  function isoOrNull(value) {
    if (value == null || value === "") return null;
    var t = Date.parse(String(value));
    if (!isFinite(t)) return null;
    return new Date(t).toISOString();
  }

  function bytesToBase64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function base64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function timingSafeEqual(a, b) {
    var left = String(a || "");
    var right = String(b || "");
    if (left.length !== right.length) return false;
    var diff = 0;
    for (var i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
    return diff === 0;
  }

  // Standard Webhooks: signed content is "<id>.<timestamp>.<raw body>", HMAC-SHA256
  // with the base64-decoded part of the whsec_ secret. The signature header can hold
  // several space-separated "v1,<base64>" values (key rotation).
  async function verifySignature(raw, headers, secret, nowSeconds) {
    var h = asObject(headers);
    var id = String(h["webhook-id"] || "");
    var ts = String(h["webhook-timestamp"] || "");
    var sigHeader = String(h["webhook-signature"] || "");
    if (!secret || !id || !ts || !sigHeader) return false;
    if (secret.indexOf("whsec_") !== 0) return false;
    var stamp = parseInt(ts, 10);
    if (!isFinite(stamp)) return false;
    var now = nowSeconds == null ? Math.floor(Date.now() / 1000) : nowSeconds;
    if (Math.abs(now - stamp) > TOLERANCE_SECONDS) return false;
    var keyBytes;
    try { keyBytes = base64ToBytes(secret.slice(6)); } catch (e) { return false; }
    var key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    var signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id + "." + ts + "." + String(raw)));
    var expected = bytesToBase64(new Uint8Array(signed));
    var parts = sigHeader.split(/\s+/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.indexOf("v1,") !== 0) continue;
      if (timingSafeEqual(p.slice(3), expected)) return true;
    }
    return false;
  }

  function ignore(eventName, reason, extra) {
    var row = { ignore: true, reason: reason, eventName: eventName || "", grant: null, webhookId: "" };
    if (extra && extra.webhookId) row.webhookId = extra.webhookId;
    return row;
  }

  // Which premium state a Polar subscription status gives.
  //   active, trialing  -> premium until the period end
  //   past_due          -> still premium until the period end (Polar keeps retrying)
  //   canceled          -> premium only until the period end it already paid for
  //   revoked, unpaid, incomplete, anything else -> not premium
  function grantFor(status, periodEnd, now) {
    var s = String(status || "").toLowerCase();
    var until = isoOrNull(periodEnd);
    var t = until ? Date.parse(until) : NaN;
    if (s === "active" || s === "trialing" || s === "past_due") {
      return { premium: true, until: until, status: s };
    }
    if (s === "canceled" || s === "cancelled") {
      return { premium: isFinite(t) && t > now, until: until, status: "canceled" };
    }
    return { premium: false, until: until, status: s || "inactive" };
  }

  function decidePolar(event, env, webhookId, now) {
    var body = asObject(event);
    var type = String(body.type || "").trim();
    var data = asObject(body.data);
    var meta = asObject(data.metadata);
    var customer = asObject(data.customer);
    var id = textId(data.id);
    var productId = textId(data.product_id) || "";
    var wanted = String((env && env.productId) || "").trim().toLowerCase();

    if (!type || type.indexOf("subscription.") !== 0) return ignore(type, "event_ignored", { webhookId: webhookId });
    if (!id) return ignore(type, "missing_id", { webhookId: webhookId });
    if (!wanted) return ignore(type, "product_unconfigured", { webhookId: webhookId });
    if (productId.toLowerCase() !== wanted) return ignore(type, "product_rejected", { webhookId: webhookId });

    var email = normalizeEmail(customer.email);
    var userId = normalizeUserId(meta.user_id) || normalizeUserId(customer.external_id);
    if (!email && !userId) return ignore(type, "no_recipient", { webhookId: webhookId });

    var effect = grantFor(data.status, data.current_period_end, now);
    return {
      ignore: false,
      reason: "apply",
      eventName: type,
      webhookId: webhookId || "",
      grant: {
        premium: !!effect.premium,
        until: effect.until,
        status: effect.status,
        productId: productId,
        email: email,
        userId: userId,
        customerId: textId(customer.id),
        subscriptionId: id,
      },
    };
  }

  // Which rows the service role should write. premium_by_email is keyed by email;
  // entitlements is keyed by the Ranki auth user. userExists is true only when the
  // customer's user_id is a real auth user. Otherwise the email row holds the grant
  // until that person signs in and claims it.
  function applyPlan(decision, userExists) {
    if (!decision || decision.ignore || !decision.grant) {
      return { emailRow: null, userRow: null, emailGrantUpdate: false };
    }
    var g = decision.grant;
    var fields = {
      premium: g.premium,
      status: g.status,
      current_period_end: g.until,
      polar_customer_id: g.customerId,
      polar_subscription_id: g.subscriptionId,
      source_variant_id: g.productId,
      source_product: "ranki",
      source_app: "ranki",
      test_mode: false,
    };
    var emailRow = g.email ? Object.assign({ email: g.email }, fields) : null;
    var userRow = g.userId && userExists
      ? Object.assign({ user_id: g.userId, grant_via: "user_id", user_email: g.email || null }, fields)
      : null;
    return {
      emailRow: emailRow,
      userRow: userRow,
      emailGrantUpdate: !userRow && !!emailRow,
    };
  }

  return {
    TOLERANCE_SECONDS: TOLERANCE_SECONDS,
    verifySignature: verifySignature,
    decidePolar: decidePolar,
    grantFor: grantFor,
    applyPlan: applyPlan,
    normalizeEmail: normalizeEmail,
    normalizeUserId: normalizeUserId,
  };
});
