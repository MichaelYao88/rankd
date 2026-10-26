const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function pngSize(file) {
  const buf = fs.readFileSync(path.join(root, file));
  assert.equal(buf.toString("hex", 0, 8), "89504e470d0a1a0a");
  assert.equal(buf.toString("ascii", 12, 16), "IHDR");
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const swContext = {
  self: {
    location: { origin: "https://ranki.gg" },
    addEventListener() {},
    skipWaiting() { return Promise.resolve(); },
    clients: { claim() { return Promise.resolve(); } },
  },
  URL,
  URLSearchParams,
  console,
};
swContext.globalThis = swContext;
vm.createContext(swContext);
vm.runInContext(read("sw.js"), swContext, { filename: "sw.js" });
const sw = swContext.self;

function req(url, extra) {
  return Object.assign({ url, method: "GET", mode: "cors", destination: "" }, extra || {});
}

test("manifest is a standalone Ranki app at the site root", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.name, "Ranki");
  assert.equal(manifest.short_name, "Ranki");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#3B5BFF");
  assert.equal(manifest.background_color, "#EAE7E0");
  const any = manifest.icons.filter(icon => icon.purpose === "any");
  const maskable = manifest.icons.filter(icon => icon.purpose === "maskable");
  assert.deepEqual(any.map(icon => icon.sizes).sort(), ["192x192", "512x512"]);
  assert.equal(maskable.length, 1);
  assert.equal(maskable[0].sizes, "512x512");
  assert.equal(maskable[0].src, "/icons/icon-maskable-512.png");
  for (const icon of manifest.icons) {
    assert.equal(icon.type, "image/png");
    assert.equal(pngSize(icon.src.slice(1)).join("x"), icon.sizes);
  }
  assert.deepEqual(pngSize("icons/apple-touch-icon.png"), [180, 180]);
});

test("maskable icon keeps the mark inside the safe circle on a full-bleed tile", () => {
  const buf = fs.readFileSync(path.join(root, "icons/icon-maskable-512.png"));
  const size = 512;
  const { PNG } = loadPng(buf);
  let transparent = 0;
  let worst = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = PNG.at(x, y);
      if (px.a !== 255) transparent++;
      if (px.r !== 59 || px.g !== 91 || px.b !== 255) {
        const dist = Math.hypot(x - 256, y - 256);
        if (dist > worst) worst = dist;
      }
    }
  }
  assert.equal(transparent, 0);
  assert.ok(worst < size * 0.4, `mark reached ${worst}px from center`);
});

test("every HTML page links the manifest and iOS tags", () => {
  const pages = [
    "index.html",
    "about.html",
    "privacy.html",
    "how-to-play.html",
    "studio.html",
    "loadingzone.html",
    "loadingzone/index.html",
  ];
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /rel="manifest" href="\/manifest\.webmanifest" type="application\/manifest\+json"/, page);
    assert.match(html, /rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/, page);
    assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/, page);
    assert.match(html, /name="mobile-web-app-capable" content="yes"/, page);
    assert.match(html, /name="apple-mobile-web-app-status-bar-style"/, page);
    assert.match(html, /name="apple-mobile-web-app-title" content="Ranki"/, page);
    assert.match(html, /name="theme-color" content="#3B5BFF"/, page);
  }
});

test("the service worker is registered from the game and static pages, not Studio", () => {
  for (const page of ["index.html", "about.html", "privacy.html", "how-to-play.html"]) {
    assert.match(read(page), /src="pwa\.js"/, page);
  }
  for (const page of ["studio.html", "loadingzone.html", "loadingzone/index.html"]) {
    assert.doesNotMatch(read(page), /pwa\.js/, page);
    assert.doesNotMatch(read(page), /serviceWorker/, page);
  }
  assert.match(read("app.js"), /window\.RankiPwa\) window\.RankiPwa\.start\(\)/);
  assert.match(read("pwa.js"), /serviceWorker\.register\("\/sw\.js"/);
  assert.match(read("pwa.js"), /params\(\)\.has\("preview"\)/);
  assert.match(read("pwa.js"), /RANKD_STUDIO/);
  assert.doesNotMatch(read("pwa.js"), /location\.reload/);
  assert.doesNotMatch(read("sw.js"), /location\.reload/);
  assert.match(read("sw.js"), /skipWaiting/);
  assert.match(read("sw.js"), /clients\.claim/);
  assert.equal(sw.rankiCACHE, "ranki-shell-v2");
});

test("ad, analytics, and Supabase requests are not intercepted", () => {
  const bypass = [
    ["https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", "google-ad"],
    ["https://googleads.g.doubleclick.net/pagead/ads", "google-ad"],
    ["https://partner.googleadservices.com/pagead/conversion.js", "google-ad"],
    ["https://www.google.com/adsense/start", "google-ad"],
    ["https://ep1.adtrafficquality.google/getconfig", "google-ad"],
    ["https://www.gstatic.com/adsense/domains/caf.js", "google-ad"],
    ["https://fundingchoicesmessages.google.com/el/AGSKWx", "google-ad"],
    ["https://www.googletagservices.com/tag/js/gpt.js", "google-ad"],
    ["https://us.i.posthog.com/e/", "posthog"],
    ["https://us-assets.i.posthog.com/static/array.js", "posthog"],
    ["https://eu.posthog.com/decide", "posthog"],
    ["https://fkxbqftqxvgqrtvkpglx.supabase.co/functions/v1/community-stats", "supabase"],
    ["https://abc.supabase.co/rest/v1/plays", "supabase"],
    ["https://ranki.gg/ads.txt", "ads-txt"],
    ["https://ranki.gg/studio.html", "studio"],
    ["https://ranki.gg/loadingzone.html", "studio"],
    ["https://ranki.gg/loadingzone", "studio"],
    ["https://ranki.gg/loadingzone/index.html", "studio"],
    ["https://ranki.gg/?preview=2026-10-06", "preview"],
    ["https://ranki.gg/index.html?preview=", "preview"],
    ["https://ranki.gg/app.js?preview=1", "preview"],
    ["https://fonts.gstatic.com/s/inter.woff2", "cross-origin"],
    ["https://example.com/app.js", "cross-origin"],
  ];
  for (const [url, reason] of bypass) {
    assert.equal(sw.rankiBypassReason(req(url)), reason, url);
    assert.equal(sw.rankiPlan(req(url)), "bypass", url);
  }
  assert.equal(sw.rankiBypassReason(req("https://ranki.gg/index.html", { method: "POST" })), "method");
  assert.equal(sw.rankiPlan(req("https://us.i.posthog.com/e/", { method: "POST" })), "bypass");
  assert.equal(sw.rankiIsGoogleAd(new URL("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js")), true);
  assert.equal(sw.rankiIsPosthog(new URL("https://us-assets.i.posthog.com/static/array.js")), true);
  assert.equal(sw.rankiIsSupabase(new URL("https://fkxbqftqxvgqrtvkpglx.supabase.co/functions/v1/community-stats")), true);
});

test("navigations and puzzle data are network-first; static assets revalidate", () => {
  assert.equal(sw.rankiPlan(req("https://ranki.gg/", { mode: "navigate", destination: "document" })), "network-first");
  assert.equal(sw.rankiPlan(req("https://ranki.gg/index.html", { mode: "navigate", destination: "document" })), "network-first");
  assert.equal(sw.rankiPlan(req("https://ranki.gg/about.html", { destination: "document" })), "network-first");
  for (const file of ["puzzles-data.js", "practice-data.js", "community-seed.js", "puzzles.csv", "community-stats.json", "hint_bank.csv"]) {
    assert.equal(sw.rankiPlan(req("https://ranki.gg/" + file)), "network-first", file);
  }
  for (const file of ["app.js", "styles.css", "pwa.js", "favicon.svg", "icons/icon-512.png", "vendor/sortable.min.js"]) {
    assert.equal(sw.rankiPlan(req("https://ranki.gg/" + file)), "stale-while-revalidate", file);
  }
});

test("ad code and ads.txt are unchanged by the PWA tags", () => {
  const index = read("index.html");
  assert.match(index, /name="google-adsense-account" content="ca-pub-5196178239625142"/);
  assert.match(index, /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-5196178239625142/);
  assert.match(index, /whereisshe\.gg/);
  assert.equal(read("ads.txt").trim(), "google.com, pub-5196178239625142, DIRECT, f08c47fec0942fa0");
  assert.match(read("app.js"), /ADSENSE_CLIENT: "ca-pub-5196178239625142"/);
});

function loadPng(buf) {
  // Enough of a PNG decoder for an uncompressed RGBA file from Pillow.
  // Pillow may compress; use zlib via the built-in zlib module.
  const zlib = require("zlib");
  assert.equal(buf.toString("ascii", 12, 16), "IHDR");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  assert.equal(bitDepth, 8);
  assert.equal(colorType, 6);
  const idats = [];
  let offset = 8;
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IDAT") idats.push(data);
    if (type === "IEND") break;
    offset += 12 + len;
  }
  const inflated = zlib.inflateSync(Buffer.concat(idats));
  const stride = width * 4;
  const raw = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    const row = raw.subarray(y * stride, (y + 1) * stride);
    const prev = y === 0 ? Buffer.alloc(stride) : raw.subarray((y - 1) * stride, y * stride);
    const scan = inflated.subarray(src, src + stride);
    src += stride;
    if (filter === 0) scan.copy(row);
    else if (filter === 1) {
      for (let i = 0; i < stride; i++) row[i] = (scan[i] + (i >= 4 ? row[i - 4] : 0)) & 255;
    } else if (filter === 2) {
      for (let i = 0; i < stride; i++) row[i] = (scan[i] + prev[i]) & 255;
    } else if (filter === 3) {
      for (let i = 0; i < stride; i++) {
        const left = i >= 4 ? row[i - 4] : 0;
        row[i] = (scan[i] + Math.floor((left + prev[i]) / 2)) & 255;
      }
    } else if (filter === 4) {
      for (let i = 0; i < stride; i++) {
        const left = i >= 4 ? row[i - 4] : 0;
        const up = prev[i];
        const ul = i >= 4 ? prev[i - 4] : 0;
        row[i] = (scan[i] + paeth(left, up, ul)) & 255;
      }
    } else throw new Error("png filter " + filter);
  }
  return {
    PNG: {
      at(x, y) {
        const i = (y * width + x) * 4;
        return { r: raw[i], g: raw[i + 1], b: raw[i + 2], a: raw[i + 3] };
      },
    },
  };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
