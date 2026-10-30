// Fil d'exécution de la machine : le S/370 tourne ici, hors du fil de la page. Le temps
// simulé suit le temps réel; si l'hôte ne suit pas, le retard est abandonné au-delà de
// 200 ms. En Turbo, quand le processeur travaille, le temps simulé va aussi vite que le
// fureteur le permet.
//
// Messages reçus : start {arch (s370 | z), mem, ipl, loadparm, volumes: [{addr, file}],
// devices: [{addr, kind, type}] (sans les disques; vide : unités de TK5, ou du lecteur, de
// la perforatrice et de l'imprimante en z/Architecture), terminals: [addr], relay,
// boot: {parm} (z/Architecture : noyau, paramètres et image initiale de Linux dans le
// lecteur; fichiers boot/kernel et boot/initrd de l'OPFS), mounts: [{addr, stem, file,
// shadows: [File], overlay}] (volumes lus sur place : image et ombres de Hercules choisies
// sur le disque, en lecture seule; écritures dans l'ombre de la page, shadow/<overlay>)},
// relay {url, terms} (relais : adresse ws://…, ou nul; terms : clients TN3270 servis),
// console {text} (ligne de l'opérateur), shutdown (arrêt propre de TK5 : S SHUTDOWN), key {addr, key}, char {addr, text},
// click {addr, pos}, interrupt, restart, submit {text} (cartes pour le lecteur 00C),
// turbo {on}, flush, stop, vol {id, addr, op, dsn, member, limit} (gestionnaire de volumes :
// lecture par les images que la machine tient).
// Messages envoyés : ready, started {volumes: [{addr, info}]}, console {text},
// screen {addr, data}, printer {addr, text}, stats {mips, psw, wait, io, simMs},
// shutdown {phase: started | tso {users, wait} | tasks | jes2 | eod | quiesce} (arrêt de TK5), relay {state, url, clients: [{addr, ttype}]},
// stopped {reason}, closed, error {msg}, cards {left}, vol {id, ok, result | error},
// leds {mask} (activité : 1 disques, 2 imprimantes, 4 lecteurs, 8 perforatrices),
// monitor {key, vals} (onglet Moniteur : clé de i18n.js « mon.<key> » et ses valeurs; les
// événements de la machine arrivent en « r.<clé> » avec les valeurs a, b, c, d).

import { TK5_DEVICES, Z_DEVICES } from './herc-conf.js?v=1b993921';

const version = new URL(import.meta.url).search;
// Module WebAssembly : celui à mémoire partagée (pkg-mt) dans une page isolée, pour un fil
// par processeur; sinon le module ordinaire (pkg).
let Emulator = null;
let mtModule = null;   // WebAssembly.Module de pkg-mt (donné aux fils des processeurs)
let mtMemory = null;   // sa mémoire partagée
let wasmMemory = null; // mémoire du module chargé (diagnostic des erreurs fatales)
let cpuWorkers = [];
let lastRate = 0;      // vitesse mesurée à la dernière seconde (MIPS)
// Unités branchées (configuration de la page : celle de TK5, ou une configuration Hercules
// importée) : fixées à chaque démarrage.
let CONSOLE = 0x009;
let READER = 0x00C;
let PRINTERS = [0x00E, 0x00F, 0x002, 0x30E];
let PUNCHES = [0x00D, 0x10D];
let LOCAL_TERMS = [0x0C0, 0x0C1, 0x0C2, 0x0C3, 0x0C4, 0x0C5, 0x0C6];
let TAPES = [0x480];
// Bandes montées : unité -> accès synchrone au fichier (dossier tapes de l'OPFS).
let tapeHandles = new Map();
let tapeSeen = '';      // dernier état des bandes envoyé à la page

let ready = null;
let emu = null;
let runCfg = null;      // configuration de la machine en marche (message start ou resume)
let arch = 's370';
let running = false;
let terminals = [];
let versions = new Map();
let hostWrites = new Map(); // écritures du système par terminal (journal)
const handles = [];
let simBase = 0;
let realBase = 0;
let statInst = 0;
let statTime = 0;
let turbo = false;
let mips = 20;          // vitesse mesurée de l'hôte (millions d'instructions par seconde)
let flushTime = 0;
let activity = 0;       // voyants d'activité : classes d'unités servies depuis le dernier envoi
let activityTime = 0;
let monTime = 0;        // dernier bilan envoyé au moniteur

const SLICE_MS = 12;
const FAST_IDLE_MS = 500;   // temps simulé d'une tranche quand les attentes sont sautées
const MAX_LAG_MS = 200;

function post(msg, transfer) {
  self.postMessage(msg, transfer ?? []);
}

/** Événement pour l'onglet Moniteur. */
function mon(key, vals = {}) {
  post({ type: 'monitor', key, vals });
}

/** Événements de la machine (« clé|a|b|… », Emulator.events_take). */
function machineEvents() {
  if (!emu) return;
  for (const line of emu.events_take().split('\n')) {
    if (!line) continue;
    const [k, a, b, c, d] = line.split('|');
    mon(`r.${k}`, { a, b, c, d });
  }
}

/** « type cylindres volume [pistes] » de attach_dasd / mount_finish. */
function volInfo(info) {
  const [type, cyls, volser, tracks] = info.split(' ');
  return { type, cyls, volser: volser || '?', tracks: tracks ?? '0' };
}

/**
 * Accès synchrone à un fichier de l'OPFS. Un autre accès encore ouvert sur le même fichier
 * (Worker d'une page qu'on vient de recharger, appel du gestionnaire de volumes en cours)
 * le refuse : nouvel essai pendant 3 s.
 */
async function syncHandle(fh) {
  for (let k = 0; ; k++) {
    try {
      const h = await fh.createSyncAccessHandle();
      handles.push(h);
      return h;
    } catch (e) {
      if (e?.name !== 'NoModificationAllowedError') throw e;
      // Toujours tenu : sans doute un autre onglet de l'émulateur, machine en marche.
      if (k >= 30) throw new Error(`locked|${fh.name}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

async function openVolume(file) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('dasd');
  const fh = await dir.getFileHandle(file);
  return syncDisk(await syncHandle(fh));
}

/** Fichier de l'OPFS ouvert en accès synchrone. */
function syncDisk(h) {
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
    size() { return h.getSize(); },
    flush() { try { h.flush(); } catch { /* rien */ } },
    truncate(n) {
      try {
        h.truncate(n);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Fichier du disque de l'usager (File), lu sur place, en lecture seule. */
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
    truncate: () => false,
  };
}

/** Ombre de la page d'un volume lu sur place (OPFS, dossier shadow; créée vide). */
async function openOverlay(name) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('shadow', { create: true });
  const fh = await dir.getFileHandle(name, { create: true });
  return syncDisk(await syncHandle(fh));
}

/** Fichier d'une bande (dossier tapes de l'OPFS), ouvert en accès synchrone. */
async function openTape(name) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('tapes', { create: true });
  const h = await syncHandle(await dir.getFileHandle(name));
  return { h, disk: syncDisk(h) };
}

function closeTape(addr) {
  const h = tapeHandles.get(addr);
  if (!h) return;
  tapeHandles.delete(addr);
  try {
    h.flush();
    h.close();
  } catch { /* déjà fermé */ }
  const i = handles.indexOf(h);
  if (i >= 0) handles.splice(i, 1);
}

/** Monte ou démonte une bande (message tape {addr, op, name, ro}). */
async function tapeOp({ addr, op, name, ro }) {
  if (!emu) throw new Error('stopped|');
  emu.tape_unmount(addr);
  closeTape(addr);
  if (op === 'mount') {
    const { h, disk } = await openTape(name);
    tapeHandles.set(addr, h);
    const n = emu.tape_mount(addr, disk, name, !!ro);
    mon('tape.mount', { addr: addr.toString(16).toUpperCase().padStart(3, '0'), name, n, ro: ro ? 1 : 0 });
  }
  tapeReport(true);
}

/** État des bandes pour la page (quand il change); bande déchargée par le système :
 *  fichier refermé. */
function tapeReport(force = false) {
  if (!emu || !TAPES.length) return;
  const list = [];
  for (const addr of TAPES) {
    const s = emu.tape_status(addr);
    if (!s) continue;
    const [name, pos, blocks, ro, unloaded] = s.split('|');
    if (unloaded === '1' && tapeHandles.has(addr)) closeTape(addr);
    list.push({ addr, name, pos: Number(pos), blocks: Number(blocks), ro: ro === '1' });
  }
  const key = JSON.stringify(list);
  if (force || key !== tapeSeen) {
    tapeSeen = key;
    post({ type: 'tapes', list });
  }
}

function closeVolumes() {
  for (const h of handles) {
    try {
      h.flush();
      h.close();
    } catch { /* déjà fermé */ }
  }
  handles.length = 0;
}

/** Fichier du dossier boot de l'OPFS (noyau, image initiale de Linux). */
async function bootFile(name) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('boot');
  const f = await (await dir.getFileHandle(name)).getFile();
  return new Uint8Array(await f.arrayBuffer());
}

async function start(cfg) {
  const infos = await build(cfg);
  const hex = (a) => a.toString(16).toUpperCase().padStart(3, '0');
  if (cfg.boot) {
    // Linux : noyau, paramètres, image initiale, chacun suivi d'une fin de fichier.
    const kernel = await bootFile('kernel');
    const initrd = await bootFile('initrd');
    emu.reader_load_binary(READER, kernel);
    emu.reader_load_binary(READER, new TextEncoder().encode(cfg.boot.parm || ' '));
    emu.reader_load_binary(READER, initrd);
    mon('boot', { addr: hex(READER), k: kernel.length, i: initrd.length, parm: cfg.boot.parm || '' });
  }
  const iplOk = emu.ipl(cfg.ipl);
  machineEvents();
  if (!iplOk) {
    const err = emu.disk_error();
    if (err) mon('diskerr', { msg: err });
    throw new Error(`ipl|${hex(cfg.ipl)}`);
  }
  begin(cfg, infos, false);
}

/** Machine neuve de la configuration `cfg` : volumes et unités branchés (sans IPL). Rend
 *  les volumes branchés ({addr, info}). */
async function build(cfg) {
  await ready;
  // Restes d'une marche qui ne s'est pas terminée par stop() (exception) : volumes fermés.
  if (emu || handles.length) await release();
  runCfg = cfg;
  arch = cfg.arch === 'z' ? 'z' : 's370';
  emu = arch === 'z' ? Emulator.newZ(cfg.mem, Date.now() / 1000) : new Emulator(cfg.mem, Date.now() / 1000);
  if (cfg.loadparm) emu.set_loadparm(cfg.loadparm);
  if (arch === 'z' && cfg.ncpu > 1) emu.set_cpus(cfg.ncpu);
  mon('start', { arch, mem: cfg.mem, ncpu: arch === 'z' ? cfg.ncpu || 1 : 1, ipl: cfg.ipl.toString(16).toUpperCase().padStart(3, '0'), loadparm: cfg.loadparm || '' });
  const infos = [];
  const hex = (a) => a.toString(16).toUpperCase().padStart(3, '0');
  for (const v of cfg.volumes) {
    try {
      const disk = await openVolume(v.file);
      const info = emu.attach_dasd(v.addr, disk);
      infos.push({ addr: v.addr, info });
      mon('vol', { addr: hex(v.addr), file: v.file, ...volInfo(info) });
    } catch (e) {
      mon('vol.err', { addr: hex(v.addr), file: v.file, msg: e?.message ?? String(e) });
      throw e;
    }
  }
  for (const m of cfg.mounts ?? []) {
    try {
      emu.mount_begin(blobDisk(m.file));
      for (const s of m.shadows) emu.mount_shadow(blobDisk(s));
      const info = emu.mount_finish(m.addr, await openOverlay(m.overlay));
      infos.push({ addr: m.addr, info });
      mon('mount', { addr: hex(m.addr), file: m.file.name, shadows: m.shadows.length, ...volInfo(info) });
    } catch (e) {
      mon('vol.err', { addr: hex(m.addr), file: m.file.name, msg: e?.message ?? String(e) });
      throw e;
    }
  }
  const devices = cfg.devices?.length ? cfg.devices : arch === 'z' ? Z_DEVICES : TK5_DEVICES;
  const of = (k) => devices.filter((d) => d.kind === k);
  CONSOLE = of('console')[0]?.addr ?? 0x009;
  READER = of('reader')[0]?.addr ?? 0x00C;
  PRINTERS = of('printer').map((d) => d.addr);
  PUNCHES = of('punch').map((d) => d.addr);
  LOCAL_TERMS = of('terminal').map((d) => d.addr);
  // En z/Architecture, la console de l'opérateur est celle du système (SCLP); une 3215
  // n'est branchée que si la configuration en a une.
  if (arch === 's370' || of('console').length) emu.attach_console(CONSOLE);
  for (const d of of('reader')) emu.attach_reader(d.addr);
  for (const d of of('printer')) emu.attach_printer(d.addr, parseInt(d.type, 16) || 0x1403);
  for (const p of PUNCHES) emu.attach_punch(p);
  TAPES = of('tape').map((d) => d.addr);
  for (const d of of('tape')) emu.attach_tape(d.addr, parseInt(d.type, 16) || 0x3420);
  // Carte Ethernet (z/Architecture) : LCS (lecture à l'adresse paire, écriture à la
  // suivante) ou OSA en QDIO (lecture, écriture, données à la suite).
  LCS = null;
  if (arch === 'z') {
    const osa = of('osa').map((d) => d.addr).sort((a, b) => a - b)[0];
    const lcs = of('lcs').find((d) => d.addr % 2 === 0)?.addr;
    if (osa !== undefined) {
      LCS = osa;
      emu.attach_osa(osa, new Uint8Array());
    } else if (lcs !== undefined) {
      LCS = lcs;
      emu.attach_lcs(lcs, new Uint8Array());
    }
  }
  ethSeen = '';
  tapeHandles = new Map();
  tapeSeen = '';
  // Tous les terminaux locaux de la configuration sont branchés (VTAM les attend : 0C0-0C6
  // pour TK5); la page n'en montre que le nombre choisi.
  terminals = cfg.terminals;
  for (const a of LOCAL_TERMS) emu.attach_terminal(a, 24, 80, 24, 80);
  versions = new Map();
  hostWrites = new Map();
  return infos;
}

/** La machine part (après l'IPL, ou reprise d'une session suspendue). */
function begin(cfg, infos, resumed) {
  emu.set_ns_per_inst(1000 / mips);
  if (arch === 'z' && cfg.ncpu > 1) startThreads(cfg.ncpu);
  post({ type: 'started', volumes: infos, resumed, eth: LCS !== null });
  running = true;
  tapeReport(true);
  relayUrl = cfg.relay || null;
  relayTerms = cfg.relayTerms !== false;
  openRelay();
  autoShutdown = false;
  zsd = null;
  // Commandes après l'IPL : déjà tapées dans une session reprise.
  autoCmds = !resumed && arch === 'z' && cfg.autoCmds?.length ? { cmds: cfg.autoCmds, started: false } : null;
  // Pas d'opérateur automatique de TK5 en z/Architecture (ni d'attentes sautées); session
  // reprise : TK5 avait-il fini de démarrer ?
  initDone = arch === 'z' || (resumed && cfg.initDone !== false);
  shutdownWanted = false;
  autoSeen = '';
  // Le temps simulé de la session reprise continue d'où il était.
  simBase = emu.now_ms();
  realBase = performance.now();
  statTime = performance.now();
  statInst = 0;
  monTime = performance.now();
  setTimeout(tick, 0);
}

async function stop(reason) {
  running = false;
  zsd = null;
  try { machineEvents(); } catch { /* machine en défaut */ }
  mon('stop', { reason });
  await release();
  post({ type: 'stopped', reason });
}

/** Fin de la machine : fils des processeurs, relais, volumes fermés (même en défaut). */
async function release() {
  running = false;
  try { await stopThreads(); } catch { cpuWorkers.forEach((w) => w.terminate()); cpuWorkers = []; }
  try {
    closeRelay();
    relayStatus('off');
  } catch { /* rien */ }
  try { emu?.flush(); } catch { /* rien */ }
  closeVolumes();
  try { emu?.free(); } catch { /* rien */ }
  emu = null;
  LCS = null;
}

// Mise en veille (session.js) : la machine s'arrête à une limite d'instruction (fils des
// processeurs arrêtés), son état est écrit dans suspend/machine.snap (comprimé), les
// volumes sont écrits et fermés, puis meta.json : la configuration (pour refaire la même
// machine) et les empreintes des volumes (taille, date de modification), vérifiées à la
// reprise. La reprise refait la machine sans IPL, relit l'état, puis efface la session
// (les volumes vont changer). Le temps simulé et l'horloge du système repartent d'où ils
// étaient (le système ne voit pas le temps passé en veille).

async function suspendDir(create = false) {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('suspend', { create });
}

/** Empreintes des fichiers des volumes de `cfg` et des bandes montées `tapes` (absents :
 *  size -1). */
async function fingerprints(cfg, tapes = []) {
  const root = await navigator.storage.getDirectory();
  const out = [];
  const opfs = async (dirName, name, kind, addr) => {
    try {
      const f = await (await (await root.getDirectoryHandle(dirName)).getFileHandle(name)).getFile();
      out.push({ kind, addr, name, size: f.size, mod: f.lastModified });
    } catch {
      out.push({ kind, addr, name, size: -1, mod: 0 });
    }
  };
  for (const v of cfg.volumes) await opfs('dasd', v.file, 'vol', v.addr);
  for (const m of cfg.mounts ?? []) {
    for (const f of [m.file, ...m.shadows]) {
      out.push({ kind: f === m.file ? 'mount' : 'shadow', addr: m.addr, name: f.name, size: f.size, mod: f.lastModified });
    }
    await opfs('shadow', m.overlay, 'overlay', m.addr);
  }
  for (const t of tapes) await opfs('tapes', t.name, 'tape', t.addr);
  return out;
}

/** Fichiers changés depuis la mise en veille (noms). */
async function changedFiles(cfg, prints, tapes = []) {
  const now = await fingerprints(cfg, tapes);
  const same = (a, b) => a.kind === b.kind && a.addr === b.addr && a.name === b.name;
  const changed = [];
  for (const p of prints) {
    const n = now.find((x) => same(x, p));
    if (!n || n.size !== p.size || n.mod !== p.mod) changed.push(p.name);
  }
  for (const n of now) if (!prints.some((p) => same(p, n))) changed.push(n.name);
  return changed;
}

/** Configuration à garder dans meta.json (fichiers du disque de l'usager : leurs noms). */
function cfgForMeta(cfg) {
  const { mounts = [], ...rest } = cfg;
  return {
    ...rest,
    autoCmds: [],
    boot: null,
    mounts: mounts.map((m) => ({ addr: m.addr, stem: m.stem, overlay: m.overlay, file: m.file.name, shadows: m.shadows.map((s) => s.name) })),
  };
}

/** État de la machine dans suspend/machine.snap. Rend {bytes, raw}. */
async function writeSnapshot(progress) {
  // D'abord l'état (la machine revient à un seul fil) : en cas d'échec de l'OPFS, elle
  // peut repartir.
  const head = emu.snap_begin();
  const d = await suspendDir(true);
  await d.removeEntry('meta.json').catch(() => {});
  const fh = await d.getFileHandle('machine.snap', { create: true });
  const h = await fh.createSyncAccessHandle();
  try {
    h.truncate(0);
    const cs = new CompressionStream('deflate');
    const w = cs.writable.getWriter();
    let at = 0;
    let raw = 0;
    // Écriture de la sortie comprimée, pendant que la machine fournit son état.
    const pump = (async () => {
      const r = cs.readable.getReader();
      for (;;) {
        const { done, value } = await r.read();
        if (done) break;
        for (let k = 0; k < value.length;) k += h.write(value.subarray(k), { at: at + k });
        at += value.length;
      }
    })();
    pump.catch((e) => w.abort(e).catch(() => {}));
    const put = async (chunk) => {
      raw += chunk.length;
      await w.write(chunk);
    };
    await put(head);
    const n = emu.snap_mem_count();
    for (let i = 0; i < n; i++) {
      const c = emu.snap_mem(i);
      if (c.length) await put(c);
      if ((i & 15) === 15) progress(i + 1, n);
    }
    await put(emu.snap_end());
    await w.close();
    await pump;
    h.flush();
    return { bytes: at, raw };
  } finally {
    h.close();
  }
}

/** Relit l'état de la machine de suspend/machine.snap. */
async function readSnapshot(raw, progress) {
  const d = await suspendDir();
  const f = await (await d.getFileHandle('machine.snap')).getFile();
  const r = f.stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  let done = 0;
  let shown = 0;
  for (;;) {
    const { done: end, value } = await r.read();
    if (end) break;
    emu.restore_feed(value);
    done += value.length;
    if (done - shown > 16 << 20) {
      shown = done;
      progress(done, raw);
    }
  }
  emu.restore_finish();
}

async function suspend(page) {
  if (!emu || !running) {
    post({ type: 'suspend-failed', msg: 'notrunning' });
    return;
  }
  running = false;
  zsd = null;
  const t0 = performance.now();
  const threads = cpuWorkers.length;
  post({ type: 'suspending', phase: 'stop' });
  try { machineEvents(); } catch { /* machine en défaut */ }
  // Un fil par processeur : les fils finissent, la machine revient à un seul fil.
  await stopThreads();
  drain();
  let sizes;
  try {
    sizes = await writeSnapshot((done, total) => post({ type: 'suspending', phase: 'mem', done, total }));
  } catch (e) {
    // Pas de place, OPFS refusé… : la machine continue.
    const msg = e?.message ?? String(e);
    try { await (await suspendDir()).removeEntry('machine.snap'); } catch { /* rien */ }
    mon('suspend.fail', { msg });
    post({ type: 'suspend-failed', msg });
    if (threads) startThreads(threads);
    running = true;
    simBase = emu.now_ms();
    realBase = performance.now();
    setTimeout(tick, 0);
    return;
  }
  const simMs = emu.now_ms();
  const psw = emu.psw();
  // Bandes montées : leurs fichiers font partie de la session.
  const tapes = [];
  for (const addr of TAPES) {
    const name = (emu.tape_status(addr) || '').split('|')[0];
    if (name) tapes.push({ addr, name });
  }
  await release();
  const meta = {
    format: 1,
    date: Date.now(),
    app: page.app,
    cfg: { ...cfgForMeta(runCfg), initDone },
    tapes,
    prints: await fingerprints(runCfg, tapes),
    bytes: sizes.bytes,
    raw: sizes.raw,
    simMs,
    psw,
    page: page.state,
  };
  const d = await suspendDir(true);
  const h = await (await d.getFileHandle('meta.json', { create: true })).createSyncAccessHandle();
  try {
    const data = new TextEncoder().encode(JSON.stringify(meta));
    h.truncate(0);
    for (let k = 0; k < data.length;) k += h.write(data.subarray(k), { at: k });
    h.flush();
  } finally {
    h.close();
  }
  mon('suspended', { mb: (sizes.bytes / 1048576).toFixed(1), raw: Math.round(sizes.raw / 1048576), s: ((performance.now() - t0) / 1000).toFixed(1) });
  post({ type: 'stopped', reason: 'suspended', meta });
}

async function resume(cfg, meta, lang, clock = false) {
  await ready;
  if (emu || handles.length) await release();
  if (!cfg.force) {
    const changed = await changedFiles(cfg, meta.prints, meta.tapes ?? []);
    if (changed.length) {
      post({ type: 'resume-changed', list: changed });
      return;
    }
  }
  const t0 = performance.now();
  const infos = await build(cfg);
  post({ type: 'resuming', done: 0, total: meta.raw });
  await readSnapshot(meta.raw, (done, total) => post({ type: 'resuming', done, total }));
  // Bandes qui étaient montées : remontées à leur position (fichiers de l'OPFS).
  for (const addr of TAPES) {
    const name = emu.tape_pending(addr);
    if (!name) continue;
    try {
      const { h, disk } = await openTape(name);
      tapeHandles.set(addr, h);
      emu.tape_remount(addr, disk);
    } catch {
      mon('tape.lost', { addr: addr.toString(16).toUpperCase().padStart(3, '0'), name });
    }
  }
  // Horloge du système remise à l'heure (option) : le temps passé en veille est compté.
  if (clock) {
    const s = emu.clock_to_now(Date.now());
    mon(s > 0 ? 'clock' : 'clock.ahead', { s: Math.round(s) });
  }
  machineEvents();
  mon('resumed', { date: new Date(meta.date).toLocaleString(lang), sim: Math.round(meta.simMs / 1000), s: ((performance.now() - t0) / 1000).toFixed(1) });
  begin(cfg, infos, true);
  // La session est reprise : elle ne peut plus resservir (les volumes vont changer).
  try {
    const d = await suspendDir();
    await d.removeEntry('meta.json');
    await d.removeEntry('machine.snap');
  } catch { /* rien */ }
}

// Relais TN3270 (ibmz-relay sur ce PC) : les clients TN3270 du réseau local prennent un
// terminal libre. Messages binaires : genre, connexion (4 octets), données; genres :
// 1 nouveau client (type de terminal), 2 client parti, 3 enregistrement, 6 nouveau client
// de la console de l'opérateur (port --console du relais : la console en écran 3270,
// `cons_*` du module; « .shutdown » y fait l'arrêt propre, comme le bouton Arrêter).
let relayUrl = null;
let relay = null;
let relayTimer = 0;
let relayTerms = true;  // clients TN3270 servis (sinon : le relais sert à la carte Ethernet)
// Carte Ethernet LCS : adresse de lecture (null : pas de carte), dernier état annoncé.
// Ses trames passent par le relais (genre 4) : il les relie à son réseau NAT.
let LCS = null;
let ethSeen = '';
let ethTime = 0;
const remotes = new Map(); // connexion -> {addr, ttype}
const consoles = new Map(); // connexion -> type de terminal (clients de la console)

function relayStatus(state) {
  post({
    type: 'relay',
    state,
    url: relayUrl,
    clients: [
      ...[...remotes.values()].map((r) => ({ addr: r.addr, ttype: r.ttype })),
      ...[...consoles.values()].map((ttype) => ({ console: true, ttype })),
    ],
  });
}

function relayMsg(kind, conn, data) {
  const m = new Uint8Array(5 + data.length);
  m[0] = kind;
  new DataView(m.buffer).setUint32(1, conn);
  m.set(data, 5);
  if (relay?.readyState === WebSocket.OPEN) relay.send(m);
}

/** Terminal libre pour un client : d'abord ceux que la page ne montre pas. */
function freeTerminal() {
  const all = [...LOCAL_TERMS];
  const order = [...all.filter((a) => !terminals.includes(a)), ...all.filter((a) => terminals.includes(a))];
  const used = new Set([...remotes.values()].map((r) => r.addr));
  return order.find((a) => !used.has(a));
}

function dropRemotes() {
  for (const r of remotes.values()) emu?.term_disconnect(r.addr);
  remotes.clear();
  for (const conn of consoles.keys()) emu?.cons_disconnect(conn);
  consoles.clear();
}

function openRelay() {
  clearTimeout(relayTimer);
  if (!relayUrl || !running) return;
  relayStatus('connecting');
  let ws;
  try {
    ws = new WebSocket(relayUrl);
  } catch {
    relayTimer = setTimeout(openRelay, 5000);
    return;
  }
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    emu?.tcpip_reset?.();
    relayStatus('open');
  };
  ws.onmessage = (e) => {
    if (!emu || !(e.data instanceof ArrayBuffer)) return;
    const m = new Uint8Array(e.data);
    if (m.length < 5) return;
    const conn = new DataView(m.buffer).getUint32(1);
    const data = m.subarray(5);
    if (m[0] === 5) {
      // Événement des sockets de l'instruction TCPIP.
      emu.tcpip_event?.(data);
      return;
    }
    if (m[0] === 4) {
      // Trame du réseau pour le système : la lecture en attente reprend aussitôt.
      if (LCS !== null && emu.lcs_receive(LCS, data) && cpuWorkers.length) emu.io_service();
      return;
    }
    if (m[0] === 6) {
      // Client de la console de l'opérateur.
      consoles.set(conn, new TextDecoder().decode(data));
      relayMsg(3, conn, emu.cons_connect(conn));
      relayStatus('open');
    } else if (m[0] === 1) {
      const addr = relayTerms ? freeTerminal() : undefined;
      if (addr === undefined) {
        relayMsg(2, conn, new Uint8Array());
        return;
      }
      remotes.set(conn, { addr, ttype: new TextDecoder().decode(data) });
      relayMsg(3, conn, emu.term_connect(addr));
      relayStatus('open');
    } else if (m[0] === 2) {
      const r = remotes.get(conn);
      if (r) emu.term_disconnect(r.addr);
      remotes.delete(conn);
      if (consoles.delete(conn)) emu.cons_disconnect(conn);
      relayStatus('open');
    } else if (m[0] === 3) {
      const r = remotes.get(conn);
      if (r) emu.term_input(r.addr, data);
      else if (consoles.has(conn)) consoleCommand(emu.cons_input(conn, data));
      sendConsoles();
    }
  };
  ws.onclose = () => {
    if (relay !== ws) return;
    relay = null;
    dropRemotes();
    emu?.tcpip_reset?.();
    relayStatus('closed');
    if (running && relayUrl) relayTimer = setTimeout(openRelay, 5000);
  };
  relay = ws;
}

function closeRelay() {
  clearTimeout(relayTimer);
  const ws = relay;
  relay = null;
  try { ws?.close(); } catch { /* déjà fermé */ }
  dropRemotes();
}

/** Trames émises par le système (carte LCS) vers le relais; état de la carte (au plus une
 *  fois par seconde). */
function pumpEth() {
  const out = emu.lcs_outbound(LCS);
  // Chaque trame précédée de sa longueur (2 octets).
  for (let i = 0; i + 2 <= out.length;) {
    const n = (out[i] << 8) | out[i + 1];
    relayMsg(4, 0, out.subarray(i + 2, i + 2 + n));
    i += 2 + n;
  }
  const now = performance.now();
  if (now - ethTime >= 1000) {
    const st = emu.lcs_status(LCS);
    ethTime = now;
    if (st !== ethSeen) {
      ethSeen = st;
      post({ type: 'eth', status: st });
    }
  }
}

/** Sockets de l'instruction TCPIP (X'75', FTPD de TK5) : commandes vers le relais, qui
 *  les ouvre sur ce PC (genre 5); sans relais, elles sont perdues. */
function pumpSockets() {
  if (!emu.tcpip_take) return;
  const open = relay?.readyState === WebSocket.OPEN;
  for (let c = emu.tcpip_take(); c.length; c = emu.tcpip_take()) {
    if (open) relayMsg(5, 0, c);
  }
}

/** Commande tapée sur la console par un client du relais. */
function consoleCommand(cmd) {
  if (!cmd) return;
  if (cmd.toLowerCase() === '.shutdown') {
    requestShutdown();
    return;
  }
  // Console du système pas encore prête (z/Architecture) : un peu plus tard.
  const send = (tries) => {
    if (emu && running && !emu.console_type(CONSOLE, cmd) && tries > 0) setTimeout(() => send(tries - 1), 1000);
  };
  send(10);
}

/** Écrans de la console vers ses clients du relais. */
function sendConsoles() {
  for (const conn of consoles.keys()) {
    for (let rec = emu.cons_outbound(conn); rec.length; rec = emu.cons_outbound(conn)) {
      relayMsg(3, conn, rec);
    }
  }
}

/** Arrêt propre : bouton Arrêter de la page, ou « .shutdown » sur la console du relais. */
function requestShutdown() {
  if (!emu) return;
  // z/Architecture : l'opérateur automatique (console du système).
  if (arch === 'z') zsdStart();
  // TK5 : la procédure SHUTDOWN de MVS.
  else {
    shutdownWanted = true;
    if (initDone) emu.console_type(CONSOLE, 'S SHUTDOWN');
  }
}

/** Écrans des terminaux distants vers leurs clients. */
function sendRemotes() {
  for (const [conn, r] of remotes) {
    for (let rec = emu.term_outbound(r.addr); rec.length; rec = emu.term_outbound(r.addr)) {
      relayMsg(3, conn, rec);
    }
  }
}

// Opérateur automatique de l'arrêt de TK5 (comme les règles « hao » de Hercules) : la
// procédure SHUTDOWN de MVS demande « script scripts/shutdown » par DIAGNOSE X'008'. Le
// script de TK5 attend alors 30 s pour laisser les usagers de TSO se déconnecter; ici,
// D TS,L compte d'abord les usagers connectés : sans usager, pas d'attente. Chaque étape
// est annoncée à la page (message shutdown {phase}).
let autoShutdown = false;
let autoSeen = '';
const AUTO_RULES = [['$HASP099', '$PJES2', 'jes2'], ['$HASP085', 'Z EOD', 'eod'], ['IEE334I', 'QUIESCE', 'quiesce']];
let autoDone = new Set();
let tsoUsers = null;    // usagers de TSO comptés par D TS,L (null : pas encore de réponse)
let tsoTimer = 0;

// TK5 a fini de démarrer (message MVS038J) : avant, son script de démarrage ignore la
// demande d'arrêt; celle-ci attend donc ce message.
let initDone = false;
let shutdownWanted = false;

function operatorLater(cmd, ms) {
  setTimeout(() => {
    if (emu && running) emu.console_type(CONSOLE, cmd);
  }, ms);
}

function autoOperator(text) {
  if (!initDone && text && (autoSeen + text).includes('MVS038J')) {
    initDone = true;
    if (shutdownWanted) operatorLater('S SHUTDOWN', 1000);
  }
  if (!initDone && text) autoSeen = (autoSeen + text).slice(-200);
  for (const cmd of emu.diag8_take().split('\n')) {
    if (/script\s+scripts\/shutdown/i.test(cmd) && !autoShutdown) {
      autoShutdown = true;
      autoSeen = '';
      initDone = true;
      autoDone = new Set();
      tsoUsers = null;
      post({ type: 'shutdown', phase: 'started' });
      operatorLater('D TS,L', 500);
      // Pas de réponse : l'attente de TK5 (30 s) est gardée.
      tsoTimer = setTimeout(() => shutnow(-1), 8000);
    }
  }
  if (!autoShutdown || !text) return;
  autoSeen = (autoSeen + text).slice(-20000);
  const m = tsoUsers === null && /(\d+)\s+TIME SHARING USERS/.exec(autoSeen);
  if (m) shutnow(Number(m[1]));
  for (const [msg, cmd, phase] of AUTO_RULES) {
    if (!autoDone.has(msg) && autoSeen.includes(msg)) {
      autoDone.add(msg);
      operatorLater(cmd, 1000);
      post({ type: 'shutdown', phase });
    }
  }
}

/** Arrêt des tâches (F BSPPILOT,SHUTNOW) : tout de suite sans usager de TSO, 30 s sinon. */
function shutnow(users) {
  if (tsoUsers !== null) return;
  clearTimeout(tsoTimer);
  tsoUsers = users;
  const wait = users === 0 ? 500 : 30000;
  post({ type: 'shutdown', phase: 'tso', users, wait });
  setTimeout(() => {
    if (emu && running) {
      emu.console_type(CONSOLE, 'F BSPPILOT,SHUTNOW');
      post({ type: 'shutdown', phase: 'tasks' });
    }
  }, wait);
}

// Opérateur automatique de l'arrêt du système de la machine z/Architecture (IPL d'un
// disque), par la console du système (SCLP) : V CN(*),ACTIVATE; D A,L choisit la procédure
// d'arrêt (SHUTDB si DB2 tourne, SHUTALL si CICS ou MQ, sinon SHUTDOWN); réponse Y à la
// question de zFS (BPXI078D), SIC à celle de TSO (IKT010D); toutes les 20 s, D A,L : passé le temps de la procédure, chaque tâche
// restante reçoit P, puis C, puis FORCE nom,ARM, puis FORCE; quand il ne reste que JES2 :
// $PI, WRITELOG CLOSE, $PJES2 ($HASP607 : nouvel essai, puis $PJES2,ABEND et PURGE);
// $HASP085 -> Z EOD; IEE334I (ou IEE497I : fini avec des erreurs; sinon 2 min plus tard) :
// la machine s'arrête. Étapes annoncées à la page (shutdown).
const ZSD_PROC_MS = 150_000; // temps laissé à la procédure d'arrêt
const ZSD_LIST_MS = 20_000;  // intervalle des D A,L
let zsd = null;

function zsdType(cmd, tries = 10) {
  if (!emu || !running || !zsd) return;
  // Console du système pas encore prête (commande précédente en cours) : un peu plus tard.
  if (!emu.console_type(CONSOLE, cmd) && tries > 0) setTimeout(() => zsdType(cmd, tries - 1), 1000);
}

function zsdLater(fn, ms) {
  setTimeout(() => {
    if (zsd && emu && running) fn();
  }, ms);
}

function zsdStart() {
  if (zsd) return;
  zsd = { seen: '', start: performance.now(), proc: null, procAt: 0, tries: new Map(), jes2: 0, jes2Busy: false,
    lists: 0, parsed: 0, eod: false, abend: false, replied: new Set() };
  post({ type: 'shutdown', phase: 'request' });
  zsdType('V CN(*),ACTIVATE');
  zsdLater(zsdList, 4000);
}

function zsdList() {
  zsdType('D A,L');
}

/** Tâches de la réponse IEE114I à D A,L : deux par ligne (colonnes 2 et 37). */
function zsdTasks(block) {
  const names = [];
  for (const line of block.split('\n').slice(3)) {
    if (!/^ {2}\S/.test(line)) break;
    for (const at of [2, 37]) {
      const n = line.slice(at, at + 8).trim();
      if (/^[A-Z$#@][A-Z0-9$#@]{0,7}$/.test(n)) names.push(n);
    }
  }
  return names;
}

function zsdOnList(names) {
  const now = performance.now();
  if (!zsd.proc) {
    zsd.proc = names.some((n) => /^DB\w*(MSTR|DBM1)$/.test(n)) ? 'SHUTDB'
      : names.some((n) => /^(CICS|CSQ)/.test(n)) ? 'SHUTALL' : 'SHUTDOWN';
    zsd.procAt = now;
    post({ type: 'shutdown', phase: 'tasks', proc: zsd.proc });
    zsdType(`S ${zsd.proc}`);
    zsdLater(zsdList, 60_000);
    return;
  }
  const rest = names.filter((n) => n !== 'JES2');
  if (!rest.length) {
    zsdJes2();
    return;
  }
  if (now - zsd.procAt >= ZSD_PROC_MS) {
    post({ type: 'shutdown', phase: 'remain', names: rest });
    let delay = 0;
    for (const n of rest) {
      const k = zsd.tries.get(n) ?? 0;
      zsd.tries.set(n, k + 1);
      const steps = zsdSteps(n);
      if (k >= steps.length) continue;
      zsdLater(() => zsdType(steps[k]), delay);
      delay += 1500;
    }
    // Plus rien à essayer : JES2 quand même (au besoin $PJES2,ABEND).
    if (rest.every((n) => zsd.tries.get(n) > zsdSteps(n).length)) {
      zsdJes2();
      return;
    }
  }
  zsdLater(zsdList, ZSD_LIST_MS);
}

/** Commandes successives pour arrêter une tâche restante. DLF veut d'abord un mode d'arrêt
 *  (COF544I sinon); les tâches qui refusent CANCEL (IEE838I) passent à FORCE,ARM. */
function zsdSteps(n) {
  if (n === 'DLF') return ['F DLF,MODE=QUICK', 'P DLF', 'FORCE DLF,ARM', 'FORCE DLF'];
  return [`P ${n}`, `C ${n}`, `FORCE ${n},ARM`, `FORCE ${n}`];
}

function zsdJes2() {
  if (zsd.jes2Busy) return;
  zsd.jes2Busy = true;
  zsd.jes2++;
  post({ type: 'shutdown', phase: 'jes2' });
  zsdType('$PI');
  zsdLater(() => zsdType('WRITELOG CLOSE'), 2000);
  zsdLater(() => zsdType(zsd.jes2 > 3 ? '$PJES2,ABEND' : '$PJES2'), 6000);
}

/** Messages de la console du système pendant l'arrêt. */
function zsdFeed(text) {
  if (!zsd || !text) return;
  zsd.seen = (zsd.seen + text).slice(-200_000);
  // Réponse à D A,L : lue 2 s après son début (elle peut arriver en plusieurs fois).
  const lists = zsd.seen.split('IEE114I').length - 1;
  if (lists > zsd.lists) {
    zsd.lists = lists;
    zsdLater(() => {
      const block = zsd.seen.slice(zsd.seen.lastIndexOf('IEE114I'));
      zsdOnList(zsdTasks(block));
    }, 2000);
  }
  // Questions : zFS (Y), fin anormale de JES2 (PURGE).
  for (const m of text.matchAll(/\b(\d{1,4})\s+BPXI078D/g)) {
    if (zsd.replied.has(m[1])) continue;
    zsd.replied.add(m[1]);
    post({ type: 'shutdown', phase: 'zfs' });
    zsdLater(() => zsdType(`R ${m[1]},Y`), 1000);
  }
  // TSO avec des usagers connectés (IKT010D) : SIC, arrêt en déconnectant les usagers.
  for (const m of text.matchAll(/\b(\d{1,4})\s+IKT010D/g)) {
    if (zsd.replied.has(m[1])) continue;
    zsd.replied.add(m[1]);
    zsdLater(() => zsdType(`R ${m[1]},SIC`), 1000);
  }
  for (const m of text.matchAll(/\b(\d{1,4})\s+\$HASP098/g)) {
    if (zsd.replied.has(m[1])) continue;
    zsd.replied.add(m[1]);
    zsdLater(() => zsdType(`R ${m[1]},PURGE`), 1000);
  }
  if (text.includes('$HASP607')) {
    // JES2 pas encore libre : la liste des tâches, puis un nouvel essai.
    zsd.jes2Busy = false;
    zsdLater(zsdList, ZSD_LIST_MS);
  }
  if (!zsd.eod && text.includes('$HASP085')) {
    zsd.eod = true;
    post({ type: 'shutdown', phase: 'eod' });
    zsdLater(() => zsdType('Z EOD'), 1000);
    // Ni IEE334I ni IEE497I : la machine s'arrête quand même (JES2 est fini).
    zsdLater(() => zsdEnd('timeout'), 120_000);
  }
  // Journaux fermés (IEE334I), ou fermés avec une erreur (IEE497I HALT COMPLETED WITH
  // ERRORS, par exemple LOGREC : IEE498I) : la machine peut s'arrêter.
  if (text.includes('IEE334I')) zsdEnd('ok');
  else if (text.includes('IEE497I')) zsdEnd('errors');
}

/** Fin de l'arrêt : la machine s'arrête (volumes écrits et fermés) 2 s plus tard. */
function zsdEnd(how) {
  if (!zsd || zsd.ending) return;
  zsd.ending = true;
  if (how !== 'ok') post({ type: 'shutdown', phase: 'eodwarn', how });
  zsdLater(() => {
    zsd = null;
    stop('stopped');
  }, 2000);
}

// Commandes de l'usager après l'IPL (z/Architecture, système chargé d'un disque) : quand
// JES2 a fini de démarrer ($HASP492 … START HAS COMPLETED, vu sur un terminal 3270, la
// console maîtresse 3270), la page active la console du système (V CN(*),ACTIVATE) et y
// tape les commandes, à 2 s d'intervalle : les saisies de l'usager sur la 700 ne sont pas
// mêlées. Les commandes sont gardées par la page (réglages), pas sur les volumes.
let autoCmds = null; // {cmds, started}

function autoCmdsWatch(addr) {
  if (!emu.term_text(addr).includes('$HASP492')) return;
  autoCmds.started = true;
  mon('autocmds', { n: autoCmds.cmds.length });
  const cmds = ['V CN(*),ACTIVATE', ...autoCmds.cmds];
  cmds.forEach((cmd, i) => setTimeout(() => autoCmdType(cmd, i > 0), 3000 + 2000 * i));
}

function autoCmdType(cmd, announce, tries = 10) {
  if (!emu || !running) return;
  // Console du système occupée (commande précédente en cours) : un peu plus tard.
  if (!emu.console_type(CONSOLE, cmd)) {
    if (tries > 0) setTimeout(() => autoCmdType(cmd, announce, tries - 1), 1000);
    return;
  }
  if (announce) mon('autocmd', { cmd });
}

/** Sorties de la machine : console, écrans changés, imprimantes. */
function drain() {
  if (remotes.size) sendRemotes();
  if (LCS !== null) pumpEth();
  pumpSockets();
  const text = emu.console_take(CONSOLE);
  if (text) post({ type: 'console', text });
  if (consoles.size) sendConsoles();
  autoOperator(text);
  zsdFeed(text);
  for (const a of terminals) {
    const v = emu.term_version(a);
    if (v !== versions.get(a)) {
      versions.set(a, v);
      // host : le système a écrit (pas seulement une frappe) : l'écran va au journal.
      const w = emu.term_host_writes(a);
      const host = w !== hostWrites.get(a);
      hostWrites.set(a, w);
      if (host && autoCmds && !autoCmds.started) autoCmdsWatch(a);
      const data = emu.term_render(a);
      post({ type: 'screen', addr: a, data, host }, [data.buffer]);
    }
  }
  for (const p of [...PRINTERS, ...PUNCHES]) {
    const out = emu.printer_take(p);
    if (out) post({ type: 'printer', addr: p, text: out });
  }
}

function tick() {
  if (!running) return;
  try {
    step();
  } catch (e) {
    // Exception de la machine : arrêt, volumes fermés (sinon le prochain IPL ne peut pas
    // les rouvrir).
    report(e);
    stop('error');
  }
}

// Première erreur fatale du module (manque de mémoire, panique) : l'appel interrompu laisse
// la machine « occupée », et chaque appel suivant donne « recursive use of an object… ».
// Seule la première est annoncée (c'est la cause), les suivantes sont tues.
let fatalError = null;

function report(e) {
  const msg = e?.message ?? String(e);
  if (fatalError) return;
  if (e instanceof WebAssembly.RuntimeError || /recursive use of an object|unreachable|out of memory/i.test(msg)) {
    fatalError = msg;
    // Pour le diagnostic : mémoire du module (Mo), machine demandée, pile de l'erreur.
    const mb = wasmMemory ? Math.round(wasmMemory.buffer.byteLength / 1048576) : 0;
    const stack = String(e?.stack ?? '').split('\n').slice(0, 4).join(' / ');
    mon('fatal', { msg, mb, mem: runCfg?.mem ?? 0, ncpu: runCfg?.ncpu ?? 1, stack });
    // La page recrée ce fil (module neuf) avant le prochain IPL.
    post({ type: 'fatal' });
  }
  post({ type: 'error', msg });
}

function step() {
  const t0 = performance.now();
  let target = simBase + (t0 - realBase);
  const now = emu.now_ms();
  if (target - now > MAX_LAG_MS) {
    // L'hôte ne suit pas : le retard est abandonné.
    simBase -= target - now - MAX_LAG_MS;
    target = simBase + (t0 - realBase);
  }
  let ms = Math.max(0, target - now);
  // Rapide : pendant l'arrêt, et pendant l'IPL en Turbo, les attentes du processeur sont
  // sautées (le temps simulé court jusqu'au prochain événement). Pas en marche ordinaire :
  // l'horloge de MVS filerait et les délais de TSO et des travaux expireraient.
  const fast = autoShutdown || zsd !== null || (turbo && !initDone);
  if (fast && emu.waiting()) ms = Math.max(ms, FAST_IDLE_MS);
  else if (turbo && !emu.waiting()) ms = Math.max(ms, SLICE_MS * 4);
  const maxInst = Math.round(mips * 1000 * SLICE_MS);
  let state = 'run';
  // Un fil par processeur : le temps simulé suit l'horloge de l'hôte; ce fil-ci fait
  // seulement les E-S et l'affichage, à chaque passage.
  if (ms > 0 || cpuWorkers.length) {
    state = emu.run(ms, maxInst);
    const dt = performance.now() - t0;
    const inst = emu.take_instructions();
    statInst += inst;
    // Budget épuisé : le processeur a travaillé tout le temps, sa vitesse est mesurable.
    if (inst >= maxInst && dt > 2) {
      mips = Math.max(2, Math.min(300, 0.8 * mips + 0.2 * (inst / dt / 1000)));
      emu.set_ns_per_inst(1000 / mips);
    }
  }
  if ((turbo || fast) && emu.now_ms() > target) {
    // En rafale : le temps simulé a pris de l'avance, la base suit.
    simBase += emu.now_ms() - target;
  }
  drain();
  machineEvents();
  const t1 = performance.now();
  // Bilan pour le moniteur, chaque minute.
  if (t1 - monTime >= 60000) {
    monTime = t1;
    // Un fil par processeur : vitesse mesurée (tous les processeurs), pas le budget.
    const shown = cpuWorkers.length ? lastRate : mips;
    mon('stats', { sim: Math.round(emu.now_ms() / 1000), mips: shown.toFixed(1), io: emu.io_count() });
  }
  // Voyants d'activité du pupitre (disques, imprimantes, lecteurs) : au plus toutes les 50 ms.
  activity |= emu.take_activity();
  if (activity && t1 - activityTime >= 50) {
    post({ type: 'leds', mask: activity });
    activity = 0;
    activityTime = t1;
  }
  if (t1 - statTime >= 1000) {
    const rate = statInst / (t1 - statTime) / 1000;
    lastRate = rate;
    statInst = 0;
    post({ type: 'stats', mips: rate, psw: emu.psw(), wait: emu.waiting(), io: emu.io_count(), simMs: emu.now_ms(), dbg: `t=${target.toFixed(0)} now=${emu.now_ms().toFixed(0)} mips=${mips.toFixed(1)} ms=${ms.toFixed(1)}` });
    const err = emu.disk_error();
    if (err) {
      post({ type: 'error', msg: err });
      mon('diskerr', { msg: err });
    }
    tapeReport();
    statTime = t1;
  }
  if (t1 - flushTime > 5000) {
    emu.flush();
    flushTime = t1;
  }
  if (state !== 'run') {
    drain();
    stop(state);
    return;
  }
  setTimeout(tick, Math.max(0, SLICE_MS - (performance.now() - t0)));
}

self.onmessage = async ({ data }) => {
  try {
    switch (data.type) {
      case 'start':
        await start(data);
        break;
      case 'resume':
        await resume(data.cfg, data.meta, data.lang, data.clock);
        break;
      case 'suspend':
        await suspend(data);
        break;
      case 'console':
        if (emu && !emu.console_type(CONSOLE, data.text)) post({ type: 'console-refused' });
        break;
      case 'shutdown':
        requestShutdown();
        break;
      case 'key':
        emu?.term_key(data.addr, data.key);
        if (emu) drain();
        break;
      case 'char':
        if (emu && !emu.term_char(data.addr, data.text)) post({ type: 'beep' });
        if (emu) drain();
        break;
      case 'click':
        emu?.term_click(data.addr, data.pos);
        if (emu) drain();
        break;
      case 'interrupt':
        emu?.interrupt_key();
        break;
      case 'restart':
        emu?.restart();
        break;
      case 'submit':
        if (emu) {
          emu.reader_load(READER, data.text);
          post({ type: 'cards', left: emu.reader_left(READER) });
        }
        break;
      case 'relay':
        relayUrl = data.url || null;
        relayTerms = data.terms !== false;
        closeRelay();
        if (relayUrl) openRelay();
        else relayStatus('off');
        break;
      case 'turbo':
        turbo = !!data.on;
        break;
      case 'flush':
        emu?.flush();
        break;
      case 'vol':
        volCall(data);
        break;
      case 'tape':
        await tapeOp(data);
        break;
      case 'stop':
        if (emu) {
          drain();
          stop('user');
        }
        post({ type: 'closed' });
        break;
    }
  } catch (e) {
    report(e);
    // Machine en défaut (erreur fatale du module) : arrêt, volumes fermés.
    if (fatalError && running) stop('error');
    if (data.type === 'start' || data.type === 'resume') {
      if (data.type === 'resume') mon('resume.fail', { msg: e?.message ?? String(e) });
      await release().catch(() => {});
      running = false;
      post({ type: 'stopped', reason: 'error' });
    }
  }
};

/** Gestionnaire de volumes, machine en marche : lecture seulement (vol-ops.js). */
function volCall({ id, addr, op, dsn = '', member = '', limit = 0 }) {
  try {
    if (!emu) throw new Error('stopped|');
    const result = op === 'raw' ? emu.vol_raw(addr, dsn, member, limit) : JSON.parse(emu.vol_call(addr, op, dsn, member, limit));
    post({ type: 'vol', id, ok: true, result }, op === 'raw' ? [result.buffer] : []);
  } catch (e) {
    post({ type: 'vol', id, ok: false, error: e?.message ?? String(e) });
  }
}

async function loadWasm() {
  if (self.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined') {
    try {
      const pkg = await import(`./pkg-mt/ibmz_web.js${version}`);
      mtModule = await WebAssembly.compileStreaming(fetch(new URL(`./pkg-mt/ibmz_web_bg.wasm${version}`, import.meta.url)));
      const wasm = await pkg.default({ module_or_path: mtModule });
      wasmMemory = wasm.memory;
      mtMemory = wasm.memory;
      Emulator = pkg.Emulator;
      return;
    } catch {
      mtModule = null;
      mtMemory = null;
    }
  }
  const pkg = await import(`./pkg/ibmz_web.js${version}`);
  wasmMemory = (await pkg.default(new URL(`./pkg/ibmz_web_bg.wasm${version}`, import.meta.url))).memory;
  Emulator = pkg.Emulator;
}

/** Un fil par processeur (z/Architecture, plusieurs processeurs, page isolée). */
function startThreads(n) {
  if (!mtModule) {
    mon('threads.no', { n });
    return;
  }
  const ptr = emu.start_threads();
  if (!ptr) {
    mon('threads.no', { n });
    return;
  }
  cpuWorkers = [];
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL(`./cpu-worker.js${version}`, import.meta.url), { type: 'module' });
    w.onerror = (e) => mon('error', { msg: `cpu-worker ${i} : ${e.message}` });
    w.postMessage({ module: mtModule, memory: mtMemory, ptr, idx: i, version });
    cpuWorkers.push(w);
  }
  mon('threads', { n, cores: navigator.hardwareConcurrency || 0 });
  ioLoop();
}

/** Tâche brève suivante de la boucle d'événements (sans le délai minimal de setTimeout). */
function yieldNow() {
  return new Promise((resolve) => {
    const c = new MessageChannel();
    c.port1.onmessage = resolve;
    c.port2.postMessage(0);
  });
}

/**
 * Fil des E-S (un fil par processeur) : réveillé par la sonnette des processeurs (début
 * d'E-S en attente) ou à la prochaine échéance des E-S, il exécute les programmes de canal
 * (les disques de la page ne sont accessibles que de ce Worker). Sans Atomics.waitAsync :
 * à chaque passage de tick seulement.
 */
async function ioLoop() {
  if (typeof Atomics.waitAsync !== 'function') return;
  await yieldNow(); // après le démarrage (running)
  const bell = new Int32Array(mtMemory.buffer);
  const idx = emu.io_bell_addr() >>> 2;
  while (running && cpuWorkers.length) {
    const v = Atomics.load(bell, idx);
    emu.io_service();
    const ms = Math.max(0.02, Math.min(SLICE_MS, emu.io_next_ms()));
    const r = Atomics.waitAsync(bell, idx, v, ms);
    if (r.async) await r.value;
    else await yieldNow();
  }
}

/** Fin des fils des processeurs (avant de libérer la machine). */
async function stopThreads() {
  if (!emu || !emu.threads()) return;
  emu.stop_threads();
  for (let k = 0; k < 300 && !emu.threads_done(); k++) await new Promise((r) => setTimeout(r, 10));
  for (const w of cpuWorkers) w.terminate();
  cpuWorkers = [];
}

ready = loadWasm().then(() => post({ type: 'ready' }));
