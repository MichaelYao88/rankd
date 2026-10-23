// Ranki community snapshot reader.
// Serves the newest public.community_snapshots.doc as JSON.
// firstGuessWorld and firstGuessByCountry are fields inside that document;
// this function does not reshape them. verify_jwt is false, matching the
// deployed function (the page fetches it without a user session).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      return new Response(JSON.stringify({ error: "missing env" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("community_snapshots")
      .select("doc, created_at, version, source")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!data?.doc) {
      return new Response(JSON.stringify({ version: 1, puzzles: {}, source: "empty" }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
      });
    }

    const body = typeof data.doc === "string" ? data.doc : JSON.stringify(data.doc);
    return new Response(body, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        "X-Snapshot-Source": String(data.source ?? ""),
        "X-Snapshot-Version": String(data.version ?? 1),
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
