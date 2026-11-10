/**
 * Service worker registration. The service worker caches the whole game so it runs offline.
 * When a new version is deployed, we show an "Update ready" button instead of reloading by
 * ourselves, so an update can never interrupt a mission.
 */
import { registerSW } from 'virtual:pwa-register';

export const pwaStatus = {
  offlineReady: false,
  swSupported: 'serviceWorker' in navigator,
};

export function setupPwa(): void {
  if (!pwaStatus.swSupported) return;
  const toast = document.getElementById('update-toast') as HTMLButtonElement | null;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (toast) toast.style.display = 'block';
    },
    onOfflineReady() {
      pwaStatus.offlineReady = true;
    },
    onRegisteredSW(_url, registration) {
      // An already-installed worker means the game is cached and ready to run offline.
      if (registration?.active) pwaStatus.offlineReady = true;
      // Check for new versions whenever the app returns to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration?.update().catch(() => {});
      });
    },
  });
  toast?.addEventListener('click', () => {
    toast.textContent = 'Updating…';
    void updateSW(true);
  });
}
