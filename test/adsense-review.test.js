const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const built = spawnSync(process.execPath, ["tools/build_review_site.js"], { cwd: root, encoding: "utf8" });
if (built.status !== 0) throw new Error(built.stderr || built.stdout);
const packed = "c3VpY2lkZXxzZWxmLWhhcm18c2VsZiBoYXJtfHN0YXR1dG9yeSByYXBlfFxicmFwZVxifHNleHVhbHx0ZWVuIGJpcnRofHRlZW5hZ2V8bXVyZGVyfGhvbWljaWRlfGNvY2FpbmV8Y2FubmFiaXN8bWFyaWp1YW5hfGhlcm9pbnxvcGlvaWR8b3ZlcmRvc2V8bmFyY290aWN8XGJwZW5pc1xifHBvcm5vZ3JhcGh8Y2hpbGQgYWJ1c2V8Y2hpbGQgcG9ybnxleGVjdXRpb258ZmVtaWNpZGV8Z2VuaXRhbHxwcm9zdGl0dXR8aW5jZXN0fFxiaGl2XGJ8XGJkcnVncz9cYg==";
const banned = new RegExp(Buffer.from(packed, "base64").toString("utf8"), "i");

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

test("review mode swaps restricted slots and turning it off restores them", () => {
  const map = JSON.parse(fs.readFileSync(path.join(root, "sensitive", "restore-map.json"), "utf8"));
  const off = boot(false);
  const on = boot(true);
  const dates = Object.keys(map).filter(date => date <= "2027-06-01");
  assert.ok(dates.length > 20);
  for (const date of dates) {
    const n = off.RankdShared.dayNumber(date);
    const raw = off.RankdBonus.parts(n).map(p => p.id + "/" + p.role);
    const reviewed = on.RankdBonus.parts(n);
    assert.equal(raw.join("|"), map[date].off.join("|"), date);
    assert.equal(reviewed.map(p => p.id + "/" + p.role).join("|"), map[date].on.join("|"), date);
    const points = reviewed.reduce((sum, p) => sum + on.RankdBonus.points(p), 0);
    if (date >= "2026-11-11") assert.ok(points >= 11, date + " " + points);
    const counts = {};
    for (const p of reviewed) {
      counts[p.type] = (counts[p.type] || 0) + 1;
      assert.equal(banned.test([p.id, p.headline, p.question, p.stat, p.fact].join(" ")), false, p.id);
    }
    if (date >= "2026-11-11") {
      for (const [type, count] of Object.entries(counts)) {
        if (type === "rank" || type === "quiz") continue;
        assert.equal(count, 1, type + " on " + date);
      }
    }
  }
  const dpiSeen = new Map();
  for (let n = 0; ; n++) {
    const date = on.RankdShared.keyFromDay(n);
    if (date > "2027-06-01") break;
    const raw = off.RankdBonus.parts(n);
    const reviewed = on.RankdBonus.parts(n);
    const ids = new Set();
    for (let i = 0; i < reviewed.length; i++) {
      const p = reviewed[i];
      assert.equal(ids.has(p.id), false, date + " " + p.id);
      ids.add(p.id);
      if (String(p.id).indexOf("dpi-") === 0) {
        assert.equal(dpiSeen.has(p.id), false, p.id + " on " + date);
        dpiSeen.set(p.id, date);
      }
    }
    if (date === "2026-10-28") {
      const changed = reviewed.filter((p, i) => p.id !== raw[i].id);
      assert.ok(changed.some(p => String(p.id).indexOf("dpi-") === 0), changed.map(p => p.id).join(","));
    }
  }
  assert.ok(dpiSeen.size >= 6);
});

test("every published review day through 31 Dec has a real headline", () => {
  function bootSite() {
    const document = {
      documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
      querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
      head: { appendChild() {} }, addEventListener() {},
    };
    const appBox = {
      window: { RANKD_STUDIO: true },
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
    const site = path.join(root, "_site");
    for (const file of ["puzzles-data.js", "practice-data.js", "name-puzzles.js", "part1-puzzles.js", "invent-quiz.js", "number-stats.js", "number-puzzles.js", "number-guess.js", "review-play.js", "app.js"]) {
      vm.runInContext(fs.readFileSync(path.join(site, file), "utf8"), appBox, { filename: file });
    }
    return appBox.window;
  }
  const win = bootSite();
  const start = win.RankdShared.dayNumber("2026-10-06");
  const end = win.RankdShared.dayNumber("2026-12-31");
  for (let n = start; n <= end; n++) {
    const date = win.RankdShared.keyFromDay(n);
    const parts = win.RankdBonus.parts(n);
    assert.ok(parts.length > 0, date);
    for (const p of parts) {
      assert.ok(String(p.headline || p.question || "").trim(), date + " " + p.id);
      if (p.type === "rank") assert.ok(Array.isArray(p.items) && p.items.length >= 2, date + " " + p.id + " items");
    }
  }
  const words = win.RANKD_PUZZLES.find(p => p.id === "who-invented-words");
  assert.ok(words && words.questions.length >= 8);
  assert.equal(words.questions.some(q => q.id === "clinical-trial"), false);
  const life = win.RANKD_NUMBER.find(s => s.id === "number-life");
  assert.ok(life && life.pairs.length >= 10);
  assert.equal(life.pairs.some(pair => pair.known && pair.known.iso3 === "USA" && pair.ask && pair.ask.iso3 === "ALB"), false);
  const off = boot(false);
  let differed = 0;
  for (let n = start; n <= end; n++) {
    const title = off.RankdBonus.titlePart(n);
    const parts = off.RankdBonus.parts(n);
    const expected = parts.find(p => p.role === "title") || parts[0];
    assert.equal(title.id, expected.id, off.RankdShared.keyFromDay(n));
    assert.equal(title.headline, expected.headline);
    if (title.id !== off.RANKD_PUZZLES[n % off.RANKD_PUZZLES.length].id) differed++;
  }
  assert.ok(differed > 0);
});

test("the published file set has no restricted terms", () => {  const allow = new Set();
  const list = fs.readFileSync(path.join(root, "tools", "review_whitelist.txt"), "utf8");
  for (const line of list.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    allow.add(trimmed);
  }
  const hits = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (fs.statSync(abs).isDirectory()) walk(abs);
      else {
        const rel = path.relative(path.join(root, "_site"), abs);
        let text;
        try { text = fs.readFileSync(abs, "utf8"); } catch (e) { continue; }
        const found = text.match(banned);
        if (found && !allow.has(rel + "  " + found[0])) hits.push(rel + "  " + found[0]);
      }
    }
  }
  walk(path.join(root, "_site"));
  assert.deepEqual(hits, []);
  assert.match(fs.readFileSync(path.join(root, "_site", "app.js"), "utf8"), /adsenseReview: true/);
  assert.equal(fs.existsSync(path.join(root, "_site", "sensitive")), false);
});

test("the static daily archive covers every past day and never the future", () => {
  const dir = path.join(root, "_site", "daily");
  const today = new Date().toISOString().slice(0, 10);
  const pages = fs.readdirSync(dir).filter(name => /^\d{4}-\d{2}-\d{2}\.html$/.test(name)).sort();
  assert.ok(pages.length >= 20, "pages: " + pages.length);
  assert.equal(pages[0], "2026-10-06.html");
  for (const name of pages) {
    assert.ok(name.slice(0, 10) < today, "future page " + name);
  }
  // Yesterday is published, today is not: the answer is on the page.
  const yesterday = new Date(Date.parse(today + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
  assert.ok(pages.includes(yesterday + ".html"), "missing yesterday " + yesterday);
  assert.equal(fs.existsSync(path.join(dir, today + ".html")), false, "today is a spoiler");
  const index = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.match(index, /Daily puzzle archive/);
  assert.match(index, new RegExp(yesterday + "\\.html"));
  assert.doesNotMatch(index, new RegExp(today + "\\.html"));
  const sitemap = fs.readFileSync(path.join(root, "_site", "sitemap.xml"), "utf8");
  assert.match(sitemap, /https:\/\/ranki\.gg\/daily\/index\.html|https:\/\/ranki\.gg\/daily\/</);
  for (const name of pages) assert.match(sitemap, new RegExp("/daily/" + name.replace(".", "\\.")), name);
});

test("a daily page carries the question, the table, the fact and the source", () => {
  const html = fs.readFileSync(path.join(root, "_site", "daily", "2026-11-09.html"), "utf8");
  assert.match(html, /Holiday Queues/);
  assert.match(html, /<table>/);
  assert.match(html, /France/);
  assert.match(html, /18\.6/);
  assert.match(html, /See the source/);
  assert.match(html, /href="\.\.\/index\.html#d=2026-11-09"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/ranki\.gg\/daily\/2026-11-09\.html">/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /<meta charset="utf-8">/);
});
