const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const epoch = Date.UTC(2026, 9, 6);
const dateOf = order => new Date(epoch + (Math.round(order) - 1) * 864e5).toISOString().slice(0, 10);

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

test("poultry and beef use the 2023 FAO supply series, in kg per person per year", () => {
  const w = boot();
  const poultry = w.RANKD_PUZZLES.find(p => p.id === "poultry-supply");
  const beef = w.RANKD_PUZZLES.find(p => p.id === "beef-supply");
  const poultryStat = w.RANKD_NUMBER_STATS.find(s => s.id === "fao-poultry-2023");
  const beefStat = w.RANKD_NUMBER_STATS.find(s => s.id === "fao-beef-2023");
  const poultrySet = w.RANKD_PRACTICE.datasets.find(d => d.id === "fao-poultry-2023");
  const beefSet = w.RANKD_PRACTICE.datasets.find(d => d.id === "fao-beef-2023");
  assert.equal(poultryStat.rows.length, 176);
  assert.equal(beefStat.rows.length, 176);
  assert.equal(poultrySet.coverage, "full");
  assert.equal(beefSet.rows.length, 176);
  assert.equal(poultryStat.rows.find(r => r[0] === "JPN"), undefined);
  assert.equal(poultryStat.rows.find(r => r[0] === "ISR")[1], 72.82);
  assert.equal(beefStat.rows.find(r => r[0] === "ARG")[1], 48.99);
  assert.equal(beefStat.rows.find(r => r[0] === "IND")[1], 2.32);
  for (const row of poultryStat.rows) {
    assert.equal(row[2], "2023");
    assert.equal(poultrySet.rows.find(r => r[0] === row[0])[1], row[1]);
  }
  assert.equal(poultry.unit, "kg per person per year");
  assert.equal(beef.stat, "Beef and buffalo meat supply, kg per person per year");
  assert.equal(poultry.higherIs, "top");
  assert.equal(poultry.valuesVisible, false);
  assert.equal(poultry.question.includes("Malaysia"), false);
  assert.equal(beef.question.includes("Zimbabwe"), false);
  assert.equal(JSON.stringify(poultry.items.map(it => [it.name, it.value])), JSON.stringify([
    ["United States", 54.54], ["Australia", 53.13], ["Malaysia", 51.9], ["Panama", 50.01], ["Qatar", 48.28], ["Brazil", 47.55],
  ]));
  assert.equal(JSON.stringify(beef.items.map(it => [it.name, it.value])), JSON.stringify([
    ["Zimbabwe", 45.48], ["Brazil", 39.07], ["United States", 37.04], ["Mongolia", 33.28], ["Uzbekistan", 32.27], ["Uruguay", 21.31],
  ]));
  const butcher = ["Israel", "Argentina", "Kazakhstan", "Croatia", "Hong Kong"];
  for (const name of butcher) {
    assert.equal(poultry.items.some(it => it.name === name), false, name);
    assert.equal(beef.items.some(it => it.name === name), false, name);
  }
  assert.match(poultry.fact, /51\.90 kg/);
  assert.match(poultry.fact, /72\.82 kg/);
  assert.match(poultry.fact, /ranki\.gg/);
  assert.match(beef.fact, /21\.31 kg/);
  assert.match(beef.fact, /48\.99/);
  assert.match(beef.fact, /2\.32/);
  assert.match(beef.fact, /ranki\.gg/);
  assert.match(poultry.source, /Food and Agriculture Organization/);
  assert.equal(poultry.sourceUrl, "https://ourworldindata.org/grapher/per-capita-meat-type");
  assert.equal(beef.sourceUrl, poultry.sourceUrl);
  assert.equal(poultry.order, 278);
  assert.equal(beef.order, 279);
  assert.equal(dateOf(278), "2027-07-10");
  assert.equal(dateOf(279), "2027-07-11");
  assert.equal(poultry.poolFrom, "2027-07-10");
  assert.equal(beef.poolFrom, "2027-07-11");
  const stats = JSON.parse(read("community-stats.json"));
  for (const id of [poultry.id, beef.id]) {
    const standing = stats.puzzles[id].standing;
    assert.equal(standing.n, 910);
    assert.ok(standing.avgTries >= 3.3 && standing.avgTries <= 4, standing.avgTries);
    assert.ok(standing.avgAccuracy >= 50 && standing.avgAccuracy <= 72, standing.avgAccuracy);
  }
  assert.notEqual(stats.puzzles[poultry.id].firstGuessWorld.bars[0].name, "United States");
  assert.notEqual(stats.puzzles[beef.id].firstGuessWorld.bars[0].name, "Zimbabwe");
  const seen = {};
  for (let n = 0; w.RankdShared.keyFromDay(n) <= "2027-12-31"; n++) {
    const day = w.RankdShared.keyFromDay(n);
    for (const part of w.RankdBonus.parts(n)) {
      if (part.id !== poultry.id && part.id !== beef.id) continue;
      assert.ok(day >= part.poolFrom, part.id + " " + day);
      if (!seen[part.id]) seen[part.id] = day + " " + part.role;
    }
  }
  assert.equal(seen[poultry.id], "2027-07-10 closer");
  assert.equal(seen[beef.id], "2027-07-11 closer");
});
