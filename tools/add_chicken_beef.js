/* Poultry and beef supply, FAO Food Balances via Our World in Data, 2023.
   Grapher: per-capita-meat-type. Kilograms per person per year of food
   available, not what reaches the plate. Rounded to 2 decimals, the same
   way Butcher Board quotes this file. Countries with no 2023 row stay out. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const YEAR = "2023";
const URL = "https://ourworldindata.org/grapher/per-capita-meat-type";
const CITE = "Food and Agriculture Organization of the United Nations (2025), processed by Our World in Data. Food Balances, 2023. Kilograms per person per year available at the end of the supply chain. It does not count consumer waste, so the amount eaten can be lower.";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function round2(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function bootCountries() {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "practice-data.js"), "utf8"), box);
  return box.window.RANKD_PRACTICE.countries;
}

const table = parseCsv(fs.readFileSync("/tmp/meat.csv", "utf8"));
const header = table[0];
const col = name => header.indexOf(name);
const countries = bootCountries();
const series = [];
for (const cells of table.slice(1)) {
  if (cells[col("Year")] !== "2023") continue;
  const iso = cells[col("Code")];
  if (!iso || iso.length !== 3 || !countries[iso]) continue;
  const poultry = round2(cells[col("Poultry")]);
  const beef = round2(cells[col("Beef and buffalo")]);
  if (poultry == null || beef == null) continue;
  series.push({
    iso, name: countries[iso][0], emoji: countries[iso][1] || "",
    poultry, beef,
    pork: round2(cells[col("Pork")]),
  });
}
if (series.length < 100) throw new Error("series short " + series.length);
const byIso = Object.fromEntries(series.map(r => [r.iso, r]));
function must(iso) {
  const row = byIso[iso];
  if (!row) throw new Error("missing " + iso);
  return row;
}

function gRank(key, value) {
  return 1 + series.filter(r => r[key] > value).length;
}

const poultryCast = ["USA", "AUS", "MYS", "PAN", "QAT", "BRA"].map(must);
const beefCast = ["ZWE", "BRA", "USA", "MNG", "UZB", "URY"].map(must);
poultryCast.sort((a, b) => b.poultry - a.poultry);
beefCast.sort((a, b) => b.beef - a.beef);

const POULTRY_FACT = "Malaysia's poultry supply is 51.90 kg per person, against 7.24 kg of pork and 8.75 kg of beef and buffalo. Israel, not on this list, is at 72.82 kg. The figure is food available in 2023, FAO via Our World in Data, not what reaches the plate. ranki.gg";
const BEEF_FACT = "Uruguay's beef and buffalo supply is 21.31 kg per person. Argentina, not on this list, is 48.99, and India is 2.32. The figure is food available in 2023, FAO via Our World in Data, not what reaches the plate. ranki.gg";

if (byIso.MYS.poultry !== 51.9 || byIso.MYS.pork !== 7.24 || byIso.MYS.beef !== 8.75) throw new Error("Malaysia " + JSON.stringify(byIso.MYS));
if (byIso.ISR.poultry !== 72.82) throw new Error("Israel poultry");
if (byIso.ARG.beef !== 48.99 || byIso.IND.beef !== 2.32 || byIso.URY.beef !== 21.31) throw new Error("beef anchors");

function rankItem(row, key) {
  return {
    name: row.name, emoji: row.emoji, value: row[key], year: YEAR,
    gRank: gRank(key, row[key]), gTotal: series.length, gScope: "FAO 2023 countries",
  };
}

const PUZZLES = [
  {
    type: "rank", id: "poultry-supply", order: 278, emoji: "🍗",
    headline: "Bird Supply",
    question: "Which country has the most poultry meat available per person?",
    stat: "Poultry meat supply, kg per person per year",
    unit: "kg per person per year", higherIs: "top", valuesVisible: false,
    source: CITE + " Column: poultry meat.", sourceUrl: URL, fact: POULTRY_FACT,
    art: "bowl", support: "", dataset: "fao-poultry-2023",
    year: YEAR, poolFrom: "2027-07-10",
    items: poultryCast.map(row => rankItem(row, "poultry")),
  },
  {
    type: "rank", id: "beef-supply", order: 279, emoji: "🥩",
    headline: "Cattle Ledger",
    question: "Which country has the most beef and buffalo meat available per person?",
    stat: "Beef and buffalo meat supply, kg per person per year",
    unit: "kg per person per year", higherIs: "top", valuesVisible: false,
    source: CITE + " Column: beef and buffalo meat.", sourceUrl: URL, fact: BEEF_FACT,
    art: "bowl", support: "", dataset: "fao-beef-2023",
    year: YEAR, poolFrom: "2027-07-11",
    items: beefCast.map(row => rankItem(row, "beef")),
  },
];

function stat(id, label, key) {
  return {
    id, sensitive: false, year: YEAR,
    unit: "kg per person per year", stat: label,
    source: CITE, sourceUrl: URL,
    rows: series.slice().sort((a, b) => a.iso < b.iso ? -1 : 1).map(r => [r.iso, r[key], YEAR]),
  };
}
const STATS = [
  stat("fao-poultry-2023", "Poultry meat supply, kg per person per year", "poultry"),
  stat("fao-beef-2023", "Beef and buffalo meat supply, kg per person per year", "beef"),
];

function dataset(id, title, label, key, fact) {
  return {
    id, title, stat: label, unit: "kg per person per year",
    src: CITE, url: URL, year: YEAR, hi: "top", dec: 2, emoji: id.includes("beef") ? "🥩" : "🍗",
    fact, caveat: "FAO food available, 2023, via Our World in Data. Not what reaches the plate.",
    sens: 0, coverage: "full",
    rows: series.slice().sort((a, b) => a.iso < b.iso ? -1 : 1).map(r => [r.iso, r[key], YEAR]),
  };
}
const DATASETS = [
  dataset("fao-poultry-2023", "Poultry Supply", "Poultry meat supply, kg per person per year", "poultry", POULTRY_FACT),
  dataset("fao-beef-2023", "Beef Supply", "Beef and buffalo meat supply, kg per person per year", "beef", BEEF_FACT),
];

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
spliceArray(path.join(root, "number-stats.js"), "];", STATS, s => s.id);

const practiceFile = path.join(root, "practice-data.js");
let practice = fs.readFileSync(practiceFile, "utf8");
const needle = '],"minTop5":';
const at = practice.indexOf(needle);
if (at < 0) throw new Error("practice insert missing");
const adding = DATASETS.filter(d => !practice.includes('"id":"' + d.id + '"'));
if (adding.length) {
  practice = practice.slice(0, at) + "," + adding.map(d => JSON.stringify(d)).join(",") + practice.slice(at);
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
fs.writeFileSync("/tmp/rankd-meat-xlsx.json", JSON.stringify(payload));
execFileSync("python3", ["-c", `
import json, re, zipfile
from pathlib import Path
xlsx = Path(${JSON.stringify(path.join(root, "puzzles.xlsx"))})
items = json.loads(Path("/tmp/rankd-meat-xlsx.json").read_text())
def esc(s):
    return ("" if s is None else str(s)).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
def cell(col, row, text):
    if text is None or text == "":
        return ""
    return f'<c r="{col}{row}" t="inlineStr"><is><t>{esc(text)}</t></is></c>'
with zipfile.ZipFile(xlsx) as book:
    stored = {info.filename: (info, book.read(info.filename)) for info in book.infolist()}
xml = stored["xl/worksheets/sheet1.xml"][1].decode("utf-8")
if "poultry-supply" in xml:
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

for (const p of PUZZLES) {
  console.log(p.id, p.items.map(it => it.name + " " + it.value + " #" + it.gRank + "/" + it.gTotal).join(" | "));
}
console.log("countries", series.length);
