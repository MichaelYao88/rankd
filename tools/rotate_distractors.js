/* Spread quiz distractors across a wide pool (at most 3 uses per day) and
   add Little brother plus an empty Banana tier to Pepper or Bird. Idempotent. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

function load(file) {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), box, { filename: file });
  return box.window;
}

const practice = load("practice-data.js").RANKD_PRACTICE;
const C = practice.countries;
function place(iso) {
  if (!C[iso]) throw new Error("missing country " + iso);
  return { iso3: iso, name: C[iso][0], emoji: C[iso][1] };
}

const NEIGHBORS = {
  JPN: [],
  SWE: ["NOR", "FIN"],
  GBR: ["IRL"],
  ISR: ["EGY", "JOR", "LBN", "SYR"],
  DEU: ["FRA", "POL", "CZE", "AUT", "CHE", "BEL", "NLD", "DNK", "LUX"],
  IND: ["PAK", "CHN", "NPL", "BTN", "BGD", "MMR"],
  CHN: ["RUS", "MNG", "PRK", "KOR", "VNM", "LAO", "MMR", "IND", "BTN", "NPL", "KAZ", "KGZ", "TJK", "AFG", "PAK"],
  USA: ["CAN", "MEX"],
  CAN: ["USA"],
  PER: ["ECU", "COL", "BRA", "BOL", "CHL"],
  IRN: ["TUR", "IRQ", "ARM", "AZE", "TKM", "AFG", "PAK"],
  KEN: ["TZA", "UGA", "ETH", "SOM", "SSD"],
  TUR: ["GRC", "BGR", "GEO", "ARM", "IRN", "IRQ", "SYR"],
  HRV: ["SVN", "HUN", "SRB", "BIH", "MNE"],
  IRQ: ["IRN", "TUR", "SYR", "JOR", "SAU", "KWT"],
  MAR: ["DZA", "ESH", "ESP"],
};

const EXTRA = {
  emoji: ["KOR", "CHN", "USA", "RUS"],
  qr: ["KOR", "CHN", "USA"],
  spotify: ["NOR", "FIN", "DNK"],
  webcam: ["IRL", "FRA"],
  "usb-flash": ["EGY", "JOR", "LBN", "SYR", "SGP", "USA", "CHN"],
  "gasoline-car": ["FRA", "POL", "CZE", "AUT", "CHE", "BEL", "NLD", "DNK", "LUX", "USA", "GBR"],
  shampoo: ["PAK", "BGD", "NPL", "CHN", "BTN", "MMR", "LKA", "GBR"],
  bluetooth: ["NOR", "FIN", "DNK", "USA"],
  ketchup: ["VNM", "USA", "GBR"],
  "haagen-dazs": ["CAN", "MEX"],
  "english-muffins": ["CAN", "MEX", "GBR"],
  toothbrush: ["EGY", "GBR"],
  "playing-cards": ["ITA", "IND", "EGY"],
  umbrella: ["EGY", "GBR", "FRA"],
  anesthesia: ["USA", "CHN", "GBR", "KOR"],
  chess: ["IRN", "CHN"],
  rhinoplasty: ["ITA", "GBR"],
  "rope-bridge": ["CHN"],
  windmill: ["CHN", "NLD", "ESP"],
  "chinese-checkers": ["USA"],
  "hawaiian-pizza": ["ITA", "GRC"],
  "mobile-money": ["PHL", "GBR", "IND"],
  variolation: ["CHN", "IND", "GBR"],
  quarantine: ["ITA"],
  algebra: ["IRQ", "UZB", "GRC"],
  algorithm: ["IRQ", "UZB", "GRC"],
  cheque: ["IRN", "ITA", "GBR"],
  "clinical-trial": ["GBR", "UZB", "FRA"],
  "oldest-school": ["TUN", "EGY", "ITA", "DZA", "ESP"],
  "paper-money": ["SWE", "USA", "ITA"],
  "russian-roulette": ["CAN", "MEX", "RUS", "CHE", "ROU"],
  "chicken-tikka": ["IND", "PAK", "BGD", "IRL", "NPL", "LKA"],
};

const POOL = ["MEX", "ARG", "CHL", "CAN", "NGA", "GHA", "ETH", "KEN", "ZAF", "IDN", "THA", "VNM", "PHL", "KOR", "POL", "ESP", "PRT", "IRL", "NZL", "SAU", "BRA", "JPN", "AUS", "NOR", "COL", "PER", "EGY", "MAR", "NLD", "CZE", "DNK", "CHN"];
const PIN = { "haagen-dazs": "DNK", "chinese-checkers": "CHN", "hawaiian-pizza": "USA" };
for (const iso of POOL) if (!C[iso]) throw new Error("pool missing " + iso);

function bannedFor(q) {
  const set = new Set([...(NEIGHBORS[q.answer] || []), ...(EXTRA[q.id] || [])]);
  // Hawaiian pizza keeps the United States as a deliberate trap. It borders Canada.
  if (q.id === "hawaiian-pizza") set.delete("USA");
  return set;
}

function pickThree(q, counts, cardIndex) {
  const banned = bannedFor(q);
  const candidates = POOL.filter(iso => iso !== q.answer && !banned.has(iso) && (counts[iso] || 0) < 3);
  candidates.sort((a, b) => (counts[a] || 0) - (counts[b] || 0) || POOL.indexOf(a) - POOL.indexOf(b));
  const pin = PIN[q.id];
  if (pin && (pin === q.answer || banned.has(pin))) throw new Error(q.id + " bad pin " + pin);
  const need = pin ? 2 : 3;
  if (candidates.length < need) throw new Error(q.id + " only " + candidates.length + " distractors");
  const chosen = candidates.filter(iso => iso !== pin).slice(0, need);
  if (pin) chosen.push(pin);
  for (const iso of chosen) counts[iso] = (counts[iso] || 0) + 1;
  const opts = chosen.slice();
  opts.splice(cardIndex % 4, 0, q.answer);
  return opts;
}

const puzzles = load("puzzles-data.js").RANKD_PUZZLES;
const DAYS = ["who-invented-it", "who-invented-older", "who-invented-words"];
const updated = {};
for (const id of DAYS) {
  const p = puzzles.find(x => x.id === id);
  const counts = {};
  updated[id] = p.questions.map((q, i) => {
    const isos = pickThree(q, counts, i);
    return Object.assign({}, q, { options: isos.map(place) });
  });
  const over = Object.entries(counts).filter(([, n]) => n > 3);
  if (over.length) throw new Error(id + " over cap " + over.join(","));
  console.log("\n" + id);
  updated[id].forEach(q => console.log(q.id, q.answer, q.options.map(o => o.iso3).join(",")));
  console.log("counts", Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ":" + n).join(" "));
}

function replaceBalanced(text, marker, key, value) {
  const at = text.indexOf(marker);
  if (at < 0) throw new Error("missing " + marker);
  const keyAt = text.indexOf('"' + key + '":', at);
  const bracket = text.indexOf("[", keyAt);
  if (keyAt < 0 || bracket < 0) throw new Error("missing " + key);
  let depth = 0, inStr = false, esc = false;
  for (let i = bracket; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0 && c === "]") return text.slice(0, bracket) + JSON.stringify(value) + text.slice(i + 1);
    }
  }
  throw new Error("unterminated " + key);
}

function patchQuestions(file) {
  let text = fs.readFileSync(path.join(root, file), "utf8");
  for (const id of DAYS) text = replaceBalanced(text, '"id":"' + id + '"', "questions", updated[id]);
  fs.writeFileSync(path.join(root, file), text);
}
patchQuestions("puzzles-data.js");
patchQuestions("practice-data.js");

const ADD = " China's 小弟弟 means little brother, a word for a child's penis, and that tier is only China. English banana is slang for a penis in Green's Dictionary of Slang, and none of these countries use that word, so Banana is an empty tier.";
const SRC = " Wiktionary, 小弟弟: an informal euphemism for a penis, literally little brother. Green's Dictionary of Slang, banana: the penis.";

function patchPepper(file) {
  const data = load(file);
  const puzzlesNow = data.RANKD_PUZZLES || null;
  const text0 = fs.readFileSync(path.join(root, file), "utf8");
  if (file.endsWith("puzzles-data.js")) {
    const p = puzzlesNow.find(x => x.id === "pepper-or-bird");
    if (p.tiers.some(t => t.label === "Banana")) { console.log("pepper already patched"); return; }
    p.headline = "Slang Pictures";
    p.question = "What else does their slang mean?";
    p.tiers = [
      { label: "Chili pepper", value: 2 },
      { label: "Bird", value: 1 },
      { label: "Little brother", value: 3 },
      { label: "Banana", value: 0 },
    ];
    const china = { name: place("CHN").name, emoji: place("CHN").emoji, value: 3, tierIndex: 2, iso3: "CHN" };
    const items = p.items.slice();
    items.splice(2, 0, china);
    p.items = items;
    if (!p.fact.includes("小弟弟")) p.fact += ADD;
    if (!p.source.includes("小弟弟")) p.source += SRC;
    const marker = '{"type":"tier","id":"pepper-or-bird"';
    const at = text0.indexOf(marker);
    if (at < 0) throw new Error("pepper puzzle missing");
    let depth = 0, inStr = false, esc = false;
    for (let i = at; i < text0.length; i++) {
      const c = text0[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") {
        depth--;
        if (depth === 0 && c === "}") {
          const next = text0.slice(0, at) + JSON.stringify(p) + text0.slice(i + 1);
          fs.writeFileSync(path.join(root, file), next);
          return;
        }
      }
    }
    throw new Error("pepper object unterminated");
  }
}

patchPepper("puzzles-data.js");

function patchPepperDataset() {
  const data = load("practice-data.js");
  const ds = data.RANKD_PRACTICE.datasets.find(d => d.id === "pepper-or-bird");
  const p = load("puzzles-data.js").RANKD_PUZZLES.find(x => x.id === "pepper-or-bird");
  ds.title = p.headline;
  ds.question = p.question;
  ds.fact = p.fact;
  ds.src = p.source;
  ds.labels = { "2": "Chili pepper", "1": "Bird", "3": "Little brother", "0": "Banana" };
  ds.rows = p.items.map(it => [it.iso3, it.value]);
  const text0 = fs.readFileSync(path.join(root, "practice-data.js"), "utf8");
  const marker = '{"id":"pepper-or-bird"';
  const at = text0.indexOf(marker);
  if (at < 0) throw new Error("pepper dataset missing");
  let depth = 0, inStr = false, esc = false;
  for (let i = at; i < text0.length; i++) {
    const c = text0[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0 && c === "}") {
        const next = text0.slice(0, at) + JSON.stringify(ds) + text0.slice(i + 1);
        fs.writeFileSync(path.join(root, "practice-data.js"), next);
        return;
      }
    }
  }
  throw new Error("pepper dataset unterminated");
}
patchPepperDataset();

function csvQuote(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function rewritePepperCsv() {
  const p = load("puzzles-data.js").RANKD_PUZZLES.find(x => x.id === "pepper-or-bird");
  const file = path.join(root, "tier_puzzles.csv");
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex(l => l.startsWith("pepper-or-bird,"));
  const end = lines.findIndex((l, i) => i > start && /^[a-z]/.test(l));
  if (start < 0 || end < 0) throw new Error("csv pepper block");
  const rows = p.items.map((it, n) => {
    const tier = p.tiers[it.tierIndex];
    const row = [
      n === 0 ? p.id : "", n === 0 ? p.order : "", n === 0 ? p.emoji : "", n === 0 ? p.headline : "",
      n === 0 ? p.question : "", n === 0 ? p.stat : "", n === 0 ? p.unit : "",
      n === 0 ? p.source : "", n === 0 ? p.sourceUrl : "", n === 0 ? p.fact : "", n === 0 ? (p.art || "") : "",
      tier.value, tier.label, it.name, it.emoji, it.iso3, it.value, p.year || "",
      n === 0 ? p.dataset : "", "", "",
    ];
    return row.map(csvQuote).join(",");
  });
  const next = lines.slice(0, start).concat(rows, lines.slice(end));
  fs.writeFileSync(file, next.join("\n"));
}
rewritePepperCsv();
console.log("\nrotated distractors and patched Pepper or Bird");
