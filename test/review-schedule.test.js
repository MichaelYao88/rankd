const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function boot(extra) {
  const document = {
    documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    head: { appendChild() {} }, addEventListener() {},
  };
  const store = new Map();
  const localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k),
    key: i => [...store.keys()][i] ?? null, get length() { return store.size; },
  };
  const box = {
    window: Object.assign({ RANKD_STUDIO: true, RANKD_ADSENSE_REVIEW: true }, extra || {}),
    document, localStorage,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { protocol: "http:", pathname: "/", search: "", hostname: "localhost", hash: "" },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    URL, URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp,
    Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error("no")), AbortController,
  };
  box.globalThis = box;
  box.window.document = document; box.window.localStorage = box.localStorage;
  box.window.sessionStorage = box.sessionStorage; box.window.location = box.location;
  box.window.matchMedia = box.matchMedia;
  vm.createContext(box);
  for (const f of ["puzzles-data.js", "practice-data.js", "name-puzzles.js", "part1-puzzles.js", "invent-quiz.js", "number-stats.js", "number-puzzles.js", "number-guess.js"]) {
    vm.runInContext(read(f), box, { filename: f });
  }
  vm.runInContext(read("app.js"), box, { filename: "app.js" });
  return box.window;
}

test("an unresolvable review slot is dropped, never replaced by a random puzzle", () => {
  const w = boot({
    RANKD_REVIEW_SCHEDULE: {
      "29": [
        { id: "puzzle-that-was-stripped-from-review-build", role: "title", type: "rank" },
        { id: "work-hours", role: "filler", type: "rank" },
      ],
    },
    RANKD_REVIEW_FILLS: [],
  });
  const parts = w.RankdBonus.parts(29);
  assert.equal(parts.length, 1, "the missing slot is dropped");
  assert.equal(parts[0].id, "work-hours");
  assert.equal(parts.some(p => p.id.startsWith("review-standin")), false);
});

test("a resolvable review slot keeps its own puzzle and preserves type", () => {
  const w = boot({
    RANKD_REVIEW_SCHEDULE: { "29": [{ id: "work-hours", role: "title", type: "rank" }] },
    RANKD_REVIEW_FILLS: [],
  });
  const parts = w.RankdBonus.parts(29);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].id, "work-hours");
  assert.equal(parts[0].type, "rank");
});

test("the title part is the scheduled/main puzzle, so its result is not a bonus", () => {
  const w = boot({
    RANKD_REVIEW_SCHEDULE: {
      "29": [
        { id: "work-hours", role: "title", type: "rank" },
        { id: "crash-rate", role: "filler", type: "rank" },
        { id: "newest-countries", role: "closer", type: "rank" },
      ],
    },
    RANKD_REVIEW_FILLS: [],
  });
  const parts = w.RankdBonus.parts(29);
  assert.equal(parts.length, 3);
  assert.equal(parts[0].scheduled, true, "title is scheduled");
  assert.equal(parts[1].scheduled, undefined);
  assert.equal(parts[2].scheduled, undefined, "closer is NOT the main puzzle");
  assert.equal(parts[0].id, "work-hours");
  assert.equal(parts[0].headline, "Grindset Nations");
  assert.equal((parts[0].items || [])[0].name, "Indonesia", "board data matches its own headline");
  assert.equal(parts[2].id, "newest-countries");
  assert.equal(parts[2].headline, "Just Independent");
  assert.equal((parts[2].items || [])[0].name, "South Sudan", "no cross-puzzle item bleed");
});

test("the review builder keeps slot type so the live page can resolve it", () => {
  const build = read("tools/build_review_site.js");
  assert.match(build, /next\.push\(\{ id: slot\.id, role: slot\.role, type: slot\.type \}\)/);
  assert.match(build, /next\.push\(\{ id, role: slot\.role, type: slot\.type \}\)/);
  assert.match(read("app.js"), /function reviewFallback\(slot\)[\s\S]{0,300}return null;/);
});

test("stored results survive a review-mode puzzle swap", () => {
  const app = read("app.js");
  assert.match(app, /dayKey: state\.dateKey \|\| ""/);
  assert.match(app, /function resultRowMatches\(r, key, puzzleId\)/);
  assert.match(app, /function resultRowFor\(key, puzzle\)/);
  assert.match(read("test/adsense-safe-window.test.js"), /function resultRowMatches/);
  const S = boot().RankdShared;
  const row = { id: "old-review-substitute", dayKey: "2026-11-04", at: 1, done: true, solved: true, tries: 2 };
  assert.equal(S.resultRowMatches(row, "d:2026-11-04", "new-substitute"), true);
  assert.equal(S.resultRowMatches(row, "d:2026-11-05", "new-substitute"), false, "different day");
  assert.equal(S.resultRowMatches(row, "r:123", "new-substitute"), false, "practice keys stay id-matched");
  assert.equal(S.resultRowMatches(row, "b:2026-11-04:1", "new-substitute"), false, "bonus keys stay id-matched");
  assert.equal(S.resultRowMatches(null, "d:2026-11-04", "new-substitute"), false);
  assert.equal(S.resultRowMatches({ id: "same", done: true }, "d:2026-11-04", "same"), true);
  assert.equal(S.resultRowMatches({ id: "x", dayKey: "2026-11-04" }, "d:2026-11-04", ""), true);
});

test("the service worker caches the review schedule with the shell", () => {
  assert.match(read("sw.js"), /"\/review-play\.js"/);
  assert.match(read("sw.js"), /ranki-shell-v70/);
});
