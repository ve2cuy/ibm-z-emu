// Page de l'émulateur IBM System/370 : menu, volumes (OPFS), dépôt de fichiers, fil de la
// machine (worker.js), console de l'opérateur, terminaux 3270, pupitre, lecteur de cartes
// et imprimantes.

import { LANGUAGES, browserLanguage, setLanguage, t } from './i18n.js?v=edd7b5c8';

const VERSION = '0.1.0';
const V = new URL(import.meta.url).search;

const $ = (id) => document.getElementById(id);
const app = $('app');
const statusBox = $('status');
const overlay = $('overlay');
const errorBox = $('error');
const powerButton = $('power');
const powerLabel = $('power-label');
const speed = $('speed');

// ------------------------------------------------------------------ préférences

const PREFS_KEY = 'ibmz-prefs';
const prefs = {
  theme: 'system',
  sidebar: null,
  open: ['volumes'],
  lang: null,
  mem: 16,
  ipl: '390',
  terms: 2,
  fontSize: 16,
  showPanel: true,
  showKeys: null,
  depot: 'https://ve2cuy.com/vax/ibmz',
  turbo: false,
  printer: 0x00E,
  ...readPrefs(),
};

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) ?? {};
  } catch {
    return {};
  }
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* stockage indisponible */ }
}

// ------------------------------------------------------------------ langue

const languageListeners = [];
const langList = $('lang-list');
for (const [code, name] of Object.entries(LANGUAGES)) langList.append(new Option(name, code));
const langParam = new URLSearchParams(location.search).get('lang');
langList.value = setLanguage(langParam in LANGUAGES ? langParam : prefs.lang ?? browserLanguage());
$('lang-code').textContent = langList.value.toUpperCase();
langList.addEventListener('change', () => {
  prefs.lang = setLanguage(langList.value);
  $('lang-code').textContent = prefs.lang.toUpperCase();
  savePrefs();
  for (const listener of languageListeners) listener();
});

// Guide de premiers pas (barre du haut) : français ou anglais selon la langue.
function guideLink() {
  $('guide-link').href = `https://github.com/ve2cuy/ibm-z-emu/blob/main/docs/${langList.value === 'fr' ? 'GUIDE_FR' : 'GUIDE'}.md`;
}
languageListeners.push(guideLink);
guideLink();

function showVersion() {
  $('about-version').textContent = t('about.version', { v: VERSION });
  $('sb-version').textContent = `v${VERSION}`;
}
languageListeners.push(showVersion);
showVersion();

// ------------------------------------------------------------------ thème

const darkSystem = matchMedia('(prefers-color-scheme: dark)');

function applyTheme(theme) {
  prefs.theme = theme;
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  for (const radio of document.querySelectorAll('input[name="theme"]')) radio.checked = radio.value === theme;
  savePrefs();
}

for (const radio of document.querySelectorAll('input[name="theme"]')) {
  radio.addEventListener('change', () => applyTheme(radio.value));
}
$('theme-toggle').addEventListener('click', () => {
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && darkSystem.matches);
  applyTheme(dark ? 'light' : 'dark');
});
applyTheme(prefs.theme);

// ------------------------------------------------------------------ menu latéral

const phone = matchMedia('(max-width: 760px)');
const backdrop = $('backdrop');
const navItems = [...document.querySelectorAll('.nav-item')];

function applySidebar() {
  const collapsed = !phone.matches
    && (prefs.sidebar ?? (innerWidth < 1100 ? 'collapsed' : 'expanded')) === 'collapsed';
  app.classList.toggle('collapsed', collapsed);
  const button = $('sb-collapse');
  button.title = t(collapsed ? 'menu.expand' : 'menu.collapse');
  button.setAttribute('aria-label', button.title);
  if (!phone.matches) setDrawer(false);
}
languageListeners.push(applySidebar);

function setDrawer(open) {
  app.classList.toggle('drawer-open', open);
  backdrop.hidden = !open;
}

function openPanel(item, open) {
  item.setAttribute('aria-expanded', String(open));
  $(item.getAttribute('aria-controls')).hidden = !open;
  prefs.open = navItems.filter((i) => i.getAttribute('aria-expanded') === 'true')
    .map((i) => i.getAttribute('aria-controls').replace('panel-', ''));
  savePrefs();
  if (open) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function showPanel(name) {
  const item = navItems.find((i) => i.getAttribute('aria-controls') === `panel-${name}`);
  if (phone.matches) setDrawer(true);
  else if (app.classList.contains('collapsed')) { prefs.sidebar = 'expanded'; applySidebar(); }
  openPanel(item, true);
}

for (const item of navItems) {
  const name = item.getAttribute('aria-controls').replace('panel-', '');
  item.setAttribute('aria-expanded', String(prefs.open.includes(name)));
  $(`panel-${name}`).hidden = !prefs.open.includes(name);
  item.addEventListener('click', () => {
    if (app.classList.contains('collapsed')) showPanel(name);
    else openPanel(item, item.getAttribute('aria-expanded') !== 'true');
  });
}

const tooltip = document.createElement('div');
tooltip.className = 'tooltip';
tooltip.hidden = true;
document.body.append(tooltip);
for (const el of document.querySelectorAll('.sidebar [data-tip]')) {
  el.addEventListener('mouseenter', () => {
    if (!app.classList.contains('collapsed') || !matchMedia('(hover: hover)').matches) return;
    const r = el.getBoundingClientRect();
    tooltip.textContent = el.dataset.tip;
    tooltip.style.left = `${r.right + 10}px`;
    tooltip.style.top = `${r.top + r.height / 2}px`;
    tooltip.hidden = false;
  });
  el.addEventListener('mouseleave', () => { tooltip.hidden = true; });
  el.addEventListener('click', () => { tooltip.hidden = true; });
}

$('sb-collapse').addEventListener('click', () => {
  prefs.sidebar = app.classList.contains('collapsed') ? 'expanded' : 'collapsed';
  savePrefs();
  applySidebar();
});
$('menu-button').addEventListener('click', () => setDrawer(true));
$('sb-close').addEventListener('click', () => setDrawer(false));
backdrop.addEventListener('click', () => setDrawer(false));
$('overlay-menu').addEventListener('click', () => showPanel('depot'));
phone.addEventListener('change', applySidebar);
applySidebar();

// ------------------------------------------------------------------ messages

let statusKey = null;
let statusValues = {};

function showStatus(key, values = {}) {
  statusKey = key;
  statusValues = values;
  statusBox.classList.toggle('error', key === 'error');
  statusBox.textContent = key ? t(key, values) : '';
}
languageListeners.push(() => showStatus(statusKey, statusValues));

window.addEventListener('error', (e) => showStatus('error', { msg: e.message }));
window.addEventListener('unhandledrejection', (e) => showStatus('error', { msg: e.reason?.message ?? String(e.reason) }));

function fmtSize(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} ${t('unit.gb')}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} ${t('unit.mb')}`;
  return `${Math.max(1, Math.round(n / 1e3))} ${t('unit.kb')}`;
}

const hex3 = (n) => n.toString(16).toUpperCase().padStart(3, '0');

// ------------------------------------------------------------------ volumes (OPFS)

const opfsOk = !!navigator.storage?.getDirectory;
let volumes = [];      // [{file, addr, size}]
let volBusy = false;

async function volDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('dasd', { create: true });
}

/** Adresse d'un volume d'après l'extension de son nom (tk5res.390 -> 0x390). */
function volAddr(name) {
  const m = /\.([0-9a-f]{3})$/i.exec(name);
  return m ? parseInt(m[1], 16) : null;
}

async function listVolumes() {
  const list = [];
  if (!opfsOk) return (volumes = list);
  const dir = await volDir();
  for await (const [name, h] of dir.entries()) {
    if (h.kind !== 'file' || name.endsWith('.part')) continue;
    const addr = volAddr(name);
    if (addr === null) continue;
    const f = await h.getFile();
    list.push({ file: name, addr, size: f.size });
  }
  list.sort((a, b) => a.addr - b.addr);
  volumes = list;
  return list;
}

function iconButton(icon, title, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-button small';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.innerHTML = `<svg class="icon"><use href="#i-${icon}"/></svg>`;
  b.addEventListener('click', onClick);
  return b;
}

async function renderVolumes() {
  await listVolumes();
  const list = $('vol-list');
  list.replaceChildren();
  for (const v of volumes) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'mono';
    name.textContent = `${hex3(v.addr)}  ${v.file}`;
    const size = document.createElement('span');
    size.className = 'hint';
    size.textContent = fmtSize(v.size);
    li.append(name, size, iconButton('download', t('vol.save'), () => saveVolume(v.file)));
    list.append(li);
  }
  const total = volumes.reduce((s, v) => s + v.size, 0);
  $('vol-summary').textContent = volumes.length
    ? t('vol.summary', { n: volumes.length, size: fmtSize(total) })
    : t('vol.none');
  $('vol-erase').disabled = !volumes.length || running;
  $('vol-file').disabled = running;
  try {
    const est = await navigator.storage.estimate();
    $('vol-usage').textContent = t('vol.usage', { used: fmtSize(est.usage ?? 0), quota: fmtSize(est.quota ?? 0) });
  } catch { /* rien */ }
  updateButtons();
  renderDepot();
}

async function saveVolume(file) {
  const fh = await (await volDir()).getFileHandle(file);
  const blob = await fh.getFile();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

/** Copie un flux dans l'OPFS (fichier .part, renommé à la fin). */
async function writeVolume(name, stream, onBytes) {
  const dir = await volDir();
  const part = `${name}.part`;
  const fh = await dir.getFileHandle(part, { create: true });
  const out = await fh.createWritable();
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await out.write(value);
      onBytes?.(value.length);
    }
    await out.close();
  } catch (e) {
    try { await out.abort(); } catch { /* rien */ }
    await dir.removeEntry(part).catch(() => {});
    throw e;
  }
  await dir.removeEntry(name).catch(() => {});
  await fh.move(name);
}

$('vol-file').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length || volBusy) return;
  volBusy = true;
  try {
    for (const f of files) {
      if (volAddr(f.name) === null) {
        showStatus('vol.badname', { name: f.name });
        continue;
      }
      const head = new Uint8Array(await f.slice(0, 8).arrayBuffer());
      if (String.fromCharCode(...head.slice(0, 4)) !== 'CKD_') {
        showStatus('vol.badfile', { name: f.name });
        continue;
      }
      showStatus('vol.importing', { name: f.name });
      await writeVolume(f.name, f.stream());
    }
    showStatus('vol.imported');
  } catch (err) {
    showStatus('error', { msg: err.message });
  } finally {
    volBusy = false;
    await keepStorage();
    renderVolumes();
  }
});

$('vol-erase').addEventListener('click', async () => {
  if (running || !confirm(t('vol.erase.confirm'))) return;
  const dir = await volDir();
  for (const v of volumes) await dir.removeEntry(v.file).catch(() => {});
  renderVolumes();
});

async function keepStorage() {
  try { await navigator.storage.persist?.(); } catch { /* rien */ }
}

// ------------------------------------------------------------------ dépôt

const depotUrl = $('depot-url');
depotUrl.value = prefs.depot;
depotUrl.addEventListener('change', () => {
  prefs.depot = depotUrl.value.trim().replace(/\/+$/, '') || 'https://ve2cuy.com/vax/ibmz';
  depotUrl.value = prefs.depot;
  savePrefs();
  loadDepot();
});
let depot = [];
let depotError = '';
let downloading = false;

async function loadDepot() {
  depotError = '';
  try {
    const r = await fetch(`${prefs.depot}/dasd/index.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    depot = await r.json();
  } catch (e) {
    depot = [];
    depotError = e.message;
  }
  renderDepot();
}

function localized(entry, field) {
  return entry.i18n?.[langList.value]?.[field] ?? entry[field] ?? '';
}

function renderDepot() {
  const box = $('depot-list');
  box.replaceChildren();
  if (depotError) {
    const p = document.createElement('p');
    p.className = 'hint error';
    p.textContent = t('depot.error', { msg: depotError });
    box.append(p);
    return;
  }
  for (const entry of depot) {
    const card = document.createElement('div');
    card.className = 'depot-card';
    const title = document.createElement('strong');
    title.textContent = localized(entry, 'title');
    const desc = document.createElement('p');
    desc.className = 'hint';
    desc.textContent = localized(entry, 'description');
    const lic = document.createElement('p');
    lic.className = 'hint small';
    lic.textContent = entry.license ?? '';
    const have = entry.files.every((f) => volumes.some((v) => v.file === f.file && v.size === f.size));
    const b = document.createElement('button');
    b.type = 'button';
    b.className = have ? 'secondary with-icon' : 'with-icon';
    b.innerHTML = '<svg class="icon"><use href="#i-download"/></svg><span></span>';
    b.querySelector('span').textContent = have
      ? t('depot.again', { size: fmtSize(entry.size) })
      : t('depot.get', { size: fmtSize(entry.size) });
    b.disabled = downloading || running;
    b.addEventListener('click', () => downloadPack(entry, have));
    card.append(title, desc, b, lic);
    box.append(card);
  }
}
languageListeners.push(renderDepot);

async function downloadPack(entry, again) {
  if (downloading || running) return;
  if (again && !confirm(t('depot.again.confirm'))) return;
  downloading = true;
  renderDepot();
  const prog = $('depot-progress');
  prog.hidden = false;
  let done = 0;
  const total = entry.size;
  const show = (name) => {
    prog.querySelector('.bar').style.width = `${(100 * done / total).toFixed(1)}%`;
    prog.querySelector('.text').textContent = t('depot.progress', { name, done: fmtSize(done), total: fmtSize(total) });
  };
  try {
    for (const f of entry.files) {
      show(f.file);
      const r = await fetch(`${prefs.depot}/dasd/${entry.id}/${f.file}`);
      if (!r.ok || !r.body) throw new Error(`${f.file} : HTTP ${r.status}`);
      await writeVolume(f.file, r.body, (n) => { done += n; show(f.file); });
    }
    if (entry.ipl) {
      prefs.ipl = entry.ipl;
      savePrefs();
      showDials();
    }
    await keepStorage();
    showStatus('depot.done', { title: localized(entry, 'title') });
  } catch (e) {
    showStatus('error', { msg: e.message });
  } finally {
    downloading = false;
    prog.hidden = true;
    renderVolumes();
  }
}

// ------------------------------------------------------------------ machine

const memList = $('mem-list');
memList.value = String(prefs.mem);
memList.addEventListener('change', () => { prefs.mem = Number(memList.value); savePrefs(); });
const termsList = $('terms-list');
termsList.value = String(prefs.terms);
termsList.addEventListener('change', () => { prefs.terms = Number(termsList.value); savePrefs(); });
const iplInput = $('ipl-addr');
iplInput.value = prefs.ipl;
iplInput.addEventListener('change', () => {
  const v = iplInput.value.trim().toUpperCase();
  if (/^[0-9A-F]{1,3}$/.test(v)) prefs.ipl = v.padStart(3, '0');
  iplInput.value = prefs.ipl;
  savePrefs();
  showDials();
});

let worker = null;
let running = false;
let lastError = '';
let terminals = [];

function updateButtons() {
  powerButton.disabled = !worker || (!running && !volumes.length);
  powerLabel.textContent = t(running ? 'power.stop' : 'power.ipl');
  $('btn-load').disabled = running || !volumes.length;
  $('btn-interrupt').disabled = !running;
  $('btn-restart').disabled = !running;
  $('vol-erase').disabled = !volumes.length || running;
  showOverlay();
  setLight('lt-man', !running);
}
languageListeners.push(updateButtons);

function showOverlay() {
  const need = !volumes.length && !running;
  overlay.hidden = !need && !errorBox.textContent;
  $('overlay-start').hidden = !need;
  $('overlay-menu').hidden = !need;
}

function startWorker() {
  worker = new Worker(new URL(`./worker.js${V}`, import.meta.url), { type: 'module' });
  worker.onmessage = onWorkerMessage;
  worker.onerror = (e) => showStatus('error', { msg: e.message || 'worker.js' });
}

async function ipl() {
  if (running || !worker) return;
  const vols = await listVolumes();
  if (!vols.length) return;
  const addr = parseInt(prefs.ipl, 16);
  if (!vols.some((v) => v.addr === addr)) {
    showStatus('ipl.novol', { addr: prefs.ipl });
    return;
  }
  terminals = Array.from({ length: prefs.terms }, (_, i) => 0x0C0 + i);
  buildTabs();
  consoleText = '';
  consoleOut.textContent = '';
  for (const k of Object.keys(printers)) delete printers[k];
  showPrinter();
  running = true;
  setLight('lt-load', true);
  updateButtons();
  renderVolumes();
  showStatus('ipl.starting', { addr: prefs.ipl });
  worker.postMessage({
    type: 'start',
    mem: prefs.mem,
    ipl: addr,
    volumes: vols.map((v) => ({ addr: v.addr, file: v.file })),
    terminals,
  });
  worker.postMessage({ type: 'turbo', on: prefs.turbo });
}

let shuttingDown = false;

function stopMachine() {
  if (!running) return;
  if (!shuttingDown) {
    // Arrêt propre de MVS (procédure SHUTDOWN de TK5), ou arrêt immédiat.
    if (confirm(t('power.shutdown.confirm'))) {
      shuttingDown = true;
      worker.postMessage({ type: 'shutdown' });
      showStatus('power.shutting');
      return;
    }
  }
  if (!confirm(t('power.confirm'))) return;
  worker.postMessage({ type: 'stop' });
}

powerButton.addEventListener('click', () => (running ? stopMachine() : ipl()));
$('btn-load').addEventListener('click', () => ipl());
$('btn-interrupt').addEventListener('click', () => worker?.postMessage({ type: 'interrupt' }));
$('btn-restart').addEventListener('click', () => worker?.postMessage({ type: 'restart' }));

const turboButton = $('turbo');
function showTurbo() {
  turboButton.setAttribute('aria-pressed', String(prefs.turbo));
  turboButton.classList.toggle('active', prefs.turbo);
}
turboButton.addEventListener('click', () => {
  prefs.turbo = !prefs.turbo;
  savePrefs();
  showTurbo();
  worker?.postMessage({ type: 'turbo', on: prefs.turbo });
});
showTurbo();

function onWorkerMessage({ data }) {
  switch (data.type) {
    case 'ready':
      updateButtons();
      break;
    case 'started':
      setLight('lt-load', false);
      setLight('lt-sys', true);
      showStatus('ipl.started', { n: data.volumes.length });
      break;
    case 'console':
      appendConsole(data.text);
      break;
    case 'screen':
      screens.set(data.addr, data.data);
      if (currentTab === `t${data.addr}`) drawScreen();
      else markTab(`t${data.addr}`);
      break;
    case 'printer':
      printers[data.addr] = (printers[data.addr] ?? '') + data.text;
      if (printers[data.addr].length > 2_000_000) printers[data.addr] = printers[data.addr].slice(-1_500_000);
      if (currentTab === 'printer') showPrinter();
      else markTab('printer');
      break;
    case 'stats':
      speed.textContent = t('speed', { mips: data.mips.toFixed(1) });
      speed.dataset.dbg = data.dbg ?? '';
      $('psw').textContent = data.psw;
      setLight('lt-wait', data.wait);
      setLight('lt-sys', !data.wait);
      break;
    case 'shutdown':
      shuttingDown = true;
      showStatus('power.shutting');
      break;
    case 'cards':
      $('cards-status').textContent = t('cards.sent', { n: data.left });
      break;
    case 'beep':
      beep();
      break;
    case 'error':
      lastError = data.msg;
      showStatus('error', { msg: data.msg });
      break;
    case 'stopped':
      running = false;
      if (shuttingDown && data.reason === 'stopped') data.reason = 'shutdown';
      shuttingDown = false;
      setLight('lt-sys', false);
      setLight('lt-wait', false);
      setLight('lt-load', false);
      speed.textContent = '';
      if (data.reason === 'error' && lastError) showStatus('error', { msg: lastError });
      else showStatus(data.reason === 'user' ? 'power.stopped' : `stop.${data.reason}`);
      updateButtons();
      renderVolumes();
      break;
    case 'closed':
      break;
  }
}

// ------------------------------------------------------------------ pupitre

const dials = [...document.querySelectorAll('.dial')];

function showDials() {
  const d = prefs.ipl.padStart(3, '0');
  dials.forEach((b, i) => {
    b.querySelector('span').textContent = d[i];
    b.style.setProperty('--angle', `${parseInt(d[i], 16) * 22.5}deg`);
  });
  iplInput.value = prefs.ipl;
}

for (const b of dials) {
  const step = (k) => {
    const i = Number(b.dataset.digit);
    const d = prefs.ipl.padStart(3, '0').split('');
    d[i] = ((parseInt(d[i], 16) + k + 16) % 16).toString(16).toUpperCase();
    prefs.ipl = d.join('');
    savePrefs();
    showDials();
  };
  b.addEventListener('click', () => step(1));
  b.addEventListener('contextmenu', (e) => { e.preventDefault(); step(-1); });
  b.addEventListener('wheel', (e) => { e.preventDefault(); step(e.deltaY > 0 ? -1 : 1); }, { passive: false });
}
showDials();

function setLight(id, on) {
  $(id).classList.toggle('on', !!on);
}

const showPanelBox = $('show-panel');
showPanelBox.checked = prefs.showPanel;
$('op-panel').hidden = !prefs.showPanel;
showPanelBox.addEventListener('change', () => {
  prefs.showPanel = showPanelBox.checked;
  $('op-panel').hidden = !prefs.showPanel;
  savePrefs();
  drawScreen();
});

// ------------------------------------------------------------------ onglets

const tabsBox = $('tabs');
const consoleBox = $('console');
const consoleOut = $('console-out');
const consoleInput = $('console-input');
const canvas = $('screen3270');
const printerOut = $('printer-out');
let currentTab = 'console';
const screens = new Map();
const printers = {};
let consoleText = '';

function buildTabs() {
  for (const b of [...tabsBox.querySelectorAll('.term-tab[data-term]')]) b.remove();
  const anchor = tabsBox.querySelector('[data-tab="printer"]');
  for (const a of terminals) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'term-tab';
    b.setAttribute('role', 'tab');
    b.dataset.tab = `t${a}`;
    b.dataset.term = String(a);
    b.textContent = `${t('tab.terminal')} ${hex3(a)}`;
    tabsBox.insertBefore(b, anchor);
  }
  for (const b of tabsBox.querySelectorAll('.term-tab')) b.onclick = () => selectTab(b.dataset.tab);
}
languageListeners.push(() => {
  for (const b of tabsBox.querySelectorAll('.term-tab[data-term]')) {
    b.textContent = `${t('tab.terminal')} ${hex3(Number(b.dataset.term))}`;
  }
});

function markTab(name) {
  tabsBox.querySelector(`[data-tab="${name}"]`)?.classList.add('news');
}

function selectTab(name) {
  currentTab = name;
  for (const b of tabsBox.querySelectorAll('.term-tab')) {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
    if (on) b.classList.remove('news');
  }
  consoleBox.hidden = name !== 'console';
  canvas.hidden = !name.startsWith('t');
  printerOut.hidden = name !== 'printer';
  $('key-bar').hidden = !(name.startsWith('t') && showKeys());
  if (name.startsWith('t')) {
    drawScreen();
    canvas.focus();
  } else if (name === 'console') {
    consoleInput.focus();
  } else {
    showPrinter();
  }
  showTermStatus();
}
for (const b of tabsBox.querySelectorAll('.term-tab')) b.onclick = () => selectTab(b.dataset.tab);

// --- console 3215

function appendConsole(text) {
  consoleText += text;
  if (consoleText.length > 400_000) consoleText = consoleText.slice(-300_000);
  const atEnd = consoleOut.scrollTop + consoleOut.clientHeight >= consoleOut.scrollHeight - 30;
  consoleOut.textContent = consoleText;
  if (atEnd) consoleOut.scrollTop = consoleOut.scrollHeight;
  if (currentTab !== 'console') markTab('console');
}

const history = [];
let histPos = 0;
$('console-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const line = consoleInput.value;
  if (!running) return;
  worker.postMessage({ type: 'console', text: line });
  if (line) history.push(line);
  histPos = history.length;
  consoleInput.value = '';
});
consoleInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' && histPos > 0) {
    consoleInput.value = history[--histPos];
    e.preventDefault();
  } else if (e.key === 'ArrowDown') {
    histPos = Math.min(history.length, histPos + 1);
    consoleInput.value = history[histPos] ?? '';
    e.preventDefault();
  }
});

// --- imprimantes

function printerSelect() {
  let sel = $('printer-select');
  if (!sel) {
    sel = document.createElement('select');
    sel.id = 'printer-select';
    sel.className = 'small-select';
    sel.addEventListener('change', () => { prefs.printer = Number(sel.value); savePrefs(); showPrinter(); });
    $('term-status').before(sel);
  }
  return sel;
}

function showPrinter() {
  const sel = printerSelect();
  const units = [[0x00E, 'prt.a'], [0x00F, 'prt.b'], [0x002, 'prt.x'], [0x30E, 'prt.log'], [0x00D, 'prt.punch']];
  sel.replaceChildren(...units.map(([a, k]) => new Option(`${hex3(a)} ${t(k)}`, String(a))));
  sel.value = String(prefs.printer);
  sel.hidden = currentTab !== 'printer';
  const text = printers[prefs.printer] ?? '';
  const atEnd = printerOut.scrollTop + printerOut.clientHeight >= printerOut.scrollHeight - 30;
  printerOut.textContent = text.replace(/\f/g, '\n' + '─'.repeat(60) + '\n') || t('prt.empty');
  if (atEnd) printerOut.scrollTop = printerOut.scrollHeight;
}
languageListeners.push(showPrinter);

// --- terminal 3270

const COLORS_DARK = ['#c8ffc8', '#6aa6ff', '#ff5252', '#ff80ff', '#40ff40', '#40ffff', '#ffff40', '#ffffff'];
const fontSizeInput = $('font-size');
fontSizeInput.value = String(prefs.fontSize);
fontSizeInput.addEventListener('input', () => {
  prefs.fontSize = Number(fontSizeInput.value);
  savePrefs();
  applyFont();
  drawScreen();
});

function applyFont() {
  document.documentElement.style.setProperty('--term-font-size', `${prefs.fontSize}px`);
}
applyFont();

const FONT = '"DejaVu Sans Mono", "Cascadia Mono", Consolas, "Courier New", monospace';
let blinkOn = true;
setInterval(() => {
  blinkOn = !blinkOn;
  if (currentTab.startsWith('t')) drawScreen();
}, 600);

let cellW = 10;
let cellH = 20;

function currentTerm() {
  return currentTab.startsWith('t') ? Number(currentTab.slice(1)) : null;
}

function drawScreen() {
  const a = currentTerm();
  if (a === null) return;
  const d = screens.get(a);
  const ctx = canvas.getContext('2d');
  const rows = d ? d[0] : 24;
  const cols = d ? d[1] : 80;
  // Taille : la police choisie, réduite si l'écran ne tient pas dans la zone.
  const mon = $('monitor');
  const box = mon.getBoundingClientRect();
  const availW = mon.clientWidth - 40;
  const availH = Math.max(200, innerHeight - box.top - 70);
  let size = prefs.fontSize;
  ctx.font = `${size}px ${FONT}`;
  let w = ctx.measureText('M').width;
  const fit = Math.min(availW / (cols * w + 16), availH / (rows * size * 1.25 + 16));
  if (fit < 1) size = Math.max(8, Math.floor(size * fit));
  ctx.font = `${size}px ${FONT}`;
  w = ctx.measureText('M').width;
  cellW = w;
  cellH = Math.round(size * 1.25);
  const dpr = devicePixelRatio || 1;
  const pw = Math.ceil(cols * cellW + 16);
  const ph = Math.ceil(rows * cellH + 16);
  if (canvas.width !== pw * dpr || canvas.height !== ph * dpr) {
    canvas.width = pw * dpr;
    canvas.height = ph * dpr;
    canvas.style.width = `${pw}px`;
    canvas.style.height = `${ph}px`;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 8 * dpr, 8 * dpr);
  ctx.fillStyle = '#000';
  ctx.fillRect(-8, -8, pw, ph);
  ctx.font = `${size}px ${FONT}`;
  ctx.textBaseline = 'top';
  if (!d) return;
  const cursor = (d[2] << 8) | d[3];
  const flags = d[4];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = r * cols + c;
      const ch = d[5 + 2 * p];
      const st = d[6 + 2 * p];
      if (st & 0x40) continue;
      const color = COLORS_DARK[st & 7];
      const hl = (st >> 3) & 3;
      const x = c * cellW;
      const y = r * cellH;
      if (hl === 1) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, cellW, cellH);
        ctx.fillStyle = '#000';
      } else {
        ctx.fillStyle = color;
      }
      if (ch !== 32 && !(hl === 3 && !blinkOn)) ctx.fillText(String.fromCharCode(ch), x, y + (cellH - size) / 2);
      if (hl === 2) ctx.fillRect(x, y + cellH - 2, cellW, 1);
    }
  }
  // Curseur (bloc en mode insertion, trait sinon).
  const cr = Math.floor(cursor / cols);
  const cc = cursor % cols;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  if (flags & 2) ctx.fillRect(cc * cellW, cr * cellH, cellW, cellH);
  else if (blinkOn || document.activeElement !== canvas) ctx.fillRect(cc * cellW, cr * cellH + cellH - 3, cellW, 3);
  if (flags & 4) beep();
  showTermStatus(d);
}

function showTermStatus(d = null) {
  const box = $('term-status');
  const a = currentTerm();
  if (a === null) {
    box.textContent = '';
    return;
  }
  d ??= screens.get(a);
  if (!d) {
    box.textContent = running ? t('term.waiting') : '';
    return;
  }
  const cursor = (d[2] << 8) | d[3];
  const parts = [];
  if (d[4] & 1) parts.push(t('term.locked'));
  if (d[4] & 2) parts.push(t('term.insert'));
  parts.push(`${Math.floor(cursor / d[1]) + 1}/${(cursor % d[1]) + 1}`);
  box.textContent = parts.join('  ·  ');
}

let audio = null;
function beep() {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.08);
  } catch { /* son indisponible */ }
}

function termKey(key) {
  const a = currentTerm();
  if (a !== null && running) worker.postMessage({ type: 'key', addr: a, key });
}

function termChars(text) {
  const a = currentTerm();
  if (a === null || !running) return;
  // Retour à la ligne : touche NewLine; tabulation : Tab.
  for (const part of text.replace(/\r\n?/g, '\n').split(/(\n|\t)/)) {
    if (part === '\n') worker.postMessage({ type: 'key', addr: a, key: 'NewLine' });
    else if (part === '\t') worker.postMessage({ type: 'key', addr: a, key: 'Tab' });
    else if (part) worker.postMessage({ type: 'char', addr: a, text: part });
  }
}

canvas.addEventListener('keydown', (e) => {
  const k = e.key;
  let key = null;
  if (k === 'Enter') key = e.shiftKey ? 'NewLine' : 'Enter';
  else if (k === 'Escape') key = 'Clear';
  else if (/^F([1-9]|1[0-2])$/.test(k)) key = `PF${Number(k.slice(1)) + (e.shiftKey ? 12 : 0)}`;
  else if (k === 'PageUp') key = 'PF7';
  else if (k === 'PageDown') key = 'PF8';
  else if (k === 'Tab') key = e.shiftKey ? 'BackTab' : 'Tab';
  else if (k === 'ArrowLeft') key = 'Left';
  else if (k === 'ArrowRight') key = 'Right';
  else if (k === 'ArrowUp') key = 'Up';
  else if (k === 'ArrowDown') key = 'Down';
  else if (k === 'Home') key = 'Home';
  else if (k === 'End') key = 'EraseEOF';
  else if (k === 'Backspace') key = 'Backspace';
  else if (k === 'Delete') key = 'Delete';
  else if (k === 'Insert') key = 'Insert';
  else if ((e.ctrlKey || e.altKey) && ['1', '2', '3'].includes(k)) key = `PA${k}`;
  else if (e.ctrlKey && (k === 'r' || k === 'R')) key = 'Reset';
  else if ((e.ctrlKey || e.metaKey) && (k === 'v' || k === 'c')) return; // coller, copier
  if (key) {
    e.preventDefault();
    termKey(key);
    return;
  }
  if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    termChars(k);
  }
});

canvas.addEventListener('paste', (e) => {
  e.preventDefault();
  termChars(e.clipboardData.getData('text'));
});

canvas.addEventListener('mousedown', (e) => {
  const a = currentTerm();
  const d = screens.get(a);
  if (!d || !running) return;
  const r = canvas.getBoundingClientRect();
  const col = Math.floor((e.clientX - r.left - 8) / cellW);
  const row = Math.floor((e.clientY - r.top - 8) / cellH);
  if (row >= 0 && row < d[0] && col >= 0 && col < d[1]) {
    worker.postMessage({ type: 'click', addr: a, pos: row * d[1] + col });
  }
});

window.addEventListener('resize', () => drawScreen());

// Touches 3270 à l'écran.
const keyBar = $('key-bar');
const showKeysBox = $('show-keys');
function showKeys() {
  return prefs.showKeys ?? matchMedia('(pointer: coarse)').matches;
}
showKeysBox.checked = showKeys();
showKeysBox.addEventListener('change', () => {
  prefs.showKeys = showKeysBox.checked;
  savePrefs();
  keyBar.hidden = !(currentTab.startsWith('t') && showKeys());
  drawScreen();
});
let pfShift = false;
function buildKeyBar() {
  keyBar.replaceChildren();
  const add = (label, key, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `key ${cls}`;
    b.textContent = label;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      if (key === 'shift') {
        pfShift = !pfShift;
        buildKeyBar();
      } else {
        termKey(key);
      }
      canvas.focus();
    });
    keyBar.append(b);
  };
  add('Enter', 'Enter', 'wide');
  add('Clear', 'Clear');
  add('PA1', 'PA1');
  add('PA2', 'PA2');
  add('Reset', 'Reset');
  add('ErEOF', 'EraseEOF');
  add('Ins', 'Insert');
  add(pfShift ? 'PF1-12' : 'PF13-24', 'shift');
  for (let i = 1; i <= 12; i++) add(`PF${i + (pfShift ? 12 : 0)}`, `PF${i + (pfShift ? 12 : 0)}`);
}
buildKeyBar();

// ------------------------------------------------------------------ copier, coller

$('copy-button').addEventListener('click', async () => {
  let text = '';
  const a = currentTerm();
  if (a !== null) {
    const d = screens.get(a);
    if (d) {
      const rows = d[0];
      const cols = d[1];
      const lines = [];
      for (let r = 0; r < rows; r++) {
        let s = '';
        for (let c = 0; c < cols; c++) s += String.fromCharCode(d[5 + 2 * (r * cols + c)]);
        lines.push(s.trimEnd());
      }
      text = lines.join('\n');
    }
  } else if (currentTab === 'printer') {
    text = printers[prefs.printer] ?? '';
  } else {
    text = consoleText;
  }
  try {
    await navigator.clipboard.writeText(text);
    showStatus('clip.copied');
  } catch {
    showStatus('clip.denied');
  }
});

$('paste-button').addEventListener('click', async () => {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    showStatus('clip.denied');
    return;
  }
  if (currentTerm() !== null) termChars(text);
  else if (currentTab === 'console') {
    consoleInput.value += text.split(/\r?\n/)[0];
    consoleInput.focus();
  }
});

// ------------------------------------------------------------------ lecteur de cartes

const SAMPLE_JCL = `//HELLO    JOB (ACCT),'HELLO WORLD',CLASS=A,MSGCLASS=A,
//             MSGLEVEL=(1,1),USER=HERC01,PASSWORD=CUL8TR
//* Compile, link and run a small assembler program.
//STEP1    EXEC ASMFCLG
//ASM.SYSPUNCH DD DUMMY
//ASM.SYSIN DD *
HELLO    CSECT
         STM   14,12,12(13)
         BALR  12,0
         USING *,12
         WTO   'HELLO FROM THE S/370 EMULATOR IN YOUR BROWSER'
         LM    14,12,12(13)
         SR    15,15
         BR    14
         END   HELLO
/*
//`;

const jcl = $('jcl');
jcl.value = localStorage.getItem('ibmz-jcl') ?? SAMPLE_JCL;
jcl.addEventListener('input', () => {
  try { localStorage.setItem('ibmz-jcl', jcl.value); } catch { /* rien */ }
});
$('jcl-sample').addEventListener('click', () => { jcl.value = SAMPLE_JCL; });
$('jcl-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) jcl.value = await f.text();
});
$('jcl-submit').addEventListener('click', () => {
  if (!running) {
    $('cards-status').textContent = t('cards.off');
    return;
  }
  const text = jcl.value.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  worker.postMessage({ type: 'submit', text });
  showStatus('cards.submitted', { n: text.split('\n').length });
});

// ------------------------------------------------------------------ départ

window.addEventListener('pagehide', () => worker?.postMessage({ type: 'flush' }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') worker?.postMessage({ type: 'flush' });
});
window.addEventListener('beforeunload', (e) => {
  if (running) {
    worker?.postMessage({ type: 'flush' });
    e.preventDefault();
  }
});

async function main() {
  if (!opfsOk) {
    errorBox.textContent = t('opfs.missing');
  }
  startWorker();
  await renderVolumes();
  await loadDepot();
  selectTab('console');
  updateButtons();
  document.documentElement.classList.replace('js-loading', 'js-ready');
}

main();
