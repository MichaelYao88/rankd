const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const ogDir = path.join(root, "og", "daily");

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "not a PNG: " + file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test("every committed daily OG image is a 1200x630 PNG named for its day", () => {
  const files = fs.readdirSync(ogDir).filter(f => f.endsWith(".png"));
  assert.ok(files.length >= 30, "expected the daily archive to have images");
  for (const file of files) {
    assert.match(file, /^\d{4}-\d{2}-\d{2}\.png$/, file);
    const size = pngSize(path.join(ogDir, file));
    assert.deepEqual(size, { width: 1200, height: 630 }, file);
    assert.ok(fs.statSync(path.join(ogDir, file)).size < 120000, file + " is too heavy for a social card");
  }
});

test("daily pages use the per-day image and fall back to og.png when it is missing", () => {
  const build = fs.readFileSync(path.join(root, "tools", "build_daily_pages.js"), "utf8");
  assert.match(build, /og", "daily", date \+ "\.png"/);
  assert.match(build, /https:\/\/ranki\.gg\/og\/daily\/\$\{date\}\.png/);
  assert.match(build, /https:\/\/ranki\.gg\/og\.png/);
  assert.match(build, /const ogImage = image \|\| "https:\/\/ranki\.gg\/og\.png"/);
  assert.match(build, /<meta name="twitter:image" content="\$\{ogImage\}">/);
  assert.match(build, /<meta property="og:image:alt"/);
});

test("the generator is documented and kept out of the web root", () => {
  const script = fs.readFileSync(path.join(root, "tools", "make_daily_og.ps1"), "utf8");
  assert.match(script, /System\.Drawing/);
  assert.match(script, /1200, 630/);
  assert.match(script, /New-RoundedPath/);
  assert.match(script, /-Encoding UTF8/);
  assert.match(script, /Missing images fall back to og\.png/);
  const build = fs.readFileSync(path.join(root, "tools", "build_review_site.js"), "utf8");
  assert.doesNotMatch(build, /skipDir = new Set\(\[[^\]]*"og"/, "og/ must be published");
});
