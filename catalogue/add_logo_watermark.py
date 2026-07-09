#!/usr/bin/env python3
"""
Siddhi Creation — Logo + Design-Code Watermark Stamper
======================================================
Stamps the Siddhi Creation logo and the design code onto every generated
bangle photo — IDENTICALLY on all of them, so the whole catalogue is
perfectly consistent.

WHY THIS INSTEAD OF THE AI PROMPT:
  AI image tools misspell text and redraw logos differently every time.
  This script places your REAL logo and the EXACT code, same spot, same
  size, every single image. 100% consistent. Free. Runs on your computer.

HOW THE CODE IS DECIDED:
  The code is taken from the file name. Save a generated photo as
  "1234.jpg"  ->  the stamp reads  "D No. 1234".
  So just name each file with its design number. Nothing else to type.

SETUP (one time):
  1. Save the Siddhi Creation logo into this folder as:  siddhi_logo.png
     (A transparent-background PNG looks best. If yours is on a white
      background, leave KEY_OUT_WHITE = True below and the script will
      remove the white for you.)
  2. Put all your generated bangle photos into the  generated/  folder,
     each named by its code, e.g.  1234.jpg,  8121.jpg,  etc.
  3. Run this script. Finished images appear in  final_catalogue/.
"""

import os
import sys

# ═══════════════════════════════════════════════════════════════════
#  SETTINGS  (change only if you want to)
# ═══════════════════════════════════════════════════════════════════
SCRIPT_DIR    = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH     = os.path.join(SCRIPT_DIR, "siddhi_logo.png")   # your logo file
INPUT_FOLDER  = os.path.join(SCRIPT_DIR, "generated")         # generated photos go here
OUTPUT_FOLDER = os.path.join(SCRIPT_DIR, "final_catalogue")   # finished photos come out here

CODE_PREFIX      = "D No. "     # text written before the number
LOGO_WIDTH_PCT   = 0.16         # logo width as a fraction of the image width (0.16 = 16%)
MARGIN_PCT       = 0.035        # gap from the edges (3.5% of image width)
CODE_HEIGHT_PCT  = 0.032        # code text height as a fraction of image height
KEY_OUT_WHITE    = True         # True = remove a white background from the logo
TEXT_COLOR       = (240, 205, 120)   # soft gold — reads on dark AND light backgrounds
# ═══════════════════════════════════════════════════════════════════


def auto_install(packages):
    import subprocess
    for pkg in packages:
        try:
            __import__(pkg.replace("-", "_").split("[")[0])
        except ImportError:
            print(f"Installing {pkg}... (first time only)")
            subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])


auto_install(["Pillow"])
from PIL import Image, ImageDraw, ImageFont


def load_font(px):
    """Find an elegant serif font on the computer; fall back gracefully."""
    candidates = [
        r"C:\Windows\Fonts\georgia.ttf",
        r"C:\Windows\Fonts\times.ttf",
        r"C:\Windows\Fonts\Georgia.ttf",
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, px)
            except Exception:
                pass
    return ImageFont.load_default()


def prepare_logo():
    """Load the logo and, if asked, turn its white background transparent."""
    if not os.path.exists(LOGO_PATH):
        print("\n" + "!" * 60)
        print("  Logo not found. Please save the Siddhi Creation logo as:")
        print(f"  {LOGO_PATH}")
        print("!" * 60 + "\n")
        input("Press Enter to close...")
        sys.exit(1)

    logo = Image.open(LOGO_PATH).convert("RGBA")

    if KEY_OUT_WHITE:
        px = logo.load()
        w, h = logo.size
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                # near-white pixels become transparent
                if r > 238 and g > 238 and b > 238:
                    px[x, y] = (r, g, b, 0)
    return logo


def stamp(image_path, logo):
    img = Image.open(image_path).convert("RGBA")
    W, H = img.size

    # --- size + place the logo (bottom-right) ---
    logo_w = int(W * LOGO_WIDTH_PCT)
    logo_h = int(logo.height * (logo_w / logo.width))
    logo_r = logo.resize((logo_w, logo_h), Image.LANCZOS)

    margin   = int(W * MARGIN_PCT)
    code     = CODE_PREFIX + os.path.splitext(os.path.basename(image_path))[0]

    font_px  = max(14, int(H * CODE_HEIGHT_PCT))
    font     = load_font(font_px)
    draw     = ImageDraw.Draw(img)
    tb       = draw.textbbox((0, 0), code, font=font)
    text_w, text_h = tb[2] - tb[0], tb[3] - tb[1]

    gap        = int(H * 0.012)
    block_h    = logo_h + gap + text_h
    logo_x     = W - margin - logo_w
    block_top  = H - margin - block_h

    # paste logo
    img.paste(logo_r, (logo_x, block_top), logo_r)

    # draw code centred under the logo, with a soft dark outline for legibility
    text_cx = logo_x + logo_w // 2
    text_x  = text_cx - text_w // 2
    text_y  = block_top + logo_h + gap
    for dx, dy in [(-2, 0), (2, 0), (0, -2), (0, 2), (-2, -2), (2, 2), (2, -2), (-2, 2)]:
        draw.text((text_x + dx, text_y + dy), code, font=font, fill=(0, 0, 0, 170))
    draw.text((text_x, text_y), code, font=font, fill=TEXT_COLOR)

    os.makedirs(OUTPUT_FOLDER, exist_ok=True)
    out_name = os.path.splitext(os.path.basename(image_path))[0] + ".jpg"
    img.convert("RGB").save(os.path.join(OUTPUT_FOLDER, out_name), "JPEG", quality=95)
    return out_name


def main():
    print("\n" + "═" * 60)
    print("  Siddhi Creation — Logo + Code Watermark")
    print("═" * 60 + "\n")

    if not os.path.isdir(INPUT_FOLDER):
        os.makedirs(INPUT_FOLDER, exist_ok=True)
        print(f"Created folder:\n  {INPUT_FOLDER}")
        print("Put your generated bangle photos there (named by code, e.g. 1234.jpg),")
        print("then run this script again.\n")
        input("Press Enter to close...")
        sys.exit(0)

    logo = prepare_logo()
    images = [f for f in os.listdir(INPUT_FOLDER)
              if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))]

    if not images:
        print(f"No images found in:\n  {INPUT_FOLDER}")
        print("Add your generated photos (named by code) and run again.\n")
        input("Press Enter to close...")
        sys.exit(0)

    print(f"Stamping {len(images)} image(s)...\n")
    done = 0
    for name in images:
        try:
            out = stamp(os.path.join(INPUT_FOLDER, name), logo)
            print(f"  ✓ {name}  ->  {out}")
            done += 1
        except Exception as e:
            print(f"  ✗ {name}: {e}")

    print(f"\n{'═'*60}")
    print(f"  Done! {done}/{len(images)} images watermarked.")
    print(f"  Finished catalogue images are in:")
    print(f"  {OUTPUT_FOLDER}")
    print(f"{'═'*60}\n")
    input("Press Enter to close...")


if __name__ == "__main__":
    main()
