/* Seeded comparison for the results screen, until a puzzle has enough real plays.
   Loaded by index.html (window.RankdSeed) and by `node community-seed.js`.
   Synthetic players sit a little under a typical clear, with a real spread:
   some use fewer tries than a good game, and a couple of countries are too small to show. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RankdSeed = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COUNTRY_POOL = ["JP", "KR", "TW", "DE", "NL", "SE", "CA", "AU", "GB", "US", "FR", "BR", "IN", "PH", "IE", "NZ", "ES", "IT", "MX", "PL", "HK", "VN", "TH", "ID"];
  const MIN_COUNTRY = 20;
  const ACC_BINS = 10;

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

  function distribute(n, weights) {
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const hist = weights.map(w => (n ? Math.floor(n * w / sum) : 0));
    if (!n) return hist;
    let used = hist.reduce((a, b) => a + b, 0);
    const order = weights.map((w, i) => ({ i, frac: (n * w / sum) - hist[i] }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let k = 0; used < n && k < order.length; k++, used++) hist[order[k].i]++;
    return hist;
  }

  function accHist(n, peak, rng) {
    const weights = [];
    for (let b = 0; b < ACC_BINS; b++) {
      const mid = b === ACC_BINS - 1 ? 97 : b * 10 + 5;
      const d = (mid - peak) / 16;
      weights.push(Math.exp(-d * d) * (0.82 + rng() * 0.36));
    }
    return distribute(n, weights);
  }

  /* Joint distribution of tries and first-guess accuracy.
     Fewer tries is better. Accuracy (0–100) only breaks ties inside one try count.
     The mass sits a little past a typical clear: rank games peak at 3 tries, not 2. */
  function standingBlock(puzzleId, players, type, firstOf) {
    const n = Math.max(0, Math.round(Number(players) || 0));
    const rng = rngFor(String(puzzleId) + ":standing");
    const top5 = type === "top5";
    const of = top5 ? 1 : Math.max(2, Math.round(Number(firstOf) || 5));
    const tryKeys = top5 ? [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] : [1, 2, 3, 4, 5];
    const base = top5
      ? [1, 2, 4, 6, 9, 12, 12, 10, 7, 4, 2]
      : [7, 20, 32, 25, 16];
    const counts = distribute(n, base.map(w => w * (0.86 + rng() * 0.28)));
    const byTries = {};
    let tryWeighted = 0, firstWeighted = 0, accWeighted = 0, accN = 0;
    tryKeys.forEach((tries, i) => {
      const count = counts[i] || 0;
      let peak;
      if (!top5 && tries === 1) peak = 100;
      else if (top5) peak = 76 - (tries - 8) * 1.6 + (rng() - 0.5) * 4;
      else peak = 68 - (tries - 2) * 8 + (rng() - 0.5) * 4;
      peak = Math.max(22, Math.min(100, peak));
      const bins = count ? accHist(count, peak, rng) : Array(ACC_BINS).fill(0);
      if (!top5 && tries === 1 && count) {
        bins.fill(0);
        bins[ACC_BINS - 1] = count;
      }
      byTries[String(tries)] = bins;
      tryWeighted += count * tries;
      bins.forEach((c, b) => {
        const mid = !top5 && tries === 1 ? 100 : (b === ACC_BINS - 1 ? 97 : b * 10 + 5);
        accWeighted += c * mid;
        accN += c;
      });
      let first;
      if (top5) first = Math.max(0.18, Math.min(0.52, 0.46 - (tries - 8) * 0.018));
      else if (tries === 1) first = of;
      else first = Math.max(0.35, of * (0.48 - (tries - 2) * 0.08));
      firstWeighted += count * first;
    });
    const avgTries = n ? tryWeighted / n : 0;
    const avgFirst = n ? firstWeighted / n : 0;
    const avgAccuracy = accN ? accWeighted / accN : 0;
    return {
      n,
      seeded: true,
      kind: top5 ? "top5" : "order",
      avgTries: Math.round(avgTries * 100) / 100,
      avgFirst: Math.round(avgFirst * 100) / 100,
      firstOf: of,
      avgAccuracy: Math.round(avgAccuracy),
      byTries,
    };
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
      let avg;
      if (thin && i === 6) avg = top5 ? 6.2 : 1.6;
      else avg = top5 ? 8.4 + rng() * 5.2 : 2.35 + rng() * 1.75;
      if (!thin) avg = top5 ? Math.max(7.6, Math.min(14.2, avg)) : Math.max(2.2, Math.min(4.15, avg));
      rows.push({
        code: pool[i],
        players,
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
      .filter(r => r && /^[A-Z]{2}$/.test(String(r.code || "")) && Number(r.players) >= min && r.avgTries != null && !Number.isNaN(Number(r.avgTries)))
      .slice()
      .sort((a, b) => (Number(a.avgTries) - Number(b.avgTries)) || (Number(b.players) - Number(a.players)) || String(a.code).localeCompare(String(b.code)))
      .slice(0, n);
  }

  /* Share of players this game beat: more tries, or the same tries and a lower accuracy.
     Capped at 99 so a perfect game does not claim nobody else solved it. */
  function betterThan(standing, tries, accuracy) {
    const buckets = standing && standing.byTries;
    if (!buckets) return null;
    const mine = Math.round(Number(tries));
    if (!Number.isFinite(mine)) return null;
    const acc = Math.max(0, Math.min(100, Number(accuracy) || 0));
    let total = 0, worse = 0;
    Object.keys(buckets).forEach(key => {
      const hist = buckets[key];
      if (!Array.isArray(hist) || !hist.length) return;
      const k = Number(key);
      const sum = hist.reduce((a, b) => a + (Number(b) || 0), 0);
      total += sum;
      if (k > mine) worse += sum;
      else if (k === mine) {
        const bins = hist.length;
        const idx = acc >= 100 ? bins - 1 : Math.min(bins - 1, Math.max(0, Math.floor(acc / (100 / bins))));
        for (let i = 0; i < idx; i++) worse += Number(hist[i]) || 0;
        const width = 100 / bins;
        const lo = idx * width;
        const frac = acc >= 100 ? 0.65 : (width > 0 ? (acc - lo) / width : 0);
        worse += (Number(hist[idx]) || 0) * Math.max(0, Math.min(1, frac));
      }
    });
    if (!total) return null;
    return Math.max(0, Math.min(99, Math.round(100 * worse / total)));
  }

  function selfTest() {
    const ids = ["work-hours", "sex-ratio-15-64", "pew-meaning-religion", "top5-demo", "match-pew"];
    const leaders = new Set();
    ids.forEach(id => {
      const type = id.startsWith("top5") ? "top5" : "rank";
      const block = standingBlock(id, 900, type, type === "top5" ? 1 : 5);
      const flat = Object.values(block.byTries).reduce((a, h) => a + h.reduce((x, y) => x + y, 0), 0);
      if (flat !== 900) throw new Error(id + " hist sum " + flat);
      if (type === "top5") {
        if (block.avgTries < 8.5 || block.avgTries > 13) throw new Error(id + " guesses " + block.avgTries);
        if (block.avgAccuracy < 60 || block.avgAccuracy > 90) throw new Error(id + " acc " + block.avgAccuracy);
      } else {
        if (block.avgTries < 2.8 || block.avgTries > 3.6) throw new Error(id + " tries " + block.avgTries);
        if (block.avgAccuracy < 45 || block.avgAccuracy > 68) throw new Error(id + " acc " + block.avgAccuracy);
        if (block.avgFirst < 1.2 || block.avgFirst > 3.2) throw new Error(id + " first " + block.avgFirst);
        const good = betterThan(block, 2, 80);
        const poor = betterThan(block, 5, 30);
        const perfect = betterThan(block, 1, 100);
        if (good < 68 || good > 93) throw new Error(id + " good " + good);
        if (poor > 40) throw new Error(id + " poor " + poor);
        if (perfect < 90 || perfect > 99) throw new Error(id + " perfect " + perfect);
      }
      const board = countryBoard(id, type);
      const shown = topCountries(board);
      const hidden = board.filter(r => r.players < MIN_COUNTRY);
      if (shown.length !== 5) throw new Error(id + " top " + shown.length);
      if (!hidden.length) throw new Error(id + " no thin country");
      if (shown.some(r => r.players < MIN_COUNTRY || r.solveRate != null)) throw new Error(id + " thin or rate leaked");
      for (let i = 1; i < shown.length; i++) {
        if (shown[i].avgTries < shown[i - 1].avgTries) throw new Error(id + " not sorted by tries");
      }
      shown.forEach(r => {
        if (type === "top5") {
          if (r.avgTries < 7 || r.avgTries > 15) throw new Error(id + " guesses " + r.avgTries);
        } else if (r.avgTries < 2.1 || r.avgTries > 4.2) throw new Error(id + " tries " + r.avgTries);
      });
      const fastestThin = Math.min.apply(null, hidden.map(r => r.avgTries));
      if (!(fastestThin < shown[0].avgTries)) throw new Error(id + " thin country was not faster than the leader");
      leaders.add(shown[0].code);
    });
    if (leaders.size < 2) throw new Error("leaderboard is the same country every puzzle");
    const rigged = topCountries([
      { code: "SG", players: 8, avgTries: 1.2 },
      { code: "DE", players: 50, avgTries: 2.1 },
      { code: "JP", players: 40, avgTries: 2.8 },
      { code: "US", players: 40, avgTries: 3.1 },
    ]);
    if (rigged.map(r => r.code).join() !== "DE,JP,US") throw new Error("tries sort " + rigged.map(r => r.code).join());
    console.log("community-seed self-test ok");
  }

  function mergeDoc(doc) {
    const puzzles = doc.puzzles || {};
    Object.keys(puzzles).forEach(pid => {
      const row = puzzles[pid];
      if (row.seeded === false) return;
      const type = row.type || "rank";
      const named = row.perItemCorrect ? Object.keys(row.perItemCorrect).length : 0;
      row.countryBoard = countryBoard(pid, type);
      row.standing = standingBlock(pid, row.players || 0, type, type === "top5" ? 1 : named);
      delete row.score;
    });
    doc.version = 4;
    doc.updatedAt = "2026-10-24T05:10:00Z";
    doc.note = "Seeded distributions until live aggregates exist. Stable per puzzle id. "
      + "firstGuessWorld / firstGuessByCountry are first submits (not final answers). "
      + "countryBoard is average tries only; countries under 20 plays are skipped in the UI, "
      + "and the board is ranked by fewest tries. "
      + "standing is tries, items correct on the first guess, and first-guess accuracy (mean absolute rank distance, 0–100). "
      + "The distribution sits a little under a typical clear. "
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

  return { standingBlock, countryBoard, topCountries, betterThan, MIN_COUNTRY, mergeDoc };
});
