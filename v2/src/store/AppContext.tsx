import { createContext, useContext, useReducer, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { db, PATHS, fetchAppData, pushAppData, listenAppData } from '../lib/firebase';
import type { AppData, Session, EditLock } from '../types';
import DestructiveSaveModal from '../components/DestructiveSaveModal';

const LOCK_EXPIRE_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;
const PUSH_DEBOUNCE_MS = 2000; // matches Phase 1 fbSchedulePush
const REMOTE_COUNTS_KEY = 'bt_last_remote_counts_v2';

// ─── State ────────────────────────────────────────────────────────────────────

interface AppState {
  session: Session | null;
  data: AppData;
  syncStatus: 'idle' | 'syncing' | 'error';
  hasLock: boolean;
  toasts: Toast[];
  destructiveConfirm: { remote: RemoteCounts; local: RemoteCounts } | null;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const initialState: AppState = {
  session: null,
  data: {},
  syncStatus: 'idle',
  hasLock: false,
  toasts: [],
  destructiveConfirm: null,
};

// ─── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_SESSION'; payload: Session | null }
  | { type: 'SET_DATA'; payload: AppData }
  | { type: 'SET_SYNC_STATUS'; payload: AppState['syncStatus'] }
  | { type: 'SET_HAS_LOCK'; payload: boolean }
  | { type: 'ADD_TOAST'; payload: Toast }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'SET_DESTRUCTIVE_CONFIRM'; payload: AppState['destructiveConfirm'] };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SESSION':   return { ...state, session: action.payload };
    case 'SET_DATA':      return { ...state, data: action.payload };
    case 'SET_SYNC_STATUS': return { ...state, syncStatus: action.payload };
    case 'SET_HAS_LOCK':  return { ...state, hasLock: action.payload };
    case 'ADD_TOAST':     return { ...state, toasts: [...state.toasts, action.payload] };
    case 'REMOVE_TOAST':  return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
    case 'SET_DESTRUCTIVE_CONFIRM': return { ...state, destructiveConfirm: action.payload };
    default:              return state;
  }
}

// ─── Anti-data-loss guard (mirrors Phase 1's _looksLikeAccidentalWipe) ───────
// Added after a real incident (Aug 6 2026) where a stale/empty state got
// pushed to Firebase and silently wiped 68 customer orders + 105 vendor
// orders. Deleting one or two orders is normal; losing a large chunk at once
// is not — block that and make the caller reload instead of trusting it.

interface RemoteCounts { orders: number; vendorOrders: number }

function looksLikeAccidentalWipe(remote: RemoteCounts | null, local: RemoteCounts): boolean {
  if (!remote) return false;
  const drop = (r: number, l: number) => r > 0 && (r - l) > 0 && ((r - l) >= 5 || (r - l) >= r * 0.2);
  return drop(remote.orders, local.orders) || drop(remote.vendorOrders, local.vendorOrders);
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  login: (username: string, password: string) => Promise<boolean>;
  devLogin: () => void;
  logout: () => void;
  showToast: (message: string, type?: Toast['type']) => void;
  // Merges `patch` into the current appData, updates the UI immediately, and
  // pushes the WHOLE state to Firebase as one unit (Phase 1 has no concept of
  // partial appData writes — see lib/firebase.ts). `immediate` skips the 2s
  // debounce for structural changes (create/delete), matching fbPushNow().
  saveAppData: (patch: Partial<AppData>, opts?: { immediate?: boolean }) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, () => {
    // Restore session from sessionStorage on load
    const raw = sessionStorage.getItem('bt_auth_v2');
    if (raw) {
      try { return { ...initialState, session: JSON.parse(raw) as Session }; }
      catch { /* ignore */ }
    }
    return initialState;
  });

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopListenRef = useRef<(() => void) | null>(null);

  // Always-current copy of appData — pushes read this, not React state, so a
  // push scheduled a moment ago still includes changes made after it was queued.
  const dataRef = useRef<AppData>(state.data);
  useEffect(() => { dataRef.current = state.data; }, [state.data]);

  // True whenever there are local edits Firebase doesn't have yet. Blocks
  // incoming remote snapshots from clobbering them (Phase 1's `pendingLocal`).
  const pendingLocalRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRemoteCountsRef = useRef<RemoteCounts | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REMOTE_COUNTS_KEY);
      if (raw) lastRemoteCountsRef.current = JSON.parse(raw) as RemoteCounts;
    } catch { /* ignore */ }
  }, []);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    dispatch({ type: 'ADD_TOAST', payload: { id, message, type } });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), 4000);
  }, []);

  const rememberRemoteCounts = useCallback((counts: RemoteCounts) => {
    lastRemoteCountsRef.current = counts;
    try { localStorage.setItem(REMOTE_COUNTS_KEY, JSON.stringify(counts)); } catch { /* ignore */ }
  }, []);

  // Mirrors Phase 1's _confirmDestructiveSave — a real two-button dialog, not
  // just a block+toast. resolveDestructiveConfirm is called by the modal.
  const destructiveResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const confirmDestructiveSave = useCallback((remote: RemoteCounts, local: RemoteCounts): Promise<boolean> => {
    return new Promise(resolve => {
      destructiveResolveRef.current = resolve;
      dispatch({ type: 'SET_DESTRUCTIVE_CONFIRM', payload: { remote, local } });
    });
  }, []);
  const resolveDestructiveConfirm = useCallback((ok: boolean) => {
    destructiveResolveRef.current?.(ok);
    destructiveResolveRef.current = null;
    dispatch({ type: 'SET_DESTRUCTIVE_CONFIRM', payload: null });
  }, []);

  // ── Auth ──

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    // Phase 1 stores users as an array [{id, username, password, role, createdAt}]
    // Firebase may return it as an array or as an object with numeric keys — handle both
    const raw = await db.get<unknown>(PATHS.users);
    const usersArr: Array<{ username: string; password: string; role: string }> = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object'
        ? Object.values(raw as Record<string, { username: string; password: string; role: string }>)
        : [];
    const userRecord = usersArr.find(u => u.username === username);
    if (!userRecord || userRecord.password !== password) return false;

    const deviceId = sessionStorage.getItem('bt_did_v2') ?? (() => {
      const id = crypto.randomUUID();
      sessionStorage.setItem('bt_did_v2', id);
      return id;
    })();

    const session: Session = {
      username,
      role: userRecord.role as Session['role'],
      token: crypto.randomUUID(),
      deviceId,
    };
    sessionStorage.setItem('bt_auth_v2', JSON.stringify(session));
    dispatch({ type: 'SET_SESSION', payload: session });
    return true;
  }, []);

  // Dev-only: skip real login so the app can be clicked through locally without
  // credentials. Read-only ('worker') so it never takes the production edit lock.
  const devLogin = useCallback(() => {
    const deviceId = sessionStorage.getItem('bt_did_v2') ?? (() => {
      const id = crypto.randomUUID();
      sessionStorage.setItem('bt_did_v2', id);
      return id;
    })();
    const session: Session = {
      username: 'dev-preview',
      role: 'worker',
      token: crypto.randomUUID(),
      deviceId,
    };
    sessionStorage.setItem('bt_auth_v2', JSON.stringify(session));
    dispatch({ type: 'SET_SESSION', payload: session });
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('bt_auth_v2');
    dispatch({ type: 'SET_SESSION', payload: null });
    dispatch({ type: 'SET_HAS_LOCK', payload: false });
  }, []);

  // ── Edit lock ──

  const acquireLock = useCallback(async (session: Session) => {
    const lock = await db.get<EditLock>(PATHS.editLock);
    const now = Date.now();
    if (lock && lock.deviceId !== session.deviceId && now - lock.at < LOCK_EXPIRE_MS) {
      return false; // locked by someone else
    }
    await db.set(PATHS.editLock, { deviceId: session.deviceId, username: session.username, at: now });
    dispatch({ type: 'SET_HAS_LOCK', payload: true });
    return true;
  }, []);

  const heartbeat = useCallback(async (_session: Session) => {
    try {
      await db.update(PATHS.editLock, { at: Date.now() });
    } catch {
      dispatch({ type: 'SET_HAS_LOCK', payload: false });
    }
  }, []);

  // ── appData push (mirrors Phase 1 fbPush) ─────────────────────────────────

  const doPush = useCallback(async (session: Session) => {
    if (pushTimerRef.current) { clearTimeout(pushTimerRef.current); pushTimerRef.current = null; }
    const current = dataRef.current;
    const localCounts: RemoteCounts = {
      orders: (current.orders ?? []).length,
      vendorOrders: (current.vendorOrders ?? []).length,
    };
    if (lastRemoteCountsRef.current && looksLikeAccidentalWipe(lastRemoteCountsRef.current, localCounts)) {
      const ok = await confirmDestructiveSave(lastRemoteCountsRef.current, localCounts);
      if (!ok) {
        showToast('Save blocked to protect your data. Press Redo or reload the page.', 'error');
        return;
      }
    }
    try {
      await pushAppData(current, session.deviceId);
      pendingLocalRef.current = false;
      rememberRemoteCounts(localCounts);
    } catch {
      showToast('Save failed — will retry automatically in 30s', 'error');
      if (!pushTimerRef.current) {
        pushTimerRef.current = setTimeout(() => { pushTimerRef.current = null; doPush(session); }, 30000);
      }
    }
  }, [showToast, rememberRemoteCounts, confirmDestructiveSave]);

  const saveAppData = useCallback(async (patch: Partial<AppData>, opts?: { immediate?: boolean }) => {
    if (!state.session) return;
    if (!state.hasLock) {
      showToast('Cannot save — edit lock not held', 'error');
      return;
    }
    const next = { ...dataRef.current, ...patch };
    dataRef.current = next;
    dispatch({ type: 'SET_DATA', payload: next });
    pendingLocalRef.current = true;

    if (opts?.immediate) {
      if (pushTimerRef.current) { clearTimeout(pushTimerRef.current); pushTimerRef.current = null; }
      await doPush(state.session);
    } else if (!pushTimerRef.current) {
      pushTimerRef.current = setTimeout(() => { pushTimerRef.current = null; doPush(state.session!); }, PUSH_DEBOUNCE_MS);
    }
    // if a debounce timer is already queued, it will pick up this change too —
    // doPush always reads dataRef.current live, matching Phase 1's fbSchedulePush.
  }, [state.session, state.hasLock, doPush, showToast]);

  // ── Firebase sync ──

  const startSync = useCallback(async (session: Session) => {
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });

    // Step 1 — GET data immediately so the UI populates without waiting for SSE
    try {
      const { data } = await fetchAppData<AppData>();
      const initial = data ?? {};
      dataRef.current = initial;
      dispatch({ type: 'SET_DATA', payload: initial });
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' });
      rememberRemoteCounts({
        orders: (initial.orders ?? []).length,
        vendorOrders: (initial.vendorOrders ?? []).length,
      });
    } catch {
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    }

    // Step 2 — Edit lock (owners only)
    if (session.role === 'owner') {
      acquireLock(session).then(got => {
        if (!got) showToast('Another session is editing. You can view but not save.', 'info');
      });
      heartbeatRef.current = setInterval(() => heartbeat(session), HEARTBEAT_MS);
    }

    // Step 3 — SSE listener for real-time updates from other devices
    const stop = listenAppData<AppData>((remoteData, _savedAt, device) => {
      if (device === session.deviceId) return;      // our own update echoed back — ignore
      if (pendingLocalRef.current) return;           // protect unpushed local edits
      const next = remoteData ?? {};
      dataRef.current = next;
      dispatch({ type: 'SET_DATA', payload: next });
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' });
    }, () => {
      // SSE error is non-fatal — we already have data from the GET above
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    });
    stopListenRef.current = stop;
  }, [acquireLock, heartbeat, showToast, rememberRemoteCounts]);

  const stopSync = useCallback(() => {
    stopListenRef.current?.();
    stopListenRef.current = null;
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // ── Lifecycle ──

  useEffect(() => {
    if (state.session) {
      startSync(state.session);
    } else {
      stopSync();
    }
    return stopSync;
  }, [state.session]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppContext.Provider value={{ state, dispatch, login, devLogin, logout, showToast, saveAppData }}>
      {children}
      {state.destructiveConfirm && (
        <DestructiveSaveModal
          remote={state.destructiveConfirm.remote}
          local={state.destructiveConfirm.local}
          onResolve={resolveDestructiveConfirm}
        />
      )}
    </AppContext.Provider>
  );
}
