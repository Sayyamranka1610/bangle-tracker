"""
Bangle Design Indexer
=====================
Generates DINOv2 visual embeddings for all bangle design images in R2.
DINOv2 captures structural shape/pattern/texture far better than CLIP.

Folders indexed:  CNC/  and  Dye Gold/  (including .picasaoriginals subfolders)
Folders skipped:  bt/  (timestamp names - no design codes)
Files skipped:    .picasa.ini,  Thumbs.db
"""

import os
os.environ['PYTHONUTF8'] = '1'

import boto3
import json
import time
import torch
from io import BytesIO
from PIL import Image
from transformers import AutoImageProcessor, AutoModel

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
print("Connecting to R2...", flush=True)
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    region_name="auto",
)

# -- List all eligible files ---------------------------------------------------
print("Listing all files in R2 bucket...", flush=True)
all_keys = []
paginator = s3.get_paginator("list_objects_v2")
for page in paginator.paginate(Bucket=R2_BUCKET):
    for obj in page.get("Contents", []):
        key = obj["Key"]
        if key.startswith("bt/"):
            continue
        ext = os.path.splitext(key)[1].lower()
        if ext not in IMAGE_EXTENSIONS:
            continue
        if key.endswith(".ini"):
            continue
        all_keys.append(key)

print(f"Found {len(all_keys)} image files to index", flush=True)

# -- Load checkpoint if resuming -----------------------------------------------
embeddings = {}
if os.path.exists(CHECKPOINT_FILE):
    print(f"Resuming from checkpoint ({CHECKPOINT_FILE})...", flush=True)
    with open(CHECKPOINT_FILE, "r") as f:
        embeddings = json.load(f)
    print(f"  Already done: {len(embeddings)} images", flush=True)

# -- Load DINOv2 model ---------------------------------------------------------
# DINOv2 learns pure visual features (shape, lines, texture, pattern)
# without any language/colour bias — much better than CLIP for design matching
print("\nLoading DINOv2-small model (downloads ~100MB first time, then cached)...", flush=True)
processor = AutoImageProcessor.from_pretrained("facebook/dinov2-small")
model     = AutoModel.from_pretrained("facebook/dinov2-small")
model.eval()
print("DINOv2 ready.\n", flush=True)

def get_dinov2_embedding(image):
    """Get 768-dim DINOv2 CLS token embedding, L2-normalised."""
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
    # CLS token = global structural representation of the image
    cls = outputs.last_hidden_state[:, 0, :].squeeze()
    cls = cls / cls.norm()          # L2 normalise for cosine similarity
    return cls.tolist()

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

    elapsed   = time.time() - start_time
    avg_sec   = elapsed / max(done, 1)
    remaining = avg_sec * (total - i)
    mins_left = int(remaining // 60)
    secs_left = int(remaining % 60)
    print(f"[{i+1}/{total}] {key}  |  ~{mins_left}m {secs_left}s left", end=" ", flush=True)

    try:
        resp  = s3.get_object(Bucket=R2_BUCKET, Key=key)
        data  = resp["Body"].read()
        # Grayscale: remove colour so DINOv2 focuses purely on shape/pattern/lines
        image = Image.open(BytesIO(data)).convert("L").convert("RGB")

        embedding = get_dinov2_embedding(image)

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
        print(f"FAIL ({e})", flush=True)

    # Checkpoint every 50 images
    if (i + 1) % 50 == 0:
        with open(CHECKPOINT_FILE, "w") as f:
            json.dump(embeddings, f)
        print(f"  >> Checkpoint saved ({len(embeddings)} done so far)", flush=True)

# -- Save and upload -----------------------------------------------------------
print(f"\nDone! {len(embeddings)} embeddings, {len(failed)} failed.", flush=True)

print(f"Saving {OUTPUT_FILE}...", flush=True)
with open(OUTPUT_FILE, "w") as f:
    json.dump(embeddings, f)

print(f"Uploading to R2 as {R2_OUTPUT_KEY}...", flush=True)
with open(OUTPUT_FILE, "rb") as f:
    s3.put_object(
        Bucket=R2_BUCKET,
        Key=R2_OUTPUT_KEY,
        Body=f,
        ContentType="application/json",
    )
print("Upload complete!", flush=True)

if failed:
    print(f"\nFailed images ({len(failed)}):")
    for item in failed:
        print(f"  {item['key']}: {item['error']}")

print("\nAll done. The DINOv2 search index is ready in R2.")
