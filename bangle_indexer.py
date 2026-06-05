"""
Bangle Design Indexer
=====================
Generates CLIP visual embeddings for all bangle design images in R2.
Saves embeddings.json to R2 so the search tool can use it.

Folders indexed:  CNC/  and  Dye Gold/  (including .picasaoriginals subfolders)
Folders skipped:  bt/  (timestamp names - no design codes)
Files skipped:    .picasa.ini,  Thumbs.db
"""

import os
os.environ['PYTHONUTF8'] = '1'

import boto3
import json
import time
import sys
from io import BytesIO
from PIL import Image
from sentence_transformers import SentenceTransformer

# -- Config --------------------------------------------------------------------
R2_ACCESS_KEY  = "0ee08ce5fdf8a3b62333dfb18d01ce20"
R2_SECRET_KEY  = "8aa1875583cab00bfe877a585f2e7db9f0424073a757222facfdff72fc3bc8ad"
R2_ACCOUNT_ID  = "3414caecd91da76e23a682056093f948"
R2_BUCKET      = "bangle-tracker-images"
PUBLIC_BASE    = "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev"

CHECKPOINT_FILE = "indexer_checkpoint.json"
OUTPUT_FILE     = "embeddings.json"
R2_OUTPUT_KEY   = "_search_index/embeddings.json"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}

# -- Connect to R2 -------------------------------------------------------------
print("Connecting to R2...")
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    region_name="auto",
)

# -- List all eligible files ---------------------------------------------------
print("Listing all files in R2 bucket...")
all_keys = []
paginator = s3.get_paginator("list_objects_v2")
for page in paginator.paginate(Bucket=R2_BUCKET):
    for obj in page.get("Contents", []):
        key = obj["Key"]
        # Skip bt/ folder (timestamp names)
        if key.startswith("bt/"):
            continue
        # Skip non-image files
        ext = os.path.splitext(key)[1].lower()
        if ext not in IMAGE_EXTENSIONS:
            continue
        # Skip .picasa.ini (extension covered above, but explicit)
        if key.endswith(".ini"):
            continue
        all_keys.append(key)

print(f"Found {len(all_keys)} image files to index")

# -- Load checkpoint if resuming -----------------------------------------------
embeddings = {}
if os.path.exists(CHECKPOINT_FILE):
    print(f"Resuming from checkpoint ({CHECKPOINT_FILE})...")
    with open(CHECKPOINT_FILE, "r") as f:
        embeddings = json.load(f)
    print(f"  Already done: {len(embeddings)} images")

# -- Load CLIP model -----------------------------------------------------------
print("\nLoading CLIP model (downloads ~600MB on first run, then cached)...")
model = SentenceTransformer("clip-ViT-B-32")
print("CLIP model ready.\n")

# -- Process images ------------------------------------------------------------
total      = len(all_keys)
done       = 0
failed     = []
start_time = time.time()

for i, key in enumerate(all_keys):
    # Skip already processed
    if key in embeddings:
        done += 1
        continue

    # Progress display
    elapsed  = time.time() - start_time
    avg_sec  = elapsed / max(done, 1)
    remaining = avg_sec * (total - i)
    mins_left = int(remaining // 60)
    secs_left = int(remaining % 60)
    print(f"[{i+1}/{total}] {key}  |  remaining ~{mins_left}m {secs_left}s", end=" ", flush=True)

    try:
        # Download image from R2
        resp  = s3.get_object(Bucket=R2_BUCKET, Key=key)
        data  = resp["Body"].read()
        # Convert to grayscale then back to RGB so CLIP focuses on
        # shape/pattern/texture and ignores gold colour (rose gold vs yellow gold etc.)
        image = Image.open(BytesIO(data)).convert("L").convert("RGB")

        # Get CLIP embedding (512 floats)
        embedding = model.encode(image).tolist()

        # Store with full path as key (design code = filename without extension)
        filename_no_ext = os.path.splitext(os.path.basename(key))[0]
        embeddings[key] = {
            "design_code": filename_no_ext,
            "path":        key,
            "url":         f"{PUBLIC_BASE}/{key}",
            "embedding":   embedding,
        }
        done += 1
        print("OK", flush=True)

    except Exception as e:
        failed.append({"key": key, "error": str(e)})
        print(f"FAIL  ({e})")

    # Save checkpoint every 50 images
    if (i + 1) % 50 == 0:
        with open(CHECKPOINT_FILE, "w") as f:
            json.dump(embeddings, f)
        print(f"  >> Checkpoint saved ({len(embeddings)} done so far)", flush=True)

# -- Save final embeddings -----------------------------------------------------
print(f"\nDone! {len(embeddings)} embeddings, {len(failed)} failed.")

print(f"Saving {OUTPUT_FILE}...")
with open(OUTPUT_FILE, "w") as f:
    json.dump(embeddings, f)

# -- Upload to R2 --------------------------------------------------------------
print(f"Uploading to R2 as {R2_OUTPUT_KEY}...")
with open(OUTPUT_FILE, "rb") as f:
    s3.put_object(
        Bucket=R2_BUCKET,
        Key=R2_OUTPUT_KEY,
        Body=f,
        ContentType="application/json",
    )
print("Upload complete!")

if failed:
    print(f"\nFailed images ({len(failed)}):")
    for item in failed:
        print(f"  {item['key']}: {item['error']}")

print("\nAll done. The search index is ready in R2.")
