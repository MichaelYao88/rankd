const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

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

test("DPI 2024 stores every surveyed country and the two rankers follow the release", () => {
  const w = boot();
  const stats = w.RANKD_NUMBER_STATS;
  const dem = stats.find(s => s.id === "dpi-country-democratic");
  const imp = stats.find(s => s.id === "dpi-democracy-important");
  const gap = stats.find(s => s.id === "dpi-democratic-deficit");
  assert.equal(dem.rows.length, 53);
  assert.equal(imp.rows.length, 53);
  assert.equal(gap.rows.length, 53);
  assert.match(dem.source, /Think about your country today/);
  assert.match(imp.source, /how important is it for your country to be a democracy/);
  const by = id => Object.fromEntries(dem.rows.map(r => [r[0], r[1]]));
  const share = by(dem);
  assert.equal(share.CHN, 79);
  assert.equal(share.CHE, 78);
  assert.equal(share.NOR, 77);
  assert.equal(share.DEU, 57);
  assert.equal(share.USA, 57);
  assert.equal(share.GBR, 55);
  assert.equal(share.FRA, 46);
  assert.equal(share.ISR, 83);
  assert.equal(share.VNM, 81);
  assert.equal(share.IRN, 25);
  const important = Object.fromEntries(imp.rows.map(r => [r[0], r[1]]));
  const deficit = Object.fromEntries(gap.rows.map(r => [r[0], r[1]]));
  assert.equal(important.GRC, 94);
  assert.equal(share.GRC, 43);
  assert.equal(deficit.GRC, 51);
  assert.equal(deficit.HUN, 50);
  assert.equal(deficit.VEN, 50);
  assert.equal(deficit.CHN, 13);
  assert.equal(deficit.ISR, 11);
  assert.equal(deficit.CHE, 11);
  // The release rounds the two shares, and its own deficit column is 1 point off that difference for some countries.
  assert.equal(important.FRA - share.FRA, 37);
  assert.equal(deficit.FRA, 38);

  const practice = w.RANKD_PRACTICE.datasets.filter(d => d.id.startsWith("dpi-"));
  assert.equal(practice.length, 5);
  for (const ds of practice) assert.equal(ds.rows.length, 53);

  const a = w.RANKD_PUZZLES.find(p => p.id === "dpi-country-democratic");
  const b = w.RANKD_PUZZLES.find(p => p.id === "dpi-democratic-deficit");
  assert.equal(JSON.stringify(a.items.map(it => [it.name, it.value])), JSON.stringify([
    ["China", 79], ["Switzerland", 78], ["Norway", 77], ["Germany", 57],
    ["United States", 57], ["United Kingdom", 55], ["France", 46],
  ]));
  assert.equal(JSON.stringify(b.items.map(it => [it.name, it.value])), JSON.stringify([
    ["Greece", 51], ["Hungary", 50], ["Venezuela", 50], ["France", 38], ["China", 13], ["Israel", 11],
  ]));
  assert.equal(a.poolFrom, "2027-05-21");
  assert.equal(b.poolFrom, "2027-05-21");
  assert.match(a.fact, /Freedom House 2024/);
  assert.match(a.fact, /restricted/);

  const through = "2027-02-01";
  for (let n = 0; w.RankdShared.keyFromDay(n) <= through; n++) {
    const parts = w.RankdBonus.parts(n);
    for (const p of parts) assert.equal(p.id === "dpi-country-democratic" || p.id === "dpi-democratic-deficit", false, p.id + " on " + w.RankdShared.keyFromDay(n));
  }
  let seenA = false, seenB = false;
  for (let n = 0; w.RankdShared.keyFromDay(n) <= "2027-06-30"; n++) {
    const parts = w.RankdBonus.parts(n);
    if (parts.some(p => p.id === "dpi-country-democratic")) seenA = true;
    if (parts.some(p => p.id === "dpi-democratic-deficit")) seenB = true;
  }
  assert.equal(seenA, true);
  assert.equal(seenB, true);
});
