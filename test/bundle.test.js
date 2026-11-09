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
  assert.equal(bonus.target, 11);
  assert.equal(bonus.floor, 11);
  assert.equal(bonus.ceiling, 21);
  const quiz = puzzles.find(p => p.type === "quiz");
  const tier = puzzles.find(p => p.type === "tier");
  const rank = puzzles.find(p => p.type === "rank");
  assert.equal(bonus.points(quiz), quiz.questions.length);
  assert.equal(bonus.points(tier), tier.tiers.length);
  assert.equal(bonus.points(rank), 5);
  assert.equal(bonus.score(quiz, { type: "quiz", done: true, hits: 3, marks: ["good", "good", "good"] }).score, 100);

  const totals = [];
  for (let n = 0; n < 40; n++) {
    const parts = bonus.parts(n);
    const again = bonus.parts(n);
    assert.deepEqual(again.map(p => p.id), parts.map(p => p.id), "day " + n);
    assert.ok(parts.length >= 2 && parts.length <= 16, "count " + parts.length + " on " + n);
    const main = puzzles[((n % puzzles.length) + puzzles.length) % puzzles.length];
    assert.equal(parts[0].scheduleId, main.id, "title first " + n);
    assert.equal(parts[0].role, "title");
    const total = parts.reduce((sum, p) => sum + bonus.points(p), 0);
    const titleWeight = parts.filter(p => p.role === "title").reduce((sum, p) => sum + bonus.points(p), 0);
    assert.ok(total <= bonus.ceiling || total === titleWeight, "budget " + total + " on " + n);
    assert.ok(total >= Math.min(bonus.target, titleWeight), "short " + total + " on " + n);
    if (keyFrom(n) <= CUTOFF) {
      for (const p of parts) if (p.role !== "title") assert.equal(!!p.sensitive, false, p.id + " on " + keyFrom(n));
    }
    totals.push(total);
  }
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  assert.ok(avg >= 11 && avg <= 16, "avg " + avg);
  assert.ok(totals.filter(total => total < 10).length <= 3, "short days");
});

test("the pile matches the blue card and shrinks with the parts left", () => {
  const html = read("index.html");
  const css = read("styles.css");
  const app = read("app.js");
  const bonus = bootStudio().RankdBonus;
  assert.match(html, /id="communityBody"/);
  assert.match(html, /id="bonusBtn"/);
  assert.match(html, /id="bundlePile"/);
  assert.match(html, /id="dayScore"/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /\.bundle-card\{[^}]*background:var\(--brand\)/);
  assert.match(app, /k > here/);
  assert.match(app, /BUNDLE_FLOOR = 11/);
  assert.match(app, /the closer is left off/);
  assert.equal(bonus.pileBehind(4, 0), 3);
  assert.equal(bonus.pileBehind(4, 1), 2);
  assert.equal(bonus.pileBehind(4, 3), 0);
  assert.match(read("sw.js"), /ranki-shell-v51/);
});

test("the next 90 bundles stay near 12 points and do not repeat a filler inside the gap", () => {
  const bonus = bootStudio().RankdBonus;
  const seen = [];
  let minGap = bonus.gap;
  const totals = [];
  for (let n = 0; n < 90; n++) {
    const parts = bonus.parts(n);
    const date = keyFrom(n);
    assert.ok(parts.length >= 2 && parts.length <= 16, date + " parts " + parts.length);
    const total = parts.reduce((sum, p) => sum + bonus.points(p), 0);
    totals.push(total);
    const titleWeight = parts.filter(p => p.role === "title").reduce((sum, p) => sum + bonus.points(p), 0);
    assert.ok(total <= bonus.ceiling || total === titleWeight, date + " points " + total);
    assert.ok(total >= Math.min(11, titleWeight), date + " short " + total);
    assert.equal(parts[0].role, "title");
    assert.equal(bonus.scheduledDate(parts.find(p => p.role === "title")), date);
    const closer = parts.filter(p => p.role === "closer");
    assert.ok(closer.length <= 1, date);
    if (closer.length) {
      assert.equal(parts[parts.length - 1], closer[0]);
      assert.equal(closer[0].type, "rank");
    }
    for (const filler of parts.filter(p => p.role !== "title")) {
      if (date < bonus.reshuffleFrom && date <= "2026-12-31") assert.ok(bonus.scheduledDate(filler) >= bonus.lateFrom, filler.id + " on " + date);
      if (date <= "2026-11-03") assert.equal(!!filler.sensitive, false, filler.id);
      for (let k = 1; k <= bonus.gap && n - k >= 0; k++) {
        const again = seen[n - k].some(id => id === filler.id);
        if (again) minGap = Math.min(minGap, k - 1);
        assert.equal(again, false, filler.id + " repeated after " + k + " on " + date);
      }
      assert.equal(filler.id === parts[0].scheduleId || filler.parentId === parts[0].scheduleId, false, filler.id);
    }
    seen.push(parts.filter(p => p.role !== "title").map(p => p.id));
  }
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  assert.ok(avg >= 11 && avg <= 16, "avg " + avg);
  assert.ok(minGap >= 30, "repeat window " + minGap);
});
