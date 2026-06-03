import { createContext, useContext, useReducer, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { db, PATHS } from '../lib/firebase';
import type { AppData, Session, EditLock } from '../types';

const LOCK_EXPIRE_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

// ─── State ────────────────────────────────────────────────────────────────────

interface AppState {
  session: Session | null;
  data: AppData;
  syncStatus: 'idle' | 'syncing' | 'error';
  hasLock: boolean;
  toasts: Toast[];
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
};

// ─── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_SESSION'; payload: Session | null }
  | { type: 'SET_DATA'; payload: AppData }
  | { type: 'SET_SYNC_STATUS'; payload: AppState['syncStatus'] }
  | { type: 'SET_HAS_LOCK'; payload: boolean }
  | { type: 'ADD_TOAST'; payload: Toast }
  | { type: 'REMOVE_TOAST'; payload: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SESSION':   return { ...state, session: action.payload };
    case 'SET_DATA':      return { ...state, data: action.payload };
    case 'SET_SYNC_STATUS': return { ...state, syncStatus: action.payload };
    case 'SET_HAS_LOCK':  return { ...state, hasLock: action.payload };
    case 'ADD_TOAST':     return { ...state, toasts: [...state.toasts, action.payload] };
    case 'REMOVE_TOAST':  return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
    default:              return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  showToast: (message: string, type?: Toast['type']) => void;
  saveData: (patch: Partial<AppData>) => Promise<void>;
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

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    dispatch({ type: 'ADD_TOAST', payload: { id, message, type } });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), 4000);
  }, []);

  // ── Auth ──

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    const users = await db.get<Record<string, { password: string; role: string }>>(PATHS.users);
    const userRecord = users?.[username];
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

  // ── Firebase sync ──

  const startSync = useCallback((session: Session) => {
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });

    if (session.role === 'owner') {
      acquireLock(session).then(got => {
        if (!got) showToast('Another session is editing. You can view but not save.', 'info');
      });
      heartbeatRef.current = setInterval(() => heartbeat(session), HEARTBEAT_MS);
    }

    const stop = db.listen(PATHS.appData, (rawData) => {
      dispatch({ type: 'SET_DATA', payload: (rawData as AppData) ?? {} });
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' });
    }, () => {
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    });
    stopListenRef.current = stop;
  }, [acquireLock, heartbeat, showToast]);

  const stopSync = useCallback(() => {
    stopListenRef.current?.();
    stopListenRef.current = null;
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // ── Data save ──

  const saveData = useCallback(async (patch: Partial<AppData>) => {
    if (!state.hasLock) {
      showToast('Cannot save — edit lock not held', 'error');
      return;
    }
    await db.update(PATHS.appData, patch as Record<string, unknown>);
  }, [state.hasLock, showToast]);

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
    <AppContext.Provider value={{ state, dispatch, login, logout, showToast, saveData }}>
      {children}
    </AppContext.Provider>
  );
}
