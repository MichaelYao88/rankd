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
const SOURCE = "https://www.statista.com/chart/33160/respondents-who-follow-a-vegetarian-vegan-diet/";

test("vegetarianism by country is the next daily after 2027-04-13", () => {
  const p = byId("statista-vegetarian-vegan");
  assert.ok(p);
  assert.equal(p.headline, "Vegetarianism by country");
  assert.equal(p.type, "rank");
  assert.equal(p.order, 191);
  assert.equal(dateOf(p.order), "2027-04-14");
  assert.equal(dateOf(190), "2027-04-13");
  assert.equal(p.sensitive, undefined);
  assert.equal(p.unit, "% of adults");
  assert.equal(p.year, "2024");
  assert.equal(p.source, "Statista Consumer Insights");
  assert.equal(p.sourceUrl, SOURCE);
  const orders = puzzles.map(x => x.order);
  assert.equal(new Set(orders).size, orders.length);
});

test("the six cards are one Statista vegetarian-or-vegan chart, with global ties kept", () => {
  const p = byId("statista-vegetarian-vegan");
  assert.equal(p.higherIs, "top");
  assert.equal(p.valuesVisible, false);
  assert.deepEqual(p.items.map(it => [it.name, it.value, it.gRank, it.gTotal, it.gScope, it.year]), [
    ["India", 41, 1, 10, "surveyed countries", "2024"],
    ["South Africa", 11, 2, 10, "surveyed countries", "2024"],
    ["United States", 10, 3, 10, "surveyed countries", "2024"],
    ["China", 9, 5, 10, "surveyed countries", "2024"],
    ["France", 8, 6, 10, "surveyed countries", "2024"],
    ["Mexico", 5, 9, 10, "surveyed countries", "2024"],
  ]);
  assert.equal(new Set(p.items.map(it => it.value)).size, 6);
  assert.match(p.fact, /Mexico is tied with Brazil at 5%/);
  assert.match(p.fact, /United States at 10%/);
  assert.match(p.fact, /6% vegetarian plus 4% vegan/);
  assert.match(p.fact, /India is 41%/);
  assert.match(p.fact, /July 2023 to June 2024/);
  assert.equal(p.fact.includes("Vietnam"), false);
  assert.equal(p.fact.includes("Netherlands"), false);
  assert.equal(p.fact.includes("Russia"), false);
  assert.equal(search.matches(p, "India"), true);
  assert.equal(search.matches(p, "Mexico"), true);
  assert.equal(search.matches(p, "vegetarian"), true);
  const csv = fs.readFileSync(path.join(root, "puzzles.csv"));
  assert.equal(csv[0], 0xef);
  assert.equal(csv.includes(13), false);
  assert.match(csv.toString("utf8"), /statista-vegetarian-vegan,191,.*Vegetarianism by country\n/);
});

test("seeded comparison sits a little under a clear and uses the chart countries", () => {
  const stats = JSON.parse(fs.readFileSync(path.join(root, "community-stats.json"), "utf8"));
  const row = stats.puzzles["statista-vegetarian-vegan"];
  assert.ok(row);
  assert.equal(row.seeded, true);
  assert.ok(row.players >= 50);
  assert.equal(row.firstGuessWorld.players, 1);
  assert.ok(row.standing.avgTries >= 2.8 && row.standing.avgTries <= 3.6);
  assert.ok(row.standing.avgAccuracy >= 50 && row.standing.avgAccuracy <= 72);
  assert.equal(row.standing.firstOf, 6);
  assert.deepEqual(Object.keys(row.perItemCorrect), [
    "India", "South Africa", "United States", "China", "France", "Mexico",
  ]);
  const world = row.firstGuessWorld.bars.map(b => b.name);
  assert.deepEqual(world, ["India", "Mexico", "United States", "France", "China", "South Africa"]);
  for (const code of ["US", "TW", "SG"]) assert.equal(row.firstGuessByCountry[code].players, 1);
});
