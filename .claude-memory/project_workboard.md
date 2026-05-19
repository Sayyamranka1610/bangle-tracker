---
name: WorkBoard app
description: Separate team task management app deployed alongside Bangle Tracker on GitHub Pages
type: project
originSessionId: d1aee673-58ba-421b-965c-b7f3150b2cc7
---
WorkBoard is a standalone `workboard.html` in the `bangle-tracker` GitHub repo, live at:
**https://sayyamranka1610.github.io/bangle-tracker/workboard.html**

**Why:** User wanted a mobile-first org-wide task manager for their team, with owner analytics and deadline enforcement.

**How to apply:** When editing workboard features, edit `workboard.html` in the repo root and push to `main` — GitHub Pages auto-deploys.

**Tech stack:**
- Single HTML file (vanilla JS, same pattern as bangle_v19.html)
- Firebase Realtime Database: `https://bangle-tracker-default-rtdb.firebaseio.com` at path `/wb/` (isolated from Bangle Tracker's `/appData/`)
- Hosted: GitHub Pages at `sayyamranka1610.github.io/bangle-tracker/workboard.html`

**Default login:** username `owner`, password `admin123` (owner can change and add workers in Settings)

**Key features:**
- Owner sees all workers' task columns + analytics portal
- Workers see only their own tasks
- Overdue tasks auto-detected; cannot mark complete without justification text
- Chart.js analytics: donut (status breakdown) + bar (per-person completed/overdue)
- Real-time Firebase sync across all devices
