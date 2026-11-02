#!/usr/bin/env node
/* Backfill RANKD_PRACTICE so every curated puzzle stat key resolves to a pool
   dataset. Values, sources, years and unit labels come from the puzzles and
   from country_lists.csv. Nothing is fetched and no figure is invented.
   Partial lists (only the countries a puzzle actually names) get coverage:"partial".
   Usage: node tools/backfill_pool.js [--write] */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const write = process.argv.includes("--write");

function loadJs(file, pick) {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), box, { filename: file });
  return pick(box.window);
}

const practice = loadJs("practice-data.js", w => w.RANKD_PRACTICE);
const puzzles = loadJs("puzzles-data.js", w => w.RANKD_PUZZLES);
const namePuzzles = loadJs("name-puzzles.js", w => w.RANKD_NAME_PUZZLES || []);
const part1Puzzles = loadJs("part1-puzzles.js", w => w.RANKD_PART1 || []);
const before = practice.datasets.length;

const byName = new Map();
function remember(name, iso) {
  const k = normName(name);
  if (k && iso && !byName.has(k)) byName.set(k, iso);
}
function normName(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}
for (const [iso, row] of Object.entries(practice.countries)) remember(row[0], iso);
const aliases = {
  "united states of america": "USA", "usa": "USA", "us": "USA", "u s": "USA",
  "uk": "GBR", "u k": "GBR", "britain": "GBR", "great britain": "GBR",
  "russia": "RUS", "russian federation": "RUS",
  "south korea": "KOR", "republic of korea": "KOR", "korea": "KOR",
  "north korea": "PRK",
  "czech republic": "CZE", "czechia": "CZE",
  "dr congo": "COD", "drc": "COD", "democratic republic of the congo": "COD", "congo kinshasa": "COD",
  "congo": "COG", "republic of the congo": "COG",
  "east timor": "TLS", "timor leste": "TLS",
  "cape verde": "CPV", "cabo verde": "CPV",
  "ivory coast": "CIV", "cote d ivoire": "CIV",
  "palestine": "PSE", "west bank and gaza": "PSE",
  "taiwan": "TWN", "hong kong": "HKG", "macao": "MAC", "macau": "MAC",
  "vietnam": "VNM", "viet nam": "VNM",
  "laos": "LAO", "syria": "SYR", "iran": "IRN", "bolivia": "BOL", "tanzania": "TZA",
  "moldova": "MDA", "venezuela": "VEN", "brunei": "BRN",
  "eswatini": "SWZ", "swaziland": "SWZ",
  "turkey": "TUR", "turkiye": "TUR",
  "myanmar": "MMR", "burma": "MMR",
};
for (const [name, iso] of Object.entries(aliases)) {
  if (practice.countries[iso]) remember(name, iso);
}
function isoOf(name) {
  const k = normName(name);
  if (byName.has(k)) return byName.get(k);
  return null;
}

function normStat(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").replace(/\s+/g, " ").trim();
}
function normUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  try {
    const x = new URL(s);
    return (x.origin + x.pathname.replace(/\/+$/, "")).toLowerCase();
  } catch (e) {
    return s.toLowerCase();
  }
}
function urlsCompatible(a, b) {
  if (!a || !b) return true;
  if (a === b) return true;
  return a.startsWith(b + "/") || b.startsWith(a + "/");
}
function sameNum(a, b) {
  const x = Number(a), y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
}
function decimalsOf(values) {
  let d = 0;
  for (const v of values) {
    const s = String(v);
    const i = s.indexOf(".");
    if (i >= 0) d = Math.max(d, s.length - i - 1);
  }
  return d;
}
// Same figure at the coarser precision already stored on one of the puzzles.
// Half a step of that precision covers 58.55 vs 58.5 and 1505.25 vs 1505.3.
function closeEnough(a, b) {
  const x = Number(a), y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x === y) return true;
  const step = 10 ** (-Math.min(decimalsOf([a]), decimalsOf([b])));
  return Math.abs(x - y) <= step / 2 + 1e-9;
}
function preferValue(a, b) {
  return decimalsOf([b]) > decimalsOf([a]) ? Number(b) : Number(a);
}
function unitsCompatible(a, b) {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  if (!x || !y) return true;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  const per = s => /100k|per capita|per 100/.test(s);
  if (per(x) && per(y)) return true;
  return false;
}
function yearsCompatible(a, b) {
  const x = String(a || "").trim();
  const y = String(b || "").trim();
  if (!x || !y) return true;
  if (x === y) return true;
  const nums = s => new Set((s.match(/(?:19|20)\d{2}/g) || []));
  const A = nums(x), B = nums(y);
  if (!A.size || !B.size) return x === y;
  for (const n of A) if (B.has(n)) return true;
  return false;
}
function hiNetText(s) {
  return /google trends|high internet|search interest/i.test(String(s || ""));
}
function noteOf(fact) {
  const m = String(fact || "").match(/Note:\s*([\s\S]+)$/);
  return m ? m[1].trim() : "";
}

function entriesOf(p) {
  if (p.type === "match") return [];
  if (p.type === "name" && p.values) {
    return Object.entries(p.values).map(([iso, value]) => ({
      iso, name: (practice.countries[iso] || [])[0] || iso, value: Number(value), year: String(p.year || ""),
    })).filter(e => practice.countries[e.iso] && Number.isFinite(e.value));
  }
  if (p.type === "top1") {
    return (p.countries || []).map(c => ({
      iso: c.iso3 || isoOf(c.name), name: c.name, emoji: c.emoji, value: Number(c.value),
      year: c.year != null ? String(c.year) : "",
    }));
  }
  return (p.items || []).map(it => ({
    iso: isoOf(it.name), name: it.name, emoji: it.emoji, value: Number(it.value),
    year: it.year != null ? String(it.year) : "",
    gRank: it.gRank || 0, gTotal: it.gTotal || 0, gScope: it.gScope || "",
  }));
}

function statKey(p) { return p.dataset || p.id; }

const poolById = new Map(practice.datasets.map(d => [d.id, d]));
function poolValue(ds, iso) {
  if (!ds || ds.kind === "groups" || ds.kind === "match") return undefined;
  const row = (ds.rows || []).find(r => r[0] === iso);
  return row ? row[1] : undefined;
}
function pushRow(ds, e) {
  const sample = ds.rows[0] || [];
  if (sample.length > 2) ds.rows.push([e.iso, Number(e.value), e.year || String(ds.year || "")]);
  else ds.rows.push([e.iso, Number(e.value)]);
}

const reports = [];
const aliased = new Map(); // key -> dataset id
const conflicts = [];

function tryAliasExisting(p) {
  const key = statKey(p);
  if (poolById.has(key)) return poolById.get(key);
  if (aliased.has(key)) return poolById.get(aliased.get(key));
  const entries = entriesOf(p).filter(e => e.iso && Number.isFinite(e.value));
  if (!entries.length || entries.length !== (p.type === "name" ? Object.keys(p.values || {}).length : (p.items || p.countries || []).length)) {
    // A name puzzle may drop isos missing from the catalog. Still allow alias
    // when every kept country matches and we kept most of the map.
    if (p.type !== "name") return null;
  }
  const usable = entries.filter(e => e.iso);
  if (usable.length < 3) return null;
  let best = null;
  for (const ds of practice.datasets) {
    if (ds.kind === "groups" || ds.kind === "match" || ds.kind === "tier") continue;
    if (!unitsCompatible(p.unit, ds.unit) && !urlsCompatible(normUrl(p.sourceUrl), normUrl(ds.url))) continue;
    if (!yearsCompatible(p.year || "", ds.year || "")) continue;
    let ok = 0;
    let bad = 0;
    let missing = 0;
    for (const e of usable) {
      const v = poolValue(ds, e.iso);
      if (v == null) { missing++; continue; }
      if (closeEnough(e.value, v)) ok++;
      else bad++;
    }
    if (bad || missing > 3) continue;
    if (ok < Math.ceil(usable.length * 0.8)) continue;
    if (ok < 3 && ok < usable.length) continue;
    if (!best || ds.rows.length > best.rows.length) best = ds;
  }
  return best;
}

// country_lists.csv full lists (the same stat file the top-* pool rows came from).
const lists = new Map();
{
  const text = fs.readFileSync(path.join(root, "country_lists.csv"), "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  // quoted CSV: use a tiny parser
  function parse(line) {
    const out = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else q = false;
        } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }
  const cols = parse(lines[0]);
  for (const line of lines.slice(1)) {
    const c = parse(line);
    const rec = Object.fromEntries(cols.map((k, i) => [k, c[i] || ""]));
    if (!lists.has(rec.puzzle_id)) lists.set(rec.puzzle_id, []);
    lists.get(rec.puzzle_id).push(rec);
  }
}

const curated = puzzles.concat(namePuzzles, part1Puzzles);
// A curated country that an existing pool dataset never listed. Keep the puzzle's value.
for (const p of curated) {
  const ds = poolById.get(statKey(p));
  if (!ds || ds.kind === "groups" || ds.kind === "match") continue;
  for (const e of entriesOf(p)) {
    if (!e.iso || !Number.isFinite(e.value) || poolValue(ds, e.iso) != null) continue;
    pushRow(ds, e);
    reports.push(`add ${e.iso}=${e.value} to ${ds.id} from ${p.id}`);
  }
}
const pending = [];
for (const p of curated) {
  const key = statKey(p);
  if (poolById.has(key)) continue;
  const hit = tryAliasExisting(p);
  if (hit) {
    if (!hit.aliases) hit.aliases = [];
    if (!hit.aliases.includes(key) && hit.id !== key) hit.aliases.push(key);
    aliased.set(key, hit.id);
    if (hiNetText(p.stat) || hiNetText(p.source) || hiNetText(p.id) || hiNetText(key)) hit.hiNet = 1;
    for (const e of entriesOf(p)) {
      if (!e.iso || !Number.isFinite(e.value)) continue;
      if (poolValue(hit, e.iso) == null) {
        pushRow(hit, e);
        reports.push(`add ${e.iso}=${e.value} to ${hit.id} from ${p.id}`);
      }
    }
    reports.push(`alias ${key} -> ${hit.id}`);
    continue;
  }
  pending.push(p);
}

function puzzleYear(p, entries) {
  const y = String(p.year || "").trim();
  if (y) return y;
  const ys = [...new Set(entries.map(e => e.year).filter(Boolean))];
  if (ys.length === 1) return ys[0];
  return "";
}

// Clusters of puzzles that still need a dataset.
let clusters = pending.map(p => ({ puzzles: [p], keys: [statKey(p)] }));

function clusterStat(c) {
  const stats = c.puzzles.map(p => normStat(p.stat)).filter(Boolean).sort((a, b) => b.length - a.length);
  return stats[0] || "";
}
function clusterYear(c) {
  const ys = c.puzzles.map(p => String(p.year || "").trim()).filter(Boolean);
  return ys.sort((a, b) => b.length - a.length)[0] || "";
}
function clusterUnit(c) {
  const us = c.puzzles.map(p => String(p.unit || "").trim()).filter(Boolean);
  return us.sort((a, b) => b.length - a.length)[0] || "";
}
function clusterUrl(c) {
  const us = c.puzzles.map(p => normUrl(p.sourceUrl)).filter(Boolean);
  return us[0] || "";
}
function canExactMerge(a, b) {
  const sa = clusterStat(a), sb = clusterStat(b);
  if (!sa || sa !== sb) return false;
  if (!yearsCompatible(clusterYear(a), clusterYear(b))) return false;
  if (!unitsCompatible(clusterUnit(a), clusterUnit(b))) return false;
  const ua = clusterUrl(a), ub = clusterUrl(b);
  if (!urlsCompatible(ua, ub)) return false;
  const ha = a.puzzles.some(p => p.higherIs === "bottom");
  const hb = b.puzzles.some(p => p.higherIs === "bottom");
  const haTop = a.puzzles.some(p => p.higherIs && p.higherIs !== "bottom");
  const hbTop = b.puzzles.some(p => p.higherIs && p.higherIs !== "bottom");
  if ((ha && hbTop) || (hb && haTop)) return false;
  return true;
}

function mergePass(pred) {
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (!pred(clusters[i], clusters[j])) continue;
        clusters[i].puzzles.push(...clusters[j].puzzles);
        clusters[i].keys.push(...clusters[j].keys);
        clusters.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
}
mergePass(canExactMerge);

function countryMap(c) {
  const map = new Map();
  let groups = false;
  for (const p of c.puzzles) {
    if (p.type === "match") { groups = true; continue; }
    const entries = p.type === "name" ? entriesOf(p) : entriesOf(p);
    const rawN = p.type === "name" ? Object.keys(p.values || {}).length : (p.items || p.countries || []).length;
    if (p.type !== "name" && entries.some(e => !e.iso)) groups = true;
    if (p.type !== "name" && entries.filter(e => e.iso).length !== rawN) groups = true;
    for (const e of entries) {
      if (!Number.isFinite(e.value)) continue;
      const id = groups || !e.iso ? "name:" + e.name : e.iso;
      const prev = map.get(id);
      if (prev && !sameNum(prev.value, e.value)) {
        if (closeEnough(prev.value, e.value)) prev.value = preferValue(prev.value, e.value);
        else {
          conflicts.push(`${c.keys.join(",")} ${e.name || e.iso}: ${prev.value} vs ${e.value}`);
          continue;
        }
      }
      if (!prev) map.set(id, e);
    }
  }
  return { map, groups };
}

function isFullSource(p) {
  if (p.type === "top1" && (p.countries || []).length >= 15) return true;
  if (p.type === "name" && Object.keys(p.values || {}).length >= 15) return true;
  return false;
}

// Subset-merge a small country cluster into a larger one when every country
// value already sits in the larger cluster. Different slices (no containment)
// stay separate.
function contained(small, big) {
  if (!canShareSlice(small, big)) return false;
  const A = countryMap(small), B = countryMap(big);
  if (A.groups || B.groups) return false;
  if (!A.map.size || A.map.size >= B.map.size) return false;
  for (const [iso, e] of A.map) {
    const hit = B.map.get(iso);
    if (!hit || !closeEnough(hit.value, e.value)) return false;
  }
  return true;
}
function canShareSlice(a, b) {
  if (!yearsCompatible(clusterYear(a), clusterYear(b))) return false;
  if (!unitsCompatible(clusterUnit(a), clusterUnit(b))) return false;
  return urlsCompatible(clusterUrl(a), clusterUrl(b));
}
mergePass((a, b) => contained(a, b) || contained(b, a));
// Same series, both already long, each with a few countries the other lacks.
function overlapOk(a, b) {
  if (!canShareSlice(a, b)) return false;
  const A = countryMap(a), B = countryMap(b);
  if (A.groups || B.groups || !A.map.size || !B.map.size) return false;
  let n = 0, bad = 0;
  for (const [iso, e] of A.map) {
    const hit = B.map.get(iso);
    if (!hit) continue;
    if (!closeEnough(hit.value, e.value)) bad++;
    else n++;
  }
  return bad === 0 && n >= 20;
}
mergePass(overlapOk);

const added = [];
const skipped = [];

function listRowsFor(keys) {
  for (const key of keys) {
    const rows = lists.get(key) || lists.get(key.replace(/^top5-/, "top-")) || lists.get(key.replace(/^top1-/, "top-"));
    if (rows && rows.length >= 15) return { id: key.startsWith("top") ? key.replace(/^top[15]-/, "top-") : rows[0].puzzle_id, rows };
  }
  // also match declared dataset-like ids stored as puzzle_id
  for (const [id, rows] of lists) {
    if (rows.length < 15) continue;
    if (keys.includes(id)) return { id, rows };
  }
  return null;
}

for (const c of clusters) {
  const keys = [...new Set(c.keys)];
  if (c.puzzles.every(p => p.type === "match")) {
    for (const p of c.puzzles) {
      const ds = {
        id: p.id,
        kind: "match",
        title: p.headline || p.question || p.id,
        stat: p.stat || "",
        unit: p.unit || "",
        src: p.source || "",
        url: p.sourceUrl || "",
        year: String(p.year || ""),
        hi: "top",
        dec: 0,
        emoji: p.emoji || "🔗",
        fact: p.fact || "",
        caveat: noteOf(p.fact),
        sens: p.sensitive ? 1 : 0,
        rows: (p.people || []).map(person => [person.name, person.emoji || "", person.iso3 || ""]),
      };
      added.push(ds);
    }
    continue;
  }
  const info = countryMap(c);
  const full = c.puzzles.some(isFullSource);
  const list = !info.groups ? listRowsFor(keys) : null;
  let useList = null;
  if (list) {
    let ok = true;
    for (const e of info.map.values()) {
      if (!e.iso) { ok = false; break; }
      const row = list.rows.find(r => r.iso3 === e.iso);
      if (!row || !sameNum(row.value, e.value)) { ok = false; break; }
    }
    if (ok) useList = list;
  }
  const primary = pickId(c, useList);
  const aliasKeys = keys.filter(k => k !== primary);
  const sens = c.puzzles.some(p => p.sensitive) ? 1 : 0;
  const hi = c.puzzles.some(p => p.higherIs === "bottom") ? "bottom" : "top";
  const stat = c.puzzles.map(p => p.stat).filter(Boolean).sort((a, b) => b.length - a.length)[0] || primary;
  const unit = clusterUnit(c);
  const srcP = c.puzzles.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).find(p => p.sourceUrl) || c.puzzles[0];
  const facts = [...new Set(c.puzzles.map(p => (p.fact || "").trim()).filter(Boolean))];
  const fact = facts.join(" ");
  const year = clusterYear(c) || puzzleYear(c.puzzles[0], [...info.map.values()]);
  const title = (c.puzzles.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).find(p => p.headline) || c.puzzles[0]).headline || stat;
  const emoji = (c.puzzles.find(p => p.emoji) || {}).emoji || "📊";
  const hiNet = c.puzzles.some(p => hiNetText(p.stat) || hiNetText(p.source) || hiNetText(p.id) || hiNetText(statKey(p))) || hiNetText(stat) ? 1 : 0;
  const partial = !(full || useList);

  let rows;
  let kind;
  if (info.groups || [...info.map.values()].some(e => !e.iso || !practice.countries[e.iso])) {
    kind = "groups";
    const seen = new Set();
    rows = [];
    for (const p of c.puzzles) {
      for (const it of (p.items || [])) {
        if (seen.has(it.name)) continue;
        seen.add(it.name);
        rows.push([it.name, it.emoji || "", Number(it.value), it.gRank || 0, it.gTotal || 0, it.gScope || ""]);
      }
    }
    if (!rows.length) { skipped.push(keys.join(",")); continue; }
  } else if (useList) {
    kind = "";
    rows = useList.rows.map(r => [r.iso3, Number(r.value), r.year || ""]).filter(r => practice.countries[r[0]]);
    // drop year column when it is uniform
    const years = new Set(rows.map(r => r[2]));
    if (years.size <= 1) rows = rows.map(r => [r[0], r[1]]);
  } else {
    kind = "";
    const listEntries = [...info.map.values()].filter(e => e.iso && practice.countries[e.iso]);
    if (!listEntries.length) { skipped.push(keys.join(",")); continue; }
    const years = new Set(listEntries.map(e => e.year).filter(Boolean));
    const needYear = years.size > 1 || [...years].some(y => y && y !== year);
    const needRank = listEntries.some(e => e.gRank) && partial;
    rows = listEntries.map(e => {
      if (needRank) return [e.iso, e.value, needYear ? (e.year || "") : (e.year && e.year !== year ? e.year : ""), e.gRank || 0, e.gTotal || 0, e.gScope || ""];
      if (needYear) return [e.iso, e.value, e.year || ""];
      return [e.iso, e.value];
    });
  }
  const values = rows.map(r => kind === "groups" ? r[2] : r[1]).filter(v => typeof v === "number");
  const ds = {
    id: primary,
    title, stat, unit,
    src: srcP.source || "",
    url: srcP.sourceUrl || "",
    year: year || "",
    hi, dec: decimalsOf(values), emoji,
    fact, caveat: noteOf(fact),
    sens,
    rows,
  };
  if (kind) ds.kind = kind;
  if (partial) ds.coverage = "partial";
  if (hiNet) ds.hiNet = 1;
  if (aliasKeys.length) ds.aliases = aliasKeys;
  if (kind === "groups") {
    // groups reader expects kind before rows; keep a stable shape
  }
  added.push(ds);
}

function pickId(c, useList) {
  const keys = [...new Set(c.keys)];
  const explicit = c.puzzles.map(p => p.dataset).filter(Boolean);
  const scored = keys.map(k => {
    let score = 0;
    if (explicit.includes(k)) score += 5;
    const owner = c.puzzles.find(p => statKey(p) === k);
    const n = owner ? (owner.type === "name" ? Object.keys(owner.values || {}).length : (owner.countries || owner.items || []).length) : 0;
    score += Math.min(n, 50) / 50;
    if (useList && (k === useList.id || k.replace(/^top[15]-/, "top-") === useList.id)) score += 3;
    return { k, score };
  });
  scored.sort((a, b) => b.score - a.score || (a.k < b.k ? -1 : 1));
  let id = scored[0].k;
  if (poolById.has(id) || added.some(d => d.id === id)) {
    id = id + "-pool";
  }
  return id;
}

// Mark the existing high-internet trends list. Do not drop its rows:
// a later internet vintage sits just under 70% for a few countries that
// were already accepted when the list was built.
for (const ds of practice.datasets) {
  if (hiNetText(ds.stat) || hiNetText(ds.src) || hiNetText(ds.id) || hiNetText(ds.caveat)) ds.hiNet = 1;
}

practice.datasets.push(...added);

// Female-homicide boards were refreshed to the latest published year (mostly 2023).
// Write those values onto the existing pool rows. Other rows keep the dataset's year.
function stampHomicide(p) {
  if (!/homicide/i.test((p.id || "") + " " + (p.dataset || "") + " " + (p.stat || ""))) return;
  const key = statKey(p);
  const ds = practice.datasets.find(d => d.id === key || (d.aliases || []).includes(key));
  if (!ds || ds.kind === "groups" || ds.kind === "match") return;
  const entries = entriesOf(p).filter(e => e.iso && Number.isFinite(e.value));
  const changed = entries.filter(e => {
    const row = ds.rows.find(r => r[0] === e.iso);
    return row && Number(row[1]) !== Number(e.value);
  });
  if (!changed.length) return;
  const fallback = String(ds.year || "");
  if (!ds.rows[0] || ds.rows[0].length < 3) ds.rows = ds.rows.map(r => [r[0], r[1], fallback]);
  for (const e of entries) {
    const row = ds.rows.find(r => r[0] === e.iso);
    if (!row) continue;
    if (Number(row[1]) !== Number(e.value)) reports.push(`homicide ${ds.id} ${e.iso} ${row[1]} -> ${e.value} (${e.year || fallback})`);
    row[1] = Number(e.value);
    if (e.year) row[2] = String(e.year);
  }
  const years = [...new Set(ds.rows.map(r => String(r[2] || "")).filter(Boolean))];
  if (years.length > 1) ds.year = years.slice().sort().join("–");
}
for (const p of curated) stampHomicide(p);

// A curated puzzle flagged sensitive marks its pool dataset, including one that already existed.
for (const p of curated) {
  if (!p.sensitive) continue;
  const ds = practice.datasets.find(d => d.id === statKey(p) || (d.aliases || []).includes(statKey(p)));
  if (ds && !ds.sens) {
    ds.sens = 1;
    reports.push(`sens ${ds.id} from ${p.id}`);
  }
}

const seen = new Set();
for (const ds of practice.datasets) {
  if (seen.has(ds.id)) throw new Error("duplicate dataset id " + ds.id);
  seen.add(ds.id);
  for (const a of ds.aliases || []) {
    if (seen.has("alias:" + a)) throw new Error("duplicate alias " + a);
    seen.add("alias:" + a);
  }
}

function resolveKey(key) {
  if (poolById.has(key) || practice.datasets.some(d => d.id === key)) {
    return practice.datasets.find(d => d.id === key);
  }
  return practice.datasets.find(d => (d.aliases || []).includes(key)) || null;
}
// poolById is stale for new ids; use practice.datasets only
function resolveKey2(key) {
  return practice.datasets.find(d => d.id === key) || practice.datasets.find(d => (d.aliases || []).includes(key)) || null;
}
const missing = [];
for (const p of curated) {
  const key = statKey(p);
  const ds = resolveKey2(key);
  if (!ds) missing.push(p.type + ":" + p.id + " key=" + key);
  else if (p.sensitive && !ds.sens) missing.push("sens " + p.id);
  else if (p.type === "rank" || p.type === "top1") {
    const entries = entriesOf(p);
    for (const e of entries) {
      if (ds.kind === "groups") {
        const row = ds.rows.find(r => r[0] === e.name);
        if (!row || !sameNum(row[2], e.value)) missing.push("value " + p.id + " " + e.name);
      } else if (ds.kind === "match") {
        missing.push("match ranked? " + p.id);
      } else if (e.iso) {
        const row = ds.rows.find(r => r[0] === e.iso);
        if (!row || !closeEnough(e.value, row[1])) missing.push("value " + p.id + " " + e.name + " " + e.value + " vs " + (row && row[1]));
      } else missing.push("unmapped " + p.id + " " + e.name);
    }
  }
}

const partialN = practice.datasets.filter(d => d.coverage === "partial").length;
console.log(JSON.stringify({
  before, after: practice.datasets.length, added: added.length, partial: partialN,
  aliased: aliased.size, conflicts, skipped, missing: missing.slice(0, 40), missingN: missing.length,
  match: added.filter(d => d.kind === "match").length,
  groups: added.filter(d => d.kind === "groups").length,
  hiNet: practice.datasets.filter(d => d.hiNet).map(d => d.id),
}, null, 2));
console.log("--- aliases ---");
for (const line of reports) console.log(line);
console.log("--- added ---");
for (const ds of added) {
  console.log([ds.coverage || "full", ds.kind || "countries", String(ds.rows.length).padStart(4), ds.sens ? "SENS" : "    ", ds.hiNet ? "NET" : "   ", ds.id, "<=", (ds.aliases || []).join("|")].join(" "));
}

if (missing.length) {
  console.error("REFUSING TO WRITE, unresolved or value mismatches: " + missing.length);
  process.exit(1);
}
if (!write) process.exit(0);

const header = "// Practice pool for random Practice. Full lists, plus datasets backfilled from curated puzzles so every stat key resolves. coverage:\"partial\" means only the countries that puzzle named (no invented values). Sensitive rows keep sens:1. Trends lists keep hiNet:1 (high internet use only).\n";
const json = JSON.stringify(practice);
fs.writeFileSync(path.join(root, "practice-data.js"), header + "window.RANKD_PRACTICE = " + json + ";\n");
console.log("wrote practice-data.js");
