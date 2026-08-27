// ─── Cloudflare R2 image storage ─────────────────────────────────────────────

const R2_WORKER_URL = 'https://bt-image-upload.sayyamranka09.workers.dev';
const R2_UPLOAD_KEY = 'BT2026_sB9mK3xQpR7wN2vL5jH8cF4dA';

// Matches the real bt-image-upload Worker's contract exactly (bangle_v19.html's
// uploadToR2): POST JSON { data: base64DataUrl, type }, X-Upload-Key header,
// response { url }. The Worker only understands this shape — NOT multipart
// FormData, which is what this function used to send (would have failed
// against the real Worker; never actually wired into any UI, so never caught).
export async function uploadToR2(base64DataUrl: string): Promise<string> {
  const type = (base64DataUrl.split(';')[0] || '').replace('data:', '') || 'image/jpeg';
  const res = await fetch(R2_WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Upload-Key': R2_UPLOAD_KEY },
    body: JSON.stringify({ data: base64DataUrl, type }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 upload failed: ${res.status} ${text}`);
  }

  const json = await res.json() as { url?: string };
  if (!json.url) throw new Error('R2 upload succeeded but returned no URL');
  return json.url;
}

// Public base the Worker's uploads are actually served from (bypasses the
// Worker for reads — same constant Phase 1 hardcodes for both direct uploads
// and rclone-synced objects).
export const R2_PUBLIC_BASE = 'https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev';

export interface R2Object { key: string; uploaded?: number }

// Lists every object in the bucket via the Worker's `?action=list` endpoint
// (already deployed and live — used by Phase 1's syncLibraryFromR2()).
// Paginates using the Worker's cursor until exhausted.
export async function listR2Objects(): Promise<R2Object[]> {
  let all: R2Object[] = [];
  let cursor: string | null = null;
  do {
    const qs = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const res = await fetch(`${R2_WORKER_URL}?action=list&key=${encodeURIComponent(R2_UPLOAD_KEY)}${qs}`);
    if (!res.ok) throw new Error(`Worker returned ${res.status}`);
    const data = await res.json() as { objects?: R2Object[]; cursor?: string | null; error?: string };
    if (data.error) throw new Error(data.error);
    all = all.concat(data.objects ?? []);
    cursor = data.cursor ?? null;
  } while (cursor);
  return all;
}

// Compress an image to a thumbnail (for display / Firebase inline storage)
export async function compressImage(file: File, maxDimension = 400, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}
