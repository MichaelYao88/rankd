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
    offsetHeight: 0,
    offsetWidth: 0,
    offsetParent: null,
    scrollHeight: 0,
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
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }; },
    closest() { return null; },
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
      if (/<svg/i.test(el._html)) el.appendChild(makeEl("svg"));
    },
  });
  return el;
}

function queryInside(el, sel) {
  if (sel === "svg") return el.children.find(k => k.tagName === "SVG") || null;
  if (sel === ".challenge-qr-caption") return el.children.find(k => k.classList.contains("challenge-qr-caption")) || null;
  if (sel === ".tier-slots") return el.children[0] || null;
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
  const sessionStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
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
      const el = makeEl(idm ? "div" : "div");
      el.parentElement = stubParent;
      el.parentNode = stubParent;
      if (idm) el.id = idm[1];
      if (key === "#challengeQr") {
        const cap = makeEl("p");
        cap.classList.add("challenge-qr-caption");
        cap.textContent = "Scan to take my challenge";
        el.appendChild(cap);
      }
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
    createElement: tag => {
      const el = makeEl(tag);
      el.parentElement = stubParent;
      el.parentNode = stubParent;
      return el;
    },
    createElementNS: (_ns, tag) => makeEl(tag),
    addEventListener() {},
    removeEventListener() {},
    elementFromPoint() { return null; },
  };
  document.documentElement.style = { setProperty() {}, removeProperty() {} };
  document.documentElement.dataset = {};
  const posts = [];
  const sandbox = {
    window: {},
    document,
    localStorage,
    sessionStorage,
    location,
    history: {
      replaceState(_s, _t, url) {
        const u = String(url || "");
        if (u.startsWith("#")) location.hash = u;
        else if (u.includes("?")) {
          location.search = u.slice(u.indexOf("?")).split("#")[0];
          location.hash = u.includes("#") ? u.slice(u.indexOf("#")) : "";
        } else location.hash = "";
        location.href = location.origin + location.pathname + location.search + location.hash;
      },
      pushState() {},
    },
    navigator: {
      userAgent: "node",
      clipboard: { writeText: async () => {} },
    },
    crypto: { randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    URL, URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, WeakMap, RegExp,
    Error, TypeError, ReferenceError, parseFloat, parseInt, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    fetch: async (url, opts) => {
      posts.push({ url: String(url), method: (opts && opts.method) || "GET", body: opts && opts.body });
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    },
    AbortController,
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    getComputedStyle: () => ({ display: "none", getPropertyValue: () => "" }),
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
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.document = document;
  sandbox.localStorage = localStorage;
  sandbox.sessionStorage = sessionStorage;
  vm.createContext(sandbox);
  const files = [
    "site-config.js",
    "vendor/qrcode.js",
    "puzzles-data.js",
    "practice-data.js",
    "community-seed.js",
    "puzzle-search.js",
    "name-puzzles.js",
    "name-it.js",
    "challenge.js",
    "country-facts.js",
  ];
  for (const file of files) {
    vm.runInContext(read(file), sandbox, { filename: file });
  }
  let app = read("app.js");
  const tail = "route();\nmaybeShowHowto();";
  assert.ok(app.includes(tail), "app.js still ends by routing");
  app = app.replace(tail, `window.__api = {
    state, openPuzzle, commitFinish, shareChallengeFriend, buildChallengeShare, resultText,
    renderChallengeQr, finishedPlay, getResult, scoreForChallenge, showResult,
    goToday, goDate, goAll, goPractice, goPreview, LS, load, puzzleForDay, PUZZLES, CommunityStats
  };`);
  vm.runInContext(app, sandbox, { filename: "app.js" });
  const api = sandbox.__api;
  assert.ok(api, "game api exported");
  assert.equal(typeof sandbox.qrcode, "function");
  assert.equal(typeof sandbox.RankdSeed.combineAccuracy, "function");
  assert.equal(typeof sandbox.RankdChallenge.encode, "function");
  return { sandbox, api, posts, localStorage, documentQuery };
}

function tokenOf(text) {
  const m = String(text || "").match(/[?&#]c=([A-Za-z0-9_-]+)/);
  return m ? m[1] : "";
}
function goodMarks(n) { return Array.from({ length: n }, () => "good"); }
function badMarks(n) { return Array.from({ length: n }, () => "bad"); }

function finishFor(p, tries) {
  const nTry = tries || 1;
  if (p.type === "rank") {
    const n = p.items.length;
    const order = p.items.map((_, i) => i);
    const wrong = order.slice().reverse();
    const good = goodMarks(n);
    const bad = badMarks(n);
    if (nTry <= 1) return { type: "rank", done: true, solved: true, tries: 1, order, marks: good, attempts: [{ order, marks: good }] };
    return { type: "rank", done: true, solved: true, tries: 2, order, marks: good, attempts: [{ order: wrong, marks: bad }, { order, marks: good }] };
  }
  if (p.type === "match") {
    const n = p.people.length;
    const assign = p.people.map((_, i) => i);
    const marks = nTry <= 1 ? goodMarks(n) : badMarks(n);
    const attempts = nTry <= 1
      ? [{ assign, marks: goodMarks(n) }]
      : [{ assign, marks: badMarks(n) }, { assign, marks: goodMarks(n) }];
    return { type: "match", done: true, solved: true, tries: attempts.length, points: n, marks: attempts[attempts.length - 1].marks, attempts };
  }
  if (p.type === "tier") {
    const n = p.items.length;
    const assign = p.items.map(() => 0);
    const attempts = nTry <= 1
      ? [{ assign, marks: goodMarks(n) }]
      : [{ assign, marks: badMarks(n) }, { assign, marks: goodMarks(n) }];
    return { type: "tier", done: true, solved: true, tries: attempts.length, marks: attempts[attempts.length - 1].marks, attempts };
  }
  if (p.type === "top1") {
    const guesses = nTry <= 1
      ? [{ name: "Japan", emoji: "🇯🇵", rank: 1, mark: "good", value: 1 }]
      : [
        { name: "Chad", emoji: "🇹🇩", rank: 40, mark: "miss", value: 1 },
        { name: "Japan", emoji: "🇯🇵", rank: 1, mark: "good", value: 2 },
      ];
    return { type: "top1", done: true, solved: true, tries: guesses.length, won: true, guesses };
  }
  if (p.type === "name") {
    const marks = nTry <= 1 ? ["good"] : ["bad", "good"];
    return {
      type: "name", done: true, solved: true, tries: marks.length, marks,
      attempts: marks.map(m => ({ marks: [m] })),
      guesses: [{ name: "Sweden", emoji: "🇸🇪", counts: true }],
      pick: "Sweden",
    };
  }
  if (p.type === "top5") {
    const keys = (p.countries || []).slice().sort((a, b) => b.value - a.value).slice(0, 5).map(c => c.iso3 || c.name);
    const marks = goodMarks(5);
    if (p._preslot) {
      return { type: "top5", done: true, won: true, solved: true, tries: 5, hits: 5, misses: 0, guesses: keys, marks };
    }
    return { type: "top5", done: true, won: true, solved: true, tries: 1, marks, attempts: [{ slots: keys, marks }] };
  }
  throw new Error("unknown type " + p.type);
}

function syntheticTop5(preslot) {
  const countries = [1, 2, 3, 4, 5, 6].map(n => ({ name: "Country " + n, iso3: "C0" + n, emoji: "🏳️", value: 100 - n }));
  return {
    type: "top5", id: preslot ? "synth-top5-pre" : "synth-top5-slot",
    headline: "Synthetic top 5", question: "Synthetic top 5", emoji: "🖐️", unit: "pts",
    countries, maxMisses: 6, _preslot: !!preslot,
  };
}

test("qrcode.js still defines a global when exports exists and module does not", () => {
  const sandbox = { exports: {}, window: {} };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  assert.doesNotThrow(() => {
    vm.runInContext(read("vendor/qrcode.js"), vm.createContext(sandbox), { filename: "qrcode.js" });
  });
  assert.equal(typeof sandbox.qrcode, "function");
  assert.equal(sandbox.window.qrcode, sandbox.qrcode);
  const qr = sandbox.qrcode(0, "M");
  qr.addData("https://ranki.gg/#d=2026-10-06");
  qr.make();
  assert.match(qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true }), /^<svg/);
});

test("community-seed still publishes RankdSeed when module exists without require", () => {
  const sandbox = { module: { exports: {} }, window: {}, process: { argv: ["node"] } };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  assert.doesNotThrow(() => {
    vm.runInContext(read("community-seed.js"), vm.createContext(sandbox), { filename: "community-seed.js" });
  });
  assert.equal(typeof sandbox.RankdSeed.combineAccuracy, "function");
  assert.equal(sandbox.RankdSeed.combineAccuracy([3, 0], true), sandbox.RankdSeed.combineAccuracy([3, 0], true));
  assert.ok(sandbox.RankdSeed.combineAccuracy([3, 0], true) < 99);
});

test("script order loads qrcode and the seed before the game", () => {
  const html = read("index.html");
  const qr = html.indexOf('src="vendor/qrcode.js"');
  const seed = html.indexOf('src="community-seed.js"');
  const challenge = html.indexOf('src="challenge.js"');
  const app = html.indexOf('src="app.js"');
  assert.ok(qr >= 0 && seed > qr && challenge > seed && app > challenge);
});

test("challenge share, the result qr, and the first play", async () => {
  const { sandbox, api, posts, localStorage, documentQuery } = bootGame();
  const RC = sandbox.RankdChallenge;
  const submits = () => posts.filter(p => p.method === "POST" && p.url.includes("/functions/v1/submit-play"));
  const qrBox = () => documentQuery("#challengeQr");
  const qrCode = () => documentQuery("#challengeQrCode");
  const toast = () => documentQuery("#toast").textContent;

  async function shareFinished(puzzle, mode, dateKey) {
    api.state.mode = mode;
    api.state.dateKey = dateKey;
    api.state.puzzle = puzzle;
    api.state.liveResult = null;
    api.state.rank = api.state.match = api.state.tier = api.state.guess = null;
    const res = finishFor(puzzle, 1);
    api.showResult(res);
    const before = toast();
    await api.shareChallengeFriend();
    assert.notEqual(toast(), "Finish the puzzle first", mode + " " + puzzle.type);
    assert.notEqual(before, "Finish the puzzle first");
    const text = sandbox.__lastShare;
    assert.ok(text && text.includes("https://localhost/"), text);
    assert.equal(qrBox().classList.contains("hidden"), false, mode + " " + puzzle.type);
    assert.match(qrCode().innerHTML, /<svg/i);
    return text;
  }

  const byType = {};
  for (const p of api.PUZZLES) if (!byType[p.type]) byType[p.type] = p;
  for (const type of ["rank", "tier", "match", "top1", "name"]) {
    assert.ok(byType[type], "catalog has " + type);
    const text = await shareFinished(byType[type], "all", "2026-10-27");
    const token = tokenOf(text);
    assert.ok(token, type + " challenge token");
    const ch = RC.decode(token);
    assert.equal(ch.k, "p");
    assert.equal(ch.id, byType[type].id);
    assert.equal(ch.dnf, false);
    assert.ok(ch.grid.length);
  }

  const slot = syntheticTop5(false);
  const slotText = await shareFinished(slot, "daily", "2026-10-22");
  const slotCh = RC.decode(tokenOf(slotText));
  assert.equal(slotCh.k, "d");
  assert.equal(slotCh.id, "2026-10-22");
  assert.equal(slotCh.tries, 1);
  assert.equal(slotCh.grid.length, 1);

  const pre = syntheticTop5(true);
  const preText = await shareFinished(pre, "archive", "2026-10-23");
  const preCh = RC.decode(tokenOf(preText));
  assert.equal(preCh.k, "d");
  assert.equal(preCh.tries, 5);
  assert.ok(preCh.grid[0].includes("G"));

  api.goToday();
  assert.equal(api.state.mode, "daily");
  const dailyPuzzle = api.state.puzzle;
  const dailyDate = api.state.dateKey;
  const dailyText = await shareFinished(dailyPuzzle, "daily", dailyDate);
  assert.match(dailyText, new RegExp("#d=" + dailyDate));
  assert.ok(tokenOf(dailyText));

  api.goDate("2026-10-21");
  assert.equal(api.state.mode, "archive");
  const archText = await shareFinished(api.state.puzzle, "archive", "2026-10-21");
  assert.match(archText, /#d=2026-10-21/);
  assert.equal(RC.decode(tokenOf(archText)).k, "d");

  api.goPractice(42);
  assert.equal(api.state.mode, "practice");
  const practicePuzzle = api.state.puzzle;
  const practiceText = await shareFinished(practicePuzzle, "practice", api.state.dateKey);
  assert.match(practiceText, /#r=42/);
  assert.equal(RC.decode(tokenOf(practiceText)).k, "r");
  assert.equal(RC.decode(tokenOf(practiceText)).id, "42");

  api.goPreview("2026-10-06");
  assert.equal(api.state.mode, "preview");
  const previewText = await shareFinished(api.state.puzzle, "preview", "2026-10-06");
  assert.match(previewText, /\?preview=2026-10-06/);
  assert.equal(tokenOf(previewText), "");
  assert.equal(qrBox().classList.contains("hidden"), false);
  assert.match(qrCode().innerHTML, /<svg/i);
  const cap = qrBox().querySelector(".challenge-qr-caption");
  assert.equal(cap.textContent, "Scan to play this puzzle");

  localStorage.clear();
  posts.length = 0;
  api.goToday();
  const first = finishFor(api.state.puzzle, 1);
  const counted = api.commitFinish(first);
  assert.equal(counted, true);
  const storedFirst = JSON.parse(JSON.stringify(api.getResult()));
  const statsAfter = JSON.parse(localStorage.getItem("rankd.stats.v2"));
  assert.equal(statsAfter.played, 1);
  assert.equal(submits().length, 1);
  const body = JSON.parse(submits()[0].body);
  assert.equal(body.device_id, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  assert.equal(body.user_id, null);
  assert.equal(body.puzzle_id, api.state.puzzle.id);
  assert.equal(body.day_key, api.state.dateKey);

  api.goToday();
  const board = api.state.puzzle.type === "rank" ? api.state.rank
    : api.state.puzzle.type === "match" ? api.state.match
    : api.state.puzzle.type === "tier" ? api.state.tier
    : api.state.guess;
  assert.ok(board);
  assert.equal(board.done, false);
  assert.equal((board.attempts || []).length, 0);
  assert.equal((board.guesses || []).length, 0);
  assert.deepEqual(api.getResult().tries, storedFirst.tries);
  assert.equal(JSON.parse(localStorage.getItem("rankd.stats.v2")).played, 1);

  const replay = finishFor(api.state.puzzle, 2);
  const again = api.commitFinish(replay);
  assert.equal(again, false);
  assert.equal(api.getResult().tries, storedFirst.tries);
  assert.equal(JSON.parse(localStorage.getItem("rankd.stats.v2")).played, 1);
  assert.equal(JSON.parse(localStorage.getItem("rankd.stats.v2")).streak, statsAfter.streak);
  assert.equal(submits().length, 1);
  api.showResult(replay);
  await api.shareChallengeFriend();
  const replayCh = RC.decode(tokenOf(sandbox.__lastShare));
  assert.equal(replayCh.tries, replay.tries);
  assert.equal(api.getResult().tries, storedFirst.tries);

  posts.length = 0;
  const playedBeforeArchive = JSON.parse(localStorage.getItem("rankd.stats.v2")).played;
  api.goDate("2026-10-21");
  assert.equal(api.commitFinish(finishFor(api.state.puzzle, 1)), true);
  assert.equal(submits().length, 1);
  assert.equal(JSON.parse(localStorage.getItem("rankd.stats.v2")).played, playedBeforeArchive);
  assert.equal(api.commitFinish(finishFor(api.state.puzzle, 2)), false);
  assert.equal(submits().length, 1);
  assert.equal(api.getResult().tries, 1);

  posts.length = 0;
  api.goPractice(99);
  assert.equal(api.commitFinish(finishFor(api.state.puzzle, 1)), true);
  assert.equal(submits().length, 0);
  api.goPractice(99);
  assert.equal(api.state.puzzle.type === "rank" ? api.state.rank.done : api.state.puzzle.type === "match" ? api.state.match.done : api.state.puzzle.type === "tier" ? api.state.tier.done : (api.state.guess ? api.state.guess.done : false), false);
  assert.equal(api.commitFinish(finishFor(api.state.puzzle, 2)), false);
  assert.equal(api.getResult().tries, 1);
  assert.equal(submits().length, 0);

  posts.length = 0;
  const allIdx = api.PUZZLES.findIndex(p => p.type === "tier");
  api.goAll(allIdx);
  assert.equal(api.commitFinish(finishFor(api.state.puzzle, 1)), true);
  assert.equal(submits().length, 0);
  const allTries = api.getResult().tries;
  api.goAll(allIdx);
  assert.equal(api.state.tier.done, false);
  assert.equal(api.commitFinish(finishFor(api.state.puzzle, 2)), false);
  assert.equal(api.getResult().tries, allTries);

  const rank = byType.rank;
  api.state.mode = "all";
  api.state.dateKey = "2026-10-27";
  api.state.puzzle = rank;
  const penalised = finishFor(rank, 2);
  const real = api.scoreForChallenge(rank, penalised);
  assert.ok(real.acc < 99, "spot distance lowers a second-try rank below the flat band top");
  vm.runInContext("window.RankdSeed = null;", sandbox);
  const fallen = api.scoreForChallenge(rank, penalised);
  assert.equal(fallen.acc, 99);
  const text = await shareFinished(rank, "all", "2026-10-27");
  assert.ok(tokenOf(text));
  assert.equal(qrBox().classList.contains("hidden"), false);
});
