import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const isNativeRuntime =
  Boolean(
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  ) ||
  window.location.protocol === 'file:' ||
  window.location.protocol === 'capacitor:';

if (!isNativeRuntime && 'serviceWorker' in navigator) {
  // Register quietly and let updates apply cleanly on next natural navigation without disrupting playback
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        reg.update().catch(() => {});
      })
      .catch(() => {
        // Service worker registration optional in dev
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
