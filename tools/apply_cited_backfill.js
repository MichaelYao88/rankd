/* Replace short practice series with the full cited lists in series.json.
   Daily puzzle boards are not edited. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const series = JSON.parse(fs.readFileSync("/tmp/backfill/series.json", "utf8"));
const file = path.join(root, "practice-data.js");
const text = fs.readFileSync(file, "utf8");
const box = { window: {} };
vm.runInNewContext(text, box, { filename: "practice-data.js" });
const practice = box.window.RANKD_PRACTICE;
const before = {};

function same(a, b) {
  return Number(a) === Number(b);
}

for (const [id, rows] of Object.entries(series)) {
  if (id.startsWith("fao-")) continue;
  const ds = practice.datasets.find(d => d.id === id);
  if (!ds) throw new Error("missing dataset " + id);
  before[id] = ds.rows.length;
  const valueAt = ds.kind === "groups" ? 2 : 1;
  const by = new Map(rows.map(r => [r[0], r[valueAt]]));
  for (const row of ds.rows) {
    if (!by.has(row[0])) throw new Error(id + " lost " + row[0]);
    if (!same(by.get(row[0]), row[valueAt])) throw new Error(id + " changed " + row[0] + " " + row[valueAt] + " -> " + by.get(row[0]));
  }
  ds.rows = rows;
  ds.coverage = "full";
}

const meatMeta = {
  "fao-poultry-supply-2023": ["Poultry supply", "Poultry meat supply, kg per person per year", "🍗"],
  "fao-beef-supply-2023": ["Beef and buffalo supply", "Beef and buffalo meat supply, kg per person per year", "🥩"],
  "fao-sheep-supply-2023": ["Sheep and goat supply", "Sheep and goat meat supply, kg per person per year", "🐑"],
  "fao-pork-supply-2023": ["Pig meat supply", "Pig meat supply, kg per person per year", "🐖"],
  "fao-fish-supply-2023": ["Fish and seafood supply", "Fish and seafood supply, kg per person per year", "🐟"],
};
const cite = "Food and Agriculture Organization of the United Nations (2025), processed by Our World in Data. Food Balances, 2023. Kilograms per person per year available at the end of the supply chain, not what reaches the plate.";
for (const [id, rows] of Object.entries(series)) {
  if (!id.startsWith("fao-")) continue;
  if (practice.datasets.some(d => d.id === id)) {
    before[id] = practice.datasets.find(d => d.id === id).rows.length;
    continue;
  }
  before[id] = 0;
  const [title, stat, emoji] = meatMeta[id];
  practice.datasets.push({
    id, title, stat, unit: "kg per person per year",
    src: cite, url: "https://ourworldindata.org/grapher/per-capita-meat-type",
    year: "2023", hi: "top", dec: 2, emoji,
    fact: "FAO food available per person in 2023, via Our World in Data. ranki.gg",
    caveat: "Food available, not a weighed plate.",
    sens: 0, coverage: "full", rows,
  });
}

const comment = text.slice(0, text.indexOf("window.RANKD_PRACTICE"));
fs.writeFileSync(file, comment + "window.RANKD_PRACTICE = " + JSON.stringify(practice) + ";\n");

const statsFile = path.join(root, "number-stats.js");
let statsText = fs.readFileSync(statsFile, "utf8");
const stats = [];
const labels = {
  onions: ["Onions available per person", "kg per person per year", "2023", "UN FAO Food Balances via Our World in Data. Food available, kilograms per person per year, 2023.", "https://ourworldindata.org/explorers/global-food?Food=Onions&Metric=Food+available+for+consumption&Per+capita=true&Unit=Kilograms+per+year"],
  "height-girls-19": ["Mean height of 19-year-old girls", "cm", "2019", "NCD Risk Factor Collaboration (NCD-RisC), Lancet 2020;396:1511-24. Mean height at age 19 in 2019.", "https://www.ncdrisc.org/data-downloads-height.html"],
  "height-boys-19": ["Mean height of 19-year-old boys", "cm", "2019", "NCD Risk Factor Collaboration (NCD-RisC), Lancet 2020;396:1511-24. Mean height at age 19 in 2019.", "https://www.ncdrisc.org/data-downloads-height.html"],
  "pew-muslim-population-2020": ["Muslim population", "Muslims", "2020", "Pew Research Center religious composition, 2020, unrounded counts via Our World in Data.", "https://www.pewresearch.org/religion/2025/06/09/muslim-population-change/"],
  "cia-mean-elevation": ["Mean elevation", "m", "2026", "CIA World Factbook mean elevation, final public edition.", "https://www.cia.gov/the-world-factbook/field/elevation/"],
  "henley-passport-2026-04-13": ["Destinations with no visa in advance", "destinations", "2026", "Henley Passport Index, 13 April 2026 (IATA Timatic).", "https://cdn.henleyglobal.com/storage/app/media/HPI/Henley%20Passport%20Index%202026%20April%20Global%20Ranking.pdf"],
  "eiu-democracy-2024": ["Democracy Index overall score", "Democracy Index (0–10)", "2024", "EIU Democracy Index 2024.", "https://image.b.economist.com/lib/fe8d13727c61047f7c/m/1/609fbc8d-4724-440d-b827-2c7b7300353d.pdf"],
  "pew-us-favorable": ["Favorable opinion of the United States", "%", "2025", "Pew Research Center, Spring 2025 Global Attitudes Survey.", "https://www.pewresearch.org/global/2025/06/11/views-of-the-united-states/"],
  "space-first": ["Year of first citizen in space", "year", "", "Wikipedia: Timeline of space travel by nationality. Year of the country's first citizen to fly.", "https://en.wikipedia.org/wiki/Timeline_of_space_travel_by_nationality"],
  "newest-un-members": ["UN admission year", "year", "", "United Nations membership list, year of admission.", "https://www.un.org/en/about-us/growth-in-un-membership"],
};
for (const [id, rows] of Object.entries(series)) {
  const meta = labels[id] || (id.startsWith("fao-") ? [meatMeta[id][1], "kg per person per year", "2023", cite, "https://ourworldindata.org/grapher/per-capita-meat-type"] : null);
  if (!meta) continue;
  if (statsText.includes('"id":"' + id + '"')) continue;
  stats.push({
    id, sensitive: false, year: meta[2], unit: meta[1], stat: meta[0],
    source: meta[3], sourceUrl: meta[4], rows,
  });
}
if (stats.length) {
  const end = statsText.lastIndexOf("];");
  statsText = statsText.slice(0, end) + "," + stats.map(s => JSON.stringify(s)).join(",") + statsText.slice(end);
  fs.writeFileSync(statsFile, statsText);
}
console.log(before);
