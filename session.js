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

// Fichier de session (.ibmz) : la session suspendue avec ce qu'il faut pour la reprendre
// ailleurs (autre fureteur, autre appareil) ou plus tard (point de sauvegarde). « IBMZSESS »,
// version (4 octets), longueur de l'en-tête JSON (4 octets), l'en-tête (fichiers : dossier
// de l'OPFS, nom, taille), puis les fichiers à la suite : suspend/meta.json,
// suspend/machine.snap, les volumes de la machine (dasd), les ombres de la page des
// volumes lus sur place (shadow) et les bandes montées (tapes). Les fichiers du disque de
// l'usager (images et ombres de Hercules) n'y sont pas : ils doivent être là où la session
// est reprise.

const FILE_MAGIC = 'IBMZSESS';

/** Fichier de la session suspendue `meta` (Blob : les fichiers de l'OPFS y sont lus à la
 *  demande, sans copie en mémoire). */
export async function sessionFile(meta) {
  const root = await navigator.storage.getDirectory();
  const files = [];
  const parts = [];
  const add = async (dir, name) => {
    const f = await (await (await root.getDirectoryHandle(dir)).getFileHandle(name)).getFile();
    files.push({ dir, name, size: f.size });
    parts.push(f);
  };
  await add(DIR, 'meta.json');
  await add(DIR, 'machine.snap');
  for (const v of meta.cfg.volumes ?? []) await add('dasd', v.file);
  for (const m of meta.cfg.mounts ?? []) await add('shadow', m.overlay);
  for (const t of meta.tapes ?? []) await add('tapes', t.name);
  const head = new TextEncoder().encode(JSON.stringify({ format: 1, app: meta.app, date: meta.date, arch: meta.cfg.arch, files }));
  const pre = new Uint8Array(16);
  pre.set(new TextEncoder().encode(FILE_MAGIC));
  new DataView(pre.buffer).setUint32(8, 1);
  new DataView(pre.buffer).setUint32(12, head.length);
  return new Blob([pre, head, ...parts], { type: 'application/octet-stream' });
}

/** En-tête d'un fichier de session : {head, offset}; erreur « sessfile| » sinon. */
export async function sessionFileHead(file) {
  const pre = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const dv = new DataView(pre.buffer);
  if (new TextDecoder().decode(pre.slice(0, 8)) !== FILE_MAGIC || dv.getUint32(8) !== 1) throw new Error('sessfile|');
  const n = dv.getUint32(12);
  const head = JSON.parse(new TextDecoder().decode(await file.slice(16, 16 + n).arrayBuffer()));
  const total = head.files.reduce((s, f) => s + f.size, 16 + n);
  if (head.format !== 1 || total !== file.size) throw new Error('sessfile|');
  return { head, offset: 16 + n };
}

/**
 * Range les fichiers d'une session dans l'OPFS : la session actuelle est d'abord oubliée,
 * meta.json est écrit en dernier, avec les empreintes des fichiers de l'OPFS refaites
 * (dates de ce fureteur). `write(dir, name, stream, onBytes)` : écriture d'un fichier
 * (main.js, compatible avec Safari).
 */
export async function importSessionFile(file, { head, offset }, write, onBytes) {
  await dropSession();
  let at = offset;
  let metaText = null;
  for (const f of head.files) {
    const part = file.slice(at, at + f.size);
    at += f.size;
    if (f.dir === DIR && f.name === 'meta.json') {
      metaText = await part.text();
      continue;
    }
    await write(f.dir, f.name, part.stream(), onBytes);
  }
  const meta = JSON.parse(metaText);
  const root = await navigator.storage.getDirectory();
  for (const p of meta.prints ?? []) {
    const dir = { vol: 'dasd', overlay: 'shadow', tape: 'tapes' }[p.kind];
    if (!dir) continue;
    const f = await (await (await root.getDirectoryHandle(dir)).getFileHandle(p.name)).getFile();
    p.size = f.size;
    p.mod = f.lastModified;
  }
  await write(DIR, 'meta.json', new Blob([JSON.stringify(meta)]).stream());
  return meta;
}
