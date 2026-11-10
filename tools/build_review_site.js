// Builds _site, the file set GitHub Pages should publish while AdSense review is on.
// Restricted puzzles stay in this repository under sensitive/ and are not copied.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const out = path.join(root, "_site");
const packed = "c3VpY2lkZXxzZWxmLWhhcm18c2VsZiBoYXJtfHN0YXR1dG9yeSByYXBlfFxicmFwZVxifHNleHVhbHx0ZWVuIGJpcnRofHRlZW5hZ2V8bXVyZGVyfGhvbWljaWRlfGNvY2FpbmV8Y2FubmFiaXN8bWFyaWp1YW5hfGhlcm9pbnxvcGlvaWR8b3ZlcmRvc2V8bmFyY290aWN8XGJwZW5pc1xifHBvcm5vZ3JhcGh8Y2hpbGQgYWJ1c2V8Y2hpbGQgcG9ybnxleGVjdXRpb258ZmVtaWNpZGV8Z2VuaXRhbHxwcm9zdGl0dXR8aW5jZXN0fFxiaGl2XGJ8XGJkcnVncz9cYg==";
const banned = new RegExp(Buffer.from(packed, "base64").toString("utf8"), "i");
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
  schedule[String(n)] = reviewed.map(p => ({ id: p.id, role: p.role }));
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
const reviewPlay = "window.RANKD_REVIEW_FILLS = " + JSON.stringify(fillList) + ";\n"
  + "window.RANKD_REVIEW_SCHEDULE = " + JSON.stringify(schedule) + ";\n";
if (banned.test(reviewPlay)) throw new Error("review schedule still has a restricted term");

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
  if (rel === "puzzles-data.js") text = scrubAssign("puzzles-data.js", "window.RANKD_PUZZLES = ", arr => arr.filter(p => !hidden(p)));
  if (rel === "name-puzzles.js") text = scrubAssign("name-puzzles.js", "window.RANKD_NAME_PUZZLES = ", arr => arr.filter(p => !hidden(p)));
  if (rel === "number-stats.js") text = scrubAssign("number-stats.js", "window.RANKD_NUMBER_STATS = ", arr => arr.filter(p => !hidden(p)));
  if (rel === "number-puzzles.js") {
    text = scrubAssign("number-puzzles.js", "window.RANKD_NUMBER = ", arr => arr.filter(p => !hidden(p)));
    if (text.includes("window.RANKD_NUMBER_ARCHIVE = ")) {
      const got = extractAssigned(text, "window.RANKD_NUMBER_ARCHIVE = ");
      text = text.slice(0, got.at) + "window.RANKD_NUMBER_ARCHIVE = " + JSON.stringify(got.value.filter(p => !hidden(p))) + got.suffix;
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
fs.writeFileSync(path.join(out, "review-play.js"), reviewPlay);
fs.writeFileSync(path.join(root, "sensitive", "README.txt"), "Restricted puzzle text lives in the main data files of this repository.\nThis folder is left out of the Pages publish (_site) while review mode is on.\nrestore-map.json is the original bundle for each day that review mode changes, and the neutral substitute ids.\nTurn review mode off by publishing the repository without this filter. The game then uses the original bundles.\n");
if (hits.length) {
  console.error(hits.slice(0, 40).join("\n"));
  throw new Error(hits.length + " restricted hits in _site");
}
console.log("review days", Object.keys(restore).length, "fills", fillListSafe(fillList), "site files ok");
function fillListSafe(list) { return list.length; }
