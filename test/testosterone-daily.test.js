const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
function load(file) {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), box, { filename: file });
  return box.window;
}
const puzzles = load("puzzles-data.js").RANKD_PUZZLES;
const practice = load("practice-data.js").RANKD_PRACTICE;
const epoch = Date.UTC(2026, 9, 6);
const dateOf = order => new Date(epoch + (Math.round(order) - 1) * 864e5).toISOString().slice(0, 10);
const byId = id => puzzles.find(p => p.id === id);

test("testosterone dailies use the MrOS 65+ comparison, not the old compilation", () => {
  assert.equal(dateOf(227), "2027-05-20");
  const east = byId("male-testosterone");
  const west = byId("male-testosterone-b");
  assert.equal(dateOf(east.order), "2027-05-21");
  assert.equal(dateOf(west.order), "2027-05-22");
  assert.equal(east.order, 228);
  assert.equal(west.order, 229);
  assert.equal(east.unit, "ng/dL");
  assert.equal(west.unit, "ng/dL");
  assert.equal(east.dataset, "mros-total-t-2010");
  assert.equal(west.dataset, "mros-free-t-2010");
  assert.equal(east.sourceUrl, "https://pmc.ncbi.nlm.nih.gov/articles/PMC3050097/");
  assert.match(east.source, /65\+/);
  assert.match(east.fact, /Hong Kong/);
  assert.match(east.fact, /SHBG/);
  assert.match(east.fact, /US Hispanic men are not a group/);
  assert.match(west.fact, /free testosterone/);
  assert.match(west.fact, /SHBG/);
  assert.equal(JSON.stringify(east.items.map(it => [it.name, it.value])), JSON.stringify([
    ["Hong Kong men", 529], ["Japanese men", 520], ["US Black men", 471],
    ["Swedish men", 454], ["US White men", 454], ["Tobago men", 454], ["US Asian men", 441],
  ]));
  assert.equal(JSON.stringify(west.items.map(it => [it.name, it.value])), JSON.stringify([
    ["Hong Kong men", 10.49], ["Swedish men", 9.52], ["US White men", 9.14],
    ["US Black men", 9.06], ["US Asian men", 8.82], ["Tobago men", 8.76], ["Japanese men", 8.17],
  ]));
  const total = practice.datasets.find(d => d.id === "mros-total-t-2010");
  const free = practice.datasets.find(d => d.id === "mros-free-t-2010");
  assert.equal(total.kind, "groups");
  assert.equal(total.coverage, "partial");
  assert.equal(practice.datasets.some(d => d.id === "tdc-male-testosterone"), false);
  for (const it of east.items) assert.equal(total.rows.find(r => r[0] === it.name)[2], it.value);
  for (const it of west.items) assert.equal(free.rows.find(r => r[0] === it.name)[2], it.value);
});
