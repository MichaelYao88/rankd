// Builds _site, the file set GitHub Pages should publish while AdSense review is on.
// Restricted puzzles stay in this repository under sensitive/ and are not copied.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const out = path.join(root, "_site");
const { banned } = require("./review_terms");
const skipDir = new Set([".git", "node_modules", "test", "tools", "docs", "sensitive", "_site"]);
const textExt = new Set([".html", ".js", ".css", ".json", ".xml", ".txt", ".svg", ".webmanifest", ".md"]);

function boot(review) {
  const document = {
    documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    head: { appendChild() {} }, addEventListener() {},
  };
  const appBox = {
    window: { RANKD_STUDIO: true, RANKD_ADSENSE_REVIEW: review },
    document,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { protocol: "http:", pathname: "/", search: "", hostname: "localhost", hash: "" },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp,
    Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error("no")), AbortController, atob,
  };
  appBox.globalThis = appBox;
  for (const key of ["document", "localStorage", "sessionStorage", "location", "matchMedia", "atob"]) appBox.window[key] = appBox[key];
  vm.createContext(appBox);
  for (const file of ["puzzles-data.js", "practice-data.js", "name-puzzles.js", "part1-puzzles.js", "invent-quiz.js", "number-stats.js", "number-puzzles.js", "number-guess.js", "app.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), appBox, { filename: file });
  }
  return appBox.window;
}

function hidden(p) {
  return !!(p && (p.sensitive || p.sens || banned.test(JSON.stringify(p))));
}
function cleanJson(value) {
  return !banned.test(JSON.stringify(value));
}
// A quiz or number set stays when only one question or pair is restricted.
function publishPuzzle(p) {
  if (!p || p.sensitive || p.sens) return null;
  let next = p;
  if (p.type === "quiz" && Array.isArray(p.questions)) {
    const questions = p.questions.filter(cleanJson);
    if (!questions.length) return null;
    if (questions.length !== p.questions.length) next = Object.assign({}, p, { questions });
  }
  return cleanJson(next) ? next : null;
}
function publishNumber(set) {
  if (!set || set.sensitive || set.sens) return null;
  let next = set;
  if (Array.isArray(set.pairs)) {
    const pairs = set.pairs.filter(cleanJson);
    if (!pairs.length) return null;
    if (pairs.length !== set.pairs.length) next = Object.assign({}, set, { pairs });
  }
  return cleanJson(next) ? next : null;
}
function numberCardId(set, pair) {
  const known = pair && pair.known;
  const ask = pair && pair.ask;
  if (!set || !known || !ask || !known.iso3 || !ask.iso3) return "";
  return set.id + "#" + known.iso3 + "-" + ask.iso3;
}
function publishedIds(puzzles, numbers, fills) {
  const ids = new Set();
  const byType = {};
  function add(type, id, usable) {
    if (!type || !id || ids.has(id)) return;
    ids.add(id);
    // Retired cards stay in `ids` so already-published past bundles are unchanged,
    // but they are never offered as substitutes for future restricted slots.
    if (usable === false) return;
    if (!byType[type]) byType[type] = [];
    byType[type].push(id);
  }
  for (const p of puzzles || []) {
    const kept = publishPuzzle(p);
    if (!kept) continue;
    const retired = !!(p && p.poolUntil);
    add(kept.type, kept.id, !retired);
    if (kept.type === "quiz") for (const q of kept.questions) add("quiz", kept.id + "#" + q.id, !retired);
  }
  for (const set of numbers || []) {
    const kept = publishNumber(set);
    if (!kept) continue;
    for (const pair of kept.pairs || []) add("number", numberCardId(kept, pair));
  }
  for (const fill of fills || []) {
    if (!fill || hidden(fill)) continue;
    const head = String(fill.headline || fill.question || "").trim();
    if (!head) continue;
    if (fill.type === "rank" && (!Array.isArray(fill.items) || fill.items.length < 2)) continue;
    add(fill.type, fill.id);
  }
  return { ids, byType };
}
function extractAssigned(text, marker) {
  const at = text.indexOf(marker);
  if (at < 0) throw new Error("marker missing " + marker);
  let i = at + marker.length;
  while (text[i] === " " || text[i] === "\n") i++;
  const open = text[i];
  const close = open === "[" ? "]" : "}";
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === "\"") inStr = false;
      continue;
    }
    if (c === "\"") inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return { at, end: j + 1, value: JSON.parse(text.slice(i, j + 1)), suffix: text.slice(j + 1) };
    }
  }
  throw new Error("unclosed " + marker);
}

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    if (skipDir.has(name)) continue;
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) walk(abs, acc);
    else acc.push(abs);
  }
  return acc;
}

function writeJsonAssign(file, marker, value) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const at = text.indexOf(marker);
  if (at < 0) throw new Error("marker missing " + file);
  const body = text.slice(at + marker.length).replace(/;\s*$/, "");
  JSON.parse(body);
  return text.slice(0, at) + marker + JSON.stringify(value) + ";\n";
}

function scrubAssign(file, marker, keep) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const got = extractAssigned(text, marker);
  const next = keep(got.value);
  return text.slice(0, got.at) + marker + JSON.stringify(next) + got.suffix;
}

const off = boot(false);
const on = boot(true);
const restore = {};
const fills = new Map();
const schedule = {};
for (let n = 0; off.RankdShared.keyFromDay(n) <= "2028-12-31"; n++) {
  const date = off.RankdShared.keyFromDay(n);
  const raw = off.RankdBonus.parts(n);
  const reviewed = on.RankdBonus.parts(n);
  const rawIds = raw.map(p => p.id + "/" + p.role);
  const nextIds = reviewed.map(p => p.id + "/" + p.role);
  if (rawIds.join("|") !== nextIds.join("|")) restore[date] = { off: rawIds, on: nextIds };
  schedule[String(n)] = reviewed.map(p => ({ id: p.id, role: p.role, type: p.type }));
  for (const p of reviewed) if (String(p.id).startsWith("review-standin-")) fills.set(p.id, p);
}

fs.mkdirSync(path.join(root, "sensitive"), { recursive: true });
fs.writeFileSync(path.join(root, "sensitive", "restore-map.json"), JSON.stringify(restore));
const fillList = [...fills.values()].map(p => {
  const copy = JSON.parse(JSON.stringify(p));
  delete copy.role;
  delete copy.scheduleId;
  delete copy.scheduled;
  return copy;
});
function reslotSchedule(schedule, published) {
  const cursor = {};
  function replacement(type) {
    const list = (published.byType && published.byType[type]) || published.byType.rank || [];
    if (!list.length) return "";
    const i = cursor[type] || 0;
    cursor[type] = i + 1;
    return list[i % list.length];
  }
  for (const key of Object.keys(schedule)) {
    const next = [];
    for (const slot of schedule[key]) {
      if (slot && published.ids.has(slot.id)) {
        next.push({ id: slot.id, role: slot.role });
        continue;
      }
      const id = replacement(slot && slot.type);
      if (!id) continue;
      next.push({ id, role: slot.role });
    }
    schedule[key] = next;
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
const hits = [];
for (const abs of walk(root)) {
  const rel = path.relative(root, abs);
  if (rel === "README.md") continue;
  const dest = path.join(out, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const ext = path.extname(abs).toLowerCase();
  if (ext === ".csv" || ext === ".xlsx") continue;
  if (!textExt.has(ext)) { fs.copyFileSync(abs, dest); continue; }
  let text = fs.readFileSync(abs, "utf8");
  if (rel === "puzzles-data.js") text = scrubAssign("puzzles-data.js", "window.RANKD_PUZZLES = ", arr => arr.map(publishPuzzle).filter(Boolean));
  if (rel === "name-puzzles.js") text = scrubAssign("name-puzzles.js", "window.RANKD_NAME_PUZZLES = ", arr => arr.filter(p => !hidden(p)));
  if (rel === "number-stats.js") text = scrubAssign("number-stats.js", "window.RANKD_NUMBER_STATS = ", arr => arr.filter(p => !hidden(p)));
  if (rel === "number-puzzles.js") {
    text = scrubAssign("number-puzzles.js", "window.RANKD_NUMBER = ", arr => arr.map(publishNumber).filter(Boolean));
    if (text.includes("window.RANKD_NUMBER_ARCHIVE = ")) {
      const got = extractAssigned(text, "window.RANKD_NUMBER_ARCHIVE = ");
      text = text.slice(0, got.at) + "window.RANKD_NUMBER_ARCHIVE = " + JSON.stringify(got.value.map(publishNumber).filter(Boolean)) + got.suffix;
    }
  }
  if (rel === "practice-data.js") {
    const marker = "window.RANKD_PRACTICE = ";
    const at = text.indexOf(marker);
    const data = JSON.parse(text.slice(at + marker.length).replace(/;\s*$/, ""));
    data.datasets = (data.datasets || []).filter(d => !hidden(d));
    text = text.slice(0, at) + marker + JSON.stringify(data) + ";\n";
  }
  if (rel === "app.js") {
    text = text.replace("adsenseReview: false,", "adsenseReview: true,");
    text = text.replace(/\/\/ AdSense review cutoff\.[\s\S]*?turns inAdsenseSafeWindow\(\) off\.\n/, "// AdSense review cutoff. Set to an empty string after approval.\n");
    text = text.replace(/"unodc-homicide": "Murder-Rate", "unodc-homicide-female": "Female-Murder",/, "");
    text = text.replace(/"ihme-drug-deaths": "Drug-Death",/, "");
    text = text.replace(/"unodc-cocaine": "Cocaine-Use",/, "");
    text = text.replace(/"Overdose Rates": "per 100k", /, "");
    text = text.replace(/\[\/unodc\|united nations office on drugs\/i, "UNODC"\],/, '["unodc", "UNODC"],');
    text = text.replace("|bisexual|", "|");
  }
  if (rel === "sw.js") {
    text = text.replace(/\n  "\/puzzles\.csv",/, "");
    text = text.replace(/\n  "\/community-stats\.json",/, "");
  }
  if (rel === "community-stats.json") {
    const data = JSON.parse(text);
    if (data && data.puzzles) {
      for (const key of Object.keys(data.puzzles)) if (banned.test(key)) delete data.puzzles[key];
    }
    text = JSON.stringify(data);
  }
  if (rel === "puzzles.csv") {
    const lines = text.split("\n").filter(line => !banned.test(line));
    text = lines.join("\n");
  }
  if (rel === "index.html" && !text.includes("review-play.js")) {
    text = text.replace('<script src="app.js"></script>', '<script src="review-play.js"></script>\n<script src="app.js"></script>');
  }
  text = text.replace(/\/\*[\s\S]*?\*\//g, block => banned.test(block) ? "" : block);
  text = text.replace(/\/\/[^\n]*/g, line => banned.test(line) ? "" : line);
  const found = text.match(banned);
  if (found) hits.push(rel + " :: " + found[0]);
  fs.writeFileSync(dest, text);
}
const puzzles = extractAssigned(fs.readFileSync(path.join(root, "puzzles-data.js"), "utf8"), "window.RANKD_PUZZLES = ").value;
const names = extractAssigned(fs.readFileSync(path.join(root, "name-puzzles.js"), "utf8"), "window.RANKD_NAME_PUZZLES = ").value;
const numberText = fs.readFileSync(path.join(root, "number-puzzles.js"), "utf8");
const numbers = extractAssigned(numberText, "window.RANKD_NUMBER = ").value;
const archiveNumbers = numberText.includes("window.RANKD_NUMBER_ARCHIVE = ")
  ? extractAssigned(numberText, "window.RANKD_NUMBER_ARCHIVE = ").value
  : [];
reslotSchedule(schedule, publishedIds(puzzles.concat(names), numbers.concat(archiveNumbers), fillList));
const reviewPlay = "window.RANKD_REVIEW_FILLS = " + JSON.stringify(fillList) + ";\n"
  + "window.RANKD_REVIEW_SCHEDULE = " + JSON.stringify(schedule) + ";\n";
if (banned.test(reviewPlay)) throw new Error("review schedule still has a restricted term");
fs.writeFileSync(path.join(out, "review-play.js"), reviewPlay);
fs.writeFileSync(path.join(root, "sensitive", "README.txt"), "Restricted puzzle text lives in the main data files of this repository.\nThis folder is left out of the Pages publish (_site) while review mode is on.\nrestore-map.json is the original bundle for each day that review mode changes, and the neutral substitute ids.\nTurn review mode off by publishing the repository without this filter. The game then uses the original bundles.\n");
if (hits.length) {
  console.error(hits.slice(0, 40).join("\n"));
  throw new Error(hits.length + " restricted hits in _site");
}
// Crawlable archive: one plain page per day that has already gone live. Reads
// the built site, so it uses the same review substitutions as the game.
require("./build_daily_pages").main();
console.log("review days", Object.keys(restore).length, "fills", fillListSafe(fillList), "site files ok");
function fillListSafe(list) { return list.length; }
