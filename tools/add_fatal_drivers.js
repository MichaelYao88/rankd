/* US fatal-crash boards. Sex and age share NHTSA's licensed-driver rate.
   Race uses the CDC age-adjusted death rate per 100,000 people, a different
   denominator, so it is a second board. */
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const NHTSA = "https://crashstats.nhtsa.dot.gov/Api/Public/ViewPublication/813656";
const CDC = "https://doi.org/10.1016/j.jsr.2025.03.005";

const SEX_FACT = "Within each sex, drivers 75 and older are in fatal crashes a little more often per licensed driver than drivers 65 to 74. Note: drivers in fatal crashes per 100,000 licensed drivers, 2022. ranki.gg";
const RACE_FACT = "American Indian or Alaska Native people are far above the other groups in this table, and Asian people are the lowest. These are age-adjusted deaths of everyone killed in a motor vehicle crash, not drivers per licensed driver. Race groups are non-Hispanic. ranki.gg";

// The full table does not interleave: every male rate is above every female
// rate (lowest male 24.67, highest female 22.74). The daily is the six rates
// closest to that boundary, so the board is a tight cluster instead of sixteen
// cards that "men first" solves. Practice and number-stats keep all 16.
const BOARD = [
  ["Male drivers, 75+", "👨", 25.25],
  ["Male drivers, 65–74", "👨", 24.67],
  ["Female drivers, 15–20", "👩", 22.74],
  ["Female drivers, 21–24", "👩", 19.6],
  ["Female drivers, 25–34", "👩", 15.86],
  ["Female drivers, 35–44", "👩", 12.38],
];
const sexItems = [
  ["Male drivers, 15–20", "👨", 58.73],
  ["Male drivers, 21–24", "👨", 53.41],
  ["Male drivers, 25–34", "👨", 45.71],
  ["Male drivers, 35–44", "👨", 39.31],
  ["Male drivers, 45–54", "👨", 35.51],
  ["Male drivers, 55–64", "👨", 31.32],
  ["Male drivers, 75+", "👨", 25.25],
  ["Male drivers, 65–74", "👨", 24.67],
  ["Female drivers, 15–20", "👩", 22.74],
  ["Female drivers, 21–24", "👩", 19.6],
  ["Female drivers, 25–34", "👩", 15.86],
  ["Female drivers, 35–44", "👩", 12.38],
  ["Female drivers, 45–54", "👩", 10.83],
  ["Female drivers, 75+", "👩", 10.07],
  ["Female drivers, 55–64", "👩", 9.34],
  ["Female drivers, 65–74", "👩", 7.94],
];
const raceItems = [
  ["American Indian or Alaska Native", "🚗", 33.5],
  ["Black", "🚗", 17.9],
  ["Hispanic", "🚗", 14.2],
  ["Native Hawaiian or Pacific Islander", "🚗", 13.4],
  ["White", "🚗", 12.3],
  ["Asian", "🚗", 4.5],
];

function item([name, emoji, value]) {
  return { name, emoji, value, year: "2022" };
}

const PUZZLES = [
  {
    type: "rank", id: "fatal-licensed-drivers", order: 274, emoji: "🚗",
    headline: "Per Licensed Driver",
    question: "Which drivers were in fatal crashes most often per licensed driver?",
    stat: "Drivers in fatal crashes per 100,000 licensed drivers",
    unit: "per 100,000 licensed drivers", higherIs: "top", valuesVisible: false,
    source: "NHTSA Traffic Safety Facts 2022, Table 62 (DOT HS 813 656). Drivers involved in fatal crashes per 100,000 licensed drivers, by age and sex. FHWA supplies the licensed-driver counts. Rates marked not published, under 15 and unknown sex, are left out.",
    sourceUrl: NHTSA,
    fact: SEX_FACT,
    art: "car", support: "", dataset: "nhtsa-fatal-licensed-2022",
    year: "2022", poolFrom: "2027-07-06",
    items: BOARD.map(item),
  },
  {
    type: "rank", id: "fatal-crash-deaths-race", order: 275, emoji: "🚗",
    headline: "Crash Deaths",
    question: "Which group had the highest motor vehicle crash death rate per 100,000 people?",
    stat: "Motor vehicle crash deaths per 100,000 people, age-adjusted",
    unit: "per 100,000 people", higherIs: "top", valuesVisible: false,
    source: "CDC special report, Shaw et al., Journal of Safety Research, racial and ethnic differences in motor vehicle crash deaths, United States, 2019–2022. National Vital Statistics System. Age-adjusted death rate per 100,000 people, 2022. All motor vehicle crash deaths, not drivers and not per licensed driver.",
    sourceUrl: CDC,
    fact: RACE_FACT,
    art: "car", support: "", dataset: "cdc-mvc-race-2022",
    year: "2022", poolFrom: "2027-07-07",
    items: raceItems.map(item),
  },
];

function groupDataset(p, rows) {
  return {
    id: p.dataset, title: p.headline, stat: p.stat, unit: p.unit,
    src: p.source, url: p.sourceUrl, year: p.year, hi: "top", dec: 2,
    emoji: "🚗", fact: p.fact, caveat: p.unit + ", 2022.",
    sens: 0, rows, kind: "groups", coverage: "full",
  };
}

function statRows(items, codes) {
  return items.map((it, i) => [codes[i], it[2], "2022"]);
}

const DATASETS = [
  groupDataset(PUZZLES[0], sexItems.map(r => [r[0], r[1], r[2], 0, 0, ""])),
  groupDataset(PUZZLES[1], raceItems.map(r => [r[0], r[1], r[2], 0, 0, ""])),
];
const STATS = [
  {
    id: "nhtsa-fatal-licensed-2022", sensitive: false, year: "2022",
    unit: "per 100,000 licensed drivers",
    stat: "Drivers in fatal crashes per 100,000 licensed drivers",
    source: PUZZLES[0].source, sourceUrl: NHTSA,
    rows: statRows(sexItems, ["M1520", "M2124", "M2534", "M3544", "M4554", "M5564", "M75P", "M6574", "F1520", "F2124", "F2534", "F3544", "F4554", "F75P", "F5564", "F6574"]),
  },
  {
    id: "cdc-mvc-race-2022", sensitive: false, year: "2022",
    unit: "per 100,000 people",
    stat: "Motor vehicle crash deaths per 100,000 people, age-adjusted",
    source: PUZZLES[1].source, sourceUrl: CDC,
    rows: statRows(raceItems, ["AIAN", "BLCK", "HISP", "NHPI", "WHIT", "ASAN"]),
  },
];

function spliceArrayFile(file, markerEnd, fresh, idOf) {
  let text = fs.readFileSync(file, "utf8");
  const add = fresh.filter(row => !text.includes('"id":"' + idOf(row) + '"'));
  if (!add.length) return;
  const end = text.lastIndexOf(markerEnd);
  if (end < 0) throw new Error("end missing " + file);
  text = text.slice(0, end) + "," + add.map(row => JSON.stringify(row)).join(",") + text.slice(end);
  fs.writeFileSync(file, text);
}

spliceArrayFile(path.join(root, "puzzles-data.js"), "];", PUZZLES, p => p.id);
spliceArrayFile(path.join(root, "number-stats.js"), "];", STATS, s => s.id);

const practiceFile = path.join(root, "practice-data.js");
let practice = fs.readFileSync(practiceFile, "utf8");
const freshDs = DATASETS.filter(d => !practice.includes('"id":"' + d.id + '"'));
if (freshDs.length) {
  const needle = '],"minTop5":';
  const at = practice.indexOf(needle);
  if (at < 0) throw new Error("practice insert point missing");
  practice = practice.slice(0, at) + "," + freshDs.map(d => JSON.stringify(d)).join(",") + practice.slice(at);
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
      ? [p.id, p.order, p.emoji, p.question, p.stat, p.unit, p.higherIs, "no", it.name, it.emoji, it.value, it.year, p.source, p.sourceUrl, p.fact, "", "", "", p.art, "", p.dataset, p.stat, p.headline]
      : [p.id, "", "", "", "", "", "", "", it.name, it.emoji, it.value, it.year, "", "", "", "", "", "", "", "", "", "", ""];
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
  return order.map((it, i) => ({ slot: i + 1, name: it.name, pct: Math.max(12, 48 - i * 3), emoji: it.emoji }));
}
for (const puzzle of PUZZLES) {
  const existing = doc.puzzles[puzzle.id];
  const have = existing && existing.firstGuessWorld && existing.firstGuessWorld.bars;
  if (have && have.length === puzzle.items.length) continue;
  const standing = seed.standingBlock(puzzle.id, 910, "rank", puzzle.items.length);
  if (standing.avgTries < 3.3 || standing.avgTries > 4.0) throw new Error(puzzle.id + " tries " + standing.avgTries);
  if (standing.avgAccuracy < 50 || standing.avgAccuracy > 72) throw new Error(puzzle.id + " acc " + standing.avgAccuracy);
  const per = {};
  puzzle.items.forEach((it, i) => { per[it.name] = Math.max(20, 58 - i * 3); });
  doc.puzzles[puzzle.id] = {
    type: "rank", seeded: true, players: standing.n, pctPerfect: 8,
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

const vm = require("vm");
function repairDailyBoard() {
  const file = path.join(root, "puzzles-data.js");
  const text = fs.readFileSync(file, "utf8");
  const box = { window: {} };
  vm.runInNewContext(text, box, { filename: "puzzles-data.js" });
  const puzzles = box.window.RANKD_PUZZLES;
  const puzzle = puzzles.find(row => row.id === "fatal-licensed-drivers");
  if (!puzzle) return;
  const next = BOARD.map(item);
  if (JSON.stringify(puzzle.items) === JSON.stringify(next)) return;
  puzzle.items = next;
  const comment = text.slice(0, text.indexOf("window.RANKD_PUZZLES"));
  fs.writeFileSync(file, comment + "window.RANKD_PUZZLES = " + JSON.stringify(puzzles) + ";\n");
}
function repairCsv() {
  const csvFile = path.join(root, "puzzles.csv");
  const lines = fs.readFileSync(csvFile, "utf8").split("\n").filter(line => line.split(",")[0] !== "fatal-licensed-drivers");
  const puzzle = PUZZLES[0];
  const fresh = [];
  puzzle.items.forEach((it, i) => {
    const head = i === 0
      ? [puzzle.id, puzzle.order, puzzle.emoji, puzzle.question, puzzle.stat, puzzle.unit, puzzle.higherIs, "no", it.name, it.emoji, it.value, it.year, puzzle.source, puzzle.sourceUrl, puzzle.fact, "", "", "", puzzle.art, "", puzzle.dataset, puzzle.stat, puzzle.headline]
      : [puzzle.id, "", "", "", "", "", "", "", it.name, it.emoji, it.value, it.year, "", "", "", "", "", "", "", "", "", "", ""];
    fresh.push(head.map(csvEscape).join(","));
  });
  const text = lines.filter(Boolean).join("\n") + "\n" + fresh.join("\n") + "\n";
  fs.writeFileSync(csvFile, text);
}
repairDailyBoard();
repairCsv();
fs.writeFileSync("/tmp/rankd-fatal-board.json", JSON.stringify(PUZZLES[0].items.map((it, i) => ({
  id: "fatal-licensed-drivers",
  cells: i === 0 ? [
    ["B", 274], ["C", "🚗"], ["D", PUZZLES[0].question], ["E", PUZZLES[0].stat],
    ["F", PUZZLES[0].unit], ["G", "top"], ["H", "no"], ["I", it.name], ["J", it.emoji],
    ["K", it.value], ["L", "2022"], ["M", PUZZLES[0].source], ["N", PUZZLES[0].sourceUrl],
    ["O", PUZZLES[0].fact], ["S", "car"], ["U", PUZZLES[0].dataset], ["W", PUZZLES[0].headline],
  ] : [
    ["I", it.name], ["J", it.emoji], ["K", it.value], ["L", "2022"],
  ],
}))));
const py = [
  "import json, re, zipfile",
  "from pathlib import Path",
  "xlsx = Path(" + JSON.stringify(path.join(root, "puzzles.xlsx")) + ")",
  "items = json.loads(Path('/tmp/rankd-fatal-board.json').read_text())",
  "def esc(s):",
  "    return ('' if s is None else str(s)).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')",
  "def cell(col, row, text):",
  "    if text is None or text == '':",
  "        return ''",
  "    return f'<c r=\"{col}{row}\" t=\"inlineStr\"><is><t>{esc(text)}</t></is></c>'",
  "def renumber(row, n):",
  "    row = re.sub(r'<row r=\"\\d+\"', f'<row r=\"{n}\"', row, count=1)",
  "    row = re.sub(r'r=\"([A-Z]+)\\d+\"', lambda m: 'r=\"' + m.group(1) + str(n) + '\"', row)",
  "    return row",
  "with zipfile.ZipFile(xlsx) as book:",
  "    stored = {info.filename: (info, book.read(info.filename)) for info in book.infolist()}",
  "xml = stored['xl/worksheets/sheet1.xml'][1].decode('utf-8')",
  "rows = re.findall(r'<row r=\"\\d+\".*?</row>', xml)",
  "kept = []",
  "for row in rows:",
  "    text = re.search(r'<c r=\"A\\d+\".*?<t>(.*?)</t>', row)",
  "    if text and text.group(1) == 'fatal-licensed-drivers':",
  "        continue",
  "    kept.append(row)",
  "insert_at = next((i for i, row in enumerate(kept) if '>fatal-crash-deaths-race<' in row), len(kept))",
  "out = []",
  "n = 1",
  "bi = 0",
  "for row in kept[:insert_at] + ['__BOARD__'] * len(items) + kept[insert_at:]:",
  "    if row == '__BOARD__':",
  "        item = items[bi]; bi += 1",
  "        parts = [cell('A', n, item['id'])] + [cell(col, n, val) for col, val in item['cells']]",
  "        out.append(f'<row r=\"{n}\">' + ''.join(parts) + '</row>')",
  "    else:",
  "        out.append(renumber(row, n))",
  "    n += 1",
  "body = ''.join(out)",
  "xml = re.sub(r'<sheetData>.*</sheetData>', '<sheetData>' + body + '</sheetData>', xml, count=1, flags=re.S)",
  "xml = re.sub(r'<dimension ref=\"([A-Z]+)1:[A-Z]+\\d+\"\\s*/>', lambda m: f'<dimension ref=\"{m.group(1)}1:W{n-1}\" />', xml, count=1)",
  "stored['xl/worksheets/sheet1.xml'] = (stored['xl/worksheets/sheet1.xml'][0], xml.encode('utf-8'))",
  "tmp = xlsx.with_suffix('.xlsx.tmp')",
  "with zipfile.ZipFile(tmp, 'w') as dest:",
  "    for name, (info, data) in stored.items():",
  "        dest.writestr(info, data)",
  "tmp.replace(xlsx)",
  "print('xlsx board rows', len(items), 'sheet rows', n - 1)",
].join("\n");
fs.writeFileSync("/tmp/rankd-fatal-xlsx.py", py);
require("child_process").execFileSync("python3", ["/tmp/rankd-fatal-xlsx.py"], { stdio: "inherit" });
console.log("fatal driver boards added");
