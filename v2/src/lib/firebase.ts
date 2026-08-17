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
// NOTE: appData is intentionally NOT a plain object path. See appDataSync below.
export const PATHS = {
  users: 'users',
  bangImages: 'bangImages',
  editLock: 'editLock',
  accessRequest: 'accessRequest',
} as const;

// ─── appData sync — mirrors Phase 1's fbInit/fbPush exactly ─────────────────
// Phase 1 stores the ENTIRE app state as one JSON string at /appData, wrapped
// in an envelope: { data: "<json string>", savedAt: ISO, device: deviceId }.
// This is deliberate (see bangle_v19.html ~L15067): it keeps Firebase from
// ever seeing "/" characters inside real data as path separators. Reading or
// writing individual sub-fields (e.g. /appData/orders) does NOT work against
// real production data — the whole envelope must be read/written as a unit.

const FB_DATA = `${RTDB_BASE}/appData.json`;

export interface AppDataEnvelope<T> {
  data: T | null;
  savedAt?: string;
  device?: string;
}

export async function fetchAppData<T>(): Promise<AppDataEnvelope<T>> {
  const res = await fetch(FB_DATA);
  if (!res.ok) throw new Error(`Firebase GET appData failed: ${res.status}`);
  const envelope = await res.json() as { data?: string; savedAt?: string; device?: string } | null;
  if (!envelope || !envelope.data) return { data: null };
  const parsed = JSON.parse(envelope.data) as T;
  return { data: parsed, savedAt: envelope.savedAt, device: envelope.device };
}

export async function pushAppData<T>(data: T, deviceId: string): Promise<void> {
  const payload = {
    data: JSON.stringify(data),
    savedAt: new Date().toISOString(),
    device: deviceId,
  };
  const res = await fetch(FB_DATA, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Firebase PUT appData failed: ${res.status}`);
}

// Real-time listener — fires with the parsed inner data plus the originating
// device id (so the caller can skip self-echoes, matching Phase 1).
export function listenAppData<T>(
  onData: (data: T, savedAt: string | undefined, device: string | undefined) => void,
  onError?: (e: Event) => void,
): () => void {
  const es = new EventSource(FB_DATA);
  es.addEventListener('put', (e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data) as { path: string; data: { data?: string; savedAt?: string; device?: string } | null };
      const envelope = msg.data;
      if (!envelope || !envelope.data) return;
      const parsed = JSON.parse(envelope.data) as T;
      onData(parsed, envelope.savedAt, envelope.device);
    } catch {
      // ignore malformed events
    }
  });
  if (onError) es.onerror = onError;
  return () => es.close();
}
