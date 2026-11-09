const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === "vendor" || name === ".git") continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(html|js|webmanifest)$/.test(name)) out.push(full);
  }
  return out;
}

function titleMetas(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  return tags.filter(tag => /apple-mobile-web-app-title|application-name|app-title/i.test(tag));
}

function titleTexts(html) {
  return [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map(m => m[1]);
}

// The function that assigns document.title, plus helpers it uses to build that string.
function titleFunctions(src) {
  const chunks = [];
  const re = /function\s+(screenTitle|setTabTitle)\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < src.length && depth) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    chunks.push(src.slice(m.index, i));
  }
  return chunks;
}

function assertNoRankd(label, text) {
  assert.doesNotMatch(text, /rankd/i, label);
  assert.doesNotMatch(text, /\bRanki\b/, label);
  assert.doesNotMatch(text, /\b(?:WhereIsShe|whereisshe)(?!\.gg)\b/, label);
}

test("document.title assignments and title/app-title tags do not say Rankd", () => {
  const files = walk(root);
  let assignments = 0;
  for (const file of files) {
    const rel = path.relative(root, file);
    const text = read(rel);
    if (file.endsWith(".html")) {
      const titles = titleTexts(text);
      assert.ok(titles.length > 0, rel + " has a title");
      for (const title of titles) {
        assertNoRankd(rel + " <title>", title);
        assert.match(title, /ranki\.gg/, rel + " <title>");
      }
      const metas = titleMetas(text);
      assert.ok(metas.length > 0, rel + " has an app-title meta");
      for (const meta of metas) {
        assertNoRankd(rel + " app-title", meta);
        assert.match(meta, /content="ranki\.gg"/, rel);
      }
    }
    if (file.endsWith(".js")) {
      const re = /document\.title\s*=[^;]*;/g;
      let m;
      while ((m = re.exec(text))) {
        assignments++;
        assertNoRankd(rel + " document.title", m[0]);
      }
    }
    if (file.endsWith(".webmanifest")) {
      const manifest = JSON.parse(text);
      assertNoRankd(rel + " name", manifest.name);
      assertNoRankd(rel + " short_name", manifest.short_name);
      assert.equal(manifest.name, "ranki.gg");
      assert.equal(manifest.short_name, "ranki.gg");
    }
  }
  assert.ok(assignments > 0, "expected a document.title assignment");
  const app = read("app.js");
  const fns = titleFunctions(app);
  assert.equal(fns.length, 2);
  for (const fn of fns) assertNoRankd("tab title function", fn);
  assert.match(fns[0], /CONFIG\.brand/);
  assert.match(fns[1], /screenTitle/);
  assert.match(fns[1], /document\.title\s*=/);
  assert.match(read("sw.js"), /ranki-shell-v46/);
});
