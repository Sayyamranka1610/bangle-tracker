/**
 * Bangle Design Search Worker
 * Simplified role: serves embeddings.json from R2 with CORS headers.
 * All CLIP inference and similarity search now runs in the browser.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
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

    // Serve embeddings index from R2
    if (url.pathname === "/embeddings") {
      try {
        const obj = await env.BUCKET.get("_search_index/embeddings.json");
        if (!obj) {
          return new Response(JSON.stringify({ error: "Index not ready. Run the indexer first." }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(obj.body, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Bangle Search API — GET /embeddings", { headers: corsHeaders });
  },
};
