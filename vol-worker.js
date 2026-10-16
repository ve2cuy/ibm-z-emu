// Gestionnaire de volumes, machine arrêtée : ouvre le volume dans l'OPFS (accès synchrone,
// le temps d'une opération), fait l'opération de lecture avec le module wasm (crates/mvsvol)
// et referme. Machine en marche, c'est worker.js qui répond, car lui seul tient les images.
//
// Message reçu : {id, file, op, dsn, member, limit}. Réponse : {id, ok, result} ou
// {id, ok: false, error} (« code|détail »).

import init, { VolumeImage } from './pkg/ibmz_web.js?v=088d4ad6';

const version = new URL(import.meta.url).search; // ?v=… transmis par la page
let ready = null;

self.onmessage = async ({ data }) => {
  let h = null;
  let vol = null;
  try {
    ready ??= init(new URL(`./pkg/ibmz_web_bg.wasm${version}`, import.meta.url));
    await ready;
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('dasd');
    const fh = await dir.getFileHandle(data.file);
    h = await fh.createSyncAccessHandle();
    vol = new VolumeImage({
      read(off, buf) {
        try {
          let done = 0;
          while (done < buf.length) {
            const n = h.read(buf.subarray(done), { at: off + done });
            if (n <= 0) break;
            done += n;
          }
          return done === buf.length;
        } catch {
          return false;
        }
      },
      write: () => false, // lecture seule (étape 1)
      size: () => h.getSize(),
      flush() {},
    });
    const { op, dsn = '', member = '', limit = 0 } = data;
    if (op === 'raw') {
      const result = vol.raw(dsn, member, limit);
      postMessage({ id: data.id, ok: true, result }, [result.buffer]);
    } else {
      postMessage({ id: data.id, ok: true, result: JSON.parse(vol.call(op, dsn, member, limit)) });
    }
  } catch (e) {
    postMessage({ id: data.id, ok: false, error: e?.message ?? String(e) });
  } finally {
    try { vol?.free(); } catch { /* rien */ }
    try { h?.close(); } catch { /* rien */ }
  }
};
