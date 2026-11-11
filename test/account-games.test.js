const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const app = read("app.js");
const html = read("index.html");
const css = read("styles.css");

function fakeEl() {
  const el = {
    className: "", textContent: "", children: [], attrs: {}, title: "",
    style: {},
    classList: {
      set: new Set(),
      add(x) { this.set.add(x); }, remove(x) { this.set.delete(x); },
      contains(x) { return this.set.has(x); }, toggle(x, v) { v ? this.set.add(x) : this.set.delete(x); },
    },
    replaceChildren() { this.children = []; },
    appendChild(c) { this.children.push(c); },
    setAttribute(k, v) { this.attrs[k] = v; },
    querySelector() { return null; },
    focus() {},
  };
  return el;
}

function boot() {
  const accountBtn = fakeEl();
  const document = {
    documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
    querySelector: sel => sel === "#accountBtn" ? accountBtn : null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => fakeEl(),
    head: { appendChild() {} },
    addEventListener() {},
  };
  const store = new Map();
  const localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  const box = {
    window: { RANKD_STUDIO: true }, document, localStorage,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { protocol: "http:", pathname: "/", search: "", hostname: "localhost", hash: "" },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    URL, URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp,
    Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error("no")), AbortController,
  };
  box.globalThis = box;
  box.window.document = document;
  box.window.localStorage = localStorage;
  box.window.sessionStorage = box.sessionStorage;
  box.window.location = box.location;
  box.window.matchMedia = box.matchMedia;
  vm.createContext(box);
  vm.runInContext(app, box, { filename: "app.js" });
  return { win: box.window, btn: accountBtn };
}

test("the signed-in account button is just a picture or one initial", () => {
  const { win, btn } = boot();
  const P = win.RankdPremium;
  const user = {
    id: "11111111-1111-4111-8111-111111111111", email: "Ada@Example.com",
    identities: [{ provider: "google", identity_data: { full_name: "Ada Lovelace", avatar_url: "https://example.com/ada.png" } }],
    app_metadata: { provider: "google", providers: ["google"] }, user_metadata: {},
  };
  P.noteAuthUser(user);
  win.RankdGames.renderAccount();
  assert.equal(btn.classList.contains("is-signed-in"), true);
  assert.equal(btn.children.length, 1, "no separate name span");
  assert.equal(btn.children[0].className, "account-avatar");
  assert.match(btn.attrs["aria-label"], /Ada Lovelace/);
  assert.equal(btn.attrs["aria-label"].startsWith("Your games, "), true);
  assert.equal(btn.title, "Ada Lovelace");
  assert.equal(btn.textContent, "");
});

test("without a picture the button falls back to a single letter", () => {
  const { win, btn } = boot();
  const P = win.RankdPremium;
  P.noteAuthUser({
    id: "11111111-1111-4111-8111-111111111111", email: "Ada@Example.com",
    identities: [], app_metadata: {}, user_metadata: {},
  });
  win.RankdGames.renderAccount();
  assert.equal(btn.children.length, 1);
  assert.equal(btn.children[0].className, "account-fallback");
  assert.equal(btn.children[0].textContent, "A");
});

test("signed out still shows the short sign-in label", () => {
  const { win, btn } = boot();
  win.RankdPremium.noteAuthUser(null);
  win.RankdGames.renderAccount();
  assert.equal(btn.classList.contains("is-signed-in"), false);
  assert.equal(btn.children.length, 0);
  assert.equal(btn.textContent.length > 0, true);
});

test("account click and the menu account row open Your games, not Premium", () => {
  assert.match(app, /if \(\$\("#accountBtn"\)\) \$\("#accountBtn"\)\.onclick = \(\) => \{ if \(authUser\) gamesModal\(\); else signInModal\(\); \}/);
  assert.match(app, /if \(\$\("#mAccount"\)\) \$\("#mAccount"\)\.onclick = \(\) => \{ closeModal\(\); gamesModal\(\); \}/);
  assert.doesNotMatch(app, /mAccount"\)\.onclick = \(\) => \{ closeModal\(\); goPremium\(\)/);
  assert.match(app, /<button id="mAccount">🗓 Your games<small>History of puzzles you've played<\/small><\/button>/);
  assert.doesNotMatch(app, /\$\{esc\(who\)\}/);
});

test("Your games is a small history page that leads to the fuller stats page", () => {
  assert.match(app, /function gamesModal\(\)/);
  assert.match(app, /<h2>Your games<\/h2>/);
  assert.match(app, /<h3>Recent games<\/h3>/);
  assert.match(app, /id="gamesFullStats">📊 Full stats →/);
  assert.match(app, /if \(full\) full\.onclick = statsModal;/);
  assert.match(app, /A fuller stats page is coming/);
  assert.match(css, /\.game-list/);
  assert.match(css, /#gamesFullStats/);
  assert.match(app, /window\.RankdGames = \{ gameHistoryRows, gamesModal, renderAccount \}/);
});

test("game history is built from stored d: results, newest first", () => {
  const { win } = boot();
  const g = win.RankdGames;
  const results = {
    "d:2026-11-10": { id: "work-hours", type: "rank", solved: true, tries: 2, done: true },
    "d:2026-11-09": { id: "crash-rate", type: "rank", solved: false, tries: 5, done: true },
    "r:123": { id: "practice", type: "rank", solved: true, tries: 1, done: true },
  };
  win.localStorage.setItem(win.RankdShared.LS.results, JSON.stringify(results));
  const rows = g.gameHistoryRows(10);
  assert.equal(rows.length, 2, "practice rows are excluded");
  assert.equal(rows[0].day, "2026-11-10");
  assert.equal(rows[0].outcome, 1);
  assert.equal(rows[0].tries, 2);
  assert.equal(rows[1].outcome, 3);
  assert.equal(typeof rows[0].title, "string");
  assert.ok(rows[0].title.length > 0);
  assert.equal(g.gameHistoryRows(1).length, 1);
});

test("the top bar no longer has a separate Sign out button", () => {
  assert.doesNotMatch(html, /id="signOutBtn"/);
  assert.match(app, /if \(out\) out\.hidden = true;   \/\/ Sign out lives in the menu/);
  assert.match(css, /\.account-btn\.is-signed-in\{width:34px/);
  assert.doesNotMatch(css, /\.account-name\{/);
  assert.doesNotMatch(app, /classList\.add\("is-signed-in"\)[\s\S]{0,400}account-name/);
});

test("the menu no longer repeats the page links or the full display name", () => {
  for (const id of ["mHow", "mContact", "mHowPage", "mPrivacy", "mTerms"]) {
    assert.doesNotMatch(app, new RegExp('id="' + id + '"'));
  }
  assert.match(app, /id="mAboutPage" href="about\.html"/, "the single About entry stays");
  assert.match(app, /id="mStats"/, "the fuller stats page stays reachable");
  // The four top site links stay: static-pages.test.js requires them on every public page (AdSense nav).
  assert.match(html, /class="tabs site-links"/);
});
