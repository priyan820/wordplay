/* parent.js - the adult side: today's log, word editor, export, settings.
 *
 * Reached by a 3-second press in the top-left corner. Nothing here is ever
 * visible to her, and nothing here sits on a path she can reach by tapping.
 *
 * There is no recording booth any more. Every word ships a generated audio clip
 * for every language, so there is nothing to record and no microphone anywhere
 * in this app.
 */

var PARENT = (function () {
  "use strict";

  var showScript = false;

  /* --------------------------------------------------------------- setup -- */

  function init() {
    wire();
    return Promise.all([
      DB.metaGet("deviceLabel", ""),
      DB.metaGet("showScript", false)
    ]).then(function (r) {
      showScript = !!r[1];
      document.getElementById("setScript").value = showScript ? "1" : "0";
      document.getElementById("setDeviceLabel").value = r[0] || "";
    });
  }

  function wire() {
    var panels = {
      goEnd: null, goLog: "panelLog", goWords: "panelWords",
      goShare: "panelShare", goSettings: "panelSettings"
    };
    Object.keys(panels).forEach(function (id) {
      document.getElementById(id).addEventListener("click", function () {
        if (id === "goEnd") return APP.showDinner();
        openPanel(panels[id]);
      });
    });

    document.getElementById("pBack").addEventListener("click", function () {
      if (document.getElementById("panelMenu").classList.contains("on")) APP.showKid();
      else openPanel("panelMenu");
    });

    document.getElementById("doExport").addEventListener("click", doExport);
    document.getElementById("importFile").addEventListener("change", doImport);

    document.getElementById("setScript").addEventListener("change", function () {
      showScript = this.value === "1";
      DB.metaSet("showScript", showScript);
    });
    document.getElementById("setDeviceLabel").addEventListener("change", function () {
      DB.metaSet("deviceLabel", this.value.trim());
    });
    document.getElementById("setReset").addEventListener("click", function () {
      SESSION.restart().then(function () { APP.showKid(); });
    });

    document.getElementById("wAdd").addEventListener("click", addWord);
  }

  function openPanel(id) {
    ["panelMenu", "panelLog", "panelWords", "panelShare", "panelSettings"]
      .forEach(function (p) {
        document.getElementById(p).classList.toggle("on", p === (id || "panelMenu"));
      });
    var titles = {
      panelLog: "Today's log", panelWords: "Word editor",
      panelShare: "End day", panelSettings: "Settings"
    };
    document.getElementById("pTitle").textContent = titles[id] || "Parent zone";

    if (id === "panelLog")      renderLog();
    if (id === "panelWords")    renderWords();
    if (id === "panelSettings") renderStorage();
    if (!id || id === "panelMenu") renderCoverage();
  }

  function onOpen() { openPanel("panelMenu"); }

  /* ---------------------------------------------------------- coverage --- */
  /* Should read 225 of 225 on a healthy install. Anything less means an audio
   * file did not make it into the repo. */

  function renderCoverage() {
    var c = AUDIO.coverage();
    var pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
    document.getElementById("covFill").style.width = pct + "%";
    document.getElementById("covText").textContent =
      c.done + " of " + c.total + " clips present" +
      (c.done === c.total ? ". Everything has a voice."
                          : " - " + (c.total - c.done) + " missing.");
  }

  /* ------------------------------------------------------------- the log -- */

  function renderLog() {
    SCHED.todaysLog().then(function (log) {
      var got = {}, miss = {};
      log.got.forEach(function (a) { got[a.wordId + "|" + a.lang] = a; });
      log.missed.forEach(function (a) { miss[a.wordId + "|" + a.lang] = a; });

      document.getElementById("logGot").innerHTML  = tags(got, "got")   || "nothing yet today";
      document.getElementById("logMiss").innerHTML = tags(miss, "miss") || "nothing yet today";

      var gaps = AUDIO.missing();
      document.getElementById("logNeeds").textContent = gaps.length
        ? gaps.length + " word(s) have no clip: " + gaps.slice(0, 12).join(", ")
        : "Every word has a clip in all three languages.";
    });
  }

  function tags(map, cls) {
    return Object.keys(map).map(function (k) {
      var parts = k.split("|");
      var w = SCHED.wordById(parts[0]);
      if (!w || !w.labels[parts[1]]) return "";
      return '<span class="tag ' + cls + '">' + esc(w.labels[parts[1]].roman) +
             ' <span class="muted">' + parts[1] + '</span></span>';
    }).join("");
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* -------------------------------------------------------- word editor -- */

  function renderWords() {
    var list = document.getElementById("wList");
    list.innerHTML = "";
    WORDS.forEach(function (w) {
      var row = document.createElement("div");
      row.className = "wrow";
      var gaps = LANGS.filter(function (L) { return !AUDIO.hasClip(w.id, L.code); })
                      .map(function (L) { return L.code; });
      row.innerHTML =
        '<div class="e">' + w.emoji + '</div>' +
        '<div class="n">' + esc(w.labels.en.roman) +
          '<div class="t">' + esc(w.labels.hi.roman) + " &middot; " +
                              esc(w.labels.gu.roman) + '</div></div>' +
        '<div class="t">' + (gaps.length ? "no clip: " + gaps.join(",") : "✓") + '</div>';
      list.appendChild(row);
    });
  }

  function addWord() {
    var id = (document.getElementById("wNewId").value || "").trim().toLowerCase()
             .replace(/[^a-z0-9-]/g, "");
    var note = document.getElementById("wAddMsg");
    if (!id) { note.textContent = "Give it an id first."; return; }
    if (WORDS.some(function (w) { return w.id === id; })) {
      note.textContent = "There is already a word with that id."; return;
    }
    var g = function (x) { return (document.getElementById(x).value || "").trim(); };
    var w = {
      id: id, emoji: g("wNewEmoji") || "❓", tier: "core", tags: ["custom"],
      labels: {
        en: { text: g("wNewEn") || id, roman: g("wNewEn") || id, tts: g("wNewEn") || id, ttsLang: "en-IN" },
        hi: { text: g("wNewHi"), roman: g("wNewHi"), tts: g("wNewHi"), ttsLang: "hi-IN" },
        gu: { text: g("wNewGu"), roman: g("wNewGu") }
      }
    };
    WORDS.push(w);
    DB.metaGet("customWords", []).then(function (list) {
      list = list || [];
      list.push(w);
      return DB.metaSet("customWords", list);
    }).then(function () {
      ["wNewId", "wNewEmoji", "wNewEn", "wNewHi", "wNewGu"]
        .forEach(function (x) { document.getElementById(x).value = ""; });
      /* A word added here has no photo and no clip, so it shows its emoji and
       * falls back to the phone's voice for English and Hindi. Say so plainly
       * rather than letting it look broken. */
      note.textContent = "Added. It will show its emoji and speak in English and " +
                         "Hindi only, until a picture and clips are built for it.";
      renderWords();
    });
  }

  /* ------------------------------------------------------- export/import -- */

  function msg(id, text) { document.getElementById(id).textContent = text; }

  function doExport() {
    msg("exportMsg", "Building…");
    SHARE.exportDay().then(function (r) {
      msg("exportMsg", r.how === "shared"
        ? "Sent. Open it on the other phone and tap import."
        : r.how === "cancelled" ? "Cancelled."
        : "Saved to your files (" + Math.round(r.bytes / 1024) + " KB). Send it however you like.");
    }).catch(function (e) { msg("exportMsg", "Failed: " + e.message); });
  }

  function doImport(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    msg("importMsg", "Merging…");
    SHARE.importJsonFile(f).then(function (r) {
      msg("importMsg", "Merged. " + r.attemptsAdded + " new taps, " +
                       r.wordsUpdated + " words updated.");
    }).catch(function (err) { msg("importMsg", "Could not import: " + err.message); });
  }

  /* ---------------------------------------------------------- storage --- */

  function renderStorage() {
    var el = document.getElementById("setStorage");
    if (!navigator.storage || !navigator.storage.estimate) {
      el.textContent = "This browser will not report storage usage.";
      return;
    }
    navigator.storage.estimate().then(function (est) {
      var used = Math.round((est.usage || 0) / 1048576 * 10) / 10;
      var quota = Math.round((est.quota || 0) / 1048576);
      navigator.storage.persisted().then(function (p) {
        el.textContent = used + " MB used of about " + quota + " MB. " +
          (p ? "Marked permanent."
             : "Not marked permanent - keep opening it from the home-screen icon.");
      });
    });
  }

  return { init: init, onOpen: onOpen, openPanel: openPanel, renderCoverage: renderCoverage };
}());
