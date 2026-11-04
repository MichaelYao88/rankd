const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const search = require("../puzzle-search.js");
const box = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "puzzles-data.js"), "utf8"), box, { filename: "puzzles-data.js" });
const puzzles = box.window.RANKD_PUZZLES;
const byId = id => puzzles.find(p => p.id === id);
const epoch = Date.UTC(2026, 9, 6);
const dateOf = order => new Date(epoch + (Math.round(order) - 1) * 864e5).toISOString().slice(0, 10);

const nameBox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "name-puzzles.js"), "utf8"), nameBox, { filename: "name-puzzles.js" });
const namePuzzles = nameBox.window.RANKD_NAME_PUZZLES;

function helper(args) {
  const out = execFileSync("python3", ["tools/country_attributes.py", ...args], { cwd: root, encoding: "utf8" });
  return JSON.parse(out);
}

test("country attributes cover sovereign states and skip Saint Helena", () => {
  const text = fs.readFileSync(path.join(root, "country_attributes.csv"), "utf8");
  assert.equal(/saint helena/i.test(text), false);
  assert.match(text, /iso3,country,emoji,population/);
  for (const col of ["has_mcdonalds", "ever_female_leader", "is_monarchy", "landlocked", "has_public_commercial_airport", "divorce_legal", "mediterranean_coast", "population", "land_area_km2", "source_mcdonalds", "source_female_leader", "source_divorce"]) {
    assert.match(text.split("\n")[0], new RegExp(col));
  }
  const lines = text.trim().split("\n");
  assert.ok(lines.length > 190);
  assert.equal(lines.filter(line => line.startsWith("VAT,")).length, 1);
  assert.equal(lines.filter(line => line.startsWith("SHN,")).length, 0);
});

test("the attribute helper builds the four requested boards", () => {
  const expect = [
    ["no-mcdonalds", ["--where", "has_mcdonalds=no", "--sort", "population", "--limit", "6"]],
    ["never-woman-leader", ["--where", "ever_female_leader=no", "--sort", "population", "--limit", "6"]],
    ["monarchy-population", ["--where", "is_monarchy=yes", "--sort", "population", "--limit", "6"]],
    ["mediterranean-land", ["--where", "mediterranean_coast=yes", "--sort", "land_area_km2", "--limit", "6"]],
  ];
  for (const [id, args] of expect) {
    const board = helper([...args, "--json"]);
    if (id === "never-woman-leader") {
      assert.deepEqual(board.map(r => r.country), ["United States", "Nigeria", "Russia", "Egypt", "Iran", "Kenya"]);
      continue;
    }
    const puzzle = byId(id);
    assert.equal(JSON.stringify(board.map(r => r.country)), JSON.stringify(puzzle.items.map(it => it.name)), id);
    assert.equal(JSON.stringify(board.map(r => r.value)), JSON.stringify(puzzle.items.map(it => it.value)), id);
  }
  const k = helper(["--name-starts", "K", "--sort", "population", "--limit", "6", "--json"]);
  assert.equal(k[0].country, "Kenya");
  assert.equal(byId("k-population"), undefined);
  const asia = helper(["--where", "continent=Asia", "--sort", "population", "--asc", "--limit", "6", "--json"]);
  assert.equal(JSON.stringify(asia.map(r => r.country)), JSON.stringify(byId("smallest-asia").items.map(it => it.name)));
});

test("new dailies start the day after Measured Up and do not reuse an order", () => {
  assert.equal(dateOf(192), "2027-04-15");
  assert.equal(byId("stretched-length").order, 192);
  const fresh = [
    ["no-mcdonalds", 193, "2027-04-16", "No Golden Arches"],
    ["never-woman-leader", 194, "2027-04-17", "Never Her Turn"],
    ["monarchy-population", 195, "2027-04-18", "Still Crowned"],
    ["mediterranean-land", 196, "2027-04-19", "Inland Sea"],
    ["land-area", 197, "2027-04-20", "Lakes Don't Count"],
    ["africa-population", 198, "2027-04-21", "Africa by Headcount"],
    ["eastern-capitals", 199, "2027-04-22", "Far East"],
    ["newest-countries", 200, "2027-04-23", "Just Independent"],
    ["smallest-asia", 201, "2027-04-24", "Smallest Crowd"],
    ["northernmost-africa", 202, "2027-04-25", "Top of Africa"],
    ["muslim-population", 203, "2027-04-26", "Most Muslims"],
    ["passport-henley", 204, "2027-04-27", "Open Doors"],
    ["largest-earthquakes", 205, "2027-04-28", "The Big Ones"],
    ["mean-elevation", 206, "2027-04-29", "High Ground"],
    ["southern-capitals", 207, "2027-04-30", "Far South"],
    ["northern-capitals", 208, "2027-05-01", "Far North"],
  ];
  const orders = puzzles.map(p => Math.round(p.order));
  assert.equal(new Set(orders).size, orders.length);
  for (const [id, order, date, headline] of fresh) {
    const p = byId(id);
    assert.equal(p.type, id === "never-woman-leader" ? "quiz" : "rank", id);
    assert.equal(Math.round(p.order), order, id);
    assert.equal(dateOf(p.order), date, id);
    assert.equal(p.headline, headline, id);
    assert.equal(p.sensitive, undefined, id);
    assert.ok(p.fact && p.sourceUrl.startsWith("https://"), id);
    if (p.type === "rank") assert.equal(new Set(p.items.map(it => it.value)).size, p.items.length, id);
    assert.equal(/per capita/i.test(p.unit), false, id);
    const needle = p.type === "quiz" ? p.questions[0].prompt : p.items[0].name;
    assert.equal(search.matches(p, needle), true, id);
  }
  assert.equal(byId("smallest-asia").higherIs, "bottom");
  assert.equal(byId("southern-capitals").higherIs, "bottom");
  assert.equal(byId("southern-capitals").dataset, "national-capitals");
  assert.equal(byId("northern-capitals").dataset, "national-capitals");
  const east = byId("eastern-capitals");
  assert.equal(east.dataset, "national-capitals");
  assert.equal(east.axis, "lon");
  assert.equal(east.higherIs, "top");
  assert.equal(east.items[0].name, "Tuvalu");
  assert.ok(east.items.every((it, i, arr) => i === 0 || arr[i - 1].value > it.value));
  const woman = byId("never-woman-leader");
  assert.equal(woman.questions[0].options[0].name, "Has had one");
  assert.equal(woman.question, "Has this country ever had a woman as head of state or government?");
  assert.equal(woman.questions[0].options[1].name, "Never has");
  const womanTier = iso => woman.questions.find(q => q.id === iso.toLowerCase()).answer === "T0" ? 1 : 0;
  assert.equal(womanTier("PAK"), 1);
  assert.equal(womanTier("IND"), 1);
  assert.equal(womanTier("IDN"), 1);
  assert.equal(womanTier("TUR"), 1);
  assert.equal(womanTier("ITA"), 1);
  assert.equal(womanTier("ESP"), 1);
  assert.equal(womanTier("USA"), 0);
  assert.equal(womanTier("CZE"), 0);
  assert.match(woman.fact, /Meloni/);
  assert.match(woman.fact, /Isabella II/);
  assert.match(woman.fact, /acting/);
  assert.equal(byId("land-area").items[1].name, "China");
  assert.equal(byId("land-area").items[3].name, "Canada");
  assert.match(byId("land-area").fact, /inland water/);
  assert.match(byId("no-mcdonalds").fact, /Vkusno i tochka/);
  assert.match(byId("never-woman-leader").fact, /Soong Ching-ling/);
  assert.match(byId("muslim-population").fact, /not a per-capita/);
  assert.match(byId("passport-henley").fact, /13 April 2026/);
  assert.match(byId("largest-earthquakes").fact, /tied/);
  assert.match(byId("mean-elevation").unit, /^m$/);
  assert.equal(byId("mean-elevation").items.length, 5);
});

test("name puzzles for divorce and tree names take the next free days", () => {
  const taken = new Set(puzzles.map(p => Math.round(p.order)).filter(o => o > 0 && o < 10000));
  let next = 1;
  const assigned = [];
  for (const puzzle of namePuzzles) {
    const wanted = Math.round(puzzle.order) || 0;
    if (wanted > 0 && wanted < 10000 && !taken.has(wanted)) {
      assigned.push([puzzle.id, wanted]);
      taken.add(wanted);
      continue;
    }
    while (taken.has(next)) next += 1;
    assigned.push([puzzle.id, next]);
    taken.add(next);
    next += 1;
  }
  assert.equal(JSON.stringify(assigned.filter(([id]) => ["name-no-divorce", "name-tree-country", "name-named-for-her"].includes(id))), JSON.stringify([
    ["name-no-divorce", 164],
    ["name-tree-country", 165],
    ["name-named-for-her", 166],
  ]));
  assert.equal(JSON.stringify(assigned.filter(([id]) => ["name-obesity-n", "name-potato-b", "name-gini-s", "name-suicide-l", "name-gdp-i"].includes(id))), JSON.stringify([
    ["name-obesity-n", 247],
    ["name-potato-b", 249],
    ["name-gini-s", 251],
    ["name-suicide-l", 253],
    ["name-gdp-i", 255],
  ]));
  assert.equal(dateOf(164), "2027-03-18");
  assert.equal(dateOf(165), "2027-03-19");
  assert.equal(dateOf(166), "2027-03-20");
  const divorce = namePuzzles.find(p => p.id === "name-no-divorce");
  const tree = namePuzzles.find(p => p.id === "name-tree-country");
  assert.equal(JSON.stringify(divorce.answers), JSON.stringify(["PHL", "VAT"]));
  assert.equal(JSON.stringify(tree.answers), JSON.stringify(["BRB", "BRA"]));
  assert.match(divorce.fact, /October 2026/);
  assert.match(tree.fact, /bearded fig/);
  assert.match(tree.fact, /Cyprus/);
  const vat = nameBox.window.RANKD_NAME_COUNTRIES.find(c => c.iso3 === "VAT");
  assert.equal(vat.name, "Vatican City");
});

test("seeded comparison for the new dailies sits a little under a clear", () => {
  const stats = JSON.parse(fs.readFileSync(path.join(root, "community-stats.json"), "utf8"));
  const ids = ["no-mcdonalds", "land-area", "mean-elevation", "passport-henley", "name-no-divorce", "name-tree-country"];
  for (const id of ids) {
    const row = stats.puzzles[id];
    assert.ok(row, id);
    assert.equal(row.seeded, true);
    assert.ok(row.players >= 50, id);
    assert.equal(row.firstGuessWorld.players, 1, id);
    assert.ok(row.standing.avgTries >= 2.8 && row.standing.avgTries <= 3.6, id);
    assert.ok(row.standing.avgAccuracy >= 50 && row.standing.avgAccuracy <= 72, id);
    const width = id.startsWith("name-") ? 1 : byId(id).items.length;
    assert.equal(row.standing.firstOf, width, id);
    for (const code of ["US", "TW", "SG"]) assert.equal(row.firstGuessByCountry[code].players, 1, id);
  }
  assert.equal(JSON.stringify(Object.keys(stats.puzzles["no-mcdonalds"].perItemCorrect)), JSON.stringify(byId("no-mcdonalds").items.map(it => it.name)));
  assert.equal(stats.puzzles["name-tree-country"].firstGuessWorld.bars[0].name, "Barbados");
  assert.equal(stats.puzzles["name-no-divorce"].firstGuessWorld.bars[0].name, "Vatican City");
});
