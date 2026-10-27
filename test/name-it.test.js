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
    "name-hdi-between-s": 3,
    "name-age-between-c": 3,
    "name-road-between-u": 2,
  };
  for (const puzzle of puzzles) {
    assert.equal(puzzle.type, "name");
    assert.equal(puzzle.answers.length, expected[puzzle.id], puzzle.id);
    const rows = [];
    for (const [iso, value] of Object.entries(puzzle.values)) {
      const c = country(iso);
      assert.ok(c, iso);
      if (!Name.passes(puzzle, iso)) continue;
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
  assert.equal(seed.combineAccuracy([0, 0, 0], true, "name"), 79);
  assert.equal(seed.combineAccuracy([1, 0], true, "name"), 98);
  assert.equal(seed.combineAccuracy([1, 1, 1, 1, 1], true, "name"), 35);
  const unfinished = seed.combineAccuracy([1], false, "name");
  assert.equal(unfinished, 18);
  assert.ok(unfinished < seed.combineAccuracy([1, 1, 1, 1, 1], true, "name"));
  const block = seed.standingBlock("name-hdi-s", 900, "name", 1);
  assert.equal(block.firstOf, 1);
  assert.equal(block.kind, "name");
  assert.ok(block.avgTries >= 2.8 && block.avgTries <= 3.6, block.avgTries);
  assert.ok(block.avgAccuracy >= 50 && block.avgAccuracy <= 72, block.avgAccuracy);
});

test("a range is exclusive, and a miss says too high, too low, or the letter", () => {
  const hdi = byId("name-hdi-between-s");
  assert.equal(hdi.statRule.op, "between");
  assert.equal(JSON.stringify(hdi.answers), JSON.stringify(["SGP", "KOR", "SVN"]));
  assert.equal(Name.judge(hdi, "Singapore", new Set()).status, "correct");
  assert.equal(Name.judge(hdi, "Sweden", new Set()).line, "🇸🇪 Sweden's HDI is not strictly between Spain's and Germany's");
  assert.equal(Name.judge(hdi, "Spain", new Set()).line, "🇪🇸 Spain's HDI is not strictly between Spain's and Germany's");
  assert.equal(Name.judge(hdi, "Sudan", new Set()).line, "🇸🇩 Sudan's HDI is below Spain's");
  assert.equal(Name.judge(hdi, "Switzerland", new Set()).line, "🇨🇭 Switzerland's HDI is above Germany's");
  assert.equal(Name.judge(hdi, "South Africa", new Set()).line, "🇿🇦 South Africa's HDI is below Spain's");
  const france = Name.judge(hdi, "France", new Set());
  assert.equal(france.letterOk, false);
  assert.equal(france.statOk, true);
  assert.equal(france.line, "🇫🇷 France: doesn't start with S");
  assert.equal(/HDI|0\.920|below|above/.test(france.line), false);
  const india = Name.judge(hdi, "India", new Set());
  assert.equal(india.line, "🇮🇳 India's HDI is below Spain's, and doesn't start with S");
  const reveal = Name.revealHtml(hdi, { pick: "Slovenia" });
  assert.match(reveal, /Between Spain \(0\.918\) and Germany \(0\.959\), not including either\./);
  assert.equal(reveal.includes('data-name="Spain"'), false);
  assert.equal(reveal.includes('data-name="Germany"'), false);
  assert.match(reveal, /data-name="Singapore"/);
  assert.match(reveal, /data-name="Slovenia"[^>]*class="name-chip is-yours"|class="name-chip is-yours"[^>]*data-name="Slovenia"/);

  const age = byId("name-age-between-c");
  assert.equal(JSON.stringify(age.answers.map(iso => country(iso).name)), JSON.stringify(["Cuba", "Canada", "China"]));
  assert.equal(Name.judge(age, "China", new Set()).status, "correct");
  assert.equal(Name.judge(age, "Czechia", new Set()).line, "🇨🇿 Czechia's median age is above France's");
  assert.equal(Name.judge(age, "Chile", new Set()).line, "🇨🇱 Chile's median age is below Ireland's");
  assert.equal(Name.passes(age, "FRA"), false);
  assert.equal(Name.passes(age, "IRL"), false);
  assert.match(Name.revealHtml(age, null), /Between Ireland \(38\.42 years\) and France \(41\.82 years\), not including either\./);

  const road = byId("name-road-between-u");
  assert.equal(JSON.stringify(road.answers.map(iso => country(iso).name)), JSON.stringify(["Uganda", "United States"]));
  assert.equal(Name.judge(road, "Uganda", new Set()).status, "correct");
  assert.equal(Name.judge(road, "Ukraine", new Set()).line, "🇺🇦 Ukraine's road death rate is below Malaysia's");
  const indiaRoad = Name.judge(road, "India", new Set());
  assert.equal(indiaRoad.statOk, true);
  assert.equal(indiaRoad.letterOk, false);
  assert.equal(indiaRoad.line, "🇮🇳 India: doesn't start with U");
  assert.equal(/14\.|per 100k|below|above/.test(indiaRoad.line), false);
  assert.equal(Name.passes(road, "MYS"), false);
  assert.equal(Name.passes(road, "COL"), false);
  assert.match(Name.revealHtml(road, { pick: "United States" }), /Between Malaysia \(13\.9 per 100k\) and Colombia \(16\.2 per 100k\), not including either\./);
});

test("name puzzles take the open days after the ranks already on the sheet", () => {
  const dataBox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "puzzles-data.js"), "utf8"), dataBox, { filename: "puzzles-data.js" });
  const base = dataBox.window.RANKD_PUZZLES;
  const ids = new Set(base.map(p => p.id));
  for (const puzzle of puzzles) {
    assert.equal(ids.has(puzzle.id), false, puzzle.id);
    assert.equal(/homicide|suicide|murder|overdose|cannabis|marijuana|penis|pornograph|sex|drug/i.test(`${puzzle.id} ${puzzle.headline} ${puzzle.question} ${puzzle.stat}`), false);
  }
  const store = new Map();
  const storage = () => ({
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  });
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
    window: { RANKD_STUDIO: true, RANKD_PUZZLES: base, RANKD_NAME_PUZZLES: puzzles },
    document,
    localStorage: storage(),
    sessionStorage: storage(),
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
  vm.runInContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), appBox, { filename: "app.js" });
  const scheduled = appBox.window.RankdShared.puzzles;
  const epoch = Date.UTC(2026, 9, 6);
  const dateOf = index => new Date(epoch + index * 864e5).toISOString().slice(0, 10);
  const tail = scheduled.slice(-22).map((p, i) => ({ id: p.id, date: dateOf(scheduled.length - 22 + i), order: Math.round(p.order) }));
  assert.equal(JSON.stringify(tail), JSON.stringify([
    { id: "cocaine-use", date: "2027-03-23", order: 169 },
    { id: "ipsos-gender-identity", date: "2027-03-24", order: 170 },
    { id: "ipsos-gender-identity-b", date: "2027-03-25", order: 171 },
    { id: "top1-potatoes", date: "2027-03-26", order: 172 },
    { id: "top1-tea", date: "2027-03-27", order: 173 },
    { id: "top1-co2", date: "2027-03-28", order: 174 },
    { id: "top1-pop-2100", date: "2027-03-29", order: 175 },
    { id: "top1-median-age", date: "2027-03-30", order: 176 },
    { id: "top1-road-deaths", date: "2027-03-31", order: 177 },
    { id: "hdi-quality", date: "2027-04-01", order: 178 },
    { id: "pop-2100", date: "2027-04-02", order: 179 },
    { id: "democracy-eiu-2024", date: "2027-04-03", order: 180 },
    { id: "median-age-wpp", date: "2027-04-04", order: 181 },
    { id: "road-deaths-2021", date: "2027-04-05", order: 182 },
    { id: "name-hdi-between-s", date: "2027-04-06", order: 183 },
    { id: "name-age-between-c", date: "2027-04-07", order: 184 },
    { id: "name-road-between-u", date: "2027-04-08", order: 185 },
    { id: "wealth-share-top10", date: "2027-04-09", order: 186 },
    { id: "wealth-share-top1", date: "2027-04-10", order: 187 },
    { id: "match-meat-cuts", date: "2027-04-11", order: 188 },
    { id: "cocaine-destination", date: "2027-04-12", order: 189 },
    { id: "top1-pop-density", date: "2027-04-13", order: 190 }
  ]));
  const loss = { type: "name", solved: false, done: true, marks: ["bad", "bad", "bad", "bad", "bad"] };
  assert.equal(appBox.window.RankdShared.rating.ratingShout(loss), "Ignorant!");
  assert.equal(appBox.window.RankdShared.rating.cheerChoice(loss, false), "ignorant");
  const win = { type: "name", solved: true, done: true, tries: 2, marks: ["bad", "good"] };
  assert.equal(appBox.window.RankdShared.rating.ratingShout(win), "");
  assert.equal(sandbox.RankdSeed.combineAccuracy([1, 0], true, "name"), 98);
  const high = scheduled.find(p => p.id === "cannabis-use");
  assert.equal(high.sensitive, true);
  assert.equal(high.unit, "% of adults (15–64)");
  const powder = scheduled.find(p => p.id === "cocaine-use");
  assert.equal(powder.sensitive, true);
  assert.equal(powder.unit, "% of adults (15–64)");
  tail.slice(0, 4).forEach(row => assert.ok(row.date > "2026-11-03", row.id));
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
