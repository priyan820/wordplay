/* audio.js - what she hears.
 *
 * Every word ships a real audio file for every language, generated once at
 * build time and committed to the repo. So this file has one job: look the
 * clip up and play it.
 *
 * That is a deliberate simplification. An earlier version tried to pick between
 * a parent recording, a committed file and the phone's own voice, which meant
 * the app sounded different on each phone depending on which voices iOS
 * happened to ship. Now both phones sound identical and it works offline from
 * the first launch.
 *
 * speechSynthesis survives only as a last resort, for English and Hindi, if a
 * file ever fails to load. Gujarati has no iOS voice, so a missing Gujarati
 * file means silence rather than a guess.
 */

var AUDIO = (function () {
  "use strict";

  var ctx = null;
  var unlocked = false;
  var manifest = {};      /* "water|hi" -> "water__hi.mp3" */
  var current = null;

  /* ------------------------------------------------------------- startup -- */

  function init() {
    return fetch("audio/manifest.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { manifest = j || {}; })
      .catch(function () { manifest = {}; });
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
      current = null;
    }
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
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

    var file = manifest[keyFor(wordId, lang)];
    if (!file) return fallback();
    return playUrl("audio/" + file).then(function (ok) {
      return ok ? { played: true, voice: "clip" } : fallback();
    });
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
    hasClip: hasClip, isPlayable: isPlayable, canSpeak: canSpeak,
    coverage: coverage, missing: missing
  };
}());
