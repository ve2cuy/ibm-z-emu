// Isolement de la page (COOP et COEP), que GitHub Pages ne permet pas d'envoyer : ce
// service worker ajoute les deux en-têtes aux réponses du site. La page isolée a la
// mémoire partagée (SharedArrayBuffer) : un fil par processeur pour la machine
// z/Architecture. Les ressources d'autres sites (dépôt de fichiers) passent par CORS,
// permis dans une page isolée; elles ne sont pas touchées.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (new URL(req.url).origin !== self.location.origin) return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  e.respondWith(fetch(req).then((res) => {
    if (res.status === 0) return res;
    const headers = new Headers(res.headers);
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }));
});
