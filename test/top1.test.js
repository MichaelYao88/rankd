const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "puzzles-data.js"), "utf8"), sandbox, { filename: "puzzles-data.js" });
const puzzles = JSON.parse(JSON.stringify(sandbox.window.RANKD_PUZZLES));
const seed = require("../community-seed.js");

const CONVERTED = [
  "top5-wine", "top5-potatoes", "top5-tea", "top5-co2-consumption",
  "top5-height-gain",   "top5-trends-kpop", "top5-alcohol", "top5-height-gain-women",
  "ipsos-gender-identity",
];
const TOP1 = [
  "top1-potatoes", "top1-tea", "top1-co2",
  "top1-pop-2100", "top1-median-age", "top1-road-deaths",
];

function rankOf(list, c) {
  return 1 + list.filter(x => x.value > c.value).length;
}

test("every former Top 5 daily is a Rank it with 5 or 6 distinct values", () => {
  assert.equal(puzzles.filter(p => p.type === "top5").length, 0);
  for (const id of CONVERTED) {
    const p = puzzles.find(x => x.id === id);
    assert.ok(p, id);
    assert.equal(p.type, "rank");
    assert.ok(p.items.length >= 5 && p.items.length <= 6, id + " " + p.items.length);
    const values = p.items.map(it => it.value);
    assert.equal(new Set(values).size, values.length, id + " has a tie");
    assert.equal(p.items[0].gRank, 1, id);
    assert.ok(p.items.some(it => it.gRank >= 6), id + " has no lower country");
    assert.ok(p.fact && p.source && p.order, id);
  }
});

test("Top 1 dailies sit at the end of the queue with a real #1", () => {
  const orders = TOP1.map(id => puzzles.find(p => p.id === id).order);
  const maxOther = Math.max(...puzzles.filter(p => !TOP1.includes(p.id)).map(p => p.order));
  assert.ok(Math.min(...orders) > maxOther);
  assert.deepEqual(orders, [172, 173, 174, 175, 176, 177]);
  for (const id of TOP1) {
    const p = puzzles.find(x => x.id === id);
    assert.equal(p.type, "top1");
    assert.ok(p.countries.length >= 40, id + " " + p.countries.length);
    const top = p.countries.filter(c => c.value === p.countries[0].value);
    assert.equal(top.length, 1, id);
    assert.equal(rankOf(p.countries, p.countries[0]), 1);
  }
  const pop = puzzles.find(p => p.id === "top1-pop-2100");
  assert.deepEqual(pop.countries.slice(0, 3).map(c => [c.name, c.value]), [
    ["India", 1505.3], ["China", 633.4], ["Pakistan", 511.0],
  ]);
  const age = puzzles.find(p => p.id === "top1-median-age");
  assert.match(age.question, /1 million/);
  assert.deepEqual(age.countries.slice(0, 3).map(c => [c.name, c.value]), [
    ["Japan", 49.4], ["Italy", 47.8], ["Hong Kong", 46.8],
  ]);
  const tea = puzzles.find(p => p.id === "top1-tea");
  const teaRank = puzzles.find(p => p.id === "top5-tea");
  assert.equal(tea.unit, "kg/yr per capita");
  assert.equal(teaRank.unit, "kg/yr per capita");
  for (const id of ["top5-wine", "top5-potatoes"]) {
    assert.equal(puzzles.find(p => p.id === id).unit, "kg/yr per capita", id);
  }
  const roads = puzzles.find(p => p.id === "top1-road-deaths");
  assert.match(roads.question, /1 million/);
  assert.deepEqual(roads.countries.slice(0, 3).map(c => [c.name, c.value]), [
    ["Guinea", 37.4], ["Libya", 34.0], ["Haiti", 31.3],
  ]);
});

test("Top 1 accuracy stays inside the try band and rewards a closer miss", () => {
  assert.equal(seed.top1Accuracy([1], true, 120), 100);
  assert.equal(seed.top1Accuracy([2, 1], true, 120), 98);
  assert.equal(seed.top1Accuracy([7, 1], true, 120), 93);
  assert.equal(seed.top1Accuracy([50, 1], true, 120), 80);
  assert.equal(seed.top1Accuracy([6, 3, 1], true, 120), 72);
  assert.equal(seed.top1Accuracy([2, 2, 2, 2, 1], true, 120), 35);
  assert.ok(seed.top1Accuracy([2, 1], true, 120) > seed.top1Accuracy([20, 1], true, 120));
  assert.equal(seed.top1Accuracy([2, 40], false, 187), 19);
  assert.equal(seed.top1Accuracy([187], false, 187), 1);
  assert.ok(seed.top1Accuracy([2], false, 120) > seed.top1Accuracy([80], false, 120));
  assert.equal(seed.top1Mark(1), "good");
  assert.equal(seed.top1Mark(5), "near");
  assert.equal(seed.top1Mark(15), "warm");
  assert.equal(seed.top1Mark(16), "bad");
});

test("an old Top 5 challenge grid still decodes, and orange is a Top 1 square", () => {
  const box = { window: {}, TextEncoder, TextDecoder, btoa, atob };
  box.globalThis = box;
  vm.runInContext(fs.readFileSync(path.join(root, "challenge.js"), "utf8"), vm.createContext(box), { filename: "challenge.js" });
  const RC = box.window.RankdChallenge;
  const legacy = RC.decode(RC.encode({
    k: "d", id: "2026-10-16", tries: 3, dnf: false, acc: 70,
    grid: ["GGRRG", "GGGGG"], name: "Alex",
  }));
  assert.equal(legacy.grid.join("."), "GGRRG.GGGGG");
  assert.equal(RC.gridText(["RYOG"]), "🟥🟨🟧🟩");
  const fresh = RC.decode(RC.encode({
    k: "d", id: "2027-03-18", tries: 3, dnf: false, acc: 72,
    grid: ["ROG"], name: "Alex",
  }));
  assert.equal(Array.from(fresh.grid).join("."), "ROG");
});
