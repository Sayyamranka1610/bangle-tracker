# Siddhi Bangle Tracker — Claude Code Onboarding

## What this project is
A production tracking web app for Siddhi Bangles business. Two apps in one repo:
- **Bangle Tracker** (main app): `https://sayyamranka1610.github.io/bangle-tracker/`
- **WorkBoard** (team tasks): `https://sayyamranka1610.github.io/bangle-tracker/workboard.html`

**Repo:** `https://github.com/Sayyamranka1610/bangle-tracker`  
Push to `main` → live in ~1 minute (GitHub Pages auto-deploys).

---

## How to fix something

1. The code lives in `bangle_v19.html` (Bangle Tracker) and `workboard.html` (WorkBoard)
2. Make the fix in the file
3. Run: `git add <file> && git commit -m "fix: description" && git push origin main`
4. Wait ~1 minute, refresh the live URL to verify

**CRITICAL:** Always push to `main`. Feature branches do NOT deploy.

---

## Tech stack (quick reference)

- Vanilla HTML/CSS/JS — no build step, no framework
- Firebase Realtime Database: `https://bangle-tracker-default-rtdb.firebaseio.com`
  - Bangle Tracker data: `/appData/`
  - Full-quality images: `/bangImages/{key}/`
  - Users: `/users/`
  - WorkBoard data: `/wb3/` ← always `/wb3/`, never `/wb/`
- GitHub Pages for hosting (static)
- Service worker: `bangle-sw.js` (cache: `bangle-tracker-v14`)

---

## Image system (important)

Every uploaded photo has two versions:
- `img.data` — compressed thumbnail (travels inline in Firebase for fast display)
- `img.hqData` / `img.fbKey` — full-quality original stored at `/bangImages/{key}` in Firebase

When printing, the app fetches full-quality images from Firebase automatically.

---

## Common issues and fixes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| App not loading | GitHub Pages down (rare) | Wait 5 min, retry |
| Data not syncing between devices | Firebase connectivity | Check Firebase Console for outages |
| Images not showing | Old images without fbKey | Log in as owner — migration runs automatically at startup |
| Orders disappearing | Read-only device pushed stale state | Fixed in code already; check audit log |
| Print PDF has no images | Pop-up blocked | Allow pop-ups for the site in browser settings |
| "Edit lock" stuck | Previous session crashed | Owner can force-take lock from the app UI |

---

## Firebase Console access
URL: `https://console.firebase.google.com`  
Project: **bangle-tracker** (project ID: `bangle-tracker`)

---

## Key people
- **Owner account:** username `Siddhi09`, password `siddhi` (hardcoded fallback)
- **Firebase project owner:** Sayyam Ranka

---

## If something is broken and you're not sure what to do
1. Open Claude Code in this repo directory
2. Describe exactly what's wrong (what you see, what you expected)
3. Claude will read the code and fix it
4. After the fix, always run `git push origin main`
