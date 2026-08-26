/* parent.js - the adult side: today's log, word editor, export, settings.
 *
 * Reached by a 3-second press in the top-left corner. Nothing here is ever
 * visible to her, and nothing here sits on a path she can reach by tapping.
 *
 * The Voices panel is the one place a microphone is used. It records a real
 * voice over the generated clip for one word in one language; everything not
 * recorded keeps its generated clip, so the app is never half-finished.
 */

var PARENT = (function () {
  "use strict";

  var showScript = false;

  /* ---- Voices panel state ---- */
  var vLang = "hi";        /* Hindi first: it is the one being mispronounced */
  var vList = [];
  var vIdx = 0;
  var recorder = null;
  var chunks = [];
  var mimeType = null;

  /* --------------------------------------------------------------- setup -- */

  function init() {
    /* iPhones do not record the format most tutorials assume - Safari produces
     * mp4/AAC, not webm/opus - so the format is chosen from what the phone
     * actually reports rather than hard-coded. */
    mimeType = ["audio/mp4", "audio/mp4;codecs=mp4a.40.2",
                "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
      .filter(function (t) {
        try { return window.MediaRecorder && MediaRecorder.isTypeSupported(t); }
        catch (e) { return false; }
      })[0] || null;

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
      goEnd: null, goVoices: "panelVoices", goLog: "panelLog", goWords: "panelWords",
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

    /* ---- voices ---- */
    LANGS.forEach(function (L) {
      var o = document.createElement("option");
      o.value = L.code; o.textContent = L.name;
      document.getElementById("vLang").appendChild(o);
    });
    document.getElementById("vLang").value = vLang;
    document.getElementById("vLang").addEventListener("change", function () {
      vLang = this.value; buildVoiceList();
    });
    document.getElementById("vFilter").addEventListener("change", buildVoiceList);

    document.getElementById("vPlayGen").addEventListener("click", function () {
      var w = vWord(); if (!w) return;
      AUDIO.unlock(); AUDIO.playGenerated(w.id, vLang);
    });
    document.getElementById("vPlayMine").addEventListener("click", function () {
      var w = vWord(); if (!w) return;
      AUDIO.unlock(); AUDIO.playOverride(w.id, vLang);
    });
    document.getElementById("vDelete").addEventListener("click", deleteMine);

    var rb = document.getElementById("vRecBtn");
    rb.addEventListener("touchstart", function (e) { e.preventDefault(); startRec(); });
    rb.addEventListener("touchend",   function (e) { e.preventDefault(); stopRec(); });
    rb.addEventListener("mousedown", startRec);
    rb.addEventListener("mouseup", stopRec);
    rb.addEventListener("mouseleave", function () { if (recorder) stopRec(); });

    document.getElementById("vUploadBtn").addEventListener("click", function () {
      document.getElementById("vUpload").click();
    });
    document.getElementById("vUpload").addEventListener("change", uploadFile);

    document.getElementById("vExport").addEventListener("click", exportVoices);
    document.getElementById("vImport").addEventListener("change", importVoices);
  }

  function openPanel(id) {
    ["panelMenu", "panelVoices", "panelLog", "panelWords", "panelShare", "panelSettings"]
      .forEach(function (p) {
        document.getElementById(p).classList.toggle("on", p === (id || "panelMenu"));
      });
    var titles = {
      panelVoices: "Voices", panelLog: "Today's log", panelWords: "Word editor",
      panelShare: "End day", panelSettings: "Settings"
    };
    document.getElementById("pTitle").textContent = titles[id] || "Parent zone";

    if (id === "panelVoices")   { buildVoiceList(); renderMicStatus(); }
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


  /* ============================================================== VOICES == */
  /* Record a real voice over the generated clip, one word and one language at
   * a time. Whatever is not recorded keeps its generated clip, so this can be
   * left half-done for ever without the app breaking. */

  function vWord() { return vList[vIdx] || null; }

  function buildVoiceList() {
    vLang = document.getElementById("vLang").value || vLang;
    var filter = document.getElementById("vFilter").value;
    vList = WORDS.filter(function (w) {
      var mine = AUDIO.hasOverride(w.id, vLang);
      if (filter === "mine") return mine;
      if (filter === "todo") return !mine;
      return true;
    });
    if (vIdx >= vList.length) vIdx = 0;
    renderVoiceList();
    showVoiceWord();
  }

  function renderVoiceList() {
    var list = document.getElementById("vList");
    list.innerHTML = "";
    vList.forEach(function (w, i) {
      var row = document.createElement("div");
      row.className = "wrow";
      var mine = AUDIO.hasOverride(w.id, vLang);
      row.innerHTML =
        '<div class="e">' + w.emoji + '</div>' +
        '<div class="n">' + esc(w.labels[vLang].roman) + '</div>' +
        '<div class="t">' + (mine ? "yours" : "generated") + '</div>';
      if (i === vIdx) row.style.background = "#f2ede2";
      row.addEventListener("click", function () {
        vIdx = i; renderVoiceList(); showVoiceWord();
      });
      list.appendChild(row);
    });
  }

  function showVoiceWord() {
    var w = vWord();
    document.getElementById("vMsg").textContent = "";

    if (!w) {
      document.getElementById("vEmoji").textContent = "";
      document.getElementById("vRoman").textContent = "Nothing here";
      document.getElementById("vNative").textContent = "";
      document.getElementById("vStatus").textContent = "Try a different filter.";
      document.getElementById("vPlayMine").disabled = true;
      document.getElementById("vDelete").disabled = true;
      renderVoiceCoverage();
      return;
    }

    var label = w.labels[vLang];
    document.getElementById("vEmoji").textContent = w.emoji;
    /* Roman first and biggest - it is what you can actually read while holding
     * down a record button. */
    document.getElementById("vRoman").textContent = label.roman;
    document.getElementById("vNative").textContent = showScript ? label.text : "";

    var mine = AUDIO.hasOverride(w.id, vLang);
    var local = AUDIO.overrideIsLocal(w.id, vLang);
    document.getElementById("vStatus").textContent =
      (vIdx + 1) + " of " + vList.length + "  ·  " +
      (mine ? (local ? "your recording (on this phone)" : "your recording (built in)")
            : "generated clip");

    document.getElementById("vPlayMine").disabled = !mine;
    /* Only a recording held on this phone can be deleted here. A built-in one
     * lives in the repo and has to be removed there. */
    document.getElementById("vDelete").disabled = !local;
    renderVoiceCoverage();
  }

  function renderVoiceCoverage() {
    var n = AUDIO.overrideCount(vLang);
    var pct = WORDS.length ? Math.round((n / WORDS.length) * 100) : 0;
    document.getElementById("vCovFill").style.width = pct + "%";
    var name = (LANGS.filter(function (L) { return L.code === vLang; })[0] || {}).name || vLang;
    document.getElementById("vCov").textContent =
      n + " of " + WORDS.length + " " + name + " words use your voice." +
      (n ? "" : " The rest use the generated clip, which is fine.");
  }

  /* ---- capture ---- */

  function startRec() {
    var w = vWord();
    if (!w || recorder) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      document.getElementById("vMsg").textContent =
        "This phone will not give the app a microphone. Use Upload a file instead.";
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      chunks = [];
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType })
                            : new MediaRecorder(stream);
      } catch (e) {
        document.getElementById("vMsg").textContent = "Recorder would not start: " + e.message;
        stream.getTracks().forEach(function (t) { t.stop(); });
        return;
      }

      recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };

      recorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        var type = recorder.mimeType || mimeType || "audio/mp4";
        var blob = new Blob(chunks, { type: type });
        recorder = null;
        document.getElementById("vRecBtn").classList.remove("recording");
        if (!blob.size) {
          document.getElementById("vMsg").textContent =
            "That recorded nothing. Check the phone is not muted, and hold the " +
            "button down while you speak.";
          return;
        }
        saveOverride(blob, type, "recorded");
      };

      recorder.start();
      document.getElementById("vRecBtn").classList.add("recording");
      document.getElementById("vMsg").textContent = "Recording - say the word, then let go.";
    }).catch(function (err) {
      document.getElementById("vMsg").textContent =
        err && err.name === "NotAllowedError"
          ? "Microphone denied. Delete the home-screen icon, add it again from Safari " +
            "and allow the microphone. Or just use Upload a file."
          : "Microphone error: " + (err && err.message);
    });
  }

  function stopRec() {
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch (e) { recorder = null; }
    }
  }

  /* Uploading matters as much as recording: a clip made in Voice Memos, where
   * you can retake it properly, is often better than one held-button take. */
  function uploadFile(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    e.target.value = "";
    if (!vWord()) return;
    saveOverride(f, f.type || "audio/mpeg", "uploaded");
  }

  function saveOverride(blob, type, source) {
    var w = vWord();
    if (!w) return;
    DB.put("recordings", {
      key: w.id + "|" + vLang, wordId: w.id, lang: vLang,
      blob: blob, mime: type, bytes: blob.size, ts: Date.now(), source: source
    })
      .then(AUDIO.refreshLocalKeys)
      .then(function () {
        document.getElementById("vMsg").textContent =
          "Saved " + Math.round(blob.size / 1024) + " KB. She will hear this from now on.";
        renderVoiceList();
        showVoiceWord();
      })
      .catch(function (err) {
        document.getElementById("vMsg").textContent = "Could not save it: " + err.message;
      });
  }

  function deleteMine() {
    var w = vWord();
    if (!w) return;
    DB.del("recordings", w.id + "|" + vLang)
      .then(AUDIO.refreshLocalKeys)
      .then(function () {
        document.getElementById("vMsg").textContent = "Deleted. Back to the generated clip.";
        renderVoiceList();
        showVoiceWord();
      });
  }

  /* ---- moving them between phones ---- */

  function exportVoices() {
    document.getElementById("vZipMsg").textContent = "Zipping…";
    SHARE.exportRecordings().then(function (r) {
      document.getElementById("vZipMsg").textContent =
        r.count + " recordings, " + Math.round(r.bytes / 1024) + " KB. " +
        (r.how === "shared" ? "Sent."
         : r.how === "cancelled" ? "Cancelled."
         : "Saved to your files.");
    }).catch(function (e) {
      document.getElementById("vZipMsg").textContent = e.message;
    });
  }

  function importVoices(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    document.getElementById("vZipMsg").textContent = "Restoring…";
    SHARE.importRecordings(f).then(function (r) {
      document.getElementById("vZipMsg").textContent = "Restored " + r.count + " recordings.";
      buildVoiceList();
    }).catch(function (err) {
      document.getElementById("vZipMsg").textContent = "Could not read that zip: " + err.message;
    });
  }

  /* ---- microphone status ---- */
  /* This replaces the standalone mic-test page. If iOS refuses the microphone
   * inside a home-screen app, it says so here in a plain sentence instead of
   * looking like the app is broken. */

  function renderMicStatus() {
    var el = document.getElementById("vMic");
    if (!window.MediaRecorder) {
      el.textContent = "This phone cannot record at all (it needs iOS 14.3 or newer). " +
                       "Upload a file instead - that always works.";
      return;
    }
    if (!window.isSecureContext) {
      el.textContent = "Not a secure connection, so iOS will block the microphone.";
      return;
    }
    var fmt = mimeType || "the phone's default format";
    var asked = "iOS will ask for the microphone the first time you record.";
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "microphone" }).then(function (st) {
        el.textContent = "Records as " + fmt + ". Permission: " + st.state +
          (st.state === "denied"
            ? ". Delete the home-screen icon and add it again from Safari to be asked afresh."
            : ".");
      }).catch(function () {
        el.textContent = "Records as " + fmt + ". " + asked;
      });
    } else {
      el.textContent = "Records as " + fmt + ". " + asked;
    }
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

  return {
    init: init, onOpen: onOpen, openPanel: openPanel,
    renderCoverage: renderCoverage, buildVoiceList: buildVoiceList
  };
}());
