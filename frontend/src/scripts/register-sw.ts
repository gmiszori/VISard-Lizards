// Registers the offline-capable service worker (public/sw.js). Production builds only: in `astro dev` a
// worker would keep serving old files. Needs https or localhost; anywhere else the app just works online.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.warn('[campuseats] The offline cache is not available:', (error as Error).message);
    });
  });
}
