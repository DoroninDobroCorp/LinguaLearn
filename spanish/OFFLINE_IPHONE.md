# Offline iPhone Setup

LinguaLearn Spanish can work as a lightweight offline PWA on iPhone.

## What Works Offline

- Exercises page, including all deterministic verb drills.
- Vocabulary page with the last synced vocabulary snapshot.
- Practice-only vocabulary rounds from cached words.
- Exporting the cached vocabulary snapshot.

## What Needs Internet

- AI chat.
- AI-generated exercises.
- Adding, deleting, importing vocabulary.
- Syncing spaced-repetition review timers back to the server.
- First-time loading after a fresh install.

## Install On iPhone

1. Open Safari on iPhone.
2. Go to:

   `https://145.239.82.124.sslip.io/spanish/exercises`

3. Wait until the page fully loads.
4. Open the Vocabulary page once while online, so the words are cached.
5. Tap the Safari share button.
6. Tap **Add to Home Screen**.
7. Name it, for example `Spanish`.
8. Open it from the new Home Screen icon.

## Before Going Offline

1. Open the installed app while you still have internet.
2. Visit **Vocabulary** once and wait until words load.
3. Visit **Exercises** once.
4. After that, airplane mode/offline use should still open the app.

## Updating Offline Data

When you have internet again:

1. Open the app from the Home Screen.
2. Open Vocabulary.
3. Wait until it loads normally.

The app refreshes the local offline snapshot after a successful online vocabulary load.

## Notes

- iOS storage can be cleared by Safari if the device is very low on storage or the app is unused for a long time.
- Offline vocabulary changes are intentionally limited. This avoids silent conflicts with the server review schedule.
- If the offline page does not open, connect to internet once and reopen the app to refresh the PWA cache.
- Use `https://145.239.82.124.sslip.io`, not `http://145.239.82.124`. Browser offline/PWA service workers require HTTPS on iPhone, and a raw HTTP IP address is not enough.
