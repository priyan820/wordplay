/* sw.js - the offline guarantee.
 *
 * Precaches the whole app on first load: every script, every photo, every
 * recording. After that the network is never needed and never consulted for
 * anything the app shows.
 *
 * The photo and audio lists are NOT hard-coded here. They are read from
 * images/manifest.json and audio/manifest.json at install time, so adding
 * pictures or audio never means hand-editing this file - which is the
 * kind of chore that eventually gets forgotten and breaks offline mode.
 */

var VERSION = "wordplay-v3";

var CORE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/words.js",
  "js/db.js",
  "js/zip.js",
  "js/audio.js",
  "js/scheduler.js",
  "js/share.js",
  "js/session.js",
  "js/parent.js",
  "js/app.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon-180.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return listAssets().then(function (extra) {
        var all = CORE.concat(extra);
        /* One bad URL must not fail the whole install and leave her with no
         * offline app, so each is added on its own and failures are ignored. */
        return Promise.all(all.map(function (url) {
          return cache.add(new Request(url, { cache: "reload" }))
                      .catch(function () { return null; });
        }));
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

function listAssets() {
  var images = fetch("images/manifest.json", { cache: "reload" })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (j) {
      return Object.keys(j || {}).map(function (k) { return "images/" + j[k].file; });
    })
    .catch(function () { return []; });

  var audio = fetch("audio/manifest.json", { cache: "reload" })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (j) {
      var out = ["audio/manifest.json"];
      Object.keys(j || {}).forEach(function (k) { out.push("audio/" + j[k]); });
      return out;
    })
    .catch(function () { return []; });

  /* Recorded overrides, committed into /voice/. Same trick as the other two:
   * read the list from its manifest so adding recordings never means
   * hand-editing this file. */
  var voice = fetch("voice/manifest.json", { cache: "reload" })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (j) {
      var out = ["voice/manifest.json"];
      Object.keys(j || {}).forEach(function (k) { out.push("voice/" + j[k]); });
      return out;
    })
    .catch(function () { return []; });

  var manifests = Promise.resolve(["images/manifest.json"]);

  return Promise.all([images, audio, voice, manifests]).then(function (r) {
    return r[0].concat(r[1], r[2], r[3]);
  });
}

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; })
                             .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   /* nothing else exists */

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) {
        /* Cache first, always. Offline is the normal case, not the exception.
         * A quiet background refresh keeps a deploy from going stale without
         * ever making her wait for the network. */
        if (navigator.onLine) refresh(req);
        return hit;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        /* Offline and not cached: for a navigation, hand back the app shell
         * rather than a browser error page. */
        if (req.mode === "navigate") return caches.match("index.html");
        return new Response("", { status: 504, statusText: "offline" });
      });
    })
  );
});

function refresh(req) {
  fetch(req).then(function (res) {
    if (res && res.ok && res.type === "basic") {
      caches.open(VERSION).then(function (c) { c.put(req, res); });
    }
  }).catch(function () { /* offline: the cached copy stands */ });
}
