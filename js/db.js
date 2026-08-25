/* db.js - everything that persists, in one place.
 *
 * Five stores:
 *   attempts   one row per tap of a scoring button. The raw log. Append-only.
 *   state      one row per word+language pair. The scheduler's working memory.
 *   queue      one row per day. Lets her resume exactly where she left off.
 *   recordings your voices, until they are exported and committed to the repo.
 *   meta       device id, session counter, import history, settings.
 *
 * Nothing in here talks to a network. There is no fetch, no XHR, no beacon.
 */

var DB = (function () {
  "use strict";

  var NAME = "wordplay";
  var VERSION = 1;
  var _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains("attempts")) {
          var a = db.createObjectStore("attempts", { keyPath: "id" });
          a.createIndex("by_ts", "ts");
          a.createIndex("by_word", "wordId");
        }
        if (!db.objectStoreNames.contains("state"))      db.createObjectStore("state",      { keyPath: "key" });
        if (!db.objectStoreNames.contains("queue"))      db.createObjectStore("queue",      { keyPath: "day" });
        if (!db.objectStoreNames.contains("recordings")) db.createObjectStore("recordings", { keyPath: "key" });
        if (!db.objectStoreNames.contains("meta"))       db.createObjectStore("meta",       { keyPath: "k" });
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror   = function () { reject(req.error); };
    });
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode || "readonly");
        var out;
        var r = fn(t.objectStore(store));
        if (r && typeof r.onsuccess !== "undefined") {
          r.onsuccess = function () { out = r.result; };
        } else {
          out = r;
        }
        t.oncomplete = function () { resolve(out); };
        t.onerror    = function () { reject(t.error); };
        t.onabort    = function () { reject(t.error); };
      });
    });
  }

  function get(store, key)  { return tx(store, "readonly",  function (s) { return s.get(key); }); }
  function put(store, val)  { return tx(store, "readwrite", function (s) { return s.put(val); }); }
  function del(store, key)  { return tx(store, "readwrite", function (s) { return s.delete(key); }); }
  function all(store)       { return tx(store, "readonly",  function (s) { return s.getAll(); }); }
  function count(store)     { return tx(store, "readonly",  function (s) { return s.count(); }); }

  function putMany(store, rows) {
    if (!rows || !rows.length) return Promise.resolve(0);
    return tx(store, "readwrite", function (s) {
      rows.forEach(function (r) { s.put(r); });
      return rows.length;
    });
  }

  /* meta is a plain key/value drawer, used often enough to deserve shortcuts. */
  function metaGet(k, fallback) {
    return get("meta", k).then(function (row) {
      return row && typeof row.v !== "undefined" ? row.v : fallback;
    });
  }
  function metaSet(k, v) { return put("meta", { k: k, v: v }); }

  /* Rolling 14 days. The state rows survive - they are small, and they are what
   * the scheduler actually reads. The exported files are the real archive. */
  function pruneAttempts(days) {
    var cutoff = Date.now() - (days || 14) * 86400000;
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction("attempts", "readwrite");
        var idx = t.objectStore("attempts").index("by_ts");
        var n = 0;
        idx.openCursor(IDBKeyRange.upperBound(cutoff)).onsuccess = function (e) {
          var c = e.target.result;
          if (c) { c.delete(); n++; c.continue(); }
        };
        t.oncomplete = function () { resolve(n); };
        t.onerror    = function () { reject(t.error); };
      });
    });
  }

  /* Ask the browser to treat this data as permanent rather than cache it can
   * throw away. Home-screen apps are exempt from Safari's 7-day eviction, but
   * asking costs nothing and covers the case where she opens it in a tab. */
  function requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist().catch(function () { return false; });
    }
    return Promise.resolve(false);
  }

  return {
    open: open, get: get, put: put, del: del, all: all, count: count,
    putMany: putMany, metaGet: metaGet, metaSet: metaSet,
    pruneAttempts: pruneAttempts, requestPersistence: requestPersistence
  };
}());
