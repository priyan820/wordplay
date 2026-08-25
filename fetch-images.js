#!/usr/bin/env node
/*
 * fetch-images.js — one-shot image fetcher.
 *
 * THIS IS A WORKSHOP TOOL. It never runs on a phone, the app never calls it,
 * and nothing in the deployed site depends on it. Its only output is ordinary
 * .jpg files committed into the repo, which is why the app has no network
 * dependency for images.
 *
 *   node fetch-images.js                    fetch everything still missing
 *   node fetch-images.js --redo spoon,ant   throw those away and fetch again
 *   node fetch-images.js --redo-file r.txt  same, one word per line
 *
 * Re-running skips every word that already has an image, so it is always safe
 * to run again.
 *
 * Requires Node 18+ (for built-in fetch) and sharp for image processing:
 *     npm install sharp
 * If you have no Node installed, use fetch-images.ps1 instead — it does exactly
 * the same job using image tools already built into Windows, with no installs.
 */

"use strict";

const fs   = require("fs");
const path = require("path");

let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  console.error("\n  This script needs the 'sharp' image library.\n" +
                "    npm install sharp\n\n" +
                "  Or run fetch-images.ps1 instead — same output, no installs.\n");
  process.exit(1);
}

/* ----------------------------------------------------------------- config -- */

const ROOT       = __dirname;
const WORDS_FILE = path.join(ROOT, "js", "words.js");
const IMAGES_DIR = path.join(ROOT, "images");
const MANIFEST   = path.join(IMAGES_DIR, "manifest.json");
const REJECTED   = path.join(IMAGES_DIR, "rejected.json");
const NEEDS_FILE = path.join(ROOT, "needs-image.txt");

const SIZE     = 800;
const DELAY_MS = 300;
const UA = "wordplay-image-fetch/1.0 (private family language app; contact via repo owner)";

/* Titles that mean "not one clear object a toddler can name". */
const BAD_TITLE = /collage|\bset\b|collection|\bicon\b|vector|logo|diagram|clipart|pattern|wallpaper|texture/i;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------------ args -- */

const argv  = process.argv.slice(2);
const argOf = name => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};
let redo = (argOf("--redo") || "").split(",").map(s => s.trim()).filter(Boolean);
const redoFile = argOf("--redo-file");
if (redoFile && fs.existsSync(redoFile)) {
  redo = redo.concat(
    fs.readFileSync(redoFile, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  );
}

/* ------------------------------------------------------------- word list -- */
/* Single source of truth: the ids in js/words.js. Never a second hard-coded
 * list that can drift out of sync with the app. */

const src   = fs.readFileSync(WORDS_FILE, "utf8");
const words = [...new Set([...src.matchAll(/id:\s*"([a-z0-9_-]+)"/g)].map(m => m[1]))];
console.log(`Words in catalogue: ${words.length}`);

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const readJson = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {});
const manifest = readJson(MANIFEST);
const rejects  = readJson(REJECTED);

for (const w of redo) {
  if (manifest[w]) {
    /* Remember the URL being rejected so the next search cannot pick it again. */
    (rejects[w] = rejects[w] || []).push(manifest[w].direct);
    delete manifest[w];
    const f = path.join(IMAGES_DIR, `${w}.jpg`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
    console.log(`  redo: ${w}`);
  }
}

/* ------------------------------------------------------------ rate limit -- */
/* Openverse allows 20 requests/minute and 200/day anonymously. A flat 300ms
 * delay trips the burst cap after 20 words, so we read the remaining budget
 * out of the response headers and wait for the window to roll when it's low. */

let burstLeft = 20;
async function waitForBudget() {
  await sleep(DELAY_MS);
  if (burstLeft <= 2) {
    console.log("  (burst budget spent — waiting 62s for the window to roll)");
    await sleep(62000);
    burstLeft = 20;
  }
}

async function openverse(query) {
  await waitForBudget();
  const url = "https://api.openverse.org/v1/images/?q=" + encodeURIComponent(query) +
              "&license_type=all&size=medium";
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429) {
      console.log("  (rate limited — waiting 62s)");
      await sleep(62000);
      burstLeft = 20;
      return [];
    }
    const b = res.headers.get("x-ratelimit-available-anon_burst");
    if (b) burstLeft = parseInt(b, 10);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results || []).map(r => ({
      title:    r.title,
      direct:   r.url,
      page:     r.foreign_landing_url,
      creator:  r.creator,
      license:  r.license,
      provider: `openverse/${r.source}`
    }));
  } catch (e) {
    console.log(`  openverse error: ${e.message}`);
    return [];
  }
}

async function commons(query) {
  await sleep(DELAY_MS);
  const url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
              "&gsrsearch=" + encodeURIComponent(`filetype:bitmap ${query}`) +
              "&gsrlimit=8&gsrnamespace=6&prop=imageinfo&iiprop=url%7Cextmetadata" +
              "&iiurlwidth=1200&format=json";
  try {
    const res  = await fetch(url, { headers: { "User-Agent": UA } });
    const json = await res.json();
    if (!json.query || !json.query.pages) return [];
    return Object.values(json.query.pages)
      .filter(p => p.imageinfo && p.imageinfo.length)
      .map(p => {
        const ii = p.imageinfo[0];
        const em = ii.extmetadata || {};
        return {
          title:    p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
          direct:   ii.thumburl || ii.url,
          page:     ii.descriptionurl,
          creator:  em.Artist ? em.Artist.value.replace(/<[^>]+>/g, "").trim() : "Wikimedia Commons",
          license:  em.LicenseShortName ? em.LicenseShortName.value : "see page",
          provider: "wikimedia"
        };
      });
  } catch (e) {
    console.log(`  commons error: ${e.message}`);
    return [];
  }
}

/* -------------------------------------------------------- image pipeline -- */

async function saveSquare(buf, outPath) {
  /* Centre-crop to a square FIRST, then scale to exactly SIZE. Doing it this
   * way yields a true 800x800 every time; scaling the long edge first would
   * leave the cropped square smaller than 800 on most source images.
   * sharp drops EXIF/GPS/ICC unless explicitly told to keep them, so the
   * saved file carries no metadata from the original. */
  const img  = sharp(buf, { failOn: "none" });
  const meta = await img.metadata();
  if (!meta.width || !meta.height) return "unreadable";
  if (meta.width < 400 || meta.height < 400) return `too small (${meta.width}x${meta.height})`;

  const side = Math.min(meta.width, meta.height);
  await img
    .extract({
      left: Math.floor((meta.width  - side) / 2),
      top:  Math.floor((meta.height - side) / 2),
      width: side, height: side
    })
    .resize(SIZE, SIZE, { fit: "fill", kernel: "lanczos3" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(outPath);
  return null;
}

async function getBytes(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function usable(c, word) {
  if (!c.direct) return false;
  if (/\.svgz?($|\?)/i.test(c.direct)) return false;
  if (c.title && BAD_TITLE.test(c.title)) return false;
  if (rejects[word] && rejects[word].includes(c.direct)) return false;
  return true;
}

/* ------------------------------------------------------------------ main -- */

/* The manifest is written after every success, not just at the end. A crash or
 * a rate-limit stall 60 words in must not orphan the images already on disk —
 * a re-run should pick up exactly where this one stopped. */
function saveState() {
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(REJECTED, JSON.stringify(rejects,  null, 2));
}

(async function main() {
  const needs = [];
  let got = 0, n = 0;

  for (const word of words) {
    n++;
    const file = path.join(IMAGES_DIR, `${word}.jpg`);
    if (manifest[word] && fs.existsSync(file)) {
      console.log(`[${n}/${words.length}] ${word} — already have it, skipping`);
      continue;
    }
    console.log(`[${n}/${words.length}] ${word}`);
    let saved = false;

    /* Openverse, with modifiers that bias towards one clear object. */
    for (const modifier of ["isolated", "single", ""]) {
      if (saved) break;
      const q = modifier ? `${word} ${modifier}` : word;
      for (const c of await openverse(q)) {
        if (!usable(c, word)) continue;
        try {
          const err = await saveSquare(await getBytes(c.direct), file);
          if (err) continue;
          manifest[word] = {
            file: `${word}.jpg`, title: c.title, source: c.page, direct: c.direct,
            creator: c.creator, license: c.license, provider: c.provider,
            fetchedAt: new Date().toISOString(), query: q
          };
          console.log(`    ok  <${c.license}>  ${c.title}`);
          saved = true; got++;
          saveState();
          break;
        } catch (e) { continue; }
      }
    }

    /* Wikimedia Commons fallback. */
    if (!saved) {
      console.log("    openverse found nothing usable, trying Commons");
      for (const c of await commons(word)) {
        if (!usable(c, word)) continue;
        try {
          const err = await saveSquare(await getBytes(c.direct), file);
          if (err) continue;
          manifest[word] = {
            file: `${word}.jpg`, title: c.title, source: c.page, direct: c.direct,
            creator: c.creator, license: c.license, provider: c.provider,
            fetchedAt: new Date().toISOString(), query: word
          };
          console.log(`    ok (commons)  ${c.title}`);
          saved = true; got++;
          saveState();
          break;
        } catch (e) { continue; }
      }
    }

    /* Give up: the word keeps its emoji, which is a perfectly good screen. */
    if (!saved) {
      console.log("    NOTHING USABLE — staying on emoji");
      needs.push(word);
    }
  }

  saveState();

  if (needs.length) {
    fs.writeFileSync(NEEDS_FILE,
      "Words with no usable image. They fall back to their emoji, which is a\n" +
      "perfectly good screen — fix only if you want to.\n\n" + needs.join("\n") + "\n");
  } else if (fs.existsSync(NEEDS_FILE)) {
    fs.unlinkSync(NEEDS_FILE);
  }

  console.log(`\nDone. ${got} new image(s). ` +
              `${Object.keys(manifest).length} of ${words.length} words have photos.`);
  if (needs.length) console.log(`${needs.length} still on emoji — see needs-image.txt`);
}());
