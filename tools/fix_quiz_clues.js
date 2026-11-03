/* Rewrite the three Who Invented It? days: no answer-giving clues in the
   question, no bordering or historically arguable distractors, six new cards,
   11 cards on each day. Idempotent. Does not touch later dailies. */
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
function place(iso) {
  if (!C[iso]) throw new Error("missing country " + iso);
  return { iso3: iso, name: C[iso][0], emoji: C[iso][1] };
}

const NEIGHBORS = {
  JPN: [],
  SWE: ["NOR", "FIN"],
  GBR: ["IRL"],
  ISR: ["EGY", "JOR", "LBN", "SYR"],
  DEU: ["FRA", "POL", "CZE", "AUT", "CHE", "BEL", "NLD", "DNK", "LUX"],
  IND: ["PAK", "CHN", "NPL", "BTN", "BGD", "MMR"],
  CHN: ["RUS", "MNG", "PRK", "KOR", "VNM", "LAO", "MMR", "IND", "BTN", "NPL", "KAZ", "KGZ", "TJK", "AFG", "PAK"],
  USA: ["CAN", "MEX"],
  CAN: ["USA"],
  PER: ["ECU", "COL", "BRA", "BOL", "CHL"],
  IRN: ["TUR", "IRQ", "ARM", "AZE", "TKM", "AFG", "PAK"],
  KEN: ["TZA", "UGA", "ETH", "SOM", "SSD"],
  TUR: ["GRC", "BGR", "GEO", "ARM", "IRN", "IRQ", "SYR"],
  HRV: ["SVN", "HUN", "SRB", "BIH", "MNE"],
  IRQ: ["IRN", "TUR", "SYR", "JOR", "SAU", "KWT"],
  MAR: ["DZA", "ESH", "ESP"],
};

const GIVEAWAY = /Abbasid|Khwarizmi|Nashtifan|Benz|Ericsson|Andes|Patent-Motorwagen|Persian mathematician/i;

function card(base, ask, prompt, isos) {
  const q = Object.assign({}, base, {
    ask: ask || base.ask,
    prompt: prompt || base.prompt,
    options: isos.map(place),
  });
  if (new Set(isos).size !== 4) throw new Error(q.id + " options");
  if (!isos.includes(q.answer)) throw new Error(q.id + " missing answer");
  if (GIVEAWAY.test(q.ask + " " + q.prompt)) throw new Error(q.id + " giveaway");
  if (/ and the /i.test(q.ask)) throw new Error(q.id + " and the");
  const banned = new Set(NEIGHBORS[q.answer] || []);
  for (const iso of isos) {
    if (iso !== q.answer && banned.has(iso)) throw new Error(q.id + " borders " + iso);
  }
  return q;
}

function fresh(id, prompt, ask, answer, isos, fact, source, sourceUrl) {
  return card({ id, prompt, ask, answer, fact, source, sourceUrl }, ask, prompt, isos);
}

const puzzles = load("puzzles-data.js").RANKD_PUZZLES;
function orig(day, id) {
  const q = puzzles.find(p => p.id === day).questions.find(x => x.id === id);
  if (!q) throw new Error("missing " + id);
  return q;
}
const d1 = id => orig("who-invented-it", id);
const d2 = id => orig("who-invented-older", id);
const d3 = id => orig("who-invented-words", id);

const day1 = [
  card(d1("emoji"), null, null, ["BRA", "JPN", "AUS", "NGA"]),
  card(d1("qr"), null, null, ["BRA", "ZAF", "JPN", "AUS"]),
  card(d1("spotify"), null, null, ["USA", "SWE", "JPN", "BRA"]),
  card(d1("webcam"), null, null, ["USA", "CHE", "GBR", "JPN"]),
  card(d1("usb-flash"), null, null, ["BRA", "ISR", "JPN", "AUS"]),
  card(d1("gasoline-car"), "Which country built the first gasoline car?", "The first gasoline car", ["BRA", "JPN", "DEU", "AUS"]),
  card(d1("shampoo"), null, null, ["BRA", "IND", "JPN", "AUS"]),
  card(d1("bluetooth"), "Which country developed the short-range radio that became Bluetooth?", "Bluetooth", ["BRA", "JPN", "SWE", "AUS"]),
  card(d1("ketchup"), "Which country invented the sauce behind the word ketchup?", "Ketchup", ["BRA", "NGA", "CHN", "AUS"]),
  fresh("haagen-dazs", "Häagen-Dazs", "Häagen-Dazs was first made in which country?", "USA", ["DNK", "USA", "BRA", "JPN"],
    "Reuben and Rose Mattus made up the name on their couch in the Bronx around 1960 and printed a map of Denmark on the carton. Danish uses neither ä nor zs. The name was meant to sound imported.",
    "New York Times, Rose Mattus obituary",
    "https://www.nytimes.com/2006/12/01/obituaries/rose-mattus-90-cocreator-of-haagendazs-ice-cream-dies.html"),
  fresh("english-muffins", "Thomas' English muffins", "Which country first sold Thomas' English muffins?", "USA", ["BRA", "USA", "JPN", "AUS"],
    "Samuel Bath Thomas left England in 1874 with a muffin recipe and in 1880 opened a bakery in Manhattan that sold the griddle-baked muffins under his name. The recipe was English. The first shop that sold them as Thomas' English muffins was in the United States.",
    "American Society of Baking, Baking Hall of Fame, Samuel Thomas",
    "https://asbe.org/bhof-2008-sthomas/"),
];

const day2 = [
  card(d2("toothbrush"), null, null, ["BRA", "NGA", "AUS", "CHN"]),
  card(d2("playing-cards"), null, null, ["EGY", "BRA", "CHN", "AUS"]),
  card(d2("umbrella"), null, null, ["BRA", "NGA", "CHN", "AUS"]),
  card(d2("anesthesia"), null, null, ["BRA", "NGA", "JPN", "AUS"]),
  card(d2("chess"), null, null, ["GRC", "BRA", "IND", "AUS"]),
  card(d2("rhinoplasty"), null, null, ["BRA", "IND", "AUS", "ZAF"]),
  card(d2("rope-bridge"), "Which country still rebuilds a rope suspension bridge every year?", "The rope bridge rebuilt each year", ["JPN", "PER", "AUS", "ZAF"]),
  card(d2("fork"), null, null, ["BRA", "CHN", "NGA", "AUS"]),
  card(d2("windmill"), "Which country still grinds grain with ancient vertical-axis windmills?", "Ancient vertical-axis windmills", ["BRA", "IRN", "JPN", "AUS"]),
  fresh("chinese-checkers", "Chinese checkers", "Which country invented the board game later called Chinese checkers?", "DEU", ["CHN", "BRA", "DEU", "JPN"],
    "Ravensburger published Stern-Halma in Germany in 1892, Halma on a six-pointed star. An American doctor, George Howard Monks, had invented square-board Halma in 1883. J. Pressman & Co. sold the star game in the United States in 1928 and named it Chinese checkers. The game is not Chinese.",
    "Traditional Games, Halma and Chinese Checkers",
    "https://www.tradgames.org.uk/games/Halma.htm"),
  fresh("hawaiian-pizza", "Hawaiian pizza", "Which country first put pineapple on pizza and sold it as Hawaiian?", "CAN", ["BRA", "CAN", "JPN", "AUS"],
    "Sam Panopoulos, who had come from Greece, put canned pineapple and ham on a pizza in 1962 at the Satellite Restaurant in Chatham, Ontario. He told the BBC the name came off the pineapple can.",
    "BBC News, Meet the Ontario man who created pineapple pizza",
    "https://www.bbc.com/news/world-us-canada-39072331"),
];

const day3 = [
  card(d3("mobile-money"), null, null, ["BRA", "KEN", "JPN", "AUS"]),
  card(d3("variolation"), null, null, ["BRA", "TUR", "JPN", "AUS"]),
  card(d3("quarantine"), null, null, ["FRA", "HRV", "BRA", "JPN"]),
  card(d3("algebra"), null, null, ["BRA", "IRN", "JPN", "AUS"]),
  card(d3("algorithm"), "Which country does the word algorithm come from?", "The word algorithm", ["BRA", "JPN", "IRN", "AUS"]),
  card(d3("cheque"), "Which country used the written payment order behind the word cheque?", "The word cheque", ["BRA", "JPN", "IRQ", "AUS"]),
  card(d3("clinical-trial"), null, null, ["BRA", "JPN", "IRN", "AUS"]),
  card(d3("oldest-school"), null, null, ["BRA", "MAR", "JPN", "AUS"]),
  card(d3("paper-money"), null, null, ["BRA", "NGA", "CHN", "AUS"]),
  fresh("russian-roulette", "The term Russian roulette", "Which country first printed the term Russian roulette?", "USA", ["BRA", "USA", "JPN", "AUS"],
    "The first printed use is Georges Surdez's story in Collier's on 30 January 1937. The Oxford English Dictionary's earliest citation is that American magazine. In the story, Russian officers play the game in Romania in 1917, but no earlier document shows it. Surdez was born in Switzerland.",
    "Swiss National Museum, A Swiss-born author's dangerous game",
    "https://blog.nationalmuseum.ch/en/2025/01/invention-of-russian-roulette/"),
  fresh("chicken-tikka", "Chicken tikka masala", "Which country is usually credited with chicken tikka masala?", "GBR", ["BRA", "GBR", "JPN", "AUS"],
    "The dish is usually credited to Britain, often to Ali Ahmed Aslam at the Shish Mahal in Glasgow in the 1970s. The BBC says that origin cannot be proved. Another Glasgow cook dated it to the 1950s, and the story is disputed.",
    "BBC News, Glaswegian who invented chicken tikka masala dies",
    "https://www.bbc.co.uk/news/uk-scotland-glasgow-west-64055639"),
];

const DAYS = {
  "who-invented-it": day1,
  "who-invented-older": day2,
  "who-invented-words": day3,
};
const EXTRA = {
  "who-invented-it": " Häagen-Dazs was made up in the Bronx, and Thomas' English muffins were first sold in New York.",
  "who-invented-older": " Chinese checkers began in Germany. Hawaiian pizza was first sold in Canada.",
  "who-invented-words": " The term Russian roulette was first printed in the United States. Chicken tikka masala is usually credited to Britain, and that origin is disputed.",
};

for (const [id, qs] of Object.entries(DAYS)) {
  if (qs.length !== 11) throw new Error(id + " count " + qs.length);
  console.log(id, qs.map(q => q.id + ":" + q.answer).join(" "));
}

function replaceBalanced(text, marker, key, value) {
  const at = text.indexOf(marker);
  if (at < 0) throw new Error("missing " + marker);
  const keyAt = text.indexOf('"' + key + '":', at);
  const bracket = text.indexOf("[", keyAt);
  if (keyAt < 0 || bracket < 0) throw new Error("missing " + key + " after " + marker);
  let depth = 0, inStr = false, esc = false;
  for (let i = bracket; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0 && c === "]") return text.slice(0, bracket) + JSON.stringify(value) + text.slice(i + 1);
    }
  }
  throw new Error("unterminated " + key);
}

function patch(file, withRows) {
  let text = fs.readFileSync(path.join(root, file), "utf8");
  for (const [id, qs] of Object.entries(DAYS)) {
    const marker = '"id":"' + id + '"';
    text = replaceBalanced(text, marker, "questions", qs);
    if (withRows) {
      const rows = qs.map((q, i) => [q.answer, i + 1, q.prompt]);
      text = replaceBalanced(text, marker, "rows", rows);
    }
    const oldFact = puzzles.find(p => p.id === id).fact;
    const extra = EXTRA[id];
    const tag = extra.trim().slice(0, 24);
    if (oldFact.includes(tag)) continue;
    if (!text.includes(oldFact)) throw new Error("fact missing in " + file + " " + id);
    text = text.replace(oldFact, oldFact + extra);
  }
  fs.writeFileSync(path.join(root, file), text);
}

patch("puzzles-data.js", false);
patch("practice-data.js", true);

const csvPath = path.join(root, "puzzles.csv");
let csv = fs.readFileSync(csvPath, "utf8");
for (const [id, extra] of Object.entries(EXTRA)) {
  const oldFact = puzzles.find(p => p.id === id).fact;
  const tag = extra.trim().slice(0, 24);
  if (oldFact.includes(tag) || csv.includes(tag)) continue;
  if (!csv.includes(oldFact)) throw new Error("csv fact missing " + id);
  csv = csv.replace(oldFact, oldFact + extra);
}
fs.writeFileSync(csvPath, csv);
console.log("rewrote three quiz days");
