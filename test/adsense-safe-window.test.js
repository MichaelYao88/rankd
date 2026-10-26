const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "puzzles-data.js"), "utf8"), sandbox, { filename: "puzzles-data.js" });
const puzzles = sandbox.window.RANKD_PUZZLES;
const byId = id => puzzles.find(p => p.id === id);
const epoch = Date.UTC(2026, 9, 6);
const dateOf = p => new Date(epoch + (Math.round(p.order) - 1) * 864e5).toISOString().slice(0, 10);

test("the checker agrees the window is clear and the files match", () => {
  const out = execFileSync("python3", ["tools/adsense_safe_window.py", "--check"], { cwd: root, encoding: "utf8" });
  assert.match(out, /window through 2026-11-03 is clear/);
});

test("clear dailies swapped out, borderline dailies stayed", () => {
  assert.equal(dateOf(byId("ef-epi-city")), "2026-10-18");
  assert.equal(dateOf(byId("homicide")), "2026-11-04");
  assert.equal(dateOf(byId("market-economy-age")), "2026-10-20");
  assert.equal(dateOf(byId("homicide-women")), "2026-11-06");
  assert.equal(dateOf(byId("renewables")), "2026-10-22");
  assert.equal(dateOf(byId("suicide")), "2026-11-10");
  assert.equal(dateOf(byId("pew-us-favorable")), "2026-10-25");
  assert.equal(dateOf(byId("homicide-sex")), "2026-11-27");

  assert.equal(dateOf(byId("crash-rate")), "2026-10-07");
  assert.equal(dateOf(byId("alcohol")), "2026-10-08");
  assert.equal(dateOf(byId("obesity")), "2026-10-11");
  assert.equal(dateOf(byId("fertility")), "2026-10-14");
  assert.equal(dateOf(byId("top5-wine")), "2026-10-16");
  assert.equal(dateOf(byId("fertility-c")), "2026-10-23");
  assert.equal(dateOf(byId("uk-alevel-aaa-ethnicity")), "2026-10-28");
  assert.equal(dateOf(byId("height-girls-19")), "2026-10-29");
  assert.equal(dateOf(byId("trump-2024-race-gender")), "2026-10-30");
  assert.equal(dateOf(byId("uk-gcse-ethnicity")), "2026-11-02");
  assert.equal(dateOf(byId("alcohol-c")), "2026-11-03");

  assert.ok(dateOf(byId("penis-girth")) > "2026-11-03");
  assert.equal(byId("homicide").sensitive, true);
  assert.equal(new Set(puzzles.map(p => p.id)).size, puzzles.length);
  for (const p of puzzles) {
    if (dateOf(p) <= "2026-11-03") {
      const text = `${p.id} ${p.headline} ${p.question} ${p.stat}`;
      assert.equal(/homicide|suicide|murder|overdose|cannabis|marijuana|penis|pornograph/i.test(text), false, p.id);
    }
  }
});

test("cutoff helper, and day-keyed progress still requires the puzzle id", () => {
  const store = new Map();
  function storage() {
    return {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      key: i => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    };
  }
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
    localStorage: storage(),
    sessionStorage: storage(),
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
  vm.runInContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), appBox, { filename: "app.js" });
  const shared = appBox.window.RankdShared;
  assert.equal(shared.CONFIG.adsenseSafeThrough, "2026-11-03");
  assert.equal(shared.CONFIG.dailyEpoch, "2026-10-06");
  assert.equal(shared.inAdsenseSafeWindow("2026-10-27"), true);
  assert.equal(shared.inAdsenseSafeWindow("2026-11-03"), true);
  assert.equal(shared.inAdsenseSafeWindow("2026-11-04"), false);
  shared.CONFIG.adsenseSafeThrough = "";
  assert.equal(shared.inAdsenseSafeWindow("2026-11-03"), false);

  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /d:\$\{state\.dateKey\}/);
  assert.match(app, /r && r\.id === state\.puzzle\.id/);
  assert.match(app, /#d=\$\{state\.dateKey\}/);
  assert.match(app, /#p=\$\{encodeURIComponent\(state\.puzzle\.id\)\}/);
  assert.match(app, /#r=\$\{state\.puzzle\.seed\}/);
  assert.equal(shared.LS.archiveUnlock, "rankd.archiveUnlock.v1");

  const stats = JSON.parse(fs.readFileSync(path.join(root, "community-stats.json"), "utf8"));
  assert.ok(stats.puzzles.homicide, "community stats stay keyed by puzzle id");
  assert.ok(stats.puzzles["ef-epi-city"]);
  assert.equal(Object.prototype.hasOwnProperty.call(stats.puzzles, "2026-10-18"), false);
});
