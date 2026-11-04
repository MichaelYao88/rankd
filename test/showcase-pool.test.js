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

test("the card pool matches every ranker, question, and number pair", () => {
  const win = boot();
  const bonus = win.RankdBonus;
  const puzzles = win.RankdShared.puzzles;
  const numbers = win.RankdNumber.allCards();
  const catalog = bonus.catalog();
  const ids = new Set(catalog.map(c => c.id));
  assert.equal(ids.size, catalog.length);
  let expected = numbers.length;
  for (const p of puzzles) {
    if (p.type === "quiz") {
      expected += p.questions.length;
      for (const q of p.questions) assert.equal(ids.has(p.id + "#" + q.id), true, q.id);
    } else if (p.type === "rank" || p.type === "tier" || p.type === "top1" || p.type === "top5" || p.type === "name" || p.type === "match") {
      expected += 1;
      assert.equal(ids.has(p.id), true, p.id);
    }
  }
  for (const card of numbers) {
    assert.equal(ids.has(card.id), true, card.id);
    assert.equal(catalog.find(c => c.id === card.id).sensitive, !!card.sensitive);
  }
  assert.equal(catalog.length, expected);
  assert.match(read("loadingzone.html"), /noindex, nofollow/);
  assert.match(read("loadingzone.html"), /id="cardView"/);
  assert.match(read("robots.txt"), /Disallow: \/loadingzone/);
  assert.doesNotMatch(read("index.html"), /preview=card/);
});

test("2026-11-14 is an AdSense-safe showcase with two Guess the number stats", () => {
  const win = boot();
  const bonus = win.RankdBonus;
  const shared = win.RankdShared;
  assert.equal(bonus.showcase, "2026-11-14");
  const n = shared.dayNumber(bonus.showcase);
  const parts = bonus.parts(n);
  const weight = parts.reduce((sum, p) => sum + bonus.points(p), 0);
  assert.ok(weight >= bonus.target && weight <= bonus.ceiling, "weight " + weight);
  assert.equal(parts.some(p => p.sensitive), false, parts.filter(p => p.sensitive).map(p => p.id).join(","));
  const numbers = parts.filter(p => p.type === "number");
  assert.equal(numbers.length, 2);
  assert.equal(new Set(numbers.map(p => p.parentId)).size, 2);
  for (const card of numbers) assert.equal(card.sensitive, false, card.id);
  assert.ok(numbers.some(p => p.parentId === "number-tea"));
  assert.ok(numbers.some(p => p.parentId === "number-life"));
  assert.equal(parts[0].role, "title");
  assert.equal(parts[parts.length - 1].role, "closer");
  assert.equal(parts[parts.length - 1].type, "rank");
  const again = bonus.parts(n).map(p => p.id);
  assert.deepEqual(again, parts.map(p => p.id));
});
