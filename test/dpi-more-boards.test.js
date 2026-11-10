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

test("more DPI boards keep the 2024 shares and stay out of earlier bundles", () => {
  const w = boot();
  const byId = id => w.RANKD_PUZZLES.find(p => p.id === id);
  const rows = p => JSON.stringify(p.items.map(it => [it.name, it.value]));
  assert.equal(rows(byId("dpi-feels-israel-vietnam")), JSON.stringify([
    ["Israel", 83], ["Vietnam", 81], ["United States", 57], ["France", 46], ["Japan", 44], ["Greece", 43],
  ]));
  assert.equal(rows(byId("dpi-feels-singapore-japan")), JSON.stringify([
    ["Singapore", 75], ["India", 74], ["Hong Kong", 71], ["South Korea", 67], ["United Kingdom", 55], ["Japan", 44],
  ]));
  assert.equal(rows(byId("dpi-feels-above-nordics")), JSON.stringify([
    ["Vietnam", 81], ["China", 79], ["Singapore", 75], ["Denmark", 70], ["Sweden", 67], ["Netherlands", 53],
  ]));
  assert.equal(rows(byId("dpi-gap-ukraine")), JSON.stringify([
    ["Ukraine", 48], ["Turkey", 44], ["Italy", 37], ["Germany", 33], ["Denmark", 17], ["Vietnam", 12],
  ]));
  assert.equal(rows(byId("dpi-equal-rights-disagree")), JSON.stringify([
    ["Greece", 47], ["France", 36], ["United States", 34], ["Saudi Arabia", 10], ["Vietnam", 6], ["China", 5],
  ]));
  assert.equal(rows(byId("dpi-inequality-threat")), JSON.stringify([
    ["Greece", 82], ["Portugal", 80], ["United States", 66], ["China", 59], ["Vietnam", 59], ["Germany", 50],
  ]));
  const equal = w.RANKD_NUMBER_STATS.find(s => s.id === "dpi-equal-rights-disagree");
  const threat = w.RANKD_NUMBER_STATS.find(s => s.id === "dpi-inequality-threat");
  assert.equal(equal.rows.length, 53);
  assert.equal(threat.rows.length, 53);
  assert.equal(equal.rows.find(r => r[0] === "IRN")[1], 56);
  assert.equal(threat.rows.find(r => r[0] === "SAU")[1], 44);
  const ids = ["dpi-feels-israel-vietnam", "dpi-feels-singapore-japan", "dpi-feels-above-nordics", "dpi-gap-ukraine", "dpi-equal-rights-disagree", "dpi-inequality-threat"];
  for (const id of ids) {
    const p = byId(id);
    assert.equal(p.poolFrom, "2027-05-21");
    assert.match(p.fact, /speech is restricted/);
    const cast = p.items.map(it => it.name).sort().join("|");
    const existing = byId("dpi-country-democratic").items.map(it => it.name).sort().join("|");
    assert.notEqual(cast, existing);
  }
  const practice = w.RANKD_PRACTICE.datasets.find(d => d.id === "dpi-country-democratic");
  assert.equal(practice.rows.length, 53);
  const seen = new Set();
  for (let n = 0; w.RankdShared.keyFromDay(n) <= "2027-05-20"; n++) {
    for (const part of w.RankdBonus.parts(n)) assert.equal(ids.includes(part.id), false, part.id);
  }
  for (let n = 0; w.RankdShared.keyFromDay(n) <= "2027-12-31"; n++) {
    for (const part of w.RankdBonus.parts(n)) if (ids.includes(part.id)) seen.add(part.id);
  }
  for (const id of ids) assert.equal(seen.has(id), true, id);
});
