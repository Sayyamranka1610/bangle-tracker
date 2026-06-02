// ═══════════════════════════════════════════════════════════════════════════
// Siddhi Bangle Tracker — R2 Image Upload Worker
// ═══════════════════════════════════════════════════════════════════════════
// This Cloudflare Worker receives an image from the browser app,
// stores it in R2 (the photo warehouse), and returns the public URL.
//
// Environment variables required (set in Worker Settings → Variables):
//   UPLOAD_KEY  — a secret password to prevent strangers from uploading
//   PUBLIC_URL  — the public R2 URL, e.g. https://pub-xxx.r2.dev
//
// R2 bucket binding required (set in Worker Settings → Bindings):
//   Variable name: BUCKET
//   R2 bucket: bangle-tracker-images
// ═══════════════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {

    // Allow the browser app to call this Worker from any domain
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Key',
    };

    // Handle the browser's pre-flight check
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    // Check the secret upload key — rejects anyone who doesn't know it
    const key = request.headers.get('X-Upload-Key');
    if (!env.UPLOAD_KEY || key !== env.UPLOAD_KEY) {
      return new Response('Unauthorized', { status: 401, headers: cors });
    }

    try {
      // Read the image data sent from the app (base64 format)
      const { data, type } = await request.json();

      // Convert base64 text back into actual image binary data
      const base64 = data.includes(',') ? data.split(',')[1] : data;
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // Create a unique filename using timestamp + random characters
      const ext = (type || '').includes('png') ? 'png' : 'jpg';
      const objectKey = `bt/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

      // Save the image to R2
      await env.BUCKET.put(objectKey, bytes.buffer, {
        httpMetadata: { contentType: type || 'image/jpeg' }
      });

      // Send back the public URL where the image can be viewed
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
