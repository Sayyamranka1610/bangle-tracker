# Bangle Tracker — Claude Code Project Guide

This file is automatically read by Claude Code on any device. Keep it up to date.

---

## ⚠️ RULE 0.5: EXPLAIN EVERY CHANGE IN PLAIN LANGUAGE — MANDATORY

Owner is non-technical. For **every** change made to the app, always explain:
1. **What it was before** — how it worked previously
2. **What was changed** — exactly what was done
3. **How it helps** — the benefit in plain terms
4. **Consequences** — anything that could go wrong, side effects, or things the user should know

Never skip this. Never assume the owner understands technical terms.

---

## ⚠️ RULE 0: FULL-IMPACT ANALYSIS BEFORE EVERY FIX — READ THIS FIRST

**Before writing any fix, you MUST answer all five questions below. If you cannot answer them, read more code until you can. Do not write code first and think second.**

1. **Where does every value I write end up?** — Trace it: local variable → state field → Firebase → other devices → localStorage → IDB. Map the full path.
2. **How long does it live in memory?** — Does it get garbage collected, or does it sit in `S` (global state) forever? If it's in `S`, it lives until page reload.
3. **What if there are 50 of these?** — Scale the worst case. One 6 MB image is fine. Fifty is a crash.
4. **What else runs at the same time?** — List every other startup function that touches the same data. Do they compound the problem?
5. **What breaks if this path fails silently?** — If a `catch` swallows the error, what does the user see? What state is left corrupted?

**If a fix introduces a new crash, it is not a fix.** The job is to make the system more stable than before, not trade one bug for another.

**Lesson learned (OOM crash, May 2026):** A thumbnail repair function fetched full 6 MB HQ images from Firebase and stored them directly in `img.data` (the thumbnail field in global state `S`). With 20 images × 6 MB = 120 MB held permanently in `S`, Chrome crashed with "Out of Memory." The fix was locally correct (image loaded) but globally harmful (stayed in memory forever). This was caught only after it shipped. It would have been caught before shipping by asking Question 2 and Question 3 above.

**Lesson learned (OOM crash recurrence, Aug 2026):** `loadImagesFromIDB()` ran on every single page load (before login) and called `_injectIDBImages()`, which read the *entire* local IndexedDB photo cache into memory in one shot via `idbGetAll()` with no size limit. On a device where that cache had grown large — because deleting an order/design never cleaned up its IDB entries, so orphaned photos piled up silently for 2+ months of production use — this crashed the tab with "Out of Memory" before the login screen even finished loading. Two fixes shipped together: (1) `IDB_MEMORY_SAFETY_CAP` (150 MB) in `_injectIDBImages()` — skip loading into memory rather than crash if the cache is too large; (2) `_pruneOrphanedIDBEntries()` — a once-a-day pass that deletes IDB entries no longer referenced by any current order/design (using `idbGetAllKeys()`, never reading the actual image bytes, so the cleanup itself can't reintroduce the crash). Root-cause lesson: any function that reads "all of IndexedDB" or "all of anything user-generated over months" needs a size cap by default — don't wait for it to actually happen twice.

---

## ⚠️ CRITICAL DEPLOYMENT RULE

**Every fix, every change, every improvement MUST be pushed directly to `main` before the session ends.**

- This is a live single-file app. GitHub Pages serves directly from `main`. There is no staging, no preview, no other environment.
- Feature branches do NOT deploy. Pushing to a feature branch means the user sees zero change on the live app — the fix is invisible and useless until it reaches `main`.
- If the system creates a feature branch automatically, that is fine for development — but you MUST merge or push all changes to `main` before ending the session.
- Never end a session with unfixed code sitting on a branch. Always verify the final `git push` targets `main`.
- If there is any conflict between a background system rule about branches and this rule, this rule wins. Explain the conflict to the user and push to `main`.

---

## ═══ TWO-SESSION WORKFLOW — READ AT THE START OF EVERY SESSION ═══

Two parallel Claude Code conversations are running simultaneously. Identify which session you are in from the user's first message.

| Session | Trigger phrase | Scope | Key rule |
|---------|---------------|-------|----------|
| **Current App** | "Continue current app session" | `bangle_v19.html` — live app features & fixes | Every new feature added → log it in `PHASE2_TRACKER.md` |
| **Phase 2** | "Continue Phase 2 session" | `./v2/` subfolder — React + Vite + TypeScript | Read `PHASE2_TRACKER.md` first, implement pending items |

**Linking file:** `PHASE2_TRACKER.md` in the repo root. Both sessions read and write it to stay in sync.

**No data migration:** Phase 2 connects to the same Firebase DB. Cutover = swap Cloudflare Pages URL.

---

## Project Overview

One repo, two independent web apps — deployed via **both** GitHub Pages AND Cloudflare Pages:

| App | Source File | GitHub Pages URL | Cloudflare Pages URL |
|-----|-------------|-----------------|---------------------|
| Bangle Tracker | `bangle_v19.html` | `https://sayyamranka1610.github.io/bangle-tracker/` | `https://bangle-tracker.pages.dev` ✅ PRIMARY |
| WorkBoard | `workboard/index.html` | `https://sayyamranka1610.github.io/bangle-tracker/workboard/` | `https://bangle-tracker.pages.dev/workboard/` |

**Repo:** `https://github.com/Sayyamranka1610/bangle-tracker`  
Push to `main` → GitHub Pages AND Cloudflare Pages both auto-deploy (≈1 min).  
**Cloudflare Pages is now the primary URL** — faster globally, security headers added.

---

## Tech Stack

- **Frontend:** Single `.html` files — all HTML, CSS, and JS inline. No build step, no bundler, no framework.
- **Database:** Firebase Realtime Database — `https://bangle-tracker-default-rtdb.firebaseio.com`
- **Auth:** Custom username/password stored in Firebase (no Firebase Auth SDK)
- **Deployment:** GitHub Pages (backup) + **Cloudflare Pages** (primary — `bangle-tracker.pages.dev`)
- **Image Storage:** Cloudflare R2 ✅ LIVE
  - Bucket: `bangle-tracker-images` (Asia Pacific)
  - Public URL: `https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev`
  - Upload Worker: `https://bt-image-upload.sayyamranka09.workers.dev`
  - Upload Key: `BT2026_sB9mK3xQpR7wN2vL5jH8cF4dA`
  - `R2_WORKER_URL` and `R2_UPLOAD_KEY` already filled in `bangle_v19.html`
- **Error Monitoring:** Sentry ✅ LIVE — loader key `2eff06b58f70c74c61f1f836e45381a2`
- **PWA:** Both apps have service workers and manifests — installable on mobile

---

## ═══ COMMERCIAL BUILD STATUS — READ THIS EVERY SESSION ═══

**Owner:** Sayyamranka09@gmail.com — NON-DEVELOPER. Explain everything in plain language.
**Business:** Siddhi Bangles — ACTIVE DAILY PRODUCTION USE. Data loss = completely unacceptable.

### Permanent rules (never break, even if owner asks)
1. Explain consequences in plain language BEFORE executing anything significant
2. Push back if dangerous — refuse or warn strongly even if owner says "do it"
3. No data loss ever — staged migrations, old system stays as fallback
4. Phase 1 must be stable before Phase 2 — never run both at once

### Phase 1 — COMPLETE ✅ (June 2026)

| Step | Status |
|------|--------|
| Sentry error monitoring | ✅ DONE — live |
| Cloudflare Pages hosting | ✅ DONE — https://bangle-tracker.pages.dev |
| Cloudflare R2 image storage | ✅ DONE — new photos go to R2, old photos keep working |
| Firebase Auth | ❌ DEFERRED — too risky on live app |

### Phase 2 — NEXT (not started)
**What:** Split 12,000-line `bangle_v19.html` into React + Vite component files.
**When to start:** Only after owner confirms Phase 1 has been stable for 1 week of real use.
**How to start:** Explain the full plan in plain language first, get confirmation, then begin.

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
├── workboard.html           # Redirect → /workboard/ (preserves old bookmarks)
│
├── workboard/               # WorkBoard app — fully self-contained subfolder
│   ├── index.html           # WorkBoard app (~1,426 lines)
│   ├── workboard-sw.js      # Service worker for WorkBoard (cache: workboard-v7)
│   ├── workboard-manifest.json  # PWA manifest for WorkBoard
│   ├── workboard-icon-192.png   # PWA icon (192×192)
│   └── workboard-icon-512.png   # PWA icon (512×512, maskable)
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
8. **Follow-up system ("Kya Bola?")** — Rule-based nudges for stuck orders/vendor orders (`FOLLOWUP_RULES`, `computeFollowUps()` in `bangle_v19.html`):
   - Auto-detects overdue conditions (pipe/karigar not delivered, stuck in plating/packing, unassigned, not dispatched) and surfaces them daily
   - Marking one done requires picking what was actually said ("Kya Bola?") — a real reason/date/text, never a blank click — logged permanently to `S.followUpLog` (90-day retention)
   - Picking "Process mein hai, de dega" + a date overrides the recurring interval — next reminder fires on that exact promised date, not the usual cycle
   - If that promised date passes unresolved, the follow-up card asks about the broken promise specifically ("you said X, why hasn't it arrived?") instead of the generic question, and shows what was said the previous time
   - Every order/vendor order's own Details tab shows a collapsible "📜 Follow-up Trail" — that entity's full conversation history as a timeline (added Aug 2026)
   - "📜 Saare Trails" (open to everyone) browses every entity that's ever had a follow-up logged; "📋 Aaj ka Log" (owner-only) shows today's responses grouped by team member

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

## App 2: WorkBoard (`workboard/index.html`)

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

### Service Worker (`workboard/workboard-sw.js`)

- **Cache name:** `workboard-v7`
- **Notification state cache:** `wb-notif-state` (stores userId, seenTasks, notified set)
- **Strategies:**
  - HTML: network-first (no-cache header)
  - CDN (fonts, Chart.js): cache-first
  - Firebase: network-only (never cached)
  - Everything else: network with cache fallback
- **Background sync:** Periodic sync handler `wb-notif-check` (15-min minimum interval) fetches fresh task data and fires notifications when app is closed

**Rule:** Increment `workboard-v7` → `workboard-v8` on every deploy that changes cached assets.

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
git add bangle_v19.html bangle-sw.js   # or workboard/index.html workboard/workboard-sw.js

git commit -m "brief description of change"
git push origin main
# GitHub Pages deploys automatically in ~1 minute
```

**Do not** push to feature branches expecting deployment — only `main` deploys.

---

## PWA Details

| | Bangle Tracker | WorkBoard |
|--|--|--|
| Manifest | `manifest.json` | `workboard/workboard-manifest.json` |
| SW file | `bangle-sw.js` | `workboard/workboard-sw.js` |
| Cache name | `bangle-tracker-v9` | `workboard-v7` |
| App name | "Siddhi Bangle Tracker" | "Siddhi Workboard" |
| Theme color | `#534AB7` | `#6366f1` |
| Background | `#1a1750` | `#0f172a` |
| Start URL | `bangle_v19.html?pwa=bangle` | `workboard/?pwa=1` |

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
