const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function load(file) {
  const box = { window: {} };
  vm.runInNewContext(read(file), box, { filename: file });
  return box.window;
}
function boot() {
  const document = {
    documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    head: { appendChild() {} }, addEventListener() {},
  };
  const box = {
    window: { RANKD_STUDIO: true }, document,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { protocol: "http:", pathname: "/", search: "", hostname: "localhost", hash: "" },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    URL, URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp,
    Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error("no")), AbortController,
  };
  box.globalThis = box;
  box.window.document = document;
  box.window.localStorage = box.localStorage;
  box.window.sessionStorage = box.sessionStorage;
  box.window.location = box.location;
  box.window.matchMedia = box.matchMedia;
  vm.createContext(box);
  for (const f of ["puzzles-data.js", "practice-data.js", "name-puzzles.js", "part1-puzzles.js", "invent-quiz.js", "number-stats.js", "number-puzzles.js", "number-guess.js", "app.js"]) {
    vm.runInContext(read(f), box, { filename: f });
  }
  return box.window;
}

const puzzles = load("puzzles-data.js").RANKD_PUZZLES;
const practice = load("practice-data.js").RANKD_PRACTICE;
const woman = puzzles.find(p => p.id === "never-woman-leader");

test("the woman-leader quiz is retired from future play but kept for published days", () => {
  assert.ok(woman, "the object stays so the three published bundles do not change");
  assert.equal(woman.type, "quiz");
  assert.equal(woman.poolUntil, "2026-11-10");
  assert.equal(woman.order, 194);
  assert.equal(woman.headline, "Never Her Turn");
  // quizCard must carry poolUntil onto every derived #qid filler.
  assert.match(read("app.js"), /poolUntil: parent\.poolUntil \|\| ""/);
  assert.match(read("app.js"), /if \(p\.poolUntil\) continue;   \/\/ retired card: never used as a review substitute either/);
});

test("the practice dataset is gone", () => {
  assert.equal(practice.datasets.some(d => d.id === "attr-never-woman-leader"), false);
  assert.equal((read("practice-data.js").match(/attr-never-woman-leader/g) || []).length, 0);
  assert.equal((read("test/pool-coverage.test.js").match(/attr-never-woman-leader/g) || []).length, 0);
});

test("no future bundle uses the retired card, and the three published days are unchanged", () => {
  const win = boot();
  const S = win.RankdShared, B = win.RankdBonus;
  const hits = [];
  for (let n = 0; n <= 400; n++) {
    for (const p of B.parts(n)) if (String(p.id).startsWith("never-woman-leader")) hits.push([S.keyFromDay(n), p.id, p.role]);
  }
  const past = hits.filter(h => h[0] <= "2026-11-10");
  const future = hits.filter(h => h[0] > "2026-11-10");
  assert.equal(future.length, 0, "retired card never appears after 2026-11-10");
  assert.deepEqual(past.map(h => h[0] + " " + h[1] + "/" + h[2]), [
    "2026-10-30 never-woman-leader#cze/filler",
    "2026-10-31 never-woman-leader#usa/filler",
    "2026-11-02 never-woman-leader#pak/filler",
  ]);
  // The scheduler fills the freed slots from the pool. There are plenty of unused rankers.
  const titles = new Set();
  for (let n = 0; n <= 400; n++) for (const p of B.parts(n)) if (p.role === "title") titles.add(p.id);
  const unusedRankers = S.puzzles.filter(p => p.type === "rank" && !titles.has(p.id));
  assert.ok(unusedRankers.length > 50, "unused rankers are available as replacements");
});

test("the review build no longer offers the retired card as a substitute", () => {
  const build = read("tools/build_review_site.js");
  assert.match(build, /const retired = !!\(p && p\.poolUntil\)/);
  assert.match(build, /if \(usable === false\) return;/);
  const map = JSON.parse(read("sensitive/restore-map.json"));
  for (const [date, v] of Object.entries(map)) {
    const all = (v.off || []).concat(v.on || []).join("|");
    if (date > "2026-11-10") assert.equal(all.includes("never-woman-leader"), false, date);
  }
});
