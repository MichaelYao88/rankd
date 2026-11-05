const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

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
    offsetWidth: 40,
    _attr: {},
    _listeners: {},
    setAttribute(k, v) { el._attr[k] = String(v); if (k === "id") el.id = String(v); },
    getAttribute(k) { return el._attr[k] == null ? null : el._attr[k]; },
    removeAttribute(k) { delete el._attr[k]; },
    appendChild(child) { if (child) { child.parentElement = el; kids.push(child); } return child; },
    replaceChildren() { kids.length = 0; },
    remove() { if (el.parentElement) el.parentElement.children = el.parentElement.children.filter(k => k !== el); },
    addEventListener(type, fn) { (el._listeners[type] || (el._listeners[type] = [])).push(fn); },
    removeEventListener() {},
    getBoundingClientRect() { return { top: 10, left: 10, right: 80, bottom: 40, width: 70, height: 30 }; },
    closest(sel) { return el.matches(sel) ? el : (el.parentElement && el.parentElement.closest ? el.parentElement.closest(sel) : null); },
    matches(sel) {
      const cls = String(sel).replace(/^\./, "");
      return el.classList.contains(cls);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    cloneNode() { const c = makeEl(el.tagName); c.className = el.className; c.classList = classListFor(c); return c; },
  };
  el.classList = classListFor(el);
  el.parentElement = makeEl._holder || null;
  return el;
}

function boot() {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  const cache = new Map();
  const holder = makeEl("div");
  makeEl._holder = holder;
  const documentQuery = sel => {
    const key = String(sel);
    if (!cache.has(key)) cache.set(key, makeEl("div"));
    return cache.get(key);
  };
  const listeners = {};
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
    elementFromPoint() { return document._hit || null; },
  };
  document.documentElement.style = { setProperty() {}, removeProperty() {} };
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
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame: fn => { if (typeof fn === "function") fn(); return 0; },
    cancelAnimationFrame() {},
    getComputedStyle: () => ({ display: "none", visibility: "visible", getPropertyValue: () => "" }),
    performance: { now: () => 0 },
    innerWidth: 1200,
    innerHeight: 800,
    scrollY: 0,
    scrollTo() {},
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
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
  vm.createContext(sandbox);
  for (const file of ["site-config.js", "puzzles-data.js", "practice-data.js", "community-seed.js", "puzzle-search.js", "name-puzzles.js", "part1-puzzles.js", "name-it.js", "challenge.js", "country-facts.js", "number-guess.js", "number-puzzles.js", "number-stats.js"]) {
    vm.runInContext(read(file), sandbox, { filename: file });
  }
  let app = read("app.js");
  const tail = "route();\nmaybeShowHowto();";
  app = app.replace(tail, "window.__api = { state };");
  vm.runInContext(app, sandbox, { filename: "app.js" });
  return { win: sandbox, listeners, document };
}

function freshMatch(win) {
  const puzzle = win.RANKD_PUZZLES.find(p => p.id === "match-meat-cuts");
  win.__api.state.puzzle = puzzle;
  win.__api.state.match = {
    type: "match", done: false, solved: false, pinned: [], attempts: [], tries: 0,
    cur: puzzle.people.map(() => null),
  };
  win.__api.state.mSel = null;
  return puzzle;
}

function chip(cls, data) {
  const el = makeEl("button");
  el.classList.add(cls);
  Object.assign(el.dataset, data);
  return el;
}

test("a clue dropped on a country and a country dropped on a clue both assign", () => {
  const { win } = boot();
  const puzzle = freshMatch(win);
  const person = chip("m-person", { p: "2" });
  const clue = chip("m-clue", { c: "1" });
  assert.equal(win.RankdMatch.drop("clue", 0, person), true);
  assert.equal(win.RankdMatch.state().cur[0], 2);
  assert.equal(win.RankdMatch.drop("person", 4, clue), true);
  assert.equal(win.RankdMatch.state().cur[1], 4);
  person.disabled = true;
  assert.equal(win.RankdMatch.drop("clue", 3, person), false);
  assert.equal(win.RankdMatch.state().cur[3], null);
  clue.classList.add("pinned");
  assert.equal(win.RankdMatch.drop("person", 0, clue), false);
  assert.equal(puzzle.people.length > 4, true);
});

test("pointer drag assigns in both directions for mouse and touch", () => {
  const { win, listeners, document } = boot();
  freshMatch(win);
  const person = chip("m-person", { p: "1" });
  const clue = chip("m-clue", { c: "0" });
  const root = document.getElementById("matchGame");
  const fire = (type, target, extra) => {
    const e = { target, button: 0, clientX: 0, clientY: 0, pointerId: 1, pointerType: extra.pointerType, preventDefault() {}, type, ...extra };
    if (type === "pointerdown") (root._listeners.pointerdown || []).forEach(fn => fn(e));
    else (listeners[type] || []).forEach(fn => fn(e));
  };
  document._hit = person;
  fire("pointerdown", clue, { pointerType: "mouse", clientX: 0, clientY: 0 });
  fire("pointermove", person, { pointerType: "mouse", clientX: 30, clientY: 0 });
  fire("pointerup", person, { pointerType: "mouse", clientX: 30, clientY: 0 });
  assert.equal(win.RankdMatch.state().cur[0], 1);

  freshMatch(win);
  document._hit = clue;
  const person2 = chip("m-person", { p: "3" });
  fire("pointerdown", person2, { pointerType: "touch", clientX: 0, clientY: 0 });
  fire("pointermove", clue, { pointerType: "touch", clientX: 0, clientY: 40 });
  fire("pointerup", clue, { pointerType: "touch", clientX: 0, clientY: 40 });
  assert.equal(win.RankdMatch.state().cur[0], 3);
});
