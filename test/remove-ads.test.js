const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

function between(src, start, end) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start);
  const j = src.indexOf(end, i + start.length);
  assert.ok(j > i, end);
  return src.slice(i, j);
}

function bannerShell(id, next) {
  const shell = between(html, `id="${id}"`, next);
  const slotAt = shell.indexOf('class="ad-slot ad-banner');
  const removeAt = shell.indexOf("Remove ad ✕");
  assert.ok(removeAt > 0 && slotAt > removeAt, id + " label sits above the ad slot");
  const creative = shell.slice(slotAt);
  assert.doesNotMatch(creative, /<button|<a |Remove ad|prem-upsell/, id + " creative has no clickable upsell");
  assert.match(shell, /data-premium-upsell="banner"/);
  assert.match(shell, /class="ad-remove prem-upsell"/);
  assert.match(shell, /type="button"/);
  return shell;
}

test("banner Remove ad sits in a strip outside the ad slot", () => {
  bannerShell("adTopShell", "<main");
  bannerShell("adBottomShell", 'id="archiveView"');
  assert.match(css, /\.ad-remove-bar\{[^}]*display:flex[^}]*justify-content:flex-end/);
  assert.doesNotMatch(css, /\.ad-remove-bar\{[^}]*position:\s*absolute/);
  assert.match(css, /button\.ad-remove\.prem-upsell\{[^}]*position:static/);
  assert.match(css, /\.ad-banner-shell\.is-on\{display:flex;flex-direction:column/);
  assert.match(app, /shell\.classList\.toggle\("is-on", show\)/);
  assert.match(app, /box\.classList\.contains\("ad-on"\) && !box\.classList\.contains\("ad-collapsed"\) && Ads\.allowed\(\)/);
});

test("interstitial Remove ads is outside the ad slot and does not share the skip control", () => {
  const openAt = html.indexOf('id="interstitial"');
  const open = html.slice(html.lastIndexOf("<div", openAt), openAt);
  assert.doesNotMatch(open, /ad-slot/);
  const inter = between(html, 'id="interstitial"', 'id="longAd"');
  const slotStart = inter.indexOf('class="ad-slot inter-creative"');
  const slotEnd = inter.indexOf("<!-- /interstitial ad slot");
  const skip = inter.indexOf('id="skipAd"');
  const btn = inter.indexOf('id="interRemoveAds"');
  assert.ok(skip > 0 && skip < slotStart, "skip stays above the creative");
  assert.ok(slotEnd > slotStart && btn > slotEnd, "Remove ads sits below the slot");
  const inside = inter.slice(slotStart, slotEnd);
  assert.doesNotMatch(inside, /<button|<a |prem-upsell|Remove ads/);
  assert.doesNotMatch(inter.slice(0, slotStart), /interRemoveAds|Remove ads with Premium/);
  assert.match(inter, /Remove ads with Premium/);
  assert.match(inter, /data-premium-upsell="interstitial"/);
  assert.match(inter, /<button type="button" class="prem-upsell" id="interRemoveAds">/);
  assert.match(css, /button#interRemoveAds\.prem-upsell\{[^}]*position:static/);
  assert.match(css, /\.inter-remove\{padding:12px 16px 14px/);
  const click = app.slice(app.indexOf('closest(".prem-upsell")'));
  assert.ok(click.indexOf("dismissInterstitial()") < click.indexOf("goPremium()"));
  assert.match(app, /const dismiss = \(\) => finish\(false\)/);
  assert.match(app, /if \(!btn\.disabled\) finish\(true\)/);
});

test("home Premium line sits under Play and opens Go Premium", () => {
  const home = between(html, 'id="homeView"', 'id="playView"');
  const play = home.indexOf('id="homePlay"');
  const card = home.indexOf('id="homePremium"');
  const how = home.indexOf('id="homeHow"');
  assert.ok(play >= 0 && play < card && card < how);
  const text = home.slice(card, how).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /Go Premium: no ads, full archive, and unlocks WhereIsShe too\. From \$2\.67\/month/);
  assert.match(home, /data-premium-upsell="home"/);
  assert.match(home, /class="home-premium-btn prem-upsell"/);
  assert.match(css, /button\.home-premium-btn\.prem-upsell\{[^}]*background:var\(--surface2\)/);
});

test("Premium entitlement hides every remove-ads upsell", () => {
  assert.match(css, /html\.premium \[data-premium-upsell\]\{display:none!important\}/);
  assert.match(app, /function syncPremiumUpsells\(\) \{\n  const hide = isPremium\(\)/);
  assert.match(app, /nodes\[i\]\.classList\.toggle\("hidden", hide\)/);
  assert.match(app, /syncPremiumUpsells\(\)/);
  assert.match(app, /if \(isPremium\(\)\) dismissInterstitial\(\)/);
  assert.equal((html.match(/data-premium-upsell=/g) || []).length, 4);
});
