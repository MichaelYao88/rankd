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
  assert.match(app, /function resultRowFor\(key, puzzle\)/);
  assert.match(app, /function resultRowMatches\(r, key, puzzleId, bundleIds\)/);
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

test("frozen number cards from RANKD_NUMBER_ARCHIVE resolve instead of being skipped", () => {
  const w = boot({
    RANKD_REVIEW_SCHEDULE: {
      "7": [
        { id: "tomatoes", role: "title", type: "rank" },
        { id: "number-testosterone#JPN-DEU", role: "filler", type: "number" },
        { id: "billionaire-cities", role: "closer", type: "rank" },
      ],
    },
    RANKD_REVIEW_FILLS: [],
  });
  const parts = w.RankdBonus.parts(7);
  assert.equal(parts.length, 3, "the archived number card is not dropped");
  assert.equal(parts[1].id, "number-testosterone#JPN-DEU");
  assert.equal(parts[1].type, "number");
});

test("one day never contains two cards from the same dataset", () => {
  const app = read("app.js");
  assert.match(app, /if \(p\.dataset && used\.datasets && used\.datasets\.has\(p\.dataset\)\) return false;/);
  assert.match(app, /const usedDatasets = new Set\(\)/);
  assert.match(app, /const datasetTaken = d =>/);
  const w = boot({ RANKD_ADSENSE_REVIEW: false });
  const parts = w.RankdBonus.parts(33);   // 2026-11-08
  const datasets = parts.map(p => p.dataset).filter(Boolean);
  assert.equal(new Set(datasets).size, datasets.length, "no repeated dataset: " + datasets.join(", "));
  const heads = parts.map(p => p.headline);
  assert.equal(new Set(heads).size, heads.length, "no repeated headline: " + heads.join(", "));
});

test("a day row for a card still in the bundle never counts for the title", () => {
  const w = boot({ RANKD_ADSENSE_REVIEW: false });
  const S = w.RankdShared;
  const key = "d:2026-10-26";
  const closerRow = { id: "land-area", dayKey: "2026-10-26", type: "rank", done: true, solved: true, tries: 1, at: 1 };
  w.localStorage.setItem(S.LS.results, JSON.stringify({ [key]: closerRow }));
  assert.equal(S.resultRowFor(key, { id: "match-foreign-relations" }), null, "title is not done");
  assert.deepEqual(S.resultRowFor(key, { id: "land-area" }), closerRow, "the closer still finds its own row");
  const swapped = { id: "retired-title-from-old-deploy", dayKey: "2026-10-26", type: "rank", done: true, solved: true, tries: 2, at: 2 };
  w.localStorage.setItem(S.LS.results, JSON.stringify({ [key]: swapped }));
  assert.deepEqual(S.resultRowFor(key, { id: "match-foreign-relations" }), swapped, "a review swap keeps the day's play");
});

test("an archive row opens its title card, not the next unfinished part", () => {
  const app = read("app.js");
  const goDate = app.slice(app.indexOf("function goDate("), app.indexOf("function goAll("));
  assert.equal((goDate.match(/openDay\(\{ main: true \}\)/g) || []).length, 2, "both archive open paths use the title");
  assert.doesNotMatch(goDate, /openDay\(\);/, "no archive path resumes mid-day");
  assert.match(app, /function titleIndexOf\(parts\)[\s\S]{0,200}parts\[k\]\.role === "title"/);
  assert.match(app, /if \(opts && opts\.main\) \{[\s\S]{0,220}const title = titleIndexOf\(parts\);[\s\S]{0,120}openPart\(title >= 0 \? title : streakIndexOf\(parts\)/);
  assert.match(app, /function streakIndexOf\(parts\)[\s\S]{0,420}return title >= 0 \? title : 0;/, "never fall back to the last card");
  assert.match(app, /goDate\(b\.dataset\.key, \{ fromArchive: true \}\)/);
  assert.match(goDate, /const fromArchive = !!\(opts && opts\.fromArchive\)/);
  assert.match(goDate, /if \(key === today && !fromArchive\) return goToday\(opts\)/);
  assert.match(goDate, /const mode = key === today \? "daily" : "archive"/);
});

test("the service worker caches the review schedule with the shell", () => {
  assert.match(read("sw.js"), /"\/review-play\.js"/);
  assert.match(read("sw.js"), /ranki-shell-v76/);
});
