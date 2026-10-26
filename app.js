/* Rankd prototype: daily stats game. "rank" (Rank it: drag to order) and "top5" (Top 5: six cards,
   the real top 5 plus one decoy, dragged into five slots; leave the odd one out; 5 lock-in tries).
   v7 retired "Guess the #1".
   No build step; works from file://. */
(() => {
"use strict";

// PWA: pwa.js (loaded on public pages, before this file) registers /sw.js.
// Studio never loads pwa.js. start() also no-ops for Studio and ?preview=.
// A new worker claims the page without reloading, so an open puzzle keeps its board.
if (window.RankiPwa) window.RankiPwa.start();

// ================================================================ config
const CONFIG = {
  brand: "Ranki.gg",  // v12.2 visible wordmark; localStorage keys stay rankd.*
  // Public URL used in share links. From file:// we can't share a local path, so a placeholder is used.
  siteUrl: (location.protocol.startsWith("http") ? location.origin + location.pathname : "https://rankd.example/"),
  // Daily No. 1 date. Set this to your launch date. (Prototype: set 2 weeks back so the Archive has content.)
  dailyEpoch: "2026-10-06",
  interstitialSeconds: 5,           // skip countdown
  interstitialOnDaily: false,       // never interrupt today's daily
  rankMaxTries: 5,                  // Rank it: lock-ins allowed before the answer is revealed
  // v11 PRE-LAUNCH SWITCH: true = show the "All puzzles" tab/list (every puzzle, past AND future, for testing).
  // Set to false at launch: the tab, the menu entry and #p= links disappear (random Practice stays).
  SHOW_ALL_PUZZLES: true,
  // v12.1 GOOGLE ADSENSE. The loader is only added on the real site (https, not localhost/file://), never in studio.html,
  // Studio preview (?preview=) or streamer mode. ?ads=live forces it on (tests), ?ads=placeholder forces the placeholders.
  ADSENSE_CLIENT: "ca-pub-5196178239625142",
  // Community compare snapshots. Live site reads the Ranki Supabase Edge Function.
  // community-stats.json stays in the repo and is the offline fallback (same seeded shape).
  COMMUNITY_STATS_URL: "https://fkxbqftqxvgqrtvkpglx.supabase.co/functions/v1/community-stats",
  // Anon key is public (RLS: insert-only on plays). Never put the service role in this file.
  SUPABASE_URL: "https://fkxbqftqxvgqrtvkpglx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZreGJxZnRxeHZncXJ0dmtwZ2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NDY0MzksImV4cCI6MjEwODMyMjQzOX0.vr-ZWCCLmYlkzGIOpIVq5elFZ-10uijFELNw6ET66Bc",
  // Premium (Lemon/Supabase later). enabled:false = everyone is free.
  premium: { enabled: false },
  // PostHog product analytics (same project as WhereIsShe; events are split with site:"ranki").
  // The loader, posthog.init and register({ site: "ranki" }) live in the index.html <head> snippet.
  // phc_ is the public client token, not a service secret. Studio and ?preview= do not capture.
  ANALYTICS: {
    enabled: true,
    provider: "posthog",
    apiHost: "https://us.i.posthog.com",
    token: "phc_BFzhf5CAX9wKcoGBVXnX3uPb4T2LAjeD3ZfBGiHWvFxc",
  },
  freeArchiveDays: 7,   // free base window (today + 6 prior). Not the per-ad step.
  adUnlockDays: 5,      // each completed long archive ad unlocks this many further days
  longAdSeconds: 20,    // placeholder long-ad countdown (?longad=N overrides for tests)
  // Ad-unit IDs (AdSense > Ads > By ad unit > Display ads, responsive). Empty = that slot collapses (no blank gap) and
  // only Auto ads (if switched on in AdSense) can place ads. Banner: 320x50 on phones / 728x90 on desktop (fixed by CSS).
  ADSENSE_SLOTS: { banner: "8002826017", interstitial: "", bottom: "8002826017" },   // v12.2: Display unit "ranki"; interstitial pending
  // AdSense review cutoff. Dailies on or before this date stay clear of sexual
  // content, sexual violence, intimate partner violence, homicide, murder,
  // suicide and drugs. The schedule itself is swapped (docs/adsense-safe-window.md).
  // Set to "" after approval; that turns inAdsenseSafeWindow() off.
  adsenseSafeThrough: "2026-11-03",
};
// tests only: with ?ads=live a page may pre-set window.RANKD_ADSENSE_SLOTS to fake ad-unit IDs
if (new URLSearchParams(location.search).get("ads") === "live" && window.RANKD_ADSENSE_SLOTS) Object.assign(CONFIG.ADSENSE_SLOTS, window.RANKD_ADSENSE_SLOTS);
const LS = { results: "rankd.results.v2", stats: "rankd.stats.v2", settings: "rankd.settings.v1", custom: "rankd.custom.v2",
  archiveUnlock: "rankd.archiveUnlock.v1", practiceAds: "rankd.practiceAds.v1", challengeName: "rankd.challengeName.v1" };
// v11.1 "Clear all data". Audit of everything Rankd stores (all of it is localStorage; nothing uses sessionStorage today):
//   rankd.results.v2  : puzzle progress for every mode (d: daily + archive, p: All puzzles, r: random Practice history)
//   rankd.stats.v2    : played / wins / streak / best / guess distribution
//   rankd.settings.v1 : theme and streamer mode (v12.1: a saved showValues is ignored and dropped; values are always on) (also written by the inline script in index.html for ?stream=)
//   rankd.custom.v2   : an uploaded spreadsheet
//   rankd.archiveUnlock.v1 : free archive unlock depth (unlockedDays). Absolute days back from today,
//                            including today. Kept as stored when the ad step changes; never rescaled.
//   rankd.practiceAds.v1   : practice games since last long-ad gate
//   rankd.challengeName.v1 : optional display name for challenge links (max 16). Stays on this device and in the
//                            shared URL. Not sent to Supabase or PostHog. Not remapped in preview.
//   rankd.country.v1       : coarse ISO country code (no IP) so the results panel can pick a community bucket. Session + local, 12h.
//   rankd.crosspromo.v1    : WhereIsShe card (dismissedAt ISO, lastShown). Fixed key — never remapped onto rankd.preview.*
// Ads (RankdAds) and win animations (RankdFx) keep their state in memory only. The cross-promo session cap is in memory too.
// The clear removes the keys above plus any
// "rankd." / "rankd:" / "rankd_" / "rankd-" prefixed key in localStorage AND sessionStorage, and nothing else: the origin
// michaelyao88.github.io is shared with other projects (e.g. whereisshe), so localStorage.clear() is never called.
// v12 Rankd Studio preview: index.html?preview=YYYY-MM-DD opens that scheduled day (past OR future). In preview the
// results/stats/custom keys move to a sandbox (rankd.preview.*), so real stats and streaks are never touched;
// Clear all data removes the sandbox too (it is rankd.-prefixed).
const PREVIEW = (() => { try { return (new URLSearchParams(location.search).get("preview") || "").trim(); } catch { return ""; } })();
if (PREVIEW) Object.assign(LS, { results: "rankd.preview.results.v2", stats: "rankd.preview.stats.v2", custom: "rankd.preview.custom.v2" });
const isRankdKey = k => Object.values(LS).includes(k) || /^rankd[.:_-]/i.test(k);
const RankdData = {
  keys() { const out = []; for (const st of [localStorage, sessionStorage]) { try { for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k != null && isRankdKey(k)) out.push([st === localStorage ? "local" : "session", k]); } } catch {} } return out; },
  clear() { const gone = this.keys(); for (const [w, k] of gone) { try { (w === "local" ? localStorage : sessionStorage).removeItem(k); } catch {} } return gone.map(x => x[0] + ":" + x[1]); },
};
window.RankdData = RankdData;

// ================================================================
// COMMUNITY STATS: snapshot from the Ranki Supabase Edge Function.
// Finished Daily / Archive games insert one row into public.plays.
// ----------------------------------------------------------------
// Shape (per puzzle id), served by COMMUNITY_STATS_URL (the doc is returned as stored):
//   shared: players, pctPerfect, seeded?
//   rank/tier/match: perItemCorrect: { [name]: pct 0–100 }   // final attempt, kept
//   top5: avgFound, avgRank, firstGuess: [{name, emoji, pct}] // world, kept
//   all:  firstGuessWorld: { players, bars: [...] }
//         firstGuessByCountry: { "TW": { players, bars }, "US": {...} }
//         countryBoard: [{ code, players, avgTries }]
//         standing: { avgTries, avgFirst, firstOf, avgAccuracy, byTries, failed, n, seeded? }
//   bars: rank {slot, name, pct}; tier {name, tier, pct}; match {name, matchedTo, label, pct}; top5 {name, pct}
// pctPerfect is "solved perfectly (first-try / full clear)". The results panel does not draw those
// percents: it shows the consensus ordering, a country board ranked by fewest tries, and the player's
// tries with a small accuracy line.
// The leaderboard skips a country under COMMUNITY_MIN_COUNTRY plays. Seeded
// countries carry about 9 plays and those count, so they still appear. One or
// two real plays with no seed stay off the board. The per-country ordering is
// a 1-play seed and shows from the first play, so real submits replace it
// immediately. "Your score vs average" and "better than" use the full standing
// crowd, not that 1-play seed — a single seeded play would pin the percentile
// at 0 or 99.
// Accuracy is 100 on a first-try solve. Each extra try drops into a lower band
// (80s, 60s, 40s, 20s, then 1–19). Inside a band, every spot a country was off
// in a wrong guess costs 1 point. An unfinished game scores 1–19 from the last
// guess and ranks under every finish. Platforms rank by tries, then accuracy,
// with failures at the bottom.
// When the snapshot has no countryBoard or standing yet, RankdSeed fills a distribution that
// sits a little under a typical clear. Real plays mix into the seed, and replace that
// puzzle once rebuild_community_snapshot.py sees enough of them for a stable percentile.
// Practice hides compare and is not inserted. Studio never starts the game.
// ?preview= is the Loading Zone sandbox ("doesn't count"; ads and the sister-game
// card already skip it) so those finishes are not inserted either. Streamer mode
// only hides ads — a Daily or Archive finish there still counts.
// ?stats=local forces the repo seed. ?cc=TW only changes which bucket the panel reads.
// Writes are fire-and-forget. Failures never surface in the UI.
// Country is not sent by the client. submit-play derives an ISO code and drops the IP.
// ================================================================
const COMMUNITY_STATS_FALLBACK = "community-stats.json";
const COMMUNITY_MIN_COUNTRY = (window.RankdSeed && window.RankdSeed.MIN_COUNTRY) || 9;
const GEO_LS = "rankd.country.v1";
const GEO_TTL_MS = 12 * 60 * 60 * 1000;
const GEO_NEG_TTL_MS = 10 * 60 * 1000;
function clipCommunityName(value) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 80) : "";
}
function namedPiece(it) {
  const name = clipCommunityName(it && it.name);
  if (!name) return null;
  const piece = { name };
  const emoji = it.emoji ? String(it.emoji).slice(0, 16) : "";
  if (emoji) piece.emoji = emoji;
  return piece;
}
function attemptGuess(type, attempt, p) {
  if (!attempt || !p) return null;
  if (type === "rank" && Array.isArray(attempt.order) && p.items) {
    const order = [];
    for (const idx of attempt.order) {
      const piece = namedPiece(p.items[idx]);
      if (piece) order.push(piece);
    }
    return order.length ? { kind: "rank", order } : null;
  }
  if (type === "tier" && Array.isArray(attempt.assign) && p.items) {
    const assign = [];
    attempt.assign.forEach((ti, i) => {
      const piece = namedPiece(p.items[i]);
      if (!piece) return;
      const tier = p.tiers && p.tiers[ti];
      if (tier && tier.label) piece.tier = clipCommunityName(tier.label).slice(0, 40);
      if (Number.isInteger(ti)) piece.tierIndex = ti;
      assign.push(piece);
    });
    return assign.length ? { kind: "tier", assign } : null;
  }
  if (type === "match" && Array.isArray(attempt.assign) && p.people) {
    const pairs = [];
    attempt.assign.forEach((personIdx, clueIdx) => {
      const clueFor = p.people[clueIdx], person = p.people[personIdx];
      const clueName = clipCommunityName(clueFor && clueFor.name);
      const personName = clipCommunityName(person && person.name);
      if (!clueName || !personName) return;
      const pair = { clueFor: clueName, person: personName };
      if (person.emoji) pair.personEmoji = String(person.emoji).slice(0, 16);
      pairs.push(pair);
    });
    return pairs.length ? { kind: "match", pairs } : null;
  }
  if (type === "top5" && Array.isArray(attempt.slots) && p.countries) {
    const order = [];
    for (const key of attempt.slots) {
      const c = p.countries.find(x => (x.iso3 && x.iso3 === key) || x.name === key);
      const piece = namedPiece(c);
      if (piece) order.push(piece);
    }
    return order.length ? { kind: "top5", order } : null;
  }
  return null;
}
function top5Piece(p, key) {
  if (key == null || key === "") return null;
  const c = p && p.countries && p.countries.find(x => (x.iso3 && x.iso3 === key) || x.name === key);
  if (!c || !c.name) return { kind: "top5", key: clipCommunityName(key) };
  const piece = { kind: "top5", name: clipCommunityName(c.name) };
  if (c.emoji) piece.emoji = String(c.emoji).slice(0, 16);
  try { piece.hit = inTop(p, c); piece.rank = tieRank(p, c); } catch { /* catalog not ready */ }
  return piece;
}
// Spot distance: sum of |guessed slot − correct slot|. Ties share a slot, so an
// item on any slot with its value is distance 0. Each spot is one accuracy point.
function nearestRankSlots(p) {
  const correct = correctOrder(p);
  const need = correct.map(i => p.items[i].value);
  const slots = new Map();
  need.forEach((v, slot) => {
    const key = String(v);
    if (!slots.has(key)) slots.set(key, []);
    slots.get(key).push(slot);
  });
  const pos = [];
  p.items.forEach((it, item) => {
    const options = slots.get(String(it.value)) || [];
    pos[item] = options.length ? options[0] : correct.indexOf(item);
  });
  return { pos, slots };
}
function rankDistance(p, order) {
  if (!order || order.length !== p.items.length) return null;
  const { slots } = nearestRankSlots(p);
  const n = order.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const it = p.items[order[i]];
    if (!it) return null;
    const options = slots.get(String(it.value)) || [];
    if (!options.length) return null;
    let best = n;
    options.forEach(slot => { best = Math.min(best, Math.abs(i - slot)); });
    sum += best;
  }
  return sum;
}
// Top 5: value-matched slots. A decoy has no home slot — placing it at #5 is a near miss, #1 costs more.
// The return is raw spots, the same unit Rank it uses, so the try bands apply.
function top5Distance(p, attempt) {
  const placed = attempt.slots || [];
  const n = 5;
  if (!p || !p.countries || placed.length !== n) return null;
  const need = slotsOf(p);
  if (!need || need.length !== n) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const c = placed[i] && findCountry(p, placed[i]);
    if (!c) { sum += n; continue; }
    if (c.value === need[i].value) continue;
    const home = need.findIndex(s => s.value === c.value);
    sum += home < 0 ? (n - i) : Math.abs(i - home);
  }
  return sum;
}
function attemptDistance(p, type, attempt) {
  const marks = attempt.marks || [];
  if (marks.length && marks.every(m => m === "good")) return 0;
  if (type === "rank") return attempt.order ? rankDistance(p, attempt.order) : null;
  if (type === "tier" && attempt.assign && p.tiers) {
    const right = correctTierAssign(p);
    let sum = 0;
    for (let i = 0; i < right.length; i++) sum += Math.abs((attempt.assign[i] ?? right[i]) - right[i]);
    return sum;
  }
  if (type === "match" && attempt.assign) {
    let sum = 0;
    const n = attempt.assign.length;
    for (let i = 0; i < n; i++) sum += Math.abs((attempt.assign[i] ?? i) - i);
    return sum;
  }
  if (type === "top5" && attempt.slots) return top5Distance(p, attempt);
  return null;
}
// Plain results plus accuracy. The try count picks the band. Spot distance
// only moves the score inside it. The (?) copy does not mention unfinished games.
const ACCURACY_TIP = "100 for a first-try solve. Each extra try drops you to a lower band (80s, 60s, 40s, 20s), and within a band you lose 1 point for every spot a country was off in your wrong guesses.";
function accuracyTip() {
  return (window.RankdSeed && window.RankdSeed.ACCURACY_TIP) || ACCURACY_TIP;
}
function resultCard(p, result) {
  if (!p || !result || !window.RankdSeed) return null;
  const type = result.type || p.type;
  const tip = accuracyTip();
  // A finished pre-slot Top 5 is a list of name guesses. Misses, not locks, pick the band.
  if (type === "top5" && !(result.attempts && result.attempts.length)) {
    const keys = result.guesses || [];
    if (!keys.length || (p.countries || []).length <= 5) return null;
    const distances = [];
    keys.forEach(k => {
      const c = findCountry(p, k);
      if (!c) return;
      distances.push(inTop(p, c) ? 0 : Math.max(0, tieRank(p, c) - 5));
    });
    if (!distances.length) return null;
    const solved = !!result.won;
    const first = findCountry(p, keys[0]);
    return {
      tries: result.tries || keys.length,
      solved,
      firstCorrect: first && inTop(p, first) ? 1 : 0,
      firstOf: 1,
      accuracy: window.RankdSeed.combineAccuracy(distances, solved, "top5"),
      kind: "top5",
      tip,
    };
  }
  if (type === "name") {
    const attempts = result.attempts || [];
    if (!attempts.length || result.tries == null) return null;
    const distances = [];
    for (const attempt of attempts) {
      const marks = attempt.marks || [];
      if (!marks.length) return null;
      distances.push(marks.every(m => m === "good") ? 0 : 1);
    }
    const firstMarks = (attempts[0] && attempts[0].marks) || [];
    return {
      tries: result.tries,
      solved: !!result.solved,
      firstCorrect: firstMarks.length && firstMarks.every(m => m === "good") ? 1 : 0,
      firstOf: 1,
      accuracy: window.RankdSeed.combineAccuracy(distances, !!result.solved),
      kind: "name",
      tip,
    };
  }
  const attempts = result.attempts || [];
  if (!attempts.length || result.tries == null) return null;
  const distances = [];
  for (const attempt of attempts) {
    const d = attemptDistance(p, type, attempt);
    if (d == null) return null;
    distances.push(d);
  }
  const marks = (attempts[0] && attempts[0].marks) || [];
  if (!marks.length) return null;
  // Rank, Tier, Match, and the six-card Top 5 all score by how many locks it took.
  // Do not pass kind "top5" here: that path counts name-guess misses, so a
  // 3-lock solve with nothing off would become 100 instead of 79.
  return {
    tries: result.tries,
    solved: !!result.solved,
    firstCorrect: marks.filter(m => m === "good").length,
    firstOf: marks.length,
    accuracy: window.RankdSeed.combineAccuracy(distances, !!result.solved),
    kind: "order",
    tip,
  };
}
// One number for the whole game: correct placements divided by placements submitted.
// Kept on the play payload so older snapshots can still read it.
function placementScore(result) {
  if (!result) return null;
  const type = result.type;
  if (type === "top5" && !(result.attempts && result.attempts.length)) {
    const n = (result.guesses || []).length;
    if (!n || result.hits == null || Number.isNaN(Number(result.hits))) return null;
    return Math.max(0, Math.min(1, Number(result.hits) / n));
  }
  const attempts = Array.isArray(result.attempts) ? result.attempts : [];
  let good = 0, total = 0;
  for (const attempt of attempts) {
    for (const mark of (attempt.marks || [])) {
      total += 1;
      if (mark === "good") good += 1;
    }
  }
  if (!total) return null;
  return good / total;
}
function communityPlayRow(result) {
  if (!result || window.RANKD_STUDIO || PREVIEW) return null;
  const mode = result.mode;
  if (mode !== "daily" && mode !== "archive") return null;   // practice, all, preview
  if (!result.puzzleId || !/^\d{4}-\d{2}-\d{2}$/.test(result.day || "")) return null;
  const p = state.puzzle && state.puzzle.id === result.puzzleId ? state.puzzle : null;
  const type = result.type || (p && p.type) || "";
  if (type !== "rank" && type !== "top5" && type !== "tier" && type !== "match" && type !== "name") return null;
  const tries = result.tries ?? null;
  let solved = false, perfect = false;
  const payload = { tries };
  let first = null, second = null;
  if (type === "rank" || type === "tier" || type === "match") {
    solved = !!result.solved;
    perfect = solved && tries === 1;   // first-try / full clear (pctPerfect)
    const marks = result.marks || [];
    if (type === "match" && p && p.people) payload.items = p.people.map((person, i) => ({ name: person.name, mark: marks[i] || null }));
    else if (type === "rank" && p && p.items && result.order) payload.items = result.order.map((idx, n) => ({ name: p.items[idx] ? p.items[idx].name : null, mark: marks[n] || null }));
    else if (type === "tier" && p && p.items) payload.items = p.items.map((it, i) => ({ name: it.name, mark: marks[i] || null }));
    else payload.marks = marks;
    // attempts[0] is the first lock-in. The final order is payload.items and is not reused as
    // the first guess when the player tried more than once.
    const attempts = Array.isArray(result.attempts) ? result.attempts : [];
    first = attemptGuess(type, attempts[0], p);
    second = attempts.length > 1 ? attemptGuess(type, attempts[1], p) : null;
  } else if (type === "top5" && Array.isArray(result.attempts) && result.attempts.length) {
    solved = !!(result.solved || result.won);
    perfect = solved && tries === 1;
    const attempts = result.attempts;
    const lastTry = attempts[attempts.length - 1] || {};
    const marks = result.marks || lastTry.marks || [];
    payload.items = (lastTry.slots || []).map((key, n) => {
      const c = p && p.countries && p.countries.find(x => (x.iso3 && x.iso3 === key) || x.name === key);
      return { name: c ? c.name : null, mark: marks[n] || null };
    });
    first = attemptGuess(type, attempts[0], p);
    second = attempts.length > 1 ? attemptGuess(type, attempts[1], p) : null;
  } else if (type === "top5") {
    solved = !!result.won;   // legacy: found all 5 by naming countries
    const misses = result.misses ?? null;
    perfect = solved && misses === 0;   // flawless full clear (same bar as FLAWLESS)
    const keys = result.guesses || [];
    const guesses = keys.map(k => {
      const c = p && p.countries && p.countries.find(x => (x.iso3 && x.iso3 === k) || x.name === k);
      return c ? { name: c.name, emoji: c.emoji || "", hit: inTop(p, c), rank: tieRank(p, c) } : { key: k };
    });
    payload.guesses = guesses;
    payload.hits = result.hits ?? null;
    payload.misses = misses;
    payload.avgRank = result.avgRank ?? null;
    first = top5Piece(p, keys[0]);
    second = keys.length > 1 ? top5Piece(p, keys[1]) : null;
  } else if (type === "name") {
    solved = !!result.solved;
    perfect = solved && tries === 1;
    const guesses = (result.guesses || []).filter(g => g && g.counts !== false && g.name);
    payload.guesses = guesses.map(g => ({ name: g.name, emoji: g.emoji || "", iso3: g.iso3 || "" }));
    payload.pick = result.pick || null;
    const piece = g => (g ? { kind: "name", name: g.name, emoji: g.emoji || "" } : null);
    first = piece(guesses[0]);
    second = guesses.length > 1 ? piece(guesses[1]) : null;
  } else {
    solved = !!(result.solved || result.won);
    perfect = solved && tries === 1;
  }
  payload.firstGuess = first;
  payload.secondGuess = second;
  const score = placementScore(result);
  if (score != null) payload.score = Math.round(score * 10000) / 10000;
  const card = p ? resultCard(p, result) : null;
  if (card) {
    payload.accuracy = card.accuracy;
    payload.firstCorrect = card.firstCorrect;
    payload.firstOf = card.firstOf;
  }
  return {
    puzzle_id: String(result.puzzleId), day_key: result.day, mode, puzzle_type: type, solved, perfect, payload,
    first_guess: first, second_guess: second,
  };
}
function regionName(code) {
  const c = String(code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(c);
    return name && name !== c ? name : c;
  } catch { return c; }
}
const ViewerGeo = {
  _memo: undefined,
  async country() {
    let override = "";
    try { override = new URLSearchParams(location.search).get("cc") || ""; } catch { override = ""; }
    if (/^[A-Za-z]{2}$/.test(override)) return override.toUpperCase();
    if (this._memo !== undefined) return this._memo;
    const cached = this._read();
    if (cached !== undefined) { this._memo = cached; return cached; }
    const code = await this._fetch();
    this._write(code);
    this._memo = code;
    return code;
  },
  _stores() {
    const stores = [];
    try { stores.push(sessionStorage); } catch { /* private mode */ }
    try { stores.push(localStorage); } catch { /* private mode */ }
    return stores;
  },
  _read() {
    for (const store of this._stores()) {
      try {
        const v = JSON.parse(store.getItem(GEO_LS) || "null");
        if (!v || typeof v.at !== "number") continue;
        const ttl = v.code ? GEO_TTL_MS : GEO_NEG_TTL_MS;
        if (Date.now() - v.at > ttl) continue;
        const code = String(v.code || "").toUpperCase();
        return /^[A-Z]{2}$/.test(code) ? code : null;
      } catch { /* next store */ }
    }
    return undefined;
  },
  _write(code) {
    const v = JSON.stringify({ code: code || null, at: Date.now() });
    for (const store of this._stores()) { try { store.setItem(GEO_LS, v); } catch { /* ignore */ } }
  },
  async _fetch() {
    const base = String(CONFIG.SUPABASE_URL || "").replace(/\/$/, "");
    const key = CONFIG.SUPABASE_ANON_KEY;
    if (!base || !key) return null;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 2500) : null;
    try {
      const res = await fetch(base + "/functions/v1/submit-play", {
        method: "GET", cache: "no-store", signal: ctrl ? ctrl.signal : undefined,
        headers: { apikey: key, Authorization: "Bearer " + key },
      });
      if (!res.ok) return null;
      const body = await res.json();
      const code = String((body && body.countryCode) || "").toUpperCase();
      return /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1" ? code : null;
    } catch { return null; }
    finally { if (timer) clearTimeout(timer); }
  },
};
const CommunityStats = {
  _cache: null, _url: null,
  async load() {
    let local = false;
    try { local = new URLSearchParams(location.search).get("stats") === "local"; } catch { local = false; }
    const url = local ? COMMUNITY_STATS_FALLBACK : (CONFIG.COMMUNITY_STATS_URL || COMMUNITY_STATS_FALLBACK);
    if (this._cache && this._url === url) return this._cache;
    this._url = url;
    const pull = async (u) => {
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) throw new Error("community-stats " + res.status);
      return res.json();
    };
    try { this._cache = await pull(url); }
    catch (e) {
      if (url !== COMMUNITY_STATS_FALLBACK) { try { this._cache = await pull(COMMUNITY_STATS_FALLBACK); return this._cache; } catch {} }
      this._cache = { puzzles: {} };
    }
    return this._cache;
  },
  submit(result) {
    try {
      const row = communityPlayRow(result);
      const base = String(CONFIG.SUPABASE_URL || "").replace(/\/$/, "");
      const key = CONFIG.SUPABASE_ANON_KEY;
      if (!row || !base || !key) return false;
      const headers = { "Content-Type": "application/json", apikey: key, Authorization: "Bearer " + key };
      // Legacy insert omits country_code and the new columns. Guesses still ride in payload.
      const legacy = {
        puzzle_id: row.puzzle_id, day_key: row.day_key, mode: row.mode, puzzle_type: row.puzzle_type,
        solved: row.solved, perfect: row.perfect, payload: row.payload,
      };
      const legacyInsert = () => {
        fetch(base + "/rest/v1/plays", {
          method: "POST", keepalive: true,
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify(legacy),
        }).catch(() => {});
      };
      // 422 = rejected row (no insert). Anything else (missing function, 500) falls back.
      fetch(base + "/functions/v1/submit-play", {
        method: "POST", keepalive: true, headers, body: JSON.stringify(row),
      }).then(res => {
        if (res.ok || res.status === 422) return;
        legacyInsert();
      }, legacyInsert);
      return true;
    } catch { return false; }
  },
  async fetch(puzzleId, /* dayKey */) {
    const doc = await this.load();
    const row = doc && doc.puzzles && doc.puzzles[puzzleId];
    return row || null;
  },
};

// ================================================================ helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const keyOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayKey = () => keyOf(new Date());
const utc = k => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const dayNumber = k => Math.round((utc(k) - utc(CONFIG.dailyEpoch)) / 864e5);      // 0-based
const keyFromDay = n => { const d = new Date(utc(CONFIG.dailyEpoch) + n * 864e5); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; };
const validKey = k => /^\d{4}-\d{2}-\d{2}$/.test(k || "") && !isNaN(utc(k));
const prettyDate = k => new Date(utc(k)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const longDate = k => new Date(utc(k)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const pad3 = n => String(n).padStart(3, "0");
function rng(seedStr) { let h = 1779033703 ^ seedStr.length; for (const c of seedStr) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
function fmt(v) { const dec = Math.min(2, ((String(v).split(".")[1]) || "").length); return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
const fmt1 = v => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });  // guess datasets: 1 decimal
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2400); }
const norm = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ================================================================ data parsing (mirrors build.py)
const SHEET_COLS = {
  puzzles: ["puzzle_id","daily_order","puzzle_emoji","question","stat_label","unit","higher_is","values_visible","item_name","item_emoji","value","data_year","source_name","source_url","fun_fact","global_rank","global_total","global_scope","art","support_url","dataset","series_title","headline"],
  country_lists: ["puzzle_id","country","iso3","emoji","value","year","tiebreak"],
  country_info: ["iso3","country","region","continent","capital","landlocked","part_of","population","population_year","gdp_per_capita_usd","gdp_year","source"],
  hint_bank: ["puzzle_id","rank","country","iso3","hint_no","auto_hint","override_hint","source"],
  top5_puzzles: ["puzzle_id","daily_order","puzzle_emoji","question","stat_label","unit","data_from","max_misses","data_year","source_name","source_url","fun_fact","art","support_url","headline","decoy_country","decoy_iso3","decoy_emoji","decoy_value","decoy_rank"],
  match_puzzles: ["puzzle_id","daily_order","puzzle_emoji","headline","subtitle","item_name","country_iso","item_emoji","country_name","clue","fact","source_name","source_url","art","original_clue","flag_img"],
  tier_puzzles: ["puzzle_id","daily_order","puzzle_emoji","headline","subtitle","stat_label","unit","source_name","source_url","fun_fact","art","tier_value","tier_label","item_name","item_emoji","country_iso","item_value","data_year","dataset","support_url","note"],
};
const str = v => { v = String(v ?? "").trim(); return v.endsWith(".0") ? v.slice(0, -2) : v; };
const num = v => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : null; };
const lowerKeys = r => { const o = {}; for (const k in r) o[String(k).trim().toLowerCase()] = r[k]; return o; };

/** Guess which sheet a table is from by its headers (used for CSV uploads). */
function sheetTypeOf(headers) {
  const h = new Set(headers.map(x => String(x).trim().toLowerCase()));
  if (h.has("tier_value") || h.has("tier_label")) return "tier_puzzles";   // before item_name: tier rows also carry item_name
  if (h.has("clue")) return "match_puzzles";
  if (h.has("item_name")) return "puzzles";
  if (h.has("data_from") || h.has("max_misses")) return "top5_puzzles";
  if (h.has("hint_no") || h.has("auto_hint")) return "hint_bank";
  if (h.has("iso3") && (h.has("region") || h.has("gdp_per_capita_usd"))) return "country_info";
  if (h.has("country") && h.has("value")) return "country_lists";
  return null;
}

const FAMOUS = ["United States", "China", "India", "Japan", "Brazil", "Russia", "United Kingdom", "Germany", "France", "Mexico", "Italy", "Canada", "Australia", "South Korea", "Spain", "Turkey", "Saudi Arabia", "Egypt", "Nigeria", "South Africa", "Argentina", "Indonesia", "Sweden", "Israel", "Iran", "Netherlands", "Switzerland", "Norway", "Poland", "Ukraine", "Pakistan", "Thailand", "Vietnam", "Kenya", "Ireland", "Greece", "Cuba", "Jamaica", "New Zealand", "Portugal", "Denmark", "Finland", "England"];   // v11: preferred (recognizable) countries for title flags, same list as build.py
const MIN_TOP5_COUNTRIES = 38;   // Top 5 needs >= 38 countries to draw a decoy from (else auto Rank it)
function countryBeats(a, b) {
  return a.value > b.value || (a.value === b.value && a.exact != null && b.exact != null && a.exact > b.exact);
}
function countryRank(list, c) { return 1 + list.filter(x => countryBeats(x, c)).length; }
function rankedCountryList(countries) {
  return (countries || []).slice().sort((a, b) => b.value - a.value || (b.exact ?? 0) - (a.exact ?? 0));
}
// The decoy is the most famous country outside the top 5 (and outside a tie for #5). Same list, real value.
function pickDecoyCountry(countries) {
  const sorted = rankedCountryList(countries);
  if (sorted.length < 6) return null;
  const fifth = sorted[4];
  const inSlot = c => { const i = sorted.indexOf(c); return i >= 0 && (i < 4 || (c.value === fifth.value && (c.exact ?? null) === (fifth.exact ?? null))); };
  const outside = sorted.filter(c => !inSlot(c));
  const famous = new Set(FAMOUS);
  return outside.find(c => famous.has(c.name)) || outside[0] || null;
}
function decoyFromRow(row, countries) {
  const name = str(row.decoy_country || ""), iso = str(row.decoy_iso3 || "");
  let c = (name || iso) ? countries.find(x => (iso && x.iso3 === iso) || x.name === name) : null;
  if (!c) c = pickDecoyCountry(countries);
  if (!c) return null;
  return { name: c.name, iso3: c.iso3 || "", emoji: c.emoji || "", value: c.value, rank: countryRank(countries, c), year: c.year || "" };
}
function parseTables(t) {
  const out = [], by = {}, orderOf = (v, i) => num(v) ?? 10000 + i;
  for (const raw of t.puzzles || []) {
    const r = lowerKeys(raw), id = str(r.puzzle_id); if (!id) continue;
    let p = by[id];
    if (!p) { p = by[id] = { type: "rank", id, order: null, emoji: "", question: "", stat: "", unit: "", higherIs: "top", valuesVisible: false, source: "", sourceUrl: "", fact: "", art: "", support: "", headline: "", items: [] }; out.push(p); }
    if (!p.items.length) {
      p.order = orderOf(r.daily_order, out.length);
      const hi = str(r.higher_is).toLowerCase(); p.higherIs = hi === "bottom" ? "bottom" : "top";
      p.valuesVisible = ["yes", "y", "true", "1"].includes(str(r.values_visible).toLowerCase());
    }
    for (const [k, c] of [["emoji","puzzle_emoji"],["question","question"],["stat","stat_label"],["unit","unit"],["source","source_name"],["sourceUrl","source_url"],["fact","fun_fact"],["art","art"],["support","support_url"],["dataset","dataset"],["series","series_title"],["headline","headline"]])
      if (!p[k] && str(r[c])) p[k] = str(r[c]);
    const value = num(r.value); if (value == null) continue;
    const it = { name: str(r.item_name) || "?", emoji: str(r.item_emoji), value, year: str(r.data_year) };
    const gr = num(r.global_rank), gt = num(r.global_total);
    if (gr && gt) Object.assign(it, { gRank: Math.round(gr), gTotal: Math.round(gt), gScope: str(r.global_scope) });
    p.items.push(it);
  }
  const data = {}, bank = {};
  for (const raw of t.country_lists || t.guess_data || []) { const r = lowerKeys(raw), id = str(r.puzzle_id), v = num(r.value);   // guess_data = pre-v7 name
    if (id && v != null && str(r.country)) (data[id] ||= []).push({ name: str(r.country), iso3: str(r.iso3), emoji: str(r.emoji), value: v, year: str(r.year), ...(num(r.tiebreak) != null ? { exact: num(r.tiebreak) } : {}) }); }
  for (const raw of t.hint_bank || []) { const r = lowerKeys(raw), h = str(r.override_hint) || str(r.auto_hint), n = num(r.hint_no);
    if (h && n) ((bank[str(r.puzzle_id) + "|" + (str(r.iso3) || str(r.country))] ||= [])[Math.round(n) - 1] = h); }
  (t.top5_puzzles || []).forEach((raw, i) => {
    const r = lowerKeys(raw), id = str(r.puzzle_id); if (!id) return;
    let countries = (data[str(r.data_from) || id] || []).slice().sort((a, b) => b.value - a.value || (b.exact ?? 0) - (a.exact ?? 0)); if (countries.length < 6) return;
    if (countries.length < MIN_TOP5_COUNTRIES) {   // v9 rule (same as build.py): too few countries -> 5-item Rank it
      const n = countries.length, idx = [...new Set([0, .25, .5, .75, 1].map(f => Math.round((n - 1) * f)))];
      out.push({ type: "rank", id, order: orderOf(r.daily_order, out.length + i), emoji: str(r.puzzle_emoji), question: str(r.question) || id,
        stat: str(r.stat_label), unit: str(r.unit), higherIs: "top", valuesVisible: false, source: str(r.source_name), sourceUrl: str(r.source_url),
        fact: str(r.fun_fact), art: str(r.art), support: str(r.support_url), headline: str(r.headline), convertedFrom: "top5",
        items: idx.map(k => countries[k]).map(c => ({ name: c.name, emoji: c.emoji, value: c.value, year: c.year,
          gRank: 1 + countries.filter(x => x.value > c.value).length, gTotal: n, gScope: "" })) });
      return;
    }
    const c5 = countries[4], cut = c => countries.indexOf(c) < 4 || (c.value === c5.value && (c.exact ?? null) === (c5.exact ?? null));
    countries = countries.map(c => { const b = bank[id + "|" + (c.iso3 || c.name)]; return cut(c) && b ? { ...c, hints: b.filter(Boolean) } : c; });
    const decoy = decoyFromRow(r, countries);
    out.push({ type: "top5", id, order: orderOf(r.daily_order, out.length + i), emoji: str(r.puzzle_emoji), question: str(r.question) || id,
      stat: str(r.stat_label), unit: str(r.unit), maxMisses: Math.round(num(r.max_misses) || 10), year: str(r.data_year),
      source: str(r.source_name), sourceUrl: str(r.source_url), fact: str(r.fun_fact), art: str(r.art), support: str(r.support_url), headline: str(r.headline), ...(decoy ? { decoy } : {}), countries });
  });
  const mby = {};   // v12 Match it (same rules as build.py: 4 to 7 rows, distinct clues)
  for (const raw of t.match_puzzles || []) { const r = lowerKeys(raw), id = str(r.puzzle_id); if (!id) continue;
    const m = mby[id] ||= { type: "match", id, order: orderOf(r.daily_order, out.length + Object.keys(mby).length), emoji: "", headline: "", question: "", stat: "Match each clue to the right person", unit: "", source: "", sourceUrl: "", fact: "", art: "", support: "", people: [] };
    for (const [k, c] of [["emoji","puzzle_emoji"],["headline","headline"],["question","subtitle"],["art","art"]]) if (!m[k] && str(r[c])) m[k] = str(r[c]);
    if (str(r.item_name) && str(r.clue)) m.people.push({ name: str(r.item_name), iso3: str(r.country_iso).toUpperCase(), emoji: str(r.item_emoji), country: str(r.country_name) || str(r.country_iso), clue: str(r.clue), fact: str(r.fact), sourceName: str(r.source_name), sourceUrl: str(r.source_url), ...(str(r.flag_img) ? { flagImg: str(r.flag_img) } : {}) }); }
  Object.values(mby).forEach(m => { if (m.people.length < 4 || m.people.length > 7 || new Set(m.people.map(x => x.clue)).size !== m.people.length) return;
    m.emoji ||= "🔗"; m.question ||= m.headline || m.id; m.source = [...new Set(m.people.map(x => x.sourceName).filter(Boolean))].join("; "); m.sourceUrl = m.people[0].sourceUrl; out.push(m); });
  const tby = {};   // v12.2 Tier it: one row per item; rows that share tier_value share a tier (same rules as the tier_puzzles sheet)
  for (const raw of t.tier_puzzles || []) {
    const r = lowerKeys(raw), id = str(r.puzzle_id); if (!id) continue;
    const tp = tby[id] ||= { type: "tier", id, order: orderOf(r.daily_order, out.length + Object.keys(tby).length), emoji: "", headline: "", question: "", stat: "", unit: "", source: "", sourceUrl: "", fact: "", art: "", support: "", dataset: "", tiers: [], items: [], _ti: new Map() };
    for (const [k, c] of [["emoji","puzzle_emoji"],["headline","headline"],["question","subtitle"],["stat","stat_label"],["unit","unit"],["source","source_name"],["sourceUrl","source_url"],["fact","fun_fact"],["art","art"],["support","support_url"],["dataset","dataset"]])
      if (!tp[k] && str(r[c])) tp[k] = str(r[c]);
    if (!tp.year && str(r.data_year)) tp.year = str(r.data_year);
    const tv = num(r.tier_value), name = str(r.item_name); if (tv == null || !name) continue;
    if (!tp._ti.has(tv)) { tp._ti.set(tv, tp.tiers.length); tp.tiers.push({ label: str(r.tier_label) || (Number.isInteger(tv) && tp.unit === "%" ? `${tv}%` : String(tv)), value: tv }); }
    const iv = num(r.item_value);
    const item = { name, emoji: str(r.item_emoji), value: iv == null ? tv : iv, tierIndex: tp._ti.get(tv) };
    if (str(r.country_iso)) item.iso3 = str(r.country_iso).toUpperCase();
    tp.items.push(item);
  }
  Object.values(tby).forEach(tp => { delete tp._ti; if (tp.tiers.length < 2 || tp.items.length < 3) return;
    tp.emoji ||= "📊"; tp.question ||= tp.stat || tp.headline || tp.id; out.push(tp); });
  const res = out.filter(p => p.type !== "rank" || p.items.length >= 2).map(p => ({ ...p, question: p.question || p.stat || p.id })).sort((a, b) => a.order - b.order);
  // v11 (same as build.py apply_titles): no "(Group X)" labels. Rankers sharing a "dataset" key are titled with the plain
  // stat name (series_title) + 2 flags from their own countries that never both appear in another variant of that dataset.
  const TITLE_PIN = {
    alcohol: ["India", "Italy"],
    "work-hours": ["Germany", "Indonesia"],   // Grindset Nations: Asia hours vs Germany, not the default famous pair
    "wealth-gini-nordic": ["Sweden", "United States"],
    "wealth-gini-top-heavy": ["Brazil", "Singapore"],
    "wealth-gini-level-field": ["Israel", "Slovakia"],
    "meat-lovers": ["Israel", "United States"],
    "meat-meatiest": ["Argentina", "Japan"],
    "meat-side-salad": ["India", "South Korea"],
    // KFC per-million boards: top country, then bottom country.
    "kfc-outlets-finger-lickin": ["Barbados", "Nigeria"],
    "kfc-outlets-bucket-list": ["New Zealand", "Ghana"],
    // Macau + India, and United States + Indonesia, are the pairs that don't both appear on the other board.
    "mcdonalds-per-million-density": ["Macau", "India"],
    "mcdonalds-per-million-arch": ["United States", "Indonesia"],
  };
  // Safe-walking variants share a dataset but the headlines already tell them apart, so the question stays the plain stem (no flag pair).
  const NO_TITLE_FLAGS = new Set(["gallup-safe-night"]);
  const byDs = {}; res.forEach(p => { p.question = p.question.replace(/\s*\(Group [A-Z]\)\s*$/, ""); if (p.type === "rank" && p.dataset) (byDs[p.dataset] ||= []).push(p); });
  Object.values(byDs).forEach(ps => { if (ps.length < 2 || NO_TITLE_FLAGS.has(ps[0].dataset)) return; ps.forEach(p => {
    const others = ps.filter(q => q !== p).map(q => new Set(q.items.map(it => it.name))), seen = new Set(others.flatMap(o => [...o]));
    const fam = n => { const k = FAMOUS.indexOf(n); return k < 0 ? FAMOUS.length : k; };
    const c = p.items.map((it, i) => i).sort((a, b) => (seen.has(p.items[a].name) - seen.has(p.items[b].name)) || (fam(p.items[a].name) - fam(p.items[b].name)) || a - b);
    let pair = null; const pin = TITLE_PIN[p.id];   // v12: same as build.py TITLE_PIN (published past titles stay stable)
    if (pin && !others.some(o => pin.every(n => o.has(n)))) pair = pin.map(n => p.items.find(it => it.name === n));
    for (let x = 0; x < c.length && !pair; x++) for (let y = x + 1; y < c.length && !pair; y++) { const A = p.items[c[x]], B = p.items[c[y]];
      if (!others.some(o => o.has(A.name) && o.has(B.name))) pair = [A, B].sort((u, v) => u.name < v.name ? -1 : u.name > v.name ? 1 : 0); }
    const flagOv = ({ "pew-china-favorable": "🇨🇳" })[p.dataset];
    if (flagOv) { p.question = `${p.series || p.question} ${flagOv}`; p.titleFlags = [flagOv]; }
    else if (pair) { p.question = `${p.series || p.question} ${pair[0].emoji}${pair[1].emoji}`; p.titleFlags = pair.map(it => it.name); } }); });
  res.forEach(p => { delete p.series; if (!p.headline) p.headline = p.question; });   // v11: fun headline, plain question = subtitle
  return res;
}

let custom = load(LS.custom, null);
const KNOWN = p => p && (p.type === "rank" || p.type === "top5" || (p.type === "match" && p.people && p.people.length >= 4 && p.people.length <= 7) || (p.type === "tier" && p.tiers && p.items && p.tiers.length >= 2 && p.items.length >= 3));   // drops pre-v7 "guess" puzzles from old uploads
// Name it lives in name-puzzles.js so the rank sheet stays a rank sheet. Each one takes the
// earliest free daily order, then the list is sorted by that order, so a later rank puzzle
// can sit past those days. An uploaded spreadsheet is left as uploaded.
function attachNamePuzzles(list) {
  const extra = window.RANKD_NAME_PUZZLES || [];
  const base = Array.isArray(list) ? list : [];
  if (!extra.length) return base;
  const ids = new Set(base.map(p => p && p.id));
  const fresh = extra.filter(p => p && p.id && !ids.has(p.id)).map(p => Object.assign({}, p));
  const taken = new Set();
  base.forEach(p => { const o = Math.round(p && p.order) || 0; if (o > 0 && o < 10000) taken.add(o); });
  let next = 1;
  fresh.forEach(p => {
    while (taken.has(next)) next += 1;
    p.order = next;
    taken.add(next);
    next += 1;
  });
  return base.concat(fresh).sort((a, b) => (Math.round(a.order) || 0) - (Math.round(b.order) || 0));
}
let PUZZLES = (custom && custom.puzzles?.filter(KNOWN).length) ? custom.puzzles.filter(KNOWN) : attachNamePuzzles(window.RANKD_PUZZLES || []);

// ================================================================ settings + theme
const settings = Object.assign({ theme: "system", stream: "off" }, load(LS.settings, {}));
delete settings.showValues;   // v12.1: the show-values setting is gone; values are always shown (old saved "off" is overridden)
const saveSettings = () => save(LS.settings, settings);
const mq = matchMedia("(prefers-color-scheme: dark)");
const effectiveTheme = () => settings.theme === "system" ? (mq.matches ? "dark" : "light") : settings.theme;
function applyTheme() {
  const t = effectiveTheme(); document.documentElement.dataset.theme = t;
  const tb = $("#mTheme"); if (tb) tb.innerHTML = themeLabel();
}
mq.addEventListener?.("change", () => settings.theme === "system" && applyTheme());

// ================================================================ streamer mode (v9): hook for future ads
// Browsers can't detect OBS / external screen capture, so this is manual: ?stream=1 turns it on (saved in
// localStorage), ?stream=0 turns it off, or Settings > Streamer mode. When on, every ad container (.ad-slot:
// the top banner and the interstitial) is hidden and Ads.allowed() is false, so no interstitial is ever shown.
(function () { const q = new URLSearchParams(location.search).get("stream");
  if (q === "1" || q === "0") { settings.stream = q === "1" ? "on" : "off"; saveSettings(); } })();
const streamerOn = () => settings.stream === "on";
function isPremium() {
  // Stub: CONFIG.premium.enabled must be true before any entitlement is honored.
  if (!CONFIG.premium || !CONFIG.premium.enabled) return false;
  try { return localStorage.getItem("rankd.premium.v1") === "1"; } catch (e) { return false; }
}
function applyStreamer() { document.documentElement.classList.toggle("streamer", streamerOn()); if (typeof AdSense !== "undefined") AdSense.init(); }
function applyPremium() {
  document.documentElement.classList.toggle("premium", isPremium());
  if (typeof AdSense !== "undefined") AdSense.init();
}
// Capture helper. No-ops when PostHog was not loaded (snippet missing, Studio, or ?preview= sandbox).
// Props stay free of typed text, names and puzzle copy.
function track(event, props) {
  try {
    if (window.RANKD_STUDIO || PREVIEW) return;
    const a = CONFIG.ANALYTICS;
    if (!a || a.enabled !== true || a.provider !== "posthog") return;
    const ph = window.posthog;
    if (!ph || typeof ph.capture !== "function") return;
    if (props) ph.capture(event, props); else ph.capture(event);
  } catch (e) {}
}
function freshRound(saved) {
  if (!saved) return true;
  if (isDone(saved)) return false;
  if (Array.isArray(saved.attempts) && saved.attempts.length) return false;
  // An unfinished type-to-guess Top 5 is restarted on the slot board.
  if (Array.isArray(saved.guesses) && saved.guesses.length) return !(saved.attempts && saved.attempts.length);
  return true;
}
function trackGameCompleted(res) {
  const type = (state.puzzle && state.puzzle.type) || res.type;
  const legacyGuesses = type === "top5" && Array.isArray(res.guesses) && !(res.attempts && res.attempts.length);
  const guesses = legacyGuesses ? res.guesses.length : (Number(res.tries) || (Array.isArray(res.attempts) ? res.attempts.length : 0));
  track("game_completed", { won: type === "top5" ? !!(res.won || res.solved) : !!res.solved, guesses, mode: state.mode, puzzle_type: type });
}
const Ads = { allowed: () => !streamerOn() && !isPremium(),   // streamer OR premium → no AdSense
  decisions: [],                              // v11: one entry per finished puzzle {puzzle, mode, show, reason} (tests / debugging)
  last: () => Ads.decisions[Ads.decisions.length - 1] || null,
  skipsAfterWin: tier => !!tier };            // v11: interstitials are skipped after any win tier
window.RankdAds = Ads;

// v12.1: real Google AdSense behind window.RankdAds. mode: "placeholder" (dev/local: the grey placeholders), "waiting"
// (wanted, but streamer mode is on, so the script is NOT loaded), "loading", "live", "blocked" (script failed / blocked).
// Every failure path collapses the slot (no blank gap, no error); the banner keeps its reserved height while loading.
const AdSense = {
  mode: "placeholder", bannerDone: false, bottomDone: false,
  wanted() {
    if (window.RANKD_STUDIO || PREVIEW || !CONFIG.ADSENSE_CLIENT) return false;
    const q = new URLSearchParams(location.search).get("ads");
    if (q === "live") return true; if (q === "placeholder") return false;
    return location.protocol === "https:" && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);
  },
  init() {
    if (!this.wanted()) { this.mode = "placeholder"; return; }
    if (!Ads.allowed()) { if (this.mode === "placeholder") this.mode = "waiting"; return; }   // streamer: don't even load the script
    if (this.mode !== "placeholder" && this.mode !== "waiting") return;
    this.mode = "loading"; document.documentElement.classList.add("ads-live");
    // Skip inject if a static <script> or prior loader already put adsbygoogle.js in the page.
    if (document.getElementById("adsbygoogleJs") || document.querySelector('script[src*="adsbygoogle.js"]')) {
      this.mode = "live"; this.banner(); this.bottom(); return;
    }
    const s = document.createElement("script"); s.async = true; s.crossOrigin = "anonymous"; s.id = "adsbygoogleJs";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(CONFIG.ADSENSE_CLIENT);
    s.onload = () => { if (this.mode === "loading") this.mode = "live"; };
    s.onerror = () => { this.mode = "blocked"; this.collapse($("#adTop")); this.collapse($("#adBottom")); };
    document.head.appendChild(s);
    this.banner(); this.bottom();
  },
  push() { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); return true; } catch (e) { return false; } },
  unit(slot, cls, responsive) {   // banners: auto + full-width-responsive (AdSense Display snippet); interstitial omits until its own unit
    const fmt = responsive ? ` style="display:block" data-ad-format="auto" data-full-width-responsive="true"` : "";
    return `<ins class="adsbygoogle ${cls}"${fmt} data-ad-client="${esc(CONFIG.ADSENSE_CLIENT)}" data-ad-slot="${esc(slot)}"></ins>`;
  },
  watch(ins, onUnfilled, onFilled) {   // AdSense sets data-ad-status="filled" | "unfilled" on the <ins>
    const chk = () => { const st = ins.getAttribute("data-ad-status"); if (st === "unfilled") { mo.disconnect(); onUnfilled(); } else if (st === "filled") { mo.disconnect(); onFilled?.(); } };
    const mo = new MutationObserver(chk); mo.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] }); chk();
  },
  collapse(box) { if (!box) return; box.classList.add("ad-collapsed"); window.RankdFit?.layout(); },
  banner() {
    // Request the unit the first time #adTop is actually shown (AdSense can't size display:none).
    // Practice always; a short archive day only after .ad-on is committed.
    if (this.bannerDone || this.mode === "placeholder" || this.mode === "waiting" || this.mode === "blocked") return;
    const box = $("#adTop");
    if (!box || !box.classList.contains("ad-on") || $("#playView").classList.contains("hidden")) return;
    this.bannerDone = true; this.fill(box, CONFIG.ADSENSE_SLOTS.banner);
  },
  // v12.2: Practice bottom banner, requested the first time it is actually visible (AdSense can't size a hidden slot)
  bottom() {
    if (this.bottomDone || this.mode === "placeholder" || this.mode === "waiting" || state.mode !== "practice") return;
    this.bottomDone = true; this.fill($("#adBottom"), CONFIG.ADSENSE_SLOTS.bottom);
  },
  fill(box, slot) {
    if (!slot || this.mode === "blocked") { this.collapse(box); return; }
    box.querySelector(".ad-fill").innerHTML = this.unit(slot, "rk-ad-banner", true); const ins = box.querySelector("ins");
    if (!this.push()) { this.collapse(box); return; }
    this.watch(ins, () => this.collapse(box), () => box.classList.add("ad-filled"));
  },
  // interstitial: placeholder mode keeps the old placeholder overlay; live mode needs a loaded script + an ad-unit ID
  interstitialOk() { return this.mode === "placeholder" || ((this.mode === "live" || this.mode === "loading") && !!CONFIG.ADSENSE_SLOTS.interstitial); },
  interstitial(onUnfilled) {
    if (this.mode === "placeholder") return;
    const fill = $("#interstitial .inter-fill"); fill.innerHTML = this.unit(CONFIG.ADSENSE_SLOTS.interstitial, "rk-ad-inter", false); const ins = fill.querySelector("ins");
    if (!this.push()) { onUnfilled(); return; }
    this.watch(ins, onUnfilled);
  },
};
window.RankdAdSense = AdSense;

// ================================================================ random Practice (v11)
// Generates a puzzle on the fly from the full ranked lists in practice-data.js (sensitive datasets included, each with its caveat; no rape data).
// Rules: random dataset; 38+ countries -> Top 5 or Rank it at random, else Rank it. Rank it = 5 (sometimes 6) well-spread,
// countries with >= 1 POPULAR_COUNTRIES entry: no ties, adjacent picks >= PR_MIN_RANK_GAP ranks apart (scaled by list size) and >= 3% of the
// full value range apart. Top 5 uses the auto hint bank and the shared-#5 tie rule. Deterministic for a given seed (#r=<seed>).
const PR = window.RANKD_PRACTICE || null;
// v11 POPULAR_COUNTRIES: the ONE recognizability list for random Practice (edit here). Every generated Rank it puzzle on a
// country dataset includes at least 1 of these (tier 1 preferred, then tier 2); a dataset with none of them is allowed
// without. Pick weights: tier 1 x8, tier 2 x4, everyone else x1 (all scaled by log population).
const POPULAR_COUNTRIES = {
  tier1: ["Iran", "United States", "United Kingdom", "Germany", "France", "Italy", "Mexico", "China", "South Korea", "Japan", "Brazil", "India"],
  tier2: ["Canada", "Australia", "Spain", "Russia", "Turkey", "Egypt", "Nigeria", "South Africa", "Indonesia", "Vietnam", "Thailand", "Philippines",
          "Argentina", "Saudi Arabia", "Israel", "Sweden", "Netherlands", "Poland", "Ukraine", "Pakistan", "Taiwan"],
  weight: { 1: 8, 2: 4, 0: 1 },
};
const mulberry = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const Practice = {
  ok: () => !!(PR && PR.datasets && PR.datasets.length),
  rules: { minGapShare: 0.03, rankGap: (n, k) => Math.max(2, Math.floor(n / (k * 4))), sixShare: 0.3, minPopM: 1 },
  generate(seed, tries = 0) {
    if (!tries && window.RankdName && typeof RankdName.practiceFromSeed === "function") {
      const named = RankdName.practiceFromSeed(seed);
      if (named) return named;
    }
    const R = mulberry(seed + tries * 7919), C = PR.countries, ru = this.rules, T1 = new Set(POPULAR_COUNTRIES.tier1), T2 = new Set(POPULAR_COUNTRIES.tier2);
    const tier = name => T1.has(name) ? 1 : T2.has(name) ? 2 : 0;
    const ds = PR.datasets[Math.floor(R() * PR.datasets.length)];
    if (ds.kind === "groups")   // v12: in-country demographic dataset - its curated groups ARE the puzzle (already spread, no ties, no country rules)
      return { id: `rp-${seed}`, seed, practice: true, dataset: ds.id, emoji: ds.emoji || "🎲", headline: ds.title, question: "", stat: ds.stat, unit: ds.unit,
        source: ds.src, sourceUrl: ds.url, year: String(ds.year || ""), fact: "", caveat: ds.caveat || "", sensitive: !!ds.sens, art: "chart", support: ds.support || "", order: null,
        type: "rank", higherIs: "top", valuesVisible: false, items: ds.rows.map(r => ({ name: r[0], emoji: r[1], value: r[2], year: "", gRank: r[3], gTotal: r[4], gScope: r[5] })) };
    if (ds.kind === "tier") {   // v12.2: tied-stat buckets — sample 5–6 countries across distinct values
      const rows = ds.rows.map(r => ({ iso3: r[0], name: C[r[0]][0], emoji: C[r[0]][1], value: r[1] }));
      const byV = {}; rows.forEach(r => (byV[r.value] ||= []).push(r));
      const vals = Object.keys(byV).map(Number).sort((a, b) => b - a);
      if (vals.length < 2) return tries < 20 ? this.generate(seed, tries + 1) : null;
      const k = R() < 0.4 ? 6 : 5, pick = [];
      // round-robin across values so the puzzle keeps several tiers
      let vi = 0, guard = 0;
      while (pick.length < k && guard++ < 40) {
        const v = vals[vi % vals.length], pool = byV[v].filter(r => !pick.includes(r));
        vi++; if (!pool.length) continue;
        pick.push(pool[Math.floor(R() * pool.length)]);
      }
      if (pick.length < 4) return tries < 20 ? this.generate(seed, tries + 1) : null;
      const tvals = [...new Set(pick.map(r => r.value))].sort((a, b) => b - a);
      const tiers = tvals.map(v => ({ label: Number.isInteger(v) ? `${v}%` : `${v}`, value: v }));
      const v2i = Object.fromEntries(tiers.map((t, i) => [t.value, i]));
      return { id: `rp-${seed}`, seed, practice: true, dataset: ds.id, emoji: ds.emoji || "🎲", headline: ds.title, question: "",
        stat: ds.stat, unit: ds.unit, source: ds.src, sourceUrl: ds.url, year: String(ds.year || ""), fact: "",
        caveat: ds.caveat || "", sensitive: !!ds.sens, art: "candle", support: "", order: null, type: "tier",
        tiers, items: pick.map(r => ({ name: r.name, emoji: r.emoji, value: r.value, iso3: r.iso3, tierIndex: v2i[r.value] })) };
    }
    const rows = ds.rows.map(r => ({ iso3: r[0], name: C[r[0]][0], emoji: C[r[0]][1], pop: C[r[0]][2], value: r[1], year: r.length > 2 ? String(r[2]) : String(ds.year || "") }));
    rows.forEach(r => { r.rank = 1 + rows.filter(x => x.value > r.value).length; });
    const base = { id: `rp-${seed}`, seed, practice: true, dataset: ds.id, emoji: ds.emoji || "🎲", headline: ds.title, question: "", stat: ds.stat, unit: ds.unit,
      source: ds.src, sourceUrl: ds.url, year: String(ds.year || ""), fact: "", caveat: ds.caveat || "", sensitive: !!ds.sens, art: "chart", support: "", order: null,
      ...(ds.valueGloss ? { valueGloss: String(ds.valueGloss) } : {}) };
    if (rows.length >= PR.minTop5 && ds.hints && +rows[0].value !== 100 && R() < 0.5) {   // no Top 5 when #1 is 100% (ties at the cap)
      const countries = rows.map(r => ({ name: r.name, iso3: r.iso3, emoji: r.emoji, value: r.value, year: r.year, ...(ds.hints[r.iso3] ? { hints: ds.hints[r.iso3] } : {}) }));
      const picked = pickDecoyCountry(countries);
      const decoy = picked ? { name: picked.name, iso3: picked.iso3, emoji: picked.emoji, value: picked.value, rank: countryRank(countries, picked), year: picked.year || "" } : null;
      return { ...base, type: "top5", maxMisses: CONFIG.rankMaxTries, ...(decoy ? { decoy } : {}), countries };
    }
    const k = R() < ru.sixShare ? 6 : 5, N = rows.length, gapR = ru.rankGap(N, k), gapV = (rows[0].value - rows[N - 1].value) * ru.minGapShare;
    const cand = rows.filter(r => r.pop >= ru.minPopM || tier(r.name));
    const has1 = cand.some(r => tier(r.name) === 1), has2 = cand.some(r => tier(r.name) === 2);
    for (let a = 0; a < 450; a++) {
      const need = a < 200 && has1 ? 1 : a < 400 && (has1 || has2) ? 2 : 0;   // 1 = must include a tier-1 country, 2 = tier 1 or 2, 0 = none (dataset has no popular country)
      if (!need && (has1 || has2)) break;
      const pool = cand.slice(), pick = [];
      while (pick.length < k && pool.length) {
        const w = pool.map(r => POPULAR_COUNTRIES.weight[tier(r.name)] * Math.log10(10 + r.pop)); let x = R() * w.reduce((s, v) => s + v, 0), i = 0;
        while ((x -= w[i]) > 0 && i < pool.length - 1) i++;
        pick.push(pool.splice(i, 1)[0]);
      }
      pick.sort((x, y) => y.value - x.value);
      if (need && !pick.some(r => tier(r.name) && tier(r.name) <= need)) continue;
      if (pick.length === k && pick.every((r, i) => !i || (pick[i - 1].value > r.value && pick[i - 1].value - r.value >= gapV && r.rank - pick[i - 1].rank >= gapR)))
        return { ...base, type: "rank", higherIs: ds.hi === "bottom" ? "bottom" : "top", valuesVisible: false,
          items: pick.map(r => ({ name: r.name, emoji: r.emoji, value: r.value, year: ds.rows[0].length > 2 ? r.year : "", gRank: r.rank, gTotal: N, gScope: "" })) };
    }
    return tries < 20 ? this.generate(seed, tries + 1) : null;
  },
};
window.RankdPractice = { generate: s => Practice.generate(s), rules: Practice.rules, data: PR, ok: Practice.ok, popular: POPULAR_COUNTRIES };
// v12: Rankd Studio (studio.html) loads this file with window.RANKD_STUDIO = true to reuse the game's rules and data
// helpers; the game UI below is not started there.
// valueGlossOf is a function declaration (hoisted). The fallback map has to be initialized before this
// return, or Loading Zone calls it while the const is still in the temporal dead zone.
const VALUE_GLOSS_FALLBACK = {
  "Keep the Peace": "harmony first", "Open to Change": "open to change",
  "Dragon Friends": "favor China", "Friends of Beijing": "favor China",
  "Overdose Rates": "per 100k", "Declining White Share": "good for the USA", "Legal Protections": "best legal protections for gays", "On the Books": "best legal protections for gays",
  "Stars and Stripes": "favor U.S.",
  "Flavor Haters": "unfavorable", "Police Videos": "say it's good",
  "Views of Israel": "unfavorable", "Moral Views": "think gambling is wrong", "Snake Eyes": "think gambling is wrong",
  "Gambling Morality": "think gambling is wrong",
  "After Dark": "feel safe walking alone at night", "Porch Light": "feel safe walking alone at night", "Walking Home": "feel safe walking alone at night",
  "Partner Violence": "experienced partner violence", "Lifetime Prevalence": "experienced partner violence", "Ever-Partnered Women": "experienced partner violence", "Lifetime Rates": "experienced partner violence",
  "Swedish Surprise": "wealth Gini", "Top Heavy": "wealth Gini", "Level Field": "wealth Gini",
  "Meat Lovers": "kg/yr per capita", "The Meatiest": "kg/yr per capita", "Side Salad": "kg/yr per capita",
  "Girlboss": "female CEOs",
  "High Society": "past-year use",
  "Powder Rankings": "of adults (15–64)",
};
// Free archive depth. unlockedDays in localStorage is an absolute count (today + earlier days),
// so a save from the old 7-day ad step (14, 21, …) stays valid. The next ad adds adUnlockDays.
function archiveBaseDays() { return CONFIG.freeArchiveDays || 7; }
function archiveAdUnlockDays() { return CONFIG.adUnlockDays || 5; }
function archiveAgeDays(key) { return Math.round((utc(todayKey()) - utc(key)) / 864e5); }   // 0 = today
function getArchiveUnlockedDays() {
  if (isPremium()) return 1e9;
  const base = archiveBaseDays();
  const st = load(LS.archiveUnlock, { unlockedDays: base });
  return Math.max(base, Number(st.unlockedDays) || base);
}
function setArchiveUnlockedDays(n) { save(LS.archiveUnlock, { unlockedDays: n, at: Date.now() }); }
function applyArchiveAdUnlock() {
  const next = getArchiveUnlockedDays() + archiveAdUnlockDays();
  setArchiveUnlockedDays(next);
  return next;
}
function archiveFreeUnlocked(key) {
  if (isPremium()) return true;
  const age = archiveAgeDays(key);
  return age >= 0 && age < getArchiveUnlockedDays();
}
function archiveUnlockToast() {
  return `Unlocked ${archiveAdUnlockDays()} more days — tap again for older puzzles`;
}
function archiveLongAdCopy() {
  return `Watch to unlock the next ${archiveAdUnlockDays()} days of the archive. Premium unlocks everything with no ads.`;
}
function archiveListHeaderHtml(unlocked, lastDayNumber) {
  const freeN = archiveBaseDays();
  const shown = Math.min(unlocked, lastDayNumber + 1);
  return `Free: <b>${shown}</b> days unlocked (base ${freeN}). Watch an ad for the next ${archiveAdUnlockDays()} days. <span class="prem-upsell">Premium = full archive, no ads.</span>`;
}
// Opening guess entirely wrong: every Rank / Match / Tier card red on try 1,
// or all five Top 5 slots red on try 1. Old guess-style Top 5: the first five guesses all miss.
function openingAllWrong(res) {
  if (!res || res.type === "name") return false;
  if (res.type === "top5" && !Array.isArray(res.attempts)) {
    const marks = Array.isArray(res.marks) ? res.marks : [];
    return marks.length >= 5 && marks.slice(0, 5).every(m => m === "miss" || m === "bad");
  }
  if (res.type !== "rank" && res.type !== "match" && res.type !== "tier" && res.type !== "top5") return false;
  const attempt = Array.isArray(res.attempts) ? res.attempts[0] : null;
  const marks = attempt && attempt.marks;
  return Array.isArray(marks) && marks.length > 0 && marks.every(m => m === "bad");
}
// Name it loss: every counted guess missed. A correct guess ends the game, so this is the unfinished run.
function nameAllWrong(res) {
  if (!res || res.type !== "name" || res.solved) return false;
  const marks = Array.isArray(res.marks) ? res.marks : [];
  return marks.length > 0 && marks.every(m => m === "bad");
}
// Results-screen word. Ignorant! only for an all-wrong opening, or a Name it loss with every try wrong.
// A solved game keeps its win line.
function ratingShout(res) {
  if (!res || res.solved || res.won) return "";
  if (res.type === "name") return res.done && nameAllWrong(res) ? "Ignorant!" : "";
  if (!openingAllWrong(res)) return "";
  if (res.type === "top5" && !Array.isArray(res.attempts) && typeof res.hits === "number" && res.hits > 0) return "";
  return "Ignorant!";
}
// Celebration tier. Win words stay first. Ignorant! wins over Racist!/Xenophobe!
// only while the opening guess is entirely wrong. Name it says it only once the loss is finished.
function cheerChoice(res, identity) {
  if (!res) return null;
  if (res.type === "name") {
    if (res.solved) return res.tries === 1 ? "explosive" : res.tries === 2 ? "big" : null;
    if (res.done && nameAllWrong(res)) return "ignorant";
    return null;
  }
  if (res.type === "top5" && !Array.isArray(res.attempts)) {
    const hits = Number(res.hits) || 0;
    const misses = Number(res.misses) || 0;
    if (hits >= 5) return misses === 0 ? "explosive" : misses <= 2 ? "big" : null;
    if (hits === 0 && openingAllWrong(res)) return "ignorant";
    return null;
  }
  if (res.solved) return res.tries === 1 ? "explosive" : res.tries === 2 ? "big" : null;
  const last = Array.isArray(res.attempts) ? res.attempts[res.attempts.length - 1] : null;
  const marks = last && last.marks;
  const allBad = Array.isArray(marks) && marks.length > 0 && marks.every(m => m === "bad");
  const first = Array.isArray(res.attempts) && res.attempts.length === 1;
  if (allBad && openingAllWrong(res) && (first || res.done)) return "ignorant";
  if (allBad && identity && !openingAllWrong(res)) return "racist";
  return null;
}
window.RankdRating = { openingAllWrong, ratingShout, cheerChoice };
// True for a calendar day inside the AdSense-safe schedule (see CONFIG.adsenseSafeThrough).
function inAdsenseSafeWindow(dateKey) {
  const cut = CONFIG.adsenseSafeThrough;
  return !!cut && String(dateKey) <= cut;
}
if (window.RANKD_STUDIO) {
  window.RankdShared = { CONFIG, LS, POPULAR_COUNTRIES, rules: Practice.rules, MIN_TOP5_COUNTRIES, isRankdKey, RankdData,
    keyFromDay, dayNumber, todayKey, puzzles: PUZZLES, practice: PR, valueGlossOf, inAdsenseSafeWindow, rating: window.RankdRating };
  window.RankdArchive = {
    baseDays: archiveBaseDays, adUnlockDays: archiveAdUnlockDays, ageDays: archiveAgeDays,
    getUnlockedDays: getArchiveUnlockedDays, setUnlockedDays: setArchiveUnlockedDays,
    applyAdUnlock: applyArchiveAdUnlock, freeUnlocked: archiveFreeUnlocked,
    toast: archiveUnlockToast, longAdCopy: archiveLongAdCopy, headerHtml: archiveListHeaderHtml,
  };
  return;
}
function goPractice(seed, opts) {
  if (!Practice.ok()) return goToday();
  if (seed == null) seed = 1 + Math.floor(Math.random() * 2e9);
  const token = opts && opts.challengeToken;
  const RC = window.RankdChallenge;
  // A valid challenge opens that seed directly. Other practice ads (the every-5th long ad) stay as they are.
  const direct = !!(token && RC && RC.matches(RC.decode(token), { k: "r", id: String(seed) }));
  const start = () => {
    const p = Practice.generate(seed); if (!p) return goToday();
    state.mode = "practice";
    bindChallenge(direct ? token : "", { k: "r", id: String(p.seed) });
    openPuzzle(p);
  };
  // Free: long ad every 5th Practice game (Premium / streamer skip). Challenge links skip this gate.
  if (!direct && !isPremium() && Ads.allowed()) {
    const n = bumpPracticeGame();
    if (n > 0 && n % 5 === 0) return showLongAd({ reason: "practice", onDone: start });
  }
  start();
}

// ================================================================ state
const state = { view: "today", mode: "daily", dateKey: todayKey(), puzzle: null, practiceIdx: 0, order: [], sortable: null, busy: false, rank: null,
  challenge: null, challengeToken: "", challengeOpenedFresh: false };
const puzzleForDay = n => PUZZLES[((n % PUZZLES.length) + PUZZLES.length) % PUZZLES.length];
const resultKey = () => state.mode === "preview" ? `v:${state.puzzle.id}:${state.dateKey}` : state.mode === "all" ? `p:${state.puzzle.id}` : state.mode === "practice" ? `r:${state.puzzle.id}` : `d:${state.dateKey}`;
const getResult = () => { const r = load(LS.results, {})[resultKey()]; return r && r.id === state.puzzle.id ? r : null; };
const setResult = r => { const all = load(LS.results, {}); all[resultKey()] = { ...r, id: state.puzzle.id, at: Date.now() };
  const rk = Object.keys(all).filter(k => k.startsWith("r:")).sort((a, b) => all[a].at - all[b].at); rk.slice(0, -30).forEach(k => delete all[k]);   // keep the last 30 random practice results
  save(LS.results, all); };
const isToday = () => state.mode === "daily";
function puzzleOnlyHash() {
  if (!state.puzzle || state.mode === "preview") return "";
  if (state.mode === "all") return `#p=${encodeURIComponent(state.puzzle.id)}`;
  if (state.mode === "practice") return `#r=${state.puzzle.seed}`;
  return `#d=${state.dateKey}`;
}
function linkHash() {
  const base = puzzleOnlyHash();
  if (!base || !state.challengeToken || !state.challenge) return base;
  const RC = window.RankdChallenge;
  if (!RC || !RC.matches(state.challenge, puzzleChallengeRef())) return base;
  return base + "&c=" + state.challengeToken;
}
function puzzleChallengeRef() {
  if (!state.puzzle) return null;
  if (state.mode === "practice") return { k: "r", id: String(state.puzzle.seed) };
  if (state.mode === "all") return { k: "p", id: state.puzzle.id };
  if (state.mode === "daily" || state.mode === "archive") return { k: "d", id: state.dateKey };
  return null;
}
function bindChallenge(token, ref) {
  const RC = window.RankdChallenge;
  const ch = token && RC ? RC.decode(token) : null;
  const ok = !!(ch && RC.matches(ch, ref));
  state.challengeOpenedFresh = ok && token !== state.challengeToken;
  state.challenge = ok ? ch : null;
  state.challengeToken = ok ? token : "";
}
function setHash(h) { try { history.replaceState(null, "", h || location.pathname + location.search); } catch { location.hash = h; } }

// ================================================================ card art (v5)
// Small hand-made line drawings (inline SVG, 64x64, stroke = currentColor) with gentle CSS motion.
// Pick one per puzzle with the sheet's `art` column; unknown/blank -> "chart". Motion is off under prefers-reduced-motion.
const ART = {
  eggplant: `<g class="a-wobble"><path d="M40 20c8 2 12 10 10 18-3 12-14 20-26 20-8 0-12-6-10-12 2-7 10-8 14-14 4-6 4-12 12-12z"/><path d="M40 20c-2-4-1-9 2-12M36 22c2-4 8-5 12-2" /><path d="M24 46c2-4 6-6 10-8" stroke-opacity=".5"/></g>`,
  rocket: `<g class="a-bounce"><path d="M32 6c8 7 11 17 11 28v12H21V34c0-11 3-21 11-28z"/><circle cx="32" cy="27" r="4"/><path d="M21 38l-7 8v6l7-4M43 38l7 8v6l-7-4"/></g><path class="a-flicker" d="M27 50c0 5 2 8 5 10 3-2 5-5 5-10"/>`,
  tree: `<g class="a-sway"><path d="M32 8l-14 20h8l-10 14h12l-8 10h24l-8-10h12l-10-14h8z"/></g><path d="M32 52v8M22 60h20"/>`,
  leaf: `<g class="a-sway"><path d="M32 58C14 50 12 26 32 8c20 18 18 42 0 50z"/><path d="M32 58V18M32 30l-7-5M32 38l8-6M32 46l-9-6"/></g>`,
  snowflake: `<g class="a-spin-slow" style="transform-origin:32px 32px"><path d="M32 6v52M10 19l44 26M10 45l44-26"/><path d="M32 16l-6-3M32 16l6-3M32 48l-6 3M32 48l6 3M20 26l-6 1M20 26l1-6M44 38l6-1M44 38l-1 6M20 38l-6-1M20 38l1 6M44 26l6 1M44 26l-1-6"/></g>`,
  puzzle: `<g class="a-bounce"><path d="M14 22h12a6 6 0 1 1 12 0h12v12a6 6 0 1 0 0 12v10H38a6 6 0 1 0-12 0H14V46a6 6 0 1 1 0-12z"/></g>`,
  windmill: `<path d="M32 30l-5 28h10z"/><g class="a-spin"><path d="M32 30L32 8M32 30L51 41M32 30L13 41"/></g><circle cx="32" cy="30" r="2" fill="currentColor"/><path d="M18 58h28"/>`,
  chart: `<path d="M10 54h44"/><rect class="a-grow" style="--d:0s" x="14" y="30" width="8" height="24" rx="2"/><rect class="a-grow" style="--d:.3s" x="28" y="18" width="8" height="36" rx="2"/><rect class="a-grow" style="--d:.6s" x="42" y="36" width="8" height="18" rx="2"/>`,
  clock: `<circle cx="32" cy="34" r="20"/><path d="M26 10h12M32 10v4"/><path class="a-spin-slow" d="M32 34V22"/><path class="a-spin" d="M32 34h9"/><circle cx="32" cy="34" r="1.6" fill="currentColor"/>`,
  car: `<g class="a-bob"><path d="M10 40v-6l6-10h24l8 10h6v6z"/><path d="M20 24l-3 10h28l-7-10"/><circle cx="20" cy="42" r="5"/><circle cx="44" cy="42" r="5"/></g><path class="a-dash" d="M4 54h56" stroke-dasharray="6 6"/>`,
  beer: `<path d="M16 16h26v36a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4z"/><path d="M42 24h6a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4h-6"/><path d="M14 16c0-6 7-8 10-5 3-4 11-3 12 1 5-1 8 2 6 4"/><circle class="a-rise" style="--d:0s" cx="24" cy="48" r="1.6"/><circle class="a-rise" style="--d:.8s" cx="31" cy="50" r="1.4"/><circle class="a-rise" style="--d:1.6s" cx="36" cy="46" r="1.2"/>`,
  sun: `<g class="a-spin-slow"><path d="M32 6v7M32 51v7M6 32h7M51 32h7M13.6 13.6l5 5M45.4 45.4l5 5M13.6 50.4l5-5M45.4 18.6l5-5"/></g><circle cx="32" cy="32" r="13"/><path d="M26 35c2 3 10 3 12 0"/><path class="a-blink" d="M27 29v1M37 29v1"/>`,
  bowl: `<path d="M8 34h48a24 18 0 0 1-48 0z"/><path d="M24 54h16"/><path class="a-steam" style="--d:0s" d="M24 26c-3-4 3-6 0-10"/><path class="a-steam" style="--d:.7s" d="M32 26c-3-4 3-6 0-10"/><path class="a-steam" style="--d:1.4s" d="M40 26c-3-4 3-6 0-10"/>`,
  scale: `<rect x="10" y="12" width="44" height="42" rx="8"/><path d="M20 24a14 14 0 0 1 24 0"/><path class="a-needle" d="M32 32l0-10"/><circle cx="32" cy="32" r="2" fill="currentColor"/><path d="M22 46h20"/>`,
  cake: `<path d="M12 56h40V36H12z"/><path d="M12 44c4 3 8-3 13 0s8 3 14 0 9-3 13 0"/><path d="M32 36v-9"/><path class="a-flicker" d="M32 24c-3-3-2-7 0-10 2 3 3 7 0 10z" fill="currentColor"/>`,
  tomato: `<g class="a-bounce"><circle cx="32" cy="38" r="17"/><path d="M24 22l8 4 8-4M32 26v-8"/><path d="M24 34c1-3 3-4 5-4"/></g>`,
  stroller: `<path d="M14 18a18 18 0 0 0 18 18V18z"/><path d="M32 36h18l-4-12"/><path d="M50 24l4-6"/><g class="a-spin" style="transform-origin:20px 48px"><circle cx="20" cy="48" r="5"/><path d="M15 48h10"/></g><g class="a-spin" style="transform-origin:44px 48px"><circle cx="44" cy="48" r="5"/><path d="M39 48h10"/></g>`,
  capitol: `<path d="M10 54h44M14 48h36M16 48V30M24 48V30M32 48V30M40 48V30M48 48V30M12 30h40L32 18z"/><path d="M32 18V8"/><path class="a-wave" d="M32 8h10l-3 3 3 3H32"/>`,
  wine: `<g class="a-sway"><path d="M20 8h24c0 14-4 22-12 22S20 22 20 8z"/><path d="M21 16h22"/><path d="M32 30v20M22 54h20"/></g>`,
  flask: `<path d="M26 8h12M28 8v16L14 50a4 4 0 0 0 4 6h28a4 4 0 0 0 4-6L36 24V8"/><path d="M19 42h26"/><circle class="a-rise" style="--d:0s" cx="28" cy="48" r="2"/><circle class="a-rise" style="--d:.9s" cx="36" cy="50" r="1.6"/><circle class="a-rise" style="--d:1.8s" cx="32" cy="46" r="1.3"/>`,
  globe: `<circle cx="32" cy="32" r="22"/><path d="M10 32h44"/><ellipse class="a-turn" cx="32" cy="32" rx="9" ry="22"/><path d="M14 20h36M14 44h36"/>`,
  onion: `<g class="a-sway"><path d="M32 56c-14 0-18-10-14-20 3-7 10-11 14-20 4 9 11 13 14 20 4 10 0 20-14 20z"/><path d="M32 56c-6-6-6-22 0-34M32 56c6-6 6-22 0-34"/><path d="M28 58l4-2 4 2"/></g>`,
  potato: `<g class="a-wobble"><path d="M14 38c-4-14 8-24 22-22s18 12 14 24-12 16-22 14-12-8-14-16z"/><circle class="a-blink" cx="27" cy="34" r="1.6" fill="currentColor"/><circle class="a-blink" cx="38" cy="33" r="1.6" fill="currentColor"/><path d="M28 42c3 2 7 2 9 0"/><path d="M20 30h.1M44 44h.1M34 24h.1"/></g>`,
  candle: `<path d="M24 56h16V30H24z"/><path d="M18 56h28"/><path d="M32 30v-5"/><path class="a-flicker" d="M32 22c-4-4-3-9 0-13 3 4 4 9 0 13z" fill="currentColor"/><circle class="a-glow" cx="32" cy="17" r="10" stroke-opacity=".25"/>`,
  sunrise: `<path d="M6 46h52"/><g class="a-rise-sun"><path d="M18 46a14 14 0 0 1 28 0"/><path d="M32 22v-6M16 30l-4-4M48 30l4-4"/></g><path d="M14 54h36" stroke-opacity=".5"/>`,
  balance: `<path d="M32 10v44M22 56h20"/><g class="a-tilt"><path d="M12 20h40"/><path d="M12 20l-6 14h12zM52 20l-6 14h12z"/><path d="M6 34a6 4 0 0 0 12 0M46 34a6 4 0 0 0 12 0"/></g>`,
  briefcase: `<g class="a-bob"><rect x="10" y="22" width="44" height="30" rx="5"/><path d="M24 22v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6"/><path d="M10 34h44"/><path d="M28 34v4h8v-4"/></g>`,
  cart: `<g class="a-bob"><path d="M6 14h8l6 28h28l6-20H17"/><path d="M22 32h28"/></g><g class="a-spin" style="transform-origin:24px 50px"><circle cx="24" cy="50" r="4"/></g><g class="a-spin" style="transform-origin:44px 50px"><circle cx="44" cy="50" r="4"/></g>`,
  smokestack: `<path d="M8 56V36l12-8v8l12-8v8l12-8V16h8v40z"/><path d="M8 56h48"/><path d="M16 46h4M28 46h4M40 46h4"/><circle class="a-puff" style="--d:0s" cx="48" cy="10" r="4"/><circle class="a-puff" style="--d:1.2s" cx="52" cy="8" r="3"/>`,
  ruler: `<rect x="14" y="6" width="14" height="52" rx="2"/><path d="M14 14h6M14 22h9M14 30h6M14 38h9M14 46h6"/><g class="a-measure"><path d="M34 40h18"/><path d="M38 40l-4 0M52 40l-4-4M52 40l-4 4"/><circle cx="44" cy="22" r="5"/><path d="M44 27v13"/></g>`,
  gavel: `<g class="a-tap"><rect x="20" y="10" width="22" height="12" rx="3" transform="rotate(-30 31 16)"/><path d="M34 22l14 22"/></g><path d="M10 54h28M14 48h20v6H14z"/>`,
  gradcap: `<path d="M4 24l28-12 28 12-28 12z"/><path d="M16 30v12c8 6 24 6 32 0V30"/><g class="a-tassel" style="transform-origin:54px 26px"><path d="M54 26v16"/><circle cx="54" cy="44" r="2.5" fill="currentColor"/></g>`,
  courthouse: `<path d="M8 22l24-12 24 12z"/><path d="M10 22h44M14 26v22M24 26v22M40 26v22M50 26v22M8 52h48M6 58h52"/><path class="a-breathe" d="M28 34h8v14h-8z"/>`,
  ballot: `<path d="M10 30h44v24H10z"/><path d="M24 30h16"/><g class="a-drop"><path d="M26 10h14v18H26z"/><path d="M29 18l3 3 5-6"/></g>`,
  house: `<path d="M10 30L32 12l22 18"/><path d="M16 26v28h32V26"/><path d="M28 54V40h8v14"/><path d="M42 18v-8h6v13"/><circle class="a-puff" style="--d:0s" cx="45" cy="5" r="3"/><circle class="a-puff" style="--d:1.3s" cx="49" cy="3" r="2.2"/>`,
  statue: `<path d="M8 56h48M14 56v-8h20v8"/><g class="a-topple" style="transform-origin:34px 48px"><path d="M24 48V30"/><circle cx="24" cy="18" r="6"/><path d="M24 30l-8-6M24 30l10-10M34 20l2-6"/><path d="M18 40h12"/></g>`,
  arm: `<g class="a-flex" style="transform-origin:22px 46px"><path d="M8 50c4-14 10-20 18-22 4-10 10-16 16-14 3 2 1 6-3 8-4 2-6 6-5 10 8-2 18 2 20 12-8 8-26 12-46 6z"/><path d="M30 36c4 2 8 2 12 0"/></g>`,
  magnifier: `<g class="a-search"><circle cx="28" cy="28" r="14"/><path d="M38 38l14 14"/><path d="M22 22a8 8 0 0 1 8-4"/></g>`,
  heart: `<path class="a-beat" d="M32 52C12 38 8 28 10 20c2-8 12-10 18-4l4 4 4-4c6-6 16-4 18 4 2 8-2 18-22 32z"/>`,
  teacup: `<path d="M12 28h34v8a17 17 0 0 1-34 0z"/><path d="M46 31h4a6 6 0 0 1 0 12h-5"/><path d="M8 56h42"/><path class="a-steam" style="--d:0s" d="M22 22c-3-4 3-6 0-10"/><path class="a-steam" style="--d:.8s" d="M32 22c-3-4 3-6 0-10"/>`,
  microphone: `<g class="a-sway"><rect x="24" y="8" width="16" height="28" rx="8"/><path d="M18 30a14 14 0 0 0 28 0"/><path d="M32 44v10M24 56h16"/></g><path class="a-wave2" style="--d:0s" d="M50 18c3 4 3 10 0 14"/><path class="a-wave2" style="--d:.5s" d="M14 18c-3 4-3 10 0 14"/>`,
  sparkles: `<path class="a-twinkle" style="--d:0s" d="M28 10l4 14 14 4-14 4-4 14-4-14-14-4 14-4z"/><path class="a-twinkle" style="--d:.7s" d="M48 38l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><path class="a-twinkle" style="--d:1.4s" d="M14 44l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/>`,
  pickaxe: `<g class="a-tap" style="transform-origin:16px 54px"><path d="M14 52L40 22"/><path d="M22 14c10-4 22-2 30 6-6-2-14-2-20 2"/><path d="M52 20c4 8 6 20 2 30-2-8-6-14-12-18"/></g><path d="M40 58h16M44 54l4-4 4 4"/>`,
  football: `<g class="a-bounce"><circle cx="32" cy="34" r="18"/><path d="M32 26l7 5-3 8h-8l-3-8z"/><path d="M32 26v-8M39 31l8-3M36 39l5 7M28 39l-5 7M25 31l-8-3"/></g>`,
  guitar: `<g class="a-sway"><path d="M38 26l14-14M48 8l8 8"/><path d="M36 28c-4-4-12-2-14 4-6 0-12 4-12 12 0 8 8 14 16 12 8-1 12-6 12-12 6-2 8-10 4-14z"/><circle cx="27" cy="41" r="4"/><path d="M20 48l6-6"/></g>`,
  clipboard: `<rect x="14" y="10" width="36" height="46" rx="4"/><path d="M24 10v-2h16v2M24 14h16"/><path class="a-check" d="M22 28l3 3 6-6"/><path d="M34 28h10"/><path class="a-check" style="animation-delay:.6s" d="M22 40l3 3 6-6"/><path d="M34 40h10"/>`,
  skyline: `<path d="M6 56h52"/><path d="M10 56V30h10v26M20 56V18h12v38M32 56V34h8v22M40 56V24h14v32"/><path class="a-lights" style="--d:0s" d="M24 24h4M24 32h4M44 30h6"/><path class="a-lights" style="--d:1.1s" d="M24 40h4M44 40h6M14 36h2"/>`,
  flag: `<path d="M16 58V8"/><path class="a-wave" style="transform-origin:16px 10px" d="M16 10c8-4 14 4 22 0s12-2 16 0v20c-4-2-8-4-16 0s-14-4-22 0"/>`,
  lighthouse: `<path d="M26 56l3-34h6l3 34z"/><path d="M24 22h16l-2-6H26z"/><path d="M28 30h8M27 40h10"/><path d="M18 56h28"/><g class="a-sweep" style="transform-origin:32px 19px"><path d="M40 17l18-5v12l-18-5" stroke-opacity=".55"/></g>`,
};
const artSvg = key => `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ART[key] || ART.chart}</svg>`;
function renderArt(p) {
  const key = ART[str(p.art).toLowerCase()] ? str(p.art).toLowerCase() : "chart";
  const el = $("#art"); el.dataset.art = key; el.innerHTML = artSvg(key);
}

// ================================================================ rendering: shared header

// Short brand label for the hero date line (source_name → PEW RESEARCH, etc.)
const SOURCE_BRAND = [
  [/pew research/i, "PEW RESEARCH"],
  [/world bank/i, "WORLD BANK"],
  [/our world in data|owid/i, "OUR WORLD IN DATA"],
  [/world population review/i, "WORLD POPULATION REVIEW"],
  [/ethnologue/i, "ETHNOLOGUE"],
  [/gallup/i, "GALLUP"],
  [/deloitte/i, "DELOITTE"],
  [/\bubs\b/i, "UBS"],
  [/visual capitalist/i, "VISUAL CAPITALIST"],
  [/wikipedia/i, "WIKIPEDIA"],
  [/equaldex/i, "EQUALDEX"],
  [/cia (world )?factbook|factbook/i, "CIA"],
  [/\bwho\b|world health/i, "WHO"],
  [/fao\b|food and agriculture/i, "FAO"],
  [/unicef/i, "UNICEF"],
  [/unodc|united nations office on drugs/i, "UNODC"],
  [/cdc\b|centers for disease/i, "CDC"],
  [/ipsos/i, "IPSOS"],
  [/cnn\b/i, "CNN"],
  [/fbi\b/i, "FBI"],
  [/ussc|u\.?s\.? sentencing/i, "USSC"],
  [/department for education|\bdfe\b/i, "DFE"],
  [/ef epi|ef education/i, "EF EPI"],
  [/iihs|highway safety/i, "IIHS"],
  [/undp|human development/i, "UNDP"],
];
function sourceBrand(p) {
  const raw = String((p && p.source) || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  for (const [re, label] of SOURCE_BRAND) if (re.test(raw)) return label;
  // strip trailing parentheticals / years / survey dates; take leading clause
  let s = raw.replace(/\([^)]*\)/g, " ").replace(/\b(19|20)\d{2}\b/g, " ");
  s = s.split(/[,;·|]/)[0].replace(/\s+/g, " ").trim();
  if (s.length > 28) s = s.slice(0, 26).replace(/\s+\S*$/, "") + "…";
  return s ? s.toUpperCase() : "";
}
/** Data year for the hero source line: p.year → item years → trailing year in stat. Omit if none. */
function dataYear(p) {
  if (!p) return "";
  const cands = [];
  if (p.year != null && String(p.year).trim()) cands.push(String(p.year).trim());
  for (const it of (p.items || p.people || [])) {
    const y = it && (it.year != null ? it.year : it.data_year);
    if (y != null && String(y).trim()) cands.push(String(y).trim());
  }
  const sm = String(p.stat || "").match(/,\s*((?:FY\s*)?(?:19|20)\d{2}(?:\s*[–\-]\s*(?:19|20)\d{2})?)\s*$/i);
  if (sm) cands.push(sm[1].replace(/\s+/g, " ").trim());
  for (const raw of cands) {
    const s = raw.replace(/\s+/g, " ").trim();
    if (!s) continue;
    // clean year / FY / range
    if (/^(?:FY\s*)?(?:19|20)\d{2}(?:\s*[–\-]\s*(?:(?:19|20)?\d{2}))?$/i.test(s))
      return s.replace(/\s+/g, "").replace(/FY/i, "FY");
    // "Oct 2021–Oct 2026" style windows
    if (/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(?:19|20)\d{2}\s*[–\-]\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(?:19|20)\d{2}$/i.test(s))
      return s.replace(/\s*[–\-]\s*/, "–");
    // pull a year out of noisy labels ("Equaldex live (scraped 2026-10-23)", "Factbook / Wikipedia 2026")
    const m = s.match(/\b(?:FY\s*)?((?:19|20)\d{2})\b/i);
    if (m) return /\bFY\s*\d{4}\b/i.test(s) ? "FY" + m[1] : m[1];
  }
  return "";
}
function renderHero() {
  const p = state.puzzle, n = dayNumber(state.dateKey) + 1;
  $("#heroNo").classList.toggle("practice-tag", state.mode === "practice");
  document.querySelector(".hero-top").classList.toggle("practice", state.mode === "practice");
  $("#heroNo").textContent = state.mode === "preview" ? `Preview · No. ${pad3(n)}` : state.mode === "all" ? `All puzzles ${state.practiceIdx + 1}/${PUZZLES.length}` : state.mode === "practice" ? "Practice" : `No. ${pad3(n)}`;
  $("#heroKind").textContent = p.type === "name" ? `✏️ Name it` : p.type === "top5" ? `🖐️ Top 5` : p.type === "match" ? `🔗 Match it` : p.type === "tier" ? `${p.emoji || "📊"} Tier it` : `${p.emoji || "📊"} Rank it`;
  $("#headline").textContent = p.headline || p.question;
  // Subtitle = question (when it differs from the fun headline). Stat line is the long measurement
  // label — hide it when it only repeats the subtitle (e.g. Share the Tape had both).
  const showSub = !!(p.question && p.question !== p.headline);
  $("#question").textContent = p.question || "";
  $("#question").classList.toggle("hidden", !showSub);
  // A stat that already starts with "%" (and whose unit is "%") would otherwise read "… (%)".
  const unitBit = p.unit && !(p.unit === "%" && String(p.stat).trim().startsWith("%")) ? ` (${p.unit})` : "";
  const statLine = p.stat ? p.stat + unitBit : "";
  // Near-duplicate: same story told twice (Share the Tape / Swings Both Ways). Keep series+flags
  // Q with a distinct measurement S (Single Ladies, Devil's Dice, EF EPI).
  const tokens = s => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(w => w.length > 2 && !/^(the|and|who|say|says|that|this|with|from|for|are|was|were|very|somewhat|share|adults|identify|as)$/.test(w)));
  const a = tokens(p.question), b = tokens(p.stat);
  let overlap = 0; a.forEach(t => { if (b.has(t)) overlap++; });
  const jaccard = (a.size && b.size) ? overlap / new Set([...a, ...b]).size : 0;
  const nSub = [...a].sort().join(" "), nStat = [...b].sort().join(" ");
  const statDup = showSub && !!statLine && (jaccard >= 0.55 || nStat.includes(nSub) || nSub.includes(nStat));
  $("#statLabel").textContent = statLine;
  $("#statLabel").classList.toggle("hidden", !statLine || statDup);
  $("#caveatLine").textContent = p.caveat ? "⚠️ " + p.caveat : ""; $("#caveatLine").classList.toggle("hidden", !p.caveat);   // v11: random Practice shows its dataset caveat up front
  // v12.2: drop the "All puzzles (pre-launch)… doesn't count toward stats" chrome line entirely.
  if (state.mode === "all") { $("#heroDate").textContent = ""; $("#heroDate").classList.add("hidden"); }
  else {
    $("#heroDate").classList.remove("hidden");
    const src = sourceBrand(p);
    const yr = dataYear(p);
    const srcBit = src ? ` · ${src}` : "";
    const yrBit = yr ? ` ${yr}` : "";   // no middle-dot between source brand and year
    // Practice already prefixes "YYYY data ·" — don't also append year after the source.
    $("#heroDate").textContent = state.mode === "preview" ? `Loading Zone preview · ${longDate(state.dateKey)} · doesn't count${srcBit}${yrBit}` : state.mode === "practice" ? `Random practice · ${yr ? yr + " data · " : ""}doesn't count${srcBit}`
      : `${CONFIG.brand} #${pad3(n)} · ${longDate(state.dateKey)}${isToday() ? "" : " · Archive"}${srcBit}${yrBit}`;
  }
  const label = isToday() ? "Share today's puzzle" : "Share this puzzle";
  $("#newRandomTop").classList.toggle("hidden", state.mode !== "practice");
  document.body.classList.toggle("mode-practice", state.mode === "practice"); AdSense.bottom();   // v12.2: Practice bottom banner
  renderArt(p); $("#hero").dataset.kind = p.type; $("#shareChallengeTop").textContent = label + " ↗"; $("#shareChallengeBtn").textContent = label;
}

function renderName(saved) {
  if (!window.RankdName) return;
  RankdName.mount({
    puzzle: state.puzzle,
    saved,
    maxTries: CONFIG.rankMaxTries,
    onFit: scheduleFit,
    onToast: toast,
    onDraft(g) { setResult(g); fitLayout(); },
    onFinish(g, opts) {
      const restore = !!(opts && opts.restore);
      setResult(g);
      if (!restore && isToday()) recordStats(g);
      const tier = !restore ? winTier(g) : null;
      const cheer = !restore ? cheerChoice(g, false) : null;
      if (cheer) Fx.celebrate(cheer, "name");
      if (!restore) CommunityStats.submit({ puzzleId: state.puzzle.id, day: state.dateKey, mode: state.mode, ...g });
      const reveal = () => showResult(g, { scroll: !restore });
      if (restore) reveal();
      else afterSubmit(reveal, tier);
    },
  });
  fitLayout();
}

function openPuzzle(p) {
  state.puzzle = p; state.busy = false;
  if (state.sortable) { state.sortable.destroy(); state.sortable = null; }
  showView("play"); renderHero(); $("#result").classList.add("hidden"); showFab(false);
  const crossEl = $("#crossPromo"); if (crossEl) crossEl.classList.add("hidden");
  const g = p.type === "top5"; $("#rankGame").classList.toggle("hidden", p.type !== "rank"); $("#matchGame").classList.toggle("hidden", p.type !== "match"); $("#tierGame").classList.toggle("hidden", p.type !== "tier"); $("#nameGame").classList.toggle("hidden", p.type !== "name"); $("#hero").classList.toggle("is-match", p.type === "match"); $("#hero").classList.toggle("is-tier", p.type === "tier"); $("#hero").classList.toggle("is-top5", p.type === "top5"); $("#hero").classList.toggle("is-name", p.type === "name"); $("#guessGame").classList.toggle("hidden", !g); $("#guessExtra").classList.toggle("hidden", !g);
  $("#t5board").classList.toggle("hidden", !g); $("#hints").classList.toggle("hidden", !g);
  setHash(linkHash());
  const saved = getResult();
  if (freshRound(saved)) track("game_started", { mode: state.mode, puzzle_type: p.type });
  const h2h = $("#h2h"); if (h2h) { h2h.classList.add("hidden"); h2h.replaceChildren(); }
  p.type === "name" ? renderName(saved) : p.type === "rank" ? renderRank(saved) : p.type === "match" ? renderMatch(saved) : p.type === "tier" ? renderTier(saved) : renderTop5(saved);
  if (state.challengeOpenedFresh) {
    state.challengeOpenedFresh = false;
    track("challenge_link_opened", { mode: state.mode, puzzle_type: p.type });
  }
  renderChallengeBanner();
  window.scrollTo({ top: 0 }); syncPlaying();
}

// ================================================================ RANK IT
function correctOrder(p) { return p.items.map((it, i) => ({ v: it.value, i })).sort((a, b) => p.higherIs === "bottom" ? a.v - b.v : b.v - a.v).map(x => x.i); }
function shuffledOrder(p, seed) {
  const r = rng(seed), idx = p.items.map((_, i) => i), right = correctOrder(p).join();
  for (let t = 0; t < 20; t++) { for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } if (idx.join() !== right) break; }
  return idx;
}

// Retry flow: lock in -> cards in the right spot turn green and are pinned, wrong ones go red + shake.
// Rearrange the rest and lock in again, up to CONFIG.rankMaxTries. Result object:
//   { type:"rank", attempts:[{order:[...], marks:["good"|"bad",...]}], cur:[...], pinned:[itemIdx...], done, solved, tries }
const gLabel = it => !(it.gRank && it.gTotal) ? "" : it.gScope ? `#${it.gRank} of ${it.gTotal} ${it.gScope}` : `World #${it.gRank} of ${it.gTotal}`;
const gTag = it => it.gRank && it.gTotal ? `<span class="grank" title="Rank among all ${it.gTotal} ${esc(it.gScope || "countries")} with data in the source dataset${it.year ? " (" + esc(it.year) + ")" : ""}">🌍 ${esc(gLabel(it))}</span>` : "";
const decOf = p => Math.min(2, Math.max(0, ...p.items.map(it => ((String(it.value).split(".")[1]) || "").length)));
const isYearPuzzle = p => !p.unit && p.items.every(it => Number.isInteger(it.value) && it.value >= 1000 && it.value <= 2100);   // e.g. space-first
const fmtP = (p, v) => v.toLocaleString("en-US", { minimumFractionDigits: decOf(p), maximumFractionDigits: decOf(p), useGrouping: !isYearPuzzle(p) });
// Percent display: unit '%' / units starting with '%' (% of GDP, % Trump, …) / valueFormat:'percent'.
// Number gets a '%' suffix (83%); rates per 100k, EF scores, women-per-100-men, kg, etc. stay bare.
const isPercent = p => p.valueFormat === "percent" || p.unit === "%" || (typeof p.unit === "string" && p.unit.startsWith("%"));
const fmtVal = (p, v) => fmtP(p, v) + (isPercent(p) ? "%" : "");
const unitAside = p => {   // small label after fmtVal on reveal cards — skip bare '%'; for '% of GDP' show ' of GDP'
  if (!p.unit) return "";
  if (p.unit === "%" || p.valueFormat === "percent") return "";
  if (p.unit.startsWith("%")) { const rest = p.unit.slice(1).trim(); return rest ? `<small> ${esc(rest)}</small>` : ""; }
  return `<small> ${esc(p.unit)}</small>`;
};
// v12.2: muted gloss under each values-column number (fills short 5-item boards). Prefer puzzle.valueGloss;
// else non-% unit; else a short phrase derived from headline/stat/question for bare-% puzzles.
// VALUE_GLOSS_FALLBACK is initialized above the Studio early-return so Loading Zone can call this.
function valueGlossOf(p) {
  if (p.valueGloss) return String(p.valueGloss);
  const u = p.unit || "";
  if (u && u !== "%" && p.valueFormat !== "percent") {
    if (u.startsWith("%")) { const rest = u.slice(1).trim(); if (rest) return rest; }
    else return u;
  }
  const h = p.headline || "";
  if (VALUE_GLOSS_FALLBACK[h]) return VALUE_GLOSS_FALLBACK[h];
  // light derive: strip leading "% who say "/"% with a " and clip
  let s = (p.stat || p.question || "").replace(/\s+/g, " ").trim();
  s = s.replace(/^%\s*(who say|with a|that say)\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "");
  if (/favorable/i.test(s)) return /unfavorable/i.test(s) ? "unfavorable" : (/\bChina\b/i.test(s) ? "favor China" : "favorable");
  if (/open to change/i.test(s)) return "open to change";
  if (/harmony/i.test(s)) return "harmony first";
  if (/per\s*100\s*k/i.test(s) || /per\s*100,000/i.test(s)) return "per 100k";
  if (s.length > 22) s = s.slice(0, 20).replace(/\s+\S*$/, "") + "…";
  return s.length >= 3 && s.length <= 28 ? s.toLowerCase() : "";
}
const glossTag = p => { const g = valueGlossOf(p); return g ? `<small class="vgloss">${esc(g)}</small>` : ""; };
function normRank(saved) {            // upgrade v3 single-shot results (points/max) to the retry format
  if (!saved || saved.type !== "rank") return null;
  if (saved.attempts) return saved;
  if (!saved.done) return null;
  const marks = (saved.marks || []).map(m => m === "good" ? "good" : "bad");
  return { type: "rank", attempts: [{ order: saved.order, marks }], cur: saved.order, pinned: [], done: true, solved: marks.every(m => m === "good"), tries: 1 };
}
function enforcePinned(p, order, pinned) {   // pinned items stay on a slot that needs their value; others keep relative order
  const right = correctOrder(p), pin = new Set(pinned), need = right.map(i => p.items[i].value);
  const free = order.filter(i => !pin.has(i)), out = right.map(() => null);
  for (const i of pinned) {
    const v = p.items[i].value;
    const slot = out.findIndex((x, n) => x == null && need[n] === v);
    if (slot >= 0) out[slot] = i;
  }
  return out.map(x => x == null ? free.shift() : x);
}
function renderRank(saved, keepOrder) {
  const p = state.puzzle; saved = normRank(saved);
  const g = state.rank = saved || { type: "rank", attempts: [], cur: null, pinned: [], done: false, solved: false, tries: 0 };
  const locked = g.done;
  if (!keepOrder) state.order = g.done ? g.attempts[g.attempts.length - 1].order : (g.cur || shuffledOrder(p, (state.mode === "all" || state.mode === "practice" ? "p" + Date.now() : state.dateKey) + p.id));
  if (!g.done) state.order = enforcePinned(p, state.order, g.pinned);
  const board = $("#board");
  // v12.1: values are always on (no show-values setting or chip)
  board.classList.toggle("values", true); board.classList.toggle("locked", locked);
  board.classList.toggle("n6", p.items.length >= 6);   // v10: 6-item rankers get compact rows
  board.classList.toggle("n7", p.items.length >= 7);   // 7-item rankers: one step tighter; 6-item boards stay on n6 only
  board.style.setProperty("--rank-n", String(p.items.length));
  $("#direction").textContent = p.higherIs === "bottom" ? "▲ Lowest at the top" : "▲ Highest at the top";
  // v8: values are shown together in ONE panel (sorted, top to bottom = the order asked for), never on the draggable cards
  // v8.1: ONE separate column box to the left of the cards, one value per row (sorted, aligned with the card rows),
  // so no value looks attached to a draggable card. After the reveal each card shows its own value instead.
  const vp = $("#valuesPanel"), cap = $("#valuesCap"), showVals = !locked;
  // v12.2: keep the values column; drop the "The values… Rank them!" caption chrome.
  vp.classList.toggle("hidden", !showVals); cap.classList.add("hidden"); cap.innerHTML = ""; board.classList.toggle("vcol", showVals);
  vp.innerHTML = `<ol class="vp-list" aria-label="Values">` + correctOrder(p).map(i => `<li class="vchip"><b>${fmtVal(p, p.items[i].value)}</b>${glossTag(p)}${gTag(p.items[i])}</li>`).join("") + `</ol>`;
  const ol = $("#cards"); ol.innerHTML = "";
  state.order.forEach(i => ol.appendChild(cardEl(p, i)));
  if (!g.done) markPinned();
  renumber(); renderTryDots();
  $("#submitBtn").parentElement.classList.toggle("hidden", locked);
  if (locked) $("#hint").classList.add("hidden"); else updateRankHint();
  if (state.sortable) state.sortable.destroy();
  state.sortable = window.Sortable ? Sortable.create(ol, { animation: 220, easing: "cubic-bezier(.2,.8,.2,1)", ghostClass: "sortable-ghost", chosenClass: "sortable-chosen",
    dragClass: "sortable-drag", forceFallback: true, fallbackTolerance: 3, disabled: locked, filter: ".pinned", preventOnFilter: false,
    onEnd: () => { orderChanged([...ol.children].map(li => +li.dataset.i)); } }) : null;
  if (locked) revealRank(g, false);
  fitLayout();
}
function markPinned() {
  const pin = new Set(state.rank.pinned);
  $$("#cards .card").forEach(li => { const on = pin.has(+li.dataset.i); li.classList.toggle("pinned", on); li.classList.toggle("good", on);
    if (on) li.querySelector(".yourpick").textContent = "🔒 Locked"; });
}
function orderChanged(order) {   // after a drag or arrow move: keep pinned cards fixed, clear stale red marks
  const p = state.puzzle, ol = $("#cards"), g = state.rank;
  const fixed = enforcePinned(p, order, g.pinned), els = {}; [...ol.children].forEach(li => els[li.dataset.i] = li);
  if (fixed.join() !== order.join()) { snapshot(ol); fixed.forEach(i => ol.appendChild(els[i])); flip(ol); }
  state.order = fixed; g.cur = fixed; if (g.attempts.length) setResult(g);
  $$("#cards .card.bad").forEach(li => li.classList.remove("bad", "shake"));
  renumber(); updateRankHint();
}
function cardEl(p, i) {
  const it = p.items[i], li = document.createElement("li");
  li.className = "card"; li.dataset.i = i;
  li.innerHTML = `<span class="rank"></span><span class="emoji">${esc(it.emoji || "•")}</span><span class="name">${esc(it.name)}<small class="yourpick"></small><span class="gwrap"></span></span>
    <span class="value"></span><span class="handle" aria-hidden="true">⋮⋮</span>
    <span class="arrows"><button data-dir="-1" aria-label="Move up">▲</button><button data-dir="1" aria-label="Move down">▼</button></span>`;
  li.querySelectorAll(".arrows button").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); move(li, +b.dataset.dir); }));
  return li;
}
function snapshot(ol) { [...ol.children].forEach(k => k._top = k.getBoundingClientRect().top); }
function flip(ol, dur = 300) { [...ol.children].forEach(k => { if (k._top == null) return; const dy = k._top - k.getBoundingClientRect().top; delete k._top;
  if (dy) k.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: dur, easing: "cubic-bezier(.2,.8,.2,1)" }); }); }
function move(li, dir) {   // swap with the nearest non-pinned card in that direction
  if ($("#board").classList.contains("locked") || li.classList.contains("pinned")) return;
  const ol = li.parentElement; let sib = dir < 0 ? li.previousElementSibling : li.nextElementSibling;
  while (sib && sib.classList.contains("pinned")) sib = dir < 0 ? sib.previousElementSibling : sib.nextElementSibling;
  if (!sib) return;
  snapshot(ol); const mark = document.createElement("li"); ol.insertBefore(mark, li); ol.insertBefore(li, sib); ol.insertBefore(sib, mark); mark.remove(); flip(ol);
  orderChanged([...ol.children].map(c => +c.dataset.i));
}
function renumber() { $$("#cards .card").forEach((li, n) => li.querySelector(".rank").textContent = n + 1); }
function renderTryDots() {
  const g = state.rank, max = CONFIG.rankMaxTries;
  const dots = Array.from({ length: max }, (_, n) => { const a = g.attempts[n]; if (!a) return "<i></i>";
    return `<i class="${a.marks.every(m => m === "good") ? "win" : "used"}"></i>`; }).join("");
  const left = max - g.attempts.length;
  $("#rankTries").innerHTML = `${dots}<span>${g.done ? (g.solved ? `Solved in ${g.tries}` : "Out of tries") : `${left} ${left === 1 ? "try" : "tries"} left`}</span>`;
}
function updateRankHint() {
  const p = state.puzzle, g = state.rank;
  // v12.2: drop the "Put the cards in order…" footnote; only show progress after a try.
  if (!g.attempts.length) { $("#hint").textContent = ""; $("#hint").classList.add("hidden"); return; }
  const n = g.pinned.length, tot = p.items.length;
  $("#hint").classList.remove("hidden");
  $("#hint").innerHTML = `<b>${n} of ${tot}</b> in the right spot. Green cards are locked in. Move the others and try again.`;
}
function scoreAttempt(p, order) {
  // Value-aware: a card is right if its value matches the value that belongs in that slot.
  // (Same as identity match when all values are unique; lets tied countries share either slot.)
  const right = correctOrder(p), need = right.map(i => p.items[i].value);
  return order.map((i, n) => p.items[i].value === need[n] ? "good" : "bad");
}
function submitRank() {
  const p = state.puzzle, g = state.rank;
  if (state.busy || g.done || $("#board").classList.contains("locked")) return;
  const last = g.attempts[g.attempts.length - 1];
  if (last && last.order.join() === state.order.join()) { toast("Move a red card first"); shakeBad(); return; }
  const marks = scoreAttempt(p, state.order);
  g.attempts.push({ order: [...state.order], marks }); g.tries = g.attempts.length; g.cur = [...state.order];
  const right = correctOrder(p), need = right.map(i => p.items[i].value); g.pinned = state.order.filter((i, n) => p.items[i].value === need[n]);
  const solved = marks.every(m => m === "good");
  if (solved || g.attempts.length >= CONFIG.rankMaxTries) {
    g.done = true; g.solved = solved;
    Object.assign(g, { marks, order: [...state.order], points: marks.filter(m => m === "good").length, max: marks.length, values: true });
    setResult(g); if (isToday()) recordStats(g);
    CommunityStats.submit({ puzzleId: p.id, day: state.dateKey, mode: state.mode, ...g });
    trackGameCompleted(g);
    $("#board").classList.add("locked"); state.sortable?.option("disabled", true);
    $("#submitBtn").parentElement.classList.add("hidden"); $("#hint").classList.add("hidden"); renderTryDots();
    feedback(marks, true);
    const tier = winTier(g);
    const cheer = cheerChoice(g, isIdentityRank(p));
    if (cheer) Fx.celebrate(cheer, "rank");
    setTimeout(() => afterSubmit(() => revealRank(g, true), tier), solved ? (tier === "explosive" ? 1100 : 700) : 650);
    return;
  }
  setResult(g); renderTryDots(); feedback(marks, false); updateRankHint();
  { const cheer = cheerChoice(g, isIdentityRank(p)); if (cheer) Fx.celebrate(cheer, "rank"); }
  toast(`${g.pinned.length}/${marks.length} right · ${CONFIG.rankMaxTries - g.attempts.length} ${CONFIG.rankMaxTries - g.attempts.length === 1 ? "try" : "tries"} left`);
}
function feedback(marks, final) {
  $$("#cards .card").forEach((li, n) => {
    li.classList.remove("good", "bad", "shake"); void li.offsetWidth;
    if (marks[n] === "good") { li.classList.add("good", "pop"); if (!final) { li.classList.add("pinned"); li.querySelector(".yourpick").textContent = "🔒 Locked"; } }
    else li.classList.add("bad", "shake");
  });
}
function shakeBad() { $$("#cards .card:not(.pinned)").forEach(li => { li.classList.remove("shake"); void li.offsetWidth; li.classList.add("shake"); }); }
function revealRank(res, animate) {
  $("#valuesPanel").classList.add("hidden"); $("#valuesCap").classList.add("hidden"); $("#board").classList.remove("vcol");   // after the reveal each card shows its own value
  const p = state.puzzle, ol = $("#cards"), right = correctOrder(p), last = res.attempts[res.attempts.length - 1];
  const userPos = {}, markOf = {}; last.order.forEach((i, n) => { userPos[i] = n; markOf[i] = last.marks[n]; });
  const els = {}; [...ol.children].forEach(li => els[li.dataset.i] = li);
  Object.values(els).forEach(li => { li.classList.remove("good", "bad", "shake", "pinned"); li.classList.add(markOf[li.dataset.i]); });
  const doMove = () => { snapshot(ol); right.forEach(i => ol.appendChild(els[i])); flip(ol, 650); renumber(); };
  const fill = () => right.forEach((i, n) => setTimeout(() => {
    const li = els[i], it = p.items[i];
    {
      const u = unitAside(p);
      const y = it.year ? `<small> · ${esc(it.year)}</small>` : "";
      li.querySelector(".value").innerHTML = `${fmtVal(p, it.value)}${u}${y}`;
    }
    const gw = li.querySelector(".gwrap"); if (gw) gw.innerHTML = gTag(it);
    li.querySelector(".yourpick").textContent = res.solved ? (res.tries === 1 ? "✓ first try" : "✓ solved") : markOf[i] === "good" ? "✓ you had it right" : `you put it #${userPos[i] + 1}`;
    li.classList.add("revealed"); if (animate) li.classList.add("pop");
  }, animate ? 200 + n * 160 : 0));
  if (animate) { setTimeout(doMove, 350); setTimeout(fill, 1000); setTimeout(() => showResult(res, { scroll: true }), 1150 + right.length * 160); }
  else { doMove(); fill(); showResult(res); }
}

// ================================================================ MATCH IT (v12)
// 6 people (flag + name + country) and their 6 clues, shuffled. Drag a clue onto a person (or tap a clue, then a person);
// one clue per person (assigning to a taken person swaps). Lock in when all 6 are placed: right pairs turn green and lock,
// wrong ones go red; fix them and lock in again, up to CONFIG.rankMaxTries. Same win tiers and ad rule as Rank it.
// Result: { type:"match", attempts:[{assign:[personIdx per clue], marks:["good"|"bad",...]}], cur:[...], pinned:[clueIdx], done, solved, tries }
// Clue k belongs to person k (sheet row order); clues are shown in a shuffled order, people in sheet order.
const LETTERS = "ABCDEFG";
const FAMILY_FIRST = new Set(["CHN", "TWN", "HKG", "KOR", "PRK", "VNM", "KHM", "MNG"]);   // names written family name first
const shortName = x => { if (x.name === x.country) return x.name; const w = x.name.trim().split(/\s+/); return w.length < 2 ? w[0] : FAMILY_FIRST.has(x.iso3) ? w[0] : w[w.length - 1]; };
const blankFlagImg = src => /blank\.(svg|png)$/i.test(src || "");
const flagHtml = x => {
  if (x && x.flagImg) {
    const blank = blankFlagImg(x.flagImg);
    const alt = blank ? "Blank flag" : `${x.country || x.name || "Flag"} flag`;
    return `<img class="m-flag-img${blank ? " is-blank" : ""}" src="${esc(x.flagImg)}" alt="${esc(alt)}">`;
  }
  return esc((x && x.emoji) || "");
};
const matchSeed = p => (state.mode === "daily" || state.mode === "archive" || state.mode === "preview" ? state.dateKey : "m") + p.id;
function clueOrder(p) {
  const r = rng(matchSeed(p)), idx = p.people.map((_, i) => i);
  for (let t = 0; t < 20; t++) { for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } if (idx.every((k, n) => k !== n)) break; }
  return idx;
}
function renderMatch(saved) {
  const p = state.puzzle;
  const g = state.match = saved && saved.type === "match" ? saved : { type: "match", attempts: [], cur: p.people.map(() => null), pinned: [], done: false, solved: false, tries: 0 };
  if (!g.cur) g.cur = p.people.map(() => null);
  state.mSel = null; state.mOrder = clueOrder(p);
  $("#mPeople").innerHTML = p.people.map((x, i) => `<button class="m-person" data-p="${i}" type="button"><span class="m-flag">${flagHtml(x)}</span><span class="m-who"><b>${esc(x.name)}</b>${x.country && x.country !== x.name ? `<small>${esc(x.country)}</small>` : ""}</span><span class="m-got" aria-label="Clue"></span></button>`).join("");
  $("#mClues").innerHTML = state.mOrder.map((k, n) => `<li class="m-clue" data-c="${k}" tabindex="0"><span class="m-letter">${LETTERS[n]}</span><span class="m-text">${esc(p.people[k].clue)}</span><span class="m-target"></span></li>`).join("");
  $("#matchGame").classList.toggle("locked", g.done); $("#matchGame").classList.toggle("m7", p.people.length > 6); $("#hero").classList.toggle("is-match7", p.people.length > 6);
  paintMatch();
  if (g.done) revealMatch(g, false);
  fitLayout();
}
const letterOf = k => LETTERS[state.mOrder.indexOf(k)];
function paintMatch(marks) {
  const p = state.puzzle, g = state.match, pin = new Set(g.pinned), last = g.attempts[g.attempts.length - 1];
  $$("#mClues .m-clue").forEach(li => { const k = +li.dataset.c, who = g.cur[k], t = li.querySelector(".m-target");
    t.innerHTML = who == null ? `<i>?</i>` : `${flagHtml(p.people[who])}<span class="tn"> ${esc(shortName(p.people[who]))}</span>`;
    li.classList.toggle("placed", who != null); li.classList.toggle("sel", state.mSel === k);
    li.classList.toggle("pinned", pin.has(k) && !g.done); li.classList.toggle("good", pin.has(k));
    const stale = last && last.assign[k] === who && last.marks[k] === "bad";
    li.classList.toggle("bad", !g.done && !pin.has(k) && !!stale); });
  $$("#mPeople .m-person").forEach(b => { const i = +b.dataset.p, k = g.cur.indexOf(i);
    b.querySelector(".m-got").textContent = k >= 0 ? letterOf(k) : ""; b.classList.toggle("has", k >= 0);
    b.classList.toggle("good", k >= 0 && pin.has(k)); b.disabled = g.done || (k >= 0 && pin.has(k)); b.classList.toggle("target", state.mSel != null && !(k >= 0 && pin.has(k))); });
  const placed = g.cur.filter(x => x != null).length, max = CONFIG.rankMaxTries;
  $("#matchTries").innerHTML = Array.from({ length: max }, (_, n) => { const a = g.attempts[n]; return a ? `<i class="${a.marks.every(m => m === "good") ? "win" : "used"}"></i>` : "<i></i>"; }).join("")
    + `<span>${g.done ? (g.solved ? `Solved in ${g.tries}` : "Out of tries") : `${max - g.attempts.length} ${max - g.attempts.length === 1 ? "try" : "tries"} left`}</span>`;
  $("#mHint").innerHTML = g.done ? "" : g.attempts.length ? `<b>${g.pinned.length} of ${p.people.length}</b> right. Green pairs are locked in. Move the red clues and try again.` : `Drag each clue onto a person (or tap a clue, then a person). ${placed}/${p.people.length} placed.`;
  $("#matchSubmit").parentElement.classList.toggle("hidden", g.done);
  $("#matchSubmit").classList.toggle("ready", placed === p.people.length);
}
function matchAssign(k, i) {   // clue k -> person i (swap if person i already holds another unlocked clue)
  const g = state.match; if (g.done || g.pinned.includes(k)) return;
  const other = g.cur.indexOf(i); if (other >= 0 && g.pinned.includes(other)) return;
  if (other >= 0 && other !== k) g.cur[other] = g.cur[k];
  g.cur[k] = i; state.mSel = null; if (g.attempts.length) setResult(g);
  paintMatch();
  const li = $(`#mClues .m-clue[data-c="${k}"]`); if (li) { li.classList.remove("pop"); void li.offsetWidth; li.classList.add("pop"); }
}
function matchTapClue(k) {
  const g = state.match; if (g.done || g.pinned.includes(k)) return;
  state.mSel = state.mSel === k ? null : k; paintMatch();
}
function matchTapPerson(i) {
  const g = state.match; if (g.done) return;
  if (state.mSel != null) return matchAssign(state.mSel, i);
  const k = g.cur.indexOf(i); if (k >= 0 && !g.pinned.includes(k)) matchTapClue(k); else toast("Pick a clue first, then tap a person");
}
function submitMatch() {
  const p = state.puzzle, g = state.match;
  if (state.busy || g.done) return;
  if (g.cur.some(x => x == null)) { toast(`Match all ${p.people.length} clues first`); return; }
  const last = g.attempts[g.attempts.length - 1];
  if (last && last.assign.join() === g.cur.join()) { toast("Move a red clue first"); $$("#mClues .m-clue.bad").forEach(li => { li.classList.remove("shake"); void li.offsetWidth; li.classList.add("shake"); }); return; }
  const marks = g.cur.map((who, k) => who === k ? "good" : "bad");
  g.attempts.push({ assign: [...g.cur], marks }); g.tries = g.attempts.length; g.pinned = marks.map((m, k) => m === "good" ? k : -1).filter(k => k >= 0);
  const solved = marks.every(m => m === "good");
  $$("#mClues .m-clue").forEach(li => { const k = +li.dataset.c; li.classList.remove("shake", "pop"); void li.offsetWidth; li.classList.add(marks[k] === "good" ? "pop" : "shake"); });
  if (solved || g.attempts.length >= CONFIG.rankMaxTries) {
    g.done = true; g.solved = solved; Object.assign(g, { marks, points: marks.filter(m => m === "good").length, max: marks.length });
    setResult(g); if (isToday()) recordStats(g);
    CommunityStats.submit({ puzzleId: p.id, day: state.dateKey, mode: state.mode, ...g });
    trackGameCompleted(g);
    $("#matchGame").classList.add("locked"); paintMatch(); $$("#mClues .m-clue").forEach(li => { const k = +li.dataset.c; li.classList.toggle("good", marks[k] === "good"); li.classList.toggle("bad", marks[k] !== "good"); });
    const tier = winTier(g);
    const cheer = cheerChoice(g, false);
    if (cheer) Fx.celebrate(cheer, "rank");
    setTimeout(() => afterSubmit(() => revealMatch(g, true), tier), solved ? (tier === "explosive" ? 1100 : 700) : 650);
    return;
  }
  setResult(g); paintMatch();
  { const cheer = cheerChoice(g, false); if (cheer) Fx.celebrate(cheer, "rank"); }
  toast(`${g.pinned.length}/${marks.length} right · ${CONFIG.rankMaxTries - g.attempts.length} ${CONFIG.rankMaxTries - g.attempts.length === 1 ? "try" : "tries"} left`);
}
function revealMatch(res, animate) {
  const p = state.puzzle, last = res.attempts[res.attempts.length - 1];
  $$("#mClues .m-clue").forEach((li, n) => { const k = +li.dataset.c, ok = last.marks[k] === "good";
    li.classList.remove("sel", "pinned", "shake"); li.classList.toggle("good", ok); li.classList.toggle("bad", !ok); li.classList.add("revealed");
    li.querySelector(".m-target").innerHTML = `${flagHtml(p.people[k])}<span class="tn"> ${esc(shortName(p.people[k]))}</span>${ok ? "" : ` <s>${flagHtml(p.people[last.assign[k]])}<span class="tn">${esc(shortName(p.people[last.assign[k]]))}</span></s>`}`;
    if (animate) setTimeout(() => li.classList.add("pop"), 120 * n); });
  $$("#mPeople .m-person").forEach(b => { const i = +b.dataset.p; b.querySelector(".m-got").textContent = letterOf(i); b.classList.toggle("good", last.marks[i] === "good"); b.classList.toggle("bad", last.marks[i] !== "good"); b.disabled = true; });
  if (animate) setTimeout(() => showResult(res, { scroll: true }), 300 + 120 * p.people.length); else showResult(res);
}
const matchAnswers = (p, res) => { const last = res.attempts[res.attempts.length - 1];
  return `<h3>The matches</h3>${p.fact ? `<p class="m-note">${esc(p.fact)}</p>` : ""}` + p.people.map((x, k) => `<div class="m-ans ${last.marks[k] === "good" ? "ok" : "no"}"><div class="m-ans-h"><span class="m-flag">${flagHtml(x)}</span><b>${esc(x.name)}</b>${x.country && x.country !== x.name ? `<small>${esc(x.country)}</small>` : ""}<span class="m-ans-mark">${last.marks[k] === "good" ? "✓" : "✗"}</span></div>
    <p class="m-ans-clue">“${esc(x.clue)}”</p><p class="m-ans-fact">${esc(x.fact)}${x.sourceUrl ? ` <a href="${esc(x.sourceUrl)}" target="_blank" rel="noopener">${esc(x.sourceName || "Source")} ↗</a>` : ""}</p></div>`).join(""); };
// drag a clue onto a person (pointer events: mouse, pen and touch); a short press without movement is a tap
(function matchDrag() {
  let d = null;
  const zone = () => $("#matchGame");
  zone().addEventListener("pointerdown", e => {
    const li = e.target.closest(".m-clue"); if (!li || state.match?.done || li.classList.contains("pinned") || e.button > 0) return;
    d = { li, k: +li.dataset.c, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, ghost: null };
  });
  addEventListener("pointermove", e => {
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    if (!d.moved) { d.moved = true; const r = d.li.getBoundingClientRect(), gh = d.li.cloneNode(true); gh.classList.add("m-ghost"); gh.style.width = r.width + "px";
      gh.style.left = r.left + "px"; gh.style.top = r.top + "px"; document.body.appendChild(gh); d.ghost = gh; d.ox = e.clientX - r.left; d.oy = e.clientY - r.top; d.li.classList.add("dragging"); }
    e.preventDefault();
    d.ghost.style.left = (e.clientX - d.ox) + "px"; d.ghost.style.top = (e.clientY - d.oy) + "px";
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest(".m-person");
    $$("#mPeople .m-person").forEach(b => b.classList.toggle("over", b === over));
  }, { passive: false });
  const end = e => {
    if (!d || e.pointerId !== d.id) return; const cur = d; d = null;
    $$("#mPeople .m-person").forEach(b => b.classList.remove("over"));
    if (!cur.moved) { matchTapClue(cur.k); return; }
    cur.ghost.remove(); cur.li.classList.remove("dragging");
    const over = e.type === "pointerup" ? document.elementFromPoint(e.clientX, e.clientY)?.closest(".m-person") : null;
    if (over && !over.disabled) matchAssign(cur.k, +over.dataset.p);
  };
  addEventListener("pointerup", end); addEventListener("pointercancel", end);
  $("#mPeople").addEventListener("click", e => { const b = e.target.closest(".m-person"); if (b && !b.disabled) matchTapPerson(+b.dataset.p); });
  $("#mClues").addEventListener("keydown", e => { const li = e.target.closest(".m-clue"); if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); matchTapClue(+li.dataset.c); } });
})();
window.RankdMatch = { state: () => state.match, order: () => state.mOrder, assign: (k, i) => matchAssign(k, i) };


// ================================================================ TIER IT (v12.2)
// Drag (or tap-to-assign) each item onto a labeled tier row. Multiple items per tier OK.
// Lock in: right tier = green + pinned; wrong = red. Same tries / win tiers / ads as Rank it.
// Result: { type:"tier", attempts:[{assign:[tierIndex|null per item], marks:["good"|"bad",...]}], cur:[...], pinned:[itemIdx], done, solved, tries }
function correctTierAssign(p) { return p.items.map(it => it.tierIndex); }
const TIER_SHORT = {"United States":"US","United Kingdom":"UK","United Arab Emirates":"UAE","South Korea":"S. Korea","South Africa":"S. Africa","New Zealand":"NZ","Czech Republic":"Czechia"};
const tierChipName = n => (fitMQ.matches && TIER_SHORT[n]) ? TIER_SHORT[n] : n;
function renderTier(saved) {
  const p = state.puzzle;
  const g = state.tier = saved && saved.type === "tier" ? saved : { type: "tier", attempts: [], cur: p.items.map(() => null), pinned: [], done: false, solved: false, tries: 0 };
  state.tierSel = null;   // selected chip item index for tap-to-assign
  $("#tierGame").classList.toggle("locked", g.done);
  $("#tierDir").textContent = g.done ? "Your tiers" : "Drag or tap into a tier";
  paintTier();
  renderTierTries(); updateTierHint();
  $("#tierHint").classList.toggle("hidden", g.done); $("#tierSubmit").parentElement.classList.toggle("hidden", g.done);
  if (g.done) revealTier(g, false);
  fitLayout();
}
function paintTier(marks) {
  const p = state.puzzle, g = state.tier, pin = new Set(g.pinned || []);
  const assign = g.done && g.attempts.length ? g.attempts[g.attempts.length - 1].assign : g.cur;
  // pool = unassigned
  const pool = $("#tierPool"); pool.innerHTML = "";
  p.items.forEach((it, i) => {
    if (assign[i] != null) return;
    pool.appendChild(tierChipEl(p, i, null, marks && marks[i], pin.has(i)));
  });
  const rows = $("#tierRows"); rows.innerHTML = "";
  p.tiers.forEach((t, ti) => {
    const row = document.createElement("div"); row.className = "tier-row"; row.dataset.t = ti;
    row.innerHTML = `<div class="tier-label">${esc(t.label)}</div><div class="tier-slots" data-t="${ti}"></div>`;
    const slots = row.querySelector(".tier-slots");
    p.items.forEach((it, i) => {
      if (assign[i] !== ti) return;
      slots.appendChild(tierChipEl(p, i, ti, marks && marks[i], pin.has(i)));
    });
    rows.appendChild(row);
  });
  // selection highlight
  if (state.tierSel != null) $$(".tier-chip").forEach(c => c.classList.toggle("sel", +c.dataset.i === state.tierSel));
}
function tierChipEl(p, i, ti, mark, pinned) {
  const it = p.items[i], g = state.tier;
  const chip = document.createElement("span");
  chip.className = "tier-chip" + (pinned || (mark === "good" && g.done) ? " good pinned" : "") + (mark === "bad" ? " bad" : "");
  chip.dataset.i = i; chip.setAttribute("role", "listitem"); chip.draggable = !(g.done || pinned);
  const valShow = g.done ? `<span class="tc-val">${fmtVal(p, it.value)}${(!isPercent(p) && p.unit) ? " " + esc(p.unit) : ""}</span>` : "";
  const nm = tierChipName(it.name);
  chip.innerHTML = `<span class="tc-flag">${esc(it.emoji || "•")}</span><span class="tc-name">${esc(nm)}</span>${valShow}`;
  if (!g.done && !pinned) {
    chip.addEventListener("click", e => { e.stopPropagation(); tierTapChip(i); });
    chip.addEventListener("dragstart", e => { if (chip.classList.contains("pinned")) { e.preventDefault(); return; } state.tierDrag = i; chip.classList.add("dragging"); e.dataTransfer.setData("text/plain", String(i)); e.dataTransfer.effectAllowed = "move"; });
    chip.addEventListener("dragend", () => { chip.classList.remove("dragging"); state.tierDrag = null; $$(".tier-row").forEach(r => r.classList.remove("drag-over")); });
  }
  return chip;
}
function tierTapChip(i) {
  const g = state.tier; if (g.done || g.pinned.includes(i)) return;
  state.tierSel = state.tierSel === i ? null : i;
  $$(".tier-chip").forEach(c => c.classList.toggle("sel", +c.dataset.i === state.tierSel));
  $$(".tier-row").forEach(r => r.classList.toggle("sel", state.tierSel != null));
}
function tierAssign(i, ti) {
  const g = state.tier, p = state.puzzle;
  if (g.done || g.pinned.includes(i)) return;
  // move item i to tier ti (ti null = back to pool)
  g.cur = g.cur.slice(); g.cur[i] = ti;
  state.tierSel = null;
  $$("#tierRows .tier-chip.bad").forEach(c => c.classList.remove("bad", "shake"));
  paintTier(); updateTierHint(); if (g.attempts.length) setResult(g);
}
function renderTierTries() {
  const g = state.tier, max = CONFIG.rankMaxTries;
  const dots = Array.from({ length: max }, (_, n) => { const a = g.attempts[n]; if (!a) return "<i></i>";
    return `<i class="${a.marks.every(m => m === "good") ? "win" : "used"}"></i>`; }).join("");
  const left = max - g.attempts.length;
  $("#tierTries").innerHTML = `${dots}<span>${g.done ? (g.solved ? `Solved in ${g.tries}` : "Out of tries") : `${left} ${left === 1 ? "try" : "tries"} left`}</span>`;
}
function updateTierHint() {
  const p = state.puzzle, g = state.tier;
  const placed = g.cur.filter(x => x != null).length;
  if (!g.attempts.length) {
    $("#tierHint").textContent = placed < p.items.length
      ? `Place all ${p.items.length} into a tier, then lock it in. Multiple countries can share a tier.`
      : "All placed — lock it in. Green stays; red you can move.";
    return;
  }
  $("#tierHint").innerHTML = `<b>${g.pinned.length} of ${p.items.length}</b> in the right tier. Green chips are locked. Move the others and try again.`;
}
function scoreTier(p, assign) {
  const right = correctTierAssign(p);
  return assign.map((t, i) => (t != null && t === right[i]) ? "good" : "bad");
}
function submitTier() {
  const p = state.puzzle, g = state.tier;
  if (state.busy || g.done) return;
  if (g.cur.some(x => x == null)) { toast("Place every country into a tier first"); return; }
  const last = g.attempts[g.attempts.length - 1];
  if (last && last.assign.join() === g.cur.join()) { toast("Move a red chip first"); $$(".tier-chip.bad").forEach(c => { c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake"); }); return; }
  const marks = scoreTier(p, g.cur);
  g.attempts.push({ assign: [...g.cur], marks }); g.tries = g.attempts.length;
  const right = correctTierAssign(p);
  g.pinned = right.map((t, i) => g.cur[i] === t ? i : -1).filter(i => i >= 0);
  const solved = marks.every(m => m === "good");
  // feedback flash
  paintTier(marks);
  $$(".tier-chip").forEach(c => { const i = +c.dataset.i; c.classList.remove("pop", "shake"); void c.offsetWidth;
    c.classList.add(marks[i] === "good" ? "pop" : "shake"); });
  if (solved || g.attempts.length >= CONFIG.rankMaxTries) {
    g.done = true; g.solved = solved;
    Object.assign(g, { marks, assign: [...g.cur], points: marks.filter(m => m === "good").length, max: marks.length });
    setResult(g); if (isToday()) recordStats(g);
    CommunityStats.submit({ puzzleId: p.id, day: state.dateKey, mode: state.mode, ...g });
    trackGameCompleted(g);
    $("#tierGame").classList.add("locked");
    $("#tierSubmit").parentElement.classList.add("hidden"); $("#tierHint").classList.add("hidden"); renderTierTries();
    const tier = winTier(g);
    const cheer = cheerChoice(g, isIdentityTier(p));
    if (cheer) Fx.celebrate(cheer, "rank");
    setTimeout(() => afterSubmit(() => revealTier(g, true), tier), solved ? (tier === "explosive" ? 1100 : 700) : 650);
    return;
  }
  setResult(g); renderTierTries(); updateTierHint();
  { const cheer = cheerChoice(g, isIdentityTier(p)); if (cheer) Fx.celebrate(cheer, "rank"); }
  toast(`${g.pinned.length}/${marks.length} right · ${CONFIG.rankMaxTries - g.attempts.length} ${CONFIG.rankMaxTries - g.attempts.length === 1 ? "try" : "tries"} left`);
}
function revealTier(res, animate) {
  const p = state.puzzle, g = state.tier;
  // snap wrong items to correct tiers for the reveal
  const right = correctTierAssign(p);
  g.cur = right.slice();
  paintTier(res.marks || scoreTier(p, right));
  if (animate) $$(".tier-chip").forEach(c => { c.classList.remove("pop"); void c.offsetWidth; c.classList.add("pop"); });
  showResult(res, animate ? { scroll: true } : null); fitLayout();
}
function isIdentityTier(p) {
  if (!p || p.type !== "tier" || !p.items || !p.items.length) return false;
  const flag = e => /[\u{1F1E6}-\u{1F1FF}]{2}/u.test(e || "");
  if (p.items.filter(it => flag(it.emoji)).length >= Math.ceil(p.items.length * 0.75)) return true;
  return /relig|faith|pew-meaning|god/i.test(p.id || "");
}
// Tier drag/drop + tap-row (once)
(() => {
  const board = () => $("#tierGame");
  $("#tierRows").addEventListener("dragover", e => { const row = e.target.closest(".tier-row"); if (!row || state.tier?.done) return; e.preventDefault(); row.classList.add("drag-over"); });
  $("#tierRows").addEventListener("dragleave", e => { const row = e.target.closest(".tier-row"); if (row) row.classList.remove("drag-over"); });
  $("#tierRows").addEventListener("drop", e => {
    const row = e.target.closest(".tier-row"); if (!row || state.tier?.done) return;
    e.preventDefault(); row.classList.remove("drag-over");
    const i = state.tierDrag != null ? state.tierDrag : +e.dataTransfer.getData("text/plain");
    if (Number.isFinite(i)) tierAssign(i, +row.dataset.t);
  });
  $("#tierPool").addEventListener("dragover", e => { if (state.tier?.done) return; e.preventDefault(); });
  $("#tierPool").addEventListener("drop", e => {
    if (state.tier?.done) return; e.preventDefault();
    const i = state.tierDrag != null ? state.tierDrag : +e.dataTransfer.getData("text/plain");
    if (Number.isFinite(i)) tierAssign(i, null);
  });
  $("#tierRows").addEventListener("click", e => {
    const row = e.target.closest(".tier-row"); if (!row || state.tier?.done) return;
    if (state.tierSel == null) return;
    if (e.target.closest(".tier-chip")) return;   // chip click handled separately
    tierAssign(state.tierSel, +row.dataset.t);
  });
})();
window.RankdTier = { state: () => state.tier, assign: (i, t) => tierAssign(i, t), submit: submitTier };

// ================================================================ TOP 5
// Six cards: the real top 5 plus one decoy from the same list. Drag (or tap) them into
// slots #1–#5, highest first, and leave the decoy out. Lock it in up to CONFIG.rankMaxTries
// times. Right slots turn green and pin; wrong ones turn red. One hint per failed lock.
// Result: { type:"top5", attempts:[{slots:[key|null x5], marks:["good"|"bad" x5]}], cur, pinned:[slot indexes], hand:[6 keys], done, solved, won, tries }
// A finished pre-slot game (guesses, no attempts) still opens on the old result screen.
function renderTop5(saved) {
  const p = state.puzzle;
  const legacy = saved && saved.type === "top5" && saved.done && Array.isArray(saved.guesses) && !(saved.attempts && saved.attempts.length);
  if (legacy) {
    state.guess = saved; state.t5Sel = null;
    $("#guessGame").classList.add("locked");
    const btn = $("#t5Submit"); if (btn) btn.parentElement.classList.add("hidden");
    const hint = $("#t5Hint"); if (hint) hint.classList.add("hidden");
    showResult(saved);
    fitLayout();
    return;
  }
  const fresh = !(saved && saved.type === "top5" && Array.isArray(saved.attempts));
  const g = state.guess = fresh ? { type: "top5", attempts: [], cur: [null, null, null, null, null], pinned: [], hand: shuffledHand(p), done: false, solved: false, won: false, tries: 0 } : saved;
  if (!Array.isArray(g.cur) || g.cur.length !== 5) g.cur = [null, null, null, null, null];
  if (!Array.isArray(g.hand) || !g.hand.length) g.hand = shuffledHand(p);
  if (!Array.isArray(g.pinned)) g.pinned = [];
  state.t5Sel = null;
  $("#guessGame").classList.toggle("locked", !!g.done);
  const more = $("#t5More"); if (more) more.onclick = extraSheet;
  paintTop5();
  renderTop5Tries();
  renderHints();
  updateTop5Hint();
  const sub = $("#t5Submit"); if (sub) sub.parentElement.classList.toggle("hidden", !!g.done);
  if (g.done) revealTop5(g, false);
  fitLayout();
}
const findCountry = (p, key) => p.countries.find(c => (c.iso3 && c.iso3 === key) || c.name === key);
const cKey = c => c.iso3 || c.name;
const isTop5 = p => p.type === "top5";
const sameRank = (a, b) => a.value === b.value && (a.exact ?? null) === (b.exact ?? null);
const beats = (a, b) => a.value > b.value || (a.value === b.value && a.exact != null && b.exact != null && a.exact > b.exact);
const SLOTS = new WeakMap();
function slotsOf(p) {
  if (SLOTS.has(p)) return SLOTS.get(p);
  const cs = p.countries.slice().sort((a, b) => b.value - a.value || (b.exact ?? 0) - (a.exact ?? 0)), sl = cs.slice(0, 4).map(c => [c]);
  sl.push(cs.slice(4).filter(c => sameRank(c, cs[4])));
  const out = sl.map((group, i) => ({ i, group, value: group[0].value, tied: group.length > 1 })); SLOTS.set(p, out); return out;
}
const slotOf = (p, c) => c && slotsOf(p).find(s => s.group.includes(c));
const inTop = (p, c) => !!slotOf(p, c);
const topSet = p => slotsOf(p).map(s => s.group[0]);
const slotFound = (p, s, keys) => s.group.find(c => keys.has(cKey(c)));
const hitsOf = (p, g) => { const k = new Set(g.guesses || []); return slotsOf(p).filter(s => slotFound(p, s, k)).length; };
const tieRank = (p, c) => 1 + p.countries.filter(x => beats(x, c)).length;
const missesOf = (p, g) => (g.guesses || []).length - (g.guesses || []).filter(k => inTop(p, findCountry(p, k))).length;
const missesLeft = (p, g) => Math.max(0, (p.maxMisses || 10) - missesOf(p, g));
const plural = (n, w, pl = w + "es") => `${n} ${n === 1 ? w : pl}`;
const avgRank = (p, g) => { const r = (g.guesses || []).map(k => findCountry(p, k)).filter(Boolean).map(c => tieRank(p, c));
  return r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : null; };
function resolveDecoy(p) {
  const cs = p.countries || [];
  const named = p.decoy;
  let c = named ? cs.find(x => (named.iso3 && x.iso3 === named.iso3) || x.name === named.name) : null;
  if (!c) c = pickDecoyCountry(cs);
  return c || null;
}
function shuffledHand(p) {
  const reps = slotsOf(p).map(s => cKey(s.group[0]));
  const d = resolveDecoy(p);
  const keys = reps.concat(d ? [cKey(d)] : []);
  const right = reps.join("|");
  const seed = (state.mode === "daily" || state.mode === "archive" || state.mode === "preview" ? state.dateKey : "t" + (p.seed || "x")) + p.id;
  const r = rng(seed);
  for (let t = 0; t < 24; t++) {
    for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
    if (keys.slice(0, 5).join("|") !== right) break;
  }
  return keys;
}
function t5ChipHtml(c, opts) {
  const cls = ["t5chip"];
  if (opts.sel) cls.push("sel");
  if (opts.mark === "good" || opts.mark === "bad") cls.push(opts.mark);
  if (opts.pinned) cls.push("pinned");
  return `<button type="button" class="${cls.join(" ")}" data-key="${esc(cKey(c))}"${opts.pinned ? ' aria-disabled="true"' : ""}><span class="tc-flag">${esc(c.emoji || "🏳️")}</span><span class="tc-name">${esc(c.name)}</span></button>`;
}
function paintTop5(marks) {
  const p = state.puzzle, g = state.guess;
  if (!g || !Array.isArray(g.cur)) return;
  const sl = slotsOf(p);
  const t5v = v => isPercent(p) ? `${fmt1(v)}%` : fmt1(v);
  const t5u = unitAside(p);
  const board = $("#t5board");
  board.classList.toggle("long-unit", (p.unit || "").length >= 12);
  board.classList.remove("hidden");
  const pin = new Set(g.pinned || []);
  const slotsHtml = sl.map((s, i) => {
    const key = g.cur && g.cur[i];
    const c = key && findCountry(p, key);
    const pinned = pin.has(i);
    const mark = marks && marks[i] ? marks[i] : (pinned ? "good" : "");
    const chip = c ? t5ChipHtml(c, { sel: state.t5Sel === cKey(c), mark, pinned }) : `<span class="t5ph">${state.t5Sel ? "Tap to place" : ""}</span>`;
    return `<div class="t5slot${pinned ? " pinned" : ""}${mark ? " " + mark : ""}" data-slot="${i}" tabindex="0"><span class="t5r">#${i + 1}</span>${chip}</div>`;
  }).join("");
  board.innerHTML = `<div class="t5grid"><div class="t5vals" aria-label="The top-5 values"><ol class="vp-list">${sl.map(s => `<li class="vchip"><b>${t5v(s.value)}</b>${t5u}</li>`).join("")}</ol></div><div class="t5slots">${slotsHtml}</div></div>`;
  const placed = new Set((g.cur || []).filter(Boolean));
  const pool = $("#t5pool");
  pool.innerHTML = (g.hand || []).filter(k => !placed.has(k)).map(k => {
    const c = findCountry(p, k); return c ? t5ChipHtml(c, { sel: state.t5Sel === k }) : "";
  }).join("");
  const dir = $("#t5Dir"); if (dir) dir.textContent = g.done ? "The top 5" : "Highest at #1 · leave one out";
}
function renderTop5Tries() {
  const g = state.guess; if (!g || !g.attempts) return;
  const max = CONFIG.rankMaxTries;
  const dots = Array.from({ length: max }, (_, n) => { const a = g.attempts[n]; if (!a) return "<i></i>";
    return `<i class="${a.marks.every(m => m === "good") ? "win" : "used"}"></i>`; }).join("");
  const left = max - g.attempts.length;
  const el = $("#t5Tries"); if (!el) return;
  el.innerHTML = `${dots}<span>${g.done ? (g.solved ? `Solved in ${g.tries}` : "Out of tries") : `${left} ${left === 1 ? "try" : "tries"} left`}</span>`;
}
function updateTop5Hint() {
  const g = state.guess, el = $("#t5Hint"); if (!el) return;
  if (!g || !g.attempts || !g.attempts.length || g.done) { el.textContent = ""; el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  el.innerHTML = `<b>${(g.pinned || []).length} of 5</b> in the right spot. Green cards are locked. Move the others and try again.`;
}
function scoreTop5(p, slots) {
  const need = slotsOf(p);
  return (slots || []).map((key, i) => {
    const c = key && findCountry(p, key);
    return c && need[i] && c.value === need[i].value ? "good" : "bad";
  });
}
function t5Place(key, slot) {
  const g = state.guess; if (!g || g.done || !key) return;
  const from = (g.cur || []).indexOf(key);
  if (from >= 0 && (g.pinned || []).includes(from)) return;
  if (slot != null && (g.pinned || []).includes(slot)) return;
  if (slot == null) { if (from >= 0) g.cur[from] = null; }
  else if (from !== slot) {
    const occupant = g.cur[slot];
    g.cur[slot] = key;
    if (from >= 0) g.cur[from] = occupant || null;
  }
  state.t5Sel = null;
  if (g.attempts.length) setResult(g);
  paintTop5();
  updateTop5Hint();
}
function t5TapChip(key) {
  const g = state.guess; if (!g || g.done) return;
  const from = g.cur.indexOf(key);
  if (from >= 0 && g.pinned.includes(from)) return;
  if (state.t5Sel === key) { state.t5Sel = null; paintTop5(); return; }
  if (state.t5Sel) {
    const selFrom = g.cur.indexOf(state.t5Sel);
    if (from >= 0) { t5Place(state.t5Sel, from); return; }
    if (selFrom >= 0) { t5Place(key, selFrom); return; }
  }
  state.t5Sel = key;
  paintTop5();
}
function t5TapSlot(i) {
  const g = state.guess; if (!g || g.done || g.pinned.includes(i)) return;
  if (state.t5Sel) t5Place(state.t5Sel, i);
}
function t5TapPool() {
  const g = state.guess; if (!g || g.done || !state.t5Sel) return;
  if (g.cur.includes(state.t5Sel)) t5Place(state.t5Sel, null);
  else { state.t5Sel = null; paintTop5(); }
}
const bankOf = c => (c && c.hints && c.hints.length ? c.hints : [`Its name starts with “${(c && c.name ? c.name : "?").normalize("NFD")[0].toUpperCase()}”.`]);
function hintPlan(p, g) {
  if (!g || !Array.isArray(g.attempts)) return [];
  const sl = slotsOf(p), used = {}, given = [];
  g.attempts.forEach(a => {
    if (!a.marks || a.marks.every(m => m === "good")) return;
    const ts = sl.find(s => a.marks[s.i] !== "good" && (used[s.i] || 0) < bankOf(s.group[0]).length);
    if (!ts) return;
    const n = used[ts.i] = (used[ts.i] || 0) + 1, text = bankOf(ts.group[0])[n - 1];
    if (text) given.push({ target: ts.group[0], slot: ts.i + 1, n, text });
  });
  return given;
}
function renderHints() {
  const p = state.puzzle, g = state.guess, box = $("#hints"), lh = $("#lastHint");
  if (!box) return;
  if (!g || !Array.isArray(g.attempts)) { box.innerHTML = ""; if (lh) lh.classList.add("hidden"); return; }
  const plan = hintPlan(p, g), pin = new Set(g.pinned || []);
  box.innerHTML = plan.map(h =>
    `<div class="hint-card open${pin.has(h.slot - 1) ? " found" : ""}" data-slot="${h.slot}" data-n="${h.n}"><span class="hk">Hint for #${h.slot}:</span> <span class="ht">${esc(h.text)}</span>${pin.has(h.slot - 1) ? ` <span class="hf">✓ found</span>` : ""}</div>`).join("");
  const cur = [...plan].reverse().find(h => !pin.has(h.slot - 1));
  if (!lh) return;
  lh.classList.toggle("hidden", !cur || g.done);
  lh.innerHTML = cur ? `<span class="lm-k">💡 Hint for #${cur.slot}</span><span>${esc(cur.text)}</span>` : "";
  requestAnimationFrame(fitLayout);
}
function decoyLine(p) {
  const d = resolveDecoy(p); if (!d) return "";
  const unit = p.unit ? " " + p.unit : "";
  return `Not top 5: ${d.name} is actually #${tieRank(p, d)} (${fmt(d.value)}${unit})`;
}
function shakeTop5() {
  $$("#guessGame .t5chip:not(.pinned)").forEach(el => { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); });
}
function submitTop5() {
  const p = state.puzzle, g = state.guess;
  if (!g || state.busy || g.done || !Array.isArray(g.attempts)) return;
  if (g.cur.some(k => !k)) { toast("Fill all 5 slots"); return; }
  const last = g.attempts[g.attempts.length - 1];
  if (last && last.slots.join("|") === g.cur.join("|")) { toast("Move a red card first"); shakeTop5(); return; }
  const marks = scoreTop5(p, g.cur);
  g.attempts.push({ slots: g.cur.slice(), marks });
  g.tries = g.attempts.length;
  g.pinned = marks.map((m, i) => m === "good" ? i : -1).filter(i => i >= 0);
  const solved = marks.every(m => m === "good");
  g.solved = solved; g.won = solved; g.hits = g.pinned.length;
  paintTop5(marks);
  if (solved || g.attempts.length >= CONFIG.rankMaxTries) {
    g.done = true; g.marks = marks;
    setResult(g); if (isToday()) recordStats(g);
    CommunityStats.submit({ puzzleId: p.id, day: state.dateKey, mode: state.mode, ...g });
    trackGameCompleted(g);
    $("#guessGame").classList.add("locked");
    $("#t5Submit").parentElement.classList.add("hidden");
    $("#t5Hint").classList.add("hidden");
    renderTop5Tries(); renderHints();
    const tier = winTier(g);
    const cheer = cheerChoice(g, false);
    if (cheer) Fx.celebrate(cheer, "top5");
    setTimeout(() => afterSubmit(() => revealTop5(g, true), tier), solved ? (tier === "explosive" ? 1100 : 700) : 650);
    return;
  }
  setResult(g); renderTop5Tries(); renderHints(); updateTop5Hint();
  { const cheer = cheerChoice(g, false); if (cheer) Fx.celebrate(cheer, "top5"); }
  const left = CONFIG.rankMaxTries - g.attempts.length;
  toast(`${g.pinned.length}/5 right · ${left} ${left === 1 ? "try" : "tries"} left`);
}
function revealTop5(res, animate) {
  const p = state.puzzle;
  if (res && Array.isArray(res.attempts) && res.attempts.length) {
    res.cur = slotsOf(p).map(s => cKey(s.group[0]));
    res.pinned = [0, 1, 2, 3, 4];
    paintTop5(res.cur.map(() => "good"));
    const out = $("#t5Out"), line = decoyLine(p);
    if (out) { out.textContent = line; out.classList.toggle("hidden", !line); }
    const dir = $("#t5Dir"); if (dir) dir.textContent = "The top 5";
  }
  if (animate) setTimeout(() => showResult(res, { scroll: true }), 420); else showResult(res);
}
(function top5Drag() {
  let d = null, suppressClick = false;
  const zone = () => $("#guessGame");
  const root = zone(); if (!root) return;
  root.addEventListener("pointerdown", e => {
    const chip = e.target.closest(".t5chip");
    if (!chip || state.guess?.done || chip.classList.contains("pinned") || e.button > 0) return;
    d = { chip, key: chip.dataset.key, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, ghost: null };
  });
  addEventListener("pointermove", e => {
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
    if (!d.moved) {
      d.moved = true;
      const r = d.chip.getBoundingClientRect(), gh = d.chip.cloneNode(true);
      gh.classList.add("t5-ghost"); gh.classList.remove("sel");
      gh.style.width = r.width + "px";
      document.body.appendChild(gh); d.ghost = gh;
      // Offset from the pointer-down point, so a coalesced first move still sits under the finger.
      d.ox = d.x - r.left; d.oy = d.y - r.top;
      d.chip.classList.add("dragging");
    }
    e.preventDefault();
    d.ghost.style.left = (e.clientX - d.ox) + "px"; d.ghost.style.top = (e.clientY - d.oy) + "px";
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const slot = under && under.closest ? under.closest(".t5slot") : null;
    const pool = under && under.closest ? under.closest("#t5pool") : null;
    $$("#guessGame .t5slot").forEach(el => el.classList.toggle("over", el === slot && !el.classList.contains("pinned")));
    const poolEl = $("#t5pool"); if (poolEl) poolEl.classList.toggle("over", !!pool);
  }, { passive: false });
  const end = e => {
    if (!d || e.pointerId !== d.id) return;
    const cur = d; d = null;
    $$("#guessGame .t5slot").forEach(el => el.classList.remove("over"));
    const poolEl = $("#t5pool"); if (poolEl) poolEl.classList.remove("over");
    if (!cur.moved) { t5TapChip(cur.key); return; }
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 400);
    if (cur.ghost) cur.ghost.remove();
    cur.chip.classList.remove("dragging");
    if (e.type !== "pointerup") return;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const slot = under && under.closest ? under.closest(".t5slot") : null;
    const pool = under && under.closest ? under.closest("#t5pool") : null;
    if (slot && !slot.classList.contains("pinned")) t5Place(cur.key, +slot.dataset.slot);
    else if (pool) t5Place(cur.key, null);
    else paintTop5();
  };
  addEventListener("pointerup", end);
  addEventListener("pointercancel", end);
  root.addEventListener("click", e => {
    if (suppressClick) { suppressClick = false; return; }
    if (e.target.closest(".t5chip")) return;
    const slot = e.target.closest(".t5slot");
    if (slot) { t5TapSlot(+slot.dataset.slot); return; }
    if (e.target.closest("#t5pool")) t5TapPool();
  });
  root.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const chip = e.target.closest(".t5chip");
    if (chip && !chip.classList.contains("pinned")) { e.preventDefault(); t5TapChip(chip.dataset.key); return; }
    const slot = e.target.closest(".t5slot");
    if (!slot) return;
    e.preventDefault();
    t5TapSlot(+slot.dataset.slot);
  });
})();
window.RankdTop5 = { slotsOf, score: scoreTop5, decoy: resolveDecoy, line: decoyLine };

// ================================================================ v11: win celebrations (tiers by attempt number)
// Rank it:  solved on try 1 = "explosive", try 2 = "big", 3+ (or not solved) = none (plain result, ads as normal).
// Top 5:    all 5 found with 0 misses = "explosive", 1-2 misses = "big", otherwise none.
// prefers-reduced-motion: no confetti / shake / flash, just a short fade-in banner.
// v12.2: "Racist!" / "Xenophobe!" flash (50/50) — Rank it only, every card wrong, countries or demographics/identity groups.
function isIdentityRank(p) {
  if (!p || p.type !== "rank" || !p.items || !p.items.length) return false;
  const flag = e => /[\u{1F1E6}-\u{1F1FF}]{2}/u.test(e || "");
  if (p.items.filter(it => flag(it.emoji)).length >= Math.ceil(p.items.length * 0.75)) return true;
  if (/race|ethn|relig|gender|sex-offense|immigrant|nationality|jewish|ipsos|lgbt|bisexual|men-|women-|gcse|alevel|grad-earnings|home-ownership|hourly-pay|smoking-ethnicity|he-entry|convictions-nationality|trump-2024/i.test(p.id || "")) return true;
  const blob = p.items.map(it => it.name).join(" ");
  return /\b(men|women|Black|White|Hispanic|Asian|Christian|Jewish|Muslim|Catholic|Protestant|Mixed|Chinese|Indian|Buddhist|Hindu)\b/i.test(blob);
}
function winTier(r) {
  if (r.type === "rank" || r.type === "match" || r.type === "tier" || r.type === "name" || (r.type === "top5" && r.attempts)) return !r.solved ? null : r.tries === 1 ? "explosive" : r.tries === 2 ? "big" : null;
  const p = state.puzzle; if (!r.guesses || hitsOf(p, r) < 5) return null;
  const m = missesOf(p, r); return m === 0 ? "explosive" : m <= 2 ? "big" : null;
}
const Fx = (() => {
  const TXT = { rank: { explosive: "PERFECT!", big: "BRILLIANT!", normal: "Nice!", racist: "Racist!", ignorant: "Ignorant!" }, top5: { explosive: "FLAWLESS!", big: "BRILLIANT!", normal: "Nice!", ignorant: "Ignorant!" }, name: { explosive: "PERFECT!", big: "BRILLIANT!", normal: "Nice!", ignorant: "Ignorant!" } };
  // v12.2 racist uses the same motion/timing as big (Brilliant!)
  const CFG = { explosive: { n: 220, speed: 15, dur: 2600, spread: Math.PI * 2 }, big: { n: 110, speed: 11, dur: 2100, spread: Math.PI * 2 }, racist: { n: 110, speed: 11, dur: 2100, spread: Math.PI * 2 }, ignorant: { n: 40, speed: 7.5, dur: 1800, spread: Math.PI * 1.1 }, normal: { n: 40, speed: 7.5, dur: 1500, spread: Math.PI * 1.1 } };
  const COLORS = ["#FFE48A", "#16B364", "#EF4A4F", "#FFFFFF", "#8EA2FF", "#F5B82E", "#FF7AC6"];
  const api = { history: [], last: null };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  api.celebrate = (tier, kind) => {
    const red = reduced(), ev = { tier, kind, reduced: red, at: Date.now() }; api.last = ev; api.history.push(ev);
    document.querySelectorAll(".fx-layer").forEach(n => n.remove());
    const layer = document.createElement("div"); layer.className = `fx-layer fx-${tier}${red ? " fx-reduced" : ""}`; layer.setAttribute("aria-hidden", "true");
    // Ignorant! is the all-wrong opening shout. Racist! / Xenophobe! stay the identity aside.
    const label = tier === "ignorant" ? "Ignorant!" : tier === "racist" ? (Math.random() < 0.5 ? "Racist!" : "Xenophobe!") : TXT[kind][tier];
    ev.text = label;
    const banner = document.createElement("div"); banner.className = "fx-banner"; banner.textContent = label; layer.appendChild(banner);
    document.body.appendChild(layer);
    const total = red ? 1400 : CFG[tier].dur;
    if (!red) {
      if (tier === "explosive") { const fl = document.createElement("div"); fl.className = "fx-flash"; layer.appendChild(fl); document.body.classList.remove("fx-shake"); void document.body.offsetWidth; document.body.classList.add("fx-shake"); ev.shake = true; setTimeout(() => document.body.classList.remove("fx-shake"), 700); }
      if (tier === "big" || tier === "racist") { const h = $("#hero"); h.classList.remove("fx-bump"); void h.offsetWidth; h.classList.add("fx-bump"); setTimeout(() => h.classList.remove("fx-bump"), 700); }
      confetti(layer, tier);
    }
    setTimeout(() => layer.remove(), total + 200);
    return ev;
  };
  function confetti(layer, tier) {
    const c = CFG[tier], cv = document.createElement("canvas"), dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.className = "fx-canvas"; layer.appendChild(cv);
    const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
    const hb = $("#hero").getBoundingClientRect(), ox = W / 2, oy = Math.max(60, Math.min(H * .55, hb.top + hb.height * .45));
    const origins = (tier === "big" || tier === "racist") ? [[0, H * .7, -Math.PI / 3.2], [W, H * .7, -Math.PI + Math.PI / 3.2]] : tier === "normal" ? [[ox, Math.min(H * .8, hb.bottom - 40), -Math.PI / 2]] : [[ox, oy, 0]];
    const P = [];
    for (let k = 0; k < c.n; k++) { const [x, y, dir] = origins[k % origins.length];
      const a = tier === "explosive" ? Math.random() * c.spread : dir + (Math.random() - .5) * ((tier === "big" || tier === "racist") ? .9 : c.spread), v = c.speed * (.45 + Math.random() * .75);
      P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (tier === "explosive" ? 3 : 0), r: 3 + Math.random() * (tier === "explosive" ? 6 : 4), rot: Math.random() * 6, vr: (Math.random() - .5) * .4, col: COLORS[k % COLORS.length], sh: k % 3 }); }
    const t0 = performance.now();
    (function frame(t) {
      const e = t - t0; ctx.clearRect(0, 0, W, H);
      for (const q of P) { q.vy += .28; q.vx *= .985; q.vy *= .985; q.x += q.vx; q.y += q.vy; q.rot += q.vr;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - e / c.dur); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.col;
        if (q.sh === 0) ctx.fillRect(-q.r, -q.r / 2, q.r * 2, q.r); else if (q.sh === 1) { ctx.beginPath(); ctx.arc(0, 0, q.r * .6, 0, 7); ctx.fill(); } else { ctx.beginPath(); ctx.moveTo(0, -q.r); ctx.lineTo(q.r, q.r); ctx.lineTo(-q.r, q.r); ctx.fill(); }
        ctx.restore(); }
      if (e < c.dur && cv.isConnected) requestAnimationFrame(frame);
    })(t0);
  }
  return api;
})();
window.RankdFx = Fx; window.RankdWinTier = r => winTier(r); window.RankdIsIdentityRank = isIdentityRank;

// ================================================================ after submit: interstitial (non-daily only)
// v11: no interstitial after a celebrated win (Rank it solved in 1-2 tries, Top 5 all found with <= 2 misses).
function afterSubmit(reveal, tier) {
  const why = !Ads.allowed() ? "streamer" : (isToday() && !CONFIG.interstitialOnDaily) ? "daily" : tier ? "win:" + tier : !AdSense.interstitialOk() ? "noad:" + AdSense.mode : null;
  Ads.decisions.push({ puzzle: state.puzzle.id, mode: state.mode, tier: tier || null, show: !why, reason: why || "shown", at: Date.now() });
  if (why) { reveal(); return; }
  showInterstitial(reveal);
}
// v12.2: Practice "next puzzle" (🎲 New / the Practice tab) while the current random puzzle is unfinished -> interstitial
// first (same rules: never in streamer mode, needs an interstitial ad unit on the live site). Finished puzzles go straight on.
function practiceNext() {
  if (state.busy) return;
  if (state.mode !== "practice" || !state.puzzle || isDone(getResult())) return goPractice();
  const why = !Ads.allowed() ? "streamer" : !AdSense.interstitialOk() ? "noad:" + AdSense.mode : null;
  Ads.decisions.push({ puzzle: state.puzzle.id, mode: "practice-skip", tier: null, show: !why, reason: why || "shown", at: Date.now() });
  if (why) return goPractice();
  showInterstitial(() => goPractice(), true);
}
function showInterstitial(done, skipNext) {   // skipNext (v12.2): shown before the next Practice puzzle, not before a result
  const ov = $("#interstitial"), btn = $("#skipAd"); let s = CONFIG.interstitialSeconds; state.busy = true;
  $("#interNote").textContent = skipNext ? "Your next puzzle is ready" : "Your result is ready";
  ov.classList.remove("hidden"); btn.disabled = true; btn.textContent = `Skip in ${s}`;
  const t = setInterval(() => { s--; if (s <= 0) { clearInterval(t); btn.disabled = false; btn.textContent = skipNext ? "Next puzzle ✕" : "See result ✕"; } else btn.textContent = `Skip in ${s}`; }, 1000);
  let closed = false; const close = () => { if (closed) return; closed = true; clearInterval(t); ov.classList.add("hidden"); state.busy = false; done(); };
  btn.onclick = () => { if (!btn.disabled) close(); };
  // v12.1: AdSense creative (live mode). No fill -> close at once and go straight to the result (recorded on the decision).
  AdSense.interstitial(() => { const d = Ads.last(); if (d) d.unfilled = true; close(); });
}

// ================================================================ result panel
const EMO = { good: "🟩", near: "🟨", bad: "🟥", miss: "⬜" };
const rankGrid = r => (r.attempts || []).map(a => a.marks.map(m => EMO[m]).join("")).join("\n");
function guessSquares(res) {
  if (!res) return "";
  if (res.type === "rank" || res.type === "match" || res.type === "tier" || (res.type === "top5" && res.attempts && res.attempts.length)) return rankGrid(res);
  return (res.marks || []).map(m => EMO[m]).join("");
}
let pendingResultScroll = false;
function scrollResultIntoView() {
  const share = document.querySelector("#result .share-row");
  if (!share) return;
  syncFabPad();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  share.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
}
function settleResultScroll() {
  if (!pendingResultScroll) return;
  pendingResultScroll = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const after = () => { syncFabPad(); parkFab(); };
  if (reduced) requestAnimationFrame(() => { scrollResultIntoView(); requestAnimationFrame(after); });
  else setTimeout(() => { scrollResultIntoView(); setTimeout(after, 750); }, 650);
}
function showResult(res, opts) {
  const p = state.puzzle;
  pendingResultScroll = !!(opts && opts.scroll);
  if (res.type === "match") {
    const max = CONFIG.rankMaxTries, nn = p.people.length;
    $("#scoreBig").textContent = res.solved ? `${res.tries}/${max}` : `X/${max}`;
    $("#scoreTitle").textContent = ratingShout(res) || (res.solved ? (res.tries === 1 ? `All ${nn} matched on the first try! 🎯` : `Matched all ${nn} in ${res.tries} tries`) : `${res.points}/${nn} matched. Tricky one 😅`);
    $("#answerBox").innerHTML = matchAnswers(p, res); $("#answerBox").classList.remove("hidden");
  } else if (res.type === "rank" || res.type === "tier" || (res.type === "top5" && res.attempts && res.attempts.length)) {
    const max = CONFIG.rankMaxTries;
    $("#scoreBig").textContent = res.solved ? `${res.tries}/${max}` : `X/${max}`;
    $("#scoreTitle").textContent = ratingShout(res) || (res.solved ? (res.tries === 1 ? "Perfect first try! 🎯" : res.tries <= 2 ? `Sharp! Solved in ${res.tries} tries` : `Solved in ${res.tries} tries`) : "Tricky one 😅");
    if (res.type === "top5") {
      const line = decoyLine(p);
      $("#answerBox").innerHTML = line ? `<p class="t5out-line">${esc(line)}</p>` : "";
      $("#answerBox").classList.toggle("hidden", !line);
    } else $("#answerBox").classList.add("hidden");
  } else if (res.type === "name") {
    const max = CONFIG.rankMaxTries;
    $("#scoreBig").textContent = res.solved ? `${res.tries}/${max}` : `X/${max}`;
    $("#scoreTitle").textContent = ratingShout(res) || (res.solved ? (res.tries === 1 ? "Perfect first try! 🎯" : `Named in ${res.tries} tries`) : "Out of tries 😅");
    $("#answerBox").innerHTML = window.RankdName ? RankdName.revealHtml(p, res) : "";
    $("#answerBox").classList.remove("hidden");
    const form = $("#nameForm"); if (form) form.classList.add("hidden");
    if (window.RankdName) RankdName.paintRarity(p, null);
  } else {
    const h = hitsOf(p, res), m = missesOf(p, res), avg = avgRank(p, res);
    $("#scoreBig").textContent = `${h}/5`;
    $("#scoreTitle").textContent = ratingShout(res) || ((h >= 5 ? `Found all 5 with ${plural(m, "miss")}! 🖐️` : h >= 3 ? `Found ${h}/5. Nice!` : `Found ${h}/5`) + (avg ? ` · avg rank #${avg}` : ""));
    const guessed = new Set(res.guesses);
    $("#answerBox").innerHTML = `<p class="avgrank" id="avgRank">Closeness: your ${plural(res.guesses.length, "guess")} averaged world rank <b>#${avg}</b> of ${p.countries.length} (lower = closer)</p>` +
      `<h3>The top 5 of ${p.countries.length} countries · ${esc(p.unit)}</h3>` + slotsOf(p).map((s, i) => { const f = slotFound(p, s, guessed);
      return `<div class="top-row ${f ? "ans" : ""}${s.tied ? " tied" : ""}"><span class="tr">#${i + 1}</span><span>${s.group.map(c => esc(c.emoji)).join("")}</span>
      <span>${s.group.map(c => esc(c.name) + (guessed.has(cKey(c)) ? " ✓" : "")).join(" = ")}${s.tied ? `<small class="tienote"> tied at ${fmt1(s.value)}: either one counted</small>` : ""}</span><span class="tv">${fmt1(s.value)}${unitAside(p)}</span></div>`; }).join("");
    $("#answerBox").classList.remove("hidden");
  }
  $("#fact").innerHTML = p.fact ? `<b>Facts:</b> ${esc(p.fact)}` : p.caveat ? `⚠️ ${esc(p.caveat)}` : ""; $("#fact").classList.toggle("hidden", !p.fact && !p.caveat);
  const sup = $("#support"); if (p.support) { sup.innerHTML = `💙 Struggling, or worried about someone? Free, confidential support is available in most countries: <a href="${esc(p.support)}" target="_blank" rel="noopener">${esc(p.support.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))} ↗</a>`; sup.classList.remove("hidden"); } else sup.classList.add("hidden");
  $("#sourceName").textContent = p.source || "source";
  const a = $("#sourceLink"); if (p.sourceUrl) { a.href = p.sourceUrl; a.classList.remove("hidden"); } else a.classList.add("hidden");
  $("#nextBtn").textContent = state.mode === "preview" ? "Back to Loading Zone →" : state.mode === "practice" ? "🎲 New random puzzle →" : state.mode === "all" ? "Next puzzle →" : state.mode === "archive" ? "Back to archive →" : "More puzzles →";
  renderYouVs(p, null, res);
  renderHeadToHead(res);
  renderCommunity(p, res);
  maybeShowCrossPromo();
  // Lock controls are done once the share block is on screen — don't leave one floating over it.
  ["#submitBtn", "#matchSubmit", "#tierSubmit", "#t5Submit", "#nameBtn"].forEach(id => { const b = $(id); if (b) b.parentElement.classList.add("hidden"); });
  $("#result").classList.remove("hidden"); showFab(true); syncPlaying();
}
function communityCrow(label, pct, emoji) {
  const v = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const text = `${emoji ? emoji + " " : ""}${label || ""}`;
  return `<div class="crow"><span class="cn" title="${esc(text)}">${emoji ? esc(emoji) + " " : ""}${esc(label)}</span><span class="cb" aria-hidden="true"><i style="width:${v}%"></i></span><span class="cp">${v}%</span></div>`;
}
function communityBars(block) {
  if (!block) return [];
  const list = Array.isArray(block) ? block : (Array.isArray(block.bars) ? block.bars : (Array.isArray(block.firstGuess) ? block.firstGuess : []));
  return list.filter(bar => bar && (bar.name || bar.label));
}
function communityBarLabel(p, bar) {
  if (bar.label) return String(bar.label);
  if (bar.slot && bar.name) return `#${bar.slot} ${bar.name}`;
  if (p.type === "tier" && bar.tier && bar.name) return `${bar.name} → ${bar.tier}`;
  if (p.type === "match" && bar.matchedTo && bar.name) return `${bar.name} → ${bar.matchedTo}`;
  return bar.name || "";
}
function communityEmojiOf(p, name) {
  const pools = [].concat(p.items || [], p.people || [], p.countries || []);
  const hit = pools.find(x => x && x.name === name);
  return (hit && hit.emoji) || "";
}
function flagEmoji(code) {
  const c = String(code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return [...c].map(ch => String.fromCodePoint(0x1F1E6 + ch.charCodeAt(0) - 65)).join("");
}
function communityFlagHtml(p, name, barEmoji) {
  const pools = [].concat(p.items || [], p.people || [], p.countries || []);
  const hit = pools.find(x => x && x.name === name);
  // Puzzle data wins, so a blank flag on the entry also replaces a stale stats emoji.
  if (hit && hit.flagImg && blankFlagImg(hit.flagImg)) return flagHtml(hit);
  if (hit && hit.emoji) return esc(hit.emoji);
  return barEmoji ? esc(barEmoji) : "";
}
function communityOrderList(bars, p) {
  if (!bars.length) return "";
  if ((p.type === "name") || (p.type === "top5" && !bars.some(bar => bar.slot))) {
    const bar = p.type === "name" ? bars.slice().sort((a, b) => (Number(b.pct) || 0) - (Number(a.pct) || 0))[0] : bars[0];
    const flag = communityFlagHtml(p, bar.name, bar.emoji || communityEmojiOf(p, bar.name));
    const name = bar.name || bar.label || "";
    const note = p.type === "name" ? "The country most players named" : "The first country most players named";
    return `<div class="consensus-hero"><span class="fl">${flag}</span><span class="nm">${esc(name)}</span></div><p class="community-note">${note}</p>`;
  }
  const ranked = p.type === "rank" || bars.some(bar => bar.slot);
  const items = bars.map(bar => {
    const flag = communityFlagHtml(p, bar.name, bar.emoji || communityEmojiOf(p, bar.name));
    const text = ranked ? (bar.name || communityBarLabel(p, bar)) : communityBarLabel(p, bar);
    const pos = ranked && bar.slot ? `<span class="pos">${bar.slot}</span>` : "";
    return `<li>${pos}<span class="fl">${flag}</span><span class="nm">${esc(text)}</span></li>`;
  }).join("");
  const tag = ranked ? "ol" : "ul";
  return `<${tag} class="consensus">${items}</${tag}>`;
}
function fillCommunitySeed(data, p) {
  const seed = window.RankdSeed;
  // Only puzzles still on the seed get synthetic standings. A live puzzle
  // (seeded: false) keeps whatever the snapshot computed, including an empty board.
  if (!data || !p || !seed || data.seeded === false) return data;
  const type = p.type || data.type || "rank";
  const standing = data.standing;
  // Old Top 5 seeds counted guesses (5–15). The slot game is five tries, same scale as Rank it.
  const staleTop5 = type === "top5" && standing && standing.byTries && (
    Object.keys(standing.byTries).some(k => Number(k) > 5) || Object.keys(standing.failed || {}).some(k => Number(k) > 5)
  );
  if (staleTop5 || !Array.isArray(data.countryBoard)) data.countryBoard = seed.countryBoard(p.id, type);
  if (staleTop5 || !standing || !standing.byTries || !standing.failed || standing.avgTries == null) {
    const firstOf = type === "top5" ? 5 : type === "name" ? 1 : (p.items || p.people || []).length;
    data.standing = seed.standingBlock(p.id, Number(data.players) || 0, type, firstOf);
  }
  return data;
}
function triesLabel(n, top5, digits) {
  const num = Number(n);
  const text = digits ? num.toFixed(digits) : String(Math.round(num));
  const one = Math.abs(Number(text) - 1) < 0.05;
  const unit = top5 ? (one ? "guess" : "guesses") : (one ? "try" : "tries");
  return `${text} ${unit}`;
}
function communityCountrySection(data, code, p) {
  if (!code) return "";
  const bucket = data.firstGuessByCountry && data.firstGuessByCountry[code];
  const players = bucket ? Number(bucket.players) || 0 : 0;
  // One seeded play is enough to show the ordering. The leaderboard cutoff is separate.
  const bars = players >= 1 ? communityBars(bucket) : [];
  if (!bars.length) return "";
  return `<h3 class="community-sec">What players in ${esc(regionName(code))} thought</h3>` + communityOrderList(bars, p);
}
function communityLeaderboard(data, p) {
  const seed = window.RankdSeed;
  const rows = seed ? seed.topCountries(data.countryBoard, COMMUNITY_MIN_COUNTRY, 5) : [];
  const note = "Fewest tries on this puzzle";
  if (!rows.length) return `<h3 class="community-sec">Top countries</h3><p class="community-empty">Not enough plays from any one country yet.</p>`;
  const items = rows.map(row => {
    return `<li><span class="fl">${esc(flagEmoji(row.code))}</span><span class="nm">${esc(regionName(row.code))}</span><span class="meta">${esc(triesLabel(row.avgTries, false, 1))}</span></li>`;
  }).join("");
  return `<h3 class="community-sec">Top countries</h3><p class="community-note">${esc(note)}</p><ol class="country-board">${items}</ol>`;
}
/* Crowd on the results podium. Looks are a deterministic shuffle of the puzzle id
   plus the result, so a re-render doesn't reshuffle gender, skin, or hair.
   Gender is a silhouette read (short hair + shirt and pants, or longer hair + a dress).
   Race is skin tone plus hair texture and color only — the face is the same on everyone. */
const PF_SKINS = ["#FFE0CC", "#F0B48A", "#C9845A", "#A0623C", "#6B3E24", "#3A2214"];
const PF_SHIRTS = ["#3F6E9A", "#C2544C", "#3C7A68", "#C4963A", "#6A5B94", "#4E7A4A", "#A85B78", "#5C6A7A"];
const PF_PANTS = ["#2C3442", "#3A4252", "#2A3140", "#343E4C"];
const PF_HAIR_M = [
  { style: "crop", color: "#1A1A1A" },
  { style: "curls", color: "#1C140F" },
  { style: "wavy", color: "#6B4423" },
  { style: "crop", color: "#E6C25A" },
  { style: "crop", color: "#E04B32" },
  { style: "wavy", color: "#1A1A1A" },
  { style: "curls", color: "#4A2E1B" },
  { style: "crop", color: "#3D2918" },
];
const PF_HAIR_F = [
  { style: "long", color: "#1A1A1A" },
  { style: "afro", color: "#1C140F" },
  { style: "waves", color: "#6B4423" },
  { style: "pony", color: "#E6C25A" },
  { style: "long", color: "#E04B32" },
  { style: "pony", color: "#1A1A1A" },
  { style: "waves", color: "#8C3E22" },
  { style: "afro", color: "#3A2418" },
  { style: "long", color: "#E6C25A" },
  { style: "waves", color: "#E04B32" },
];
function pfShuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function pfBalanced(n, rand) {
  const half = Math.floor(n / 2);
  const arr = [];
  for (let i = 0; i < half; i++) arr.push("f", "m");
  if (arr.length < n) arr.push(rand() < 0.5 ? "f" : "m");
  return pfShuffle(arr, rand);
}
function pfCycle(items, n, rand) {
  const out = [];
  let prev = null;
  while (out.length < n) {
    const batch = pfShuffle(items, rand);
    if (prev != null && batch[0] === prev && batch.length > 1) batch.push(batch.shift());
    for (let i = 0; i < batch.length && out.length < n; i++) out.push(batch[i]);
    prev = out[out.length - 1];
  }
  return out;
}
function pfCast(n, seed) {
  const rand = rng(String(seed || "ranki"));
  const count = Math.max(1, Math.round(Number(n) || 1));
  // One look per platform. A second "front" cast used to stand on the same step.
  const genders = pfBalanced(count, rand);
  const skins = pfCycle(PF_SKINS, count, rand);
  const shirts = pfCycle(PF_SHIRTS, count, rand);
  const pants = pfCycle(PF_PANTS, count, rand);
  const hairM = pfCycle(PF_HAIR_M, count, rand);
  const hairF = pfCycle(PF_HAIR_F, count, rand);
  let mi = 0, fi = 0;
  const looks = [];
  for (let i = 0; i < count; i++) {
    const g = genders[i];
    const hair = g === "f" ? hairF[fi++] : hairM[mi++];
    const waveRoll = rand();
    looks.push({
      g: g,
      skin: skins[i],
      hair: hair.style,
      hc: hair.color,
      shirt: shirts[i],
      pants: pants[i],
      wave: waveRoll < 0.16 ? "both" : waveRoll < 0.58 ? "l" : "r",
      bobDur: (2.15 + rand() * 1.25).toFixed(2) + "s",
      bobDelay: (-rand() * 2.1).toFixed(2) + "s",
      hopDur: (3.5 + rand() * 2.6).toFixed(2) + "s",
      hopPhase: (rand() * 2.4).toFixed(2) + "s",
      hopY: "-" + (5 + Math.floor(rand() * 4)) + "px",
      waveDur: (5.4 + rand() * 2.8).toFixed(2) + "s",
      waveDelay: (0.4 + rand() * 3.2).toFixed(2) + "s",
    });
  }
  for (let i = 1; i < looks.length; i++) {
    if (looks[i].hc === looks[i - 1].hc) {
      for (let j = i + 1; j < looks.length; j++) {
        if (looks[j].g === looks[i].g && looks[j].hc !== looks[i - 1].hc) {
          const style = looks[i].hair, color = looks[i].hc;
          looks[i].hair = looks[j].hair; looks[i].hc = looks[j].hc;
          looks[j].hair = style; looks[j].hc = color;
          break;
        }
      }
    }
  }
  return looks;
}
function pfInk(skin) {
  const h = String(skin || "").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const y = (r * 299 + g * 587 + b * 114) / 1000;
  return y < 150 ? "rgba(255,246,240,.92)" : "rgba(55,36,32,.85)";
}
function pfEl(name, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}
function pfHairBack(look) {
  const g = pfEl("g", { class: "pf-hair" });
  const s = look.hair;
  if (s === "long" || s === "waves") {
    const sway = pfEl("g", { class: "pf-hair-tail" });
    if (s === "long") {
      sway.appendChild(pfEl("path", { d: "M11.4 12 C7.2 20 6.4 32 9.6 44 C12.8 33 13.6 22 15.4 12 Z" }));
      sway.appendChild(pfEl("path", { d: "M28.6 12 C32.8 20 33.6 32 30.4 44 C27.2 33 26.4 22 24.6 12 Z" }));
    } else {
      sway.appendChild(pfEl("path", { d: "M12 13 C7.5 20 13 27 8.6 36 C12.4 29 12 21 16 14 Z" }));
      sway.appendChild(pfEl("path", { d: "M28 13 C32.5 20 27 27 31.4 36 C27.6 29 28 21 24 14 Z" }));
    }
    g.appendChild(sway);
  } else if (s === "pony") {
    const sway = pfEl("g", { class: "pf-hair-tail" });
    sway.appendChild(pfEl("path", { d: "M22.5 8.5 C31 10 34.5 20 31 36 C27 24 25.5 14 22 10 Z" }));
    sway.appendChild(pfEl("circle", { cx: "27.2", cy: "11.2", r: "2.7" }));
    sway.appendChild(pfEl("circle", { cx: "28.4", cy: "15.2", r: "1.35", class: "pf-cloth" }));
    g.appendChild(sway);
  } else if (s === "afro") {
    [[20, 7.2, 6.4], [12.2, 12.4, 5.1], [27.8, 12.4, 5.1], [14.6, 6.4, 4.1], [25.4, 6.4, 4.1], [20, 2.8, 3.3], [10.4, 17.5, 3.5], [29.6, 17.5, 3.5]].forEach(p => {
      g.appendChild(pfEl("circle", { cx: String(p[0]), cy: String(p[1]), r: String(p[2]) }));
    });
  } else if (s === "curls") {
    [[20, 6.6, 4.4], [14.2, 10.2, 3.4], [25.8, 10.2, 3.4], [16.8, 4.8, 2.8], [23.2, 4.8, 2.8]].forEach(p => {
      g.appendChild(pfEl("circle", { cx: String(p[0]), cy: String(p[1]), r: String(p[2]) }));
    });
  }
  return g;
}
function pfHairFront(look) {
  const g = pfEl("g", { class: "pf-hair" });
  const s = look.hair;
  if (s === "wavy") {
    g.appendChild(pfEl("path", { d: "M12.2 13.2 C12 6.2 28 6.2 27.8 13.2 C24.2 10 15.8 10 12.2 13.2 Z" }));
    g.appendChild(pfEl("path", { d: "M11 12.4 C8.6 15.2 9.6 20 13 18.8 C11.2 16.6 11 13.8 11 12.4 Z" }));
  } else if (s === "curls" || s === "afro") {
    g.appendChild(pfEl("circle", { cx: "15.2", cy: "9.2", r: "2.6" }));
    g.appendChild(pfEl("circle", { cx: "20", cy: "7.6", r: "2.9" }));
    g.appendChild(pfEl("circle", { cx: "24.8", cy: "9.2", r: "2.6" }));
  } else {
    g.appendChild(pfEl("path", { d: "M12.6 12.8 C12.8 5.6 27.2 5.6 27.4 12.8 C24.2 9.8 15.8 9.8 12.6 12.8 Z" }));
  }
  return g;
}
function pfArm(side) {
  const wrap = pfEl("g", { transform: side < 0 ? "translate(11.2 23.2)" : "translate(28.8 23.2)" });
  const arm = pfEl("g", { class: "pf-arm " + (side < 0 ? "pf-arm-l" : "pf-arm-r") });
  arm.appendChild(pfEl("rect", { class: "pf-skin", x: "-2.15", y: "0", width: "4.3", height: "13.2", rx: "2.15" }));
  arm.appendChild(pfEl("rect", { class: "pf-cloth", x: "-2.45", y: "0", width: "4.9", height: "5.2", rx: "2" }));
  arm.appendChild(pfEl("circle", { class: "pf-skin", cx: "0", cy: "13.1", r: "2.15" }));
  wrap.appendChild(arm);
  return wrap;
}
function pfFace(ink) {
  const g = pfEl("g", { class: "pf-face" });
  [["17.15", "13.15"], ["22.85", "13.15"]].forEach(c => {
    g.appendChild(pfEl("circle", { cx: c[0], cy: c[1], r: "1.55", fill: "#FFF8F3" }));
    g.appendChild(pfEl("circle", { class: "pf-eye", cx: c[0], cy: c[1], r: "0.82" }));
  });
  const smile = pfEl("path", { class: "pf-smile", d: "M17.7 16.15 Q20 17.55 22.3 16.15" });
  smile.style.stroke = ink;
  g.appendChild(smile);
  return g;
}
function pfSvg(look) {
  const svg = pfEl("svg", { class: "pf-svg", viewBox: "0 0 40 58", "aria-hidden": "true" });
  const hop = pfEl("g", { class: "pf-draw" });
  hop.appendChild(pfHairBack(look));
  if (look.g === "m") {
    hop.appendChild(pfEl("rect", { class: "pf-pants", x: "13", y: "33.2", width: "6", height: "18.2", rx: "2.1" }));
    hop.appendChild(pfEl("rect", { class: "pf-pants", x: "21", y: "33.2", width: "6", height: "18.2", rx: "2.1" }));
  } else {
    hop.appendChild(pfEl("rect", { class: "pf-skin", x: "15.3", y: "43.5", width: "4", height: "8.2", rx: "1.6" }));
    hop.appendChild(pfEl("rect", { class: "pf-skin", x: "20.7", y: "43.5", width: "4", height: "8.2", rx: "1.6" }));
  }
  hop.appendChild(pfEl("rect", { class: "pf-shoe", x: "12.7", y: "50.6", width: "6.4", height: "6.6", rx: "1.5" }));
  hop.appendChild(pfEl("rect", { class: "pf-shoe", x: "20.9", y: "50.6", width: "6.4", height: "6.6", rx: "1.5" }));
  if (look.g === "f") {
    hop.appendChild(pfEl("path", { class: "pf-cloth pf-dress", d: "M13.2 22.4 H26.8 L31.4 45.6 Q20 49.4 8.6 45.6 Z" }));
  } else {
    hop.appendChild(pfEl("rect", { class: "pf-cloth pf-shirt", x: "12.2", y: "21.6", width: "15.6", height: "13", rx: "3.2" }));
    hop.appendChild(pfEl("rect", { x: "12.2", y: "31.2", width: "15.6", height: "2.5", rx: "1", fill: "#000", "fill-opacity": "0.14" }));
  }
  hop.appendChild(pfArm(-1));
  hop.appendChild(pfArm(1));
  hop.appendChild(pfEl("rect", { class: "pf-skin", x: "17.7", y: "18.4", width: "4.6", height: "5", rx: "1.5" }));
  hop.appendChild(pfEl("circle", { class: "pf-skin pf-head", cx: "20", cy: "13.2", r: "7.5" }));
  hop.appendChild(pfHairFront(look));
  hop.appendChild(pfFace(pfInk(look.skin)));
  svg.appendChild(hop);
  return svg;
}
function PlayerFigure(you, look) {
  const el = document.createElement("span");
  const cast = look || { g: "m", skin: PF_SKINS[0], hair: "crop", hc: "#1A1A1A", shirt: PF_SHIRTS[0], pants: PF_PANTS[0], wave: "r", bobDur: "2.6s", bobDelay: "0s", hopDur: "4.4s", hopPhase: "0.4s", hopY: "-6px", waveDur: "6.2s", waveDelay: "1s" };
  el.className = "player-figure " + (cast.g === "f" ? "is-f" : "is-m") + (you ? " is-you" : "") + " wave-" + cast.wave;
  el.setAttribute("aria-hidden", "true");
  el.dataset.gender = cast.g;
  el.dataset.hair = cast.hair;
  el.style.setProperty("--skin", cast.skin);
  el.style.setProperty("--hair", cast.hc);
  el.style.setProperty("--shirt", cast.shirt);
  el.style.setProperty("--pants", cast.pants);
  el.style.setProperty("--ink", pfInk(cast.skin));
  el.style.setProperty("--bob-dur", cast.bobDur);
  el.style.setProperty("--bob-delay", cast.bobDelay);
  el.style.setProperty("--hop-dur", cast.hopDur);
  el.style.setProperty("--hop-phase", cast.hopPhase);
  el.style.setProperty("--hop-y", cast.hopY);
  el.style.setProperty("--wave-dur", cast.waveDur);
  el.style.setProperty("--wave-delay", cast.waveDelay);
  const hop = document.createElement("span");
  hop.className = "pf-hop";
  const bob = document.createElement("span");
  bob.className = "pf-bob";
  bob.appendChild(pfSvg(cast));
  hop.appendChild(bob);
  el.appendChild(hop);
  if (you) {
    const marker = document.createElement("span");
    marker.className = "you-marker";
    marker.textContent = "You!";
    el.appendChild(marker);
  }
  return el;
}
function pfSparks(fig) {
  const bits = [
    ["-12px", "-18px", "-32deg", "var(--brand)", "0ms", false],
    ["-1px", "-22px", "18deg", "#F2B441", "45ms", true],
    ["12px", "-16px", "42deg", "#3CB7A4", "20ms", false],
    ["-16px", "-9px", "-18deg", "#F2B441", "70ms", true],
    ["7px", "-20px", "12deg", "var(--brand)", "30ms", false],
    ["16px", "-11px", "58deg", "#E25B45", "55ms", true],
  ];
  const hop = fig.querySelector(".pf-hop");
  if (!hop) return;
  bits.forEach(bit => {
    const spark = document.createElement("i");
    spark.className = "pf-spark" + (bit[5] ? " is-round" : "");
    spark.style.setProperty("--dx", bit[0]);
    spark.style.setProperty("--dy", bit[1]);
    spark.style.setProperty("--rot", bit[2]);
    spark.style.setProperty("--spark", bit[4]);
    spark.style.background = bit[3];
    hop.appendChild(spark);
  });
}
function renderWinnerPlatforms(castSeed, better) {
  const n = 9, center = 4;
  const seed = window.RankdSeed;
  const top = seed && seed.pedestalTopPercent ? seed.pedestalTopPercent(better == null ? 99 : better) : 1;
  const platforms = document.createElement("div");
  platforms.className = "platforms is-winner";
  platforms.setAttribute("aria-hidden", "true");
  platforms.style.setProperty("--n", "9");
  const looks = pfCast(n, castSeed || "winner");
  for (let i = 0; i < n; i++) {
    const yours = i === center;
    const col = document.createElement("div");
    col.className = "platform" + (yours ? " is-you" : "");
    col.style.setProperty("--step", String(i));
    // One figure per step. The centre step's own figure is You!.
    const fig = PlayerFigure(yours, looks[i]);
    fig.style.setProperty("--land-delay", (0.06 + Math.abs(i - center) * 0.05).toFixed(2) + "s");
    if (yours) {
      fig.classList.add("celebrate");
      fig.style.setProperty("--cheer-delay", ".85s");
      pfSparks(fig);
    } else {
      fig.classList.add("celebrate-soft", "is-cheer");
      fig.style.setProperty("--cheer-delay", (0.7 + (i % 5) * 0.07).toFixed(2) + "s");
    }
    col.appendChild(fig);
    const step = document.createElement("i");
    step.className = "platform-step";
    col.appendChild(step);
    if (yours) {
      const label = document.createElement("span");
      label.className = "platform-pct is-yours";
      label.textContent = "Top " + top + "%";
      col.appendChild(label);
    }
    platforms.appendChild(col);
  }
  return platforms;
}
function renderPlatforms(percentile, castSeed, opts) {
  if (opts && opts.winner) return renderWinnerPlatforms(castSeed, percentile);
  const seed = window.RankdSeed;
  if (!seed || percentile == null) return null;
  const pick = seed.platformCount(percentile / 100);
  const view = seed.platformWindow ? seed.platformWindow(pick.n, pick.band) : { lo: 0, hi: pick.n - 1 };
  const platforms = document.createElement("div");
  platforms.className = "platforms";
  platforms.setAttribute("aria-hidden", "true");
  platforms.style.setProperty("--n", String(view.hi - view.lo + 1));
  const soft = pick.band < Math.ceil(pick.n * 0.45);
  const topBand = pick.n - 1;
  if (pick.band !== topBand && topBand - pick.band === 1) platforms.classList.add("has-stack");
  const looks = pfCast(view.hi - view.lo + 1, castSeed || ("band" + pick.band));
  let lookI = 0;
  for (let i = view.lo; i <= view.hi; i++) {
    const yours = i === pick.band;
    const col = document.createElement("div");
    col.className = "platform" + (yours ? " is-you" : "");
    col.style.setProperty("--step", String(i));
    if (yours && topBand - i === 1) col.classList.add("pct-stack");
    // Every step gets exactly one figure. The player's own figure is You!.
    const fig = PlayerFigure(yours, looks[lookI++]);
    fig.style.setProperty("--land-delay", "calc(var(--step) * 35ms + .08s)");
    if (yours) {
      fig.classList.add(soft ? "celebrate-soft" : "celebrate");
      if (!soft) pfSparks(fig);
    }
    col.appendChild(fig);
    const step = document.createElement("i");
    step.className = "platform-step";
    col.appendChild(step);
    // The rightmost crowd step keeps the band slice. The player's step
    // uses the same number as "Better than Y%". One label when those coincide.
    if ((yours || i === topBand) && (seed.pedestalTopPercent || seed.platformTopPercent)) {
      const label = document.createElement("span");
      label.className = "platform-pct" + (yours ? " is-yours" : "");
      const pct = yours && seed.pedestalTopPercent
        ? seed.pedestalTopPercent(percentile)
        : seed.platformTopPercent(pick.n, i);
      label.textContent = "Top " + pct + "%";
      col.appendChild(label);
    }
    platforms.appendChild(col);
  }
  return platforms;
}
function renderYouVs(p, data, res) {
  const el = $("#youVs");
  if (!el) return;
  const mine = resultCard(p, res);
  const squares = guessSquares(res);
  if (!mine && !squares) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  const block = data && data.standing;
  const hasStanding = !!(mine && block && block.avgTries != null);
  const top5 = !!(mine && mine.kind === "top5");
  const seedApi = window.RankdSeed;
  let better = hasStanding && block.byTries && seedApi ? seedApi.betterThan(block, mine.tries, mine.accuracy, mine.solved) : null;
  // A perfect first Lock is its own podium, even before a crowd exists.
  // The caption and the pedestal both use 99, so the line reads Top 1% and
  // "Better than 99% of players".
  const perfectFirst = !!(mine && mine.kind !== "top5" && mine.solved && mine.tries === 1);
  if (perfectFirst) better = 99;
  el.classList.remove("hidden");
  el.innerHTML = "";
  if (squares) {
    const grid = document.createElement("div");
    grid.className = "emoji-row";
    grid.id = "emojiRow";
    grid.textContent = squares;
    el.appendChild(grid);
  }
  if (!mine) return;
  const pair = document.createElement("div");
  pair.className = "you-vs-pair";
  const avgTries = hasStanding ? `<span class="avg">${esc("avg " + triesLabel(block.avgTries, top5, 1))}</span>` : "";
  pair.innerHTML = `<div class="you-vs-main"><b>${esc(triesLabel(mine.tries, top5))}</b><div class="acc-line">Accuracy ${mine.accuracy} <span class="tip-wrap"><button type="button" class="tip-btn" aria-expanded="false" aria-label="How accuracy is calculated">?</button><span class="tip-pop" role="tooltip">${esc(mine.tip)}</span></span></div></div>${avgTries}`;
  el.appendChild(pair);
  if (hasStanding) {
    const named = mine.kind === "name";
    const yoursFirst = top5
      ? (mine.firstCorrect ? "First guess in the top 5" : "First guess missed")
      : named
        ? (mine.firstCorrect ? "Named it first try" : "First guess missed")
        : `${mine.firstCorrect}/${mine.firstOf} correct first guess`;
    const scaled = !top5 && !named && seedApi && seedApi.scaleAvgFirst
      ? seedApi.scaleAvgFirst(block.avgFirst, block.firstOf, mine.firstOf)
      : null;
    const avgFirst = top5
      ? `${Math.round(Number(block.avgFirst) * 100)}% hit first`
      : named
        ? `${Math.round(Number(block.avgFirst) / (Number(block.firstOf) || 1) * 100)}% named it first`
        : `avg ${(scaled ? scaled.avg : Number(block.avgFirst)).toFixed(1)}/${scaled ? scaled.firstOf : (block.firstOf || mine.firstOf)}`;
    const pair2 = document.createElement("div");
    pair2.className = "you-vs-pair";
    pair2.innerHTML = `<b>${esc(yoursFirst)}</b><span class="avg">${esc(avgFirst)}</span>`;
    el.appendChild(pair2);
  }
  const castSeed = p.id + "|" + mine.tries + "|" + mine.accuracy + "|" + (mine.solved ? 1 : 0);
  const platforms = perfectFirst
    ? renderPlatforms(better == null ? 99 : better, castSeed, { winner: true })
    : (better == null ? null : renderPlatforms(better, castSeed));
  if (platforms) {
    el.appendChild(platforms);
    if (better != null) {
      const note = document.createElement("p");
      note.className = "platforms-caption";
      note.textContent = `Better than ${better}% of players`;
      el.appendChild(note);
    }
  }
  const wrap = el.querySelector(".tip-wrap");
  const btn = el.querySelector(".tip-btn");
  if (btn && wrap) btn.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const open = wrap.classList.toggle("open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
}
if (!document.documentElement.dataset.accTip) {
  document.documentElement.dataset.accTip = "1";
  document.addEventListener("click", e => {
    document.querySelectorAll(".tip-wrap.open").forEach(wrap => {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove("open");
        const btn = wrap.querySelector(".tip-btn");
        if (btn) btn.setAttribute("aria-expanded", "false");
      }
    });
  });
}
async function renderCommunity(p, res) {
  const wrap = document.querySelector(".community"), body = $("#communityBody"), badge = $("#communityBadge");
  const headLabel = wrap && wrap.querySelector(".community-head > span:first-child");
  // Practice doesn't count toward community compare
  if (state.mode === "practice") {
    if (wrap) wrap.classList.add("hidden");
    renderYouVs(p, null, res);
    scheduleFit();
    settleResultScroll();
    return;
  }
  if (wrap) wrap.classList.remove("hidden");
  if (wrap) track("compare_viewed", { mode: state.mode, puzzle_type: p && p.type });
  let data = null, countryCode = null;
  try {
    [data, countryCode] = await Promise.all([
      CommunityStats.fetch(p.id, state.dateKey).catch(() => null),
      ViewerGeo.country().catch(() => null),
    ]);
  } catch { data = null; countryCode = null; }
  if (!state.puzzle || state.puzzle.id !== p.id) { pendingResultScroll = false; scheduleFit(); return; }
  if (!data && p.type === "name" && window.RankdName && RankdName.seedSnapshot) data = RankdName.seedSnapshot(p);
  if (!data) {
    badge.textContent = "Coming soon";
    if (headLabel) headLabel.textContent = "What most players thought";
    body.innerHTML = `<p class="community-empty">No community snapshot for this puzzle yet.</p>`;
    renderYouVs(p, null, res || getResult());
    scheduleFit();
    settleResultScroll();
    return;
  }
  fillCommunitySeed(data, p);
  const n = Number(data.players) || 0;
  badge.textContent = data.seeded ? `Early data · ${n.toLocaleString()} players` : `${n.toLocaleString()} players`;
  badge.title = data.seeded ? "Seeded snapshot until live aggregates exist" : "";
  const worldBlock = data.firstGuessWorld || (p.type === "top5" && data.firstGuess ? { bars: data.firstGuess, players: n } : null);
  const worldBars = communityBars(worldBlock);
  if (headLabel) headLabel.textContent = "What most players thought";
  let html = "";
  if (worldBars.length) {
    html += communityOrderList(worldBars, p);
    html += communityCountrySection(data, countryCode, p);
  } else html += `<p class="community-empty">No first guesses for this puzzle yet.</p>`;
  html += communityLeaderboard(data, p);
  body.innerHTML = html;
  if (p.type === "name" && window.RankdName) RankdName.paintRarity(p, data);
  renderYouVs(p, data, res || getResult());
  scheduleFit();
  settleResultScroll();
}
window.RankdCommunity = {
  row: communityPlayRow,
  country: () => ViewerGeo.country(),
  minCountryPlayers: COMMUNITY_MIN_COUNTRY,
  async preview(puzzleId, mode) {
    const p = (typeof PUZZLES !== "undefined" ? PUZZLES : []).find(x => x.id === puzzleId);
    if (!p) return null;
    if (mode) state.mode = mode;
    state.puzzle = p;
    if (!state.dateKey) state.dateKey = todayKey();
    const res = { type: p.type, solved: false, tries: 2, won: false, hits: 0, misses: 0, avgRank: null, guesses: [], marks: [], attempts: [] };
    if (p.type === "match" && p.people) res.attempts = [{ assign: p.people.map((_, i) => i), marks: p.people.map(() => "bad") }];
    showResult(res);
    return true;
  },
};

// ================================================================ stats (today's daily only)
function recordStats(res) {
  const s = load(LS.stats, { played: 0, wins: 0, streak: 0, best: 0, lastDay: null, dist: {} });
  const dn = dayNumber(state.dateKey); if (s.lastDay === dn) return;
  s.streak = s.lastDay === dn - 1 ? s.streak + 1 : 1; s.best = Math.max(s.best, s.streak); s.lastDay = dn; s.played++;
  const win = res.type === "rank" || res.type === "match" || res.type === "tier" || res.type === "name" || (res.type === "top5" && res.attempts) ? res.solved : res.won; if (win) s.wins++;
  const k = res.type === "rank" ? (res.solved ? `Rank in ${res.tries}` : "Rank ✗") : res.type === "match" ? (res.solved ? `Match in ${res.tries}` : "Match ✗") : res.type === "tier" ? (res.solved ? `Tier in ${res.tries}` : "Tier ✗") : res.type === "name" ? (res.solved ? `Name in ${res.tries}` : "Name ✗") : (res.attempts ? (res.solved ? `Top 5 in ${res.tries}` : "Top 5 ✗") : `Top 5: ${res.hits}/5`);
  s.dist[k] = (s.dist[k] || 0) + 1; save(LS.stats, s);
}
function currentStreak() { const s = load(LS.stats, null); if (!s) return 0; const dn = dayNumber(todayKey()); return (s.lastDay === dn || s.lastDay === dn - 1) ? s.streak : 0; }

// ================================================================ sister game (WhereIsShe)
// Small card inside #result, after the share row. Daily finishes only (the result panel is already past any
// interstitial). Never Studio, ?preview=, practice, or All puzzles. Not Premium-gated.
// Once per page session (memory). "Not now" and the CTA both suppress it for 2 days via rankd.crosspromo.v1.
// That key is not on LS, so preview cannot remap it onto rankd.preview.*.
const CROSSPROMO_KEY = "rankd.crosspromo.v1";
const CROSSPROMO_DISMISS_MS = 2 * 24 * 60 * 60 * 1000;
let crossPromoShownThisSession = false;
function crossPromoRead() {
  try { const v = JSON.parse(localStorage.getItem(CROSSPROMO_KEY)); return v && typeof v === "object" ? v : null; }
  catch { return null; }
}
function crossPromoDismissActive(dismissedAt, now) {
  if (dismissedAt == null || dismissedAt === "") return false;
  const t = typeof dismissedAt === "number" ? dismissedAt : Date.parse(dismissedAt);
  return Number.isFinite(t) && (now - t) < CROSSPROMO_DISMISS_MS;
}
function crossPromoShouldShow(o) {
  if (o.studio || o.preview) return false;
  if (o.mode !== "daily") return false;
  if (o.shownThisSession) return false;
  if (crossPromoDismissActive(o.dismissedAt, o.now)) return false;
  return (Number(o.played) || 0) >= 5 || (Number(o.streak) || 0) >= 3;
}
function crossPromoWrite(patch) {
  if (PREVIEW || window.RANKD_STUDIO) return;
  if (CROSSPROMO_KEY.indexOf("rankd.preview.") === 0) return;
  const next = Object.assign({}, crossPromoRead() || {}, patch);
  try { localStorage.setItem(CROSSPROMO_KEY, JSON.stringify(next)); } catch {}
}
function dismissCrossPromo() {
  crossPromoShownThisSession = true;
  const prev = crossPromoRead();
  crossPromoWrite({ dismissedAt: new Date().toISOString(), lastShown: (prev && prev.lastShown) || new Date().toISOString() });
  const el = $("#crossPromo"); if (el) el.classList.add("hidden");
}
function maybeShowCrossPromo() {
  const el = $("#crossPromo"); if (!el) return;
  // Already offered once this page session. Leave it alone if it's still up; don't open it again after they leave.
  if (crossPromoShownThisSession) return;
  const stats = load(LS.stats, null);
  const rec = crossPromoRead();
  const show = crossPromoShouldShow({
    studio: !!window.RANKD_STUDIO, preview: !!PREVIEW, mode: state.mode,
    shownThisSession: crossPromoShownThisSession,
    dismissedAt: rec ? rec.dismissedAt : null,
    played: stats && stats.played, streak: currentStreak(), now: Date.now(),
  });
  if (!show) { el.classList.add("hidden"); return; }
  crossPromoShownThisSession = true;
  crossPromoWrite({ lastShown: new Date().toISOString() });
  el.classList.remove("hidden");
}

// ================================================================ challenge a friend
// The hash still names the puzzle. &c= is a base64url of tries, DNF, accuracy and square
// rows only (challenge.js). The banner shows name + tries + accuracy. Squares wait until
// the friend finishes. A bad token is ignored. Archive unlock storage is not changed.
function markCode(m) {
  if (m === "good") return "G";
  if (m === "near") return "Y";
  if (m === "miss") return "M";
  return "R";
}
function gridFromResult(p, r) {
  if (!p || !r) return [];
  // One row per lock-in. New Top 5 is five slots a try, same as Rank it.
  // Name it joins those per-try squares into one row (🟥🟥🟩).
  // The flat marks list is only the last try, so it is the fallback for old guess-style games.
  const fromTries = (r.attempts || []).map(a => (a.marks || []).map(markCode).join("")).filter(Boolean);
  if (p.type === "name") {
    const row = fromTries.join("") || (r.marks || []).map(markCode).join("");
    return row ? [row] : [];
  }
  if (fromTries.length) return fromTries;
  if (p.type !== "top5") return [];
  const marks = r.marks && r.marks.length ? r.marks : (r.guesses || []).map(k => {
    try { return inTop(p, findCountry(p, k)) ? "good" : "miss"; } catch (e) { return "miss"; }
  });
  const row = marks.map(markCode).join("");
  return row ? [row] : [];
}
function scoreForChallenge(p, r) {
  if (!p || !r) return null;
  if (p.type === "rank") r = normRank(r) || r;
  if (!isDone(r)) return null;
  const card = resultCard(p, r);
  if (!card || !Number.isInteger(card.accuracy)) return null;
  const tries = Number(r.tries);
  if (!Number.isInteger(tries)) return null;
  const grid = gridFromResult(p, r);
  if (!grid.length) return null;
  const dnf = p.type === "top5" ? !r.won : !r.solved;
  return { tries, dnf, acc: card.accuracy, grid };
}
function renderChallengeBanner() {
  const el = $("#challengeBanner");
  if (!el) return;
  const RC = window.RankdChallenge;
  const ch = state.challenge;
  const onPlay = !$("#playView").classList.contains("hidden");
  if (!RC || !ch || !onPlay || !RC.matches(ch, puzzleChallengeRef())) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = RC.bannerLine(ch);
  el.classList.remove("hidden");
}
function h2hSquares(grid) {
  const RC = window.RankdChallenge;
  const wrap = document.createElement("div");
  wrap.className = "h2h-squares";
  wrap.textContent = RC ? RC.gridText(grid) : "";
  return wrap;
}
function h2hColumn(label, score) {
  const col = document.createElement("div");
  col.className = "h2h-col";
  const name = document.createElement("b");
  name.textContent = label;
  const meta = document.createElement("div");
  meta.className = "h2h-meta";
  const word = score.tries === 1 ? "try" : "tries";
  meta.textContent = (score.dnf ? "DNF · " + score.tries + " " + word : score.tries + " " + word) + " · accuracy " + score.acc;
  col.append(name, meta, h2hSquares(score.grid));
  return col;
}
function renderHeadToHead(res) {
  const el = $("#h2h");
  if (!el) return;
  const RC = window.RankdChallenge;
  el.replaceChildren();
  const ch = state.challenge;
  const mine = scoreForChallenge(state.puzzle, res);
  if (!RC || !ch || !mine || !RC.matches(ch, puzzleChallengeRef())) {
    el.classList.add("hidden");
    return;
  }
  const line = document.createElement("p");
  line.className = "h2h-winner";
  line.textContent = RC.verdictLine(RC.winner(mine, ch));
  const vs = document.createElement("p");
  vs.className = "h2h-vs";
  vs.textContent = "You vs " + RC.displayName(ch);
  const grid = document.createElement("div");
  grid.className = "h2h-grid";
  grid.append(h2hColumn("You", mine), h2hColumn(RC.displayName(ch), ch));
  el.append(line, vs, grid);
  el.classList.remove("hidden");
}
function storedChallengeName() {
  const v = load(LS.challengeName, null);
  if (!v || typeof v !== "object" || !Object.prototype.hasOwnProperty.call(v, "name")) return null;
  return window.RankdChallenge ? RankdChallenge.sanitizeName(v.name) : "";
}
function rememberChallengeName(name) {
  const RC = window.RankdChallenge;
  save(LS.challengeName, { name: RC ? RC.sanitizeName(name) : "", at: Date.now() });
}
function challengeNameForShare() {
  const saved = storedChallengeName();
  if (saved !== null) return saved;
  let entered = null;
  try { entered = window.prompt("Your name on the challenge link? Optional, up to 16 characters.", ""); }
  catch (e) { entered = null; }
  if (entered == null) { rememberChallengeName(""); return ""; }
  const RC = window.RankdChallenge;
  const name = RC ? RC.sanitizeName(entered) : "";
  rememberChallengeName(name);
  return name;
}
async function shareOrCopyChallenge(text, url) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: CONFIG.brand, text: text, url: url });
      return "shared";
    } catch (e) {
      if (e && e.name === "AbortError") return "abort";
    }
  }
  const payload = text;
  try {
    await navigator.clipboard.writeText(payload);
    toast("Challenge link copied!");
    return "copied";
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = payload;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast("Challenge link copied!"); }
    catch (err) { window.prompt("Copy this:", payload); }
    ta.remove();
    return "copied";
  }
}
async function shareChallengeFriend() {
  const RC = window.RankdChallenge;
  const p = state.puzzle;
  if (!RC || !p) return;
  let r = getResult();
  if (p.type === "rank") r = normRank(r);
  const score = scoreForChallenge(p, r);
  if (!score) { toast("Finish the puzzle first"); return; }
  const name = challengeNameForShare();
  const ref = puzzleChallengeRef();
  if (!ref) return;
  const token = RC.encode({ k: ref.k, id: String(ref.id), tries: score.tries, dnf: score.dnf, acc: score.acc, grid: score.grid, name: name });
  if (!token) { toast("Couldn't make a challenge link"); return; }
  const url = shareUrl() + "&c=" + token;
  const text = RC.shareLine(name, score) + "\n" + url;
  const how = await shareOrCopyChallenge(text, url);
  if (how === "shared" || how === "copied") track("challenge_link_created", { mode: state.mode, puzzle_type: p.type });
}

// ================================================================ sharing
// Share links always name this puzzle. Daily and archive use #d=YYYY-MM-DD, practice uses
// #r=<seed>, the all-puzzles list uses #p=<id>. Loading Zone preview uses ?preview=YYYY-MM-DD:
// a future #d= link is refused and would open today. The schedule page (loadingzone.html)
// is not a puzzle URL, so shares point at the game. Challenge links add &c= and are separate
// from these spoiler-free / result shares.
function gameShareBase() {
  const http = location.protocol.startsWith("http");
  const origin = http ? location.origin : "https://ranki.gg";
  let path = http ? (location.pathname || "/") : "/";
  path = path.replace(/\/(?:loadingzone|studio)(?:\/index\.html|\.html)?\/?$/i, "/");
  path = path.replace(/index\.html$/i, "");
  if (!path.endsWith("/")) path += "/";
  return origin + path;
}
function shareUrl() {
  const base = gameShareBase();
  if (!state.puzzle) return base;
  if (state.mode === "preview") return base + "?preview=" + encodeURIComponent(state.dateKey);
  if (state.mode === "practice") return base + "#r=" + encodeURIComponent(state.puzzle.seed);
  if (state.mode === "all") return base + "#p=" + encodeURIComponent(state.puzzle.id);
  return base + "#d=" + state.dateKey;
}
window.RankdShare = { url: shareUrl, base: gameShareBase };
const fullTitle = p => p.headline && p.question && p.headline !== p.question ? `${p.headline}: ${p.question}` : (p.headline || p.question);   // v11 share/list text
function shareTitle() { return state.mode === "preview" ? `${CONFIG.brand} preview` : state.mode === "practice" ? `${CONFIG.brand} Practice` : state.mode === "all" ? `${CONFIG.brand} preview` : `${CONFIG.brand} #${pad3(dayNumber(state.dateKey) + 1)}`; }
function challengeText() {
  const p = state.puzzle;
  return `${shareTitle()} ${p.emoji || ""}\n${fullTitle(p)}\n${p.type === "name" ? "Name it: can you name any country that passes both rules?" : p.type === "top5" ? "Top 5: six countries, five slots. Can you leave the odd one out?" : p.type === "match" ? "Match it: can you match each clue to the right person?" : p.type === "tier" ? "Tier it: can you drop each one into the right tier?" : "Can you rank them right?"}\n${shareUrl()}`.replace(/ \n/, "\n");
}
function accuracyShareBit(p, r) {
  const card = resultCard(p, r);
  return card && card.accuracy != null ? ` · Accuracy ${card.accuracy}` : "";
}
function resultText() {
  const p = state.puzzle; let r = getResult(); if (p.type === "rank") r = normRank(r); if (!r || !r.done) return "";
  const acc = accuracyShareBit(p, r);
  if (p.type === "match") {
    const line = r.solved ? `🔗 Match it: solved in ${r.tries} ${r.tries === 1 ? "try 🎯" : "tries"}${acc}` : `🔗 Match it: X/${CONFIG.rankMaxTries} (${r.points}/${p.people.length})${acc}`;
    return `${shareTitle()} ${line}\n${rankGrid(r)}\n${fullTitle(p)}\n${shareUrl()}`;
  }
  if (p.type === "name") {
    const line = r.solved ? `✏️ Name it: solved in ${r.tries} ${r.tries === 1 ? "try" : "tries"}${acc}` : `✏️ Name it: X/${CONFIG.rankMaxTries}${acc}`;
    const grid = (r.marks || []).map(m => EMO[m] || "🟥").join("");
    return `${shareTitle()} ${line}\n${grid}\n${fullTitle(p)}\n${shareUrl()}`;
  }
  if (p.type === "rank" || p.type === "tier" || (p.type === "top5" && r.attempts && r.attempts.length)) {
    const kind = p.type === "tier" ? "Tier it" : p.type === "top5" ? "Top 5" : "";
    const line = r.solved ? `${p.emoji || ""} ${kind ? kind + ": " : ""}solved in ${r.tries} ${r.tries === 1 ? "try 🎯" : "tries"}${acc}` : `${p.emoji || ""} ${kind ? kind + ": " : ""}X/${CONFIG.rankMaxTries}${acc}`;
    return `${shareTitle()} ${line.trim()}\n${rankGrid(r)}\n${fullTitle(p)}\n${shareUrl()}`;
  }
  const h = hitsOf(p, r), m = missesOf(p, r), avg = avgRank(p, r), rows = [];
  for (let i = 0; i < r.marks.length; i += 10) rows.push(r.marks.slice(i, i + 10).map(x => EMO[x]).join(""));
  return `${shareTitle()} 🖐️ Guess the top 5: Found ${h}/5${h >= 5 ? ` with ${plural(m, "miss")}` : ""}${acc} · avg rank #${avg}\n${rows.join("\n")}\n${fullTitle(p)}\n${shareUrl()}`;
}
async function doShare(text) {
  if (!text) return;
  track("share_clicked", { mode: state.mode, puzzle_type: state.puzzle && state.puzzle.type });
  window.__lastShare = text;
  if (navigator.share && matchMedia("(pointer:coarse)").matches) { try { await navigator.share({ text }); return; } catch (e) { if (e.name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(text); toast("Copied to clipboard!"); }
  catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Copied to clipboard!"); } catch { prompt("Copy this:", text); } ta.remove(); }
}

// ================================================================ v11: phone fit (no scrolling while playing)
// On phones (<= 560px wide) while a puzzle is being played (body.playing), the blue card is capped to the visible
// viewport (visualViewport height, so it also shrinks when the on-screen keyboard opens) and its rows flex to fit:
// cards / slots shrink instead of overflowing. Footer, share link and the hints+guesses list below the card are hidden
// until the reveal (hints stay in the card; "💡 Hints & guesses" opens them in a sheet). With the keyboard open
// (input focused + viewport much shorter than before) body.kb also hides the top bar, ad banner and subtitle.
const fitMQ = matchMedia("(max-width: 560px)");
let vvMax = 0, vvW = 0, fitting = false, fitQueued = false;
function scheduleFit() {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => { fitQueued = false; fitLayout(); });
}
function boxesOverlap(a, b) {
  if (!a || !b) return false;
  const as = getComputedStyle(a), bs = getComputedStyle(b);
  if (as.display === "none" || bs.display === "none" || as.visibility === "hidden" || bs.visibility === "hidden") return false;
  const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
  if (A.width < 2 || A.height < 2 || B.width < 2 || B.height < 2) return false;
  return A.left < B.right && A.right > B.left && A.top < B.bottom && A.bottom > B.top;
}
function syncFabPad() {
  const f = $("#fab"); if (!f) return;
  const on = !f.classList.contains("hidden");
  document.documentElement.style.setProperty("--fab-h", on ? Math.ceil(f.offsetHeight) + "px" : "0px");
}
function parkFab() {
  const f = $("#fab"); if (!f) return;
  if (f.classList.contains("hidden") || !fitMQ.matches) { f.classList.remove("fab-clear"); return; }
  const targets = [$("#shareChallengeBtn"), $("#shareChallengeTop"), $("#challengeFriendBtn"), $("#nextBtn"), document.querySelector("#result .share-row"), $("#youVs")];
  document.querySelectorAll("#youVs .platform-pct").forEach(el => targets.push(el));
  const hit = targets.some(el => boxesOverlap(f, el));
  f.classList.toggle("fab-clear", hit);
}
function syncPlaying() {
  const on = !$("#playView").classList.contains("hidden") && $("#result").classList.contains("hidden");
  document.body.classList.toggle("playing", on); fitLayout();
}
function fitLayout() {
  if (fitting) return;
  fitting = true;
  let bannerPhase = "off";
  try {
    const vv = window.visualViewport, h = vv ? vv.height : innerHeight, b = document.body, hero = $("#hero");
    if (!hero) return;
    // Banner height changes the card's top, so commit .ad-on before measuring the visual viewport.
    bannerPhase = applyTopBanner();
    if (innerWidth !== vvW) { vvW = innerWidth; vvMax = 0; } vvMax = Math.max(vvMax, h);
    const fit = fitMQ.matches && b.classList.contains("playing");
    const typing = document.activeElement === $("#guessInput") || document.activeElement === $("#nameInput");
    b.classList.toggle("kb", fit && typing && h < vvMax - 120);
    b.classList.toggle("fit", fit);
    if (!fit) { hero.style.maxHeight = ""; hero.style.height = ""; hero.classList.remove("q-drop"); parkFab(); return; }
    const ab = $("#adBottom");
    const abShown = ab && getComputedStyle(ab).display !== "none" && ab.offsetHeight;
    const abH = abShown ? ab.offsetHeight + 6 : 0;   // v12.2: Practice bottom banner stays on screen
    // Document offset of the card (stable while playing at scroll 0), from the visual viewport — not 100vh.
    const top = hero.getBoundingClientRect().top + scrollY - (vv ? vv.offsetTop : 0), avail = Math.max(260, Math.floor(h - top - 8 - abH));
    // natural height first (rows at their max size); only if that doesn't fit, pin the card to the available height so rows shrink
    hero.style.height = ""; hero.style.maxHeight = "none"; hero.classList.remove("q-drop");
    // Tier it on phone: always hide subtitle + stat (4 rows + chip pool need the room). Match-7: only if still tight.
    if (hero.classList.contains("is-tier")) hero.classList.add("q-drop");
    let natural = hero.scrollHeight;
    if (natural > avail && (hero.classList.contains("is-match7") || hero.classList.contains("is-top5"))) { hero.classList.add("q-drop"); natural = hero.scrollHeight; }
    hero.style.maxHeight = avail + "px"; hero.style.height = natural > avail ? avail + "px" : "";
    if (b.classList.contains("kb") && scrollY > 0 && !(vv && vv.offsetTop)) window.scrollTo(0, 0);
    const share = $("#shareChallengeTop");
    const locks = ["#submitBtn", "#matchSubmit", "#tierSubmit", "#t5Submit", "#nameBtn"].map(id => $(id)).filter(btn => btn && btn.offsetParent);
    if (share && share.closest(".under-card")) share.closest(".under-card").classList.toggle("lock-covered", locks.some(btn => boxesOverlap(btn, share)));
    parkFab();
  } finally {
    fitting = false;
    confirmArchiveBanner(bannerPhase);
  }
}
window.visualViewport?.addEventListener("resize", scheduleFit);
window.visualViewport?.addEventListener("scroll", scheduleFit);
addEventListener("resize", scheduleFit);
addEventListener("scroll", () => { if (!fitting) parkFab(); }, { passive: true });
fitMQ.addEventListener?.("change", scheduleFit);
document.fonts?.ready.then(() => scheduleFit());
$("#hero")?.addEventListener("load", () => scheduleFit(), true);
if (window.ResizeObserver) {
  const ro = new ResizeObserver(() => { if (!fitting) scheduleFit(); });
  ["#hero", "#cards", "#mClues", "#mPeople", "#tierBoard", "#t5board", "#nameGame", "#art"].forEach(sel => { const el = $(sel); if (el) ro.observe(el); });
}
function extraSheet() {
  const hints = $("#hints") ? $("#hints").innerHTML : "";
  openModal(`<h2>Hints</h2><div class="hints">${hints || "<p>No hints yet. Each missed lock reveals one.</p>"}</div>`);
  $("#modal").classList.add("sheet");
}
window.RankdFit = { sync: syncPlaying, layout: fitLayout };


// ================================================================ v12.2 first-visit howto
const HOWTO_KEY = "rankd.howto.seen.v1";
// Female homicide rate sample — puzzle homicide-women, UNODC via World Bank 2022,
// female intentional homicides per 100k women. High → low: United States 2.81, India 2.37, South Korea 0.50.
const HOWTO_SUCCESS = "All green = perfect! Wrong cards turn red so you can fix them.";
let howtoRun = 0, howtoTimers = [];
function howtoSeen() { try { return localStorage.getItem(HOWTO_KEY) === "1"; } catch (e) { return true; } }
function markHowtoSeen() { try { localStorage.setItem(HOWTO_KEY, "1"); } catch (e) {} }
function clearHowtoTimers() { howtoTimers.forEach(clearTimeout); howtoTimers = []; }
function onHowtoKey(e) {
  if (e.key !== "Escape") return;
  const el = $("#howtoOverlay");
  if (!el || el.classList.contains("hidden")) return;
  e.preventDefault();
  dismissHowto();
}
function dismissHowto() {
  howtoRun++; clearHowtoTimers();
  document.removeEventListener("keydown", onHowtoKey);
  const el = $("#howtoOverlay"); if (!el) return;
  el.classList.add("hidden"); markHowtoSeen();
}
function runHowtoDemo() {
  const rows = $$("#howtoOverlay .howto-card-row");
  const step = $("#howtoStep"), lock = $("#howtoLockDemo"), pointer = $("#howtoPointer");
  const card = $("#howtoOverlay .howto-card");
  if (!rows.length || !step || !lock) return;
  const run = ++howtoRun;
  clearHowtoTimers();
  const prefersReduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const alive = () => howtoRun === run && !$("#howtoOverlay").classList.contains("hidden");
  const later = (fn, ms) => { const id = setTimeout(() => { if (alive()) fn(); }, ms); howtoTimers.push(id); };
  const setY = (li, y, snap) => {
    li.style.setProperty("--ty", y + "px");
    if (snap) li.style.transition = "none";
    li.style.transform = `translateY(${y}px)`;
    if (snap) { li.offsetHeight; li.style.transition = ""; }
  };
  // data-slot is the correct high→low row. DOM order starts scrambled.
  const layout = (sorted, snap) => {
    const h = rows[0].offsetHeight + 6;
    rows.forEach((li, n) => setY(li, sorted ? (+li.dataset.slot - n) * h : 0, snap));
  };
  const paint = (green) => rows.forEach(li => li.classList.toggle("good", green));
  const hidePointer = () => { if (pointer) pointer.classList.remove("on", "hint"); };
  const pointAt = (rect, dy) => {
    if (!pointer || !card) return;
    const cr = card.getBoundingClientRect();
    pointer.style.left = (rect.left + rect.width / 2 - cr.left) + "px";
    pointer.style.top = (rect.top + dy - cr.top) + "px";
  };
  // Finger stays on Lock it in! and pulses until the player taps. No auto-tap.
  const showHint = (travel) => {
    lock.disabled = false;
    step.textContent = "Highest value at the top — then Lock it in!";
    if (!pointer || !card) { lock.focus({ preventScroll: true }); return; }
    pointer.classList.remove("on", "hint");
    if (!travel || prefersReduce()) {
      pointer.style.transition = "none";
      pointAt(lock.getBoundingClientRect(), 14);
      pointer.offsetHeight;
      pointer.style.transition = "";
      pointer.classList.add("on", "hint");
    } else {
      pointer.style.transition = "none";
      pointAt(rows[1].getBoundingClientRect(), 8);
      pointer.offsetHeight;
      pointer.style.transition = "";
      pointer.classList.add("on");
      requestAnimationFrame(() => requestAnimationFrame(() => pointAt(lock.getBoundingClientRect(), 14)));
      later(() => { if (!committed) pointer.classList.add("hint"); }, 700);
    }
    lock.focus({ preventScroll: true });
  };
  let committed = false;
  const commitHowto = () => {
    if (committed || lock.disabled) return;
    committed = true;
    lock.classList.add("pressing");
    paint(true);
    hidePointer();
    step.textContent = HOWTO_SUCCESS;
    later(() => lock.classList.remove("pressing"), 180);
    later(dismissHowto, 1100);
  };
  lock.onclick = commitHowto;
  if (prefersReduce()) { layout(true, true); paint(false); showHint(false); return; }
  layout(false, true); paint(false); hidePointer();
  lock.classList.remove("pressing"); lock.disabled = true;
  step.textContent = "Watch the cards slide into order…";
  later(() => {
    layout(true, false);
    later(() => showHint(true), 620);
  }, 780);
}
function maybeShowHowto() {
  if (howtoSeen()) return;
  const el = $("#howtoOverlay"); if (!el) return;
  el.classList.remove("hidden");
  runHowtoDemo();
  el.addEventListener("click", (e) => { if (e.target === el) dismissHowto(); });
  document.addEventListener("keydown", onHowtoKey);
}

// ================================================================ views / navigation
// Play-board rows. Standard Rank it is 6; 7-row boards (Girlboss) are taller.
// Top 5 is five slots plus a chip pool, so it is as tall as a 6-row board (archive banner stays off).
function playRows(p) {
  if (!p) return 6;
  if (p.type === "top5") return 6;
  if (p.type === "match") return (p.people || []).length;
  if (p.type === "tier") return (p.tiers || []).length;
  return (p.items || []).length;
}
// Archive banner is only for a past day (#d=, state.mode "archive" — never today's Daily, the list, or All puzzles)
// whose board is shorter than a 6-row Rank it, and only when the Lock control still fits.
let archiveBannerHold = null;
function archiveBannerKey() {
  const vv = window.visualViewport;
  const h = Math.round((vv ? vv.height : innerHeight) / 8) * 8;
  return [state.mode, state.dateKey, state.puzzle && state.puzzle.id, fitMQ.matches ? "m" : "d", h].join("|");
}
function topBannerWanted() {
  if ($("#playView").classList.contains("hidden") || !Ads.allowed()) return "off";
  if (state.mode === "practice") return "practice";
  if (state.mode === "archive" && playRows(state.puzzle) < 6) return "archive";
  return "off";
}
function applyTopBanner() {
  const box = $("#adTop"); if (!box) return "off";
  const want = topBannerWanted();
  if (want === "practice") { box.classList.add("ad-on"); return "practice"; }
  if (want !== "archive") {
    if (box.classList.contains("ad-on")) box.classList.remove("ad-on");
    archiveBannerHold = null;
    return "off";
  }
  const key = archiveBannerKey();
  if (archiveBannerHold && archiveBannerHold.key === key) {
    box.classList.toggle("ad-on", archiveBannerHold.show);
    return archiveBannerHold.show ? "archive-on" : "archive-off";
  }
  box.classList.add("ad-on");
  return "archive-try";
}
function locksComfortable() {
  // Result screen has no Lock control. Phone fit hides Share while playing; still refuse a Lock that
  // leaves the card or the visual viewport (the overlap PR #40 closed) or that paints over Share.
  if (!document.body.classList.contains("playing")) return true;
  const hero = $("#hero"); if (!hero) return false;
  const hr = hero.getBoundingClientRect();
  const vv = window.visualViewport;
  const viewTop = vv ? vv.offsetTop : 0;
  const viewBot = viewTop + (vv ? vv.height : innerHeight);
  const share = $("#shareChallengeTop");
  const locks = ["#submitBtn", "#matchSubmit", "#tierSubmit", "#t5Submit"].map(id => $(id)).filter(btn => btn && btn.offsetParent);
  if (!locks.length) return true;
  const phone = document.body.classList.contains("fit");
  for (const btn of locks) {
    const r = btn.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (share && boxesOverlap(btn, share)) return false;
    // Desktop scrolls, so a Lock below the fold is not an overlap. Phone fit keeps the card in the
    // visual viewport; if the banner shoves Lock out of the card or the viewport, drop it.
    if (phone && (r.top < hr.top - 2 || r.bottom > hr.bottom + 2 || r.top < viewTop - 2 || r.bottom > viewBot - 2)) return false;
  }
  return true;
}
function confirmArchiveBanner(phase) {
  if (phase === "practice" || phase === "archive-on") { AdSense.banner(); return; }
  if (phase !== "archive-try") return;
  const p = state.puzzle, head = $("#headline");
  if (!p || !head || head.textContent !== (p.headline || p.question)) return;
  const box = $("#adTop"); if (!box) return;
  const ok = locksComfortable();
  archiveBannerHold = { key: archiveBannerKey(), show: ok };
  if (!ok) { box.classList.remove("ad-on"); scheduleFit(); }
  else AdSense.banner();
}
function syncTopBanner() {
  const phase = applyTopBanner();
  if (phase === "practice" || phase === "archive-on") AdSense.banner();
}
function showView(v) {
  if (v !== "play") showFab(false);
  $("#playView").classList.toggle("hidden", v !== "play"); $("#archiveView").classList.toggle("hidden", v !== "archive");
  const tab = v === "archive" ? "archive" : state.mode === "all" ? "all" : state.mode === "practice" ? "practice" : state.mode === "archive" ? "archive" : "today";
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.view === tab));
  syncTopBanner();
  syncPlaying();
}
function goToday(opts) {
  state.mode = "daily"; state.dateKey = todayKey();
  bindChallenge(opts && opts.challengeToken, { k: "d", id: state.dateKey });
  openPuzzle(puzzleForDay(dayNumber(state.dateKey)));
}
function goDate(key, opts) {
  const today = todayKey();
  const token = opts && opts.challengeToken;
  if (!validKey(key) || dayNumber(key) < 0) { toast("That puzzle doesn't exist"); return goToday(); }
  if (utc(key) > utc(today)) { toast("That puzzle isn't out yet 👀"); return goToday(); }   // never expose future dailies
  if (key === today) return goToday(opts);
  const RC = window.RankdChallenge;
  const decoded = token && RC ? RC.decode(token) : null;
  // A challenge for this day is playable even outside the free window. It does not widen the saved unlock.
  const viaChallenge = !!(decoded && RC.bypassArchiveAd(decoded, key));
  if (archiveFreeUnlocked(key) || viaChallenge) {
    state.mode = "archive"; state.dateKey = key;
    bindChallenge(token, { k: "d", id: key });
    openPuzzle(puzzleForDay(dayNumber(key)));
    return;
  }
  // Free: watch a long ad to unlock the next adUnlockDays, then retry. Malformed challenges fall through to here.
  unlockNextArchiveDays(() => {
    goArchive();
    if (archiveFreeUnlocked(key)) { state.mode = "archive"; state.dateKey = key; bindChallenge("", { k: "d", id: key }); openPuzzle(puzzleForDay(dayNumber(key))); }
    else toast(archiveUnlockToast());
  });
}
function goAll(idx, opts) {   // v11: the pre-launch "All puzzles" browser (was "Practice" before v11)
  if (!CONFIG.SHOW_ALL_PUZZLES) return goToday();
  state.mode = "all";
  if (idx == null) idx = (dayNumber(todayKey()) + 1) % PUZZLES.length;
  state.practiceIdx = ((idx % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;
  const p = PUZZLES[state.practiceIdx];
  bindChallenge(opts && opts.challengeToken, { k: "p", id: p.id });
  openPuzzle(p);
}
function goPreview(key) {   // v12 Studio preview of any scheduled day, past or future (sandboxed storage)
  if (!validKey(key) || dayNumber(key) < 0) { toast("That day isn't scheduled"); return goToday(); }
  state.mode = "preview"; state.dateKey = key; openPuzzle(puzzleForDay(dayNumber(key)));
}

// v12.2 Premium / free archive rolling unlock (UTC day keys). Depth helpers live above the Studio return.
function longAdSeconds() {
  const q = new URLSearchParams(location.search).get("longad");
  if (q && /^\d+$/.test(q)) return Math.max(1, Math.min(60, +q));
  return CONFIG.longAdSeconds || 20;
}
/** Placeholder long-ad / rewarded unlock. Swap #longAdFill for a real unit later. */
let closeLongAd = null;
function dismissLongAd() { if (closeLongAd) closeLongAd(); }
function showLongAd({ reason, onDone, onCancel } = {}) {
  if (isPremium() || !Ads.allowed()) { onDone && onDone({ skipped: true, reason: "premium-or-streamer" }); return; }
  const ov = $("#longAd"), btn = $("#longAdContinue"), timer = $("#longAdTimer"), note = $("#longAdNote"), copy = $("#longAdCopy");
  if (!ov || !btn) { onDone && onDone({ skipped: true, reason: "no-ui" }); return; }
  if (closeLongAd) closeLongAd();
  let s = longAdSeconds(); state.busy = true;
  note.textContent = reason === "practice" ? "Practice" : "Archive unlock";
  copy.textContent = reason === "practice"
    ? "Free Practice shows a longer ad every 5 games (plus normal interstitials). Premium is ad-free."
    : archiveLongAdCopy();
  timer.textContent = String(s);
  btn.disabled = true; btn.textContent = `Continue in ${s}`;
  ov.classList.remove("hidden");
  const tick = setInterval(() => {
    s--;
    if (s <= 0) { clearInterval(tick); btn.disabled = false; btn.textContent = "Continue"; timer.textContent = "0"; }
    else { timer.textContent = String(s); btn.textContent = `Continue in ${s}`; }
  }, 1000);
  let closed = false;
  const finish = (ok) => {
    if (closed) return; closed = true; clearInterval(tick); ov.classList.add("hidden"); state.busy = false;
    if (closeLongAd === dismiss) closeLongAd = null;
    if (ok) onDone && onDone({ ok: true, reason }); else onCancel && onCancel();
  };
  const dismiss = () => finish(false);
  closeLongAd = dismiss;
  btn.onclick = () => { if (!btn.disabled) finish(true); };
  // Hook for a real rewarded unit: window.RankdLongAd.onCreative?.(fill, { done: () => finish(true) })
  try { window.RankdLongAd && window.RankdLongAd.onCreative && window.RankdLongAd.onCreative($("#longAdFill"), { done: () => finish(true) }); } catch (e) {}
}
window.RankdLongAd = window.RankdLongAd || { show: (opts) => showLongAd(opts) };

function unlockNextArchiveDays(then) {
  showLongAd({ reason: "archive", onDone: () => {
    applyArchiveAdUnlock();
    then && then();
  }});
}
function practiceGamesPlayed() { return Number(load(LS.practiceAds, { games: 0 }).games) || 0; }
function bumpPracticeGame() {
  const st = load(LS.practiceAds, { games: 0 });
  st.games = (Number(st.games) || 0) + 1; st.at = Date.now(); save(LS.practiceAds, st); return st.games;
}

function goArchive() {
  state.view = "archive"; showView("archive"); setHash("#archive");
  const today = todayKey(), last = dayNumber(today), all = load(LS.results, {});
  const prem = isPremium(), unlocked = getArchiveUnlockedDays();
  const sub = document.querySelector("#archiveView .section-sub");
  if (sub) sub.innerHTML = prem
    ? "Every daily puzzle so far. Archive plays don't affect your streak."
    : archiveListHeaderHtml(unlocked, last);
  const rows = [];
  for (let n = last; n >= 0; n--) {
    const key = keyFromDay(n), p = puzzleForDay(n), r = all[`d:${key}`], mine = r && r.id === p.id ? r : null;
    const locked = !archiveFreeUnlocked(key);
    let badge = locked ? `<span class="ar unlock">Watch ad ▶</span>` : `<span class="ar">Play →</span>`;
    if (!locked) {
      const mr = mine && mine.type === "rank" ? normRank(mine) : null;
      if (mr && mr.done) badge = mr.solved ? `<span class="ar done">✓ in ${mr.tries}</span>` : `<span class="ar lost">✗ X/${CONFIG.rankMaxTries}</span>`;
      else if (mine && mine.type === "rank") badge = `<span class="ar">In progress</span>`;
      else if (mine && mine.type === "match") badge = mine.done ? (mine.solved ? `<span class="ar done">✓ in ${mine.tries}</span>` : `<span class="ar lost">✗ X/${CONFIG.rankMaxTries}</span>`) : `<span class="ar">In progress</span>`;
      else if (mine && mine.type === "tier") badge = mine.done ? (mine.solved ? `<span class="ar done">✓ in ${mine.tries}</span>` : `<span class="ar lost">✗ X/${CONFIG.rankMaxTries}</span>`) : `<span class="ar">In progress</span>`;
      else if (mine && mine.type === "top5" && mine.attempts) badge = mine.done ? (mine.solved ? `<span class="ar done">✓ in ${mine.tries}</span>` : `<span class="ar lost">✗ X/${CONFIG.rankMaxTries}</span>`) : `<span class="ar">In progress</span>`;
      else if (mine && mine.type === "name") badge = mine.done ? (mine.solved ? `<span class="ar done">✓ in ${mine.tries}</span>` : `<span class="ar lost">✗ X/${CONFIG.rankMaxTries}</span>`) : `<span class="ar">In progress</span>`;
      else if (mine && mine.done) badge = mine.type === "rank" ? ""
        : `<span class="ar ${mine.won ? "done" : ""}">🖐️ ${mine.hits || 0}/5</span>`;
      else if (mine) badge = `<span class="ar">In progress</span>`;
    }
    rows.push(`<li data-day="${n}"><button class="arch ${n === last ? "today" : ""}${locked ? " locked" : ""}" data-key="${key}" data-locked="${locked ? "1" : "0"}"><span class="an">#${pad3(n + 1)}<small>${n === last ? "Today" : prettyDate(key).replace(/, \d{4}$/, "")}</small></span>
      <span class="aq"><span class="ah">${esc(p.emoji)} ${esc(p.headline || p.question)}</span>${p.headline && p.headline !== p.question ? `<span class="asub">${esc(p.question)}</span>` : ""}<small>${p.type === "name" ? "Name it" : p.type === "top5" ? "Top 5" : p.type === "match" ? "Match it" : p.type === "tier" ? "Tier it" : "Rank it"}</small></span>${badge}</button></li>`);
  }
  $("#archiveList").innerHTML = rows.join("");
  $$(".arch").forEach(b => b.onclick = () => goDate(b.dataset.key));
  wireArchiveSearch();
  if (runArchiveSearch) runArchiveSearch();
  window.scrollTo({ top: 0 });
}
// Search only hides rows. Locked rows keep data-locked and still go through goDate (the ad unlock).
let runArchiveSearch = null;
function applyArchiveFilter() {
  const input = $("#archiveSearch");
  if (!input || !window.RankdSearch) return;
  const q = input.value;
  let nShown = 0;
  $$("#archiveList li").forEach(li => {
    const p = puzzleForDay(+li.dataset.day);
    const show = window.RankdSearch.matches(p, q, { gloss: valueGlossOf(p) });
    li.classList.toggle("hidden", !show);
    if (show) nShown++;
  });
  const count = $("#archiveCount");
  if (count) count.textContent = window.RankdSearch.countLabel(nShown);
  const empty = $("#archiveEmpty");
  if (empty) { empty.textContent = window.RankdSearch.emptyCopy(q); empty.classList.toggle("hidden", nShown !== 0); }
  const list = $("#archiveList");
  if (list) list.classList.toggle("hidden", nShown === 0);
}
function wireArchiveSearch() {
  const input = $("#archiveSearch");
  if (!input || runArchiveSearch || !window.RankdSearch) return;
  runArchiveSearch = window.RankdSearch.bindSearch(input, $("#archiveSearchClear"), applyArchiveFilter);
}
// v8 floating "next" button (bottom-right), shown only once the puzzle is finished
const isDone = r => !!r && (r.type === "rank" ? !!(normRank(r) || {}).done : !!r.done);  // tier/match/top5 use .done
function nextUnplayedPractice() {
  const all = load(LS.results, {});
  for (let k = 1; k <= PUZZLES.length; k++) { const i = (state.practiceIdx + k) % PUZZLES.length; if (!isDone(all["p:" + PUZZLES[i].id])) return i; }
  return (state.practiceIdx + 1) % PUZZLES.length;
}
function nextUnplayedDay() {   // most recent unplayed past daily (never today or the future), or null
  const all = load(LS.results, {}), last = dayNumber(todayKey());
  for (let n = last - 1; n >= 0; n--) {
    const key = keyFromDay(n), r = all["d:" + key];
    if (!archiveFreeUnlocked(key)) continue;   // free users: stay inside the unlocked window
    if (key !== state.dateKey && !(r && r.id === puzzleForDay(n).id && isDone(r))) return key;
  }
  return null;
}
function fabGo() {
  if (state.mode === "preview") { location.href = "loadingzone.html"; return; }
  if (state.mode === "practice") return goPractice();
  if (state.mode === "all") return goAll(nextUnplayedPractice());
  const k = nextUnplayedDay(); k ? goDate(k) : goArchive();
}
function showFab(on) {
  const f = $("#fab"); f.textContent = state.mode === "preview" ? "Back to Loading Zone →" : state.mode === "daily" ? "Play the archive →" : state.mode === "practice" ? "🎲 New random puzzle →" : "Next puzzle →";
  f.classList.toggle("hidden", !on); document.body.classList.toggle("has-fab", !!on);
  syncFabPad(); parkFab();
}
function next() { if (state.mode === "preview") { location.href = "loadingzone.html"; return; } if (state.mode === "all") goAll(state.practiceIdx + 1); else if (state.mode === "archive") goArchive(); else goPractice(); }

// ================================================================ modals
function openModal(html) { $("#modalBody").innerHTML = html; $("#modal").classList.remove("hidden", "sheet"); }
function closeModal() { $("#modal").classList.add("hidden"); }
function statsModal() {
  const s = load(LS.stats, { played: 0, wins: 0, best: 0, dist: {} });
  const dist = Object.entries(s.dist || {}).sort().map(([k, v]) => `<div class="crow"><span class="cn">${esc(k)}</span><span class="cb"><i style="width:${v / Math.max(1, s.played) * 100}%"></i></span><span class="cp">${v}</span></div>`).join("") || "<p style='color:var(--muted)'>Play today's puzzle to start your stats.</p>";
  openModal(`<h2>Your stats</h2><div class="stat-grid"><div><b>${s.played}</b><span>Played</span></div><div><b>${s.wins}</b><span>Perfect / solved</span></div><div><b>${currentStreak()}</b><span>Streak</span></div><div><b>${s.best || 0}</b><span>Best</span></div></div>
    <h3>Daily results</h3>${dist}<p style="font-size:12px;color:var(--muted)">Only today's daily counts. Stats live in this browser (localStorage).</p>`);
}
const themeLabel = () => effectiveTheme() === "dark" ? "☀️ Light mode<small>Switch the theme</small>" : "🌙 Dark mode<small>Switch the theme</small>";
function menuModal() {   // v11: the single gear opens this sheet (stats + theme moved here from the old corner buttons)
  openModal(`<h2>Menu</h2><div class="menu-list">
    <button id="mStats">📊 Your stats<small>Streak and daily results</small></button>
    <button id="mTheme">${themeLabel()}</button>
    ${state.puzzle && !$("#playView").classList.contains("hidden") ? `<button id="mShare">↗ ${isToday() ? "Share today's puzzle" : "Share this puzzle"}<small>Spoiler-free link</small></button>` : ""}
    <button id="mArchive">🗓 Archive<small>Every past daily puzzle</small></button>
    ${Practice.ok() ? `<button id="mPractice">🎲 Practice<small>A new random puzzle from the full datasets</small></button>` : ""}
    ${CONFIG.SHOW_ALL_PUZZLES ? `<button id="mList">🗂 All puzzles (pre-launch)<small>Every puzzle, past and future, by mode</small></button>` : ""}
    <button id="mSettings">⚙️ Settings<small>Theme, streamer mode, load your spreadsheet</small></button>
    <button id="mHow">❓ How to play</button>
    <button id="mAbout">📚 About &amp; sources</button>
    <a class="menu-link" id="mAboutPage" href="about.html">ℹ️ About Rankd<small>What it is, how we source the data, who makes it</small></a>
    <a class="menu-link" id="mHowPage" href="how-to-play.html">📖 Full how-to-play guide</a>
    <a class="menu-link" id="mPrivacy" href="privacy.html">🔒 Privacy policy<small>Browser storage, ads and cookies</small></a></div>`);
  $("#mStats").onclick = statsModal; $("#mTheme").onclick = () => { settings.theme = effectiveTheme() === "dark" ? "light" : "dark"; saveSettings(); applyTheme(); };
  $("#modal").classList.add("sheet");
  if ($("#mShare")) $("#mShare").onclick = () => { closeModal(); doShare(challengeText()); };
  $("#mArchive").onclick = () => { closeModal(); goArchive(); }; if ($("#mList")) $("#mList").onclick = listModal; if ($("#mPractice")) $("#mPractice").onclick = () => { closeModal(); goPractice(); }; $("#mSettings").onclick = settingsModal; $("#mHow").onclick = howModal; $("#mAbout").onclick = aboutModal;
}
function settingsModal() {
  const seg = (name, opts, cur) => `<div class="seg" data-set="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${cur === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
  openModal(`<h2>Settings</h2>
    <h3>Theme</h3>${seg("theme", [["system", "System"], ["light", "Light"], ["dark", "Dark"]], settings.theme)}
    <h3>Streamer mode</h3>${seg("stream", [["off", "Off"], ["on", "On (hide ads)"]], streamerOn() ? "on" : "off")}
    <p style="font-size:12px;color:var(--muted);margin:6px 2px 0">Hides all ad slots and interstitials while you stream or record. Your browser can't tell when OBS is capturing, so switch it on yourself (or open the game with ?stream=1).</p>
    <h3>Puzzles</h3><div class="menu-list">
    <button id="mLoad">📄 Load spreadsheet<small>Your edited puzzles.xlsx, or one or more of the CSV sheets</small></button>
    <button id="mTemplate">⬇️ Download current puzzles as CSV<small>puzzles.csv for Rank it (Top 5 sheets: see puzzles.xlsx)</small></button>
    ${custom ? `<button id="mReset">↩️ Back to built-in puzzles<small>Using: ${esc(custom.name)} (${custom.puzzles.length} puzzles)</small></button>` : ""}</div>
    <h3>Your data</h3><button class="danger-btn" id="mClear">🗑️ Clear all data…<small>Stats, streaks, progress, practice history, challenge name and settings on this device</small></button>
    <p style="font-size:12px;color:var(--muted)">What Rankd stores and how ads use cookies: <a href="privacy.html">Privacy policy</a></p>`);
  $$(".seg").forEach(sg => sg.querySelectorAll("button").forEach(b => b.onclick = () => {
    settings[sg.dataset.set] = b.dataset.v; saveSettings(); sg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    if (sg.dataset.set === "theme") applyTheme(); else if (sg.dataset.set === "stream") applyStreamer(); else if (state.puzzle?.type === "rank" && !$("#playView").classList.contains("hidden")) renderRank(getResult(), true);
  }));
  $("#mLoad").onclick = () => $("#fileInput").click(); $("#mTemplate").onclick = downloadCsv;
  $("#mClear").onclick = clearDataModal;
  if ($("#mReset")) $("#mReset").onclick = () => { localStorage.removeItem(LS.custom); custom = null; PUZZLES = attachNamePuzzles(window.RANKD_PUZZLES || []); closeModal(); toast("Built-in puzzles restored"); goToday(); };
}
function clearDataModal() {   // v11.1: confirm step for "Clear all data"
  openModal(`<div id="clearConfirm" role="alertdialog" aria-labelledby="clearTitle" aria-describedby="clearDesc"><h2 id="clearTitle">Clear all data?</h2>
    <p id="clearDesc">This will erase your <b>stats, streaks, puzzle progress, practice history, challenge name and settings</b> on this device. It can't be undone.</p>
    <div class="confirm-row"><button class="pill-btn outline" id="clearCancel">Cancel</button><button class="pill-btn danger" id="clearConfirmBtn">Clear</button></div></div>`);
  $("#clearCancel").onclick = settingsModal; $("#clearCancel").focus();
  $("#clearConfirmBtn").onclick = () => { RankdData.clear(); location.replace(location.pathname); };   // drop ?stream= / #hash so nothing is re-written
}
function listModal() {   // v11: pre-launch browser of EVERY puzzle (past + future), filterable by mode; hidden when CONFIG.SHOW_ALL_PUZZLES = false
  if (!CONFIG.SHOW_ALL_PUZZLES) return;
  const all = load(LS.results, {}), today = dayNumber(todayKey()) + 1;
  const kind = p => p.type === "name" ? "name" : p.type === "top5" ? "top5" : p.type === "match" ? "match" : p.type === "tier" ? "tier" : p.items.length >= 6 ? "rank6" : (p.items.length && p.items.every(it => /^\p{RI}\p{RI}$/u.test(it.emoji)) ? "rank" : "incountry");
  const KINDS = [["any", "All"], ["rank", "Rank it"], ["rank6", "6-country"], ["top5", "Top 5"], ["match", "Match it"], ["tier", "Tier it"], ["name", "Name it"], ["incountry", "Groups"]];
  const count = k => PUZZLES.filter(p => k === "any" || kind(p) === k).length;
  openModal(`<h2>All puzzles (${PUZZLES.length})</h2><p class="plist-note">Pre-launch list: every puzzle, past and future. Plays here never count toward stats or streaks.</p>
    <div class="seg plist-filter">${KINDS.map(([k, l]) => `<button data-k="${k}" class="${k === "any" ? "on" : ""}">${l} <small>${count(k)}</small></button>`).join("")}</div>
    <div class="plist-search-wrap">
      <input class="plist-search" id="plistSearch" type="search" placeholder="Search countries, headlines, sources…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search" aria-label="Search all puzzles">
      <button type="button" class="plist-search-clear" id="plistSearchClear" aria-label="Clear search" hidden>×</button>
    </div>
    <p class="plist-count" id="plistCount" aria-live="polite"></p>
    <p class="plist-empty hidden" id="plistEmpty" role="status"></p>
    <div class="plist">${PUZZLES.map((p, i) => { const r = all["p:" + p.id];
    const rr = r && r.type === "rank" ? normRank(r) : r, o = Math.round(p.order);
    const b = rr && rr.done ? (rr.type === "rank" || rr.type === "match" || rr.type === "tier" || rr.type === "name" || (rr.type === "top5" && rr.attempts) ? (rr.solved ? `✓ ${rr.tries}` : "✗") : `🖐️ ${rr.hits || 0}/5`) : "";
    const when = o < 10000 ? `#${pad3(o)} · ${prettyDate(keyFromDay(o - 1)).replace(/, \d{4}$/, "")}${o > today ? " · future" : o === today ? " · today" : ""}` : "";
    const k = kind(p), kl = { rank: "Rank it", rank6: `Rank it · ${p.items.length} countries`, top5: "Top 5", match: `Match it · ${(p.people || []).length} pairs`, tier: `Tier it · ${(p.tiers || []).length} tiers`, name: "Name it", incountry: "Rank it · groups" }[k];
    return `<button data-i="${i}" data-k="${k}"><span class="pl-main"><b>${esc(p.emoji)} ${esc(p.headline || p.question)}</b>${p.headline && p.headline !== p.question ? `<span class="pl-sub">${esc(p.question)}</span>` : ""}<small class="pl-meta">${kl}${when ? " · " + when : ""}</small></span><span class="done">${b}</span></button>`; }).join("")}</div>`);
  let kf = "any";
  const apply = () => {
    const q = $("#plistSearch").value;
    let n = 0;
    $$(".plist button").forEach(b => {
      const p = PUZZLES[+b.dataset.i];
      const show = (kf === "any" || b.dataset.k === kf) && window.RankdSearch.matches(p, q, { gloss: valueGlossOf(p) });
      b.classList.toggle("hidden", !show);
      if (show) n++;
    });
    $("#plistCount").textContent = window.RankdSearch.countLabel(n);
    const empty = $("#plistEmpty");
    empty.textContent = q.trim() ? window.RankdSearch.emptyCopy(q) : "No puzzles in this group.";
    empty.classList.toggle("hidden", n !== 0);
    $(".plist").classList.toggle("hidden", n === 0);
  };
  $$(".plist-filter button").forEach(b => b.onclick = () => { kf = b.dataset.k; $$(".plist-filter button").forEach(x => x.classList.toggle("on", x === b)); apply(); });
  window.RankdSearch.bindSearch($("#plistSearch"), $("#plistSearchClear"), apply);
  $$(".plist button").forEach(b => b.onclick = () => { closeModal(); goAll(+b.dataset.i); });
}
function howModal() {
  openModal(`<h2>How to play</h2>
   <p><b>Rank it:</b> drag the cards (or tap ▲▼) into order and lock it in. Cards in the right spot turn 🟩 green and lock; the rest turn 🟥 red. Rearrange and lock in again. You get ${CONFIG.rankMaxTries} tries. The real numbers are always listed together in a column beside the cards; match each item to its value.</p>
   <p><b>🖐️ Top 5:</b> six country cards, the real top 5 plus one that does not belong. Drag them into the five slots (highest at #1), or tap a card and then a slot, and leave the odd one out. Lock it in. Right slots turn 🟩 green and lock; wrong ones turn 🟥 red. You get ${CONFIG.rankMaxTries} tries.</p>
   <p><b>🔗 Match it:</b> match each clue (4 to 7 of them) to the right person. Drag a clue onto a person, or tap a clue and then the person. When all are placed, lock it in: right pairs turn 🟩 green and lock, wrong ones turn 🟥 red. Fix them and try again, ${CONFIG.rankMaxTries} tries in all.</p>
   <p><b>📊 Tier it:</b> drop each country onto a labeled tier (several can share a tier). Lock it in: right tiers turn 🟩 green and lock, wrong ones turn 🟥 red. ${CONFIG.rankMaxTries} tries. After you finish, the real % stays on each chip.</p>
   <p><b>✏️ Name it:</b> type any country that passes both rules (a letter or word rule, plus a stat). Aliases such as USA and Korea count. A guess that isn't a country, or one you already tried, doesn't use a try. Any valid country wins. ${CONFIG.rankMaxTries} tries. Each miss says which rule it broke. At the end, every valid answer is shown.</p>
   <p>Each missed Top 5 lock reveals one hint about the highest-ranked slot you still have wrong, getting more specific each time. A correct slot doesn't spend a hint. When the answer is revealed, the card you left out shows its real rank.</p>
   <p>🎉 Solve a Rank it, Match it, Tier it, Top 5 or Name it on the 1st or 2nd try for a celebration. First try = the big one. Every card in the wrong spot on the first try — or a Top 5 where all five slots are wrong on the first try — gets a playful Ignorant!. So does a Name it loss where every guess was wrong.</p>
   <p>A new daily puzzle drops at local midnight. Missed one? It's in the Archive. Every number links to its source.</p>`);
}
function aboutModal() {
  openModal(`<h2>About &amp; sources</h2><p style="color:var(--muted);font-size:14px">Rankd is a prototype. Every value and hint comes from the source linked below.</p>
    <ol class="src-list">${PUZZLES.map(p => `<li>${esc(p.emoji)} ${esc(fullTitle(p))}<br>${p.sourceUrl ? `<a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">${esc(p.source || p.sourceUrl)}</a>` : esc(p.source)}${
      p.type === "top5" ? `<br><small>Hints: World Bank (population SP.POP.TOTL; GDP per capita NY.GDP.PCAP.CD, current US$; capital cities), 6-continent grouping, standard landlocked list</small>` : ""}</li>`).join("")}</ol>`);
}
function downloadCsv() {
  const cols = SHEET_COLS.puzzles, q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v), lines = [cols.join(",")];
  PUZZLES.filter(p => p.type === "rank").forEach(p => p.items.forEach((it, n) => lines.push([p.id, n ? "" : p.order, n ? "" : p.emoji, n ? "" : p.question, n ? "" : p.stat, n ? "" : p.unit,
    n ? "" : p.higherIs, n ? "" : (p.valuesVisible ? "yes" : "no"), it.name, it.emoji, it.value, it.year, n ? "" : p.source, n ? "" : p.sourceUrl, n ? "" : p.fact, it.gRank || "", it.gTotal || "", it.gScope || "", n ? "" : (p.art || ""), n ? "" : (p.support || ""), n ? "" : (p.dataset || ""), "", n ? "" : (p.headline || "")].map(q).join(","))));
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" })); a.download = "rankd-puzzles.csv"; a.click();
}

// ================================================================ spreadsheet upload (xlsx or CSVs)
async function handleFiles(files) {
  if (!window.XLSX) { toast("Spreadsheet reader failed to load"); return; }
  try {
    const tables = {}; let name = [];
    for (const file of files) {
      name.push(file.name);
      const isCsv = /\.csv$/i.test(file.name);
      const wb = isCsv ? XLSX.read(await file.text(), { type: "string" }) : XLSX.read(await file.arrayBuffer(), { type: "array" });
      for (const sn of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: "" }); if (!rows.length) continue;
        const known = Object.keys(SHEET_COLS).find(k => k === sn.trim().toLowerCase()) || sheetTypeOf(Object.keys(rows[0]));
        if (known) tables[known] = (tables[known] || []).concat(rows);
      }
    }
    const puzzles = parseTables(tables);
    if (!puzzles.length) { toast("No valid puzzles found. Check the sheet names / column headers."); return; }
    custom = { name: name.join(", "), puzzles, loadedAt: Date.now() }; save(LS.custom, custom); PUZZLES = puzzles;
    const t5 = puzzles.filter(p => p.type === "top5").length, conv = puzzles.filter(p => p.convertedFrom === "top5").length;
    closeModal(); const nm = puzzles.filter(p => p.type === "match").length, tierN = puzzles.filter(p => p.type === "tier").length; toast(`Loaded ${puzzles.length} puzzles (${puzzles.length - t5 - nm - tierN} rank, ${t5} top 5${nm ? `, ${nm} match` : ""}${tierN ? `, ${tierN} tier` : ""})${conv ? ` · ${conv} Top 5 → Rank it (fewer than ${MIN_TOP5_COUNTRIES} countries)` : ""}`); CONFIG.SHOW_ALL_PUZZLES ? goAll(0) : goToday();
  } catch (e) { console.error(e); toast("Couldn't read that file: " + e.message); }
}
window.RankdLoadFiles = handleFiles; window.RankdArt = { svg: artSvg, keys: Object.keys(ART) };

// ================================================================ wire up
$("#submitBtn").onclick = submitRank; $("#matchSubmit").onclick = submitMatch; $("#tierSubmit").onclick = submitTier; if ($("#t5Submit")) $("#t5Submit").onclick = submitTop5; $("#nextBtn").onclick = next; $("#fab").onclick = fabGo;
if ($("#crossPromoDismiss")) $("#crossPromoDismiss").onclick = dismissCrossPromo;
if ($("#crossPromoCta")) $("#crossPromoCta").addEventListener("click", dismissCrossPromo);
$("#shareResultBtn").onclick = () => doShare(resultText());
$("#shareChallengeBtn").onclick = $("#shareChallengeTop").onclick = () => doShare(challengeText());
if ($("#challengeFriendBtn")) $("#challengeFriendBtn").onclick = () => shareChallengeFriend();
$("#menuBtn").onclick = menuModal;
$("#modalClose").onclick = closeModal;
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
$("#aboutLink").onclick = e => { e.preventDefault(); aboutModal(); };
$("#homeLink").onclick = e => { e.preventDefault(); goToday(); };
$("#fileInput").onchange = e => { const f = [...e.target.files]; if (f.length) handleFiles(f); e.target.value = ""; };
$$(".tab").forEach(b => b.onclick = () => b.dataset.view === "today" ? goToday() : b.dataset.view === "archive" ? goArchive() : practiceNext());   // v12.1: no top-bar "All" tab (the All puzzles list is in the menu)
$("#newRandomTop").onclick = () => practiceNext();
// v12.2: footer "Contact" = the CONTACT_EMAIL from site-config.js (the one place it is set)
{ const mail = (window.RANKD_SITE || {}).CONTACT_EMAIL || ""; $$("[data-contact-link]").forEach(a => mail.includes("@") ? a.href = "mailto:" + mail : a.remove()); }

if (!Practice.ok()) { $$('.tab[data-view="practice"]').forEach(b => b.remove()); }
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
  if (e.key === "Enter" && !e.target.closest("input, textarea, [contenteditable]") && !$("#playView").classList.contains("hidden")) {
    const p = state.puzzle; if (!p || state.busy) return;
    if (p.type === "rank" && !$("#submitBtn").parentElement.classList.contains("hidden")) { e.preventDefault(); submitRank(); }
    else if (p.type === "match" && !$("#matchSubmit").parentElement.classList.contains("hidden")) { e.preventDefault(); submitMatch(); }
    else if (p.type === "tier" && !$("#tierSubmit").parentElement.classList.contains("hidden")) { e.preventDefault(); submitTier(); }
    else if (p.type === "top5" && $("#t5Submit") && !$("#t5Submit").parentElement.classList.contains("hidden")) { e.preventDefault(); submitTop5(); }
  }
});

applyTheme(); applyStreamer(); applyPremium();
if (!PUZZLES.length) { $("#headline").textContent = "No puzzles found. Run build.py or load a spreadsheet."; return; }
function route() {
  dismissLongAd();
  if (/^\d{4}-\d{2}-\d{2}$/.test(PREVIEW)) return goPreview(PREVIEW);
  const h = location.hash;
  const RC = window.RankdChallenge;
  const token = (RC ? RC.tokenFromHash(h) : "") || (RC ? RC.tokenFromHash(location.search) : "");
  const d = h.match(/(?:^#|[?&#])d=(\d{4}-\d{2}-\d{2})/);
  const p = h.match(/(?:^#|[?&#])p=([^&]+)/);
  const rs = h.match(/(?:^#|[?&#])r=(\d+)/);
  const opts = token ? { challengeToken: token } : null;
  if (/^#archive(?:$|&)/.test(h)) return goArchive();
  if (d) return goDate(d[1], opts);
  if (rs && Practice.ok()) return goPractice(+rs[1], opts);
  if (p && CONFIG.SHOW_ALL_PUZZLES) { const i = PUZZLES.findIndex(x => x.id === decodeURIComponent(p[1])); if (i >= 0) return goAll(i, opts); }
  goToday();
}
window.addEventListener("hashchange", () => { if (!PREVIEW && (location.hash !== linkHash() || $("#playView").classList.contains("hidden"))) route(); });
route();
maybeShowHowto();
})();
