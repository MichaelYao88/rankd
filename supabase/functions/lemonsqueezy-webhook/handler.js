// Pure Lemon Squeezy decision logic for the Ranki webhook.
// No Deno, no database. index.ts performs the writes.
// Node tests load this file with require(); the edge function imports it
// and reads globalThis.RankiLemon.
(function (factory) {
  "use strict";
  var api = factory();
  var g = typeof globalThis !== "undefined" ? globalThis : this;
  g.RankiLemon = api;
  if (typeof module === "object" && module && module.exports) module.exports = api;
})(function () {
  "use strict";

  // WhereIsShe's variant in store mikelyaps. Ranki accepts it only when it is
  // listed in LEMONSQUEEZY_VARIANT_IDS. It is never an implicit allow.
  var WHEREISSHE_VARIANT_ID = "2280847";

  var SUBSCRIPTION_EVENTS = {
    subscription_created: true,
    subscription_updated: true,
    subscription_cancelled: true,
    subscription_canceled: true,
    subscription_resumed: true,
    subscription_expired: true,
    subscription_paused: true,
    subscription_unpaused: true,
  };

  function envFlag(value) {
    var s = String(value == null ? "" : value).trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "on";
  }

  function asObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value;
  }

  function digits(value) {
    var s = String(value == null ? "" : value).trim();
    return /^[0-9]{1,20}$/.test(s) ? s : "";
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

  function isoOrNull(value) {
    if (value == null || value === "") return null;
    var t = Date.parse(String(value));
    if (!isFinite(t)) return null;
    return new Date(t).toISOString();
  }

  function sourceProductFor(variantId) {
    return String(variantId) === WHEREISSHE_VARIANT_ID ? "whereisshe" : "ranki";
  }

  function variantFilter(raw) {
    var trimmed = String(raw == null ? "" : raw).trim();
    if (!trimmed) return { configured: false, ids: {} };
    var ids = {};
    trimmed.split(/[\s,]+/).forEach(function (part) {
      var id = digits(part);
      if (id) ids[id] = true;
    });
    return { configured: true, ids: ids };
  }

  function variantIdOf(attrs) {
    var direct = digits(attrs.variant_id);
    if (direct) return direct;
    var item = asObject(attrs.first_order_item);
    return digits(item.variant_id);
  }

  function isTestMode(meta, attrs) {
    return meta.test_mode === true || attrs.test_mode === true ||
      String(meta.test_mode) === "true" || String(attrs.test_mode) === "true";
  }

  function textId(value) {
    var s = String(value == null ? "" : value).trim();
    if (!s || s === "null" || s === "undefined") return null;
    return s.slice(0, 80);
  }

  function bytesToHex(buf) {
    var bytes = new Uint8Array(buf);
    var out = "";
    for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
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

  function normalizeSignature(header) {
    var s = String(header || "").trim().toLowerCase();
    if (s.indexOf("sha256=") === 0) s = s.slice(7);
    return /^[0-9a-f]{64}$/.test(s) ? s : "";
  }

  async function verifySignature(raw, header, secret) {
    var expected = normalizeSignature(header);
    if (!secret || !expected) return false;
    var enc = new TextEncoder();
    var key = await crypto.subtle.importKey(
      "raw",
      enc.encode(String(secret)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    var sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(raw)));
    return timingSafeEqual(bytesToHex(sig), expected);
  }

  function ignore(eventName, reason, extra) {
    var row = { ignore: true, reason: reason, eventName: eventName || "", grant: null, webhookId: "", eventKey: "" };
    if (extra) {
      if (extra.webhookId) row.webhookId = extra.webhookId;
      if (extra.eventKey) row.eventKey = extra.eventKey;
      if (extra.testMode != null) row.testMode = extra.testMode;
      if (extra.variantId) row.variantId = extra.variantId;
      if (extra.storeId) row.storeId = extra.storeId;
    }
    return row;
  }

  function subscriptionGrant(status, renewsAt, endsAt, now) {
    var s = String(status || "").toLowerCase();
    if (s === "active" || s === "on_trial" || s === "past_due") {
      return { premium: true, until: isoOrNull(renewsAt), status: s };
    }
    if (s === "cancelled" || s === "canceled") {
      var until = isoOrNull(endsAt);
      var t = until ? Date.parse(until) : NaN;
      return { premium: isFinite(t) && t > now, until: until, status: "cancelled" };
    }
    return { premium: false, until: isoOrNull(endsAt) || isoOrNull(renewsAt), status: s || "inactive" };
  }

  // Lemon sends no delivery id. meta.webhook_id names the configured webhook,
  // so every delivery to one endpoint shares it and it must not be used to
  // dedupe. A retry keeps event name, resource and updated_at; a real change
  // moves updated_at.
  function eventKeyOf(eventName, data, attrs) {
    var type = String(data.type || "").trim();
    var id = textId(data.id);
    if (!eventName || !type || !id) return "";
    var stamp = isoOrNull(attrs.updated_at) || isoOrNull(attrs.created_at) || "";
    return (eventName + ":" + type + ":" + id + ":" + stamp).slice(0, 200);
  }

  function decideLemon(payload, env, now) {
    var body = asObject(payload);
    var meta = asObject(body.meta);
    var data = asObject(body.data);
    var attrs = asObject(data.attributes);
    var eventName = String(meta.event_name || "").trim();
    var webhookId = textId(meta.webhook_id) || "";
    var custom = asObject(meta.custom_data);
    var testMode = isTestMode(meta, attrs);
    var storeId = digits(attrs.store_id);
    var variantId = variantIdOf(attrs);
    var eventKey = eventKeyOf(eventName, data, attrs);
    var base = { webhookId: webhookId, eventKey: eventKey, testMode: testMode, variantId: variantId, storeId: storeId };

    if (!eventName) return ignore("", "missing_event", base);
    var isOrder = eventName === "order_created" || eventName === "order_refunded";
    var isSub = !!SUBSCRIPTION_EVENTS[eventName];
    if (!isOrder && !isSub) return ignore(eventName, "event_ignored", base);

    if (testMode && !(env && env.allowTestMode)) return ignore(eventName, "test_mode", base);

    var wantStore = digits(env && env.storeId);
    if (wantStore && storeId !== wantStore) return ignore(eventName, "store_mismatch", base);

    var filter = variantFilter(env && env.variantIds);
    if (!filter.configured) return ignore(eventName, "variant_filter_unconfigured", base);
    if (!variantId || !filter.ids[variantId]) return ignore(eventName, "variant_rejected", base);

    var effect;
    if (eventName === "order_refunded") {
      effect = { premium: false, until: null, status: "refunded" };
    } else if (eventName === "order_created") {
      var paid = String(attrs.status || "").toLowerCase() === "paid" && attrs.refunded !== true;
      if (!paid) return ignore(eventName, "order_not_paid", base);
      effect = { premium: true, until: null, status: "paid" };
    } else {
      var status = String(attrs.status || "").toLowerCase();
      if (!status) {
        if (eventName === "subscription_expired" || eventName === "subscription_paused") {
          effect = { premium: false, until: isoOrNull(attrs.ends_at), status: eventName.replace("subscription_", "") };
        } else if (eventName === "subscription_cancelled" || eventName === "subscription_canceled") {
          effect = subscriptionGrant("cancelled", attrs.renews_at, attrs.ends_at, now);
        } else {
          return ignore(eventName, "missing_status", base);
        }
      } else {
        effect = subscriptionGrant(status, attrs.renews_at, attrs.ends_at, now);
      }
    }

    var email = normalizeEmail(attrs.user_email);
    var userId = normalizeUserId(custom.user_id);
    if (!email && !userId) return ignore(eventName, "no_recipient", base);

    var app = String(custom.app || "").trim().toLowerCase().slice(0, 40);

    return {
      ignore: false,
      reason: "apply",
      eventName: eventName,
      webhookId: webhookId,
      eventKey: eventKey,
      testMode: testMode,
      variantId: variantId,
      storeId: storeId,
      grant: {
        premium: !!effect.premium,
        until: effect.until,
        status: effect.status,
        variantId: variantId,
        sourceProduct: sourceProductFor(variantId),
        sourceApp: app,
        email: email,
        userId: userId,
        customerId: textId(attrs.customer_id),
        subscriptionId: data.type === "subscriptions" ? textId(data.id) : textId(attrs.subscription_id),
        orderId: data.type === "orders" ? textId(data.id) : textId(attrs.order_id),
        testMode: testMode,
      },
    };
  }

  // Which rows the service role should write. premium_by_email is keyed by
  // email and has no user_email column; entitlements carries user_email. userExists is true only when
  // custom_data.user_id is a Ranki auth user. Otherwise the email table holds
  // the entitlement until that person signs in and claims it.
  function applyPlan(decision, userExists) {
    if (!decision || decision.ignore || !decision.grant) {
      return { emailRow: null, userRow: null, emailGrantUpdate: false };
    }
    var g = decision.grant;
    var fields = {
      premium: g.premium,
      status: g.status,
      current_period_end: g.until,
      lemon_customer_id: g.customerId,
      lemon_subscription_id: g.subscriptionId,
      lemon_order_id: g.orderId,
      source_variant_id: g.variantId,
      source_product: g.sourceProduct,
      source_app: g.sourceApp || null,
      test_mode: !!g.testMode,
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
    WHEREISSHE_VARIANT_ID: WHEREISSHE_VARIANT_ID,
    envFlag: envFlag,
    sourceProductFor: sourceProductFor,
    verifySignature: verifySignature,
    decideLemon: decideLemon,
    eventKeyOf: eventKeyOf,
    applyPlan: applyPlan,
    normalizeEmail: normalizeEmail,
    normalizeUserId: normalizeUserId,
  };
});
