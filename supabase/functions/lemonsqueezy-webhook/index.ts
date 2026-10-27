// Ranki Lemon Squeezy webhook.
// Deploy with: supabase functions deploy lemonsqueezy-webhook --project-ref fkxbqftqxvgqrtvkpglx --no-verify-jwt
// Lemon does not send a Supabase JWT. The body is authenticated with X-Signature
// (HMAC-SHA256 hex of the raw body, secret LEMONSQUEEZY_WEBHOOK_SECRET).
//
// One Premium covers Ranki and WhereIsShe. This endpoint receives every event
// for store mikelyaps, so LEMONSQUEEZY_VARIANT_IDS is required and must list
// the variants Ranki honors (WhereIsShe variant 2280847, plus a Ranki variant
// if one is created later). Other variants are logged and ignored with 200
// so Lemon does not retry them.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import "./handler.js";

type Grant = {
  premium: boolean;
  until: string | null;
  status: string;
  variantId: string;
  sourceProduct: string;
  sourceApp: string;
  email: string;
  userId: string;
  customerId: string | null;
  subscriptionId: string | null;
  orderId: string | null;
};

type Decision = {
  ignore: boolean;
  reason: string;
  eventName: string;
  webhookId: string;
  testMode?: boolean;
  variantId?: string;
  storeId?: string;
  grant: Grant | null;
};

type Plan = {
  emailRow: Record<string, unknown> | null;
  userRow: Record<string, unknown> | null;
  emailGrantUpdate: boolean;
};

type LemonApi = {
  verifySignature: (raw: string, header: string, secret: string) => Promise<boolean>;
  decideLemon: (payload: unknown, env: { variantIds: string; storeId: string; allowTestMode: boolean }, now: number) => Decision;
  applyPlan: (decision: Decision, userExists: boolean) => Plan;
  envFlag: (value: string) => boolean;
};

const lemon = (globalThis as unknown as { RankiLemon?: LemonApi }).RankiLemon;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function serviceKey(): string {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  if (direct) return direct;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return String(parsed.default || parsed.service_role || "");
  } catch {
    return "";
  }
}

function adminClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = serviceKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function logEvent(
  admin: SupabaseClient | null,
  row: { event_name: string; lemon_event_id: string | null; payload: unknown; signature_ok: boolean; applied: boolean; note: string },
): Promise<void> {
  if (!admin) return;
  const { error } = await admin.from("lemon_events").insert({
    event_name: row.event_name || "unknown",
    lemon_event_id: row.lemon_event_id,
    payload: row.payload ?? {},
    signature_ok: row.signature_ok,
    applied: row.applied,
    note: row.note.slice(0, 240),
  });
  if (error && error.code !== "23505") console.error("lemon_events insert", error.message);
}

async function alreadyApplied(admin: SupabaseClient, webhookId: string): Promise<boolean> {
  const { data } = await admin.from("lemon_events").select("applied").eq("lemon_event_id", webhookId).maybeSingle();
  return !!(data && data.applied);
}

async function userExists(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  return !error && !!(data && data.user && data.user.id);
}

async function applyGrant(admin: SupabaseClient, decision: Decision): Promise<string> {
  const exists = !!(decision.grant && decision.grant.userId) && await userExists(admin, decision.grant!.userId);
  const plan = lemon!.applyPlan(decision, exists);
  const now = new Date().toISOString();
  if (plan.emailRow) {
    const { error } = await admin.from("premium_by_email").upsert(
      { ...plan.emailRow, updated_at: now },
      { onConflict: "email" },
    );
    if (error) throw new Error(error.message);
  }
  if (plan.userRow) {
    const { error } = await admin.from("entitlements").upsert(
      { ...plan.userRow, updated_at: now },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
  } else if (plan.emailGrantUpdate && plan.emailRow) {
    const email = String(plan.emailRow.email || "");
    const patch = { ...plan.emailRow };
    delete patch.email;
    const { error } = await admin.from("entitlements").update({ ...patch, grant_via: "email", updated_at: now })
      .eq("user_email", email)
      .eq("grant_via", "email");
    if (error) throw new Error(error.message);
  }
  if (!plan.emailRow && !plan.userRow) return "no_ranki_user";
  return exists ? "user_id" : "email";
}

Deno.serve(async (req: Request) => {
  if (!lemon) return json({ ok: false, error: "handler_missing" }, 500);
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const raw = await req.text();
  if (raw.length > 1_000_000) return json({ ok: false, error: "too_large" }, 413);

  const secret = Deno.env.get("LEMONSQUEEZY_WEBHOOK_SECRET") ?? "";
  const header = req.headers.get("X-Signature") ?? req.headers.get("x-signature") ?? "";
  const signatureOk = secret ? await lemon.verifySignature(raw, header, secret) : false;

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }

  const admin = adminClient();
  const eventName = payload && typeof payload === "object" && payload && "meta" in payload
    ? String((payload as { meta?: { event_name?: string } }).meta?.event_name || "")
    : "";

  if (!secret) {
    await logEvent(admin, { event_name: eventName || "unknown", lemon_event_id: null, payload, signature_ok: false, applied: false, note: "missing_secret" });
    return json({ ok: false, error: "missing_secret" }, 500);
  }
  if (!signatureOk) {
    await logEvent(admin, { event_name: eventName || "unknown", lemon_event_id: null, payload, signature_ok: false, applied: false, note: "bad_signature" });
    return json({ ok: false, error: "bad_signature" }, 401);
  }
  if (!payload) {
    await logEvent(admin, { event_name: "unknown", lemon_event_id: null, payload: { raw: raw.slice(0, 500) }, signature_ok: true, applied: false, note: "bad_json" });
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const decision = lemon.decideLemon(payload, {
    variantIds: Deno.env.get("LEMONSQUEEZY_VARIANT_IDS") ?? "",
    storeId: Deno.env.get("LEMONSQUEEZY_STORE_ID") ?? "",
    allowTestMode: lemon.envFlag(Deno.env.get("RANKI_ALLOW_TEST_MODE") ?? ""),
  }, Date.now());

  if (!admin) {
    return json({ ok: false, error: "missing_service_key" }, 500);
  }

  if (decision.webhookId && await alreadyApplied(admin, decision.webhookId)) {
    return json({ ok: true, duplicate: true }, 200);
  }

  if (decision.ignore) {
    await logEvent(admin, {
      event_name: decision.eventName || "unknown",
      lemon_event_id: decision.webhookId || null,
      payload,
      signature_ok: true,
      applied: false,
      note: decision.reason,
    });
    return json({ ok: true, ignored: true, reason: decision.reason }, 200);
  }

  try {
    const via = await applyGrant(admin, decision);
    await logEvent(admin, {
      event_name: decision.eventName,
      lemon_event_id: decision.webhookId || null,
      payload,
      signature_ok: true,
      applied: true,
      note: via,
    });
    return json({ ok: true, applied: true, via }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "apply_failed";
    await logEvent(admin, {
      event_name: decision.eventName,
      lemon_event_id: null,
      payload,
      signature_ok: true,
      applied: false,
      note: message,
    });
    return json({ ok: false, error: "apply_failed" }, 500);
  }
});
