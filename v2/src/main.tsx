import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App.tsx';

// Sentry is initialized via the loader script in index.html (same mechanism
// bangle_v19.html uses) — see the comment there for why.

// Auto-update SW — silently refreshes when a new version is deployed
registerSW({ onNeedRefresh() {}, onOfflineReady() {} });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
