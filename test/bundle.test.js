const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const EPOCH = "2026-10-06";
const CUTOFF = "2026-11-03";

function keyFrom(n) {
  const [y, m, d] = EPOCH.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function bootStudio() {
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
  for (const file of ["puzzles-data.js", "name-puzzles.js", "part1-puzzles.js", "app.js"]) {
    vm.runInContext(read(file), appBox, { filename: file });
  }
  return appBox.window;
}

test("a day bundles scheduled puzzles to about 12 points", () => {
  const win = bootStudio();
  const bonus = win.RankdBonus;
  const puzzles = win.RankdShared.puzzles;
  assert.equal(bonus.target, 12);
  assert.equal(bonus.ceiling, 14);
  const quiz = puzzles.find(p => p.type === "quiz");
  const tier = puzzles.find(p => p.type === "tier");
  const rank = puzzles.find(p => p.type === "rank");
  assert.equal(bonus.points(quiz), quiz.questions.length);
  assert.equal(bonus.points(tier), tier.tiers.length);
  assert.equal(bonus.points(rank), 5);
  assert.equal(bonus.score(quiz, { type: "quiz", done: true, hits: 3, marks: ["good", "good", "good"] }).score, 3);

  const totals = [];
  for (let n = 0; n < 40; n++) {
    const parts = bonus.parts(n);
    const again = bonus.parts(n);
    assert.deepEqual(again.map(p => p.id), parts.map(p => p.id), "day " + n);
    assert.ok(parts.length >= 2 && parts.length <= 4, "count " + parts.length + " on " + n);
    const main = puzzles[((n % puzzles.length) + puzzles.length) % puzzles.length];
    assert.equal(parts[parts.length - 1].id, main.id, "main last " + n);
    assert.equal(parts[0].id, bonus.forDay(n).id, "part 1 " + n);
    const total = parts.reduce((sum, p) => sum + bonus.points(p), 0);
    const floor = bonus.points(main) + bonus.points(parts[0]);
    assert.ok(total <= bonus.ceiling || total === floor, "budget " + total + " on " + n);
    assert.ok(total >= Math.min(bonus.target, floor), "short " + total + " on " + n);
    if (keyFrom(n) <= CUTOFF) {
      for (const p of parts.slice(0, -1)) assert.equal(!!p.sensitive, false, p.id + " on " + keyFrom(n));
    }
    totals.push(total);
  }
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  assert.ok(avg >= 11 && avg <= 14, "avg " + avg);
  assert.ok(totals.filter(total => total < 10).length <= 3, "short days");
});

test("the part strip, the pile, and reduced motion are on the page", () => {
  const html = read("index.html");
  const css = read("styles.css");
  const app = read("app.js");
  assert.match(html, /id="partStrip"/);
  assert.match(html, /id="partNext"/);
  assert.match(html, /id="bundlePile"/);
  assert.match(html, /id="dayScore"/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /\.bundle-pile\.is-straight/);
  assert.match(app, /motionReduce\(\)/);
  assert.match(app, /BUNDLE_TARGET = 12/);
  assert.match(read("sw.js"), /ranki-shell-v31/);
});
