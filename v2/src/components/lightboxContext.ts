import { createContext, useContext } from 'react';

// Opens the full-screen photo viewer. `images` is the list to page through
// (best-quality source first), `start` is which one to show first. Mirrors
// Phase 1's openLbDirect / openDesignImgsLb / openVarietyImgsLb, which all
// funnel into one shared lightbox.
export interface LightboxApi {
  open: (images: string[], start?: number) => void;
}

export const LightboxContext = createContext<LightboxApi>({ open: () => {} });

export function useLightbox(): LightboxApi {
  return useContext(LightboxContext);
}
