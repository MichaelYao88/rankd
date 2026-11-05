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

function words(label) {
  return label.trim().split(/\s+/).filter(Boolean);
}

test("slang, period, and language-family tiers take the days after 2027-05-22", () => {
  assert.equal(dateOf(229), "2027-05-22");
  const expect = [
    ["pepper-or-bird", 230, "2027-05-23", "Slang Pictures", true],
    ["period-euphemism", 231, "2027-05-24", "Other Names", true],
    ["language-family", 232, "2027-05-25", "Language Families", false],
  ];
  const orders = puzzles.map(p => Math.round(p.order));
  assert.equal(new Set(orders).size, orders.length);
  for (const [id, order, date, headline, sensitive] of expect) {
    const p = byId(id);
    assert.equal(p.type, "tier", id);
    assert.equal(Math.round(p.order), order, id);
    assert.equal(dateOf(p.order), date, id);
    assert.equal(p.headline, headline, id);
    assert.equal(!!p.sensitive, sensitive, id);
    assert.ok(dateOf(p.order) > "2026-11-03", id);
    assert.ok(p.fact && p.sourceUrl.startsWith("https://"), id);
    if (p.type !== "quiz") {
      assert.ok(p.items.length >= 6 && p.items.length <= 10, id);
      for (const tier of p.tiers) assert.ok(words(tier.label).length <= 3, tier.label);
    }
    assert.equal(search.matches(p, p.items[0].name), true, id);
    const ds = practice.datasets.find(d => d.id === id);
    assert.equal(ds.kind, "tier", id);
    assert.equal(ds.coverage, "partial", id);
    assert.equal(!!ds.sens, sensitive, id);
    assert.equal(ds.question, p.question, id);
    assert.equal(JSON.stringify(ds.rows), JSON.stringify(p.items.map(it => [it.iso3, it.value])), id);
    for (const tier of p.tiers) assert.equal(ds.labels[String(tier.value)], tier.label, id);
  }
});

test("penis slang splits chili peppers from birds, with the word in the fact", () => {
  const p = byId("pepper-or-bird");
  assert.equal(p.question, "What else does their slang mean?");
  assert.equal(JSON.stringify(p.tiers.map(t => t.label)), JSON.stringify(["Chili pepper", "Bird", "Little brother", "Banana"]));
  const placed = Object.fromEntries(p.items.map(it => [it.iso3, p.tiers[it.tierIndex].label]));
  assert.equal(placed.MEX, "Chili pepper");
  assert.equal(placed.KOR, "Chili pepper");
  assert.equal(placed.CHN, "Little brother");
  for (const iso of ["ESP", "GBR", "ITA", "BRA", "VNM", "IDN"]) assert.equal(placed[iso], "Bird", iso);
  const banana = p.tiers.findIndex(t => t.label === "Banana");
  assert.equal(p.items.filter(it => it.tierIndex === banana).length, 0);
  assert.match(p.fact, /小弟弟/);
  assert.match(p.fact, /banana/i);
  for (const iso of ["THA", "FRA", "ISR", "USA"]) assert.equal(p.items.some(it => it.iso3 === iso), false, iso);
  assert.match(p.fact, /chile/);
  assert.match(p.fact, /고추/);
  assert.match(p.fact, /polla/);
  assert.match(p.fact, /cock/);
  assert.match(p.fact, /uccello/);
  assert.match(p.fact, /pinto/);
  assert.match(p.fact, /chim/);
  assert.match(p.fact, /burung/);
  assert.match(p.source, /phrik/);
  const counts = p.tiers.map((_, i) => p.items.filter(it => it.tierIndex === i).length);
  assert.ok(counts[0] >= 2 && counts[1] >= 2);
  assert.equal(counts[2], 1);
  assert.equal(counts[3], 0);
  const src = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(src, /return assign\.map\(\(t, i\) => \(t != null && t === right\[i\]\) \? "good" : "bad"\)/);
  function scoreTier(assign) {
    const right = p.items.map(it => it.tierIndex);
    return assign.map((t, i) => (t != null && t === right[i]) ? "good" : "bad");
  }
  assert.equal(scoreTier(p.items.map(it => it.tierIndex)).every(m => m === "good"), true);
  const intoBanana = p.items.map(it => it.tierIndex);
  intoBanana[0] = banana;
  assert.equal(scoreTier(intoBanana)[0], "bad");
  assert.equal(scoreTier(intoBanana).every(m => m === "good"), false);
});

test("period euphemisms are berries, the reds, and the painters, with no aunt", () => {
  const p = byId("period-euphemism");
  assert.equal(p.type, "tier");
  assert.equal(p.question, "What picture is the euphemism?");
  assert.equal(JSON.stringify(p.tiers.map(t => t.label)), JSON.stringify(["Aunt's visiting", "Berry week", "The reds", "Painters in"]));
  const placed = Object.fromEntries(p.items.map(it => [it.iso3, p.tiers[it.tierIndex].label]));
  assert.equal(placed.CHN, "Aunt's visiting");
  assert.equal(placed.NLD, "Aunt's visiting");
  assert.equal(placed.DEU, "Berry week");
  assert.equal(placed.SWE, "Berry week");
  assert.equal(placed.DNK, "The reds");
  assert.equal(placed.GBR, "Painters in");
  assert.equal(placed.AUS, "Painters in");
  for (const iso of ["POL", "TWN", "RUS"]) assert.equal(p.items.some(it => it.iso3 === iso), false, iso);
  for (const iso of ["USA", "THA", "KOR", "FRA", "BRA", "JPN", "VNM", "NOR", "ZAF"]) {
    assert.equal(p.items.some(it => it.iso3 === iso), false, iso);
  }
  assert.match(p.fact, /big aunt/);
  assert.match(p.fact, /Aunt Rose/);
  assert.match(p.fact, /Aunt Flo/);
  assert.match(p.fact, /strawberries/);
  assert.match(p.fact, /lingonberries/);
  assert.match(p.fact, /gazebo/);
  assert.match(p.fact, /painters/);
  assert.match(p.fact, /Poland/);
  assert.match(p.source, /Erdbeerwoche/);
  assert.match(p.source, /lingonveckan/);
  assert.match(p.source, /kommunister i lysthuset/);
  assert.match(p.source, /painters in/);
  const counts = p.tiers.map((_, i) => p.items.filter(it => it.tierIndex === i).length);
  assert.equal(counts[0], 2);
  assert.equal(counts[1], 2);
  assert.equal(counts[2], 1);
  assert.equal(counts[3], 2);
});

test("language families keep the alphabet traps off the family name", () => {
  const p = byId("language-family");
  assert.equal(p.question, "Which family is their main language in?");
  assert.equal(p.sensitive, undefined);
  const placed = Object.fromEntries(p.items.map(it => [it.iso3, p.tiers[it.tierIndex].label]));
  assert.equal(placed.DEU, "Indo-European");
  assert.equal(placed.IRN, "Indo-European");
  assert.equal(placed.HUN, "Uralic");
  assert.equal(placed.FIN, "Uralic");
  assert.equal(placed.EST, "Uralic");
  assert.equal(placed.TUR, "Turkic");
  assert.equal(placed.KAZ, "Turkic");
  assert.equal(placed.MNG, "Mongolic");
  for (const iso of ["VNM", "MLT", "CHN"]) assert.equal(p.items.some(it => it.iso3 === iso), false, iso);
  assert.match(p.fact, /Arabic script/);
  assert.match(p.fact, /Cyrillic/);
  assert.match(p.fact, /Uralic/);
  assert.match(p.fact, /Mongolic/);
  assert.match(p.fact, /Austroasiatic/);
  assert.match(p.fact, /Afroasiatic/);
  assert.match(p.fact, /Vietnam/);
  assert.match(p.fact, /Malta/);
});
