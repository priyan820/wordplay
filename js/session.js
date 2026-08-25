/* session.js - kid mode.
 *
 * One photo. Tap it, hear the word. Tap again, hear it again. Two muted
 * buttons at the bottom for the adult.
 *
 * THE SESSION NEVER ENDS ON ITS OWN. Search this file for a completion state
 * and you will not find one: no target, no timer, no "done" screen, no branch
 * that stops serving words. It ends when a person leaves or taps End session.
 *
 * She is never told she was wrong. The celebration is identical for both
 * buttons, and neither button changes anything she can see or hear.
 */

var SESSION = (function () {
  "use strict";

  var q = null;          /* today's queue */
  var item = null;       /* {wordId, lang} currently on screen */
  var word = null;
  var lastLang = null;
  var parity = 0;        /* flips per session: picks mum or dad */
  var deviceId = "unknown";
  var busy = false;
  var imageManifest = {};

  var elCard  = null, elPhoto = null, elEmoji = null, elKid = null;

  /* ------------------------------------------------------------- startup -- */

  function init() {
    elKid   = document.getElementById("kid");
    elCard  = document.getElementById("card");
    elPhoto = document.getElementById("photo");
    elEmoji = document.getElementById("emoji");

    /* The photo list is a plain static file. If it is missing, or a word has
     * no entry, that word simply shows its emoji - which is a complete,
     * working screen. This is why the app is usable before any image exists. */
    var imgs = fetch("images/manifest.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { imageManifest = j || {}; })
      .catch(function () { imageManifest = {}; });

    return Promise.all([imgs, SHARE.deviceId(), DB.metaGet("sessionCount", 0)])
      .then(function (r) {
        deviceId = r[1];
        parity = (r[2] || 0) % 2;
        return DB.metaSet("sessionCount", (r[2] || 0) + 1);
      })
      .then(function () { return SCHED.build(); })
      .then(function (queue) {
        q = queue;
        wire();
        return show();
      });
  }

  function wire() {
    /* Tap anywhere on the picture: play the word and celebrate. */
    elCard.addEventListener("touchstart", onPress, { passive: true });
    elCard.addEventListener("mousedown", onPress);
    elCard.addEventListener("touchend", onTap, { passive: true });
    elCard.addEventListener("click", onTap);

    document.getElementById("btnGot").addEventListener("click", function (e) {
      e.stopPropagation(); score(1);
    });
    document.getElementById("btnMiss").addEventListener("click", function (e) {
      e.stopPropagation(); score(0);
    });
  }

  function onPress() { elCard.classList.add("press"); }

  var lastTap = 0;
  function onTap(e) {
    if (e) e.preventDefault && e.preventDefault();
    elCard.classList.remove("press");
    var now = Date.now();
    if (now - lastTap < 260) return;      /* one tap, not a double-fire */
    lastTap = now;
    AUDIO.unlock();
    celebrate();
    if (item) AUDIO.playWord(item.wordId, item.lang, parity);
  }

  /* ---------------------------------------------------------- the screen -- */

  function show() {
    if (!q || !q.items.length) return Promise.resolve();

    return advanceToPlayable().then(function () {
      if (!item) return;
      word = SCHED.wordById(item.wordId);
      if (!word) return next();

      /* Language block changed: new colour, and a chime to mark it. */
      var L = LANGS.filter(function (l) { return l.code === item.lang; })[0];
      if (L) {
        elKid.style.backgroundColor = L.bg;
        if (lastLang && lastLang !== item.lang) AUDIO.chime(item.lang);
        lastLang = item.lang;
      }

      var img = imageManifest[word.id];
      if (img && img.file) {
        elPhoto.src = "images/" + img.file;
        elPhoto.classList.remove("hide");
        elEmoji.classList.add("hide");
        elEmoji.textContent = "";
      } else {
        elPhoto.classList.add("hide");
        elPhoto.removeAttribute("src");
        elEmoji.classList.remove("hide");
        elEmoji.textContent = word.emoji;
      }
    });
  }

  /* Walk forward past anything with no voice. A Gujarati word with no
   * recording is skipped in silence rather than mispronounced. */
  function advanceToPlayable() {
    return SCHED.maybeExtend(q).then(function (queue) {
      q = queue;
      var guard = 0;
      while (q.cursor < q.items.length && guard < 500) {
        guard++;
        var candidate = q.items[q.cursor];
        if (candidate && AUDIO.isPlayable(candidate.wordId, candidate.lang)) {
          item = candidate;
          return;
        }
        q.cursor++;
      }
      /* Ran off the end: top the queue up and keep going. The queue is
       * designed never to run dry, but if every remaining item is unplayable
       * we wrap rather than stop. */
      if (q.cursor >= q.items.length) {
        q.cursor = 0;
        item = q.items[0] || null;
      }
    });
  }

  function next() {
    q.cursor++;
    return DB.put("queue", q).then(show);
  }

  /* --------------------------------------------------------- celebration -- */
  /* Fires on every tap of the picture, regardless of score, regardless of
   * whether any sound played. There is exactly one version of this. */

  function celebrate() {
    var colours = ["#f2b134", "#e2705c", "#6aa96e", "#7d86d4", "#f4e3c1"];
    var rect = elCard.getBoundingClientRect();
    for (var i = 0; i < 12; i++) {
      var s = document.createElement("div");
      s.className = "spark";
      s.style.background = colours[i % colours.length];
      s.style.left = (rect.width / 2 - 7) + "px";
      s.style.top  = (rect.height / 2 - 7) + "px";
      var a = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
      var d = 90 + Math.random() * 110;
      s.style.setProperty("--dx", Math.cos(a) * d + "px");
      s.style.setProperty("--dy", Math.sin(a) * d + "px");
      elCard.appendChild(s);
      (function (node) { setTimeout(function () { node.remove(); }, 780); }(s));
    }
  }

  /* -------------------------------------------------------------- scoring -- */

  function score(result) {
    if (busy || !item) return;
    busy = true;
    AUDIO.stop();

    var voice = AUDIO.pickVoice(item.wordId, item.lang, parity) ||
                (AUDIO.canSpeak(item.lang) ? "tts" : "none");

    SCHED.record(item.wordId, item.lang, result, voice, deviceId)
      .then(next)
      .then(function () { busy = false; })
      .catch(function () { busy = false; });
  }

  function currentQueue() { return q; }

  function restart() {
    return DB.del("queue", SCHED.today()).then(function () {
      return SCHED.build();
    }).then(function (queue) {
      q = queue;
      lastLang = null;
      return show();
    });
  }

  return { init: init, show: show, restart: restart, currentQueue: currentQueue };
}());
