// Ranki Polar webhook.
// Deploy with: supabase functions deploy polar-webhook --project-ref fkxbqftqxvgqrtvkpglx --no-verify-jwt
// Polar does not send a Supabase JWT. The body is authenticated with the
// Standard Webhooks signature (webhook-id, webhook-timestamp, webhook-signature)
// using POLAR_WEBHOOK_SECRET (whsec_...).
//
// Secrets: POLAR_WEBHOOK_SECRET, POLAR_PRODUCT_ID (the Ranki Premium product).
// Deliveries are recorded in lemon_events with lemon_event_id = "polar:<webhook-id>".
// That table is service-role only. The name is historical; it is the shared event log.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import "./handler.js";

type Decision = {
  ignore: boolean;
  reason: string;
  eventName: string;
  webhookId: string;
  grant?: {
    premium: boolean;
    until: string | null;
    status: string;
    productId: string;
    email: string;
    userId: string;
    customerId: string | null;
    subscriptionId: string | null;
  } | null;
};

type Plan = {
  emailRow: Record<string, unknown> | null;
  userRow: Record<string, unknown> | null;
  emailGrantUpdate: boolean;
};

type PolarApi = {
  verifySignature: (raw: string, headers: Record<string, string>, secret: string, nowSeconds: number) => Promise<boolean>;
  decidePolar: (event: unknown, env: { productId: string }, webhookId: string, now: number) => Decision;
  applyPlan: (decision: Decision, userExists: boolean) => Plan;
};

const polar = (globalThis as unknown as { RankiPolar?: PolarApi }).RankiPolar;

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
  row: { event_name: string; event_key: string | null; payload: unknown; signature_ok: boolean; applied: boolean; note: string },
): Promise<void> {
  if (!admin) return;
  const { error } = await admin.from("lemon_events").insert({
    event_name: row.event_name || "unknown",
    lemon_event_id: row.event_key,
    payload: row.payload ?? {},
    signature_ok: row.signature_ok,
    applied: row.applied,
    note: row.note.slice(0, 240),
  });
  if (error && error.code !== "23505") console.error("polar event log insert", error.message);
}

async function alreadyApplied(admin: SupabaseClient, eventKey: string): Promise<boolean> {
  const { data, error } = await admin.from("lemon_events").select("applied").eq("lemon_event_id", eventKey).maybeSingle();
  if (error) console.error("polar event lookup", error.code, error.message);
  return !!(data && data.applied);
}

async function userExists(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  return !error && !!(data && data.user && data.user.id);
}

async function applyGrant(admin: SupabaseClient, decision: Decision): Promise<string> {
  const exists = !!(decision.grant && decision.grant.userId) && await userExists(admin, decision.grant!.userId);
  const plan = polar!.applyPlan(decision, exists);
  const now = new Date().toISOString();
  if (plan.emailRow) {
    const { error } = await admin.from("premium_by_email").upsert(
      { ...plan.emailRow, updated_at: now },
      { onConflict: "email" },
    );
    if (error) throw new Error("premium_by_email upsert: " + error.message);
  }
  if (plan.userRow) {
    const { error } = await admin.from("entitlements").upsert(
      { ...plan.userRow, updated_at: now },
      { onConflict: "user_id" },
    );
    if (error) throw new Error("entitlements upsert: " + error.message);
  } else if (plan.emailGrantUpdate && plan.emailRow) {
    const email = String(plan.emailRow.email || "");
    const patch = { ...plan.emailRow };
    delete patch.email;
    const { error } = await admin.from("entitlements").update({ ...patch, grant_via: "email", updated_at: now })
      .eq("user_email", email)
      .eq("grant_via", "email");
    if (error) throw new Error("entitlements email update: " + error.message);
  }
  if (!plan.emailRow && !plan.userRow) return "no_ranki_user";
  return exists ? "user_id" : "email";
}

Deno.serve(async (req: Request) => {
  if (!polar) return json({ ok: false, error: "handler_missing" }, 500);
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const raw = await req.text();
  if (raw.length > 1_000_000) return json({ ok: false, error: "too_large" }, 413);

  const secret = Deno.env.get("POLAR_WEBHOOK_SECRET") ?? "";
  const headers: Record<string, string> = {
    "webhook-id": req.headers.get("webhook-id") ?? "",
    "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
    "webhook-signature": req.headers.get("webhook-signature") ?? "",
  };
  const webhookId = headers["webhook-id"].slice(0, 80);
  const admin = adminClient();

  if (!secret) {
    await logEvent(admin, { event_name: "unknown", event_key: null, payload: {}, signature_ok: false, applied: false, note: "missing_secret" });
    return json({ ok: false, error: "missing_secret" }, 500);
  }
  const signatureOk = await polar.verifySignature(raw, headers, secret, Math.floor(Date.now() / 1000));
  if (!signatureOk) {
    await logEvent(admin, { event_name: "unknown", event_key: null, payload: {}, signature_ok: false, applied: false, note: "bad_signature" });
    return json({ ok: false, error: "bad_signature" }, 401);
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== "object") {
    await logEvent(admin, { event_name: "unknown", event_key: null, payload: { raw: raw.slice(0, 500) }, signature_ok: true, applied: false, note: "bad_json" });
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const eventName = String((payload as { type?: string }).type || "unknown");
  const eventKey = webhookId ? "polar:" + webhookId : null;

  if (!admin) {
    console.error("polar missing_service_key");
    return json({ ok: false, error: "missing_service_key" }, 500);
  }

  if (eventKey && await alreadyApplied(admin, eventKey)) {
    return json({ ok: true, duplicate: true }, 200);
  }

  const decision = polar.decidePolar(payload, {
    productId: Deno.env.get("POLAR_PRODUCT_ID") ?? "",
  }, webhookId, Date.now());

  if (decision.ignore) {
    await logEvent(admin, { event_name: eventName, event_key: eventKey, payload, signature_ok: true, applied: false, note: decision.reason });
    return json({ ok: true, ignored: true, reason: decision.reason }, 200);
  }

  try {
    const via = await applyGrant(admin, decision);
    await logEvent(admin, { event_name: eventName, event_key: eventKey, payload, signature_ok: true, applied: true, note: via });
    return json({ ok: true, applied: true, via }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "apply_failed";
    // No secrets or payload here: event name, key, and the database message only.
    console.error("polar apply_failed", eventName, eventKey, message);
    await logEvent(admin, { event_name: eventName, event_key: null, payload, signature_ok: true, applied: false, note: message });
    return json({ ok: false, error: "apply_failed" }, 500);
  }
});
