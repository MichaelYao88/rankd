/* Seeded comparison for the results screen, until a puzzle has enough real plays.
   Loaded by index.html (window.RankdSeed) and by `node community-seed.js`.
   Synthetic players sit a little under a typical clear, with a real spread:
   some use fewer tries than a good game, and a couple of countries are too small to show.
   The leaderboard seeds about 9 plays per country (those count toward the cutoff).
   World and per-country orderings are a separate 1-play seed, applied in
   tools/community_snapshot.py, so the first real submits replace them. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RankdSeed = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COUNTRY_POOL = ["JP", "KR", "TW", "DE", "NL", "SE", "CA", "AU", "GB", "US", "FR", "BR", "IN", "PH", "IE", "NZ", "ES", "IT", "MX", "PL", "HK", "VN", "TH", "ID"];
  /* Leaderboard cutoff. Seeds count, and a shown country is seeded at about
     BOARD_SEED_PLAYS, so 9 qualifies. 1–2 real plays with no seed do not.
     Keep this in sync with MIN_COUNTRY_PLAYERS in tools/community_snapshot.py. */
  const MIN_COUNTRY = 9;
  const CONSENSUS_SEED_PLAYS = 1;
  const BOARD_SEED_PLAYS = 9;
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

  function accHist(n, peak, rng, band) {
    const lo = band ? band[0] : 0;
    const hi = band ? band[1] : 100;
    const weights = [];
    for (let b = 0; b < ACC_BINS; b++) {
      const mid = b === ACC_BINS - 1 ? 97 : b * 10 + 5;
      const blo = b === ACC_BINS - 1 ? 90 : b * 10;
      const bhi = b === ACC_BINS - 1 ? 100 : b * 10 + 9;
      if (bhi < lo || blo > hi) { weights.push(0); continue; }
      const d = (mid - peak) / 22;
      weights.push(Math.exp(-d * d) * (0.82 + rng() * 0.36));
    }
    if (weights.every(w => w <= 0)) {
      const mid = Math.max(0, Math.min(100, peak));
      const bin = mid >= 90 ? ACC_BINS - 1 : Math.min(ACC_BINS - 2, Math.floor(mid / 10));
      weights[bin] = 1;
    }
    return distribute(n, weights);
  }

  /* Accuracy is anchored to how many tries the solve took.
     1st try is exactly 100. Later tries open a 20-point band and start one
     point under its top: 2nd 80–99, 3rd 60–79, 4th 40–59, 5th 20–39.
     A 6th try uses 1–19. Further tries stay at 1, so they cannot outscore
     an earlier finish. Inside a band, each spot a country was off in an
     earlier wrong guess costs 1 point, then the score clamps to the floor.
     Rank it, Tier it, Match it, and the six-card Top 5 pass one distance per
     lock. The old Top 5 name list (kind "top5") counts misses instead:
     five hits and no misses is 100.
     An unfinished game scores 1–19 from the last guess only. That number
     stays under every 1st–5th try solve. The comparison still ranks every
     unfinished game under every finish, including a long solve that also
     landed in 1–19. The (?) tooltip does not mention this. */
  const ACCURACY_TIP = "100 for a first-try solve. Each extra try drops you to a lower band (80s, 60s, 40s, 20s), and within a band you lose 1 point for every spot a country was off in your wrong guesses.";
  function rawSpots(n) {
    const x = Number(n);
    if (!Number.isFinite(x) || x <= 0) return 0;
    return Math.round(x);
  }
  function tryBand(tries) {
    const t = Math.max(1, Math.round(Number(tries) || 1));
    if (t <= 1) return { start: 100, floor: 100, collapsed: false };
    const start = 99 - 20 * (t - 2);
    if (start < 1) return { start: 1, floor: 1, collapsed: true };
    if (start <= 19) return { start: 19, floor: 1, collapsed: false };
    return { start, floor: start - 19, collapsed: false };
  }
  function solvedScore(tries, distance) {
    const band = tryBand(tries);
    if (band.start === 100) return 100;
    const d = rawSpots(distance);
    if (band.collapsed) return 1;
    return Math.max(band.floor, Math.min(band.start, band.start - d));
  }
  function dnfScore(lastDistance) {
    return Math.max(1, Math.min(19, 19 - rawSpots(lastDistance)));
  }
  /* Inclusive score range a seeded crowd at this try count should occupy.
     `tries` is the accuracy try (1 = first-try solve), not a Top 5 guess count. */
  function seedBand(accuracyTries, failed) {
    if (failed) return [1, 19];
    const band = tryBand(accuracyTries);
    if (band.collapsed) return [1, 9];
    if (band.start === 100) return [100, 100];
    return [band.floor, band.start];
  }
  function bandCenter(accuracyTries) {
    if (accuracyTries <= 1) return 100;
    const [lo, hi] = seedBand(accuracyTries, false);
    return Math.round((lo + hi) / 2 - 4);
  }
  /* Top 1: the try count picks the band. Inside it, each wrong guess loses
     one point per rank away from #1, and the loss stops at the band floor.
     1 try = 100, 2 = 80–99, 3 = 60–79, 4 = 40–59, 5 = 20–39.
     An unfinished game is 1–19 from the closest rank reached (#2 = 19). */
  function top1Mark(rank) {
    const r = Math.round(Number(rank));
    if (!Number.isFinite(r) || r <= 1) return "good";
    if (r <= 5) return "near";
    if (r <= 15) return "warm";
    return "bad";
  }
  function top1Accuracy(ranks, solved, total) {
    const list = (ranks || []).map(n => Math.max(1, Math.round(Number(n) || 1))).filter(n => Number.isFinite(n));
    const nCountries = Math.max(2, Math.round(Number(total) || 2));
    if (!list.length) return solved ? 100 : 1;
    if (solved) {
      const tries = list.length;
      if (tries <= 1) return 100;
      const bands = { 2: [80, 99], 3: [60, 79], 4: [40, 59], 5: [20, 39] };
      const band = bands[Math.min(5, tries)] || [20, 39];
      const floor = band[0], ceil = band[1], span = ceil - floor;
      let penalty = 0;
      for (let i = 0; i < list.length - 1; i++) penalty += Math.max(0, list[i] - 1);
      if (penalty > span) penalty = span;
      return ceil - penalty;
    }
    const best = Math.min.apply(null, list);
    const span = Math.max(1, nCountries - 2);
    const raw = 19 - (Math.max(2, best) - 2) * (18 / span);
    return Math.max(1, Math.min(19, Math.round(raw)));
  }
  function combineAccuracy(distances, solved, kind) {
    const ds = (distances || []).map(rawSpots);
    if (!solved) return dnfScore(ds.length ? ds[ds.length - 1] : 18);
    if (kind === "top5") {
      const misses = ds.filter(d => d > 0);
      const penalty = misses.reduce((a, b) => a + b, 0);
      return solvedScore(1 + misses.length, penalty);
    }
    const tries = Math.max(1, ds.length || 1);
    const penalty = tries <= 1 ? 0 : ds.slice(0, -1).reduce((a, b) => a + b, 0);
    return solvedScore(tries, penalty);
  }

  function histMid(bins, perfect) {
    return bins.reduce((acc, c, b) => acc + c * (perfect ? 100 : (b === ACC_BINS - 1 ? 97 : b * 10 + 5)), 0);
  }

  /* Completers in byTries, unfinished games in failed. Tries peak a little past
     a typical clear, and accuracy sits a little under a clean game, with a wide
     enough spread that a decent score does not beat the whole field. */
  function standingBlock(puzzleId, players, type, firstOf) {
    const n = Math.max(0, Math.round(Number(players) || 0));
    const rng = rngFor(String(puzzleId) + ":standing");
    // Top 5 locks five slots. Name it and Top 1 are one country, so the first-guess scale is 1.
    // A country-list length passed in by mistake is not the Top 5 denominator.
    const nameIt = type === "name";
    const top1 = type === "top1";
    const of = type === "top5" ? 5 : (nameIt || top1) ? 1 : Math.max(2, Math.round(Number(firstOf) || 5));
    const tryKeys = [1, 2, 3, 4, 5];
    const base = [10, 28, 28, 16, 8, 10];
    const counts = distribute(n, base.map(w => w * (0.84 + rng() * 0.32)));
    const failCount = counts[5];
    const solvedCounts = counts.slice(0, 5);
    const byTries = {};
    const failed = {};
    let tryWeighted = 0, firstWeighted = 0, accWeighted = 0, accN = 0;
    const take = (tries, count, peak, into, perfect, band) => {
      const bins = count ? accHist(count, perfect ? 100 : peak, rng, perfect ? [100, 100] : band) : Array(ACC_BINS).fill(0);
      if (perfect && count) { bins.fill(0); bins[ACC_BINS - 1] = count; }
      into[String(tries)] = bins;
      tryWeighted += count * tries;
      accWeighted += histMid(bins, perfect);
      accN += count;
    };
    tryKeys.forEach((tries, i) => {
      const count = solvedCounts[i] || 0;
      const band = seedBand(tries, false);
      const perfect = tries <= 1;
      let peak = bandCenter(tries) + (perfect ? 0 : (rng() - 0.5) * 3);
      peak = Math.max(band[0], Math.min(band[1], peak));
      take(tries, count, peak, byTries, perfect, band);
      const first = tries === 1 ? of : Math.max(0.3, of * (0.46 - (tries - 2) * 0.08));
      firstWeighted += count * first;
    });
    const failBand = seedBand(1, true);
    const failPeak = Math.max(failBand[0], Math.min(failBand[1], 8 + (rng() - 0.5) * 3));
    take(5, failCount, failPeak, failed, false, failBand);
    firstWeighted += failCount * Math.max(0.25, of * 0.16);
    const avgTries = n ? tryWeighted / n : 0;
    const avgFirst = n ? firstWeighted / n : 0;
    const avgAccuracy = accN ? accWeighted / accN : 0;
    return {
      n,
      seeded: true,
      kind: nameIt ? "name" : top1 ? "top1" : type === "top5" ? "top5" : "order",
      avgTries: Math.round(avgTries * 100) / 100,
      avgFirst: Math.round(avgFirst * 100) / 100,
      firstOf: of,
      avgAccuracy: Math.round(avgAccuracy),
      byTries,
      failed,
    };
  }

  function countryBoard(puzzleId, type) {
    const rng = rngFor(String(puzzleId) + ":countries");
    const pool = COUNTRY_POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const swap = pool[i]; pool[i] = pool[j]; pool[j] = swap;
    }
    const rows = [];
    for (let i = 0; i < 8; i++) {
      const thin = i >= 6;
      /* Shown countries: 9, 10, or 11 plays, all on the board. The last two
         stay at 1 or 2 so a tiny real sample cannot take the top spot. */
      const players = thin ? 1 + Math.floor(rng() * 2) : BOARD_SEED_PLAYS + Math.floor(rng() * 3);
      let avg;
      if (thin && i === 6) avg = 1.6;
      else avg = 2.35 + rng() * 1.75;
      if (!thin) avg = Math.max(2.2, Math.min(4.15, avg));
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

  function histSum(hist) {
    return (hist || []).reduce((a, b) => a + (Number(b) || 0), 0);
  }
  function worseInHist(hist, accuracy) {
    if (!hist || !hist.length) return 0;
    const acc = Math.max(0, Math.min(100, Number(accuracy) || 0));
    const bins = hist.length;
    const idx = acc >= 100 ? bins - 1 : Math.min(bins - 1, Math.max(0, Math.floor(acc / (100 / bins))));
    let worse = 0;
    for (let i = 0; i < idx; i++) worse += Number(hist[i]) || 0;
    const width = 100 / bins;
    const frac = acc >= 100 ? 0.65 : (width > 0 ? (acc - idx * width) / width : 0);
    worse += (Number(hist[idx]) || 0) * Math.max(0, Math.min(1, frac));
    return worse;
  }
  /* Fewer tries is better. Accuracy breaks a tie. Unfinished games sit below
     every finish. Capped at 99 so a perfect game does not clear the field. */
  function betterThan(standing, tries, accuracy, solved) {
    if (!standing || !standing.byTries) return null;
    const mine = Math.round(Number(tries));
    if (!Number.isFinite(mine)) return null;
    const done = solved !== false;
    let total = 0, worse = 0;
    const walk = (buckets, score) => {
      Object.keys(buckets || {}).forEach(key => {
        const hist = buckets[key];
        const sum = histSum(hist);
        total += sum;
        worse += score(Number(key), hist, sum);
      });
    };
    walk(standing.failed, (k, hist, sum) => {
      if (done) return sum;
      if (k > mine) return sum;
      if (k === mine) return worseInHist(hist, accuracy);
      return 0;
    });
    walk(standing.byTries, (k, hist, sum) => {
      if (!done) return 0;
      if (k > mine) return sum;
      if (k === mine) return worseInHist(hist, accuracy);
      return 0;
    });
    if (!total) return null;
    const pct = Math.max(0, Math.min(99, Math.round(100 * worse / total)));
    /* A perfect first Lock is the top of the field. The same-bin fraction
       would otherwise leave a few perfect games "not worse", so the caption
       said 97 while the pedestal said Top 1%. */
    if (done && mine <= 1 && Number(accuracy) >= 100) return 99;
    return pct;
  }

  /* The player's pedestal and the "Better than Y%" line are one cut.
     Top X% is the remainder, so 99 is Top 1% and 76 is Top 24%. */
  function pedestalTopPercent(betterThanPct) {
    const y = Math.max(0, Math.min(99, Math.round(Number(betterThanPct) || 0)));
    return 100 - y;
  }

  /* avgFirst is sometimes stored against a shorter list than the puzzle's
     rows (named countries, not every row). Stretch it onto the row count
     the player just played, and keep the denominator on that same scale. */
  function scaleAvgFirst(avgFirst, seededOf, rowCount) {
    const denom = Math.max(1, Math.round(Number(rowCount) || Number(seededOf) || 1));
    let avg = Number(avgFirst);
    if (!Number.isFinite(avg)) avg = 0;
    const seeded = Math.round(Number(seededOf) || 0);
    if (seeded > 0 && seeded !== denom) avg = avg * denom / seeded;
    avg = Math.max(0, Math.min(denom, avg));
    return { avg: Math.round(avg * 10) / 10, firstOf: denom };
  }

  /* N in 7..9 whose equal bands put `percentile` (0–1, from the bottom)
     closest to a band's middle. Ties pick more platforms. A perfect first
     try skips this staircase: one tall center step, four lower steps aside. */
  function platformCount(percentile, perfectFirst) {
    if (perfectFirst) return { n: 9, band: 4, winner: true };
    const p = Math.max(0, Math.min(0.999999, Number(percentile) || 0));
    let bestN = 7, bestDist = Infinity, bestBand = 0;
    for (let n = 7; n <= 9; n++) {
      const x = p * n;
      const frac = x - Math.floor(x);
      const dist = Math.abs(frac - 0.5);
      if (dist < bestDist - 1e-9 || (Math.abs(dist - bestDist) < 1e-9 && n >= bestN)) {
        bestDist = dist;
        bestN = n;
        bestBand = Math.min(n - 1, Math.floor(x));
      }
    }
    return { n: bestN, band: bestBand, winner: false };
  }

  /* The row always reaches the top step. A player within five steps of it
     keeps at most five steps below them, so a high score is not a crowd. */
  function platformWindow(n, band) {
    const count = Math.max(1, Math.round(Number(n)) || 1);
    const index = Math.max(0, Math.min(count - 1, Math.round(Number(band)) || 0));
    const nearTop = count - 1 - index <= 5;
    return {
      lo: nearTop ? Math.max(0, index - 5) : 0,
      hi: count - 1,
      n: count,
      band: index,
    };
  }

  /* "Top X%" for a crowd pedestal, not the player's. Equal bands run
     worst → best, so band `index` is the group inside the top
     (count - index) / count of players. The rightmost pedestal is the top
     round(100 / n) percent. The player's own pedestal uses pedestalTopPercent. */
  function platformTopPercent(n, band) {
    const count = Math.max(1, Math.round(Number(n)) || 1);
    const index = Math.max(0, Math.min(count - 1, Math.round(Number(band)) || 0));
    return Math.max(1, Math.round((100 * (count - index)) / count));
  }

  function selfTest() {
    const ids = ["work-hours", "sex-ratio-15-64", "pew-meaning-religion", "top5-demo", "match-pew"];
    const leaders = new Set();
    ids.forEach(id => {
      const type = id.startsWith("top5") ? "top5" : "rank";
      const block = standingBlock(id, 900, type, 5);
      const solvedN = Object.values(block.byTries).reduce((a, h) => a + h.reduce((x, y) => x + y, 0), 0);
      const failedN = Object.values(block.failed).reduce((a, h) => a + h.reduce((x, y) => x + y, 0), 0);
      if (solvedN + failedN !== 900) throw new Error(id + " hist sum " + (solvedN + failedN));
      if (failedN < 60 || failedN > 160) throw new Error(id + " fail share " + failedN);
      if (combineAccuracy([0], true) !== 100) throw new Error("perfect guess");
      if (combineAccuracy([2, 0], true) !== 97) throw new Error("distance 2");
      if (combineAccuracy([30, 0], true) !== 80) throw new Error("clamped");
      if (combineAccuracy([0, 0, 0], true) !== 79) throw new Error("zero wrong guesses");
      const unfinished = combineAccuracy([4, 8], false);
      if (!(unfinished < 20) || unfinished >= combineAccuracy([4, 0], true)) throw new Error("failure not below a finish");
      if (block.avgTries < 2.8 || block.avgTries > 3.6) throw new Error(id + " tries " + block.avgTries);
      if (block.avgAccuracy < 50 || block.avgAccuracy > 72) throw new Error(id + " acc " + block.avgAccuracy);
      if (block.avgFirst < 1.2 || block.avgFirst > 3.2) throw new Error(id + " first " + block.avgFirst);
      const good = betterThan(block, 2, 90, true);
      const poor = betterThan(block, 5, 10, false);
      const perfect = betterThan(block, 1, 100, true);
      const lastTry = betterThan(block, 5, 30, true);
      if (good < 68 || good > 86) throw new Error(id + " good " + good);
      if (poor > 25) throw new Error(id + " poor " + poor);
      if (perfect < 88 || perfect > 99) throw new Error(id + " perfect " + perfect);
      if (lastTry <= poor) throw new Error(id + " failure not at the bottom " + lastTry + " " + poor);
      if (type === "top5" && (block.firstOf !== 5 || Object.keys(block.byTries).some(k => Number(k) > 5))) throw new Error(id + " still counts guesses");
      const mid = platformCount(0.5);
      if (mid.n !== 9 || mid.band !== 4 || mid.winner) throw new Error("platform center " + mid.n + " " + mid.band);
      const high = platformCount(0.9);
      if (high.n < 7 || high.n > 9 || high.band < 0 || high.band >= high.n || high.winner) throw new Error("platform high");
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
        if (r.avgTries < 2.1 || r.avgTries > 4.2) throw new Error(id + " tries " + r.avgTries);
      });
      const fastestThin = Math.min.apply(null, hidden.map(r => r.avgTries));
      if (!(fastestThin < shown[0].avgTries)) throw new Error(id + " thin country was not faster than the leader");
      shown.forEach(r => {
        if (r.players < BOARD_SEED_PLAYS || r.players > BOARD_SEED_PLAYS + 2) {
          throw new Error(id + " board seed " + r.code + " " + r.players);
        }
      });
      hidden.forEach(r => {
        if (r.players < 1 || r.players > 2) throw new Error(id + " thin seed " + r.code + " " + r.players);
      });
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
    const cutoff = topCountries([
      { code: "NZ", players: 1, avgTries: 1.1 },
      { code: "SG", players: 2, avgTries: 1.2 },
      { code: "FR", players: 8, avgTries: 1.3 },
      { code: "DE", players: 9, avgTries: 2.4 },
      { code: "JP", players: 11, avgTries: 2.9 },
    ]);
    if (cutoff.map(r => r.code).join() !== "DE,JP") throw new Error("seed cutoff " + cutoff.map(r => r.code).join());
    if (CONSENSUS_SEED_PLAYS !== 1) throw new Error("consensus seed");
    if (MIN_COUNTRY !== BOARD_SEED_PLAYS) throw new Error("9 seeds must clear the cutoff");
    const handful = standingBlock("work-hours", BOARD_SEED_PLAYS, "rank", 5);
    const handfulGood = betterThan(handful, 2, 90, true);
    const handfulPoor = betterThan(handful, 5, 10, false);
    if (!(handfulGood > handfulPoor && handfulGood >= 50 && handfulGood <= 90 && handfulPoor <= 30)) {
      throw new Error("board-sized comparison " + handfulGood + " " + handfulPoor);
    }
    const solo = standingBlock("work-hours", CONSENSUS_SEED_PLAYS, "rank", 5);
    const soloGood = betterThan(solo, 2, 80, true);
    if (solo.n !== 1 || (soloGood !== 0 && soloGood !== 99)) {
      throw new Error("1-play crowd is not a stable better-than sample " + solo.n + " " + soloGood);
    }
    if (platformTopPercent(10, 9) !== 10) throw new Error("top 10");
    if (platformTopPercent(100, 99) !== 1) throw new Error("top 1");
    if (platformTopPercent(7, 6) !== 14) throw new Error("top 14");
    if (platformTopPercent(9, 8) !== 11) throw new Error("top of nine");
    if (platformTopPercent(9, 4) !== 56) throw new Error("mid label");
    const win = platformCount(0.2, true);
    if (!win.winner || win.n !== 9 || win.band !== 4) throw new Error("winner podium");
    for (let i = 0; i < 100; i++) {
      const pick = platformCount(i / 100);
      if (pick.winner || pick.n < 7 || pick.n > 9) throw new Error("n range " + i);
      const view = platformWindow(pick.n, pick.band);
      if (view.hi !== pick.n - 1) throw new Error("crown dropped " + i);
      if (pick.band - view.lo > 5) throw new Error("left crowd " + i);
    }
    [0.9, 0.95, 0.97, 0.99].forEach(p => {
      const pick = platformCount(p);
      if (pick.band !== pick.n - 1) throw new Error("not the top pedestal " + p + " " + pick.n + " " + pick.band);
      if (platformTopPercent(pick.n, pick.band) !== platformTopPercent(pick.n, pick.n - 1)) {
        throw new Error("top pedestal should have one label value");
      }
    });
    const midPick = platformCount(0.5);
    if (midPick.band === midPick.n - 1) throw new Error("center landed on top");
    const midLabel = platformTopPercent(midPick.n, midPick.band);
    const crownLabel = platformTopPercent(midPick.n, midPick.n - 1);
    if (midLabel === crownLabel) throw new Error("mid and top labels collided");
    if (midLabel < 40 || midLabel > 60 || crownLabel < 8 || crownLabel > 15) {
      throw new Error("label range " + midLabel + " " + crownLabel);
    }
    [3, 4, 5, 6, 7].forEach(width => {
      const row = standingBlock("width-" + width, 900, "rank", width);
      if (row.firstOf !== width) throw new Error("row width " + width + " stored " + row.firstOf);
      const ratio = row.avgFirst / width;
      if (ratio < 0.25 || ratio > 0.7) throw new Error("row width " + width + " avg " + row.avgFirst);
    });
    const tierRow = standingBlock("pew-meaning-religion", 900, "tier", 6);
    const matchRow = standingBlock("match-foreign-relations", 900, "match", 4);
    if (tierRow.firstOf !== 6 || matchRow.firstOf !== 4) throw new Error("tier/match width");
    const topRow = standingBlock("top5-demo", 900, "top5", 80);
    if (topRow.firstOf !== 5 || topRow.avgFirst < 1.2 || topRow.avgFirst > 3.5) {
      throw new Error("top5 slots " + topRow.firstOf + " " + topRow.avgFirst);
    }
    const scaled = scaleAvgFirst(1.66, 4, 6);
    if (scaled.firstOf !== 6 || scaled.avg !== 2.5) throw new Error("scale " + scaled.avg + "/" + scaled.firstOf);
    if (pedestalTopPercent(99) !== 1 || pedestalTopPercent(76) !== 24) throw new Error("pedestal");
    [0, 24, 76, 97, 99].forEach(y => {
      if (pedestalTopPercent(y) + y !== 100) throw new Error("percentile split " + y);
    });
    console.log("community-seed self-test ok");
  }

  function mergeDoc(doc) {
    const puzzles = doc.puzzles || {};
    Object.keys(puzzles).forEach(pid => {
      const row = puzzles[pid];
      if (row.seeded === false) return;
      const type = row.type || "rank";
      const named = type === "name" || type === "top1" ? 1 : (row.perItemCorrect ? Object.keys(row.perItemCorrect).length : 0);
      const width = type === "top5" ? 5 : (type === "name" || type === "top1") ? 1 : (Number(row.rowCount) || named);
      row.countryBoard = countryBoard(pid, type);
      row.standing = standingBlock(pid, row.players || 0, type, width);
      delete row.rowCount;
      delete row.score;
    });
    doc.version = 6;
    doc.updatedAt = "2026-10-26T20:30:00Z";
    doc.note = "Seeded distributions until live aggregates exist. Stable per puzzle id. "
      + "firstGuessWorld and each firstGuessByCountry bucket are one seeded play, so the first real submits replace that ordering. "
      + "countryBoard is average tries only, about 9 seeded plays per country. "
      + "Countries under 9 plays are skipped on the leaderboard (seeds count); one or two real plays with no seed stay off it. "
      + "The board is ranked by fewest tries. "
      + "standing is a full crowd, a little under a typical clear, so better-than stays stable while real plays mix in. "
      + "standing.firstOf is the puzzle row count and avgFirst is on that scale. "
      + "standing.byTries is finished games; standing.failed is unfinished games, ranked below every finish. "
      + "Accuracy is 100 on a first-try solve. Each extra try drops into a lower band (80–99, 60–79, 40–59, 20–39, then 1–19). "
      + "Inside a band, each spot a country was off in a wrong guess costs 1 point. Unfinished games score 1–19 and rank under every finish.";
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

  return {
    standingBlock, countryBoard, topCountries, betterThan, combineAccuracy, top1Accuracy, top1Mark, ACCURACY_TIP,
    platformCount, platformWindow, platformTopPercent, pedestalTopPercent, scaleAvgFirst,
    MIN_COUNTRY, CONSENSUS_SEED_PLAYS, BOARD_SEED_PLAYS, mergeDoc,
  };
});
