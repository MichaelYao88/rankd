/* Challenge-a-friend links. The puzzle locator stays in the hash (#d=, #r=, #p=) and the
   result rides along as &c=<base64url>. Payload is tries, DNF, accuracy, and the green/red
   square rows only — never the order or the answer. No network. */
(function (root) {
  "use strict";

  const NAME_MAX = 16;
  const DEFAULT_NAME = "Your friend";
  const KINDS = { d: true, r: true, p: true };

  function sanitizeName(value) {
    let s = String(value == null ? "" : value).slice(0, 80);
    try { s = s.normalize("NFKC"); } catch (e) { /* keep the raw slice */ }
    s = s.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "");
    s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
    s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
    s = s.replace(/<[^>]*>/g, "");
    s = s.replace(/[<>&"'`|\\]/g, "");
    // The banner is spoiler-free. A name can't smuggle the square grid.
    s = s.replace(/[🟩🟥⬜🟨🟧✅❌]/g, "");
    s = s.replace(/\s+/g, " ").trim();
    const chars = Array.from(s);
    if (chars.length > NAME_MAX) s = chars.slice(0, NAME_MAX).join("").trim();
    return s;
  }

  function bytesToB64url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  function b64urlToString(token) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{8,800}$/.test(token)) return null;
    let s = token.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    let bin;
    try { bin = atob(s); } catch (e) { return null; }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 255;
    try { return new TextDecoder().decode(bytes); } catch (e) { return null; }
  }

  function intField(s, max) {
    if (typeof s !== "string" || !/^(0|[1-9]\d*)$/.test(s)) return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n > max) return null;
    return n;
  }

  function validId(k, id) {
    if (!id || id.length > 80 || /[|\r\n]/.test(id)) return false;
    if (k === "d") return /^\d{4}-\d{2}-\d{2}$/.test(id);
    if (k === "r") return /^\d{1,12}$/.test(id);
    if (k === "p") return /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id);
    return false;
  }

  function validGrid(grid) {
    if (!Array.isArray(grid) || grid.length < 1 || grid.length > 8) return false;
    return grid.every(row => typeof row === "string" && /^[GRMYO]{1,20}$/.test(row));
  }

  function encode(data) {
    if (!data || !KINDS[data.k]) return "";
    const id = String(data.id == null ? "" : data.id);
    if (!validId(data.k, id)) return "";
    const tries = data.tries;
    const acc = data.acc;
    if (!Number.isInteger(tries) || tries < 0 || tries > 40) return "";
    if (!Number.isInteger(acc) || acc < 0 || acc > 100) return "";
    if (!validGrid(data.grid)) return "";
    const name = sanitizeName(data.name);
    const raw = ["1", data.k, id, String(tries), data.dnf ? "1" : "0", String(acc), data.grid.join("."), name].join("|");
    try { return bytesToB64url(new TextEncoder().encode(raw)); } catch (e) { return ""; }
  }

  function decode(token) {
    const raw = b64urlToString(String(token || "").trim());
    if (raw == null || raw.length > 600) return null;
    const parts = raw.split("|");
    if (parts.length !== 8) return null;
    const v = parts[0], k = parts[1], id = parts[2], triesS = parts[3], dnfS = parts[4], accS = parts[5], gridS = parts[6], nameRaw = parts[7];
    if (v !== "1" || !KINDS[k] || !validId(k, id)) return null;
    const tries = intField(triesS, 40);
    const acc = intField(accS, 100);
    if (tries == null || acc == null) return null;
    if (dnfS !== "0" && dnfS !== "1") return null;
    const grid = gridS.split(".");
    if (!validGrid(grid)) return null;
    return { v: 1, k: k, id: id, tries: tries, dnf: dnfS === "1", acc: acc, grid: grid, name: sanitizeName(nameRaw) };
  }

  function matches(ch, ref) {
    return !!(ch && ref && ch.k === ref.k && String(ch.id) === String(ref.id));
  }

  function displayName(ch) {
    const n = sanitizeName(ch && ch.name);
    return n || DEFAULT_NAME;
  }

  /* Fewer tries wins. A finish beats a DNF. Equal tries: higher accuracy wins. Else a tie. */
  function winner(me, them) {
    if (!me || !them) return "";
    const side = s => ({
      dnf: !!s.dnf,
      tries: Number.isFinite(Number(s.tries)) ? Number(s.tries) : 99,
      acc: Number.isFinite(Number(s.acc)) ? Number(s.acc) : -1,
    });
    const a = side(me), b = side(them);
    if (a.dnf !== b.dnf) return a.dnf ? "them" : "you";
    if (a.tries !== b.tries) return a.tries < b.tries ? "you" : "them";
    if (a.acc !== b.acc) return a.acc > b.acc ? "you" : "them";
    return "tie";
  }

  function verdictLine(code) {
    if (code === "you") return "You win!";
    if (code === "them") return "They win";
    if (code === "tie") return "Tie";
    return "";
  }

  function tryWord(n) { return n === 1 ? "try" : "tries"; }

  function bannerLine(ch) {
    if (!ch) return "";
    const name = displayName(ch);
    const acc = "accuracy " + ch.acc;
    const word = tryWord(ch.tries);
    if (ch.dnf) return name + " didn't finish (" + ch.tries + " " + word + ", " + acc + "). Can you beat them?";
    return name + " solved this in " + ch.tries + " " + word + " (" + acc + "). Can you beat them?";
  }

  function shareLine(name, score) {
    if (!score) return "";
    const who = sanitizeName(name);
    const word = tryWord(score.tries);
    const acc = "accuracy " + score.acc;
    if (score.dnf) {
      return who
        ? who + " didn't finish this ranki.gg puzzle (" + score.tries + " " + word + ", " + acc + "). Can you beat them?"
        : "I didn't finish this ranki.gg puzzle (" + score.tries + " " + word + ", " + acc + "). Can you beat me?";
    }
    return who
      ? who + " solved this ranki.gg puzzle in " + score.tries + " " + word + " (" + acc + "). Can you beat them?"
      : "I solved this ranki.gg puzzle in " + score.tries + " " + word + " (" + acc + "). Can you beat me?";
  }

  const SQUARE = { G: "🟩", R: "🟥", M: "⬜", Y: "🟨", O: "🟧" };
  function gridText(grid) {
    return (grid || []).map(row => Array.from(row).map(ch => SQUARE[ch] || "").join("")).join("\n");
  }

  /* A valid challenge for this archive day is playable without the unlock ad.
     It does not change the saved unlock depth. */
  function bypassArchiveAd(ch, dateKey) {
    return !!(ch && ch.k === "d" && ch.id === dateKey);
  }

  function tokenFromHash(h) {
    const m = String(h || "").match(/(?:^#|[?&])c=([A-Za-z0-9_-]{8,800})/);
    return m ? m[1] : "";
  }

  root.RankdChallenge = {
    NAME_MAX: NAME_MAX,
    DEFAULT_NAME: DEFAULT_NAME,
    sanitizeName: sanitizeName,
    encode: encode,
    decode: decode,
    matches: matches,
    displayName: displayName,
    winner: winner,
    verdictLine: verdictLine,
    bannerLine: bannerLine,
    shareLine: shareLine,
    gridText: gridText,
    bypassArchiveAd: bypassArchiveAd,
    tokenFromHash: tokenFromHash,
  };
})(typeof window !== "undefined" ? window : globalThis);
