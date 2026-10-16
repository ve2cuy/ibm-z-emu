// Gestionnaire de volumes (étape 1 de docs/edition-volumes.md : lecture seule) : parcourt
// les volumes MVS rangés dans le fureteur, leur VTOC, les membres des bibliothèques, et
// affiche ou exporte un fichier ou un membre. Le travail est fait par le module wasm
// (crates/mvsvol) dans un fil : vol-worker.js quand la machine est arrêtée, le fil de la
// machine (worker.js) quand elle tourne, car lui seul tient alors les images.

import { t } from './i18n.js?v=088d4ad6';

const TEXT_MAX = 8 * 1024 * 1024;  // octets lus pour l'affichage en texte
const HEX_MAX = 64 * 1024;         // octets montrés en hexadécimal
const HIDDEN = /^(PAGE|SPOOL)/;    // volumes de pagination et de spool : masqués

let ctx = null;          // { volumes(), running(), worker(), version }
let volWorker = null;
let callId = 0;
const pending = new Map();
// Numéro de navigation : une lecture dépassée par une action plus récente est abandonnée.
let nav = 0;

const state = {
  vols: [],              // [{file, addr, info}] (volumes montrés)
  file: null,            // volume choisi
  datasets: [],
  dataset: null,         // fichier ouvert (bibliothèque ou séquentiel)
  members: [],
  member: null,
  view: null,            // {text, records, bytes, truncated, dataset}
  raw: null,             // Uint8Array (hexadécimal, export binaire)
  mode: 'text',
  cols80: false,
  filter: '',
};

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ appels

/** Réponse d'un fil (vol-worker.js ou worker.js) à un appel. */
export function volSettle(msg) {
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  if (msg.ok) p.resolve(msg.result);
  else p.reject(new Error(msg.error));
}

function call(op, args = {}) {
  const vol = state.vols.find((v) => v.file === (args.file ?? state.file));
  const id = ++callId;
  const msg = { id, op, dsn: args.dsn ?? '', member: args.member ?? '', limit: args.limit ?? 0 };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    if (ctx.running()) {
      ctx.worker().postMessage({ type: 'vol', addr: vol?.addr ?? args.addr, ...msg });
    } else {
      volWorker ??= new Worker(new URL(`./vol-worker.js${ctx.version}`, import.meta.url), { type: 'module' });
      volWorker.onmessage = ({ data }) => volSettle(data);
      volWorker.onerror = (e) => {
        for (const [, p] of pending) p.reject(new Error(e.message || 'vol-worker.js'));
        pending.clear();
      };
      volWorker.postMessage({ file: args.file ?? state.file, ...msg });
    }
  });
}

function errorText(e) {
  const [code, detail = ''] = String(e?.message ?? e).split('|');
  const key = `vm.err.${code}`;
  const text = t(key, { detail });
  return text === key ? String(e?.message ?? e) : text;
}

function status(text, isError = false) {
  const s = $('vm-status');
  s.textContent = text;
  s.classList.toggle('error', isError);
}

async function guard(fn) {
  try {
    await fn();
  } catch (e) {
    status(errorText(e), true);
  }
}

// ------------------------------------------------------------------ mise en forme

function fmtDate(d) {
  if (!d) return '';
  const [y, day] = d;
  const dt = new Date(Date.UTC(y, 0, day));
  return dt.toISOString().slice(0, 10);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function row(cells, onOpen) {
  const tr = el('tr');
  for (const [text, cls] of cells) tr.append(el('td', cls, text ?? ''));
  if (onOpen) {
    tr.tabIndex = 0;
    tr.classList.add('vm-open');
    tr.addEventListener('click', onOpen);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') onOpen(); });
  }
  return tr;
}

function head(keys) {
  const tr = el('tr');
  for (const k of keys) tr.append(el('th', null, t(k)));
  return tr;
}

/** Filtre : « HERC01.* » (motif, * et %), sinon texte contenu. */
function matches(name) {
  const f = state.filter.trim().toUpperCase();
  if (!f) return true;
  if (/[*%]/.test(f)) {
    const re = new RegExp(`^${f.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.')}$`);
    return re.test(name);
  }
  return name.includes(f);
}

function hexDump(bytes) {
  const lines = [];
  const n = Math.min(bytes.length, HEX_MAX);
  for (let off = 0; off < n; off += 16) {
    const chunk = bytes.subarray(off, Math.min(off + 16, n));
    const hex = [...chunk].map((b) => b.toString(16).toUpperCase().padStart(2, '0'));
    const groups = [];
    for (let i = 0; i < 16; i += 4) groups.push(hex.slice(i, i + 4).join('').padEnd(8, ' '));
    const txt = [...chunk].map((b) => E2A_SHOW[b]).join('');
    lines.push(`${off.toString(16).toUpperCase().padStart(6, '0')}  ${groups.join(' ')}  ${txt}`);
  }
  if (bytes.length > n) lines.push(t('vm.hex.more', { n: bytes.length - n }));
  return lines.join('\n');
}

// EBCDIC 037 -> caractère montré dans le vidage (point pour les caractères de commande).
const E2A_SHOW = (() => {
  const out = new Array(256).fill('.');
  const runs = [[0x81, 'abcdefghi'], [0x91, 'jklmnopqr'], [0xA2, 'stuvwxyz'], [0xC1, 'ABCDEFGHI'],
    [0xD1, 'JKLMNOPQR'], [0xE2, 'STUVWXYZ'], [0xF0, '0123456789']];
  for (const [at, s] of runs) [...s].forEach((c, i) => { out[at + i] = c; });
  const punct = { 0x40: ' ', 0x4A: '¢', 0x4B: '.', 0x4C: '<', 0x4D: '(', 0x4E: '+', 0x4F: '|', 0x50: '&',
    0x5A: '!', 0x5B: '$', 0x5C: '*', 0x5D: ')', 0x5E: ';', 0x5F: '¬', 0x60: '-', 0x61: '/', 0x6A: '¦',
    0x6B: ',', 0x6C: '%', 0x6D: '_', 0x6E: '>', 0x6F: '?', 0x79: '`', 0x7A: ':', 0x7B: '#', 0x7C: '@',
    0x7D: "'", 0x7E: '=', 0x7F: '"', 0xA1: '~', 0xBA: '[', 0xBB: ']', 0xC0: '{', 0xD0: '}', 0xE0: '\\' };
  for (const [k, v] of Object.entries(punct)) out[k] = v;
  return out;
})();

function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

function exportName(ext) {
  const base = state.member ? `${state.dataset.name}.${state.member.name}` : state.dataset.name;
  return `${base}.${ext}`;
}

// ------------------------------------------------------------------ affichage

function showPane(which) {
  for (const p of ['datasets', 'members', 'viewer']) $(`vm-${p}`).hidden = p !== which;
}

function crumbs() {
  const box = $('vm-path');
  box.replaceChildren();
  const vol = state.vols.find((v) => v.file === state.file);
  const add = (text, fn) => {
    if (box.children.length) box.append(el('span', 'vm-sep', '›'));
    const b = el(fn ? 'button' : 'span', fn ? 'vm-crumb' : 'vm-crumb current', text);
    if (fn) {
      b.type = 'button';
      b.addEventListener('click', fn);
    }
    box.append(b);
  };
  const atDs = !!state.dataset;
  add(vol?.info?.volser ?? state.file ?? '', atDs ? () => openVolume(state.file, true) : null);
  if (atDs) add(state.dataset.name, state.member ? () => openDataset(state.dataset) : null);
  if (state.member) add(state.member.name, null);
}

function renderSummary() {
  const v = state.vols.find((x) => x.file === state.file)?.info;
  $('vm-summary').textContent = v
    ? t('vm.summary', { volser: v.volser, type: v.devtype, cyls: v.cyls, n: v.datasets, free: v.freeTracks, dscbs: v.freeDscbs })
    : '';
  $('vm-mode').textContent = t(ctx.running() ? 'vm.mode.running' : 'vm.mode.stopped');
}

function renderDatasets() {
  const table = $('vm-ds-table');
  table.replaceChildren(head(['vm.col.name', 'vm.col.dsorg', 'vm.col.recfm', 'vm.col.lrecl', 'vm.col.blksize', 'vm.col.tracks', 'vm.col.created', 'vm.col.referenced']));
  const list = state.datasets.filter((d) => matches(d.name));
  for (const d of list) {
    table.append(row([
      [d.name, 'mono'], [d.dsorg, 'mono'], [d.recfm, 'mono'], [d.lrecl || '', 'num'], [d.blksize || '', 'num'],
      [`${d.used}/${d.tracks}`, 'num'], [fmtDate(d.created)], [fmtDate(d.referenced)],
    ], () => guard(() => openDataset(d))));
  }
  $('vm-count').textContent = t('vm.count', { n: list.length, total: state.datasets.length });
}

function renderMembers() {
  const table = $('vm-mem-table');
  table.replaceChildren(head(['vm.col.member', 'vm.col.vvmm', 'vm.col.created', 'vm.col.changed', 'vm.col.lines', 'vm.col.user']));
  const list = state.members.filter((m) => matches(m.name));
  for (const m of list) {
    const s = m.stats;
    const changed = s ? `${fmtDate(s.changed)} ${String(s.time[0]).padStart(2, '0')}:${String(s.time[1]).padStart(2, '0')}` : '';
    table.append(row([
      [m.alias ? `${m.name} (${t('vm.alias')})` : m.name, 'mono'],
      [s ? `${String(s.vv).padStart(2, '0')}.${String(s.mm).padStart(2, '0')}` : '', 'mono'],
      [s ? fmtDate(s.created) : ''], [changed], [s ? s.lines : '', 'num'], [s?.user ?? '', 'mono'],
    ], () => guard(() => openMember(m))));
  }
  $('vm-count').textContent = t('vm.count', { n: list.length, total: state.members.length });
}

function renderViewer() {
  const v = state.view;
  const out = $('vm-text');
  const lrecl80 = v.dataset.lrecl === 80 && v.dataset.recfm.startsWith('F');
  $('vm-cols').hidden = !lrecl80 || state.mode !== 'text';
  if (state.mode === 'hex') {
    out.textContent = state.raw ? hexDump(state.raw) : '';
  } else {
    let text = v.text;
    if (lrecl80 && !state.cols80) text = text.split('\n').map((l) => l.slice(0, 72).trimEnd()).join('\n');
    out.textContent = text;
  }
  for (const b of document.querySelectorAll('#vm-viewer [data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  $('vm-view-info').textContent = t(v.truncated ? 'vm.view.truncated' : 'vm.view.info', {
    records: v.records, bytes: v.bytes, recfm: v.dataset.recfm, lrecl: v.dataset.lrecl,
  });
}

// ------------------------------------------------------------------ navigation

async function openVolume(file, keepFilter = false) {
  const my = ++nav;
  state.file = file;
  state.dataset = null;
  state.member = null;
  if (!keepFilter) state.filter = $('vm-filter').value = '';
  status(t('vm.loading'));
  const list = await call('datasets');
  if (my !== nav) return;
  state.datasets = list;
  showPane('datasets');
  crumbs();
  renderSummary();
  renderDatasets();
  status('');
}

async function openDataset(d) {
  state.member = null;
  if (d.dsorg === 'PO') {
    const my = ++nav;
    status(t('vm.loading'));
    const list = await call('members', { dsn: d.name });
    if (my !== nav) return;
    state.members = list;
    state.dataset = d;
    state.filter = $('vm-filter').value = '';
    showPane('members');
    crumbs();
    renderMembers();
    status(state.members.length ? '' : t('vm.empty.pds'));
    return;
  }
  if (d.dsorg !== 'PS') {
    status(t('vm.unsupported', { dsorg: d.dsorg || '?' }), true);
    return;
  }
  state.dataset = d;
  await openView();
}

async function openMember(m) {
  state.member = m;
  await openView();
}

async function openView() {
  const my = ++nav;
  status(t('vm.loading'));
  const args = { dsn: state.dataset.name, member: state.member?.name ?? '', limit: TEXT_MAX };
  const view = await call('text', args);
  // Les modules de chargement (RECFM U) n'ont pas de texte : hexadécimal d'emblée.
  const hex = state.dataset.recfm.startsWith('U');
  const raw = hex ? await call('raw', { ...args, limit: HEX_MAX }) : null;
  if (my !== nav) return;
  state.view = view;
  state.raw = raw;
  state.mode = hex ? 'hex' : 'text';
  showPane('viewer');
  crumbs();
  renderViewer();
  $('vm-text').scrollTop = 0;
  status(state.view.records ? '' : t('vm.empty.file'));
}

async function setMode(mode) {
  state.mode = mode;
  if (mode === 'hex' && !state.raw) {
    state.raw = await call('raw', { dsn: state.dataset.name, member: state.member?.name ?? '', limit: HEX_MAX });
  }
  renderViewer();
}

async function fillVolumes() {
  const list = [];
  for (const v of ctx.volumes()) {
    try {
      const info = await call('info', { file: v.file, addr: v.addr });
      if (!HIDDEN.test(info.volser)) list.push({ ...v, info });
    } catch {
      // Pas un volume MVS (pas de VOL1 ni de VTOC) : montré quand même, sans détail.
      list.push({ ...v, info: null });
    }
  }
  state.vols = list;
  const sel = $('vm-volume');
  sel.replaceChildren();
  for (const v of list) {
    const o = el('option', null, v.info ? `${v.info.volser}  (${v.file})` : v.file);
    o.value = v.file;
    sel.append(o);
  }
  return list;
}

/** Ouvre la fenêtre. */
export async function openVolumes() {
  const dlg = $('vm');
  if (!dlg.open) dlg.showModal();
  const my = ++nav;
  showPane('datasets');
  $('vm-ds-table').replaceChildren();
  $('vm-path').replaceChildren();
  $('vm-summary').textContent = $('vm-count').textContent = '';
  await guard(async () => {
    status(t('vm.loading'));
    const list = await fillVolumes();
    if (my !== nav) return;
    if (!list.length) {
      showPane('datasets');
      $('vm-ds-table').replaceChildren();
      status(t('vm.novolumes'));
      return;
    }
    const keep = list.some((v) => v.file === state.file) ? state.file : (list.find((v) => v.info?.volser === 'TSO001') ?? list[0]).file;
    $('vm-volume').value = keep;
    await openVolume(keep);
  });
}

/** Prépare la fenêtre; rend la fonction qui refait les textes (changement de langue). */
export function initVolumes(context) {
  ctx = context;
  const dlg = $('vm');
  dlg.querySelector('.vm-close').addEventListener('click', () => dlg.close());
  $('vm-volume').addEventListener('change', (e) => guard(() => openVolume(e.target.value)));
  $('vm-filter').addEventListener('input', (e) => {
    state.filter = e.target.value;
    if (!$('vm-members').hidden) renderMembers();
    else if (!$('vm-datasets').hidden) renderDatasets();
  });
  $('vm-refresh').addEventListener('click', () => guard(async () => {
    await fillVolumes();
    $('vm-volume').value = state.file;
    if (state.member) await openView();
    else if (state.dataset?.dsorg === 'PO') await openDataset(state.dataset);
    else if (state.dataset) await openView();
    else await openVolume(state.file, true);
  }));
  for (const b of document.querySelectorAll('#vm-viewer [data-mode]')) {
    b.addEventListener('click', () => guard(() => setMode(b.dataset.mode)));
  }
  $('vm-cols80').addEventListener('change', (e) => { state.cols80 = e.target.checked; renderViewer(); });
  $('vm-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('vm-text').textContent);
      status(t('vm.copied'));
    } catch { /* presse-papiers refusé */ }
  });
  $('vm-export-text').addEventListener('click', () => {
    if (state.view) download(exportName('txt'), state.view.text, 'text/plain');
  });
  $('vm-export-bin').addEventListener('click', () => guard(async () => {
    const raw = await call('raw', { dsn: state.dataset.name, member: state.member?.name ?? '', limit: 2 ** 31 - 1 });
    download(exportName('bin'), raw, 'application/octet-stream');
  }));
  return () => {
    if (!dlg.open) return;
    renderSummary();
    crumbs();
    if (!$('vm-members').hidden) renderMembers();
    else if (!$('vm-viewer').hidden && state.view) renderViewer();
    else renderDatasets();
  };
}
