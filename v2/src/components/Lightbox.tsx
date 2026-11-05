import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LightboxContext } from './lightboxContext';

// One shared full-screen photo viewer for the whole app — click any photo
// anywhere and it opens here, with ‹ › to page through the rest of that
// set, a "2 / 5" counter, and Esc / arrow keys. Same behaviour as Phase 1's
// #lightbox (bangle_v19.html).
export default function LightboxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ images: string[]; idx: number } | null>(null);

  const open = useCallback((images: string[], start = 0) => {
    const list = images.filter(Boolean);
    if (!list.length) return;
    setState({ images: list, idx: Math.min(Math.max(start, 0), list.length - 1) });
  }, []);
  const api = useMemo(() => ({ open }), [open]);

  const close = useCallback(() => setState(null), []);
  const step = useCallback((d: number) => {
    setState(s => (s ? { ...s, idx: (s.idx + d + s.images.length) % s.images.length } : s));
  }, []);

  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, close, step]);

  const many = (state?.images.length ?? 0) > 1;

  return (
    <LightboxContext.Provider value={api}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[2000] bg-black/90 flex items-center justify-center" onClick={close}>
          <button onClick={close} aria-label="Close photo"
            className="fixed top-3.5 right-4 z-[2001] w-9 h-9 rounded-full bg-black/50 text-white text-xl flex items-center justify-center hover:bg-black/70">✕</button>
          {many && (
            <button onClick={e => { e.stopPropagation(); step(-1); }} aria-label="Previous photo"
              className="fixed left-3 top-1/2 -translate-y-1/2 z-[2001] w-10 h-10 rounded-full bg-black/50 text-white text-2xl flex items-center justify-center hover:bg-black/70">‹</button>
          )}
          <img src={state.images[state.idx]} alt="" onClick={e => e.stopPropagation()}
            className="max-w-[90vw] max-h-[88vh] rounded-xl object-contain" />
          {many && (
            <button onClick={e => { e.stopPropagation(); step(1); }} aria-label="Next photo"
              className="fixed right-3 top-1/2 -translate-y-1/2 z-[2001] w-10 h-10 rounded-full bg-black/50 text-white text-2xl flex items-center justify-center hover:bg-black/70">›</button>
          )}
          {many && (
            <div className="fixed bottom-3.5 left-1/2 -translate-x-1/2 z-[2001] text-xs text-white bg-black/55 px-3 py-1 rounded-full">
              {state.idx + 1} / {state.images.length}
            </div>
          )}
        </div>
      )}
    </LightboxContext.Provider>
  );
}
