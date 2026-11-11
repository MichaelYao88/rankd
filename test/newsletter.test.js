const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20261111101500_newsletter_signups.sql");

function boot() {
  const document = {
    documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    head: { appendChild() {} },
    addEventListener() {},
  };
  const appBox = {
    window: { RANKD_STUDIO: true },
    document,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { protocol: "http:", pathname: "/", search: "", hostname: "localhost", hash: "" },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp,
    Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error("no")),
    AbortController,
  };
  appBox.globalThis = appBox;
  appBox.window.document = document;
  appBox.window.localStorage = appBox.localStorage;
  appBox.window.sessionStorage = appBox.sessionStorage;
  appBox.window.location = appBox.location;
  appBox.window.matchMedia = appBox.matchMedia;
  vm.createContext(appBox);
  vm.runInContext(read("app.js"), appBox, { filename: "app.js" });
  return appBox.window.RankdShared;
}

test("newsletter addresses are insert-only and duplicates are ignored", () => {
  assert.match(migration, /create table if not exists public\.newsletter_signups/i);
  assert.match(migration, /email citext not null/i);
  assert.match(migration, /unique \(email\)/i);
  assert.match(migration, /source in \('results', 'home'\)/);
  assert.match(migration, /puzzle_date date/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.newsletter_signups from anon, authenticated/i);
  assert.match(migration, /grant insert \(email, source, puzzle_date\) on table public\.newsletter_signups to anon/i);
  assert.match(migration, /for insert\s+to anon/i);
  assert.equal(/for select/i.test(migration), false);
  assert.equal(/for update/i.test(migration), false);
  assert.equal(/for delete/i.test(migration), false);
  assert.match(migration, /resolution=ignore-duplicates/);
  const shared = boot();
  assert.equal(shared.normalizeNewsletterEmail("  Ada@Ranki.GG "), "ada@ranki.gg");
  assert.equal(shared.normalizeNewsletterEmail("not-an-email"), "");
  assert.equal(shared.normalizeNewsletterEmail("a@b"), "");
  assert.equal(shared.NEWSLETTER_KEY, "rankd.newsletter.v1");
});

test("the inbox box sits under the QR and does not float over Next", () => {
  const html = read("index.html");
  const css = read("styles.css");
  const app = read("app.js");
  const privacy = read("privacy.html");
  const qr = html.indexOf('id="challengeQr"');
  const box = html.indexOf('id="newsletter"');
  const next = html.indexOf('id="nextBtn"');
  assert.ok(qr > 0 && box > qr, "newsletter follows the QR");
  assert.ok(next > 0 && next < box, "Next stays above the inbox box");
  assert.match(html, /Get tomorrow's puzzle in your inbox/);
  assert.match(html, /One email a day\. Unsubscribe anytime\./);
  assert.match(html, /id="homeNewsletterOpen"/);
  assert.match(html, /id="newsletterDismiss"/);
  assert.match(css, /\.newsletter\{position:static/);
  assert.equal(/\.newsletter[^}]*position:\s*fixed/.test(css), false);
  assert.match(app, /newsletter_signups\?on_conflict=email/);
  assert.match(app, /resolution=ignore-duplicates/);
  assert.match(app, /source === "results"/);
  assert.match(privacy, /tomorrow's puzzle by email/);
  assert.match(privacy, /rankd\.newsletter\.v1/);
});
