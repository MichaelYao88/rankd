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
    clear: () => store.clear(),
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
const credits = sandbox.window.RankdArchiveCredits;
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const privacy = fs.readFileSync(path.join(root, "privacy.html"), "utf8");

const T0 = Date.UTC(2026, 10, 11, 12, 0, 0);   // fixed clock so the 12h window is deterministic
const WINDOW = 12 * 3600e3;
const keyAtAge = age => shared.keyFromDay(shared.dayNumber(shared.todayKey()) - age);

function reset(gate) {
  store.clear();
  shared.CONFIG.archiveGate = !!gate;
  shared.CONFIG.adsEnabled = false;
  shared.CONFIG.archiveUnlocksPerWindow = 3;
  shared.CONFIG.archiveUnlockWindowHours = 12;
  if (sandbox.window.RankdPremium) sandbox.window.RankdPremium.setPremiumCache(null);
}

test("the live site ships with ads off and the archive wall off", () => {
  assert.equal(shared.CONFIG.adsEnabled, false);
  assert.equal(shared.CONFIG.archiveGate, false);
  assert.equal(shared.CONFIG.archiveUnlocksPerWindow, 3);
  assert.equal(shared.CONFIG.archiveUnlockWindowHours, 12);
  assert.equal(credits.windowMs(), WINDOW);
  assert.equal(credits.max(), 3);
  assert.equal(credits.key, "rankd.archiveCredits.v1");
  assert.match(app, /const Ads = \{ allowed: \(\) => CONFIG\.adsEnabled && !streamerOn\(\) && !isPremium\(\)/);
  assert.match(app, /classList\.toggle\("ads-off", !CONFIG\.adsEnabled\)/);
  assert.match(css, /html\.ads-off \.ad-slot/);
  assert.match(app, /applyAdsEnabled\(\); applyStreamer\(\); applyPremium\(\)/);
});

test("with the gate off every day is free and nothing is written", () => {
  reset(false);
  assert.equal(credits.dayUnlocked(keyAtAge(0), T0), true);
  assert.equal(credits.dayUnlocked(keyAtAge(30), T0), true);
  assert.equal(store.size, 0, "no storage until Premium is live");
  assert.equal(credits.state(T0).used, 0);
});

test("with the gate on only today and unlocked days are playable", () => {
  reset(true);
  assert.equal(credits.dayUnlocked(keyAtAge(0), T0), true);
  assert.equal(credits.dayUnlocked(keyAtAge(1), T0), false);
  assert.equal(credits.dayUnlocked(keyAtAge(9), T0), false);
  assert.match(credits.header(), /Unlock! left/);
});

test("an old ad-unlock save is carried over when the gate switches on", () => {
  reset(true);
  localStorage.setItem(shared.LS.archiveUnlock, JSON.stringify({ unlockedDays: 14, at: 1 }));
  const st = credits.state(T0);
  assert.equal(st.migrated, true);
  assert.equal(st.days.length >= 14, true);
  assert.equal(credits.dayUnlocked(keyAtAge(13), T0), true);
  assert.equal(credits.dayUnlocked(keyAtAge(15), T0), false);
  assert.equal(JSON.parse(localStorage.getItem(credits.key)).migrated, true);
});

test("three Unlock! per window, then a cooldown until the window rolls over", () => {
  reset(true);
  const a = keyAtAge(2), b = keyAtAge(3), c = keyAtAge(4), d = keyAtAge(5);
  assert.equal(credits.unlockDay(a, T0).left, 2);
  assert.equal(credits.unlockDay(b, T0).left, 1);
  assert.equal(credits.unlockDay(c, T0).left, 0);
  assert.equal(credits.left(credits.state(T0)), 0);
  assert.equal(credits.dayUnlocked(a, T0), true);
  assert.equal(credits.dayUnlocked(d, T0), false);

  const blocked = credits.unlockDay(d, T0 + 1000);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "cooldown");
  assert.equal(blocked.endsAt, T0 + WINDOW);
  assert.equal(credits.clock(blocked.endsAt - (T0 + 1000)), "11:59:59");

  // Re-opening an already unlocked day is free and does not spend another credit.
  assert.equal(credits.unlockDay(a, T0 + 2000).already, true);
  assert.equal(credits.state(T0 + 2000).used, 3);

  // 12 hours later the window rolls and three more are available.
  const after = credits.state(T0 + WINDOW + 1);
  assert.equal(after.used, 0);
  assert.equal(credits.left(after), 3);
  assert.equal(credits.dayUnlocked(a, T0 + WINDOW + 1), true, "unlocked days stay unlocked");
  assert.equal(credits.unlockDay(d, T0 + WINDOW + 1).ok, true);
  assert.equal(credits.left(credits.state(T0 + WINDOW + 2)), 2);
});

test("Premium and challenge links bypass the credits entirely", () => {
  reset(true);
  if (sandbox.window.RankdPremium) sandbox.window.RankdPremium.setPremiumCache({ premium: true });
  assert.equal(credits.dayUnlocked(keyAtAge(20), T0), true);
  assert.match(app, /const viaChallenge = !!\(decoded && RC\.bypassArchiveAd\(decoded, key\)\)/);
  assert.match(app, /if \(archiveFreeUnlocked\(key\) \|\| viaChallenge\)/);
  if (sandbox.window.RankdPremium) sandbox.window.RankdPremium.setPremiumCache(null);
});

test("the archive UI offers Unlock! and a Go Premium wall with a clock", () => {
  assert.match(app, /🔓 Unlock!/);
  assert.doesNotMatch(app, /Watch ad ▶/);
  assert.match(app, /function showPremiumGate\(endsAt\)/);
  assert.match(app, /function requestArchiveUnlock\(key, then\)/);
  assert.match(app, /requestArchiveUnlock\(key, \(\) => \{/);
  assert.match(app, /Another \$\{archiveMaxCredits\(\)\} are ready in/);
  assert.match(app, /share unlocked puzzles with friends/);
  assert.match(app, /just-unlocked/);
  assert.match(css, /@keyframes rkUnlock/);
  assert.match(css, /\.gate-clock/);
  assert.match(html, /Play today, or unlock any past day\./);
  assert.doesNotMatch(html, /Watch an ad to open the next 5 days/);
});

test("the second About page and the aggregate source list are gone", () => {
  assert.doesNotMatch(app, /<button id="mAbout">/);
  assert.doesNotMatch(app, /function aboutModal\(\)/);
  assert.doesNotMatch(app, /<ol class="src-list">/);
  assert.match(app, /id="mAboutPage" href="about\.html"/);
  assert.match(html, /<a href="about\.html" id="aboutLink">About ranki\.gg<\/a>/);
  assert.doesNotMatch(html, /<a href="#" id="aboutLink">Sources<\/a>/);
});

test("the credits key is disclosed, clearable and preview-sandboxed", () => {
  assert.match(privacy, /<code>rankd\.archiveCredits\.v1<\/code>/);
  assert.match(app, /rankd\.archiveCredits\.v1: unlocked day keys/);
  assert.match(app, /rankd\.preview\.archiveCredits\.v1/);
  assert.match(app, /const isRankdKey = k => Object\.values\(LS\)\.includes\(k\) \|\| \/\^rankd\[\.:_-\]\/i\.test\(k\)/);
});

test("Premium price strings are untouched", () => {
  assert.match(app, /From \$2\.67\/month · suggested \$6\.70/);
  assert.match(html, /From \$2\.67\/month/);
  assert.doesNotMatch(app, /\$5\.67/);
  assert.doesNotMatch(html, /\$5\.67/);
});
