/* scheduler.js - builds the queue from the log.
 *
 * Priority, in order:
 *   1. words missed yesterday
 *   2. words not heard in 4+ days, oldest first - a word never heard counts as
 *      oldest, so new words surface naturally
 *   3. then forever: everything else, least-recently-heard first
 *
 * Step 3 has no end condition. There is no target count, no timer and no
 * completion state anywhere in this file. The queue tops itself up whenever it
 * gets close to the end, so it cannot run dry however long she keeps going.
 *
 * There used to be a hard cap of two new words a day. It was removed: with the
 * cap in place a 300-tap session served 12 distinct words out of 75, because
 * the endless filler could only recycle words already introduced. Every word is
 * now in play from the first session.
 *
 * Everything is keyed by word AND language. She may know "water" in Hindi and
 * not in Gujarati; those are different things to learn and are tracked apart.
 */

var SCHED = (function () {
  "use strict";

  /* Words of one language before it rotates. This is what stops a session
   * being all-English: the queue is built in blocks of BLOCK, one language per
   * block, so all three languages appear within the first 3 * BLOCK taps no
   * matter how large the word pool is. */
  var BLOCK = 6;

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
   * and pulls in an easier reserve word FOR THAT LANGUAGE ONLY. Retiring
   * Gujarati "butterfly" leaves English "butterfly" completely alone. */

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
          substitute: true   /* a swap, not ordinary vocabulary */
        });
      }
    });

    return changed.length ? DB.putMany("state", changed).then(function () { return changed; })
                          : Promise.resolve([]);
  }

  /* ------------------------------------------------------------- pooling -- */

  /* One ordered candidate list per language. The order IS the priority rule. */
  function poolsFor(states) {
    var byKey = {};
    states.forEach(function (s) { byKey[s.key] = s; });

    var staleBefore = Date.now() - STALE_DAYS * 86400000;
    var yday = yesterday();
    var tday = today();
    var pools = {};

    LANGS.forEach(function (L) {
      var lang = L.code;
      var missed = [], everything = [];

      WORDS.forEach(function (w) {
        if (!AUDIO.isPlayable(w.id, lang)) return;      /* no voice: never queue it */
        var st = byKey[keyOf(w.id, lang)];

        if (st && st.retired) return;

        /* Reserve words are substitutes only. They enter when retirement puts
         * them in, never as ordinary vocabulary. */
        var isSub = !!(st && st.substitute);
        if (w.tier === "reserve" && !isSub) return;

        var t = (st && st.lastHeard) || 0;

        /* Rank keeps the original priority order intact now that every word is
         * in the pool. Sorting purely by "last heard" would put never-heard
         * words (time zero) ahead of everything, burying a word she has not
         * heard for a week under sixty she has never met.
         *   0 = heard before but not for 4+ days   - the revision that matters
         *   1 = never heard                        - new ground
         *   2 = heard recently                     - the endless filler */
        var rank = (t > 0 && t < staleBefore) ? 0 : (t === 0 ? 1 : 2);
        everything.push({ wordId: w.id, lang: lang, _t: t, _r: rank });

        /* Today's misses count as well as yesterday's. Ending the day and
         * starting again should lead with what she just got wrong, not wait
         * until tomorrow to notice. */
        if (st && (st.lastMissDay === yday || st.lastMissDay === tday)) {
          missed.push({ wordId: w.id, lang: lang, _t: t });
        }
      });

      var byOldest = function (a, b) { return (a._t || 0) - (b._t || 0); };
      var byRankThenOldest = function (a, b) {
        return (a._r - b._r) || ((a._t || 0) - (b._t || 0));
      };
      missed.sort(byOldest);
      everything.sort(byRankThenOldest);

      /* `priority` is served first and consumed once: the words she got wrong
       * yesterday. `cycle` is the endless filler and holds EVERY playable word
       * in this language, least-recently-heard first, so it both surfaces
       * never-heard and stale words early and never runs out of variety.
       *
       * Words missed yesterday sit in both, which is intended - once the
       * priority copy is served the word still has to be able to come round
       * again later. */
      pools[lang] = {
        priority: missed,
        cycle: everything
      };
    });

    return pools;
  }

  /* --------------------------------------------------------- assembling -- */

  /* Emit whole blocks of one language at a time. Within a block, no repeats -
   * unless the language has fewer than six words available at all, in which
   * case repeating beats emitting a short block and stalling the queue. */
  function emit(pools, startBlock, blocks, cursors) {
    /* Rotate only through languages that actually have something to play.
     * An empty language would emit an empty block, sliding every later block
     * out of alignment and mixing two languages into one screenful. */
    var live = LANGS.filter(function (L) {
      var p = pools[L.code];
      return p && (p.priority.length || p.cycle.length);
    });
    if (!live.length) return [];

    var items = [];
    for (var b = 0; b < blocks; b++) {
      var L = live[(startBlock + b) % live.length];
      var pool = pools[L.code];

      var seen = {}, added = 0, guard = 0, lap = 0, allowRepeat = false;
      while (added < BLOCK && guard < 600) {
        guard++;
        var pick = null;

        if (pool.priority.length) {
          pick = pool.priority.shift();
        } else if (pool.cycle.length) {
          /* Cycle for ever. This is what makes the session endless: the list
           * wraps instead of running out. */
          var c = cursors[L.code] || 0;
          pick = pool.cycle[c % pool.cycle.length];
          cursors[L.code] = c + 1;
        } else {
          break;
        }
        if (!pick) continue;

        if (seen[pick.wordId] && !allowRepeat) {
          /* A whole lap of the cycle with nothing new means this language has
           * fewer than six words available. Repeat rather than truncate. */
          if (++lap > pool.cycle.length) allowRepeat = true;
          continue;
        }
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
      /* Reopening later the same day resumes the same queue, same place -
       * unless the day was explicitly ended, in which case a fresh queue is
       * built from what she actually did today. */
      if (existing && existing.items && existing.items.length && !existing.endedAt) {
        return existing;
      }

      return DB.all("state").then(function (states) {
        return applyRetirements(states || []).then(function () {
          return DB.all("state");
        });
      }).then(function (states) {
        var pools = poolsFor(states || []);
        var cursors = {};
        var q = {
          day: day,
          createdAt: Date.now(),
          cursor: 0,
          blockSize: BLOCK,
          cursors: cursors,
          items: emit(pools, 0, Math.ceil(BATCH / BLOCK), cursors)
        };
        return DB.put("queue", q).then(function () { return q; });
      });
    });
  }

  /* End the day. Clears today's queue so the next launch builds a new one
   * ordered by what she got wrong today, and stamps when it happened. Nothing
   * leaves the phone: the scheduler only ever reads this device's own log. */
  function endDay() {
    var day = today();
    return DB.get("queue", day).then(function (q) {
      var ended = {
        day: day,
        createdAt: (q && q.createdAt) || Date.now(),
        endedAt: Date.now(),
        cursor: 0,
        blockSize: BLOCK,
        cursors: {},
        items: []
      };
      return DB.put("queue", ended);
    }).then(function () {
      return DB.metaSet("lastEndedDay", day);
    });
  }

  function maybeExtend(q) {
    if (q.items.length - q.cursor > TOPUP_AT) return Promise.resolve(q);
    return DB.all("state").then(function (states) {
      var pools = poolsFor(states || []);
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
        /* Getting it right clears the miss flag too, so "missed" means she is
         * still struggling rather than that she stumbled once this morning. */
        st.lastMissDay = null;
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
    build: build, endDay: endDay, maybeExtend: maybeExtend, record: record,
    todaysLog: todaysLog, dayKey: dayKey, today: today, yesterday: yesterday,
    keyOf: keyOf, wordById: wordById, BLOCK: BLOCK
  };
}());
