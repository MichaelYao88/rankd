const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const store = new Map();
const storage = () => ({
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
  key: i => [...store.keys()][i] ?? null,
  get length() { return store.size; },
});
const localStorage = storage();
const sessionStorage = storage();
const document = {
  documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} },
  addEventListener() {},
};
const sandbox = {
  window: { RANKD_STUDIO: true },
  document,
  localStorage,
  sessionStorage,
  location: { protocol: "http:", pathname: "/", search: "", hostname: "localhost", hash: "", href: "http://localhost/" },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  URL, URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp,
  Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout, encodeURIComponent,
  fetch: () => Promise.reject(new Error("no")),
  AbortController,
};
sandbox.globalThis = sandbox;
sandbox.window.document = document;
sandbox.window.localStorage = localStorage;
sandbox.window.sessionStorage = sessionStorage;
sandbox.window.location = sandbox.location;
sandbox.window.matchMedia = sandbox.matchMedia;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "challenge.js"), "utf8"), sandbox, { filename: "challenge.js" });
vm.runInContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), sandbox, { filename: "app.js" });

const stats = sandbox.window.RankdStats;
const views = sandbox.window.RankdStatsViews;
const LS = sandbox.window.RankdShared.LS;
const appSrc = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const privacy = fs.readFileSync(path.join(root, "privacy.html"), "utf8");
// Objects returned from the vm sandbox have a different Array/Object prototype; normalise before deepEqual.
const plain = x => JSON.parse(JSON.stringify(x));

const RANK = {
  type: "rank",
  id: "test-board",
  items: [
    { name: "Germany", emoji: "🇩🇪", value: 5 },
    { name: "Japan", emoji: "🇯🇵", value: 4 },
    { name: "Germany", emoji: "🇩🇪", value: 3 },   // duplicate name
    { name: "Pizza", emoji: "🍕", value: 2 },      // not a country
    { name: "Brazil", emoji: "", value: 1 },       // no flag, skip
  ],
};

test("only flag-bearing countries on rank/tier/match boards are tracked", () => {
  assert.deepEqual(plain(stats.boardCountries(RANK)), [
    { name: "Germany", emoji: "🇩🇪" },
    { name: "Japan", emoji: "🇯🇵" },
  ]);
  assert.deepEqual(plain(stats.boardCountries({ type: "match", people: RANK.items })), plain(stats.boardCountries(RANK)));
  assert.deepEqual(plain(stats.boardCountries({ type: "tier", items: RANK.items })), plain(stats.boardCountries(RANK)));
  assert.deepEqual(plain(stats.boardCountries({ type: "quiz", items: RANK.items })), []);
  assert.deepEqual(plain(stats.boardCountries(null)), []);
});

test("a finished board adds its try count once per country", () => {
  localStorage.clear();
  assert.equal(stats.recordCountryTries(RANK, { tries: 2 }), true);
  const saved = JSON.parse(localStorage.getItem("rankd.countries.v1"));
  assert.deepEqual(saved.Germany, { n: 1, tries: 2, emoji: "🇩🇪" });
  assert.deepEqual(saved.Japan, { n: 1, tries: 2, emoji: "🇯🇵" });
  assert.equal(saved.Pizza, undefined);
  assert.equal(saved.Brazil, undefined);

  assert.equal(stats.recordCountryTries(RANK, { tries: 4 }), true);
  const twice = JSON.parse(localStorage.getItem("rankd.countries.v1"));
  assert.deepEqual(twice.Germany, { n: 2, tries: 6, emoji: "🇩🇪" });
  assert.equal(stats.recordCountryTries(RANK, { tries: 0 }), false);
  assert.equal(stats.recordCountryTries(RANK, null), false);
  assert.equal(stats.recordCountryTries({ type: "quiz" }, { tries: 1 }), false);
  localStorage.clear();
});

test("countries rank by average tries, sharpest first", () => {
  const all = {
    Easy: { n: 3, tries: 3, emoji: "🇨🇭" },   // 1.0
    Middling: { n: 2, tries: 6, emoji: "🇷🇴" }, // 3.0
    Hard: { n: 2, tries: 10, emoji: "🇺🇸" },  // 5.0
    Lucky: { n: 1, tries: 1, emoji: "🇯🇵" },   // 1.0, one appearance
  };
  const rows = stats.countryAccuracy(all, 1);
  assert.deepEqual(plain(rows.map(r => r.name)), ["Easy", "Lucky", "Middling", "Hard"]);
  assert.equal(rows[0].avg, 1);
  assert.equal(rows[3].avg, 5);
  assert.equal(rows[0].emoji, "🇨🇭");
  assert.deepEqual(plain(stats.countryAccuracy(all, 2).map(r => r.name)), ["Easy", "Middling", "Hard"]);
  assert.deepEqual(plain(stats.countryAccuracy({}, 1)), []);
  assert.deepEqual(plain(stats.countryAccuracy({ Broken: { n: 0, tries: 0 } }, 1)), []);
});

test("history outcomes separate clean solves, slow solves and losses", () => {
  assert.equal(stats.historyOutcome(null), 0);
  assert.equal(stats.historyOutcome({ type: "rank", solved: true, tries: 1 }), 1);
  assert.equal(stats.historyOutcome({ type: "rank", solved: true, tries: 2 }), 1);
  assert.equal(stats.historyOutcome({ type: "match", solved: true, tries: 3 }), 2);
  assert.equal(stats.historyOutcome({ type: "tier", solved: false, tries: 5 }), 3);
  assert.equal(stats.historyOutcome({ type: "quiz", solved: true }), 1);
  assert.equal(stats.historyOutcome({ type: "top5", attempts: [], solved: false }), 3);
});

test("recent history spans 14 consecutive days and reads d: rows", () => {
  const today = "2026-11-11";
  const rows = stats.recentDailyHistory({
    "d:2026-11-11": { type: "rank", solved: true, tries: 1 },
    "d:2026-11-10": { type: "rank", solved: false, tries: 5 },
  }, today, 14);
  assert.equal(rows.length, 14);
  assert.equal(rows[0].day, "2026-10-29");
  assert.equal(rows[13].day, today);
  assert.equal(rows[13].outcome, 1);
  assert.equal(rows[12].outcome, 3);
  assert.equal(rows[11].outcome, 0);
  assert.equal(rows.filter(r => r.day >= "2026-10-29" && r.day <= today).length, 14);
});

test("the stats view renders a 14-cell strip, try spread and flag rows", () => {
  const strip = views.statsHistoryHtml({ "d:2026-11-11": { type: "rank", solved: true, tries: 1 } });
  assert.equal((strip.match(/<i class="h\d"/g) || []).length, 14);
  assert.match(strip, /class="h1"/);
  assert.match(strip, /stat-legend/);

  const spread = views.trySpread({ "Rank in 1": 4, "Rank in 3": 2, "Match ✗": 1, "Quiz 3/5": 9 });
  assert.equal(spread[1], 4);
  assert.equal(spread[3], 2);
  assert.equal(spread.x, 1);
  assert.equal(spread[5], 0);

  const rows = views.countryRowsHtml([{ name: "Switzerland", emoji: "🇨🇭", n: 2, avg: 1 }, { name: "Romania", emoji: "🇷🇴", n: 3, avg: 4 }]);
  assert.match(rows, /🇨🇭/);
  assert.match(rows, /Switzerland/);
  assert.match(rows, /1\.0×/);
  assert.match(rows, /4\.0×/);
  assert.match(rows, /width:100%/);
  assert.match(views.countryRowsHtml([]), /stat-empty/);
});

test("country stats are recorded for daily + archive finishes, never practice or preview", () => {
  assert.match(appSrc, /if \(\(state\.mode === "daily" \|\| state\.mode === "archive"\) && state\.puzzle\) recordCountryTries\(state\.puzzle, g\);/);
  assert.match(appSrc, /if \(state\.mode === "preview"\) \{ setResult\(g\); return false; \}/);
});

test("the new storage key is declared, sandboxable in preview, clearable and disclosed", () => {
  assert.equal(LS.countries, "rankd.countries.v1");
  assert.match(appSrc, /countries: "rankd\.preview\.countries\.v1"/);
  assert.match(appSrc, /const isRankdKey = k => Object\.values\(LS\)\.includes\(k\) \|\| \/\^rankd\[\.:_-\]\/i\.test\(k\)/);
  assert.match(privacy, /<code>rankd\.countries\.v1<\/code>/);
  assert.match(appSrc, /rankd\.countries\.v1: per-country accuracy/);
});

test("the top bar swaps Practice for How to play without deleting Practice itself", () => {
  assert.match(html, /<button class="tab" type="button" id="howtoTab">How to play<\/button>/);
  assert.doesNotMatch(html, /data-view="practice"[^>]*>Practice<\/button>/);
  assert.match(html, /id="homeHowTitle"/);
  assert.match(appSrc, /const how = \$\("#howtoTab"\)/);
  assert.match(appSrc, /target\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(appSrc, /id="mPractice"/);           // still reachable from the menu
  assert.match(appSrc, /goPractice/);               // code still there
});

test("stats styles stay compact and use the existing design tokens", () => {
  for (const cls of ["stat-history", "stat-legend", "stat-spread", "stat-countries", "stat-note", "stat-empty"]) {
    assert.match(css, new RegExp("\\." + cls + "\\b"));
  }
  assert.match(css, /grid-template-columns:repeat\(14,1fr\)/);
  assert.match(css, /var\(--brand\)/);
});
