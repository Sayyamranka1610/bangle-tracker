// ─── Cloudflare R2 image storage ─────────────────────────────────────────────

const R2_WORKER_URL = 'https://bt-image-upload.sayyamranka09.workers.dev';
const R2_UPLOAD_KEY = 'BT2026_sB9mK3xQpR7wN2vL5jH8cF4dA';
const R2_PUBLIC_URL = 'https://pub-0df3d745e87346ad8148f93b28cc4bac.r2.dev';

export function r2PublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}

export async function uploadToR2(file: File, key: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('key', key);

  const res = await fetch(R2_WORKER_URL, {
    method: 'POST',
    headers: { 'X-Upload-Key': R2_UPLOAD_KEY },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 upload failed: ${res.status} ${text}`);
  }

  return r2PublicUrl(key);
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
