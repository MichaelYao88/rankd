// Ranki Premium checkout. Creates a Polar checkout session for the signed-in user.
// Deploy with: supabase functions deploy polar-checkout --project-ref fkxbqftqxvgqrtvkpglx
// Verify JWT is on (default): the caller must be signed in. The user id comes from
// the verified token, never from the request body.
//
// Secrets: POLAR_ACCESS_TOKEN (organization access token, checkouts:write),
// POLAR_PRODUCT_ID (Ranki Premium). The webhook matches the subscription back to
// the user through the customer's external_id and the metadata.user_id field.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://ranki.gg";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData && userData.user;
  if (userError || !user || !user.id) return json({ ok: false, error: "unauthorized" }, 401);

  const token = Deno.env.get("POLAR_ACCESS_TOKEN") ?? "";
  const product = Deno.env.get("POLAR_PRODUCT_ID") ?? "";
  if (!token || !product) return json({ ok: false, error: "not_configured" }, 500);

  const email = String(user.email || "").trim().toLowerCase();
  const body: Record<string, unknown> = {
    products: [product],
    external_customer_id: user.id,
    metadata: { user_id: user.id, app: "ranki" },
    success_url: SITE + "/?checkout=success&checkout_id={CHECKOUT_ID}",
    return_url: SITE + "/#premium",
    allow_discount_codes: true,
    require_billing_address: false,
  };
  if (email && email.length <= 320) body.customer_email = email;

  let res: Response;
  try {
    res = await fetch("https://api.polar.sh/v1/checkouts/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(body),
    });
  } catch {
    return json({ ok: false, error: "polar_unreachable" }, 502);
  }
  if (!res.ok) {
    console.error("polar checkout failed", res.status);
    return json({ ok: false, error: "checkout_failed" }, 502);
  }
  const checkout = await res.json().catch(() => null);
  const link = checkout && typeof checkout.url === "string" ? checkout.url : "";
  if (!link.startsWith("https://")) return json({ ok: false, error: "checkout_failed" }, 502);
  return json({ ok: true, url: link }, 200);
});
