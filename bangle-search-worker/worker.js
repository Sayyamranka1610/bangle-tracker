/**
 * Bangle Design Search Worker
 * Cloudflare Worker that accepts an image and returns the top matching design codes
 * using CLIP embeddings stored in R2.
 */

const R2_PUBLIC_BASE = "https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev";
const HF_MODEL = "openai/clip-vit-base-patch32";
const TOP_K = 8; // Number of top results to return

// In-memory cache so we don't re-download embeddings.json on every request
let cachedEmbeddings = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // Re-load from R2 once per hour

export default {
  async fetch(request, env) {
    // CORS headers for all responses
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Main search endpoint
    if (request.method === "POST" && url.pathname === "/search") {
      try {
        const formData = await request.formData();
        const imageFile = formData.get("image");

        if (!imageFile) {
          return new Response(JSON.stringify({ error: "No image provided" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const imageBytes = await imageFile.arrayBuffer();

        // Step 1: Get CLIP embedding for the query image via HF API
        const queryEmbedding = await getClipEmbedding(imageBytes, env.HF_TOKEN);
        if (!queryEmbedding) {
          return new Response(
            JSON.stringify({ error: "Failed to generate image embedding. Please try again." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Step 2: Load embeddings index from R2 (cached)
        const embeddings = await loadEmbeddings(env.BUCKET);
        if (!embeddings || Object.keys(embeddings).length === 0) {
          return new Response(
            JSON.stringify({ error: "Search index not ready. Please run the indexer first." }),
            { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Step 3: Compute cosine similarity and find top K matches
        const results = findTopMatches(queryEmbedding, embeddings, TOP_K);

        return new Response(JSON.stringify({ results }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      } catch (err) {
        return new Response(
          JSON.stringify({ error: "Search failed: " + err.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response("Bangle Search API — POST /search with image file", {
      headers: corsHeaders,
    });
  },
};

// ── Get CLIP embedding from HuggingFace Inference API ─────────────────────────
async function getClipEmbedding(imageBytes, hfToken) {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(
        `https://api-inference.huggingface.co/pipeline/feature-extraction/${HF_MODEL}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hfToken}`,
            "Content-Type": "application/octet-stream",
          },
          body: imageBytes,
        }
      );

      if (resp.status === 503) {
        // Model loading — wait and retry
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      if (!resp.ok) {
        const text = await resp.text();
        console.error("HF API error:", resp.status, text);
        return null;
      }

      const embedding = await resp.json();
      if (Array.isArray(embedding) && embedding.length > 0) {
        return embedding;
      }
      return null;
    } catch (e) {
      console.error("HF API fetch error:", e);
      if (attempt === maxRetries - 1) return null;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
}

// ── Load embeddings index from R2 (with memory cache) ─────────────────────────
async function loadEmbeddings(bucket) {
  const now = Date.now();
  if (cachedEmbeddings && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedEmbeddings;
  }

  try {
    const obj = await bucket.get("_search_index/embeddings.json");
    if (!obj) return null;
    const text = await obj.text();
    cachedEmbeddings = JSON.parse(text);
    cacheTimestamp = now;
    return cachedEmbeddings;
  } catch (e) {
    console.error("Failed to load embeddings:", e);
    return null;
  }
}

// ── Cosine similarity + top-K search ──────────────────────────────────────────
function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function findTopMatches(queryEmbedding, embeddings, topK) {
  const scores = [];

  for (const [path, data] of Object.entries(embeddings)) {
    const sim = cosineSimilarity(queryEmbedding, data.embedding);
    scores.push({
      design_code: data.design_code,
      path:        data.path,
      url:         data.url,
      similarity:  Math.round(sim * 100),
    });
  }

  // Sort by similarity descending, return top K
  scores.sort((a, b) => b.similarity - a.similarity);
  return scores.slice(0, topK);
}
