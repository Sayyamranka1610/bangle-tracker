# Phase 2 Feature Tracker

This file is the **linking bridge** between the current app (Phase 1) and Phase 2 (React + Vite).

## How it works

- **Current App session:** When a new feature is added to `bangle_v19.html`, log it below under "Pending for Phase 2"
- **Phase 2 session:** At the start of each session, read this file. Implement all "Pending" items, then mark them "Done"

---

## Pending for Phase 2

> Features added to Phase 1 **after** Phase 2 development started — not yet implemented in Phase 2.

| # | Feature | Added to Phase 1 | Description | Phase 2 Status |
|---|---------|-----------------|-------------|----------------|
| — | *(none yet — Phase 2 starts fresh from Phase 1 baseline)* | — | — | — |

---

## Implemented in Phase 2

> Features confirmed working in the new React app.

| # | Feature | Phase 2 Component | Notes |
|---|---------|------------------|-------|

---

## Phase 1 Baseline (must all be in Phase 2 before cutover)

Everything currently in `bangle_v19.html` as of Phase 2 start date (June 2026):

- [ ] Login / session / role system (Owner vs Worker)
- [ ] Orders — create, edit, delete, deadline tracking
- [ ] Design module — CNC & Dye Gold, multi-size varieties, design codes
- [ ] Design images — R2 upload for new, Firebase fallback for old
- [ ] Inventory ledger — in/out entries, vendor tracking, per-design summaries
- [ ] Analytics stat cards (Total, On Track, Soon, Late, Done)
- [ ] User management — password changes, owner controls
- [ ] Audit trail — activity log
- [ ] Export to XLSX
- [ ] Edit lock system (one writer at a time, 5-min expiry)
- [ ] PWA — installable, service worker, offline shell
- [ ] Sentry error monitoring
- [ ] Mobile-first responsive UI

---

## Cutover checklist (do this only when ALL baseline items above are checked)

- [ ] All Phase 1 baseline features working in Phase 2
- [ ] All "Pending" tracker items moved to "Implemented"
- [ ] Tested on mobile (Android + iOS)
- [ ] Tested with real Firebase data
- [ ] Sentry connected to Phase 2
- [ ] Owner has signed off on Phase 2 in testing
- [ ] Cloudflare Pages Phase 2 project pointing to `./v2/` subfolder
- [ ] Old URL (`bangle-tracker.pages.dev`) redirected to new Phase 2 URL
