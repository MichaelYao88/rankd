const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const store = new Map();
function storage() {
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}
const localStorage = storage();
const sessionStorage = storage();
const document = {
  documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} },
  addEventListener() {},
};
const sandbox = {
  window: { RANKD_STUDIO: true },
  document,
  localStorage,
  sessionStorage,
  location: { protocol: "http:", pathname: "/", search: "", hostname: "localhost", hash: "" },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp,
  Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout,
  fetch: () => Promise.reject(new Error("no")),
  AbortController,
};
sandbox.globalThis = sandbox;
sandbox.window.document = document;
sandbox.window.localStorage = localStorage;
sandbox.window.sessionStorage = sessionStorage;
sandbox.window.location = sandbox.location;
sandbox.window.matchMedia = sandbox.matchMedia;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), sandbox, { filename: "app.js" });
const rating = sandbox.window.RankdRating;

const dataBox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "puzzles-data.js"), "utf8"), dataBox, { filename: "puzzles-data.js" });
const puzzles = dataBox.window.RANKD_PUZZLES;

const DE = "🇩🇪";
const BLANK = "🏳️";

function rank(marksList, extra) {
  const attempts = marksList.map(marks => ({ marks: marks.slice(), order: marks.map((_, i) => i) }));
  const last = attempts[attempts.length - 1];
  const solved = !!(last && last.marks.every(m => m === "good"));
  return { type: "rank", attempts, tries: attempts.length, solved, done: true, ...extra };
}

test("Ignorant! is only the all-wrong opening, and it beats the identity shout", () => {
  const allBad = rank([["bad", "bad", "bad", "bad"]]);
  assert.equal(rating.openingAllWrong(allBad), true);
  assert.equal(rating.ratingShout(allBad), "Ignorant!");
  assert.equal(rating.cheerChoice(allBad, true), "ignorant");
  assert.equal(rating.cheerChoice(allBad, false), "ignorant");

  const mixed = rank([["good", "bad", "bad", "bad"]]);
  assert.equal(rating.openingAllWrong(mixed), false);
  assert.equal(rating.ratingShout(mixed), "");
  assert.equal(rating.cheerChoice({ ...mixed, solved: false, done: false }, true), null);

  const solvedFirst = rank([["good", "good", "good"]], { solved: true, tries: 1 });
  assert.equal(rating.ratingShout(solvedFirst), "");
  assert.equal(rating.cheerChoice(solvedFirst, true), "explosive");

  const recovered = rank([["bad", "bad", "bad"], ["good", "good", "good"]], { solved: true, tries: 2 });
  assert.equal(rating.openingAllWrong(recovered), true);
  assert.equal(rating.ratingShout(recovered), "");
  assert.equal(rating.cheerChoice(recovered, true), "big");

  const failedLater = rank([
    ["bad", "bad", "bad", "bad"],
    ["good", "bad", "bad", "bad"],
  ], { solved: false, done: true, tries: 2 });
  assert.equal(rating.ratingShout(failedLater), "Ignorant!");
  assert.equal(rating.cheerChoice(failedLater, true), null);

  const laterAllBad = rank([
    ["good", "bad", "bad"],
    ["bad", "bad", "bad"],
  ], { solved: false, done: true });
  assert.equal(rating.cheerChoice(laterAllBad, true), "racist");
  assert.equal(rating.ratingShout(laterAllBad), "");
});

test("Top 5 Ignorant! is all five slots missed on the opening guesses", () => {
  const slots = { type: "top5", attempts: [{ marks: ["bad", "bad", "bad", "bad", "bad"] }], solved: false, won: false, done: true, tries: 1, hits: 0 };
  assert.equal(rating.openingAllWrong(slots), true);
  assert.equal(rating.ratingShout(slots), "Ignorant!");
  assert.equal(rating.cheerChoice(slots, false), "ignorant");

  const slotWin = { type: "top5", attempts: [{ marks: ["good", "good", "good", "good", "good"] }], solved: true, won: true, tries: 1, hits: 5 };
  assert.equal(rating.ratingShout(slotWin), "");
  assert.equal(rating.cheerChoice(slotWin, false), "explosive");

  const slotMixed = { type: "top5", attempts: [{ marks: ["bad", "good", "bad", "bad", "bad"] }], solved: false, done: true, tries: 1 };
  assert.equal(rating.openingAllWrong(slotMixed), false);
  assert.equal(rating.ratingShout(slotMixed), "");
  assert.equal(rating.cheerChoice(slotMixed, false), null);

  const missed = { type: "top5", marks: ["miss", "miss", "miss", "miss", "miss", "miss"], hits: 0, misses: 6, won: false, done: true };
  assert.equal(rating.openingAllWrong(missed), true);
  assert.equal(rating.ratingShout(missed), "Ignorant!");
  assert.equal(rating.cheerChoice(missed, false), "ignorant");

  const flawless = { type: "top5", marks: ["good", "good", "good", "good", "good"], hits: 5, misses: 0, won: true };
  assert.equal(rating.ratingShout(flawless), "");
  assert.equal(rating.cheerChoice(flawless, false), "explosive");

  const brilliant = { type: "top5", marks: ["miss", "good", "good", "good", "good", "good"], hits: 5, misses: 1, won: true };
  assert.equal(rating.cheerChoice(brilliant, false), "big");
  assert.equal(rating.ratingShout(brilliant), "");

  const recovered = { type: "top5", marks: ["miss", "miss", "miss", "miss", "miss", "good", "good"], hits: 2, misses: 5, won: false };
  assert.equal(rating.openingAllWrong(recovered), true);
  assert.equal(rating.ratingShout(recovered), "");
  assert.equal(rating.cheerChoice(recovered, false), null);

  const short = { type: "top5", marks: ["miss", "miss", "miss", "miss"], hits: 0, misses: 4, won: false };
  assert.equal(rating.openingAllWrong(short), false);
  assert.equal(rating.ratingShout(short), "");
});

test("Hitler's flag is blank and every other leader keeps theirs", () => {
  const puzzle = puzzles.find(p => p.id === "match-before-history");
  assert.ok(puzzle, "history puzzle missing");
  const hitler = puzzle.people.find(p => p.name === "Adolf Hitler");
  assert.ok(hitler);
  assert.equal(hitler.emoji, BLANK);
  assert.equal(hitler.flagImg, "flags/blank.svg");
  assert.equal(hitler.country, "Germany");
  assert.equal(hitler.iso3, "DEU");
  assert.equal(fs.existsSync(path.join(root, "flags/blank.svg")), true);

  const ho = puzzle.people.find(p => p.name === "Ho Chi Minh");
  const deng = puzzle.people.find(p => p.name === "Deng Xiaoping");
  const gandhi = puzzle.people.find(p => p.name === "Mahatma Gandhi");
  const rada = puzzle.people.find(p => p.name === "Radovan Karadžić");
  assert.equal(ho.emoji, "🇻🇳");
  assert.equal(deng.emoji, "🇨🇳");
  assert.equal(gandhi.emoji, "🇮🇳");
  assert.equal(rada.flagImg, "flags/yug.svg");
  assert.equal(rada.emoji || "", "");
  for (const person of puzzle.people) {
    if (person.name === "Adolf Hitler") continue;
    assert.notEqual(person.emoji, BLANK);
    assert.notEqual(person.flagImg, "flags/blank.svg");
    assert.notEqual(person.emoji, DE);
  }

  const js = fs.readFileSync(path.join(root, "puzzles-data.js"), "utf8");
  const hitlerAt = js.indexOf('"name":"Adolf Hitler"');
  assert.equal(js.slice(hitlerAt, hitlerAt + 120).includes(DE), false);
  assert.equal(js.includes(DE), true);

  const csv = fs.readFileSync(path.join(root, "match_puzzles.csv"), "utf8");
  const line = csv.split(/\r?\n/).find(row => row.includes("Adolf Hitler"));
  assert.ok(line.includes(BLANK));
  assert.ok(line.includes("flags/blank.svg"));
  assert.equal(line.includes(DE), false);
  assert.ok(csv.includes("🇻🇳"));
  assert.ok(csv.includes("flags/yug.svg"));

  const sheet = execFileSync("python3", ["-c", `
import zipfile
z=zipfile.ZipFile("puzzles.xlsx")
t=z.read("xl/worksheets/sheet6.xml").decode()
i=t.find('r="10"')
row=t[i:t.find("</row>", i)]
assert "Adolf Hitler" in row and "🏳️" in row and "flags/blank.svg" in row and "🇩🇪" not in row
s1=z.read("xl/worksheets/sheet1.xml").decode()
assert "🇩🇪" in s1
print("ok")
`], { cwd: root, encoding: "utf8" });
  assert.equal(sheet.trim(), "ok");

  const stats = fs.readFileSync(path.join(root, "community-stats.json"), "utf8");
  const self = [...stats.matchAll(/"name":"Adolf Hitler","matchedTo":"Adolf Hitler".{0,80}/g)].map(m => m[0]);
  assert.equal(self.length, 3);
  for (const bar of self) {
    assert.equal(bar.includes(DE), false);
    assert.ok(bar.includes(BLANK));
  }
  // A wrong-match row keeps the other leader's flag.
  assert.ok(stats.includes('"name":"Adolf Hitler","matchedTo":"Ho Chi Minh"'));
  assert.ok(stats.includes(DE));
});
