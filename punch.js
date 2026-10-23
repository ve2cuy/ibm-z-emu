// Perforatrice (comme une IBM 029) : un jeu de cartes s'écrit dans un éditeur, se perfore
// (une ligne = une carte de 80 colonnes), se parcourt carte par carte (perforations et texte
// imprimé de la carte courante), se garde dans une bibliothèque et se soumet au lecteur de
// cartes 00C. Les exemples (decks.js) ont tous été essayés sous MVS.

import { t } from './i18n.js?v=f57f733b';
import { DECKS } from './decks.js?v=f57f733b';

const COLS = 80;
const STORE_KEY = 'ibmz-decks';

// ------------------------------------------------------------------ code des cartes

const ROWS = ['12', '11', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const CODE = new Map();
(() => {
  const set = (ch, rows) => CODE.set(ch, rows);
  set(' ', []);
  for (let d = 0; d <= 9; d++) set(String(d), [String(d)]);
  'ABCDEFGHI'.split('').forEach((c, i) => set(c, ['12', String(i + 1)]));
  'JKLMNOPQR'.split('').forEach((c, i) => set(c, ['11', String(i + 1)]));
  'STUVWXYZ'.split('').forEach((c, i) => set(c, ['0', String(i + 2)]));
  'abcdefghi'.split('').forEach((c, i) => set(c, ['12', '0', String(i + 1)]));
  'jklmnopqr'.split('').forEach((c, i) => set(c, ['12', '11', String(i + 1)]));
  'stuvwxyz'.split('').forEach((c, i) => set(c, ['11', '0', String(i + 2)]));
  const z = (zone, list) => list.split('').forEach((c, i) => c !== ' ' && set(c, [...zone, String(i + 2), '8']));
  z(['12'], '¢.<(+|');
  z(['11'], '!$*);¬');
  z(['0'], ' ,%_>?');
  z([], ':#@\'="');
  set('&', ['12']);
  set('-', ['11']);
  set('/', ['0', '1']);
  set('`', ['1', '8']);
  set('{', ['12', '0']);
  set('}', ['11', '0']);
  set('\\', ['0', '2', '8']);
  set('~', ['11', '0', '1']);
  set('^', ['12', '11', '0']);
  set('[', ['11', '0', '5', '8']);
  set(']', ['12', '11', '0', '5', '8']);
})();

/** Rangées perforées d'un caractère, ou null s'il n'a pas de code de carte. */
export function punches(ch) {
  return CODE.get(ch) ?? null;
}

// ------------------------------------------------------------------ dessin de la carte

const SVG = 'http://www.w3.org/2000/svg';
const W = 1870;
const H = 825;
const colX = (c) => 92 + c * 21.6;
const rowY = (r) => 118 + ROWS.indexOf(r) * 60;

function svg(tag, attrs, text) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Carte vierge (contour, chiffres imprimés, numéros de colonne) et couches dynamiques. */
function buildCard(host) {
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'kp-svg', role: 'img' });
  root.append(svg('path', {
    d: `M60,0 H${W - 20} Q${W},0 ${W},20 V${H - 20} Q${W},${H} ${W - 20},${H} H20 Q0,${H} 0,${H - 20} V60 Z`,
    class: 'kp-card',
  }));
  root.append(svg('rect', { x: 60, y: 0, width: W - 80, height: 18, class: 'kp-stripe' }));
  const print = svg('g', { class: 'kp-print' });
  for (let c = 0; c < COLS; c++) {
    const x = colX(c);
    for (let d = 0; d <= 9; d++) print.append(svg('text', { x, y: rowY(String(d)) + 8, class: 'kp-digit' }, String(d)));
    print.append(svg('text', { x, y: rowY('0') + 30, class: 'kp-colno' }, String(c + 1)));
    print.append(svg('text', { x, y: rowY('9') + 30, class: 'kp-colno' }, String(c + 1)));
  }
  // Séparations des zones de colonnes (72 : fin de l'instruction, 73-80 : numérotation).
  print.append(svg('line', { x1: (colX(71) + colX(72)) / 2, y1: 90, x2: (colX(71) + colX(72)) / 2, y2: H - 20, class: 'kp-rule' }));
  print.append(svg('text', { x: 30, y: H / 2, class: 'kp-brand', transform: `rotate(-90 30 ${H / 2})` }, 'S/370 · VE2CUY · 5081'));
  root.append(print);
  const text = svg('g', { class: 'kp-text' });
  const holes = svg('g', { class: 'kp-holes' });
  const cursor = svg('rect', { x: 0, y: 26, width: 21.6, height: H - 50, class: 'kp-cursor', visibility: 'hidden' });
  root.append(cursor, text, holes);
  host.replaceChildren(root);
  return { root, text, holes, cursor };
}

/** Dessine la carte `line` (perforations jusqu'à la colonne `upto`, toutes par défaut). */
function drawCard(card, line, opts = {}) {
  const upto = opts.upto ?? COLS;
  const s = (line ?? '').padEnd(COLS).slice(0, COLS);
  card.text.replaceChildren();
  card.holes.replaceChildren();
  card.root.classList.toggle('kp-job', /^\/\/\S*\s+JOB\b/.test(s));
  card.root.classList.toggle('kp-blank', line === null);
  for (let c = 0; c < upto; c++) {
    const ch = s[c];
    if (ch === ' ') continue;
    const x = colX(c);
    card.text.append(svg('text', { x, y: 62, class: 'kp-char' }, ch));
    for (const r of punches(ch) ?? []) {
      card.holes.append(svg('rect', { x: x - 6.5, y: rowY(r) - 16, width: 13, height: 32, rx: 1.5, class: 'kp-hole' }));
    }
  }
  if (opts.cursor !== undefined && opts.cursor < COLS) {
    card.cursor.setAttribute('x', colX(opts.cursor) - 10.8);
    card.cursor.setAttribute('visibility', 'visible');
  } else {
    card.cursor.setAttribute('visibility', 'hidden');
  }
}

// ------------------------------------------------------------------ bibliothèque

function loadDecks() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) ?? [];
  } catch {
    return [];
  }
}

function saveDecks(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ fenêtre

let ctx = null;  // { running(), submit(text), prefs, savePrefs, status() }
let card = null;
const state = {
  name: '',
  source: null,   // {kind: 'example' | 'user', id}
  deck: null,     // cartes perforées (textes de 80 colonnes au plus)
  punchedText: '',
  index: 0,
  busy: false,
  savedText: '',  // texte à la dernière ouverture ou au dernier enregistrement
  loaded: false,
};

const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function status(text, kind = '') {
  const s = $('kp-status');
  s.textContent = text;
  s.className = `kp-status ${kind}`;
}

function textLines() {
  const v = $('kp-edit').value.replace(/\r\n?/g, '\n').replace(/\t/g, '        ');
  const lines = v.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function dirty() {
  return state.deck === null || $('kp-edit').value !== state.punchedText;
}

/** Ligne du curseur de l'éditeur (0 = première). */
function caretLine() {
  const ta = $('kp-edit');
  return ta.value.slice(0, ta.selectionStart).split('\n').length - 1;
}

function selectLine(i) {
  const ta = $('kp-edit');
  const lines = ta.value.split('\n');
  let start = 0;
  for (let k = 0; k < i && k < lines.length; k++) start += lines[k].length + 1;
  const end = start + (lines[i]?.length ?? 0);
  ta.setSelectionRange(start, end);
  // Ligne amenée au milieu de la zone visible.
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 18;
  ta.scrollTop = Math.max(0, i * lh - ta.clientHeight / 2);
}

function renderCard(cursor) {
  const n = state.deck?.length ?? 0;
  const lines = textLines();
  // Carte courante : du jeu perforé; avant toute perforation, aperçu de la ligne du texte.
  const line = state.deck ? (state.deck[state.index] ?? null) : (lines[state.index] ?? null);
  drawCard(card, line, { cursor });
  $('kp-count').textContent = n ? t('kp.card', { i: state.index + 1, n }) : t('kp.nodeck');
  $('kp-range').max = String(Math.max(1, n || lines.length));
  $('kp-range').value = String(state.index + 1);
  $('kp-card-box').classList.toggle('preview', !state.deck);
  $('kp-dirty').hidden = !(state.deck && dirty());
  $('kp-name').value = state.name;
  const col = cursor !== undefined ? cursor + 1 : '';
  $('kp-col').textContent = col ? t('kp.col', { c: col }) : '';
}

function go(i) {
  const n = state.deck?.length ?? textLines().length;
  if (!n) return;
  state.index = Math.max(0, Math.min(n - 1, i));
  renderCard();
  if (!dirty()) selectLine(state.index);
}

/** Lignes invalides : plus de 80 colonnes ou caractère sans code de carte. */
function check(lines) {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trimEnd();
    if (l.length > COLS) return t('kp.err.long', { n: i + 1, len: l.length });
    for (const ch of l) if (punches(ch) === null) return t('kp.err.char', { n: i + 1, ch });
  }
  return '';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Perfore le texte : une carte par ligne; la carte courante se perfore colonne par colonne. */
async function punchDeck() {
  if (state.busy) return false;
  if ($('kp-caps').checked) {
    const ta = $('kp-edit');
    const pos = ta.selectionStart;
    ta.value = ta.value.toUpperCase();
    ta.setSelectionRange(pos, pos);
  }
  const lines = textLines().map((l) => l.trimEnd());
  if (!lines.length) {
    status(t('kp.err.empty'), 'error');
    return false;
  }
  const err = check(lines);
  if (err) {
    status(err, 'error');
    return false;
  }
  state.busy = true;
  setButtons();
  try {
    state.deck = lines;
    state.punchedText = $('kp-edit').value;
    state.index = Math.min(caretLine(), lines.length - 1);
    // Animation : la carte courante passe sous les poinçons.
    const line = lines[state.index];
    const last = line.length;
    for (let c = 0; c <= last; c += 2) {
      drawCard(card, line, { upto: c, cursor: c });
      await sleep(12);
    }
    renderCard();
    status(t('kp.punched', { n: lines.length }), 'ok');
    return true;
  } finally {
    state.busy = false;
    setButtons();
  }
}

async function submitDeck() {
  if (!ctx.running()) {
    status(t('kp.err.stopped'), 'error');
    return;
  }
  if (dirty() && !(await punchDeck())) return;
  state.busy = true;
  setButtons();
  try {
    // Le jeu part vers le lecteur : la carte courante glisse hors de la vue.
    const box = $('kp-card-box');
    box.classList.add('feeding');
    await sleep(450);
    box.classList.remove('feeding');
    ctx.submit(state.deck.join('\n'));
    status(t('kp.submitted', { n: state.deck.length }), 'ok');
  } finally {
    state.busy = false;
    setButtons();
  }
}

function setButtons() {
  for (const id of ['kp-punch', 'kp-submit', 'kp-save', 'kp-saveas', 'kp-new']) $(id).disabled = state.busy;
  $('kp-submit').title = ctx.running() ? '' : t('kp.err.stopped');
}

// --- bibliothèque

function titleOf(d) {
  const key = `deck.${d.id}`;
  const s = t(key);
  return s === key ? d.id : s;
}

function renderLibrary() {
  const box = $('kp-lib');
  box.replaceChildren();
  const group = (title, items) => {
    box.append(el('h3', null, title));
    if (!items.length) {
      box.append(el('p', 'hint', t('kp.lib.none')));
      return;
    }
    const ul = el('ul');
    for (const it of items) ul.append(it);
    box.append(ul);
  };
  const item = (name, tag, count, active, open, actions = []) => {
    const li = el('li', active ? 'active' : '');
    const b = el('button', 'kp-lib-open');
    b.type = 'button';
    b.append(el('span', 'kp-lib-name', name), el('span', 'kp-lib-meta', `${tag} · ${t('kp.cards', { n: count })}`));
    b.addEventListener('click', open);
    li.append(b, ...actions);
    return li;
  };
  const lines = (text) => text.replace(/\n$/, '').split('\n').length;
  group(t('kp.lib.examples'), DECKS.map((d) => item(titleOf(d), d.lang, lines(d.text),
    state.source?.kind === 'example' && state.source.id === d.id, () => openExample(d))));
  const mine = loadDecks().sort((a, b) => a.name.localeCompare(b.name));
  group(t('kp.lib.mine'), mine.map((d) => item(d.name, t('kp.lib.saved', { date: new Date(d.updated).toLocaleDateString() }), lines(d.text),
    state.source?.kind === 'user' && state.source.id === d.id, () => openUser(d), [
      iconButton('pencil', t('vm.rename'), () => renameUser(d)),
      iconButton('trash', t('vm.delete'), () => deleteUser(d)),
    ])));
}

function iconButton(icon, title, fn) {
  const b = el('button', 'icon-button small');
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.innerHTML = `<svg class="icon"><use href="#i-${icon}"/></svg>`;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    fn();
  });
  return b;
}

function confirmLeave() {
  return !dirtyText() || confirm(t('kp.confirm.discard'));
}

/** Texte changé depuis la dernière ouverture ou le dernier enregistrement. */
function dirtyText() {
  return $('kp-edit').value !== state.savedText;
}

function load(name, text, source) {
  state.name = name;
  state.source = source;
  state.deck = null;
  state.punchedText = '';
  state.index = 0;
  $('kp-edit').value = text.replace(/\n?$/, '\n');
  state.savedText = $('kp-edit').value;
  state.loaded = true;
  $('kp-edit').scrollTop = 0;
  $('kp-edit').setSelectionRange(0, 0);
  renderCard();
  renderLibrary();
  status(t('kp.loaded', { name, n: textLines().length }));
}

function openExample(d) {
  if (!confirmLeave()) return;
  load(titleOf(d), d.text, { kind: 'example', id: d.id });
}

function openUser(d) {
  if (!confirmLeave()) return;
  load(d.name, d.text, { kind: 'user', id: d.id });
}

function saveAs() {
  const name = prompt(t('kp.ask.name'), state.name || t('kp.untitled'))?.trim();
  if (!name) return;
  const list = loadDecks();
  const same = list.find((d) => d.name === name);
  if (same && !confirm(t('kp.confirm.replace', { name }))) return;
  const id = same?.id ?? `d${Date.now().toString(36)}`;
  const entry = { id, name, text: $('kp-edit').value, updated: Date.now() };
  const next = [...list.filter((d) => d.id !== id), entry];
  if (!saveDecks(next)) {
    status(t('kp.err.store'), 'error');
    return;
  }
  state.name = name;
  state.source = { kind: 'user', id };
  state.savedText = entry.text;
  renderLibrary();
  renderCard();
  status(t('kp.saved', { name, n: textLines().length }), 'ok');
}

function save() {
  if (state.source?.kind !== 'user') {
    saveAs();
    return;
  }
  const list = loadDecks();
  const d = list.find((x) => x.id === state.source.id);
  if (!d) {
    saveAs();
    return;
  }
  d.text = $('kp-edit').value;
  d.name = state.name || d.name;
  d.updated = Date.now();
  if (!saveDecks(list)) {
    status(t('kp.err.store'), 'error');
    return;
  }
  state.savedText = d.text;
  renderLibrary();
  status(t('kp.saved', { name: d.name, n: textLines().length }), 'ok');
}

function renameUser(d) {
  const name = prompt(t('vm.ask.rename', { name: d.name }), d.name)?.trim();
  if (!name || name === d.name) return;
  const list = loadDecks();
  const x = list.find((y) => y.id === d.id);
  x.name = name;
  saveDecks(list);
  if (state.source?.kind === 'user' && state.source.id === d.id) state.name = name;
  renderLibrary();
  renderCard();
}

function deleteUser(d) {
  if (!confirm(t('kp.confirm.delete', { name: d.name }))) return;
  saveDecks(loadDecks().filter((x) => x.id !== d.id));
  if (state.source?.kind === 'user' && state.source.id === d.id) state.source = null;
  renderLibrary();
  status(t('kp.deleted', { name: d.name }));
}

function newDeck() {
  if (!confirmLeave()) return;
  load(t('kp.untitled'), '', null);
}

function exportDeck() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([$('kp-edit').value], { type: 'text/plain' }));
  a.download = `${(state.name || 'deck').replace(/[^\w.-]+/g, '_')}.jcl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function importDeck(file) {
  if (!confirmLeave()) return;
  load(file.name.replace(/\.[^.]*$/, ''), await file.text(), null);
}

// ------------------------------------------------------------------ ouverture

/** Ouvre la perforatrice, avec un texte (exemple de l'aide-mémoire) ou tel qu'elle était. */
export function openPunch(opts = {}) {
  const dlg = $('kp');
  if (opts.text !== undefined) {
    const ex = DECKS.find((d) => d.text === opts.text);
    if (dlg.open && !confirmLeave()) return;
    load(ex ? titleOf(ex) : (opts.name ?? t('kp.untitled')), opts.text, ex ? { kind: 'example', id: ex.id } : null);
  } else if (!state.loaded) {
    load(titleOf(DECKS[0]), DECKS[0].text, { kind: 'example', id: DECKS[0].id });
  }
  setButtons();
  renderLibrary();
  if (!dlg.open) dlg.showModal();
  $('kp-edit').focus();
}

export function punchMachineChanged() {
  if ($('kp')?.open) setButtons();
}

/** Jeux de l'usager dans la bibliothèque. */
export function savedDeckCount() {
  return loadDecks().length;
}

export function initPunch(context) {
  ctx = context;
  card = buildCard($('kp-card'));
  drawCard(card, null);
  const dlg = $('kp');
  dlg.querySelector('.kp-close').addEventListener('click', () => dlg.close());
  const ta = $('kp-edit');
  const follow = () => {
    // Le curseur de l'éditeur choisit la carte et la colonne montrées.
    const before = ta.value.slice(0, ta.selectionStart);
    const line = before.split('\n').length - 1;
    const col = before.length - before.lastIndexOf('\n') - 1;
    const n = state.deck?.length ?? textLines().length;
    state.index = Math.max(0, Math.min(Math.max(0, n - 1), line));
    renderCard(col);
  };
  for (const ev of ['click', 'keyup', 'input', 'select']) ta.addEventListener(ev, follow);
  // La règle des colonnes suit le défilement horizontal de l'éditeur.
  ta.addEventListener('scroll', () => { $('kp-ruler').scrollLeft = ta.scrollLeft; });
  ta.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  });
  $('kp-first').addEventListener('click', () => go(0));
  $('kp-prev').addEventListener('click', () => go(state.index - 1));
  $('kp-next').addEventListener('click', () => go(state.index + 1));
  $('kp-last').addEventListener('click', () => go(Infinity));
  $('kp-range').addEventListener('input', (e) => go(Number(e.target.value) - 1));
  $('kp-card-box').addEventListener('keydown', (e) => {
    const k = { ArrowLeft: -1, ArrowRight: 1, PageUp: -10, PageDown: 10 }[e.key];
    if (k) {
      e.preventDefault();
      go(state.index + k);
    } else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(Infinity);
  });
  $('kp-punch').addEventListener('click', () => punchDeck());
  $('kp-submit').addEventListener('click', () => submitDeck());
  $('kp-new').addEventListener('click', newDeck);
  $('kp-save').addEventListener('click', save);
  $('kp-saveas').addEventListener('click', saveAs);
  $('kp-export').addEventListener('click', exportDeck);
  $('kp-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importDeck(f);
  });
  $('kp-name').addEventListener('change', (e) => { state.name = e.target.value.trim(); });
  $('kp-caps').checked = !!ctx.prefs.kpCaps;
  $('kp-caps').addEventListener('change', (e) => { ctx.prefs.kpCaps = e.target.checked; ctx.savePrefs(); });
  dlg.addEventListener('cancel', (e) => {
    if (dirtyText() && !confirm(t('kp.confirm.close'))) e.preventDefault();
  });
  return () => {
    if (dlg.open) {
      renderLibrary();
      renderCard();
    }
  };
}
