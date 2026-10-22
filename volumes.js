// Gestionnaire de volumes (docs/edition-volumes.md) : parcourt les volumes MVS rangés dans
// le fureteur, leur VTOC, les membres des bibliothèques; affiche, édite, crée, renomme,
// supprime, importe et exporte. Lecture par le module wasm (crates/mvsvol) dans un fil :
// vol-worker.js quand la machine est arrêtée, le fil de la machine (worker.js) quand elle
// tourne, car lui seul tient alors les images. Écriture : directe machine arrêtée
// (vol-worker.js), par des travaux que MVS exécute quand il tourne (vol-jobs.js).

import { t } from './i18n.js?v=0f206423';
import {
  JobTracker, compressJcl, createJcl, deleteJcl, jobName, listcatJcl, memberJcl, renameJcl, saveJcl,
} from './vol-jobs.js?v=0f206423';

const TEXT_MAX = 8 * 1024 * 1024;  // octets lus pour l'affichage en texte
const HEX_MAX = 64 * 1024;         // octets montrés en hexadécimal
const HIDDEN = /^(PAGE|SPOOL)/;    // volumes de pagination et de spool : masqués

let ctx = null;          // { volumes(), running(), worker(), version, prefs, savePrefs, submit }
let jobs = null;         // JobTracker (MVS en marche)
const confirmed = new Set(); // volumes déjà acceptés pour l'écriture directe (cette session)
// Volumes ouverts du disque (File, lecture seule, cette session) :
// {file: 'ext:…', name, blob, shadows: [File]} (ombres de Hercules dans l'ordre de création).
// Pas branchés sur la machine : toujours lus par vol-worker.js, sans copie.
const external = [];
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
  editing: null,         // {dsn, member, isNew, original, recfm, lrecl}
  lastJob: null,         // {name, output, rcs, maxRc, ok}
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
  const blob = args.blob ?? vol?.blob;
  const id = ++callId;
  const msg = { ...args, id, op, dsn: args.dsn ?? '', member: args.member ?? '', limit: args.limit ?? 0 };
  delete msg.file;
  delete msg.addr;
  if (blob) {
    msg.blob = blob;
    msg.shadows = args.shadows ?? vol?.shadows ?? [];
  }
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    if (ctx.running() && !blob) {
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

/** Bouton d'action d'une ligne (sans ouvrir la ligne). */
function action(icon, title, fn) {
  const b = el('button', 'icon-button small');
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.innerHTML = `<svg class="icon"><use href="#i-${icon}"/></svg>`;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    guard(fn);
  });
  return b;
}

function row(cells, onOpen, actions = []) {
  const tr = el('tr');
  for (const [text, cls] of cells) tr.append(el('td', cls, text ?? ''));
  const td = el('td', 'vm-actions');
  td.append(...actions);
  tr.append(td);
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
  tr.append(el('th'));
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
    0x7D: "'", 0x7E: '=', 0x7F: '"', 0xA1: '~', 0xAD: '[', 0xBD: ']', 0xC0: '{', 0xD0: '}', 0xE0: '\\' };
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
  for (const p of ['datasets', 'members', 'viewer', 'editor', 'job']) $(`vm-${p}`).hidden = p !== which;
  $('vm-back').hidden = which === 'datasets';
  renderTools();
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
  $('vm-mode').textContent = t(vol()?.blob ? 'vm.mode.external' : ctx.running() ? 'vm.mode.running' : 'vm.mode.stopped');
}

function renderDatasets() {
  const table = $('vm-ds-table');
  table.replaceChildren(head(['vm.col.name', 'vm.col.dsorg', 'vm.col.recfm', 'vm.col.lrecl', 'vm.col.blksize', 'vm.col.tracks', 'vm.col.created', 'vm.col.referenced']));
  const list = state.datasets.filter((d) => matches(d.name));
  for (const d of list) {
    const acts = [];
    if (ctx.running() && !vol()?.blob && !d.dsorg.startsWith('VS')) {
      if (d.dsorg === 'PO') acts.push(action('archive', t('vm.compress'), () => compress(d.name)));
      acts.push(action('pencil', t('vm.rename'), () => renameDataset(d)));
      acts.push(action('trash', t('vm.delete'), () => deleteDataset(d)));
    }
    table.append(row([
      [d.name, 'mono'], [d.dsorg, 'mono'], [d.recfm, 'mono'], [d.lrecl || '', 'num'], [d.blksize || '', 'num'],
      [`${d.used}/${d.tracks}`, 'num'], [fmtDate(d.created)], [fmtDate(d.referenced)],
    ], () => guard(() => openDataset(d)), acts));
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
    ], () => guard(() => openMember(m)), editable() ? [
      action('pencil', t('vm.rename'), () => renameMember(m.name)),
      action('trash', t('vm.delete'), () => deleteMember(m.name)),
    ] : []));
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
  $('vm-edit').hidden = !editable() || !textual(v.dataset) || v.truncated;
  $('vm-view-import').hidden = !editable() || v.dataset.dsorg !== 'PS' || !textual(v.dataset);
  $('vm-view-binimport').hidden = ctx.running() || !vol()?.info || !!vol().blob || v.dataset.dsorg !== 'PS' || !v.dataset.recfm.startsWith('F');
  $('vm-view-info').textContent = t(v.truncated ? 'vm.view.truncated' : 'vm.view.info', {
    records: v.records, bytes: v.bytes, recfm: v.dataset.recfm, lrecl: v.dataset.lrecl,
  });
}

// ------------------------------------------------------------------ écriture

const vol = () => state.vols.find((v) => v.file === state.file);
const creds = () => ({ user: ctx.prefs.jobUser || 'HERC01', password: ctx.prefs.jobPassword || 'CUL8TR' });

/** Texte modifiable : F ou V (pas U, pas VSAM). */
function textual(d) {
  return /^[FV]/.test(d.recfm) && (d.dsorg === 'PO' || d.dsorg === 'PS');
}

/** Écriture possible : directe (machine arrêtée) ou par travaux (MVS en marche, volume MVS). */
function editable() {
  return !!vol()?.info && !vol().blob && (!ctx.running() || !!jobs);
}

/** MVS en marche : les travaux passent par des cartes de 80 colonnes (F, LRECL 80 au plus). */
function jobFits(d) {
  return d.recfm.startsWith('F') && d.lrecl > 0 && d.lrecl <= 80;
}

function stamp() {
  const d = new Date();
  const day = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 0)) / 864e5);
  return [d.getFullYear(), day, d.getHours(), d.getMinutes(), d.getSeconds()];
}

/** Lignes changées (pour les statistiques ISPF). */
function changedLines(a, b) {
  const x = (a ?? '').split('\n');
  const y = b.split('\n');
  let n = Math.abs(x.length - y.length);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i].trimEnd() !== y[i].trimEnd()) n++;
  return n;
}

/** Première écriture directe sur un volume (cette session) : confirmation. */
function confirmDirect() {
  const v = vol();
  if (confirmed.has(v.file)) return true;
  if (!confirm(t('vm.confirm.direct', { volser: v.info?.volser ?? v.file }))) return false;
  confirmed.add(v.file);
  return true;
}

/** Travail MVS : écrit, soumis, suivi; rend son résultat (lève si en échec). */
async function runJob(build, args, quiet = false) {
  const name = jobName();
  const v = vol();
  const text = build({ name, ...creds(), volser: v?.info?.volser, devtype: v?.info?.devtype, ...args });
  status(t('vm.job.running', { name }));
  const res = await jobs.run(name, text);
  res.ok = !res.jclError && !res.abend && res.maxRc <= 4;
  state.lastJob = res;
  renderJobBar();
  if (!res.ok && !quiet) throw new Error(`jobfail|${name}`);
  return res;
}

async function saveText(dsn, member, text, original) {
  if (!ctx.running()) {
    if (!confirmDirect()) return false;
    await call('write', { wop: 'save', dsn, member, text, user: creds().user, changed: changedLines(original, text), stamp: stamp() });
  } else {
    const d = state.datasets.find((x) => x.name === dsn) ?? state.dataset;
    if (!jobFits(d)) throw new Error('jobwide|');
    await runJob(saveJcl, { dsn, member, text });
  }
  return true;
}

async function refreshAfterWrite() {
  await fillVolumes();
  $('vm-volume').value = state.file;
  state.datasets = await call('datasets');
  if (state.dataset) state.dataset = state.datasets.find((d) => d.name === state.dataset.name) ?? state.dataset;
  renderSummary();
}

async function deleteMember(name) {
  if (!confirm(t('vm.confirm.delmember', { name: `${state.dataset.name}(${name})` }))) return;
  if (!ctx.running()) {
    if (!confirmDirect()) return;
    await call('write', { wop: 'delete', dsn: state.dataset.name, member: name });
  } else {
    await runJob(memberJcl, { dsn: state.dataset.name, member: name });
  }
  await refreshAfterWrite();
  await openDataset(state.dataset);
  status(t('vm.done.delete', { name }));
}

async function renameMember(name) {
  const to = prompt(t('vm.ask.rename', { name }), name)?.trim().toUpperCase();
  if (!to || to === name) return;
  if (!MEMBER_RE.test(to)) throw new Error(`badname|${to}`);
  if (!ctx.running()) {
    if (!confirmDirect()) return;
    await call('write', { wop: 'rename', dsn: state.dataset.name, member: name, to });
  } else {
    await runJob(memberJcl, { dsn: state.dataset.name, member: name, to });
  }
  await refreshAfterWrite();
  await openDataset(state.dataset);
  status(t('vm.done.rename', { name, to }));
}

const MEMBER_RE = /^[A-Z@#$][A-Z0-9@#$]{0,7}$/;
const DSN_RE = /^(?=.{1,44}$)[A-Z@#$][A-Z0-9@#$-]{0,7}(\.[A-Z@#$][A-Z0-9@#$-]{0,7})*$/;

async function newMember() {
  const name = prompt(t('vm.ask.member'))?.trim().toUpperCase();
  if (!name) return;
  if (!MEMBER_RE.test(name)) throw new Error(`badname|${name}`);
  const old = state.members.find((m) => m.name === name);
  if (old) {
    await openMember(old);
    return;
  }
  if (ctx.running() && !jobFits(state.dataset)) throw new Error('jobwide|');
  state.member = { name, stats: null };
  openEditor('', true);
}

/** Importe des fichiers du PC : membres (nom d'après le fichier) ou contenu d'un séquentiel. */
async function importFiles(files) {
  const d = state.dataset;
  if (d.dsorg === 'PS') {
    const f = files[0];
    if (!confirm(t('vm.confirm.replace', { name: d.name, file: f.name }))) return;
    await saveText(d.name, '', await f.text(), state.view?.text);
    await refreshAfterWrite();
    await openView();
    status(t('vm.done.import', { n: 1 }));
    return;
  }
  const plan = [];
  for (const f of files) {
    const name = f.name.replace(/\.[^.]*$/, '').toUpperCase().replace(/[^A-Z0-9@#$]/g, '').slice(0, 8);
    if (!MEMBER_RE.test(name)) throw new Error(`badname|${f.name}`);
    plan.push({ f, name });
  }
  const existing = plan.filter((p) => state.members.some((m) => m.name === p.name)).map((p) => p.name);
  if (!confirm(t(existing.length ? 'vm.confirm.import.replace' : 'vm.confirm.import', {
    n: plan.length, names: plan.map((p) => p.name).join(', '), replaced: existing.join(', '),
  }))) return;
  let n = 0;
  for (const { f, name } of plan) {
    status(t('vm.importing', { name }));
    if (await saveText(d.name, name, await f.text(), '')) n++;
  }
  await refreshAfterWrite();
  await openDataset(state.dataset);
  status(t('vm.done.import', { n }));
}

// --- éditeur

function openEditor(text, isNew = false) {
  const d = state.dataset;
  state.editing = { dsn: d.name, member: state.member?.name ?? '', isNew, original: text, recfm: d.recfm, lrecl: d.lrecl };
  const ta = $('vm-edit-text');
  ta.value = text;
  $('vm-caps').checked = !!ctx.prefs.vmCaps;
  const f80 = d.recfm.startsWith('F') && d.lrecl === 80;
  $('vm-num-box').hidden = !f80;
  $('vm-num').value = 'keep';
  showPane('editor');
  crumbs();
  editInfo();
  ta.focus();
  ta.setSelectionRange(0, 0);
  ta.scrollTop = 0;
  status(t(ctx.running() ? 'vm.edit.byjob' : 'vm.edit.direct'));
}

function editInfo() {
  const e = state.editing;
  if (!e) return;
  const ta = $('vm-edit-text');
  const before = ta.value.slice(0, ta.selectionStart);
  const line = before.split('\n').length;
  const col = before.length - before.lastIndexOf('\n');
  const max = e.recfm.startsWith('V') ? e.lrecl - 4 : e.lrecl;
  const long = ta.value.split('\n').findIndex((l) => l.replace(/\t/g, '        ').trimEnd().length > max);
  $('vm-edit-info').textContent = t('vm.edit.info', { line, col, lines: ta.value.split('\n').length, recfm: e.recfm, lrecl: e.lrecl })
    + (long >= 0 ? ` ${t('vm.edit.long', { n: long + 1, max })}` : '');
  $('vm-edit-info').classList.toggle('error', long >= 0);
}

/** Texte à ranger : majuscules et numéros des colonnes 73-80 selon les choix. */
function editedText() {
  let lines = $('vm-edit-text').value.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  if ($('vm-caps').checked) lines = lines.map((l) => l.toUpperCase());
  if (!$('vm-num-box').hidden) {
    const how = $('vm-num').value;
    if (how === 'clear') lines = lines.map((l) => l.slice(0, 72).trimEnd());
    if (how === 'renum') lines = lines.map((l, i) => l.slice(0, 72).padEnd(72) + String((i + 1) * 10000).padStart(8, '0'));
  }
  return lines.length ? `${lines.join('\n')}\n` : '';
}

async function saveEditor() {
  const e = state.editing;
  ctx.prefs.vmCaps = $('vm-caps').checked;
  ctx.savePrefs();
  const text = editedText();
  status(t('vm.saving'));
  if (!(await saveText(e.dsn, e.member, text, e.original))) return;
  state.editing = null;
  await refreshAfterWrite();
  if (e.member) {
    state.members = await call('members', { dsn: e.dsn });
    state.member = state.members.find((m) => m.name === e.member) ?? { name: e.member };
  }
  await openView();
  status(t('vm.done.save', { name: e.member ? `${e.dsn}(${e.member})` : e.dsn }));
}

function cancelEditor() {
  const e = state.editing;
  if (e && editedText() !== e.original && !confirm(t('vm.confirm.discard'))) return;
  state.editing = null;
  if (e?.isNew) guard(() => openDataset(state.dataset));
  else {
    showPane('viewer');
    crumbs();
    status('');
  }
}

// --- fichiers (MVS en marche)

async function compress(dsn) {
  await runJob(compressJcl, { dsn });
  await refreshAfterWrite();
  if (state.dataset?.name === dsn && !$('vm-members').hidden) await openDataset(state.dataset);
  else renderDatasets();
  status(t('vm.done.compress', { name: dsn }));
}

async function deleteDataset(d) {
  if (!confirm(t('vm.confirm.deldataset', { name: d.name }))) return;
  await runJob(deleteJcl, { dsn: d.name }, true);
  await refreshAfterWrite();
  if (state.datasets.some((x) => x.name === d.name)) throw new Error(`jobfail|${state.lastJob.name}`);
  renderDatasets();
  status(t('vm.done.delete', { name: d.name }));
}

async function renameDataset(d) {
  const to = prompt(t('vm.ask.rename', { name: d.name }), d.name)?.trim().toUpperCase();
  if (!to || to === d.name) return;
  if (!DSN_RE.test(to)) throw new Error(`badname|${to}`);
  await runJob(renameJcl, { dsn: d.name, to }, true);
  await refreshAfterWrite();
  if (!state.datasets.some((x) => x.name === to)) throw new Error(`jobfail|${state.lastJob.name}`);
  renderDatasets();
  status(t('vm.done.rename', { name: d.name, to }));
}

const PRESETS = {
  src: { dsorg: 'PO', recfm: 'FB', lrecl: 80, blksize: 3120, spaceUnit: 'TRK', primary: 15, secondary: 15, dirBlocks: 10 },
  seq: { dsorg: 'PS', recfm: 'FB', lrecl: 80, blksize: 3120, spaceUnit: 'TRK', primary: 5, secondary: 5, dirBlocks: 0 },
  vb: { dsorg: 'PO', recfm: 'VB', lrecl: 255, blksize: 3120, spaceUnit: 'TRK', primary: 15, secondary: 15, dirBlocks: 10 },
  load: { dsorg: 'PO', recfm: 'U', lrecl: 0, blksize: 6144, spaceUnit: 'TRK', primary: 15, secondary: 15, dirBlocks: 10 },
};

function fillNewForm(preset) {
  const p = PRESETS[preset];
  for (const [k, v] of Object.entries(p)) {
    const e = $(`vm-new-${k}`);
    if (e) e.value = String(v);
  }
}

async function newDataset() {
  const dlg = $('vm-new');
  const prefix = (ctx.prefs.jobUser || 'HERC01').toUpperCase();
  $('vm-new-name').value = `${prefix}.`;
  $('vm-new-preset').value = 'src';
  fillNewForm('src');
  $('vm-new-error').textContent = '';
  dlg.showModal();
  $('vm-new-name').focus();
}

async function submitNewDataset() {
  const val = (k) => $(`vm-new-${k}`).value.trim().toUpperCase();
  const args = {
    dsn: val('name'), dsorg: val('dsorg'), recfm: val('recfm'), lrecl: Number(val('lrecl')), blksize: Number(val('blksize')),
    spaceUnit: val('spaceUnit'), primary: Number(val('primary')), secondary: Number(val('secondary')), dirBlocks: Number(val('dirBlocks')),
  };
  const bad = !DSN_RE.test(args.dsn) ? 'name'
    : !(args.primary > 0) ? 'primary'
      : args.dsorg === 'PO' && !(args.dirBlocks > 0) ? 'dirBlocks'
        : !(args.blksize > 0 && args.blksize <= 32760) ? 'blksize'
          : args.recfm.startsWith('F') && args.recfm.includes('B') && (args.lrecl <= 0 || args.blksize % args.lrecl) ? 'blksize'
            : '';
  if (bad) {
    $('vm-new-error').textContent = t(`vm.new.bad.${bad}`);
    return;
  }
  $('vm-new').close();
  await runJob(createJcl, args);
  await refreshAfterWrite();
  renderDatasets();
  if (!state.datasets.some((d) => d.name === args.dsn)) {
    status(t('vm.new.elsewhere', { name: args.dsn }), true);
    return;
  }
  status(t('vm.done.create', { name: args.dsn }));
}

async function listCatalog() {
  const level = state.filter.trim().toUpperCase().replace(/\.\*.*$/, '').replace(/\*.*$/, '') || (ctx.prefs.jobUser || 'HERC01').toUpperCase();
  const r = await runJob(listcatJcl, { level }, true);
  showJob();
  status(t(r.ok ? 'vm.job.ok' : 'vm.job.bad', { name: r.name, rc: String(r.maxRc).padStart(4, '0') }), !r.ok);
}

// --- import binaire (fichier XMIT…), volume vierge

async function importBinary(file) {
  const d = state.dataset;
  if (ctx.running()) throw new Error('running|');
  if (!confirm(t('vm.confirm.binary', { name: d.name, file: file.name, lrecl: d.lrecl }))) return;
  if (!confirmDirect()) return;
  const bin = new Uint8Array(await file.arrayBuffer());
  await call('write', { wop: 'savebin', dsn: d.name, bin });
  await refreshAfterWrite();
  await openView();
  status(t('vm.done.binary', { name: d.name, bytes: bin.length }));
}

// Types d'unité et adresses que le MVS de TK5 connaît (SYS1.SYSGEN.CNTL(IOGEN)).
const MODELS = {
  '3390-1': { devtype: 0x3390, cyls: 1114, ranges: [[0x1F0, 16], [0x2F0, 16], [0x390, 16]] },
  '3390-2': { devtype: 0x3390, cyls: 2227, ranges: [[0x1F0, 16], [0x2F0, 16], [0x390, 16]] },
  '3390-3': { devtype: 0x3390, cyls: 3340, ranges: [[0x1F0, 16], [0x2F0, 16], [0x390, 16]] },
  3380: { devtype: 0x3380, cyls: 886, ranges: [[0x1E0, 16], [0x2E0, 16], [0x380, 16]] },
  3350: { devtype: 0x3350, cyls: 560, ranges: [[0x140, 16], [0x240, 16], [0x340, 16]] },
};

function freeAddresses(model) {
  const used = new Set(ctx.volumes().map((v) => v.addr));
  const out = [];
  for (const [first, n] of MODELS[model].ranges) {
    for (let a = first; a < first + n; a++) if (!used.has(a)) out.push(a);
  }
  return out;
}

function fillAddresses() {
  const sel = $('vm-nv-addr');
  sel.replaceChildren(...freeAddresses($('vm-nv-model').value).map((a) => {
    const h = a.toString(16).toUpperCase().padStart(3, '0');
    return new Option(h, String(a));
  }));
}

function newVolume() {
  $('vm-nv-volser').value = '';
  $('vm-nv-model').value = '3390-1';
  fillAddresses();
  $('vm-nv-error').textContent = '';
  $('vm-newvol').showModal();
  $('vm-nv-volser').focus();
}

async function submitNewVolume() {
  const volser = $('vm-nv-volser').value.trim().toUpperCase();
  const m = MODELS[$('vm-nv-model').value];
  const addr = Number($('vm-nv-addr').value);
  if (!/^[A-Z0-9@#$]{1,6}$/.test(volser)) {
    $('vm-nv-error').textContent = t('vm.nv.bad.volser');
    return;
  }
  if (!addr) {
    $('vm-nv-error').textContent = t('vm.nv.bad.addr');
    return;
  }
  if (state.vols.some((v) => v.info?.volser === volser)) {
    $('vm-nv-error').textContent = t('vm.nv.bad.dup', { volser });
    return;
  }
  $('vm-newvol').close();
  const hex = addr.toString(16).toUpperCase().padStart(3, '0');
  const file = `${volser.toLowerCase()}.${hex.toLowerCase()}`;
  status(t('vm.nv.creating', { volser }));
  // Fabriqué par le fil des volumes (module wasm), même machine en marche.
  const id = ++callId;
  const bytes = await new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    volWorker ??= new Worker(new URL(`./vol-worker.js${ctx.version}`, import.meta.url), { type: 'module' });
    volWorker.onmessage = ({ data }) => volSettle(data);
    volWorker.postMessage({ id, op: 'blank', devtype: m.devtype, cyls: m.cyls, volser });
  });
  await ctx.addVolume(file, bytes);
  if (!ctx.running()) {
    await fillVolumes();
    $('vm-volume').value = file;
    await openVolume(file);
  }
  status(t(ctx.running() ? 'vm.nv.done.later' : 'vm.nv.done', { volser, addr: hex }));
}

// --- sortie des travaux

function renderJobBar() {
  const j = state.lastJob;
  const bar = $('vm-jobbar');
  bar.hidden = !j;
  if (!j) return;
  $('vm-jobbar-text').textContent = t(j.ok ? 'vm.job.ok' : 'vm.job.bad', {
    name: j.name,
    rc: j.jclError ? 'JCL' : j.abend ? 'ABEND' : String(j.maxRc).padStart(4, '0'),
  });
  bar.classList.toggle('error', !j.ok);
}

let paneBeforeJob = 'datasets';

function showJob() {
  const j = state.lastJob;
  if (!j) return;
  const cur = ['datasets', 'members', 'viewer', 'editor'].find((p) => !$(`vm-${p}`).hidden);
  if (cur) paneBeforeJob = cur;
  $('vm-job-text').textContent = j.output.replace(/\f/g, `\n${'─'.repeat(60)}\n`) || t('prt.empty');
  $('vm-job-title').textContent = t('vm.job.output', { name: j.name });
  showPane('job');
}

/** Retour : un niveau plus haut (éditeur, sortie d'un travail, texte, membres). */
function goBack() {
  if (!$('vm-editor').hidden) cancelEditor();
  else if (!$('vm-job').hidden) showPane(paneBeforeJob);
  else if (!$('vm-viewer').hidden && state.member) guard(() => openDataset(state.dataset));
  else guard(() => openVolume(state.file, true));
}

/** Barre d'outils selon le volet et le mode. */
function renderTools() {
  const members = !$('vm-members').hidden;
  const datasets = !$('vm-datasets').hidden;
  const run = ctx.running();
  $('vm-mem-tools').hidden = !members || !editable();
  $('vm-mem-compress').hidden = !run;
  $('vm-ds-tools').hidden = !datasets || !vol()?.info || !!vol().blob;
  $('vm-ds-new').hidden = !run;
  $('vm-ds-catalog').hidden = !run;
  $('vm-ds-hint').hidden = run;
}

/** La machine démarre ou s'arrête : les actions possibles changent. */
export function volMachineChanged() {
  if (!$('vm').open) return;
  renderSummary();
  if (!$('vm-members').hidden) renderMembers();
  else if (!$('vm-datasets').hidden) renderDatasets();
  else if (!$('vm-viewer').hidden && state.view) renderViewer();
  renderTools();
}

/** Console (main.js) : fin des travaux. */
export function volConsole(text) {
  jobs?.console(text);
}

/** Imprimante 00F (main.js) : sortie des travaux. */
export function volPrinter(text) {
  jobs?.printer(text);
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
    const pdse = d.dsorg === 'PO-E' || d.dsorg === 'HFS';
    status(t(pdse ? 'vm.unsupported.pdse' : 'vm.unsupported', { dsorg: d.dsorg || '?' }), true);
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
  for (const v of external) {
    try {
      list.push({ ...v, info: await call('info', { blob: v.blob, shadows: v.shadows }) });
    } catch {
      list.push({ ...v, info: null });
    }
  }
  state.vols = list;
  const sel = $('vm-volume');
  sel.replaceChildren();
  const group = external.length ? el('optgroup') : null;
  if (group) group.label = t('vm.ext.group');
  for (const v of list) {
    const label = v.shadows?.length ? `${v.name} ${t('vm.ext.shadows', { n: v.shadows.length })}` : v.name ?? v.file;
    const o = el('option', null, v.info ? `${v.info.volser}  (${label})` : label);
    o.value = v.file;
    (v.blob ? group : sel).append(o);
  }
  if (group) sel.append(group);
  return list;
}

/** Nom sans extension (après le dernier point), en minuscules. */
function stem(name) {
  const i = name.lastIndexOf('.');
  return (i > 0 ? name.slice(0, i) : name).toLowerCase();
}

/**
 * Ombre de Hercules (en-tête CKD_S370) : nom de son image et numéro. Le gabarit sf= de
 * Hercules remplace par le numéro le caractère avant le dernier point (ou le dernier
 * caractère) : zares1_1 -> zares1, linux1_2.dsk -> linux1.
 */
async function shadowOf(f) {
  const id = await f.slice(0, 8).text().catch(() => '');
  if (id !== 'CKD_S370') return null;
  const s = stem(f.name);
  const n = Number(s.slice(-1));
  return { base: s.slice(0, -1).replace(/[_.-]$/, ''), n: Number.isNaN(n) ? 0 : n };
}

/** Volumes choisis sur le disque : ajoutés à la liste (lecture seule), le premier ouvert.
 *  Les ombres choisies avec (ou après) leur image s'y posent, dans l'ordre de leur numéro. */
async function openExternal(files) {
  let first = null;
  const shadows = [];
  for (const f of files) {
    const sh = await shadowOf(f);
    if (sh) {
      shadows.push({ f, ...sh });
      continue;
    }
    const file = `ext:${f.name}:${f.size}`;
    if (!external.some((v) => v.file === file)) external.push({ file, name: f.name, blob: f, shadows: [] });
    first ??= file;
  }
  const orphans = [];
  for (const s of shadows.sort((a, b) => a.n - b.n)) {
    const v = external.find((x) => stem(x.name) === s.base);
    if (!v) {
      orphans.push(s.f.name);
      continue;
    }
    if (!v.shadows.some((x) => x.name === s.f.name && x.size === s.f.size)) {
      v.shadows = [...v.shadows.filter((x) => x.name !== s.f.name), s.f];
      v.shadows.sort((a, b) => Number(stem(a.name).slice(-1)) - Number(stem(b.name).slice(-1)));
    }
    first ??= v.file;
  }
  status(t('vm.loading'));
  await fillVolumes();
  if (first) {
    $('vm-volume').value = first;
    await openVolume(first);
  }
  if (orphans.length) status(t('vm.ext.orphan', { names: orphans.join(', ') }), true);
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
  jobs = new JobTracker(ctx.submit);
  const dlg = $('vm');
  dlg.addEventListener('cancel', (e) => {
    // Échap dans l'éditeur : demander avant de perdre le texte.
    if (state.editing) {
      e.preventDefault();
      cancelEditor();
    }
  });
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
  // Écriture.
  $('vm-edit').addEventListener('click', () => {
    if (ctx.running() && !jobFits(state.dataset)) {
      status(errorText(new Error('jobwide|')), true);
      return;
    }
    openEditor(state.view.text);
  });
  $('vm-edit-text').addEventListener('input', editInfo);
  $('vm-edit-text').addEventListener('click', editInfo);
  $('vm-edit-text').addEventListener('keyup', editInfo);
  $('vm-edit-text').addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      document.execCommand('insertText', false, ' ');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      guard(saveEditor);
    }
  });
  $('vm-edit-save').addEventListener('click', () => guard(saveEditor));
  $('vm-edit-cancel').addEventListener('click', cancelEditor);
  $('vm-mem-new').addEventListener('click', () => guard(newMember));
  $('vm-mem-compress').addEventListener('click', () => guard(() => compress(state.dataset.name)));
  for (const id of ['vm-mem-file', 'vm-view-file']) {
    $(id).addEventListener('change', (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      if (files.length) guard(() => importFiles(files));
    });
  }
  $('vm-ds-new').addEventListener('click', () => guard(newDataset));
  $('vm-newvol-button').addEventListener('click', () => guard(newVolume));
  $('vm-ext-file').addEventListener('change', (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) guard(() => openExternal(files));
  });
  $('vm-nv-model').addEventListener('change', fillAddresses);
  $('vm-nv-ok').addEventListener('click', () => guard(submitNewVolume));
  $('vm-nv-cancel').addEventListener('click', () => $('vm-newvol').close());
  $('vm-view-bin').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) guard(() => importBinary(f));
  });
  $('vm-ds-catalog').addEventListener('click', () => guard(listCatalog));
  $('vm-new-preset').addEventListener('change', (e) => fillNewForm(e.target.value));
  $('vm-new-ok').addEventListener('click', () => guard(submitNewDataset));
  $('vm-new-cancel').addEventListener('click', () => $('vm-new').close());
  $('vm-jobbar-show').addEventListener('click', showJob);
  $('vm-back').addEventListener('click', goBack);
  $('vm-job-back').addEventListener('click', () => showPane(paneBeforeJob));
  $('vm-job-printer').addEventListener('click', () => {
    dlg.close();
    ctx.showPrinter(0x00F);
  });
  $('vm-job-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('vm-job-text').textContent); status(t('vm.copied')); } catch { /* refusé */ }
  });
  // Réglages des travaux (utilisateur et mot de passe RAKF).
  $('vm-user').value = ctx.prefs.jobUser || 'HERC01';
  $('vm-pass').value = ctx.prefs.jobPassword || 'CUL8TR';
  for (const [id, key] of [['vm-user', 'jobUser'], ['vm-pass', 'jobPassword']]) {
    $(id).addEventListener('change', (e) => {
      ctx.prefs[key] = e.target.value.trim().toUpperCase();
      e.target.value = ctx.prefs[key];
      ctx.savePrefs();
    });
  }
  $('vm-export-bin').addEventListener('click', () => guard(async () => {
    const raw = await call('raw', { dsn: state.dataset.name, member: state.member?.name ?? '', limit: 2 ** 31 - 1 });
    download(exportName('bin'), raw, 'application/octet-stream');
  }));
  return () => {
    if (!dlg.open) return;
    renderSummary();
    renderJobBar();
    crumbs();
    if (!$('vm-members').hidden) renderMembers();
    else if (!$('vm-viewer').hidden && state.view) renderViewer();
    else renderDatasets();
  };
}
