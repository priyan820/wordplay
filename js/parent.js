/* parent.js - the adult side: recording booth, word editor, log, export.
 *
 * Reached by a 3-second press in the top-left corner. Nothing here is ever
 * visible to her, and nothing here is on the path she can reach by tapping.
 */

var PARENT = (function () {
  "use strict";

  var recLang = "en";
  var recList = [];
  var recIdx = 0;
  var recorder = null;
  var chunks = [];
  var pendingBlob = null;
  var device = "dad";
  var showScript = false;
  var mimeType = null;

  /* --------------------------------------------------------------- setup -- */

  function init() {
    var langSel = document.getElementById("recLang");
    LANGS.forEach(function (L) {
      var o = document.createElement("option");
      o.value = L.code; o.textContent = L.name;
      langSel.appendChild(o);
    });

    /* Pick a recording format the phone actually supports. iPhones do not
     * record the format most tutorials assume - Safari produces mp4/AAC, not
     * webm/opus - so this is decided at runtime, never hard-coded. */
    var candidates = ["audio/mp4", "audio/mp4;codecs=mp4a.40.2",
                      "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    mimeType = candidates.filter(function (t) {
      try { return window.MediaRecorder && MediaRecorder.isTypeSupported(t); }
      catch (e) { return false; }
    })[0] || null;

    wire();

    return Promise.all([
      DB.metaGet("device", "dad"),
      DB.metaGet("showScript", false)
    ]).then(function (r) {
      device = r[0]; showScript = !!r[1];
      document.getElementById("setDevice").value = device;
      document.getElementById("setScript").value = showScript ? "1" : "0";
    });
  }

  function wire() {
    var panels = {
      goEnd: null, goRecord: "panelRecord", goLog: "panelLog",
      goWords: "panelWords", goShare: "panelShare", goSettings: "panelSettings"
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

    /* recording booth */
    document.getElementById("recLang").addEventListener("change", function () {
      recLang = this.value; buildRecList();
    });
    document.getElementById("recFilter").addEventListener("change", buildRecList);
    document.getElementById("recNext").addEventListener("click", function () { step(1); });
    document.getElementById("recSkip").addEventListener("click", function () { step(1); });
    document.getElementById("recPlay").addEventListener("click", playCurrent);
    document.getElementById("recDelete").addEventListener("click", deleteCurrent);

    var btn = document.getElementById("recBtn");
    btn.addEventListener("touchstart", function (e) { e.preventDefault(); startRec(); });
    btn.addEventListener("touchend",   function (e) { e.preventDefault(); stopRec(); });
    btn.addEventListener("mousedown", startRec);
    btn.addEventListener("mouseup", stopRec);
    btn.addEventListener("mouseleave", function () { if (recorder) stopRec(); });

    /* export / import */
    document.getElementById("doExport").addEventListener("click", doExport);
    document.getElementById("importFile").addEventListener("change", doImport);
    document.getElementById("doZip").addEventListener("click", doZip);
    document.getElementById("importZip").addEventListener("change", doUnzip);

    /* settings */
    document.getElementById("setDevice").addEventListener("change", function () {
      device = this.value;
      DB.metaSet("device", device).then(showWord);
    });
    document.getElementById("setScript").addEventListener("change", function () {
      showScript = this.value === "1";
      DB.metaSet("showScript", showScript).then(showWord);
    });
    document.getElementById("setReset").addEventListener("click", function () {
      SESSION.restart().then(function () { APP.showKid(); });
    });

    /* word editor */
    document.getElementById("wAdd").addEventListener("click", addWord);
  }

  function openPanel(id) {
    ["panelMenu", "panelRecord", "panelLog", "panelWords", "panelShare", "panelSettings"]
      .forEach(function (p) {
        document.getElementById(p).classList.toggle("on", p === (id || "panelMenu"));
      });
    var titles = {
      panelRecord: "Recording booth", panelLog: "Today's log",
      panelWords: "Word editor", panelShare: "End day", panelSettings: "Settings"
    };
    document.getElementById("pTitle").textContent = titles[id] || "Parent zone";

    if (id === "panelRecord")   buildRecList();
    if (id === "panelLog")      renderLog();
    if (id === "panelWords")    renderWords();
    if (id === "panelSettings") renderStorage();
    if (!id || id === "panelMenu") renderCoverage();
  }

  function onOpen() { openPanel("panelMenu"); }

  /* ---------------------------------------------------------- coverage --- */

  function renderCoverage() {
    var c = AUDIO.coverage();
    var pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
    document.getElementById("covFill").style.width = pct + "%";
    document.getElementById("covText").textContent =
      c.done + " of " + c.total + " recorded (" + pct + "%). " +
      (pct < 40 ? "The app works fine at this level - gaps are skipped, never guessed."
                : "Plenty. English and Hindi also fall back to the phone's voice.");
  }

  /* --------------------------------------------------- recording booth --- */

  function voiceFor(lang) {
    var allowed = AUDIO.voicesFor(lang);
    if (!allowed.length) return null;
    return allowed.indexOf(device) !== -1 ? device : allowed[0];
  }

  function buildRecList() {
    recLang = document.getElementById("recLang").value || recLang;
    var filter = document.getElementById("recFilter").value;
    recList = WORDS.filter(function (w) {
      var has = AUDIO.hasRecording(w.id, recLang);
      if (filter === "missing") return !has;
      if (filter === "done") return has;
      return true;
    });
    recIdx = 0;
    showWord();
  }

  function currentWord() { return recList[recIdx] || null; }

  function showWord() {
    var w = currentWord();
    var roman = document.getElementById("recRoman");
    var native = document.getElementById("recNative");
    var meta = document.getElementById("recMeta");
    var emoji = document.getElementById("recEmoji");

    pendingBlob = null;
    document.getElementById("recPlay").disabled = true;

    if (!w) {
      emoji.textContent = "";
      roman.textContent = "All done";
      native.textContent = "";
      meta.textContent = "Nothing left in this filter.";
      renderRecCoverage();
      return;
    }

    var label = w.labels[recLang];
    emoji.textContent = w.emoji;
    /* Roman first and biggest: it is the thing you can actually read while
     * holding a record button. */
    roman.textContent = label.roman;
    native.textContent = showScript ? label.text : "";

    var v = voiceFor(recLang);
    var owner = (v === "mum" ? "Mum's voice" : "Dad's voice");
    var fixed = AUDIO.voicesFor(recLang).length === 1;
    var has = AUDIO.hasRecording(w.id, recLang);
    meta.textContent = (recIdx + 1) + " of " + recList.length + "  ·  " + owner +
      (fixed ? " (fixed for this language)" : "") +
      (has ? "  ·  already recorded" : "");

    document.getElementById("recPlay").disabled = !has;
    renderRecCoverage();
  }

  function renderRecCoverage() {
    var done = 0;
    WORDS.forEach(function (w) { if (AUDIO.hasRecording(w.id, recLang)) done++; });
    var pct = WORDS.length ? Math.round((done / WORDS.length) * 100) : 0;
    document.getElementById("recCovFill").style.width = pct + "%";
    var c = AUDIO.coverage();
    document.getElementById("recCov").textContent =
      done + " of " + WORDS.length + " in this language  ·  " +
      c.done + " of " + c.total + " overall";
  }

  function step(d) {
    if (!recList.length) return;
    recIdx = (recIdx + d + recList.length) % recList.length;
    showWord();
  }

  function startRec() {
    var w = currentWord();
    if (!w || recorder) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      document.getElementById("recMeta").textContent = "This phone will not give the app a microphone.";
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      chunks = [];
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType })
                            : new MediaRecorder(stream);
      } catch (e) {
        document.getElementById("recMeta").textContent = "Recorder failed: " + e.message;
        stream.getTracks().forEach(function (t) { t.stop(); });
        return;
      }
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        var type = recorder.mimeType || mimeType || "audio/mp4";
        pendingBlob = new Blob(chunks, { type: type });
        recorder = null;
        document.getElementById("recBtn").classList.remove("recording");
        if (pendingBlob.size) save(pendingBlob, type);
      };
      recorder.start();
      document.getElementById("recBtn").classList.add("recording");
    }).catch(function (err) {
      document.getElementById("recMeta").textContent =
        err && err.name === "NotAllowedError"
          ? "Microphone denied. Delete the home-screen icon, re-add it from Safari, try again."
          : "Microphone error: " + (err && err.message);
    });
  }

  function stopRec() {
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch (e) { recorder = null; }
    }
  }

  function save(blob, type) {
    var w = currentWord();
    if (!w) return;
    var v = voiceFor(recLang);
    var row = {
      key: w.id + "|" + recLang + "|" + v,
      wordId: w.id, lang: recLang, voice: v,
      blob: blob, mime: type, bytes: blob.size, ts: Date.now()
    };
    DB.put("recordings", row)
      .then(AUDIO.refreshLocalKeys)
      .then(function () {
        document.getElementById("recPlay").disabled = false;
        document.getElementById("recMeta").textContent =
          "Saved " + Math.round(blob.size / 1024) + " KB. Play it back, or move on.";
        renderRecCoverage();
      });
  }

  function playCurrent() {
    var w = currentWord();
    if (!w) return;
    AUDIO.playWord(w.id, recLang, 0);
  }

  function deleteCurrent() {
    var w = currentWord();
    if (!w) return;
    var v = voiceFor(recLang);
    DB.del("recordings", w.id + "|" + recLang + "|" + v)
      .then(AUDIO.refreshLocalKeys)
      .then(showWord);
  }

  /* ------------------------------------------------------------- the log -- */

  function renderLog() {
    SCHED.todaysLog().then(function (log) {
      var got = {}, miss = {};
      log.got.forEach(function (a) { got[a.wordId + "|" + a.lang] = a; });
      log.missed.forEach(function (a) { miss[a.wordId + "|" + a.lang] = a; });

      document.getElementById("logGot").innerHTML  = tags(got, "got")  || "nothing yet today";
      document.getElementById("logMiss").innerHTML = tags(miss, "miss") || "nothing yet today";

      var needs = [];
      WORDS.forEach(function (w) {
        ["gu", "sd"].forEach(function (l) {
          if (!AUDIO.hasRecording(w.id, l)) needs.push(w.labels[l].roman + " (" + l + ")");
        });
      });
      document.getElementById("logNeeds").textContent = needs.length
        ? needs.length + " missing. First few: " + needs.slice(0, 12).join(", ")
        : "All Gujarati and Sindhi words have a voice.";
    });
  }

  function tags(map, cls) {
    return Object.keys(map).map(function (k) {
      var parts = k.split("|");
      var w = SCHED.wordById(parts[0]);
      if (!w) return "";
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
      var missing = LANGS.filter(function (L) { return !AUDIO.hasRecording(w.id, L.code); })
                         .map(function (L) { return L.code; });
      row.innerHTML =
        '<div class="e">' + w.emoji + '</div>' +
        '<div class="n">' + esc(w.labels.en.roman) +
          '<div class="t">' + esc(w.labels.hi.roman) + " · " +
                              esc(w.labels.gu.roman) + " · " +
                              esc(w.labels.sd.roman) + '</div></div>' +
        '<div class="t">' + (missing.length ? "needs " + missing.join(",") : "complete") + '</div>';
      list.appendChild(row);
    });
  }

  function addWord() {
    var id = (document.getElementById("wNewId").value || "").trim().toLowerCase()
             .replace(/[^a-z0-9-]/g, "");
    if (!id) return msg("wordMsg", "Give it an id first.");
    if (WORDS.some(function (w) { return w.id === id; })) {
      return alertish("There is already a word with that id.");
    }
    var g = function (x) { return (document.getElementById(x).value || "").trim(); };
    var w = {
      id: id, emoji: g("wNewEmoji") || "❓", tier: "core", tags: ["custom"],
      labels: {
        en: { text: g("wNewEn") || id, roman: g("wNewEn") || id, tts: g("wNewEn") || id, ttsLang: "en-IN" },
        hi: { text: g("wNewHi"), roman: g("wNewHi"), tts: g("wNewHi"), ttsLang: "hi-IN" },
        gu: { text: g("wNewGu"), roman: g("wNewGu") },
        sd: { text: g("wNewSd"), roman: g("wNewSd") }
      }
    };
    WORDS.push(w);
    DB.metaGet("customWords", []).then(function (list) {
      list = list || [];
      list.push(w);
      return DB.metaSet("customWords", list);
    }).then(function () {
      ["wNewId", "wNewEmoji", "wNewEn", "wNewHi", "wNewGu", "wNewSd"]
        .forEach(function (x) { document.getElementById(x).value = ""; });
      renderWords();
    });
  }

  function alertish(t) { document.getElementById("wList").insertAdjacentHTML("afterbegin",
    '<div class="wrow"><div class="n">' + esc(t) + '</div></div>'); }

  /* ------------------------------------------------------- export/import -- */

  function msg(id, text) { document.getElementById(id).textContent = text; }

  function doExport() {
    msg("exportMsg", "Building…");
    SHARE.exportDay().then(function (r) {
      msg("exportMsg", r.how === "shared" ? "Sent. Open it on the other phone and tap import."
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
      renderCoverage();
    }).catch(function (err) { msg("importMsg", "Could not import: " + err.message); });
  }

  function doZip() {
    msg("zipMsg", "Zipping…");
    SHARE.exportRecordings().then(function (r) {
      msg("zipMsg", r.count + " recordings, " + Math.round(r.bytes / 1024) + " KB. " +
                    (r.how === "shared" ? "Sent." : "Saved to your files."));
    }).catch(function (e) { msg("zipMsg", e.message); });
  }

  function doUnzip(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    msg("zipMsg", "Restoring…");
    SHARE.importRecordings(f).then(function (r) {
      msg("zipMsg", "Restored " + r.count + " recordings.");
      renderCoverage(); renderRecCoverage();
    }).catch(function (err) { msg("zipMsg", "Could not read that zip: " + err.message); });
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
          (p ? "Marked permanent." : "Not marked permanent - keep opening it from the home screen.");
      });
    });
  }

  return { init: init, onOpen: onOpen, openPanel: openPanel, renderCoverage: renderCoverage };
}());
