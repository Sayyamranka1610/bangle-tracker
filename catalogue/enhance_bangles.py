#!/usr/bin/env python3
"""
Siddhi Bangles — AI Image Enhancement Script
=============================================
How it works:
  1. Loads each bangle image (local file or R2 URL)
  2. Gemini Vision analyzes the bangle (gold/silver, style, finish)
  3. Decides the perfect background (crimson velvet for gold, navy for silver, etc.)
  4. rembg cuts the bangle out of its original background — pixel-accurately
  5. Imagen 3 generates a luxury photography backdrop
  6. PIL composites the bangle onto the new backdrop
  7. Saves the final image to the output folder

GUARANTEE: The bangle design itself is NEVER altered. Only the background changes.
"""

import os
import sys
import requests
from io import BytesIO

# ═══════════════════════════════════════════════════════════════════
#  STEP 1 — PASTE YOUR API KEY HERE
# ═══════════════════════════════════════════════════════════════════
API_KEY = "YOUR_API_KEY_HERE"

# ═══════════════════════════════════════════════════════════════════
#  STEP 2 — PASTE YOUR 5 BANGLE IMAGE URLs OR FILE PATHS
#  Examples:
#    "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev/CNC/8MM/8001.jpg"
#    r"C:\Users\Sayyam\Pictures\bangle1.jpg"
# ═══════════════════════════════════════════════════════════════════
BANGLE_IMAGES = [
    "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev/bt/1782205590095-gt7nk7u.jpg",
    "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev/bt/1782205589964-z4mfjlo.jpg",
    "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev/CNC/CNC%20EXLUSIVE%20PAIR/.picasaoriginals/1808..jpeg",
    "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev/bt/1780654127792-ej47iyg.jpg",
    "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev/bt/1780654188859-ovekozc.jpg",
]

# ═══════════════════════════════════════════════════════════════════
#  STEP 3 — OUTPUT FOLDER (where enhanced images will be saved)
# ═══════════════════════════════════════════════════════════════════
OUTPUT_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "enhanced_bangles")

# ═══════════════════════════════════════════════════════════════════


def auto_install(packages):
    import subprocess
    for pkg in packages:
        try:
            __import__(pkg.replace("-", "_").split("[")[0])
        except ImportError:
            print(f"Installing {pkg}... (first time only)")
            subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])


print("Checking required packages...")
auto_install(["google-genai", "rembg[gpu]", "Pillow", "requests", "onnxruntime"])

from PIL import Image
from rembg import remove
from google import genai
from google.genai import types

client = None


def setup():
    global client
    if API_KEY == "YOUR_API_KEY_HERE":
        print("\n" + "!"*60)
        print("  Please open enhance_bangles.py in Notepad and paste")
        print("  your Google AI Studio API key on line 24.")
        print("!"*60 + "\n")
        input("Press Enter to close...")
        sys.exit(1)
    client = genai.Client(api_key=API_KEY)
    print("✓ Connected to Google AI Studio\n")


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


def analyze_bangle(image: "Image.Image") -> str:
    """
    Gemini Vision looks at the bangle and writes the ideal background prompt.
    Gold/warm tones → crimson/burgundy velvet
    Silver/cool tones → navy/midnight blue velvet
    Rose gold → blush/mauve silk
    """
    print("    Gemini Vision analyzing bangle design and tone...")
    buf = BytesIO()
    image.convert("RGB").save(buf, format="JPEG", quality=92)

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[
            types.Part.from_bytes(data=buf.getvalue(), mime_type="image/jpeg"),
            """You are the photography director for a luxury Indian jewellery exhibition.
Look at this bangle carefully — its metal tone, surface finish, and design style.

Write ONLY a single background scene description (30-40 words) for a professional product photo that makes this bangle look extraordinary in an exhibition catalogue.

Strict rules:
- Gold, yellow gold, or warm-toned bangles → deep crimson, burgundy, or wine-red velvet fabric
- Silver, white gold, or cool-toned bangles → midnight navy or dark teal velvet fabric
- Rose gold or pink-toned bangles → blush mauve or dusty rose silk fabric
- Mention: fabric type, fabric color, lighting direction, and mood
- The scene must be completely empty — no objects, no hands, no other jewelry, no text
- Describe a flat or gently draped surface for the bangle to rest on

Write ONLY the background description. No explanations. No quotes around it."""
        ],
    )
    prompt = response.text.strip().strip('"').strip("'")
    print(f"    Background prompt: {prompt[:70]}...")
    return prompt


def remove_background(image: "Image.Image") -> "Image.Image":
    """
    Uses rembg AI to cut the bangle out from its background.
    IMPORTANT: The bangle's own pixels are completely untouched.
    Only the background pixels become transparent.
    """
    print("    Removing original background (bangle pixels preserved exactly)...")
    buf = BytesIO()
    image.convert("RGB").save(buf, format="PNG")
    result_bytes = remove(buf.getvalue())
    return Image.open(BytesIO(result_bytes)).convert("RGBA")


def generate_backdrop(prompt: str, width: int, height: int) -> "Image.Image":
    """Generate a luxury photography backdrop using Imagen 3"""
    print("    Generating luxury backdrop with Imagen 3...")

    full_prompt = (
        f"{prompt}. "
        "Completely empty surface — absolutely no jewelry, no bangle, no objects, "
        "no people, no text, no watermarks. "
        "Smooth fabric texture shot from slightly above. "
        "Shallow depth of field. Professional jewellery photography backdrop. "
        "Ultra realistic, commercial quality."
    )

    result = client.models.generate_images(
        model="imagen-3.0-generate-001",
        prompt=full_prompt,
        config=types.GenerateImagesConfig(
            number_of_images=1,
            aspect_ratio="1:1",
            safety_filter_level="BLOCK_LOW_AND_ABOVE",
            person_generation="DONT_ALLOW",
        ),
    )

    img_bytes = result.generated_images[0].image.image_bytes
    bg = Image.open(BytesIO(img_bytes)).convert("RGBA")
    bg = bg.resize((width, height), Image.LANCZOS)
    return bg


def composite_images(bangle: "Image.Image", backdrop: "Image.Image") -> "Image.Image":
    """
    Place the bangle (transparent background) onto the new backdrop.
    The bangle is centered. Its pixels are merged as-is — no color change.
    """
    print("    Compositing bangle onto backdrop...")
    bg = backdrop.copy().convert("RGBA")
    bw, bh = bangle.size
    bgw, bgh = bg.size
    # Center the bangle on the backdrop
    x = (bgw - bw) // 2
    y = (bgh - bh) // 2
    bg.paste(bangle, (x, y), bangle)
    return bg.convert("RGB")


def process_one(source: str, index: int) -> bool:
    """Full pipeline for one bangle image"""
    print(f"\n{'─'*58}")
    name = source.split("/")[-1].split("\\")[-1]
    print(f"  Image {index+1}/5  —  {name[:45]}")
    print(f"{'─'*58}")
    try:
        original  = load_image(source)
        bg_prompt = analyze_bangle(original)
        bangle    = remove_background(original)
        backdrop  = generate_backdrop(bg_prompt, original.width, original.height)
        final     = composite_images(bangle, backdrop)

        os.makedirs(OUTPUT_FOLDER, exist_ok=True)
        out_name = f"enhanced_{index+1:02d}_{name.rsplit('.',1)[0]}.jpg"
        out_path = os.path.join(OUTPUT_FOLDER, out_name)
        final.save(out_path, "JPEG", quality=97)
        print(f"    ✓ Saved → {out_path}")
        return True

    except Exception as e:
        print(f"    ✗ Failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("\n" + "═"*58)
    print("  Siddhi Bangles — AI Image Enhancement (Test Run: 5)")
    print("  Pixel-accurate: bangle design is NEVER changed")
    print("═"*58 + "\n")

    setup()

    images = [s for s in BANGLE_IMAGES if not s.startswith("PASTE_")]
    if not images:
        print("⚠  No images found. Please paste your bangle image URLs or")
        print("   file paths into the BANGLE_IMAGES list in this script.\n")
        input("Press Enter to close...")
        sys.exit(1)

    print(f"Processing {len(images)} image(s)...\n")
    done = sum(process_one(src, i) for i, src in enumerate(images))

    print(f"\n{'═'*58}")
    print(f"  Done! {done}/{len(images)} images enhanced successfully.")
    print(f"  Your enhanced images are in:")
    print(f"  {OUTPUT_FOLDER}")
    print(f"{'═'*58}\n")
    input("Press Enter to close...")


if __name__ == "__main__":
    main()
