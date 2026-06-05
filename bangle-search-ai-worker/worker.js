/**
 * Bangle Search AI Worker — Claude Vision
 * Accepts a client photo, asks Claude to describe the bangles,
 * then matches descriptions against the catalog using text similarity.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SEARCH_PROMPT = `A customer sent this photo showing one or more bangles they want to order.
Describe each visible bangle's design pattern. For each bangle, describe:
- Whether it is solid or has cutouts/open-work
- The shape of any cutouts (flower, leaf, oval, infinity-loop, diamond, rectangular, bubble/circular, star, etc.)
- Surface texture (diagonal-ridge, checkered-grid, dot-granulation, wave, smooth, crosshatch, etc.)
- Decorative ornaments (flower-medallion, leaf, geometric shapes, etc.)
- Border style (beaded, plain, engraved, etc.)
- Overall width (narrow/medium/wide)
- Any unique distinguishing feature

Completely IGNORE color (gold/silver tones do not matter for matching).
If multiple bangles are visible, number them: "Bangle 1: ...", "Bangle 2: ..." etc.
Focus on what makes each design structurally unique.`;

// Stopwords to ignore in similarity scoring
const STOPWORDS = new Set([
  "a","an","the","with","and","or","in","on","of","at","by","for","from",
  "is","has","have","are","be","it","this","that","these","those","its",
  "to","as","into","also","each","both","very","more","most","some",
  "bangle","bracelet","design","pattern","overall","features","section",
  "band","featuring","creating","composed","various","throughout","across",
  "between","within","around","along","using","through","different","multiple",
  "segment","item","number","structure","aesthetic","overall","effect",
]);

// Cache descriptions in memory (reloaded hourly)
let cachedDescriptions = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ status: "ok", model: "claude-haiku-4-5" });
    }

    if (request.method === "POST" && url.pathname === "/search") {
      try {
        const form = await request.formData();
        const file = form.get("image");
        if (!file) return json({ error: "No image provided" }, 400);

        const imgBytes  = await file.arrayBuffer();
        const imgB64    = arrayBufferToBase64(imgBytes);
        const mediaType = file.type || "image/jpeg";

        // Step 1: Ask Claude to describe the bangle(s) in the photo
        const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key":         env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type":      "application/json",
          },
          body: JSON.stringify({
            model:      "claude-haiku-4-5",
            max_tokens: 600,
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: mediaType, data: imgB64 } },
                { type: "text",  text: SEARCH_PROMPT }
              ]
            }]
          })
        });

        if (!claudeResp.ok) {
          const err = await claudeResp.text();
          return json({ error: "Claude API error: " + err.slice(0, 200) }, 500);
        }

        const claudeData  = await claudeResp.json();
        const queryText   = claudeData.content[0].text;

        // Step 2: Load catalog descriptions from R2
        const catalog = await loadCatalog(env.BUCKET);
        if (!catalog) return json({ error: "Catalog not ready. Run the description indexer first." }, 503);

        // Step 3: Parse individual bangles from Claude's response
        const bangleDescriptions = parseBangleDescriptions(queryText);

        // Step 4: Search for each bangle
        const allResults = [];
        for (const { label, description } of bangleDescriptions) {
          const matches = findTopMatches(description, catalog, 8);
          allResults.push({ label, query_description: description, matches });
        }

        return json({ results: allResults, raw_description: queryText });

      } catch (e) {
        return json({ error: "Search failed: " + e.message }, 500);
      }
    }

    return new Response("Bangle Search AI — POST /search", { headers: CORS });
  }
};

// ── Parse Claude's response into individual bangle descriptions ───────────────
function parseBangleDescriptions(text) {
  // Check if multiple bangles described
  const hasBangle1 = /bangle\s*1[:\-]/i.test(text);

  if (!hasBangle1) {
    return [{ label: "Bangle", description: text }];
  }

  // Split by "Bangle N:" markers
  const parts = text.split(/bangle\s*\d+\s*[:\-]/gi).filter(p => p.trim().length > 20);
  return parts.map((p, i) => ({ label: `Bangle ${i + 1}`, description: p.trim() }));
}

// ── Text similarity (Jaccard on meaningful tokens) ────────────────────────────
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

function similarity(queryTokens, catalogText) {
  const catTokens = new Set(tokenize(catalogText));
  let matches = 0;
  let total   = catTokens.size;

  for (const t of queryTokens) {
    if (catTokens.has(t)) {
      matches++;
    } else {
      // Partial match bonus: "flower" matches "flower-medallion"
      for (const ct of catTokens) {
        if (ct.includes(t) || t.includes(ct)) { matches += 0.5; break; }
      }
    }
    total++;
  }

  return total > 0 ? matches / total : 0;
}

function findTopMatches(queryDescription, catalog, k) {
  const queryTokens = tokenize(queryDescription);
  const scores = [];

  // Group by design_code — take best score per design
  const bestPerCode = {};

  for (const [path, entry] of Object.entries(catalog)) {
    const score = similarity(queryTokens, entry.description);
    const code  = entry.design_code;

    if (!bestPerCode[code] || score > bestPerCode[code].score) {
      bestPerCode[code] = {
        design_code: code,
        path:        entry.path,
        url:         entry.url,
        score:       score,
        pct:         Math.round(score * 100),
      };
    }
  }

  return Object.values(bestPerCode)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// ── Load catalog from R2 (with memory cache) ──────────────────────────────────
async function loadCatalog(bucket) {
  if (cachedDescriptions && Date.now() - cacheTime < CACHE_TTL) return cachedDescriptions;
  try {
    const obj = await bucket.get("_search_index/descriptions.json");
    if (!obj) return null;
    cachedDescriptions = JSON.parse(await obj.text());
    cacheTime = Date.now();
    return cachedDescriptions;
  } catch (e) {
    console.error("Failed to load catalog:", e);
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary  = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
