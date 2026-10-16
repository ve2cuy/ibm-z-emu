// Fil d'exécution de la machine : le S/370 tourne ici, hors du fil de la page. Le temps
// simulé suit le temps réel; si l'hôte ne suit pas, le retard est abandonné au-delà de
// 200 ms. En Turbo, quand le processeur travaille, le temps simulé va aussi vite que le
// fureteur le permet.
//
// Messages reçus : start {mem, ipl, volumes: [{addr, file}], terminals: [addr]},
// console {text} (ligne de l'opérateur), shutdown (arrêt propre de TK5 : S SHUTDOWN), key {addr, key}, char {addr, text},
// click {addr, pos}, interrupt, restart, submit {text} (cartes pour le lecteur 00C),
// turbo {on}, flush, stop.
// Messages envoyés : ready, started {volumes: [{addr, info}]}, console {text},
// screen {addr, data}, printer {addr, text}, stats {mips, psw, wait, io, simMs},
// shutdown {phase} (arrêt de TK5 en cours),
// stopped {reason}, closed, error {msg}, cards {left}.

import init, { Emulator } from './pkg/ibmz_web.js?v=ce8cbebc';

const version = new URL(import.meta.url).search;
const CONSOLE = 0x009;
const READER = 0x00C;
const PRINTERS = [0x00E, 0x00F, 0x002, 0x30E];
const PUNCHES = [0x00D, 0x10D];

let ready = null;
let emu = null;
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

const SLICE_MS = 12;
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

function closeVolumes() {
  for (const h of handles) {
    try {
      h.flush();
      h.close();
    } catch { /* déjà fermé */ }
  }
  handles.length = 0;
}

async function start(cfg) {
  await ready;
  emu = new Emulator(cfg.mem, Date.now() / 1000);
  const infos = [];
  for (const v of cfg.volumes) {
    const disk = await openVolume(v.file);
    infos.push({ addr: v.addr, info: emu.attach_dasd(v.addr, disk) });
  }
  emu.attach_console(CONSOLE);
  emu.attach_reader(READER);
  emu.attach_reader(0x10C);
  emu.attach_printer(0x00E, 0x1403);
  emu.attach_printer(0x00F, 0x1403);
  emu.attach_printer(0x002, 0x3211);
  emu.attach_printer(0x30E, 0x1403);
  for (const p of PUNCHES) emu.attach_punch(p);
  emu.attach_tape(0x480);
  // Les sept terminaux locaux de TK5 (0C0-0C6) sont toujours branchés : VTAM les attend;
  // la page n'en montre que le nombre choisi.
  terminals = cfg.terminals;
  for (let a = 0x0C0; a <= 0x0C6; a++) emu.attach_terminal(a, 24, 80, 24, 80);
  versions = new Map();
  if (!emu.ipl(cfg.ipl)) throw new Error(`IPL ${cfg.ipl.toString(16).toUpperCase()} — ${infos.map((v) => v.info).join(', ')} — ${emu.disk_error()}`);
  emu.set_ns_per_inst(1000 / mips);
  post({ type: 'started', volumes: infos });
  running = true;
  autoShutdown = false;
  initDone = false;
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
  if (emu) {
    try { emu.flush(); } catch { /* rien */ }
  }
  closeVolumes();
  emu?.free();
  emu = null;
  post({ type: 'stopped', reason });
}

// Opérateur automatique de l'arrêt de TK5 (comme les règles « hao » de Hercules) : la
// procédure SHUTDOWN de MVS demande « script scripts/shutdown » par DIAGNOSE X'008'.
let autoShutdown = false;
let autoSeen = '';
const AUTO_RULES = [['$HASP099', '$PJES2'], ['$HASP085', 'Z EOD'], ['IEE334I', 'QUIESCE']];
let autoDone = new Set();

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
      post({ type: 'shutdown', phase: 'started' });
      operatorLater('F BSPPILOT,SHUTNOW', 30000);
    }
  }
  if (!autoShutdown || !text) return;
  autoSeen = (autoSeen + text).slice(-20000);
  for (const [msg, cmd] of AUTO_RULES) {
    if (!autoDone.has(msg) && autoSeen.includes(msg)) {
      autoDone.add(msg);
      operatorLater(cmd, 3000);
    }
  }
}

/** Sorties de la machine : console, écrans changés, imprimantes. */
function drain() {
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
  if (turbo && !emu.waiting()) ms = Math.max(ms, SLICE_MS * 4);
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
  if (turbo && emu.now_ms() > target) {
    // En rafale : le temps simulé a pris de l'avance, la base suit.
    simBase += emu.now_ms() - target;
  }
  drain();
  const t1 = performance.now();
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
        emu?.console_type(CONSOLE, data.text);
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
      case 'turbo':
        turbo = !!data.on;
        break;
      case 'flush':
        emu?.flush();
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

ready = init(new URL(`./pkg/ibmz_web_bg.wasm${version}`, import.meta.url)).then(() => post({ type: 'ready' }));
