const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const search = require("../puzzle-search.js");

const root = path.join(__dirname, "..");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "puzzles-data.js"), "utf8"), sandbox, { filename: "puzzles-data.js" });
const puzzles = sandbox.window.RANKD_PUZZLES;
const hit = (q, opts) => puzzles.filter(p => search.matches(p, q, opts));

test("Flavor Haters keeps the pew-india id, subtitle, and gloss", () => {
  const p = puzzles.find(x => x.id === "pew-india-unfavorable");
  assert.ok(p, "puzzle missing");
  assert.equal(p.headline, "Flavor Haters");
  assert.match(p.question, /%\s*with an unfavorable view of India/);
  assert.equal(p.stat, "Unfavorable opinion of India");
  assert.equal(p.valueGloss, "unfavorable");
  assert.equal(JSON.stringify(p.items.map(it => [it.name, it.value])), JSON.stringify([
    ["Pakistan", 91], ["United States", 50], ["Israel", 29], ["Kenya", 25], ["United Kingdom", 24], ["Sri Lanka", 11],
  ]));
  const js = fs.readFileSync(path.join(root, "puzzles-data.js"), "utf8");
  const csv = fs.readFileSync(path.join(root, "puzzles.csv"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.equal(js.includes("Views of India"), false);
  assert.equal(csv.includes("Views of India"), false);
  assert.match(csv, /pew-india-unfavorable,54,.*Flavor Haters\s*$/m);
  assert.match(app, /"Flavor Haters": "unfavorable"/);
  assert.equal(app.includes("Views of India"), false);
  const xlsx = execFileSync("python3", ["-c", "import zipfile; t=zipfile.ZipFile('puzzles.xlsx').read('xl/worksheets/sheet1.xml').decode(); assert 'Views of India' not in t; assert t.count('>Flavor Haters<')==1; print('ok')"], { cwd: root, encoding: "utf8" });
  assert.equal(xlsx.trim(), "ok");
});

test("searching India returns Flavor Haters and Indians Abroad", () => {
  for (const q of ["India", "india", "INDIA"]) {
    const ids = hit(q).map(p => p.id);
    assert.ok(ids.includes("pew-india-unfavorable"), q);
    assert.ok(ids.includes("indians-abroad"), q);
  }
  const flavor = puzzles.find(p => p.id === "pew-india-unfavorable");
  assert.equal(search.matches(flavor, "uk"), true);
  assert.equal(search.matches(flavor, "UK"), true);
  assert.equal(search.matches(flavor, "britain"), true);
  assert.equal(search.matches(flavor, "usa"), true);
  assert.equal(search.matches(flavor, "US"), true);
  assert.equal(search.matches(flavor, "sri"), true);
});

test("Japan and jap return many puzzles; nonsense is empty", () => {
  const japan = hit("Japan");
  const jap = hit("jap");
  assert.ok(japan.length >= 8, `Japan matched ${japan.length}`);
  assert.ok(jap.length >= 8, `jap matched ${jap.length}`);
  assert.ok(jap.every(p => japan.some(j => j.id === p.id)));
  assert.equal(hit("zzzzqqqplugh").length, 0);
  assert.match(search.emptyCopy("zzzzqqqplugh"), /No puzzles match/);
  assert.equal(search.countLabel(12), "12 puzzles");
  assert.equal(search.countLabel(1), "1 puzzle");
});

test("aliases do not swallow unrelated countries", () => {
  const aus = { headline: "Down Under", question: "A plain stat", stat: "Something measured", source: "A bureau", items: [{ name: "Australia", emoji: "🇦🇺" }] };
  assert.equal(search.matches(aus, "us"), false);
  assert.equal(search.matches(aus, "usa"), false);
  assert.equal(search.matches(aus, "aus"), true);
  const us = { headline: "Plain", question: "Plain stat", items: [{ name: "United States" }] };
  assert.equal(search.matches(us, "us"), true);
  assert.equal(search.matches(us, "USA"), true);
  assert.equal(search.matches(us, "u.s."), true);
  assert.equal(search.matches({ headline: "Plain", question: "Plain", items: [{ name: "United Kingdom" }] }, "uk"), true);
  assert.equal(search.matches({ headline: "Plain", question: "Plain", items: [{ name: "United Kingdom" }] }, "Britain"), true);
  assert.equal(search.matches({ headline: "Plain", question: "Plain", items: [{ name: "South Korea" }] }, "korea"), true);
  assert.equal(search.matches({ headline: "Plain", question: "Plain", items: [{ name: "South Korea" }] }, "jap"), false);
  const russia = { headline: "Plain", question: "Plain stat", source: "Nowhere", items: [{ name: "Russia" }] };
  assert.equal(search.matches(russia, "us"), false);
  assert.equal(search.matches(russia, "rus"), true);
});

test("keyword fields: gloss, source, category", () => {
  const glossed = { type: "rank", headline: "Plain Title", question: "No spoiler here", stat: "count", source: "Somewhere", unit: "%", valueGloss: "unfavorable", items: [{ name: "France", emoji: "🇫🇷" }] };
  assert.equal(search.matches(glossed, "unfavorable"), true);
  assert.equal(search.matches(glossed, "unfavorable", { gloss: "" }), false);
  const top = { type: "top5", headline: "Tea", question: "Cups", source: "FAO", countries: [{ name: "Japan" }] };
  assert.equal(search.matches(top, "guess"), true);
  assert.equal(search.matches(top, "jap"), true);
  assert.equal(search.matches(top, "rank it"), false);
  const groups = { type: "rank", headline: "Bands", question: "Age bands", items: [{ name: "Gen Z", emoji: "👶" }] };
  assert.equal(search.matches(groups, "groups"), true);
  assert.equal(search.matches({ headline: "X", question: "Y", source: "Pew Research Center", items: [] }, "pew"), true);
});
