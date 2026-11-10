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
});

test("the published file set has no restricted terms", () => {
  const allow = new Set();
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
