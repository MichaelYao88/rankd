const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const epoch = Date.UTC(2026, 9, 6);
const dateOf = order => new Date(epoch + (Math.round(order) - 1) * 864e5).toISOString().slice(0, 10);

function boot() {
  const document = {
    documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    head: { appendChild() {} },
    addEventListener() {},
  };
  const appBox = {
    window: { RANKD_STUDIO: true },
    document,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { protocol: "http:", pathname: "/", search: "", hostname: "localhost", hash: "" },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp,
    Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error("no")),
    AbortController,
  };
  appBox.globalThis = appBox;
  appBox.window.document = document;
  appBox.window.localStorage = appBox.localStorage;
  appBox.window.sessionStorage = appBox.sessionStorage;
  appBox.window.location = appBox.location;
  appBox.window.matchMedia = appBox.matchMedia;
  vm.createContext(appBox);
  for (const file of ["puzzles-data.js", "practice-data.js", "name-puzzles.js", "part1-puzzles.js", "invent-quiz.js", "number-stats.js", "number-puzzles.js", "number-guess.js", "app.js"]) {
    vm.runInContext(read(file), appBox, { filename: file });
  }
  return appBox.window;
}

test("highest point uses one Factbook series, in metres above sea level", () => {
  const w = boot();
  const high = w.RANKD_PUZZLES.find(p => p.id === "highest-point-surprises");
  const low = w.RANKD_PUZZLES.find(p => p.id === "highest-point-modest");
  const stat = w.RANKD_NUMBER_STATS.find(s => s.id === "number-world-highest");
  const practice = w.RANKD_PRACTICE.datasets.find(d => d.id === "number-world-highest");
  const set = w.RANKD_NUMBER.find(s => s.id === "number-world-highest");
  assert.equal(stat.rows.length, 223);
  assert.equal(practice.rows.length, 223);
  assert.equal(practice.coverage, "full");
  assert.equal(stat.rows.some(r => r[0] === "ATA"), false);
  assert.equal(stat.rows.some(r => r[0] === "PSE"), false);
  assert.equal(JSON.stringify(stat.rows.find(r => r[0] === "ECU")), JSON.stringify(["ECU", 6267, "2026", "Chimborazo"]));
  assert.equal(JSON.stringify(stat.rows.find(r => r[0] === "NLD")), JSON.stringify(["NLD", 862, "2026", "Mount Scenery"]));
  assert.equal(JSON.stringify(stat.rows.find(r => r[0] === "NZL")), JSON.stringify(["NZL", 3724, "2026", "Aoraki/Mount Cook"]));
  assert.equal(JSON.stringify(stat.rows.find(r => r[0] === "KAZ")), JSON.stringify(["KAZ", 7010, "2026", "Pik Khan-Tengri"]));
  for (const row of stat.rows) assert.equal(practice.rows.find(r => r[0] === row[0])[1], row[1]);
  assert.equal(high.stat, "Highest point, metres above sea level");
  assert.equal(low.unit, "metres above sea level");
  assert.equal(high.higherIs, "top");
  assert.equal(high.valuesVisible, false);
  assert.equal(high.question.includes("Chimborazo"), false);
  assert.equal(high.question.includes("Nepal"), false);
  assert.equal(low.question.includes("Saba"), false);
  assert.equal(low.items.some(it => it.name === "Nepal"), false);
  assert.equal(high.items.some(it => it.name === "Nepal"), false);
  assert.equal(JSON.stringify(high.items.map(it => [it.name, it.value])), JSON.stringify([
    ["Ecuador", 6267], ["Mexico", 5636], ["Iran", 5625], ["Kenya", 5199], ["Turkey", 5137], ["Papua New Guinea", 4509],
  ]));
  assert.equal(JSON.stringify(low.items.map(it => [it.name, it.value])), JSON.stringify([
    ["Netherlands", 862], ["Belgium", 694], ["Luxembourg", 559], ["Denmark", 171], ["Singapore", 166], ["Qatar", 103],
  ]));
  assert.match(high.fact, /farthest point from Earth's centre/);
  assert.match(high.fact, /6,267 m/);
  assert.match(high.fact, /ranki\.gg/);
  assert.match(low.fact, /Mount Scenery on Saba/);
  assert.match(low.fact, /322 m/);
  assert.match(low.fact, /ranki\.gg/);
  assert.match(high.source, /CIA World Factbook/);
  assert.equal(high.year, "2026");
  assert.equal(high.order, 276);
  assert.equal(low.order, 277);
  assert.equal(dateOf(276), "2027-07-08");
  assert.equal(dateOf(277), "2027-07-09");
  assert.equal(high.poolFrom, "2027-07-08");
  assert.equal(low.poolFrom, "2027-07-09");
  assert.equal(set.pairs.length, 16);
  assert.equal(set.poolFrom, "2027-07-08");
  assert.equal(set.fillerDate, "2027-05-06");
  assert.equal(set.scoreFactor, w.RankdNumber.factorFromValues(stat.rows.map(r => r[1])));
  const chim = set.pairs.find(p => p.known.iso3 === "MEX" && p.ask.iso3 === "ECU");
  assert.match(chim.fact, /farthest point from Earth's centre/);
  assert.equal(chim.fact.includes(String(chim.ask.value)), false);
  const card = w.RankdNumber.card(set, chim);
  assert.equal(card.question.includes("6267"), false);
  assert.equal(card.question.includes("6,267"), false);
  const stats = JSON.parse(read("community-stats.json"));
  for (const id of [high.id, low.id]) {
    const standing = stats.puzzles[id].standing;
    assert.equal(standing.n, 910);
    assert.ok(standing.avgTries >= 3.3 && standing.avgTries <= 4, standing.avgTries);
    assert.ok(standing.avgAccuracy >= 50 && standing.avgAccuracy <= 72, standing.avgAccuracy);
  }
  const world = stats.puzzles[high.id].firstGuessWorld.bars.map(b => b.name);
  assert.notEqual(world[0], "Ecuador");
  const seen = {};
  for (let n = 0; w.RankdShared.keyFromDay(n) <= "2027-12-31"; n++) {
    const day = w.RankdShared.keyFromDay(n);
    for (const part of w.RankdBonus.parts(n)) {
      if (part.id === high.id || part.id === low.id || String(part.id).startsWith("number-world-highest")) {
        assert.ok(!part.poolFrom || day >= part.poolFrom, part.id + " " + day);
        if (part.id === high.id || part.id === low.id) {
          if (!seen[part.id]) seen[part.id] = day + " " + part.role;
        }
      }
    }
  }
  assert.equal(seen[high.id], "2027-07-08 closer");
  assert.equal(seen[low.id], "2027-07-09 closer");
});
