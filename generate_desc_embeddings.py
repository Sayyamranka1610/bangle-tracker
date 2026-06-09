"""
Description Embedding Generator
================================
Converts the 2,980 Claude text descriptions into 384-dim semantic embedding vectors.
Uses sentence-transformers/all-MiniLM-L6-v2 — the same model that runs in the browser
for search queries, so catalog and query embeddings are fully compatible.

This is MUCH better than word-overlap (Jaccard) matching because:
  "hexagonal panel"  ≈  "six-sided geometric"   → high similarity
  "flower medallion" ≈  "floral ornament"        → high similarity
  "dot-granulation"  ≈  "dotted texture surface" → high similarity

Run once. Takes ~30 seconds. Uploads desc_embeddings.json to R2.
"""

import os, json, time
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel
import boto3

os.environ['PYTHONUTF8'] = '1'

# ── R2 config ──────────────────────────────────────────────────────────────────
R2_ACCESS_KEY = "0ee08ce5fdf8a3b62333dfb18d01ce20"
R2_SECRET_KEY = "8aa1875583cab00bfe877a585f2e7db9f0424073a757222facfdff72fc3bc8ad"
R2_ACCOUNT_ID = "3414caecd91da76e23a682056093f948"
R2_BUCKET     = "bangle-tracker-images"
PUBLIC_BASE   = "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev"

CHECKPOINT_FILE = "desc_checkpoint.json"
OUTPUT_FILE     = "desc_embeddings.json"
R2_OUTPUT_KEY   = "_search_index/desc_embeddings.json"
BATCH_SIZE      = 64   # process this many descriptions at once

print("Loading all-MiniLM-L6-v2 model...", flush=True)
tokenizer = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
model     = AutoModel.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
model.eval()
print("Model ready.\n", flush=True)

def mean_pool_normalize(model_output, attention_mask):
    """Mean pooling + L2 normalisation → 384-dim unit vector."""
    token_emb = model_output.last_hidden_state           # [B, T, 384]
    mask_exp  = attention_mask.unsqueeze(-1).expand(token_emb.size()).float()
    pooled    = torch.sum(token_emb * mask_exp, 1) / torch.clamp(mask_exp.sum(1), min=1e-9)
    return F.normalize(pooled, p=2, dim=1)               # [B, 384]

def embed_batch(texts):
    """Return list of 384-dim lists for a batch of texts."""
    enc = tokenizer(texts, padding=True, truncation=True, max_length=256, return_tensors="pt")
    with torch.no_grad():
        out = model(**enc)
    vecs = mean_pool_normalize(out, enc["attention_mask"])
    return [v.tolist() for v in vecs]

# ── Load descriptions ──────────────────────────────────────────────────────────
print(f"Loading descriptions from {CHECKPOINT_FILE}...", flush=True)
with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
    descriptions = json.load(f)

entries = list(descriptions.values())
print(f"Loaded {len(entries)} descriptions.\n", flush=True)

# ── Generate embeddings ────────────────────────────────────────────────────────
result  = {}
total   = len(entries)
done    = 0
t_start = time.time()

for i in range(0, total, BATCH_SIZE):
    batch = entries[i : i + BATCH_SIZE]
    texts = [e["description"] for e in batch]

    vecs  = embed_batch(texts)

    for entry, vec in zip(batch, vecs):
        key = entry["path"]
        fname = os.path.basename(key)
        encoded_url = PUBLIC_BASE + "/" + "/".join(
            part if idx <= 0 else part.replace(" ", "%20")
            for idx, part in enumerate(key.split("/"))
        )
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

print(f"Uploading to R2 as {R2_OUTPUT_KEY}...", flush=True)
s3 = boto3.client("s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    region_name="auto")

with open(OUTPUT_FILE, "rb") as f:
    s3.put_object(Bucket=R2_BUCKET, Key=R2_OUTPUT_KEY, Body=f, ContentType="application/json")

print("Done! desc_embeddings.json is live in R2.", flush=True)
