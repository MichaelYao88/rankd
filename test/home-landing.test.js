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
vm.runInContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), sandbox, { filename: "app.js" });

const shared = sandbox.window.RankdShared;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20261026201500_puzzle_submissions.sql"), "utf8");

test("the home sample is the female homicide trio from homicide-women", () => {
  const demo = shared.HOME_DEMO;
  assert.equal(demo.id, "homicide-women");
  assert.equal(demo.title, "Female homicide rate");
  assert.equal(demo.year, "2022");
  assert.equal(demo.sourceUrl, "https://data.worldbank.org/indicator/VC.IHR.PSRC.FE.P5");
  assert.equal(JSON.stringify(demo.items.map(it => [it.name, it.value, it.label])), JSON.stringify([
    ["United States", 2.81, "2.81"],
    ["India", 2.37, "2.37"],
    ["South Korea", 0.5, "0.50"],
  ]));
  for (const name of ["United States", "India", "South Korea"]) assert.match(html, new RegExp(name));
  assert.match(html, /2\.81/);
  assert.match(html, /2\.37/);
  assert.match(html, /0\.50/);
  assert.match(html, /Female homicide rate/);
  assert.match(html, /data\.worldbank\.org\/indicator\/VC\.IHR\.PSRC\.FE\.P5/);
});

test("the landing page leads with today's puzzle, five steps, and a suggestion form", () => {
  assert.match(html, /id="homeView"/);
  assert.match(html, /Play today's puzzle/);
  assert.match(html, /How to play!/);
  assert.match(html, /Submit your own puzzle/);
  assert.match(html, /id="playView" class="hidden"/);
  assert.match(html, /rankd-boot-play/);
  assert.match(html, /rankd-boot-archive/);
  assert.match(css, /html\.rankd-boot-play #playView/);
  assert.match(css, /html\.rankd-boot-archive #archiveView/);
  assert.match(html, /Step 1/);
  assert.match(html, /Drag the countries into order/);
  assert.match(html, /Lock it in/);
  assert.match(html, /Green is the right spot/);
  assert.match(html, /more tries/);
  assert.match(html, /tap the source/);
  assert.match(html, /name="company"/);
  assert.match(html, /id="puzzleForm"/);
  assert.match(css, /prefers-reduced-motion:\s*no-preference/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /puzzle_submitted/);
  assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /puzzle_submissions/);
});

test("a headline that names a ranked country is left off the play card", () => {
  const safe = shared.homeCardCopy({
    type: "match",
    headline: "Foreign Relations",
    people: [{ name: "Someone Else" }],
  }, "2026-10-06");
  assert.equal(safe.no, "No. 001");
  assert.equal(safe.date, "October 6, 2026");
  assert.equal(safe.title, "Foreign Relations");
  assert.equal(safe.kind, "Match it");

  const spoiler = shared.homeCardCopy({
    type: "rank",
    headline: "United States leads",
    items: [{ name: "United States" }, { name: "India" }],
  }, "2026-10-26");
  assert.equal(spoiler.title, "");
  assert.equal(spoiler.no, "No. 021");
  assert.equal(spoiler.kind, "Rank it");

  const lookalike = shared.homeCardCopy({
    type: "rank",
    headline: "Indians Abroad",
    items: [{ name: "India" }],
  }, "2026-10-07");
  assert.equal(lookalike.title, "Indians Abroad");
});

test("the play card reads its label from the puzzle type map", () => {
  assert.equal(shared.PUZZLE_TYPE_LABEL.name, "Name it");
  assert.equal(shared.PUZZLE_TYPE_LABEL.top5, "Top 5");
  const named = shared.homeCardCopy({
    type: "name",
    headline: "S-Tier Living",
    countries: [{ name: "Sweden" }],
  }, "2026-10-08");
  assert.equal(named.kind, shared.PUZZLE_TYPE_LABEL.name);
  assert.equal(named.title, "S-Tier Living");
  const spoiled = shared.homeCardCopy({
    type: "name",
    headline: "Sweden leads",
    countries: [{ name: "Sweden" }],
  }, "2026-10-08");
  assert.equal(spoiled.title, "");
  assert.equal(shared.homeCardCopy({ type: "top5", headline: "Powder" }, "2026-10-08").kind, shared.PUZZLE_TYPE_LABEL.top5);
  assert.equal(shared.homeCardCopy({ type: "top1", headline: "Soon" }, "2026-10-08").kind, shared.PUZZLE_TYPE_LABEL.top1);
  assert.equal(shared.homeCardCopy({ type: "top99", headline: "Soon" }, "2026-10-08").kind, "Daily");
});

test("the landing sample starts in the same order as the in-game overlay", () => {
  const namesIn = (marker) => {
    const start = html.indexOf(marker);
    assert.ok(start >= 0, marker);
    const region = html.slice(start, start + 1800);
    const cardsAt = region.search(/class="(?:mini-cards|howto-cards)"/);
    const from = cardsAt >= 0 ? region.slice(cardsAt) : region;
    const end = from.indexOf("</ol>");
    const slice = end >= 0 ? from.slice(0, end) : from;
    return [...slice.matchAll(/South Korea|United States|India/g)].map(m => m[0]);
  };
  const order = ["South Korea", "United States", "India"];
  assert.deepEqual(namesIn('class="howto-cards"'), order);
  assert.deepEqual(namesIn('class="mini mini-step1"'), order);
});

test("puzzle suggestions require a question and keep optional fields in bounds", () => {
  const bad = shared.validatePuzzleSubmission({ question: "  " });
  assert.equal(bad.ok, false);
  assert.equal(bad.field, "question");

  const url = shared.validatePuzzleSubmission({ question: "Tea consumption", source_url: "notaurl" });
  assert.equal(url.ok, false);
  assert.equal(url.field, "source_url");

  const longName = shared.validatePuzzleSubmission({ question: "Tea", handle: "x".repeat(41) });
  assert.equal(longName.ok, false);
  assert.equal(longName.field, "handle");

  const ok = shared.validatePuzzleSubmission({
    question: "  Tea drunk per person  ",
    countries: "Japan, Turkey",
    source_url: "https://data.worldbank.org/indicator/example",
    handle: "ada",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.spam, false);
  assert.equal(JSON.stringify(ok.row), JSON.stringify({
    question: "Tea drunk per person",
    countries: "Japan, Turkey",
    source_url: "https://data.worldbank.org/indicator/example",
    handle: "ada",
  }));

  const spam = shared.validatePuzzleSubmission({ question: "", company: "viagra" });
  assert.equal(spam.ok, true);
  assert.equal(spam.spam, true);
});

test("a missing suggestions table is a distinct, friendly failure", () => {
  assert.equal(shared.submissionErrorKind(404, ""), "missing");
  assert.equal(shared.submissionErrorKind(400, '{"code":"PGRST205","message":"Could not find the table public.puzzle_submissions in the schema cache"}'), "missing");
  assert.equal(shared.submissionErrorKind(500, "timeout"), "fail");
  const missing = shared.submissionErrorMessage("missing");
  assert.match(missing, /aren't open yet/);
  assert.match(missing, /mikelyaps@gmail.com/);
  assert.doesNotMatch(missing, /PGRST|stack|SQL/i);
});

test("the results source card matches the how-to preview and sits above share", () => {
  const result = html.slice(html.indexOf('id="result"'), html.indexOf('id="adBottomShell"'));
  const fact = result.indexOf('id="fact"');
  const source = result.indexOf('id="sourceLink"');
  const challenge = result.indexOf('id="challengeFriendBtn"');
  const puzzle = result.indexOf('id="sharePuzzleBtn"');
  assert.ok(fact >= 0 && source > fact && challenge > source && puzzle > challenge);
  assert.doesNotMatch(result, /id="shareResultBtn"/);
  assert.match(result, /class="source-card hidden" id="sourceLink"/);
  assert.match(result, /id="sourceName"/);
  assert.match(result, /id="sourceDataset"/);
  assert.match(result, /id="sourceDomain"/);
  assert.match(result, /id="sourceFav"/);
  assert.match(result, /Tap to see the data/);
  assert.match(html, /class="source-card"/);
  assert.match(html, /Female homicide rate, 2022/);
  assert.match(html, /data\.worldbank\.org/);
  assert.match(css, /\.source-card/);
  assert.match(css, /source-fav-fallback/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "app.js"), "utf8"), /og:image|opengraph|microlink|unfurl/i);

  const card = shared.sourceCardModel({
    source: "UNODC via World Bank",
    sourceUrl: "https://www.data.worldbank.org/indicator/VC.IHR.PSRC.FE.P5",
    stat: "Female homicide rate",
    year: "2022",
  });
  assert.equal(card.publisher, "UNODC via World Bank");
  assert.equal(card.dataset, "Female homicide rate, 2022");
  assert.equal(card.domain, "data.worldbank.org");
  assert.equal(card.favicon, "https://www.data.worldbank.org/favicon.ico");
  assert.equal(card.tap, "Tap to see the data");
  assert.match(card.url, /^https:\/\/www\.data\.worldbank\.org\//);

  const kept = shared.sourceCardModel({
    source: "Pew",
    sourceUrl: "https://www.pewresearch.org/global/2021/11/18/what-makes-life-meaningful/",
    stat: "Meaning in life, 2021",
    year: "2021",
  });
  assert.equal(kept.dataset, "Meaning in life, 2021");
  assert.equal(kept.domain, "pewresearch.org");

  const match = shared.sourceCardModel({
    source: "Pew Research Center",
    sourceUrl: "https://www.pewresearch.org/global/example",
    stat: "Match each clue to the right person",
    question: "Where people found meaning in life",
    headline: "What Matters Most",
  });
  assert.equal(match.dataset, "Where people found meaning in life");

  const flagged = shared.sourceCardModel({
    source: "Our World in Data",
    sourceUrl: "https://ourworldindata.org/grapher/annual-working-hours-per-worker",
    stat: "",
    question: "Hours Worked per Year 🇩🇪🇮🇩",
    items: [{ year: "2023" }],
  });
  assert.equal(flagged.dataset, "Hours Worked per Year, 2023");
  assert.equal(flagged.favicon, "https://ourworldindata.org/favicon.ico");

  const blank = shared.sourceCardModel({ source: "", sourceUrl: "notaurl", stat: "Tea" });
  assert.equal(blank.url, "");
  assert.equal(blank.favicon, "");
  assert.equal(blank.publisher, "Source");
});

test("the submission migration is insert-only for anon", () => {
  assert.match(migration, /create table if not exists public\.puzzle_submissions/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /for insert\s+to anon/i);
  assert.match(migration, /grant insert \(/i);
  assert.match(migration, /revoke all on table public\.puzzle_submissions from anon, authenticated/i);
  assert.equal(/for select/i.test(migration), false);
  assert.equal(/for update/i.test(migration), false);
  assert.equal(/for delete/i.test(migration), false);
  assert.match(migration, /char_length\(btrim\(question\)\) between 1 and 280/);
});
