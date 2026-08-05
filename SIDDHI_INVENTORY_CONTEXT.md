# Siddhi Inventory — Context & Handoff

Read this first in any new session before touching `/siddhi-inventory/`. This app was scoped through a long discovery conversation (business workflow → mockup iterations → real build) — this file is the compressed record of what was decided and why, so that history doesn't need to be re-derived.

## What this is

A separate inventory-tracking app for Siddhi Creation's job-work pipeline (metal → cutting → karigar (designing) → plating → customer), distinct from Bangle Tracker (`bangle_v19.html`). Bangle Tracker keeps running unchanged; this is a new product, not a replacement, for now.

**Live URL:** `https://bangle-tracker.pages.dev/siddhi-inventory/` (also mirrored on GitHub Pages at `https://sayyamranka1610.github.io/bangle-tracker/siddhi-inventory/`)
**Source:** `/siddhi-inventory/index.html` — single self-contained file, same convention as Bangle Tracker (no build step, no framework, vanilla JS).
**Approved visual reference mockup:** https://claude.ai/code/artifact/f478bb30-b9b0-4aa5-8e21-9442506b7a9d — the real app's look/structure was built to match this after several rounds of owner feedback. Consult it for intended UI before redesigning anything.

## Data model — Firebase RTDB (same project as Bangle Tracker, isolated path)

Firebase root: `https://bangle-tracker-default-rtdb.firebaseio.com`, accessed via plain REST `fetch()` (no SDK), matching Bangle Tracker's own approach.

```
/siddhiInv/
  users/{username}          {name, password, role: 'owner'|'staff'}
  localVendors/{karigar|plating|customer}  -> [names]   (added inline in this app, NOT written back to Bangle Tracker)
  kinds/{in|out}             -> [{v, label}]  (custom "kya hoke/kisliye" options the owner adds)
  movements/{pushId}         one record per Naya Entry save — see shape below
  corrections/{pushId}       opening-balance / stock-audit deltas
```

**Movement record shape** (varies by `mode`):
```js
{
  dir: 'in'|'out', kind: 'design'|'plating'|'customer'|custom_id,
  party, date, weight, pkgType, pkgCount, mode: 'tabular'|'single'|'pending',
  // tabular mode:
  sizeLabels: ['2/4','2/6',...],
  rows: [{ code, variety, sizes:[{size,pair,jotta,set}], reject, plating, customer }],
  // single-line mode:
  simpleRows: [{ code, variety, plating, qty, unit, customer }],
  // pending-reconciliation mode (in + plating only):
  pendingRows: [{ code, plating, sentMatched, received, loss }]
}
```

**Important — Firebase key-safety bug already hit and fixed:** RTDB forbids `. $ # [ ] /` in object *keys*. Size labels like `"2/4"` contain `/`, so `sizes` is stored as an **array** of `{size, pair, jotta, set}`, never as an object keyed by size label. If you add any new feature that wants to key data by size, design code, or vendor name, remember these can contain `/` — use arrays or sanitize first. This exact bug silently failed every save until caught by testing (Firebase returned `{"error":"Invalid data..."}` — the UI still showed "saved" because the code didn't check the response).

## Bangle Tracker read-only sync (for vendor lists + design photos)

Bangle Tracker does **not** store `vendorTypes`/`vocabulary`/`orders` as normal nested Firebase nodes — its entire app state is saved as one (doubly) JSON-stringified blob at `/appData/data`, roughly 2MB. There is no narrow sub-path to fetch just vendors or just orders.

So `loadBTData()` in `index.html`:
1. Fetches `/appData/data.json` once, lazily (only when first needed — a dropdown opens, or the lookup box is used).
2. Deep-parses it (`deepParse()` — repeatedly `JSON.parse`s while the result is still a string).
3. Extracts only `vendorTypes`, `vocabulary.clients`, and a derived `{code: {name, thumb}}` design-photo index.
4. **Discards the full ~2MB parsed object immediately** — only the small derived pieces are kept in memory (`btCache`). This follows the project's Rule 0 memory discipline (see root `CLAUDE.md` — the May 2026 OOM postmortem).

If Bangle Tracker's order history grows very large, this fetch gets proportionally heavier. A future improvement would be for Bangle Tracker to maintain a small dedicated `/appData/designIndex/{code}` node itself — out of scope for now since it means touching the live production app.

## Business rules locked in during discovery (don't relitigate these without owner input)

- **Units:** pcs / pair / jotta / set / box. Box has no fixed conversion — always ask "how many pairs per box" at entry time. **Pair and pcs merge** in stock totals (pcs ÷ 2 = pair-equivalent); **jotta and set are shown separately, never auto-converted.**
- **Packets:** a size cell can hold multiple stacked packet quantities (matches the paper register's "50, then 47, = 97" style), each with its own unit. Packet count is auto-computed from how many packet entries exist — never manually typed for tabular entries.
- **Tabular vs Single Line:** every entry type can use either layout via an explicit toggle. Plating-Karvane defaults to Single Line (design + plating + total qty only, no size split — matches the real paper chitthi format); everything else defaults to Tabular. The user can override the default either way.
- **Design → Karigar → Raw stock:** karigar receipts (`in + design`) always land in the **Raw** plating bucket, size-broken.
- **Raw → Plating → Plated stock:** sending to a plating vendor (`out + plating`) deducts from Raw. Receiving back (`in + plating`) is **not** a fresh entry — it's a reconciliation against a computed "currently pending at this vendor" list (built from the net of past out/in plating movements), where the plating type is inherited from what was sent, and any shortfall (sent − received) is captured as loss.
- **`out + design` (raw metal sent to a karigar) does NOT deduct any tracked stock bucket** — at this pipeline stage the material isn't yet counted as sellable/raw stock (per the owner's description, it's often generic bulk material not yet tied to a specific design). It's logged for Daybook visibility only.
- **Customer Dispatch needs a plating selector** (added as a build-time judgment call, not explicitly requested) — the app needs to know which plating bucket to deduct from when a sale goes out. Flag this to the owner if it feels wrong; it was a necessary invention to make stock math work.
- **"Mixed" size bucket:** any Single Line entry (which has no size breakdown) affects stock under a synthetic size key `"Mixed"` rather than guessing a distribution. This is intentional and shown honestly in the Stock Kitna Hai screen, not hidden.
- **Auth model:** **Naya Entry requires no login at all** (the owner wants zero friction for the highest-frequency action). Stock Kitna Hai, Opening Balance, and Daybook are locked behind a login modal. Owner account is seeded on first run (`owner` / `siddhi123` — **must be changed** via Manage Users, this default is not secure long-term).
- **Chitthi (goods-slip) printing:** only available for outgoing (`Maal Bheja`) movements, never for incoming. Prints **two copies** of the same slip (one "Office Copy", one "Sending Copy") stacked with `break-inside: avoid` so the browser naturally keeps both on one page if they fit, or spills to a second page if not — no forced page breaks, matching the owner's "tear it in half" intent. Chitthi text deliberately omits vendor-type labels (no "— Karigar" suffix) per owner feedback.
- **Design photo lookup:** a persistent search box in the top bar, plus a live (oninput, debounced) lookup on the design-code field inside every entry row. Every outcome is visible — real photo, "found but photo not synced from that device," or "not in Bangle Tracker" — never a silent no-op.
- **Aasan Entry (guided wizard):** a full-screen, one-question-at-a-time alternate entry mode for team members uncomfortable with tables/forms — big tap targets, Hinglish only, minimal fields (no reject/customer/variety — those stay table-only). Launched from a banner at the top of Naya Entry. Shares the exact same `commitMovement()` save path as the detailed table, so it can never produce a differently-shaped record.
- **Voice input (trial):** mic buttons on the wizard's numeric/text fields (design code, size quantities, weight, plating qty, pending-received qty, packaging count), using the Web Speech API (`hi-IN`). Built to be trivially reversible — see the `VOICE_ENABLED` flag and the comment block right above it in `index.html`. It fills a field's value and nothing else; if it doesn't work out with real staff, flip that one flag and it's gone.
- **Installable as an app (PWA):** registered service worker (`siddhi-inv-sw.js`), proper manifest with a dedicated icon (`siddhi-inv-icon-*.png` — a generated gold bangle-ring mark, distinct from Bangle Tracker's), and an install-prompt banner (native "Install Karein" button on Android/Chrome via `beforeinstallprompt`; manual Share → Add to Home Screen instructions on iOS, since no install API exists there). Once installed it opens from the home screen like any native app.

## Two real bugs already hit — know these before you touch similar code

1. **Firebase RTDB forbids `. $ # [ ] /` in object *keys*.** Size labels like `"2/4"` contain `/`. `sizes` is an array of `{size, pair, jotta, set}`, never an object keyed by size label. This failed silently — the UI said "saved" while Firebase returned `{"error":"Invalid data..."}` and nothing was actually written. If you add any feature keying data by size, design code, or vendor name, watch for this.
2. **A PowerShell `Get-Content -Raw` / `Set-Content` round-trip without explicit UTF-8 on *both* ends corrupts every non-ASCII character** (em dashes, emoji) into mojibake — silently, no error. It happened twice in this file already. **Rule going forward: never use PowerShell/Bash text-replace commands on this file for anything beyond pure-ASCII changes — use the Edit tool, or a Python script that explicitly opens with `encoding='utf-8'` on both read and write.** Where possible, prefer HTML numeric entities (`&#8594;`, `&#128241;`) over raw Unicode characters/emoji in the source specifically because they're plain ASCII and immune to this whole class of bug.

## What's built vs. what's still open

**Built and tested against the real Firebase database (not just mockup):** login/session, locked-tab gating, vendor/customer sync from Bangle Tracker, Naya Entry (both table modes + Aasan wizard, packet stacking, plating pending-reconciliation), Stock Kitna Hai aggregation, Opening Balance/Correction, Daybook, chitthi generation (two-copy print HTML — generation verified, the actual browser print dialog was not exercised end-to-end since that's inherently a manual/visual step), design-photo lookup (verified against real Bangle Tracker data — 789 designs, 1040 usable synced photos), PWA install banner logic (verified the manifest/JS logic; the actual native install prompt can only be confirmed on the real HTTPS deployment, not over `file://`).

**Not yet built / explicitly deferred:**
- Cost/rate tracking (owner explicitly said quantities-only for now).
- GST/compliance documents (owner's existing accounting software already handles this).
- Metal/cutting-vendor stage (pre-karigar) — owner wants this added later but said detail there "is not required" for now; nothing currently tracks weight-only metal/cutting movements.
- Any editing/deleting of a saved movement (currently append-only — no UI to correct a mis-entered movement other than Opening Balance corrections).
- Photo attachment on a chitthi (the "optional, attach if needed" link is present but not wired to actually upload/attach anything yet).

## If you're picking this up fresh

1. Read this file, then skim `/siddhi-inventory/index.html` — it's one file, organized top-to-bottom: auth → BT sync → Naya Entry → stock aggregation → opening balance → daybook.
2. Check `git log --oneline -- siddhi-inventory/` for what's shipped since this file was written.
3. Before changing any business-rule behavior above, confirm with the owner — these came from an extensive back-and-forth, not assumptions.
4. Follow the project's standing rules in root `CLAUDE.md`: explain every change in plain language, verify before pushing, push to `main` before ending the session (Cloudflare Pages + GitHub Pages both auto-deploy from `main`).
