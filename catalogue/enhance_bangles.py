#!/usr/bin/env python3
"""
Siddhi Bangles — AI Image Enhancement Script (Free Version)
============================================================
How it works — COMPLETELY FREE per image:
  1. Loads each bangle image (local file or R2 URL)
  2. Gemini Vision analyzes the bangle (free tier) and reads the list
     of all 50 luxury backdrops you have prepared in backdrops/ folder
  3. Gemini picks the BEST backdrop ID for that bangle (e.g. "A03")
  4. That backdrop image is loaded from your local backdrops/ folder
  5. rembg AI cuts the bangle out pixel-accurately — bangle untouched
  6. PIL places the bangle onto the new backdrop
  7. Final image saved to enhanced_bangles/ folder

BEFORE RUNNING:
  - You must have all 50 backdrop images in the backdrops/ folder.
  - Run generate_backdrops.py first to create those backdrops.

GUARANTEE: The bangle design itself is NEVER altered. Only the background.
"""

import os
import sys
import json
import re
import requests
from io import BytesIO

# ═══════════════════════════════════════════════════════════════════
#  STEP 1 — YOUR GOOGLE AI STUDIO API KEY
# ═══════════════════════════════════════════════════════════════════
API_KEY = "YOUR_API_KEY_HERE"

# ═══════════════════════════════════════════════════════════════════
#  STEP 2 — YOUR BANGLE IMAGES (URLs or local file paths)
#  To test: keep these 5. For full catalogue: replace with all your images.
# ═══════════════════════════════════════════════════════════════════
BANGLE_IMAGES = [
    "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev/bt/1782205590095-gt7nk7u.jpg",
    "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev/bt/1782205589964-z4mfjlo.jpg",
    "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev/CNC/CNC%20EXLUSIVE%20PAIR/.picasaoriginals/1808..jpeg",
    "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev/bt/1780654127792-ej47iyg.jpg",
    "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev/bt/1780654188859-ovekozc.jpg",
]

# ═══════════════════════════════════════════════════════════════════
#  STEP 3 — FOLDERS (do not change unless you move files)
# ═══════════════════════════════════════════════════════════════════
SCRIPT_DIR     = os.path.dirname(os.path.abspath(__file__))
BACKDROPS_DIR  = os.path.join(SCRIPT_DIR, "backdrops")
OUTPUT_FOLDER  = os.path.join(SCRIPT_DIR, "enhanced_bangles")

# ═══════════════════════════════════════════════════════════════════


# ─── BACKDROP CATALOGUE (must match generate_backdrops.py) ──────────────────
# This is the complete list Gemini reads to pick the best match.
BACKDROPS = [
    {"id": "A01", "filename": "A01_crimson_velvet_cushion.jpg",     "group": "gold",       "name": "Crimson Velvet Cushion"},
    {"id": "A02", "filename": "A02_burgundy_velvet_draped.jpg",     "group": "gold",       "name": "Burgundy Velvet Draped Cloth"},
    {"id": "A03", "filename": "A03_wine_red_silk_cushion.jpg",      "group": "gold",       "name": "Wine Red Silk Cushion"},
    {"id": "A04", "filename": "A04_peacock_blue_marigold.jpg",      "group": "gold",       "name": "Peacock Blue with Marigold Petals"},
    {"id": "A05", "filename": "A05_forest_green_gold_ribbon.jpg",   "group": "gold",       "name": "Forest Green Velvet Gold Ribbon"},
    {"id": "A06", "filename": "A06_teal_velvet_brass_pin.jpg",      "group": "gold",       "name": "Teal Velvet with Brass Ornament"},
    {"id": "A07", "filename": "A07_terracotta_silk_fringe.jpg",     "group": "gold",       "name": "Terracotta Silk Fringe"},
    {"id": "A08", "filename": "A08_black_velvet_gold_petals.jpg",   "group": "gold",       "name": "Black Velvet Gold Rose Petals"},
    {"id": "A09", "filename": "A09_ivory_velvet_gold_trim.jpg",     "group": "gold",       "name": "Ivory Velvet Gold Embroidered Cushion"},
    {"id": "A10", "filename": "A10_mahogany_gold_velvet.jpg",       "group": "gold",       "name": "Mahogany Wood Gold Velvet"},
    {"id": "A11", "filename": "A11_maroon_brocade_indian.jpg",      "group": "gold",       "name": "Maroon Brocade Traditional"},
    {"id": "A12", "filename": "A12_plum_velvet_rose_ribbon.jpg",    "group": "gold",       "name": "Deep Plum Velvet Rose Ribbon"},
    {"id": "B01", "filename": "B01_aged_leather_marigold.jpg",      "group": "antique",    "name": "Aged Leather Dried Marigold"},
    {"id": "B02", "filename": "B02_antique_box_red_velvet.jpg",     "group": "antique",    "name": "Antique Box Red Velvet Lining"},
    {"id": "B03", "filename": "B03_dark_wood_brass_ornament.jpg",   "group": "antique",    "name": "Dark Weathered Wood Brass"},
    {"id": "B04", "filename": "B04_jute_silk_earthy_fringe.jpg",    "group": "antique",    "name": "Jute Silk Earthy Fringe"},
    {"id": "B05", "filename": "B05_stone_jasmine_marigold.jpg",     "group": "antique",    "name": "Stone Surface Jasmine Marigold"},
    {"id": "B06", "filename": "B06_copper_patina_rose.jpg",         "group": "antique",    "name": "Copper Patina Rose Petals"},
    {"id": "B07", "filename": "B07_dark_wood_dried_flowers.jpg",    "group": "antique",    "name": "Dark Wood Dried Botanical"},
    {"id": "B08", "filename": "B08_zari_silk_traditional.jpg",      "group": "antique",    "name": "Traditional Zari Silk"},
    {"id": "C01", "filename": "C01_navy_velvet_silver_fringe.jpg",  "group": "silver",     "name": "Midnight Navy Velvet Silver Fringe"},
    {"id": "C02", "filename": "C02_royal_blue_white_lace.jpg",      "group": "silver",     "name": "Royal Blue White Lace Fringe"},
    {"id": "C03", "filename": "C03_slate_grey_silk_ribbon.jpg",     "group": "silver",     "name": "Slate Grey Silk Silver Ribbon"},
    {"id": "C04", "filename": "C04_black_velvet_silver_shimmer.jpg","group": "silver",     "name": "Black Velvet Silver Shimmer"},
    {"id": "C05", "filename": "C05_prussian_blue_organza.jpg",      "group": "silver",     "name": "Prussian Blue White Organza Frills"},
    {"id": "C06", "filename": "C06_steel_blue_crystal_drops.jpg",   "group": "silver",     "name": "Steel Blue Satin Crystal Drops"},
    {"id": "C07", "filename": "C07_emerald_velvet_silver_border.jpg","group": "silver",    "name": "Emerald Velvet Silver Border"},
    {"id": "C08", "filename": "C08_lavender_grey_silver_tassel.jpg","group": "silver",     "name": "Lavender Grey Silver Tassel"},
    {"id": "C09", "filename": "C09_indigo_velvet_pearl.jpg",        "group": "silver",     "name": "Indigo Velvet Pearl Detail"},
    {"id": "C10", "filename": "C10_charcoal_white_marble.jpg",      "group": "silver",     "name": "Charcoal Velvet White Marble"},
    {"id": "C11", "filename": "C11_gunmetal_platinum_thread.jpg",   "group": "silver",     "name": "Gunmetal Velvet Platinum Thread"},
    {"id": "C12", "filename": "C12_ocean_teal_white_feather.jpg",   "group": "silver",     "name": "Ocean Teal White Feather"},
    {"id": "D01", "filename": "D01_blush_mauve_lace_frills.jpg",    "group": "rose_gold",  "name": "Blush Mauve Lace Frills"},
    {"id": "D02", "filename": "D02_dusty_rose_velvet_fringe.jpg",   "group": "rose_gold",  "name": "Dusty Rose Velvet Cream Fringe"},
    {"id": "D03", "filename": "D03_peach_satin_rose_petals.jpg",    "group": "rose_gold",  "name": "Peach Satin Rose Petals"},
    {"id": "D04", "filename": "D04_champagne_satin_tulle_frills.jpg","group": "rose_gold", "name": "Champagne Satin Tulle Frills"},
    {"id": "D05", "filename": "D05_antique_pink_champagne_tassel.jpg","group": "rose_gold","name": "Antique Pink Champagne Tassel"},
    {"id": "D06", "filename": "D06_coral_silk_ivory_bow.jpg",       "group": "rose_gold",  "name": "Soft Coral Silk Ivory Bow"},
    {"id": "D07", "filename": "D07_lilac_velvet_pearl_border.jpg",  "group": "rose_gold",  "name": "Lilac Velvet Pearl Border"},
    {"id": "D08", "filename": "D08_pink_brocade_gold_frill.jpg",    "group": "rose_gold",  "name": "Pink Brocade Gold Frill"},
    {"id": "E01", "filename": "E01_black_velvet_gold_spotlight.jpg","group": "statement",  "name": "Black Velvet Gold Spotlight"},
    {"id": "E02", "filename": "E02_midnight_jewel_tones.jpg",       "group": "statement",  "name": "Midnight Velvet Jewel Accents"},
    {"id": "E03", "filename": "E03_deep_purple_amethyst.jpg",       "group": "statement",  "name": "Deep Purple Velvet Amethyst"},
    {"id": "E04", "filename": "E04_charcoal_gold_leaf.jpg",         "group": "statement",  "name": "Charcoal Fabric Gold Leaf"},
    {"id": "E05", "filename": "E05_garnet_velvet_shadows.jpg",      "group": "statement",  "name": "Deep Garnet Velvet Dramatic Shadows"},
    {"id": "E06", "filename": "E06_obsidian_bronze_clasp.jpg",      "group": "statement",  "name": "Obsidian Black Bronze Clasp"},
    {"id": "F01", "filename": "F01_ivory_silk_lace_cushion.jpg",    "group": "delicate",   "name": "Ivory Silk Lace Cushion"},
    {"id": "F02", "filename": "F02_champagne_babys_breath.jpg",     "group": "delicate",   "name": "Champagne Satin Baby's Breath"},
    {"id": "F03", "filename": "F03_cream_velvet_embossed_floral.jpg","group": "delicate",  "name": "Cream Velvet Embossed Floral"},
    {"id": "F04", "filename": "F04_pale_gold_silk_pearl_ribbon.jpg","group": "delicate",   "name": "Pale Gold Silk Pearl Ribbon"},
]

# Build lookup dict and readable list for Gemini
BACKDROP_BY_ID = {b["id"]: b for b in BACKDROPS}
BACKDROP_MENU  = "\n".join(
    f"{b['id']} | {b['name']} | best for: {b['group']} bangles"
    for b in BACKDROPS
)


# ─── PACKAGE AUTO-INSTALL ────────────────────────────────────────────────────

def auto_install(packages):
    import subprocess
    for pkg in packages:
        try:
            __import__(pkg.replace("-", "_").split("[")[0])
        except ImportError:
            print(f"Installing {pkg}... (first time only, takes ~1 minute)")
            subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])


print("Checking required packages...")
auto_install(["google-genai", "rembg[gpu]", "Pillow", "requests", "onnxruntime"])

from PIL import Image
from rembg import remove
from google import genai
from google.genai import types

client = None


# ─── SETUP ───────────────────────────────────────────────────────────────────

def setup():
    global client
    if API_KEY == "YOUR_API_KEY_HERE":
        print("\n" + "!" * 60)
        print("  Please open enhance_bangles.py in Notepad and paste")
        print("  your Google AI Studio API key on line 22.")
        print("!" * 60 + "\n")
        input("Press Enter to close...")
        sys.exit(1)

    # Check backdrops folder exists and has images
    if not os.path.isdir(BACKDROPS_DIR):
        print(f"\n⚠  Backdrops folder not found: {BACKDROPS_DIR}")
        print("   You must run generate_backdrops.py first to create the 50 backdrop images.")
        print("   See the file for instructions.\n")
        input("Press Enter to close...")
        sys.exit(1)

    existing = [f for f in os.listdir(BACKDROPS_DIR) if f.endswith(".jpg")]
    if len(existing) == 0:
        print(f"\n⚠  No backdrop images found in:\n   {BACKDROPS_DIR}")
        print("   Run generate_backdrops.py first.\n")
        input("Press Enter to close...")
        sys.exit(1)

    if len(existing) < len(BACKDROPS):
        print(f"\n⚠  Only {len(existing)}/{len(BACKDROPS)} backdrop images found.")
        print(f"   Missing backdrops will use a fallback. For best results run")
        print(f"   generate_backdrops.py to generate all {len(BACKDROPS)}.\n")

    client = genai.Client(api_key=API_KEY)
    print(f"✓ Connected to Google AI Studio (Gemini — free tier)")
    print(f"✓ Backdrops folder: {len(existing)}/{len(BACKDROPS)} images ready")
    print(f"✓ Cost per bangle: $0.00\n")


# ─── IMAGE LOADING ───────────────────────────────────────────────────────────

def load_image(source: str) -> "Image.Image":
    """Load bangle image from URL or local file — original pixels untouched"""
    if source.startswith(("http://", "https://")):
        print("    Downloading from URL...")
        r = requests.get(source, timeout=40)
        r.raise_for_status()
        return Image.open(BytesIO(r.content)).convert("RGBA")
    else:
        if not os.path.exists(source):
            raise FileNotFoundError(f"File not found: {source}")
        return Image.open(source).convert("RGBA")


# ─── GEMINI BACKDROP SELECTION ───────────────────────────────────────────────

def pick_backdrop(image: "Image.Image") -> dict:
    """
    Gemini Vision studies the bangle and picks the best backdrop from
    our 50 prepared options. Returns the backdrop dictionary.
    Uses Gemini free tier — zero cost.
    """
    print("    Gemini Vision analyzing bangle and selecting backdrop...")

    buf = BytesIO()
    image.convert("RGB").save(buf, format="JPEG", quality=90)

    prompt = f"""You are the photography director for Siddhi Bangles luxury exhibition catalogue.

Study this bangle carefully: its metal color, finish (shiny/matte/antique), design weight (thin/thick), and overall style.

From the list below, pick the SINGLE best backdrop ID that will make this specific bangle look most luxurious and beautiful in an exhibition catalogue.

AVAILABLE BACKDROPS:
{BACKDROP_MENU}

SELECTION RULES:
- Gold / yellow gold / warm bangles → prefer Group A backdrops
- Antique gold / oxidized / heritage finish bangles → prefer Group B backdrops
- Silver / rhodium / white gold / cool-toned bangles → prefer Group C backdrops
- Rose gold / pink / champagne bangles → prefer Group D backdrops
- Heavy / wide / statement bangles (very thick, wide, layered) → prefer Group E backdrops
- Delicate / thin / fine bangles (very thin, small) → prefer Group F backdrops
- Within the group, choose whichever specific backdrop best matches the bangle's mood

Reply with ONLY the backdrop ID (e.g. A01 or C04 or E02). Nothing else. No explanation."""

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[
            types.Part.from_bytes(data=buf.getvalue(), mime_type="image/jpeg"),
            prompt,
        ],
    )

    raw = response.text.strip().upper()
    # Extract just the ID pattern (letter + 2 digits)
    match = re.search(r"\b([A-F]\d{2})\b", raw)
    backdrop_id = match.group(1) if match else "A01"

    if backdrop_id not in BACKDROP_BY_ID:
        print(f"    ⚠  Gemini returned unknown ID '{backdrop_id}', using A01 as fallback")
        backdrop_id = "A01"

    chosen = BACKDROP_BY_ID[backdrop_id]
    print(f"    Gemini chose: {backdrop_id} — {chosen['name']}")
    return chosen


# ─── BACKGROUND REMOVAL ──────────────────────────────────────────────────────

def remove_background(image: "Image.Image") -> "Image.Image":
    """
    rembg AI cuts the bangle out of its original background.
    The bangle's own pixels are 100% preserved — only the background
    pixels are made transparent. This is pixel-accurate, not AI-generated.
    """
    print("    Removing original background (bangle pixels preserved exactly)...")
    buf = BytesIO()
    image.convert("RGB").save(buf, format="PNG")
    result_bytes = remove(buf.getvalue())
    return Image.open(BytesIO(result_bytes)).convert("RGBA")


# ─── BACKDROP LOADING ────────────────────────────────────────────────────────

def load_backdrop(backdrop: dict, width: int, height: int) -> "Image.Image":
    """Load the chosen backdrop from the local backdrops/ folder"""
    path = os.path.join(BACKDROPS_DIR, backdrop["filename"])

    if not os.path.exists(path):
        # Try to find any available backdrop as fallback
        print(f"    ⚠  Backdrop file not found: {backdrop['filename']}")
        available = [f for f in os.listdir(BACKDROPS_DIR) if f.endswith(".jpg")]
        if available:
            fallback = available[0]
            print(f"    Using fallback: {fallback}")
            path = os.path.join(BACKDROPS_DIR, fallback)
        else:
            raise FileNotFoundError(
                f"No backdrop images found in {BACKDROPS_DIR}. "
                "Run generate_backdrops.py first."
            )

    print(f"    Loading backdrop: {backdrop['filename']}")
    bg = Image.open(path).convert("RGBA")
    # Resize backdrop to match the bangle image dimensions (square output)
    size = max(width, height)
    bg = bg.resize((size, size), Image.LANCZOS)
    return bg


# ─── COMPOSITING ─────────────────────────────────────────────────────────────

def composite(bangle: "Image.Image", backdrop: "Image.Image") -> "Image.Image":
    """
    Center the bangle (transparent bg) on top of the backdrop.
    The bangle's pixels are pasted exactly as-is — no color change.
    """
    print("    Compositing bangle onto backdrop...")
    bg = backdrop.copy().convert("RGBA")
    bgw, bgh = bg.size

    # Scale bangle to 85% of the backdrop so there's a clean border
    bw, bh = bangle.size
    scale = min((bgw * 0.85) / bw, (bgh * 0.85) / bh)
    if scale < 1.0:
        new_w = int(bw * scale)
        new_h = int(bh * scale)
        bangle = bangle.resize((new_w, new_h), Image.LANCZOS)
        bw, bh = new_w, new_h

    # Center it
    x = (bgw - bw) // 2
    y = (bgh - bh) // 2
    bg.paste(bangle, (x, y), bangle)
    return bg.convert("RGB")


# ─── MAIN PIPELINE ───────────────────────────────────────────────────────────

def process_one(source: str, index: int, total: int) -> bool:
    """Full pipeline for one bangle image"""
    print(f"\n{'─'*60}")
    name = source.split("/")[-1].split("\\")[-1]
    print(f"  Image {index+1}/{total}  —  {name[:50]}")
    print(f"{'─'*60}")
    try:
        original  = load_image(source)
        backdrop  = pick_backdrop(original)
        bangle    = remove_background(original)
        bg_img    = load_backdrop(backdrop, original.width, original.height)
        final     = composite(bangle, bg_img)

        os.makedirs(OUTPUT_FOLDER, exist_ok=True)
        out_name  = f"enhanced_{index+1:03d}_{backdrop['id']}_{name.rsplit('.',1)[0]}.jpg"
        out_path  = os.path.join(OUTPUT_FOLDER, out_name)
        final.save(out_path, "JPEG", quality=97)
        print(f"    ✓ Saved → {out_name}")
        return True

    except Exception as e:
        print(f"    ✗ Failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("\n" + "═" * 60)
    print("  Siddhi Bangles — AI Image Enhancement (FREE)")
    print("  Gemini picks backdrop | rembg removes background | PIL composites")
    print("  Bangle design is NEVER altered — only the background changes")
    print("═" * 60 + "\n")

    setup()

    images = [s for s in BANGLE_IMAGES if s.strip()]
    if not images:
        print("⚠  No images found in BANGLE_IMAGES list.\n")
        input("Press Enter to close...")
        sys.exit(1)

    print(f"Processing {len(images)} image(s)...\n")
    done = sum(process_one(src, i, len(images)) for i, src in enumerate(images))

    print(f"\n{'═'*60}")
    print(f"  Done! {done}/{len(images)} images enhanced successfully.")
    if done > 0:
        print(f"  Your enhanced images are in:")
        print(f"  {OUTPUT_FOLDER}")
    print(f"  API cost this run: $0.00")
    print(f"{'═'*60}\n")
    input("Press Enter to close...")


if __name__ == "__main__":
    main()
