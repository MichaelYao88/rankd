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
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    head: { appendChild() {} }, addEventListener() {},
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
    fetch: () => Promise.reject(new Error("no")), AbortController,
  };
  appBox.globalThis = appBox;
  for (const key of ["document", "localStorage", "sessionStorage", "location", "matchMedia"]) appBox.window[key] = appBox[key];
  vm.createContext(appBox);
  for (const file of ["puzzles-data.js", "practice-data.js", "name-puzzles.js", "part1-puzzles.js", "invent-quiz.js", "number-stats.js", "number-puzzles.js", "number-guess.js", "app.js"]) {
    vm.runInContext(read(file), appBox, { filename: file });
  }
  return appBox.window;
}

const BOARD = [
  ["Male drivers, 75+", 25.25],
  ["Male drivers, 65–74", 24.67],
  ["Female drivers, 15–20", 22.74],
  ["Female drivers, 21–24", 19.6],
  ["Female drivers, 25–34", 15.86],
  ["Female drivers, 35–44", 12.38],
];
const SEX = [
  ["Male drivers, 15–20", 58.73],
  ["Male drivers, 21–24", 53.41],
  ["Male drivers, 25–34", 45.71],
  ["Male drivers, 35–44", 39.31],
  ["Male drivers, 45–54", 35.51],
  ["Male drivers, 55–64", 31.32],
  ["Male drivers, 75+", 25.25],
  ["Male drivers, 65–74", 24.67],
  ["Female drivers, 15–20", 22.74],
  ["Female drivers, 21–24", 19.6],
  ["Female drivers, 25–34", 15.86],
  ["Female drivers, 35–44", 12.38],
  ["Female drivers, 45–54", 10.83],
  ["Female drivers, 75+", 10.07],
  ["Female drivers, 55–64", 9.34],
  ["Female drivers, 65–74", 7.94],
];
const RACE = [
  ["American Indian or Alaska Native", 33.5],
  ["Black", 17.9],
  ["Hispanic", 14.2],
  ["Native Hawaiian or Pacific Islander", 13.4],
  ["White", 12.3],
  ["Asian", 4.5],
];

test("fatal-crash boards take the next two orders and keep one denominator each", () => {
  const w = boot();
  const sex = w.RANKD_PUZZLES.find(p => p.id === "fatal-licensed-drivers");
  const race = w.RANKD_PUZZLES.find(p => p.id === "fatal-crash-deaths-race");
  assert.equal(sex.order, 274);
  assert.equal(race.order, 275);
  assert.equal(dateOf(274), "2027-07-06");
  assert.equal(dateOf(275), "2027-07-07");
  assert.equal(sex.poolFrom, "2027-07-06");
  assert.equal(race.poolFrom, "2027-07-07");
  assert.equal(sex.unit, "per 100,000 licensed drivers");
  assert.equal(race.unit, "per 100,000 people");
  assert.equal(sex.stat, "Drivers in fatal crashes per 100,000 licensed drivers");
  assert.match(race.stat, /per 100,000 people/);
  assert.equal(sex.stat.includes("per 100,000 people"), false);
  assert.equal(race.question.toLowerCase().includes("driver"), false);
  assert.equal(sex.items.length, 6);
  assert.equal(JSON.stringify(sex.items.map(it => [it.name, it.value])), JSON.stringify(BOARD));
  const males = SEX.filter(row => row[0].startsWith("Male")).map(row => row[1]);
  const females = SEX.filter(row => row[0].startsWith("Female")).map(row => row[1]);
  assert.ok(Math.min(...males) > Math.max(...females));
  assert.equal(JSON.stringify(race.items.map(it => [it.name, it.value])), JSON.stringify(RACE));
  assert.match(sex.fact, /100,000 licensed drivers/);
  assert.match(sex.fact, /ranki\.gg/);
  assert.match(race.fact, /not drivers per licensed driver/);
  assert.match(race.fact, /ranki\.gg/);
  assert.equal(sex.sourceUrl, "https://crashstats.nhtsa.dot.gov/Api/Public/ViewPublication/813656");
  assert.equal(race.sourceUrl, "https://doi.org/10.1016/j.jsr.2025.03.005");
  const sexStat = w.RANKD_NUMBER_STATS.find(s => s.id === "nhtsa-fatal-licensed-2022");
  const raceStat = w.RANKD_NUMBER_STATS.find(s => s.id === "cdc-mvc-race-2022");
  assert.equal(sexStat.rows.length, 16);
  assert.equal(JSON.stringify(sexStat.rows.map(r => r[1])), JSON.stringify(SEX.map(r => r[1])));
  assert.equal(JSON.stringify(raceStat.rows.map(r => r[1])), JSON.stringify(RACE.map(r => r[1])));
  const sexDs = w.RANKD_PRACTICE.datasets.find(d => d.id === "nhtsa-fatal-licensed-2022");
  const raceDs = w.RANKD_PRACTICE.datasets.find(d => d.id === "cdc-mvc-race-2022");
  assert.equal(sexDs.kind, "groups");
  assert.equal(raceDs.kind, "groups");
  assert.equal(sexDs.rows.length, 16);
  assert.equal(raceDs.rows.length, 6);
  const ids = ["fatal-licensed-drivers", "fatal-crash-deaths-race"];
  for (let n = 0; w.RankdShared.keyFromDay(n) < "2027-07-06"; n++) {
    for (const part of w.RankdBonus.parts(n)) assert.equal(ids.includes(part.id), false, w.RankdShared.keyFromDay(n) + " " + part.id);
  }
  const seen = new Set();
  for (let n = 0; w.RankdShared.keyFromDay(n) <= "2027-12-31"; n++) {
    for (const part of w.RankdBonus.parts(n)) if (ids.includes(part.id)) seen.add(part.id + "@" + w.RankdShared.keyFromDay(n));
  }
  assert.ok([...seen].some(s => s.startsWith("fatal-licensed-drivers@")));
  assert.ok([...seen].some(s => s.startsWith("fatal-crash-deaths-race@")));
});
