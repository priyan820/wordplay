/* app.js - startup and the way between the two worlds. */

var APP = (function () {
  "use strict";

  var LONG_PRESS_MS = 3000;

  function boot() {
    /* Kill pull-to-refresh and rubber-banding on the kid screen. The parent
     * panels opt back in through their own scroll containers. */
    document.addEventListener("touchmove", function (e) {
      var inScroller = e.target.closest &&
        e.target.closest("#parent, #dinner, .wlist, select, input");
      if (!inScroller) e.preventDefault();
    }, { passive: false });

    /* No double-tap zoom, no pinch, no context menu anywhere. */
    document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
    document.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    wireDoorway();

    return DB.open()
      .then(DB.requestPersistence)
      .then(function () { return DB.pruneAttempts(14); })
      .then(loadCustomWords)
      .then(function () { return AUDIO.init(); })
      .then(function () { return PARENT.init(); })
      .then(function () { return SESSION.init(); })
      .then(registerSW)
      .catch(function (e) {
        /* Never leave her staring at a dead screen. Fall back to an emoji. */
        document.getElementById("emoji").textContent = "🙂";
        if (window.console) console.error("boot failed", e);
      });
  }

  /* Words added in the word editor live in IndexedDB and are merged into the
   * shipped catalogue at startup. */
  function loadCustomWords() {
    return DB.metaGet("customWords", []).then(function (list) {
      (list || []).forEach(function (w) {
        if (!WORDS.some(function (x) { return x.id === w.id; })) WORDS.push(w);
      });
    });
  }

  /* --------------------------------------------------------- the doorway -- */
  /* Three seconds, top-left, invisible. Long enough that she cannot find it by
   * accident, short enough that an adult does not have to think about it. */

  function wireDoorway() {
    var el = document.getElementById("doorway");
    var timer = null;

    function down() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (navigator.vibrate) navigator.vibrate(18);
        showParent();
      }, LONG_PRESS_MS);
    }
    function up() { clearTimeout(timer); }

    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", up);
    el.addEventListener("mousedown", down);
    el.addEventListener("mouseup", up);
    el.addEventListener("mouseleave", up);
  }

  /* ------------------------------------------------------------- screens -- */

  function only(id) {
    ["kid", "parent", "dinner"].forEach(function (s) {
      document.getElementById(s).classList.toggle("on", s === id);
    });
  }

  function showKid() {
    AUDIO.stop();
    only("kid");
    SESSION.show();
  }

  function showParent() {
    AUDIO.stop();
    only("parent");
    PARENT.onOpen();
    PARENT.renderCoverage();
  }

  /* End the day. One action: finish the session, then show the dinner card.
   *
   * Ending clears today's queue, so the next launch builds a fresh one ordered
   * by what she got wrong today. Nothing is exported and nothing is sent
   * anywhere - the scheduler only ever reads this phone's own log. */
  function showDinner() {
    AUDIO.stop();
    only("dinner");
    SCHED.endDay().catch(function (e) {
      /* Even if the queue could not be cleared, still show the card. The worst
       * case is that tomorrow resumes today's list, not a broken screen. */
      if (window.console) console.error("endDay failed", e);
    });
    SHARE.dinnerCard().then(render);

    function render(picks) {
      var box = document.getElementById("dinnerList");
      box.innerHTML = "";
      picks.forEach(function (p) {
        var d = document.createElement("div");
        d.className = "dcard";
        d.style.background = p.lang.bg;
        d.style.color = p.lang.ink;
        d.innerHTML =
          '<div class="l">' + p.lang.name + '</div>' +
          '<div class="r"></div>' +
          '<div class="n"></div>' +
          '<div class="m">' + (p.missed ? "she missed this today" : "practised today") + '</div>';
        d.querySelector(".r").textContent = p.roman;
        d.querySelector(".n").textContent = p.native;
        box.appendChild(d);
      });

      document.getElementById("dShare").onclick = function () {
        document.getElementById("dMsg").textContent = "Preparing…";
        SHARE.shareDinnerCard(picks).then(function (how) {
          document.getElementById("dMsg").textContent =
            how === "copied" ? "Copied to the clipboard." :
            how === "failed" ? "Could not share - read them off the screen." : "";
        });
      };
    }
  }

  /* Done is the only way off the dinner card, and it goes back to her screen
   * with a brand-new queue underneath. */
  document.getElementById("dDone").addEventListener("click", function () {
    SESSION.restart().then(showKid, showKid);
  });

  /* ------------------------------------------------------ service worker -- */

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    return navigator.serviceWorker.register("sw.js").then(function (reg) {
      /* Pick up a new deploy quietly on the next launch. She never sees a
       * reload prompt, because she never sees anything. */
      reg.update && reg.update();
    }).catch(function () { /* offline first run, fine */ });
  }

  return { boot: boot, showKid: showKid, showParent: showParent, showDinner: showDinner };
}());

document.addEventListener("DOMContentLoaded", APP.boot);
