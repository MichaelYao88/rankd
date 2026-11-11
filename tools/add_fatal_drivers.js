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
    items: sexItems.map(item),
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
  if (doc.puzzles[puzzle.id]) continue;
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
console.log("fatal driver boards added");
