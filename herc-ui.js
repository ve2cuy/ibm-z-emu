// Configuration de la machine au format de Hercules (menu Machine) : import d'un fichier
// .cnf (unités, mémoire, volumes placés à leurs adresses), export de la configuration de la
// page, retour à la configuration de TK5. Lecture et écriture : herc-conf.js.
//
// Règle de la page : l'extension du nom d'un volume est son adresse (tk5res.390). À
// l'import, un volume déjà présent sous le même nom à une autre adresse est renommé; un
// volume absent est demandé (fichiers choisis par l'usager), puis copié sous le bon nom,
// ou bien lu sur place : l'image de Hercules et ses ombres restent sur le disque de
// l'usager (lecture seule, sans copie), les écritures vont dans une ombre de la page
// (OPFS, dossier shadow). Les fichiers lus sur place ne se gardent que le temps de la
// visite (mounts); la liste des volumes, elle, est gardée (prefs.mounts).
//
// Dossier de Hercules (Chrome, Edge : showDirectoryPicker) : la configuration, les volumes
// et leurs ombres y sont trouvés d'après les chemins du fichier (relatifs à son dossier ou
// à l'un de ses parents, comme sous Hercules lancé du dossier choisi). L'accès au dossier
// est gardé (IndexedDB) et redemandé d'un clic à la visite suivante.

import { t } from './i18n.js?v=79b0042a';
import { TK5_DEVICES, Z_DEVICES, buildConfig, parseConfig, volumeStem } from './herc-conf.js?v=79b0042a';

let ctx = null; // { prefs, savePrefs, volumes(), running(), volDir(), writeVolume(), renderVolumes(), version, status() }
let plan = null;

/** Volumes lus sur place, pour cette visite : adresse -> {stem, file, shadows: [File]}. */
export const mounts = new Map();

/** Volumes lus sur place dont les fichiers restent à choisir (nouvelle visite). */
export function mountsMissing() {
  return (ctx.prefs.mounts ?? []).filter((m) => !mounts.has(m.addr));
}

// ------------------------------------------------------------------ dossier de Hercules

const dirOk = typeof window.showDirectoryPicker === 'function';
let hercDir = null;    // FileSystemDirectoryHandle choisi
let cnfList = [];      // [{path: ['cckd'], file: File}] : configurations du dossier
let pickForPlan = false; // champ « dossier » ouvert depuis le dialogue d'import

function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('ibmz', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('handles');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function saveDir(h) {
  try {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(h, 'herc-dir');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* stockage indisponible : le dossier sera redemandé */ }
}

async function loadDir() {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const r = db.transaction('handles').objectStore('handles').get('herc-dir');
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Dossier au chemin `parts` (['cckd']) depuis le dossier choisi. */
async function dirAt(parts) {
  let d = hercDir;
  for (const p of parts) d = await d.getDirectoryHandle(p);
  return d;
}

const splitPath = (p) => p.replace(/\\/g, '/').split('/').filter((x) => x && x !== '.');

/** Fichier d'un chemin de la configuration : relatif à son dossier, sinon à un parent;
 *  enfin sans ses premiers dossiers (le dossier choisi est celui des volumes). */
async function resolveFile(rel, cnfPath) {
  const parts = splitPath(rel);
  const tries = [];
  for (let k = cnfPath.length; k >= 0; k--) tries.push([...cnfPath.slice(0, k), ...parts]);
  for (let d = 1; d < parts.length; d++) tries.push(parts.slice(d));
  for (const at of tries) {
    try {
      const fh = await (await dirAt(at.slice(0, -1))).getFileHandle(at[at.length - 1]);
      return { file: await fh.getFile(), path: at.join('/') };
    } catch { /* essai suivant */ }
  }
  return null;
}

/** Ombres d'un motif sf= (shadow/zares1_*) : fichiers « zares1_<rang> », dans l'ordre. */
async function resolveShadows(pattern, cnfPath) {
  const parts = splitPath(pattern);
  const prefix = (parts.pop() ?? '').replace(/\*.*$/, '');
  for (let k = cnfPath.length; k >= 0; k--) {
    try {
      const at = [...cnfPath.slice(0, k), ...parts];
      const d = await dirAt(at);
      const found = [];
      for await (const [name, h] of d.entries()) {
        const rest = name.slice(prefix.length);
        if (h.kind === 'file' && name.startsWith(prefix) && /^\d+$/.test(rest)) {
          found.push({ n: Number(rest), file: await h.getFile(), path: [...at, name].join('/') });
        }
      }
      if (found.length) return found.sort((a, b) => a.n - b.n);
    } catch { /* essai suivant */ }
  }
  return [];
}

/** Configurations (.cnf, .conf) du dossier et de ses sous-dossiers directs. */
async function findConfigs() {
  const out = [];
  const scan = async (d, path) => {
    for await (const [name, h] of d.entries()) {
      if (h.kind === 'file' && /\.(cnf|conf)$/i.test(name)) out.push({ path, file: await h.getFile() });
      else if (h.kind === 'directory' && !path.length) await scan(h, [name]);
    }
  };
  await scan(hercDir, []);
  // hercules.cnf d'abord, puis les autres par nom.
  return out.sort((a, b) => (b.file.name.toLowerCase() === 'hercules.cnf') - (a.file.name.toLowerCase() === 'hercules.cnf')
    || a.file.name.localeCompare(b.file.name));
}

/** Volumes absents du plan : trouvés dans le dossier (images et ombres). */
async function resolvePlan() {
  for (const v of plan.missing) {
    if (!v.path) continue;
    const f = await resolveFile(v.path, plan.cnfPath);
    if (!f) {
      v.notFound = v.path;
      continue;
    }
    plan.files.set(v.stem, f.file);
    plan.paths.set(v.stem, f.path);
    if (v.sf) {
      const list = await resolveShadows(v.sf, plan.cnfPath);
      if (list.length) {
        plan.shadows.set(v.stem, list.map((s) => s.file));
        plan.shadowPaths.set(v.stem, list.map((s) => s.path));
      }
    }
  }
}

/** Dossier fait des fichiers d'un champ « dossier » (webkitdirectory : Firefox, Safari),
 *  rangés d'après leur chemin relatif; mêmes méthodes qu'un FileSystemDirectoryHandle. */
function dirFromFiles(files) {
  const node = (name) => ({ name, dirs: new Map(), files: new Map() });
  const top = node('');
  for (const f of files) {
    const parts = splitPath(f.webkitRelativePath || f.name);
    let d = top;
    for (const p of parts.slice(0, -1)) d = d.dirs.get(p) ?? d.dirs.set(p, node(p)).get(p);
    d.files.set(parts[parts.length - 1], f);
  }
  // Le premier niveau est le dossier choisi lui-même.
  const root = top.dirs.size === 1 && !top.files.size ? [...top.dirs.values()][0] : top;
  const handle = (n) => ({
    kind: 'directory',
    name: n.name,
    async getDirectoryHandle(x) {
      if (!n.dirs.has(x)) throw new Error('NotFoundError');
      return handle(n.dirs.get(x));
    },
    async getFileHandle(x) {
      const f = n.files.get(x);
      if (!f) throw new Error('NotFoundError');
      return { kind: 'file', name: x, getFile: async () => f };
    },
    async *entries() {
      for (const [x, d] of n.dirs) yield [x, handle(d)];
      for (const [x, f] of n.files) yield [x, { kind: 'file', name: x, getFile: async () => f }];
    },
    queryPermission: async () => 'granted',
  });
  return handle(root);
}

/** Dialogue ouvert pour un fichier .cnf seul : le dossier de Hercules choisi ensuite y
 *  trouve les volumes et leurs ombres (la configuration y est retrouvée par son nom, pour
 *  que ses chemins relatifs s'appliquent). */
async function folderForPlan(files = null) {
  if (files) hercDir = dirFromFiles(files);
  else {
    try {
      hercDir = await window.showDirectoryPicker({ id: 'hercules', mode: 'read' });
    } catch {
      return;
    }
    await saveDir(hercDir);
  }
  ctx.prefs.hercDirName = hercDir.name;
  ctx.savePrefs();
  cnfList = await findConfigs();
  const same = cnfList.find((c) => c.file.name === plan.name);
  plan.cnfPath = same ? same.path : [];
  for (const v of plan.missing) delete v.notFound;
  ctx.status('hc.dir.reading', { name: hercDir.name });
  await resolvePlan();
  ctx.status('', {});
  renderPlan();
}

async function openFolder(files = null) {
  if (files) {
    hercDir = dirFromFiles(files);
  } else {
    try {
      hercDir = await window.showDirectoryPicker({ id: 'hercules', mode: 'read' });
    } catch {
      return; // choix annulé
    }
    await saveDir(hercDir);
  }
  ctx.prefs.hercDirName = hercDir.name;
  ctx.savePrefs();
  cnfList = await findConfigs();
  if (!cnfList.length) {
    ctx.status('hc.dir.nocnf', { name: hercDir.name });
    return;
  }
  await importConfig(cnfList[0].file, cnfList[0].path);
}

/** Nouvelle visite : les volumes lus sur place, retrouvés dans le dossier gardé (accès
 *  redemandé : à appeler pendant un clic). Rend le nombre de volumes retrouvés. */
export async function remountFromDir() {
  const want = (ctx.prefs.mounts ?? []).filter((m) => m.path && !mounts.has(m.addr));
  if (!want.length) return 0;
  const h = hercDir ?? await loadDir();
  if (!h) return 0;
  try {
    let perm = await h.queryPermission({ mode: 'read' });
    if (perm !== 'granted') perm = await h.requestPermission({ mode: 'read' });
    if (perm !== 'granted') {
      ctx.status('hc.reopen.denied', { name: h.name });
      return 0;
    }
  } catch {
    return 0;
  }
  hercDir = h;
  let found = 0;
  for (const m of want) {
    try {
      const open = async (p) => {
        const at = splitPath(p);
        return (await (await dirAt(at.slice(0, -1))).getFileHandle(at[at.length - 1])).getFile();
      };
      const file = await open(m.path);
      const shadows = [];
      for (const p of m.shadowPaths ?? []) shadows.push(await open(p));
      mounts.set(m.addr, { stem: m.stem, file, shadows });
      found++;
    } catch { /* fichier déplacé : à choisir à la main */ }
  }
  showConfig();
  return found;
}

/** Genre d'un fichier d'après son en-tête : image (CKD_P370, CKD_C370), ombre (CKD_S370). */
async function headerKind(f) {
  const h = String.fromCharCode(...new Uint8Array(await f.slice(0, 8).arrayBuffer()));
  if (h === 'CKD_S370') return 'shadow';
  return h.startsWith('CKD_') ? 'image' : null;
}

/** Ombre de Hercules : nom de l'image et rang (zares1_2 -> zares1, 2). */
function shadowOf(name) {
  const m = /^(.*)_(\d+)$/.exec(name.replace(/\\/g, '/').split('/').pop());
  return m ? { stem: volumeStem(m[1]), n: Number(m[2]) } : null;
}

/** Range des fichiers choisis : images par nom, ombres sous leur image, dans l'ordre. */
async function classify(files) {
  const images = new Map();
  const shadows = new Map();
  for (const f of files) {
    const kind = await headerKind(f);
    if (kind === 'image') images.set(volumeStem(f.name), f);
    else if (kind === 'shadow') {
      const s = shadowOf(f.name);
      if (s) (shadows.get(s.stem) ?? shadows.set(s.stem, []).get(s.stem)).push({ n: s.n, file: f });
    }
  }
  for (const list of shadows.values()) list.sort((a, b) => a.n - b.n);
  return { images, shadows };
}

const $ = (id) => document.getElementById(id);
const hex3 = (a) => a.toString(16).toUpperCase().padStart(3, '0');

/** Unités en service (sans les disques) : celles de la configuration importée, ou de TK5. */
export function devices() {
  return ctx.prefs.devices?.length ? ctx.prefs.devices : TK5_DEVICES;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Type d'unité d'un volume, d'après l'en-tête de l'image (octet 16 : 0x90 -> 3390). */
async function devtypeOf(file) {
  try {
    const f = await (await (await ctx.volDir()).getFileHandle(file)).getFile();
    const h = new Uint8Array(await f.slice(16, 17).arrayBuffer());
    return (0x3300 | h[0]).toString(16);
  } catch {
    return '3390';
  }
}

async function exportConfig() {
  const vols = [];
  for (const v of ctx.volumes()) vols.push({ ...v, devtype: await devtypeOf(v.file) });
  const z = ctx.prefs.arch === 'z';
  const text = buildConfig({ mem: z ? ctx.prefs.zmem : ctx.prefs.mem, volumes: vols, devices: z && !ctx.prefs.devices?.length ? Z_DEVICES : devices(), version: `v${ctx.version}`, arch: z ? 'z' : 's370' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = ctx.prefs.devicesName && ctx.prefs.devices ? ctx.prefs.devicesName : 'ibm370.cnf';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  ctx.status('hc.exported', { n: vols.length });
}

/** Plan d'import : ce qui sera changé, et ce qui ne peut pas l'être. */
function makePlan(name, conf) {
  const p = { name, warnings: [], dasd: [], missing: [], conflicts: [], devices: [], ignored: conf.ignored, files: new Map(), shadows: new Map(), paths: new Map(), shadowPaths: new Map() };
  const s = conf.system;
  // ARCHLVL z/Arch, ESA/390, ESAME : machine z/Architecture (mémoire de 64 Mo à 2 Go).
  p.arch = s.arch && /z\/?arch|esame|390/i.test(s.arch) ? 'z' : 's370';
  if (s.mainsize && p.arch === 'z') {
    const sizes = [64, 128, 256, 512, 1024, 2048];
    p.zmem = sizes.filter((n) => n <= s.mainsize).pop() ?? 64;
    if (s.mainsize !== p.zmem) p.warnings.push(t('hc.w.memz', { n: s.mainsize, m: p.zmem }));
  } else if (s.mainsize) {
    p.mem = s.mainsize <= 8 ? 8 : 16;
    if (s.mainsize !== p.mem) p.warnings.push(t('hc.w.mem', { n: s.mainsize, m: p.mem }));
  }
  if (s.arch && p.arch === 's370' && !/370/.test(s.arch)) p.warnings.push(t('hc.w.arch', { arch: s.arch }));
  // NUMCPU : processeurs de la machine z/Architecture (au plus 8 dans la page); un seul
  // pour le S/370.
  if (p.arch === 'z' && s.numcpu) p.zcpus = Math.min(8, Math.max(1, s.numcpu));
  else if (s.numcpu > 1) p.warnings.push(t('hc.w.cpu', { n: s.numcpu }));
  if (s.loadparm) p.loadparm = s.loadparm.slice(0, 8);
  // Volumes absents : lus sur place par défaut en z/Architecture (gros volumes).
  p.mode = p.arch === 'z' ? 'mount' : 'copy';
  // Unité d'IPL proposée (z/Architecture) : le premier volume « …res… », sinon le premier.
  const dasd = conf.devices.filter((x) => x.kind === 'dasd');
  if (p.arch === 'z' && dasd.length) {
    p.ipl = (dasd.find((x) => /res/i.test(volumeStem(x.path || ''))) ?? dasd[0]).addr;
  }
  p.devices = conf.devices.filter((d) => d.kind !== 'dasd').map(({ addr, kind, type }) => ({ addr, kind, type }));
  // La z/Architecture a la console du système (SCLP) : pas de 3215 ajoutée.
  if (p.arch === 's370' && !p.devices.some((d) => d.kind === 'console')) {
    p.devices.unshift({ addr: 0x009, kind: 'console', type: '3215-C' });
    p.warnings.push(t('hc.w.console'));
  }
  if (!p.devices.some((d) => d.kind === 'terminal')) p.warnings.push(t('hc.w.terms'));
  const vols = ctx.volumes();
  for (const d of conf.devices.filter((x) => x.kind === 'dasd')) {
    const stem = volumeStem(d.path || `unit${hex3(d.addr)}`);
    const want = `${stem}.${hex3(d.addr).toLowerCase()}`;
    const have = vols.find((v) => volumeStem(v.file) === stem);
    const occupant = vols.find((v) => v.addr === d.addr && volumeStem(v.file) !== stem);
    if (occupant) {
      p.conflicts.push({ addr: d.addr, stem, occupant: occupant.file });
    } else if (have && have.addr === d.addr) {
      p.dasd.push({ addr: d.addr, stem, file: have.file, action: 'ok' });
    } else if (have) {
      p.dasd.push({ addr: d.addr, stem, file: have.file, to: want, action: 'rename' });
    } else {
      p.missing.push({ addr: d.addr, stem, type: d.type, to: want, path: d.path, sf: d.sf });
    }
  }
  return p;
}

function renderPlan() {
  const box = $('hc-body');
  box.replaceChildren();
  const section = (title, items) => {
    if (!items.length) return;
    box.append(el('h3', null, title));
    const ul = el('ul');
    for (const it of items) {
      const li = el('li');
      if (typeof it === 'string') li.textContent = it;
      else li.append(...it);
      ul.append(li);
    }
    box.append(ul);
  };
  $('hc-name').textContent = plan.name;
  const kinds = {};
  for (const d of plan.devices) (kinds[d.kind] ??= []).push(hex3(d.addr));
  section(t('hc.s.system'), [
    ...(plan.arch === 'z' ? [t('arch.z')] : []),
    ...(plan.zmem ?? plan.mem ? [t('hc.mem', { m: plan.zmem ?? plan.mem })] : []),
    ...(plan.zcpus ? [t('hc.cpus', { n: plan.zcpus })] : []),
    ...(plan.loadparm ? [t('hc.loadparm', { v: plan.loadparm })] : []),
    ...(plan.ipl !== undefined ? [t('hc.ipl', { addr: hex3(plan.ipl) })] : []),
    ...Object.entries(kinds).map(([k, list]) => `${t(`hc.k.${k}`)} : ${list.join(', ')}`),
  ]);
  section(t('hc.s.volumes'), [
    ...plan.dasd.map((v) => (v.action === 'ok' ? t('hc.v.ok', { addr: hex3(v.addr), file: v.file })
      : t('hc.v.rename', { addr: hex3(v.addr), file: v.file, to: v.to }))),
    ...plan.missing.map((v) => {
      const f = plan.files.get(v.stem);
      if (!f && v.notFound) return t('hc.v.notfound', { addr: hex3(v.addr), path: v.notFound, dir: hercDir?.name ?? '' });
      if (!f) return t('hc.v.missing', { addr: hex3(v.addr), stem: v.stem, type: v.type });
      if (plan.mode === 'copy') return t('hc.v.chosen', { addr: hex3(v.addr), file: f.name, to: v.to });
      const n = plan.shadows.get(v.stem)?.length ?? 0;
      return t('hc.v.mount', { addr: hex3(v.addr), file: f.name, shadows: n ? t('hc.v.shadows', { n }) : '' });
    }),
  ]);
  section(t('hc.s.conflicts'), plan.conflicts.map((c) => t('hc.v.conflict', { addr: hex3(c.addr), stem: c.stem, occupant: c.occupant })));
  // Ombres de Hercules attendues (sf=) mais pas choisies : le volume serait vu sans elles.
  const noShadow = plan.mode === 'mount' ? plan.missing.filter((v) => v.sf && plan.files.has(v.stem) && !plan.shadows.has(v.stem)) : [];
  section(t('hc.s.warnings'), [
    ...plan.warnings,
    ...(noShadow.length ? [t('hc.w.noshadow', { list: noShadow.map((v) => v.stem).join(', ') })] : []),
    ...(plan.mode === 'copy' && plan.missing.some((v) => v.sf) ? [t('hc.w.copyshadow')] : []),
  ]);
  if (plan.ignored.length) {
    const d = el('details');
    d.append(el('summary', null, t('hc.s.ignored', { n: plan.ignored.length })));
    const pre = el('pre', 'mono hc-ignored', plan.ignored.map((x) => `${String(x.line).padStart(4)}  ${x.text}`).join('\n'));
    d.append(pre);
    box.append(d);
  }
  const waiting = plan.missing.filter((v) => !plan.files.has(v.stem)).length;
  $('hc-files').hidden = !waiting;
  $('hc-pickdir').hidden = !waiting;
  // Plusieurs configurations dans le dossier : choix.
  const sel = $('hc-cnf');
  sel.hidden = cnfList.length < 2 || !plan.cnfPath;
  if (!sel.hidden) {
    sel.replaceChildren(...cnfList.map((c, i) => new Option([...c.path, c.file.name].join('/'), String(i))));
    sel.value = String(cnfList.findIndex((c) => c.file.name === plan.name && c.path.join('/') === plan.cnfPath.join('/')));
  }
  $('hc-mode').hidden = !plan.missing.length;
  for (const r of document.querySelectorAll('input[name="hc-mode"]')) r.checked = r.value === plan.mode;
  $('hc-running').hidden = !ctx.running();
  $('hc-apply').disabled = ctx.running();
  $('hc-note').textContent = waiting ? t('hc.note.missing', { n: waiting }) : '';
}

/** Lit une configuration; `cnfPath` : son dossier dans le dossier de Hercules choisi
 *  (les volumes et leurs ombres y sont alors cherchés), ou null (fichier seul). */
async function importConfig(file, cnfPath = null) {
  const conf = parseConfig(await file.text());
  if (!conf.devices.length && !conf.system.mainsize) {
    ctx.status('hc.empty', { name: file.name });
    return;
  }
  if (!cnfPath) cnfList = [];
  plan = makePlan(file.name, conf);
  plan.cnfPath = cnfPath;
  if (cnfPath && hercDir) {
    ctx.status('hc.dir.reading', { name: hercDir.name });
    await resolvePlan();
    ctx.status('', {});
  }
  renderPlan();
  if (!$('hc').open) $('hc').showModal();
}

/** Fichiers des volumes manquants : images rapprochées par leur nom (sans extension),
 *  ombres de Hercules (zares1_1…) rangées sous leur image. */
async function chooseFiles(files) {
  const { images, shadows } = await classify(files);
  for (const [stem, f] of images) {
    if (plan.missing.some((v) => v.stem === stem)) plan.files.set(stem, f);
  }
  for (const [stem, list] of shadows) {
    if (plan.missing.some((v) => v.stem === stem)) plan.shadows.set(stem, list.map((s) => s.file));
  }
  renderPlan();
}

async function renameVolume(dir, from, to) {
  const fh = await dir.getFileHandle(from);
  try {
    await fh.move(dir, to);
  } catch {
    await ctx.writeVolume(to, (await fh.getFile()).stream());
    await dir.removeEntry(from);
  }
}

async function apply() {
  if (ctx.running()) return;
  const dir = await ctx.volDir();
  let done = 0;
  for (const v of plan.dasd.filter((x) => x.action === 'rename')) {
    ctx.status('hc.renaming', { file: v.file, to: v.to });
    await renameVolume(dir, v.file, v.to);
    done++;
  }
  const mounted = [];
  for (const v of plan.missing) {
    const f = plan.files.get(v.stem);
    if (!f) continue;
    if (plan.mode === 'mount') {
      // Lu sur place : rien n'est copié.
      mounts.set(v.addr, { stem: v.stem, file: f, shadows: plan.shadows.get(v.stem) ?? [] });
      // Chemins dans le dossier de Hercules : la visite suivante y retrouve les fichiers.
      mounted.push({
        addr: v.addr, stem: v.stem, name: f.name, shadows: plan.shadows.get(v.stem)?.length ?? 0,
        path: plan.paths.get(v.stem), shadowPaths: plan.shadowPaths.get(v.stem) ?? [],
      });
      done++;
      continue;
    }
    const head = new Uint8Array(await f.slice(0, 8).arrayBuffer());
    if (String.fromCharCode(...head.slice(0, 4)) !== 'CKD_') {
      ctx.status('vol.badfile', { name: f.name });
      continue;
    }
    ctx.status('vol.importing', { name: f.name });
    await ctx.writeVolume(v.to, f.stream());
    done++;
  }
  // Volumes lus sur place : ceux de cette configuration remplacent les précédents.
  for (const a of [...mounts.keys()]) if (!mounted.some((m) => m.addr === a)) mounts.delete(a);
  ctx.prefs.mounts = mounted;
  // Volumes restés absents (l'IPL saura dire lequel manque).
  ctx.prefs.missingVols = plan.missing.filter((v) => !plan.files.has(v.stem)).map((v) => ({ addr: v.addr, stem: v.stem }));
  ctx.prefs.devices = plan.devices;
  ctx.prefs.devicesName = plan.name;
  ctx.prefs.arch = plan.arch;
  if (plan.loadparm !== undefined && plan.arch === 'z') ctx.prefs.loadparm = plan.loadparm;
  if (plan.ipl !== undefined) ctx.prefs.zipl = hex3(plan.ipl);
  if (plan.mem) ctx.prefs.mem = plan.mem;
  if (plan.zmem) ctx.prefs.zmem = plan.zmem;
  if (plan.zcpus) ctx.prefs.zcpus = plan.zcpus;
  ctx.savePrefs();
  $('hc').close();
  await ctx.renderVolumes();
  showConfig();
  ctx.applied();
  const left = ctx.prefs.missingVols.length;
  ctx.status(left ? 'hc.applied.missing' : 'hc.applied', { name: plan.name, n: done, m: left });
}

function reset() {
  // Configuration de TK5 : machine S/370, sans volume lu sur place.
  ctx.prefs.devices = null;
  ctx.prefs.devicesName = null;
  ctx.prefs.mounts = [];
  ctx.prefs.missingVols = [];
  mounts.clear();
  ctx.prefs.arch = 's370';
  ctx.savePrefs();
  showConfig();
  ctx.applied();
  ctx.status('hc.reset.done');
}

/** Ligne du menu Machine : configuration en service. */
export function showConfig() {
  const imported = !!ctx.prefs.devices?.length;
  $('hc-current').textContent = imported
    ? t('hc.current.imported', { name: ctx.prefs.devicesName ?? '?', n: ctx.prefs.devices.length })
    : t('hc.current.tk5');
  $('hc-reset').hidden = !imported;
  // Volumes lus sur place : nombre, fichiers à choisir de nouveau, ombre de la page.
  const all = ctx.prefs.mounts ?? [];
  const need = mountsMissing();
  $('hc-mounts').hidden = !all.length;
  $('hc-mounts-text').textContent = need.length
    ? t('hc.mounts.need', { n: all.length, m: need.length })
    : t('hc.mounts', { n: all.length });
  $('hc-remount').hidden = !need.length;
  const reopen = $('hc-reopen');
  reopen.hidden = !need.length || !dirOk || !need.some((m) => m.path);
  reopen.textContent = t('hc.reopen', { name: ctx.prefs.hercDirName ?? '' });
}

/** Nouvelle visite : les fichiers des volumes lus sur place, choisis de nouveau. */
async function remount(files) {
  const { images, shadows } = await classify(files);
  let found = 0;
  for (const m of ctx.prefs.mounts ?? []) {
    const f = images.get(m.stem);
    if (!f) continue;
    mounts.set(m.addr, { stem: m.stem, file: f, shadows: (shadows.get(m.stem) ?? []).map((s) => s.file) });
    found++;
  }
  showConfig();
  ctx.status('hc.remounted', { n: found, m: (ctx.prefs.mounts ?? []).length });
  ctx.applied();
  await ctx.renderVolumes();
}

/** Efface l'ombre de la page des volumes lus sur place (retour à l'état des fichiers). */
async function clearOverlays() {
  if (ctx.running() || !confirm(t('hc.overlay.confirm'))) return;
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('shadow', { create: true });
  for (const m of ctx.prefs.mounts ?? []) await dir.removeEntry(overlayName(m)).catch(() => {});
  ctx.status('hc.overlay.done');
}

/** Nom de l'ombre de la page d'un volume lu sur place (zares1.a81.ovl). */
export function overlayName(m) {
  return `${m.stem}.${hex3(m.addr).toLowerCase()}.ovl`;
}

export function initHerc(context) {
  ctx = context;
  $('hc-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) await importConfig(f);
  });
  $('hc-export').addEventListener('click', () => exportConfig());
  $('hc-reset').addEventListener('click', reset);
  $('hc-vols').addEventListener('change', (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) chooseFiles(files);
  });
  for (const r of document.querySelectorAll('input[name="hc-mode"]')) {
    r.addEventListener('change', () => {
      if (plan && r.checked) {
        plan.mode = r.value;
        renderPlan();
      }
    });
  }
  $('hc-remount-file').addEventListener('change', (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) remount(files);
  });
  $('hc-overlay-clear').addEventListener('click', () => clearOverlays());
  // Dossier : showDirectoryPicker (accès gardé), sinon un champ « dossier ».
  $('hc-dir').addEventListener('click', () => {
    if (dirOk) openFolder().catch((err) => ctx.status('error', { msg: err.message }));
    else $('hc-dir-input').click();
  });
  $('hc-dir-input').addEventListener('change', (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    // Depuis le dialogue (fichier .cnf seul) : volumes de ce plan; sinon nouvel import.
    const run = pickForPlan ? folderForPlan(files) : openFolder(files);
    pickForPlan = false;
    run.catch((err) => ctx.status('error', { msg: err.message }));
  });
  $('hc-pickdir').addEventListener('click', () => {
    if (dirOk) folderForPlan().catch((err) => ctx.status('error', { msg: err.message }));
    else {
      pickForPlan = true;
      $('hc-dir-input').click();
    }
  });
  $('hc-reopen').addEventListener('click', async () => {
    const n = await remountFromDir();
    if (n) ctx.status('hc.remounted', { n, m: (ctx.prefs.mounts ?? []).length });
    ctx.applied();
  });
  $('hc-cnf').addEventListener('change', (e) => {
    const c = cnfList[Number(e.target.value)];
    if (c) importConfig(c.file, c.path);
  });
  $('hc-apply').addEventListener('click', () => apply().catch((err) => ctx.status('error', { msg: err.message })));
  $('hc-cancel').addEventListener('click', () => $('hc').close());
  showConfig();
  return () => {
    showConfig();
    if ($('hc').open && plan) renderPlan();
  };
}
