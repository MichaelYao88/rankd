const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const frozen = JSON.parse(read("test/frozen-through-nov10.json"));

function boot() {
  const document = {
    documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    head: { appendChild() {} },
    addEventListener() {},
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
    fetch: () => Promise.reject(new Error("no")),
    AbortController,
  };
  appBox.globalThis = appBox;
  appBox.window.document = document;
  appBox.window.localStorage = appBox.localStorage;
  appBox.window.sessionStorage = appBox.sessionStorage;
  appBox.window.location = appBox.location;
  appBox.window.matchMedia = appBox.matchMedia;
  vm.createContext(appBox);
  for (const file of ["puzzles-data.js", "practice-data.js", "name-puzzles.js", "part1-puzzles.js", "invent-quiz.js", "number-stats.js", "number-puzzles.js", "number-guess.js", "app.js"]) {
    vm.runInContext(read(file), appBox, { filename: file });
  }
  return appBox.window;
}

test("days through 10 Nov 2026 keep the bundles that were already scheduled", () => {
  const win = boot();
  const again = boot();
  for (const [date, expect] of Object.entries(frozen)) {
    const n = win.RankdShared.dayNumber(date);
    const ids = win.RankdBonus.parts(n).map(p => p.id + "/" + p.role);
    assert.equal([].map.call(ids, x => x).join("|"), expect.join("|"), date);
    assert.equal(again.RankdBonus.parts(n).map(p => p.id + "/" + p.role).join("|"), ids.join("|"), date);
  }
});

test("from 11 Nov each bundle has one of a type, except rank and multiple choice, and at least 11 points", () => {
  const win = boot();
  const bonus = win.RankdBonus;
  const shared = win.RankdShared;
  const from = shared.dayNumber(bonus.oneEachFrom);
  const last = shared.dayNumber("2026-12-15");
  assert.equal(shared.keyFromDay(from), "2026-11-11");
  const seen = new Map();
  for (let n = from; n <= last; n++) {
    const date = shared.keyFromDay(n);
    const parts = bonus.parts(n);
    const ids = parts.map(p => p.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate " + date);
    const total = parts.reduce((sum, p) => sum + bonus.points(p), 0);
    assert.ok(total >= bonus.floor, date + " " + total);
    const counts = {};
    for (const p of parts) counts[p.type] = (counts[p.type] || 0) + 1;
    for (const [type, count] of Object.entries(counts)) {
      if (type === "rank" || type === "quiz") continue;
      assert.equal(count, 1, type + " on " + date);
    }
    for (const id of ids) {
      assert.equal(seen.has(id), false, id + " repeated on " + date);
      seen.set(id, date);
    }
    if (date <= "2026-11-03") {
      for (const p of parts) if (p.role !== "title") assert.equal(!!p.sensitive, false, p.id);
    }
  }
});
