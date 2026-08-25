/* share.js - getting data off a phone and onto the other one.
 *
 * There is no server, no account and no login. The only way anything leaves
 * this device is the iOS share sheet, driven by a human finger. Nothing in this
 * file makes a network request - search it for "fetch" and you will find none.
 *
 * Export -> share sheet -> WhatsApp or AirDrop -> other phone imports -> merge.
 */

var SHARE = (function () {
  "use strict";

  var SCHEMA = 1;

  /* ------------------------------------------------------------- helpers -- */

  function deviceId() {
    return DB.metaGet("deviceId", null).then(function (id) {
      if (id) return id;
      id = "dev-" + Math.random().toString(36).slice(2, 8);
      return DB.metaSet("deviceId", id).then(function () { return id; });
    });
  }
  function deviceLabel() { return DB.metaGet("deviceLabel", "this phone"); }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") +
           String(d.getDate()).padStart(2, "0") + "-" +
           String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
  }

  /* Share a real file if the phone allows it, then fall back through text and
   * clipboard. iOS sometimes refuses file shares to particular apps, so the
   * fallbacks are not decoration - they get used. */
  function shareFile(blob, filename, title, textFallback) {
    var file = null;
    try { file = new File([blob], filename, { type: blob.type }); } catch (e) {}

    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: title })
        .then(function () { return "shared"; })
        .catch(function (e) {
          if (e && e.name === "AbortError") return "cancelled";
          return downloadFallback(blob, filename);
        });
    }
    if (navigator.share && textFallback) {
      return navigator.share({ title: title, text: textFallback })
        .then(function () { return "shared-text"; })
        .catch(function () { return downloadFallback(blob, filename); });
    }
    return Promise.resolve(downloadFallback(blob, filename));
  }

  function downloadFallback(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return "downloaded";
  }

  /* -------------------------------------------------------- day export --- */

  function buildExport() {
    return Promise.all([
      DB.all("attempts"), DB.all("state"), deviceId(), deviceLabel(),
      DB.metaGet("newByDay", {}), DB.metaGet("sessionCount", 0)
    ]).then(function (r) {
      var cutoff = Date.now() - 14 * 86400000;
      return {
        schema: SCHEMA,
        app: "wordplay",
        device: r[2],
        deviceLabel: r[3],
        exportedAt: Date.now(),
        attempts: (r[0] || []).filter(function (a) { return a.ts >= cutoff; }),
        state: (r[1] || []),
        schedule: { newByDay: r[4] || {}, sessionCount: r[5] || 0 }
      };
    });
  }

  function exportDay() {
    return buildExport().then(function (data) {
      var json = JSON.stringify(data);
      var blob = new Blob([json], { type: "application/json" });
      var name = "wordplay-" + stamp() + ".json";
      var summary = "Wordplay progress, " + new Date().toLocaleDateString() +
                    " - " + data.attempts.length + " taps, " + data.state.length + " words tracked.";
      return shareFile(blob, name, "Wordplay progress", summary).then(function (how) {
        return DB.metaSet("lastExportAt", Date.now()).then(function () {
          return { how: how, bytes: blob.size, name: name, attempts: data.attempts.length };
        });
      });
    });
  }

  /* ------------------------------------------------------------- import -- */

  /* Union the attempts by id - the id carries the timestamp, so the same tap
   * can never be counted twice. For state, the row with the newer lastHeard
   * wins per word+language pair. */
  function mergeData(incoming) {
    if (!incoming || incoming.app !== "wordplay") {
      return Promise.reject(new Error("That file is not a Wordplay export."));
    }
    if (incoming.schema > SCHEMA) {
      return Promise.reject(new Error("That file came from a newer version of the app."));
    }

    return Promise.all([DB.all("attempts"), DB.all("state")]).then(function (r) {
      var haveAttempt = {};
      (r[0] || []).forEach(function (a) { haveAttempt[a.id] = true; });
      var newAttempts = (incoming.attempts || []).filter(function (a) {
        return a && a.id && !haveAttempt[a.id];
      });

      var mine = {};
      (r[1] || []).forEach(function (s) { mine[s.key] = s; });

      var updates = [];
      (incoming.state || []).forEach(function (theirs) {
        if (!theirs || !theirs.key) return;
        var ours = mine[theirs.key];
        if (!ours || (theirs.lastHeard || 0) > (ours.lastHeard || 0)) updates.push(theirs);
      });

      return Promise.all([
        DB.putMany("attempts", newAttempts),
        DB.putMany("state", updates)
      ]).then(function () {
        var sched = incoming.schedule || {};
        return DB.metaGet("newByDay", {}).then(function (mineDays) {
          var merged = mineDays || {};
          Object.keys(sched.newByDay || {}).forEach(function (day) {
            var a = merged[day] || [], b = sched.newByDay[day] || [];
            b.forEach(function (w) { if (a.indexOf(w) === -1) a.push(w); });
            merged[day] = a;
          });
          return DB.metaSet("newByDay", merged);
        });
      }).then(function () {
        return { attemptsAdded: newAttempts.length, wordsUpdated: updates.length };
      });
    });
  }

  function importJsonFile(file) {
    return file.text().then(function (t) { return mergeData(JSON.parse(t)); });
  }

  /* -------------------------------------------- recordings: zip in / out -- */

  function extFor(mime) {
    if (!mime) return "bin";
    if (mime.indexOf("mp4") !== -1 || mime.indexOf("aac") !== -1) return "m4a";
    if (mime.indexOf("webm") !== -1) return "webm";
    if (mime.indexOf("ogg") !== -1) return "ogg";
    if (mime.indexOf("wav") !== -1) return "wav";
    if (mime.indexOf("mpeg") !== -1) return "mp3";
    return "bin";
  }

  function fileNameFor(rec) {
    return rec.wordId + "__" + rec.lang + "__" + rec.voice + "." + extFor(rec.mime);
  }

  function exportRecordings() {
    return DB.all("recordings").then(function (rows) {
      rows = rows || [];
      if (!rows.length) return Promise.reject(new Error("There are no recordings on this phone yet."));

      var manifest = {};
      return Promise.all(rows.map(function (r) {
        return r.blob.arrayBuffer().then(function (buf) {
          var name = fileNameFor(r);
          manifest[r.key] = name;
          return { name: "audio/" + name, bytes: new Uint8Array(buf) };
        });
      })).then(function (files) {
        var enc = new TextEncoder();
        files.push({
          name: "audio/manifest.json",
          bytes: enc.encode(JSON.stringify(manifest, null, 2))
        });
        var blob = ZIP.write(files);
        var name = "wordplay-voices-" + stamp() + ".zip";
        return shareFile(blob, name, "Wordplay recordings", null).then(function (how) {
          return { how: how, count: rows.length, bytes: blob.size, name: name };
        });
      });
    });
  }

  function importRecordings(file) {
    return file.arrayBuffer().then(function (buf) {
      var entries = ZIP.read(buf);
      var manifestEntry = entries.filter(function (e) { return /manifest\.json$/.test(e.name); })[0];
      var map = {};
      if (manifestEntry) {
        var byName = {};
        var parsed = JSON.parse(new TextDecoder().decode(manifestEntry.bytes));
        Object.keys(parsed).forEach(function (k) { byName[parsed[k]] = k; });
        map = byName;
      }

      var rows = [];
      entries.forEach(function (e) {
        if (/manifest\.json$/.test(e.name)) return;
        var base = e.name.split("/").pop();
        var key = map[base];
        if (!key) {
          /* Fall back to the filename shape: word__lang__voice.ext */
          var m = base.match(/^(.+?)__(.+?)__(.+?)\.[a-z0-9]+$/);
          if (!m) return;
          key = m[1] + "|" + m[2] + "|" + m[3];
        }
        var parts = key.split("|");
        var mime = /\.m4a$/.test(base) ? "audio/mp4"
                 : /\.webm$/.test(base) ? "audio/webm"
                 : /\.ogg$/.test(base) ? "audio/ogg" : "application/octet-stream";
        rows.push({
          key: key, wordId: parts[0], lang: parts[1], voice: parts[2],
          blob: new Blob([e.bytes], { type: mime }),
          mime: mime, bytes: e.bytes.length, ts: Date.now()
        });
      });

      return DB.putMany("recordings", rows)
        .then(AUDIO.refreshLocalKeys)
        .then(function () { return { count: rows.length }; });
    });
  }

  /* --------------------------------------------------------- dinner card -- */

  /* Four words to use out loud tonight, one per language, drawn from what she
   * actually practised today. Missed words first - those are the ones worth
   * saying at the table. */
  function dinnerCard() {
    return Promise.all([SCHED.todaysLog(), DB.all("state")]).then(function (r) {
      var log = r[0], states = r[1] || [];
      var picks = [];

      LANGS.forEach(function (L) {
        var missedToday = log.missed.filter(function (a) { return a.lang === L.code; });
        var gotToday    = log.got.filter(function (a) { return a.lang === L.code; });
        var wordId = null;

        if (missedToday.length)    wordId = missedToday[missedToday.length - 1].wordId;
        else if (gotToday.length)  wordId = gotToday[gotToday.length - 1].wordId;
        else {
          /* Nothing in this language today - offer the one she heard longest ago. */
          var pool = states.filter(function (s) { return s.lang === L.code && !s.retired; })
                           .sort(function (a, b) { return (a.lastHeard || 0) - (b.lastHeard || 0); });
          wordId = pool.length ? pool[0].wordId : null;
        }
        if (!wordId) {
          var any = WORDS.filter(function (w) { return w.tier === "core"; });
          wordId = any[Math.floor(Math.random() * any.length)].id;
        }

        var w = SCHED.wordById(wordId);
        if (!w) return;
        picks.push({
          lang: L, word: w,
          roman: w.labels[L.code].roman,
          native: w.labels[L.code].text,
          missed: missedToday.some(function (a) { return a.wordId === wordId; })
        });
      });

      return picks;
    });
  }

  function shareDinnerCard(picks) {
    var text = "Tonight's four words\n\n" + picks.map(function (p) {
      return p.lang.name + ": " + p.roman + "  (" + p.native + ")";
    }).join("\n");

    return renderDinnerPng(picks).then(function (blob) {
      if (!blob) return shareText(text);
      return shareFile(blob, "dinner-" + stamp() + ".png", "Tonight's four words", text);
    }).catch(function () { return shareText(text); });

    function shareText(t) {
      if (navigator.share) {
        return navigator.share({ title: "Tonight's four words", text: t })
          .then(function () { return "shared"; })
          .catch(function () { return copy(t); });
      }
      return copy(t);
    }
    function copy(t) {
      if (navigator.clipboard) {
        return navigator.clipboard.writeText(t).then(function () { return "copied"; },
                                                     function () { return "failed"; });
      }
      return Promise.resolve("failed");
    }
  }

  function renderDinnerPng(picks) {
    return new Promise(function (resolve) {
      try {
        var W = 1080, H = 1350;
        var c = document.createElement("canvas");
        c.width = W; c.height = H;
        var x = c.getContext("2d");

        x.fillStyle = "#faf6ef"; x.fillRect(0, 0, W, H);
        x.fillStyle = "#2c2a26";
        x.font = "600 44px -apple-system, system-ui, sans-serif";
        x.textAlign = "center";
        x.fillText("Tonight's four words", W / 2, 120);

        var top = 210, rowH = 270;
        picks.forEach(function (p, i) {
          var y = top + i * rowH;
          x.fillStyle = p.lang.bg;
          roundRect(x, 70, y, W - 140, rowH - 34, 28);
          x.fill();

          x.fillStyle = p.lang.ink;
          x.font = "500 30px -apple-system, system-ui, sans-serif";
          x.textAlign = "left";
          x.fillText(p.lang.name.toUpperCase(), 118, y + 62);

          x.font = "700 92px -apple-system, system-ui, sans-serif";
          x.fillText(p.roman, 118, y + 158);

          x.font = "400 40px -apple-system, system-ui, sans-serif";
          x.globalAlpha = 0.62;
          x.fillText(p.native, 118, y + 210);
          x.globalAlpha = 1;
        });

        c.toBlob(function (b) { resolve(b); }, "image/png");
      } catch (e) { resolve(null); }
    });
  }

  function roundRect(x, left, top, w, h, r) {
    x.beginPath();
    x.moveTo(left + r, top);
    x.arcTo(left + w, top,     left + w, top + h, r);
    x.arcTo(left + w, top + h, left,     top + h, r);
    x.arcTo(left,     top + h, left,     top,     r);
    x.arcTo(left,     top,     left + w, top,     r);
    x.closePath();
  }

  return {
    exportDay: exportDay, importJsonFile: importJsonFile, mergeData: mergeData,
    exportRecordings: exportRecordings, importRecordings: importRecordings,
    dinnerCard: dinnerCard, shareDinnerCard: shareDinnerCard,
    deviceId: deviceId, fileNameFor: fileNameFor, extFor: extFor
  };
}());
