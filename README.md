# Wordplay

A voice-only word app for a 3-year-old who can't read. English, Hindi, Gujarati.

She sees one photo. She taps it. She hears the word. That's the whole app from her side.
Everything else — scoring, scheduling, syncing between two phones — is behind a hidden
long-press and is for the adults.

## The rules this app is built on

- **No text ever reaches her.** Word labels exist only in the parent zone.
- **No speech recognition.** The app never listens. It only plays.
- **The session never ends by itself.** No timer, no target, no "well done" screen.
  You end it, or she walks away. Both are the same thing.
- **She is never told she was wrong.** Every tap gets the same celebration, and the two
  scoring buttons look and behave identically from her side.
- **Nothing is ever sent to a network.** Data leaves only through the iOS share sheet, by
  your hand. The app makes no network request at runtime at all.

## Plug and play

Nothing to set up. Every word ships with a photo and a spoken clip in all three languages,
committed into this repo as ordinary files. Open it once and it works, offline, forever.

**Always open it from the home-screen icon, never a Safari tab.** Safari deletes stored data
for ordinary websites after 7 days of not visiting. Home-screen apps are exempt.

## Why there is no Sindhi

It was in the original four. iOS ships no Sindhi voice, and no usable Sindhi audio source
exists. The only alternatives were an Urdu or Hindi voice approximating it — which would
teach her a subtly wrong word every single time — or leaving it out. It was left out.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The whole app. Kid mode and parent zone in one page. |
| `review.html` | Image review grid. Yours, not hers. Not part of the app. |
| `js/` | The app, one file per job. Plain JavaScript, no framework, no build step. |
| `images/` | 75 square photos, committed as permanent files. |
| `audio/` | 225 clips — 75 words × 3 languages — committed as permanent files. |
| `fetch-images.ps1` | One-time image fetcher. **Never runs on a phone.** |
| `fetch-audio.ps1` | One-time audio generator. **Never runs on a phone.** |
| `fetch-images.js` | Node version of the image fetcher, for a machine that has Node. |

The two `fetch-*` scripts are workshop tools. They run once, on a computer, and their only
output is ordinary `.jpg` and `.mp3` files committed here. The deployed app never calls them
and has no network dependency for pictures or sound.

## Deploying

Nothing to run. Push to `main` and GitHub Pages publishes it, usually within a minute.
There is no build step — the folder is served exactly as it sits in git.

Live at `https://priyan820.github.io/wordplay/`

One quirk: GitHub Pages caches HTML for about 10 minutes, so a change can take that long to
appear. The service worker refreshes itself in the background, so it lands on the next launch
regardless.
