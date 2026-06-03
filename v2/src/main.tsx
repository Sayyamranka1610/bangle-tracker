import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import * as Sentry from '@sentry/react';
import './index.css';
import App from './App.tsx';

Sentry.init({
  dsn: 'https://2eff06b58f70c74c61f1f836e45381a2@o0.ingest.sentry.io/0',
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.2,
});

// Auto-update SW — silently refreshes when a new version is deployed
registerSW({ onNeedRefresh() {}, onOfflineReady() {} });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
