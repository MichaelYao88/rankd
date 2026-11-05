/* Content edits for the director batch. Idempotent where it can be. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");

function load(file) {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), box, { filename: file });
  return box.window;
}

function writeAssignment(file, marker, value) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const at = text.indexOf(marker);
  if (at < 0) throw new Error("marker missing " + file);
  fs.writeFileSync(path.join(root, file), text.slice(0, at) + marker + JSON.stringify(value) + ";\n");
}

const practice = load("practice-data.js").RANKD_PRACTICE;
const C = practice.countries;
const byName = new Map(Object.entries(C).map(([iso, row]) => [row[0], iso]));
const puzzles = load("puzzles-data.js").RANKD_PUZZLES;
const names = load("name-puzzles.js").RANKD_NAME_PUZZLES;
const numberBox = load("number-puzzles.js");
const numbers = numberBox.RANKD_NUMBER;
const stats = load("number-stats.js").RANKD_NUMBER_STATS;
const NumberGuess = load("number-guess.js").RankdNumber;
const seed = require(path.join(root, "community-seed.js"));

function datasetRows(id) {
  const ds = practice.datasets.find(d => d.id === id);
  if (!ds) throw new Error("no dataset " + id);
  return ds.rows;
}
function place(iso, value, year) {
  return { iso3: iso, name: C[iso][0], emoji: C[iso][1], value, year: String(year || "") };
}
function board(rows, names, scope) {
  const items = names.map(name => {
    const iso = byName.get(name);
    const row = rows.find(r => r[0] === iso);
    if (!row) throw new Error("missing " + name);
    return {
      name, emoji: C[iso][1], value: row[1], year: String(row[2] || ""),
      gRank: 1 + rows.filter(r => Number(r[1]) > Number(row[1])).length,
      gTotal: rows.length, gScope: scope,
    };
  });
  for (let i = 1; i < items.length; i++) {
    if (!(items[i - 1].value > items[i].value)) throw new Error("order " + items.map(it => it.name + ":" + it.value).join(", "));
  }
  return items;
}

/* Height: NCD-RisC mean female height by birth year, latest year in the OWID file. */
const heightCsv = fs.readFileSync("/tmp/height-women.csv", "utf8").trim().split("\n");
const heightBest = new Map();
for (const line of heightCsv.slice(1)) {
  const bits = line.split(",");
  const iso = bits[1];
  const year = bits[2];
  if (!C[iso] || year !== "1996" || bits[3] === "") continue;
  heightBest.set(iso, Math.round(Number(bits[3]) * 10) / 10);
}
const heightRows = [...heightBest.entries()].map(([iso, value]) => [iso, value, "1996"]);
if (!practice.datasets.some(d => d.id === "ncd-height-women-1996")) {
  practice.datasets.push({
    id: "ncd-height-women-1996", title: "Between the Tall",
    stat: "Mean height of women born in 1996", unit: "cm",
    src: "NCD Risk Factor Collaboration via Our World in Data: mean female height by year of birth. The latest birth year in this file is 1996. This is not the five-country 2019 extract on Tall Girls.",
    url: "https://ourworldindata.org/grapher/average-height-of-women",
    year: "1996", hi: "top", dec: 1, emoji: "📏",
    fact: "Czechia, Croatia and Canada sit between the United States and the Netherlands.",
    caveat: "Birth cohort 1996. Gaps of a few tenths of a centimetre are inside the noise of a national mean.",
    sens: 0, coverage: "full", rows: heightRows,
  });
}
const usaH = heightBest.get("USA");
const nldH = heightBest.get("NLD");
const catalog = new Set(load("name-puzzles.js").RANKD_NAME_COUNTRIES.map(c => c.iso3));
const heightAnswers = [...heightBest.entries()]
  .filter(([iso, v]) => catalog.has(iso) && C[iso][0].startsWith("C") && v > usaH && v < nldH)
  .map(([iso, v]) => ({ iso3: iso, name: C[iso][0], emoji: C[iso][1], value: v }))
  .sort((a, b) => b.value - a.value);
if (heightAnswers.length < 2) throw new Error("height answers " + heightAnswers.map(c => c.name).join(","));
console.log("height answers", heightAnswers.map(c => c.name + " " + c.value).join(", "), "USA", usaH, "NLD", nldH);

/* Period: drop the three thinnest citations. */
const period = puzzles.find(p => p.id === "period-euphemism");
period.items = period.items.filter(it => !["POL", "TWN", "RUS"].includes(it.iso3));
period.fact = "China says the big aunt has come and the Netherlands says Aunt Rose is visiting, so those two are a relative at the door. Germany's week is strawberries and Sweden's is lingonberries. Denmark puts communists in the gazebo. Britain and Australia say the painters are in, because the blood looks like wet paint. Poland's ciotka is only a perhaps in the dictionary, Taiwan is a Wiktionary dialect line, and Russia's red army is a single magazine mention, so those three are off this board. English Aunt Flo is the same kind of visit, and it is the one aunt phrase left off.";
period.source = "Margot Vancauwenbergh and Karlien Franco, Women, blood, and dangerous things, Language and Cognition, 2023: Mandarin 大姨妈 'big aunt' and Dutch tante Rosa 'aunt Rose'. Wiktionary, Erdbeerwoche: colloquial for a menstrual period, literally strawberry week. Språktidningen, Sylt i plättvecket: Swedish lingonveckan is lingonberry week, and Danish kommunister i lysthuset is communists in the gazebo. Wiktionary, kommunister i lysthuset: Danish slang for menstruation, with citations from 1980, 1983 and 2016. Wiktionary, have the painters in: UK slang for menstruating. Green's Dictionary of Slang, painters: Australian citations for having the painters in. Poland, Taiwan and Russia were the thinner citations and are not on the board. English Aunt Flo is the phrase left off.";
const periodDs = practice.datasets.find(d => d.id === "period-euphemism");
periodDs.rows = period.items.map(it => [it.iso3, it.value]);
periodDs.fact = period.fact;
periodDs.src = period.source;

/* Remove puzzles. */
const dropIds = new Set(["gss-men-hire-women", "match-child-rape-penalties"]);
const kept = puzzles.filter(p => !dropIds.has(p.id));

/* Pakistan stays a statute, not a months average, on the sentence ranker. */
const abuse = kept.find(p => p.id === "nl-child-abuse-sentences");
if (!abuse.fact.includes("Pakistan")) {
  abuse.fact += " Pakistan is not a bar on this board: Penal Code s.376(3), added in 2016, punishes rape of a minor with death or imprisonment for life. That is the statute, not an average sentence in months.";
}

/* Rope bridge is not an invention. */
const older = kept.find(p => p.id === "who-invented-older");
older.questions = older.questions.filter(q => q.id !== "rope-bridge");
older.fact = older.fact.replace(" The suspension bridges still rebuilt in the Andes are Peruvian. China had iron-chain bridges long before those.", "");

/* Russian roulette wording. */
const words = kept.find(p => p.id === "who-invented-words");
const roulette = words.questions.find(q => q.id === "russian-roulette");
roulette.ask = "Where is Russian roulette from?";
roulette.prompt = "Where is Russian roulette from?";

/* University education, not the word tertiary, in player-facing lines. */
for (const p of kept) {
  if (!/tertiary/i.test(p.id + p.question + p.stat + (p.source || ""))) continue;
  p.question = p.question.replace("in tertiary education", "in university education");
  p.stat = p.stat.replace("tertiary education", "university education");
  p.source = p.source.replace("tertiary gender parity index", "university education gender parity index (the World Bank tertiary series)");
}
const tertDs = practice.datasets.find(d => d.id === "wb-tertiary-women-2024");
if (tertDs) {
  tertDs.stat = tertDs.stat.replace("tertiary education", "university education");
  tertDs.src = tertDs.src.replace("school enrollment, tertiary,", "school enrollment, university education (tertiary),");
}

/* Food supply stays the source. Player-facing titles say consumption. */
const FOOD = {
  "number-tea": ["tea consumption", "Tea and mate consumption", "Tea Consumption"],
  "number-coffee": ["coffee consumption", "Coffee consumption", "Coffee Consumption"],
  "number-cocoa": ["cocoa consumption", "Cocoa consumption", "Cocoa Consumption"],
  "number-garlic": ["garlic consumption", "Garlic consumption", "Garlic Consumption"],
};
for (const set of numbers) {
  const row = FOOD[set.id];
  if (!row) continue;
  set.noun = row[0];
  set.stat = row[1];
  set.headline = row[2];
  if (!/proxy for consumption/.test(set.source)) set.source += " The game uses this food-supply figure as a proxy for consumption.";
}
for (const stat of stats) {
  const row = FOOD[stat.id];
  if (!row) continue;
  stat.stat = row[1];
  if (!/proxy for consumption/.test(stat.source)) stat.source += " The game uses this food-supply figure as a proxy for consumption.";
}
for (const p of kept) {
  if (p.dataset === "wiki-meat-supply-2020" || p.dataset === "top-potatoes" || p.id === "match-meat-cuts") {
    if (p.stat) p.stat = p.stat.replace(/\bsupply\b/g, "consumption");
    if (p.question) p.question = p.question.replace(/\bsupply\b/g, "consumption");
    if (p.source && !/proxy for consumption/.test(p.source)) p.source += " Food supply is used here as a proxy for consumption.";
  }
}
for (const p of names) {
  if (p.id === "name-potato-b") {
    p.question = p.question.replace("potato supply", "potato consumption");
    p.stat = "Potato consumption";
    p.fact = p.fact.replace("This is food supply, not a count of what is eaten at the table.", "FAO calls this food supply. The game uses it as a proxy for consumption, not a count of what is eaten at the table.");
    if (p.source && !/proxy for consumption/.test(p.source)) p.source += " Food supply is used here as a proxy for consumption.";
  }
}

/* New rankers. */
const meatRows = datasetRows("wiki-meat-supply-2020");
const youthRows = datasetRows("wb-youth-unemp-2024");
const isapsRows = datasetRows("isaps-procedures-per-capita");
const popRows = datasetRows("top1-pop-2100");
function addRank(puzzle) {
  if (kept.some(p => p.id === puzzle.id)) return;
  kept.push(puzzle);
}
addRank({
  type: "rank", id: "meat-plates", order: 248, emoji: "🥩", headline: "Another Plate",
  question: "Meat consumption per person 🇫🇷🇹🇭",
  stat: "Meat consumption", unit: "kg/yr per person", higherIs: "top", valuesVisible: false,
  source: "Wikipedia compilation of FAO meat supply per person, 2020. Food supply is used here as a proxy for consumption, not what reaches the plate.",
  sourceUrl: "https://en.wikipedia.org/wiki/List_of_countries_by_meat_consumption",
  fact: "France is 83.1 kg per person and Thailand is 27.4. Italy and the United Kingdom sit with France, and Mexico is well under them. The figure is FAO meat supply, used as a proxy for consumption. It is not a count of meals.",
  art: "chart", support: "", dataset: "wiki-meat-supply-2020", year: "2020",
  items: board(meatRows, ["France", "Italy", "United Kingdom", "Netherlands", "Mexico", "Thailand"], "countries in the list"),
});
addRank({
  type: "rank", id: "youth-unemp-tourist", order: 250, emoji: "🧑", headline: "Holiday Queues",
  question: "Youth unemployment 🇫🇷🇯🇵",
  stat: "Youth unemployment", unit: "% of the labor force ages 15–24", higherIs: "top", valuesVisible: false,
  source: "World Bank / ILO, unemployment ages 15–24 (SL.UEM.1524.ZS), 2024.",
  sourceUrl: "https://data.worldbank.org/indicator/SL.UEM.1524.ZS",
  fact: "France is 18.6% and Japan is 3.9%, among countries people visit. The rate is unemployed young people divided by young people in the labor force. Students who are not looking for work are not in the denominator, so a holiday destination can still post a high rate.",
  art: "chart", support: "", dataset: "wb-youth-unemp-2024", year: "2024",
  items: board(youthRows, ["France", "United Kingdom", "Vietnam", "Mexico", "Thailand", "Japan"], "ILO countries"),
});
addRank({
  type: "rank", id: "isaps-procedures-b", order: 252, emoji: "💉", headline: "Another Clinic",
  question: "Aesthetic procedures per capita 🇹🇷🇬🇧",
  stat: "Aesthetic procedures per capita", unit: "per 1,000 people", higherIs: "top", valuesVisible: false,
  source: "ISAPS Global Survey 2023, total surgical and non-surgical procedures, divided by World Bank population for 2024. Only countries ISAPS published. South Korea has no row in that table.",
  sourceUrl: "https://www.isaps.org/media/rxnfqibn/isaps-global-survey_2023.pdf",
  fact: "Turkey has 14.05 aesthetic procedures per 1,000 people and the United Kingdom has 3.24. France, Italy and Spain sit with Turkey, not with Britain. ISAPS only publishes countries with enough survey responses, which is why South Korea is missing. Procedures done in a country are divided by its population, so visitors can raise the rate.",
  art: "chart", support: "", dataset: "isaps-procedures-per-capita", year: "2023", sensitive: true,
  items: board(isapsRows, ["Turkey", "Mexico", "France", "Italy", "Spain", "United Kingdom"], "ISAPS countries"),
});

/* Name its. */
const happy = datasetRows("owid-happiness");
const ukr = happy.find(r => r[0] === "UKR")[1];
const rus = happy.find(r => r[0] === "RUS")[1];
if (!(ukr < rus)) throw new Error("Ukraine is not below Russia");
const happyValues = {};
for (const row of happy) if (catalog.has(row[0])) happyValues[row[0]] = row[1];
const happyHits = Object.entries(happyValues)
  .filter(([iso, v]) => C[iso][0].startsWith("A") && v > ukr && v < rus)
  .map(([iso, v]) => ({ iso3: iso, name: C[iso][0], emoji: C[iso][1], value: v }))
  .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
if (happyHits.length < 2) throw new Error("happy answers " + happyHits.length);
console.log("happy answers", happyHits.map(c => c.name + " " + c.value).join(", "));

function addName(puzzle) {
  if (names.some(p => p.id === puzzle.id)) return;
  names.push(puzzle);
}
names.splice(0, names.length, ...names.filter(p => p.id !== "name-gini-s"));
addName({
  type: "name", id: "name-happy-window", order: 256, emoji: "😊", headline: "Between Two Scores",
  question: "Name a country starting with A that is happier than Ukraine and less happy than Russia.",
  stat: "Life satisfaction (Cantril ladder)", unit: "/10", year: "2025",
  source: "World Happiness Report 2025, Gallup Cantril ladder, via Our World in Data. A three-year average. North Korea is not in this report.",
  sourceUrl: "https://ourworldindata.org/grapher/happiness-cantril-ladder",
  fact: "Ukraine scores 4.66 and Russia scores 5.83, so Ukraine is the lower of the two. North Korea is not in the World Happiness Report, and a window above Russia and below Ukraine is empty. Algeria, Albania, Armenia and Azerbaijan sit strictly between Ukraine and Russia. The ladder is where people place their own life from 0 to 10. It is not income.",
  art: "sun", dataset: "owid-happiness",
  letter: { op: "starts", text: "A" }, letterFail: "doesn't start with A",
  statRule: { op: "between", format: "score", noun: "", lowIso: "UKR", highIso: "RUS", missing: "no life-satisfaction figure in this report" },
  values: happyValues,
  answers: happyHits.map(c => c.iso3),
  countries: happyHits,
  seedPick: happyHits[happyHits.length - 1].name, maxTries: 5,
  thresholdLabel: "Starts with A, strictly between Ukraine and Russia",
});
const heightValues = {};
for (const [iso, value] of heightBest) if (catalog.has(iso)) heightValues[iso] = value;
addName({
  type: "name", id: "name-height-c", order: 258, emoji: "📏", headline: "Between the Tall",
  question: "Name a country starting with C whose women are taller than women in the United States and shorter than women in the Netherlands.",
  stat: "Mean height of women born in 1996", unit: "cm", year: "1996",
  source: "NCD Risk Factor Collaboration via Our World in Data: mean female height by year of birth, birth year 1996. Not the five-country 2019 extract on Tall Girls, which has no Netherlands row.",
  sourceUrl: "https://ourworldindata.org/grapher/average-height-of-women",
  fact: "Women born in 1996 in Czechia, Croatia and Canada are taller than women in the United States (" + usaH + " cm) and shorter than women in the Netherlands (" + nldH + " cm). China starts with C and is shorter than the United States in this series. These are national means for one birth year, and the gaps are small.",
  art: "chart", dataset: "ncd-height-women-1996",
  letter: { op: "starts", text: "C" }, letterFail: "doesn't start with C",
  statRule: { op: "between", format: "cm", noun: "", lowIso: "USA", highIso: "NLD", missing: "no height figure in this series" },
  values: heightValues,
  answers: heightAnswers.map(c => c.iso3),
  countries: heightAnswers,
  seedPick: heightAnswers[heightAnswers.length - 1].name, maxTries: 5,
  thresholdLabel: "Starts with C, strictly between the United States and the Netherlands",
});

/* Guess the number. */
const fem = numbers.find(s => s.id === "number-femicide");
const hom = datasetRows("unodc-homicide-female");
function femPair(a, b, fact) {
  const ka = hom.find(r => r[0] === a);
  const kb = hom.find(r => r[0] === b);
  return { known: place(a, ka[1], ka[2]), ask: place(b, kb[1], kb[2]), fact };
}
fem.pairs = [
  femPair("SGP", "ZAF", "South Africa is 12.2 per 100,000 women in 2022 and Singapore is 0.07 in the same year. Both figures are the UNODC female homicide rate."),
  femPair("KOR", "USA", "The United States is 2.55 per 100,000 women in 2023 and South Korea is 0.46. Both figures are the UNODC female homicide rate."),
  femPair("USA", "IND", "India is 2.37 per 100,000 women in 2022 and the United States is 2.55 in 2023. The United States is a bit higher. Both figures are the UNODC female homicide rate."),
];
const trumpAt = numbers.findIndex(s => s.id === "number-trump");
if (trumpAt >= 0) numbers.splice(trumpAt, 1);
const statTrump = stats.findIndex(s => s.id === "number-trump");
if (statTrump >= 0) stats.splice(statTrump, 1);
if (!numbers.some(s => s.id === "number-pop2100")) {
  const popValues = popRows.map(r => Number(r[1])).filter(v => v > 0);
  const pair = (a, b, fact) => ({ known: place(a, popRows.find(r => r[0] === a)[1], "2100"), ask: place(b, popRows.find(r => r[0] === b)[1], "2100"), fact });
  const set = {
    id: "number-pop2100", sensitive: false, fillerDate: "2027-05-06", emoji: "👥", headline: "Pop 2100",
    stat: "Population in 2100", noun: "projected population", unit: "million people", unitSpoken: "million people",
    year: "2100", art: "chart", dataset: "top1-pop-2100",
    source: "UN World Population Prospects 2024, medium variant, population in 2100. The same series as the Most-Populous Top 1.",
    sourceUrl: "https://population.un.org/wpp/downloads",
    scoreFactor: NumberGuess.factorFromValues(popValues),
    pairs: [
      pair("CHN", "NGA", "Nigeria is 476.75 million in the UN medium variant for 2100 and China is 633.37 million. China is smaller than today and still larger than Nigeria in this variant. The figure is a projection, not a count."),
      pair("IND", "PAK", "Pakistan is 511 million in the UN medium variant for 2100 and India is 1,505.25 million. Pakistan grows, and India stays about three times larger. The figure is a projection, not a count."),
    ],
  };
  numbers.push(set);
  stats.push({
    id: "number-pop2100", sensitive: false, year: "2100", unit: "million people", stat: "Population in 2100",
    source: set.source, sourceUrl: set.sourceUrl,
    rows: popRows.map(r => [r[0], r[1], "2100"]),
  });
}

/* Seeds. */
const statsDoc = JSON.parse(fs.readFileSync(path.join(root, "community-stats.json"), "utf8"));
for (const id of ["gss-men-hire-women", "match-child-rape-penalties", "name-gini-s", "number-trump"]) delete statsDoc.puzzles[id];
function bars(items, shift) {
  return items.map((_, i) => items[(i + shift) % items.length]).map((it, i) => ({ slot: i + 1, name: it.name, pct: Math.max(18, 52 - i * 6), emoji: it.emoji }));
}
for (const puzzle of kept.filter(p => ["meat-plates", "youth-unemp-tourist", "isaps-procedures-b"].includes(p.id))) {
  if (statsDoc.puzzles[puzzle.id]) continue;
  const standing = seed.standingBlock(puzzle.id, 910, "rank", puzzle.items.length);
  const per = {};
  puzzle.items.forEach((it, i) => { per[it.name] = 58 - i * 4; });
  statsDoc.puzzles[puzzle.id] = {
    type: "rank", seeded: true, players: standing.n, pctPerfect: 12, perItemCorrect: per,
    firstGuessWorld: { players: 1, bars: bars(puzzle.items, 1) },
    firstGuessByCountry: {
      US: { players: 1, bars: bars(puzzle.items, 0) },
      TW: { players: 1, bars: bars(puzzle.items, 2) },
      SG: { players: 1, bars: bars(puzzle.items, 1) },
    },
    countryBoard: seed.countryBoard(puzzle.id, "rank"), standing,
  };
}
for (const puzzle of names.filter(p => p.id === "name-happy-window" || p.id === "name-height-c")) {
  if (statsDoc.puzzles[puzzle.id]) continue;
  const standing = seed.standingBlock(puzzle.id, 910, "name", 1);
  const pick = puzzle.countries.find(c => c.name === puzzle.seedPick);
  const bar = { name: puzzle.seedPick, pct: 100, emoji: pick.emoji };
  statsDoc.puzzles[puzzle.id] = {
    type: "name", seeded: true, players: standing.n, pctPerfect: 14,
    perItemCorrect: { [puzzle.seedPick]: 46 },
    firstGuessWorld: { players: 1, bars: [bar] },
    firstGuessByCountry: { US: { players: 1, bars: [bar] }, TW: { players: 1, bars: [bar] }, SG: { players: 1, bars: [bar] } },
    countryBoard: seed.countryBoard(puzzle.id, "name"), standing,
  };
}

writeAssignment("puzzles-data.js", "window.RANKD_PUZZLES = ", kept);
writeAssignment("name-puzzles.js", "window.RANKD_NAME_PUZZLES = ", names);
writeAssignment("number-puzzles.js", "window.RANKD_NUMBER = ", numbers);
writeAssignment("number-stats.js", "window.RANKD_NUMBER_STATS = ", stats);
writeAssignment("practice-data.js", "window.RANKD_PRACTICE = ", practice);
fs.writeFileSync(path.join(root, "community-stats.json"), JSON.stringify(statsDoc));

function stripCsv(file, ids) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return;
  const lines = fs.readFileSync(full, "utf8").split("\n");
  const next = lines.filter(line => !ids.some(id => line.startsWith(id + ",") || line.startsWith(id + "\r")));
  fs.writeFileSync(full, next.join("\n").replace(/\n+$/, "\n"));
}
for (const file of ["puzzles.csv", "match_puzzles.csv", "tier_puzzles.csv", "top5_puzzles.csv"]) stripCsv(file, [...dropIds]);

function appendRankCsv(puzzle) {
  const file = path.join(root, "puzzles.csv");
  let text = fs.readFileSync(file, "utf8");
  if (text.includes("\n" + puzzle.id + ",")) return;
  const fields = text.replace(/^\uFEFF/, "").split("\n")[0].split(",");
  const q = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = puzzle.items.map((it, n) => {
    const row = {
      puzzle_id: puzzle.id, daily_order: n === 0 ? puzzle.order : "", puzzle_emoji: n === 0 ? puzzle.emoji : "",
      question: n === 0 ? puzzle.question : "", stat_label: n === 0 ? puzzle.stat : "", unit: n === 0 ? puzzle.unit : "",
      higher_is: n === 0 ? "top" : "", values_visible: n === 0 ? "no" : "",
      item_name: it.name, item_emoji: it.emoji, value: it.value, data_year: it.year || "",
      source_name: n === 0 ? puzzle.source : "", source_url: n === 0 ? puzzle.sourceUrl : "",
      fun_fact: n === 0 ? puzzle.fact : "", global_rank: it.gRank || "", global_total: it.gTotal || "",
      global_scope: it.gScope || "", art: n === 0 ? "chart" : "", support_url: "",
      dataset: n === 0 ? puzzle.dataset : "", series_title: "", headline: n === 0 ? puzzle.headline : "",
    };
    return fields.map(f => q(row[f] == null ? "" : row[f])).join(",");
  });
  if (!text.endsWith("\n")) text += "\n";
  fs.writeFileSync(file, text + lines.join("\n") + "\n");
}
for (const id of ["meat-plates", "youth-unemp-tourist", "isaps-procedures-b"]) appendRankCsv(kept.find(p => p.id === id));

execFileSync("python3", ["-c", `
import json, re, zipfile
from pathlib import Path
xlsx = Path(${JSON.stringify(path.join(root, "puzzles.xlsx"))})
drop = ${JSON.stringify([...dropIds])}
with zipfile.ZipFile(xlsx) as book:
    stored = {info.filename: (info, book.read(info.filename)) for info in book.infolist()}
changed = False
for name, (info, data) in list(stored.items()):
    if not name.startswith("xl/worksheets/sheet"): continue
    xml = data.decode("utf-8")
    def repl(m):
        row = m.group(0)
        if any(">" + i + "<" in row for i in drop):
            return ""
        return row
    nxt = re.sub(r"<row r=\\"\\d+\\">.*?</row>", repl, xml, flags=re.S)
    if nxt != xml:
        stored[name] = (info, nxt.encode("utf-8"))
        changed = True
if changed:
    tmp = xlsx.with_suffix(".xlsx.tmp")
    with zipfile.ZipFile(tmp, "w") as dest:
        for name, (info, data) in stored.items():
            dest.writestr(info, data)
    tmp.replace(xlsx)
    print("xlsx dropped rows")
else:
    print("xlsx had no matching rows")
`]);

console.log("puzzles", kept.length, "names", names.length, "numbers", numbers.map(s => s.id).join(","));
