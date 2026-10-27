const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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

const shared = sandbox.window.RankdShared;
const archive = sandbox.window.RankdArchive;
const KEY = shared.LS.archiveUnlock;

function resetUnlock() {
  localStorage.removeItem(KEY);
  localStorage.removeItem("rankd.premium.v1");
  shared.CONFIG.premium.enabled = false;
}
function seed(days) {
  localStorage.setItem(KEY, JSON.stringify({ unlockedDays: days, at: 1 }));
}
function keyAtAge(age) {
  return shared.keyFromDay(shared.dayNumber(shared.todayKey()) - age);
}

test("the free window stays 7 and each ad adds 5", () => {
  assert.equal(shared.CONFIG.freeArchiveDays, 7);
  assert.equal(shared.CONFIG.adUnlockDays, 5);
  assert.equal(archive.baseDays(), 7);
  assert.equal(archive.adUnlockDays(), 5);
  assert.equal(KEY, "rankd.archiveUnlock.v1");
});

test("a new player gets today plus the six days before it", () => {
  resetUnlock();
  assert.equal(archive.getUnlockedDays(), 7);
  assert.equal(archive.freeUnlocked(keyAtAge(0)), true);
  assert.equal(archive.freeUnlocked(keyAtAge(6)), true);
  assert.equal(archive.freeUnlocked(keyAtAge(7)), false);
});

test("one ad opens the next 5 days, then another 5", () => {
  resetUnlock();
  assert.equal(archive.applyAdUnlock(), 12);
  assert.equal(archive.freeUnlocked(keyAtAge(11)), true);
  assert.equal(archive.freeUnlocked(keyAtAge(12)), false);
  assert.equal(archive.applyAdUnlock(), 17);
  assert.equal(archive.freeUnlocked(keyAtAge(16)), true);
  assert.equal(archive.freeUnlocked(keyAtAge(17)), false);
});

test("a saved unlockedDays count from the old 7-day ads is kept", () => {
  resetUnlock();
  for (const saved of [7, 14, 21, 28]) {
    seed(saved);
    assert.equal(archive.getUnlockedDays(), saved, `saved ${saved}`);
    assert.equal(archive.freeUnlocked(keyAtAge(saved - 1)), true, `age ${saved - 1}`);
    assert.equal(archive.freeUnlocked(keyAtAge(saved)), false, `age ${saved}`);
    assert.equal(archive.applyAdUnlock(), saved + 5, `next after ${saved}`);
    const raw = JSON.parse(localStorage.getItem(KEY));
    assert.equal(raw.unlockedDays, saved + 5);
    assert.equal(typeof raw.at, "number");
    assert.ok(raw.at > 1);
  }
});

test("a missing, short, or broken save still opens the free 7 days", () => {
  resetUnlock();
  seed(4);
  assert.equal(archive.getUnlockedDays(), 7);
  assert.equal(archive.freeUnlocked(keyAtAge(6)), true);
  localStorage.setItem(KEY, "{}");
  assert.equal(archive.getUnlockedDays(), 7);
  localStorage.setItem(KEY, "{");
  assert.equal(archive.getUnlockedDays(), 7);
  localStorage.setItem(KEY, "null");
  assert.equal(archive.getUnlockedDays(), 7);
});

test("player-facing copy says 5 for the ad and keeps the 7-day base", () => {
  assert.equal(archive.toast(), "Unlocked 5 more days — tap again for older puzzles");
  const upsell = '<button type="button" class="prem-upsell">Premium unlocks ranki.gg + whereisshe.gg: no ads, full archive, and ad-free Practice. From $2.67/month · suggested $6.70</button>';
  assert.equal(archive.longAdCopy(), "Watch to unlock the next 5 days of the archive. Premium unlocks ranki.gg + whereisshe.gg: no ads, full archive, and ad-free Practice. From $2.67/month · suggested $6.70");
  const header = archive.headerHtml(7, 19);
  assert.equal(header, 'Free: <b>7</b> days unlocked (base 7). Watch an ad for the next 5 days. ' + upsell);
  assert.equal(archive.headerHtml(21, 19), 'Free: <b>20</b> days unlocked (base 7). Watch an ad for the next 5 days. ' + upsell);

  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(app, /toast\(archiveUnlockToast\(\)\)/);
  assert.match(app, /archiveLongAdCopy\(\)/);
  assert.match(app, /archiveListHeaderHtml\(unlocked, last\)/);
  assert.match(app, /applyArchiveAdUnlock\(\)/);
  assert.doesNotMatch(app, /archiveChunk\(/);
  assert.doesNotMatch(app, /next week/);
  assert.doesNotMatch(app, /Unlocked 7 more days/);
  assert.doesNotMatch(app, /next 7 days/);
  assert.match(html, /the latest <b>7<\/b> days are free\. Watch an ad to open the next 5 days\./);
  assert.match(html, /Watch to unlock the next 5 days of the archive\./);
  assert.match(html, /Each archive ad unlocks the next 5 days/);
  assert.doesNotMatch(html, /week/i);
});
