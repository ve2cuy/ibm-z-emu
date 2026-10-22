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
// relay {url} (relais TN3270 : adresse ws://…, ou nul),
// console {text} (ligne de l'opérateur), shutdown (arrêt propre de TK5 : S SHUTDOWN), key {addr, key}, char {addr, text},
// click {addr, pos}, interrupt, restart, submit {text} (cartes pour le lecteur 00C),
// turbo {on}, flush, stop, vol {id, addr, op, dsn, member, limit} (gestionnaire de volumes :
// lecture par les images que la machine tient).
// Messages envoyés : ready, started {volumes: [{addr, info}]}, console {text},
// screen {addr, data}, printer {addr, text}, stats {mips, psw, wait, io, simMs},
// shutdown {phase: started | tso {users, wait} | tasks | jes2 | eod | quiesce} (arrêt de TK5), relay {state, url, clients: [{addr, ttype}]},
// stopped {reason}, closed, error {msg}, cards {left}, vol {id, ok, result | error},
// leds {mask} (activité : 1 disques, 2 imprimantes, 4 lecteurs, 8 perforatrices).

import init, { Emulator } from './pkg/ibmz_web.js?v=0c20c021';
import { TK5_DEVICES, Z_DEVICES } from './herc-conf.js?v=0c20c021';

const version = new URL(import.meta.url).search;
// Unités branchées (configuration de la page : celle de TK5, ou une configuration Hercules
// importée) : fixées à chaque démarrage.
let CONSOLE = 0x009;
let READER = 0x00C;
let PRINTERS = [0x00E, 0x00F, 0x002, 0x30E];
let PUNCHES = [0x00D, 0x10D];
let LOCAL_TERMS = [0x0C0, 0x0C1, 0x0C2, 0x0C3, 0x0C4, 0x0C5, 0x0C6];

let ready = null;
let emu = null;
let arch = 's370';
let running = false;
let terminals = [];
let versions = new Map();
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

const SLICE_MS = 12;
const FAST_IDLE_MS = 500;   // temps simulé d'une tranche quand les attentes sont sautées
const MAX_LAG_MS = 200;

function post(msg, transfer) {
  self.postMessage(msg, transfer ?? []);
}

async function openVolume(file) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('dasd');
  const fh = await dir.getFileHandle(file);
  const h = await fh.createSyncAccessHandle();
  handles.push(h);
  return syncDisk(h);
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
  };
}

/** Ombre de la page d'un volume lu sur place (OPFS, dossier shadow; créée vide). */
async function openOverlay(name) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('shadow', { create: true });
  const fh = await dir.getFileHandle(name, { create: true });
  const h = await fh.createSyncAccessHandle();
  handles.push(h);
  return syncDisk(h);
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
  await ready;
  arch = cfg.arch === 'z' ? 'z' : 's370';
  emu = arch === 'z' ? Emulator.newZ(cfg.mem, Date.now() / 1000) : new Emulator(cfg.mem, Date.now() / 1000);
  if (cfg.loadparm) emu.set_loadparm(cfg.loadparm);
  const infos = [];
  for (const v of cfg.volumes) {
    const disk = await openVolume(v.file);
    infos.push({ addr: v.addr, info: emu.attach_dasd(v.addr, disk) });
  }
  for (const m of cfg.mounts ?? []) {
    emu.mount_begin(blobDisk(m.file));
    for (const s of m.shadows) emu.mount_shadow(blobDisk(s));
    infos.push({ addr: m.addr, info: emu.mount_finish(m.addr, await openOverlay(m.overlay)) });
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
  for (const d of of('tape')) emu.attach_tape(d.addr);
  // Tous les terminaux locaux de la configuration sont branchés (VTAM les attend : 0C0-0C6
  // pour TK5); la page n'en montre que le nombre choisi.
  terminals = cfg.terminals;
  for (const a of LOCAL_TERMS) emu.attach_terminal(a, 24, 80, 24, 80);
  versions = new Map();
  if (cfg.boot) {
    // Linux : noyau, paramètres, image initiale, chacun suivi d'une fin de fichier.
    emu.reader_load_binary(READER, await bootFile('kernel'));
    emu.reader_load_binary(READER, new TextEncoder().encode(cfg.boot.parm || ' '));
    emu.reader_load_binary(READER, await bootFile('initrd'));
  }
  if (!emu.ipl(cfg.ipl)) throw new Error(`IPL ${cfg.ipl.toString(16).toUpperCase()} — ${infos.map((v) => v.info).join(', ')} — ${emu.disk_error()}`);
  emu.set_ns_per_inst(1000 / mips);
  post({ type: 'started', volumes: infos });
  running = true;
  relayUrl = cfg.relay || null;
  openRelay();
  autoShutdown = false;
  // Pas d'opérateur automatique de TK5 en z/Architecture (ni d'attentes sautées).
  initDone = arch === 'z';
  shutdownWanted = false;
  autoSeen = '';
  simBase = 0;
  realBase = performance.now();
  statTime = performance.now();
  statInst = 0;
  setTimeout(tick, 0);
}

function stop(reason) {
  running = false;
  closeRelay();
  relayStatus('off');
  if (emu) {
    try { emu.flush(); } catch { /* rien */ }
  }
  closeVolumes();
  emu?.free();
  emu = null;
  post({ type: 'stopped', reason });
}

// Relais TN3270 (ibmz-relay sur ce PC) : les clients TN3270 du réseau local prennent un
// terminal libre. Messages binaires : genre, connexion (4 octets), données; genres :
// 1 nouveau client (type de terminal), 2 client parti, 3 enregistrement.
let relayUrl = null;
let relay = null;
let relayTimer = 0;
const remotes = new Map(); // connexion -> {addr, ttype}

function relayStatus(state) {
  post({
    type: 'relay',
    state,
    url: relayUrl,
    clients: [...remotes.values()].map((r) => ({ addr: r.addr, ttype: r.ttype })),
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
  ws.onopen = () => relayStatus('open');
  ws.onmessage = (e) => {
    if (!emu || !(e.data instanceof ArrayBuffer)) return;
    const m = new Uint8Array(e.data);
    if (m.length < 5) return;
    const conn = new DataView(m.buffer).getUint32(1);
    const data = m.subarray(5);
    if (m[0] === 1) {
      const addr = freeTerminal();
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
      relayStatus('open');
    } else if (m[0] === 3) {
      const r = remotes.get(conn);
      if (r) emu.term_input(r.addr, data);
    }
  };
  ws.onclose = () => {
    if (relay !== ws) return;
    relay = null;
    dropRemotes();
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

/** Sorties de la machine : console, écrans changés, imprimantes. */
function drain() {
  if (remotes.size) sendRemotes();
  const text = emu.console_take(CONSOLE);
  if (text) post({ type: 'console', text });
  autoOperator(text);
  for (const a of terminals) {
    const v = emu.term_version(a);
    if (v !== versions.get(a)) {
      versions.set(a, v);
      const data = emu.term_render(a);
      post({ type: 'screen', addr: a, data }, [data.buffer]);
    }
  }
  for (const p of [...PRINTERS, ...PUNCHES]) {
    const out = emu.printer_take(p);
    if (out) post({ type: 'printer', addr: p, text: out });
  }
}

function tick() {
  if (!running) return;
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
  const fast = autoShutdown || (turbo && !initDone);
  if (fast && emu.waiting()) ms = Math.max(ms, FAST_IDLE_MS);
  else if (turbo && !emu.waiting()) ms = Math.max(ms, SLICE_MS * 4);
  const maxInst = Math.round(mips * 1000 * SLICE_MS);
  let state = 'run';
  if (ms > 0) {
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
  const t1 = performance.now();
  // Voyants d'activité du pupitre (disques, imprimantes, lecteurs) : au plus toutes les 50 ms.
  activity |= emu.take_activity();
  if (activity && t1 - activityTime >= 50) {
    post({ type: 'leds', mask: activity });
    activity = 0;
    activityTime = t1;
  }
  if (t1 - statTime >= 1000) {
    const rate = statInst / (t1 - statTime) / 1000;
    statInst = 0;
    post({ type: 'stats', mips: rate, psw: emu.psw(), wait: emu.waiting(), io: emu.io_count(), simMs: emu.now_ms(), dbg: `t=${target.toFixed(0)} now=${emu.now_ms().toFixed(0)} mips=${mips.toFixed(1)} ms=${ms.toFixed(1)}` });
    const err = emu.disk_error();
    if (err) post({ type: 'error', msg: err });
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
      case 'console':
        if (emu && !emu.console_type(CONSOLE, data.text)) post({ type: 'console-refused' });
        break;
      case 'shutdown':
        // Arrêt propre de TK5 : la procédure SHUTDOWN de MVS.
        if (emu) {
          shutdownWanted = true;
          if (initDone) emu.console_type(CONSOLE, 'S SHUTDOWN');
        }
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
      case 'stop':
        if (emu) {
          drain();
          stop('user');
        }
        post({ type: 'closed' });
        break;
    }
  } catch (e) {
    post({ type: 'error', msg: e?.message ?? String(e) });
    if (data.type === 'start') {
      closeVolumes();
      emu = null;
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

ready = init(new URL(`./pkg/ibmz_web_bg.wasm${version}`, import.meta.url)).then(() => post({ type: 'ready' }));
