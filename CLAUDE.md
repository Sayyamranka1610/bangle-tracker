# Bangle Tracker — Claude Code Project Guide

This file is automatically read by Claude Code on any device. Keep it up to date.

---

## ⚠️ CRITICAL DEPLOYMENT RULE — READ THIS FIRST

**Every fix, every change, every improvement MUST be pushed directly to `main` before the session ends.**

- This is a live single-file app. GitHub Pages serves directly from `main`. There is no staging, no preview, no other environment.
- Feature branches do NOT deploy. Pushing to a feature branch means the user sees zero change on the live app — the fix is invisible and useless until it reaches `main`.
- If the system creates a feature branch automatically, that is fine for development — but you MUST merge or push all changes to `main` before ending the session.
- Never end a session with unfixed code sitting on a branch. Always verify the final `git push` targets `main`.
- If there is any conflict between a background system rule about branches and this rule, this rule wins. Explain the conflict to the user and push to `main`.

---

## Project Overview

One repo, two independent web apps — both deployed via GitHub Pages:

| App | Source File | Entry Point | Live URL |
|-----|-------------|-------------|----------|
| Bangle Tracker | `bangle_v19.html` | `index.html` (redirect) | `https://sayyamranka1610.github.io/bangle-tracker/` |
| WorkBoard | `workboard.html` | `workboard.html` | `https://sayyamranka1610.github.io/bangle-tracker/workboard.html` |

**Repo:** `https://github.com/Sayyamranka1610/bangle-tracker`  
Push to `main` → GitHub Pages auto-deploys (≈1 min).

---

## Tech Stack

- **Frontend:** Single `.html` files — all HTML, CSS, and JS inline. No build step, no bundler, no framework.
- **Database:** Firebase Realtime Database — `https://bangle-tracker-default-rtdb.firebaseio.com`
- **Auth:** Custom username/password stored in Firebase (no Firebase Auth SDK)
- **Deployment:** GitHub Pages (static hosting)
- **PWA:** Both apps have service workers and manifests — installable on mobile

---

## Repository File Map

```
bangle-tracker/
├── bangle_v19.html          # Bangle Tracker app (~10,267 lines)
├── index.html               # Redirect to bangle_v19.html (with OG meta tags)
├── bangle-sw.js             # Service worker for Bangle Tracker (cache: bangle-tracker-v9)
├── manifest.json            # PWA manifest for Bangle Tracker
├── bangle-logo.jpg          # Brand logo
├── icon-192.png             # PWA icon (192×192)
├── icon-512.png             # PWA icon (512×512, maskable)
│
├── workboard.html           # WorkBoard app (~1,426 lines)
├── workboard-sw.js          # Service worker for WorkBoard (cache: workboard-v6)
├── workboard-manifest.json  # PWA manifest for WorkBoard
├── workboard-icon-192.png   # PWA icon (192×192)
├── workboard-icon-512.png   # PWA icon (512×512, maskable)
│
├── Bangle_Order_Template.xlsx  # Order spreadsheet template (gitignored)
├── CLAUDE.md                # This file
├── .gitignore
└── .claude-memory/
    ├── MEMORY.md
    └── project_workboard.md
```

---

## Firebase Database Structure

Both apps share the same Firebase project but use separate paths:

```
/ (Firebase Realtime DB root)
├── appData/          # Bangle Tracker — orders, designs, inventory
├── bangImages/       # Bangle Tracker — full-quality image blobs (base64)
├── users/            # Bangle Tracker — user credentials & roles
├── editLock/         # Bangle Tracker — concurrent-edit lock
├── accessRequest/    # Bangle Tracker — read-only device access grants
└── wb3/              # WorkBoard (NOT /wb/ — migrated from that path)
    ├── users/        # Team member credentials & roles
    ├── tasks/        # Task records
    └── customRoles/  # Custom role definitions
```

**Critical:** WorkBoard data lives at `/wb3/`, NOT `/wb/`. Never write to `/wb/`.

---

## App 1: Bangle Tracker (`bangle_v19.html`)

Production-management dashboard for a bangles manufacturing business.

### Auth & Sessions

- Login credentials stored in Firebase `/users.json`
- Session token kept in `sessionStorage` as `bt_auth`
- Roles: **Owner** (read-write) vs **Worker** (read-only)
- **File lock system:** Only one session edits at a time; lock expires after 5 min without heartbeat (`LOCK_EXPIRE_MS = 5 * 60 * 1000`)
- Device ID (`FB_DEVICE_ID`) prevents re-applying own Firebase updates

### Key Features

1. **Orders** — Create/edit client orders with deadlines and order IDs
2. **Design Module** — Track CNC & Dye Gold bangle designs:
   - Multi-size varieties (S/M/L etc.) with per-size quantities
   - Image upload: compressed version stored in Firebase; full-quality image stored in `/bangImages/{key}` (base64)
   - Design codes, names, variety breakdown or simplified CNC-quantity mode
3. **Inventory Ledger** — Raw material and finished-set tracking:
   - In/out entries linked to orders
   - Vendor/party tracking
   - Per-design quantity summaries
4. **Analytics** — Stat cards: Total, On Track, Soon, Late, Done
5. **User Management** — Self-service and owner-controlled password management
6. **Audit Trail** — Activity log for all changes
7. **Export** — XLSX download via `xlsx.full.min.js` (CDN)

### Global State & Key Functions

| Symbol | Purpose |
|--------|---------|
| `S` | Global state object — orders, designs, inventory, vocabulary |
| `save()` | Debounced push to Firebase |
| `render()` | Re-render UI from state |
| `renderStats()` | Update stat cards |
| `openModal()` / `closeModal()` | Modal management |
| `_tryAcquireLock()` | Acquire edit lock on page load |
| `audit()` | Log a change to audit trail |
| `showToast()` | Display a notification toast |

### Service Worker (`bangle-sw.js`)

- **Cache name:** `bangle-tracker-v9`
- **Strategy:** Network-first; Firebase RTDB calls bypass cache entirely (network-only)
- **App shell cached:** `bangle_v19.html`, logo, icons, manifest, XLSX CDN, Google Fonts

**Rule:** Increment the cache version string (e.g. `v9` → `v10`) on every deploy that changes cached assets, to force cache invalidation.

---

## App 2: WorkBoard (`workboard.html`)

Team task management — mobile-first, real-time.

### Auth & Sessions

- Step-based login: pick username → enter password
- Credentials stored in Firebase `/wb3/users`
- Session ID stored in `localStorage` (`LS_SESS`)
- Remember-me stored in `localStorage` (`LS_REM`)
- Roles: **owner**, **manager**, **employee**
- Default owner credentials: username `owner`, password `admin123`

### Key Features

1. **Task Management** — Create/assign/track tasks:
   - Status: `pending`, `in_progress`, `completed`
   - Priority: `high`, `medium`, `low`
   - Deadline enforcement: late completion requires justification text
   - Task grouping: Today / Tomorrow / Overdue / No Deadline
   - **Overdue is NEVER stored in Firebase** — always computed locally (`task.deadline < now()`)
2. **Team Overview** (admin only) — Per-member progress bars with completed/in-progress/pending/overdue counts
3. **Analytics** (admin only) — Chart.js visualizations:
   - Doughnut chart: task status breakdown
   - Stacked bar chart: tasks per member
4. **Settings** — Manage team members; danger zone to delete all tasks
5. **Notifications** — Web Notifications API + background sync via service worker:
   - New task assigned
   - 30-minute deadline warning
   - Overdue alerts
   - App badge updated with overdue count
   - Tracks sent notifications in `localStorage` (`LS_NF`) to prevent duplicates

### Global State & Key Functions

| Symbol | Purpose |
|--------|---------|
| `S` | Global state — me, users, tasks, customRoles, view, filter, editTask, editUser |
| `startSync()` / `stopSync()` | Firebase realtime listener on `/wb3/` |
| `writeTask()` / `deleteTask()` | Firebase task write/delete |
| `setStatus()` | Atomic status field update |
| `doLogin()` / `doLogout()` | Auth |
| `render()` | Main UI renderer |
| `displayStatus()` | Computed field — detects overdue, never stored |
| `checkNotifs()` | Triggers browser notifications |
| `setupBgNotifs()` | Registers periodic background sync with SW |
| `saveBgState()` | Caches login state for background notification checks |

### Service Worker (`workboard-sw.js`)

- **Cache name:** `workboard-v6`
- **Notification state cache:** `wb-notif-state` (stores userId, seenTasks, notified set)
- **Strategies:**
  - HTML: network-first (no-cache header)
  - CDN (fonts, Chart.js): cache-first
  - Firebase: network-only (never cached)
  - Everything else: network with cache fallback
- **Background sync:** Periodic sync handler `wb-notif-check` (15-min minimum interval) fetches fresh task data and fires notifications when app is closed

**Rule:** Increment `workboard-v6` → `workboard-v7` on every deploy that changes cached assets.

---

## Code Conventions

### General

- All logic lives in the single `.html` file for that app. No external JS modules.
- Firebase JS SDK — compat v8 API style (e.g. `firebase.database().ref(...).set(...)`)
- **Atomic field-level updates:** use `update({ field: value })`, never overwrite full objects unless creating new records
- Mobile-first CSS; both apps work as installable PWAs
- No TypeScript, no transpilation, no linting — vanilla JS only

### Firebase Writes

```js
// Atomic update (preferred for edits)
db.ref(`wb3/tasks/${id}`).update({ status: 'completed', completedAt: Date.now() });

// Full replace (acceptable only for new records)
db.ref(`wb3/tasks/${id}`).set({ ...newTask });
```

### Image Handling (Bangle Tracker only)

- Compressed thumbnail stored inline in `/appData/` for fast display
- Full-quality image stored separately at `/bangImages/{key}` as base64 data URL
- Loading full images is deferred — only fetched on explicit request

### Service Worker Versioning

When editing any file included in an app shell (HTML, icons, manifest, CDN URLs):
1. Open the relevant `*-sw.js` file
2. Increment the `CACHE_NAME` version number (e.g. `bangle-tracker-v9` → `bangle-tracker-v10`)
3. Commit both the changed file AND the updated SW in the same commit

### Concurrency (Bangle Tracker)

- Only one session can write at a time — the edit lock at `/editLock/` enforces this
- Heartbeat must be maintained or lock expires in 5 minutes
- On acquiring lock, always reload data first to pick up remote changes

---

## Deployment

```bash
# Stage files you changed
git add bangle_v19.html bangle-sw.js   # or workboard.html workboard-sw.js

git commit -m "brief description of change"
git push origin main
# GitHub Pages deploys automatically in ~1 minute
```

**Do not** push to feature branches expecting deployment — only `main` deploys.

---

## PWA Details

| | Bangle Tracker | WorkBoard |
|--|--|--|
| Manifest | `manifest.json` | `workboard-manifest.json` |
| SW file | `bangle-sw.js` | `workboard-sw.js` |
| Cache name | `bangle-tracker-v9` | `workboard-v6` |
| App name | "Siddhi Bangle Tracker" | "Siddhi Workboard" |
| Theme color | `#534AB7` | `#6366f1` |
| Background | `#1a1750` | `#0f172a` |
| Start URL | `bangle_v19.html?pwa=bangle` | `workboard.html?pwa=1` |

---

## .gitignore Notes

```
.claude/worktrees/
.claude/settings.local.json
*.xlsx          # Business data — never commit spreadsheets
*.pdf           # Business data — never commit PDFs
.DS_Store
Thumbs.db
```

---

## Cross-Device Setup

On a new device:
1. `git clone https://github.com/Sayyamranka1610/bangle-tracker.git`
2. `cd bangle-tracker`
3. Install Claude Code: `npm install -g @anthropic-ai/claude-code`
4. Run `claude` — this CLAUDE.md is auto-loaded with full project context
5. Optional: copy `.claude-memory/` files to `~/.claude/projects/<path>/memory/` for full memory

---

## Common Pitfalls

| Pitfall | Rule |
|---------|------|
| Writing overdue status to Firebase | Never — compute it locally from `task.deadline < Date.now()` |
| Using `/wb/` path for WorkBoard | Always use `/wb3/` — `/wb/` is the old migrated path |
| Forgetting to bump SW cache version | Always increment when changing cached assets |
| Overwriting full Firebase objects on edit | Use atomic `update()` for field-level changes |
| Committing `.xlsx` or `.pdf` files | Gitignored; keep business data out of the repo |
| Pushing to a branch other than `main` | Only `main` triggers GitHub Pages deployment |
