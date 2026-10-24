/* Seeded comparison for the results screen, until a puzzle has enough real plays.
   Loaded by index.html (window.RankdSeed) and by `node community-seed.js`.
   Synthetic players sit a little under a typical clear, with a real spread:
   some score higher than a good game, and a couple of countries are too small to show. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RankdSeed = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCORE_WEIGHTS = [1, 1, 2, 3, 4, 5, 6, 8, 9, 10, 10, 10, 9, 8, 7, 6, 5, 4, 3, 4];
  const COUNTRY_POOL = ["JP", "KR", "TW", "DE", "NL", "SE", "CA", "AU", "GB", "US", "FR", "BR", "IN", "PH", "IE", "NZ", "ES", "IT", "MX", "PL", "HK", "VN", "TH", "ID"];
  const MIN_COUNTRY = 20;

  function hash32(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFor(key) { return mulberry(hash32(key)); }

  function scoreBlock(puzzleId, players) {
    const n = Math.max(0, Math.round(Number(players) || 0));
    const rng = rngFor(String(puzzleId) + ":score");
    const weights = SCORE_WEIGHTS.map(w => w * (0.82 + rng() * 0.36));
    const sum = weights.reduce((a, b) => a + b, 0);
    const hist = weights.map(w => (n ? Math.floor(n * w / sum) : 0));
    if (n) {
      let used = hist.reduce((a, b) => a + b, 0);
      const order = weights.map((w, i) => ({ i, frac: (n * w / sum) - hist[i] }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i);
      for (let k = 0; used < n && k < order.length; k++, used++) hist[order[k].i]++;
    }
    const avg = n
      ? hist.reduce((acc, c, i) => acc + c * ((i + 0.5) / hist.length), 0) / n
      : weights.reduce((acc, w, i) => acc + w * ((i + 0.5) / weights.length), 0) / sum;
    return { avg: Math.round(avg * 10000) / 10000, n, hist, seeded: true };
  }

  function countryBoard(puzzleId, type) {
    const rng = rngFor(String(puzzleId) + ":countries");
    const pool = COUNTRY_POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const swap = pool[i]; pool[i] = pool[j]; pool[j] = swap;
    }
    const top5 = type === "top5";
    const rows = [];
    for (let i = 0; i < 8; i++) {
      const thin = i >= 6;
      const players = thin ? 5 + Math.floor(rng() * 10) : 26 + Math.floor(rng() * 120);
      const solveRate = 36 + Math.floor(rng() * (thin ? 40 : 32));
      let avg = top5
        ? 15.2 - (solveRate / 100) * 8.2 + (rng() - 0.5) * 1.1
        : 4.25 - (solveRate / 100) * 2.35 + (rng() - 0.5) * 0.4;
      avg = top5 ? Math.max(6.4, Math.min(15.5, avg)) : Math.max(2.15, Math.min(4.15, avg));
      rows.push({
        code: pool[i],
        players,
        solveRate,
        avgTries: Math.round(avg * 10) / 10,
        seeded: true,
      });
    }
    return rows;
  }

  function topCountries(board, minPlayers, limit) {
    const min = minPlayers == null ? MIN_COUNTRY : minPlayers;
    const n = limit == null ? 5 : limit;
    return (board || [])
      .filter(r => r && /^[A-Z]{2}$/.test(String(r.code || "")) && Number(r.players) >= min && r.solveRate != null && !Number.isNaN(Number(r.solveRate)))
      .slice()
      .sort((a, b) => (Number(b.solveRate) - Number(a.solveRate)) || ((Number(a.avgTries) || 99) - (Number(b.avgTries) || 99)) || (Number(b.players) - Number(a.players)))
      .slice(0, n);
  }

  /* Share of the histogram strictly under `score` (0–1). Capped at 99 so a perfect
     game does not claim nobody else solved it. */
  function betterThan(hist, score) {
    if (!hist || !hist.length) return null;
    const bins = hist.length;
    const total = hist.reduce((a, b) => a + (Number(b) || 0), 0);
    if (!total) return null;
    const x = Math.max(0, Math.min(1, Number(score) || 0));
    const idx = x >= 1 ? bins - 1 : Math.min(bins - 1, Math.max(0, Math.floor(x * bins - 1e-12)));
    let below = 0;
    for (let i = 0; i < idx; i++) below += Number(hist[i]) || 0;
    const lo = idx / bins, hi = (idx + 1) / bins;
    const frac = x >= 1 ? 0.65 : (hi > lo ? (x - lo) / (hi - lo) : 0);
    below += (Number(hist[idx]) || 0) * Math.max(0, Math.min(1, frac));
    return Math.max(0, Math.min(99, Math.round(100 * below / total)));
  }

  function selfTest() {
    const ids = ["work-hours", "sex-ratio-15-64", "pew-meaning-religion", "top5-demo", "match-pew"];
    const leaders = new Set();
    ids.forEach(id => {
      const type = id.startsWith("top5") ? "top5" : "rank";
      const block = scoreBlock(id, 900);
      if (block.hist.length !== 20) throw new Error(id + " hist");
      if (block.hist.reduce((a, b) => a + b, 0) !== 900) throw new Error(id + " hist sum");
      if (block.avg < 0.48 || block.avg > 0.62) throw new Error(id + " avg " + block.avg);
      const p80 = betterThan(block.hist, 0.8);
      const p30 = betterThan(block.hist, 0.3);
      if (p80 < 70 || p80 > 93) throw new Error(id + " p80 " + p80);
      if (p30 > 40) throw new Error(id + " p30 " + p30);
      if (betterThan(block.hist, 1) > 99) throw new Error(id + " perfect");
      const board = countryBoard(id, type);
      const shown = topCountries(board);
      const hidden = board.filter(r => r.players < MIN_COUNTRY);
      if (shown.length !== 5) throw new Error(id + " top " + shown.length);
      if (!hidden.length) throw new Error(id + " no thin country");
      if (shown.some(r => r.players < MIN_COUNTRY)) throw new Error(id + " thin leaked");
      shown.forEach(r => {
        if (r.solveRate < 36 || r.solveRate > 67) throw new Error(id + " rate " + r.solveRate);
        if (type === "top5") {
          if (r.avgTries < 6 || r.avgTries > 16) throw new Error(id + " guesses " + r.avgTries);
        } else if (r.avgTries < 2.1 || r.avgTries > 4.2) throw new Error(id + " tries " + r.avgTries);
      });
      leaders.add(shown[0].code);
    });
    if (leaders.size < 2) throw new Error("leaderboard is the same country every puzzle");
    const rigged = topCountries([
      { code: "SG", players: 8, solveRate: 99, avgTries: 1.2 },
      { code: "JP", players: 40, solveRate: 60, avgTries: 2.8 },
      { code: "US", players: 40, solveRate: 60, avgTries: 3.1 },
    ]);
    if (rigged[0].code !== "JP" || rigged.some(r => r.code === "SG")) throw new Error("thin country not skipped");
    console.log("community-seed self-test ok");
  }

  function mergeDoc(doc) {
    const puzzles = doc.puzzles || {};
    Object.keys(puzzles).forEach(pid => {
      const row = puzzles[pid];
      const type = row.type || "rank";
      if (!Array.isArray(row.countryBoard)) row.countryBoard = countryBoard(pid, type);
      if (!row.score || !Array.isArray(row.score.hist)) row.score = scoreBlock(pid, row.players || 0);
    });
    doc.version = 3;
    doc.updatedAt = "2026-10-24T04:40:00Z";
    doc.note = "Seeded distributions until live aggregates exist. Stable per puzzle id. "
      + "firstGuessWorld / firstGuessByCountry are first submits (not final answers). "
      + "countryBoard is solve rate and average tries; countries under 20 plays are skipped in the UI. "
      + "score is correct placements / placements across guesses, centered a little under a typical clear. "
      + "US and TW first-guess buckets are large enough to show; SG is under the 20-play threshold.";
    return doc;
  }

  if (typeof module !== "undefined" && require.main === module) {
    const arg = process.argv[2];
    if (arg === "--self-test") {
      selfTest();
    } else if (arg === "--merge") {
      const fs = require("fs");
      const doc = JSON.parse(fs.readFileSync(0, "utf8"));
      process.stdout.write(JSON.stringify(mergeDoc(doc)));
    } else {
      selfTest();
    }
  }

  return { scoreBlock, countryBoard, topCountries, betterThan, MIN_COUNTRY, mergeDoc };
});
