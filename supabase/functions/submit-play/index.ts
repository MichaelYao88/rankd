// Ranki play submit. Daily/Archive finishes only.
//
// Country comes from the edge, not the JSON body:
//   1. cf-ipcountry when the platform sets it (client values are stripped).
//   2. Otherwise a country-only lookup of cf-connecting-ip (Cloudflare
//      overwrites that header; a spoofed value does not stick).
// The IP is not written to the row, the response, or logs.
//
// verify_jwt is false (same as community-stats; there is no login). The edge
// gateway strips apikey/authorization before the handler runs, so this
// function does not re-check the anon key. Inserts use the service role so
// country_code can be set after anon loses that column.
//
// If first_guess / second_guess columns are not migrated yet, the insert
// retries without them. payload.firstGuess and payload.secondGuess are
// always stored.
//
// device_id and user_id are the first-play guard. A unique violation
// (23505) is a replay and returns { ok: true, duplicate: true }. If those
// columns are not migrated yet, the insert retries without them.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const PUZZLE_ID = /^[a-z0-9][a-z0-9-]{0,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^[A-Z]{2}$/;
const MODES = new Set(["daily", "archive"]);
const TYPES = new Set(["rank", "top5", "tier", "match", "top1", "name"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
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

function clip(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function isoCountry(value: unknown): string | null {
  const code = clip(value, 8).toUpperCase();
  if (!ISO.test(code) || code === "XX" || code === "T1") return null;
  return code;
}

function isPublicIp(ip: string): boolean {
  if (!ip || ip.length > 64) return false;
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return false;
    return true;
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = nums;
  if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
  if (a === 192 && b === 168) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  return true;
}

function clientIp(req: Request): string | null {
  // Platform-set. A browser-supplied cf-connecting-ip is overwritten and
  // does not arrive here (checked against a documentation-range spoof).
  const cf = (req.headers.get("cf-connecting-ip") ?? "").trim();
  if (isPublicIp(cf)) return cf;
  return null;
}

async function lookupCountry(ip: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1200);
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=country_code`, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return isoCountry(data?.country_code);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function countryFromRequest(req: Request): Promise<string | null> {
  // Ignore any country field in the body. Header only counts when the
  // platform left cf-ipcountry in place (it strips client values today).
  const header = isoCountry(req.headers.get("cf-ipcountry"));
  if (header && req.headers.get("cf-ray")) return header;
  const ip = clientIp(req);
  if (!ip) return null;
  return await lookupCountry(ip);
}

function piece(raw: unknown): { name: string; emoji?: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const name = clip(row.name, 80);
  if (!name) return null;
  const emoji = clip(row.emoji, 16);
  return emoji ? { name, emoji } : { name };
}

function sanitizeGuess(raw: unknown, type: string): Record<string, unknown> | null {
  if (raw == null) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const kind = clip(row.kind, 16) || type;
  if (kind !== type) return null;
  if (type === "rank") {
    if (!Array.isArray(row.order)) return null;
    const order = row.order.map(piece).filter((x): x is { name: string; emoji?: string } => !!x).slice(0, 8);
    return order.length ? { kind: "rank", order } : null;
  }
  if (type === "tier") {
    if (!Array.isArray(row.assign)) return null;
    const assign = row.assign.slice(0, 8).map((entry) => {
      const base = piece(entry);
      if (!base || !entry || typeof entry !== "object") return null;
      const src = entry as Record<string, unknown>;
      const tier = clip(src.tier, 40);
      const out: Record<string, unknown> = { ...base };
      if (tier) out.tier = tier;
      if (Number.isInteger(src.tierIndex) && (src.tierIndex as number) >= 0 && (src.tierIndex as number) <= 12) {
        out.tierIndex = src.tierIndex;
      }
      return out;
    }).filter((x): x is Record<string, unknown> => !!x);
    return assign.length ? { kind: "tier", assign } : null;
  }
  if (type === "match") {
    if (!Array.isArray(row.pairs)) return null;
    const pairs = row.pairs.slice(0, 8).map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const src = entry as Record<string, unknown>;
      const clueFor = clip(src.clueFor, 80);
      const person = clip(src.person, 80);
      if (!clueFor || !person) return null;
      const out: Record<string, unknown> = { clueFor, person };
      const emoji = clip(src.personEmoji, 16);
      if (emoji) out.personEmoji = emoji;
      return out;
    }).filter((x): x is Record<string, unknown> => !!x);
    return pairs.length ? { kind: "match", pairs } : null;
  }
  if (type === "top1" || type === "name") {
    const base = piece(row);
    if (!base) return null;
    const out: Record<string, unknown> = { kind: type, ...base };
    if (type === "top1" && Number.isInteger(row.rank) && (row.rank as number) >= 1 && (row.rank as number) <= 400) {
      out.rank = row.rank;
    }
    return out;
  }
  if (type === "top5") {
    const name = clip(row.name, 80);
    const key = clip(row.key, 80);
    if (!name && !key) return null;
    const out: Record<string, unknown> = { kind: "top5" };
    if (name) out.name = name;
    if (key) out.key = key;
    const emoji = clip(row.emoji, 16);
    if (emoji) out.emoji = emoji;
    if (typeof row.hit === "boolean") out.hit = row.hit;
    if (Number.isInteger(row.rank) && (row.rank as number) >= 1 && (row.rank as number) <= 400) out.rank = row.rank;
    return out;
  }
  return null;
}

function sanitizePayload(raw: unknown, first: unknown, second: unknown): Record<string, unknown> {
  const payload = raw && typeof raw === "object" && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {};
  delete payload.country;
  delete payload.country_code;
  delete payload.ip;
  payload.firstGuess = first;
  payload.secondGuess = second;
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") {
    const countryCode = await countryFromRequest(req);
    return json({ countryCode });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const len = Number(req.headers.get("content-length") || 0);
  if (len > 20000) return json({ error: "too_large" }, 422);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "invalid" }, 422);
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid" }, 422);
  }

  const puzzleId = clip(body.puzzle_id, 80);
  const day = clip(body.day_key, 10);
  const mode = clip(body.mode, 16);
  const puzzleType = clip(body.puzzle_type, 16);
  if (!PUZZLE_ID.test(puzzleId) || !DAY.test(day) || !MODES.has(mode) || !TYPES.has(puzzleType)) {
    return json({ error: "invalid" }, 422);
  }
  if (typeof body.solved !== "boolean" || typeof body.perfect !== "boolean") {
    return json({ error: "invalid" }, 422);
  }

  const first = sanitizeGuess(body.first_guess ?? (body.payload as Record<string, unknown> | undefined)?.firstGuess, puzzleType);
  const secondRaw = body.second_guess ?? (body.payload as Record<string, unknown> | undefined)?.secondGuess;
  const second = secondRaw == null ? null : sanitizeGuess(secondRaw, puzzleType);
  if (body.first_guess != null && !first) return json({ error: "invalid_guess" }, 422);
  if (secondRaw != null && !second) return json({ error: "invalid_guess" }, 422);

  const payload = sanitizePayload(body.payload, first, second);
  if (JSON.stringify(payload).length > 12000) return json({ error: "too_large" }, 422);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = serviceKey();
  if (!url || !key) return json({ error: "unavailable" }, 500);

  const countryCode = await countryFromRequest(req);
  const deviceId = clip(body.device_id, 40).toLowerCase();
  const userId = clip(body.user_id, 40).toLowerCase();
  const record: Record<string, unknown> = {
    puzzle_id: puzzleId,
    day_key: day,
    mode,
    puzzle_type: puzzleType,
    solved: body.solved,
    perfect: body.perfect,
    payload,
    country_code: countryCode,
    first_guess: first,
    second_guess: second,
    device_id: UUID.test(deviceId) ? deviceId : null,
    user_id: UUID.test(userId) ? userId : null,
  };

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let { error } = await supabase.from("plays").insert(record);
  if (error && /device_id|user_id/i.test(error.message || "")) {
    delete record.device_id;
    delete record.user_id;
    ({ error } = await supabase.from("plays").insert(record));
  }
  if (error && /first_guess|second_guess/i.test(error.message || "")) {
    delete record.first_guess;
    delete record.second_guess;
    ({ error } = await supabase.from("plays").insert(record));
  }
  if (error && (error.code === "23505" || /duplicate key/i.test(error.message || ""))) {
    return json({ ok: true, duplicate: true });
  }
  if (error) {
    console.error("submit-play insert", error.code || "error");
    return json({ error: "insert_failed" }, 500);
  }
  return json({ ok: true });
});
