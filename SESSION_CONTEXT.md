# Bangle Tracker — Session Context File
**Created:** 2026-06-05 (Office PC session)
**Purpose:** Bring a new Claude Code session up to speed instantly. Read this at the start of every home session.

---

## ⚡ WHERE WE LEFT OFF (MOST IMPORTANT — READ FIRST)

### Immediate pending action
The CNC library was cleared (Delete All Folders) to fix the 137-folder distortion problem. The photos are **safe in R2** but the library catalog needs to be re-synced:

1. Open app → **Library → CNC** → click **🔄 Sync from R2** → wait for it to complete
2. Open app → **Library → Dye Gold** → click **🔄 Sync from R2** → wait for it to complete

After syncing, CNC should show **20 folders** and Dye Gold should show **8 folders** — matching the actual folder structure on the local computer.

### App is live at
- Primary: `https://bangle-tracker.pages.dev`
- Backup: `https://sayyamranka1610.github.io/bangle-tracker/`

### Latest git state
- Branch: `main`
- Latest commit: `d2078d1` — fix: guard empty-list edge case in dropdown formula ranges
- Service worker cache: `bangle-tracker-v68`

---

## 📦 R2 BUCKET STATUS (as of end of session)

### CNC segment — 20 folders, ~2,512 photos
Source: `\\Newuser\d\SIDDHI BANGLES\CNC ITEM IMG\CNC ITEM PARTY IMG FACTORY`
Uploaded via rclone. All sub-folders and picasa files included.

Folders present: 10MM CNC, 12MM CNC, 12MM SILVER CNC, 12MM SILVER CNC HOLE KADA, 12MM SILVER SARDAR KADA, 15MM CNC, 15MM SILVER CNC, 3MM CNC BANGLES, 6MM CNC, 8MM CNC, 8MM CNC KADA, 8MM CNC SILVER, BALL CNC KADA, CNC EXLUSIVE PAIR, CNC LOCK KADA, Dubble Decker, GHATPATLA, MEENA BANGLES, NEW CNC, watspimage

### Dye Gold segment — 8 folders, ~555 photos
Source: `\\Newuser\d\ITEM MASTER NEW` (folders 3MM-15MM BANGLES)
Originally uploaded to CNC by mistake → moved to Dye Gold via rclone.

Folders present: 10MM BANGLES, 12MM BANGLES (double space), 12MM HR BANGLES, 15MM BANGLES, 15MM HR BANGLES, 5MM BANGLES, 6MM BANGLES, 8MM BANGLES
(3MM BANGLES was empty — not present)

### rclone is installed on the Office PC
- Location: `C:\rclone\rclone.exe` (v1.74.2)
- Configured with R2 credentials (remote name: `r2`)
- Account ID: `3414caecd91da76e23a682056093f948`
- Bucket: `bangle-tracker-images`
- **rclone is NOT installed on the Home PC** — needs to be set up if more uploads are needed from home

---

## 🔧 EVERYTHING BUILT/FIXED IN THIS SESSION (Bangle Tracker - 4 + 5)

### 1. rclone Setup & Bulk Upload
- Installed rclone v1.74.2 on office PC at `C:\rclone`
- Configured R2 credentials in `%APPDATA%\rclone\rclone.conf`
- Uploaded 2,512 CNC photos in 1m42s (4.4 MB/s)
- Uploaded 555 Dye Gold photos from ITEM MASTER NEW
- Added `🔄 Sync from R2` button in Library to catalog R2 photos into app

### 2. Library Sync Fix — Folder Structure
**Problem:** Sub-folders inside top-level folders (e.g. `10MM CNC/New folder/`) were being treated as separate library folders → 137 folders instead of 20.
**Fix:** `syncLibraryFromR2()` now uses only `parts[1]` (top-level folder) instead of joining all sub-path parts.
**File:** `bangle_v19.html` → function `syncLibraryFromR2`

### 3. Delete All Folders — Fixed & With Progress
**Problem:** Original implementation used `db.ref()` which doesn't exist (app uses REST API only). Also froze the UI with no feedback.
**Fix:**
- Now uses `fetch(FB_ROOT + '/imageLibrary.json', {method:'DELETE'})` — one REST call, instant
- Shows a progress modal with live counter ("560 / 1,247 deleted")
- Deletes in batches of 200 for large libraries
- Photos in R2 are NEVER deleted — only the catalog listing is cleared
**File:** `bangle_v19.html` → function `deleteAllLibraryEntries`

### 4. Auto-Release Edit Lock on Tab Close
**Problem:** When a user closed the browser tab without signing out, the edit lock stayed in Firebase for 5 minutes. Other users saw "read-only" mode until it expired.
**Fix:** Added `window.addEventListener('beforeunload', ...)` that fires `fetch(FB_LOCK, {method:'DELETE', keepalive:true})` when the lock holder closes the tab. `keepalive:true` guarantees the request completes even as the tab unloads.
**File:** `bangle_v19.html` → after `_releaseLock()` function

### 5. Design View — Row Height Fix
**Problem:** Image cell wrapping (`flex-wrap:wrap`) caused `+` button to go to new line → very tall rows.
**Fix:** Changed `.variety-img-cell` CSS to `flex-wrap:nowrap`.
**File:** `bangle_v19.html` → CSS line `.variety-img-cell`

### 6. Font Sizes Increased (+2px)
**Changed:**
- `.variety-table` base font: 11px → 13px
- `.variety-table input.qty-inp`: 11px → 13px
- `.variety-name-inp` (design code input): 11px → 13px
- Print: design group name 18px black bold (was white on purple)
**File:** `bangle_v19.html` → CSS section

### 7. Size Columns — Add Size Modal
**Problems fixed:**
- "Sizes locked at creation" was blocking all size additions — removed entirely
- `addSizeToDesign(di)` was only passing design index, missing order index → silently failing
- Sizes not sorted (2/10 could appear before 2/4)
**Fix:**
- New `openAddSizeModal(oi, grpDids)` function — asks user which size to add (e.g. "2/14")
- Applies to **all design codes** in the group at once, with 0 quantity
- `szKeys` now sorted numerically: 2/2 → 2/4 → 2/6 → 2/8 → 2/10 → any size
- Sort works for any size format (2/X), not just the examples
**File:** `bangle_v19.html` → `openAddSizeModal`, `_doAddSize`, `buildDesignsGroupTable`

### 8. Library Picker Improvements
**Changes:**
- Search input: wider, larger font, label "🔍 SEARCH BY DESIGN CODE" above it
- Folder dropdown: grouped with `<optgroup>` — "📦 CNC" section separate from "✨ Dye Gold" section
- **Remember last folder:** `_lpLastFolder` variable — when uploading photos, the previously chosen folder is pre-selected for the next upload
- **Cursor jumping fix:** `_libSearchKeyed(el)` function saves cursor position before re-render and restores it after → typing in search bar no longer loses cursor
**File:** `bangle_v19.html` → `openLibraryPicker`, `_lpUploadNew`, `_libSearchKeyed`

### 9. Dynamic Excel Templates with Real Dropdown Cells
**What was built:**
- Completely custom XLSX builder from scratch (`_buildDropdownXLSX`, `_makeXlsxZip`, `_xlCol`, `_xlEsc`)
- SheetJS CE cannot write data validation — so the XLSX file is built as raw XML inside a ZIP
- **Real Excel dropdown arrows** appear in the cells (not just a reference sheet)

**Customer Order Template (`Customer_Order_Template.xlsx`):**
- B2 → dropdown of all customer names
- A9:A21 → dropdown of all design names (CNC rows)
- B9:B21 → dropdown of all design codes (CNC rows)
- I9:I21 → dropdown of units (CNC rows)
- A24:A53 → dropdown of design names (Dye Gold rows)
- B24:B53 → dropdown of design codes (Dye Gold rows)
- K24:K53 → dropdown of units (Dye Gold rows)
- Hidden "Lists" sheet holds all valid values (auto-populated from database at download time)

**Vendor Order Template (`Vendor_Order_Template.xlsx`):**
- Same as above but B1 → vendor names (not customer names)

**Name check on upload:**
- `_openOrderWithNameCheck(fields, isVendor)` runs after any Excel upload
- **Layer 1:** Auto-fixes case differences silently (`"rajesh bangles"` → `"RAJESH BANGLES"`)
- **Layer 2:** Shows owner a confirmation modal for genuinely new names before saving
- Covers all 5 customer upload paths + vendor upload path
**File:** `bangle_v19.html` → `_buildDropdownXLSX`, `_makeXlsxZip`, `downloadOrderTemplate`, `downloadVendorOrderTemplate`, `_openOrderWithNameCheck`

---

## 🐛 KNOWN BUG THAT WAS FIXED MID-SESSION (important to know)

The first version of `_buildDropdownXLSX` had a leftover `.forEach` loop that accidentally pushed 9 unclosed `<row r="8">` XML tags into sheet1.xml → Excel showed "content repaired" error. This was fixed in commit `793f3c6`.

---

## 📁 KEY FILES CHANGED THIS SESSION

| File | What changed |
|------|-------------|
| `bangle_v19.html` | All app changes (10,000+ line single-file app) |
| `bangle-sw.js` | Cache bumped from v9 → v68 (many increments) |
| `r2-worker.js` | Added `?action=list` endpoint for Sync from R2 |

---

## 🔑 CREDENTIALS & CONSTANTS (already in bangle_v19.html — DO NOT change)

| Item | Value |
|------|-------|
| R2 Bucket | `bangle-tracker-images` |
| R2 Public URL | `https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev` |
| R2 Upload Worker | `https://bt-image-upload.sayyamranka09.workers.dev` |
| R2 Upload Key | `BT2026_sB9mK3xQpR7wN2vL5jH8cF4dA` |
| Firebase DB | `https://bangle-tracker-default-rtdb.firebaseio.com` |
| Cloudflare Account ID | `3414caecd91da76e23a682056093f948` |
| rclone R2 Access Key ID | `9c82af225dff2a288ea45e547e06f1c1` |
| rclone remote name | `r2` |
| rclone bucket path | `r2:bangle-tracker-images` |

---

## 🏠 SETTING UP AT HOME PC

1. `git clone https://github.com/Sayyamranka1610/bangle-tracker.git` (or `git pull` if already cloned)
2. `cd bangle-tracker`
3. Open Claude Code: `claude`
4. Read this file and `CLAUDE.md` — both are auto-loaded
5. Tell Claude: **"Continue current app session"** and reference this file

### If you need to do more R2 uploads from home:
rclone is NOT installed on the home PC. Install it:
```
# Download from https://rclone.org/downloads/ → Windows 64-bit
# Extract to C:\rclone
# Add C:\rclone to PATH
# Config file needed at %APPDATA%\rclone\rclone.conf with content:
[r2]
type = s3
provider = Cloudflare
access_key_id = 9c82af225dff2a288ea45e547e06f1c1
secret_access_key = c3ac55f3be83bd2745ff278db7bc1dff85461070c593b6ad5eec0e2388e5840a
endpoint = https://3414caecd91da76e23a682056093f948.r2.cloudflarestorage.com
acl = private
```

---

## 📋 THINGS TO DO / TEST AFTER ARRIVING HOME

- [ ] **Sync CNC library** — Library → CNC → 🔄 Sync from R2 (should show 20 folders)
- [ ] **Sync Dye Gold library** — Library → Dye Gold → 🔄 Sync from R2 (should show 8 folders)
- [ ] **Test Excel dropdown** — Download template from New Order modal → verify B2 shows customer name dropdown
- [ ] **Test size add** — Open any order → click "+ Add size" → should show modal asking which size
- [ ] **Test tab close lock** — Open app on two devices, close tab on Device 1, verify Device 2 gets edit access within seconds
- [ ] **Upload Dye Gold photos** — If Dye Gold photos folder exists on home PC, use rclone to upload them
- [ ] Check if `\\Newuser\d\ITEM MASTER NEW` has more folders beyond the 9 already uploaded — if yes, upload the rest

---

## 💡 CONTEXT FOR FUTURE WORK

### What "Sync from R2" does
Scans the R2 bucket for any objects not yet in the library catalog. Groups photos by top-level folder name only (not sub-paths). Skips anything in the `bt/` prefix (those are app-uploaded photos). Creates library entries pointing to the R2 public URL.

### What "Delete All Folders" does
Wipes only the **library catalog** in Firebase (`/imageLibrary/` node). The actual photos in R2 are completely untouched. After deleting, you can re-sync from R2 to rebuild the catalog correctly.

### rclone upload command format
```bash
# Upload a folder to CNC segment
rclone copy "SOURCE_PATH" r2:bangle-tracker-images/CNC --progress --transfers 8

# Upload a folder to Dye Gold segment
rclone copy "SOURCE_PATH" "r2:bangle-tracker-images/Dye Gold" --progress --transfers 8

# Then in the app: Library → CNC or Dye Gold → Sync from R2
```

### Excel template upload flow
1. Employee downloads template (now dynamic — pulls live names from DB)
2. Fills in the form using dropdowns for party name, design name, design code, unit
3. Drops the filled Excel into the app's New Order modal
4. App parses it → auto-fixes case differences → shows approval popup for any new names
5. Owner clicks Confirm → new names added to masters → order created

---

*This file was auto-generated at end of office session. Keep it updated as work progresses.*
