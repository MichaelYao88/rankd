const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function load(file) {
  const box = { window: {} };
  vm.runInNewContext(read(file), box, { filename: file });
  return box.window;
}

const puzzles = load("puzzles-data.js").RANKD_PUZZLES;
const sets = load("number-puzzles.js").RANKD_NUMBER;

test("the new boards are sourced, sensitive where they should be, and wait until 11 Nov", () => {
  const expect = {
    "sex-ratio-15-64-c": false,
    "sex-ratio-15-64-d": false,
    "equaldex-opinion-cape": true,
    "equaldex-legal-chile": true,
    "ipsos-bisexual-2021": true,
    "ipsos-gender-identity-c": true,
  };
  for (const [id, sensitive] of Object.entries(expect)) {
    const p = puzzles.find(x => x.id === id);
    assert.ok(p, id);
    assert.equal(!!p.sensitive, sensitive, id);
    assert.equal(p.poolFrom, "2026-11-11", id);
    assert.equal(p.items.length, 6, id);
    assert.ok(p.fact && p.sourceUrl.startsWith("https://"), id);
  }
  const china = puzzles.find(p => p.id === "pew-china-favorable");
  const usa = puzzles.find(p => p.id === "pew-us-favorable");
  assert.equal(china.question, "Who favors China?");
  assert.match(china.fact, /not a choice of China over the United States/);
  assert.equal(usa.question, "Who favors the United States?");
  assert.match(usa.fact, /not a choice of the United States over China/);
  const pop = sets.find(s => s.id === "number-pop2100");
  const pair = pop.pairs.find(p => p.known.iso3 === "CHN" && p.ask.iso3 === "IND");
  assert.equal(pair.known.value, 633.37);
  assert.equal(pair.ask.value, 1505.25);
  assert.equal(pair.poolFrom, "2026-11-11");
  const bi = sets.find(s => s.id === "number-bisexual");
  assert.equal(bi.sensitive, true);
  assert.equal(bi.pairs[0].known.iso3, "NLD");
  assert.equal(bi.pairs[0].ask.value, 9);
});
