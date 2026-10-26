const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const search = require("../puzzle-search.js");
const dataBox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "puzzles-data.js"), "utf8"), dataBox, { filename: "puzzles-data.js" });
const puzzles = JSON.parse(JSON.stringify(dataBox.window.RANKD_PUZZLES));
const byId = id => puzzles.find(p => p.id === id);
const epoch = Date.UTC(2026, 9, 6);
const dateOf = order => new Date(epoch + (Math.round(order) - 1) * 864e5).toISOString().slice(0, 10);

const SOURCE_URL = "https://www.ipsos.com/sites/default/files/ct/news/documents/2023-05/Ipsos%20LGBT+%20Pride%202023%20Global%20Survey%20Report%20-%20rev.pdf";
const SURVEY = [
  ["Switzerland", 6, 1], ["Thailand", 5, 2], ["Italy", 4, 3], ["Sweden", 4, 3], ["Germany", 4, 3], ["Spain", 4, 3],
  ["France", 3, 7], ["Brazil", 3, 7], ["Japan", 3, 7], ["Romania", 3, 7], ["Canada", 3, 7], ["Singapore", 3, 7],
  ["Chile", 3, 7], ["Mexico", 3, 7], ["Netherlands", 2, 15], ["South Africa", 2, 15], ["Australia", 2, 15],
  ["Ireland", 2, 15], ["South Korea", 2, 15], ["Belgium", 2, 15], ["United States", 2, 15], ["Colombia", 2, 15],
  ["Great Britain", 2, 15], ["Poland", 2, 15], ["New Zealand", 2, 15], ["Turkey", 2, 15], ["Portugal", 1, 27],
  ["Peru", 1, 27], ["Argentina", 1, 27], ["Hungary", 1, 27],
];
const ALLOWED = new Set(SURVEY.map(row => row[0]));

function beats(a, b) {
  return a.value > b.value;
}
function tieRank(list, c) {
  return 1 + list.filter(x => beats(x, c)).length;
}

test("both puzzles use the 2023 Ipsos gender-identity net, after the queued dailies", () => {
  const top = byId("ipsos-gender-identity");
  const rank = byId("ipsos-gender-identity-b");
  assert.ok(top && rank);
  assert.equal(top.type, "top5");
  assert.equal(rank.type, "rank");
  assert.equal(top.order, 168);
  assert.equal(rank.order, 169);
  assert.equal(dateOf(top.order), "2027-03-22");
  assert.equal(dateOf(rank.order), "2027-03-23");
  assert.ok(dateOf(top.order) > "2026-11-03");
  assert.ok(dateOf(rank.order) > "2027-03-21");
  for (const p of [top, rank]) {
    assert.equal(p.unit, "% of adults");
    assert.equal(p.sourceUrl, SOURCE_URL);
    assert.match(p.question, /online survey of adults/);
    assert.match(p.question, /Transgender, non-binary, gender-fluid or other/);
    assert.match(p.fact, /online survey of adults/);
    assert.match(p.fact, /Gen Z/);
    assert.match(p.fact, /Boomers/);
    assert.equal(p.sensitive, true);
  }
  assert.equal(rank.items.length, 6);
  assert.equal(top.countries.length, 30);
  for (const c of top.countries) assert.ok(ALLOWED.has(c.name), c.name);
  for (const it of rank.items) assert.ok(ALLOWED.has(it.name), it.name);
  const names = new Set([...top.countries.map(c => c.name)]);
  assert.equal(names.size, 30);
  assert.equal(top.countries.some(c => c.name === "India"), false);
});

test("the Top 5 decoy is the United States at its real rank, and Spain's tie is disclosed", () => {
  const top = byId("ipsos-gender-identity");
  const byName = Object.fromEntries(top.countries.map(c => [c.name, c]));
  for (const [name, value, rank] of SURVEY) {
    assert.equal(byName[name].value, value, name);
    assert.equal(tieRank(top.countries, byName[name]), rank, name);
  }
  assert.equal(top.decoy.name, "United States");
  assert.equal(top.decoy.iso3, "USA");
  assert.equal(top.decoy.value, 2);
  assert.equal(top.decoy.rank, 15);
  assert.equal(top.decoy.year, "2023");
  assert.match(top.fact, /Spain is also 4%/);
  const hand = ["Switzerland", "Thailand", "Italy", "Sweden", "Germany", "United States"];
  for (const name of hand) assert.ok(byName[name], name);
  const overlap = byId("ipsos-gender-identity-b").items.map(it => it.name).filter(name => hand.includes(name));
  assert.deepEqual(overlap, []);
});

test("the ranker mixes an expected-high country with higher and lower ones", () => {
  const rank = byId("ipsos-gender-identity-b");
  assert.deepEqual(rank.items.map(it => [it.name, it.value, it.gRank, it.gTotal, it.gScope]), [
    ["Spain", 4, 3, 30, "surveyed countries"],
    ["Japan", 3, 7, 30, "surveyed countries"],
    ["Canada", 3, 7, 30, "surveyed countries"],
    ["Netherlands", 2, 15, 30, "surveyed countries"],
    ["Australia", 2, 15, 30, "surveyed countries"],
    ["Hungary", 1, 27, 30, "surveyed countries"],
  ]);
  assert.match(rank.fact, /Netherlands/);
  assert.match(rank.fact, /Spain/);
  assert.match(rank.fact, /Japan/);
});

test("search finds both puzzles by country and by the measure", () => {
  const top = byId("ipsos-gender-identity");
  const rank = byId("ipsos-gender-identity-b");
  assert.equal(search.matches(top, "Switzerland"), true);
  assert.equal(search.matches(top, "US"), true);
  assert.equal(search.matches(top, "transgender"), true);
  assert.equal(search.matches(rank, "Netherlands"), true);
  assert.equal(search.matches(rank, "Japan"), true);
  assert.equal(search.matches(rank, "gender-fluid"), true);
});

test("seeded comparison sits a little under a clear and names the same countries", () => {
  const stats = JSON.parse(fs.readFileSync(path.join(root, "community-stats.json"), "utf8"));
  for (const id of ["ipsos-gender-identity", "ipsos-gender-identity-b"]) {
    const row = stats.puzzles[id];
    assert.ok(row, id);
    assert.equal(row.seeded, true);
    assert.ok(row.players >= 50, id);
    assert.equal(row.firstGuessWorld.players, 1);
    assert.ok(row.standing);
    assert.ok(row.standing.avgTries >= 2.8 && row.standing.avgTries <= 3.6, id + " tries");
    assert.ok(row.standing.avgAccuracy >= 50 && row.standing.avgAccuracy <= 72, id + " acc");
    assert.ok(row.countryBoard.length >= 6, id);
  }
  const rank = stats.puzzles["ipsos-gender-identity-b"];
  assert.deepEqual(Object.keys(rank.perItemCorrect), [
    "Spain", "Japan", "Canada", "Netherlands", "Australia", "Hungary",
  ]);
  assert.equal(rank.standing.firstOf, 6);
  const top = stats.puzzles["ipsos-gender-identity"];
  assert.equal(top.type, "top5");
  assert.ok(top.firstGuess.some(bar => bar.name === "United States"));
  assert.equal(top.standing.firstOf, 5);
});
