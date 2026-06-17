"""
Clean & Reindex — Free Catalog Description Cleanup
====================================================
Takes the 2,980 existing Claude descriptions and:
  1. Removes color/plating language (gold, silver, two-tone, rhodium, etc.)
  2. Adds standardized structural vocabulary tags at the end of each description
     (so catalog and search descriptions use the same standard terms)
  3. Re-generates semantic embeddings from the cleaned descriptions
  4. Uploads the new embeddings to R2

COMPLETELY FREE — no Claude API calls needed.
Uses only local Python and your existing desc_checkpoint.json file.
Takes about 5-10 minutes.

Run with:
    python clean_and_reindex.py
"""

import re, json, os, time
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
BATCH_SIZE      = 64

# ── Step 1: Remove these color/plating words from catalog descriptions ─────────
# These words tell Claude about color/finish — irrelevant for structural matching.
# Removing them means the embedding focuses on structure only.
COLOR_REMOVE = [
    r'\brose[-\s]?gold(?:[-\s]?toned?)?\b',
    r'\bgold(?:[-\s]?(?:tone[d]?|plated?|accents?|details?))?\b',
    r'\bsilver(?:[-\s]?(?:tone[d]?|plated?|accents?|details?))?\b',
    r'\bgunmetal(?:[-\s]?tone[d]?)?\b',
    r'\bcopper(?:[-\s]?tone[d]?)?\b',
    r'\bbronze[d]?\b',
    r'\brhodium(?:[-\s]?plated?)?\b',
    r'\bplatinum(?:[-\s]?tone[d]?)?\b',
    r'\bnickel(?:[-\s]?(?:plated?|tone[d]?))?\b',
    r'\bbrasswork?\b',
    r'\btwo[-\s]?tone[d]?\b',
    r'\bsingle[-\s]?tone[d]?\b',
    r'\bdual[-\s]?tone[d]?\b',
    r'\bmono[-\s]?tone[d]?\b',
    r'\bplated?\b',
    r'\bplating\b',
    r'\bhigh[-\s]?(?:polish|sheen)\b',
    r'\bpolished\b',
    r'\bmatte(?:[-\s]?finish)?\b',
    r'\bshiny\b',
    r'\blustrous\b',
    r'\bgleaming\b',
    r'\bmetallic[-\s]?sheen\b',
    r'\bbright[-\s]?finish\b',
    r'\bsatin[-\s]?finish\b',
]

# ── Step 2: Add standard vocabulary tags at the END of each description ────────
# If a description mentions a feature (in any wording), we append the standard
# term for it. This makes catalog descriptions use the SAME vocabulary that the
# new search prompt generates, so similarity scores improve dramatically.
#
# Format: (detection_pattern, standard_tag_to_add)
VOCAB_BOOST = [
    # Cutout shapes
    (r'\bteardrop\b',                           'teardrop-cutout'),
    (r'\bpear[-\s]?shap',                       'teardrop-cutout'),
    (r'\bdrop[-\s]?shap',                       'teardrop-cutout'),
    (r'\bdiamond[-\s]?(?:shap|cut)',            'diamond-cutout'),
    (r'\brhombus\b',                            'diamond-cutout'),
    (r'\blozenge\b',                            'diamond-cutout'),
    (r'\boval(?![-\s]?panel)',                  'oval-cutout'),
    (r'\belliptical\b',                         'oval-cutout'),
    (r'\brectangular[-\s]?(?:cutout|panel|opening|slot)', 'rectangular-cutout'),
    (r'\bflower[-\s]?(?:cutout|opening|shap)',  'flower-cutout'),
    (r'\bleaf[-\s]?(?:cutout|opening|shap)',    'leaf-cutout'),
    (r'\bstar[-\s]?(?:cutout|opening|shap)',    'star-cutout'),
    (r'\bcircular[-\s]?(?:cutout|opening)',     'circular-cutout'),
    (r'\barch[-\s]?(?:cutout|opening)',         'arch-cutout'),
    (r'\binfinity[-\s]?loop\b',                 'infinity-loop'),
    (r'\bbubble[-\s]?mesh\b',                   'bubble-mesh'),
    # Open work
    (r'\bopen[-\s]?work\b',                     'open-work'),
    (r'\bpierced\b',                            'open-work'),
    (r'\bnegative[-\s]?space\b',               'open-work'),
    (r'\bjali\b',                               'jali-pattern'),
    (r'\blattice\b',                            'lattice-pattern'),
    (r'\bcheckered[-\s]?grid\b',               'checkered-grid'),
    (r'\bhexagonal[-\s]?panel\b',              'hexagonal-panel'),
    # Surface texture
    (r'\bdiagonal[-\s]?ridge\b',               'diagonal-ridge'),
    (r'\blinear[-\s]?ridge\b',                 'linear-ridge'),
    (r'\bvertical[-\s]?(?:ridge|line|groove)', 'linear-ridge'),
    (r'\bdot[-\s]?(?:texture|granulation|pattern)', 'dot-texture'),
    (r'\bgranulat(?:ed|ion)\b',                'dot-texture'),
    (r'\bstipple\b',                           'dot-texture'),
    (r'\bcrosshat?ch\b',                       'crosshatch'),
    (r'\bwave[-\s]?pattern\b',                 'wave-pattern'),
    (r'\bGreek[-\s]?key\b',                    'Greek-key'),
    (r'\bchevron\b',                           'chevron'),
    # Border
    (r'\bbeaded[-\s]?(?:border|edge|wire|trim)', 'beaded-border'),
    (r'\bchain[-\s]?link\b',                   'chain-link'),
    (r'\brope[-\s]?(?:border|twist|edge)',     'rope-border'),
    # Medallion
    (r'\bflower[-\s]?medallion\b',             'flower-medallion'),
    (r'\bmedallion\b',                         'center-medallion'),
    (r'\boval[-\s]?panel\b',                   'oval-panel'),
]

def clean_description(text):
    """Remove color/plating language from a description."""
    for pattern in COLOR_REMOVE:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE)
    # Clean up extra spaces left behind
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = re.sub(r' ([,.])', r'\1', text)
    text = re.sub(r'[,]{2,}', ',', text)
    return text.strip()

def boost_vocabulary(text):
    """
    Append standard structural vocabulary tags to the description.
    If the description already uses a term (in any form), we add the
    standardized version at the end. This bridges vocabulary gaps.
    """
    tags = []
    text_lower = text.lower()
    seen = set()
    for pattern, tag in VOCAB_BOOST:
        if tag not in seen and re.search(pattern, text_lower, re.IGNORECASE):
            tags.append(tag)
            seen.add(tag)
    if tags:
        text = text.rstrip('.') + '. Tags: ' + ' '.join(tags) + '.'
    return text

def preprocess(description):
    """Full pipeline: clean color → boost vocabulary."""
    cleaned = clean_description(description)
    boosted = boost_vocabulary(cleaned)
    return boosted

# ── Load model ─────────────────────────────────────────────────────────────────
print("Loading all-MiniLM-L6-v2 model...", flush=True)
tokenizer = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
model     = AutoModel.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
model.eval()
print("Model ready.\n", flush=True)

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

# ── Load existing descriptions ─────────────────────────────────────────────────
print(f"Loading descriptions from {CHECKPOINT_FILE}...", flush=True)
with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
    descriptions = json.load(f)

entries = list(descriptions.values())
print(f"Loaded {len(entries)} descriptions.", flush=True)

# Show a before/after example so you can verify the cleaning is working
if entries:
    sample = entries[0]
    before = sample["description"]
    after  = preprocess(before)
    print(f"\n-- Sample cleanup --------------------------------------------------")
    print(f"BEFORE: {before[:200]}")
    print(f"AFTER:  {after[:200]}")
    print(f"--------------------------------------------------------------------\n")

# ── Generate embeddings from CLEANED descriptions ──────────────────────────────
result  = {}
total   = len(entries)
done    = 0
t_start = time.time()

print(f"Generating embeddings for {total} cleaned descriptions...", flush=True)

for i in range(0, total, BATCH_SIZE):
    batch = entries[i : i + BATCH_SIZE]
    # Use CLEANED description for embedding, not the raw one
    texts = [preprocess(e["description"]) for e in batch]

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

# ── Save locally ───────────────────────────────────────────────────────────────
print(f"Saving {OUTPUT_FILE}...", flush=True)
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(result, f)

size_mb = os.path.getsize(OUTPUT_FILE) / 1024 / 1024
print(f"File size: {size_mb:.1f} MB", flush=True)

# ── Upload to R2 ───────────────────────────────────────────────────────────────
print(f"Uploading to R2 as {R2_OUTPUT_KEY}...", flush=True)
s3 = boto3.client("s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    region_name="auto")

with open(OUTPUT_FILE, "rb") as f:
    s3.put_object(Bucket=R2_BUCKET, Key=R2_OUTPUT_KEY, Body=f, ContentType="application/json")

print("\nDone! New cleaned embeddings are live in R2.", flush=True)
print("  The search tool will use these automatically (browser cache refreshes in 1 hour).", flush=True)
print("  To see the change immediately: open the search page, press F12,", flush=True)
print("  go to Application > Cache Storage > delete 'bangle-desc-embeddings-v1' > refresh.", flush=True)
