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
