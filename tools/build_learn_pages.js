/* Build the static /learn pages from puzzle data already in the repo.
   Run: node tools/build_learn_pages.js
   Prose only restates values, facts, and source lines from those files. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
function load(file, key) {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), box, { filename: file });
  return box.window[key];
}
const puzzles = load("puzzles-data.js", "RANKD_PUZZLES");
const practice = load("practice-data.js", "RANKD_PRACTICE");
const stats = load("number-stats.js", "RANKD_NUMBER_STATS");
const numberSets = load("number-puzzles.js", "RANKD_NUMBER");
const byId = id => puzzles.find(p => p.id === id);
const countries = practice.countries;
const nameOf = iso => (countries[iso] && countries[iso][0]) || iso;

function fmt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  if (Math.abs(x) >= 1000 && Number.isInteger(x)) return x.toLocaleString("en-US");
  const s = x.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return s;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function words(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
}

const ADS = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5196178239625142" crossorigin="anonymous"></script>`;

function page({ file, title, description, body, playHref }) {
  const url = "https://ranki.gg/" + file;
  const depth = file.split("/").length - 1;
  const rel = depth ? "../".repeat(depth) : "";
  const play = playHref || (rel + "index.html");
  return `<!doctype html>
<html lang="en">
<head>
  <link rel="icon" href="${rel}favicon.svg" type="image/svg+xml">
  <link rel="manifest" href="/manifest.webmanifest" type="application/manifest+json">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="ranki.gg">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="ranki.gg">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="https://ranki.gg/og.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="theme-color" content="#3B5BFF">
  <meta name="google-adsense-account" content="ca-pub-5196178239625142">
  <link rel="canonical" href="${esc(url)}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="${rel}styles.css">
${ADS}
<script src="${rel}site-config.js"></script>
<script src="${rel}pages.js"></script>
<script src="${rel}pwa.js"></script>
</head>
<body class="static-page">
<header class="page-top"><a class="hero-brand" href="${rel}index.html">ranki.gg</a><a class="play-link" href="${esc(play)}">Play this puzzle →</a></header>
<main class="page">
${body}
</main>
<footer class="foot">
  ranki.gg · Rank the stats. A daily game of surprising stats.
  <nav class="foot-links" aria-label="Site"><a href="${rel}index.html">Play</a><a href="${rel}learn/index.html">Learn</a><a href="${rel}about.html">About</a><a href="${rel}how-to-play.html">How to play</a><a href="${rel}sources.html">Sources</a><a href="${rel}privacy.html">Privacy</a><a href="${rel}terms.html">Terms</a><a href="mailto:mikelyaps@gmail.com" data-contact-link>Contact</a></nav>
</footer>
</body>
</html>
`;
}

function table(rows, unit) {
  const body = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td class="num">${esc(fmt(r.value))}</td></tr>`).join("");
  return `<table>
<thead><tr><th>#</th><th>Country</th><th>${esc(unit)}</th></tr></thead>
<tbody>${body}</tbody>
</table>`;
}

function walk(rows, unit) {
  const lead = Number(rows[0].value);
  const bits = [`${rows[0].name} leads this table at ${fmt(rows[0].value)} ${unit}.`];
  const rest = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1], row = rows[i];
    const gap = Math.abs(Number(prev.value) - Number(row.value));
    rest.push(`${row.name} at ${fmt(row.value)} (${fmt(gap)} ${unit} under ${prev.name})`);
  }
  if (rest.length) bits.push("After that: " + rest.join("; ") + ".");
  const bot = Number(rows[rows.length - 1].value);
  if (bot > 0) {
    bits.push(`${rows[0].name} is ${fmt(lead / bot)} times ${rows[rows.length - 1].name}. That multiple is the top row divided by the bottom row of this same table.`);
  }
  const ranked = rows.filter(r => r.gRank && r.gTotal);
  if (ranked.length) {
    bits.push(`In the wider list of ${ranked[0].gTotal} stored on the puzzle, ${ranked.map(r => `${r.name} is number ${r.gRank}`).join(", ")}.`);
  }
  return bits.join(" ");
}

function rankArticle(p, extra) {
  const rows = (p.items || []).map(it => ({ name: it.name, value: it.value, gRank: it.gRank, gTotal: it.gTotal }));
  const unit = p.unit || p.stat;
  const highFirst = p.higherIs !== "bottom";
  const ordered = rows.slice().sort((a, b) => highFirst ? b.value - a.value : a.value - b.value);
  const body = `
<h1>${esc(p.headline)}</h1>
<p class="lede">${esc(p.question || p.stat)}</p>
<p>This ranki.gg Rank it uses one measure: ${esc(p.stat)}${p.unit ? `, in ${esc(p.unit)}` : ""}${p.year ? `, ${esc(p.year)}` : ""}. The countries on the card are ${ordered.map(r => esc(r.name)).join(", ")}. You do not have to recall the numbers from memory. They sit in a column. The job is to match each country to the value that belongs to it, then lock the order in. Five tries. A card in the right spot locks. A card in the wrong spot turns red so you can move it.</p>
<p>${esc(p.fact || "")}</p>
<h2>The countries on the card</h2>
${table(ordered, unit)}
<p>${esc(walk(ordered, unit))}</p>
<p>${extra || ""}</p>
<p>The source line on the puzzle is: ${esc(String(p.source || "").replace(/\.\s*$/, ""))}. ${p.caveat ? esc(p.caveat) : "The puzzle does not add a separate caveat beyond that source line and the fact above."} ranki.gg does not invent a value that is missing from that source. If two countries were so close that the order would depend on rounding, they would not be the pair the card asks you to separate.</p>
<p>When you finish the puzzle, the answer screen repeats the order, the fact, and a link to the source. That link is the same URL cited here: <a href="${esc(p.sourceUrl)}">${esc(p.sourceUrl)}</a>.</p>
<p><a href="../index.html#p=${esc(p.id)}">Play this puzzle</a>.</p>`;
  return { title: `${p.headline} · ranki.gg`, description: p.stat.slice(0, 150), body, id: p.id };
}

const articles = [];

function addRank(id, extra) {
  const built = rankArticle(byId(id), extra);
  articles.push({ file: `learn/${id}.html`, ...built, play: `../index.html#p=${id}` });
}

addRank("rice", "Bangladesh and the Philippines are the high end of this five because the fact says rice is eaten at almost every meal there. China's lower average is explained in the same fact: the north lives on wheat. Japan's lower number is the fact's point that Japan eats far less rice than it used to. Italy, at the bottom of this card, is the contrast with a wheat-and-pasta diet. The note on the fact says this is FAO food supply, which is food available for consumption, not a weighed plate.");
addRank("garlic", "The fact on the puzzle is the reason Italy sits at the bottom of a card people expect it to lead. Heavy garlic use is mainly southern, not a national average, and the fact ties Italian-American cooking to the immigrants who came from the south and Sicily between 1880 and 1920. The source line says the kilograms are production plus imports minus exports, divided by population, for 2023, computed for ranki.gg from FAOSTAT. The fact's own note says this is supply, not food eaten.");
addRank("work-hours", "The fact gives the reason the order is not 'rich countries work less, full stop.' Indonesia leads on long informal and farm hours. Greece still beats Germany because part-time work is rare in Greece and common in Germany. The hours are average annual hours worked per worker from the Penn World Table via Our World in Data, not a legal work week.");
addRank("happiness", "The fact says Costa Rica and Mexico outscore the richer United States and United Kingdom, and that these Cantril ladder scores track social support and health more than income. Japan is the low end of this five. The ladder is a 0 to 10 life-satisfaction score in the World Happiness Report, as processed by Our World in Data.");
addRank("hdi-quality", "The fact is the surprise on this card: the United Arab Emirates at 0.940 edges the United States at 0.938. It also says the UAE rose 27 places since 2015, and that its index grew 1.04 percent a year from 2010 to 2023, against 0.10 percent a year in the United States. Hong Kong at 0.955 is described as 8th of 193. Iceland leads this six. Nigeria is the low end. The index is the UNDP Human Development Report 2025 figure for 2023, on a 0 to 1 scale.");
addRank("forest", "The fact says Japan is more forested than Brazil because steep mountains were hard to farm, Edo-era rules protected the woods, and Japan imports most of its timber, while Brazil cleared land for cattle and soy. The note says the measure is share of land, not hectares. The source is the FAO Global Forest Resources Assessment via the World Bank. Canada, the United States, and the United Kingdom complete the five, each with a smaller share than Japan.");
addRank("onions", "The fact says Tajik cooking, especially plov, uses onions by the kilo, which is why a small country leads this card, and that India's onion dishes add up to much less per person. Senegal is second on this five. The United States and the Philippines are the low end. The source is UN FAO food balances via Our World in Data: onions available for consumption per person, not a market survey of recipes.");
addRank("renewables", "The fact is the warning on the card. Uganda's share beats Norway's because firewood and charcoal count as renewable. A high share here often means energy poverty, not a grid of green power plants. The note says the figure is a share of final energy for 2021. India, the United States, and Saudi Arabia step down the table. The source is the World Bank's SDG 7.2 tracking series, drawing on the IEA, IRENA, the UN Statistics Division, the WHO, and the World Bank.");
addRank("top5-potatoes", "The fact puts Belarus first at the kilograms on the card, with Ukraine next, and says Ireland, the country people name first, is only number 10 in the wider list at the Ireland value shown here. India is described as number 90 in that wider list. Potatoes are a staple crop and a staple food in Belarus. The figure is FAO food available for consumption, not what is eaten at the table. Poland and the United States sit between Ireland and India on this six.");
addRank("life-expectancy-b", "The fact says Albania outlives Russia because Russian men die young from alcohol and heart disease, and that Nigeria's life expectancy is the lowest in the World Bank series. Japan leads this five. Brazil sits between Albania and Russia. The source is the World Bank series SP.DYN.LE00.IN, life expectancy at birth, from the UN Population Division, for 2024.");
addRank("english-speakers", "The fact leaves the United States off this five on purpose and still quotes its 299.3 million English speakers as the number just above India. Nigeria has more English speakers than Pakistan on this card. Indonesia has more than the Philippines, and more than the United Kingdom, which is why the UK does not make this five. The fact says the counts are people who say they speak English, and that the census years differ. The source is Wikipedia's list of countries by English-speaking population, total English speakers column.");
addRank("one-time-zone-pop", "The fact says India is ahead of China, and that both keep a single legal time. China's row is UTC+8 because unofficial Xinjiang Time is not counted. Pakistan is third. The United States is off this list because the same Wikipedia table gives it 11 zones once Baker Island and Wake Island are included. Ethiopia is described as larger than Japan and just missing this six. Nigeria and Bangladesh are the fourth and fifth names on the card. Population is the World Bank total for 2024. A country is included only when the Wikipedia time-zone table says 1.");
addRank("most-spoken", "The fact says English leads only through second languages, because Mandarin has far more native speakers, and that Standard Arabic has almost no native speakers because children learn a local dialect first, yet Standard Arabic still edges French. Hindi and Spanish are the middle of this six. The counts are total speakers, native plus second language, from the Ethnologue 29th edition as cited on the Wikipedia list the source line names.");

function tierValuesAreCodes(p) {
  const n = (p.tiers || []).length;
  return (p.items || []).every(it => Number(it.value) === n - it.tierIndex);
}
function tierTable(p) {
  const coded = tierValuesAreCodes(p);
  const rows = (p.items || []).slice().sort((a, b) => a.tierIndex - b.tierIndex || a.name.localeCompare(b.name));
  const head = coded
    ? `<tr><th>Country</th><th>Tier</th></tr>`
    : `<tr><th>Country</th><th>Tier</th><th class="num">${esc(p.unit || p.stat)}</th></tr>`;
  const body = rows.map(it => {
    const label = (p.tiers[it.tierIndex] || {}).label || "";
    return coded
      ? `<tr><td>${esc(it.name)}</td><td>${esc(label)}</td></tr>`
      : `<tr><td>${esc(it.name)}</td><td>${esc(label)}</td><td class="num">${esc(fmt(it.value))}</td></tr>`;
  }).join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
function tierArticle(p, extra) {
  const labels = (p.tiers || []).map(t => t.label);
  const groups = labels.map((label, i) => ({
    label,
    names: (p.items || []).filter(it => it.tierIndex === i).map(it => it.name),
  }));
  const lines = groups.map(g => `${g.label}: ${g.names.join(", ") || "none on this card"}.`).join(" ");
  const body = `
<h1>${esc(p.headline)}</h1>
<p class="lede">${esc(p.question || p.stat)}</p>
<p>This is a Tier it, not a rank from highest to lowest. Several countries can share a tier. The measure is ${esc(p.stat)}. The tiers on this card are ${labels.map(esc).join(", ")}. You drop each country into a tier and lock it in. A right tier locks. A wrong one turns red. You get five tries.</p>
<p>${esc(p.fact || "")}</p>
<h2>Who sits in which tier</h2>
${tierTable(p)}
<p>${esc(lines)}</p>
<p>${extra || ""}</p>
<p>The source line is: ${esc(String(p.source || "").replace(/\.\s*$/, ""))}. Nothing on this page adds a country or a tier that the puzzle does not already list. <a href="${esc(p.sourceUrl)}">${esc(p.sourceUrl)}</a></p>
<p><a href="../index.html#p=${esc(p.id)}">Play this puzzle</a>.</p>`;
  return body;
}

articles.push({
  file: "learn/language-family.html",
  title: "Language families · ranki.gg",
  description: "Which family the main language sits in, from the ranki.gg Tier it.",
  id: "language-family",
  body: tierArticle(byId("language-family"), "Germany and Iran share the Indo-European tier because the fact says Persian is Indo-European even though it is written in the Arabic script, while Arabic itself is Semitic. Hungary, Finland, and Estonia share the Uralic tier, beside Indo-European neighbors. Turkey and Kazakhstan share the Turkic tier. The fact says Kazakh is still mainly written in Cyrillic, which is why it looks Slavic, and that a 2017 decree ordered a Latin alphabet with the deadline later moved to 2031. Mongolia is alone in the Mongolic tier. The fact says Mongolia also writes Mongolian in Cyrillic, so the script is the trap: Mongolian is not Slavic and it is not Turkic. The fact names Vietnamese as Austroasiatic and Maltese as Semitic, inside Afroasiatic, and says both use the Latin alphabet, but neither is a chip on this eight-country card."),
});
articles.push({
  file: "learn/finger-count-one-hand.html",
  title: "Counting on one hand · ranki.gg",
  description: "How many numbers one hand can show, from the BBC Future methods on the ranki.gg card.",
  id: "finger-count-one-hand",
  body: tierArticle(byId("finger-count-one-hand"), "The values on the chips are the ones the tiers name. India is in the 12-or-more tier because the fact says India counts the lines between finger segments, four to a finger, so one hand reaches 20. China is in the counts-to-10 tier: the fact says China counts to five the way the United States does, then shows six through ten as gestures on that same hand, with six as the thumb and the pinky. The United States, Iran, and the United Kingdom are in the counts-to-5 tier. The fact distinguishes them anyway: the United Kingdom runs from thumb to pinky, the United States from index finger to thumb, and Iran starts at the pinky. The source is a BBC Future article from 3 September 2021, and the fact says the country methods are the ones that article describes, including a quote from Andrea Bender on how much finger counting varies. The fact also says the article does not name Pakistan, Bangladesh, Vietnam, Turkey, or Egypt, so those countries are not on this card."),
});
articles.push({
  file: "learn/time-zones-by-country.html",
  title: "How many time zones · ranki.gg",
  description: "Standard time zones by country, including territories, from the Wikipedia table ranki.gg uses.",
  id: "time-zones-by-country",
  body: tierArticle(byId("time-zones-by-country"), "France and the United States are in the 10-or-more tier. The fact says France has 12 because overseas territories count, and would have 13 only if its Antarctic claim were included. The United States has 11, the same count the fact gives Russia, once Baker Island and Wake Island are counted, not the four zones of the mainland. Russia is not a chip on this six. The United Kingdom is in the 5-to-9 tier at 9, the same number the fact gives Australia, almost all of them outside Great Britain. Australia is not a chip here either. South Africa and Kiribati are in the 2-to-4 tier. The fact says South Africa has 2 only because of the Prince Edward Islands, and Kiribati has 3, including UTC+14. China is alone in the one-zone tier. The source counts standard UTC offsets. Dependent territories are included, Antarctic claims are not, and daylight saving is not an extra zone. Unofficial offsets count only when that table lists them, which is why the source line says Australia includes UTC+08:45 and China does not include Xinjiang Time. The fact adds that no country on the wider list has 6, 7, or 8."),
});

function quizArticle() {
  const p = byId("who-invented-it");
  const rows = p.questions.map(q => {
    const right = (q.options || []).find(o => o.iso3 === q.answer);
    const first = String(q.fact || "").split(/(?<=\.)\s/)[0];
    return { prompt: q.prompt || q.id, ask: q.ask, answer: right ? right.name : q.answer, first };
  });
  const tableRows = rows.map(r => `<tr><td>${esc(r.prompt)}</td><td>${esc(r.answer)}</td></tr>`).join("");
  const blocks = rows.map(r => `<p><b>${esc(r.prompt)}.</b> ${esc(r.ask)} Answer: ${esc(r.answer)}. ${esc(r.first)}</p>`).join("\n");
  const body = `
<h1>Who invented it?</h1>
<p class="lede">Eleven multiple-choice questions from the ranki.gg quiz. Four countries each, one answer, then the fact.</p>
<p>${esc(p.fact)}</p>
<p>Each question is one shot. You tap a country, then lock it in. The caveat says the question says exactly what is being asked, and the reveal names the rival claim. The day-level source line points at Emojipedia for the first emoji set. Every other card has its own source in the game. Nothing here adds an invention the quiz does not already state.</p>
<h2>The answer on each card</h2>
<table>
<thead><tr><th>Question</th><th>Answer</th></tr></thead>
<tbody>${tableRows}</tbody>
</table>
${blocks}
<p><a href="../index.html#p=who-invented-it">Play this puzzle</a>.</p>`;
  return body;
}
articles.push({
  file: "learn/who-invented-it.html",
  title: "Who invented it? · ranki.gg",
  description: "The eleven who-invented-it answers and the fact printed on each card.",
  id: "who-invented-it",
  body: quizArticle(),
});

function seriesArticle(statId, title, lede, extra, playId) {
  const stat = stats.find(s => s.id === statId);
  const set = numberSets.find(s => s.id === statId);
  const rows = stat.rows.map(r => ({ name: nameOf(r[0]), value: r[1], iso: r[0] })).sort((a, b) => b.value - a.value).slice(0, 8);
  const samples = (set.pairs || []).slice(0, 4).map(pair => pair.fact).join(" ");
  const body = `
<h1>${esc(title)}</h1>
<p class="lede">${esc(lede)}</p>
<p>The measure is ${esc(stat.stat)}, in ${esc(stat.unit)}, year ${esc(stat.year)}. The source note stored with the series says: ${esc(stat.source)}</p>
<h2>Eight high values in the series</h2>
${table(rows, stat.unit)}
<p>${esc(walk(rows, stat.unit))}</p>
<h2>Contrasts already written for Guess the number</h2>
<p>Guess the number shows one country's real value and asks you to type another. These fact lines are the ones stored with the pairs. They are not a new claim.</p>
<p>${esc(samples)}</p>
<p>${extra}</p>
<p>Link to the source: <a href="${esc(stat.sourceUrl)}">${esc(stat.sourceUrl)}</a>.</p>
<p><a href="${playId ? "../index.html#p=" + playId : "../index.html"}">Play this puzzle</a>.</p>`;
  return body;
}

articles.push({
  file: "learn/tea-supply.html",
  title: "Tea and mate supply · ranki.gg",
  description: "FAOSTAT 2023 food supply of tea, including mate, in kilograms per person.",
  id: "number-tea",
  body: seriesArticle("number-tea", "Tea and mate supply", "Kilograms per person of tea, including yerba mate, available for food in 2023.", "Sri Lanka and Kenya lead this top eight because they grow tea and the account is food supply, not cups drunk. Argentina and Paraguay are high because the FAO item includes yerba mate. Turkey is the drinking-country surprise against the United Kingdom, and that comparison is one of the stored Guess the number facts, not a second source. The play link opens the daily game. Guess the number draws pairs from these FAOSTAT rows. This page does not use any other tea list.", null),
});
articles.push({
  file: "learn/coffee-supply.html",
  title: "Coffee supply · ranki.gg",
  description: "FAOSTAT 2023 food supply of coffee and products, kilograms per person.",
  id: "number-coffee",
  body: seriesArticle("number-coffee", "Coffee supply", "Kilograms per person of coffee and products available for food in 2023, in primary equivalent.", "Hong Kong leads this top eight. The stored Guess the number fact says that figure is a trading port's estimated supply, not kilograms drunk. Finland, Sweden, and Denmark are the drinking countries the same facts compare with Italy. A port and a cafe culture are not the same kind of number, which is why the source note says supply, not cups.", null),
});
articles.push({
  file: "learn/cocoa-supply.html",
  title: "Cocoa supply · ranki.gg",
  description: "FAOSTAT 2023 food supply of cocoa beans and products, kilograms per person.",
  id: "number-cocoa",
  body: seriesArticle("number-cocoa", "Cocoa supply", "Kilograms per person of cocoa beans and products available for food in 2023.", "Cote d'Ivoire leads the top eight as a grower. Switzerland is not in this top eight. The stored facts say Switzerland exports the bars, so the cocoa that stays for residents is lower than the United Kingdom and France. The Netherlands is the extreme version of that export account: the stored fact says almost none stays as food supply. The source note says a grinding country can look low because the cocoa does not stay.", null),
});

const learnItems = articles.map(a => ({ href: a.file.replace("learn/", ""), title: a.title.replace(" · ranki.gg", ""), desc: a.description }));

const indexBody = `
<h1>Learn the numbers</h1>
<p class="lede">Short explainers for ranki.gg puzzles that stay on the safe side of the schedule. Every figure is copied from the puzzle or the series already in the game.</p>
<p>These pages do not add a dataset, a country, or a cause that the game's own fact and source line do not already state. Sensitive topics are not written up here. They stay in the daily game only after the AdSense-safe date set in the app, and they are not linked from this index.</p>
<p>Each explainer has the countries on that card or the top of that series, the unit, the source, and a link that opens the puzzle. Rank it pages walk the order from high to low. Tier it pages name who shares a tier. The quiz page repeats each card's fact. Guess the number pages use the FAO and World Bank series stored for tea, coffee, and cocoa.</p>
<ul class="learn-list">
${learnItems.map(item => `<li><a href="${esc(item.href)}">${esc(item.title)}<span>${esc(item.desc)}</span></a></li>`).join("\n")}
</ul>
<p>More on how a round works: <a href="../how-to-play.html">How to play</a>. Where the publishers come from: <a href="../sources.html">Data sources and methodology</a>.</p>`;

articles.push({
  file: "learn/index.html",
  title: "Learn · ranki.gg",
  description: "Explainers for ranki.gg puzzles, built only from the numbers and sources already in the game.",
  body: indexBody,
  play: "../index.html",
});

const sourcesBody = `
<h1>Data sources and methodology</h1>
<p class="lede">ranki.gg does not invent a number. If a figure is not in a cited source, it is not on a card.</p>
<p>Every puzzle stores a source line, a URL, a year when the publisher has one, and a short fact. The fact is allowed to explain a contrast that the same source supports. It is not allowed to smuggle in a second, unsourced statistic. Where a measure is easy to misread, the fact or the caveat says so in plain words. Food-supply figures are kilograms available for consumption, not a weighed dinner. A renewable-energy share can be firewood. A time-zone count includes territories and leaves out daylight saving. An English-speaker count is people who say they speak English, and the census years differ.</p>
<h2>Publishers used on the learn pages</h2>
<ul>
  <li><b>Our World in Data and the UN FAO.</b> Rice, potatoes, and onions use FAO food balances as published by Our World in Data: food available for consumption, kilograms per person per year.</li>
  <li><b>FAOSTAT.</b> Garlic is item 406, production plus imports minus exports, divided by population, for 2023, computed from FAOSTAT and labeled as supply, not food eaten. Tea (including mate), coffee and products, and cocoa beans and products are Food Balance Sheet food-supply quantities for 2023, in kilograms per person. FAO marks those 2023 supply rows as estimated. Tea includes yerba mate. Coffee is in primary equivalent. China in those three series is the mainland row, so Hong Kong and Taiwan stay separate.</li>
  <li><b>World Bank and UN DESA.</b> Life expectancy at birth is SP.DYN.LE00.IN for 2024, from the UN Population Division, which is the population division of UN DESA. Forest area as a share of land is the FAO Global Forest Resources Assessment via the World Bank. Renewable energy as a share of final energy is the World Bank SDG 7.2 series for 2021, drawing on the IEA, IRENA, the UN Statistics Division, the WHO, and the World Bank. Population for the one-time-zone card is SP.POP.TOTL for 2024. Hours worked come from the Penn World Table via Our World in Data.</li>
  <li><b>UNDP.</b> The Human Development Index on the quality-of-life card is the Human Development Report 2025 figure for 2023, on a 0 to 1 scale.</li>
  <li><b>World Inequality Database (WID.world).</b> A Top 1 card uses the wealth share of the richest 1 percent, published by WID via Our World in Data. That card is not written up on the learn pages. The figure on it is a share of wealth, not income per person.</li>
  <li><b>Ethnologue, via the Wikipedia list the puzzle cites.</b> Total speakers are native plus second language, 29th edition.</li>
  <li><b>Wikipedia tables the puzzles name.</b> Time zones are the list of time zones by country: standard UTC offsets, territories included, Antarctic claims excluded, daylight saving not an extra zone. English speakers are that list's total column. The quiz cards each link their own article, from Emojipedia to the Cambridge coffee-pot timeline.</li>
  <li><b>BBC Future, 3 September 2021.</b> The finger-counting card uses only the country methods that article describes.</li>
  <li><b>Glottolog, plus the alphabet notes the language-family fact cites.</b> Indo-European, Uralic, Turkic, and Mongolic are the four tiers on that card.</li>
  <li><b>UNODC and WHO.</b> Some later dailies use international crime statistics from UNODC and health statistics from the World Health Organization. Those topics are not written up on the learn pages. The game keeps them off the AdSense-safe dates.</li>
</ul>
<h2>What a card is allowed to do</h2>
<p>A Rank it shows the values and asks you to match countries to them. A Tier it asks which countries share a label. A multiple-choice question has four countries and one answer, then the fact. Guess the number shows one real value and asks for another. Top 1 asks which country is first in a longer list. The weight of a part in the daily bundle is separate from how accurate your guess was. The learn pages do not score you. They only show the table and the fact.</p>
<p>Spotted a copied figure that does not match the linked source? Write to <a href="mailto:mikelyaps@gmail.com">mikelyaps@gmail.com</a> with the puzzle name, the country, and the URL. That address is the contact address stored for the site. Corrections are how the tables stay tied to the publisher.</p>
<p><a href="learn/index.html">Browse the explainers</a>.</p>`;

articles.push({
  file: "sources.html",
  title: "Data sources and methodology · ranki.gg",
  description: "Where ranki.gg numbers come from: World Bank, FAO, FAOSTAT, UNDP, Our World in Data, and the tables each puzzle cites.",
  body: sourcesBody,
  play: "index.html",
});

const contactBody = `
<h1>Contact</h1>
<p class="lede">The contact address for ranki.gg is <a href="mailto:mikelyaps@gmail.com">mikelyaps@gmail.com</a>.</p>
<p>ranki.gg is made by Michael Yao. That mailbox is the one stored in the site config and printed on the about page, the privacy policy, and the terms. Use it for a wrong number, a broken source link, a privacy question, or a puzzle you want the game to consider.</p>
<h2>A data correction</h2>
<p>Name the puzzle, the country or the person, the figure you saw, and the publisher URL that disagrees. The about page says corrections are welcome and get fixed. Do not send account passwords, payment card numbers, or anything else that is private. The privacy policy says puzzle suggestions can include an optional name or handle, and that the page cannot read those suggestions back.</p>
<h2>Privacy and ads</h2>
<p>Questions about the anonymous score row, the sign-in session, or Google AdSense cookies go to the same address. The <a href="privacy.html">privacy policy</a> is the full account of what stays in the browser and what Google does with advertising cookies. Personalised-ad choices are made at <a href="https://adssettings.google.com/">Google Ads Settings</a>, not by emailing a new preference into the game.</p>
<h2>Playing the game</h2>
<p>You do not need to email anyone to play. Today's puzzle is on the <a href="index.html">home page</a>. The rules for each mode are on <a href="how-to-play.html">How to play</a>. The explainers are on <a href="learn/index.html">Learn</a>. The publishers behind those pages are listed on <a href="sources.html">Data sources and methodology</a>.</p>
<p>If you are writing about a number on a learn page, quote the table and the source URL on that page. The learn pages are static copies of figures already stored with the puzzles. A mismatch means the page and the puzzle drifted, and that is the report we want. Include the page address, the country, and the figure you expected. We would rather fix a copied digit than guess which card you meant.</p>`;

articles.push({
  file: "contact.html",
  title: "Contact · ranki.gg",
  description: "Contact ranki.gg at the published email for corrections, privacy questions, and puzzle ideas.",
  body: contactBody,
  play: "index.html",
});

const outDir = path.join(root, "learn");
fs.mkdirSync(outDir, { recursive: true });
const counts = [];
for (const article of articles) {
  const html = page({
    file: article.file,
    title: article.title,
    description: article.description,
    body: article.body,
    playHref: article.play,
  });
  const n = words(article.body);
  counts.push({ file: article.file, words: n, title: article.title });
  fs.writeFileSync(path.join(root, article.file), html);
}
const bad = counts.filter(c => c.file.startsWith("learn/") && c.file !== "learn/index.html" && (c.words < 300 || c.words > 650));
if (bad.length) {
  console.log(bad);
  throw new Error("word count");
}
console.log(counts.map(c => c.words + "\t" + c.file).join("\n"));
