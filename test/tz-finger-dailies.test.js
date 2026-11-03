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
const WIKI = "https://en.wikipedia.org/wiki/List_of_time_zones_by_country";
const BBC = "https://www.bbc.com/future/article/20210902-how-finger-counting-gives-away-your-nationality";

test("finger counting and time zones take the days after 2027-05-12", () => {
  assert.equal(dateOf(219), "2027-05-12");
  const expect = [
    ["finger-count-one-hand", "tier", 220, "2027-05-13", "Past Five"],
    ["one-time-zone-pop", "rank", 221, "2027-05-14", "One Clock"],
    ["one-time-zone-pop-ex-giants", "rank", 222, "2027-05-15", "Next in Line"],
    ["time-zones-by-country", "tier", 223, "2027-05-16", "Many Clocks"],
  ];
  const orders = puzzles.map(p => Math.round(p.order));
  assert.equal(new Set(orders).size, orders.length);
  for (const [id, type, order, date, headline] of expect) {
    const p = byId(id);
    assert.equal(p.type, type, id);
    assert.equal(Math.round(p.order), order, id);
    assert.equal(dateOf(p.order), date, id);
    assert.equal(p.headline, headline, id);
    assert.equal(p.sensitive, undefined, id);
    assert.ok(dateOf(p.order) > "2026-11-03", id);
    assert.ok(p.fact && p.sourceUrl.startsWith("https://"), id);
    assert.equal(search.matches(p, p.items[0].name.split(",")[0]), true, id);
  }
  assert.equal(names.some(p => /execution/i.test(p.id + p.headline)), false);
});

test("past five uses only the one-hand methods the BBC article states", () => {
  const p = byId("finger-count-one-hand");
  assert.equal(p.sourceUrl, BBC);
  assert.equal(p.year, "2021");
  assert.equal(p.unit, "on one hand");
  assert.equal(JSON.stringify(p.tiers.map(t => [t.label, t.value])), JSON.stringify([
    ["Counts past 5 on one hand", 1],
    ["Counts only to 5 on one hand", 0],
  ]));
  const tierOf = iso => p.tiers[p.items.find(it => it.iso3 === iso).tierIndex].label;
  assert.equal(tierOf("IND"), "Counts past 5 on one hand");
  assert.equal(tierOf("CHN"), "Counts past 5 on one hand");
  assert.equal(tierOf("GBR"), "Counts only to 5 on one hand");
  assert.equal(tierOf("USA"), "Counts only to 5 on one hand");
  assert.equal(tierOf("IRN"), "Counts only to 5 on one hand");
  assert.equal(JSON.stringify(p.items.map(it => [it.iso3, it.value])), JSON.stringify([
    ["USA", 5], ["IND", 20], ["IRN", 5], ["CHN", 10], ["GBR", 5],
  ]));
  for (const name of ["Pakistan", "Bangladesh", "Vietnam", "Turkey", "Egypt", "Japan"]) {
    assert.equal(p.items.some(it => it.name === name), false, name);
  }
  assert.match(p.fact, /20/);
  assert.match(p.fact, /pinky/);
  assert.match(p.fact, /does not name Pakistan/);
  const ds = practice.datasets.find(d => d.id === "finger-count-one-hand");
  assert.equal(ds.kind, "tier");
  assert.equal(ds.coverage, "partial");
  assert.equal(ds.sens, 0);
  assert.equal(JSON.stringify(ds.rows.map(r => r[0]).sort()), JSON.stringify(["CHN", "GBR", "IND", "IRN", "USA"]));
});

test("one clock ranks 2024 population for Wikipedia's single time zone", () => {
  const p = byId("one-time-zone-pop");
  assert.equal(p.sourceUrl, WIKI);
  assert.equal(p.year, "2024");
  assert.equal(p.unit, "people");
  assert.equal(p.higherIs, "top");
  assert.equal(JSON.stringify(p.items.map(it => [it.name, it.value, it.gRank, it.gTotal])), JSON.stringify([
    ["India", 1450935791, 1, 172],
    ["China", 1408975000, 2, 172],
    ["Pakistan", 251269164, 3, 172],
    ["Nigeria", 232679478, 4, 172],
    ["Bangladesh", 173562364, 5, 172],
    ["Ethiopia", 132059767, 6, 172],
  ]));
  assert.equal(new Set(p.items.map(it => it.value)).size, 6);
  assert.match(p.fact, /Xinjiang/);
  assert.match(p.fact, /11 zones/);
  assert.match(p.fact, /Ethiopia/);
  assert.equal(p.items.some(it => it.name === "United States"), false);
  const ds = practice.datasets.find(d => d.id === "one-time-zone-pop");
  assert.equal(ds.coverage, "full");
  assert.equal(ds.rows.length, 172);
  assert.equal(ds.rows.some(r => r[0] === "USA" || r[0] === "FRA" || r[0] === "IDN"), false);
  assert.equal(ds.rows.find(r => r[0] === "IND")[1], 1450935791);
  assert.equal(ds.rows.find(r => r[0] === "JPN")[1], 123975371);
});

test("next in line is the same one-zone list without China and India", () => {
  const p = byId("one-time-zone-pop-ex-giants");
  assert.equal(p.sourceUrl, WIKI);
  assert.equal(JSON.stringify(p.items.map(it => [it.name, it.value, it.gRank, it.gTotal])), JSON.stringify([
    ["Pakistan", 251269164, 1, 170],
    ["Nigeria", 232679478, 2, 170],
    ["Bangladesh", 173562364, 3, 170],
    ["Ethiopia", 132059767, 4, 170],
    ["Japan", 123975371, 5, 170],
    ["Egypt", 116538258, 6, 170],
  ]));
  assert.equal(p.items.some(it => it.name === "China" || it.name === "India"), false);
  assert.match(p.fact, /Philippines/);
  assert.match(p.fact, /123,975,371/);
  const full = practice.datasets.find(d => d.id === "one-time-zone-pop");
  const ds = practice.datasets.find(d => d.id === "one-time-zone-pop-ex-giants");
  assert.equal(ds.coverage, "full");
  assert.equal(ds.rows.length, 170);
  assert.equal(ds.rows.some(r => r[0] === "CHN" || r[0] === "IND"), false);
  assert.equal(ds.rows[5][0], "EGY");
  assert.equal(ds.rows[6][0], "PHL");
  assert.equal(ds.rows[6][1], 115843670);
  const fullIsos = new Set(full.rows.map(r => r[0]));
  for (const row of ds.rows) {
    assert.equal(fullIsos.has(row[0]), true, row[0]);
    assert.equal(full.rows.find(r => r[0] === row[0])[1], row[1], row[0]);
  }
});

test("many clocks buckets Wikipedia's zone counts and keeps the territory rule", () => {
  const p = byId("time-zones-by-country");
  assert.equal(p.sourceUrl, WIKI);
  assert.equal(JSON.stringify(p.tiers.map(t => t.label)), JSON.stringify(["10 or more", "5 to 9", "2 to 4", "1"]));
  const placed = p.items.map(it => [it.iso3, it.value, p.tiers[it.tierIndex].label]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  assert.equal(JSON.stringify(placed), JSON.stringify([
    ["CHN", 1, "1"],
    ["FRA", 12, "10 or more"],
    ["GBR", 9, "5 to 9"],
    ["KIR", 3, "2 to 4"],
    ["USA", 11, "10 or more"],
    ["ZAF", 2, "2 to 4"],
  ]));
  assert.match(p.fact, /Antarctic/);
  assert.match(p.fact, /Prince Edward/);
  assert.match(p.fact, /Russia/);
  assert.match(p.fact, /Australia/);
  const ds = practice.datasets.find(d => d.id === "wiki-time-zones");
  assert.equal(ds.kind, "tier");
  assert.equal(ds.coverage, "full");
  assert.equal(ds.rows.length, 197);
  const zone = iso => ds.rows.find(r => r[0] === iso)[1];
  assert.equal(zone("FRA"), 12);
  assert.equal(zone("RUS"), 11);
  assert.equal(zone("USA"), 11);
  assert.equal(zone("GBR"), 9);
  assert.equal(zone("AUS"), 9);
  assert.equal(zone("CAN"), 5);
  assert.equal(zone("NZL"), 5);
  assert.equal(zone("DNK"), 4);
  assert.equal(zone("KIR"), 3);
  assert.equal(zone("ZAF"), 2);
  assert.equal(zone("CHN"), 1);
  assert.equal(zone("IND"), 1);
  assert.equal(zone("KAZ"), 1);
  assert.equal(ds.rows.some(r => r[1] === 6 || r[1] === 7 || r[1] === 8 || r[1] === 10), false);
  for (const iso of ["XKX", "ASM", "GRL", "PRI", "ATA"]) assert.equal(ds.rows.some(r => r[0] === iso), false, iso);
  for (const iso of ["HKG", "MAC", "TWN"]) assert.equal(zone(iso), 1, iso);
});
