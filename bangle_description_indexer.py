"""
Bangle Description Indexer — Claude Vision
===========================================
Uses Claude Haiku to generate precise text descriptions of all catalog images.
These descriptions are used for pattern matching when a client sends a photo.
Cost: ~Rs 0.05 per image, Rs 140 total for 3015 images.
"""

import os
os.environ['PYTHONUTF8'] = '1'

import boto3
import json
import base64
import time
import anthropic

# -- Config --------------------------------------------------------------------
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")  # set via environment or config.json
R2_ACCESS_KEY  = "0ee08ce5fdf8a3b62333dfb18d01ce20"
R2_SECRET_KEY  = "8aa1875583cab00bfe877a585f2e7db9f0424073a757222facfdff72fc3bc8ad"
R2_ACCOUNT_ID  = "3414caecd91da76e23a682056093f948"
R2_BUCKET      = "bangle-tracker-images"
PUBLIC_BASE    = "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev"

CHECKPOINT_FILE = "desc_checkpoint.json"
OUTPUT_FILE     = "descriptions.json"
R2_OUTPUT_KEY   = "_search_index/descriptions.json"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

PROMPT = """Describe this bangle/bracelet design for catalog search matching.
Focus ONLY on structural design elements — completely ignore color (gold/silver tones do not matter).
Use specific descriptive terms such as: flower-medallion, leaf-cutout, infinity-loop, bubble-mesh, oval-panel, diagonal-ridge, dot-texture, wave-pattern, Greek-key, hexagonal-panel, open-work, checkered-grid, beaded-border, chain-link, floral-open-work, star-cutout, diamond-cutout, crosshatch.
Describe in 60-80 words. Be precise and distinctive."""

# -- Setup clients -------------------------------------------------------------
print("Connecting to R2 and Anthropic...", flush=True)
ai = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    region_name="auto",
)

# -- List all eligible files ---------------------------------------------------
print("Listing catalog images...", flush=True)
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

print(f"Found {len(all_keys)} images to describe", flush=True)

# -- Load checkpoint -----------------------------------------------------------
descriptions = {}
if os.path.exists(CHECKPOINT_FILE):
    print(f"Resuming from checkpoint...", flush=True)
    with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
        descriptions = json.load(f)
    print(f"  Already done: {len(descriptions)} images", flush=True)

# -- Process each image --------------------------------------------------------
total      = len(all_keys)
done       = 0
failed     = []
start_time = time.time()

for i, key in enumerate(all_keys):
    if key in descriptions:
        done += 1
        continue

    elapsed   = time.time() - start_time
    avg_sec   = elapsed / max(done, 1)
    remaining = avg_sec * (total - i)
    mins_left = int(remaining // 60)
    secs_left = int(remaining % 60)
    print(f"[{i+1}/{total}] {os.path.basename(key)}  |  ~{mins_left}m {secs_left}s left", end=" ", flush=True)

    try:
        # Download image
        resp     = s3.get_object(Bucket=R2_BUCKET, Key=key)
        img_data = resp["Body"].read()
        img_b64  = base64.standard_b64encode(img_data).decode()

        # Detect media type
        ext = os.path.splitext(key)[1].lower()
        media_type = "image/jpeg" if ext in {".jpg", ".jpeg"} else \
                     "image/png"  if ext == ".png"  else \
                     "image/webp" if ext == ".webp"  else "image/jpeg"

        # Call Claude Haiku
        msg = ai.messages.create(
            model="claude-haiku-4-5",
            max_tokens=200,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": img_b64}},
                    {"type": "text", "text": PROMPT}
                ]
            }]
        )

        description = msg.content[0].text.strip()
        filename_no_ext = os.path.splitext(os.path.basename(key))[0]

        descriptions[key] = {
            "design_code": filename_no_ext,
            "path":        key,
            "url":         f"{PUBLIC_BASE}/{key}",
            "description": description,
        }
        done += 1
        print("OK", flush=True)

        # Rate limit: ~1 request/second to stay safe
        time.sleep(0.6)

    except anthropic.RateLimitError:
        print("RATE LIMIT — waiting 30s...", flush=True)
        time.sleep(30)
        failed.append(key)
    except Exception as e:
        print(f"FAIL ({str(e)[:80]})", flush=True)
        failed.append(key)

    # Checkpoint every 25 images
    if (i + 1) % 25 == 0:
        with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
            json.dump(descriptions, f, ensure_ascii=False)
        print(f"  >> Checkpoint saved ({len(descriptions)} done)", flush=True)

# -- Save and upload -----------------------------------------------------------
print(f"\nDone! {len(descriptions)} described, {len(failed)} failed.", flush=True)

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(descriptions, f, ensure_ascii=False)

print("Uploading descriptions.json to R2...", flush=True)
with open(OUTPUT_FILE, "rb") as f:
    s3.put_object(
        Bucket=R2_BUCKET,
        Key=R2_OUTPUT_KEY,
        Body=f,
        ContentType="application/json",
    )
print("Upload complete! Claude Vision index is ready.", flush=True)

if failed:
    print(f"\nFailed ({len(failed)} images) — re-run to retry:")
    for k in failed[:20]:
        print(f"  {k}")
