/**
 * Bangle Search AI Worker — Claude Vision + Semantic Embeddings
 *
 * Step 1: Accepts client photo → Claude describes the bangle(s) in words
 * Step 2: Browser handles embedding + cosine similarity search
 *
 * Also serves /desc-embeddings endpoint so browser can download the catalog index.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SEARCH_PROMPT = `Describe this bangle's PHYSICAL STRUCTURE ONLY for catalog matching.

STRICT RULES — follow exactly:
1. DO NOT mention color, metal tone, or plating under any circumstances.
   Gold, silver, rose gold, two-tone, rhodium — these do NOT exist. Pretend the bangle has no color.
2. Describe ONLY: cutout shapes, surface texture, border style, pattern arrangement.
3. Use these EXACT vocabulary terms wherever they apply — this is critical for accurate matching:

   Cutout/hole shapes: flower-cutout, leaf-cutout, teardrop-cutout, diamond-cutout, oval-cutout,
     rectangular-cutout, star-cutout, circular-cutout, arch-cutout, infinity-loop, bubble-mesh

   Open work: open-work, jali-pattern, hexagonal-panel, checkered-grid, lattice-pattern

   Surface texture: diagonal-ridge, dot-texture, wave-pattern, crosshatch, Greek-key,
     smooth, hammered, engraved-lines, chevron, linear-ridge

   Border/edge: beaded-border, rope-border, plain-border, chain-link

   Pattern layout: center-medallion, flower-medallion, oval-panel, repeating-vertical,
     alternating, geometric-grid

   Width: narrow (under 8mm), medium (8–12mm), wide (over 12mm)

Write 60–80 words using those exact terms. Be precise — a specific term like "teardrop-cutout"
is far more useful than a vague phrase like "curved shapes."
If multiple bangles are visible, start each with "Bangle 1:", "Bangle 2:", etc.`;

// Cache desc-embeddings in memory, keyed by the R2 upload time so a freshly
// uploaded catalog goes live immediately instead of after a timeout.
let cachedEmbeddings = null;
let cachedVersion = null;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return json({ status: "ok", mode: "semantic-embeddings" });
    }

    // Lightweight version check — returns upload timestamp of the index file
    // Browser calls this first (tiny response) to know if it needs to re-download
    if (url.pathname === "/desc-embeddings-version") {
      try {
        const obj = await env.BUCKET.head("_search_index/desc_embeddings.json");
        if (!obj) return json({ version: "unknown", size: 0 });
        const version = obj.uploaded ? obj.uploaded.getTime().toString() : obj.size.toString();
        return json({ version, size: obj.size });
      } catch (e) {
        return json({ version: "unknown", size: 0 });
      }
    }

    // Serve desc-embeddings index from R2 (browser downloads this for search)
    if (url.pathname === "/desc-embeddings") {
      try {
        // The browser caches this itself and revalidates via /desc-embeddings-version,
        // so no-store here — an HTTP-cached copy would silently defeat that check.
        const indexHeaders = { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" };

        const head = await env.BUCKET.head("_search_index/desc_embeddings.json").catch(() => null);
        const liveVersion = head?.uploaded ? head.uploaded.getTime().toString() : null;

        if (cachedEmbeddings && liveVersion && liveVersion === cachedVersion) {
          return new Response(cachedEmbeddings, { headers: indexHeaders });
        }

        const obj = await env.BUCKET.get("_search_index/desc_embeddings.json");
        if (!obj) return json({ error: "Embedding index not ready. Run generate_desc_embeddings.py first." }, 503);
        const text = await obj.text();
        cachedEmbeddings = text;
        cachedVersion = liveVersion;
        return new Response(text, { headers: indexHeaders });
      } catch (e) {
        return json({ error: "Failed to load embedding index: " + e.message }, 500);
      }
    }

    // Main search: photo → Claude description → return descriptions for browser to match
    if (request.method === "POST" && url.pathname === "/search") {
      try {
        const form = await request.formData();
        const file = form.get("image");
        if (!file) return json({ error: "No image provided" }, 400);

        const imgBytes = await file.arrayBuffer();
        if (imgBytes.byteLength === 0) {
          return json({ error: "That photo came through empty. Please pick it again." }, 400);
        }
        // Claude rejects images over 10 MB once base64-encoded (encoding adds ~33%),
        // so stop oversized photos here with a clear message instead of a raw API error.
        if (imgBytes.byteLength > 7 * 1024 * 1024) {
          return json({ error: "Image too large — please use a photo under about 7 MB." }, 413);
        }

        const imgB64    = arrayBufferToBase64(imgBytes);
        const mediaType = file.type || "image/jpeg";

        // Ask Claude to describe the bangle(s)
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

        const claudeData = await claudeResp.json();
        const rawDesc    = claudeData?.content?.[0]?.text;
        if (!rawDesc) {
          return json({ error: "Claude could not describe that photo. Try a clearer, closer shot." }, 502);
        }

        // Parse multi-bangle descriptions
        const bangles = parseBangleDescriptions(rawDesc);

        // Return descriptions to browser — browser handles embedding + search
        return json({ bangles, raw_description: rawDesc });

      } catch (e) {
        return json({ error: "Search failed: " + e.message }, 500);
      }
    }

    return new Response("Bangle Search AI — POST /search", { headers: CORS });
  }
};

function parseBangleDescriptions(text) {
  const hasBangle1 = /bangle\s*1[:\-]/i.test(text);
  if (!hasBangle1) {
    return [{ label: "Bangle", description: text }];
  }
  const parts = text.split(/bangle\s*\d+\s*[:\-]/gi).filter(p => p.trim().length > 20);
  return parts.map((p, i) => ({ label: `Bangle ${i + 1}`, description: p.trim() }));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}

function arrayBufferToBase64(buffer) {
  // Chunked conversion — a byte-at-a-time loop burns enough CPU on multi-MB
  // photos to risk hitting the Worker CPU limit, which surfaces as a hard
  // connection failure in the browser rather than a readable error.
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary  = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
