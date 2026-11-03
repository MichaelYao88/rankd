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
const practice = load("practice-data.js").RANKD_PRACTICE;
const byId = id => puzzles.find(p => p.id === id);
const epoch = Date.UTC(2026, 9, 6);
const dateOf = order => new Date(epoch + (Math.round(order) - 1) * 864e5).toISOString().slice(0, 10);
const WIKI = "https://en.wikipedia.org/wiki/Names_of_the_days_of_the_week";

test("weekday names take the day after 2027-05-16", () => {
  assert.equal(dateOf(223), "2027-05-16");
  const p = byId("weekday-name-origin");
  assert.equal(p.type, "tier");
  assert.equal(Math.round(p.order), 224);
  assert.equal(dateOf(p.order), "2027-05-17");
  assert.equal(p.headline, "Day Names");
  assert.equal(p.question, "Where do their weekday names come from?");
  assert.equal(p.sourceUrl, WIKI);
  assert.equal(p.sensitive, undefined);
  assert.equal(p.dataset, "weekday-name-origin");
  const orders = puzzles.map(x => Math.round(x.order));
  assert.equal(new Set(orders).size, orders.length);
  assert.equal(search.matches(p, "Portugal"), true);
  assert.equal(search.matches(p, p.items[0].name), true);
});

test("each country is in the tier its main language clearly uses", () => {
  const p = byId("weekday-name-origin");
  assert.equal(JSON.stringify(p.tiers.map(t => [t.label, t.value])), JSON.stringify([
    ["Gods & planets", 3],
    ["Numbers", 2],
    ["Elements", 1],
  ]));
  const placed = p.items.map(it => [it.iso3, it.value, p.tiers[it.tierIndex].label]);
  assert.equal(JSON.stringify(placed), JSON.stringify([
    ["GBR", 3, "Gods & planets"],
    ["VNM", 2, "Numbers"],
    ["JPN", 1, "Elements"],
    ["IND", 3, "Gods & planets"],
    ["CHN", 2, "Numbers"],
    ["FRA", 3, "Gods & planets"],
    ["KOR", 1, "Elements"],
    ["PRT", 2, "Numbers"],
  ]));
  for (const iso of ["GRC", "RUS", "IRN", "DEU", "BRA"]) {
    assert.equal(p.items.some(it => it.iso3 === iso), false, iso);
  }
  assert.match(p.fact, /segunda-feira/);
  assert.match(p.fact, /mardi/);
  assert.match(p.fact, /Somvar/);
  assert.match(p.fact, /thứ hai/);
  assert.match(p.fact, /星期一/);
  assert.match(p.fact, /火曜日/);
  assert.match(p.fact, /화요일/);
  assert.match(p.source, /Martin of Braga/);
  assert.match(p.source, /星期日/);
  assert.match(p.source, /Paraskevi/);
  const ds = practice.datasets.find(d => d.id === "weekday-name-origin");
  assert.equal(ds.kind, "tier");
  assert.equal(ds.coverage, "partial");
  assert.equal(ds.sens, 0);
  assert.equal(ds.question, p.question);
  assert.equal(ds.labels["3"], "Gods & planets");
  assert.equal(ds.labels["2"], "Numbers");
  assert.equal(ds.labels["1"], "Elements");
  assert.equal(JSON.stringify(ds.rows), JSON.stringify(p.items.map(it => [it.iso3, it.value])));
  assert.match(ds.caveat, /Greek/);
  assert.match(ds.caveat, /Russian/);
  assert.match(ds.caveat, /Persian/);
});
