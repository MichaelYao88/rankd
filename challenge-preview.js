/* Server-rendered preview card for /c/<token>. Link unfurlers (WhatsApp, iMessage,
   Slack, Discord) do not run app.js, so the score has to be in the HTML. This module
   is imported by the Cloudflare Pages Function and loaded in tests; the browser bundle
   does not need it. It reads the token with challenge.js and never renders the answer. */
(function (root) {
  "use strict";

  const DEFAULT_NAME = "Your friend";
  const SQUARE = { G: "\u{1F7E9}", R: "\u{1F7E5}", M: "\u2B1C", Y: "\u{1F7E8}", O: "\u{1F7E7}" };

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function nameOf(ch) {
    const n = ch && typeof ch.name === "string" ? ch.name.trim() : "";
    return n || DEFAULT_NAME;
  }

  function gridText(grid) {
    return (grid || []).map(row => Array.from(row).map(c => SQUARE[c] || "").join("")).join("\n");
  }

  function tryWord(n) { return n === 1 ? "try" : "tries"; }

  // Chat clients show og:title in bold. Keep it short and human.
  function headline(ch) {
    const name = nameOf(ch);
    return ch.dnf
      ? name + " didn't finish ranki.gg"
      : name + " scored " + ch.acc + "% on ranki.gg";
  }

  function summary(ch) {
    const name = nameOf(ch);
    const tries = ch.tries + " " + tryWord(ch.tries);
    if (ch.dnf) {
      return name + " didn't finish this puzzle in " + tries + " (accuracy " + ch.acc + "). Can you beat them?";
    }
    return name + " solved this puzzle in " + tries + " (accuracy " + ch.acc + "). Can you beat them?";
  }

  function appUrl(token, ch, site) {
    return site + "/#" + ch.k + "=" + encodeURIComponent(ch.id) + "&c=" + token;
  }

  function page(token, ch, site) {
    const url = site + "/c/" + token;
    const open = appUrl(token, ch, site);
    const title = headline(ch);
    const desc = summary(ch) + "\n" + gridText(ch.grid);
    const safeTitle = esc(title);
    const safeDesc = esc(desc);
    const safeUrl = esc(url);
    const safeOpen = esc(open);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<meta name="description" content="${safeDesc}">
<meta name="robots" content="noindex, follow">
<meta name="theme-color" content="#3B5BFF">
<link rel="canonical" href="${safeUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ranki.gg">
<meta property="og:url" content="${safeUrl}">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDesc}">
<meta property="og:image" content="${esc(site + "/og.png")}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(nameOf(ch) + "'s ranki.gg result")}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDesc}">
<meta name="twitter:image" content="${esc(site + "/og.png")}">
<meta http-equiv="refresh" content="0; url=${safeOpen}">
<style>
html,body{margin:0;background:#EAE7E0;color:#151821;font-family:Helvetica,"Helvetica Neue",Arial,sans-serif}
main{max-width:420px;margin:0 auto;padding:48px 22px}
.card{background:#fff;border-radius:22px;padding:26px 22px;box-shadow:0 18px 40px -28px rgba(21,24,33,.5)}
.brand{font-weight:800;font-size:18px;letter-spacing:-.02em;margin:0 0 18px}
.brand span{color:#3B5BFF}
h1{font-size:24px;line-height:1.2;letter-spacing:-.02em;margin:0 0 10px}
p{margin:0 0 14px;color:#6C6B67;font-size:15px;line-height:1.45}
.grid{font-size:22px;line-height:1.25;white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 20px}
a.cta{display:block;text-align:center;background:#3B5BFF;color:#fff;text-decoration:none;font-weight:800;padding:16px;border-radius:14px}
</style>
</head>
<body>
<main>
<div class="card">
<p class="brand">ranki<span>.gg</span></p>
<h1>${safeTitle}</h1>
<p>${esc(summary(ch))}</p>
<div class="grid" role="img" aria-label="${esc(nameOf(ch) + "'s result")}">${esc(gridText(ch.grid))}</div>
<a class="cta" href="${safeOpen}">Take the challenge &rarr;</a>
</div>
</main>
<script>location.replace(${JSON.stringify(open)});</script>
</body>
</html>
`;
  }

  root.RankdChallengePreview = {
    DEFAULT_NAME: DEFAULT_NAME,
    headline: headline,
    summary: summary,
    gridText: gridText,
    page: page,
    appUrl: appUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
