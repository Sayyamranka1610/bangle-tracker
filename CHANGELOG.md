# Bangle Tracker — Feature Changelog

Every feature and fix ever made to the app, in plain language.  
All changes are also permanently stored in git — run `git log --oneline` to see every commit.

---

## June 2026 — Session 3 (this session)

### Image Library (`🖼️ Library` tab)
- New tab in the app: "Library" — a permanent central photo database
- Import 2000+ photos at once by selecting an entire folder — folder name becomes category, filename becomes design code
- Photos stored in Cloudflare R2 (permanent cloud), searchable index in Firebase
- Bulk import uploads 8 photos at a time, saves progress every 50 uploads — safe to stop and restart
- Already-imported photos are automatically skipped (no duplicates)
- Library picker opens when clicking `+` on any design — shows suggested photos matching the design code
- Search by design code or folder from the picker
- "Upload from Device" fallback: uploads to R2 AND saves to library for future use

### Photo Manager (bulk upload & assign)
- Green "📸 Upload Photos" button in the save bar replaces the old one-by-one upload
- Select many photos at once; all upload to R2 cloud in parallel
- Auto-match: if photo filename = design code (e.g. DC001.jpg), it automatically links to the right design
- Progress bar: "Uploading 45 / 103 photos…"
- After Save, photos are permanent cloud URLs — visible on all devices and bangle-tracker.pages.dev forever

### 7 UI improvements
1. **Delete size button visible** — "✕ del" on size column headers now clearly visible; hover turns red. Works on both customer and vendor orders.
2. **Design name dropdown shows full list on focus** — clicking into any design name field immediately shows ALL names from the master list. Same list used for both customer and vendor orders.
3. **Keyboard fix (Tab / backspace)** — After "Add design", cursor auto-focuses the new code input so backspace no longer triggers browser back. Tab from code input jumps to first quantity cell.
4. **Customer Orders tab** — Already labelled correctly.
5. **Vendor order tile improved** — Status-coloured dot, delivery date turns red when overdue, colour progress bar tracks order stages (Pending → Processing → QA → Dispatched → Delivered).
6. **Masters redesigned with tabs** — Clean tab bar: Clients | Vendors | Designs | Units | Users. One section at a time instead of stacked accordions.
7. **Print default = Grouped at top, 9 images per A4** — Default image mode is now "Grouped at top". Image gallery uses a 3-column CSS grid — exactly 9 photos (3×3) per A4 page. Quantities table follows below.

---

## June 2026 — Session 2

### Image Recovery Panel
- "Recover Images" button to manually re-link R2 cloud images back to designs after a sync issue

### Race condition fix
- Blocked Firebase BEFORE injecting IDB to prevent "no images" on load

### Image rendering
- Reverted to direct `img.data` approach for maximum stability

---

## June 2026 — Session 1 (Phase 1 complete)

### Cloudflare R2 image storage
- New photos upload to Cloudflare R2 instead of Firebase — no size limits
- Old base64 photos auto-migrate to R2 on startup
- Images show on all devices and URLs immediately

### Cloudflare Pages hosting
- App now served from `https://bangle-tracker.pages.dev` (faster globally)
- GitHub Pages (`sayyamranka1610.github.io/bangle-tracker`) still works as backup

### Sentry error monitoring
- Automatic error reporting to Sentry — any crash is logged and can be investigated

---

## Core Features (always present)

| Feature | Where |
|---------|-------|
| Customer Orders — create, edit, delete | 📦 Customer Orders tab |
| Vendor Orders — full order management | 🏭 Vendor Orders tab |
| Design Module — CNC & Dye Gold, multi-size varieties | Inside each order |
| Inventory Ledger — in/out tracking | 🗄️ Inventory tab |
| Analytics — stat cards (On Track, Soon, Late, Done) | 📊 Analytics tab |
| Masters — clients, vendors, design names, codes, units | 📋 Masters tab |
| Image Library — 2000+ photos, searchable | 🖼️ Library tab |
| Export to Excel | Save bar — Export button |
| Print orders | Print button on each order tile |
| User management — Owner + Workers | 📋 Masters → Users tab |
| Edit lock — one writer at a time | Automatic |
| Audit trail — log of all changes | Save bar — Audit button |
| PWA — installable on phone | Add to home screen |

---

## How to verify nothing is broken

Open the app → click the **🩺 Health** button in the save bar.  
It runs an automated check of all key functions and reports any that are missing.
