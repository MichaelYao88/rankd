// Writes the crawlable daily pages into _site/daily/.
//
// The game itself is a single page: Google sees the homepage shell and the
// learn pages, but none of the daily puzzles. This generator turns every day
// that has already gone live into a plain HTML page with the question, the
// published table, the fact, the caveat and the source, plus a paginated
// archive index. Nothing in the future is published.
//
// It reads the built site (not the repository) so it inherits the review
// substitutions from tools/build_review_site.js: a day whose restricted parts
// were replaced on the live site is written with the replacements too.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { banned } = require("./review_terms");

const root = path.join(__dirname, "..");

function todayKey() {
  const fixed = process.env.RANKD_TODAY;
  if (fixed && /^\d{4}-\d{2}-\d{2}$/.test(fixed)) return fixed;
  return new Date().toISOString().slice(0, 10);
}

function bootSite(siteDir) {
  const document = {
    documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    head: { appendChild() {} }, addEventListener() {},
  };
  const box = {
    window: { RANKD_STUDIO: true },
    document,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { protocol: "http:", pathname: "/", search: "", hostname: "localhost", hash: "" },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp,
    Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error("no")), AbortController, atob,
  };
  box.globalThis = box;
  for (const key of ["document", "localStorage", "sessionStorage", "location", "matchMedia", "atob"]) box.window[key] = box[key];
  vm.createContext(box);
  const files = ["puzzles-data.js", "practice-data.js", "name-puzzles.js", "part1-puzzles.js", "invent-quiz.js", "number-stats.js", "number-puzzles.js", "number-guess.js"];
  if (fs.existsSync(path.join(siteDir, "review-play.js"))) files.push("review-play.js");
  files.push("app.js");
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(siteDir, file), "utf8"), box, { filename: file });
  return box.window;
}

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function txt(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function num(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!isFinite(n)) return esc(value);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function longDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

const MODES = {
  rank: "Rank it", top5: "Top 5", top1: "Top 1", tier: "Tier it", match: "Match it",
  name: "Name it", quiz: "Quiz", number: "Guess the number", guess: "Top 1",
};

function modeLabel(p) {
  return MODES[p.type] || "Puzzle";
}

function valueHeader(p) {
  const stat = txt(p.stat || "Value");
  const unit = txt(p.unit || "");
  return unit ? `${stat} (${unit})` : stat;
}

function itemsTable(p) {
  if (Array.isArray(p.items) && p.items.length) {
    if (Array.isArray(p.tiers) && p.tiers.length) {
      const rows = p.tiers.map((tier, i) => {
        const members = p.items.filter(it => it.tierIndex === i);
        const names = members.map(it => (it.emoji ? it.emoji + " " : "") + esc(it.name)).join(", ");
        return `<tr><td>${esc(tier.label)}</td><td>${names || "—"}</td></tr>`;
      }).join("");
      return `<table><thead><tr><th>Tier</th><th>Countries</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    const showYear = p.items.some(it => it.year && /\d/.test(String(it.year)));
    const rows = p.items.map((it, i) => {
      const cells = [
        `<td class="num">${i + 1}</td>`,
        `<td>${it.emoji ? it.emoji + " " : ""}${esc(it.name)}</td>`,
        `<td class="num">${num(it.value)}</td>`,
      ];
      if (showYear) cells.push(`<td>${esc(it.year || "")}</td>`);
      return `<tr>${cells.join("")}</tr>`;
    }).join("");
    const head = `<tr><th>#</th><th>Country</th><th>${esc(valueHeader(p))}</th>${showYear ? "<th>Year</th>" : ""}</tr>`;
    return `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }
  if (Array.isArray(p.countries) && p.countries.length) {
    const rows = p.countries.map((c, i) => `<tr><td class="num">${i + 1}</td><td>${c.emoji ? c.emoji + " " : ""}${esc(c.name)}</td><td class="num">${num(c.value)}</td><td>${esc(c.year || "")}</td></tr>`).join("");
    return `<table><thead><tr><th>#</th><th>Country</th><th>${esc(valueHeader(p))}</th><th>Year</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  if (p.known && p.ask) {
    const rows = [
      `<tr><td>${p.known.emoji ? p.known.emoji + " " : ""}${esc(p.known.name)}</td><td class="num">${num(p.known.value)}</td></tr>`,
      `<tr><td>${p.ask.emoji ? p.ask.emoji + " " : ""}${esc(p.ask.name)}</td><td class="num">${num(p.ask.value)}</td></tr>`,
    ].join("");
    return `<table><thead><tr><th>Country</th><th>${esc(valueHeader(p))}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  if (Array.isArray(p.people) && p.people.length) {
    const rows = p.people.map(person => `<tr><td>${person.emoji ? person.emoji + " " : ""}${esc(person.name)}<br><small>${esc(person.country || "")}</small></td><td>${esc(person.clue)}</td></tr>`).join("");
    const facts = p.people.filter(person => person.fact).map(person => `<p class="daily-fact"><b>${esc(person.name)}.</b> ${esc(person.fact)}</p>`).join("");
    return `<table><thead><tr><th>Person</th><th>The clue</th></tr></thead><tbody>${rows}</tbody></table>${facts}`;
  }
  if (Array.isArray(p.questions) && p.questions.length) {
    const rows = p.questions.map(q => `<tr><td>${esc(q.prompt || q.ask)}</td><td>${esc(q.answer)}</td></tr>`).join("");
    return `<table><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  if (Array.isArray(p.answers) && p.answers.length) {
    const rows = p.countries && p.countries.length
      ? p.countries.map(c => `<tr><td>${c.emoji ? c.emoji + " " : ""}${esc(c.name)}</td><td class="num">${num(c.value)}</td></tr>`).join("")
      : p.answers.map(a => `<tr><td>${esc(a)}</td><td></td></tr>`).join("");
    return `<table><thead><tr><th>Answer</th><th>${esc(p.stat || "Value")}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  return "";
}

function spreadLine(p) {
  const list = Array.isArray(p.items) && p.items.length
    ? p.items
    : Array.isArray(p.countries) && p.countries.length ? p.countries : null;
  if (!list || list.length < 2) return "";
  const top = list[0], bottom = list[list.length - 1];
  const a = Number(top.value), b = Number(bottom.value);
  if (!isFinite(a) || !isFinite(b) || a === b) return "";
  const unit = txt(p.unit || "");
  const shortUnit = unit.length > 14 || unit.includes(" of the ") ? "" : unit;
  const diff = Math.abs(a - b);
  const digits = Math.max(0, Math.min(2, (String(a).split(".")[1] || "").length));
  let line = `${esc(top.name)} leads this card at ${num(a)}, with ${esc(bottom.name)} at ${num(b)}. The gap is ${num(Number(diff.toFixed(digits)))}${shortUnit ? " " + esc(shortUnit) : ""}.`;
  if (b !== 0) line += ` ${esc(top.name)} is ${num(Number((a / b).toFixed(2)))} times ${esc(bottom.name)}.`;
  return `<p>${line}</p>`;
}

function renderPart(p, index, pageTitle) {
  const title = txt(p.headline || p.question || p.stat || "Puzzle " + (index + 1));
  const mode = modeLabel(p);
  const stat = txt(p.stat || "");
  const unit = txt(p.unit || "");
  const year = txt(p.year || "");
  const meta = [mode, stat && stat !== title ? stat : "", unit, year].filter(Boolean).join(" · ");
  const question = txt(p.question || "");
  const parts = [];
  if (title !== pageTitle) parts.push(`<h2>${esc(title)}</h2>`);
  if (meta) parts.push(`<p class="daily-meta">${esc(meta)}</p>`);
  if (question && question !== title) parts.push(`<p class="daily-ask">${esc(question)}</p>`);
  const table = itemsTable(p);
  if (table) parts.push(table);
  if (index === 0) parts.push(spreadLine(p));
  if (txt(p.fact)) parts.push(`<p>${esc(p.fact)}</p>`);
  if (txt(p.caveat)) parts.push(`<p class="daily-note">${esc(p.caveat)}</p>`);
  if (txt(p.source)) {
    const label = txt(p.source);
    const link = /^https?:\/\//.test(String(p.sourceUrl || ""))
      ? ` <a href="${esc(p.sourceUrl)}">See the source</a>.`
      : ".";
    parts.push(`<p class="daily-source">Source: ${esc(label)}${link}</p>`);
  }
  return `<section class="daily-part">\n${parts.join("\n")}\n</section>`;
}

function pageShell(opts) {
  const { date, dayNo, title, description, body, prev, next } = opts;
  const canonical = `https://ranki.gg/daily/${date}.html`;
  const nav = [
    prev ? `<a class="tab" href="${prev}.html">→ Previous day</a>` : "<span></span>",
    `<a class="tab" href="index.html">All days</a>`,
    next ? `<a class="tab" href="${next}.html">Next day →</a>` : "<span></span>",
  ].join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon-192.png" type="image/png" sizes="192x192">
<link rel="manifest" href="/manifest.webmanifest" type="application/manifest+json">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="ranki.gg">
<meta property="og:type" content="article">
<meta property="og:site_name" content="ranki.gg">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)} · ranki.gg">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="https://ranki.gg/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)} · ranki.gg">
<meta name="twitter:description" content="${esc(description)}">
<meta name="theme-color" content="#3B5BFF">
<meta name="google-adsense-account" content="ca-pub-5196178239625142">
<link rel="canonical" href="${canonical}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · ranki.gg daily puzzle #${dayNo} (${date})</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="../styles.css">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5196178239625142" crossorigin="anonymous"></script>
<script src="../site-config.js"></script>
<script src="../pages.js"></script>
<script src="../pwa.js"></script>
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished: date,
    dateModified: date,
    url: canonical,
    author: { "@type": "Person", name: "Michael Yao" },
    publisher: { "@type": "Organization", name: "ranki.gg", url: "https://ranki.gg/" },
    isPartOf: { "@type": "WebSite", name: "ranki.gg", url: "https://ranki.gg/" },
  })}</script>
</head>
<body class="static-page">
<header class="page-top"><a class="hero-brand" href="../index.html">ranki.gg</a><nav class="tabs site-links" aria-label="Site"><a class="tab" href="../about.html">About</a><a class="tab" href="../contact.html">Contact</a><a class="tab" href="../learn/index.html">Learn</a><a class="tab" href="../privacy.html">Privacy</a></nav><a class="play-link" href="../index.html#d=${date}">Play this day →</a></header>
<main class="page">
<p class="page-updated"><a href="index.html">Daily archive</a> · <time datetime="${date}">${longDate(date)}</time></p>
<h1>${esc(title)}</h1>
<p class="lede">${esc(description)}</p>
${body}
<p class="daily-cta"><a class="pill-btn outline" href="../index.html#d=${date}">Play ${date} on ranki.gg →</a></p>
<nav class="daily-nav" aria-label="Daily archive">${nav}</nav>
</main>
<footer class="foot">
  ranki.gg · Rank the stats. A daily game of surprising stats.
  <nav class="foot-links" aria-label="Site"><a href="../index.html">Play</a><a href="index.html">Daily archive</a><a href="../learn/index.html">Learn</a><a href="../about.html">About</a><a href="../contact.html">Contact</a><a href="../how-to-play.html">How to play</a><a href="../sources.html">Sources</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a></nav>
</footer>
</body>
</html>
`;
}

function indexPage(days) {
  const groups = new Map();
  for (const day of days) {
    const month = day.date.slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(day);
  }
  const blocks = [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([month, list]) => {
    const label = new Date(month + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    const rows = list.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map(day =>
      `<li><a href="${day.date}.html"><time datetime="${day.date}">${day.date}</time> — ${esc(day.title)}</a> <small>${esc(day.mode)}</small></li>`
    ).join("\n");
    return `<h2>${esc(label)}</h2>\n<ul class="daily-list">\n${rows}\n</ul>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon-192.png" type="image/png" sizes="192x192">
<link rel="manifest" href="/manifest.webmanifest" type="application/manifest+json">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="ranki.gg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ranki.gg">
<meta property="og:url" content="https://ranki.gg/daily/">
<meta property="og:title" content="Daily puzzle archive · ranki.gg">
<meta property="og:description" content="Every past ranki.gg daily puzzle: the question, the published table, the fact and the source.">
<meta property="og:image" content="https://ranki.gg/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#3B5BFF">
<meta name="google-adsense-account" content="ca-pub-5196178239625142">
<link rel="canonical" href="https://ranki.gg/daily/">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Daily puzzle archive · ranki.gg</title>
<meta name="description" content="Every past ranki.gg daily puzzle, with the question, the published table, the fact and the source for each day.">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="../styles.css">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5196178239625142" crossorigin="anonymous"></script>
<script src="../site-config.js"></script>
<script src="../pages.js"></script>
<script src="../pwa.js"></script>
</head>
<body class="static-page">
<header class="page-top"><a class="hero-brand" href="../index.html">ranki.gg</a><nav class="tabs site-links" aria-label="Site"><a class="tab" href="../about.html">About</a><a class="tab" href="../contact.html">Contact</a><a class="tab" href="../learn/index.html">Learn</a><a class="tab" href="../privacy.html">Privacy</a></nav><a class="play-link" href="../index.html">Play today's puzzle →</a></header>
<main class="page">
<h1>Daily puzzle archive</h1>
<p class="page-updated">Every day that has already gone live, newest first.</p>
<p class="lede">Each page has the day's question, the published table, the fact and a link to the source. Tomorrow's puzzle is never listed.</p>
<p>There are ${days.length} days here. <a href="../learn/index.html">The learn pages</a> explain the measures behind the cards. <a href="../how-to-play.html">How to play</a> has the rules.</p>
${blocks}
</main>
<footer class="foot">
  ranki.gg · Rank the stats. A daily game of surprising stats.
  <nav class="foot-links" aria-label="Site"><a href="../index.html">Play</a><a href="../learn/index.html">Learn</a><a href="../about.html">About</a><a href="../contact.html">Contact</a><a href="../how-to-play.html">How to play</a><a href="../sources.html">Sources</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a></nav>
</footer>
</body>
</html>
`;
}

function renderSitemap(siteDir, days) {
  const file = path.join(siteDir, "sitemap.xml");
  let text = fs.readFileSync(file, "utf8");
  const entries = ['<url><loc>https://ranki.gg/daily/</loc></url>'];
  for (const day of days.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
    entries.push(`<url><loc>https://ranki.gg/daily/${day.date}.html</loc><lastmod>${day.date}</lastmod></url>`);
  }
  // Strip any daily entries from a previous run of this generator.
  text = text.replace(/<url><loc>https:\/\/ranki\.gg\/daily\/[^<]*<\/loc>(?:<lastmod>[^<]*<\/lastmod>)?<\/url>\n?/g, "");
  text = text.replace(/<\/urlset>/, entries.join("\n") + "\n</urlset>");
  fs.writeFileSync(file, text);
}

function main() {
  const siteDir = process.argv[2] || path.join(root, "_site");
  if (!fs.existsSync(path.join(siteDir, "app.js"))) throw new Error("no built site at " + siteDir + " (run tools/build_review_site.js first)");
  const win = bootSite(siteDir);
  const epochMatch = fs.readFileSync(path.join(siteDir, "app.js"), "utf8").match(/dailyEpoch:\s*"(\d{4}-\d{2}-\d{2})"/);
  const epoch = epochMatch ? epochMatch[1] : "2026-10-06";
  const start = win.RankdShared.dayNumber(epoch);
  // Yesterday, not today: the day's answer is on the page, so today's puzzle
  // stays a puzzle. The page appears the day after the day it covers.
  const end = win.RankdShared.dayNumber(todayKey()) - 1;
  const outDir = path.join(siteDir, "daily");
  fs.mkdirSync(outDir, { recursive: true });

  const days = [];
  const files = new Map();
  for (let n = start; n <= end; n++) {
    const date = win.RankdShared.keyFromDay(n);
    const parts = win.RankdBonus.parts(n).filter(Boolean);
    if (!parts.length) continue;
    const titlePart = win.RankdBonus.titlePart(n);
    const title = txt(titlePart.headline || titlePart.question || parts[0].headline || parts[0].question);
    if (!title) continue;
    const body = parts.map((p, i) => renderPart(p, i, title)).join("\n");
    const description = txt(titlePart.question || title);
    files.set(date, { date, n, title, body, description, mode: modeLabel(titlePart) });
    days.push({ date, title, mode: modeLabel(titlePart) });
  }

  const order = [...files.keys()].sort();
  for (let i = 0; i < order.length; i++) {
    const date = order[i];
    const day = files.get(date);
    const html = pageShell({
      date,
      dayNo: day.n + 1,
      title: day.title,
      description: day.description,
      body: day.body,
      prev: i > 0 ? order[i - 1] : null,
      next: i < order.length - 1 ? order[i + 1] : null,
    });
    const hit = html.match(banned);
    if (hit) throw new Error(`restricted term "${hit[0]}" in daily/${date}.html`);
    fs.writeFileSync(path.join(outDir, date + ".html"), html);
  }
  const index = indexPage(days);
  const hit = index.match(banned);
  if (hit) throw new Error(`restricted term "${hit[0]}" in daily/index.html`);
  fs.writeFileSync(path.join(outDir, "index.html"), index);
  renderSitemap(siteDir, days);
  console.log(`daily pages: ${order.length} (${order[0]} to ${order[order.length - 1]})`);
}

if (require.main === module) main();

module.exports = { main };
