/* Add the May 2027 dailies and their practice datasets. Idempotent. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const englishPath = process.argv[2] || "/tmp/rankd-src/english.wikitext";

function load(file, marker) {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), box, { filename: file });
  return box.window;
}

const practiceText = fs.readFileSync(path.join(root, "practice-data.js"), "utf8");
const practice = JSON.parse(practiceText.slice(practiceText.indexOf("{")).replace(/;\s*$/, ""));
const C = practice.countries;
const byName = new Map(Object.entries(C).map(([iso, row]) => [row[0], iso]));
const aliases = {
  "Czech Republic": "Czechia",
  "Czechia": "Czechia",
  "Democratic Republic of the Congo": "Democratic Republic of Congo",
  "DR Congo": "Democratic Republic of Congo",
  "Republic of the Congo": "Congo",
  "Congo-Brazzaville": "Congo",
  "Ivory Coast": "Cote d'Ivoire",
  "Côte d'Ivoire": "Cote d'Ivoire",
  "East Timor": "East Timor",
  "Timor-Leste": "East Timor",
  "Myanmar": "Myanmar",
  "Burma": "Myanmar",
  "Turkey": "Turkey",
  "Türkiye": "Turkey",
  "Turkiye": "Turkey",
  "Russia": "Russia",
  "South Korea": "South Korea",
  "North Korea": "North Korea",
  "Cape Verde": "Cape Verde",
  "Cabo Verde": "Cape Verde",
  "Eswatini": "Eswatini",
  "Swaziland": "Eswatini",
  "Palestine": "Palestine",
  "State of Palestine": "Palestine",
  "Syria": "Syria",
  "Laos": "Laos",
  "Vietnam": "Vietnam",
  "Viet Nam": "Vietnam",
  "Brunei": "Brunei",
  "Brunei Darussalam": "Brunei",
  "Micronesia": "Micronesia (country)",
  "Federated States of Micronesia": "Micronesia (country)",
  "The Bahamas": "Bahamas",
  "Bahamas": "Bahamas",
  "The Gambia": "Gambia",
  "Gambia": "Gambia",
  "Hong Kong": "Hong Kong",
  "Macau": "Macao",
  "Macao": "Macao",
  "United States": "United States",
  "United Kingdom": "United Kingdom",
  "Republic of Ireland": "Ireland",
  "Slovak Republic": "Slovakia",
  "UAE": "United Arab Emirates",
  "United Arab Emirates": "United Arab Emirates",
  "U.S. Virgin Islands": "Virgin Islands",
  "US Virgin Islands": "Virgin Islands",
  "British Virgin Islands": "British Virgin Islands",
};
function isoOf(name) {
  if (byName.has(name)) return byName.get(name);
  const alt = aliases[name];
  if (alt && byName.has(alt)) return byName.get(alt);
  return null;
}
function emoji(iso) { return C[iso][1]; }
function country(iso) { return C[iso][0]; }
function round2(n) { return Math.round(n * 100) / 100; }

const pop = {};
for (const line of fs.readFileSync(path.join(root, "country_attributes.csv"), "utf8").trim().split("\n").slice(1)) {
  const cols = line.split(",");
  pop[cols[0]] = Number(cols[3]);
}

function rankPuzzle(p) {
  return Object.assign({
    type: "rank", higherIs: "top", valuesVisible: false, art: "chart", support: "",
  }, p);
}

const WIKI_BILLION = "https://en.wikipedia.org/wiki/List_of_cities_by_number_of_billionaires";
const billionaireRows = [
  ["New York City, United States", "🇺🇸", 123],
  ["Moscow, Russia", "🇷🇺", 90],
  ["Hong Kong", "🇭🇰", 72],
  ["London, United Kingdom", "🇬🇧", 71],
  ["Beijing, China", "🇨🇳", 68],
  ["Mumbai, India", "🇮🇳", 67],
  ["Singapore", "🇸🇬", 60],
  ["San Francisco, United States", "🇺🇸", 58],
  ["Shanghai, China", "🇨🇳", 58],
  ["Los Angeles, United States", "🇺🇸", 56],
];
function forbesRank(value, index) {
  return 1 + billionaireRows.filter((r, i) => r[2] > value || (r[2] === value && i < index)).length;
}
const billionaires = rankPuzzle({
  id: "billionaire-cities", order: 211, emoji: "💰", headline: "Billionaire Cities",
  question: "Cities with the most billionaires",
  stat: "Billionaires living in the city", unit: "billionaires",
  source: "Forbes, The Cities With The Most Billionaires 2025, via Wikipedia",
  sourceUrl: WIKI_BILLION,
  fact: "New York has 123 billionaires on the Forbes 2025 city list, and Moscow is second with 90, ahead of Hong Kong (72) and London (71). Beijing (68) is one ahead of Mumbai (67). San Francisco and Shanghai tie at 58, just outside this six.",
  dataset: "forbes-billionaire-cities", year: "2025",
  items: billionaireRows.slice(0, 6).map((r, i) => ({
    name: r[0], emoji: r[1], value: r[2], year: "2025",
    gRank: forbesRank(r[2], i), gTotal: 10, gScope: "Forbes 2025 cities",
  })),
});

const GRATTAN = "https://grattan.edu.au/report/a-better-bet-how-australia-should-prevent-gambling-harm/";
const gamblingItems = [
  ["AUS", 1635],
  ["HKG", 1284],
  ["USA", 809],
  ["NZL", 584],
].map(([iso, value], i) => ({
  name: country(iso), emoji: emoji(iso), value, year: "2022", iso3: iso,
  gRank: i + 1, gTotal: 4, gScope: "printed comparisons",
}));
const gambling = rankPuzzle({
  id: "gambling-losses", order: 212, emoji: "🎰", headline: "Bad Bets",
  question: "Gambling losses per adult",
  stat: "Annual gambling losses per adult", unit: "A$ per capita",
  source: "H2 Gambling Capital 2022, Australian dollars per adult. Australia, the United States and New Zealand are printed by the Grattan Institute. Hong Kong is printed by the Australia Institute, citing that report. The ABC's October 2024 piece is the Lancet Public Health Commission story and does not itself print this table.",
  sourceUrl: GRATTAN,
  fact: "Australia's adults lost A$1,635 each in 2022, the figure the Grattan Institute calls the world's highest, from H2 Gambling Capital. Hong Kong is the next number those reports print, at A$1,284, then the United States at A$809 and New Zealand at A$584. This is a per-capita loss, counted per adult. H2's full country chart is not public, so the board stops at the four comparisons those sources print.",
  dataset: "h2-gambling-losses-2022", year: "2022", sensitive: true,
  items: gamblingItems,
});

const WPR_PYR = "https://worldpopulationreview.com/country-rankings/pyramids-by-country";
const pyramidAll = [
  ["SDN", 255], ["EGY", 118], ["USA", 35], ["PER", 26], ["MEX", 20], ["BLZ", 10],
  ["GTM", 8], ["IRL", 8], ["HND", 3], ["BOL", 2], ["SLV", 2], ["CHN", 1],
  ["GBR", 1], ["FRA", 1], ["ITA", 1], ["PRK", 1], ["KHM", 1],
];
const pyramids = rankPuzzle({
  id: "pyramids", order: 214, emoji: "🔺", headline: "Not Just Giza",
  question: "Countries with the most pyramids",
  stat: "Pyramids in the country", unit: "pyramids",
  source: "World Population Review, pyramids by country, current compilation",
  sourceUrl: WPR_PYR,
  fact: "Sudan has 255 Nubian pyramids, more than twice Egypt's 118. They are smaller and later, and the cemeteries at Meroë alone are said to hold as many as 147. The United States is third at 35 only because this list counts modern cemetery pyramids, including one built as a future tomb for Nicolas Cage. An ancient-only list would put Peru (26) third.",
  dataset: "wpr-pyramids", year: "2026",
  items: pyramidAll.slice(0, 6).map(([iso, value], i) => ({
    name: country(iso), emoji: emoji(iso), value, year: "2026",
    gRank: i + 1, gTotal: pyramidAll.length, gScope: "listed countries",
  })),
});

const WPR_ELE = "https://worldpopulationreview.com/country-rankings/elephant-population-by-country";
const elephantRaw = JSON.parse(fs.readFileSync("/tmp/rankd-src/wpr-ele.data.json", "utf8"));
const elephantAll = elephantRaw.filter(r => r.cca3 && C[r.cca3] && !r.isTotal).map(r => ({
  iso: r.cca3,
  value: (r.ElephantPopulation || 0) + (r.AsianElephantPopulation || 0),
  year: String(r.ElephantPopulationYearOfEstimate || ""),
  african: r.ElephantPopulation || 0,
  asian: r.AsianElephantPopulation || 0,
})).filter(r => r.value > 0).sort((a, b) => b.value - a.value || a.iso.localeCompare(b.iso));
const elephants = rankPuzzle({
  id: "elephants", order: 215, emoji: "🐘", headline: "Heavy Herds",
  question: "Countries with the most elephants",
  stat: "African and Asian elephants combined", unit: "elephants",
  source: "World Population Review, elephant population by country. African and Asian counts are added.",
  sourceUrl: WPR_ELE,
  fact: "Botswana has 131,909 elephants. Gabon is second at 95,000, ahead of Kenya (36,280) and South Africa (31,324). India has the most Asian elephants, 27,312 in 2020, and still finishes seventh once the two counts are added. No country in this table is listed with both.",
  dataset: "wpr-elephants", year: "2016–2024",
  items: elephantAll.slice(0, 6).map((r, i) => ({
    name: country(r.iso), emoji: emoji(r.iso), value: r.value, year: r.year,
    gRank: i + 1, gTotal: elephantAll.length, gScope: "listed countries",
  })),
});

const caps = practice.datasets.find(d => d.id === "national-capitals");
const byLon = caps.rows.slice().sort((a, b) => a[2] - b[2]);
const westSix = byLon.slice(0, 6);
const western = rankPuzzle({
  id: "western-capitals", order: 216, emoji: "🌇", headline: "Far West",
  question: "Westernmost capitals of sovereign countries",
  stat: "Longitude of the capital", unit: "° longitude", higherIs: "bottom",
  source: "Wikidata coordinate location (P625), rounded to 0.01 degree. Longitude is degrees east from -180 to 180, with no wrap past the antimeridian. The capital is the one named in country_info.csv.",
  sourceUrl: "https://www.wikidata.org/wiki/Property:P625",
  fact: "Nukuʻalofa is the westernmost capital of a sovereign country on this scale, at -175.2°. Apia is next at -171.83°. Mexico City, at -99.14°, is still west of every other capital in the Americas. Longitude runs from -180 to 180 and does not wrap past the antimeridian, so Tonga and Samoa rank as far west here, not far east. Funafuti, at 179.12°, is the easternmost and is already the Far East daily.",
  art: "globe", dataset: "national-capitals", axis: "lon", year: "capital longitude",
  items: westSix.map((r, i) => ({
    name: country(r[0]), emoji: emoji(r[0]), value: r[2], year: r[3],
    gRank: i + 1, gTotal: caps.rows.length, gScope: "sovereign capitals",
  })),
});

const ITALIANS = "https://en.wikipedia.org/wiki/Italians";
/* Infobox counts marked as including ancestry. Ranges use the midpoint.
   Italy, San Marino and Vatican City are excluded. */
const italianCounts = [
  ["ARG", 25e6, "25 million"],
  ["URY", 1.54e6, "1.54 million"],
  ["PRY", 2.25e6, "2–2.5 million, midpoint"],
  ["BRA", 33e6, "32–34 million, midpoint"],
  ["FRA", 5.5e6, "5–6 million, midpoint"],
  ["VEN", 1.75e6, "1.5–2 million, midpoint"],
  ["PER", 2e6, "2 million"],
  ["USA", 19.5e6, "16–23 million, midpoint"],
  ["AUS", 1.1e6, "1.1 million"],
  ["COL", 2e6, "2 million"],
  ["CAN", 1.5e6, "1.5 million"],
];
const italianAll = italianCounts.map(([iso, count]) => ({
  iso, count, value: round2(100 * count / pop[iso]),
})).sort((a, b) => b.value - a.value);
const italians = rankPuzzle({
  id: "italian-descent", order: 217, emoji: "🍝", headline: "Beyond Rome",
  question: "Italian descent per capita, outside Italy",
  stat: "People of Italian descent per capita", unit: "% per capita",
  source: "Wikipedia infobox on Italians, ancestry estimates, divided by World Bank population for 2024. Italy, San Marino and Vatican City are excluded. A published range uses its midpoint.",
  sourceUrl: ITALIANS,
  fact: "Argentina has about 25 million people of Italian descent, 54.71 per 100 of its 2024 population, ahead of Uruguay at 45.47. Brazil has more Italian descendants in total, about 33 million, and still ranks fourth per capita at 15.57. Paraguay's 2–2.5 million and Brazil's 32–34 million keep this order at either end of the range. The United States, at 16–23 million, does not pass France. These are ancestry estimates, not a census of Italian citizens.",
  dataset: "italian-descent-per-capita", year: "2024",
  items: italianAll.slice(0, 5).map((r, i) => ({
    name: country(r.iso), emoji: emoji(r.iso), value: r.value, year: "2024",
    gRank: i + 1, gTotal: italianAll.length, gScope: "ancestry rows",
  })),
});

function parseEnglish(file) {
  const text = fs.readFileSync(file, "utf8");
  const start = text.indexOf('{| class="wikitable sortable');
  const end = text.indexOf("\n|}", start);
  const lines = text.slice(start, end).split("\n");
  const rows = [];
  const num = s => {
    const m = String(s || "").replace(/\{\{[^}]*\}\}/g, "").replace(/,/g, "").trim().match(/^([0-9]+(?:\.[0-9]+)?)/);
    return m ? Number(m[1]) : null;
  };
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("{{flag|")) continue;
    const countryName = lines[i].match(/\{\{flag\|([^}|]+)/)[1].trim();
    let cells;
    if (lines[i].includes("||")) cells = lines[i].split("||").slice(1);
    else if (lines[i + 1] && lines[i + 1].includes("||")) cells = lines[++i].replace(/^\|/, "").split("||");
    else continue;
    let totalCell = cells[1];
    if (totalCell == null || String(totalCell).trim() === "") totalCell = cells[2];
    const total = num(totalCell);
    if (total == null) continue;
    rows.push([countryName, total]);
  }
  return rows;
}
const englishParsed = parseEnglish(englishPath);
const englishSeen = new Set();
const englishAll = [];
const englishSkipped = [];
for (const [name, total] of englishParsed) {
  const iso = isoOf(name);
  if (!iso) { englishSkipped.push(name); continue; }
  if (englishSeen.has(iso)) { englishSkipped.push(name + " duplicate"); continue; }
  englishSeen.add(iso);
  englishAll.push({ iso, name: country(iso), total });
}
englishAll.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
const englishBoard = englishAll.filter(r => r.iso !== "USA").slice(0, 5);
const english = rankPuzzle({
  id: "english-speakers", order: 218, emoji: "🗣️", headline: "Not Just the UK",
  question: "English speakers, leaving out the United States",
  stat: "People who speak English", unit: "English speakers",
  source: "Wikipedia, List of countries by English-speaking population, total English speakers column",
  sourceUrl: "https://en.wikipedia.org/wiki/List_of_countries_by_English-speaking_population",
  fact: "India has 269.8 million English speakers on this list, just behind the United States at 299.3 million, which is left off. Nigeria (125.0 million) has more than Pakistan (108.0 million). Indonesia (86.0 million) has more than the Philippines (70.1 million) and the United Kingdom (63.7 million), so the UK does not make this five. The counts are people who say they speak English, and the census years differ.",
  dataset: "english-speakers", year: "mixed",
  items: englishBoard.map(r => ({
    name: r.name, emoji: emoji(r.iso), value: r.total, year: "",
    gRank: 1 + englishAll.filter(x => x.total > r.total).length,
    gTotal: englishAll.length, gScope: "listed countries",
  })),
});

const ISAPS = "https://www.isaps.org/media/rxnfqibn/isaps-global-survey_2023.pdf";
/* ISAPS Global Survey, procedures performed in 2023. Total procedures
   (surgical + non-surgical) from the country columns on pages 40–41.
   South Korea has no row. Per 1,000 uses World Bank population, 2024. */
const isapsTotals = {
  ARG: 1210216, BGD: 21928, BEL: 223412, BRA: 3381551, COL: 447268, FRA: 883700,
  DEU: 1244466, GRC: 194856, IND: 1028723, IRN: 407653, ITA: 757442, MYS: 23923,
  MEX: 1714952, PER: 416588, ROU: 269173, ZAF: 85869, ESP: 528608, SYR: 153040,
  THA: 172840, TUR: 1201139, GBR: 224523, USA: 6196701, VEN: 362283,
};
const plasticAll = Object.entries(isapsTotals).map(([iso, total]) => ({
  iso, total, value: round2(total / pop[iso] * 1000),
})).sort((a, b) => b.value - a.value);
const plastic = rankPuzzle({
  id: "plastic-surgery", order: 219, emoji: "💉", headline: "New Faces",
  question: "Aesthetic procedures per capita",
  stat: "ISAPS aesthetic procedures per capita", unit: "per 1,000 per capita",
  source: "ISAPS Global Survey, procedures performed in 2023, total surgical and non-surgical procedures, divided by World Bank population for 2024. Countries are only those ISAPS published.",
  sourceUrl: ISAPS,
  fact: "Argentina has 26.48 aesthetic procedures per 1,000 people: 1,210,216 ISAPS procedures in 2023, divided by its 2024 population. Belgium (18.84) is just ahead of Greece (18.73). South Korea is the usual guess and has no row in the ISAPS 2023 country table, which only publishes places with enough survey responses. A list that puts South Korea at 8.90 per 1,000 is not an ISAPS country figure.",
  dataset: "isaps-procedures-per-capita", year: "2023", sensitive: true,
  items: plasticAll.slice(0, 6).map((r, i) => ({
    name: country(r.iso), emoji: emoji(r.iso), value: r.value, year: "2023",
    gRank: i + 1, gTotal: plasticAll.length, gScope: "ISAPS countries",
  })),
});

const ranks = [billionaires, gambling, pyramids, elephants, western, italians, english, plastic];

function dataset(spec) {
  const values = spec.rows.map(r => spec.kind === "groups" ? r[2] : r[1]);
  let dec = 0;
  for (const v of values) {
    const s = String(v);
    const i = s.indexOf(".");
    if (i >= 0) dec = Math.max(dec, s.length - i - 1);
  }
  const ds = {
    id: spec.id, title: spec.title, stat: spec.stat, unit: spec.unit,
    src: spec.src, url: spec.url, year: spec.year, hi: spec.hi || "top",
    dec, emoji: spec.emoji, fact: spec.fact, caveat: spec.caveat || "",
    sens: spec.sens ? 1 : 0, coverage: spec.coverage, rows: spec.rows,
  };
  if (spec.kind) ds.kind = spec.kind;
  return ds;
}

const datasets = [
  dataset({
    id: "forbes-billionaire-cities", title: "Billionaire Cities",
    stat: "Billionaires living in the city", unit: "billionaires",
    src: billionaires.source, url: WIKI_BILLION, year: "2025", emoji: "💰",
    fact: billionaires.fact, coverage: "full", kind: "groups",
    rows: billionaireRows.map((r, i) => [r[0], r[1], r[2], forbesRank(r[2], i), 10, "Forbes 2025 cities"]),
  }),
  dataset({
    id: "h2-gambling-losses-2022", title: "Bad Bets",
    stat: "Annual gambling losses per adult", unit: "A$ per capita",
    src: gambling.source, url: GRATTAN, year: "2022", emoji: "🎰",
    fact: gambling.fact,
    caveat: "H2's full country chart is not public. These four figures are the 2022 Australian-dollar comparisons printed by the Grattan Institute and, for Hong Kong, the Australia Institute citing that report. The rate is per adult.",
    sens: 1, coverage: "partial",
    rows: gamblingItems.map(it => [it.iso3, it.value]),
  }),
  dataset({
    id: "wpr-pyramids", title: "Not Just Giza",
    stat: "Pyramids in the country", unit: "pyramids",
    src: pyramids.source, url: WPR_PYR, year: "2026", emoji: "🔺",
    fact: pyramids.fact, coverage: "full",
    rows: pyramidAll.map(([iso, value]) => [iso, value]),
  }),
  dataset({
    id: "wpr-elephants", title: "Heavy Herds",
    stat: "African and Asian elephants combined", unit: "elephants",
    src: elephants.source, url: WPR_ELE, year: "2016–2024", emoji: "🐘",
    fact: elephants.fact, coverage: "full",
    rows: elephantAll.map(r => [r.iso, r.value, r.year]),
  }),
  dataset({
    id: "italian-descent-per-capita", title: "Beyond Rome",
    stat: "People of Italian descent per capita", unit: "% per capita",
    src: italians.source, url: ITALIANS, year: "2024", emoji: "🍝",
    fact: italians.fact,
    caveat: "Ancestry estimates from the Wikipedia infobox, divided by 2024 population. Ranges use the midpoint. Italy, San Marino and Vatican City are excluded. Some other infobox rows are registered Italian citizens rather than ancestry and are not in this list.",
    coverage: "full",
    rows: italianAll.map(r => [r.iso, r.value]),
  }),
  dataset({
    id: "english-speakers", title: "Not Just the UK",
    stat: "People who speak English", unit: "English speakers",
    src: english.source, url: english.sourceUrl, year: "mixed", emoji: "🗣️",
    fact: english.fact,
    caveat: "Total English speakers as published. Years and definitions differ by country. Fiji has no total in the table and is left out. People who say they speak English were not tested.",
    coverage: "full",
    rows: englishAll.map(r => [r.iso, r.total]),
  }),
  dataset({
    id: "isaps-procedures-per-capita", title: "New Faces",
    stat: "ISAPS aesthetic procedures per capita", unit: "per 1,000 per capita",
    src: plastic.source, url: ISAPS, year: "2023", emoji: "💉",
    fact: plastic.fact,
    caveat: "ISAPS 2023 total procedures divided by 2024 population, per 1,000 people. South Korea is not in the published country table. The Insider Monkey ranking is not used.",
    sens: 1, coverage: "full",
    rows: plasticAll.map(r => [r.iso, r.value]),
  }),
];

function spliceArray(file, marker, objects) {
  const full = path.join(root, file);
  let text = fs.readFileSync(full, "utf8");
  if (objects.some(o => text.includes('"id":"' + o.id + '"'))) {
    console.log("skip splice", file, "already present");
    return;
  }
  const idx = text.indexOf(marker);
  const end = text.indexOf("];", idx);
  const blob = objects.map(o => JSON.stringify(o)).join(",");
  const prefix = text[end - 1] === "[" ? "" : ",";
  text = text.slice(0, end) + prefix + blob + text.slice(end);
  fs.writeFileSync(full, text);
}

function appendRankCsv(puzzles) {
  const file = path.join(root, "puzzles.csv");
  const header = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split("\n")[0];
  const fields = header.split(",");
  const lines = [];
  const q = v => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  for (const p of puzzles) {
    if (fs.readFileSync(file, "utf8").includes("\n" + p.id + ",")) continue;
    p.items.forEach((it, n) => {
      const row = {
        puzzle_id: p.id,
        daily_order: n === 0 ? p.order : "",
        puzzle_emoji: n === 0 ? p.emoji : "",
        question: n === 0 ? p.question : "",
        stat_label: n === 0 ? p.stat : "",
        unit: n === 0 ? p.unit : "",
        higher_is: n === 0 ? p.higherIs : "",
        values_visible: n === 0 ? "no" : "",
        item_name: it.name,
        item_emoji: it.emoji,
        value: it.value,
        data_year: it.year || "",
        source_name: n === 0 ? p.source : "",
        source_url: n === 0 ? p.sourceUrl : "",
        fun_fact: n === 0 ? p.fact : "",
        global_rank: it.gRank || "",
        global_total: it.gTotal || "",
        global_scope: it.gScope || "",
        art: n === 0 ? (p.art || "") : "",
        support_url: "",
        dataset: n === 0 ? (p.dataset || "") : "",
        series_title: "",
        headline: n === 0 ? p.headline : "",
      };
      lines.push(fields.map(f => q(row[f])).join(","));
    });
  }
  if (!lines.length) return;
  let text = fs.readFileSync(file, "utf8");
  if (!text.endsWith("\n")) text += "\n";
  fs.writeFileSync(file, text + lines.join("\n") + "\n");
}

function insertDatasets() {
  const present = new Set(practice.datasets.map(d => d.id));
  const fresh = datasets.filter(d => !present.has(d.id));
  if (!fresh.length) { console.log("datasets already present"); return; }
  const needle = '],"minTop5":';
  const at = practiceText.indexOf(needle);
  if (at < 0) throw new Error("practice insert point missing");
  const blob = fresh.map(d => JSON.stringify(d)).join(",");
  const next = practiceText.slice(0, at) + "," + blob + practiceText.slice(at);
  fs.writeFileSync(path.join(root, "practice-data.js"), next);
}

/* Name it: exactly Ireland, Libya, Saint Lucia, among countries starting with I, L or S. */
const nameBox = load("name-puzzles.js");
const tree = practice.datasets.find(d => d.id === "name-tree-country");
const nameValues = {};
for (const row of tree.rows) nameValues[row[0]] = 0;
for (const iso of ["IRL", "LBY", "LCA"]) {
  if (!(iso in nameValues)) throw new Error("missing " + iso);
  nameValues[iso] = 1;
}
const nameCountries = nameBox.RANKD_NAME_COUNTRIES;
const byIso = Object.fromEntries(nameCountries.map(c => [c.iso3, c]));
const nameAnswers = ["IRL", "LBY", "LCA"];
const named = {
  type: "name", id: "name-named-for-her", emoji: "👸", headline: "Named for Her",
  question: "Name a country starting with I, L, or S that is named after a woman or a goddess.",
  stat: "Country name comes from a woman or a goddess", unit: "", year: "",
  source: "Ériu (Ireland), Libya in Greek myth, and Saint Lucy (Saint Lucia)",
  sourceUrl: "https://en.wikipedia.org/wiki/%C3%89riu",
  fact: "Ireland is named for Ériu, a sovereignty goddess in Irish myth. Libya is the Greek name of a mythological queen. Saint Lucia is Saint Lucy of Syracuse; the island was named for her feast day. Italy starts with I and is the land of young cattle, not a woman. Liberia is liberty. Georgia is usually Saint George or a Persian name, and it does not start with I, L or S.",
  art: "sun", threshold: 0, thresholdLabel: "Named after a woman or a goddess",
  letter: { any: [{ op: "starts", text: "I" }, { op: "starts", text: "L" }, { op: "starts", text: "S" }] },
  letterFail: "doesn't start with I, L, or S",
  statRule: {
    op: "gt", format: "label", noun: "",
    labels: { "1": "named after a woman or a goddess", "0": "not named after a woman or a goddess" },
    below: "", above: "", missing: "not in this set",
  },
  values: nameValues,
  answers: nameAnswers,
  countries: nameAnswers.map(iso => ({ iso3: iso, name: byIso[iso].name, emoji: byIso[iso].emoji, value: 1 })),
  seedPick: "Saint Lucia", maxTries: 5,
};

function appendNameCsv(p) {
  const file = path.join(root, "name_puzzles.csv");
  if (fs.readFileSync(file, "utf8").includes("\n" + p.id + ",")) return;
  const q = v => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = p.countries.map(c => [p.id, p.headline, p.question, p.threshold, p.thresholdLabel, p.year, p.source, p.sourceUrl, p.seedPick, c.iso3, c.name, c.value, p.statRule.labels[String(c.value)]].map(q).join(","));
  let text = fs.readFileSync(file, "utf8");
  if (!text.endsWith("\n")) text += "\n";
  fs.writeFileSync(file, text + lines.join("\n") + "\n");
}

const nameDs = dataset({
  id: "name-named-for-her", title: "Named for Her",
  stat: "Country name comes from a woman or a goddess", unit: "",
  src: named.source, url: named.sourceUrl, year: "", emoji: "👸",
  fact: named.fact, coverage: "full",
  rows: tree.rows.map(r => [r[0], nameValues[r[0]] || 0]),
});
datasets.push(nameDs);

console.log("--- boards ---");
for (const p of ranks) {
  console.log(p.order, p.id, p.headline, p.sensitive ? "SENS" : "", p.items.map(it => it.name + "=" + it.value + (it.year ? "@" + it.year : "")).join(" | "));
}
console.log("english skipped", englishSkipped.join("; "));
console.log("english n", englishAll.length, "top", englishAll.slice(0, 8).map(r => r.name + " " + r.total).join(", "));
console.log("elephants", elephantAll.length, "top", elephantAll.slice(0, 8).map(r => country(r.iso) + " " + r.value).join(", "));
console.log("plastic", plasticAll.map(r => country(r.iso) + " " + r.value).join(", "));
console.log("west", westSix.map(r => country(r[0]) + " " + r[2] + " " + r[3]).join(" | "));

spliceArray("puzzles-data.js", "RANKD_PUZZLES = ", ranks);
appendRankCsv(ranks);
spliceArray("name-puzzles.js", "RANKD_NAME_PUZZLES = ", [named]);
appendNameCsv(named);
insertDatasets();
console.log("wrote", ranks.map(p => p.id).join(", "), named.id);
