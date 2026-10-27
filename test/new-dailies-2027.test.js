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

const OWID_10 = "https://ourworldindata.org/grapher/wealth-share-richest?quantile=richest_10pct";
const OWID_1 = "https://ourworldindata.org/grapher/wealth-share-richest?quantile=richest_1pct";
const OWID_MEAT = "https://ourworldindata.org/grapher/per-capita-meat-type";
const FAO_SUA = "https://data.apps.fao.org/catalog/dataset/e463c4cc-0ed1-4ef8-80c5-2add3a0b75ca";
const UNODC = "https://www.unodc.org/unodc/en/data-and-analysis/world-drug-report-2026-annex.html";
const WB = "https://data.worldbank.org/indicator/EN.POP.DNST";

test("new dailies take the next free days after 2027-04-08", () => {
  assert.equal(dateOf(185), "2027-04-08");
  assert.deepEqual(["wealth-share-top10", "wealth-share-top1", "match-meat-cuts", "cocaine-destination", "top1-pop-density"].map(id => {
    const p = byId(id);
    return [p.id, p.order, dateOf(p.order), p.headline];
  }), [
    ["wealth-share-top10", 186, "2027-04-09", "The Top Tenth"],
    ["wealth-share-top1", 187, "2027-04-10", "One Percent"],
    ["match-meat-cuts", 188, "2027-04-11", "Butcher Board"],
    ["cocaine-destination", 189, "2027-04-12", "Long Haul"],
    ["top1-pop-density", 190, "2027-04-13", "Packed In"],
  ]);
  const orders = puzzles.map(p => p.order);
  assert.equal(new Set(orders).size, orders.length);
  assert.equal(new Set(puzzles.map(p => p.id)).size, puzzles.length);
  const fresh = ["The Top Tenth", "One Percent", "Butcher Board", "Long Haul", "Packed In"];
  for (const headline of fresh) {
    assert.equal(puzzles.filter(p => p.headline === headline).length, 1, headline);
  }
});

test("richest 10% and richest 1% use WID 2024 shares, not a per-capita unit", () => {
  const top10 = byId("wealth-share-top10");
  const top1 = byId("wealth-share-top1");
  assert.equal(top10.type, "rank");
  assert.equal(top1.type, "rank");
  assert.equal(top10.year, "2024");
  assert.equal(top1.year, "2024");
  assert.equal(top10.unit, "% of private wealth");
  assert.equal(top1.unit, "% of private wealth");
  assert.equal(top10.unit.includes("per capita"), false);
  assert.equal(top10.sourceUrl, OWID_10);
  assert.equal(top1.sourceUrl, OWID_1);
  assert.match(top10.source, /World Inequality Database/);
  assert.deepEqual(top10.items.map(it => [it.name, it.value, it.gRank, it.gTotal, it.year]), [
    ["South Africa", 85.67, 1, 215, "2024"],
    ["United States", 69.54, 21, 215, "2024"],
    ["China", 68.05, 24, 215, "2024"],
    ["United Arab Emirates", 62.28, 69, 215, "2024"],
    ["Singapore", 61.46, 109, 215, "2024"],
    ["Kazakhstan", 59.9, 136, 215, "2024"],
  ]);
  assert.deepEqual(top1.items.map(it => [it.name, it.value, it.gRank, it.gTotal]), [
    ["Russia", 48.99, 2, 215],
    ["India", 40.14, 6, 215],
    ["United States", 34.78, 26, 215],
    ["Germany", 27.85, 76, 215],
    ["South Korea", 26.1, 126, 215],
    ["Denmark", 20.76, 210, 215],
  ]);
  for (const p of [top10, top1]) {
    assert.equal(p.sensitive, undefined);
    assert.match(p.fact, /2024/);
    assert.equal(p.sourceUrl.startsWith("https://"), true);
    assert.equal(new Set(p.items.map(it => it.value)).size, p.items.length);
  }
  assert.match(top10.fact, /South Africa/);
  assert.match(top10.fact, /United States/);
  assert.match(top1.fact, /shock-therapy/);
  assert.match(top1.fact, /Denmark/);
  assert.equal(search.matches(top10, "Kazakhstan"), true);
  assert.equal(search.matches(top1, "richest 1%"), true);
});

test("butcher board matches distinct per-capita leaders and does not call Kazakhstan the horse #1", () => {
  const meat = byId("match-meat-cuts");
  assert.equal(meat.type, "match");
  assert.equal(meat.unit, "kg/yr per capita");
  assert.match(meat.question, /1 million/);
  assert.match(meat.fact, /kg\/yr per capita/);
  assert.equal(meat.people.length, 6);
  assert.equal(new Set(meat.people.map(p => p.name)).size, 6);
  assert.equal(new Set(meat.people.map(p => p.clue)).size, 6);
  const byName = Object.fromEntries(meat.people.map(p => [p.name, p]));
  assert.equal(byName.Mongolia.clue, "Eats the most sheep and goat meat per person");
  assert.match(byName.Mongolia.fact, /69\.40 kg\/yr per capita/);
  assert.equal(byName.Israel.clue, "Eats the most poultry per person");
  assert.match(byName.Israel.fact, /72\.82 kg\/yr per capita/);
  assert.match(byName.Israel.fact, /1 million/);
  assert.equal(byName.Argentina.clue, "Eats the most beef per person");
  assert.match(byName.Argentina.fact, /48\.99 kg\/yr per capita/);
  assert.equal(byName.Kazakhstan.clue, "Eats the most horse meat per person after Mongolia");
  assert.match(byName.Kazakhstan.fact, /8\.38 kg\/yr per capita/);
  assert.match(byName.Kazakhstan.fact, /second to Mongolia/);
  assert.equal(byName.Croatia.clue, "Eats the most pork per person");
  assert.match(byName.Croatia.fact, /61\.06 kg\/yr per capita/);
  assert.match(byName.Croatia.fact, /1,288,590/);
  assert.equal(byName["Hong Kong"].clue, "Eats the most fish and seafood per person");
  assert.match(byName["Hong Kong"].fact, /69\.11 kg\/yr per capita/);
  assert.match(byName["Hong Kong"].fact, /Iceland/);
  for (const person of meat.people) {
    assert.equal(person.clue.toLowerCase().includes(person.name.toLowerCase()), false, person.name);
    assert.equal(person.sourceUrl.startsWith("https://"), true, person.name);
  }
  assert.equal(byName.Argentina.sourceUrl, OWID_MEAT);
  assert.equal(byName.Kazakhstan.sourceUrl, FAO_SUA);
  assert.equal(meat.sensitive, undefined);
});

test("long haul is a sensitive cocaine ranker after the AdSense window, distinct from Powder Rankings", () => {
  const haul = byId("cocaine-destination");
  const powder = byId("cocaine-use");
  assert.equal(haul.sensitive, true);
  assert.equal(haul.headline === powder.headline, false);
  assert.equal(haul.question === powder.question, false);
  assert.equal(haul.unit, "% of adults (15–64)");
  assert.equal(haul.sourceUrl, UNODC);
  assert.equal(haul.source, powder.source);
  assert.ok(dateOf(haul.order) > "2026-11-03");
  const prev = puzzles.find(p => p.order === haul.order - 1);
  const next = puzzles.find(p => p.order === haul.order + 1);
  assert.equal(prev.sensitive, undefined);
  assert.equal(next.sensitive, undefined);
  assert.deepEqual(haul.items.map(it => [it.name, it.value, it.year, it.gRank, it.gScope]), [
    ["Australia", 4.5, "2022/23", 1, "UNODC rows"],
    ["United States", 2.271416813, "2023", 12, "UNODC rows"],
    ["United Kingdom", 2.1, "2024", 13, "UNODC rows"],
    ["Brazil", 1.78, "2023", 18, "UNODC rows"],
    ["Mexico", 0.8, "2016", 45, "UNODC rows"],
    ["Colombia", 0.62, "2019", 50, "UNODC rows"],
  ]);
  assert.match(haul.fact, /England and Wales/);
  assert.match(haul.fact, /Scotland/);
  assert.match(haul.fact, /3\.0%/);
  assert.match(haul.question, /cocaine/);
  assert.equal(search.matches(haul, "Brazil"), true);
});

test("population density Top 1 leaves out places under 1 million and keeps Hong Kong", () => {
  const density = byId("top1-pop-density");
  assert.equal(density.type, "top1");
  assert.equal(density.unit, "people/km²");
  assert.equal(density.year, "2024");
  assert.equal(density.sourceUrl, WB);
  assert.match(density.question, /1 million/);
  assert.equal(density.countries.length, 159);
  assert.deepEqual(density.countries.slice(0, 3).map(c => [c.name, c.value, c.iso3]), [
    ["Singapore", 8329, "SGP"],
    ["Hong Kong", 7165.8, "HKG"],
    ["Bahrain", 1985.8, "BHR"],
  ]);
  const names = new Set(density.countries.map(c => c.name));
  const isos = new Set(density.countries.map(c => c.iso3));
  assert.equal(names.has("Hong Kong"), true);
  assert.equal(names.has("Macao"), false);
  assert.equal(names.has("Monaco"), false);
  assert.equal(isos.has("TWN"), false);
  assert.equal(isos.has("XKX"), false);
  assert.match(density.fact, /Macao/);
  assert.match(density.fact, /Hong Kong/);
  assert.equal(density.countries.filter(c => c.value === density.countries[0].value).length, 1);
  const nicaragua = density.countries.find(c => c.name === "Nicaragua");
  assert.equal(nicaragua.year, "2023");
  assert.equal(search.matches(density, "Singapore"), true);
});

test("seeded comparison for the new dailies sits a little under a clear", () => {
  const stats = JSON.parse(fs.readFileSync(path.join(root, "community-stats.json"), "utf8"));
  const expect = {
    "wealth-share-top10": ["South Africa", "United States", "China", "United Arab Emirates", "Singapore", "Kazakhstan"],
    "wealth-share-top1": ["Russia", "India", "United States", "Germany", "South Korea", "Denmark"],
    "match-meat-cuts": ["Mongolia", "Israel", "Argentina", "Kazakhstan", "Croatia", "Hong Kong"],
    "cocaine-destination": ["Australia", "United States", "United Kingdom", "Brazil", "Mexico", "Colombia"],
    "top1-pop-density": ["Singapore"],
  };
  for (const [id, names] of Object.entries(expect)) {
    const row = stats.puzzles[id];
    assert.ok(row, id);
    assert.equal(row.seeded, true);
    assert.ok(row.players >= 50, id);
    assert.equal(row.firstGuessWorld.players, 1);
    assert.ok(row.standing.avgTries >= 2.8 && row.standing.avgTries <= 3.6, id);
    assert.ok(row.standing.avgAccuracy >= 50 && row.standing.avgAccuracy <= 72, id);
    assert.deepEqual(Object.keys(row.perItemCorrect), names);
    const puzzle = byId(id);
    const firstOf = puzzle.type === "top1" ? 1 : names.length;
    assert.equal(row.standing.firstOf, firstOf);
  }
  const meat = stats.puzzles["match-meat-cuts"].firstGuessWorld.bars;
  assert.equal(meat.length, 6);
  assert.ok(meat.some(bar => bar.matchedTo !== bar.name));
  assert.ok(meat.every(bar => bar.label && bar.sourceUrl == null));
});
