const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("comparison reads time out, cache the day, and score posts do not retry a busy server", async () => {
  const { api, posts, localStorage, setMode, slow, dayKey } = boot();
  const stats = api.CommunityStats;
  const base = "https://fkxbqftqxvgqrtvkpglx.supabase.co";

  setMode("timeout");
  const seeded = await stats.load();
  assert.ok(slow.length >= 1);
  assert.equal(seeded.puzzles.seed.players, 9);
  assert.equal(posts.filter(p => p.url.includes("/functions/v1/community-stats")).length, 1);
  assert.equal(posts.filter(p => p.url.includes("community-stats.json")).length, 1);
  assert.equal(localStorage.getItem("rankd.community.v1"), null);

  reset(stats, posts);
  setMode("deny");
  const fromSeed = await stats.load();
  assert.equal(fromSeed.puzzles.seed.players, 9);
  assert.equal(posts.some(p => p.url.includes("/rest/v1/plays")), false);

  reset(stats, posts);
  setMode("live");
  const live = await stats.load();
  assert.equal(live.puzzles.live.players, 12);
  const saved = JSON.parse(localStorage.getItem("rankd.community.v1"));
  assert.equal(saved.day, dayKey());
  assert.equal(saved.doc.puzzles.live.players, 12);

  reset(stats, posts);
  setMode("down");
  const again = await stats.load();
  assert.equal(again.puzzles.live.players, 12);
  assert.equal(posts.some(p => p.url.includes("community-stats.json")), false);

  posts.length = 0;
  stats._dropUntil = 0;
  stats._inflight = false;
  stats._queue = [];
  setMode("busy");
  stats._send({ puzzle_id: "demo", day_key: "2026-11-11", mode: "daily", puzzle_type: "rank", solved: true, perfect: false, payload: {} }, base, "anon");
  await Promise.resolve();
  assert.equal(posts.filter(p => p.url.includes("/functions/v1/submit-play")).length, 1);
  assert.equal(posts.filter(p => p.url.includes("/rest/v1/plays")).length, 0);
  assert.ok(stats._dropUntil > Date.now());

  api.state.puzzle = { id: "demo", type: "rank", items: [{ name: "A", emoji: "" }] };
  api.state.mode = "daily";
  api.state.dateKey = "2026-11-11";
  const before = posts.length;
  assert.equal(stats.submit({
    puzzleId: "demo", day: "2026-11-11", mode: "daily", type: "rank",
    solved: true, tries: 1, order: [0], marks: ["good"], attempts: [{ order: [0], marks: ["good"] }],
  }), false);
  assert.equal(posts.length, before);

  stats._dropUntil = 0;
  setMode("missing");
  stats._send({ puzzle_id: "demo", day_key: "2026-11-11", mode: "daily", puzzle_type: "rank", solved: true, perfect: false, payload: {} }, base, "anon");
  await Promise.resolve();
  assert.equal(posts.filter(p => p.method === "POST" && p.url.includes("/rest/v1/plays")).length, 1);
});

test("the page does not wait on PostHog, and the snapshot request can be cached", () => {
  const app = read("app.js");
  const html = read("index.html");
  const privacy = read("privacy.html");
  assert.match(app, /const NET_TIMEOUT_MS = 3000/);
  assert.match(app, /cache: "default"/);
  assert.equal(app.split('cache: "no-store"').length - 1, 1);
  assert.match(app, /COMMUNITY_CACHE_KEY = "rankd\.community\.v1"/);
  assert.match(app, /res\.status === 404\) legacyInsert/);
  assert.match(app, /res\.status === 429 \|\| res\.status >= 500\) this\._pauseSubmits/);
  assert.match(html, /p\.async=!0/);
  assert.doesNotMatch(html, /document\.write/);
  assert.match(privacy, /rankd\.community\.v1/);
  assert.match(read("sw.js"), /ranki-shell-v77/);
  assert.match(read("sw.js"), /function isPosthog/);
});

function reset(stats, posts) {
  posts.length = 0;
  stats._cache = null;
  stats._url = null;
  stats._loading = null;
}

function dayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function classListFor(el) {
  const classes = new Set();
  return {
    add(...cs) { cs.forEach(c => classes.add(c)); },
    remove(...cs) { cs.forEach(c => classes.delete(c)); },
    toggle(c) { classes.has(c) ? classes.delete(c) : classes.add(c); },
    contains: c => classes.has(c),
  };
}
function makeEl(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    id: "", className: "", textContent: "", value: "", hidden: false, disabled: false,
    dataset: {}, style: { setProperty() {}, removeProperty() {} }, children: [],
    setAttribute(k, v) { if (k === "id") el.id = String(v); },
    getAttribute() { return null; },
    removeAttribute() {},
    appendChild(child) { return child; },
    replaceChildren() {},
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

function boot() {
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
  const slow = [];
  const location = { protocol: "https:", hostname: "localhost", host: "localhost", origin: "https://localhost", pathname: "/", search: "", hash: "", href: "https://localhost/" };
  const sandbox = {
    window: {}, document, localStorage, sessionStorage, location,
    history: { replaceState() {}, pushState() {} },
    navigator: { userAgent: "node", clipboard: { writeText: async () => {} } },
    crypto: { randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    URL, URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, WeakMap, RegExp,
    Error, TypeError, ReferenceError, parseFloat, parseInt, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    fetch(url, opts) {
      const target = String(url);
      const method = (opts && opts.method) || "GET";
      posts.push({ url: target, method, body: opts && opts.body });
      const mode = sandbox.__mode;
      const seed = { ok: true, status: 200, json: async () => ({ puzzles: { seed: { players: 9, seeded: true } } }), text: async () => "" };
      if (target.includes("community-stats.json")) return Promise.resolve(seed);
      if (mode === "timeout" && target.includes("/functions/v1/community-stats")) {
        return Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }
      if ((mode === "deny" || mode === "down") && target.includes("/functions/v1/community-stats")) {
        return Promise.resolve({ ok: false, status: mode === "deny" ? 429 : 503, json: async () => ({}), text: async () => "" });
      }
      if (mode === "live" && target.includes("/functions/v1/community-stats")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ puzzles: { live: { players: 12 } } }), text: async () => "" });
      }
      if (target.includes("/functions/v1/submit-play") && method === "POST") {
        const status = mode === "missing" ? 404 : 500;
        return Promise.resolve({ ok: false, status, json: async () => ({}), text: async () => "" });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => "" });
    },
    AbortController,
    setTimeout(fn, ms) {
      if (typeof fn === "function" && ms >= 2000) slow.push(fn);
      return slow.length;
    },
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    getComputedStyle: () => ({ display: "none", visibility: "visible", getPropertyValue: () => "" }),
    performance: { now: () => 0 },
    innerWidth: 1200, innerHeight: 800, scrollY: 0, scrollTo() {},
    addEventListener() {}, removeEventListener() {},
    TextEncoder, TextDecoder, btoa, atob, queueMicrotask, Promise,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.__mode = "timeout";
  vm.createContext(sandbox);
  for (const file of ["site-config.js", "puzzles-data.js", "practice-data.js", "community-seed.js", "puzzle-search.js", "name-puzzles.js", "part1-puzzles.js", "name-it.js", "challenge.js", "country-facts.js"]) {
    vm.runInContext(read(file), sandbox, { filename: file });
  }
  let app = read("app.js");
  const tail = "route();\nmaybeShowHowto();";
  assert.ok(app.includes(tail));
  app = app.replace(tail, "window.__api = { state, CommunityStats, CONFIG };");
  vm.runInContext(app, sandbox, { filename: "app.js" });
  return {
    api: sandbox.__api,
    posts,
    localStorage,
    slow,
    dayKey,
    setMode(mode) { sandbox.__mode = mode; },
  };
}
