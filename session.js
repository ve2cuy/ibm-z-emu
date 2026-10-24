// Session suspendue (mise en veille) : dossier « suspend » de l'OPFS. machine.snap :
// l'état de la machine (flux de machine::snap, comprimé par zlib : CompressionStream
// « deflate »), écrit par worker.js; meta.json, écrit en dernier (sans lui, la session
// n'existe pas) : date, version de la page, configuration de la machine, empreintes des
// volumes (taille, date de modification), console et imprimantes de la page.

const DIR = 'suspend';

async function dir(create = false) {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create });
}

/** Description de la session suspendue, ou null. */
export async function readSession() {
  try {
    const f = await (await (await dir()).getFileHandle('meta.json')).getFile();
    const meta = JSON.parse(await f.text());
    return meta?.format === 1 ? meta : null;
  } catch {
    return null;
  }
}

/** Oublie la session suspendue (reprise faite, IPL, volumes effacés). */
export async function dropSession() {
  try {
    const d = await dir();
    await d.removeEntry('meta.json').catch(() => {});
    await d.removeEntry('machine.snap').catch(() => {});
  } catch { /* pas de session */ }
}
