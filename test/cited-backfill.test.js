const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

function load(file, key) {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), box, { filename: file });
  return box.window[key];
}

const practice = load("practice-data.js", "RANKD_PRACTICE");
const puzzles = load("puzzles-data.js", "RANKD_PUZZLES");
const stats = load("number-stats.js", "RANKD_NUMBER_STATS");

function ds(id) {
  return practice.datasets.find(d => d.id === id);
}
function value(id, key) {
  const row = ds(id).rows.find(r => r[0] === key);
  const col = ds(id).kind === "groups" ? 2 : 1;
  return row[col];
}

test("cited series keep the published board values and grow to the source", () => {
  const expect = {
    onions: [5, 171, ["TJK", 56.8], ["PHL", 2.6]],
    "height-girls-19": [5, 193, ["GBR", 163.9], ["IND", 155.2]],
    "height-boys-19": [5, 193, ["GBR", 178.2], ["IND", 166.5]],
    "pew-us-favorable": [6, 24, ["ISR", 83], ["SWE", 19]],
    "ethnologue-total-speakers": [6, 38, ["English", 1493], ["French", 334]],
    "space-first": [5, 46, ["VNM", 1980], ["CHN", 2003]],
    "eiu-democracy-2024": [6, 158, ["NOR", 9.81], ["CHN", 2.11]],
    "pew-muslim-population-2020": [6, 198, ["IDN", 238990485], ["EGY", 104038012]],
    "henley-passport-2026-04-13": [6, 197, ["SGP", 192], ["CHN", 82]],
    "cia-mean-elevation": [5, 164, ["TJK", 3186], ["LSO", 2161]],
    "newest-un-members": [6, 185, ["SSD", 2011], ["NAM", 1990]],
    "fao-poultry-supply-2023": [0, 176, ["ISR", 72.82], ["USA", 54.54]],
    "fao-beef-supply-2023": [0, 176, ["ARG", 48.99], ["ZWE", 45.48]],
  };
  for (const [id, [before, after, a, b]] of Object.entries(expect)) {
    const set = ds(id);
    assert.ok(set, id);
    assert.equal(set.rows.length, after, id);
    assert.equal(set.coverage, "full", id);
    assert.equal(value(id, a[0]), a[1], id + " " + a[0]);
    assert.equal(value(id, b[0]), b[1], id + " " + b[0]);
    assert.ok(before < after, id);
    const stat = stats.find(s => s.id === id);
    if (set.kind !== "groups") assert.equal(stat.rows.length, after, "stats " + id);
  }
  const onions = puzzles.find(p => p.id === "onions");
  assert.equal(onions.items.map(it => it.name + " " + it.value).join("|"), "Tajikistan 56.8|Senegal 31.1|India 17.5|United States 9.6|Philippines 2.6");
  assert.equal(onions.items[0].gTotal, 182);
  const foreign = ds("match-foreign-relations");
  assert.equal(foreign.rows.length, 4);
  assert.equal(foreign.kind, "match");
  const meat = ds("match-meat-cuts");
  assert.equal(meat.rows.length, 6);
  assert.equal(meat.kind, "match");
  assert.equal(ds("market-economy-age").rows.length, 5);
  assert.equal(ds("pew-market-age").rows.length, 5);
  assert.equal(ds("pew-asia-harmony").rows.length, 6);
  assert.equal(ds("pew-china-favorable").rows.length, 11);
  assert.equal(ds("pew-india-unfavorable").rows.length, 6);
  assert.equal(ds("pew-us-socialism").rows.length, 5);
  assert.equal(ds("deloitte-female-ceo-2023").rows.length, 7);
  assert.equal(ds("statista-vegetarian-vegan").rows.length, 6);
  assert.equal(ds("northernmost-africa").rows.length, 6);
  assert.equal(ds("usgs-largest-earthquakes").rows.length, 6);
  assert.equal(ds("renewables").rows.length, 212);
});
