const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const EPOCH = "2026-10-06";

function keyFrom(n) {
  const [y, m, d] = EPOCH.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function classListFor(el) {
  const classes = new Set(String(el.className || "").split(/\s+/).filter(Boolean));
  const sync = () => { el.className = [...classes].join(" "); };
  return {
    add(...cs) { cs.forEach(c => classes.add(c)); sync(); },
    remove(...cs) { cs.forEach(c => classes.delete(c)); sync(); },
    toggle(c, force) {
      const on = force === undefined ? !classes.has(c) : !!force;
      if (on) classes.add(c); else classes.delete(c);
      sync();
      return on;
    },
    contains: c => classes.has(c),
  };
}
function makeEl(tag) {
  const kids = [];
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    id: "",
    className: "",
    textContent: "",
    innerHTML: "",
    value: "",
    hidden: false,
    disabled: false,
    dataset: {},
    children: kids,
    style: { setProperty() {}, removeProperty() {} },
    parentElement: null,
    _attr: {},
    setAttribute(k, v) { el._attr[k] = String(v); if (k === "id") el.id = String(v); },
    getAttribute(k) { return el._attr[k] == null ? null : el._attr[k]; },
    removeAttribute(k) { delete el._attr[k]; },
    appendChild(child) { if (child) { child.parentElement = el; kids.push(child); } return child; },
    replaceChildren() { kids.length = 0; },
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    closest() { return el.parentElement; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {},
  };
  el.classList = classListFor(el);
  const parent = { className: "", parentElement: null };
  parent.classList = classListFor(parent);
  el.parentElement = parent;
  return el;
}

function bootGame() {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  const cache = new Map();
  const documentQuery = sel => {
    const key = String(sel);
    if (!cache.has(key)) cache.set(key, makeEl("div"));
    return cache.get(key);
  };
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
  };
  const location = { protocol: "https:", hostname: "localhost", host: "localhost", origin: "https://localhost", pathname: "/", search: "", hash: "", href: "https://localhost/" };
  const sandbox = {
    window: {},
    document,
    localStorage,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, get length() { return 0; } },
    location,
    history: { replaceState() {}, pushState() {} },
    navigator: { userAgent: "node", clipboard: { writeText: async () => {} } },
    crypto: { randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    URL, URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, WeakMap, RegExp,
    Error, TypeError, ReferenceError, parseFloat, parseInt, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" }),
    AbortController,
    setTimeout: fn => { if (typeof fn === "function") fn(); return 0; },
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame: fn => { if (typeof fn === "function") fn(); return 0; },
    cancelAnimationFrame() {},
    getComputedStyle: () => ({ display: "none", visibility: "visible", getPropertyValue: () => "" }),
    performance: { now: () => 0 },
    innerWidth: 390,
    innerHeight: 800,
    scrollY: 0,
    scrollTo() {},
    addEventListener() {},
    removeEventListener() {},
    TextEncoder, TextDecoder, btoa, atob,
    queueMicrotask,
    Promise,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.document = document;
  sandbox.localStorage = localStorage;
  sandbox.sessionStorage = sandbox.sessionStorage;
  vm.createContext(sandbox);
  for (const file of ["site-config.js", "puzzles-data.js", "practice-data.js", "community-seed.js", "puzzle-search.js", "name-puzzles.js", "part1-puzzles.js", "name-it.js", "invent-quiz.js", "number-stats.js", "number-puzzles.js", "number-guess.js", "challenge.js", "country-facts.js"]) {
    vm.runInContext(read(file), sandbox, { filename: file });
  }
  let app = read("app.js");
  const tail = "route();\nmaybeShowHowto();";
  assert.ok(app.includes(tail));
  app = app.replace(tail, "window.__api = { state, commitFinish, openDay, onResultNext, showResult, puzzleForDay, dayNumber, LS, load };");
  vm.runInContext(app, sandbox, { filename: "app.js" });
  return { api: sandbox.__api, bonus: sandbox.RankdBonus, documentQuery, localStorage };
}

function finishOf(p) {
  const marks = ["good"];
  if (p.type === "quiz") return { type: "quiz", done: true, solved: true, tries: 1, hits: 1, marks, picks: [{ mark: "good" }] };
  if (p.type === "number") return { type: "number", done: true, solved: true, tries: 1, accuracy: 100, ratio: 1 };
  if (p.type === "top1") return { type: "top1", done: true, solved: true, tries: 1, guesses: [{ rank: 1 }] };
  if (p.type === "name") return { type: "name", done: true, solved: true, tries: 1, attempts: [{ marks }] };
  return { type: p.type || "rank", done: true, solved: true, won: true, tries: 1, attempts: [{ marks, order: [0], assign: [0] }], marks };
}

test("finishing part 1 continues the bundle, and a reload resumes the rest", () => {
  const days = [0, 1, 4];
  const { api, bonus, documentQuery } = bootGame();
  const quizIndex = (() => {
    let n = 0;
    while (n < 400) {
      const parts = bonus.parts(n);
      if (parts.filter(p => p.role === "title").length > 1) return n;
      n++;
    }
    return 40;
  })();
  days.push(quizIndex);

  for (const n of days) {
    const date = keyFrom(n);
    api.state.mode = "daily";
    api.state.dateKey = date;
    api.state.scoreShown = false;
    api.openDay();
    const parts = api.state.bundleParts.slice();
    assert.ok(parts.length >= 2, date + " parts");
    assert.equal(api.state.partIndex, 0, date + " starts at part 1");

    for (let i = 0; i < parts.length; i++) {
      assert.equal(api.state.partIndex, i, date + " index " + i);
      assert.equal(api.state.puzzle.id, parts[i].id, date + " puzzle " + i);
      const res = finishOf(parts[i]);
      assert.equal(api.commitFinish(res), true, date + " commit " + i);
      api.showResult(res);
      const bonusLine = documentQuery("#bonusLine").textContent || "";
      const score = documentQuery("#dayScore").innerHTML || "";
      assert.doesNotMatch(bonusLine, /skipped/, date + " bonus line part " + (i + 1) + " " + bonusLine);
      assert.doesNotMatch(score, /skipped/, date + " score part " + (i + 1));
      const btn = documentQuery("#nextBtn").textContent;
      if (i < parts.length - 1) {
        assert.equal(btn, "Next part →", date + " button after part " + (i + 1));
        assert.equal(documentQuery("#dayScore").classList.contains("hidden"), true, date);
        api.onResultNext();
      } else {
        assert.equal(btn, "See your score", date);
        api.onResultNext();
        const card = documentQuery("#dayScore").innerHTML || "";
        assert.match(card, /Today's score/, date);
        assert.match(card, /\/100/, date);
        assert.doesNotMatch(card, /skipped/, date + " final " + card);
        assert.equal(documentQuery("#nextBtn").textContent, "More puzzles →", date);
      }
    }
  }
});

test("a player who already finished only part 1 resumes at part 2", () => {
  const { api, bonus, documentQuery, localStorage } = bootGame();
  for (const n of [0, 2, 7]) {
    const date = keyFrom(n);
    api.state.mode = "daily";
    api.state.dateKey = date;
    api.openDay();
    const parts = bonus.parts(n);
    assert.equal(api.commitFinish(finishOf(parts[0])), true, date);
    api.showResult(api.state.liveResult);
    assert.equal(documentQuery("#nextBtn").textContent, "Next part →", date + " still in the bundle");

    api.state.partIndex = 0;
    api.state.puzzle = null;
    api.state.liveResult = null;
    api.state.scoreShown = false;
    api.openDay();
    assert.equal(api.state.partIndex, 1, date + " resumes");
    assert.equal(api.state.puzzle.id, parts[1].id, date);
    assert.equal(documentQuery("#result").classList.contains("hidden"), true, date);
  }
  assert.ok(localStorage.getItem("rankd.results.v2"));
});
