const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function classListFor(el) {
  const classes = new Set();
  return {
    add(...cs) { cs.forEach(c => classes.add(c)); el.className = [...classes].join(" "); },
    remove(...cs) { cs.forEach(c => classes.delete(c)); el.className = [...classes].join(" "); },
    toggle(c, force) {
      const on = force === undefined ? !classes.has(c) : !!force;
      if (on) classes.add(c); else classes.delete(c);
      el.className = [...classes].join(" ");
      return on;
    },
    contains: c => classes.has(c),
  };
}

function makeEl(tag) {
  const kids = [];
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    nodeType: 1,
    id: "",
    className: "",
    textContent: "",
    value: "",
    hidden: false,
    disabled: false,
    dataset: {},
    children: kids,
    childNodes: kids,
    parentElement: null,
    parentNode: null,
    style: { setProperty() {}, removeProperty() {} },
    offsetHeight: 40,
    offsetWidth: 120,
    offsetParent: {},
    scrollHeight: 40,
    naturalWidth: 0,
    complete: false,
    _attr: {},
    _html: "",
    setAttribute(k, v) { el._attr[k] = String(v); if (k === "id") el.id = String(v); },
    getAttribute(k) { return el._attr[k] == null ? null : el._attr[k]; },
    removeAttribute(k) { delete el._attr[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(el._attr, k); },
    appendChild(child) {
      if (!child) return child;
      child.parentElement = el;
      child.parentNode = el;
      kids.push(child);
      return child;
    },
    append(...cs) { cs.forEach(c => { if (c && c.nodeType) el.appendChild(c); }); },
    replaceChildren(...cs) { kids.length = 0; cs.forEach(c => el.appendChild(c)); },
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() { return { top: 0, left: 0, right: 120, bottom: 40, width: 120, height: 40, x: 0, y: 0 }; },
    closest(sel) { return sel && String(sel).includes("ad-banner-shell") ? el.parentElement : null; },
    focus() {},
    click() {},
    select() {},
    reset() {},
    contains() { return false; },
    animate() { return { cancel() {} }; },
    cloneNode() { return makeEl(tag); },
    querySelector(sel) { return queryInside(el, sel); },
    querySelectorAll(sel) { return queryAllInside(el, sel); },
  };
  el.classList = classListFor(el);
  Object.defineProperty(el, "innerHTML", {
    get() { return el._html; },
    set(v) {
      el._html = String(v ?? "");
      kids.length = 0;
      if (/<ins/i.test(el._html)) {
        const ins = makeEl("ins");
        ins.classList.add("adsbygoogle");
        el.appendChild(ins);
      }
    },
  });
  return el;
}

function queryInside(el, sel) {
  if (sel === ".ad-fill") return el.children.find(k => k.classList.contains("ad-fill")) || null;
  if (sel === "ins") return el.children.find(k => k.tagName === "INS") || null;
  if (sel === "svg") return el.children.find(k => k.tagName === "SVG") || null;
  return null;
}
function queryAllInside(el, sel) {
  const one = queryInside(el, sel);
  return one ? [one] : [];
}

function bootGame() {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i] ?? null,
    get length() { return store.size; },
    clear() { store.clear(); },
  };
  const location = {
    protocol: "https:",
    hostname: "localhost",
    host: "localhost",
    origin: "https://localhost",
    pathname: "/",
    search: "",
    hash: "",
    href: "https://localhost/",
  };
  const cache = new Map();
  const stubParent = makeEl("div");
  function documentQuery(sel) {
    const key = String(sel);
    if (!cache.has(key)) {
      const idm = key.match(/^#([\w-]+)$/);
      const el = makeEl("div");
      el.parentElement = stubParent;
      el.parentNode = stubParent;
      if (idm) el.id = idm[1];
      if (el.id === "adTop" || el.id === "adBottom") {
        const fill = makeEl("div");
        fill.classList.add("ad-fill");
        el.appendChild(fill);
      }
      if (el.id === "interstitial" || el.id === "playView") el.classList.add("hidden");
      cache.set(key, el);
    }
    return cache.get(key);
  }
  const document = {
    documentElement: makeEl("html"),
    body: makeEl("body"),
    head: makeEl("head"),
    activeElement: null,
    readyState: "complete",
    querySelector: documentQuery,
    querySelectorAll: () => [],
    getElementById: id => documentQuery("#" + id),
    createElement: tag => makeEl(tag),
    createElementNS: (_ns, tag) => makeEl(tag),
    addEventListener() {},
    removeEventListener() {},
    elementFromPoint() { return null; },
    fonts: { ready: Promise.resolve() },
  };
  document.documentElement.style = { setProperty() {}, removeProperty() {} };
  document.documentElement.dataset = {};
  const sandbox = {
    window: {},
    RANKD_ADS_ENABLED: true,   // this file tests the (now disabled by default) ad slots
    document,
    localStorage,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location,
    history: {
      replaceState(_s, _t, url) {
        const u = String(url || "");
        location.hash = u.includes("#") ? u.slice(u.indexOf("#")) : "";
        location.href = location.origin + location.pathname + location.search + location.hash;
      },
      pushState() {},
    },
    navigator: { userAgent: "node", clipboard: { writeText: async () => {} } },
    crypto: { randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    URL, URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, WeakMap, RegExp,
    Error, TypeError, ReferenceError, parseFloat, parseInt, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" }),
    AbortController,
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    getComputedStyle: () => ({ display: "none", getPropertyValue: () => "" }),
    performance: { now: () => 0 },
    innerWidth: 390,
    innerHeight: 800,
    scrollY: 0,
    scrollTo() {},
    addEventListener() {},
    removeEventListener() {},
    MutationObserver: class { observe() {} disconnect() {} },
    Audio: function Audio() { return { play() { return Promise.resolve(); }, pause() {} }; },
    TextEncoder, TextDecoder, btoa, atob,
    queueMicrotask,
    Promise,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.document = document;
  sandbox.localStorage = localStorage;
  vm.createContext(sandbox);
  const files = [
    "site-config.js",
    "puzzles-data.js",
    "practice-data.js",
    "community-seed.js",
    "puzzle-search.js",
    "name-puzzles.js",
    "part1-puzzles.js",
    "name-it.js",
    "invent-quiz.js",
    "number-stats.js",
    "number-puzzles.js",
    "number-guess.js",
    "challenge.js",
    "country-facts.js",
  ];
  for (const file of files) vm.runInContext(read(file), sandbox, { filename: file });
  let app = read("app.js");
  const tail = "route();\nmaybeShowHowto();";
  assert.ok(app.includes(tail), "app.js still ends by routing");
  app = app.replace(tail, `window.__api = {
    state, openPuzzle, showResult, afterSubmit, practiceNext, topBannerWanted, adFreeOnScreen, goPractice
  };`);
  vm.runInContext(app, sandbox, { filename: "app.js" });
  return { sandbox, api: sandbox.__api, q: documentQuery, body: document.body };
}

function numberCard(sandbox) {
  const set = sandbox.RankdNumber.sets().find(s => s && s.pairs && s.pairs.length);
  assert.ok(set, "a guess-the-number set");
  const card = sandbox.RankdNumber.cards(set)[0];
  assert.equal(card.type, "number");
  return card;
}

function rankCard(sandbox) {
  const card = (sandbox.RANKD_PUZZLES || []).find(p => p.type === "rank" && Array.isArray(p.items) && p.items.length > 0 && p.items.length < 6);
  assert.ok(card, "a short rank puzzle");
  return card;
}

function quizCards(sandbox) {
  const full = (sandbox.RANKD_PUZZLES || []).find(p => p.type === "quiz" && Array.isArray(p.questions) && p.questions.length > 1);
  assert.ok(full, "a multiple-choice puzzle");
  const q = full.questions[0];
  const single = { ...full, id: full.id + "#" + (q.id || "q0"), parentId: full.id, questions: [q] };
  assert.equal(single.questions.length, 1);
  return { full, single };
}

test("guess the number and multiple choice hide in-card, result, and between-part ads", () => {
  const css = read("styles.css");
  const rule = css.slice(css.indexOf("body.no-part-ads"));
  assert.match(rule, /body\.no-part-ads #adTopShell,\s*body\.no-part-ads #adBottomShell,\s*body\.no-part-ads #interstitial\{display:none!important\}/);

  const { sandbox, api, q, body } = bootGame();
  const number = numberCard(sandbox);
  const { full: quiz, single } = quizCards(sandbox);
  const rank = rankCard(sandbox);
  const slot = id => q("#" + id);
  const interstitialHidden = () => slot("interstitial").classList.contains("hidden");

  function assertQuiet(card, reason, result) {
    api.state.mode = "practice";
    api.openPuzzle(card);
    assert.equal(api.adFreeOnScreen(), true, card.id);
    assert.equal(body.classList.contains("no-part-ads"), true);
    assert.equal(slot("adTop").classList.contains("ad-on"), false);
    assert.equal(slot("adTopShell").classList.contains("is-on"), false);
    assert.equal(api.topBannerWanted(), "off");
    assert.equal(slot("adBottom").querySelector(".ad-fill").innerHTML, "");
    assert.equal(interstitialHidden(), true);
    let revealed = false;
    api.afterSubmit(() => { revealed = true; }, null);
    assert.equal(revealed, true);
    assert.equal(sandbox.RankdAds.last().reason, reason);
    assert.equal(sandbox.RankdAds.last().show, false);
    assert.equal(interstitialHidden(), true);

    api.showResult(result);
    assert.equal(api.adFreeOnScreen(), true);
    assert.equal(body.classList.contains("no-part-ads"), true);
    assert.equal(slot("adTop").classList.contains("ad-on"), false);
    assert.equal(api.topBannerWanted(), "off");
    assert.equal(interstitialHidden(), true);

    api.state.mode = "archive";
    api.openPuzzle(card);
    assert.equal(body.classList.contains("no-part-ads"), true);
    assert.equal(api.topBannerWanted(), "off");
    assert.equal(slot("adTop").classList.contains("ad-on"), false);
    api.showResult(result);
    assert.equal(body.classList.contains("no-part-ads"), true);
    assert.equal(slot("adTop").classList.contains("ad-on"), false);

    api.state.mode = "preview";
    api.openPuzzle(card);
    assert.equal(body.classList.contains("no-part-ads"), true);
    assert.equal(api.topBannerWanted(), "off");
    revealed = false;
    api.afterSubmit(() => { revealed = true; }, "big");
    assert.equal(revealed, true);
    assert.equal(sandbox.RankdAds.last().reason, reason);
    assert.equal(sandbox.RankdAds.last().mode, "preview");
    assert.equal(interstitialHidden(), true);

    api.state.mode = "daily";
    api.openPuzzle(card);
    assert.equal(body.classList.contains("no-part-ads"), true);
    assert.equal(api.topBannerWanted(), "off");

    api.state.mode = "practice";
    api.state.puzzle = card;
    if (card.type === "number") api.state.number = { type: "number", done: false };
    if (card.type === "quiz") api.state.quiz = { type: "quiz", done: false, phase: "ask" };
    slot("playView").classList.remove("hidden");
    slot("interstitial").classList.add("hidden");
    api.practiceNext();
    const skip = sandbox.RankdAds.decisions.filter(d => d.mode === "practice-skip").pop();
    assert.equal(skip.reason, reason);
    assert.equal(skip.show, false);
  }

  assertQuiet(number, "number", { type: "number", done: true, accuracy: 40, guess: 1 });
  assertQuiet(quiz, "quiz", { type: "quiz", done: true, solved: false, hits: 1, tries: 1, marks: ["good", "bad"], picks: [] });
  assertQuiet(single, "quiz", { type: "quiz", done: true, solved: true, hits: 1, tries: 1, marks: ["good"], picks: [] });

  api.state.mode = "practice";
  api.openPuzzle(rank);
  assert.equal(api.adFreeOnScreen(), false);
  assert.equal(body.classList.contains("no-part-ads"), false);
  assert.equal(api.topBannerWanted(), "practice");
  assert.equal(slot("adTop").classList.contains("ad-on"), true);
  assert.equal(slot("adTopShell").classList.contains("is-on"), true);
  slot("interstitial").classList.add("hidden");
  api.afterSubmit(() => {}, null);
  assert.equal(sandbox.RankdAds.last().show, true);
  assert.equal(sandbox.RankdAds.last().reason, "shown");
  assert.equal(interstitialHidden(), false);

  api.state.mode = "archive";
  api.openPuzzle(rank);
  assert.equal(body.classList.contains("no-part-ads"), false);
  assert.equal(api.topBannerWanted(), "archive");
  assert.equal(slot("adTop").classList.contains("ad-on"), true);

  api.state.mode = "daily";
  api.openPuzzle(rank);
  assert.equal(body.classList.contains("no-part-ads"), false);
  slot("interstitial").classList.add("hidden");
  api.afterSubmit(() => {}, null);
  assert.equal(sandbox.RankdAds.last().reason, "daily");
  assert.equal(sandbox.RankdAds.last().show, false);
  assert.equal(interstitialHidden(), true);
});
