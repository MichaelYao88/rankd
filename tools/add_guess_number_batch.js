/* Sentence prompts, per-stat score factors, and the new Guess the number
   series. Idempotent: rewrites number-stats.js and number-puzzles.js from
   the series already in practice-data.js plus the 2024 state vote shares
   parsed from the Wikipedia results table. */
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
const stats = load("number-stats.js").RANKD_NUMBER_STATS;
const sets = load("number-puzzles.js").RANKD_NUMBER;
const NumberGuess = load("number-guess.js").RankdNumber;
const byIso = new Map();
for (const [iso, row] of Object.entries(C)) byIso.set(iso, { name: row[0], emoji: row[1] });

function datasetRows(id) {
  const ds = practice.datasets.find(d => d.id === id);
  if (!ds) throw new Error("missing dataset " + id);
  return ds.rows.filter(r => byIso.has(r[0])).map(r => [r[0], r[1], r[2] || ""]);
}

function place(iso, value, year) {
  const who = byIso.get(iso);
  if (!who) throw new Error("no country " + iso);
  return { iso3: iso, name: who.name, emoji: who.emoji, value: value, year: String(year || "") };
}

function pairsFrom(rows, specs) {
  const by = new Map(rows.map(r => [r[0], r]));
  return specs.map(([knownIso, askIso, fact]) => {
    const known = by.get(knownIso);
    const ask = by.get(askIso);
    if (!known || !ask) throw new Error("missing pair " + knownIso + " " + askIso);
    if (!(fact.length > 40)) throw new Error("short fact " + knownIso);
    if (!fact.includes(byIso.get(knownIso).name) || !fact.includes(byIso.get(askIso).name)) {
      throw new Error("fact names " + knownIso + " " + askIso);
    }
    return { known: place(knownIso, known[1], known[2]), ask: place(askIso, ask[1], ask[2]), fact };
  });
}

const META = {
  "number-femicide": { noun: "female homicide rate", unitSpoken: "per 100,000 women" },
  "number-tea": { noun: "tea supply", unitSpoken: "kg per person per year" },
  "number-coffee": { noun: "coffee supply", unitSpoken: "kg per person per year" },
  "number-cocoa": { noun: "cocoa supply", unitSpoken: "kg per person per year" },
  "number-garlic": { noun: "garlic supply", unitSpoken: "kg per person per year" },
  "number-life": { noun: "life expectancy", unitSpoken: "years" },
};

const factorRows = {
  "number-femicide": datasetRows("unodc-homicide-female").map(r => r[1]),
};
for (const stat of stats) factorRows[stat.id] = stat.rows.map(r => r[1]);

for (const set of sets) {
  const meta = META[set.id];
  if (!meta) throw new Error("no meta " + set.id);
  Object.assign(set, meta);
  set.scoreFactor = NumberGuess.factorFromValues(factorRows[set.id]);
}

const PRISON_WHY = "The World Prison Brief rate counts people in prison, including people awaiting trial, and the years are not the same for every country.";
const prisonRows = datasetRows("wpb-prison");
const prisonPairs = pairsFrom(prisonRows, [
  ["USA", "SLV", "El Salvador is 1,659 per 100,000 people in 2024, about three times the United States at 542 in 2023. The rate jumped after the 2022 gang crackdown jailed tens of thousands. " + PRISON_WHY],
  ["GBR", "USA", "The United States is 542 per 100,000 in 2023 and the United Kingdom is 139 in 2025. The same count puts the US near the top of the Brief and the UK in the middle. " + PRISON_WHY],
  ["JPN", "USA", "The United States is 542 per 100,000 in 2023 and Japan is 33 in 2024. Japan's figure stays low, with little violent crime and shorter stays. " + PRISON_WHY],
  ["USA", "RWA", "Rwanda is 620 per 100,000 in 2024, above the United States at 542 in 2023. " + PRISON_WHY],
  ["IND", "USA", "The United States is 542 per 100,000 in 2023 and India is 37 in the same year. " + PRISON_WHY],
  ["CHN", "USA", "The United States is 542 per 100,000 in 2023 and China's published figure is 119 in 2018. The Chinese year is older than the others on this list. " + PRISON_WHY],
  ["BRA", "USA", "The United States is 542 per 100,000 in 2023, above Brazil at 416 in 2024. " + PRISON_WHY],
  ["TUR", "USA", "The United States is 542 per 100,000 in 2023, a bit above Turkey at 468 in 2026. " + PRISON_WHY],
  ["CAN", "GBR", "The United Kingdom is 139 per 100,000 in 2025, above Canada at 90 in 2023. " + PRISON_WHY],
  ["NOR", "USA", "The United States is 542 per 100,000 in 2023 and Norway is 54 in 2025. " + PRISON_WHY],
  ["AUS", "USA", "The United States is 542 per 100,000 in 2023, well above Australia at 170 in 2025. " + PRISON_WHY],
  ["MEX", "BRA", "Brazil is 416 per 100,000 in 2024, more than double Mexico at 188 in 2025. " + PRISON_WHY],
  ["DEU", "FRA", "France is 126 per 100,000 in 2025, above Germany at 71 in 2024. " + PRISON_WHY],
  ["KOR", "JPN", "South Korea is 115 per 100,000 in 2023, well above Japan at 33 in 2024. " + PRISON_WHY],
  ["THA", "USA", "The United States is 542 per 100,000 in 2023, above Thailand at 395 in 2024. " + PRISON_WHY],
  ["RUS", "USA", "The United States is 542 per 100,000 in 2023, above Russia at 300 in 2023. " + PRISON_WHY],
  ["NGA", "ZAF", "South Africa is 260 per 100,000 in 2025, far above Nigeria at 33 in the same year. " + PRISON_WHY],
  ["NLD", "POL", "Poland is 191 per 100,000 in 2025, about three times the Netherlands at 64 in 2023. " + PRISON_WHY],
]);

const MCD_WHY = "The figure is McDonald's restaurants per million people in 2024, not burgers eaten. A small population makes the same outlet count look huge.";
const mcdRows = datasetRows("mcdonalds-per-million-2024");
const mcdPairs = pairsFrom(mcdRows, [
  ["USA", "AUS", "Australia is 37.2 McDonald's restaurants per million people and the United States is 38.6. The two are almost the same. " + MCD_WHY],
  ["USA", "JPN", "Japan is 24.1 per million people and the United States is 38.6. Japan is high on the list and still well under the US. " + MCD_WHY],
  ["FRA", "DEU", "Germany is 16.4 per million people and France is 23.2. France has the denser map. " + MCD_WHY],
  ["GBR", "FRA", "France is 23.2 per million people, a bit above the United Kingdom at 21.2. " + MCD_WHY],
  ["IND", "CHN", "China is 4.8 per million people and India is 0.5. China is still low, and India is near the bottom of the 74 markets. " + MCD_WHY],
  ["IND", "USA", "The United States is 38.6 per million people and India is 0.5. India's total outlet count is spread across a much larger population. " + MCD_WHY],
  ["CAN", "USA", "The United States is 38.6 per million people and Canada is 36.1. Canada is the next market down, not a different league. " + MCD_WHY],
  ["QAT", "SAU", "Saudi Arabia is 12.5 per million people and Qatar is 27.6. Qatar's smaller population carries a denser map. " + MCD_WHY],
  ["SWE", "NOR", "Norway is 15.3 per million people and Sweden is 18.8. " + MCD_WHY],
  ["ITA", "ESP", "Spain is 13 per million people and Italy is 12.8. The two sit together, well under northern Europe. " + MCD_WHY],
  ["KOR", "JPN", "Japan is 24.1 per million people and South Korea is 7.7. Japan's map is about three times as dense. " + MCD_WHY],
  ["SGP", "HKG", "Hong Kong is 34.6 per million people and Singapore is 25.2. Hong Kong is denser. " + MCD_WHY],
  ["NZL", "AUS", "Australia is 37.2 per million people and New Zealand is 32.5. Both sit with the United States at the top. " + MCD_WHY],
  ["IDN", "PHL", "The Philippines is 6.8 per million people and Indonesia is 1.1. " + MCD_WHY],
  ["TUR", "POL", "Poland is 15.9 per million people and Turkey is 3.2. " + MCD_WHY],
  ["ARE", "GBR", "The United Kingdom is 21.2 per million people and the United Arab Emirates is 19.1. " + MCD_WHY],
  ["BRA", "MEX", "Mexico is 2.9 per million people and Brazil is 5.5. Both are far under the US figure of 38.6. " + MCD_WHY],
  ["USA", "MAC", "Macao is 56.8 per million people, above the United States at 38.6. Macao leads the 74 markets because the population is small. " + MCD_WHY],
]);

const T_WHY = "These are age-adjusted ng/dL from TestosteroneDecline.com's compilation of small studies, often one city, shifted onto a US age curve. Labs, sample sizes and years differ, so this is not one national survey.";
const tRows = datasetRows("tdc-male-testosterone");
const tPairs = pairsFrom(tRows, [
  ["USA", "CHN", "China is 521 ng/dL and the United States is 451. China sits above the United States in this compilation. " + T_WHY],
  ["USA", "NLD", "The Netherlands is 571 ng/dL and the United States is 451. The Dutch figure is the highest in Europe in this table. " + T_WHY],
  ["JPN", "DEU", "Germany is 434 ng/dL and Japan is 502. Japan is above Germany, the opposite of a low-testosterone East Asia story. " + T_WHY],
  ["IND", "USA", "The United States is 451 ng/dL and India is 487. India sits above the United States here. " + T_WHY],
  ["GBR", "USA", "The United States is 451 ng/dL and the United Kingdom is 521. " + T_WHY],
  ["CMR", "NLD", "The Netherlands is 571 ng/dL and Cameroon is 731. Cameroon is above the highest European figure in the table. " + T_WHY],
  ["KOR", "USA", "The United States is 451 ng/dL and South Korea is 462. South Korea is a little above the United States, not below it. " + T_WHY],
  ["FRA", "ITA", "Italy is 480 ng/dL and France is 420. " + T_WHY],
  ["AUS", "CAN", "Canada is 402 ng/dL and Australia is 403. The two match. " + T_WHY],
  ["SWE", "NOR", "Norway is 443 ng/dL and Sweden is 489. " + T_WHY],
  ["BRA", "ARG", "Argentina is 455 ng/dL and Brazil is 375. " + T_WHY],
  ["MEX", "USA", "The United States is 451 ng/dL and Mexico is 412. " + T_WHY],
  ["DNK", "GBR", "The United Kingdom is 521 ng/dL and Denmark is 566. Denmark is higher. " + T_WHY],
  ["ETH", "IND", "India is 487 ng/dL and Ethiopia is 671. Ethiopia is well above India in this compilation. " + T_WHY],
  ["RUS", "CHN", "China is 521 ng/dL and Russia is 547. " + T_WHY],
  ["ESP", "ITA", "Italy is 480 ng/dL and Spain is 496. " + T_WHY],
  ["TUR", "GRC", "Greece is 448 ng/dL and Turkey is 420. " + T_WHY],
  ["FIN", "SWE", "Sweden is 489 ng/dL and Finland is 375. Finland is well under Sweden. " + T_WHY],
]);

const URBAN_WHY = "The World Bank figure is the share of people living in places that country itself calls urban, from UN World Urbanization Prospects. Countries do not use the same cutoff, so a high number is not a count of big cities.";
const urbanRows = datasetRows("wb-urban");
const urbanPairs = pairsFrom(urbanRows, [
  ["USA", "URY", "Uruguay is 95.7% urban and the United States is 80.2%. Most Uruguayans live in greater Montevideo, in a small ranching country. " + URBAN_WHY],
  ["IND", "CHN", "China is 66.3% urban and India is 35.7%. India is still mostly places it counts as rural. " + URBAN_WHY],
  ["USA", "JPN", "Japan is 92.3% urban and the United States is 80.2%. " + URBAN_WHY],
  ["DEU", "NLD", "The Netherlands is 95.9% urban and Germany is 82.1%. " + URBAN_WHY],
  ["IND", "NGA", "Nigeria is 63.8% urban and India is 35.7%. Nigeria's own definition puts far more of its people in urban places. " + URBAN_WHY],
  ["EGY", "BRA", "Brazil is 88.2% urban and Egypt is 42.9%. " + URBAN_WHY],
  ["GBR", "SGP", "Singapore is 100% urban and the United Kingdom is 83.3%. Singapore is a city-state, so the whole population is urban by definition. " + URBAN_WHY],
  ["FRA", "GBR", "The United Kingdom is 83.3% urban and France is 78.8%. " + URBAN_WHY],
  ["ETH", "NGA", "Nigeria is 63.8% urban and Ethiopia is 24.1%. " + URBAN_WHY],
  ["CHN", "KOR", "South Korea is 81.2% urban and China is 66.3%. " + URBAN_WHY],
  ["ZAF", "BRA", "Brazil is 88.2% urban and South Africa is 63.8%. " + URBAN_WHY],
  ["MEX", "USA", "The United States is 80.2% urban and Mexico is 80%. The two match. " + URBAN_WHY],
  ["USA", "ARG", "Argentina is 92.4% urban and the United States is 80.2%. " + URBAN_WHY],
  ["NOR", "SWE", "Sweden is 89.1% urban and Norway is 83.6%. " + URBAN_WHY],
  ["USA", "QAT", "Qatar is 99.4% urban and the United States is 80.2%. " + URBAN_WHY],
  ["BDI", "ETH", "Ethiopia is 24.1% urban and Burundi is 25.7%. Both are near the bottom of the series. " + URBAN_WHY],
  ["IDN", "CHN", "China is 66.3% urban and Indonesia is 59.4%. " + URBAN_WHY],
  ["RWA", "ZAF", "South Africa is 63.8% urban and Rwanda is 30.9%. " + URBAN_WHY],
]);

const WID_WHY = "World Inequality Database, equal-split adults, net personal wealth in 2024, via Our World in Data. This is a share of private wealth, not income. Some country-years are modeled.";
const widRows = datasetRows("wid-wealth-top1");
const widPairs = pairsFrom(widRows, [
  ["USA", "ZAF", "South Africa's richest 1% hold 54.91% of private wealth, above the United States at 34.78%. South Africa is the top of this 213-country series. " + WID_WHY],
  ["USA", "RUS", "Russia's richest 1% hold 48.99% of private wealth, above the United States at 34.78% and second only to South Africa. Novokmet, Piketty and Zucman find inequality rose more in Russia than in other ex-communist countries and tie that to shock therapy, but their paper runs through 2016, so it explains the pattern rather than this 2024 figure. " + WID_WHY],
  ["DNK", "USA", "The United States' richest 1% hold 34.78% of private wealth and Denmark's hold 20.76%. Denmark is near the bottom of the 213. " + WID_WHY],
  ["GBR", "USA", "The United States' richest 1% hold 34.78% of private wealth and the United Kingdom's hold 21.3%. The UK is near the bottom of the series, not the middle. " + WID_WHY],
  ["NLD", "USA", "The United States' richest 1% hold 34.78% of private wealth and the Netherlands' hold 13.98%, the lowest of the 213. " + WID_WHY],
  ["IND", "CHN", "China's richest 1% hold 30.42% of private wealth and India's hold 40.14%. India is higher. " + WID_WHY],
  ["BRA", "MEX", "Mexico's richest 1% hold 39.8% of private wealth and Brazil's hold 39.46%. The two match. " + WID_WHY],
  ["SWE", "USA", "The United States' richest 1% hold 34.78% of private wealth and Sweden's hold 27.49%. " + WID_WHY],
  ["JPN", "KOR", "South Korea's richest 1% hold 26.1% of private wealth and Japan's hold 24.62%. " + WID_WHY],
  ["DEU", "FRA", "France's richest 1% hold 27.68% of private wealth and Germany's hold 27.85%. The two match. " + WID_WHY],
  ["NOR", "DNK", "Denmark's richest 1% hold 20.76% of private wealth and Norway's hold 23.47%. " + WID_WHY],
  ["SAU", "QAT", "Qatar's richest 1% hold 37.72% of private wealth and Saudi Arabia's hold 30.06%. " + WID_WHY],
  ["AUS", "CAN", "Canada's richest 1% hold 28.58% of private wealth and Australia's hold 23.67%. " + WID_WHY],
  ["ITA", "ESP", "Spain's richest 1% hold 24.15% of private wealth and Italy's hold 22.03%. " + WID_WHY],
  ["IDN", "NGA", "Nigeria's richest 1% hold 28.01% of private wealth and Indonesia's hold 21.32%. " + WID_WHY],
  ["FIN", "SWE", "Sweden's richest 1% hold 27.49% of private wealth and Finland's hold 17.98%. Finland is near the bottom. " + WID_WHY],
  ["CHE", "USA", "The United States' richest 1% hold 34.78% of private wealth and Switzerland's hold 31.48%. " + WID_WHY],
  ["DEU", "TUR", "Turkey's richest 1% hold 31.74% of private wealth and Germany's hold 27.85%. " + WID_WHY],
]);

const POSTAL = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA",
  Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH",
  Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA",
  Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};
const TRUMP = {
  Alabama: 64.57, Alaska: 54.54, Arizona: 52.22, Arkansas: 64.2, California: 38.33, Colorado: 43.14,
  Connecticut: 41.89, Delaware: 41.79, Florida: 56.09, Georgia: 50.72, Hawaii: 37.48, Idaho: 66.87,
  Illinois: 43.47, Indiana: 58.58, Iowa: 55.73, Kansas: 57.16, Kentucky: 64.47, Louisiana: 60.22,
  Maine: 45.46, Maryland: 34.08, Massachusetts: 36.02, Michigan: 49.73, Minnesota: 46.68, Mississippi: 60.89,
  Missouri: 58.49, Montana: 58.39, Nebraska: 59.32, Nevada: 50.59, "New Hampshire": 47.87, "New Jersey": 46.06,
  "New Mexico": 45.85, "New York": 43.31, "North Carolina": 50.86, "North Dakota": 66.96, Ohio: 55.14,
  Oklahoma: 66.16, Oregon: 40.97, Pennsylvania: 50.37, "Rhode Island": 41.76, "South Carolina": 58.23,
  "South Dakota": 63.43, Tennessee: 64.19, Texas: 56.14, Utah: 59.38, Vermont: 32.32, Virginia: 46.05,
  Washington: 39.01, "West Virginia": 69.97, Wisconsin: 49.6, Wyoming: 71.6,
};
if (Object.keys(TRUMP).length !== 50) throw new Error("states " + Object.keys(TRUMP).length);
const trumpRows = Object.entries(TRUMP).map(([name, value]) => [POSTAL[name], value, "2024"]);
const trumpBy = new Map(trumpRows.map(r => [r[0], r]));
function trumpPlace(code) {
  const row = trumpBy.get(code);
  const name = Object.keys(POSTAL).find(n => POSTAL[n] === code);
  return { iso3: code, name, emoji: "🇺🇸", value: row[1], year: "2024" };
}
const VOTE_WHY = "This is Donald Trump's share of the statewide popular vote in the certified 2024 results, as compiled on the Wikipedia results-by-state table. It is not the Electoral College. Maine and Nebraska split electors, and that split is not in this percentage. The District of Columbia, at 6.47%, is not a state and is left out.";
const trumpSpecs = [
  ["CA", "TX", "Texas gave Donald Trump 56.14% and California gave him 38.33%. " + VOTE_WHY],
  ["NY", "FL", "Florida gave Donald Trump 56.09% and New York gave him 43.31%. " + VOTE_WHY],
  ["TX", "WY", "Wyoming gave Donald Trump 71.6%, the highest of the 50 states, above Texas at 56.14%. " + VOTE_WHY],
  ["CA", "HI", "Hawaii gave Donald Trump 37.48%, a bit under California at 38.33%. " + VOTE_WHY],
  ["VT", "MA", "Massachusetts gave Donald Trump 36.02% and Vermont gave him 32.32%, the lowest of the 50 states. " + VOTE_WHY],
  ["VA", "WV", "West Virginia gave Donald Trump 69.97% and Virginia gave him 46.05%. The neighbors are not one result. " + VOTE_WHY],
  ["IL", "IN", "Indiana gave Donald Trump 58.58% and Illinois gave him 43.47%. " + VOTE_WHY],
  ["WA", "OR", "Oregon gave Donald Trump 40.97% and Washington gave him 39.01%. The two match. " + VOTE_WHY],
  ["GA", "FL", "Florida gave Donald Trump 56.09% and Georgia gave him 50.72%. " + VOTE_WHY],
  ["MI", "OH", "Ohio gave Donald Trump 55.14% and Michigan gave him 49.73%. " + VOTE_WHY],
  ["PA", "NJ", "New Jersey gave Donald Trump 46.06% and Pennsylvania gave him 50.37%. " + VOTE_WHY],
  ["MN", "WI", "Wisconsin gave Donald Trump 49.6% and Minnesota gave him 46.68%. " + VOTE_WHY],
  ["CO", "UT", "Utah gave Donald Trump 59.38% and Colorado gave him 43.14%. " + VOTE_WHY],
  ["NM", "AZ", "Arizona gave Donald Trump 52.22% and New Mexico gave him 45.85%. " + VOTE_WHY],
  ["ME", "NH", "New Hampshire gave Donald Trump 47.87% and Maine gave him 45.46%. " + VOTE_WHY],
  ["NV", "CA", "California gave Donald Trump 38.33% and Nevada gave him 50.59%. " + VOTE_WHY],
  ["NC", "SC", "South Carolina gave Donald Trump 58.23% and North Carolina gave him 50.86%. " + VOTE_WHY],
  ["AK", "HI", "Hawaii gave Donald Trump 37.48% and Alaska gave him 54.54%. " + VOTE_WHY],
];
const trumpPairs = trumpSpecs.map(([a, b, fact]) => ({ known: trumpPlace(a), ask: trumpPlace(b), fact }));

function buildSet(spec, rows, pairList) {
  const values = rows.map(r => r[1]);
  const set = {
    id: spec.id,
    sensitive: !!spec.sensitive,
    fillerDate: "2027-05-06",
    emoji: spec.emoji,
    headline: spec.headline,
    stat: spec.stat,
    noun: spec.noun,
    unit: spec.unit,
    unitSpoken: spec.unitSpoken,
    year: spec.year,
    art: spec.art,
    source: spec.source,
    sourceUrl: spec.sourceUrl,
    dataset: spec.dataset,
    scoreFactor: NumberGuess.factorFromValues(values),
    pairs: pairList,
  };
  if (spec.prompt) set.prompt = spec.prompt;
  if (pairList.length < 15 || pairList.length > 20) throw new Error(spec.id + " pairs " + pairList.length);
  const seen = new Set();
  for (const pair of pairList) {
    const id = pair.known.iso3 + "-" + pair.ask.iso3;
    if (seen.has(id)) throw new Error("dup " + id);
    seen.add(id);
  }
  return { set, rows };
}

const built = [
  buildSet({
    id: "number-prison", sensitive: true, emoji: "⛓️", headline: "Behind Bars",
    stat: "Incarceration rate", noun: "incarceration rate", unit: "per 100k", unitSpoken: "per 100,000 people",
    year: "2024", art: "scale", dataset: "wpb-prison",
    source: "World Prison Brief, prison population rate per 100,000 people, via Our World in Data. Includes people awaiting trial. The year is the latest figure the Brief publishes for that country, so years differ.",
    sourceUrl: "https://ourworldindata.org/grapher/prison-population-rate",
  }, prisonRows, prisonPairs),
  buildSet({
    id: "number-mcdonalds", sensitive: false, emoji: "🍟", headline: "Golden Density",
    stat: "McDonald's restaurants per capita", noun: "McDonald's density", unit: "per million people", unitSpoken: "restaurants per million people",
    year: "2024", art: "chart", dataset: "mcdonalds-per-million-2024",
    source: "Visual Capitalist (Gabriel Cohen), McDonald's restaurant count by market, 2024, divided by population. Restaurants per million people, not sales.",
    sourceUrl: "https://www.visualcapitalist.com/mapped-how-many-mcdonalds-each-country-has-per-person/",
  }, mcdRows, mcdPairs),
  buildSet({
    // Retired values. The live number-testosterone series is the MrOS 65+ comparison.
    id: "number-testosterone", sensitive: false, emoji: "🧪", headline: "Serum Levels",
    stat: "Average male testosterone", noun: "average male testosterone level", unit: "ng/dL", unitSpoken: "ng/dL",
    year: "2000–2024", art: "chart", dataset: "tdc-male-testosterone",
    source: "TestosteroneDecline.com, age-adjusted compilation of small, non-uniform studies (ranking table updated 25 Nov 2024). Often one city, measured in different labs and years, then shifted onto a US age curve. The United States is the 25 Nov 2024 revision to 451 ng/dL from NHANES 2021-2023.",
    sourceUrl: "https://testosteronedecline.com/what-country-has-highest-testosterone/",
  }, tRows, tPairs),
  buildSet({
    id: "number-trump", sensitive: true, emoji: "🇺🇸", headline: "Trump's Share 🇺🇸",
    stat: "Trump 2024 vote share", noun: "Trump vote share", unit: "% of the vote", unitSpoken: "% of the vote",
    year: "2024", art: "flag", dataset: "trump-2024-states", prompt: "vote",
    source: "Certified 2024 statewide popular-vote shares for Donald Trump, compiled by Wikipedia from state returns (Results by state). Not the Electoral College. The District of Columbia is not a state and is omitted.",
    sourceUrl: "https://en.wikipedia.org/wiki/2024_United_States_presidential_election#Results_by_state",
  }, trumpRows, trumpPairs),
  buildSet({
    id: "number-urban", sensitive: false, emoji: "🏙️", headline: "City Share",
    stat: "Urbanization rate", noun: "urbanization rate", unit: "%", unitSpoken: "%",
    year: "2025", art: "chart", dataset: "wb-urban",
    source: "World Bank, urban population (SP.URB.TOTL.IN.ZS), from UN World Urbanization Prospects. The 2025 country figures already used by the City Slickers ranker. Each country defines urban for itself.",
    sourceUrl: "https://data.worldbank.org/indicator/SP.URB.TOTL.IN.ZS",
  }, urbanRows, urbanPairs),
  buildSet({
    id: "number-wealth", sensitive: false, emoji: "💰", headline: "The Top Slice",
    stat: "Top 1% wealth share", noun: "top 1% wealth share", unit: "% of private wealth", unitSpoken: "% of private wealth",
    year: "2024", art: "chart", dataset: "wid-wealth-top1", prompt: "share",
    source: "World Inequality Database (WID.world) via Our World in Data: wealth share of the richest 1%, equal-split adults, net personal wealth, 2024. Not income. Some country-years are modeled.",
    sourceUrl: "https://ourworldindata.org/grapher/wealth-share-richest?quantile=richest_1pct",
  }, widRows, widPairs),
];

const newStats = built.map(({ set, rows }) => ({
  id: set.id,
  sensitive: set.sensitive,
  year: set.year,
  unit: set.unitSpoken,
  stat: set.stat,
  source: set.source,
  sourceUrl: set.sourceUrl,
  rows: rows.map(r => r[2] ? [r[0], r[1], String(r[2])] : [r[0], r[1]]),
}));

const existingIds = new Set(stats.map(s => s.id));
for (const stat of newStats) {
  if (existingIds.has(stat.id)) throw new Error("stat exists " + stat.id);
}
const nextStats = stats.concat(newStats);
const nextSets = sets.concat(built.map(b => b.set));

const statsHead = `/* Country series behind Guess the number. Pairs live in number-puzzles.js.
   Tea, coffee, and cocoa are FAOSTAT Food Balance Sheets, food supply
   quantity (kg/capita/yr), 2023, flag E (estimated). Bulk file dated
   2025-10-14. China is the mainland row, so Hong Kong and Taiwan stay
   separate. Tea includes yerba mate. Coffee is primary equivalent.
   Garlic is the repo's FAOSTAT supply (production + imports − exports)
   per person, 2023, same method as the garlic daily. Life expectancy is
   the World Bank / UN Population Division series SP.DYN.LE00.IN, 2024.
   Incarceration, McDonald's, testosterone, urbanization and the top 1%
   wealth share reuse the series already behind those rankers. Trump 2024
   is statewide popular-vote shares. Female homicide, incarceration and
   the Trump shares are sensitive. */
`;
fs.writeFileSync(path.join(root, "number-stats.js"), statsHead + "window.RANKD_NUMBER_STATS = " + JSON.stringify(nextStats) + ";\n");

const puzzlesHead = `/* Guess-the-number sets. Values match number-stats.js.
   Female homicide, incarceration and the Trump state shares are sensitive.
   A stat is not repeated inside 30 days. scoreFactor is the series
   interquartile ratio, clamped to 1.15–3. The prompt is built in number-guess.js. */
`;
fs.writeFileSync(path.join(root, "number-puzzles.js"), puzzlesHead + "window.RANKD_NUMBER = " + JSON.stringify(nextSets) + ";\n");

const check = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "number-puzzles.js"), "utf8"), check, { filename: "number-puzzles.js" });
vm.runInNewContext(fs.readFileSync(path.join(root, "number-guess.js"), "utf8"), check, { filename: "number-guess.js" });
const tea = check.window.RANKD_NUMBER.find(s => s.id === "number-tea");
const card = check.window.RankdNumber.card(tea, tea.pairs[0]);
if (card.question !== "🇬🇧 The United Kingdom has a tea supply of 1.23 kg per person per year. What is 🇹🇷 Turkey's?") {
  throw new Error("tea prompt " + card.question);
}
const reveal = check.window.RankdNumber.reveal(card);
if (reveal !== "🇹🇷 Turkey's tea supply is 19.98 kg per person per year.") throw new Error("reveal " + reveal);
const life = check.window.RANKD_NUMBER.find(s => s.id === "number-life");
if (!(life.scoreFactor > 1.15 && life.scoreFactor < 1.25)) throw new Error("life factor " + life.scoreFactor);
console.log("sets", check.window.RANKD_NUMBER.length);
for (const set of check.window.RANKD_NUMBER) console.log(set.id, "factor", set.scoreFactor, "pairs", set.pairs.length, set.sensitive ? "sensitive" : "");
