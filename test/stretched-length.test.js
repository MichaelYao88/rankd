const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const search = require("../puzzle-search.js");
const box = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "puzzles-data.js"), "utf8"), box, { filename: "puzzles-data.js" });
const puzzles = JSON.parse(JSON.stringify(box.window.RANKD_PUZZLES));
const byId = id => puzzles.find(p => p.id === id);
const epoch = Date.UTC(2026, 9, 6);
const dateOf = order => new Date(epoch + (Math.round(order) - 1) * 864e5).toISOString().slice(0, 10);
const SOURCE = "https://doi.org/10.1111/bju.13010";

test("clinician-measured stretched length is the next daily after vegetarianism", () => {
  const p = byId("stretched-length");
  const girth = byId("penis-girth");
  assert.ok(p);
  assert.equal(p.headline, "Measured Up");
  assert.equal(p.type, "rank");
  assert.equal(p.order, 192);
  assert.equal(dateOf(p.order), "2027-04-15");
  assert.equal(dateOf(191), "2027-04-14");
  assert.equal(byId("statista-vegetarian-vegan").order, 191);
  assert.ok(dateOf(p.order) > "2026-11-03");
  assert.equal(p.sensitive, true);
  assert.equal(byId("statista-vegetarian-vegan").sensitive, undefined);
  assert.equal(p.unit, "cm, stretched length (measured)");
  assert.equal(p.year, "1993-2021");
  assert.equal(p.higherIs, "top");
  assert.equal(p.valuesVisible, false);
  assert.match(p.source, /Veale et al\. 2015/);
  assert.match(p.source, /original studies, measured by clinicians/);
  assert.equal(p.sourceUrl, SOURCE);
  assert.equal(p.headline === girth.headline, false);
  assert.equal(p.question === girth.question, false);
  const orders = puzzles.map(x => x.order);
  assert.equal(new Set(orders).size, orders.length);
  assert.equal(puzzles.filter(x => x.headline === "Measured Up").length, 1);
});

test("the five cards are one clinician-measured study each, with no world-rank claim", () => {
  const p = byId("stretched-length");
  assert.deepEqual(p.items.map(it => [it.name, it.value, it.year, it.gRank, it.gTotal]), [
    ["Nigeria", 13.7, "2021 · n=271", undefined, undefined],
    ["China", 12.9, "2014 · n=5,196", undefined, undefined],
    ["United States", 12.45, "1996 · n=80", undefined, undefined],
    ["South Korea", 11.7, "2011 · n=144", undefined, undefined],
    ["Canada", 9.4, "1993 · n=63", undefined, undefined],
  ]);
  assert.equal(new Set(p.items.map(it => it.value)).size, 5);
  assert.match(p.fact, /China out-measures the United States and Canada/);
  assert.match(p.fact, /12\.9 cm versus 12\.45 cm and 9\.4 cm/);
  assert.match(p.fact, /not a ranking of populations/);
  assert.match(p.fact, /Canada's figure is 63 men/);
  assert.match(p.fact, /US study is 80/);
  assert.match(p.fact, /5,196 men/);
  assert.match(p.fact, /13\.7 cm \(n=271\)/);
  assert.match(p.fact, /11\.7 cm \(n=144\)/);
  assert.match(p.fact, /not self-reported/);
  assert.match(p.fact, /Wessells et al\. 1996/);
  assert.match(p.fact, /Choi et al\. 2011/);
  assert.match(p.fact, /Siminoski and Bain 1993/);
  assert.match(p.fact, /Chen XB et al\. 2014/);
  assert.match(p.fact, /Takure et al\. 2021/);
  assert.equal(/\b(race|racial|black|white|slur)\b/i.test(`${p.headline} ${p.question} ${p.stat} ${p.fact}`), false);
  assert.equal(search.matches(p, "Nigeria"), true);
  assert.equal(search.matches(p, "Canada"), true);
  assert.equal(search.matches(p, "China"), true);
  assert.equal(search.matches(p, "penis"), true);
  assert.equal(search.matches(p, "stretched"), true);
  assert.equal(search.matches(p, "Measured Up"), true);
  const csv = fs.readFileSync(path.join(root, "puzzles.csv"));
  assert.equal(csv[0], 0xef);
  assert.equal(csv.includes(13), false);
  assert.match(csv.toString("utf8"), /stretched-length,192,.*Measured Up\n/);
});

test("seeded comparison sits a little under a clear and uses the five studies", () => {
  const stats = JSON.parse(fs.readFileSync(path.join(root, "community-stats.json"), "utf8"));
  const row = stats.puzzles["stretched-length"];
  assert.ok(row);
  assert.equal(row.seeded, true);
  assert.ok(row.players >= 50);
  assert.equal(row.firstGuessWorld.players, 1);
  assert.ok(row.standing.avgTries >= 2.8 && row.standing.avgTries <= 3.6);
  assert.ok(row.standing.avgAccuracy >= 50 && row.standing.avgAccuracy <= 72);
  assert.equal(row.standing.firstOf, 5);
  assert.deepEqual(Object.keys(row.perItemCorrect), [
    "Nigeria", "China", "United States", "South Korea", "Canada",
  ]);
  const world = row.firstGuessWorld.bars.map(b => b.name);
  assert.deepEqual(world, ["China", "United States", "South Korea", "Canada", "Nigeria"]);
  for (const code of ["US", "TW", "SG"]) assert.equal(row.firstGuessByCountry[code].players, 1);
});
