const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const EPOCH = "2026-10-06";
const CUTOFF = "2026-11-03";

function keyFrom(n) {
  const [y, m, d] = EPOCH.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function boot() {
  const document = {
    documentElement: { dataset: {}, style: {}, classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } } },
    body: { classList: { toggle() {}, add() {}, remove() {} }, appendChild() {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, addEventListener() {} }),
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
  for (const file of ["puzzles-data.js", "practice-data.js", "number-puzzles.js", "number-guess.js", "name-puzzles.js", "part1-puzzles.js", "app.js"]) {
    vm.runInContext(read(file), appBox, { filename: file });
  }
  return appBox.window;
}

const practice = (() => {
  const box = { window: {} };
  vm.runInNewContext(read("practice-data.js"), box);
  return box.window.RANKD_PRACTICE;
})();

test("guess the number accuracy is 100 at a match and 0 at 3x", () => {
  const NumberGuess = (() => {
    const box = { window: {} };
    vm.runInNewContext(read("number-puzzles.js"), box);
    vm.runInNewContext(read("number-guess.js"), box);
    return box.window.RankdNumber;
  })();
  const truth = 2.55;
  const acc = ratio => Math.max(0, Math.min(100, Math.round(100 * (1 - Math.log(ratio) / Math.log(3)))));
  assert.equal(NumberGuess.score(truth, truth).accuracy, 100);
  assert.equal(NumberGuess.score(truth * 1.25, truth).accuracy, acc(1.25));
  assert.equal(NumberGuess.score(truth * 1.5, truth).accuracy, acc(1.5));
  assert.equal(NumberGuess.score(truth / 2, truth).accuracy, acc(2));
  assert.equal(NumberGuess.score(truth * 3, truth).accuracy, 0);
  assert.equal(NumberGuess.score(truth * 3.01, truth).accuracy, 0);
  assert.equal(NumberGuess.score(0, truth).accuracy, 0);
  assert.equal(NumberGuess.score("", truth).accuracy, 0);
  assert.ok(NumberGuess.score(truth * 1.25, truth).accuracy > NumberGuess.score(truth * 2, truth).accuracy);
  const sets = NumberGuess.sets();
  const stats = (() => {
    const box = { window: {} };
    vm.runInNewContext(read("number-stats.js"), box);
    return box.window.RANKD_NUMBER_STATS;
  })();
  assert.equal(sets.filter(s => s.sensitive).map(s => s.id).join(","), "number-femicide");
  assert.ok(sets.length >= 6);
  const homicide = Object.fromEntries(practice.datasets.find(d => d.id === "unodc-homicide-female").rows.map(r => [r[0], r]));
  for (const set of sets) {
    const floor = set.id === "number-femicide" ? 20 : 15;
    assert.ok(set.pairs.length >= floor && set.pairs.length <= 24, set.id + " " + set.pairs.length);
    const series = stats.find(s => s.id === set.id);
    const seen = new Set();
    for (const pair of set.pairs) {
      if (set.id === "number-femicide") {
        assert.equal(pair.known.value, homicide[pair.known.iso3][1]);
        assert.equal(pair.ask.value, homicide[pair.ask.iso3][1]);
      } else {
        const known = series.rows.find(r => r[0] === pair.known.iso3);
        const ask = series.rows.find(r => r[0] === pair.ask.iso3);
        assert.equal(pair.known.value, known[1], set.id + " " + pair.known.iso3);
        assert.equal(pair.ask.value, ask[1], set.id + " " + pair.ask.iso3);
        assert.match(pair.fact, new RegExp(pair.known.name));
        assert.match(pair.fact, new RegExp(pair.ask.name));
      }
      assert.ok(pair.fact && pair.fact.length > 40, set.id);
      const id = pair.known.iso3 + "-" + pair.ask.iso3;
      assert.equal(seen.has(id), false, set.id + " " + id);
      seen.add(id);
      const card = NumberGuess.card(set, pair);
      assert.equal(card.sensitive, !!set.sensitive);
      assert.equal(card.fillerDate, "2027-05-06");
      assert.match(card.question, new RegExp(pair.known.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});

test("number cards fill the bundle after the AdSense window and score accuracy", () => {
  const win = boot();
  const bonus = win.RankdBonus;
  const cards = win.RankdNumber.allCards();
  assert.ok(cards.length >= 20);
  assert.equal(bonus.points(cards[0]), 2);
  assert.ok(bonus.scheduledDate(cards[0]) >= bonus.lateFrom);
  const early = bonus.pool(CUTOFF);
  assert.equal(early.some(p => p.sensitive), false);
  assert.ok(early.some(p => p.type === "number" && !p.sensitive), "a non-sensitive stat fills safe dates");
  const later = bonus.pool("2026-11-04");
  assert.ok(later.some(p => p.type === "number" && p.sensitive), "female homicide stays available after the window");
  assert.ok(later.some(p => p.type === "number" && !p.sensitive));
  const puzzle = cards.find(c => c.ask.iso3 === "USA" && c.known.iso3 === "IND");
  const close = win.RankdNumber.lock(win.RankdNumber.blank(), puzzle, 2.55);
  assert.equal(close.done, true);
  assert.equal(close.accuracy, 100);
  assert.equal(bonus.score(puzzle, close).score, 100);
  assert.equal(bonus.score(puzzle, close).weight, 2);
  const off = win.RankdNumber.lock(win.RankdNumber.blank(), puzzle, 2.55 * 3);
  assert.equal(off.accuracy, 0);
  assert.equal(bonus.score(puzzle, off).score, 0);

  win.RankdShared.CONFIG.adsenseSafeThrough = "";
  let sawSensitive = false, sawOpen = false;
  for (let seed = 1; seed <= 900 && !(sawSensitive && sawOpen); seed++) {
    const dealt = win.RankdPractice.generate(seed);
    if (dealt && dealt.type === "number") {
      assert.equal(dealt.practice, true);
      if (dealt.sensitive) sawSensitive = true;
      else sawOpen = true;
    }
  }
  assert.ok(sawSensitive && sawOpen, "practice deals both kinds outside the window");
  win.RankdShared.CONFIG.adsenseSafeThrough = "2099-01-01";
  let sawSafePractice = false;
  for (let seed = 1; seed <= 400; seed++) {
    const dealt = win.RankdPractice.generate(seed);
    assert.ok(dealt, "seed " + seed);
    assert.equal(!!dealt.sensitive, false, seed);
    if (dealt.type === "number") sawSafePractice = true;
  }
  assert.ok(sawSafePractice, "practice still deals a non-sensitive number inside the window");

  win.RankdShared.CONFIG.adsenseSafeThrough = CUTOFF;
  const used = [];
  const statIds = new Set();
  for (let n = 0; n < 120; n++) {
    const parts = bonus.parts(n);
    const date = keyFrom(n);
    const total = parts.reduce((sum, p) => sum + bonus.points(p), 0);
    const floor = parts.reduce((sum, p) => sum + bonus.points(p), 0);
    const titleWeight = parts.filter(p => p.role === "title").reduce((sum, p) => sum + bonus.points(p), 0);
    assert.ok(total <= bonus.ceiling || total === titleWeight, date + " " + total);
    assert.ok(floor >= 1, date);
    const numbers = parts.filter(p => p.type === "number");
    assert.equal(new Set(numbers.map(p => p.parentId)).size, numbers.length, date);
    for (const filler of numbers) {
      if (date <= CUTOFF) assert.equal(filler.sensitive, false, filler.id);
      for (const prev of used) {
        if (n - prev.n > 30) continue;
        assert.notEqual(prev.id, filler.id, filler.id);
        assert.notEqual(prev.parent, filler.parentId, filler.parentId + " on " + date);
      }
      used.push({ n, id: filler.id, parent: filler.parentId });
      statIds.add(filler.parentId);
    }
  }
  assert.ok(statIds.size >= 2, "stats " + [...statIds].join(","));
});

test("the crowd line uses a big enough sample and keeps the old breakdown behind a deeper dive", () => {
  const html = read("index.html");
  const app = read("app.js");
  assert.match(html, /id="quizLock"/);
  assert.match(html, /id="numberGame"/);
  assert.match(html, /Next part →/);
  assert.match(html, /Deeper dive/);
  assert.match(app, /See your score/);
  assert.match(app, /higher than it really is/);
  assert.match(read("styles.css"), /\.part-next\{/);
  const win = boot();
  const puzzle = {
    type: "rank",
    higherIs: "top",
    items: [
      { name: "Japan", value: 40 },
      { name: "Brazil", value: 30 },
      { name: "Germany", value: 20 },
      { name: "India", value: 10 },
    ],
  };
  const bars = [
    { slot: 1, name: "India", pct: 80 },
    { slot: 2, name: "Germany", pct: 50 },
    { slot: 3, name: "Brazil", pct: 50 },
    { slot: 4, name: "Japan", pct: 80 },
  ];
  const seeded = {
    seeded: true,
    players: 40,
    standing: { n: 40 },
    firstGuessWorld: { players: 1, bars: bars },
    firstGuessByCountry: { TW: { players: 12, bars: [
      { slot: 1, name: "Brazil", pct: 80 },
      { slot: 2, name: "Japan", pct: 50 },
      { slot: 3, name: "India", pct: 50 },
      { slot: 4, name: "Germany", pct: 50 },
    ] } },
  };
  const lines = win.RankdInsight.lines(puzzle, seeded, "TW");
  assert.ok(lines.length >= 1 && lines.length <= 2);
  assert.match(lines.join(" "), /Players worldwide ranked India/);
  assert.match(lines.join(" "), /higher than it really is|too low/);
  assert.match(lines.join(" "), /Players in Taiwan/);
  const tiny = win.RankdInsight.lines(puzzle, { seeded: true, standing: { n: 4 }, firstGuessWorld: { players: 1, bars: bars } }, "TW");
  assert.equal(tiny.length, 0);
  assert.match(read("styles.css"), /\.day-payoff\{/);
  assert.match(read("sw.js"), /ranki-shell-v38/);
  assert.match(read("sw.js"), /\/number-guess\.js/);
});
