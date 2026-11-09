const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function load(file, name) {
  const box = { window: {} };
  vm.runInNewContext(read(file), box, { filename: file });
  return box.window[name];
}

test("a 3-try 70 beats about 60 to 70 percent of the slower seeded crowd", () => {
  const seed = require(path.join(root, "community-seed.js"));
  const ids = ["work-hours", "sex-ratio-15-64", "pew-meaning-religion", "top5-demo", "match-pew", "number-life"];
  const accs = [];
  for (const id of ids) {
    const type = id.startsWith("top5") ? "top5" : id.startsWith("match") ? "match" : "rank";
    const block = seed.standingBlock(id, 900, type, 5);
    accs.push(block.avgAccuracy);
    const better = seed.betterThan(block, 3, 70, true);
    const top = 100 - better;
    assert.ok(top >= 28 && top <= 42, id + " top " + top);
  }
  const mean = accs.reduce((a, b) => a + b, 0) / accs.length;
  assert.ok(mean >= 50 && mean <= 58, "seeded mean " + mean);
});

test("the garlic fact card is sourced, and the Trump gender claim is not shipped", () => {
  const app = read("app.js");
  assert.match(app, /rankd\.spotlight\.seen\.v1/);
  assert.match(app, /spotlightDismiss/);
  assert.match(app, /Library of Congress/);
  assert.doesNotMatch(app, /only group where women voted more for Trump/i);
  const puzzles = load("puzzles-data.js", "RANKD_PUZZLES");
  for (const id of ["homicide-women", "homicide-women-b", "homicide-women-c"]) {
    const p = puzzles.find(x => x.id === id);
    assert.equal(p.stat, "Women murdered per 100,000");
    assert.match(p.question, /Women murdered per 100,000/);
    assert.match(p.source, /Intentional homicides|intentional homicide|UNODC/i);
  }
  const sets = load("number-puzzles.js", "RANKD_NUMBER");
  const fem = sets.find(s => s.id === "number-femicide");
  assert.equal(fem.stat, "Women murdered per 100,000");
  assert.equal(fem.noun, "rate of women murdered");
});
