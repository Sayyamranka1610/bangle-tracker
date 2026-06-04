// ═══════════════════════════════════════════════════════════════════════════
// Siddhi Bangle Tracker — R2 Image Upload + List Worker
// ═══════════════════════════════════════════════════════════════════════════
// Endpoints:
//   POST /           — upload one image (existing behaviour, unchanged)
//   GET  /?action=list&key=... — list objects in bucket for app sync
//   GET  /?action=list&key=...&cursor=... — paginated listing
//
// Environment variables (set in Cloudflare Worker Settings → Variables):
//   UPLOAD_KEY  — secret key shared with the app
//   PUBLIC_URL  — e.g. https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev
//
// R2 bucket binding (Worker Settings → Bindings):
//   Variable name: BUCKET  →  bangle-tracker-images
// ═══════════════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Key',
    };

    // Pre-flight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // ── GET: list bucket objects (for "Sync from R2" in the app) ─────────────
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const action = url.searchParams.get('action');
      const key    = url.searchParams.get('key');

      if (action !== 'list') {
        return new Response('Not found', { status: 404, headers: cors });
      }
      if (!env.UPLOAD_KEY || key !== env.UPLOAD_KEY) {
        return new Response('Unauthorized', { status: 401, headers: cors });
      }

      try {
        const prefix = url.searchParams.get('prefix') || '';
        const cursor = url.searchParams.get('cursor') || undefined;

        const listed = await env.BUCKET.list({
          prefix,
          cursor,
          limit: 1000,          // max per page
        });

        const objects = listed.objects.map(o => ({
          key:      o.key,
          size:     o.size,
          uploaded: o.uploaded,
        }));

        return new Response(
          JSON.stringify({
            objects,
            truncated: listed.truncated,
            cursor:    listed.truncated ? listed.cursor : null,
          }),
          { headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err.message }),
          { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ── POST: upload one image (original behaviour — completely unchanged) ────
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    const key = request.headers.get('X-Upload-Key');
    if (!env.UPLOAD_KEY || key !== env.UPLOAD_KEY) {
      return new Response('Unauthorized', { status: 401, headers: cors });
    }

    try {
      const { data, type } = await request.json();

      const base64 = data.includes(',') ? data.split(',')[1] : data;
      const binary = atob(base64);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const ext       = (type || '').includes('png') ? 'png' : 'jpg';
      const objectKey = `bt/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

      await env.BUCKET.put(objectKey, bytes.buffer, {
        httpMetadata: { contentType: type || 'image/jpeg' }
      });

      const url = `${env.PUBLIC_URL}/${objectKey}`;
      return new Response(
        JSON.stringify({ url }),
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      );

    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }
  }
};
