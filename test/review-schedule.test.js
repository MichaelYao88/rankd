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

test("the review builder keeps slot type so the live page can resolve it", () => {
  const build = read("tools/build_review_site.js");
  assert.match(build, /next\.push\(\{ id: slot\.id, role: slot\.role, type: slot\.type \}\)/);
  assert.match(build, /next\.push\(\{ id, role: slot\.role, type: slot\.type \}\)/);
  assert.match(read("app.js"), /function reviewFallback\(slot\)[\s\S]{0,300}return null;/);
});

test("stored results survive a review-mode puzzle swap", () => {
  const app = read("app.js");
  assert.match(app, /dayKey: state\.dateKey \|\| ""/);
  assert.match(app, /dayKey === state\.dateKey/);
  assert.match(app, /row\.dayKey && row\.dayKey === state\.dateKey/);
  assert.match(read("test/adsense-safe-window.test.js"), /function resultRowMatches/);
  const S = boot().RankdShared;
  const row = { id: "old-review-substitute", dayKey: "2026-11-04", at: 1, done: true, solved: true, tries: 2 };
  assert.equal(S.resultRowMatches(row, "d:2026-11-04", "new-substitute", "2026-11-04", "archive"), true);
  assert.equal(S.resultRowMatches(row, "d:2026-11-04", "new-substitute", "2026-11-05", "archive"), false);
  assert.equal(S.resultRowMatches(row, "r:123", "new-substitute", "2026-11-04", "practice"), false);
  assert.equal(S.resultRowMatches(null, "d:2026-11-04", "new-substitute", "2026-11-04", "archive"), false);
  assert.equal(S.resultRowMatches({ id: "same", done: true }, "d:2026-11-04", "same", "2026-11-04", "archive"), true);
});

test("the service worker caches the review schedule with the shell", () => {
  assert.match(read("sw.js"), /"\/review-play\.js"/);
  assert.match(read("sw.js"), /ranki-shell-v69/);
});
