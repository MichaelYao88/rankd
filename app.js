/* Rankd prototype: daily stats game. Two puzzle types: "rank" (Rank it: drag to order) and "top5" (Guess the top 5:
   name the top 5 before running out of misses; hits are free; score = found X/5, plus average world rank of all guesses).
   v7 retired "Guess the #1".
   No build step; works from file://. */
(() => {
"use strict";

// ================================================================ config
const CONFIG = {
  brand: "Rankd",
  // Public URL used in share links. From file:// we can't share a local path, so a placeholder is used.
  siteUrl: (location.protocol.startsWith("http") ? location.origin + location.pathname : "https://rankd.example/"),
  // Daily No. 1 date. Set this to your launch date. (Prototype: set 2 weeks back so the Archive has content.)
  dailyEpoch: "2026-10-06",
  interstitialSeconds: 5,           // skip countdown
  interstitialOnDaily: false,       // never interrupt today's daily
  rankMaxTries: 5,                  // Rank it: lock-ins allowed before the answer is revealed
  // v11 PRE-LAUNCH SWITCH: true = show the "All puzzles" tab/list (every puzzle, past AND future, for testing).
  // Set to false at launch: the tab, the menu entry and #p= links disappear (random Practice stays).
  SHOW_ALL_PUZZLES: true,
};
const LS = { results: "rankd.results.v2", stats: "rankd.stats.v2", settings: "rankd.settings.v1", custom: "rankd.custom.v2" };
// v11.1 "Clear all data". Audit of everything Rankd stores (all of it is localStorage; nothing uses sessionStorage today):
//   rankd.results.v2  : puzzle progress for every mode (d: daily + archive, p: All puzzles, r: random Practice history)
//   rankd.stats.v2    : played / wins / streak / best / guess distribution
//   rankd.settings.v1 : theme, show-values and streamer mode (also written by the inline script in index.html for ?stream=)
//   rankd.custom.v2   : an uploaded spreadsheet
// Ads (RankdAds) and win animations (RankdFx) keep their state in memory only. The clear removes the keys above plus any
// "rankd." / "rankd:" / "rankd_" / "rankd-" prefixed key in localStorage AND sessionStorage, and nothing else: the origin
// michaelyao88.github.io is shared with other projects (e.g. whereisshe), so localStorage.clear() is never called.
// v12 Rankd Studio preview: index.html?preview=YYYY-MM-DD opens that scheduled day (past OR future). In preview the
// results/stats/custom keys move to a sandbox (rankd.preview.*), so real stats and streaks are never touched;
// Clear all data removes the sandbox too (it is rankd.-prefixed).
const PREVIEW = (() => { try { return (new URLSearchParams(location.search).get("preview") || "").trim(); } catch { return ""; } })();
if (PREVIEW) Object.assign(LS, { results: "rankd.preview.results.v2", stats: "rankd.preview.stats.v2", custom: "rankd.preview.custom.v2" });
const isRankdKey = k => Object.values(LS).includes(k) || /^rankd[.:_-]/i.test(k);
const RankdData = {
  keys() { const out = []; for (const st of [localStorage, sessionStorage]) { try { for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k != null && isRankdKey(k)) out.push([st === localStorage ? "local" : "session", k]); } } catch {} } return out; },
  clear() { const gone = this.keys(); for (const [w, k] of gone) { try { (w === "local" ? localStorage : sessionStorage).removeItem(k); } catch {} } return gone.map(x => x[0] + ":" + x[1]); },
};
window.RankdData = RankdData;

// ================================================================
// COMMUNITY STATS: BACKEND PLUG-IN POINT
// ----------------------------------------------------------------
// The prototype has NO backend, so no real player percentages exist.
// Implement these two against Supabase or a Cloudflare Worker + D1/KV:
//   submit: await supabase.from('results').insert({ puzzle_id, day, type, score, max, tries, payload })
//   fetch:  await supabase.rpc('puzzle_stats', { puzzle_id, day })
//           -> { players, pctPerfect, perItemCorrect: { [item name]: pct } }          (rank)
//           -> { players, avgFound, avgRank, firstGuess: [{name, pct}] }             (top5)
// Return null from fetch() to show the "coming soon" placeholder.
// ================================================================
const CommunityStats = {
  async submit(result) { /* TODO backend */ return false; },
  async fetch(puzzleId, dayKey) { /* TODO backend */ return null; },
};

// ================================================================ helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const keyOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayKey = () => keyOf(new Date());
const utc = k => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const dayNumber = k => Math.round((utc(k) - utc(CONFIG.dailyEpoch)) / 864e5);      // 0-based
const keyFromDay = n => { const d = new Date(utc(CONFIG.dailyEpoch) + n * 864e5); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; };
const validKey = k => /^\d{4}-\d{2}-\d{2}$/.test(k || "") && !isNaN(utc(k));
const prettyDate = k => new Date(utc(k)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const longDate = k => new Date(utc(k)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const pad3 = n => String(n).padStart(3, "0");
function rng(seedStr) { let h = 1779033703 ^ seedStr.length; for (const c of seedStr) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
function fmt(v) { const dec = Math.min(2, ((String(v).split(".")[1]) || "").length); return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
const fmt1 = v => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });  // guess datasets: 1 decimal
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2400); }
const norm = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ================================================================ data parsing (mirrors build.py)
const SHEET_COLS = {
  puzzles: ["puzzle_id","daily_order","puzzle_emoji","question","stat_label","unit","higher_is","values_visible","item_name","item_emoji","value","data_year","source_name","source_url","fun_fact","global_rank","global_total","global_scope","art","support_url","dataset","series_title","headline"],
  country_lists: ["puzzle_id","country","iso3","emoji","value","year","tiebreak"],
  country_info: ["iso3","country","region","continent","capital","landlocked","part_of","population","population_year","gdp_per_capita_usd","gdp_year","source"],
  hint_bank: ["puzzle_id","rank","country","iso3","hint_no","auto_hint","override_hint","source"],
  top5_puzzles: ["puzzle_id","daily_order","puzzle_emoji","question","stat_label","unit","data_from","max_misses","data_year","source_name","source_url","fun_fact","art","support_url","headline"],
  match_puzzles: ["puzzle_id","daily_order","puzzle_emoji","headline","subtitle","item_name","country_iso","item_emoji","country_name","clue","fact","source_name","source_url","art","original_clue","flag_img"],
};
const str = v => { v = String(v ?? "").trim(); return v.endsWith(".0") ? v.slice(0, -2) : v; };
const num = v => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : null; };
const lowerKeys = r => { const o = {}; for (const k in r) o[String(k).trim().toLowerCase()] = r[k]; return o; };

/** Guess which sheet a table is from by its headers (used for CSV uploads). */
function sheetTypeOf(headers) {
  const h = new Set(headers.map(x => String(x).trim().toLowerCase()));
  if (h.has("clue")) return "match_puzzles";
  if (h.has("item_name")) return "puzzles";
  if (h.has("data_from") || h.has("max_misses")) return "top5_puzzles";
  if (h.has("hint_no") || h.has("auto_hint")) return "hint_bank";
  if (h.has("iso3") && (h.has("region") || h.has("gdp_per_capita_usd"))) return "country_info";
  if (h.has("country") && h.has("value")) return "country_lists";
  return null;
}

const FAMOUS = ["United States", "China", "India", "Japan", "Brazil", "Russia", "United Kingdom", "Germany", "France", "Mexico", "Italy", "Canada", "Australia", "South Korea", "Spain", "Turkey", "Saudi Arabia", "Egypt", "Nigeria", "South Africa", "Argentina", "Indonesia", "Sweden", "Israel", "Iran", "Netherlands", "Switzerland", "Norway", "Poland", "Ukraine", "Pakistan", "Thailand", "Vietnam", "Kenya", "Ireland", "Greece", "Cuba", "Jamaica", "New Zealand", "Portugal", "Denmark", "Finland", "England"];   // v11: preferred (recognizable) countries for title flags, same list as build.py
const MIN_TOP5_COUNTRIES = 38;   // v9: Guess the top 5 needs >= 38 countries to guess from (else auto Rank it)
function parseTables(t) {
  const out = [], by = {}, orderOf = (v, i) => num(v) ?? 10000 + i;
  for (const raw of t.puzzles || []) {
    const r = lowerKeys(raw), id = str(r.puzzle_id); if (!id) continue;
    let p = by[id];
    if (!p) { p = by[id] = { type: "rank", id, order: null, emoji: "", question: "", stat: "", unit: "", higherIs: "top", valuesVisible: false, source: "", sourceUrl: "", fact: "", art: "", support: "", headline: "", items: [] }; out.push(p); }
    if (!p.items.length) {
      p.order = orderOf(r.daily_order, out.length);
      const hi = str(r.higher_is).toLowerCase(); p.higherIs = hi === "bottom" ? "bottom" : "top";
      p.valuesVisible = ["yes", "y", "true", "1"].includes(str(r.values_visible).toLowerCase());
    }
    for (const [k, c] of [["emoji","puzzle_emoji"],["question","question"],["stat","stat_label"],["unit","unit"],["source","source_name"],["sourceUrl","source_url"],["fact","fun_fact"],["art","art"],["support","support_url"],["dataset","dataset"],["series","series_title"],["headline","headline"]])
      if (!p[k] && str(r[c])) p[k] = str(r[c]);
    const value = num(r.value); if (value == null) continue;
    const it = { name: str(r.item_name) || "?", emoji: str(r.item_emoji), value, year: str(r.data_year) };
    const gr = num(r.global_rank), gt = num(r.global_total);
    if (gr && gt) Object.assign(it, { gRank: Math.round(gr), gTotal: Math.round(gt), gScope: str(r.global_scope) });
    p.items.push(it);
  }
  const data = {}, bank = {};
  for (const raw of t.country_lists || t.guess_data || []) { const r = lowerKeys(raw), id = str(r.puzzle_id), v = num(r.value);   // guess_data = pre-v7 name
    if (id && v != null && str(r.country)) (data[id] ||= []).push({ name: str(r.country), iso3: str(r.iso3), emoji: str(r.emoji), value: v, year: str(r.year), ...(num(r.tiebreak) != null ? { exact: num(r.tiebreak) } : {}) }); }
  for (const raw of t.hint_bank || []) { const r = lowerKeys(raw), h = str(r.override_hint) || str(r.auto_hint), n = num(r.hint_no);
    if (h && n) ((bank[str(r.puzzle_id) + "|" + (str(r.iso3) || str(r.country))] ||= [])[Math.round(n) - 1] = h); }
  (t.top5_puzzles || []).forEach((raw, i) => {
    const r = lowerKeys(raw), id = str(r.puzzle_id); if (!id) return;
    let countries = (data[str(r.data_from) || id] || []).slice().sort((a, b) => b.value - a.value || (b.exact ?? 0) - (a.exact ?? 0)); if (countries.length < 6) return;
    if (countries.length < MIN_TOP5_COUNTRIES) {   // v9 rule (same as build.py): too few countries -> 5-item Rank it
      const n = countries.length, idx = [...new Set([0, .25, .5, .75, 1].map(f => Math.round((n - 1) * f)))];
      out.push({ type: "rank", id, order: orderOf(r.daily_order, out.length + i), emoji: str(r.puzzle_emoji), question: str(r.question) || id,
        stat: str(r.stat_label), unit: str(r.unit), higherIs: "top", valuesVisible: false, source: str(r.source_name), sourceUrl: str(r.source_url),
        fact: str(r.fun_fact), art: str(r.art), support: str(r.support_url), headline: str(r.headline), convertedFrom: "top5",
        items: idx.map(k => countries[k]).map(c => ({ name: c.name, emoji: c.emoji, value: c.value, year: c.year,
          gRank: 1 + countries.filter(x => x.value > c.value).length, gTotal: n, gScope: "" })) });
      return;
    }
    const c5 = countries[4], cut = c => countries.indexOf(c) < 4 || (c.value === c5.value && (c.exact ?? null) === (c5.exact ?? null));
    countries = countries.map(c => { const b = bank[id + "|" + (c.iso3 || c.name)]; return cut(c) && b ? { ...c, hints: b.filter(Boolean) } : c; });
    out.push({ type: "top5", id, order: orderOf(r.daily_order, out.length + i), emoji: str(r.puzzle_emoji), question: str(r.question) || id,
      stat: str(r.stat_label), unit: str(r.unit), maxMisses: Math.round(num(r.max_misses) || 10), year: str(r.data_year),
      source: str(r.source_name), sourceUrl: str(r.source_url), fact: str(r.fun_fact), art: str(r.art), support: str(r.support_url), headline: str(r.headline), countries });
  });
  const mby = {};   // v12 Match it (same rules as build.py: 6 or 7 rows, distinct clues)
  for (const raw of t.match_puzzles || []) { const r = lowerKeys(raw), id = str(r.puzzle_id); if (!id) continue;
    const m = mby[id] ||= { type: "match", id, order: orderOf(r.daily_order, out.length + Object.keys(mby).length), emoji: "", headline: "", question: "", stat: "Match each clue to the right person", unit: "", source: "", sourceUrl: "", fact: "", art: "", support: "", people: [] };
    for (const [k, c] of [["emoji","puzzle_emoji"],["headline","headline"],["question","subtitle"],["art","art"]]) if (!m[k] && str(r[c])) m[k] = str(r[c]);
    if (str(r.item_name) && str(r.clue)) m.people.push({ name: str(r.item_name), iso3: str(r.country_iso).toUpperCase(), emoji: str(r.item_emoji), country: str(r.country_name) || str(r.country_iso), clue: str(r.clue), fact: str(r.fact), sourceName: str(r.source_name), sourceUrl: str(r.source_url), ...(str(r.flag_img) ? { flagImg: str(r.flag_img) } : {}) }); }
  Object.values(mby).forEach(m => { if (m.people.length < 6 || m.people.length > 7 || new Set(m.people.map(x => x.clue)).size !== m.people.length) return;
    m.emoji ||= "🔗"; m.question ||= m.headline || m.id; m.source = [...new Set(m.people.map(x => x.sourceName).filter(Boolean))].join("; "); m.sourceUrl = m.people[0].sourceUrl; out.push(m); });
  const res = out.filter(p => p.type !== "rank" || p.items.length >= 2).map(p => ({ ...p, question: p.question || p.stat || p.id })).sort((a, b) => a.order - b.order);
  // v11 (same as build.py apply_titles): no "(Group X)" labels. Rankers sharing a "dataset" key are titled with the plain
  // stat name (series_title) + 2 flags from their own countries that never both appear in another variant of that dataset.
  const TITLE_PIN = { alcohol: ["India", "Italy"] };
  const byDs = {}; res.forEach(p => { p.question = p.question.replace(/\s*\(Group [A-Z]\)\s*$/, ""); if (p.type === "rank" && p.dataset) (byDs[p.dataset] ||= []).push(p); });
  Object.values(byDs).forEach(ps => { if (ps.length < 2) return; ps.forEach(p => {
    const others = ps.filter(q => q !== p).map(q => new Set(q.items.map(it => it.name))), seen = new Set(others.flatMap(o => [...o]));
    const fam = n => { const k = FAMOUS.indexOf(n); return k < 0 ? FAMOUS.length : k; };
    const c = p.items.map((it, i) => i).sort((a, b) => (seen.has(p.items[a].name) - seen.has(p.items[b].name)) || (fam(p.items[a].name) - fam(p.items[b].name)) || a - b);
    let pair = null; const pin = TITLE_PIN[p.id];   // v12: same as build.py TITLE_PIN (published past titles stay stable)
    if (pin && !others.some(o => pin.every(n => o.has(n)))) pair = p.items.filter(it => pin.includes(it.name)).sort((u, v) => u.name < v.name ? -1 : 1);
    for (let x = 0; x < c.length && !pair; x++) for (let y = x + 1; y < c.length && !pair; y++) { const A = p.items[c[x]], B = p.items[c[y]];
      if (!others.some(o => o.has(A.name) && o.has(B.name))) pair = [A, B].sort((u, v) => u.name < v.name ? -1 : u.name > v.name ? 1 : 0); }
    if (pair) { p.question = `${p.series || p.question} ${pair[0].emoji}${pair[1].emoji}`; p.titleFlags = pair.map(it => it.name); } }); });
  res.forEach(p => { delete p.series; if (!p.headline) p.headline = p.question; });   // v11: fun headline, plain question = subtitle
  return res;
}

let custom = load(LS.custom, null);
const KNOWN = p => p && (p.type === "rank" || p.type === "top5" || (p.type === "match" && p.people && p.people.length >= 6 && p.people.length <= 7));   // drops pre-v7 "guess" puzzles from old uploads
let PUZZLES = (custom && custom.puzzles?.filter(KNOWN).length) ? custom.puzzles.filter(KNOWN) : (window.RANKD_PUZZLES || []);

// ================================================================ settings + theme
const settings = Object.assign({ theme: "system", showValues: "auto", stream: "off" }, load(LS.settings, {}));
const saveSettings = () => save(LS.settings, settings);
const mq = matchMedia("(prefers-color-scheme: dark)");
const effectiveTheme = () => settings.theme === "system" ? (mq.matches ? "dark" : "light") : settings.theme;
function applyTheme() {
  const t = effectiveTheme(); document.documentElement.dataset.theme = t;
  const tb = $("#mTheme"); if (tb) tb.innerHTML = themeLabel();
}
mq.addEventListener?.("change", () => settings.theme === "system" && applyTheme());

// ================================================================ streamer mode (v9): hook for future ads
// Browsers can't detect OBS / external screen capture, so this is manual: ?stream=1 turns it on (saved in
// localStorage), ?stream=0 turns it off, or Settings > Streamer mode. When on, every ad container (.ad-slot:
// the top banner and the interstitial) is hidden and Ads.allowed() is false, so no interstitial is ever shown.
(function () { const q = new URLSearchParams(location.search).get("stream");
  if (q === "1" || q === "0") { settings.stream = q === "1" ? "on" : "off"; saveSettings(); } })();
const streamerOn = () => settings.stream === "on";
function applyStreamer() { document.documentElement.classList.toggle("streamer", streamerOn()); }
const Ads = { allowed: () => !streamerOn(),   // ad code must check this before requesting/rendering any creative
  decisions: [],                              // v11: one entry per finished puzzle {puzzle, mode, show, reason} (tests / debugging)
  last: () => Ads.decisions[Ads.decisions.length - 1] || null,
  skipsAfterWin: tier => !!tier };            // v11: interstitials are skipped after any win tier
window.RankdAds = Ads;

// ================================================================ random Practice (v11)
// Generates a puzzle on the fly from the full ranked lists in practice-data.js (sensitive datasets included, each with its caveat; no rape data).
// Rules: random dataset; 38+ countries -> Top 5 or Rank it at random, else Rank it. Rank it = 5 (sometimes 6) well-spread,
// countries with >= 1 POPULAR_COUNTRIES entry: no ties, adjacent picks >= PR_MIN_RANK_GAP ranks apart (scaled by list size) and >= 3% of the
// full value range apart. Top 5 uses the auto hint bank and the shared-#5 tie rule. Deterministic for a given seed (#r=<seed>).
const PR = window.RANKD_PRACTICE || null;
// v11 POPULAR_COUNTRIES: the ONE recognizability list for random Practice (edit here). Every generated Rank it puzzle on a
// country dataset includes at least 1 of these (tier 1 preferred, then tier 2); a dataset with none of them is allowed
// without. Pick weights: tier 1 x8, tier 2 x4, everyone else x1 (all scaled by log population).
const POPULAR_COUNTRIES = {
  tier1: ["Iran", "United States", "United Kingdom", "Germany", "France", "Italy", "Mexico", "China", "South Korea", "Japan", "Brazil", "India"],
  tier2: ["Canada", "Australia", "Spain", "Russia", "Turkey", "Egypt", "Nigeria", "South Africa", "Indonesia", "Vietnam", "Thailand", "Philippines",
          "Argentina", "Saudi Arabia", "Israel", "Sweden", "Netherlands", "Poland", "Ukraine", "Pakistan", "Taiwan"],
  weight: { 1: 8, 2: 4, 0: 1 },
};
const mulberry = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const Practice = {
  ok: () => !!(PR && PR.datasets && PR.datasets.length),
  rules: { minGapShare: 0.03, rankGap: (n, k) => Math.max(2, Math.floor(n / (k * 4))), sixShare: 0.3, minPopM: 1 },
  generate(seed, tries = 0) {
    const R = mulberry(seed + tries * 7919), C = PR.countries, ru = this.rules, T1 = new Set(POPULAR_COUNTRIES.tier1), T2 = new Set(POPULAR_COUNTRIES.tier2);
    const tier = name => T1.has(name) ? 1 : T2.has(name) ? 2 : 0;
    const ds = PR.datasets[Math.floor(R() * PR.datasets.length)];
    if (ds.kind === "groups")   // v12: in-country demographic dataset - its curated groups ARE the puzzle (already spread, no ties, no country rules)
      return { id: `rp-${seed}`, seed, practice: true, dataset: ds.id, emoji: ds.emoji || "🎲", headline: ds.title, question: "", stat: ds.stat, unit: ds.unit,
        source: ds.src, sourceUrl: ds.url, year: String(ds.year || ""), fact: "", caveat: ds.caveat || "", sensitive: !!ds.sens, art: "chart", support: ds.support || "", order: null,
        type: "rank", higherIs: "top", valuesVisible: false, items: ds.rows.map(r => ({ name: r[0], emoji: r[1], value: r[2], year: "", gRank: r[3], gTotal: r[4], gScope: r[5] })) };
    const rows = ds.rows.map(r => ({ iso3: r[0], name: C[r[0]][0], emoji: C[r[0]][1], pop: C[r[0]][2], value: r[1], year: r.length > 2 ? String(r[2]) : String(ds.year || "") }));
    rows.forEach(r => { r.rank = 1 + rows.filter(x => x.value > r.value).length; });
    const base = { id: `rp-${seed}`, seed, practice: true, dataset: ds.id, emoji: ds.emoji || "🎲", headline: ds.title, question: "", stat: ds.stat, unit: ds.unit,
      source: ds.src, sourceUrl: ds.url, year: String(ds.year || ""), fact: "", caveat: ds.caveat || "", sensitive: !!ds.sens, art: "chart", support: "", order: null };
    if (rows.length >= PR.minTop5 && ds.hints && R() < 0.5)
      return { ...base, type: "top5", maxMisses: 10, countries: rows.map(r => ({ name: r.name, iso3: r.iso3, emoji: r.emoji, value: r.value, year: r.year, ...(ds.hints[r.iso3] ? { hints: ds.hints[r.iso3] } : {}) })) };
    const k = R() < ru.sixShare ? 6 : 5, N = rows.length, gapR = ru.rankGap(N, k), gapV = (rows[0].value - rows[N - 1].value) * ru.minGapShare;
    const cand = rows.filter(r => r.pop >= ru.minPopM || tier(r.name));
    const has1 = cand.some(r => tier(r.name) === 1), has2 = cand.some(r => tier(r.name) === 2);
    for (let a = 0; a < 450; a++) {
      const need = a < 200 && has1 ? 1 : a < 400 && (has1 || has2) ? 2 : 0;   // 1 = must include a tier-1 country, 2 = tier 1 or 2, 0 = none (dataset has no popular country)
      if (!need && (has1 || has2)) break;
      const pool = cand.slice(), pick = [];
      while (pick.length < k && pool.length) {
        const w = pool.map(r => POPULAR_COUNTRIES.weight[tier(r.name)] * Math.log10(10 + r.pop)); let x = R() * w.reduce((s, v) => s + v, 0), i = 0;
        while ((x -= w[i]) > 0 && i < pool.length - 1) i++;
        pick.push(pool.splice(i, 1)[0]);
      }
      pick.sort((x, y) => y.value - x.value);
      if (need && !pick.some(r => tier(r.name) && tier(r.name) <= need)) continue;
      if (pick.length === k && pick.every((r, i) => !i || (pick[i - 1].value > r.value && pick[i - 1].value - r.value >= gapV && r.rank - pick[i - 1].rank >= gapR)))
        return { ...base, type: "rank", higherIs: ds.hi === "bottom" ? "bottom" : "top", valuesVisible: false,
          items: pick.map(r => ({ name: r.name, emoji: r.emoji, value: r.value, year: ds.rows[0].length > 2 ? r.year : "", gRank: r.rank, gTotal: N, gScope: "" })) };
    }
    return tries < 20 ? this.generate(seed, tries + 1) : null;
  },
};
window.RankdPractice = { generate: s => Practice.generate(s), rules: Practice.rules, data: PR, ok: Practice.ok, popular: POPULAR_COUNTRIES };
// v12: Rankd Studio (studio.html) loads this file with window.RANKD_STUDIO = true to reuse the game's rules and data
// helpers; the game UI below is not started there.
if (window.RANKD_STUDIO) {
  window.RankdShared = { CONFIG, LS, POPULAR_COUNTRIES, rules: Practice.rules, MIN_TOP5_COUNTRIES, isRankdKey, RankdData,
    keyFromDay, dayNumber, todayKey, puzzles: PUZZLES, practice: PR };
  return;
}
function goPractice(seed) {
  if (!Practice.ok()) return goToday();
  if (seed == null) seed = 1 + Math.floor(Math.random() * 2e9);
  const p = Practice.generate(seed); if (!p) return goToday();
  state.mode = "practice"; openPuzzle(p);
}

// ================================================================ state
const state = { view: "today", mode: "daily", dateKey: todayKey(), puzzle: null, practiceIdx: 0, order: [], sortable: null, busy: false, rank: null };
const puzzleForDay = n => PUZZLES[((n % PUZZLES.length) + PUZZLES.length) % PUZZLES.length];
const resultKey = () => state.mode === "preview" ? `v:${state.puzzle.id}:${state.dateKey}` : state.mode === "all" ? `p:${state.puzzle.id}` : state.mode === "practice" ? `r:${state.puzzle.id}` : `d:${state.dateKey}`;
const getResult = () => { const r = load(LS.results, {})[resultKey()]; return r && r.id === state.puzzle.id ? r : null; };
const setResult = r => { const all = load(LS.results, {}); all[resultKey()] = { ...r, id: state.puzzle.id, at: Date.now() };
  const rk = Object.keys(all).filter(k => k.startsWith("r:")).sort((a, b) => all[a].at - all[b].at); rk.slice(0, -30).forEach(k => delete all[k]);   // keep the last 30 random practice results
  save(LS.results, all); };
const isToday = () => state.mode === "daily";
function linkHash() { return state.mode === "preview" ? "" : state.mode === "all" ? `#p=${encodeURIComponent(state.puzzle.id)}` : state.mode === "practice" ? `#r=${state.puzzle.seed}` : `#d=${state.dateKey}`; }
function setHash(h) { try { history.replaceState(null, "", h || location.pathname + location.search); } catch { location.hash = h; } }

// ================================================================ card art (v5)
// Small hand-made line drawings (inline SVG, 64x64, stroke = currentColor) with gentle CSS motion.
// Pick one per puzzle with the sheet's `art` column; unknown/blank -> "chart". Motion is off under prefers-reduced-motion.
const ART = {
  eggplant: `<g class="a-wobble"><path d="M40 20c8 2 12 10 10 18-3 12-14 20-26 20-8 0-12-6-10-12 2-7 10-8 14-14 4-6 4-12 12-12z"/><path d="M40 20c-2-4-1-9 2-12M36 22c2-4 8-5 12-2" /><path d="M24 46c2-4 6-6 10-8" stroke-opacity=".5"/></g>`,
  rocket: `<g class="a-bounce"><path d="M32 6c8 7 11 17 11 28v12H21V34c0-11 3-21 11-28z"/><circle cx="32" cy="27" r="4"/><path d="M21 38l-7 8v6l7-4M43 38l7 8v6l-7-4"/></g><path class="a-flicker" d="M27 50c0 5 2 8 5 10 3-2 5-5 5-10"/>`,
  tree: `<g class="a-sway"><path d="M32 8l-14 20h8l-10 14h12l-8 10h24l-8-10h12l-10-14h8z"/></g><path d="M32 52v8M22 60h20"/>`,
  leaf: `<g class="a-sway"><path d="M32 58C14 50 12 26 32 8c20 18 18 42 0 50z"/><path d="M32 58V18M32 30l-7-5M32 38l8-6M32 46l-9-6"/></g>`,
  puzzle: `<g class="a-bounce"><path d="M14 22h12a6 6 0 1 1 12 0h12v12a6 6 0 1 0 0 12v10H38a6 6 0 1 0-12 0H14V46a6 6 0 1 1 0-12z"/></g>`,
  windmill: `<path d="M32 30l-5 28h10z"/><g class="a-spin"><path d="M32 30L32 8M32 30L51 41M32 30L13 41"/></g><circle cx="32" cy="30" r="2" fill="currentColor"/><path d="M18 58h28"/>`,
  chart: `<path d="M10 54h44"/><rect class="a-grow" style="--d:0s" x="14" y="30" width="8" height="24" rx="2"/><rect class="a-grow" style="--d:.3s" x="28" y="18" width="8" height="36" rx="2"/><rect class="a-grow" style="--d:.6s" x="42" y="36" width="8" height="18" rx="2"/>`,
  clock: `<circle cx="32" cy="34" r="20"/><path d="M26 10h12M32 10v4"/><path class="a-spin-slow" d="M32 34V22"/><path class="a-spin" d="M32 34h9"/><circle cx="32" cy="34" r="1.6" fill="currentColor"/>`,
  car: `<g class="a-bob"><path d="M10 40v-6l6-10h24l8 10h6v6z"/><path d="M20 24l-3 10h28l-7-10"/><circle cx="20" cy="42" r="5"/><circle cx="44" cy="42" r="5"/></g><path class="a-dash" d="M4 54h56" stroke-dasharray="6 6"/>`,
  beer: `<path d="M16 16h26v36a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4z"/><path d="M42 24h6a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4h-6"/><path d="M14 16c0-6 7-8 10-5 3-4 11-3 12 1 5-1 8 2 6 4"/><circle class="a-rise" style="--d:0s" cx="24" cy="48" r="1.6"/><circle class="a-rise" style="--d:.8s" cx="31" cy="50" r="1.4"/><circle class="a-rise" style="--d:1.6s" cx="36" cy="46" r="1.2"/>`,
  sun: `<g class="a-spin-slow"><path d="M32 6v7M32 51v7M6 32h7M51 32h7M13.6 13.6l5 5M45.4 45.4l5 5M13.6 50.4l5-5M45.4 18.6l5-5"/></g><circle cx="32" cy="32" r="13"/><path d="M26 35c2 3 10 3 12 0"/><path class="a-blink" d="M27 29v1M37 29v1"/>`,
  bowl: `<path d="M8 34h48a24 18 0 0 1-48 0z"/><path d="M24 54h16"/><path class="a-steam" style="--d:0s" d="M24 26c-3-4 3-6 0-10"/><path class="a-steam" style="--d:.7s" d="M32 26c-3-4 3-6 0-10"/><path class="a-steam" style="--d:1.4s" d="M40 26c-3-4 3-6 0-10"/>`,
  scale: `<rect x="10" y="12" width="44" height="42" rx="8"/><path d="M20 24a14 14 0 0 1 24 0"/><path class="a-needle" d="M32 32l0-10"/><circle cx="32" cy="32" r="2" fill="currentColor"/><path d="M22 46h20"/>`,
  cake: `<path d="M12 56h40V36H12z"/><path d="M12 44c4 3 8-3 13 0s8 3 14 0 9-3 13 0"/><path d="M32 36v-9"/><path class="a-flicker" d="M32 24c-3-3-2-7 0-10 2 3 3 7 0 10z" fill="currentColor"/>`,
  tomato: `<g class="a-bounce"><circle cx="32" cy="38" r="17"/><path d="M24 22l8 4 8-4M32 26v-8"/><path d="M24 34c1-3 3-4 5-4"/></g>`,
  stroller: `<path d="M14 18a18 18 0 0 0 18 18V18z"/><path d="M32 36h18l-4-12"/><path d="M50 24l4-6"/><g class="a-spin" style="transform-origin:20px 48px"><circle cx="20" cy="48" r="5"/><path d="M15 48h10"/></g><g class="a-spin" style="transform-origin:44px 48px"><circle cx="44" cy="48" r="5"/><path d="M39 48h10"/></g>`,
  capitol: `<path d="M10 54h44M14 48h36M16 48V30M24 48V30M32 48V30M40 48V30M48 48V30M12 30h40L32 18z"/><path d="M32 18V8"/><path class="a-wave" d="M32 8h10l-3 3 3 3H32"/>`,
  wine: `<g class="a-sway"><path d="M20 8h24c0 14-4 22-12 22S20 22 20 8z"/><path d="M21 16h22"/><path d="M32 30v20M22 54h20"/></g>`,
  flask: `<path d="M26 8h12M28 8v16L14 50a4 4 0 0 0 4 6h28a4 4 0 0 0 4-6L36 24V8"/><path d="M19 42h26"/><circle class="a-rise" style="--d:0s" cx="28" cy="48" r="2"/><circle class="a-rise" style="--d:.9s" cx="36" cy="50" r="1.6"/><circle class="a-rise" style="--d:1.8s" cx="32" cy="46" r="1.3"/>`,
  globe: `<circle cx="32" cy="32" r="22"/><path d="M10 32h44"/><ellipse class="a-turn" cx="32" cy="32" rx="9" ry="22"/><path d="M14 20h36M14 44h36"/>`,
  onion: `<g class="a-sway"><path d="M32 56c-14 0-18-10-14-20 3-7 10-11 14-20 4 9 11 13 14 20 4 10 0 20-14 20z"/><path d="M32 56c-6-6-6-22 0-34M32 56c6-6 6-22 0-34"/><path d="M28 58l4-2 4 2"/></g>`,
  potato: `<g class="a-wobble"><path d="M14 38c-4-14 8-24 22-22s18 12 14 24-12 16-22 14-12-8-14-16z"/><circle class="a-blink" cx="27" cy="34" r="1.6" fill="currentColor"/><circle class="a-blink" cx="38" cy="33" r="1.6" fill="currentColor"/><path d="M28 42c3 2 7 2 9 0"/><path d="M20 30h.1M44 44h.1M34 24h.1"/></g>`,
  candle: `<path d="M24 56h16V30H24z"/><path d="M18 56h28"/><path d="M32 30v-5"/><path class="a-flicker" d="M32 22c-4-4-3-9 0-13 3 4 4 9 0 13z" fill="currentColor"/><circle class="a-glow" cx="32" cy="17" r="10" stroke-opacity=".25"/>`,
  sunrise: `<path d="M6 46h52"/><g class="a-rise-sun"><path d="M18 46a14 14 0 0 1 28 0"/><path d="M32 22v-6M16 30l-4-4M48 30l4-4"/></g><path d="M14 54h36" stroke-opacity=".5"/>`,
  balance: `<path d="M32 10v44M22 56h20"/><g class="a-tilt"><path d="M12 20h40"/><path d="M12 20l-6 14h12zM52 20l-6 14h12z"/><path d="M6 34a6 4 0 0 0 12 0M46 34a6 4 0 0 0 12 0"/></g>`,
  briefcase: `<g class="a-bob"><rect x="10" y="22" width="44" height="30" rx="5"/><path d="M24 22v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6"/><path d="M10 34h44"/><path d="M28 34v4h8v-4"/></g>`,
  cart: `<g class="a-bob"><path d="M6 14h8l6 28h28l6-20H17"/><path d="M22 32h28"/></g><g class="a-spin" style="transform-origin:24px 50px"><circle cx="24" cy="50" r="4"/></g><g class="a-spin" style="transform-origin:44px 50px"><circle cx="44" cy="50" r="4"/></g>`,
  smokestack: `<path d="M8 56V36l12-8v8l12-8v8l12-8V16h8v40z"/><path d="M8 56h48"/><path d="M16 46h4M28 46h4M40 46h4"/><circle class="a-puff" style="--d:0s" cx="48" cy="10" r="4"/><circle class="a-puff" style="--d:1.2s" cx="52" cy="8" r="3"/>`,
  ruler: `<rect x="14" y="6" width="14" height="52" rx="2"/><path d="M14 14h6M14 22h9M14 30h6M14 38h9M14 46h6"/><g class="a-measure"><path d="M34 40h18"/><path d="M38 40l-4 0M52 40l-4-4M52 40l-4 4"/><circle cx="44" cy="22" r="5"/><path d="M44 27v13"/></g>`,
  gavel: `<g class="a-tap"><rect x="20" y="10" width="22" height="12" rx="3" transform="rotate(-30 31 16)"/><path d="M34 22l14 22"/></g><path d="M10 54h28M14 48h20v6H14z"/>`,
  gradcap: `<path d="M4 24l28-12 28 12-28 12z"/><path d="M16 30v12c8 6 24 6 32 0V30"/><g class="a-tassel" style="transform-origin:54px 26px"><path d="M54 26v16"/><circle cx="54" cy="44" r="2.5" fill="currentColor"/></g>`,
  courthouse: `<path d="M8 22l24-12 24 12z"/><path d="M10 22h44M14 26v22M24 26v22M40 26v22M50 26v22M8 52h48M6 58h52"/><path class="a-breathe" d="M28 34h8v14h-8z"/>`,
  ballot: `<path d="M10 30h44v24H10z"/><path d="M24 30h16"/><g class="a-drop"><path d="M26 10h14v18H26z"/><path d="M29 18l3 3 5-6"/></g>`,
  house: `<path d="M10 30L32 12l22 18"/><path d="M16 26v28h32V26"/><path d="M28 54V40h8v14"/><path d="M42 18v-8h6v13"/><circle class="a-puff" style="--d:0s" cx="45" cy="5" r="3"/><circle class="a-puff" style="--d:1.3s" cx="49" cy="3" r="2.2"/>`,
  statue: `<path d="M8 56h48M14 56v-8h20v8"/><g class="a-topple" style="transform-origin:34px 48px"><path d="M24 48V30"/><circle cx="24" cy="18" r="6"/><path d="M24 30l-8-6M24 30l10-10M34 20l2-6"/><path d="M18 40h12"/></g>`,
  arm: `<g class="a-flex" style="transform-origin:22px 46px"><path d="M8 50c4-14 10-20 18-22 4-10 10-16 16-14 3 2 1 6-3 8-4 2-6 6-5 10 8-2 18 2 20 12-8 8-26 12-46 6z"/><path d="M30 36c4 2 8 2 12 0"/></g>`,
  magnifier: `<g class="a-search"><circle cx="28" cy="28" r="14"/><path d="M38 38l14 14"/><path d="M22 22a8 8 0 0 1 8-4"/></g>`,
  heart: `<path class="a-beat" d="M32 52C12 38 8 28 10 20c2-8 12-10 18-4l4 4 4-4c6-6 16-4 18 4 2 8-2 18-22 32z"/>`,
  teacup: `<path d="M12 28h34v8a17 17 0 0 1-34 0z"/><path d="M46 31h4a6 6 0 0 1 0 12h-5"/><path d="M8 56h42"/><path class="a-steam" style="--d:0s" d="M22 22c-3-4 3-6 0-10"/><path class="a-steam" style="--d:.8s" d="M32 22c-3-4 3-6 0-10"/>`,
  microphone: `<g class="a-sway"><rect x="24" y="8" width="16" height="28" rx="8"/><path d="M18 30a14 14 0 0 0 28 0"/><path d="M32 44v10M24 56h16"/></g><path class="a-wave2" style="--d:0s" d="M50 18c3 4 3 10 0 14"/><path class="a-wave2" style="--d:.5s" d="M14 18c-3 4-3 10 0 14"/>`,
  sparkles: `<path class="a-twinkle" style="--d:0s" d="M28 10l4 14 14 4-14 4-4 14-4-14-14-4 14-4z"/><path class="a-twinkle" style="--d:.7s" d="M48 38l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><path class="a-twinkle" style="--d:1.4s" d="M14 44l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/>`,
  pickaxe: `<g class="a-tap" style="transform-origin:16px 54px"><path d="M14 52L40 22"/><path d="M22 14c10-4 22-2 30 6-6-2-14-2-20 2"/><path d="M52 20c4 8 6 20 2 30-2-8-6-14-12-18"/></g><path d="M40 58h16M44 54l4-4 4 4"/>`,
  football: `<g class="a-bounce"><circle cx="32" cy="34" r="18"/><path d="M32 26l7 5-3 8h-8l-3-8z"/><path d="M32 26v-8M39 31l8-3M36 39l5 7M28 39l-5 7M25 31l-8-3"/></g>`,
  guitar: `<g class="a-sway"><path d="M38 26l14-14M48 8l8 8"/><path d="M36 28c-4-4-12-2-14 4-6 0-12 4-12 12 0 8 8 14 16 12 8-1 12-6 12-12 6-2 8-10 4-14z"/><circle cx="27" cy="41" r="4"/><path d="M20 48l6-6"/></g>`,
  clipboard: `<rect x="14" y="10" width="36" height="46" rx="4"/><path d="M24 10v-2h16v2M24 14h16"/><path class="a-check" d="M22 28l3 3 6-6"/><path d="M34 28h10"/><path class="a-check" style="animation-delay:.6s" d="M22 40l3 3 6-6"/><path d="M34 40h10"/>`,
  skyline: `<path d="M6 56h52"/><path d="M10 56V30h10v26M20 56V18h12v38M32 56V34h8v22M40 56V24h14v32"/><path class="a-lights" style="--d:0s" d="M24 24h4M24 32h4M44 30h6"/><path class="a-lights" style="--d:1.1s" d="M24 40h4M44 40h6M14 36h2"/>`,
  flag: `<path d="M16 58V8"/><path class="a-wave" style="transform-origin:16px 10px" d="M16 10c8-4 14 4 22 0s12-2 16 0v20c-4-2-8-4-16 0s-14-4-22 0"/>`,
  lighthouse: `<path d="M26 56l3-34h6l3 34z"/><path d="M24 22h16l-2-6H26z"/><path d="M28 30h8M27 40h10"/><path d="M18 56h28"/><g class="a-sweep" style="transform-origin:32px 19px"><path d="M40 17l18-5v12l-18-5" stroke-opacity=".55"/></g>`,
};
const artSvg = key => `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ART[key] || ART.chart}</svg>`;
function renderArt(p) {
  const key = ART[str(p.art).toLowerCase()] ? str(p.art).toLowerCase() : "chart";
  const el = $("#art"); el.dataset.art = key; el.innerHTML = artSvg(key);
}

// ================================================================ rendering: shared header
function renderHero() {
  const p = state.puzzle, n = dayNumber(state.dateKey) + 1;
  $("#heroNo").classList.toggle("practice-tag", state.mode === "practice");
  document.querySelector(".hero-top").classList.toggle("practice", state.mode === "practice");
  $("#heroNo").textContent = state.mode === "preview" ? `Preview · No. ${pad3(n)}` : state.mode === "all" ? `All puzzles ${state.practiceIdx + 1}/${PUZZLES.length}` : state.mode === "practice" ? "Practice" : `No. ${pad3(n)}`;
  $("#heroKind").textContent = p.type === "top5" ? `🖐️ Guess the top 5` : p.type === "match" ? `🔗 Match it` : `${p.emoji || "📊"} Rank it`;
  $("#headline").textContent = p.headline || p.question;
  $("#question").textContent = p.question; $("#question").classList.toggle("hidden", !p.question || p.question === p.headline);
  $("#statLabel").textContent = p.stat + (p.unit ? ` (${p.unit})` : "");
  $("#caveatLine").textContent = p.caveat ? "⚠️ " + p.caveat : ""; $("#caveatLine").classList.toggle("hidden", !p.caveat);   // v11: random Practice shows its dataset caveat up front
  $("#heroDate").textContent = state.mode === "preview" ? `Studio preview · ${longDate(state.dateKey)} · doesn't count toward stats` : state.mode === "practice" ? `Random practice · ${p.year ? p.year + " data · " : ""}doesn't count toward stats` : state.mode === "all" ? `All puzzles (pre-launch) · ${p.order != null && p.order < 10000 ? `daily #${pad3(Math.round(p.order))} · ${longDate(keyFromDay(Math.round(p.order) - 1))} · ` : ""}doesn't count toward stats`
    : `${CONFIG.brand} #${pad3(n)} · ${longDate(state.dateKey)}${isToday() ? "" : " · Archive"}`;
  const label = isToday() ? "Share today's puzzle" : "Share this puzzle";
  $("#newRandomTop").classList.toggle("hidden", state.mode !== "practice");
  renderArt(p); $("#hero").dataset.kind = p.type; $("#shareChallengeTop").textContent = label + " ↗"; $("#shareChallengeBtn").textContent = label;
}

function openPuzzle(p) {
  state.puzzle = p; state.busy = false;
  if (state.sortable) { state.sortable.destroy(); state.sortable = null; }
  showView("play"); renderHero(); $("#result").classList.add("hidden"); showFab(false);
  const g = p.type === "top5"; $("#rankGame").classList.toggle("hidden", p.type !== "rank"); $("#matchGame").classList.toggle("hidden", p.type !== "match"); $("#hero").classList.toggle("is-match", p.type === "match"); $("#guessGame").classList.toggle("hidden", !g); $("#guessExtra").classList.toggle("hidden", !g);
  $("#t5board").classList.toggle("hidden", !g); $("#hints").classList.toggle("hidden", !g);
  setHash(linkHash());
  const saved = getResult();
  p.type === "rank" ? renderRank(saved) : p.type === "match" ? renderMatch(saved) : renderTop5(saved);
  window.scrollTo({ top: 0 }); syncPlaying();
}

// ================================================================ RANK IT
function correctOrder(p) { return p.items.map((it, i) => ({ v: it.value, i })).sort((a, b) => p.higherIs === "bottom" ? a.v - b.v : b.v - a.v).map(x => x.i); }
function shuffledOrder(p, seed) {
  const r = rng(seed), idx = p.items.map((_, i) => i), right = correctOrder(p).join();
  for (let t = 0; t < 20; t++) { for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } if (idx.join() !== right) break; }
  return idx;
}
const valuesOn = p => settings.showValues === "on" ? true : settings.showValues === "off" ? false : !!p.valuesVisible;

// Retry flow: lock in -> cards in the right spot turn green and are pinned, wrong ones go red + shake.
// Rearrange the rest and lock in again, up to CONFIG.rankMaxTries. Result object:
//   { type:"rank", attempts:[{order:[...], marks:["good"|"bad",...]}], cur:[...], pinned:[itemIdx...], done, solved, tries }
const gLabel = it => !(it.gRank && it.gTotal) ? "" : it.gScope ? `#${it.gRank} of ${it.gTotal} ${it.gScope}` : `World #${it.gRank} of ${it.gTotal}`;
const gTag = it => it.gRank && it.gTotal ? `<span class="grank" title="Rank among all ${it.gTotal} ${esc(it.gScope || "countries")} with data in the source dataset${it.year ? " (" + esc(it.year) + ")" : ""}">🌍 ${esc(gLabel(it))}</span>` : "";
const decOf = p => Math.min(2, Math.max(0, ...p.items.map(it => ((String(it.value).split(".")[1]) || "").length)));
const isYearPuzzle = p => !p.unit && p.items.every(it => Number.isInteger(it.value) && it.value >= 1000 && it.value <= 2100);   // e.g. space-first
const fmtP = (p, v) => v.toLocaleString("en-US", { minimumFractionDigits: decOf(p), maximumFractionDigits: decOf(p), useGrouping: !isYearPuzzle(p) });
function normRank(saved) {            // upgrade v3 single-shot results (points/max) to the retry format
  if (!saved || saved.type !== "rank") return null;
  if (saved.attempts) return saved;
  if (!saved.done) return null;
  const marks = (saved.marks || []).map(m => m === "good" ? "good" : "bad");
  return { type: "rank", attempts: [{ order: saved.order, marks }], cur: saved.order, pinned: [], done: true, solved: marks.every(m => m === "good"), tries: 1 };
}
function enforcePinned(p, order, pinned) {   // pinned items sit at their correct slot; others keep their relative order
  const right = correctOrder(p), pin = new Set(pinned), free = order.filter(i => !pin.has(i)), out = [];
  right.forEach((i, n) => out[n] = pin.has(i) ? i : null);
  return out.map(x => x == null ? free.shift() : x);
}
function renderRank(saved, keepOrder) {
  const p = state.puzzle; saved = normRank(saved);
  const g = state.rank = saved || { type: "rank", attempts: [], cur: null, pinned: [], done: false, solved: false, tries: 0 };
  const locked = g.done;
  if (!keepOrder) state.order = g.done ? g.attempts[g.attempts.length - 1].order : (g.cur || shuffledOrder(p, (state.mode === "all" || state.mode === "practice" ? "p" + Date.now() : state.dateKey) + p.id));
  if (!g.done) state.order = enforcePinned(p, state.order, g.pinned);
  const vis = valuesOn(p), board = $("#board");
  board.classList.toggle("values", vis); board.classList.toggle("locked", locked); board.classList.toggle("n6", p.items.length >= 6);   // v10: 6-item rankers get compact rows
  $("#direction").textContent = p.higherIs === "bottom" ? "▲ Lowest at the top" : "▲ Highest at the top";
  const chip = $("#valuesChip"); chip.setAttribute("aria-pressed", String(vis)); chip.textContent = vis ? "👁 Values on" : "👁 Show values"; chip.disabled = locked;
  // v8: values are shown together in ONE panel (sorted, top to bottom = the order asked for), never on the draggable cards
  // v8.1: ONE separate column box to the left of the cards, one value per row (sorted, aligned with the card rows),
  // so no value looks attached to a draggable card. After the reveal each card shows its own value instead.
  const vp = $("#valuesPanel"), cap = $("#valuesCap"), showVals = vis && !locked;
  vp.classList.toggle("hidden", !showVals); cap.classList.toggle("hidden", !showVals); board.classList.toggle("vcol", showVals);
  cap.innerHTML = `<b>The values</b>${p.unit ? ` (${esc(p.unit)})` : ""}, ${p.higherIs === "bottom" ? "lowest" : "highest"} first. Which card has which?`;
  vp.innerHTML = `<ol class="vp-list" aria-label="The values">` + correctOrder(p).map(i => `<li class="vchip"><b>${fmtP(p, p.items[i].value)}</b>${gTag(p.items[i])}</li>`).join("") + `</ol>`;
  const ol = $("#cards"); ol.innerHTML = "";
  state.order.forEach(i => ol.appendChild(cardEl(p, i)));
  if (!g.done) markPinned();
  renumber(); renderTryDots(); updateRankHint();
  $("#hint").classList.toggle("hidden", locked); $("#submitBtn").parentElement.classList.toggle("hidden", locked);
  if (state.sortable) state.sortable.destroy();
  state.sortable = window.Sortable ? Sortable.create(ol, { animation: 220, easing: "cubic-bezier(.2,.8,.2,1)", ghostClass: "sortable-ghost", chosenClass: "sortable-chosen",
    dragClass: "sortable-drag", forceFallback: true, fallbackTolerance: 3, disabled: locked, filter: ".pinned", preventOnFilter: false,
    onEnd: () => { orderChanged([...ol.children].map(li => +li.dataset.i)); } }) : null;
  if (locked) revealRank(g, false);
  fitLayout();
}
function markPinned() {
  const pin = new Set(state.rank.pinned);
  $$("#cards .card").forEach(li => { const on = pin.has(+li.dataset.i); li.classList.toggle("pinned", on); li.classList.toggle("good", on);
    if (on) li.querySelector(".yourpick").textContent = "🔒 Locked"; });
}
function orderChanged(order) {   // after a drag or arrow move: keep pinned cards fixed, clear stale red marks
  const p = state.puzzle, ol = $("#cards"), g = state.rank;
  const fixed = enforcePinned(p, order, g.pinned), els = {}; [...ol.children].forEach(li => els[li.dataset.i] = li);
  if (fixed.join() !== order.join()) { snapshot(ol); fixed.forEach(i => ol.appendChild(els[i])); flip(ol); }
  state.order = fixed; g.cur = fixed; if (g.attempts.length) setResult(g);
  $$("#cards .card.bad").forEach(li => li.classList.remove("bad", "shake"));
  renumber(); updateRankHint();
}
function cardEl(p, i) {
  const it = p.items[i], li = document.createElement("li");
  li.className = "card"; li.dataset.i = i;
  li.innerHTML = `<span class="rank"></span><span class="emoji">${esc(it.emoji || "•")}</span><span class="name">${esc(it.name)}<small class="yourpick"></small><span class="gwrap"></span></span>
    <span class="value"></span><span class="handle" aria-hidden="true">⋮⋮</span>
    <span class="arrows"><button data-dir="-1" aria-label="Move up">▲</button><button data-dir="1" aria-label="Move down">▼</button></span>`;
  li.querySelectorAll(".arrows button").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); move(li, +b.dataset.dir); }));
  return li;
}
function snapshot(ol) { [...ol.children].forEach(k => k._top = k.getBoundingClientRect().top); }
function flip(ol, dur = 300) { [...ol.children].forEach(k => { if (k._top == null) return; const dy = k._top - k.getBoundingClientRect().top; delete k._top;
  if (dy) k.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: dur, easing: "cubic-bezier(.2,.8,.2,1)" }); }); }
function move(li, dir) {   // swap with the nearest non-pinned card in that direction
  if ($("#board").classList.contains("locked") || li.classList.contains("pinned")) return;
  const ol = li.parentElement; let sib = dir < 0 ? li.previousElementSibling : li.nextElementSibling;
  while (sib && sib.classList.contains("pinned")) sib = dir < 0 ? sib.previousElementSibling : sib.nextElementSibling;
  if (!sib) return;
  snapshot(ol); const mark = document.createElement("li"); ol.insertBefore(mark, li); ol.insertBefore(li, sib); ol.insertBefore(sib, mark); mark.remove(); flip(ol);
  orderChanged([...ol.children].map(c => +c.dataset.i));
}
function renumber() { $$("#cards .card").forEach((li, n) => li.querySelector(".rank").textContent = n + 1); }
function renderTryDots() {
  const g = state.rank, max = CONFIG.rankMaxTries;
  const dots = Array.from({ length: max }, (_, n) => { const a = g.attempts[n]; if (!a) return "<i></i>";
    return `<i class="${a.marks.every(m => m === "good") ? "win" : "used"}"></i>`; }).join("");
  const left = max - g.attempts.length;
  $("#rankTries").innerHTML = `${dots}<span>${g.done ? (g.solved ? `Solved in ${g.tries}` : "Out of tries") : `${left} ${left === 1 ? "try" : "tries"} left`}</span>`;
}
function updateRankHint() {
  const p = state.puzzle, g = state.rank, vis = valuesOn(p);
  if (!g.attempts.length) { $("#hint").textContent = vis ? "Put the cards in order: the values column tells you the numbers, not which country has which." : "Drag the cards (or tap ▲▼) into order, then lock it in."; return; }
  const n = g.pinned.length, tot = p.items.length;
  $("#hint").innerHTML = `<b>${n} of ${tot}</b> in the right spot. Green cards are locked in. Move the others and try again.`;
}
function scoreAttempt(p, order) { const right = correctOrder(p); return order.map((i, n) => right[n] === i ? "good" : "bad"); }
function submitRank() {
  const p = state.puzzle, g = state.rank;
  if (state.busy || g.done || $("#board").classList.contains("locked")) return;
  const last = g.attempts[g.attempts.length - 1];
  if (last && last.order.join() === state.order.join()) { toast("Move a red card first"); shakeBad(); return; }
  const marks = scoreAttempt(p, state.order);
  g.attempts.push({ order: [...state.order], marks }); g.tries = g.attempts.length; g.cur = [...state.order];
  const right = correctOrder(p); g.pinned = right.filter((i, n) => state.order[n] === i);
  const solved = marks.every(m => m === "good");
  if (solved || g.attempts.length >= CONFIG.rankMaxTries) {
    g.done = true; g.solved = solved;
    Object.assign(g, { marks, order: [...state.order], points: marks.filter(m => m === "good").length, max: marks.length, values: valuesOn(p) });
    setResult(g); if (isToday()) recordStats(g);
    CommunityStats.submit({ puzzleId: p.id, day: state.dateKey, mode: state.mode, ...g });
    $("#board").classList.add("locked"); state.sortable?.option("disabled", true); $("#valuesChip").disabled = true;
    $("#submitBtn").parentElement.classList.add("hidden"); $("#hint").classList.add("hidden"); renderTryDots();
    feedback(marks, true);
    const tier = winTier(g); if (tier) Fx.celebrate(tier, "rank");
    setTimeout(() => afterSubmit(() => revealRank(g, true), tier), solved ? (tier === "explosive" ? 1100 : 700) : 650);
    return;
  }
  setResult(g); renderTryDots(); feedback(marks, false); updateRankHint();
  toast(`${g.pinned.length}/${marks.length} right · ${CONFIG.rankMaxTries - g.attempts.length} ${CONFIG.rankMaxTries - g.attempts.length === 1 ? "try" : "tries"} left`);
}
function feedback(marks, final) {
  $$("#cards .card").forEach((li, n) => {
    li.classList.remove("good", "bad", "shake"); void li.offsetWidth;
    if (marks[n] === "good") { li.classList.add("good", "pop"); if (!final) { li.classList.add("pinned"); li.querySelector(".yourpick").textContent = "🔒 Locked"; } }
    else li.classList.add("bad", "shake");
  });
}
function shakeBad() { $$("#cards .card:not(.pinned)").forEach(li => { li.classList.remove("shake"); void li.offsetWidth; li.classList.add("shake"); }); }
function revealRank(res, animate) {
  $("#valuesPanel").classList.add("hidden"); $("#valuesCap").classList.add("hidden"); $("#board").classList.remove("vcol");   // after the reveal each card shows its own value
  const p = state.puzzle, ol = $("#cards"), right = correctOrder(p), last = res.attempts[res.attempts.length - 1];
  const userPos = {}, markOf = {}; last.order.forEach((i, n) => { userPos[i] = n; markOf[i] = last.marks[n]; });
  const els = {}; [...ol.children].forEach(li => els[li.dataset.i] = li);
  Object.values(els).forEach(li => { li.classList.remove("good", "bad", "shake", "pinned"); li.classList.add(markOf[li.dataset.i]); });
  const doMove = () => { snapshot(ol); right.forEach(i => ol.appendChild(els[i])); flip(ol, 650); renumber(); };
  const fill = () => right.forEach((i, n) => setTimeout(() => {
    const li = els[i], it = p.items[i];
    li.querySelector(".value").innerHTML = `${fmtP(p, it.value)}<small>${esc(p.unit)}${it.year ? " · " + esc(it.year) : ""}</small>`;
    const gw = li.querySelector(".gwrap"); if (gw) gw.innerHTML = gTag(it);
    li.querySelector(".yourpick").textContent = res.solved ? (res.tries === 1 ? "✓ first try" : "✓ solved") : markOf[i] === "good" ? "✓ you had it right" : `you put it #${userPos[i] + 1}`;
    li.classList.add("revealed"); if (animate) li.classList.add("pop");
  }, animate ? 200 + n * 160 : 0));
  if (animate) { setTimeout(doMove, 350); setTimeout(fill, 1000); setTimeout(() => showResult(res), 1150 + right.length * 160); }
  else { doMove(); fill(); showResult(res); }
}

// ================================================================ MATCH IT (v12)
// 6 people (flag + name + country) and their 6 clues, shuffled. Drag a clue onto a person (or tap a clue, then a person);
// one clue per person (assigning to a taken person swaps). Lock in when all 6 are placed: right pairs turn green and lock,
// wrong ones go red; fix them and lock in again, up to CONFIG.rankMaxTries. Same win tiers and ad rule as Rank it.
// Result: { type:"match", attempts:[{assign:[personIdx per clue], marks:["good"|"bad",...]}], cur:[...], pinned:[clueIdx], done, solved, tries }
// Clue k belongs to person k (sheet row order); clues are shown in a shuffled order, people in sheet order.
const LETTERS = "ABCDEFG";
const FAMILY_FIRST = new Set(["CHN", "TWN", "HKG", "KOR", "PRK", "VNM", "KHM", "MNG"]);   // names written family name first
const shortName = x => { const w = x.name.trim().split(/\s+/); return w.length < 2 ? w[0] : FAMILY_FIRST.has(x.iso3) ? w[0] : w[w.length - 1]; };
const flagHtml = x => x.flagImg ? `<img class="m-flag-img" src="${esc(x.flagImg)}" alt="${esc(x.country)} flag">` : esc(x.emoji);
const matchSeed = p => (state.mode === "daily" || state.mode === "archive" || state.mode === "preview" ? state.dateKey : "m") + p.id;
function clueOrder(p) {
  const r = rng(matchSeed(p)), idx = p.people.map((_, i) => i);
  for (let t = 0; t < 20; t++) { for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } if (idx.every((k, n) => k !== n)) break; }
  return idx;
}
function renderMatch(saved) {
  const p = state.puzzle;
  const g = state.match = saved && saved.type === "match" ? saved : { type: "match", attempts: [], cur: p.people.map(() => null), pinned: [], done: false, solved: false, tries: 0 };
  if (!g.cur) g.cur = p.people.map(() => null);
  state.mSel = null; state.mOrder = clueOrder(p);
  $("#mPeople").innerHTML = p.people.map((x, i) => `<button class="m-person" data-p="${i}" type="button"><span class="m-flag">${flagHtml(x)}</span><span class="m-who"><b>${esc(x.name)}</b><small>${esc(x.country)}</small></span><span class="m-got" aria-label="Clue"></span></button>`).join("");
  $("#mClues").innerHTML = state.mOrder.map((k, n) => `<li class="m-clue" data-c="${k}" tabindex="0"><span class="m-letter">${LETTERS[n]}</span><span class="m-text">${esc(p.people[k].clue)}</span><span class="m-target"></span></li>`).join("");
  $("#matchGame").classList.toggle("locked", g.done); $("#matchGame").classList.toggle("m7", p.people.length > 6); $("#hero").classList.toggle("is-match7", p.people.length > 6);
  paintMatch();
  if (g.done) revealMatch(g, false);
  fitLayout();
}
const letterOf = k => LETTERS[state.mOrder.indexOf(k)];
function paintMatch(marks) {
  const p = state.puzzle, g = state.match, pin = new Set(g.pinned), last = g.attempts[g.attempts.length - 1];
  $$("#mClues .m-clue").forEach(li => { const k = +li.dataset.c, who = g.cur[k], t = li.querySelector(".m-target");
    t.innerHTML = who == null ? `<i>?</i>` : `${flagHtml(p.people[who])}<span class="tn"> ${esc(shortName(p.people[who]))}</span>`;
    li.classList.toggle("placed", who != null); li.classList.toggle("sel", state.mSel === k);
    li.classList.toggle("pinned", pin.has(k) && !g.done); li.classList.toggle("good", pin.has(k));
    const stale = last && last.assign[k] === who && last.marks[k] === "bad";
    li.classList.toggle("bad", !g.done && !pin.has(k) && !!stale); });
  $$("#mPeople .m-person").forEach(b => { const i = +b.dataset.p, k = g.cur.indexOf(i);
    b.querySelector(".m-got").textContent = k >= 0 ? letterOf(k) : ""; b.classList.toggle("has", k >= 0);
    b.classList.toggle("good", k >= 0 && pin.has(k)); b.disabled = g.done || (k >= 0 && pin.has(k)); b.classList.toggle("target", state.mSel != null && !(k >= 0 && pin.has(k))); });
  const placed = g.cur.filter(x => x != null).length, max = CONFIG.rankMaxTries;
  $("#matchTries").innerHTML = Array.from({ length: max }, (_, n) => { const a = g.attempts[n]; return a ? `<i class="${a.marks.every(m => m === "good") ? "win" : "used"}"></i>` : "<i></i>"; }).join("")
    + `<span>${g.done ? (g.solved ? `Solved in ${g.tries}` : "Out of tries") : `${max - g.attempts.length} ${max - g.attempts.length === 1 ? "try" : "tries"} left`}</span>`;
  $("#mHint").innerHTML = g.done ? "" : g.attempts.length ? `<b>${g.pinned.length} of ${p.people.length}</b> right. Green pairs are locked in. Move the red clues and try again.` : `Drag each clue onto a person (or tap a clue, then a person). ${placed}/${p.people.length} placed.`;
  $("#matchSubmit").parentElement.classList.toggle("hidden", g.done);
  $("#matchSubmit").classList.toggle("ready", placed === p.people.length);
}
function matchAssign(k, i) {   // clue k -> person i (swap if person i already holds another unlocked clue)
  const g = state.match; if (g.done || g.pinned.includes(k)) return;
  const other = g.cur.indexOf(i); if (other >= 0 && g.pinned.includes(other)) return;
  if (other >= 0 && other !== k) g.cur[other] = g.cur[k];
  g.cur[k] = i; state.mSel = null; if (g.attempts.length) setResult(g);
  paintMatch();
  const li = $(`#mClues .m-clue[data-c="${k}"]`); if (li) { li.classList.remove("pop"); void li.offsetWidth; li.classList.add("pop"); }
}
function matchTapClue(k) {
  const g = state.match; if (g.done || g.pinned.includes(k)) return;
  state.mSel = state.mSel === k ? null : k; paintMatch();
}
function matchTapPerson(i) {
  const g = state.match; if (g.done) return;
  if (state.mSel != null) return matchAssign(state.mSel, i);
  const k = g.cur.indexOf(i); if (k >= 0 && !g.pinned.includes(k)) matchTapClue(k); else toast("Pick a clue first, then tap a person");
}
function submitMatch() {
  const p = state.puzzle, g = state.match;
  if (state.busy || g.done) return;
  if (g.cur.some(x => x == null)) { toast(`Match all ${p.people.length} clues first`); return; }
  const last = g.attempts[g.attempts.length - 1];
  if (last && last.assign.join() === g.cur.join()) { toast("Move a red clue first"); $$("#mClues .m-clue.bad").forEach(li => { li.classList.remove("shake"); void li.offsetWidth; li.classList.add("shake"); }); return; }
  const marks = g.cur.map((who, k) => who === k ? "good" : "bad");
  g.attempts.push({ assign: [...g.cur], marks }); g.tries = g.attempts.length; g.pinned = marks.map((m, k) => m === "good" ? k : -1).filter(k => k >= 0);
  const solved = marks.every(m => m === "good");
  $$("#mClues .m-clue").forEach(li => { const k = +li.dataset.c; li.classList.remove("shake", "pop"); void li.offsetWidth; li.classList.add(marks[k] === "good" ? "pop" : "shake"); });
  if (solved || g.attempts.length >= CONFIG.rankMaxTries) {
    g.done = true; g.solved = solved; Object.assign(g, { marks, points: marks.filter(m => m === "good").length, max: marks.length });
    setResult(g); if (isToday()) recordStats(g);
    CommunityStats.submit({ puzzleId: p.id, day: state.dateKey, mode: state.mode, ...g });
    $("#matchGame").classList.add("locked"); paintMatch(); $$("#mClues .m-clue").forEach(li => { const k = +li.dataset.c; li.classList.toggle("good", marks[k] === "good"); li.classList.toggle("bad", marks[k] !== "good"); });
    const tier = winTier(g); if (tier) Fx.celebrate(tier, "rank");
    setTimeout(() => afterSubmit(() => revealMatch(g, true), tier), solved ? (tier === "explosive" ? 1100 : 700) : 650);
    return;
  }
  setResult(g); paintMatch();
  toast(`${g.pinned.length}/${marks.length} right · ${CONFIG.rankMaxTries - g.attempts.length} ${CONFIG.rankMaxTries - g.attempts.length === 1 ? "try" : "tries"} left`);
}
function revealMatch(res, animate) {
  const p = state.puzzle, last = res.attempts[res.attempts.length - 1];
  $$("#mClues .m-clue").forEach((li, n) => { const k = +li.dataset.c, ok = last.marks[k] === "good";
    li.classList.remove("sel", "pinned", "shake"); li.classList.toggle("good", ok); li.classList.toggle("bad", !ok); li.classList.add("revealed");
    li.querySelector(".m-target").innerHTML = `${flagHtml(p.people[k])}<span class="tn"> ${esc(shortName(p.people[k]))}</span>${ok ? "" : ` <s>${flagHtml(p.people[last.assign[k]])}<span class="tn">${esc(shortName(p.people[last.assign[k]]))}</span></s>`}`;
    if (animate) setTimeout(() => li.classList.add("pop"), 120 * n); });
  $$("#mPeople .m-person").forEach(b => { const i = +b.dataset.p; b.querySelector(".m-got").textContent = letterOf(i); b.classList.toggle("good", last.marks[i] === "good"); b.classList.toggle("bad", last.marks[i] !== "good"); b.disabled = true; });
  if (animate) setTimeout(() => showResult(res), 300 + 120 * p.people.length); else showResult(res);
}
const matchAnswers = (p, res) => { const last = res.attempts[res.attempts.length - 1];
  return `<h3>The matches</h3>` + p.people.map((x, k) => `<div class="m-ans ${last.marks[k] === "good" ? "ok" : "no"}"><div class="m-ans-h"><span class="m-flag">${flagHtml(x)}</span><b>${esc(x.name)}</b><small>${esc(x.country)}</small><span class="m-ans-mark">${last.marks[k] === "good" ? "✓" : "✗"}</span></div>
    <p class="m-ans-clue">“${esc(x.clue)}”</p><p class="m-ans-fact">${esc(x.fact)}${x.sourceUrl ? ` <a href="${esc(x.sourceUrl)}" target="_blank" rel="noopener">${esc(x.sourceName || "Source")} ↗</a>` : ""}</p></div>`).join(""); };
// drag a clue onto a person (pointer events: mouse, pen and touch); a short press without movement is a tap
(function matchDrag() {
  let d = null;
  const zone = () => $("#matchGame");
  zone().addEventListener("pointerdown", e => {
    const li = e.target.closest(".m-clue"); if (!li || state.match?.done || li.classList.contains("pinned") || e.button > 0) return;
    d = { li, k: +li.dataset.c, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, ghost: null };
  });
  addEventListener("pointermove", e => {
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    if (!d.moved) { d.moved = true; const r = d.li.getBoundingClientRect(), gh = d.li.cloneNode(true); gh.classList.add("m-ghost"); gh.style.width = r.width + "px";
      gh.style.left = r.left + "px"; gh.style.top = r.top + "px"; document.body.appendChild(gh); d.ghost = gh; d.ox = e.clientX - r.left; d.oy = e.clientY - r.top; d.li.classList.add("dragging"); }
    e.preventDefault();
    d.ghost.style.left = (e.clientX - d.ox) + "px"; d.ghost.style.top = (e.clientY - d.oy) + "px";
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest(".m-person");
    $$("#mPeople .m-person").forEach(b => b.classList.toggle("over", b === over));
  }, { passive: false });
  const end = e => {
    if (!d || e.pointerId !== d.id) return; const cur = d; d = null;
    $$("#mPeople .m-person").forEach(b => b.classList.remove("over"));
    if (!cur.moved) { matchTapClue(cur.k); return; }
    cur.ghost.remove(); cur.li.classList.remove("dragging");
    const over = e.type === "pointerup" ? document.elementFromPoint(e.clientX, e.clientY)?.closest(".m-person") : null;
    if (over && !over.disabled) matchAssign(cur.k, +over.dataset.p);
  };
  addEventListener("pointerup", end); addEventListener("pointercancel", end);
  $("#mPeople").addEventListener("click", e => { const b = e.target.closest(".m-person"); if (b && !b.disabled) matchTapPerson(+b.dataset.p); });
  $("#mClues").addEventListener("keydown", e => { const li = e.target.closest(".m-clue"); if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); matchTapClue(+li.dataset.c); } });
})();
window.RankdMatch = { state: () => state.match, order: () => state.mOrder, assign: (k, i) => matchAssign(k, i) };

// ================================================================ GUESS THE TOP 5
// Name as many of the top 5 as you can. Hits are free; the game ends at 5 found or after maxMisses misses.
// Score = found (X/5); secondary "closeness" stat = average world rank of ALL guesses (lower = closer).
function renderTop5(saved) {
  const p = state.puzzle, g = saved || { type: p.type, guesses: [], done: false, won: false };
  state.guess = g;
  $("#guessInput").value = ""; closeSuggest();
  $("#guesses").innerHTML = ""; g.guesses.forEach(code => addGuessRow(findCountry(p, code), false));
  renderTries(); renderHints(); renderTop5Board();
  $("#guessForm").classList.toggle("hidden", g.done);
  if (g.done) showResult(g);
}
const findCountry = (p, key) => p.countries.find(c => (c.iso3 && c.iso3 === key) || c.name === key);
const cKey = c => c.iso3 || c.name;
// v10: ALWAYS exactly 5 slots. Countries are sorted by value (then by the optional unrounded "exact" tiebreak value).
// If #5 is still tied (same value and no tiebreak that separates them), slot #5 is shared: either tied country counts.
const isTop5 = p => p.type === "top5";
const sameRank = (a, b) => a.value === b.value && (a.exact ?? null) === (b.exact ?? null);
const beats = (a, b) => a.value > b.value || (a.value === b.value && a.exact != null && b.exact != null && a.exact > b.exact);
const SLOTS = new WeakMap();
function slotsOf(p) {
  if (SLOTS.has(p)) return SLOTS.get(p);
  const cs = p.countries, sl = cs.slice(0, 4).map(c => [c]);
  sl.push(cs.slice(4).filter(c => sameRank(c, cs[4])));
  const out = sl.map((group, i) => ({ i, group, value: group[0].value, tied: group.length > 1 })); SLOTS.set(p, out); return out;
}
const slotOf = (p, c) => c && slotsOf(p).find(s => s.group.includes(c));
const inTop = (p, c) => !!slotOf(p, c);
const topSet = p => slotsOf(p).map(s => s.group[0]);   // one representative per slot (always 5)
const slotFound = (p, s, keys) => s.group.find(c => keys.has(cKey(c)));
const hitsOf = (p, g) => { const k = new Set(g.guesses); return slotsOf(p).filter(s => slotFound(p, s, k)).length; };   // max 5
const tieRank = (p, c) => 1 + p.countries.filter(x => beats(x, c)).length;
const missesOf = (p, g) => g.guesses.length - g.guesses.filter(k => inTop(p, findCountry(p, k))).length;
const missesLeft = (p, g) => Math.max(0, p.maxMisses - missesOf(p, g));
const plural = (n, w, pl = w + "es") => `${n} ${n === 1 ? w : pl}`;
const avgRank = (p, g) => { const r = g.guesses.map(k => findCountry(p, k)).filter(Boolean).map(c => tieRank(p, c));
  return r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : null; };
function renderTop5Board() {   // v8: inside the blue card: hits in their #1-#5 slots + the most recent miss
  const p = state.puzzle, g = state.guess;
  const found = new Set(g.guesses), show = g.done;
  // v9: ONE dashed values box on the LEFT (all top-5 values, sorted high to low, with units, one per row) and the
  // #1-#5 slots on the right; country names fill in as they're found (all of them at the end).
  const sl = slotsOf(p), u = p.unit ? ` <small>${esc(p.unit)}</small>` : "";
  $("#t5board").innerHTML = `<div class="t5h">${hitsOf(p, g)} of 5 found${g.guesses.length && !g.done ? `<button type="button" class="t5more" id="extraBtn" aria-label="Hints and guesses so far">💡 Hints</button>` : ""}<span>${g.done ? "Final" : `${plural(missesLeft(p, g), "miss")} left`}</span></div>`
    + `<div class="t5grid"><div class="t5vals" aria-label="The top-5 values"><ol class="vp-list">${sl.map((s, i) => `<li class="vchip t5val${slotFound(p, s, found) ? " hit" : ""}" data-slot="${i + 1}"><b>${fmt1(s.value)}</b>${u}</li>`).join("")}</ol></div>`
    + `<div class="t5slots">` + sl.map((s, i) => {
    const f = slotFound(p, s, found), c = f || s.group[0], open = !!f || show;
    const name = f ? esc(f.name) : s.tied ? s.group.map(x => esc(x.name)).join(" = ") : esc(c.name);
    return `<div class="t5 ${f ? "hit" : open ? "missed" : ""}${s.tied ? " tied" : ""}" data-slot="${i + 1}"><span class="t5r">#${i + 1}</span>${open ? `<span class="emoji">${esc(c.emoji || "🏳️")}</span><span class="t5n">${name}</span>` : `<span class="t5n q">?</span>`}</div>`; }).join("") + `</div></div>`;
  const xb = $("#extraBtn"); if (xb) xb.onclick = extraSheet;
  const lastKey = [...g.guesses].reverse().find(k => !inTop(p, findCountry(p, k))), lm = $("#lastMiss");
  const c = lastKey && findCountry(p, lastKey);
  lm.classList.toggle("hidden", !c);
  requestAnimationFrame(fitLayout);
  lm.innerHTML = c ? `<span class="lm-k">Last miss</span><span class="emoji">${esc(c.emoji || "🏳️")}</span><span class="lm-n">${esc(c.name)}</span><span class="lm-v">${fmt1(c.value)} ${esc(p.unit)}</span><span class="lm-r">#${tieRank(p, c)} of ${p.countries.length}</span>` : "";
}
function renderTries() {
  const p = state.puzzle, g = state.guess, h = hitsOf(p, g), m = missesOf(p, g), a = avgRank(p, g);
  const dots = Array.from({ length: p.maxMisses }, (_, i) => `<i class="${i < m ? "used" : ""}"></i>`).join("");
  $("#tries").innerHTML = `${dots}<span style="margin-left:6px">${h}/5 found · ${g.done ? plural(m, "miss") : `${plural(missesLeft(p, g), "miss")} left`}${a ? ` · avg rank #${a}` : ""}</span>`;
}
function addGuessRow(c, animate = true) {
  const p = state.puzzle, li = document.createElement("li"), hit = inTop(p, c);
  li.className = "g-row t5row " + (hit ? "win" : ""); if (!animate) li.style.animation = "none";
  li.innerHTML = `<span class="emoji">${esc(c.emoji || "🏳️")}</span><div><div class="gn">${esc(c.name)}</div><div class="gv">${fmt1(c.value)} ${esc(p.unit)}${c.year && c.year !== p.year ? ` (${esc(c.year)})` : ""}</div></div>
    <div class="gr">${hit ? `#${slotOf(p, c).i + 1}<span class="of"> of 5</span><small>✅ In the top 5!${slotOf(p, c).tied ? " (tied #5)" : ""}</small>` : `#${tieRank(p, c)}<span class="of"> of ${p.countries.length}</span><small>⬜ Miss</small>`}</div>`;
  $("#guesses").prepend(li);
}
// --- hints (v8): after misses 2, 4, 6, 8, 9 one hint = ONE trait about ONE still-unfound top-5 country. The highest-ranked
// unfound country gets its next unused hint from the puzzle's hint bank (5 per country, vague -> specific; from the
// hint_bank sheet, built by build.py from country_info). Found it? Later hints move to the next unfound country.
// Everything is derived from the guess sequence, so a reload shows exactly the same hints.
const HINT_AT = [2, 4, 6, 8, 9];
const bankOf = c => (c.hints && c.hints.length ? c.hints : [`Its name starts with “${c.name.normalize("NFD")[0].toUpperCase()}”.`]);
function hintPlan(p, g) {
  const sl = slotsOf(p), found = new Set(), used = {}, given = []; let misses = 0;   // found = slot indexes
  const at = HINT_AT.filter(m => m < p.maxMisses);
  g.guesses.forEach(k => { const c = findCountry(p, k); if (!c) return;
    const s = slotOf(p, c); if (s) { found.add(s.i); return; }
    misses++; if (!at.includes(misses)) return;
    const ts = sl.find(x => !found.has(x.i) && (used[x.i] || 0) < bankOf(x.group[0]).length);   // tied slot: hints describe its first country
    if (!ts) { given.push(null); return; }
    const n = used[ts.i] = (used[ts.i] || 0) + 1, t = ts.group[0];
    given.push({ target: t, slot: ts.i + 1, n, text: bankOf(t)[n - 1] }); });
  return at.map((m, i) => ({ at: m, unlocked: misses >= m, ...(given[i] || {}) }));
}
function renderHints() {
  const p = state.puzzle, plan = hintPlan(p, state.guess), keys = new Set(state.guess.guesses);
  const found = { has: k => { const c = findCountry(p, k), s = slotOf(p, c); return !!(s && slotFound(p, s, keys)); } };   // slot filled by either tied country
  $("#hints").innerHTML = plan.map((h, i) => !h.unlocked
    ? `<div class="hint-card">🔒 Hint ${i + 1} unlocks after ${plural(h.at, "miss")}</div>`
    : h.target ? `<div class="hint-card open${found.has(cKey(h.target)) ? " found" : ""}" data-slot="${h.slot}" data-n="${h.n}"><span class="hk">Hint for #${h.slot}:</span> <span class="ht">${esc(h.text)}</span>${found.has(cKey(h.target)) ? ` <span class="hf">✓ found</span>` : ""}</div>` : "").join("");
  const cur = [...plan].reverse().find(h => h.unlocked && h.target && !found.has(cKey(h.target))), lh = $("#lastHint");   // newest still-useful hint, in the blue card
  lh.classList.toggle("hidden", !cur || state.guess.done);
  lh.innerHTML = cur ? `<span class="lm-k">💡 Hint for #${cur.slot}</span><span>${esc(cur.text)}</span>` : ""; requestAnimationFrame(fitLayout);
}
function submitGuess(c) {
  const p = state.puzzle, g = state.guess; if (!c || g.done || state.busy) return;
  if (g.guesses.includes(cKey(c))) { toast(`You already guessed ${c.name}`); $("#guessInput").value = ""; closeSuggest(); return; }
  g.guesses.push(cKey(c)); addGuessRow(c);
  const h = hitsOf(p, g); g.hits = h; g.misses = missesOf(p, g); g.won = h >= 5; g.avgRank = avgRank(p, g);   // "won" = found all 5 (stats only)
  if (g.won || g.misses >= p.maxMisses) { g.done = true; g.tries = g.guesses.length; }
  setResult(g); renderTries(); renderHints(); renderTop5Board();
  if (!inTop(p, c) && HINT_AT.includes(g.misses) && g.misses < p.maxMisses && !g.done) toast("💡 New hint unlocked");
  $("#guessInput").value = ""; closeSuggest();
  if (g.done) {
    g.marks = g.guesses.map(k => inTop(p, findCountry(p, k)) ? "good" : "miss");
    setResult(g); if (isToday()) recordStats(g);
    CommunityStats.submit({ puzzleId: p.id, day: state.dateKey, mode: state.mode, ...g });
    $("#guessForm").classList.add("hidden");
    const tier = winTier(g); if (tier) Fx.celebrate(tier, "top5");
    afterSubmit(() => showResult(g), tier);
  } else $("#guessInput").focus();
}
// --- country search box. Typing / clicking a suggestion only FILLS the input; a guess is submitted only by the Guess
// button or Enter, and only for an exact country name (Enter on a partial name first fills in the highlighted suggestion).
// v8: suggestions never follow the puzzle's data order (that would leak the ranking). Empty box -> no dropdown;
// while typing -> best match first (name starts with it, then word starts with it,
// then contains it), alphabetical within each group.
let sugg = [], sIdx = -1;
const byName = (a, b) => a.name.localeCompare(b.name, "en");
function showSuggest(list, active) {
  sugg = list; sIdx = active;
  const ul = $("#suggest");
  ul.innerHTML = sugg.length ? sugg.map((c, i) => `<li role="option" data-i="${i}" class="${i === sIdx ? "active" : ""}"><span>${esc(c.emoji || "🏳️")}</span>${esc(c.name)}</li>`).join("")
    : `<li class="empty">No country in this dataset matches</li>`;
  ul.classList.remove("hidden"); $("#guessInput").setAttribute("aria-expanded", "true");
}
function updateSuggest() {
  const p = state.puzzle, q = norm($("#guessInput").value), used = new Set(state.guess.guesses);
  const pool = p.countries.filter(c => !used.has(cKey(c)));
  if (!q) { closeSuggest(); return; }   // v8.1: no dropdown until at least one letter is typed
  const tier = c => { const n = norm(c.name); return n.startsWith(q) ? 0 : n.split(" ").some(w => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : 9; };
  const list = pool.filter(c => tier(c) < 9).sort((a, b) => tier(a) - tier(b) || byName(a, b)).slice(0, 8);
  if (list.length === 1 && norm(list[0].name) === q) { closeSuggest(); return; }   // already an exact name: nothing to suggest
  showSuggest(list, list.length ? 0 : -1);
}
function closeSuggest() { $("#suggest").classList.add("hidden"); $("#guessInput").setAttribute("aria-expanded", "false"); sugg = []; sIdx = -1; }
function fillGuess(c) { $("#guessInput").value = c.name; closeSuggest(); $("#guessInput").focus(); }
const exactTyped = () => { const q = norm($("#guessInput").value); return q ? state.puzzle.countries.find(c => norm(c.name) === q) || null : null; };
function onGuessSubmit() {
  const exact = exactTyped();
  if (exact) { submitGuess(exact); return; }
  if (sIdx >= 0 && sugg[sIdx]) { fillGuess(sugg[sIdx]); return; }   // fill only; press Guess / Enter again to submit
  if ($("#guessInput").value.trim()) toast("Pick a country from the list");
}

// ================================================================ v11: win celebrations (tiers by attempt number)
// Rank it:  solved on try 1 = "explosive", try 2 = "big", 3+ (or not solved) = none (plain result, ads as normal).
// Top 5:    all 5 found with 0 misses = "explosive", 1-2 misses = "big", otherwise none.
// prefers-reduced-motion: no confetti / shake / flash, just a short fade-in banner.
function winTier(r) {
  if (r.type === "rank" || r.type === "match") return !r.solved ? null : r.tries === 1 ? "explosive" : r.tries === 2 ? "big" : null;
  const p = state.puzzle; if (hitsOf(p, r) < 5) return null;
  const m = missesOf(p, r); return m === 0 ? "explosive" : m <= 2 ? "big" : null;
}
const Fx = (() => {
  const TXT = { rank: { explosive: "PERFECT!", big: "BRILLIANT!", normal: "Nice!" }, top5: { explosive: "FLAWLESS!", big: "BRILLIANT!", normal: "Nice!" } };
  const CFG = { explosive: { n: 220, speed: 15, dur: 2600, spread: Math.PI * 2 }, big: { n: 110, speed: 11, dur: 2100, spread: Math.PI * 2 }, normal: { n: 40, speed: 7.5, dur: 1500, spread: Math.PI * 1.1 } };
  const COLORS = ["#FFE48A", "#16B364", "#EF4A4F", "#FFFFFF", "#8EA2FF", "#F5B82E", "#FF7AC6"];
  const api = { history: [], last: null };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  api.celebrate = (tier, kind) => {
    const red = reduced(), ev = { tier, kind, reduced: red, at: Date.now() }; api.last = ev; api.history.push(ev);
    document.querySelectorAll(".fx-layer").forEach(n => n.remove());
    const layer = document.createElement("div"); layer.className = `fx-layer fx-${tier}${red ? " fx-reduced" : ""}`; layer.setAttribute("aria-hidden", "true");
    const banner = document.createElement("div"); banner.className = "fx-banner"; banner.textContent = TXT[kind][tier]; layer.appendChild(banner);
    document.body.appendChild(layer);
    const total = red ? 1400 : CFG[tier].dur;
    if (!red) {
      if (tier === "explosive") { const fl = document.createElement("div"); fl.className = "fx-flash"; layer.appendChild(fl); document.body.classList.remove("fx-shake"); void document.body.offsetWidth; document.body.classList.add("fx-shake"); ev.shake = true; setTimeout(() => document.body.classList.remove("fx-shake"), 700); }
      if (tier === "big") { const h = $("#hero"); h.classList.remove("fx-bump"); void h.offsetWidth; h.classList.add("fx-bump"); setTimeout(() => h.classList.remove("fx-bump"), 700); }
      confetti(layer, tier);
    }
    setTimeout(() => layer.remove(), total + 200);
    return ev;
  };
  function confetti(layer, tier) {
    const c = CFG[tier], cv = document.createElement("canvas"), dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.className = "fx-canvas"; layer.appendChild(cv);
    const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
    const hb = $("#hero").getBoundingClientRect(), ox = W / 2, oy = Math.max(60, Math.min(H * .55, hb.top + hb.height * .45));
    const origins = tier === "big" ? [[0, H * .7, -Math.PI / 3.2], [W, H * .7, -Math.PI + Math.PI / 3.2]] : tier === "normal" ? [[ox, Math.min(H * .8, hb.bottom - 40), -Math.PI / 2]] : [[ox, oy, 0]];
    const P = [];
    for (let k = 0; k < c.n; k++) { const [x, y, dir] = origins[k % origins.length];
      const a = tier === "explosive" ? Math.random() * c.spread : dir + (Math.random() - .5) * (tier === "big" ? .9 : c.spread), v = c.speed * (.45 + Math.random() * .75);
      P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (tier === "explosive" ? 3 : 0), r: 3 + Math.random() * (tier === "explosive" ? 6 : 4), rot: Math.random() * 6, vr: (Math.random() - .5) * .4, col: COLORS[k % COLORS.length], sh: k % 3 }); }
    const t0 = performance.now();
    (function frame(t) {
      const e = t - t0; ctx.clearRect(0, 0, W, H);
      for (const q of P) { q.vy += .28; q.vx *= .985; q.vy *= .985; q.x += q.vx; q.y += q.vy; q.rot += q.vr;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - e / c.dur); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.col;
        if (q.sh === 0) ctx.fillRect(-q.r, -q.r / 2, q.r * 2, q.r); else if (q.sh === 1) { ctx.beginPath(); ctx.arc(0, 0, q.r * .6, 0, 7); ctx.fill(); } else { ctx.beginPath(); ctx.moveTo(0, -q.r); ctx.lineTo(q.r, q.r); ctx.lineTo(-q.r, q.r); ctx.fill(); }
        ctx.restore(); }
      if (e < c.dur && cv.isConnected) requestAnimationFrame(frame);
    })(t0);
  }
  return api;
})();
window.RankdFx = Fx; window.RankdWinTier = r => winTier(r);

// ================================================================ after submit: interstitial (non-daily only)
// v11: no interstitial after a celebrated win (Rank it solved in 1-2 tries, Top 5 all found with <= 2 misses).
function afterSubmit(reveal, tier) {
  const why = !Ads.allowed() ? "streamer" : (isToday() && !CONFIG.interstitialOnDaily) ? "daily" : tier ? "win:" + tier : null;
  Ads.decisions.push({ puzzle: state.puzzle.id, mode: state.mode, tier: tier || null, show: !why, reason: why || "shown", at: Date.now() });
  if (why) { reveal(); return; }
  showInterstitial(reveal);
}
function showInterstitial(done) {
  const ov = $("#interstitial"), btn = $("#skipAd"); let s = CONFIG.interstitialSeconds; state.busy = true;
  ov.classList.remove("hidden"); btn.disabled = true; btn.textContent = `Skip in ${s}`;
  // ADSENSE / GAM: request + render the interstitial creative here.
  const t = setInterval(() => { s--; if (s <= 0) { clearInterval(t); btn.disabled = false; btn.textContent = "See result ✕"; } else btn.textContent = `Skip in ${s}`; }, 1000);
  btn.onclick = () => { if (btn.disabled) return; clearInterval(t); ov.classList.add("hidden"); state.busy = false; done(); };
}

// ================================================================ result panel
const EMO = { good: "🟩", near: "🟨", bad: "🟥", miss: "⬜" };
const rankGrid = r => (r.attempts || []).map(a => a.marks.map(m => EMO[m]).join("")).join("\n");
function showResult(res) {
  const p = state.puzzle;
  if (res.type === "match") {
    const max = CONFIG.rankMaxTries, nn = p.people.length;
    $("#scoreBig").textContent = res.solved ? `${res.tries}/${max}` : `X/${max}`;
    $("#scoreTitle").textContent = res.solved ? (res.tries === 1 ? `All ${nn} matched on the first try! 🎯` : `Matched all ${nn} in ${res.tries} tries`) : `${res.points}/${nn} matched. Tricky one 😅`;
    $("#answerBox").innerHTML = matchAnswers(p, res); $("#answerBox").classList.remove("hidden");
  } else if (res.type === "rank") {
    const max = CONFIG.rankMaxTries;
    $("#scoreBig").textContent = res.solved ? `${res.tries}/${max}` : `X/${max}`;
    $("#scoreTitle").textContent = res.solved ? (res.tries === 1 ? "Perfect first try! 🎯" : res.tries <= 2 ? `Sharp! Solved in ${res.tries} tries` : `Solved in ${res.tries} tries`) : "Stereotypes got you 😅";
    $("#answerBox").classList.add("hidden");
  } else {
    const h = hitsOf(p, res), m = missesOf(p, res), avg = avgRank(p, res);
    $("#scoreBig").textContent = `${h}/5`;
    $("#scoreTitle").textContent = (h >= 5 ? `Found all 5 with ${plural(m, "miss")}! 🖐️` : h >= 3 ? `Found ${h}/5. Nice!` : `Found ${h}/5`) + (avg ? ` · avg rank #${avg}` : "");
    const guessed = new Set(res.guesses);
    $("#answerBox").innerHTML = `<p class="avgrank" id="avgRank">Closeness: your ${plural(res.guesses.length, "guess")} averaged world rank <b>#${avg}</b> of ${p.countries.length} (lower = closer)</p>` +
      `<h3>The top 5 of ${p.countries.length} countries · ${esc(p.unit)}</h3>` + slotsOf(p).map((s, i) => { const f = slotFound(p, s, guessed);
      return `<div class="top-row ${f ? "ans" : ""}${s.tied ? " tied" : ""}"><span class="tr">#${i + 1}</span><span>${s.group.map(c => esc(c.emoji)).join("")}</span>
      <span>${s.group.map(c => esc(c.name) + (guessed.has(cKey(c)) ? " ✓" : "")).join(" = ")}${s.tied ? `<small class="tienote"> tied at ${fmt1(s.value)}: either one counted</small>` : ""}</span><span class="tv">${fmt1(s.value)}</span></div>`; }).join("");
    $("#answerBox").classList.remove("hidden");
  }
  $("#emojiRow").textContent = res.type === "rank" || res.type === "match" ? rankGrid(res) : (res.marks || []).map(m => EMO[m]).join("");
  $("#fact").innerHTML = p.fact ? `<b>The twist:</b> ${esc(p.fact)}` : p.caveat ? `⚠️ ${esc(p.caveat)}` : ""; $("#fact").classList.toggle("hidden", !p.fact && !p.caveat);
  const sup = $("#support"); if (p.support) { sup.innerHTML = `💙 Struggling, or worried about someone? Free, confidential support is available in most countries: <a href="${esc(p.support)}" target="_blank" rel="noopener">${esc(p.support.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))} ↗</a>`; sup.classList.remove("hidden"); } else sup.classList.add("hidden");
  $("#sourceName").textContent = p.source || "source";
  const a = $("#sourceLink"); if (p.sourceUrl) { a.href = p.sourceUrl; a.classList.remove("hidden"); } else a.classList.add("hidden");
  $("#nextBtn").textContent = state.mode === "preview" ? "Back to Studio →" : state.mode === "practice" ? "🎲 New random puzzle →" : state.mode === "all" ? "Next puzzle →" : state.mode === "archive" ? "Back to archive →" : "More puzzles →";
  renderCommunity(p);
  $("#result").classList.remove("hidden"); showFab(true); syncPlaying();
  setTimeout(() => $("#result").scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
}
async function renderCommunity(p) {
  const body = $("#communityBody"), badge = $("#communityBadge");
  let data = null; try { data = await CommunityStats.fetch(p.id, state.dateKey); } catch {}
  if (data) { badge.textContent = `${data.players.toLocaleString()} players`; body.textContent = JSON.stringify(data); return; } // TODO: render real stats
  badge.textContent = "Coming soon";
  const rows = p.type === "rank" ? p.items : p.type === "match" ? p.people : p.countries.slice(0, 3);
  body.innerHTML = `No player data yet. This prototype has no backend; once one is connected this shows how everyone did.` +
    rows.slice(0, 6).map(it => `<div class="crow" aria-hidden="true"><span class="cn">${esc(it.emoji)} ${esc(it.name)}</span><span class="cb"><i style="width:0"></i></span><span class="cp">–%</span></div>`).join("");
}

// ================================================================ stats (today's daily only)
function recordStats(res) {
  const s = load(LS.stats, { played: 0, wins: 0, streak: 0, best: 0, lastDay: null, dist: {} });
  const dn = dayNumber(state.dateKey); if (s.lastDay === dn) return;
  s.streak = s.lastDay === dn - 1 ? s.streak + 1 : 1; s.best = Math.max(s.best, s.streak); s.lastDay = dn; s.played++;
  const win = res.type === "rank" || res.type === "match" ? res.solved : res.won; if (win) s.wins++;
  const k = res.type === "rank" ? (res.solved ? `Rank in ${res.tries}` : "Rank ✗") : res.type === "match" ? (res.solved ? `Match in ${res.tries}` : "Match ✗") : `Top 5: ${res.hits}/5`;
  s.dist[k] = (s.dist[k] || 0) + 1; save(LS.stats, s);
}
function currentStreak() { const s = load(LS.stats, null); if (!s) return 0; const dn = dayNumber(todayKey()); return (s.lastDay === dn || s.lastDay === dn - 1) ? s.streak : 0; }

// ================================================================ sharing
function shareUrl() { return CONFIG.siteUrl.replace(/#.*$/, "") + linkHash(); }
const fullTitle = p => p.headline && p.question && p.headline !== p.question ? `${p.headline}: ${p.question}` : (p.headline || p.question);   // v11 share/list text
function shareTitle() { return state.mode === "preview" ? `${CONFIG.brand} preview` : state.mode === "practice" ? `${CONFIG.brand} Practice` : state.mode === "all" ? `${CONFIG.brand} preview` : `${CONFIG.brand} #${pad3(dayNumber(state.dateKey) + 1)}`; }
function challengeText() {
  const p = state.puzzle;
  return `${shareTitle()} ${p.emoji || ""}\n${fullTitle(p)}\n${p.type === "top5" ? `Guess the top 5: how many of the top 5 can you name before ${p.maxMisses} misses?` : p.type === "match" ? "Match it: can you match each clue to the right person?" : "Can you rank them right?"}\n${shareUrl()}`.replace(/ \n/, "\n");
}
function resultText() {
  const p = state.puzzle; let r = getResult(); if (p.type === "rank") r = normRank(r); if (!r || !r.done) return "";
  if (p.type === "match") {
    const line = r.solved ? `🔗 Match it: solved in ${r.tries} ${r.tries === 1 ? "try 🎯" : "tries"}` : `🔗 Match it: X/${CONFIG.rankMaxTries} (${r.points}/${p.people.length})`;
    return `${shareTitle()} ${line}\n${rankGrid(r)}\n${fullTitle(p)}\n${shareUrl()}`;
  }
  if (p.type === "rank") {
    const line = r.solved ? `${p.emoji || ""} solved in ${r.tries} ${r.tries === 1 ? "try 🎯" : "tries"}` : `${p.emoji || ""} X/${CONFIG.rankMaxTries}`;
    return `${shareTitle()} ${line.trim()}\n${rankGrid(r)}\n${fullTitle(p)}\n${shareUrl()}`;
  }
  const h = hitsOf(p, r), m = missesOf(p, r), avg = avgRank(p, r), rows = [];
  for (let i = 0; i < r.marks.length; i += 10) rows.push(r.marks.slice(i, i + 10).map(x => EMO[x]).join(""));
  return `${shareTitle()} 🖐️ Guess the top 5: Found ${h}/5${h >= 5 ? ` with ${plural(m, "miss")}` : ""} · avg rank #${avg}\n${rows.join("\n")}\n${fullTitle(p)}\n${shareUrl()}`;
}
async function doShare(text) {
  if (!text) return; window.__lastShare = text;
  if (navigator.share && matchMedia("(pointer:coarse)").matches) { try { await navigator.share({ text }); return; } catch (e) { if (e.name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(text); toast("Copied to clipboard!"); }
  catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Copied to clipboard!"); } catch { prompt("Copy this:", text); } ta.remove(); }
}

// ================================================================ v11: phone fit (no scrolling while playing)
// On phones (<= 560px wide) while a puzzle is being played (body.playing), the blue card is capped to the visible
// viewport (visualViewport height, so it also shrinks when the on-screen keyboard opens) and its rows flex to fit:
// cards / slots shrink instead of overflowing. Footer, share link and the hints+guesses list below the card are hidden
// until the reveal (hints stay in the card; "💡 Hints & guesses" opens them in a sheet). With the keyboard open
// (input focused + viewport much shorter than before) body.kb also hides the top bar, ad banner and subtitle.
const fitMQ = matchMedia("(max-width: 560px)");
let vvMax = 0, vvW = 0;
function syncPlaying() {
  const on = !$("#playView").classList.contains("hidden") && $("#result").classList.contains("hidden");
  document.body.classList.toggle("playing", on); fitLayout();
}
function fitLayout() {
  const vv = window.visualViewport, h = vv ? vv.height : innerHeight, b = document.body, hero = $("#hero");
  if (innerWidth !== vvW) { vvW = innerWidth; vvMax = 0; } vvMax = Math.max(vvMax, h);
  const fit = fitMQ.matches && b.classList.contains("playing");
  b.classList.toggle("kb", fit && document.activeElement === $("#guessInput") && h < vvMax - 120);
  b.classList.toggle("fit", fit);
  if (!fit) { hero.style.maxHeight = ""; hero.style.height = ""; return; }
  const top = hero.getBoundingClientRect().top + scrollY - (vv ? vv.offsetTop : 0), avail = Math.max(260, Math.floor(h - top - 8));
  // natural height first (rows at their max size); only if that doesn't fit, pin the card to the available height so rows shrink
  hero.style.height = ""; hero.style.maxHeight = "none"; const natural = hero.scrollHeight;
  hero.style.maxHeight = avail + "px"; hero.style.height = natural > avail ? avail + "px" : "";
  if (b.classList.contains("kb") && scrollY > 0 && !(vv && vv.offsetTop)) window.scrollTo(0, 0);
}
window.visualViewport?.addEventListener("resize", fitLayout); addEventListener("resize", fitLayout);
fitMQ.addEventListener?.("change", fitLayout);
function extraSheet() {
  openModal(`<h2>Hints &amp; guesses</h2><div class="hints">${$("#hints").innerHTML}</div><ol class="guesses">${$("#guesses").innerHTML}</ol>`);
  $("#modal").classList.add("sheet");
}
window.RankdFit = { sync: syncPlaying, layout: fitLayout };

// ================================================================ views / navigation
function showView(v) {
  if (v !== "play") showFab(false);
  $("#playView").classList.toggle("hidden", v !== "play"); $("#archiveView").classList.toggle("hidden", v !== "archive");
  const tab = v === "archive" ? "archive" : state.mode === "all" ? "all" : state.mode === "practice" ? "practice" : state.mode === "archive" ? "archive" : "today";
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.view === tab));
  syncPlaying();
}
function goToday() { state.mode = "daily"; state.dateKey = todayKey(); openPuzzle(puzzleForDay(dayNumber(state.dateKey))); }
function goDate(key) {
  const today = todayKey();
  if (!validKey(key) || dayNumber(key) < 0) { toast("That puzzle doesn't exist"); return goToday(); }
  if (utc(key) > utc(today)) { toast("That puzzle isn't out yet 👀"); return goToday(); }   // never expose future dailies
  if (key === today) return goToday();
  state.mode = "archive"; state.dateKey = key; openPuzzle(puzzleForDay(dayNumber(key)));
}
function goAll(idx) {   // v11: the pre-launch "All puzzles" browser (was "Practice" before v11)
  if (!CONFIG.SHOW_ALL_PUZZLES) return goToday();
  state.mode = "all";
  if (idx == null) idx = (dayNumber(todayKey()) + 1) % PUZZLES.length;
  state.practiceIdx = ((idx % PUZZLES.length) + PUZZLES.length) % PUZZLES.length; openPuzzle(PUZZLES[state.practiceIdx]);
}
function goPreview(key) {   // v12 Studio preview of any scheduled day, past or future (sandboxed storage)
  if (!validKey(key) || dayNumber(key) < 0) { toast("That day isn't scheduled"); return goToday(); }
  state.mode = "preview"; state.dateKey = key; openPuzzle(puzzleForDay(dayNumber(key)));
}
function goArchive() {
  state.view = "archive"; showView("archive"); setHash("#archive");
  const today = todayKey(), last = dayNumber(today), all = load(LS.results, {});
  const rows = [];
  for (let n = last; n >= 0; n--) {          // only today and earlier; future dailies are never listed
    const key = keyFromDay(n), p = puzzleForDay(n), r = all[`d:${key}`], mine = r && r.id === p.id ? r : null;
    let badge = `<span class="ar">Play →</span>`;
    const mr = mine && mine.type === "rank" ? normRank(mine) : null;
    if (mr && mr.done) badge = mr.solved ? `<span class="ar done">✓ in ${mr.tries}</span>` : `<span class="ar lost">✗ X/${CONFIG.rankMaxTries}</span>`;
    else if (mine && mine.type === "rank") badge = `<span class="ar">In progress</span>`;
    else if (mine && mine.type === "match") badge = mine.done ? (mine.solved ? `<span class="ar done">✓ in ${mine.tries}</span>` : `<span class="ar lost">✗ X/${CONFIG.rankMaxTries}</span>`) : `<span class="ar">In progress</span>`;
    else if (mine && mine.done) badge = mine.type === "rank" ? ""
      : `<span class="ar ${mine.won ? "done" : ""}">🖐️ ${mine.hits || 0}/5</span>`;
    else if (mine) badge = `<span class="ar">In progress</span>`;
    rows.push(`<li><button class="arch ${n === last ? "today" : ""}" data-key="${key}"><span class="an">#${pad3(n + 1)}<small>${n === last ? "Today" : prettyDate(key).replace(/, \d{4}$/, "")}</small></span>
      <span class="aq"><span class="ah">${esc(p.emoji)} ${esc(p.headline || p.question)}</span>${p.headline && p.headline !== p.question ? `<span class="asub">${esc(p.question)}</span>` : ""}<small>${p.type === "top5" ? "Guess the top 5" : p.type === "match" ? "Match it" : "Rank it"}</small></span>${badge}</button></li>`);
  }
  $("#archiveList").innerHTML = rows.join("");
  $$(".arch").forEach(b => b.onclick = () => goDate(b.dataset.key));
  window.scrollTo({ top: 0 });
}
// v8 floating "next" button (bottom-right), shown only once the puzzle is finished
const isDone = r => !!r && (r.type === "rank" ? !!(normRank(r) || {}).done : !!r.done);
function nextUnplayedPractice() {
  const all = load(LS.results, {});
  for (let k = 1; k <= PUZZLES.length; k++) { const i = (state.practiceIdx + k) % PUZZLES.length; if (!isDone(all["p:" + PUZZLES[i].id])) return i; }
  return (state.practiceIdx + 1) % PUZZLES.length;
}
function nextUnplayedDay() {   // most recent unplayed past daily (never today or the future), or null
  const all = load(LS.results, {}), last = dayNumber(todayKey());
  for (let n = last - 1; n >= 0; n--) { const key = keyFromDay(n), r = all["d:" + key]; if (key !== state.dateKey && !(r && r.id === puzzleForDay(n).id && isDone(r))) return key; }
  return null;
}
function fabGo() {
  if (state.mode === "preview") { location.href = "studio.html"; return; }
  if (state.mode === "practice") return goPractice();
  if (state.mode === "all") return goAll(nextUnplayedPractice());
  const k = nextUnplayedDay(); k ? goDate(k) : goArchive();
}
function showFab(on) {
  const f = $("#fab"); f.textContent = state.mode === "preview" ? "Back to Studio →" : state.mode === "daily" ? "Play the archive →" : state.mode === "practice" ? "🎲 New random puzzle →" : "Next puzzle →";
  f.classList.toggle("hidden", !on); document.body.classList.toggle("has-fab", on);
}
function next() { if (state.mode === "preview") { location.href = "studio.html"; return; } if (state.mode === "all") goAll(state.practiceIdx + 1); else if (state.mode === "archive") goArchive(); else goPractice(); }

// ================================================================ modals
function openModal(html) { $("#modalBody").innerHTML = html; $("#modal").classList.remove("hidden", "sheet"); }
function closeModal() { $("#modal").classList.add("hidden"); }
function statsModal() {
  const s = load(LS.stats, { played: 0, wins: 0, best: 0, dist: {} });
  const dist = Object.entries(s.dist || {}).sort().map(([k, v]) => `<div class="crow"><span class="cn">${esc(k)}</span><span class="cb"><i style="width:${v / Math.max(1, s.played) * 100}%"></i></span><span class="cp">${v}</span></div>`).join("") || "<p style='color:var(--muted)'>Play today's puzzle to start your stats.</p>";
  openModal(`<h2>Your stats</h2><div class="stat-grid"><div><b>${s.played}</b><span>Played</span></div><div><b>${s.wins}</b><span>Perfect / solved</span></div><div><b>${currentStreak()}</b><span>Streak</span></div><div><b>${s.best || 0}</b><span>Best</span></div></div>
    <h3>Daily results</h3>${dist}<p style="font-size:12px;color:var(--muted)">Only today's daily counts. Stats live in this browser (localStorage).</p>`);
}
const themeLabel = () => effectiveTheme() === "dark" ? "☀️ Light mode<small>Switch the theme</small>" : "🌙 Dark mode<small>Switch the theme</small>";
function menuModal() {   // v11: the single gear opens this sheet (stats + theme moved here from the old corner buttons)
  openModal(`<h2>Menu</h2><div class="menu-list">
    <button id="mStats">📊 Your stats<small>Streak and daily results</small></button>
    <button id="mTheme">${themeLabel()}</button>
    ${state.puzzle && !$("#playView").classList.contains("hidden") ? `<button id="mShare">↗ ${isToday() ? "Share today's puzzle" : "Share this puzzle"}<small>Spoiler-free link</small></button>` : ""}
    <button id="mArchive">🗓 Archive<small>Every past daily puzzle</small></button>
    ${Practice.ok() ? `<button id="mPractice">🎲 Practice<small>A new random puzzle from the full datasets</small></button>` : ""}
    ${CONFIG.SHOW_ALL_PUZZLES ? `<button id="mList">🗂 All puzzles (pre-launch)<small>Every puzzle, past and future, by mode</small></button>` : ""}
    <button id="mSettings">⚙️ Settings<small>Theme, show values, load your spreadsheet</small></button>
    <button id="mHow">❓ How to play</button>
    <button id="mAbout">📚 About &amp; sources</button></div>`);
  $("#mStats").onclick = statsModal; $("#mTheme").onclick = () => { settings.theme = effectiveTheme() === "dark" ? "light" : "dark"; saveSettings(); applyTheme(); };
  $("#modal").classList.add("sheet");
  if ($("#mShare")) $("#mShare").onclick = () => { closeModal(); doShare(challengeText()); };
  $("#mArchive").onclick = () => { closeModal(); goArchive(); }; if ($("#mList")) $("#mList").onclick = listModal; if ($("#mPractice")) $("#mPractice").onclick = () => { closeModal(); goPractice(); }; $("#mSettings").onclick = settingsModal; $("#mHow").onclick = howModal; $("#mAbout").onclick = aboutModal;
}
function settingsModal() {
  const seg = (name, opts, cur) => `<div class="seg" data-set="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${cur === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
  openModal(`<h2>Settings</h2>
    <h3>Theme</h3>${seg("theme", [["system", "System"], ["light", "Light"], ["dark", "Dark"]], settings.theme)}
    <h3>Show values while guessing (Rank it)</h3>${seg("showValues", [["auto", "Puzzle default"], ["on", "Always"], ["off", "Never"]], settings.showValues)}
    <p style="font-size:12px;color:var(--muted);margin:6px 2px 0">With values on, the real numbers are listed together in a column beside the cards and you match each item to its value.</p>
    <h3>Streamer mode</h3>${seg("stream", [["off", "Off"], ["on", "On (hide ads)"]], streamerOn() ? "on" : "off")}
    <p style="font-size:12px;color:var(--muted);margin:6px 2px 0">Hides all ad slots and interstitials while you stream or record. Your browser can't tell when OBS is capturing, so switch it on yourself (or open the game with ?stream=1).</p>
    <h3>Puzzles</h3><div class="menu-list">
    <button id="mLoad">📄 Load spreadsheet<small>Your edited puzzles.xlsx, or one or more of the CSV sheets</small></button>
    <button id="mTemplate">⬇️ Download current puzzles as CSV<small>puzzles.csv for Rank it (Guess the top 5 sheets: see puzzles.xlsx)</small></button>
    ${custom ? `<button id="mReset">↩️ Back to built-in puzzles<small>Using: ${esc(custom.name)} (${custom.puzzles.length} puzzles)</small></button>` : ""}</div>
    <h3>Your data</h3><button class="danger-btn" id="mClear">🗑️ Clear all data…<small>Stats, streaks, progress, practice history and settings on this device</small></button>`);
  $$(".seg").forEach(sg => sg.querySelectorAll("button").forEach(b => b.onclick = () => {
    settings[sg.dataset.set] = b.dataset.v; saveSettings(); sg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    if (sg.dataset.set === "theme") applyTheme(); else if (sg.dataset.set === "stream") applyStreamer(); else if (state.puzzle?.type === "rank" && !$("#playView").classList.contains("hidden")) renderRank(getResult(), true);
  }));
  $("#mLoad").onclick = () => $("#fileInput").click(); $("#mTemplate").onclick = downloadCsv;
  $("#mClear").onclick = clearDataModal;
  if ($("#mReset")) $("#mReset").onclick = () => { localStorage.removeItem(LS.custom); custom = null; PUZZLES = window.RANKD_PUZZLES; closeModal(); toast("Built-in puzzles restored"); goToday(); };
}
function clearDataModal() {   // v11.1: confirm step for "Clear all data"
  openModal(`<div id="clearConfirm" role="alertdialog" aria-labelledby="clearTitle" aria-describedby="clearDesc"><h2 id="clearTitle">Clear all data?</h2>
    <p id="clearDesc">This will erase your <b>stats, streaks, puzzle progress, practice history and settings</b> on this device. It can't be undone.</p>
    <div class="confirm-row"><button class="pill-btn outline" id="clearCancel">Cancel</button><button class="pill-btn danger" id="clearConfirmBtn">Clear</button></div></div>`);
  $("#clearCancel").onclick = settingsModal; $("#clearCancel").focus();
  $("#clearConfirmBtn").onclick = () => { RankdData.clear(); location.replace(location.pathname); };   // drop ?stream= / #hash so nothing is re-written
}
function listModal() {   // v11: pre-launch browser of EVERY puzzle (past + future), filterable by mode; hidden when CONFIG.SHOW_ALL_PUZZLES = false
  if (!CONFIG.SHOW_ALL_PUZZLES) return;
  const all = load(LS.results, {}), today = dayNumber(todayKey()) + 1;
  const kind = p => p.type === "top5" ? "top5" : p.type === "match" ? "match" : p.items.length === 6 ? "rank6" : (p.items.length && p.items.every(it => /^\p{RI}\p{RI}$/u.test(it.emoji)) ? "rank" : "incountry");
  const KINDS = [["any", "All"], ["rank", "Rank it"], ["rank6", "6-country"], ["top5", "Top 5"], ["match", "Match it"], ["incountry", "Groups"]];
  const count = k => PUZZLES.filter(p => k === "any" || kind(p) === k).length;
  openModal(`<h2>All puzzles (${PUZZLES.length})</h2><p class="plist-note">Pre-launch list: every puzzle, past and future. Plays here never count toward stats or streaks.</p>
    <div class="seg plist-filter">${KINDS.map(([k, l]) => `<button data-k="${k}" class="${k === "any" ? "on" : ""}">${l} <small>${count(k)}</small></button>`).join("")}</div>
    <input class="plist-search" id="plistSearch" type="search" placeholder="Search headline or stat…" autocomplete="off">
    <div class="plist">${PUZZLES.map((p, i) => { const r = all["p:" + p.id];
    const rr = r && r.type === "rank" ? normRank(r) : r, o = Math.round(p.order);
    const b = rr && rr.done ? (rr.type === "rank" || rr.type === "match" ? (rr.solved ? `✓ ${rr.tries}` : "✗") : `🖐️ ${rr.hits || 0}/5`) : "";
    const when = o < 10000 ? `#${pad3(o)} · ${prettyDate(keyFromDay(o - 1)).replace(/, \d{4}$/, "")}${o > today ? " · future" : o === today ? " · today" : ""}` : "";
    const k = kind(p), kl = { rank: "Rank it", rank6: "Rank it · 6 countries", top5: "Guess the top 5", match: `Match it · ${(p.people || []).length} pairs`, incountry: "Rank it · groups" }[k];
    return `<button data-i="${i}" data-k="${k}" data-s="${esc((p.headline + " " + p.question + " " + p.stat).toLowerCase())}"><span class="pl-main"><b>${esc(p.emoji)} ${esc(p.headline || p.question)}</b>${p.headline && p.headline !== p.question ? `<span class="pl-sub">${esc(p.question)}</span>` : ""}<small class="pl-meta">${kl}${when ? " · " + when : ""}</small></span><span class="done">${b}</span></button>`; }).join("")}</div>`);
  let kf = "any";
  const apply = () => { const q = $("#plistSearch").value.trim().toLowerCase();
    $$(".plist button").forEach(b => b.classList.toggle("hidden", !((kf === "any" || b.dataset.k === kf) && (!q || b.dataset.s.includes(q))))); };
  $$(".plist-filter button").forEach(b => b.onclick = () => { kf = b.dataset.k; $$(".plist-filter button").forEach(x => x.classList.toggle("on", x === b)); apply(); });
  $("#plistSearch").oninput = apply;
  $$(".plist button").forEach(b => b.onclick = () => { closeModal(); goAll(+b.dataset.i); });
}
function howModal() {
  openModal(`<h2>How to play</h2>
   <p><b>Rank it:</b> drag the cards (or tap ▲▼) into order and lock it in. Cards in the right spot turn 🟩 green and lock; the rest turn 🟥 red. Rearrange and lock in again. You get ${CONFIG.rankMaxTries} tries. Turn on <i>Show values</i> to see the real numbers listed together above the cards; match each item to its value.</p>
   <p><b>🖐️ Guess the top 5:</b> name as many of the top 5 countries as you can. Correct guesses are free; you can miss 10 times. Type a country, pick it from the list, then press <i>Guess</i> (or Enter). Each guess shows its real world rank and value: ✅ a hit, ⬜ a miss.</p>
   <p><b>🔗 Match it:</b> match each clue (6 or 7 of them) to the right person. Drag a clue onto a person, or tap a clue and then the person. When all are placed, lock it in: right pairs turn 🟩 green and lock, wrong ones turn 🟥 red. Fix them and try again, ${CONFIG.rankMaxTries} tries in all.</p>
   <p>Score: how many of the 5 you find (X/5), plus <i>avg rank</i>, the average world rank of all your guesses (lower = closer). After misses ${HINT_AT.join(", ")} you get a hint: one fact about one top-5 country you haven't found yet (the highest-ranked one), getting more specific each time: continent, then population, then GDP per person, then its capital, then its first letter.</p>
   <p>🎉 Solve a Rank it or Match it on the 1st or 2nd try (or find all 5 with at most 2 misses) for a celebration. First try = the big one.</p>
   <p>A new daily puzzle drops at local midnight. Missed one? It's in the Archive. Every number links to its source.</p>`);
}
function aboutModal() {
  openModal(`<h2>About &amp; sources</h2><p style="color:var(--muted);font-size:14px">Rankd is a prototype. Every value and hint comes from the source linked below.</p>
    <ol class="src-list">${PUZZLES.map(p => `<li>${esc(p.emoji)} ${esc(fullTitle(p))}<br>${p.sourceUrl ? `<a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">${esc(p.source || p.sourceUrl)}</a>` : esc(p.source)}${
      p.type === "top5" ? `<br><small>Hints: World Bank (population SP.POP.TOTL; GDP per capita NY.GDP.PCAP.CD, current US$; capital cities), 6-continent grouping, standard landlocked list</small>` : ""}</li>`).join("")}</ol>`);
}
function downloadCsv() {
  const cols = SHEET_COLS.puzzles, q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v), lines = [cols.join(",")];
  PUZZLES.filter(p => p.type === "rank").forEach(p => p.items.forEach((it, n) => lines.push([p.id, n ? "" : p.order, n ? "" : p.emoji, n ? "" : p.question, n ? "" : p.stat, n ? "" : p.unit,
    n ? "" : p.higherIs, n ? "" : (p.valuesVisible ? "yes" : "no"), it.name, it.emoji, it.value, it.year, n ? "" : p.source, n ? "" : p.sourceUrl, n ? "" : p.fact, it.gRank || "", it.gTotal || "", it.gScope || "", n ? "" : (p.art || ""), n ? "" : (p.support || ""), n ? "" : (p.dataset || ""), "", n ? "" : (p.headline || "")].map(q).join(","))));
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" })); a.download = "rankd-puzzles.csv"; a.click();
}

// ================================================================ spreadsheet upload (xlsx or CSVs)
async function handleFiles(files) {
  if (!window.XLSX) { toast("Spreadsheet reader failed to load"); return; }
  try {
    const tables = {}; let name = [];
    for (const file of files) {
      name.push(file.name);
      const isCsv = /\.csv$/i.test(file.name);
      const wb = isCsv ? XLSX.read(await file.text(), { type: "string" }) : XLSX.read(await file.arrayBuffer(), { type: "array" });
      for (const sn of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: "" }); if (!rows.length) continue;
        const known = Object.keys(SHEET_COLS).find(k => k === sn.trim().toLowerCase()) || sheetTypeOf(Object.keys(rows[0]));
        if (known) tables[known] = (tables[known] || []).concat(rows);
      }
    }
    const puzzles = parseTables(tables);
    if (!puzzles.length) { toast("No valid puzzles found. Check the sheet names / column headers."); return; }
    custom = { name: name.join(", "), puzzles, loadedAt: Date.now() }; save(LS.custom, custom); PUZZLES = puzzles;
    const t5 = puzzles.filter(p => p.type === "top5").length, conv = puzzles.filter(p => p.convertedFrom === "top5").length;
    closeModal(); const nm = puzzles.filter(p => p.type === "match").length; toast(`Loaded ${puzzles.length} puzzles (${puzzles.length - t5 - nm} rank, ${t5} top 5${nm ? `, ${nm} match` : ""})${conv ? ` · ${conv} Top 5 → Rank it (fewer than ${MIN_TOP5_COUNTRIES} countries)` : ""}`); CONFIG.SHOW_ALL_PUZZLES ? goAll(0) : goToday();
  } catch (e) { console.error(e); toast("Couldn't read that file: " + e.message); }
}
window.RankdLoadFiles = handleFiles; window.RankdArt = { svg: artSvg, keys: Object.keys(ART) };

// ================================================================ wire up
$("#submitBtn").onclick = submitRank; $("#matchSubmit").onclick = submitMatch; $("#nextBtn").onclick = next; $("#fab").onclick = fabGo;
$("#shareResultBtn").onclick = () => doShare(resultText());
$("#shareChallengeBtn").onclick = $("#shareChallengeTop").onclick = () => doShare(challengeText());
$("#valuesChip").onclick = () => { settings.showValues = valuesOn(state.puzzle) ? "off" : "on"; saveSettings(); renderRank(getResult(), true); };
$("#menuBtn").onclick = menuModal;
$("#guessInput").addEventListener("focus", () => { setTimeout(fitLayout, 60); setTimeout(fitLayout, 350); });
$("#guessInput").addEventListener("blur", () => setTimeout(fitLayout, 60)); $("#modalClose").onclick = closeModal;
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
$("#aboutLink").onclick = e => { e.preventDefault(); aboutModal(); };
$("#homeLink").onclick = e => { e.preventDefault(); goToday(); };
$("#fileInput").onchange = e => { const f = [...e.target.files]; if (f.length) handleFiles(f); e.target.value = ""; };
$$(".tab").forEach(b => b.onclick = () => b.dataset.view === "today" ? goToday() : b.dataset.view === "archive" ? goArchive() : b.dataset.view === "all" ? goAll() : goPractice());
$("#newRandomTop").onclick = () => goPractice();
if (!CONFIG.SHOW_ALL_PUZZLES) { $$('.tab[data-view="all"]').forEach(b => b.remove()); }
if (!Practice.ok()) { $$('.tab[data-view="practice"]').forEach(b => b.remove()); }
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
// guess input
const gi = $("#guessInput");
gi.addEventListener("input", updateSuggest);
gi.addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!sugg.length) return; e.preventDefault(); sIdx = (sIdx + (e.key === "ArrowDown" ? 1 : -1) + sugg.length) % sugg.length;
    $$("#suggest li").forEach((li, i) => li.classList.toggle("active", i === sIdx)); }
  else if (e.key === "Escape") closeSuggest();
});
gi.addEventListener("blur", () => setTimeout(closeSuggest, 150));
$("#suggest").addEventListener("mousedown", e => { const li = e.target.closest("li[data-i]"); if (li) { e.preventDefault(); fillGuess(sugg[+li.dataset.i]); } });   // fill only, never submit
$("#guessForm").onsubmit = e => { e.preventDefault(); onGuessSubmit(); };

applyTheme(); applyStreamer();
if (!PUZZLES.length) { $("#headline").textContent = "No puzzles found. Run build.py or load a spreadsheet."; return; }
function route() {
  if (/^\d{4}-\d{2}-\d{2}$/.test(PREVIEW)) return goPreview(PREVIEW);
  const h = location.hash, d = h.match(/d=(\d{4}-\d{2}-\d{2})/), p = h.match(/p=([^&]+)/), rs = h.match(/r=(\d+)/);
  if (h.startsWith("#archive")) return goArchive();
  if (d) return goDate(d[1]);
  if (rs && Practice.ok()) return goPractice(+rs[1]);
  if (p && CONFIG.SHOW_ALL_PUZZLES) { const i = PUZZLES.findIndex(x => x.id === decodeURIComponent(p[1])); if (i >= 0) return goAll(i); }
  goToday();
}
window.addEventListener("hashchange", () => { if (!PREVIEW && (location.hash !== linkHash() || $("#playView").classList.contains("hidden"))) route(); });
route();
})();
