/* scheduler.js - builds the queue from the log.
 *
 * Priority, in order:
 *   1. words missed yesterday
 *   2. words not heard in 4+ days
 *   3. at most TWO new words a day, ever
 *   4. then forever: cycle the known words, least-recently-heard first
 *
 * Step 4 has no end condition. There is no target count, no timer and no
 * completion state anywhere in this file. The queue tops itself up whenever it
 * gets close to the end, so it cannot run dry however long she keeps going.
 *
 * Everything is keyed by word AND language. She may know "water" in Hindi and
 * not in Sindhi; those are different things to learn and are tracked apart.
 */

var SCHED = (function () {
  "use strict";

  var BLOCK = 6;          /* words per language before it rotates */
  var NEW_PER_DAY = 2;    /* hard cap. Never more. */
  var STALE_DAYS = 4;
  var RETIRE_AFTER = 3;   /* consecutive DAYS with a miss */
  var BATCH = 48;         /* items generated per top-up (8 blocks) */
  var TOPUP_AT = 12;      /* extend when this many items remain */

  /* --------------------------------------------------------------- dates -- */

  function dayKey(ts) {
    var d = new Date(ts || Date.now());
    return d.getFullYear() + "-" +
           String(d.getMonth() + 1).padStart(2, "0") + "-" +
           String(d.getDate()).padStart(2, "0");
  }
  function today()     { return dayKey(); }
  function yesterday() { return dayKey(Date.now() - 86400000); }

  function keyOf(wordId, lang) { return wordId + "|" + lang; }
  function wordById(id) {
    return WORDS.filter(function (w) { return w.id === id; })[0];
  }

  /* ---------------------------------------------------------- retirement -- */
  /* Three days running with a miss on the same word+language retires that pair
   * and pulls in an easier reserve word FOR THAT LANGUAGE ONLY. Retiring Sindhi
   * "butterfly" leaves English "butterfly" completely alone. */

  function applyRetirements(states) {
    var changed = [];
    var reserve = WORDS.filter(function (w) { return w.tier === "reserve"; });

    states.forEach(function (st) {
      if (st.retired || st.missStreakDays < RETIRE_AFTER) return;

      var usedInLang = {};
      states.forEach(function (s) { if (s.lang === st.lang) usedInLang[s.wordId] = true; });

      var sub = reserve.filter(function (r) {
        return !usedInLang[r.id] && AUDIO.isPlayable(r.id, st.lang);
      })[0];

      st.retired = true;
      st.retiredAt = Date.now();
      st.replacedBy = sub ? sub.id : null;
      changed.push(st);

      if (sub) {
        changed.push({
          key: keyOf(sub.id, st.lang), wordId: sub.id, lang: st.lang,
          firstHeard: null, lastHeard: null,
          heard: 0, got: 0, missed: 0,
          missStreakDays: 0, lastMissDay: null,
          retired: false, retiredAt: null, replacedBy: null,
          substitute: true   /* skips the two-a-day cap: a swap, not a new word */
        });
      }
    });

    return changed.length ? DB.putMany("state", changed).then(function () { return changed; })
                          : Promise.resolve([]);
  }

  /* ------------------------------------------------------------- pooling -- */

  /* One ordered candidate list per language. The order IS the priority rule. */
  function poolsFor(states, newToday) {
    var byKey = {};
    states.forEach(function (s) { byKey[s.key] = s; });

    var staleBefore = Date.now() - STALE_DAYS * 86400000;
    var yday = yesterday();
    var pools = {};
    var newBudget = Math.max(0, NEW_PER_DAY - newToday.length);

    LANGS.forEach(function (L) {
      var lang = L.code;
      var missed = [], stale = [], fresh = [], known = [];

      WORDS.forEach(function (w) {
        if (!AUDIO.isPlayable(w.id, lang)) return;      /* no voice: never queue it */
        var st = byKey[keyOf(w.id, lang)];

        if (st && st.retired) return;

        if (!st || !st.lastHeard) {
          /* Reserve words only enter as substitutes, never as ordinary new words. */
          if (w.tier === "reserve" && !(st && st.substitute)) return;
          fresh.push({ wordId: w.id, lang: lang, _sub: !!(st && st.substitute) });
          return;
        }
        if (st.lastMissDay === yday)      { missed.push({ wordId: w.id, lang: lang, _t: st.lastHeard }); return; }
        if (st.lastHeard < staleBefore)   { stale.push({ wordId: w.id, lang: lang, _t: st.lastHeard });  return; }
        known.push({ wordId: w.id, lang: lang, _t: st.lastHeard });
      });

      var byOldest = function (a, b) { return (a._t || 0) - (b._t || 0); };
      stale.sort(byOldest);
      known.sort(byOldest);

      /* Substitutions jump the queue; genuinely new words are rationed. */
      var subs = fresh.filter(function (f) { return f._sub; });
      var brand = fresh.filter(function (f) { return !f._sub; }).slice(0, newBudget);

      pools[lang] = {
        priority: missed.concat(stale, subs, brand),
        cycle: known.length ? known : missed.concat(stale)
      };
    });

    return pools;
  }

  /* --------------------------------------------------------- assembling -- */

  /* Emit whole blocks of one language at a time. Within a block, no repeats. */
  function emit(pools, startBlock, blocks, cursors) {
    var items = [];
    for (var b = 0; b < blocks; b++) {
      var L = LANGS[(startBlock + b) % LANGS.length];
      var pool = pools[L.code];
      if (!pool) continue;

      var seen = {}, added = 0, guard = 0;
      while (added < BLOCK && guard < 400) {
        guard++;
        var pick = null;

        if (pool.priority.length) {
          pick = pool.priority.shift();
        } else if (pool.cycle.length) {
          /* Cycle the known words for ever. This is what makes the session
           * endless: the list wraps instead of running out. */
          var c = cursors[L.code] || 0;
          pick = pool.cycle[c % pool.cycle.length];
          cursors[L.code] = c + 1;
        } else {
          break;   /* this language has no playable words at all yet */
        }

        if (!pick || seen[pick.wordId]) continue;
        seen[pick.wordId] = true;
        items.push({ wordId: pick.wordId, lang: L.code });
        added++;
      }
    }
    return items;
  }

  /* ------------------------------------------------------------- public -- */

  function build() {
    var day = today();
    return DB.get("queue", day).then(function (existing) {
      /* Reopening later the same day resumes the same queue, same place. */
      if (existing && existing.items && existing.items.length) return existing;

      return DB.all("state").then(function (states) {
        return applyRetirements(states || []).then(function () {
          return DB.all("state");
        });
      }).then(function (states) {
        var pools = poolsFor(states || [], []);
        var cursors = {};
        var q = {
          day: day,
          createdAt: Date.now(),
          cursor: 0,
          blockSize: BLOCK,
          newToday: [],
          cursors: cursors,
          items: emit(pools, 0, Math.ceil(BATCH / BLOCK), cursors)
        };
        /* Record which brand-new words today spent its budget on. */
        var seenState = {};
        (states || []).forEach(function (s) { seenState[s.key] = true; });
        q.items.forEach(function (it) {
          if (!seenState[keyOf(it.wordId, it.lang)] && q.newToday.indexOf(it.wordId) === -1) {
            q.newToday.push(it.wordId);
          }
        });
        return DB.put("queue", q).then(function () { return q; });
      });
    });
  }

  function maybeExtend(q) {
    if (q.items.length - q.cursor > TOPUP_AT) return Promise.resolve(q);
    return DB.all("state").then(function (states) {
      var pools = poolsFor(states || [], q.newToday || []);
      q.cursors = q.cursors || {};
      var startBlock = Math.floor(q.items.length / BLOCK);
      var more = emit(pools, startBlock, Math.ceil(BATCH / BLOCK), q.cursors);
      if (!more.length) return q;      /* nothing playable at all - caller handles */
      q.items = q.items.concat(more);
      return DB.put("queue", q).then(function () { return q; });
    });
  }

  /* Record one tap of a scoring button, and roll the derived state forward. */
  function record(wordId, lang, result, voice, deviceId) {
    var ts = Date.now();
    var attempt = {
      id: ts + "-" + wordId + "-" + lang,
      ts: ts, wordId: wordId, lang: lang,
      voice: voice || "none", result: result ? 1 : 0,
      device: deviceId || "unknown"
    };
    var key = keyOf(wordId, lang);

    return DB.put("attempts", attempt).then(function () {
      return DB.get("state", key);
    }).then(function (st) {
      var day = dayKey(ts);
      if (!st) {
        st = { key: key, wordId: wordId, lang: lang, firstHeard: ts,
               heard: 0, got: 0, missed: 0, missStreakDays: 0,
               lastMissDay: null, retired: false, retiredAt: null, replacedBy: null };
      }
      st.lastHeard = ts;
      st.heard = (st.heard || 0) + 1;
      if (result) {
        st.got = (st.got || 0) + 1;
        st.missStreakDays = 0;         /* one good day clears the streak */
      } else {
        st.missed = (st.missed || 0) + 1;
        /* Count DAYS with a miss, not misses. Ten misses in one sitting is one
         * bad day, not instant retirement. */
        if (st.lastMissDay !== day) {
          var wasYesterday = st.lastMissDay === dayKey(ts - 86400000);
          st.missStreakDays = wasYesterday ? (st.missStreakDays || 0) + 1 : 1;
          st.lastMissDay = day;
        }
      }
      return DB.put("state", st).then(function () { return attempt; });
    });
  }

  function todaysLog() {
    var start = new Date(); start.setHours(0, 0, 0, 0);
    return DB.all("attempts").then(function (rows) {
      var mine = (rows || []).filter(function (a) { return a.ts >= start.getTime(); });
      var got = [], missed = [];
      mine.forEach(function (a) { (a.result ? got : missed).push(a); });
      return { all: mine, got: got, missed: missed };
    });
  }

  return {
    build: build, maybeExtend: maybeExtend, record: record,
    todaysLog: todaysLog, dayKey: dayKey, today: today, yesterday: yesterday,
    keyOf: keyOf, wordById: wordById, BLOCK: BLOCK
  };
}());
