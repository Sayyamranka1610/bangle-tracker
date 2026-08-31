# Retail / Exhibition Workstream — Session Context

**Last updated:** 25 Aug 2026
**Scope:** the LIVE app (`bangle_v19.html`). Read this before touching order value, rates, notes, units, pooling, the dashboard, or photo storage.

> `SESSION_CONTEXT.md` is from June 2026 and is badly out of date (it says service worker `v68`; we are on **v196**). Trust this file for anything in this workstream.

---

## 1. Why this work exists

The owner took ~15 low-quantity retail orders at an August exhibition — many designs, few pieces each, mostly **CNC and kadas**. Two needs:

1. **Club the same design across customers** into a batch big enough to send a vendor.
2. **Track it all** — every client, order and item, with photos.

Key finding from the real data: **77% of design codes appear in only one order row.** Clubbing alone will rarely reach a viable batch. The real levers are grouping by **family** and **topping up for stock**, not clubbing on its own. Do not oversell pooling as the answer.

---

## 2. What is LIVE in `bangle_v19.html`

All of this is deployed and in daily use.

| Feature | Where |
|---|---|
| **📊 Dashboard** tab | Clients → orders → item photo cards, size chips, stage, days-in-stage, notes |
| **🧲 Pooling** tab | Clubs uncommitted rows into vendor batches; records `sources[]` provenance |
| **Design families** | Auto-derived from the owner's code series (below); override per code from the Pooling Board |
| **Order value** | Chip on the order card header; `Rate` column already existed, this added the total |
| **Per-row notes** | `Note` column in the order table; amber line under the row; also on Dashboard + Pooling |
| **Bulk unit fixer** | Click the red "Unit missing on N rows" chip |
| **📷 Photo storage** | 🩺 Health → Photo storage. Shows device-only photos; uploads + frees space safely |
| **Automatic updates** | App reloads itself into a new build; no prompt |
| **Excel Rate + Note columns** | Optional, in the generated template and the importer |

### The owner's design-code series (confirmed by them, 25 Aug)

```
1203.x  -> 12MM CNC KADA        3000s   -> 3MM CNC
1408.x  -> 8MM CNC KADA         6000s   -> 6MM CNC
1049.x  -> CNC LOCK KADA        8000s   -> 8MM CNC
                                10000s  -> 10MM CNC
1501-1699 -> 15MM CNC           12000s  -> 12MM CNC
1701-2000 -> CNC EXCLUSIVE
```

⚠️ The kadas were **swapped** in the owner's first message and corrected afterwards. The mapping above is the corrected one. Codes outside these ranges fall back to a guess from the design name.
**Open:** code `1700` falls in the gap between 1699 and 1701 and lands in "Other".

---

## 3. ⚠️ The bug pattern that bit three times

**A flat/CNC design can store `unit`, `rate` and `note` on the design itself OR on its single "Default" variety — and the Excel importer only ever writes the variety.**

Anything that reads only `d.unit` / `d.rate` / `d.note` will look empty for every imported CNC order. This caused three separate "it's not working" reports:

1. `unit` → "Unit missing on N rows" on almost every order
2. `rate` → rate box blank, order total stuck on "Rates pending"
3. `note` → imported notes invisible

**Always read both.** Helpers now exist: `_btFlatRate(d)`, `_btFlatNote(d)`, and the `_flatU` fallback inside `btRowsOfOrder`. Writers mirror into varieties too (`upDesignUnit`, `upDesignRate`, `btEditRowNote`).

**If the owner reports "I typed it but it doesn't show" on a CNC row, suspect this first.**

---

## 4. Rules the owner has set

- **Show a preview before building.** Standalone HTML in the repo root (`pooling-board-preview.html`, `order-value-preview.html`). Owner will say "just implement" when they want to skip it.
- **Never pre-decide business numbers** — rejection buffer, batch minimums, short-delivery priority are all owner-entered, never defaulted.
- **Unit is compulsory** (their "Option B"): no order value until every row has a unit; imports with a missing unit are **refused**, not defaulted. This is deliberate and changed old behaviour.
- Rates and notes stay **optional**.
- Order value shows **only when every row is priced**. No per-row value is ever displayed.
- Money: plain ₹, no decimals, no tax.

---

## 5. How to test safely (this matters)

**Never write to production Firebase while testing.**

1. Serve the repo locally (a plain Node static server; do NOT use `npx serve` — the owner's machine rule forbids installs).
2. Open `bangle_v19.html?demo=1` — **demo mode makes `save()` and `fbPushNow()` no-ops.**
3. Load real data in the console:
   ```js
   const j = await (await fetch('/bangle_backup_2026-08-06.json')).json();
   S.orders = j.state.orders; S.vendorOrders = j.state.vendorOrders;
   ```
   That file is the 6 Aug production backup (68 orders, 105 vendor orders, 3.1 MB, gitignored).
4. Sweep all views for errors before claiming done:
   `['orders','design','analytics','inventory','vendor','masters','assign','dashboard','pooling']`

Pure logic can also be compiled out and unit-tested in Node (that is how the v2 pooling/allocation work got 59 assertions).

### Editing the file
- It is ~1.1 MB and greps as "binary". **Use Node with `utf8` read/write**, not `sed`.
- **Never use PowerShell here-strings (`@'...'@`) in the Bash tool** and beware backslash mangling — several patches were corrupted this way. Write patch scripts to a file, then run them.
- Anchor edits on **exact indentation** (continuation lines are indented 8–12 spaces); `.trim()` in a read will hide it.
- Always syntax-check afterwards:
  ```bash
  node --check <extracted retail block>
  ```

---

## 6. Deployment discipline

- Push to `main`. Cloudflare Pages + GitHub Pages both auto-deploy.
- **Bump `CACHE_NAME` in `bangle-sw.js` on every deploy.** Currently **`bangle-tracker-v196`**.
- The app now auto-updates itself: it compares the running worker's version against a no-store fetch of `bangle-sw.js`, then reloads with a `?v=` cache-buster. It will not reload while an input is focused, saves first, and reloads once per version per session.

---

## 7. Two sessions are editing this repo

Another Claude session has been committing to the **same files**, including `bangle_v19.html` (e.g. `76cd15d` photo coverage report, and the Phase 2 Library work). It has previously swept up half-finished work of this session into its own commit.

**Check `git log` and `git status` before assuming your working tree is yours alone.**

---

## 8. The v2 React app is NOT what the owner uses

`bangle-tracker.pages.dev` serves **`bangle_v19.html`** (`_redirects` maps `/` to it). The `/v2` React app has never been cut over and its build output is not deployed.

Earlier in this workstream the same retail features were built into v2 first — the owner could not see any of it and was rightly frustrated. **Anything the owner should be able to use goes into `bangle_v19.html`.** The v2 versions still exist (`poolUtils.ts`, `receiveUtils.ts`, `familyUtils.ts`, `Dashboard.tsx`, `Pooling.tsx`, `ReceiveModal.tsx`) and are logged as item 35 in `PHASE2_TRACKER.md`.

---

## 9. Where things stand for the owner

- **5 orders** still show "Unit missing" (was 35 before the flat-unit fix). Fix via the red chip → bulk fixer.
- **62 orders** are waiting only on rates before they show a value.
- **1 order** (ORD-041) is fully priced: ₹47,600.
- The owner has been **clearing browser site data** to speed up loading. This can permanently destroy device-only photos. The Photo storage tool now makes that safe — check whether their device reports device-only photos, and whether any past clearing already lost some.

### Not built / still open
- Receiving with allocation back to customers (exists in v2, **not** in the live app) — this is what makes pooled batches safe to split when a vendor delivers short
- Finished-goods stock (v2 only; `stockItems` exists in Firebase but is empty)
- Ready-to-dispatch tray, customer phone/WhatsApp, most-ordered-designs report
- Excel: one sheet importing many customers at once
- Vendor print dialog does not get the order total / notes options (customer print does)
- Design-name cleanup: `12MM R SARDAR KADA` vs `12MM R: SARDAR KADA`, placeholder codes `1`–`9`, 5 codes used for two different mm sizes. `Design_Families_Review.xlsx` (gitignored) lists all 392 codes for the owner to review — they parked this.
