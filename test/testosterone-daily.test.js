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
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const puzzles = load("puzzles-data.js").RANKD_PUZZLES;
const practice = load("practice-data.js").RANKD_PRACTICE;
const epoch = Date.UTC(2026, 9, 6);
const dateOf = order => new Date(epoch + (Math.round(order) - 1) * 864e5).toISOString().slice(0, 10);
const byId = id => puzzles.find(p => p.id === id);

test("male testosterone is the daily after 2027-05-20 and keeps the compilation order", () => {
  assert.equal(dateOf(227), "2027-05-20");
  const p = byId("male-testosterone");
  assert.equal(p.type, "rank");
  assert.equal(p.order, 228);
  assert.equal(dateOf(p.order), "2027-05-21");
  assert.equal(p.headline, "Serum Levels");
  assert.equal(p.unit, "ng/dL");
  assert.equal(p.year, "2000–2024");
  assert.equal(p.sensitive, undefined);
  assert.equal(puzzles.find(x => x.order === 227).sensitive, undefined);
  assert.equal(p.sourceUrl, "https://testosteronedecline.com/what-country-has-highest-testosterone/");
  assert.match(p.source, /TestosteroneDecline\.com/);
  assert.match(p.source, /small published studies/);
  assert.match(p.fact, /East Asia/);
  assert.match(p.fact, /Netherlands/);
  assert.match(p.fact, /Czechia/);
  assert.match(p.fact, /752/);
  assert.match(p.fact, /small studies/);
  assert.match(p.fact, /ng\/dL/);
  assert.match(p.caveat, /non-uniform/);
  assert.match(p.caveat, /451/);
  assert.equal(new Set(p.items.map(it => it.value)).size, p.items.length);
  assert.equal(JSON.stringify(p.items.map(it => [it.name, it.value, it.gRank, it.gTotal, it.gScope])), JSON.stringify([
    ["Mongolia", 693, 4, 85, "compiled countries"],
    ["Netherlands", 571, 11, 85, "compiled countries"],
    ["China", 521, 23, 85, "compiled countries"],
    ["Japan", 502, 28, 85, "compiled countries"],
    ["Germany", 434, 53, 85, "compiled countries"],
    ["Czechia", 315, 85, 85, "compiled countries"],
  ]));
  assert.equal(search.matches(p, "Mongolia"), true);
  assert.equal(search.matches(p, "testosterone"), true);
  const orders = puzzles.map(x => Math.round(x.order));
  assert.equal(new Set(orders).size, orders.length);
});

test("the practice dataset is the full compilation, with the US note applied", () => {
  const ds = practice.datasets.find(d => d.id === "tdc-male-testosterone");
  assert.equal(ds.coverage, "full");
  assert.equal(ds.sens, 0);
  assert.equal(ds.unit, "ng/dL");
  assert.equal(ds.rows.length, 85);
  assert.equal(ds.rows.some(r => r[0] === "HRV" || r[0] === "ARM"), false);
  const usa = ds.rows.find(r => r[0] === "USA");
  assert.equal(JSON.stringify(usa), JSON.stringify(["USA", 451, "2021–2023"]));
  const byIso = Object.fromEntries(ds.rows.map(r => [r[0], r[1]]));
  assert.equal(byIso.MNG, 693);
  assert.equal(byIso.NLD, 571);
  assert.equal(byIso.CHN, 521);
  assert.equal(byIso.JPN, 502);
  assert.equal(byIso.DEU, 434);
  assert.equal(byIso.CZE, 315);
  assert.equal(byIso.ARG, 455);
  assert.ok(byIso.ARG > byIso.USA);
  const values = ds.rows.map(r => r[1]);
  for (let i = 1; i < values.length; i++) assert.ok(values[i - 1] >= values[i]);
  assert.equal(Math.min(...values), 315);
  const lines = fs.readFileSync(path.join(root, "country_attributes.csv"), "utf8").trim().split("\n");
  const header = parseCsvLine(lines[0]);
  const isoI = header.indexOf("iso3");
  const contI = header.indexOf("continent");
  const continent = {};
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    continent[cols[isoI]] = cols[contI];
  }
  let topEurope = null;
  for (const [iso, value] of Object.entries(byIso)) {
    if (!String(continent[iso] || "").includes("Europe")) continue;
    assert.ok(value < byIso.MNG, iso + " " + value);
    if (!topEurope || value > topEurope[1]) topEurope = [iso, value];
  }
  assert.deepEqual(topEurope, ["NLD", 571]);
  const puzzle = byId("male-testosterone");
  for (const it of puzzle.items) {
    const row = ds.rows.find(r => practice.countries[r[0]][0] === it.name);
    assert.equal(row[1], it.value);
  }
});
