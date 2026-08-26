/* audio.js - what she hears.
 *
 * Every word ships a generated clip for every language, committed to the repo.
 * On top of that sits an OVERRIDE layer: a real human recording for a specific
 * word in a specific language, which wins whenever it exists. That is how a
 * mispronounced Hindi or Gujarati word gets fixed one word at a time without
 * anything else changing.
 *
 * Resolution order, highest first:
 *   1. a recording made on THIS phone   (live the instant it is made)
 *   2. a committed override in /voice/  (how the other phone gets it)
 *   3. the generated clip in /audio/    (unchanged for anything unrecorded)
 *   4. speechSynthesis, English and Hindi only, if a file fails to load
 *   5. silence
 *
 * Nothing here depends on which voices a given iPhone ships, so both phones
 * sound the same and it all works offline.
 */

var AUDIO = (function () {
  "use strict";

  var ctx = null;
  var unlocked = false;
  var manifest = {};      /* generated: "water|hi" -> "water__hi.mp3"        */
  var voiceManifest = {}; /* committed overrides: "water|hi" -> "water__hi.m4a" */
  var localKeys = {};     /* overrides recorded on THIS phone, from IndexedDB   */
  var current = null;

  /* ------------------------------------------------------------- startup -- */

  function init() {
    var gen = fetch("audio/manifest.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { manifest = j || {}; })
      .catch(function () { manifest = {}; });

    var voi = fetch("voice/manifest.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { voiceManifest = j || {}; })
      .catch(function () { voiceManifest = {}; });

    return Promise.all([gen, voi, refreshLocalKeys()]);
  }

  /* Which words this phone has its own recording for. Read once at startup and
   * again after every record, upload, delete or import. */
  function refreshLocalKeys() {
    return DB.all("recordings").then(function (rows) {
      localKeys = {};
      (rows || []).forEach(function (r) { localKeys[r.key] = true; });
      return localKeys;
    }).catch(function () { localKeys = {}; return localKeys; });
  }

  /* iOS plays nothing until a real finger has touched the screen. Every sound
   * in this app follows her tap, so one unlock covers the whole session. */
  function unlock() {
    if (unlocked) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      var b = ctx.createBuffer(1, 1, 22050);
      var s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
      unlocked = true;
    } catch (e) { /* not fatal - files still play through <audio> */ }
  }

  /* --------------------------------------------------------- what exists -- */

  function keyFor(wordId, lang) { return wordId + "|" + lang; }
  function hasClip(wordId, lang) { return !!manifest[keyFor(wordId, lang)]; }
  function canSpeak(lang) { return TTS_LANGS.indexOf(lang) !== -1; }

  /* True when a human recording replaces the generated clip - either one made
   * on this phone, or one committed into /voice/ and shipped with the app. */
  function hasOverride(wordId, lang) {
    var k = keyFor(wordId, lang);
    return !!(localKeys[k] || voiceManifest[k]);
  }
  function overrideIsLocal(wordId, lang) { return !!localKeys[keyFor(wordId, lang)]; }

  function overrideCount(lang) {
    var n = 0;
    WORDS.forEach(function (w) { if (hasOverride(w.id, lang)) n++; });
    return n;
  }

  /* The scheduler asks this before queueing a word. With a full set of clips
   * this is true for everything, but it stays honest if one is ever missing. */
  function isPlayable(wordId, lang) {
    return hasClip(wordId, lang) || canSpeak(lang);
  }

  function coverage() {
    var total = 0, done = 0;
    WORDS.forEach(function (w) {
      LANGS.forEach(function (l) {
        total++;
        if (hasClip(w.id, l.code)) done++;
      });
    });
    return { done: done, total: total };
  }

  function missing() {
    var out = [];
    WORDS.forEach(function (w) {
      LANGS.forEach(function (l) {
        if (!hasClip(w.id, l.code)) out.push(w.labels[l.code].roman + " (" + l.code + ")");
      });
    });
    return out;
  }

  /* ------------------------------------------------------------ playing -- */

  function stop() {
    if (current) {
      try { current.pause(); } catch (e) {}
      if (current._url) URL.revokeObjectURL(current._url);
      current = null;
    }
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  }

  function playBlob(blob) {
    return new Promise(function (resolve) {
      stop();
      var url = URL.createObjectURL(blob);
      var el = new Audio();
      el._url = url;
      el.src = url;
      current = el;
      el.onended = function () { URL.revokeObjectURL(url); resolve(true); };
      el.onerror = function () { URL.revokeObjectURL(url); resolve(false); };
      el.play().catch(function () { resolve(false); });
    });
  }

  function playUrl(url) {
    return new Promise(function (resolve) {
      stop();
      var el = new Audio();
      el.src = url;
      el.preload = "auto";
      current = el;
      el.onended = function () { resolve(true); };
      el.onerror = function () { resolve(false); };
      el.play().catch(function () { resolve(false); });
    });
  }

  function speak(word, lang) {
    return new Promise(function (resolve) {
      var label = word.labels[lang];
      if (!label || !label.ttsLang || !window.speechSynthesis) return resolve(false);
      try {
        stop();
        var u = new SpeechSynthesisUtterance(label.tts || label.text);
        u.lang = label.ttsLang;
        u.rate = 0.85;          /* a shade slow - she is three */
        u.pitch = 1.05;
        var vs = window.speechSynthesis.getVoices() || [];
        var base = label.ttsLang.split("-")[0];
        var match = vs.filter(function (v) { return v.lang === label.ttsLang; })[0] ||
                    vs.filter(function (v) { return v.lang.indexOf(base) === 0; })[0];
        if (match) u.voice = match;
        u.onend   = function () { resolve(true); };
        u.onerror = function () { resolve(false); };
        window.speechSynthesis.speak(u);
      } catch (e) { resolve(false); }
    });
  }

  /* Returns { played: bool, voice: "clip"|"tts"|"none" } */
  function playWord(wordId, lang) {
    var word = WORDS.filter(function (w) { return w.id === wordId; })[0];
    if (!word) return Promise.resolve({ played: false, voice: "none" });

    function fallback() {
      if (canSpeak(lang)) {
        return speak(word, lang).then(function (ok) {
          return { played: ok, voice: ok ? "tts" : "none" };
        });
      }
      return Promise.resolve({ played: false, voice: "none" });
    }

    var key = keyFor(wordId, lang);

    function generated() {
      var file = manifest[key];
      if (!file) return fallback();
      return playUrl("audio/" + file).then(function (ok) {
        return ok ? { played: true, voice: "clip" } : fallback();
      });
    }

    /* 1. a recording made on this phone - live the moment it is made */
    if (localKeys[key]) {
      return DB.get("recordings", key).then(function (rec) {
        if (rec && rec.blob) {
          return playBlob(rec.blob).then(function (ok) {
            return ok ? { played: true, voice: "mine" } : generated();
          });
        }
        return generated();
      }).catch(generated);
    }

    /* 2. a committed override, which is how the other phone gets it */
    if (voiceManifest[key]) {
      return playUrl("voice/" + voiceManifest[key]).then(function (ok) {
        return ok ? { played: true, voice: "mine" } : generated();
      });
    }

    /* 3. the generated clip - unchanged for every word you have not recorded */
    return generated();
  }

  /* Play a specific layer, for the parent zone: compare yours against the
   * generated one without changing what the app would normally choose. */
  function playGenerated(wordId, lang) {
    var file = manifest[keyFor(wordId, lang)];
    if (!file) return Promise.resolve(false);
    return playUrl("audio/" + file);
  }

  function playOverride(wordId, lang) {
    var key = keyFor(wordId, lang);
    if (localKeys[key]) {
      return DB.get("recordings", key).then(function (rec) {
        return rec && rec.blob ? playBlob(rec.blob) : false;
      });
    }
    if (voiceManifest[key]) return playUrl("voice/" + voiceManifest[key]);
    return Promise.resolve(false);
  }

  /* ------------------------------------------------------------- chimes -- */
  /* Made by the phone, not downloaded. Nothing to cache, works offline from the
   * very first launch, and stays tiny. */

  function chime(langCode) {
    if (!unlocked) unlock();
    if (!ctx) return;
    var lang = LANGS.filter(function (l) { return l.code === langCode; })[0];
    var notes = (lang && lang.chime) || [523.25, 659.25];
    var t0 = ctx.currentTime;
    notes.forEach(function (freq, i) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      var start = t0 + i * 0.13;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
      o.connect(g); g.connect(ctx.destination);
      o.start(start); o.stop(start + 0.45);
    });
  }

  return {
    init: init, unlock: unlock, stop: stop,
    playWord: playWord, chime: chime, speak: speak,
    playGenerated: playGenerated, playOverride: playOverride,
    hasClip: hasClip, isPlayable: isPlayable, canSpeak: canSpeak,
    hasOverride: hasOverride, overrideIsLocal: overrideIsLocal,
    overrideCount: overrideCount, refreshLocalKeys: refreshLocalKeys,
    coverage: coverage, missing: missing
  };
}());
