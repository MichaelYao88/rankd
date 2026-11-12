const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) {
      if (name === "node_modules" || name === "vendor" || name === "_site") continue;
      walk(abs, acc);
    } else acc.push(abs);
  }
  return acc;
}

function words(html) {
  const main = html.split("<main")[1] || html;
  const cut = main.split("</main>")[0] || main;
  return cut.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
}

test("sitemap, robots, and ads.txt stay crawlable", () => {
  const robots = read("robots.txt");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/ranki\.gg\/sitemap\.xml/);
  assert.match(robots, /Disallow: \/studio\.html/);
  assert.doesNotMatch(robots, /Disallow:\s*\/favicon/i);
  const ico = fs.readFileSync(path.join(root, "favicon.ico"));
  const png = fs.readFileSync(path.join(root, "favicon-192.png"));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(png.slice(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 192);
  assert.equal(png.readUInt32BE(20), 192);
  assert.equal(read("ads.txt").trim(), "google.com, pub-5196178239625142, DIRECT, f08c47fec0942fa0");
  const sitemap = read("sitemap.xml");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.ok(locs.includes("https://ranki.gg/"));
  assert.ok(locs.includes("https://ranki.gg/learn/index.html"));
  assert.ok(locs.includes("https://ranki.gg/sources.html"));
  assert.ok(locs.includes("https://ranki.gg/contact.html"));
  for (const loc of locs) {
    assert.match(loc, /^https:\/\/ranki\.gg\//);
    const rel = loc.replace("https://ranki.gg/", "");
    const file = rel === "" ? "index.html" : rel;
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }
  assert.doesNotMatch(sitemap, /studio|loadingzone|homicide/i);
});

test("learn pages are static, sourced, and long enough", () => {
  const pages = fs.readdirSync(path.join(root, "learn")).filter(name => name.endsWith(".html") && name !== "index.html");
  assert.ok(pages.length >= 10 && pages.length <= 20, "count " + pages.length);
  const banned = /homicide|suicide|murder|cannabis|overdose|pornograph|penis|slang|rape/i;
  for (const name of pages) {
    const html = read(path.join("learn", name));
    const n = words(html);
    assert.ok(n >= 300 && n <= 700, name + " " + n);
    assert.match(html, /rel="canonical"/, name);
    assert.match(html, /adsbygoogle\.js\?client=ca-pub-5196178239625142/, name);
    assert.match(html, /Play this puzzle/, name);
    assert.match(html, /<table>/, name);
    assert.doesNotMatch(html, banned, name);
    assert.doesNotMatch(html, /under construction|coming soon|lorem ipsum/i, name);
  }
  const index = read("learn/index.html");
  assert.match(index, /rel="canonical" href="https:\/\/ranki\.gg\/learn\/index\.html"/);
  for (const name of pages) assert.match(index, new RegExp(name.replace(".", "\\.")), name);
});

test("static pages do not link to a missing local file", () => {
  const htmlFiles = walk(root).filter(abs => abs.endsWith(".html"));
  const missing = [];
  for (const abs of htmlFiles) {
    const dir = path.dirname(abs);
    const html = fs.readFileSync(abs, "utf8");
    const hrefs = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(m => m[1]);
    for (const href of hrefs) {
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("data:") || href.startsWith("javascript:")) continue;
      if (/^https?:\/\//i.test(href)) continue;
      const clean = href.split("#")[0].split("?")[0];
      if (!clean) continue;
      // daily/ is generated into _site by tools/build_daily_pages.js, not committed.
      if (/^daily\//.test(clean)) continue;
      const target = clean.startsWith("/")
        ? path.join(root, decodeURIComponent(clean.slice(1)))
        : path.resolve(dir, decodeURIComponent(clean));
      if (!fs.existsSync(target)) missing.push(path.relative(root, abs) + " -> " + href);
    }
  }
  assert.deepEqual(missing, []);
});

test("About, Learn, Contact and Privacy sit in the header on every public page", () => {
  const pages = ["index.html", "about.html", "contact.html", "privacy.html", "how-to-play.html", "terms.html", "sources.html", "methodology.html"];
  for (const file of fs.readdirSync(path.join(root, "learn"))) {
    if (file.endsWith(".html")) pages.push("learn/" + file);
  }
  for (const file of pages) {
    const html = read(file);
    const header = html.slice(0, html.indexOf("<main"));
    assert.match(header, /class="tabs site-links"/, file);
    assert.match(header, /<a class="tab(?: active)?" href="[^"]*about\.html">About<\/a>/, file);
    assert.match(header, />About<\/a>\s*<a class="tab(?: active)?" href="[^"]*contact\.html">Contact</, file);
    assert.match(header, />Learn</, file);
    assert.match(header, />Privacy</, file);
    const foot = html.slice(html.lastIndexOf("<footer"));
    assert.match(foot, />About<\/a>\s*<a [^>]*contact\.html[^>]*>Contact</, file);
    assert.doesNotMatch(foot, /data-contact-link/, file);
  }
  const privacy = read("privacy.html");
  assert.match(privacy, /Google's consent message is turned on/);
  assert.match(privacy, /US state privacy laws/);
  assert.match(read("site-config.js"), /November 10, 2026/);
  assert.doesNotMatch(privacy, /pending|not yet set up|will be added/i);
});

test("the home page explains the modes in HTML, without a homicide sample", () => {
  const html = read("index.html");
  assert.match(html, /id="homeGuide"/);
  assert.match(html, /What ranki\.gg is/);
  assert.match(html, /Rank it/);
  assert.match(html, /Tier it/);
  assert.match(html, /Top 1/);
  assert.match(html, /Name it/);
  assert.match(html, /Multiple choice/);
  assert.match(html, /Guess the number/);
  assert.match(html, /href="learn\/index\.html"/);
  assert.match(html, /href="sources\.html"/);
  assert.match(html, /rel="canonical" href="https:\/\/ranki\.gg\/"/);
  assert.doesNotMatch(html, /homicide|suicide|cannabis|overdose/i);
  assert.match(read("sw.js"), /"\/learn\/index\.html"/);
  assert.match(read("sw.js"), /"\/sources\.html"/);
  assert.match(read("sw.js"), /ranki-shell-v77/);
});
