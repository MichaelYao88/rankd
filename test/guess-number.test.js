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

test("guess the number scores by the error ratio and stays out of 2", () => {
  const NumberGuess = (() => {
    const box = { window: {} };
    vm.runInNewContext(read("number-puzzles.js"), box);
    vm.runInNewContext(read("number-guess.js"), box);
    return box.window.RankdNumber;
  })();
  const truth = 2.55;
  assert.equal(NumberGuess.score(truth, truth).points, 2);
  assert.equal(NumberGuess.score(truth * 1.25, truth).points, 2);
  assert.equal(NumberGuess.score(truth * 1.26, truth).points, 1.5);
  assert.equal(NumberGuess.score(truth * 1.5, truth).points, 1.5);
  assert.equal(NumberGuess.score(truth * 1.51, truth).points, 1);
  assert.equal(NumberGuess.score(truth / 2, truth).points, 1);
  assert.equal(NumberGuess.score(truth * 2.01, truth).points, 0.5);
  assert.equal(NumberGuess.score(truth * 3, truth).points, 0.5);
  assert.equal(NumberGuess.score(truth * 3.01, truth).points, 0);
  assert.equal(NumberGuess.score(0, truth).points, 0);
  assert.equal(NumberGuess.score("", truth).points, 0);
  const sets = NumberGuess.sets();
  assert.equal(sets.length, 1);
  assert.equal(sets[0].sensitive, true);
  assert.ok(sets[0].pairs.length >= 20);
  const rows = Object.fromEntries(practice.datasets.find(d => d.id === "unodc-homicide-female").rows.map(r => [r[0], r]));
  const seen = new Set();
  for (const pair of sets[0].pairs) {
    const known = rows[pair.known.iso3];
    const ask = rows[pair.ask.iso3];
    assert.ok(known && ask, pair.known.iso3 + " " + pair.ask.iso3);
    assert.equal(pair.known.value, known[1]);
    assert.equal(pair.ask.value, ask[1]);
    assert.equal(String(pair.known.year), String(known[2]));
    assert.equal(String(pair.ask.year), String(ask[2]));
    assert.ok(pair.fact && pair.fact.length > 20);
    const id = pair.known.iso3 + "-" + pair.ask.iso3;
    assert.equal(seen.has(id), false, id);
    seen.add(id);
    const card = NumberGuess.card(sets[0], pair);
    assert.equal(card.type, "number");
    assert.equal(card.sensitive, true);
    assert.equal(card.fillerDate, "2027-05-06");
    assert.match(card.question, new RegExp(pair.known.name));
    assert.doesNotMatch(card.question, new RegExp(pair.ask.value));
  }
});

test("number cards fill the bundle after the AdSense window and score halves", () => {
  const win = boot();
  const bonus = win.RankdBonus;
  const cards = win.RankdNumber.allCards();
  assert.ok(cards.length >= 20);
  assert.equal(bonus.points(cards[0]), 2);
  assert.ok(bonus.scheduledDate(cards[0]) >= bonus.lateFrom);
  const early = bonus.pool(CUTOFF);
  assert.equal(early.some(p => p.type === "number" || p.sensitive), false);
  const later = bonus.pool("2026-11-04");
  assert.ok(later.some(p => p.type === "number" && p.sensitive), "number cards enter the filler pool");
  const puzzle = cards.find(c => c.ask.iso3 === "USA" && c.known.iso3 === "IND");
  const close = win.RankdNumber.lock(win.RankdNumber.blank(), puzzle, 2.4);
  assert.equal(close.done, true);
  assert.equal(close.points, 2);
  assert.equal(bonus.score(puzzle, close).score, 2);
  assert.equal(bonus.score(puzzle, close).max, 2);
  const off = win.RankdNumber.lock(win.RankdNumber.blank(), puzzle, 1.2);
  assert.equal(off.points, 0.5);
  assert.equal(bonus.score(puzzle, off).score, 0.5);

  win.RankdShared.CONFIG.adsenseSafeThrough = "";
  let found = null;
  for (let seed = 1; seed <= 800 && !found; seed++) {
    const dealt = win.RankdPractice.generate(seed);
    if (dealt && dealt.type === "number") found = dealt;
  }
  assert.ok(found, "practice can deal a number card");
  assert.equal(found.sensitive, true);
  assert.equal(found.practice, true);
  win.RankdShared.CONFIG.adsenseSafeThrough = "2099-01-01";
  for (let seed = 1; seed <= 80; seed++) {
    const dealt = win.RankdPractice.generate(seed);
    assert.ok(dealt, "seed " + seed);
    assert.notEqual(dealt.type, "number", seed);
    assert.equal(!!dealt.sensitive, false, seed);
  }

  let saw = false;
  for (let n = 0; n < 80; n++) {
    const parts = bonus.parts(n);
    const date = keyFrom(n);
    const total = parts.reduce((sum, p) => sum + bonus.points(p), 0);
    assert.ok(total <= bonus.ceiling || total >= 11, date + " " + total);
    for (const filler of parts.slice(0, -1)) {
      if (date <= CUTOFF) assert.equal(!!filler.sensitive, false, filler.id);
      if (filler.type === "number") saw = true;
    }
  }
  assert.equal(typeof saw, "boolean");
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
  assert.match(read("sw.js"), /ranki-shell-v34/);
  assert.match(read("sw.js"), /\/number-guess\.js/);
});
