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

test("testosterone dailies take the two days after 2027-05-20", () => {
  assert.equal(dateOf(227), "2027-05-20");
  const east = byId("male-testosterone");
  const west = byId("male-testosterone-b");
  assert.equal(dateOf(east.order), "2027-05-21");
  assert.equal(dateOf(west.order), "2027-05-22");
  assert.equal(east.order, 228);
  assert.equal(west.order, 229);
  assert.equal(east.unit, "ng/dL");
  assert.equal(west.unit, "ng/dL");
  assert.equal(east.dataset, "tdc-male-testosterone");
  assert.equal(west.dataset, east.dataset);
  assert.equal(east.sensitive, undefined);
  assert.match(east.source, /small, non-uniform/);
  assert.match(east.source, /25 Nov 2024/);
  assert.equal(east.sourceUrl, "https://testosteronedecline.com/what-country-has-highest-testosterone/");
  assert.match(east.fact, /China, Japan and South Korea/);
  assert.match(east.fact, /Netherlands/);
  assert.match(west.fact, /Cameroon and Ethiopia/);
  assert.match(west.fact, /India/);
  assert.equal(JSON.stringify(east.items.map(it => [it.name, it.value])), JSON.stringify([
    ["China", 521], ["Japan", 502], ["South Korea", 462],
    ["United States", 451], ["Germany", 434], ["Canada", 402],
  ]));
  assert.equal(JSON.stringify(west.items.map(it => [it.name, it.value])), JSON.stringify([
    ["Cameroon", 731], ["Ethiopia", 671], ["Netherlands", 571],
    ["United Kingdom", 521], ["India", 487], ["United States", 451],
  ]));
  const shared = east.items.map(it => it.name).filter(name => west.items.some(it => it.name === name));
  assert.equal(JSON.stringify(shared), JSON.stringify(["United States"]));
  const ds = practice.datasets.find(d => d.id === "tdc-male-testosterone");
  assert.equal(ds.coverage, "full");
  assert.equal(ds.sens, 0);
  assert.equal(ds.unit, "ng/dL");
  assert.equal(ds.rows.length, 85);
  assert.equal(ds.rows.find(r => r[0] === "USA")[1], 451);
  assert.equal(ds.rows.some(r => r[0] === "HRV" || r[0] === "ARM"), false);
  for (const it of east.items.concat(west.items)) {
    const iso = Object.entries(practice.countries).find(([, row]) => row[0] === it.name)[0];
    assert.equal(ds.rows.find(r => r[0] === iso)[1], it.value);
    assert.equal(it.gTotal, 85);
    assert.equal(it.gRank, 1 + ds.rows.filter(r => r[1] > it.value).length);
  }
});
