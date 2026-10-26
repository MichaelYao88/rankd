/* Ranki service worker.
   Shell (HTML, CSS, JS, icons) is cached so the game opens offline.
   HTML navigations and puzzle data are network-first: a new day's puzzle
   replaces the cache whenever the network succeeds.
   Other static assets are stale-while-revalidate.

   Ads, PostHog, Supabase, ads.txt, Studio, ?preview=, non-GET, and
   cross-origin requests are not intercepted. The fetch handler returns
   without respondWith so the browser handles them itself.

   skipWaiting + clients.claim roll an update out as soon as the new shell
   is cached. The page does not reload on controllerchange, so a puzzle
   already on screen keeps the scripts and board it already has. The next
   navigation picks up the new HTML and puzzle data. */
"use strict";

var CACHE = "ranki-shell-v4";

var PRECACHE = [
  "/",
  "/index.html",
  "/about.html",
  "/privacy.html",
  "/how-to-play.html",
  "/styles.css",
  "/app.js",
  "/site-config.js",
  "/pages.js",
  "/pwa.js",
  "/puzzle-search.js",
  "/name-puzzles.js",
  "/name-it.js",
  "/challenge.js",
  "/puzzles-data.js",
  "/practice-data.js",
  "/community-seed.js",
  "/community-stats.json",
  "/puzzles.csv",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/vendor/sortable.min.js",
  "/vendor/xlsx.full.min.js"
];

// No cross-origin font or static host is cached on purpose. The site uses
// system fonts. A future font host can be added here; ad/analytics hosts
// are still refused below even if they were listed.
var FONT_HOSTS = [];

function hostEnds(host, suffix) {
  host = String(host || "").toLowerCase();
  suffix = String(suffix || "").toLowerCase();
  return host === suffix || host.slice(-(suffix.length + 1)) === "." + suffix;
}

function isGoogleAd(url) {
  var host = url.hostname.toLowerCase();
  var path = url.pathname.toLowerCase();
  var adHosts = [
    "googlesyndication.com",
    "doubleclick.net",
    "googleadservices.com",
    "googletagservices.com",
    "adtrafficquality.google",
    "2mdn.net",
    "fundingchoicesmessages.google.com",
    "fundingchoices.google.com"
  ];
  var i;
  for (i = 0; i < adHosts.length; i++) if (hostEnds(host, adHosts[i])) return true;
  if (host === "adservice.google.com" || host.indexOf("adservice.google.") === 0) return true;
  if (host === "ads.google.com" || host.indexOf("ads.google.") === 0) return true;
  if (host === "google.com" || hostEnds(host, "google.com")) {
    if (path.indexOf("/adsense") === 0 || path.indexOf("/pagead") === 0 || path.indexOf("/aclk") === 0 || path.indexOf("/ads/") !== -1) return true;
  }
  if (hostEnds(host, "gstatic.com")) {
    if (/\/(ads|adsense|pagead|fundingchoices|adx|doubleclick)(\/|$)/.test(path)) return true;
  }
  return false;
}

function isPosthog(url) {
  var host = url.hostname.toLowerCase();
  return host === "us.i.posthog.com" || host === "us-assets.i.posthog.com" || host === "posthog.com" || hostEnds(host, "posthog.com");
}

function isSupabase(url) {
  var host = url.hostname.toLowerCase();
  if (host === "supabase.co" || hostEnds(host, "supabase.co")) return true;
  return url.href.indexOf("fkxbqftqxvgqrtvkpglx.supabase.co/functions/v1/community-stats") !== -1;
}

function isStudioPath(pathname) {
  var p = String(pathname || "").toLowerCase();
  return /(?:^|\/)studio\.html$/.test(p) || /(?:^|\/)loadingzone\.html$/.test(p) || /(?:^|\/)loadingzone\/?$/.test(p) || /(?:^|\/)loadingzone\//.test(p);
}

function isPuzzleData(url) {
  var path = url.pathname.toLowerCase();
  if (path.endsWith(".json") || path.endsWith(".csv")) return true;
  return /\/(puzzles-data|practice-data|community-seed)\.js$/.test(path);
}

function isNavigation(request) {
  return request.mode === "navigate" || request.destination === "document";
}

function hasRange(request) {
  try {
    return !!(request.headers && typeof request.headers.get === "function" && request.headers.get("range"));
  } catch (e) {
    return false;
  }
}

function isDeliberateCrossOrigin(url) {
  if (!FONT_HOSTS.length) return false;
  var host = url.hostname.toLowerCase();
  var listed = false;
  var i;
  for (i = 0; i < FONT_HOSTS.length; i++) if (hostEnds(host, FONT_HOSTS[i])) listed = true;
  if (!listed) return false;
  if (isGoogleAd(url) || isPosthog(url) || isSupabase(url)) return false;
  return /\.(?:woff2?|ttf|otf)$/i.test(url.pathname);
}

function rankiBypassReason(request) {
  var method = (request && request.method) || "GET";
  var raw = request && request.url;
  var url;
  try { url = new URL(raw); } catch (e) { return "url"; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "protocol";
  if (method !== "GET") return "method";
  if (hasRange(request)) return "range";
  if (isGoogleAd(url)) return "google-ad";
  if (isPosthog(url)) return "posthog";
  if (isSupabase(url)) return "supabase";
  if (url.pathname === "/ads.txt" || url.pathname.endsWith("/ads.txt")) return "ads-txt";
  if (url.searchParams.has("preview")) return "preview";
  if (isStudioPath(url.pathname)) return "studio";
  var origin = (self.location && self.location.origin) || "";
  if (url.origin !== origin) return isDeliberateCrossOrigin(url) ? "" : "cross-origin";
  return "";
}

function rankiShouldBypass(request) {
  return !!rankiBypassReason(request);
}

function rankiPlan(request) {
  if (rankiShouldBypass(request)) return "bypass";
  var url = new URL(request.url);
  if (isNavigation(request) || isPuzzleData(url)) return "network-first";
  return "stale-while-revalidate";
}

function offlineResponse() {
  return new Response("Offline", { status: 503, statusText: "Offline", headers: { "Content-Type": "text/plain;charset=utf-8" } });
}

async function store(cache, key, res) {
  try {
    if (!res || res.status !== 200) return false;
    if (res.type && res.type !== "basic" && res.type !== "default") return false;
    var copy = new Response(await res.clone().blob(), { status: res.status, statusText: res.statusText, headers: new Headers(res.headers) });
    await cache.put(key, copy);
    return true;
  } catch (e) {
    return false;
  }
}

async function precache() {
  var cache = await caches.open(CACHE);
  var i;
  for (i = 0; i < PRECACHE.length; i++) {
    var path = PRECACHE[i];
    var res = await fetch(new Request(path, { cache: "reload" }));
    if (!res || !res.ok) throw new Error("precache " + path);
    if (!await store(cache, path, res)) throw new Error("precache " + path);
  }
}

async function matchFallback(request) {
  var cached = await caches.match(request);
  if (cached) return cached;
  if (isNavigation(request)) return (await caches.match("/index.html")) || (await caches.match("/"));
  return null;
}

function networkFetch(request) {
  // Reload skips the HTTP cache. GitHub Pages can hold a JS file for minutes;
  // without this, network-first would still serve yesterday's puzzle.
  try { return fetch(request, { cache: "reload" }); }
  catch (e) { return fetch(request); }
}

async function networkFirst(request) {
  var cache = await caches.open(CACHE);
  try {
    var fresh = await networkFetch(request);
    if (fresh && fresh.status === 200 && fresh.type === "basic") {
      await store(cache, request, fresh);
      return fresh;
    }
    if (fresh && fresh.status >= 500) {
      var fallback = await matchFallback(request);
      if (fallback) return fallback;
    }
    return fresh;
  } catch (e) {
    var cached = await matchFallback(request);
    return cached || offlineResponse();
  }
}

async function staleWhileRevalidate(request) {
  var cache = await caches.open(CACHE);
  var cached = await cache.match(request);
  var refresh = networkFetch(request).then(function (fresh) {
    if (fresh && fresh.status === 200 && fresh.type === "basic") return store(cache, request, fresh).then(function () { return fresh; });
    return fresh;
  }).catch(function () { return null; });
  if (cached) return cached;
  var fresh = await refresh;
  return fresh || offlineResponse();
}

self.addEventListener("install", function (event) {
  event.waitUntil(precache().then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (key) { return key.indexOf("ranki-") === 0 && key !== CACHE; }).map(function (key) { return caches.delete(key); }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", function (event) {
  if (rankiShouldBypass(event.request)) return;
  var plan = rankiPlan(event.request);
  if (plan === "network-first") event.respondWith(networkFirst(event.request));
  else if (plan === "stale-while-revalidate") event.respondWith(staleWhileRevalidate(event.request));
});

self.rankiCACHE = CACHE;
self.rankiShouldBypass = rankiShouldBypass;
self.rankiBypassReason = rankiBypassReason;
self.rankiPlan = rankiPlan;
self.rankiIsGoogleAd = isGoogleAd;
self.rankiIsPosthog = isPosthog;
self.rankiIsSupabase = isSupabase;
