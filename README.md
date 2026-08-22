# Wordplay

A voice-only word app for a 3-year-old who can't read. English, Hindi, Gujarati, Sindhi.

She sees one photo. She taps it. She hears a word in a parent's voice. That's the whole app
from her side. Everything else — scoring, scheduling, recording, syncing between two phones —
is behind a hidden long-press and is for the adults.

## The rules this app is built on

- **No text ever reaches her.** Word labels exist only in the parent zone.
- **No speech recognition.** The app never listens to her. It only plays.
- **The session never ends by itself.** No timer, no target, no "well done" screen.
  You end it, or she walks away. Both are the same thing.
- **She is never told she was wrong.** Every tap gets the same celebration.
- **Nothing is ever sent to a network.** Data leaves only through the iOS share sheet,
  by your hand.
- **Gujarati and Sindhi are never spoken by a robot.** iOS has no trustworthy voice for
  either. Without a real recording the app skips the word rather than mispronounce it.

## Opening it

**Always open it from the home-screen icon, never a Safari tab.** Safari deletes stored
data for ordinary websites after 7 days of not visiting. Home-screen apps are exempt.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The whole app. Kid mode and parent zone in one page. |
| `mic-test.html` | One-off microphone check. Delete once both phones have passed. |
| `review.html` | Image review grid. Yours, not hers. Not part of the app. |
| `js/` | The app, one file per job. Plain JavaScript, no framework, no build. |
| `images/` | 60 square photos, committed as permanent files. |
| `audio/` | Parent recordings, committed as permanent files. |
| `fetch-images.js` | One-time image fetcher (Node). **Never runs on a phone.** |
| `fetch-images.ps1` | Same thing in PowerShell, for a machine without Node. |

## Deploying

Nothing to run. Push to the private GitHub repo and Netlify publishes it in about
40 seconds. There is no build step — the folder is served exactly as it sits in git.
