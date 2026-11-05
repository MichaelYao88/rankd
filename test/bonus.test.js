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
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function bootStudio() {
  const store = new Map();
  const storage = () => ({
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  });
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
    localStorage: storage(),
    sessionStorage: storage(),
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
  vm.runInContext(read("puzzles-data.js"), appBox, { filename: "puzzles-data.js" });
  vm.runInContext(read("name-puzzles.js"), appBox, { filename: "name-puzzles.js" });
  vm.runInContext(read("part1-puzzles.js"), appBox, { filename: "part1-puzzles.js" });
  vm.runInContext(read("app.js"), appBox, { filename: "app.js" });
  return appBox.window;
}

function mainOn(puzzles, n) {
  return puzzles[((n % puzzles.length) + puzzles.length) % puzzles.length];
}

test("bonus selection is deterministic, skips that day's main puzzle, and respects the AdSense window", () => {
  const win = bootStudio();
  const again = bootStudio();
  const bonus = win.RankdBonus;
  const puzzles = win.RankdShared.puzzles;
  assert.ok(puzzles.length > 20);
  assert.equal(win.RankdShared.CONFIG.adsenseSafeThrough, CUTOFF);
  assert.deepEqual(Array.from(bonus.types), ["top1", "name", "tier", "match"]);
  const sensitiveShort = puzzles.filter(p => p.sensitive && bonus.types.includes(p.type));
  assert.ok(sensitiveShort.length > 0, "short sensitive puzzles exist, so the window filter is not vacuous");

  const ids = [];
  const againIds = [];
  for (let n = 0; n < puzzles.length * 2; n++) {
    const picked = bonus.forDay(n);
    const repeat = bonus.forDay(n);
    assert.ok(picked && picked.id, "day " + n);
    assert.equal(picked.id, repeat.id);
    assert.equal(again.RankdBonus.forDay(n).id, picked.id);
    if (keyFrom(n) <= bonus.scheduleThrough) assert.equal(picked.id === mainOn(puzzles, n).id, false, "overlaps main on day " + n);
    else assert.notEqual(bonus.parts(n).find(p => p.id === picked.id).role, "title", "bonus is the title on " + n);
    assert.ok(picked.type === "quiz" || picked.type === "number" || bonus.types.includes(picked.type) || picked.type === "rank" || picked.part1Only, picked.type + " " + picked.id);
    if (keyFrom(n) <= CUTOFF) assert.equal(!!picked.sensitive, false, picked.id + " on " + keyFrom(n));
    ids.push(picked.id);
    againIds.push(picked.id);
  }
  assert.deepEqual(ids, againIds);

  for (let n = 0; n < ids.length; n++) {
    for (let k = 1; k <= bonus.gap && n - k >= 0; k++) {
      assert.notEqual(ids[n], ids[n - k], ids[n] + " repeated after " + k + " days");
    }
  }

  win.RankdShared.CONFIG.adsenseSafeThrough = "";
  let sawSensitive = false;
  for (let n = 0; n < 250 && !sawSensitive; n++) sawSensitive = !!bonus.forDay(n).sensitive;
  assert.equal(sawSensitive, true);
  win.RankdShared.CONFIG.adsenseSafeThrough = CUTOFF;
  for (let n = 0; keyFrom(n) <= CUTOFF; n++) assert.equal(!!bonus.forDay(n).sensitive, false, keyFrom(n));

  const removed = ["c-population", "d-population", "e-population", "g-population", "i-population", "k-population"];
  for (let n = 0; n < puzzles.length * 4; n++) {
    const picked = bonus.forDay(n);
    assert.equal(removed.includes(picked.id), false, picked.id);
    if (!picked.fillerOnly) assert.equal(puzzles.some(p => p.id === picked.id && !p.part1Only), true, picked.id);
  }
  for (const id of removed) assert.equal(puzzles.some(p => p.id === id), false, id);
  assert.equal(win.RANKD_PART1.length, 0);
});

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
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  el.classList = classListFor(el);
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
  const sessionStorage = { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, get length() { return 0; } };
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
  document.documentElement.style = { setProperty() {}, removeProperty() {} };
  const posts = [];
  const events = [];
  const location = { protocol: "https:", hostname: "localhost", host: "localhost", origin: "https://localhost", pathname: "/", search: "", hash: "", href: "https://localhost/" };
  const sandbox = {
    window: {},
    document,
    localStorage,
    sessionStorage,
    location,
    history: { replaceState() {}, pushState() {} },
    navigator: { userAgent: "node", clipboard: { writeText: async () => {} } },
    crypto: { randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    URL, URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, WeakMap, RegExp,
    Error, TypeError, ReferenceError, parseFloat, parseInt, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    fetch: async (url, opts) => {
      posts.push({ url: String(url), method: (opts && opts.method) || "GET" });
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    },
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
    addEventListener() {},
    removeEventListener() {},
    TextEncoder, TextDecoder, btoa, atob,
    queueMicrotask,
    Promise,
    posthog: { capture(event, props) { events.push({ event, props }); } },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.document = document;
  sandbox.localStorage = localStorage;
  sandbox.sessionStorage = sessionStorage;
  vm.createContext(sandbox);
  for (const file of ["site-config.js", "puzzles-data.js", "practice-data.js", "community-seed.js", "puzzle-search.js", "name-puzzles.js", "part1-puzzles.js", "name-it.js", "challenge.js", "country-facts.js"]) {
    vm.runInContext(read(file), sandbox, { filename: file });
  }
  let app = read("app.js");
  const tail = "route();\nmaybeShowHowto();";
  assert.ok(app.includes(tail));
  app = app.replace(tail, "window.__api = { state, commitFinish, resultText, getResult, puzzleForDay, load, LS, dayNumber };");
  vm.runInContext(app, sandbox, { filename: "app.js" });
  return { api: sandbox.__api, posts, events, localStorage, bonus: sandbox.RankdBonus };
}

function rankFinish(p) {
  const order = p.items.map((_, i) => i);
  const marks = order.map(() => "good");
  return { type: "rank", done: true, solved: true, tries: 1, order, marks, attempts: [{ order, marks }] };
}

test("streaks, stats and the plays table ignore the bonus", () => {
  const { api, posts, events, localStorage, bonus } = bootGame();
  const day = "2026-10-06";
  const main = api.puzzleForDay(0);
  assert.equal(main.type, "rank");
  api.state.mode = "daily";
  api.state.dateKey = day;
  api.state.slot = "main";
  api.state.puzzle = main;
  const playedPosts = () => posts.filter(p => p.method === "POST" && p.url.includes("/functions/v1/submit-play"));
  assert.equal(api.commitFinish(rankFinish(main)), true);
  const afterMain = JSON.parse(localStorage.getItem("rankd.stats.v2"));
  assert.equal(afterMain.streak, 1);
  assert.equal(afterMain.played, 1);
  assert.equal(afterMain.wins, 1);
  assert.equal(afterMain.lastDay, 0);
  assert.equal(playedPosts().length, 1);
  assert.equal(events.filter(e => e.event === "bonus_played").length, 0);

  const picked = bonus.forDay(0);
  api.state.slot = "bonus";
  api.state.puzzle = picked;
  assert.equal(api.commitFinish({ type: picked.type, done: true, solved: true, won: true, tries: 2, marks: ["bad", "good"] }), true);
  const afterBonus = JSON.parse(localStorage.getItem("rankd.stats.v2"));
  assert.deepEqual(afterBonus, afterMain);
  assert.equal(playedPosts().length, 1);
  assert.equal(events.filter(e => e.event === "bonus_played").length, 1);
  assert.equal(events.some(e => e.event === "game_completed"), false);

  assert.equal(api.commitFinish({ type: picked.type, done: true, solved: false, won: false, tries: 5, marks: ["bad"] }), false);
  const saved = JSON.parse(localStorage.getItem("rankd.results.v2"));
  assert.equal(saved["d:" + day].id, main.id);
  assert.equal(saved["d:" + day].tries, 1);
  assert.equal(saved["b:" + day].id, picked.id);
  assert.equal(saved["b:" + day].tries, 2);
  assert.notEqual(saved["d:" + day].id, saved["b:" + day].id);
  assert.equal(events.filter(e => e.event === "bonus_played").length, 1);
  assert.equal(JSON.parse(localStorage.getItem("rankd.stats.v2")).streak, 1);

  api.state.slot = "main";
  api.state.puzzle = main;
  api.state.liveResult = api.getResult();
  const text = api.resultText("https://ranki.gg/#d=" + day);
  const lines = text.split("\n");
  const parts = bonus.parts(0);
  const partLines = lines.filter(line => /^Part \d+ · /.test(line));
  assert.equal(partLines.length, parts.length);
  assert.ok(partLines.some(line => line.startsWith("Part 1 · ") && !/skipped/.test(line)));
  assert.ok(partLines.some(line => line.startsWith("Part " + parts.length + " · ")));
  assert.match(lines[lines.length - 2], /^Part \d+ · /);
  assert.equal(lines[lines.length - 1], "https://ranki.gg/#d=" + day);

  localStorage.removeItem("rankd.stats.v2");
  api.state.slot = "bonus";
  api.state.dateKey = "2026-10-07";
  api.state.puzzle = bonus.forDay(1);
  api.commitFinish({ type: api.state.puzzle.type, done: true, solved: true, won: true, tries: 1, marks: ["good"] });
  assert.equal(localStorage.getItem("rankd.stats.v2"), null);
  assert.equal(playedPosts().length, 1);
});
