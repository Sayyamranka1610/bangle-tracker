# Bangle Tracker — Claude Code Project Guide

This file is automatically read by Claude Code on any device. Keep it up to date.

## Project Overview

Two web apps in this repo, both deployed on GitHub Pages:

| App | File | Live URL |
|-----|------|----------|
| Bangle Tracker | `bangle_v19.html` (+ `index.html` redirect) | `https://sayyamranka1610.github.io/bangle-tracker/` |
| WorkBoard | `workboard.html` | `https://sayyamranka1610.github.io/bangle-tracker/workboard.html` |

**Repo:** `https://github.com/Sayyamranka1610/bangle-tracker`
Push to `main` → GitHub Pages auto-deploys.

## Tech Stack

- **Frontend:** Single HTML files, vanilla JS (no build step)
- **Database:** Firebase Realtime Database — `https://bangle-tracker-default-rtdb.firebaseio.com`
  - Bangle Tracker data: `/appData/`
  - WorkBoard tasks: `/wb3/` (not `/wb/` — migrated to `/wb3/`)
- **Auth:** Custom username/password (stored in Firebase), no Firebase Auth
- **Deployment:** GitHub Pages (static hosting)
- **Service Worker:** Versioned SW for cache busting (increment version on each deploy)

## WorkBoard App

Team task management, mobile-first.

**Default login:** username `owner`, password `admin123`

**Key features:**
- Owner sees all workers' columns + analytics portal (Chart.js)
- Workers see only their own tasks
- Overdue tasks auto-flagged; cannot complete without justification text
- Real-time sync via Firebase JS SDK
- Owner can delete all tasks and manage workers in Settings

## Bangle Tracker App

Order/inventory tracker for bangles business. Image upload, PDF export, order tracking.

## Code Conventions

- All logic in a single `.html` file per app (HTML + CSS + JS inline)
- Firebase JS SDK (compat v8 API style)
- Atomic field-level updates to Firebase (never overwrite full objects)
- Mobile-first UI, works as PWA (service worker registered)

## Deployment

```bash
git add <files>
git commit -m "message"
git push origin main
# GitHub Pages deploys automatically in ~1 minute
```

## Cross-Device Setup

On a new device:
1. `git clone https://github.com/Sayyamranka1610/bangle-tracker.git`
2. `cd bangle-tracker`
3. Install Claude Code: `npm install -g @anthropic-ai/claude-code`
4. Run `claude` — this CLAUDE.md is auto-loaded, giving full project context
5. Optional: copy `.claude-memory/` files to `~/.claude/projects/<path>/memory/` for full memory
