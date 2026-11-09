/* Upcoming rankers and Name it puzzles. Values come from the series already
   in practice-data.js, plus World Bank and WHO files fetched while building.
   Idempotent. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

function load(file) {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), box, { filename: file });
  return box.window;
}

const practice = load("practice-data.js").RANKD_PRACTICE;
const C = practice.countries;
const byName = new Map(Object.entries(C).map(([iso, row]) => [row[0], iso]));
byName.set("Macau", byName.get("Macao"));

function latestWb(file) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const best = new Map();
  for (const row of data[1]) {
    if (row.value == null) continue;
    const iso = String(row.countryiso3code || "");
    if (!C[iso]) continue;
    const year = String(row.date);
    const cur = best.get(iso);
    if (!cur || year > cur[2]) best.set(iso, [iso, Number(row.value), year]);
  }
  return [...best.values()];
}

function owidLatest(file, key, minYear) {
  const text = fs.readFileSync(file, "utf8").trim().split("\n");
  const head = text[0].split(",");
  const col = head.indexOf(key);
  const best = new Map();
  for (const line of text.slice(1)) {
    const bits = line.split(",");
    const iso = bits[1];
    const year = bits[2];
    if (!C[iso] || !year || Number(year) < minYear || bits[col] === "") continue;
    const cur = best.get(iso);
    if (!cur || year > cur[2]) best.set(iso, [iso, Number(bits[col]), year]);
  }
  return [...best.values()];
}

const gdpRows = latestWb("/tmp/wb/NY.GDP.PCAP.CD.json").map(r => [r[0], Math.round(r[1]), r[2]]);
const youthRows = latestWb("/tmp/wb/SL.UEM.1524.ZS.json").map(r => [r[0], Math.round(r[1] * 10) / 10, r[2]]);
const tertRows = latestWb("/tmp/wb/SE.ENR.TERT.FM.ZS.json").map(r => [r[0], Math.round(r[1] * 100), r[2]]);
const giniRows = latestWb("/tmp/wb/SI.POV.GINI.json").map(r => [r[0], Math.round(r[1] * 10) / 10, r[2]]);
const suicideRows = owidLatest("/tmp/owid-suicide.csv", "Death rate from self-harm among both sexes", 2021)
  .map(r => [r[0], Math.round(r[1] * 10) / 10, r[2]]);

function rowMap(rows) {
  return new Map(rows.map(r => [r[0], r]));
}
const gdp = rowMap(gdpRows);
const youth = rowMap(youthRows);
const tert = rowMap(tertRows);
const gini = rowMap(giniRows);
const suicide = rowMap(suicideRows);

function must(map, iso) {
  const row = map.get(iso);
  if (!row) throw new Error("missing " + iso);
  return row;
}

/* Claims Michael asked for, checked before any board is built. */
const mng = must(tert, "MNG"), usaT = must(tert, "USA");
if (!(mng[1] > usaT[1])) throw new Error("Mongolia is not above the USA: " + mng[1] + " vs " + usaT[1]);
for (const iso of ["QAT", "BHR", "OMN"]) {
  const row = must(tert, iso);
  if (!(row[1] > usaT[1])) throw new Error(iso + " does not beat the USA");
}
const uae = must(tert, "ARE"), sau = must(tert, "SAU");
if (uae[1] > usaT[1] || sau[1] > usaT[1]) throw new Error("UAE or Saudi now beats the USA; rewrite the fact");
const zafY = must(youth, "ZAF"), dji = must(youth, "DJI");
if (!(dji[1] > zafY[1])) throw new Error("South Africa is no longer behind Djibouti");
const youthRank = 1 + youthRows.filter(r => r[1] > zafY[1]).length;
if (youthRank !== 2) throw new Error("South Africa youth rank " + youthRank);

function dataset(spec, rows) {
  return {
    id: spec.id, title: spec.title, stat: spec.stat, unit: spec.unit,
    src: spec.src, url: spec.url, year: spec.year, hi: "top",
    dec: spec.dec, emoji: spec.emoji, fact: spec.fact, caveat: spec.caveat || "",
    sens: spec.sens ? 1 : 0, coverage: "full", rows,
  };
}

const DATASETS = [
  dataset({
    id: "wb-gdp-pcap-2024", title: "On Paper", stat: "GDP per capita", unit: "current US$ per person",
    src: "World Bank, GDP per capita, current US$ (NY.GDP.PCAP.CD). Latest country year, mostly 2024.",
    url: "https://data.worldbank.org/indicator/NY.GDP.PCAP.CD", year: "2024", dec: 0, emoji: "💵",
    fact: "Ireland's figure is above the United States because GDP counts profits booked by foreign companies. The Irish statistics office publishes a modified GNI for that reason.",
  }, gdpRows),
  dataset({
    id: "wb-youth-unemp-2024", title: "Long Queue", stat: "Youth unemployment", unit: "% of the labor force ages 15–24",
    src: "World Bank, ILO estimate, unemployment of people aged 15–24 (SL.UEM.1524.ZS), 2024 for almost every country.",
    url: "https://data.worldbank.org/indicator/SL.UEM.1524.ZS", year: "2024", dec: 1, emoji: "🧑",
    fact: "South Africa is second in this series. Djibouti is higher. The rate is among young people in the labor force, not among all young people.",
  }, youthRows),
  dataset({
    id: "wb-tertiary-women-2024", title: "Women Enrolled", stat: "Women per 100 men in tertiary education", unit: "women per 100 men",
    src: "World Bank, school enrollment, tertiary, gender parity index (SE.ENR.TERT.FM.ZS). Stored as women per 100 men, the index times 100, rounded. Gross enrollment, so one person can be counted more than once. Years differ.",
    url: "https://data.worldbank.org/indicator/SE.ENR.TERT.FM.ZS", year: "2024", dec: 0, emoji: "🎓",
    fact: "Qatar, Bahrain and Oman are above the United States. The UAE and Saudi Arabia are not. Mongolia is above the United States.",
  }, tertRows),
  dataset({
    id: "wb-gini-latest", title: "Survey Gini", stat: "Gini index", unit: "Gini index (0–100)",
    src: "World Bank, Gini index (SI.POV.GINI), latest survey from 2018 to 2024. This is a household survey, not a wealth Gini. Some countries measure income and some measure consumption, so ranks are not one scale.",
    url: "https://data.worldbank.org/indicator/SI.POV.GINI", year: "2024", dec: 1, emoji: "📏",
    fact: "A higher Gini is more unequal. This is not the UBS wealth Gini.",
  }, giniRows),
  dataset({
    id: "who-ghe-suicide-2021", title: "Self-harm deaths", stat: "Suicide death rate", unit: "deaths per 100,000 people",
    src: "WHO Global Health Estimates 2024 via Our World in Data: all-ages death rate from self-harm, both sexes, 2021. Modelled, including adjustments for underreporting. Not the age-standardized series used by the older suicide ranker.",
    url: "https://ourworldindata.org/grapher/suicide-rate", year: "2021", dec: 1, emoji: "🕯️", sens: 1,
    fact: "Lesotho is above the United States. Latvia is not.",
    caveat: "Modelled all-ages rates. Suicide deaths are underreported.",
  }, suicideRows),
];

function existingRows(id) {
  const ds = practice.datasets.find(d => d.id === id);
  if (!ds) throw new Error("dataset " + id);
  return ds.rows.map(r => [r[0], r[1], r[2] || ""]);
}

function board(rows, names, scope) {
  const items = names.map(name => {
    const iso = byName.get(name);
    if (!iso) throw new Error("no iso " + name);
    const row = rows.find(r => r[0] === iso);
    if (!row) throw new Error("no row " + name);
    return {
      name, emoji: C[iso][1], value: row[1], year: String(row[2] || ""),
      gRank: 1 + rows.filter(r => r[1] > row[1]).length,
      gTotal: rows.length, gScope: scope,
    };
  });
  for (let i = 1; i < items.length; i++) {
    if (!(items[i - 1].value > items[i].value)) throw new Error("order " + items.map(it => it.name + ":" + it.value).join(", "));
  }
  return items;
}

const happy = existingRows("owid-happiness");
const fert = existingRows("wb-fertility");
const teen = existingRows("wb-teen-births");
const wealth = existingRows("wid-wealth-top1");

const PUZZLES = [
  {
    id: "wealth-top1-sa", order: 233, emoji: "💰", headline: "Richest Slice",
    question: "Wealth share of the richest 1% 🇿🇦🇳🇱",
    stat: "Wealth share of the richest 1%", unit: "% of private wealth",
    source: "World Inequality Database (WID.world) via Our World in Data",
    sourceUrl: "https://ourworldindata.org/grapher/wealth-share-richest?quantile=richest_1pct",
    fact: "South Africa's richest 1% hold 54.91% of private wealth, the top of this 213-country series, and the Netherlands is last at 13.98%. WID uses equal-split adults and net personal wealth for 2024. This is not an income share. Some country-years are modeled.",
    dataset: "wid-wealth-top1", year: "2024",
    items: board(wealth, ["South Africa", "Mexico", "Brazil", "Turkey", "Sweden", "Netherlands"], "WID countries"),
  },
  {
    id: "happiness-kosovo", order: 234, emoji: "😊", headline: "Above America",
    question: "Life satisfaction 🇽🇰🇺🇸",
    stat: "Life satisfaction (Cantril ladder)", unit: "/10",
    source: "World Happiness Report 2025, Gallup Cantril ladder, via Our World in Data. A three-year average.",
    sourceUrl: "https://ourworldindata.org/grapher/happiness-cantril-ladder",
    fact: "Kosovo scores 6.91 and the United States 6.82. Poland, at 6.77, is above the United Kingdom at 6.69. The ladder asks people to place their life from 0 to 10. It is not a measure of income.",
    dataset: "owid-happiness", year: "2025",
    items: board(happy, ["Kosovo", "United States", "Poland", "United Kingdom", "Spain", "Japan"], "WHR countries"),
  },
  {
    id: "gdp-ireland", order: 235, emoji: "💵", headline: "On Paper",
    question: "GDP per capita 🇮🇪🇺🇸",
    stat: "GDP per capita", unit: "current US$ per person",
    source: "World Bank, GDP per capita, current US$ (NY.GDP.PCAP.CD), 2024.",
    sourceUrl: "https://data.worldbank.org/indicator/NY.GDP.PCAP.CD",
    fact: "Ireland is $112,895 per person and the United States is $86,170. Ireland's Central Statistics Office publishes a modified GNI because GDP counts profits that foreign companies book in Ireland, so the figure overstates household income. These are current US dollars, not what a paycheck buys.",
    dataset: "wb-gdp-pcap-2024", year: "2024",
    items: board(gdpRows, ["Ireland", "Norway", "United States", "United Kingdom", "South Korea", "China"], "countries with a figure"),
  },
  {
    id: "youth-unemp-sa", order: 236, emoji: "🧑", headline: "Long Queue",
    question: "Youth unemployment 🇿🇦🇺🇸",
    stat: "Youth unemployment", unit: "% of the labor force ages 15–24",
    source: "World Bank / ILO, unemployment ages 15–24 (SL.UEM.1524.ZS), 2024.",
    sourceUrl: "https://data.worldbank.org/indicator/SL.UEM.1524.ZS",
    fact: "South Africa is 60.2%, second in this series to Djibouti at 76.5%, and far above the United States at 8.9% and Germany at 6.6%. The rate counts young people who are in the labor force and out of work. Students who are not looking for a job are not in the denominator.",
    dataset: "wb-youth-unemp-2024", year: "2024",
    items: board(youthRows, ["South Africa", "Spain", "Sweden", "France", "United States", "Germany"], "ILO countries"),
  },
  {
    id: "tertiary-gulf", order: 237, emoji: "🎓", headline: "Women Enrolled",
    question: "Women per 100 men in tertiary education 🇶🇦🇺🇸",
    stat: "Women enrolled per 100 men", unit: "women per 100 men",
    source: "World Bank, tertiary gender parity index (SE.ENR.TERT.FM.ZS), shown as women per 100 men. Gross enrollment. Years differ.",
    sourceUrl: "https://data.worldbank.org/indicator/SE.ENR.TERT.FM.ZS",
    fact: "Qatar has 164 women enrolled per 100 men, and Bahrain and Oman are also above the United States at 132. Tunisia rounds to 145, the same as Oman, so it is not a separate step here. This is not the whole Gulf: the UAE is 122 and Saudi Arabia is 101, both at or below the United States. The index is gross enrollment, so one person can be counted more than once, and it is not a count of women in the population. The US figure is 2022; Qatar, Bahrain and Oman are 2024.",
    dataset: "wb-tertiary-women-2024", year: "2024",
    items: board(tertRows, ["Qatar", "Bahrain", "Oman", "United States", "United Kingdom", "Germany"], "countries with a figure"),
  },
  {
    id: "fertility-rich", order: 238, emoji: "👶", headline: "Small Families",
    question: "Fertility rate 🇮🇱🇰🇷",
    stat: "Total fertility rate", unit: "births per woman",
    source: "World Bank / UN Population Division, total fertility rate (SP.DYN.TFRT.IN), 2024.",
    sourceUrl: "https://data.worldbank.org/indicator/SP.DYN.TFRT.IN",
    fact: "Israel is 2.87 births per woman, the only country in this high-income set above 2. South Korea is 0.75. The figure is the UN estimate of lifetime births per woman, not the number of babies born this year.",
    dataset: "wb-fertility", year: "2024",
    items: board(fert, ["Israel", "United States", "France", "United Kingdom", "Germany", "Italy", "Spain", "South Korea"], "countries with a figure"),
  },
  {
    id: "teen-births-rich", order: 239, emoji: "🍼", headline: "Young Mothers",
    question: "Teen birth rate 🇺🇸🇰🇷",
    stat: "Adolescent birth rate", unit: "births per 1,000 women aged 15–19",
    source: "World Bank / UN Population Division, adolescent fertility rate (SP.ADO.TFRT), 2024.",
    sourceUrl: "https://data.worldbank.org/indicator/SP.ADO.TFRT",
    fact: "The United States is 12.4 births per 1,000 women aged 15–19, above the United Kingdom at 7.8, France at 3.3 and South Korea at 0.5. The rate counts births, not the share of teenagers who are mothers.",
    dataset: "wb-teen-births", year: "2024",
    items: board(teen, ["United States", "United Kingdom", "Australia", "France", "Sweden", "South Korea"], "countries with a figure"),
  },
  {
    id: "wealth-top1-gulf", order: 240, emoji: "💰", headline: "Private Shares",
    question: "Wealth share of the richest 1% 🇶🇦🇮🇹",
    stat: "Wealth share of the richest 1%", unit: "% of private wealth",
    source: "World Inequality Database (WID.world) via Our World in Data",
    sourceUrl: "https://ourworldindata.org/grapher/wealth-share-richest?quantile=richest_1pct",
    fact: "Qatar's richest 1% hold 37.72% of private wealth, above Switzerland at 31.48% and Italy at 22.03%. WID uses equal-split adults and net personal wealth for 2024. This is not income, and some country-years are modeled.",
    dataset: "wid-wealth-top1", year: "2024",
    items: board(wealth, ["Qatar", "Switzerland", "Saudi Arabia", "France", "Japan", "Italy"], "WID countries"),
  },
  {
    id: "happiness-taiwan", order: 241, emoji: "😊", headline: "Eastern Scores",
    question: "Life satisfaction 🇹🇼🇰🇷",
    stat: "Life satisfaction (Cantril ladder)", unit: "/10",
    source: "World Happiness Report 2025, Gallup Cantril ladder, via Our World in Data. A three-year average.",
    sourceUrl: "https://ourworldindata.org/grapher/happiness-cantril-ladder",
    fact: "Taiwan scores 6.71 and Lithuania 6.70, both above Italy at 6.57 and South Korea at 6.04. Brazil, at 6.63, is also above Italy. The ladder is where people place their own life from 0 to 10, averaged over three Gallup years. It is not income.",
    dataset: "owid-happiness", year: "2025",
    items: board(happy, ["Taiwan", "Lithuania", "Brazil", "Italy", "South Korea", "India"], "WHR countries"),
  },
  {
    id: "gdp-singapore", order: 242, emoji: "💵", headline: "Dollar a Head",
    question: "GDP per capita 🇸🇬🇲🇽",
    stat: "GDP per capita", unit: "current US$ per person",
    source: "World Bank, GDP per capita, current US$ (NY.GDP.PCAP.CD), 2024.",
    sourceUrl: "https://data.worldbank.org/indicator/NY.GDP.PCAP.CD",
    fact: "Singapore is $94,897 per person, above the United States at $86,170. Mexico is $13,988, about a sixth of the US figure. These are current US dollars per person, not what a paycheck buys.",
    dataset: "wb-gdp-pcap-2024", year: "2024",
    items: board(gdpRows, ["Singapore", "United States", "Germany", "South Korea", "Poland", "Mexico"], "countries with a figure"),
  },
  {
    id: "youth-unemp-eswatini", order: 243, emoji: "🧑", headline: "Still Unemployed",
    question: "Youth unemployment 🇸🇿🇮🇹",
    stat: "Youth unemployment", unit: "% of the labor force ages 15–24",
    source: "World Bank / ILO, unemployment ages 15–24 (SL.UEM.1524.ZS), 2024.",
    sourceUrl: "https://data.worldbank.org/indicator/SL.UEM.1524.ZS",
    fact: "Eswatini is 54.4% and Botswana is 45.3%, both above Jordan at 39.1% and Italy at 20.2%. The United States is 8.9%. This is ILO unemployment among people aged 15–24 who are in the labor force, not among every young person. South Africa, at 60.2%, is higher than everyone on this board and is on the other youth board.",
    dataset: "wb-youth-unemp-2024", year: "2024",
    items: board(youthRows, ["Eswatini", "Botswana", "Jordan", "Italy", "United States", "Germany"], "ILO countries"),
  },
  {
    id: "tertiary-mongolia", order: 244, emoji: "🎓", headline: "Mongolia's Ratio",
    question: "Women per 100 men in tertiary education 🇲🇳🇺🇸",
    stat: "Women enrolled per 100 men", unit: "women per 100 men",
    source: "World Bank, tertiary gender parity index (SE.ENR.TERT.FM.ZS), shown as women per 100 men. Gross enrollment. Years differ.",
    sourceUrl: "https://data.worldbank.org/indicator/SE.ENR.TERT.FM.ZS",
    fact: "Mongolia has 141 women enrolled per 100 men in 2024, above the United States at 132 in 2022 and just above Sweden at 140 in 2024. Japan is 97 and South Korea is 89, so both have more men enrolled than women. Gross enrollment can count one person more than once. It is not a count of women in the population.",
    dataset: "wb-tertiary-women-2024", year: "2024",
    items: board(tertRows, ["Mongolia", "Sweden", "United States", "France", "Japan", "South Korea"], "countries with a figure"),
  },
  {
    id: "teen-births-middle", order: 245, emoji: "🍼", headline: "Earlier Starts",
    question: "Teen birth rate 🇧🇷🇨🇱",
    stat: "Adolescent birth rate", unit: "births per 1,000 women aged 15–19",
    source: "World Bank / UN Population Division, adolescent fertility rate (SP.ADO.TFRT), 2024.",
    sourceUrl: "https://data.worldbank.org/indicator/SP.ADO.TFRT",
    fact: "Brazil is 41.5 births per 1,000 women aged 15–19 and Chile is 5.6, under the United States at 12.4. Argentina, Uruguay and Costa Rica all sit in the mid-20s. The rate counts births, not the share of teenagers who are mothers.",
    dataset: "wb-teen-births", year: "2024",
    items: board(teen, ["Brazil", "Argentina", "Uruguay", "Costa Rica", "United States", "Chile"], "countries with a figure"),
  },
  {
    id: "wealth-top1-low", order: 246, emoji: "💰", headline: "Low Slice",
    question: "Wealth share of the richest 1% 🇨🇦🇬🇧",
    stat: "Wealth share of the richest 1%", unit: "% of private wealth",
    source: "World Inequality Database (WID.world) via Our World in Data",
    sourceUrl: "https://ourworldindata.org/grapher/wealth-share-richest?quantile=richest_1pct",
    fact: "Canada's richest 1% hold 28.58% of private wealth, a hair above Nigeria at 28.01%, and the United Kingdom is down at 21.3%, just under Indonesia at 21.32%. Finland is 17.98%. WID uses equal-split adults and net personal wealth for 2024. This is not income.",
    dataset: "wid-wealth-top1", year: "2024",
    items: board(wealth, ["Canada", "Nigeria", "Australia", "Indonesia", "United Kingdom", "Finland"], "WID countries"),
  },
];

for (const puzzle of PUZZLES) {
  puzzle.type = "rank";
  puzzle.higherIs = "top";
  puzzle.valuesVisible = false;
  puzzle.art = "chart";
  puzzle.support = "";
}
const usedNames = new Map();
for (const puzzle of PUZZLES) {
  const key = puzzle.dataset;
  const names = puzzle.items.map(it => it.name).sort().join("|");
  if (!usedNames.has(key)) usedNames.set(key, []);
  for (const prev of usedNames.get(key)) {
    if (prev === names) throw new Error("same set " + puzzle.id);
  }
  usedNames.get(key).push(names);
  if (puzzle.items.length < 6) throw new Error("short board " + puzzle.id);
}

function nameValues(rows) {
  const catalog = new Set(load("name-puzzles.js").RANKD_NAME_COUNTRIES.map(c => c.iso3));
  const values = {};
  for (const row of rows) if (catalog.has(row[0])) values[row[0]] = row[1];
  return values;
}
function answersFor(values, letter, pred) {
  const names = load("name-puzzles.js").RANKD_NAME_COUNTRIES;
  const hits = [];
  for (const c of names) {
    if (!letter(c.name)) continue;
    if (!Object.prototype.hasOwnProperty.call(values, c.iso3)) continue;
    if (!pred(c.iso3, values[c.iso3])) continue;
    hits.push(c);
  }
  hits.sort((a, b) => values[b.iso3] - values[a.iso3]);
  return hits;
}

const obesity = existingRows("owid-obesity");
const potatoes = existingRows("top-potatoes");
const usaOb = obesity.find(r => r[0] === "USA")[1];
const usaPot = potatoes.find(r => r[0] === "USA")[1];
const usaGini = must(gini, "USA")[1];
const usaSu = must(suicide, "USA")[1];
const gbrGdp = must(gdp, "GBR")[1];

const obAnswers = answersFor(nameValues(obesity), n => n.startsWith("N"), (iso, v) => v > usaOb);
const potAnswers = answersFor(nameValues(potatoes), n => n.startsWith("B"), (iso, v) => v > usaPot);
const giniAnswers = answersFor(nameValues(giniRows), n => /^[BCS]/.test(n), (iso, v) => v > usaGini);
const suAnswers = answersFor(nameValues(suicideRows), n => n.startsWith("L"), (iso, v) => v > usaSu);
const gdpAnswers = answersFor(nameValues(gdpRows), n => n.startsWith("I"), (iso, v) => v > gbrGdp);
for (const [label, hits] of [["obesity", obAnswers], ["potatoes", potAnswers], ["gini", giniAnswers], ["suicide", suAnswers], ["gdp", gdpAnswers]]) {
  if (hits.length < 2 || hits.length > 12) throw new Error(label + " answers " + hits.map(c => c.name + ":" + c.iso3).join(", "));
  console.log(label, hits.map(c => c.name).join(", "));
}

function namePuzzle(spec, rows, hits) {
  const values = nameValues(rows);
  return {
    type: "name", id: spec.id, emoji: spec.emoji, headline: spec.headline,
    question: spec.question, stat: spec.stat, unit: spec.unit, year: spec.year,
    source: spec.source, sourceUrl: spec.sourceUrl, fact: spec.fact, art: spec.art || "chart",
    dataset: spec.dataset, sensitive: spec.sensitive || undefined, support: spec.support || "",
    threshold: spec.threshold, thresholdLabel: spec.thresholdLabel,
    letter: spec.letter, letterFail: spec.letterFail,
    statRule: spec.statRule, values,
    answers: hits.map(c => c.iso3),
    countries: hits.map(c => ({ iso3: c.iso3, name: c.name, emoji: c.emoji, value: values[c.iso3] })),
    seedPick: hits[hits.length - 1].name, maxTries: 5,
  };
}

const NAME_ORDERS = {
  "name-obesity-n": 247,
  "name-potato-b": 249,
  "name-gini-s": 251,
  "name-suicide-l": 253,
  "name-gdp-i": 255,
};
const NAMES = [
  namePuzzle({
    id: "name-obesity-n", emoji: "⚖️", headline: "Heavier Than America",
    question: "Name a country starting with N where a larger share of adults have obesity than in the United States.",
    stat: "Adult obesity", unit: "% of adults", year: "2022",
    source: "WHO / NCD-RisC via Our World in Data. Adults with BMI at or above 30, crude estimate.",
    sourceUrl: "https://ourworldindata.org/grapher/share-of-adults-defined-as-obese",
    fact: "Nauru is 71.4% and Niue is 66.2%, both above the United States at 41.8%. New Zealand starts with N and misses at 34.7%. This is the share of adults with a BMI of 30 or more, not average weight.",
    dataset: "owid-obesity", threshold: usaOb,
    thresholdLabel: "Above the United States (" + usaOb + "%)",
    letter: { op: "starts", text: "N" }, letterFail: "doesn't start with N",
    statRule: { op: "gt", format: "percent", noun: "", below: "not above the United States (" + usaOb + "%)", above: "above the United States (" + usaOb + "%)", missing: "no obesity figure in this dataset" },
  }, obesity, obAnswers),
  namePuzzle({
    id: "name-potato-b", emoji: "🥔", headline: "More Spuds",
    question: "Name a country starting with B with a higher potato supply per person than the United States.",
    stat: "Potato supply", unit: "kg per person per year", year: "2022",
    source: "UN FAO Food Balances via Our World in Data. Food available for consumption, kilograms per person per year.",
    sourceUrl: "https://ourworldindata.org/explorers/global-food?Food=Potatoes&Metric=Food+available+for+consumption&Per+capita=true&Unit=Kilograms+per+year",
    fact: "Belarus is 166.9 kg per person per year, about three times the United States at 55.4. Bosnia and Herzegovina, Belgium and Bolivia also clear the US figure. This is food supply, not a count of what is eaten at the table. Ireland is higher than the US too, and it does not start with B.",
    dataset: "top-potatoes", threshold: usaPot,
    thresholdLabel: "Above the United States (" + usaPot + " kg per person per year)",
    letter: { op: "starts", text: "B" }, letterFail: "doesn't start with B",
    statRule: { op: "gt", format: "kg", noun: "", below: "not above the United States (" + usaPot + " kg)", above: "above the United States (" + usaPot + " kg)", missing: "no potato figure in this dataset" },
  }, potatoes, potAnswers),
  namePuzzle({
    id: "name-gini-s", emoji: "📏", headline: "Less Equal",
    question: "Name a country starting with B, C, or S with a higher Gini index than the United States.",
    stat: "Gini index", unit: "Gini index (0–100)", year: "2018–2024",
    source: "World Bank, Gini index (SI.POV.GINI). Latest household survey from 2018 to 2024. Not a wealth Gini. Some surveys measure income and some measure consumption.",
    sourceUrl: "https://data.worldbank.org/indicator/SI.POV.GINI",
    fact: "Colombia and South Africa are both above the United States at " + usaGini + ". Sweden starts with S and is " + must(gini, "SWE")[1] + ", so it misses. A country starting with S alone is not enough: only South Africa clears the United States. This is the World Bank household-survey Gini, not a wealth Gini, and some surveys measure income while others measure consumption.",
    dataset: "wb-gini-latest", threshold: usaGini,
    thresholdLabel: "Above the United States (" + usaGini + ")",
    letter: { any: [{ op: "starts", text: "B" }, { op: "starts", text: "C" }, { op: "starts", text: "S" }] }, letterFail: "doesn't start with B, C, or S",
    statRule: { op: "gt", format: "gini", noun: "Gini", below: "not above the United States (" + usaGini + ")", above: "above the United States (" + usaGini + ")", missing: "no Gini figure in this dataset" },
  }, giniRows, giniAnswers),
  namePuzzle({
    id: "name-suicide-l", emoji: "🕯️", headline: "Higher Than America",
    question: "Name a country starting with L with a higher suicide death rate than the United States.",
    stat: "Suicide death rate", unit: "deaths per 100,000 people", year: "2021",
    source: "WHO Global Health Estimates 2024 via Our World in Data. All-ages death rate from self-harm, both sexes, 2021. Modelled.",
    sourceUrl: "https://ourworldindata.org/grapher/suicide-rate",
    fact: "Lesotho is above the United States. Lithuania is too. Latvia starts with L and does not clear the US figure. These are WHO all-ages modelled rates for 2021, including an adjustment for underreporting. They are not the age-standardized rates on the older suicide ranker.",
    dataset: "who-ghe-suicide-2021", sensitive: true, support: "https://findahelpline.com/",
    threshold: usaSu, thresholdLabel: "Above the United States (" + usaSu + " per 100,000)",
    letter: { op: "starts", text: "L" }, letterFail: "doesn't start with L",
    statRule: { op: "gt", format: "rate", noun: "", below: "not above the United States (" + usaSu + " per 100,000)", above: "above the United States (" + usaSu + " per 100,000)", missing: "no suicide figure in this dataset" },
  }, suicideRows, suAnswers),
  namePuzzle({
    id: "name-gdp-i", emoji: "💵", headline: "Richer on Paper",
    question: "Name a country starting with I with a higher GDP per person than the United Kingdom.",
    stat: "GDP per capita", unit: "current US$ per person", year: "2024",
    source: "World Bank, GDP per capita, current US$ (NY.GDP.PCAP.CD). Mostly 2024.",
    sourceUrl: "https://data.worldbank.org/indicator/NY.GDP.PCAP.CD",
    fact: "Ireland, the Isle of Man, Iceland and Israel are above the United Kingdom. Italy starts with I and is under it, at about $40,430. The Isle of Man figure is 2023 and the others are 2024. The number is current US dollars per person, not what a paycheck buys. Ireland is high because GDP counts profits foreign companies book there; Ireland's statistics office publishes a modified GNI because of that.",
    dataset: "wb-gdp-pcap-2024", threshold: gbrGdp,
    thresholdLabel: "Above the United Kingdom ($" + gbrGdp.toLocaleString("en-US") + " per person)",
    letter: { op: "starts", text: "I" }, letterFail: "doesn't start with I",
    statRule: { op: "gt", format: "usd", noun: "", below: "not above the United Kingdom", above: "above the United Kingdom", missing: "no GDP figure in this dataset" },
  }, gdpRows, gdpAnswers),
];

function spliceDatasets() {
  const file = path.join(root, "practice-data.js");
  let text = fs.readFileSync(file, "utf8");
  const fresh = DATASETS.filter(d => !text.includes('"id":"' + d.id + '"'));
  if (!fresh.length) { console.log("datasets already present"); return; }
  const needle = '],"minTop5":';
  const at = text.indexOf(needle);
  if (at < 0) throw new Error("practice insert point missing");
  text = text.slice(0, at) + "," + fresh.map(d => JSON.stringify(d)).join(",") + text.slice(at);
  fs.writeFileSync(file, text);
}

function splicePuzzles() {
  const file = path.join(root, "puzzles-data.js");
  let text = fs.readFileSync(file, "utf8");
  const fresh = PUZZLES.filter(p => !text.includes('"id":"' + p.id + '"'));
  if (!fresh.length) { console.log("puzzles already present"); return; }
  const end = text.lastIndexOf("];");
  text = text.slice(0, end) + "," + fresh.map(p => JSON.stringify(p)).join(",") + text.slice(end);
  fs.writeFileSync(file, text);
}

function spliceNames() {
  const file = path.join(root, "name-puzzles.js");
  let text = fs.readFileSync(file, "utf8");
  const fresh = NAMES.filter(p => !text.includes('"id":"' + p.id + '"'));
  if (!fresh.length) { console.log("names already present"); return; }
  const end = text.lastIndexOf("];");
  text = text.slice(0, end) + "," + fresh.map(p => JSON.stringify(p)).join(",") + text.slice(end);
  fs.writeFileSync(file, text);
}

function addFormats() {
  const file = path.join(root, "name-it.js");
  let text = fs.readFileSync(file, "utf8");
  if (text.includes('fmt === "usd"')) return;
  text = text.replace(
    'if (fmt === "percent") return roundTo(n, 1).toFixed(1) + "%";',
    'if (fmt === "percent") return roundTo(n, 1).toFixed(1) + "%";\n    if (fmt === "kg") return roundTo(n, 1).toFixed(1) + " kg per person per year";\n    if (fmt === "usd") return "$" + Math.round(n).toLocaleString("en-US");\n    if (fmt === "gini") return roundTo(n, 1).toFixed(1);'
  );
  fs.writeFileSync(file, text);
}

function addSeeds() {
  const seed = require(path.join(root, "community-seed.js"));
  const file = path.join(root, "community-stats.json");
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
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
    puzzle.items.forEach((it, i) => { per[it.name] = 58 - i * 4; });
    doc.puzzles[puzzle.id] = {
      type: "rank", seeded: true, players: standing.n, pctPerfect: 12,
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
  for (const puzzle of NAMES) {
    if (doc.puzzles[puzzle.id]) continue;
    const standing = seed.standingBlock(puzzle.id, 910, "name", 1);
    if (standing.avgTries < 3.3 || standing.avgTries > 4.0) throw new Error(puzzle.id + " tries " + standing.avgTries);
    if (standing.avgAccuracy < 50 || standing.avgAccuracy > 72) throw new Error(puzzle.id + " acc " + standing.avgAccuracy);
    const pick = puzzle.countries.find(c => c.name === puzzle.seedPick);
    const bar = { name: puzzle.seedPick, pct: 100, emoji: pick.emoji };
    doc.puzzles[puzzle.id] = {
      type: "name", seeded: true, players: standing.n, pctPerfect: 14,
      perItemCorrect: { [puzzle.seedPick]: 46 },
      firstGuessWorld: { players: 1, bars: [bar] },
      firstGuessByCountry: {
        US: { players: 1, bars: [bar] },
        TW: { players: 1, bars: [bar] },
        SG: { players: 1, bars: [bar] },
      },
      countryBoard: seed.countryBoard(puzzle.id, "name"),
      standing,
    };
  }
  fs.writeFileSync(file, JSON.stringify(doc));
}

for (const puzzle of NAMES) puzzle.order = NAME_ORDERS[puzzle.id];

function appendSheets() {
  const csvFile = path.join(root, "puzzles.csv");
  let csv = fs.readFileSync(csvFile, "utf8");
  const header = csv.replace(/^\uFEFF/, "").split("\n")[0];
  const fields = header.split(",");
  const q = v => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [];
  for (const puzzle of PUZZLES) {
    if (csv.includes("\n" + puzzle.id + ",")) continue;
    puzzle.items.forEach((it, n) => {
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
      lines.push(fields.map(f => q(row[f] == null ? "" : row[f])).join(","));
    });
  }
  if (lines.length) {
    if (!csv.endsWith("\n")) csv += "\n";
    fs.writeFileSync(csvFile, csv + lines.join("\n") + "\n");
  }
  const { execFileSync } = require("child_process");
  const payload = [];
  for (const puzzle of PUZZLES) {
    puzzle.items.forEach((it, n) => {
      payload.push({
        id: puzzle.id,
        cells: n === 0 ? [
          ["B", puzzle.order], ["C", puzzle.emoji], ["D", puzzle.question], ["E", puzzle.stat],
          ["F", puzzle.unit], ["G", "top"], ["H", "no"], ["I", it.name], ["J", it.emoji],
          ["K", it.value], ["L", it.year || ""], ["M", puzzle.source], ["N", puzzle.sourceUrl],
          ["O", puzzle.fact], ["P", it.gRank], ["Q", it.gTotal], ["R", it.gScope],
          ["S", "chart"], ["U", puzzle.dataset], ["W", puzzle.headline],
        ] : [
          ["I", it.name], ["J", it.emoji], ["K", it.value], ["L", it.year || ""],
          ["P", it.gRank], ["Q", it.gTotal], ["R", it.gScope],
        ],
      });
    });
  }
  fs.writeFileSync("/tmp/rankd-batch-xlsx.json", JSON.stringify(payload));
  execFileSync("python3", ["-c", `
import json, re, zipfile
from pathlib import Path
xlsx = Path(${JSON.stringify(path.join(root, "puzzles.xlsx"))})
items = json.loads(Path("/tmp/rankd-batch-xlsx.json").read_text())
def esc(s):
    return ("" if s is None else str(s)).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
def cell(col, row, text):
    if text is None or text == "":
        return ""
    return f'<c r="{col}{row}" t="inlineStr"><is><t>{esc(text)}</t></is></c>'
with zipfile.ZipFile(xlsx) as book:
    stored = {info.filename: (info, book.read(info.filename)) for info in book.infolist()}
xml = stored["xl/worksheets/sheet1.xml"][1].decode("utf-8")
if "wealth-top1-sa" in xml:
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
}

spliceDatasets();
splicePuzzles();
spliceNames();
addFormats();
addSeeds();
appendSheets();
console.log("puzzles", PUZZLES.map(p => p.order + " " + p.id).join("\n"));
