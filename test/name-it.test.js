const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = { console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of ["puzzle-search.js", "name-puzzles.js", "name-it.js", "community-seed.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
}
const Name = sandbox.RankdName;
const puzzles = sandbox.RANKD_NAME_PUZZLES;
const byId = id => puzzles.find(p => p.id === id);
const country = iso => Name.catalog().find(c => c.iso3 === iso);

test("aliases resolve, and Korea is South Korea", () => {
  const hdi = byId("name-hdi-s");
  for (const q of ["USA", "usa", "u.s.a.", "US", "United States"]) {
    const found = Name.resolveCountry(q);
    assert.equal(found.status, "ok", q);
    assert.equal(found.country.iso3, "USA", q);
  }
  const korea = Name.resolveCountry("Korea");
  assert.equal(korea.country.name, "South Korea");
  assert.equal(korea.country.iso3, "KOR");
  assert.notEqual(Name.resolveCountry("North Korea").country.iso3, "KOR");
  const named = Name.judge(hdi, "Korea", new Set());
  assert.equal(named.status, "correct");
  assert.equal(named.counts, true);
  assert.equal(named.country.iso3, "KOR");
});

test("a wrong letter on a passing stat does not quote the stat", () => {
  const hdi = byId("name-hdi-s");
  const france = Name.judge(hdi, "France", new Set());
  assert.equal(france.status, "wrong");
  assert.equal(france.counts, true);
  assert.equal(france.letterOk, false);
  assert.equal(france.statOk, true);
  assert.match(france.line, /🇫🇷 France: doesn't start with S/);
  assert.equal(/HDI|0\.920|above|below/.test(france.line), false);
});

test("below-threshold guesses name the figure and the cutoff", () => {
  const sudan = Name.judge(byId("name-hdi-s"), "Sudan", new Set());
  assert.equal(sudan.status, "wrong");
  assert.equal(sudan.counts, true);
  assert.equal(sudan.line, "🇸🇩 Sudan: HDI 0.511, below the world average of 0.756");

  const poland = Name.judge(byId("name-pop-stan-land-m"), "Poland", new Set());
  assert.equal(poland.line, "🇵🇱 Poland: 36.4 million, not over 40 million");
  const kaz = Name.judge(byId("name-pop-stan-land-m"), "Kazakhstan", new Set());
  assert.equal(kaz.line, "🇰🇿 Kazakhstan: 20.8 million, not over 40 million");

  const india = Name.judge(byId("name-le-i"), "India", new Set());
  assert.equal(india.line, "🇮🇳 India: 72.2 years, below the United States (78.9)");

  const china = Name.judge(byId("name-forest-c"), "China", new Set());
  assert.equal(china.line, "🇨🇳 China: 24.0%, below the world average of 31.1%");
});

test("a guess that breaks both rules says so", () => {
  const both = Name.judge(byId("name-hdi-s"), "India", new Set());
  assert.equal(both.letterOk, false);
  assert.equal(both.statOk, false);
  assert.match(both.line, /HDI \d\.\d{3}, below the world average of 0\.756, and doesn't start with S/);
  const small = Name.judge(byId("name-pop-stan-land-m"), "Fiji", new Set());
  assert.equal(small.letterOk, false);
  assert.equal(small.statOk, false);
  assert.match(small.line, /not over 40 million, and doesn't end in -stan or -land, and doesn't start with M/);
});

test("duplicates and non-countries do not use a try", () => {
  const hdi = byId("name-hdi-s");
  const first = Name.judge(hdi, "United States", new Set());
  assert.equal(first.counts, true);
  const again = Name.judge(hdi, "USA", new Set([first.country.iso3]));
  assert.equal(again.status, "duplicate");
  assert.equal(again.counts, false);
  assert.match(again.line, /Already guessed United States/);
  const korea = Name.judge(hdi, "South Korea", new Set());
  const alias = Name.judge(hdi, "Korea", new Set([korea.country.iso3]));
  assert.equal(alias.status, "duplicate");
  assert.equal(alias.counts, false);
  const unknown = Name.judge(hdi, "Atlantis", new Set());
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.counts, false);
  assert.equal(unknown.line, "That's not a country.");
  const blank = Name.judge(hdi, "   ", new Set());
  assert.equal(blank.status, "empty");
  assert.equal(blank.counts, false);
});

test("stored answers are exactly the countries that pass both rules", () => {
  const expected = {
    "name-hdi-s": 14,
    "name-pop-stan-land-m": 5,
    "name-le-i": 5,
    "name-forest-c": 11,
  };
  for (const puzzle of puzzles) {
    assert.equal(puzzle.type, "name");
    assert.equal(puzzle.answers.length, expected[puzzle.id], puzzle.id);
    const rows = [];
    for (const [iso, value] of Object.entries(puzzle.values)) {
      const c = country(iso);
      assert.ok(c, iso);
      if (!Name.letterPass(c.name, puzzle.letter)) continue;
      if (!(Number(value) > Number(puzzle.threshold))) continue;
      rows.push({ iso, name: c.name, value: Number(value) });
    }
    rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "en"));
    assert.equal(JSON.stringify(puzzle.answers), JSON.stringify(rows.map(row => row.iso)), puzzle.id);
    for (const row of rows) assert.equal(Name.judge(puzzle, row.name, new Set()).status, "correct", row.name);
  }
  assert.equal(Name.judge(byId("name-hdi-s"), "Sweden", new Set()).status, "correct");
  assert.equal(Name.judge(byId("name-pop-stan-land-m"), "Mexico", new Set()).status, "correct");
  assert.equal(Name.judge(byId("name-le-i"), "Italy", new Set()).status, "correct");
  assert.equal(Name.judge(byId("name-forest-c"), "Canada", new Set()).status, "correct");
  assert.equal(Name.judge(byId("name-pop-stan-land-m"), "Netherlands", new Set()).status, "wrong");
});

test("rarity uses the one-play seed when the snapshot has no row", () => {
  const puzzle = byId("name-hdi-s");
  const seeded = Name.pickShare(puzzle, null, "Sweden");
  assert.equal(JSON.stringify(seeded), JSON.stringify({ pct: 100, players: 1, seeded: true }));
  const other = Name.pickShare(puzzle, null, "Sri Lanka");
  assert.equal(other.pct, 0);
  assert.equal(Name.isRare(puzzle, 0), true);
  assert.equal(Name.isRare(puzzle, 100), false);
  const live = Name.pickShare(puzzle, { firstGuessWorld: { players: 4, bars: [{ name: "Sweden", pct: 75 }, { name: "Spain", pct: 25 }] } }, "Spain");
  assert.equal(live.pct, 25);
  assert.equal(live.seeded, false);
  assert.equal(Name.pickShare(puzzle, { firstGuessWorld: { players: 4, bars: [{ name: "Sweden", pct: 100 }] } }, "Serbia").pct, 0);
});

test("name accuracy follows try bands, not the top 5 miss count", () => {
  const seed = sandbox.RankdSeed;
  assert.equal(seed.combineAccuracy([0], true, "name"), 100);
  assert.equal(seed.combineAccuracy([0, 0, 0], true, "top5"), 100);
  const threeGoods = seed.combineAccuracy([0, 0, 0], true, "name");
  assert.ok(threeGoods >= 50 && threeGoods <= 74, threeGoods);
  const second = seed.combineAccuracy([1, 0], true, "name");
  assert.ok(second >= 75 && second <= 95, second);
  assert.equal(seed.combineAccuracy([1, 1, 1, 1, 1], true, "name"), 0);
  assert.equal(seed.combineAccuracy([1], false, "name"), 0);
  const block = seed.standingBlock("name-hdi-s", 900, "name", 1);
  assert.equal(block.firstOf, 1);
  assert.equal(block.kind, "name");
  assert.ok(block.avgTries >= 2.8 && block.avgTries <= 3.6, block.avgTries);
  assert.ok(block.avgAccuracy >= 50 && block.avgAccuracy <= 72, block.avgAccuracy);
});

test("name puzzles are appended after the existing daily queue", () => {
  const dataBox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "puzzles-data.js"), "utf8"), dataBox, { filename: "puzzles-data.js" });
  const base = dataBox.window.RANKD_PUZZLES;
  const ids = new Set(base.map(p => p.id));
  for (const puzzle of puzzles) {
    assert.equal(ids.has(puzzle.id), false, puzzle.id);
    assert.equal(/homicide|suicide|murder|overdose|cannabis|marijuana|penis|pornograph|sex|drug/i.test(`${puzzle.id} ${puzzle.headline} ${puzzle.question} ${puzzle.stat}`), false);
  }
  let max = 0;
  base.forEach(p => { const order = Math.round(p.order) || 0; if (order > 0 && order < 10000 && order > max) max = order; });
  assert.equal(max, 163);
  const epoch = Date.UTC(2026, 9, 6);
  const dateOf = order => new Date(epoch + (order - 1) * 864e5).toISOString().slice(0, 10);
  puzzles.forEach((puzzle, i) => {
    const order = max + 1 + i;
    assert.equal(dateOf(164), "2027-03-18");
    assert.ok(dateOf(order) > "2026-11-03", puzzle.id);
    assert.equal(dateOf(167), "2027-03-21");
  });
});

test("about one practice seed in eight deals Name it without touching the other seeds' roll", () => {
  let hits = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const puzzle = Name.practiceFromSeed(seed);
    if (!puzzle) continue;
    hits++;
    assert.equal(puzzle.id, "rp-" + seed);
    assert.equal(puzzle.practice, true);
    assert.ok(puzzles.some(item => item.id === puzzle.sourceId));
    assert.equal(puzzle.order, null);
  }
  assert.ok(hits > 160 && hits < 320, "hits " + hits);
});
