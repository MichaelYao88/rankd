const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

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

test("bundles from 5 Nov 2026 through 1 Feb 2027 do not repeat and weigh at least 11", () => {
  const win = boot();
  const again = boot();
  const bonus = win.RankdBonus;
  const shared = win.RankdShared;
  const from = shared.dayNumber(bonus.reshuffleFrom);
  const last = shared.dayNumber(bonus.scheduleThrough);
  assert.equal(shared.keyFromDay(from), "2026-11-05");
  assert.equal(shared.keyFromDay(last), "2027-02-01");
  const seen = new Map();
  for (let n = from; n <= last; n++) {
    const date = shared.keyFromDay(n);
    const parts = bonus.parts(n);
    const ids = parts.map(p => p.id);
    assert.equal(again.RankdBonus.parts(n).map(p => p.id).join("|"), ids.join("|"), "deterministic " + date);
    assert.equal(new Set(ids).size, ids.length, "duplicate inside " + date);
    assert.equal(parts[0].role, "title", date);
    assert.equal(parts[0].scheduleId, shared.puzzles[n].id, date);
    const total = parts.reduce((sum, p) => sum + bonus.points(p), 0);
    assert.ok(total >= bonus.floor, date + " " + total);
    if (date <= "2026-11-03") {
      for (const p of parts) if (p.role !== "title") assert.equal(!!p.sensitive, false, p.id);
    }
    for (const id of ids) {
      assert.equal(seen.has(id), false, id + " repeated on " + date + " after " + seen.get(id));
      seen.set(id, date);
    }
    const closer = parts.filter(p => p.role === "closer");
    assert.ok(closer.length <= 1, date);
    if (closer.length) {
      assert.equal(parts[parts.length - 1].id, closer[0].id, date);
      assert.equal(closer[0].type, "rank", date);
    }
  }
  for (let n = 0; shared.keyFromDay(n) <= "2026-11-03"; n++) {
    for (const p of bonus.parts(n)) {
      if (p.role !== "title") assert.equal(!!p.sensitive, false, p.id + " on " + shared.keyFromDay(n));
    }
  }
});
