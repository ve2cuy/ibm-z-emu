// Gestionnaire de volumes, machine arrêtée : ouvre le volume dans l'OPFS (accès synchrone,
// le temps d'une opération), fait l'opération avec le module wasm (crates/mvsvol) et
// referme. Machine en marche, c'est worker.js qui répond (lecture seule), car lui seul tient
// alors les images.
//
// Message reçu : {id, file, op, dsn, member, limit} (lecture : info, datasets, members,
// text, raw) ou {id, file, op: 'write', wop, dsn, member, text, to, user, changed, stamp}
// (écriture directe : save, savebin {bin}, delete, rename). Avec {blob} (File choisi sur
// le disque) : lecture seule, par FileReaderSync, sans copie; {shadows} : ses fichiers
// d'ombre de Hercules, dans l'ordre de création, posés dessus; {overlay} : l'ombre de la page
// (dossier shadow de l'OPFS) d'un volume lu sur place, où vont les écritures. Réponse : {id, ok, result} ou
// {id, ok: false, error} (« code|détail »). {id, op: 'blank', devtype, cyls, volser} : image
// d'un volume vierge (Uint8Array). {id, op: 'shadow', name} : l'ombre de la page
// shadow/<name> convertie en ombre de Hercules (Uint8Array). {id, op: 'newtape', volser,
// owner} : bande vierge avec étiquettes standard (AWS).

import init, { VolumeImage, blank_volume, labeled_tape, overlay_shadow } from './pkg/ibmz_web.js?v=a613348a';

const version = new URL(import.meta.url).search; // ?v=… transmis par la page
let ready = null;

/** Image dans l'OPFS (accès synchrone). */
function opfsDisk(h) {
  return {
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
    write(off, buf) {
      try {
        let done = 0;
        while (done < buf.length) done += h.write(buf.subarray(done), { at: off + done });
        return true;
      } catch {
        return false;
      }
    },
    size: () => h.getSize(),
    flush() { try { h.flush(); } catch { /* rien */ } },
  };
}

/** Image lue dans un File (volume du disque de l'usager), en lecture seule. */
function blobDisk(blob) {
  const reader = new FileReaderSync();
  return {
    read(off, buf) {
      try {
        const ab = reader.readAsArrayBuffer(blob.slice(off, off + buf.length));
        if (ab.byteLength !== buf.length) return false;
        buf.set(new Uint8Array(ab));
        return true;
      } catch {
        return false;
      }
    },
    write: () => false,
    size: () => blob.size,
    flush() { /* rien */ },
  };
}

self.onmessage = async ({ data }) => {
  let h = null;
  let vol = null;
  try {
    ready ??= init(new URL(`./pkg/ibmz_web_bg.wasm${version}`, import.meta.url));
    await ready;
    // Ombre de la page (dossier shadow de l'OPFS) en ombre de Hercules : {name}.
    if (data.op === 'shadow') {
      const root = await navigator.storage.getDirectory();
      const f = await (await (await root.getDirectoryHandle('shadow')).getFileHandle(data.name)).getFile();
      const result = overlay_shadow(new Uint8Array(await f.arrayBuffer()));
      postMessage({ id: data.id, ok: true, result }, [result.buffer]);
      return;
    }
    // Bande vierge étiquetée : {volser, owner}.
    if (data.op === 'newtape') {
      const result = labeled_tape(data.volser, data.owner ?? '');
      postMessage({ id: data.id, ok: true, result }, [result.buffer]);
      return;
    }
    // Volume vierge : fabriqué en mémoire, rangé par la page (writeVolume).
    if (data.op === 'blank') {
      const result = blank_volume(data.devtype, data.cyls, data.volser);
      postMessage({ id: data.id, ok: true, result }, [result.buffer]);
      return;
    }
    if (data.blob) {
      if (data.op === 'write' && !data.overlay) throw new Error('readonly|');
      vol = new VolumeImage(blobDisk(data.blob));
      for (const s of data.shadows ?? []) vol.push_shadow(blobDisk(s));
      // Ombre de la page : lue si elle existe; créée pour une écriture.
      if (data.overlay) {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle('shadow', { create: true });
        const fh = await dir.getFileHandle(data.overlay, { create: data.op === 'write' }).catch(() => null);
        if (fh) {
          h = await fh.createSyncAccessHandle();
          vol = vol.with_overlay(opfsDisk(h));
        }
      }
    } else {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('dasd');
      const fh = await dir.getFileHandle(data.file);
      h = await fh.createSyncAccessHandle();
      vol = new VolumeImage(opfsDisk(h));
    }
    const { op, dsn = '', member = '', limit = 0 } = data;
    if (op === 'write') {
      const { wop, text = '', to = '', user = 'HERC01', changed = 0, stamp = [], bin = new Uint8Array(0) } = data;
      const result = JSON.parse(vol.write(wop, dsn, member, text, to, user, changed, new Uint16Array(stamp), bin));
      h?.flush();
      postMessage({ id: data.id, ok: true, result });
    } else if (op === 'raw') {
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
