/* Highest point above sea level, CIA World Factbook final public edition
   (22 January 2026), from factbook/factbook.json. The metres are the last
   "N m" in the highest-point line before a "note -", after parentheticals
   are removed. A note that names the actual highest point overrides that.
   Antarctica is skipped. West Bank and Gaza are not merged into Palestine.
   England, Scotland, the Channel Islands, and the French overseas departments
   are not separate Factbook countries, so they are left out. The parsed
   rows are /tmp/highest.json. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const SOURCE = "CIA World Factbook, final public edition, 22 January 2026, Geography: Elevation, highest point. Public domain. Peak names and metres are the Factbook's own text.";
const SOURCE_URL = "https://www.cia.gov/the-world-factbook/field/elevation/";
const YEAR = "2026";

function bootCountries() {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "practice-data.js"), "utf8"), box);
  return box.window.RANKD_PRACTICE.countries;
}

function loadPeaks() {
  const raw = JSON.parse(fs.readFileSync("/tmp/highest.json", "utf8"));
  return raw.map(row => {
    let peak = String(row.peak || "").replace(/\s+\d{1,3}(?:,\d{3})(?:\s*m)?$/, "").replace(/\s+\d+(?:\s*m)?$/, "").trim();
    peak = peak.replace(/\s+/g, " ");
    return { iso: row.iso, name: row.name, emoji: row.emoji, metres: row.m, peak };
  });
}

const countries = bootCountries();
const peaks = loadPeaks();
const byIso = Object.fromEntries(peaks.map(p => [p.iso, p]));
function must(iso) {
  const row = byIso[iso];
  if (!row || !countries[iso]) throw new Error("missing " + iso);
  return row;
}

const highCast = ["ECU", "MEX", "IRN", "KEN", "TUR", "PNG"].map(must).sort((a, b) => b.metres - a.metres);
const lowCast = ["NLD", "BEL", "LUX", "DNK", "SGP", "QAT"].map(must).sort((a, b) => b.metres - a.metres);

function gRank(metres) {
  return 1 + peaks.filter(p => p.metres > metres).length;
}

function rankItem(row) {
  return {
    name: row.name, emoji: row.emoji, value: row.metres, year: YEAR,
    gRank: gRank(row.metres), gTotal: peaks.length, gScope: "Factbook countries in this game",
  };
}

const HIGH_FACT = "Chimborazo in Ecuador is the farthest point from Earth's centre, because the planet bulges at the equator. The Factbook measures it from sea level, at 6,267 m. ranki.gg";
const LOW_FACT = "The Netherlands' highest point is Mount Scenery on Saba, in the Caribbean, not Vaalserberg in Europe. The Factbook puts the continental Netherlands at 322 m. ranki.gg";

const PUZZLES = [
  {
    type: "rank", id: "highest-point-surprises", order: 276, emoji: "🏔️",
    headline: "Far From Famous",
    question: "Which country has the highest point above sea level?",
    stat: "Highest point, metres above sea level",
    unit: "metres above sea level", higherIs: "top", valuesVisible: false,
    source: SOURCE, sourceUrl: SOURCE_URL, fact: HIGH_FACT,
    art: "mountain", support: "", dataset: "number-world-highest",
    year: YEAR, poolFrom: "2027-07-08",
    items: highCast.map(rankItem),
  },
  {
    type: "rank", id: "highest-point-modest", order: 277, emoji: "🏔️",
    headline: "Modest High Points",
    question: "Which country has the highest point above sea level?",
    stat: "Highest point, metres above sea level",
    unit: "metres above sea level", higherIs: "top", valuesVisible: false,
    source: SOURCE, sourceUrl: SOURCE_URL, fact: LOW_FACT,
    art: "mountain", support: "", dataset: "number-world-highest",
    year: YEAR, poolFrom: "2027-07-09",
    items: lowCast.map(rankItem),
  },
];

const statRows = peaks
  .slice()
  .sort((a, b) => a.iso < b.iso ? -1 : 1)
  .map(p => [p.iso, p.metres, YEAR, p.peak]);

const STAT = {
  id: "number-world-highest", sensitive: false, year: YEAR,
  unit: "metres above sea level",
  stat: "Highest point, metres above sea level",
  source: SOURCE, sourceUrl: SOURCE_URL,
  rows: statRows,
};

const DATASET = {
  id: "number-world-highest", title: "Highest Point",
  stat: "Highest point, metres above sea level", unit: "metres above sea level",
  src: SOURCE, url: SOURCE_URL, year: YEAR, hi: "top", dec: 0, emoji: "🏔️",
  fact: HIGH_FACT, caveat: "CIA World Factbook highest point, metres above sea level. Antarctica is not included.",
  sens: 0, coverage: "full",
  rows: statRows.map(r => [r[0], r[1], r[2]]),
};

function pair(knownIso, askIso, fact) {
  const known = must(knownIso), ask = must(askIso);
  if (known.metres === ask.metres) throw new Error("tie " + knownIso);
  return {
    known: { iso3: known.iso, name: known.name, emoji: known.emoji, value: known.metres, year: YEAR },
    ask: { iso3: ask.iso, name: ask.name, emoji: ask.emoji, value: ask.metres, year: YEAR },
    fact,
  };
}

const box = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "number-guess.js"), "utf8"), box);
const factor = box.window.RankdNumber.factorFromValues(statRows.map(r => r[1]));

const NUMBER = {
  id: "number-world-highest", sensitive: false, fillerDate: "2027-05-06", poolFrom: "2027-07-08",
  emoji: "🏔️", headline: "Highest point",
  stat: "Highest point, metres above sea level",
  noun: "highest point", unit: "metres above sea level", unitSpoken: "metres above sea level",
  year: YEAR, art: "mountain",
  source: SOURCE, sourceUrl: SOURCE_URL, dataset: "number-world-highest",
  scoreFactor: factor,
  pairs: [
    pair("MEX", "ECU", "Ecuador is 6,267 m at Chimborazo and Mexico is 5,636 m at Pico de Orizaba. Chimborazo is the farthest point from Earth's centre because the planet bulges at the equator. ranki.gg"),
    pair("IRN", "MEX", "Mexico is 5,636 m at Pico de Orizaba and Iran is 5,625 m at Damavand. Both figures are the Factbook's highest point above sea level. ranki.gg"),
    pair("TUR", "KEN", "Kenya is 5,199 m at Mount Kenya and Turkey is 5,137 m at Mount Ararat. Both figures are the Factbook's highest point above sea level. ranki.gg"),
    pair("JPN", "PNG", "Papua New Guinea is 4,509 m at Mount Wilhelm and Japan is 3,776 m at Mount Fuji. Both figures are the Factbook's highest point above sea level. ranki.gg"),
    pair("BEL", "NLD", "The Netherlands is 862 m at Mount Scenery on Saba and Belgium is 694 m at Botrange. The Factbook's high point for the Netherlands is in the Caribbean, not at Vaalserberg. ranki.gg"),
    pair("SGP", "DNK", "Denmark is 171 m at Møllehøj and Singapore is 166 m at Bukit Timah. The Factbook spells Denmark's hill Store Mollehoj. ranki.gg"),
    pair("QAT", "DNK", "Denmark is 171 m and Qatar is 103 m at Tuwayyir al Hamir. Both figures are the Factbook's highest point above sea level. ranki.gg"),
    pair("GBR", "AUS", "Australia is 2,228 m at Mount Kosciuszko and the United Kingdom is 1,345 m at Ben Nevis. Both figures are the Factbook's highest point above sea level. ranki.gg"),
    pair("ITA", "FRA", "France is 4,810 m at Mont Blanc and Italy is 4,748 m at Mont Blanc de Courmayeur. The Factbook gives the shared massif a different height for each country. ranki.gg"),
    pair("ESP", "MAR", "Morocco is 4,165 m at Jebel Toubkal and Spain is 3,718 m at Pico de Teide. Both figures are the Factbook's highest point above sea level. ranki.gg"),
    pair("BRA", "ZAF", "South Africa is 3,450 m at Ntheledi and Brazil is 2,994 m at Pico da Neblina. Both figures are the Factbook's highest point above sea level. ranki.gg"),
    pair("EGY", "SAU", "Saudi Arabia is 3,000 m in the As Sarawat range and Egypt is 2,629 m at Mount Catherine. Both figures are the Factbook's highest point above sea level. ranki.gg"),
    pair("IRL", "ISL", "Iceland is 2,110 m at Hvannadalshnukur and Ireland is 1,041 m at Carrauntoohil. Both figures are the Factbook's highest point above sea level. ranki.gg"),
    pair("LUX", "BEL", "Belgium is 694 m at Botrange and Luxembourg is 559 m at Buurgplaatz. Both figures are the Factbook's highest point above sea level. ranki.gg"),
    pair("DEU", "FRA", "France is 4,810 m at Mont Blanc and Germany is 2,963 m at the Zugspitze. Both figures are the Factbook's highest point above sea level. ranki.gg"),
    pair("CHE", "ITA", "Italy is 4,748 m at Mont Blanc de Courmayeur and Switzerland is 4,634 m at Dufourspitze. Both figures are the Factbook's highest point above sea level. ranki.gg"),
  ],
};

function spliceArray(file, endMark, fresh, idOf) {
  let text = fs.readFileSync(file, "utf8");
  const add = fresh.filter(row => !text.includes('"id":"' + idOf(row) + '"'));
  if (!add.length) return;
  const end = text.lastIndexOf(endMark);
  if (end < 0) throw new Error("end missing " + file);
  text = text.slice(0, end) + "," + add.map(row => JSON.stringify(row)).join(",") + text.slice(end);
  fs.writeFileSync(file, text);
}

spliceArray(path.join(root, "puzzles-data.js"), "];", PUZZLES, p => p.id);
spliceArray(path.join(root, "number-stats.js"), "];", [STAT], s => s.id);
{
  const file = path.join(root, "number-puzzles.js");
  let text = fs.readFileSync(file, "utf8");
  if (!text.includes('"id":"number-world-highest"')) {
    const marker = "/* Archived country series";
    const at = text.indexOf(marker);
    const end = text.lastIndexOf("];", at);
    if (at < 0 || end < 0) throw new Error("number-puzzles insert missing");
    text = text.slice(0, end) + "," + JSON.stringify(NUMBER) + text.slice(end);
    fs.writeFileSync(file, text);
  }
}

const practiceFile = path.join(root, "practice-data.js");
let practice = fs.readFileSync(practiceFile, "utf8");
if (!practice.includes('"id":"number-world-highest"')) {
  const needle = '],"minTop5":';
  const at = practice.indexOf(needle);
  if (at < 0) throw new Error("practice insert missing");
  practice = practice.slice(0, at) + "," + JSON.stringify(DATASET) + practice.slice(at);
  fs.writeFileSync(practiceFile, practice);
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const csvFile = path.join(root, "puzzles.csv");
let csv = fs.readFileSync(csvFile, "utf8");
if (!csv.endsWith("\n")) csv += "\n";
for (const p of PUZZLES) {
  if (csv.includes("\n" + p.id + ",")) continue;
  p.items.forEach((it, i) => {
    const head = i === 0
      ? [p.id, p.order, p.emoji, p.question, p.stat, p.unit, "top", "no", it.name, it.emoji, it.value, it.year, p.source, p.sourceUrl, p.fact, it.gRank, it.gTotal, it.gScope, p.art, "", p.dataset, "", p.headline]
      : [p.id, "", "", "", "", "", "", "", it.name, it.emoji, it.value, it.year, "", "", "", it.gRank, it.gTotal, it.gScope, "", "", "", "", ""];
    csv += head.map(csvEscape).join(",") + "\n";
  });
}
fs.writeFileSync(csvFile, csv);

const seed = require(path.join(root, "community-seed.js"));
const statsFile = path.join(root, "community-stats.json");
const doc = JSON.parse(fs.readFileSync(statsFile, "utf8"));
function bars(items, shift) {
  const n = items.length;
  const order = items.map((_, i) => items[(i + shift) % n]);
  return order.map((it, i) => ({ slot: i + 1, name: it.name, pct: Math.max(18, 52 - i * 6), emoji: it.emoji }));
}
for (const puzzle of PUZZLES) {
  if (doc.puzzles[puzzle.id]) continue;
  const standing = seed.standingBlock(puzzle.id, 910, "rank", puzzle.items.length);
  if (standing.avgTries < 3.3 || standing.avgTries > 4.0) throw new Error(puzzle.id + " tries " + standing.avgTries);
  if (standing.avgAccuracy < 50 || standing.avgAccuracy > 72) throw new Error(puzzle.id + " acc " + standing.avgAccuracy);
  const per = {};
  puzzle.items.forEach((it, i) => { per[it.name] = Math.max(22, 58 - i * 6); });
  doc.puzzles[puzzle.id] = {
    type: "rank", seeded: true, players: standing.n, pctPerfect: 11,
    perItemCorrect: per,
    firstGuessWorld: { players: 1, bars: bars(puzzle.items, 1) },
    firstGuessByCountry: {
      US: { players: 1, bars: bars(puzzle.items, 0) },
      TW: { players: 1, bars: bars(puzzle.items, 2) },
      SG: { players: 1, bars: bars(puzzle.items, 1) },
    },
    countryBoard: seed.countryBoard(puzzle.id, "rank"),
    standing,
  };
}
fs.writeFileSync(statsFile, JSON.stringify(doc));

const { execFileSync } = require("child_process");
const payload = [];
for (const puzzle of PUZZLES) {
  puzzle.items.forEach((it, n) => {
    payload.push({
      id: puzzle.id,
      cells: n === 0 ? [
        ["B", puzzle.order], ["C", puzzle.emoji], ["D", puzzle.question], ["E", puzzle.stat],
        ["F", puzzle.unit], ["G", "top"], ["H", "no"], ["I", it.name], ["J", it.emoji],
        ["K", it.value], ["L", it.year], ["M", puzzle.source], ["N", puzzle.sourceUrl],
        ["O", puzzle.fact], ["P", it.gRank], ["Q", it.gTotal], ["R", it.gScope],
        ["S", puzzle.art], ["U", puzzle.dataset], ["W", puzzle.headline],
      ] : [
        ["I", it.name], ["J", it.emoji], ["K", it.value], ["L", it.year],
        ["P", it.gRank], ["Q", it.gTotal], ["R", it.gScope],
      ],
    });
  });
}
fs.writeFileSync("/tmp/rankd-highest-xlsx.json", JSON.stringify(payload));
execFileSync("python3", ["-c", `
import json, re, zipfile
from pathlib import Path
xlsx = Path(${JSON.stringify(path.join(root, "puzzles.xlsx"))})
items = json.loads(Path("/tmp/rankd-highest-xlsx.json").read_text())
def esc(s):
    return ("" if s is None else str(s)).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
def cell(col, row, text):
    if text is None or text == "":
        return ""
    return f'<c r="{col}{row}" t="inlineStr"><is><t>{esc(text)}</t></is></c>'
with zipfile.ZipFile(xlsx) as book:
    stored = {info.filename: (info, book.read(info.filename)) for info in book.infolist()}
xml = stored["xl/worksheets/sheet1.xml"][1].decode("utf-8")
if "highest-point-surprises" in xml:
    print("xlsx already has the puzzles")
    raise SystemExit(0)
last = max(int(n) for n in re.findall(r'<row r="(\\d+)"', xml))
rows = []
for item in items:
    last += 1
    parts = [cell("A", last, item["id"])] + [cell(col, last, val) for col, val in item["cells"]]
    rows.append(f'<row r="{last}">' + "".join(parts) + "</row>")
xml = xml.replace("</sheetData>", "".join(rows) + "</sheetData>", 1)
dim = re.search(r'<dimension ref="([A-Z]+)1:([A-Z]+)(\\d+)"\\s*/>', xml)
if dim:
    xml = xml[:dim.start()] + f'<dimension ref="{dim.group(1)}1:{dim.group(2)}{last}" />' + xml[dim.end():]
stored["xl/worksheets/sheet1.xml"] = (stored["xl/worksheets/sheet1.xml"][0], xml.encode("utf-8"))
tmp = xlsx.with_suffix(".xlsx.tmp")
with zipfile.ZipFile(tmp, "w") as dest:
    for name, (info, data) in stored.items():
        dest.writestr(info, data)
tmp.replace(xlsx)
print("xlsx rows", len(rows))
`], { stdio: "inherit" });

console.log("countries", peaks.length, "factor", factor);
console.log(highCast.map(p => p.name + " " + p.metres).join(" | "));
console.log(lowCast.map(p => p.name + " " + p.metres).join(" | "));
