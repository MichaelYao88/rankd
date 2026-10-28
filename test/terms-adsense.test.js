const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("terms.html exists, is linked, and is in the sitemap", () => {
  assert.equal(fs.existsSync(path.join(root, "terms.html")), true);
  const terms = read("terms.html");
  assert.match(terms, /<a class="hero-brand" href="\/">ranki\.gg<\/a>/);
  assert.match(terms, /href="about\.html"/);
  assert.match(terms, /href="how-to-play\.html"/);
  assert.match(terms, /href="privacy\.html"/);
  assert.match(terms, /href="terms\.html"/);
  assert.match(terms, /Lemon Squeezy/);
  assert.match(terms, /whereisshe\.gg/);
  assert.match(terms, /mailto:mikelyaps@gmail\.com/);
  assert.doesNotMatch(terms, /\bRanki\b/);
  assert.doesNotMatch(terms, /WhereIsShe/);
  assert.doesNotMatch(terms, /prototype|Coming soon|ad placeholder|under construction/i);
  assert.match(read("sitemap.xml"), /<url><loc>https:\/\/ranki\.gg\/terms\.html<\/loc><\/url>/);
  assert.match(read("index.html"), /<a href="terms\.html" id="footTerms">Terms<\/a>/);
  for (const page of ["about.html", "how-to-play.html", "privacy.html"]) {
    const html = read(page);
    assert.match(html, /<a href="terms\.html">Terms<\/a>/, page);
    assert.doesNotMatch(html, /prototype/i, page);
  }
  const sw = read("sw.js");
  assert.match(sw, /ranki-shell-v14/);
  assert.match(sw, /"\/terms\.html"/);
  assert.match(sw, /"\/about\.html"/);
  assert.match(sw, /"\/privacy\.html"/);
  assert.match(sw, /"\/how-to-play\.html"/);
});

test("index.html has no AdSense crawler trigger copy, and the ad slots stay", () => {
  const index = read("index.html");
  const outsideScripts = index.replace(/<script[\s\S]*?<\/script>/gi, "");
  assert.doesNotMatch(outsideScripts, /prototype/i);
  assert.doesNotMatch(index, /Coming soon/);
  assert.doesNotMatch(index, /ad placeholder/i);
  assert.match(index, /© 2026 ranki\.gg · Data: WHO/);
  assert.match(index, /id="communityBadge">Community</);
  const comments = index.match(/<!--[\s\S]*?-->/g) || [];
  assert.ok(comments.length > 0);
  for (const comment of comments) assert.doesNotMatch(comment, /placeholder/i);
  assert.match(index, /id="adTop"/);
  assert.match(index, /id="adBottom"/);
  assert.match(index, /class="ad-fill"/);
  assert.match(index, /class="inter-ph"/);
  assert.match(index, /class="long-ad-ph"/);
  assert.match(index, /id="adTopRemove"/);
  assert.match(index, /id="adBottomRemove"/);
  assert.match(index, /id="interRemoveAds"/);
  assert.match(index, /id="longAdFill"/);
  assert.match(index, /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-5196178239625142/);
  assert.match(index, /posthog\.init/);
  assert.match(read("app.js"), /8002826017/);
  assert.equal(read("ads.txt").trim(), "google.com, pub-5196178239625142, DIRECT, f08c47fec0942fa0");
  assert.doesNotMatch(read("app.js"), /Coming soon/);
  assert.doesNotMatch(read("app.js"), /is a prototype/);
});
