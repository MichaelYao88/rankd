const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

function load(file) {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), box, { filename: file });
  return box.window;
}

const practice = load("practice-data.js").RANKD_PRACTICE;
const puzzles = load("puzzles-data.js").RANKD_PUZZLES;
const namePuzzles = load("name-puzzles.js").RANKD_NAME_PUZZLES;
const part1Puzzles = load("part1-puzzles.js").RANKD_PART1 || [];
const datasets = practice.datasets;
const countries = practice.countries;

function decimalsOf(values) {
  let d = 0;
  for (const v of values) {
    const s = String(v);
    const i = s.indexOf(".");
    if (i >= 0) d = Math.max(d, s.length - i - 1);
  }
  return d;
}
function closeEnough(a, b) {
  const x = Number(a), y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x === y) return true;
  const step = 10 ** (-Math.min(decimalsOf([a]), decimalsOf([b])));
  return Math.abs(x - y) <= step / 2 + 1e-9;
}
function statKey(p) { return p.dataset || p.id; }
function resolve(key) {
  return datasets.find(d => d.id === key) || datasets.find(d => Array.isArray(d.aliases) && d.aliases.includes(key)) || null;
}
const byName = new Map(Object.entries(countries).map(([iso, row]) => [row[0], iso]));
byName.set("Macau", byName.get("Macao"));
function isoOf(name) { return byName.get(name) || null; }

function boot(noon) {
  const fixed = new Date(noon.getFullYear(), noon.getMonth(), noon.getDate(), 12, 0, 0);
  function Clock(...args) {
    if (!new.target) return Date();
    if (args.length) return new Date(...args);
    return new Date(fixed.getTime());
  }
  Clock.UTC = Date.UTC;
  Clock.parse = Date.parse;
  Clock.now = () => fixed.getTime();
  Clock.prototype = Date.prototype;
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
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { protocol: "http:", pathname: "/", search: "", hostname: "localhost", hash: "" },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    URLSearchParams, URL, console, Date: Clock, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp,
    Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error("no")),
    AbortController,
  };
  sandbox.globalThis = sandbox;
  sandbox.window.document = document;
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.window.sessionStorage = sandbox.sessionStorage;
  sandbox.window.location = sandbox.location;
  sandbox.window.matchMedia = sandbox.matchMedia;
  vm.createContext(sandbox);
  for (const file of ["practice-data.js", "puzzles-data.js", "name-puzzles.js", "name-it.js", "app.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  if (sandbox.RankdName) sandbox.window.RankdName = sandbox.RankdName;
  return sandbox;
}

test("every curated puzzle stat key resolves to a pool dataset", () => {
  const curated = puzzles.concat(namePuzzles, part1Puzzles);
  assert.ok(curated.length > 200);
  for (const p of curated) {
    const key = statKey(p);
    const ds = resolve(key);
    assert.ok(ds, key + " from " + p.id);
    if (p.sensitive) assert.equal(!!ds.sens, true, p.id);
    if (p.type === "match") {
      assert.equal(ds.kind, "match", p.id);
      continue;
    }
    if (p.type === "name") {
      for (const [iso, value] of Object.entries(p.values || {})) {
        if (!countries[iso] || ds.kind === "groups") continue;
        const row = ds.rows.find(r => r[0] === iso);
        assert.ok(row, p.id + " " + iso);
        assert.equal(closeEnough(value, row[1]), true, p.id + " " + iso);
      }
      continue;
    }
    const items = p.items || p.countries || [];
    for (const it of items) {
      if (ds.kind === "groups") {
        const row = ds.rows.find(r => r[0] === it.name);
        assert.ok(row, p.id + " " + it.name);
        assert.equal(closeEnough(it.value, row[2]), true, p.id + " " + it.name);
      } else {
        const iso = it.iso3 || isoOf(it.name);
        assert.ok(iso, p.id + " " + it.name);
        const row = ds.rows.find(r => r[0] === iso);
        assert.ok(row, p.id + " " + it.name);
        const col = ds.kind === "capitals" && p.axis === "lon" ? 2 : 1;
        assert.equal(closeEnough(it.value, row[col]), true, p.id + " " + it.name + " " + it.value + " vs " + row[col]);
      }
    }
    if (p.unit && ds.unit) {
      const unit = String(p.unit).toLowerCase();
      const pool = String(ds.unit).toLowerCase();
      if (/per capita/.test(unit)) assert.match(pool, /per capita/, p.id);
    }
  }
  const rice = resolve("rice");
  assert.equal(rice.coverage, "partial");
  assert.match(rice.unit, /per capita/);
  assert.equal(rice.rows.length, 5);
});

test("a partial dataset lists only countries a curated puzzle already named", () => {
  const named = new Map();
  for (const p of puzzles.concat(namePuzzles, part1Puzzles)) {
    const ds = resolve(statKey(p));
    if (!ds || ds.coverage !== "partial") continue;
    if (!named.has(ds.id)) named.set(ds.id, new Set());
    const bag = named.get(ds.id);
    if (ds.kind === "groups") (p.items || []).forEach(it => bag.add(it.name));
    else (p.items || p.countries || []).forEach(it => bag.add(it.iso3 || isoOf(it.name)));
  }
  for (const ds of datasets) {
    if (ds.coverage !== "partial") continue;
    const bag = named.get(ds.id);
    assert.ok(bag && bag.size, ds.id);
    for (const row of ds.rows) {
      const id = ds.kind === "groups" ? row[0] : row[0];
      assert.equal(bag.has(id), true, ds.id + " invented " + id);
    }
  }
});

test("trends datasets stay high-internet lists", () => {
  const trends = datasets.filter(d => /trends|google search interest/i.test(d.id + " " + d.stat));
  assert.ok(trends.length >= 4);
  for (const ds of trends) {
    assert.equal(ds.hiNet, 1, ds.id);
    assert.match(ds.stat + " " + (ds.caveat || "") + " " + ds.src, /high internet|Google|Trends/i, ds.id);
  }
  const female = datasets.find(d => d.id === "unodc-homicide-female");
  const usa = female.rows.find(r => r[0] === "USA");
  assert.equal(usa[1], 2.55);
  assert.equal(String(usa[2]), "2023");
  for (const id of ["c-population", "d-population", "e-population", "g-population", "i-population", "k-population"]) {
    assert.equal(resolve("attr-" + id), null, id);
  }
  const caps = datasets.find(d => d.id === "national-capitals");
  assert.equal(caps.kind, "capitals");
  assert.equal(caps.coverage, "full");
  assert.ok(caps.rows.length >= 150);
  assert.equal(caps.rows[0].length, 4);
  assert.equal(resolve("southern-capitals").id, "national-capitals");
  assert.equal(resolve("northern-capitals").id, "national-capitals");
  const woman = datasets.find(d => d.id === "attr-never-woman-leader");
  assert.equal(woman.kind, "tier");
  assert.equal(woman.coverage, "full");
  assert.equal(woman.labels["1"], "Has had one");
  assert.equal(woman.question, "Has this country ever had a woman as head of state or government?");
  assert.equal(woman.labels["0"], "Never has");
  assert.equal(woman.rows.find(r => r[0] === "ITA")[1], 1);
  assert.equal(woman.rows.find(r => r[0] === "USA")[1], 0);
  assert.equal(woman.rows.find(r => r[0] === "ESP")[1], 1);
  assert.equal(woman.rows.some(r => r[0] === "CHN"), false);
  const kpop = datasets.find(d => d.id === "top-trends-kpop");
  assert.ok(kpop.rows.some(r => r[0] === "SGP" && r[1] === 95));
  assert.ok(kpop.rows.length > 6, "the full K-pop list stays, with Singapore filled in");
});

test("random generation never picks a sensitive dataset inside the AdSense window", () => {
  const inside = boot(new Date(2026, 10, 3));
  const outside = boot(new Date(2026, 10, 4));
  assert.equal(inside.window.RankdShared.inAdsenseSafeWindow(inside.window.RankdShared.todayKey()), true);
  assert.equal(outside.window.RankdShared.inAdsenseSafeWindow(outside.window.RankdShared.todayKey()), false);
  for (let seed = 1; seed <= 400; seed++) {
    const puzzle = inside.window.RankdPractice.generate(seed);
    assert.ok(puzzle, "seed " + seed);
    assert.equal(!!puzzle.sensitive, false, (puzzle.dataset || puzzle.sourceId || puzzle.id) + " on " + seed);
    if (puzzle.dataset) {
      const ds = resolve(puzzle.dataset);
      assert.ok(ds, puzzle.dataset);
      assert.equal(!!ds.sens, false, puzzle.dataset);
      if (ds.coverage === "partial") {
        const allowed = new Set(ds.kind === "groups" ? ds.rows.map(r => r[0]) : ds.rows.map(r => countries[r[0]][0]));
        for (const it of puzzle.items || []) assert.equal(allowed.has(it.name), true, puzzle.dataset + " " + it.name);
        if (ds.rows.length <= 6 && puzzle.type === "rank") assert.equal(puzzle.items.length, ds.rows.length, puzzle.dataset);
      }
      if (ds.hiNet) {
        const allowed = new Set(ds.rows.map(r => countries[r[0]][0]));
        for (const it of puzzle.items || puzzle.countries || []) assert.equal(allowed.has(it.name), true, it.name);
      }
    }
  }
  let sawSensitive = false;
  for (let seed = 1; seed <= 500 && !sawSensitive; seed++) {
    const puzzle = outside.window.RankdPractice.generate(seed);
    assert.ok(puzzle, "seed " + seed);
    if (puzzle.sensitive) sawSensitive = true;
  }
  assert.equal(sawSensitive, true);
});
