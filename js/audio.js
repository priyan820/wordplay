/* audio.js - deciding what she hears, and playing it.
 *
 * Resolution order for any word+language:
 *   1. a recording in IndexedDB       (freshest, made on this phone)
 *   2. a recording committed to /audio (permanent, arrives on both phones)
 *   3. the phone's own voice           -- ENGLISH AND HINDI ONLY
 *   4. nothing                         -- the word is skipped, never guessed at
 *
 * Step 4 is the important one. iOS has no trustworthy Gujarati or Sindhi voice.
 * A wrong pronunciation teaches her the wrong word, which is worse than
 * teaching her nothing, so the app stays silent and moves on.
 */

var AUDIO = (function () {
  "use strict";

  var ctx = null;
  var unlocked = false;
  var staticManifest = {};   /* "water|gu|mum" -> "water__gu__mum.m4a" */
  var localKeys = {};        /* "water|gu|mum" -> true, from IndexedDB  */
  var current = null;        /* the <audio> element in flight           */

  /* ------------------------------------------------------------- startup -- */

  function init() {
    var a = fetch("audio/manifest.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { staticManifest = j || {}; })
      .catch(function () { staticManifest = {}; });
    return Promise.all([a, refreshLocalKeys()]);
  }

  function refreshLocalKeys() {
    return DB.all("recordings").then(function (rows) {
      localKeys = {};
      (rows || []).forEach(function (r) { localKeys[r.key] = true; });
      return localKeys;
    }).catch(function () { localKeys = {}; return localKeys; });
  }

  /* iOS will not play anything until a real finger touches the screen. Every
   * playback in this app follows her tap, so one unlock at the first tap
   * covers the whole session. */
  function unlock() {
    if (unlocked) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      var b = ctx.createBuffer(1, 1, 22050);
      var s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
      unlocked = true;
    } catch (e) { /* not fatal - recordings still play through <audio> */ }
  }

  /* --------------------------------------------------------- what exists -- */

  function voicesFor(lang) { return VOICE_FOR_LANG[lang] || []; }

  /* Which voice to use when both parents recorded the same word. Flips from one
   * session to the next, so a sitting is consistent but the days vary. */
  function pickVoice(wordId, lang, parity) {
    var have = voicesFor(lang).filter(function (v) {
      var k = wordId + "|" + lang + "|" + v;
      return localKeys[k] || staticManifest[k];
    });
    if (!have.length) return null;
    if (have.length === 1) return have[0];
    return have[(parity || 0) % have.length];
  }

  function hasRecording(wordId, lang) {
    return voicesFor(lang).some(function (v) {
      var k = wordId + "|" + lang + "|" + v;
      return localKeys[k] || staticManifest[k];
    });
  }

  function canSpeak(lang) { return TTS_LANGS.indexOf(lang) !== -1; }

  /* The scheduler asks this before putting a word in the queue. */
  function isPlayable(wordId, lang) {
    return hasRecording(wordId, lang) || canSpeak(lang);
  }

  function coverage() {
    var total = 0, done = 0;
    WORDS.forEach(function (w) {
      LANGS.forEach(function (l) {
        total++;
        if (hasRecording(w.id, l.code)) done++;
      });
    });
    return { done: done, total: total };
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

  /* Returns { played: bool, voice: "mum"|"dad"|"tts"|"none" } */
  function playWord(wordId, lang, parity) {
    var word = WORDS.filter(function (w) { return w.id === wordId; })[0];
    if (!word) return Promise.resolve({ played: false, voice: "none" });

    function fallback() {
      if (canSpeak(lang)) {
        return speak(word, lang).then(function (ok) {
          return { played: ok, voice: ok ? "tts" : "none" };
        });
      }
      /* Gujarati or Sindhi with no recording. Silence is the correct answer. */
      return Promise.resolve({ played: false, voice: "none" });
    }

    var voice = pickVoice(wordId, lang, parity || 0);
    if (voice) {
      var key = wordId + "|" + lang + "|" + voice;
      if (localKeys[key]) {
        return DB.get("recordings", key).then(function (rec) {
          if (rec && rec.blob) {
            return playBlob(rec.blob).then(function (ok) {
              return ok ? { played: true, voice: voice } : fallback();
            });
          }
          return fallback();
        });
      }
      if (staticManifest[key]) {
        return playUrl("audio/" + staticManifest[key]).then(function (ok) {
          return ok ? { played: true, voice: voice } : fallback();
        });
      }
    }
    return fallback();
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
    hasRecording: hasRecording, isPlayable: isPlayable, canSpeak: canSpeak,
    coverage: coverage, refreshLocalKeys: refreshLocalKeys,
    voicesFor: voicesFor, pickVoice: pickVoice
  };
}());
