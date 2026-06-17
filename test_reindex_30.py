"""
Test Re-index — 30 Images Only
================================
Before spending Rs580 on the full re-index, this script:
  1. Picks 30 representative images (including design 8349)
  2. Describes them using the NEW improved prompt
  3. Updates only those 30 entries in the catalog
  4. Re-generates ALL embeddings (free)
  5. Uploads to R2 so you can test search immediately

Cost: ~Rs5 total (30 images x Claude Haiku)

If search works correctly for those 30 designs → proceed with full re-index.
If not → fix the prompt again, no more money spent.
"""

import os, json, base64, time, anthropic, torch, boto3
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel

os.environ['PYTHONUTF8'] = '1'

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
R2_ACCESS_KEY  = "0ee08ce5fdf8a3b62333dfb18d01ce20"
R2_SECRET_KEY  = "8aa1875583cab00bfe877a585f2e7db9f0424073a757222facfdff72fc3bc8ad"
R2_ACCOUNT_ID  = "3414caecd91da76e23a682056093f948"
R2_BUCKET      = "bangle-tracker-images"
PUBLIC_BASE    = "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev"

CHECKPOINT_FILE = "desc_checkpoint.json"
OUTPUT_FILE     = "desc_embeddings.json"
R2_OUTPUT_KEY   = "_search_index/desc_embeddings.json"

# ── NEW improved prompt (same vocabulary as the search page now uses) ──────────
NEW_PROMPT = """Describe this bangle's PHYSICAL STRUCTURE ONLY for catalog matching.

STRICT RULES — follow exactly:
1. DO NOT mention color, metal tone, or plating under any circumstances.
   Gold, silver, rose gold, two-tone, rhodium — these do NOT exist. Pretend the bangle has no color.
2. Describe ONLY: cutout shapes, surface texture, border style, pattern arrangement.
3. Use these EXACT vocabulary terms wherever they apply:

   Cutout/hole shapes: flower-cutout, leaf-cutout, teardrop-cutout, diamond-cutout, oval-cutout,
     rectangular-cutout, star-cutout, circular-cutout, arch-cutout, infinity-loop, bubble-mesh

   Open work: open-work, jali-pattern, hexagonal-panel, checkered-grid, lattice-pattern

   Surface texture: diagonal-ridge, dot-texture, wave-pattern, crosshatch, Greek-key,
     smooth, hammered, engraved-lines, chevron, linear-ridge

   Border/edge: beaded-border, rope-border, plain-border, chain-link

   Pattern layout: center-medallion, flower-medallion, oval-panel, repeating-vertical,
     alternating, geometric-grid

   Width: narrow (under 8mm), medium (8-12mm), wide (over 12mm)

Write 60-80 words using those exact terms. Be precise."""

# ── 30 test images — mix of design types including known problem designs ───────
# Includes 8349 (confirmed problem), plus variety of CNC and Dye Gold designs
TEST_KEYS = [
    # Known problem design - MUST include
    "CNC/8MM CNC/8349.jpeg",

    # Mix of CNC designs
    "CNC/8MM CNC/8313.jpeg",
    "CNC/8MM CNC/8300.jpeg",
    "CNC/8MM CNC/8350.jpeg",
    "CNC/8MM CNC/8400.jpeg",
    "CNC/8MM CNC/8200.jpeg",
    "CNC/8MM CNC/8100.jpeg",
    "CNC/8MM CNC/8150.jpeg",
    "CNC/8MM CNC/8250.jpeg",
    "CNC/8MM CNC/8500.jpeg",

    # 10MM CNC designs
    "CNC/10MM CNC/9001.jpeg",
    "CNC/10MM CNC/9100.jpeg",
    "CNC/10MM CNC/9200.jpeg",
    "CNC/10MM CNC/9300.jpeg",
    "CNC/10MM CNC/9400.jpeg",

    # 12MM CNC designs
    "CNC/12MM CNC/10001.jpeg",
    "CNC/12MM CNC/10100.jpeg",
    "CNC/12MM CNC/10200.jpeg",
    "CNC/12MM CNC/10300.jpeg",
    "CNC/12MM CNC/10400.jpeg",

    # Dye Gold designs
    "Dye Gold/1001.jpeg",
    "Dye Gold/1100.jpeg",
    "Dye Gold/1200.jpeg",
    "Dye Gold/1300.jpeg",
    "Dye Gold/1400.jpeg",
    "Dye Gold/1500.jpeg",
    "Dye Gold/1600.jpeg",
    "Dye Gold/1700.jpeg",
    "Dye Gold/1800.jpeg",
    "Dye Gold/1900.jpeg",
]

# ── Connect ────────────────────────────────────────────────────────────────────
print("Connecting...", flush=True)
if not ANTHROPIC_API_KEY:
    raise SystemExit("ERROR: Set ANTHROPIC_API_KEY environment variable first.")

ai = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
s3 = boto3.client("s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    region_name="auto")

# ── Load existing checkpoint ───────────────────────────────────────────────────
print(f"Loading existing descriptions from {CHECKPOINT_FILE}...", flush=True)
with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
    descriptions = json.load(f)
print(f"Loaded {len(descriptions)} existing descriptions.", flush=True)

# ── Find which test images actually exist in R2 ────────────────────────────────
print("\nChecking which test images exist in R2...", flush=True)
valid_keys = []
for key in TEST_KEYS:
    try:
        s3.head_object(Bucket=R2_BUCKET, Key=key)
        valid_keys.append(key)
    except Exception:
        # Try .jpg instead of .jpeg
        alt = key.replace(".jpeg", ".jpg")
        try:
            s3.head_object(Bucket=R2_BUCKET, Key=alt)
            valid_keys.append(alt)
        except Exception:
            print(f"  NOT FOUND (skipping): {key}", flush=True)

print(f"Found {len(valid_keys)} of {len(TEST_KEYS)} test images in R2.\n", flush=True)

# ── Describe each test image with the NEW prompt ───────────────────────────────
print(f"Describing {len(valid_keys)} images with NEW prompt...", flush=True)
print(f"Estimated cost: Rs{len(valid_keys) * 0.16:.0f}-{len(valid_keys) * 0.20:.0f}\n", flush=True)

new_descriptions = {}
failed = []

for i, key in enumerate(valid_keys, 1):
    try:
        # Download image from R2
        resp   = s3.get_object(Bucket=R2_BUCKET, Key=key)
        imgdata = resp["Body"].read()
        imgb64  = base64.standard_b64encode(imgdata).decode()
        ext     = os.path.splitext(key)[1].lower()
        mtype   = ("image/jpeg" if ext in {".jpg", ".jpeg"} else
                   "image/png"  if ext == ".png" else "image/jpeg")

        # Call Claude with NEW prompt
        msg = ai.messages.create(
            model="claude-haiku-4-5",
            max_tokens=250,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": mtype, "data": imgb64}},
                    {"type": "text",  "text": NEW_PROMPT}
                ]
            }]
        )
        new_desc = msg.content[0].text.strip()

        # Show old vs new for 8349 so user can see the improvement
        if "8349" in key:
            print(f"  *** DESIGN 8349 — before/after comparison ***")
            old_desc = descriptions.get(key, {}).get("description", "NOT IN CATALOG")
            print(f"  OLD: {old_desc[:200]}")
            print(f"  NEW: {new_desc[:200]}")
            print()

        # Store new description
        fname = os.path.basename(key)
        design_code = os.path.splitext(fname)[0]
        new_descriptions[key] = {
            "path":        key,
            "design_code": design_code,
            "url":         PUBLIC_BASE + "/" + "/".join(
                               p if idx == 0 else p.replace(" ", "%20")
                               for idx, p in enumerate(key.split("/"))),
            "description": new_desc,
        }

        print(f"  [{i}/{len(valid_keys)}] {key} - done", flush=True)
        time.sleep(0.3)  # be gentle with the API

    except Exception as e:
        print(f"  [{i}/{len(valid_keys)}] FAILED: {key} — {e}", flush=True)
        failed.append(key)

print(f"\nDescribed {len(new_descriptions)} images. Failed: {len(failed)}", flush=True)

# ── Merge new descriptions into the existing checkpoint ───────────────────────
print("\nMerging new descriptions into catalog...", flush=True)
descriptions.update(new_descriptions)

# Save updated checkpoint
with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
    json.dump(descriptions, f, ensure_ascii=False)
print(f"Checkpoint updated: {len(descriptions)} total descriptions.", flush=True)

# ── Regenerate ALL embeddings (free) ──────────────────────────────────────────
print("\nLoading embedding model...", flush=True)
tokenizer = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
model     = AutoModel.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
model.eval()
print("Model ready.", flush=True)

def mean_pool_normalize(model_output, attention_mask):
    token_emb = model_output.last_hidden_state
    mask_exp  = attention_mask.unsqueeze(-1).expand(token_emb.size()).float()
    pooled    = torch.sum(token_emb * mask_exp, 1) / torch.clamp(mask_exp.sum(1), min=1e-9)
    return F.normalize(pooled, p=2, dim=1)

def embed_batch(texts):
    enc = tokenizer(texts, padding=True, truncation=True, max_length=256, return_tensors="pt")
    with torch.no_grad():
        out = model(**enc)
    return [v.tolist() for v in mean_pool_normalize(out, enc["attention_mask"])]

BATCH_SIZE = 64
entries    = list(descriptions.values())
total      = len(entries)
result     = {}
done       = 0
t_start    = time.time()

print(f"\nGenerating embeddings for {total} descriptions...", flush=True)

for i in range(0, total, BATCH_SIZE):
    batch = entries[i : i + BATCH_SIZE]
    texts = [e["description"] for e in batch]
    vecs  = embed_batch(texts)
    for entry, vec in zip(batch, vecs):
        key = entry["path"]
        result[key] = {
            "design_code": entry["design_code"],
            "path":        key,
            "url":         entry["url"],
            "embedding":   vec,
        }
        done += 1
    elapsed = time.time() - t_start
    rate    = done / elapsed if elapsed > 0 else 1
    eta     = int((total - done) / rate)
    print(f"  [{done}/{total}]  ~{eta}s left", flush=True)

print(f"\nAll {len(result)} embeddings generated.", flush=True)

# ── Save + upload ──────────────────────────────────────────────────────────────
print(f"Saving {OUTPUT_FILE}...", flush=True)
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(result, f)

size_mb = os.path.getsize(OUTPUT_FILE) / 1024 / 1024
print(f"File size: {size_mb:.1f} MB", flush=True)

print(f"Uploading to R2...", flush=True)
with open(OUTPUT_FILE, "rb") as f:
    s3.put_object(Bucket=R2_BUCKET, Key=R2_OUTPUT_KEY, Body=f, ContentType="application/json")

print("\nDone! Test embeddings are live.", flush=True)
print("Clear browser cache and test search with design 8349 and others.", flush=True)
print(f"\nSummary:", flush=True)
print(f"  Images re-described with new prompt: {len(new_descriptions)}", flush=True)
print(f"  Failed: {len(failed)}", flush=True)
print(f"  Total catalog size: {len(descriptions)}", flush=True)
