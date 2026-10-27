const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const CHECKOUT = "https://mikelyaps.lemonsqueezy.com/checkout/buy/ca1efbfa-7ab8-4fe6-b96a-694c1f5691fa";
const USER = "11111111-1111-4111-8111-111111111111";

const store = new Map();
function storage() {
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}
const localStorage = storage();
const sessionStorage = storage();
const document = {
  documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} },
  addEventListener() {},
};
const sandbox = {
  window: { RANKD_STUDIO: true },
  document,
  localStorage,
  sessionStorage,
  location: { protocol: "http:", pathname: "/", search: "", hostname: "localhost", hash: "", href: "http://localhost/" },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  URL, URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp,
  Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout, encodeURIComponent,
  fetch: () => Promise.reject(new Error("no")),
  AbortController,
};
sandbox.globalThis = sandbox;
sandbox.window.document = document;
sandbox.window.localStorage = localStorage;
sandbox.window.sessionStorage = sessionStorage;
sandbox.window.location = sandbox.location;
sandbox.window.matchMedia = sandbox.matchMedia;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "challenge.js"), "utf8"), sandbox, { filename: "challenge.js" });
vm.runInContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), sandbox, { filename: "app.js" });

const premium = sandbox.window.RankdPremium;
const shared = sandbox.window.RankdShared;
const appSrc = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const privacy = fs.readFileSync(path.join(root, "privacy.html"), "utf8");

function googleUser(over) {
  return Object.assign({
    id: USER,
    email: "Ada@Example.com",
    identities: [{
      provider: "google",
      identity_data: { full_name: "Ada Lovelace", avatar_url: "https://lh3.googleusercontent.com/a/ada" },
    }],
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: {},
  }, over);
}

test("checkout keeps Lemon's bracket names and sends the Ranki user", () => {
  assert.equal(shared.CONFIG.premium.checkoutUrl, CHECKOUT);
  assert.equal(shared.CONFIG.premium.priceLine, "From $2.67/month · suggested $6.70");
  assert.match(shared.CONFIG.premium.pitch, /Premium unlocks Ranki \+ WhereIsShe/);
  const url = premium.premiumCheckoutUrl(CHECKOUT, { id: USER, email: "Ada@Example.com" });
  assert.ok(url.startsWith(CHECKOUT + "?"));
  assert.match(url, /checkout\[custom\]\[user_id\]=11111111-1111-4111-8111-111111111111/);
  assert.match(url, /checkout\[custom\]\[app\]=ranki/);
  assert.match(url, /checkout\[email\]=Ada%40Example\.com/);
  assert.equal(url.includes("checkout%5B"), false);
});

test("checkout is refused without a user or a product link", () => {
  assert.equal(premium.premiumCheckoutUrl("", { id: USER, email: "a@b.co" }), "");
  assert.equal(premium.premiumCheckoutUrl("   ", { id: USER }), "");
  assert.equal(premium.premiumCheckoutUrl(CHECKOUT, null), "");
  assert.equal(premium.premiumCheckoutUrl(CHECKOUT, { email: "a@b.co" }), "");
  const withQuery = premium.premiumCheckoutUrl(CHECKOUT + "?logo=0", { id: USER });
  assert.match(withQuery, /\?logo=0&checkout\[custom\]\[user_id\]=/);
});

test("Premium comes from the entitlement, not a local flag", () => {
  localStorage.setItem("rankd.premium.v1", "1");
  shared.CONFIG.premium.enabled = true;
  premium.setPremiumCache(null);
  premium.noteAuthUser(null);
  assert.equal(premium.isPremium(), false);

  premium.setPremiumCache({ premium: true, current_period_end: null });
  assert.equal(premium.isPremium(), true);
  assert.equal(premium.entitlementIsActive({ premium: true, current_period_end: "2099-01-01T00:00:00.000Z" }, Date.parse("2026-10-27T00:00:00.000Z")), true);
  assert.equal(premium.entitlementIsActive({ premium: true, current_period_end: "2020-01-01T00:00:00.000Z" }, Date.parse("2026-10-27T00:00:00.000Z")), false);
  assert.equal(premium.entitlementIsActive({ premium: false, current_period_end: null }, Date.now()), false);

  shared.CONFIG.premium.enabled = false;
  assert.equal(premium.isPremium(), false);
  shared.CONFIG.premium.enabled = true;
  assert.doesNotMatch(appSrc, /getItem\(["']rankd\.premium\.v1["']\)/);
});

test("a Google name is the challenge name, and an email account is not", () => {
  premium.noteAuthUser(googleUser());
  assert.equal(premium.getChallengerName(), "Ada Lovelace");
  assert.equal(premium.googleProfile(googleUser()).avatar, "https://lh3.googleusercontent.com/a/ada");

  const longName = googleUser();
  longName.identities[0].identity_data.full_name = "Ada Lovelace Extra Name";
  premium.noteAuthUser(longName);
  assert.equal(premium.getChallengerName(), "Ada Lovelace Ext");

  const httpAvatar = googleUser();
  httpAvatar.identities[0].identity_data.avatar_url = "http://example.test/a.png";
  assert.equal(premium.googleProfile(httpAvatar).avatar, "");

  const emailOnly = {
    id: USER,
    email: "ada@example.com",
    identities: [{ provider: "email", identity_data: { email: "ada@example.com" } }],
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: "Should Not Use", avatar_url: "https://example.test/a.png" },
  };
  premium.noteAuthUser(emailOnly);
  assert.equal(premium.getChallengerName(), null);
  assert.equal(premium.googleProfile(emailOnly).avatar, "");
  assert.equal(premium.googleProfile(null).name, null);
});

test("the sign-in screen and the Premium screen advertise both games", () => {
  assert.match(appSrc, /Sign up with Google/);
  assert.match(appSrc, /Sign in with Google/);
  assert.match(appSrc, /Sign up with email/);
  assert.match(appSrc, /Sign in with email/);
  assert.match(appSrc, /storageKey: "rankd\.supabase\.auth"/);
  assert.match(appSrc, /claim_premium_email/);
  assert.match(appSrc, /signInWithOtp/);
  assert.match(appSrc, /signInWithOAuth/);
  assert.match(appSrc, /detectSessionInUrl:\s*true/);
  assert.match(appSrc, /flowType:\s*"pkce"/);
  assert.match(appSrc, /redirectTo:\s*authRedirectUrl\(\)/);
  assert.match(html, /id="accountBtn"/);
  assert.match(html, /id="premiumView"/);
  assert.match(html, /Premium unlocks Ranki \+ WhereIsShe: no ads, full archive, and ad-free Practice\. From \$2\.67\/month · suggested \$6\.70/);
  assert.match(html, /supabase-js@2/);
  assert.equal(premium.premiumUpsellLabel(), "Premium unlocks Ranki + WhereIsShe: no ads, full archive, and ad-free Practice. From $2.67/month · suggested $6.70");
  assert.match(premium.accountCopy("signup").subtitle, /Ranki and WhereIsShe/);
  assert.match(privacy, /Sign up with Google/);
  assert.match(privacy, /Sign in with Google/);
  assert.match(privacy, /Sign up with email/);
  assert.match(privacy, /Sign in with email/);
  assert.match(privacy, /ranki\.account\.seen\.v1/);
  assert.match(privacy, /rankd\.supabase\.auth/);
  assert.doesNotMatch(privacy, /we don't have accounts/i);
});

test("account labels follow the device seen flag", () => {
  localStorage.removeItem("ranki.account.seen.v1");
  premium.noteAuthUser(null);
  assert.equal(premium.accountSeen(), false);
  assert.equal(premium.accountCopy().intent, "signup");
  assert.equal(premium.accountCopy().header, "Sign up");
  assert.equal(premium.accountCopy().title, "Create your Ranki account");
  assert.equal(premium.accountCopy().google, "Sign up with Google");
  assert.equal(premium.accountCopy().email, "Sign up with email");
  assert.equal(premium.accountCopy().toggleLead, "Already have an account?");
  assert.equal(premium.accountCopy().toggle, "Sign in");

  const signupHtml = premium.accountModalHtml();
  assert.match(signupHtml, /Create your Ranki account/);
  assert.match(signupHtml, /Sign up with Google/);
  assert.match(signupHtml, /Sign up with email/);
  assert.match(signupHtml, /Already have an account\?/);
  assert.match(signupHtml, /id="accountToggle">Sign in</);
  assert.match(signupHtml, /class="gsi-material-button"/);
  assert.match(signupHtml, /#EA4335/);
  assert.match(signupHtml, /#4285F4/);
  assert.match(signupHtml, /#FBBC05/);
  assert.match(signupHtml, /#34A853/);
  assert.match(signupHtml, />or</);

  premium.markAccountSeen();
  assert.equal(localStorage.getItem("ranki.account.seen.v1"), "1");
  assert.equal(premium.accountSeen(), true);
  assert.equal(premium.accountCopy().intent, "signin");
  assert.equal(premium.accountCopy().header, "Sign in");
  assert.equal(premium.accountCopy().title, "Welcome back");
  assert.equal(premium.accountCopy().google, "Sign in with Google");
  assert.equal(premium.accountCopy().email, "Sign in with email");
  assert.equal(premium.accountCopy().toggleLead, "New here?");
  assert.equal(premium.accountCopy().toggle, "Sign up");

  const signinHtml = premium.accountModalHtml();
  assert.match(signinHtml, /Welcome back/);
  assert.match(signinHtml, /Sign in with Google/);
  assert.match(signinHtml, /New here\?/);
  assert.match(signinHtml, /id="accountToggle">Sign up</);
  assert.doesNotMatch(signinHtml, /Create your Ranki account/);

  assert.equal(premium.accountCopy("signup").google, "Sign up with Google");
  assert.match(premium.accountModalHtml("signup"), /Sign up with Google/);
  assert.equal(premium.accountCopy("signin").title, "Welcome back");
  assert.equal(premium.accountCopy("nope").intent, "signin");

  localStorage.removeItem("ranki.account.seen.v1");
  premium.noteAuthUser(googleUser());
  assert.equal(premium.accountSeen(), true);
  premium.noteAuthUser(null);
  assert.equal(premium.accountSeen(), true);
  assert.equal(premium.accountCopy().header, "Sign in");
  localStorage.removeItem("ranki.account.seen.v1");
});

test("oauth redirect uses this page origin and path", () => {
  const loc = sandbox.location;
  const saved = { href: loc.href, origin: loc.origin, pathname: loc.pathname };
  loc.href = "https://ranki.gg/index.html?code=abc#today";
  loc.origin = "https://ranki.gg";
  loc.pathname = "/index.html";
  assert.equal(premium.authRedirectUrl(), "https://ranki.gg/index.html");
  loc.href = "http://127.0.0.1:4173/play";
  loc.origin = "http://127.0.0.1:4173";
  loc.pathname = "/play";
  assert.equal(premium.authRedirectUrl(), "http://127.0.0.1:4173/play");
  loc.href = saved.href;
  loc.origin = saved.origin;
  loc.pathname = saved.pathname;
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(css, /#747775/);
  assert.match(css, /#131314/);
  assert.match(css, /#8E918F/);
  assert.match(css, /font-family:Roboto/);
  assert.match(css, /border-radius:4px/);
  assert.match(css, /font-size:14px/);
  assert.match(css, /font-weight:500/);
});
