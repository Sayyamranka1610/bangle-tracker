// ─── Firebase REST API client ────────────────────────────────────────────────
// Phase 1 uses direct REST calls (no SDK, no API key needed for open RTDB rules)

const RTDB_BASE = 'https://bangle-tracker-default-rtdb.firebaseio.com';

type FBValue = unknown;

async function fbGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`${RTDB_BASE}/${path}.json`);
  if (!res.ok) throw new Error(`Firebase GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T | null>;
}

async function fbSet(path: string, value: FBValue): Promise<void> {
  const res = await fetch(`${RTDB_BASE}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`Firebase SET ${path} failed: ${res.status}`);
}

async function fbUpdate(path: string, value: Record<string, FBValue>): Promise<void> {
  const res = await fetch(`${RTDB_BASE}/${path}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`Firebase UPDATE ${path} failed: ${res.status}`);
}

async function fbDelete(path: string): Promise<void> {
  const res = await fetch(`${RTDB_BASE}/${path}.json`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Firebase DELETE ${path} failed: ${res.status}`);
}

// Streaming listener — Firebase Server-Sent Events
// Returns a cleanup function
function fbListen(path: string, onData: (data: FBValue) => void, onError?: (e: Event) => void): () => void {
  const es = new EventSource(`${RTDB_BASE}/${path}.json?accept=text/event-stream`);
  es.addEventListener('put', (e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data) as { path: string; data: FBValue };
      onData(msg.data);
    } catch {
      // ignore parse errors
    }
  });
  es.addEventListener('patch', (e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data) as { path: string; data: FBValue };
      onData(msg.data);
    } catch {
      // ignore
    }
  });
  if (onError) es.onerror = onError;
  return () => es.close();
}

export const db = { get: fbGet, set: fbSet, update: fbUpdate, delete: fbDelete, listen: fbListen };

// ─── Firebase paths ───────────────────────────────────────────────────────────
export const PATHS = {
  appData: 'appData',
  users: 'users',
  bangImages: 'bangImages',
  editLock: 'editLock',
  accessRequest: 'accessRequest',
} as const;
