const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("node:child_process");

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
  assert.equal(total.title, "Older Men");
  assert.equal(free.title, "Free T");
  assert.equal(east.headline, "Older Men");
  assert.equal(west.headline, "Free T");
  assert.equal(dateOf(east.order) > "2026-11-10", true);
  assert.doesNotMatch(east.source + west.source, /TestosteroneDecline/i);
  assert.doesNotMatch(JSON.stringify(practice.datasets), /TestosteroneDecline|tdc-male-testosterone|Serum Levels/i);
  const numbers = load("number-puzzles.js").RANKD_NUMBER;
  assert.doesNotMatch(JSON.stringify(numbers), /testosteronedecline\.com/i);
  for (const it of east.items) assert.equal(total.rows.find(r => r[0] === it.name)[2], it.value);
  for (const it of west.items) assert.equal(free.rows.find(r => r[0] === it.name)[2], it.value);
  const sheet = execFileSync("python3", ["-c", "import zipfile; t=zipfile.ZipFile('puzzles.xlsx').read('xl/worksheets/sheet1.xml').decode(); assert 'TestosteroneDecline' not in t; assert 'Serum Levels' not in t; assert 'pmc.ncbi.nlm.nih.gov/articles/PMC3050097' in t; print('ok')"], { cwd: root, encoding: "utf8" });
  assert.equal(sheet.trim(), "ok");
});

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
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), appBox, { filename: file });
  }
  return appBox.window;
}

test("played days keep the old closer, and later days use MrOS", () => {
  const win = boot();
  const shared = win.RankdShared;
  const bonus = win.RankdBonus;
  const played = bonus.parts(shared.dayNumber("2026-10-29")).find(p => p.id === "male-testosterone-b");
  assert.equal(played.role, "closer");
  assert.equal(played.items[0].name, "Cameroon");
  assert.equal(played.items[0].value, 731);
  assert.match(played.source, /TestosteroneDecline\.com/);
  const firstAfter = id => {
    for (let n = shared.dayNumber("2026-11-11"); n <= shared.dayNumber("2027-06-01"); n++) {
      const part = bonus.parts(n).find(p => p.id === id);
      if (part) return part;
    }
    return null;
  };
  const future = firstAfter("male-testosterone-b");
  assert.equal(future.items[0].name, "Hong Kong men");
  assert.equal(future.items[0].value, 10.49);
  assert.equal(future.sourceUrl, "https://pmc.ncbi.nlm.nih.gov/articles/PMC3050097/");
  assert.doesNotMatch(future.source, /TestosteroneDecline/i);
  const eastPart = firstAfter("male-testosterone");
  assert.equal(eastPart.items[0].name, "Hong Kong men");
  assert.equal(eastPart.items[0].value, 529);
  assert.doesNotMatch(eastPart.source, /TestosteroneDecline/i);
  const later = bonus.pool("2026-11-11");
  assert.equal(later.some(p => /testosteronedecline\.com/i.test(p.source || "")), false);
  const practiceCard = win.RankdPractice.generate(1);
  for (let seed = 1; seed <= 80; seed++) {
    const card = win.RankdPractice.generate(seed);
    if (!card) continue;
    assert.doesNotMatch(String(card.sourceUrl || "") + String(card.dataset || ""), /testosteronedecline|tdc-male-testosterone/i, card.dataset || card.id);
  }
  assert.ok(practiceCard);
});
