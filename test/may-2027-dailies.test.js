const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const search = require("../puzzle-search.js");

function load(file) {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), box, { filename: file });
  return box.window;
}

const puzzles = load("puzzles-data.js").RANKD_PUZZLES;
const names = load("name-puzzles.js").RANKD_NAME_PUZZLES;
const practice = load("practice-data.js").RANKD_PRACTICE;
const byId = id => puzzles.find(p => p.id === id);
const epoch = Date.UTC(2026, 9, 6);
const dateOf = order => new Date(epoch + (Math.round(order) - 1) * 864e5).toISOString().slice(0, 10);

test("new dailies take the days after 2027-05-03 and keep their answers", () => {
  assert.equal(dateOf(210), "2027-05-03");
  const expect = [
    ["billionaire-cities", 211, "2027-05-04", "Billionaire Cities", false],
    ["gambling-losses", 212, "2027-05-05", "Bad Bets", true],
    ["pyramids", 214, "2027-05-07", "Not Just Giza", false],
    ["elephants", 215, "2027-05-08", "Heavy Herds", false],
    ["western-capitals", 216, "2027-05-09", "Far West", false],
    ["italian-descent", 217, "2027-05-10", "Beyond Rome", false],
    ["english-speakers", 218, "2027-05-11", "Not Just the UK", false],
    ["plastic-surgery", 219, "2027-05-12", "New Faces", true],
  ];
  const orders = puzzles.map(p => Math.round(p.order));
  assert.equal(new Set(orders).size, orders.length);
  for (const [id, order, date, headline, sensitive] of expect) {
    const p = byId(id);
    assert.equal(p.type, "rank", id);
    assert.equal(Math.round(p.order), order, id);
    assert.equal(dateOf(p.order), date, id);
    assert.equal(p.headline, headline, id);
    assert.equal(!!p.sensitive, sensitive, id);
    assert.ok(dateOf(p.order) > "2026-11-03", id);
    assert.ok(p.fact && p.sourceUrl.startsWith("https://"), id);
    assert.equal(new Set(p.items.map(it => it.value)).size, p.items.length, id);
    assert.equal(search.matches(p, p.items[0].name.split(",")[0]), true, id);
  }
  assert.equal(JSON.stringify(byId("billionaire-cities").items.map(it => [it.name, it.value])), JSON.stringify([
    ["New York City, United States", 123],
    ["Moscow, Russia", 90],
    ["Hong Kong", 72],
    ["London, United Kingdom", 71],
    ["Beijing, China", 68],
    ["Mumbai, India", 67],
  ]));
  assert.equal(byId("billionaire-cities").year, "2025");
  assert.equal(JSON.stringify(byId("gambling-losses").items.map(it => [it.name, it.value])), JSON.stringify([
    ["Australia", 1635], ["Hong Kong", 1284], ["United States", 809], ["New Zealand", 584],
  ]));
  assert.match(byId("gambling-losses").unit, /per capita/);
  assert.match(byId("gambling-losses").fact, /per adult/);
  assert.equal(byId("gambling-losses").year, "2022");
  assert.equal(JSON.stringify(byId("pyramids").items.map(it => [it.name, it.value])), JSON.stringify([
    ["Sudan", 255], ["Egypt", 118], ["United States", 35], ["Peru", 26], ["Mexico", 20], ["Belize", 10],
  ]));
  assert.match(byId("pyramids").fact, /Meroë/);
  assert.equal(JSON.stringify(byId("elephants").items.map(it => [it.name, it.value])), JSON.stringify([
    ["Botswana", 131909], ["Gabon", 95000], ["Zimbabwe", 65028], ["Tanzania", 60000], ["Kenya", 36280], ["South Africa", 31324],
  ]));
  assert.match(byId("elephants").fact, /27,312/);
  const west = byId("western-capitals");
  assert.equal(west.dataset, "national-capitals");
  assert.equal(west.axis, "lon");
  assert.equal(west.higherIs, "bottom");
  assert.equal(JSON.stringify(west.items.map(it => [it.name, it.value, it.year])), JSON.stringify([
    ["Tonga", -175.2, "Nukuʻalofa"],
    ["Samoa", -171.83, "Apia"],
    ["Mexico", -99.14, "Mexico City"],
    ["Guatemala", -90.51, "Guatemala City"],
    ["El Salvador", -89.19, "San Salvador"],
    ["Belize", -88.77, "Belmopan"],
  ]));
  assert.match(west.fact, /does not wrap/);
  assert.match(west.fact, /Funafuti/);
  assert.equal(JSON.stringify(byId("italian-descent").items.map(it => [it.name, it.value])), JSON.stringify([
    ["Argentina", 54.71], ["Uruguay", 45.47], ["Paraguay", 32.47], ["Brazil", 15.57], ["France", 8.02],
  ]));
  assert.match(byId("italian-descent").unit, /per capita/);
  assert.match(byId("italian-descent").fact, /ancestry/);
  assert.equal(byId("italian-descent").items.some(it => it.name === "Italy"), false);
  assert.equal(JSON.stringify(byId("english-speakers").items.map(it => [it.name, it.value])), JSON.stringify([
    ["India", 269800000], ["Nigeria", 125039688], ["Pakistan", 108044691], ["Indonesia", 85968611], ["Philippines", 70117935],
  ]));
  assert.equal(byId("english-speakers").items.some(it => it.name === "United States"), false);
  assert.match(byId("english-speakers").fact, /United Kingdom/);
  const plastic = byId("plastic-surgery");
  assert.equal(JSON.stringify(plastic.items.map(it => [it.name, it.value])), JSON.stringify([
    ["Argentina", 26.48], ["Belgium", 18.84], ["Greece", 18.73], ["United States", 18.23], ["Brazil", 15.95], ["Germany", 14.9],
  ]));
  assert.match(plastic.unit, /per capita/);
  assert.match(plastic.fact, /South Korea/);
  assert.equal(plastic.year, "2023");
  assert.equal(plastic.items.some(it => it.name === "South Korea"), false);
});

test("the goddess name puzzle has exactly three answers and a practice row for each", () => {
  const puzzle = names.find(p => p.id === "name-named-for-her");
  assert.equal(JSON.stringify(puzzle.answers), JSON.stringify(["IRL", "LBY", "LCA"]));
  assert.match(puzzle.fact, /Ériu/);
  assert.match(puzzle.fact, /Saint Lucy/);
  assert.match(puzzle.fact, /Libya/);
  const Name = require("../name-it.js");
  const box = { window: { RANKD_NAME_COUNTRIES: load("name-puzzles.js").RANKD_NAME_COUNTRIES, RANKD_NAME_PUZZLES: names } };
  // passes() uses the country catalog from practice when present, else name countries.
  global.RANKD_NAME_COUNTRIES = box.window.RANKD_NAME_COUNTRIES;
  const passed = Object.entries(puzzle.values).filter(([iso]) => Name.passes(puzzle, iso)).map(([iso]) => iso);
  passed.sort();
  assert.equal(JSON.stringify(passed), JSON.stringify(["IRL", "LBY", "LCA"]));
  delete global.RANKD_NAME_COUNTRIES;
});

test("new datasets sit in the practice pool, and east and west capitals are both dealt", () => {
  const ds = id => practice.datasets.find(d => d.id === id);
  const cities = ds("forbes-billionaire-cities");
  assert.equal(cities.kind, "groups");
  assert.equal(cities.coverage, "full");
  assert.equal(cities.rows.length, 10);
  const gamble = ds("h2-gambling-losses-2022");
  assert.equal(gamble.coverage, "partial");
  assert.equal(gamble.sens, 1);
  assert.equal(gamble.rows.length, 4);
  assert.match(gamble.unit, /per capita/);
  assert.equal(ds("wpr-pyramids").coverage, "full");
  assert.equal(ds("wpr-pyramids").rows.length, 17);
  const elephants = ds("wpr-elephants");
  assert.equal(elephants.coverage, "full");
  assert.ok(elephants.rows.length >= 40);
  assert.equal(elephants.rows.find(r => r[0] === "IND")[1], 27312);
  const italian = ds("italian-descent-per-capita");
  assert.equal(italian.coverage, "full");
  assert.equal(italian.rows.some(r => r[0] === "ITA" || r[0] === "SMR" || r[0] === "VAT"), false);
  const english = ds("english-speakers");
  assert.equal(english.coverage, "full");
  assert.ok(english.rows.length > 100);
  assert.equal(english.rows.find(r => r[0] === "USA")[1], 299270000);
  const plastic = ds("isaps-procedures-per-capita");
  assert.equal(plastic.coverage, "full");
  assert.equal(plastic.sens, 1);
  assert.equal(plastic.rows.some(r => r[0] === "KOR"), false);
  assert.equal(plastic.year, "2023");
  const named = ds("name-named-for-her");
  assert.equal(named.coverage, "full");
  assert.equal(named.rows.find(r => r[0] === "IRL")[1], 1);
  assert.equal(named.rows.find(r => r[0] === "BRA")[1], 0);

  const caps = ds("national-capitals");
  const east = caps.rows.slice().sort((a, b) => b[2] - a[2])[0];
  assert.equal(east[0], "TUV");
  assert.equal(east[2], 179.12);

  function boot() {
    const document = {
      documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
      querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
      head: { appendChild() {} }, addEventListener() {},
    };
    const sandbox = {
      window: { RANKD_STUDIO: true }, document,
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      location: { protocol: "http:", pathname: "/", search: "", hostname: "localhost", hash: "" },
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      URLSearchParams, URL, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp,
      Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout,
      fetch: () => Promise.reject(new Error("no")), AbortController,
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
    return sandbox;
  }
  const app = boot();
  let sawEast = false;
  let sawWest = false;
  for (let seed = 1; seed <= 4000 && !(sawEast && sawWest); seed++) {
    const puzzle = app.window.RankdPractice.generate(seed);
    if (!puzzle || puzzle.dataset !== "national-capitals") continue;
    if (puzzle.headline === "Eastern Capitals" && puzzle.higherIs === "top") sawEast = true;
    if (puzzle.headline === "Western Capitals" && puzzle.higherIs === "bottom") sawWest = true;
  }
  assert.equal(sawEast, true);
  assert.equal(sawWest, true);
});
