const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "puzzles-data.js"), "utf8"), sandbox, { filename: "puzzles-data.js" });
const puzzles = JSON.parse(JSON.stringify(sandbox.window.RANKD_PUZZLES));
const seed = require("../community-seed.js");

const CONVERTED = [
  "top5-wine", "top5-potatoes", "top5-tea", "top5-co2-consumption",
  "top5-height-gain",   "top5-trends-kpop", "top5-alcohol", "top5-height-gain-women",
  "ipsos-gender-identity",
];
const TOP1 = [
  "top1-potatoes", "top1-tea", "top1-co2",
  "top1-pop-2100", "top1-median-age", "top1-road-deaths",
];

function rankOf(list, c) {
  return 1 + list.filter(x => x.value > c.value).length;
}

test("every former Top 5 daily is a Rank it with 5 or 6 distinct values", () => {
  assert.equal(puzzles.filter(p => p.type === "top5").length, 0);
  for (const id of CONVERTED) {
    const p = puzzles.find(x => x.id === id);
    assert.ok(p, id);
    assert.equal(p.type, "rank");
    assert.ok(p.items.length >= 5 && p.items.length <= 6, id + " " + p.items.length);
    const values = p.items.map(it => it.value);
    assert.equal(new Set(values).size, values.length, id + " has a tie");
    assert.equal(p.items[0].gRank, 1, id);
    assert.ok(p.items.some(it => it.gRank >= 6), id + " has no lower country");
    assert.ok(p.fact && p.source && p.order, id);
  }
});

test("Top 1 dailies keep their queue slots with a real #1", () => {
  const orders = TOP1.map(id => puzzles.find(p => p.id === id).order);
  assert.deepEqual(orders, [172, 173, 174, 175, 176, 177]);
  const between = puzzles.filter(p => !TOP1.includes(p.id) && p.order >= 172 && p.order <= 177);
  assert.deepEqual(between.map(p => p.id), []);
  for (const id of TOP1) {
    const p = puzzles.find(x => x.id === id);
    assert.equal(p.type, "top1");
    assert.ok(p.countries.length >= 40, id + " " + p.countries.length);
    const top = p.countries.filter(c => c.value === p.countries[0].value);
    assert.equal(top.length, 1, id);
    assert.equal(rankOf(p.countries, p.countries[0]), 1);
  }
  const pop = puzzles.find(p => p.id === "top1-pop-2100");
  assert.deepEqual(pop.countries.slice(0, 3).map(c => [c.name, c.value]), [
    ["India", 1505.3], ["China", 633.4], ["Pakistan", 511.0],
  ]);
  const age = puzzles.find(p => p.id === "top1-median-age");
  assert.match(age.question, /1 million/);
  assert.deepEqual(age.countries.slice(0, 3).map(c => [c.name, c.value]), [
    ["Japan", 49.4], ["Italy", 47.8], ["Hong Kong", 46.8],
  ]);
  const tea = puzzles.find(p => p.id === "top1-tea");
  const teaRank = puzzles.find(p => p.id === "top5-tea");
  assert.equal(tea.unit, "kg/yr per capita");
  assert.equal(teaRank.unit, "kg/yr per capita");
  for (const id of ["top5-wine", "top5-potatoes"]) {
    assert.equal(puzzles.find(p => p.id === id).unit, "kg/yr per capita", id);
  }
  const roads = puzzles.find(p => p.id === "top1-road-deaths");
  assert.match(roads.question, /1 million/);
  assert.deepEqual(roads.countries.slice(0, 3).map(c => [c.name, c.value]), [
    ["Guinea", 37.4], ["Libya", 34.0], ["Haiti", 31.3],
  ]);
});

test("Top 1 accuracy stays inside the try band and rewards a closer miss", () => {
  assert.equal(seed.top1Accuracy([1], true, 120), 100);
  assert.equal(seed.top1Accuracy([2, 1], true, 120), 98);
  assert.equal(seed.top1Accuracy([7, 1], true, 120), 93);
  assert.equal(seed.top1Accuracy([50, 1], true, 120), 80);
  assert.equal(seed.top1Accuracy([6, 3, 1], true, 120), 72);
  assert.equal(seed.top1Accuracy([2, 2, 2, 2, 1], true, 120), 35);
  assert.ok(seed.top1Accuracy([2, 1], true, 120) > seed.top1Accuracy([20, 1], true, 120));
  assert.equal(seed.top1Accuracy([2, 40], false, 187), 19);
  assert.equal(seed.top1Accuracy([187], false, 187), 1);
  assert.ok(seed.top1Accuracy([2], false, 120) > seed.top1Accuracy([80], false, 120));
  assert.equal(seed.top1Mark(1), "good");
  assert.equal(seed.top1Mark(5), "near");
  assert.equal(seed.top1Mark(15), "warm");
  assert.equal(seed.top1Mark(16), "bad");
});

test("an old Top 5 challenge grid still decodes, and orange is a Top 1 square", () => {
  const box = { window: {}, TextEncoder, TextDecoder, btoa, atob };
  box.globalThis = box;
  vm.runInContext(fs.readFileSync(path.join(root, "challenge.js"), "utf8"), vm.createContext(box), { filename: "challenge.js" });
  const RC = box.window.RankdChallenge;
  const legacy = RC.decode(RC.encode({
    k: "d", id: "2026-10-16", tries: 3, dnf: false, acc: 70,
    grid: ["GGRRG", "GGGGG"], name: "Alex",
  }));
  assert.equal(legacy.grid.join("."), "GGRRG.GGGGG");
  assert.equal(RC.gridText(["RYOG"]), "🟥🟨🟧🟩");
  const fresh = RC.decode(RC.encode({
    k: "d", id: "2027-03-18", tries: 3, dnf: false, acc: 72,
    grid: ["ROG"], name: "Alex",
  }));
  assert.equal(Array.from(fresh.grid).join("."), "ROG");
});

function bootShared() {
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
    localStorage: storage(),
    sessionStorage: storage(),
    location: { protocol: "http:", pathname: "/", search: "", hostname: "localhost", hash: "" },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    URLSearchParams, URL, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp,
    Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error("no")),
    AbortController,
  };
  sandbox.globalThis = sandbox;
  sandbox.window.document = document;
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.window.sessionStorage = sandbox.sessionStorage;
  sandbox.window.location = sandbox.location;
  sandbox.window.matchMedia = sandbox.matchMedia;
  vm.createContext(sandbox);
  for (const file of ["country-facts.js", "practice-data.js", "puzzles-data.js", "app.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox.window;
}

const FRAMED = {
  "top1-potatoes": "Top 1 Potato-Eating Country",
  "top1-tea": "Top 1 Tea-Drinking Country",
  "top1-co2": "Top 1 Carbon-Footprint Country",
  "top1-pop-2100": "Top 1 Most-Populous Country",
  "top1-median-age": "Top 1 Oldest Country",
  "top1-road-deaths": "Top 1 Deadliest-Roads Country",
};

function shown1(v) {
  return Number(v).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

test("a shared #1 value counts for every tied country, including a display tie", () => {
  const shared = bootShared().RankdShared;
  const tied = {
    type: "top1",
    countries: [
      { name: "Alpha", value: 3 },
      { name: "Bravo", value: 3 },
      { name: "Charlie", value: 3 },
      { name: "Delta", value: 2 },
    ],
  };
  const charlie = tied.countries[2];
  assert.equal(shared.top1IsLeader(tied, charlie), true);
  assert.equal(shared.top1RankOf(tied, charlie), 1);
  assert.equal(shared.top1RankOf(tied, tied.countries[3]), 4);
  assert.equal(seed.top1Accuracy([1], true, 4), 100);

  const practice = bootShared();
  const PR = practice.RANKD_PRACTICE;
  const fert = PR.datasets.find(d => d.id === "wb-fertility");
  const countries = fert.rows.map(r => ({ iso3: r[0], name: PR.countries[r[0]][0], value: r[1], hints: fert.hints[r[0]] }));
  const puzzle = { type: "top1", id: "wb-fertility", dataset: "wb-fertility", countries };
  const leaders = countries.filter(c => practice.RankdShared.top1IsLeader(puzzle, c)).map(c => c.name).sort();
  assert.deepEqual([...leaders], ["Central African Republic", "Chad", "Democratic Republic of Congo", "Somalia"]);
  const somalia = countries.find(c => c.name === "Somalia");
  assert.notEqual(countries[0].name, "Somalia");
  assert.equal(practice.RankdShared.top1RankOf(puzzle, somalia), 1);
  assert.equal(practice.RankdShared.top1RankOf(puzzle, countries.find(c => c.name === "Niger")), 5);
  assert.equal(practice.RankdShared.top1FrameTitle(puzzle), "Top 1 Fertility Country");
  assert.deepEqual([...practice.RankdShared.top1HintLines(puzzle)].slice(0, 2), ["It's in Africa.", "It has 10–50 million people (2024)."]);
});

test("every Top 1 list shares #1 across ties and uses a framed title", () => {
  const win = bootShared();
  const shared = win.RankdShared;
  for (const id of TOP1) {
    const p = puzzles.find(x => x.id === id);
    assert.equal(shared.top1FrameTitle(p), FRAMED[id], id);
    assert.equal(shared.heroHeadline(p), FRAMED[id], id);
    assert.equal(shared.homeCardCopy(p, "2027-03-26").title, FRAMED[id], id);
    assert.equal(shared.homeCardCopy(p, "2027-03-26").kind, "Top 1");
  }
  const lists = puzzles.filter(p => p.type === "top1");
  for (const ds of win.RANKD_PRACTICE.datasets) {
    if (!ds.rows || !ds.hints || +ds.rows[0][1] === 100) continue;
    lists.push({
      type: "top1", id: ds.id, dataset: ds.id, headline: ds.title, stat: ds.stat,
      countries: ds.rows.map(r => ({ name: win.RANKD_PRACTICE.countries[r[0]][0], iso3: r[0], value: r[1] })),
    });
  }
  for (const p of lists) {
    const title = shared.top1FrameTitle(p);
    assert.match(title, /^Top 1 .+ Country$/, p.id || p.dataset);
    const max = Math.max(...p.countries.map(c => Number(c.value)));
    const maxShown = shown1(max);
    for (const c of p.countries) {
      if (Number(c.value) === max || shown1(c.value) === maxShown) {
        assert.equal(shared.top1RankOf(p, c), 1, (p.id || "") + " " + c.name);
        assert.equal(shared.top1IsLeader(p, c), true);
      }
    }
  }
  assert.equal(shared.top1FrameTitle({ type: "top1", dataset: "wb-forest", headline: "Forest Cover" }), "Top 1 Forest Cover Country");
  assert.equal(shared.top1FrameTitle({ type: "top1", dataset: "top-potatoes", headline: "Potato Consumption" }), "Top 1 Potato-Eating Country");
});

test("a wrong Top 1 guess reveals the next hint and keeps the rank", () => {
  const shared = bootShared().RankdShared;
  const p = puzzles.find(x => x.id === "top1-potatoes");
  assert.deepEqual([...shared.countryFactHints({ iso3: "BLR", name: "Belarus" })], [
    "It's in Europe.",
    "It has 1–10 million people (2024).",
    "Its GDP per person is $2,000–10,000 a year (2024, US$).",
    "Its capital city starts with “M”.",
    "Its name starts with “B”.",
  ]);
  assert.deepEqual([...shared.top1HintLines(p)], [...shared.countryFactHints(p.countries[0])]);
  assert.deepEqual([...shared.top1HintsRevealed(p, [])], []);
  assert.deepEqual([...shared.top1HintsRevealed(p, [{ mark: "good" }])], []);
  assert.deepEqual([...shared.top1HintsRevealed(p, [{ mark: "warm" }])], ["It's in Europe."]);
  assert.equal(shared.top1HintsRevealed(p, [{ mark: "warm" }, { mark: "bad" }]).length, 2);
  const ireland = p.countries.find(c => c.name === "Ireland");
  assert.equal(shared.top1RankOf(p, ireland), 10);
  assert.equal(seed.top1Mark(10), "warm");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="top1Hints"/);
});

test("practice Top 1 keeps the old hint lines on the leading country", () => {
  const win = bootShared();
  let found = null;
  for (let s = 1; s < 2500 && !found; s++) {
    const p = win.RankdPractice.generate(s);
    if (p && p.type === "top1" && p.dataset === "wb-fertility") found = p;
  }
  assert.ok(found, "expected a fertility Top 1 practice seed");
  const chad = found.countries.find(c => c.name === "Chad");
  assert.ok(chad.hints && chad.hints[0], "practice attaches hint lines");
  assert.equal(chad.hints[0], "It's in Africa.");
  assert.equal(win.RankdShared.top1HintLines(found)[0], "It's in Africa.");
  const somalia = found.countries.find(c => c.name === "Somalia");
  assert.equal(win.RankdShared.top1RankOf(found, somalia), 1);
});
