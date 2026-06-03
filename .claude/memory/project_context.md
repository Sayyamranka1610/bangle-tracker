# Siddhi Bangle Tracker — Full Project Context

## Who is the owner
- Name: Sayyamranka (Sayyamranka09@gmail.com)
- Non-developer — explain everything in plain language
- Business: Siddhi Bangles — app is in ACTIVE DAILY PRODUCTION USE
- Willing to pay for proper tools and subscriptions

## The most important rules (never break these)
1. **No data loss ever** — this app runs real business daily. Before any change touching stored data, explain the risk first and get confirmation.
2. **Explain before executing** — plain English, no jargon, before every significant change.
3. **Push back if dangerous** — even if owner says "do it", refuse if it could break the app or lose data.
4. **Staged migrations only** — new system works first, old stays as fallback.
5. **Phase 1 must be stable before Phase 2 starts** — never run both at once.

---

## Current App URLs
- **Primary (Cloudflare Pages):** https://bangle-tracker.pages.dev  ← use this
- **Backup (GitHub Pages):** https://sayyamranka1610.github.io/bangle-tracker/
- **WorkBoard:** https://bangle-tracker.pages.dev/workboard.html

## Cloudflare Account
- Email: Sayyamranka09@gmail.com
- Pages project: bangle-tracker (connected to GitHub main, auto-deploy on)

---

## PHASE 1 — COMPLETE ✅ (done June 2026)

### Step 1: Sentry error monitoring ✅
- Live and active in bangle_v19.html
- Loader key: `2eff06b58f70c74c61f1f836e45381a2`
- Dashboard: sentry.io (login: Sayyamranka09@gmail.com)

### Step 2: Cloudflare Pages hosting ✅
- URL: https://bangle-tracker.pages.dev
- Auto-deploys from GitHub main branch
- Security headers in `_headers` file in repo root

### Step 3: Cloudflare R2 image storage ✅
- All new photo uploads now go to R2 (a proper photo warehouse) instead of being crammed into Firebase as text
- Old photos already in Firebase keep working exactly as before — nothing deleted, nothing moved
- Infrastructure:
  - Bucket: `bangle-tracker-images` (Asia Pacific region)
  - Public URL: `https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev`
  - Upload Worker: `https://bt-image-upload.sayyamranka09.workers.dev`
  - Upload Key: `BT2026_sB9mK3xQpR7wN2vL5jH8cF4dA`
  - App constants `R2_WORKER_URL` and `R2_UPLOAD_KEY` are filled in `bangle_v19.html`

### Step 4: Firebase Auth — DEFERRED
- Too risky while app is in daily use. Custom auth works fine for now.

---

## PHASE 2 — NEXT (not started yet)

**What it is:** Split the single 12,000-line `bangle_v19.html` into a proper React + Vite project with separate files for each screen and component.

**Prerequisite:** Owner must confirm Phase 1 has been stable for at least 1 week of real usage.

**Why it matters:** The single HTML file is hard to maintain as features grow. React splits it into manageable pieces.

**Risk:** Medium-high. Every screen needs to be rebuilt carefully. Takes many sessions.

**When owner says they're ready to start Phase 2, explain the plan fully before writing any code.**

---

## PHASE 3 — FUTURE (after Phase 2)
- Backend API on Cloudflare Workers
- PostgreSQL database via Supabase
- Full CI/CD pipeline
- Uptime monitoring

---

## Tech Stack Summary

| What | Tool | Status |
|---|---|---|
| Main app file | `bangle_v19.html` (~12,000 lines) | Current |
| Database | Firebase Realtime DB | Current |
| Auth | Custom username/password in Firebase | Current |
| Image storage | Cloudflare R2 | ✅ Done |
| Hosting | Cloudflare Pages | ✅ Done |
| Error tracking | Sentry | ✅ Done |
| Frontend framework | None (vanilla JS) → React+Vite | Phase 2 |
| Backend | None → Cloudflare Workers | Phase 3 |
| Analytics DB | None → Supabase PostgreSQL | Phase 3 |

---

## GitHub Repository
- URL: https://github.com/Sayyamranka1610/bangle-tracker
- Push to `main` → both GitHub Pages and Cloudflare Pages auto-deploy in ~60 seconds
- Working file: `bangle_v19.html`
- WorkBoard file: `workboard.html`
- Firebase DB: `https://bangle-tracker-default-rtdb.firebaseio.com`

## Key Code Locations in bangle_v19.html
- R2 config: top of `<script>` section — `R2_WORKER_URL`, `R2_UPLOAD_KEY`
- Sentry: top of `<head>` section
- Image upload handlers: `handleImgUpload`, `handleVarietyImg`, `handleDesignLevelImg`, `addVVImg`, `addVendorFlatImg`, `addVDImg`, `handleStockImgUpload`
- Image display: `_resolveImgSrc()` — handles both base64 (old) and https:// R2 URLs (new)
