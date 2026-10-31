// Page de l'émulateur IBM System/370 et z/Architecture : menu, volumes (OPFS), dépôt de
// fichiers, fil de la machine (worker.js), console de l'opérateur, terminaux 3270, pupitre,
// lecteur de cartes et imprimantes.

import { LANGUAGES, browserLanguage, getLanguage, setLanguage, t } from './i18n.js?v=60dae593';
import { initMemo } from './memo.js?v=60dae593';
import { deckText } from './decks.js?v=60dae593';
import { initVolumes, openVolumes, volConsole, volMachineChanged, volPrinter, volSettle } from './volumes.js?v=60dae593';
import { devices, initHerc, mounts, mountsMissing, overlayName, remountFromDir } from './herc-ui.js?v=60dae593';
import { Z_DEVICES } from './herc-conf.js?v=60dae593';
import { initPunch, openPunch, punchMachineChanged, savedDeckCount } from './punch.js?v=60dae593';
import { dropSession, importSessionFile, readSession, sessionFile, sessionFileHead } from './session.js?v=60dae593';
import { Questions } from './questions.js?v=60dae593';
import { initFind } from './find.js?v=60dae593';
import { pageCount, splitJobs } from './jobs.js?v=60dae593';
import { initTapes, renderTapes, tapesConsole, tapesState, tapesStopped } from './tapes.js?v=60dae593';
import { REMOTE, RemoteWorker, remoteInfo, remotePageTerms, remoteStats, remoteTerms as remoteTermsSet, renderMachine } from './remote.js?v=60dae593';

const VERSION = '0.1.55';
const V = new URL(import.meta.url).search;

const $ = (id) => document.getElementById(id);
const app = $('app');
const statusBox = $('status');
const overlay = $('overlay');
const errorBox = $('error');
const powerButton = $('power');
const powerLabel = $('power-label');
const speed = $('speed');
// Mise en veille (voir plus bas).
const ssDialog = $('ss');
const suspendButton = $('suspend');
let suspended = null;   // description de la session suspendue (meta.json), ou null
let remoteAccess = '';  // mode « machine distante » : accès donné par le serveur (auth, guest)
let ssBusy = '';        // mise en veille ('suspend') ou reprise ('resume') en cours
let ssForce = false;    // reprendre malgré des volumes changés (après avertissement)
let ssAuto = false;     // mise en veille automatique (arrière-plan) : reprise automatique
let finder = null;      // recherche dans la console et le journal (find.js)
// iPadOS et iOS (iPadOS se présente comme un Mac à écran tactile).
const appleTouch = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const autoSuspend = () => prefs.autoSuspend ?? appleTouch;

// ------------------------------------------------------------------ préférences

const PREFS_KEY = 'ibmz-prefs';
const prefs = {
  theme: 'system',
  sidebar: null,
  open: ['volumes'],
  lang: null,
  arch: 's370',           // machine : s370 (MVS 3.8j) ou z (z/Architecture, Linux s390x)
  mem: 16,
  ipl: '390',
  zmem: 256,              // z/Architecture : mémoire (Mo), processeurs, unité d'IPL, LOADPARM, Linux
  zcpus: 1,
  zipl: '00C',
  loadparm: '',
  zparm: 'ro locale=C',
  zbootNames: {},         // noms d'origine des fichiers du lecteur (boot/kernel, boot/initrd)
  terms: 2,
  fontSize: 16,
  showPanel: true,
  showKeys: null,
  autoSuspend: null,      // mise en veille en arrière-plan (null : oui sur iPad et iPhone)
  look: 'modern',         // écran 3270 : moderne, ou d'époque (phosphore, police 3270)
  resumeClock: false,     // reprise : horloge du système remise à l'heure réelle
  depot: 'https://ve2cuy.com/vax/ibmz',
  turbo: false,
  printer: 0x00E,
  printerFit: false,      // imprimante : toute la largeur de la feuille à l'écran
  termFit: null,          // terminal ajusté à la fenêtre (null : oui, sauf sur écran tactile)
  relay: false,
  eth: false,             // carte Ethernet par le relais (z/Architecture) : 'lcs' (E20-E21), 'osa' (0400-0402)
  relayUrl: 'ws://127.0.0.1:8370',
  devices: null,          // unités d'une configuration Hercules importée (null : celles de TK5)
  devicesName: null,
  jobUser: 'HERC01',      // gestionnaire de volumes : travaux et statistiques ISPF
  jobPassword: 'CUL8TR',
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

// Le fichier et la ligne aident à comprendre un « Script error » (Safari le donne sans détail).
const where = (file, line) => (file ? ` (${file.split('/').pop().split('?')[0]}:${line})` : '');
window.addEventListener('error', (e) => showStatus('error', { msg: `${e.error?.message ?? e.message}${where(e.filename, e.lineno)}` }));
window.addEventListener('unhandledrejection', (e) => showStatus('error', { msg: e.reason?.message ?? String(e.reason) }));

/** Nombre à `d` décimales selon la langue (10,74 en français, 10.74 en anglais). */
function fmtNum(x, d) {
  const loc = { fr: 'fr-CA', es: 'es', zh: 'zh-CN' }[langList.value] ?? 'en';
  return x.toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtSize(n) {
  if (n >= 1e9) return `${fmtNum(n / 1e9, 2)} ${t('unit.gb')}`;
  if (n >= 1e6) return `${fmtNum(n / 1e6, 1)} ${t('unit.mb')}`;
  return `${Math.max(1, Math.round(n / 1e3))} ${t('unit.kb')}`;
}

const hex3 = (n) => n.toString(16).toUpperCase().padStart(3, '0');
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');

// ------------------------------------------------------------------ volumes (OPFS)

const opfsOk = !!navigator.storage?.getDirectory;
let volumes = [];      // [{file, addr, size}]
// Relais (terminaux TN3270, réseau de la carte Ethernet) : état annoncé par le fil; carte
// de la machine en marche (fixée à l'IPL) et son état (message eth du fil).
let relayState = { state: 'off', clients: [] };
let runEth = false;
let ethState = '';
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
  // Un volume lu sur place remplace celui de l'OPFS à la même adresse (comme à l'IPL).
  const lus = prefs.mounts ?? [];
  for (const v of volumes) {
    if (lus.some((m) => m.addr === v.addr)) continue;
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
  // Volumes lus sur place : fichier du disque de l'usager (et ses ombres), ou à choisir de
  // nouveau (nouvelle visite).
  let lusSize = 0;
  for (const m of [...lus].sort((a, b) => a.addr - b.addr)) {
    const here = mounts.get(m.addr);
    const li = document.createElement('li');
    li.className = here ? 'mounted' : 'mounted need';
    const name = document.createElement('span');
    name.className = 'mono';
    name.textContent = `${hex3(m.addr)}  ${m.name}${m.shadows ? ` +${m.shadows}` : ''}`;
    name.title = here ? t('vol.mounted.tip', { path: m.path ?? m.name, n: m.shadows }) : t('vol.mounted.need');
    const size = document.createElement('span');
    size.className = 'hint';
    size.textContent = here ? fmtSize(here.file.size) : t('vol.mounted.none');
    if (here) lusSize += here.file.size;
    li.append(name, size);
    list.append(li);
  }
  const shown = volumes.filter((v) => !lus.some((m) => m.addr === v.addr));
  const total = shown.reduce((s, v) => s + v.size, 0);
  const parts = [];
  if (shown.length) parts.push(t('vol.summary', { n: shown.length, size: fmtSize(total) }));
  if (lus.length) parts.push(t('vol.mounted', { n: lus.length, size: fmtSize(lusSize), dir: prefs.hercDirName ?? '' }));
  $('vol-summary').textContent = parts.length ? parts.join(' ') : t('vol.none');
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

/**
 * Ouvre `file` (dossier des volumes de l'OPFS) en écriture, vidé. Safari d'iOS et d'iPadOS
 * (avant la version 26) n'a pas createWritable() : un fil y écrit par un accès synchrone.
 */
async function openWriter(dir, file, dirName = 'dasd') {
  const fh = await dir.getFileHandle(file, { create: true });
  if (typeof fh.createWritable === 'function') {
    const out = await fh.createWritable();
    return { fh, write: (chunk) => out.write(chunk), close: () => out.close(), abort: () => out.abort() };
  }
  const writer = new Worker(new URL(`./opfs-writer.js${V}`, import.meta.url));
  const ask = (msg, transfer = []) => new Promise((resolve, reject) => {
    writer.onmessage = ({ data }) => (data.ok ? resolve() : reject(new Error(data.msg)));
    writer.onerror = (e) => reject(new Error(e.message || 'opfs-writer.js'));
    writer.postMessage(msg, transfer);
  });
  try {
    await ask({ type: 'open', file, dir: dirName });
  } catch (e) {
    writer.terminate();
    throw e;
  }
  return {
    fh,
    write: (chunk) => {
      // Copie : le bloc d'origine peut être la vue d'un tampon plus grand.
      const copy = chunk.slice();
      return ask({ type: 'write', chunk: copy }, [copy.buffer]);
    },
    close: async () => {
      try { await ask({ type: 'close' }); } finally { writer.terminate(); }
    },
    abort: () => writer.terminate(),
  };
}

/** Copie un flux dans l'OPFS (fichier .part, renommé à la fin si le fureteur sait renommer);
 *  dossier `dirName` (défaut : celui des volumes). */
async function writeVolume(name, stream, onBytes, dirName = 'dasd') {
  const dir = dirName === 'dasd' ? await volDir() : await (await navigator.storage.getDirectory()).getDirectoryHandle(dirName, { create: true });
  const canMove = typeof FileSystemHandle !== 'undefined' && typeof FileSystemHandle.prototype.move === 'function';
  const part = canMove ? `${name}.part` : name;
  const out = await openWriter(dir, part, dirName);
  const reader = stream.getReader();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await out.write(value);
      total += value.length;
      onBytes?.(value.length);
    }
    await out.close();
  } catch (e) {
    try { await out.abort(); } catch { /* rien */ }
    await dir.removeEntry(part).catch(() => {});
    throw e;
  }
  if (canMove) {
    await dir.removeEntry(name).catch(() => {});
    try {
      // Forme à deux arguments : WebKit (Safari, et Chrome et Edge d'iPadOS) exige le
      // dossier de destination (« Not enough arguments » sinon).
      await out.fh.move(dir, name);
    } catch {
      // Renommage refusé : copie sous le nom final, puis le fichier .part est effacé.
      const copy = await openWriter(dir, name, dirName);
      const reader = (await out.fh.getFile()).stream().getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await copy.write(value);
      }
      await copy.close();
      await dir.removeEntry(part).catch(() => {});
    }
  }
  // Fureteur qui n'écrit pas vraiment (stockage refusé, plein…) : le fichier n'a pas la
  // taille reçue, il est effacé.
  const size = (await (await dir.getFileHandle(name)).getFile()).size;
  if (size !== total) {
    await dir.removeEntry(name).catch(() => {});
    throw new Error(t('vol.shortwrite', { name, size, total }));
  }
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
  if (!(await sessionGuard())) return;
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
    lic.textContent = localized(entry, 'license');
    const have = depotHave(entry);
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
  renderZbootDepot();
}
languageListeners.push(renderDepot);

/** Le paquet est déjà dans ce fureteur (volumes, ou fichiers de Linux du dossier boot). */
function depotHave(entry) {
  if (entry.kind === 'linux') {
    return entry.files.every((f) => zboot[f.role] === f.size && prefs.zbootNames?.[f.role] === f.file);
  }
  return entry.files.every((f) => volumes.some((v) => v.file === f.file && v.size === f.size));
}

/** Paquet de Linux du dépôt (Debian pour s390x), pour le bouton du lecteur (z/Architecture). */
function renderZbootDepot() {
  const b = $('zboot-depot');
  const entry = depot.find((e) => e.kind === 'linux');
  b.hidden = !entry;
  if (!entry) return;
  b.querySelector('span').textContent = t('zboot.depot', { size: fmtSize(entry.size) });
  b.title = localized(entry, 'title');
  b.disabled = downloading || running;
}
languageListeners.push(renderZbootDepot);
$('zboot-depot').addEventListener('click', () => {
  const entry = depot.find((e) => e.kind === 'linux');
  if (entry) downloadPack(entry, false);
});

async function downloadPack(entry, again) {
  if (downloading || running) return;
  // Volumes : les changements faits par MVS seraient perdus. Linux : fichiers d'origine.
  if (again && entry.kind !== 'linux' && !confirm(t('depot.again.confirm'))) return;
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
    if (entry.kind === 'linux') {
      await downloadLinux(entry, (f, n) => { done += n; show(f); });
    } else {
      for (const f of entry.files) {
        show(f.file);
        const r = await fetch(`${prefs.depot}/dasd/${entry.id}/${f.file}`);
        if (!r.ok || !r.body) throw new Error(`${f.file} : HTTP ${r.status}`);
        await writeVolume(f.file, r.body, (n) => { done += n; show(f.file); });
      }
    }
    if (entry.ipl && entry.kind !== 'linux') {
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
    renderDepot();
  }
}

/**
 * Paquet de Linux : noyau et image initiale rangés dans le dossier boot (comme les fichiers
 * choisis à la main), puis la machine z/Architecture prête pour l'IPL du lecteur.
 */
async function downloadLinux(entry, progress) {
  for (const f of entry.files) {
    progress(f.file, 0);
    const r = await fetch(`${prefs.depot}/dasd/${entry.id}/${f.file}`);
    if (!r.ok || !r.body) throw new Error(`${f.file} : HTTP ${r.status}`);
    const out = await openWriter(await bootDir(), f.role, 'boot');
    try {
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await out.write(value);
        progress(f.file, value.length);
      }
      await out.close();
    } catch (e) {
      await out.abort();
      throw e;
    }
    prefs.zbootNames = { ...prefs.zbootNames, [f.role]: f.file };
  }
  prefs.arch = 'z';
  if (entry.ipl) prefs.zipl = entry.ipl;
  if (entry.parm) {
    prefs.zparm = entry.parm;
    zparmInput.value = entry.parm;
  }
  savePrefs();
  showMachine();
  showDials();
  await loadZboot();
}

// ------------------------------------------------------------------ machine

const memList = $('mem-list');
const isZ = () => prefs.arch === 'z';
// Tailles de la mémoire offertes selon la machine (Mo), avec l'unité dans la langue choisie.
function memLabels() {
  const sizes = isZ() ? [64, 128, 256, 512, 1024, 2048] : [8, 16];
  const cur = isZ() ? prefs.zmem : prefs.mem;
  memList.replaceChildren(...sizes.map((n) => new Option(n >= 1024 ? `${n / 1024} ${t('unit.gb')}` : `${n} ${t('unit.mb')}`, String(n))));
  memList.value = String(sizes.includes(cur) ? cur : sizes[sizes.length - 1]);
}
languageListeners.push(memLabels);
memLabels();
memList.addEventListener('change', () => {
  if (isZ()) prefs.zmem = Number(memList.value);
  else prefs.mem = Number(memList.value);
  savePrefs();
});

/** Carte Ethernet choisie au menu Réseau local : 'lcs', 'osa' ou '' (true : LCS, ancien
 *  réglage). */
function ethCard() {
  return prefs.eth === true ? 'lcs' : prefs.eth === 'lcs' || prefs.eth === 'osa' ? prefs.eth : '';
}

/** Unités de la machine choisie : la configuration importée, sinon celles de TK5 (S/370) ou
 *  du lecteur, de la perforatrice et de l'imprimante (z/Architecture). */
function machineDevices() {
  const list = isZ() && !prefs.devices?.length ? Z_DEVICES : devices();
  // Carte Ethernet du menu Réseau local (z/Architecture), si la configuration n'en a pas.
  const card = ethCard();
  if (isZ() && card && !list.some((d) => d.kind === 'lcs' || d.kind === 'osa')) {
    const addrs = card === 'osa' ? [0x400, 0x401, 0x402] : [0xE20, 0xE21];
    return [...list, ...addrs.map((addr) => ({ addr, kind: card, type: card === 'osa' ? 'QETH' : 'LCS' }))];
  }
  return list;
}

/** Unité d'IPL de la machine choisie (trois chiffres hexadécimaux). */
const iplPref = () => (isZ() ? prefs.zipl : prefs.ipl);
function setIplPref(v) {
  if (isZ()) prefs.zipl = v;
  else prefs.ipl = v;
}
// Configuration au format de Hercules (herc-ui.js) : unités en service, import, export.
languageListeners.push(initHerc({
  prefs,
  savePrefs,
  version: VERSION,
  search: V,
  volumes: () => volumes,
  running: () => running,
  volDir,
  writeVolume,
  renderVolumes,
  status: showStatus,
  sessionGuard,
  // Nouvelle configuration : terminaux, imprimantes et mémoire montrés de nouveau.
  applied: () => {
    showMachine();
    renderVolumes();
  },
}));

const termsList = $('terms-list');
/** Terminaux locaux de la configuration (0C0-0C6 pour TK5). */
function localTerminals() {
  return machineDevices().filter((d) => d.kind === 'terminal').map((d) => d.addr);
}
// Choix du nombre de terminaux montrés, avec leurs adresses.
function termLabels() {
  const list = localTerminals();
  for (const o of termsList.options) {
    const n = Number(o.value);
    const a = list.slice(0, n).map(hex3);
    o.textContent = a.length ? `${n} (${n > 2 ? `${a[0]}-${a[a.length - 1]}` : a.join(', ')})` : String(n);
    o.disabled = list.length < n && n > 1;
  }
}
termLabels();
termsList.value = String(prefs.terms);
termsList.addEventListener('change', () => { prefs.terms = Number(termsList.value); savePrefs(); });
const iplInput = $('ipl-addr');
iplInput.value = iplPref();
iplInput.addEventListener('change', () => {
  const v = iplInput.value.trim().toUpperCase();
  if (/^[0-9A-F]{1,3}$/.test(v)) setIplPref(v.padStart(3, '0'));
  iplInput.value = iplPref();
  savePrefs();
  showDials();
});

// --- choix de la machine, LOADPARM, Linux par le lecteur (z/Architecture)
const archList = $('arch-list');
archList.value = prefs.arch;
archList.addEventListener('change', () => {
  prefs.arch = archList.value === 'z' ? 'z' : 's370';
  savePrefs();
  showMachine();
});
const cpusList = $('cpus-list');
cpusList.addEventListener('change', () => {
  prefs.zcpus = Number(cpusList.value) || 1;
  savePrefs();
});
// Commandes d'opérateur tapées par la page après l'IPL d'un disque (z/Architecture) : gardées
// dans les réglages de la page, elles survivent à l'effacement des ombres des volumes.
const zcmdsInput = $('zcmds');
zcmdsInput.value = prefs.zcmds ?? '';
zcmdsInput.addEventListener('change', () => {
  prefs.zcmds = zcmdsInput.value;
  savePrefs();
});
const zcmdsList = () => (prefs.zcmds ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
const loadparmInput = $('loadparm');
loadparmInput.value = prefs.loadparm;
loadparmInput.addEventListener('change', () => {
  prefs.loadparm = loadparmInput.value.trim().toUpperCase().slice(0, 8);
  loadparmInput.value = prefs.loadparm;
  savePrefs();
});
const zparmInput = $('zboot-parm');
zparmInput.value = prefs.zparm;
zparmInput.addEventListener('change', () => {
  prefs.zparm = zparmInput.value.trim();
  savePrefs();
});

/** Fichiers du lecteur pour Linux (dossier boot de l'OPFS) : {kernel, initrd} -> taille. */
const zboot = { kernel: null, initrd: null };
const zbootReady = () => !!(zboot.kernel && zboot.initrd);

async function bootDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('boot', { create: true });
}

async function loadZboot() {
  if (!opfsOk) return;
  const dir = await bootDir();
  for (const k of ['kernel', 'initrd']) {
    try {
      zboot[k] = (await (await dir.getFileHandle(k)).getFile()).size;
    } catch {
      zboot[k] = null;
    }
  }
  renderZboot();
}

function renderZboot() {
  const list = $('zboot-files');
  const items = [['kernel', 'zboot.k'], ['initrd', 'zboot.i']].filter(([k]) => zboot[k] !== null).map(([k, label]) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'mono';
    name.textContent = `${t(label)} : ${prefs.zbootNames[k] ?? k}`;
    const size = document.createElement('span');
    size.className = 'hint';
    size.textContent = fmtSize(zboot[k]);
    li.append(name, size);
    return li;
  });
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.textContent = t('zboot.none');
    items.push(li);
  }
  list.replaceChildren(...items);
  $('zboot-clear').disabled = running || (zboot.kernel === null && zboot.initrd === null);
  for (const id of ['zboot-kernel', 'zboot-initrd']) $(id).disabled = running;
  renderZbootDepot();
  updateButtons();
}
languageListeners.push(renderZboot);

for (const k of ['kernel', 'initrd']) {
  $(`zboot-${k}`).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || running) return;
    try {
      const out = await openWriter(await bootDir(), k, 'boot');
      const reader = f.stream().getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await out.write(value);
      }
      await out.close();
      prefs.zbootNames = { ...prefs.zbootNames, [k]: f.name };
      savePrefs();
      await keepStorage();
      showStatus('zboot.saved', { name: f.name });
    } catch (err) {
      showStatus('error', { msg: err.message });
    }
    loadZboot();
  });
}

$('zboot-clear').addEventListener('click', async () => {
  if (running) return;
  const dir = await bootDir();
  for (const k of ['kernel', 'initrd']) await dir.removeEntry(k).catch(() => {});
  prefs.zbootNames = {};
  savePrefs();
  loadZboot();
});

/** z/Architecture : l'unité d'IPL est le lecteur (Linux par ses fichiers). */
function iplFromReader() {
  const addr = parseInt(iplPref(), 16);
  return isZ() && machineDevices().some((d) => d.kind === 'reader' && d.addr === addr);
}

// Système chargé sur la machine z/Architecture : Linux (IPL du lecteur, ou reconnu sur la
// console), sinon un système chargé d'un disque.
let zLinux = false;

/** Exemple du champ de commande de la console, selon le système chargé (ou à charger). */
function consoleHint() {
  const ci = $('console-input');
  const linux = running ? zLinux : iplFromReader();
  const key = !isZ() ? 'console.placeholder' : linux ? 'console.placeholder.z' : 'console.placeholder.disk';
  ci.dataset.i18nPlaceholder = key;
  ci.placeholder = t(key);
  ci.setAttribute('autocapitalize', linux ? 'off' : 'characters');
}

/** La machine choisie : description, mémoire, unité d'IPL, champs de z/Architecture. */
function showMachine() {
  archList.value = prefs.arch;
  archList.disabled = running;
  // Nom de la machine (titre), exemple de commande de la console.
  const name = isZ() ? 'IBM z/Architecture' : 'IBM System/370';
  document.title = name;
  for (const el of document.querySelectorAll('.machine-name')) el.textContent = name;
  consoleHint();
  showEth();
  $('machine-desc').textContent = t(isZ() ? 'machine.desc.z' : 'machine.desc');
  memLabels();
  $('loadparm-field').hidden = !isZ();
  loadparmInput.value = prefs.loadparm;
  $('cpus-field').hidden = !isZ();
  $('zcmds-field').hidden = !isZ();
  cpusList.value = String(prefs.zcpus ?? 1);
  $('zboot').hidden = !isZ();
  showDials();
  termLabels();
  showPrinter();
  updateButtons();
}
languageListeners.push(() => { $('machine-desc').textContent = t(isZ() ? 'machine.desc.z' : 'machine.desc'); });

let worker = null;
let running = false;
let lastError = '';
let terminals = [];

/** Un IPL est possible : des volumes (copiés ou lus sur place), ou (z/Architecture) les
 *  fichiers de Linux. */
const canIpl = () => volumes.length > 0 || (prefs.mounts?.length ?? 0) > 0 || (isZ() && zbootReady());

function updateButtons() {
  if (REMOTE) {
    // Machine du serveur : pas d'IPL ni de mise en veille d'ici; Arrêter si l'accès est complet.
    powerButton.disabled = !running || remoteAccess !== 'auth';
    powerLabel.textContent = t('power.stop');
    $('btn-load').disabled = true;
    suspendButton.hidden = true;
    $('btn-interrupt').disabled = !running || remoteAccess !== 'auth';
    $('btn-restart').disabled = !running || remoteAccess !== 'auth';
    $('turbo').disabled = !running || remoteAccess !== 'auth';
    $('console-input').disabled = remoteAccess !== 'auth';
    overlay.hidden = !errorBox.textContent;
    setLight('lt-man', !running);
    return;
  }
  powerButton.disabled = !worker || !!ssBusy || (!running && !canIpl());
  powerLabel.textContent = t(running ? 'power.stop' : 'power.ipl');
  $('btn-load').disabled = running || !!ssBusy || !canIpl();
  // Suspendre (machine en marche), ou Reprendre (session suspendue).
  suspendButton.hidden = !running && !suspended;
  suspendButton.disabled = !worker || !!ssBusy || shuttingDown;
  $('suspend-label').textContent = t(running ? 'ss.suspend' : 'ss.resume');
  $('suspend-icon').setAttribute('href', running ? '#i-pause' : '#i-play');
  suspendButton.title = t(running ? 'ss.tip' : 'ss.resume.tip');
  // Session suspendue : les écrans sont assombris (le système ne tourne plus).
  $('monitor').classList.toggle('suspended', !running && !!suspended);
  $('tabs').classList.toggle('suspended', !running && !!suspended);
  $('monitor').dataset.ssLabel = t('ss.badge');
  archList.disabled = running;
  $('btn-interrupt').disabled = !running;
  $('btn-restart').disabled = !running;
  $('vol-erase').disabled = !volumes.length || running;
  showOverlay();
  setLight('lt-man', !running);
}
languageListeners.push(updateButtons);

function showOverlay() {
  // Invitation au dépôt (TK5) : machine S/370 sans volume seulement.
  const need = !volumes.length && !running && !isZ();
  overlay.hidden = !need && !errorBox.textContent;
  $('overlay-start').hidden = !need;
  $('overlay-menu').hidden = !need;
}

function startWorker() {
  // Mode « machine distante » : la machine du serveur (remote.js) au lieu de worker.js.
  if (REMOTE) {
    worker = new RemoteWorker();
    worker.onmessage = onWorkerMessage;
    return;
  }
  worker = new Worker(new URL(`./worker.js${V}`, import.meta.url), { type: 'module' });
  worker.onmessage = onWorkerMessage;
  worker.onerror = (e) => showStatus('error', { msg: `${e.message || 'worker'}${where(e.filename, e.lineno) || ' (worker.js)'}` });
}

let runArch = 's370';   // machine en marche
let workerBroken = false; // erreur fatale du module : fil à recréer avant le prochain IPL

async function ipl() {
  if (running || !worker) return;
  // Erreur fatale du module à la marche précédente : un fil neuf (module rechargé).
  if (workerBroken) {
    worker.terminate();
    startWorker();
    workerBroken = false;
  }
  // Volumes lus sur place d'une visite précédente : retrouvés dans le dossier de Hercules
  // gardé (l'accès se redemande pendant ce clic, avant toute autre attente).
  if (mountsMissing().length) await remountFromDir();
  // Une session suspendue serait faussée par l'IPL (les volumes changent) : abandonnée.
  if (!(await sessionGuard())) return;
  const vols = await listVolumes();
  const addr = parseInt(iplPref(), 16);
  // z/Architecture : IPL du lecteur avec les fichiers de Linux.
  const readerIpl = iplFromReader();
  if (readerIpl) {
    if (!zbootReady()) {
      showStatus('ipl.noboot', { addr: iplPref() });
      logEvent('page', { key: 'ipl.noboot', addr: iplPref() });
      return;
    }
  }
  // Volumes lus sur place : fichiers choisis pendant cette visite; ils remplacent un volume
  // de l'OPFS à la même adresse.
  const need = mountsMissing();
  if (need.length) {
    showStatus('ipl.remount', { n: need.length });
    logEvent('page', { key: 'ipl.remount', n: need.length });
    showPanel('machine');
    return;
  }
  const mounted = [...mounts.entries()].map(([a, m]) => ({ addr: a, stem: m.stem, file: m.file, shadows: m.shadows, overlay: overlayName({ addr: a, stem: m.stem }) }));
  const opfs = vols.filter((v) => !mounted.some((m) => m.addr === v.addr));
  if (!readerIpl) {
    // Un volume à cette adresse, ou une autre unité de la configuration (bande, lecteur,
    // perforatrice : l'IPL est tenté, le moniteur dira pourquoi il échoue).
    const unit = machineDevices().some((d) => d.addr === addr && d.kind !== 'terminal' && d.kind !== 'console');
    if (!opfs.some((v) => v.addr === addr) && !mounted.some((m) => m.addr === addr) && !unit) {
      // Volume de la configuration importée, mais absent (fichiers pas choisis).
      const want = prefs.missingVols?.find((m) => m.addr === addr);
      const key = want ? 'ipl.novol.cnf' : 'ipl.novol';
      showStatus(key, { addr: iplPref(), stem: want?.stem ?? '' });
      logEvent('page', { key, addr: iplPref(), stem: want?.stem ?? '' });
      return;
    }
  }
  runArch = prefs.arch;
  terminals = localTerminals().slice(0, prefs.terms);
  buildTabs();
  consoleText = '';
  consoleOut.textContent = '';
  questions.clear();
  for (const k of Object.keys(printers)) delete printers[k];
  showPrinter();
  running = true;
  zLinux = readerIpl;
  consoleHint();
  volMachineChanged();
  punchMachineChanged();
  setLight('lt-load', true);
  updateButtons();
  renderVolumes();
  showStatus('ipl.starting', { addr: iplPref() });
  renderZboot();
  worker.postMessage({
    type: 'start',
    arch: prefs.arch,
    mem: isZ() ? prefs.zmem : prefs.mem,
    ncpu: isZ() ? prefs.zcpus ?? 1 : 1,
    loadparm: isZ() ? prefs.loadparm : '',
    // Système chargé d'un disque (pas Linux par le lecteur) : commandes après l'IPL.
    autoCmds: isZ() && !readerIpl ? zcmdsList() : [],
    boot: readerIpl ? { parm: prefs.zparm || 'ro' } : null,
    ipl: addr,
    volumes: opfs.map((v) => ({ addr: v.addr, file: v.file })),
    mounts: mounted,
    devices: machineDevices(),
    terminals,
    // Le relais sert aux terminaux TN3270 et à la carte Ethernet.
    relay: prefs.relay || ethDevice() ? prefs.relayUrl : null,
    relayTerms: prefs.relay,
  });
  worker.postMessage({ type: 'turbo', on: prefs.turbo });
}

let shuttingDown = false;

// --- fenêtre de l'arrêt propre : étapes cochées, durée, fin claire (« vous pouvez fermer
// la page » seulement quand les volumes sont écrits et refermés).
const sd = $('sd');
// Étapes de l'arrêt de TK5 (MVS 3.8j) et de la machine z/Architecture (opérateur
// automatique de worker.js).
const SD_STEPS = {
  s370: ['request', 'tso', 'tasks', 'jes2', 'eod', 'quiesce', 'save'],
  z: ['request', 'tasks', 'zfs', 'remain', 'jes2', 'eod', 'save'],
};
let sdArch = 's370';
let sdAt = 0;
let sdNote = ''; // remarque ajoutée au résultat (fin de journée avec des erreurs)
let sdStart = 0;
let sdClock = 0;

const sdList = () => $(sdArch === 'z' ? 'sd-steps-z' : 'sd-steps');

/** Étape en cours (les étapes ne reculent pas : zFS peut répondre avant ou après). */
function sdMark(step) {
  const steps = SD_STEPS[sdArch];
  const at = steps.indexOf(step);
  if (at < sdAt) return;
  sdAt = at;
  for (const li of sdList().querySelectorAll('li')) {
    const i = steps.indexOf(li.dataset.step);
    li.classList.toggle('done', i < at);
    li.classList.toggle('active', i === at);
  }
}

function sdOpen(arch = 's370') {
  sdArch = arch;
  sdAt = 0;
  sdStart = performance.now();
  $('sd-steps').hidden = arch === 'z';
  $('sd-steps-z').hidden = arch !== 'z';
  // Titre et avertissement de la machine (data-i18n : gardés au changement de langue).
  $('sd-title').dataset.i18n = arch === 'z' ? 'sd.title.z' : 'sd.title';
  $('sd-warning').dataset.i18n = arch === 'z' ? 'sd.warning.z' : 'sd.warning';
  $('sd-title').textContent = t($('sd-title').dataset.i18n);
  $('sd-warning').textContent = t($('sd-warning').dataset.i18n);
  $('sd-tso').textContent = t('sd.tso');
  $('sd-z-tasks').textContent = t('sd.z.tasks');
  $('sd-z-remain').textContent = t('sd.z.remain');
  for (const li of sdList().querySelectorAll('li')) li.classList.remove('done', 'active');
  $('sd-result').textContent = '';
  $('sd-result').className = 'sd-result';
  $('sd-warning').hidden = false;
  $('sd-close').hidden = true;
  $('sd-hide').hidden = false;
  sdMark('request');
  clearInterval(sdClock);
  sdClock = setInterval(() => {
    $('sd-time').textContent = t('sd.elapsed', { s: Math.round((performance.now() - sdStart) / 1000) });
  }, 500);
  if (!sd.open) sd.showModal();
}

function sdPhase({ phase, users, wait, proc, names, how }) {
  if (!sdStart) sdOpen(runArch);
  if (phase === 'eodwarn') {
    // Fin de journée avec des erreurs (IEE497I), ou sans réponse : dit à la fin.
    sdNote = t(how === 'timeout' ? 'sd.z.eodtimeout' : 'sd.z.eoderr');
    return;
  }
  if (phase === 'started') sdMark('tso');
  else if (phase === 'tso') {
    $('sd-tso').textContent = users === 0 ? t('sd.tso.none')
      : users > 0 ? t('sd.tso.some', { n: users, s: Math.round(wait / 1000) }) : t('sd.tso.unknown');
    sdMark('tso');
  } else if (phase === 'tasks' && proc) {
    $('sd-z-tasks').textContent = t('sd.z.tasks.proc', { proc });
    sdMark('tasks');
  } else if (phase === 'remain') {
    $('sd-z-remain').textContent = t('sd.z.remain.list', { list: names.join(', ') });
    sdMark('remain');
  } else sdMark(phase);
}

function sdStopped(reason) {
  if (!sdStart) return;
  clearInterval(sdClock);
  const s = Math.round((performance.now() - sdStart) / 1000);
  sdStart = 0;
  const ok = reason === 'shutdown';
  for (const li of sdList().querySelectorAll('li')) {
    li.classList.remove('active');
    if (ok) li.classList.add('done');
  }
  $('sd-warning').hidden = true;
  $('sd-result').textContent = t(ok ? 'sd.done' : 'sd.other', { s }) + (ok && sdNote ? ` ${sdNote}` : '');
  sdNote = '';
  $('sd-result').classList.toggle('ok', ok);
  $('sd-result').classList.toggle('error', !ok);
  $('sd-time').textContent = '';
  $('sd-hide').hidden = true;
  $('sd-close').hidden = false;
  if (!sd.open) sd.showModal();
}

$('sd-hide').addEventListener('click', () => sd.close());
$('sd-close').addEventListener('click', () => sd.close());

function stopMachine() {
  if (!running) return;
  // Machine z/Architecture du serveur : pas encore d'arrêt propre automatique.
  if (REMOTE && runArch === 'z') {
    if (confirm(t('remote.z.stop'))) worker.postMessage({ type: 'stop' });
    return;
  }
  // Arrêt propre : procédure SHUTDOWN de TK5 (MVS 3.8j), ou opérateur automatique
  // (z/Architecture, système chargé d'un disque).
  if (!shuttingDown && runArch === 's370') {
    // Arrêt propre de MVS (procédure SHUTDOWN de TK5), ou arrêt immédiat.
    if (confirm(t('power.shutdown.confirm'))) {
      shuttingDown = true;
      worker.postMessage({ type: 'shutdown' });
      showStatus('power.shutting');
      sdOpen();
      return;
    }
  }
  // z/Architecture (pas Linux) : l'opérateur automatique de worker.js, par la console du système.
  if (!shuttingDown && runArch === 'z' && !zLinux) {
    if (confirm(t('power.shutdown.z.confirm'))) {
      shuttingDown = true;
      worker.postMessage({ type: 'shutdown' });
      showStatus('power.shutting.z');
      sdOpen('z');
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
// Mode « machine distante » : le turbo est celui de la machine du serveur (toutes les pages).
let remoteTurbo = false;
function showTurbo() {
  const on = REMOTE ? remoteTurbo : prefs.turbo;
  turboButton.setAttribute('aria-pressed', String(on));
  turboButton.classList.toggle('active', on);
}
turboButton.addEventListener('click', () => {
  if (REMOTE) {
    worker?.postMessage({ type: 'turbo', on: !remoteTurbo });
    return;
  }
  prefs.turbo = !prefs.turbo;
  savePrefs();
  showTurbo();
  worker?.postMessage({ type: 'turbo', on: prefs.turbo });
});
showTurbo();

// ------------------------------------------------------------------ questions en attente

// Questions de l'opérateur (WTOR) relevées par questions.js : un bouton de la barre du
// haut les signale; la fenêtre propose une réponse que l'usager vérifie avant de l'envoyer
// (sur la console où la question a paru).
const qaDialog = $('qa');
const questions = new Questions((list, added = []) => {
  $('qa-button').hidden = !list.length;
  $('qa-count').textContent = String(list.length);
  for (const k of added) {
    const q = list.find((x) => x.key === k);
    if (q) logEvent('qa.new', { id: q.id ?? '—', text: q.text });
  }
  if (qaDialog.open) qaRender();
});

function qaSource(q) {
  return q.src === 'term' ? t('qa.src.term', { addr: hex3(q.addr) }) : t('qa.src.console');
}

function qaRender() {
  const list = questions.list();
  const box = $('qa-list');
  box.replaceChildren();
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = t('qa.none');
    box.append(p);
    return;
  }
  for (const q of list) {
    const item = document.createElement('div');
    item.className = 'qa-item';
    const text = document.createElement('div');
    text.className = 'qa-text';
    text.textContent = `${q.id !== null ? `${q.id}  ` : ''}${q.text}`;
    const row = document.createElement('form');
    row.className = 'row qa-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'mono';
    input.spellcheck = false;
    input.autocapitalize = 'characters';
    input.value = `R ${q.id ?? '00'},${q.proposal}`;
    const send = document.createElement('button');
    send.type = 'submit';
    send.textContent = t('qa.send');
    row.append(input, send);
    row.addEventListener('submit', (e) => {
      e.preventDefault();
      qaSend(q, input.value.trim());
    });
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = (q.proposal ? `${t('qa.proposed', { r: q.proposal })} · ` : '') + qaSource(q);
    item.append(text, row, hint);
    box.append(item);
  }
}

/** Réponse de l'usager : tapée sur la console où la question a paru. */
function qaSend(q, text) {
  if (!text || !running) return;
  if (q.src === 'term') {
    worker.postMessage({ type: 'char', addr: q.addr, text });
    worker.postMessage({ type: 'key', addr: q.addr, key: 'Enter' });
  } else {
    worker.postMessage({ type: 'console', text });
  }
  logEvent('qa.sent', { text, src: qaSource(q) });
  questions.answered(q.key);
  qaRender();
}

$('qa-button').addEventListener('click', () => {
  qaRender();
  qaDialog.showModal();
});
$('qa-close').addEventListener('click', () => qaDialog.close());

// ------------------------------------------------------------------ mise en veille

// Session suspendue (session.js, worker.js) : la machine arrêtée à une limite
// d'instruction, son état écrit dans l'OPFS avec la configuration et les empreintes des
// volumes; reprise plus tard, même après un rechargement de la page ou une mise à jour de
// l'application. Un IPL, l'effacement des volumes ou de l'ombre de la page, une écriture
// directe du gestionnaire de volumes l'abandonnent (après confirmation).
const ssDate = (meta) => new Date(meta.date).toLocaleString(getLanguage());

/** Temps simulé (ms) en h:mm:ss. */
function ssDuration(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function ssDescribe(meta) {
  const c = meta.cfg;
  return t('ss.desc', {
    date: ssDate(meta),
    machine: c.arch === 'z' ? 'IBM z/Architecture' : 'IBM System/370',
    mem: c.mem,
    ncpu: c.ncpu || 1,
    sim: ssDuration(meta.simMs),
    mb: Math.max(1, Math.round(meta.bytes / 1048576)),
    app: meta.app,
  });
}

/** Erreur de la reprise (« code|détail » de machine::snap) en texte. */
function ssError(msg) {
  const [code, detail = ''] = String(msg).split('|');
  const key = `ss.err.${code}`;
  const text = t(key, { detail });
  return text === key ? String(msg) : text;
}

function ssShow({ title, text = '', progress = false, result = '', ok = true, buttons = [] }) {
  $('ss-title').dataset.i18n = title;
  $('ss-title').textContent = t(title);
  $('ss-text').textContent = text;
  const p = $('ss-progress');
  p.hidden = !progress;
  if (progress) p.removeAttribute('value');
  $('ss-result').textContent = result;
  $('ss-result').className = `sd-result${result ? (ok ? ' ok' : ' error') : ''}`;
  for (const b of ['drop', 'later', 'resume', 'close']) $(`ss-${b}`).hidden = !buttons.includes(b);
  // Exporter : une session suspendue existe et rien n'est en cours.
  $('ss-export').hidden = !suspended || !!ssBusy || progress;
  if (!ssDialog.open) ssDialog.showModal();
}

function ssProgress(key, done, total) {
  const p = $('ss-progress');
  p.max = total || 1;
  p.value = Math.min(done, p.max);
  $('ss-text').textContent = t(key, { pct: Math.min(100, Math.round((100 * done) / (total || 1))) });
}

/** La session suspendue est abandonnée avant une action qui la rendrait fausse (IPL,
 *  volumes changés) : après confirmation. Faux si l'usager refuse. */
async function sessionGuard() {
  if (!suspended) return true;
  if (!confirm(t('ss.guard', { date: ssDate(suspended) }))) return false;
  await dropSession();
  suspended = null;
  updateButtons();
  return true;
}

/** Mise en veille; `auto` : la page passe en arrière-plan (reprise automatique). */
function suspendMachine(auto = false) {
  if (!running || shuttingDown || ssBusy || !worker) return;
  ssBusy = 'suspend';
  ssAuto = auto;
  ssShow({ title: 'ss.title.suspend', text: t('ss.stopping'), progress: true });
  // Ce que la page montrait : console, imprimantes, terminaux affichés.
  const prints = Object.fromEntries(Object.entries(printers).map(([a, s]) => [a, s.slice(-500_000)]));
  const state = { console: consoleText.slice(-300_000), printers: prints, zLinux, terminals, auto };
  worker.postMessage({ type: 'suspend', app: VERSION, state });
  updateButtons();
}

async function resumeSession() {
  const meta = suspended;
  if (!meta || running || !worker || ssBusy) return;
  const force = ssForce;
  ssForce = false;
  if (workerBroken) {
    worker.terminate();
    startWorker();
    workerBroken = false;
  }
  // Volumes lus sur place : retrouvés dans le dossier de Hercules gardé (pendant ce clic).
  const want = meta.cfg.mounts ?? [];
  if (want.length && mountsMissing().length) await remountFromDir();
  const cfgMounts = [];
  for (const m of want) {
    const have = mounts.get(m.addr);
    if (!have || have.stem !== m.stem) {
      ssShow({ title: 'ss.title', text: ssDescribe(meta), result: t('ss.err.mount', { addr: hex3(m.addr), file: m.file }), ok: false, buttons: ['drop', 'later'] });
      return;
    }
    cfgMounts.push({ ...m, file: have.file, shadows: have.shadows });
  }
  ssBusy = 'resume';
  ssShow({ title: 'ss.title.resume', text: t('ss.checking'), progress: true });
  // La page comme à la mise en veille : machine, terminaux, console, imprimantes.
  runArch = meta.cfg.arch;
  if (prefs.arch !== runArch) {
    prefs.arch = runArch;
    savePrefs();
    showMachine();
  }
  terminals = meta.page?.terminals ?? meta.cfg.terminals ?? [];
  buildTabs();
  consoleText = meta.page?.console ?? '';
  consoleOut.textContent = consoleText;
  // Questions de la console gardée (les écrans reviennent avec la machine).
  questions.clear();
  questions.console(consoleText);
  for (const k of Object.keys(printers)) delete printers[k];
  Object.assign(printers, meta.page?.printers ?? {});
  showPrinter();
  running = true;
  zLinux = !!meta.page?.zLinux;
  consoleHint();
  volMachineChanged();
  punchMachineChanged();
  setLight('lt-load', true);
  updateButtons();
  renderVolumes();
  showStatus('ss.resuming');
  renderZboot();
  worker.postMessage({ type: 'resume', cfg: { ...meta.cfg, mounts: cfgMounts, force }, meta, lang: getLanguage(), clock: !!prefs.resumeClock });
  worker.postMessage({ type: 'turbo', on: prefs.turbo });
}

/** Messages du fil de la machine pour la mise en veille et la reprise (vrai : traité). */
function ssMessage(data) {
  switch (data.type) {
    case 'suspending':
      if (data.phase === 'mem') ssProgress('ss.saving', data.done, data.total);
      return true;
    case 'suspend-failed':
      ssBusy = '';
      ssAuto = false;
      ssShow({ title: 'ss.title.suspend', result: t('ss.suspend.failed', { msg: ssError(data.msg) }), ok: false, buttons: ['close'] });
      updateButtons();
      return true;
    case 'resuming':
      ssProgress('ss.loading', data.done, data.total);
      return true;
    case 'resume-changed':
      // Volumes changés depuis la mise en veille : la reprise est déconseillée.
      ssBusy = '';
      running = false;
      setLight('lt-load', false);
      updateButtons();
      ssForce = true;
      ssShow({ title: 'ss.title', text: ssDescribe(suspended), result: t('ss.changed', { list: data.list.join(', ') }), ok: false, buttons: ['drop', 'later', 'resume'] });
      return true;
  }
  return false;
}

suspendButton.addEventListener('click', () => (running ? suspendMachine() : suspended && ssShow({ title: 'ss.title', text: ssDescribe(suspended), buttons: ['drop', 'later', 'resume'] })));
$('ss-resume').addEventListener('click', () => resumeSession());
$('ss-later').addEventListener('click', () => {
  ssForce = false;
  ssDialog.close();
});
$('ss-close').addEventListener('click', () => ssDialog.close());

// Fichier de session (.ibmz) : exporter la session suspendue, importer celle d'un fichier.
$('ss-export').addEventListener('click', async () => {
  if (!suspended) return;
  try {
    const blob = await sessionFile(suspended);
    const d = new Date(suspended.date);
    const p2 = (n) => String(n).padStart(2, '0');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `session-${suspended.cfg.arch === 'z' ? 'z' : 's370'}-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.ibmz`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 120_000);
    logEvent('ss.exported', { name: a.download, mb: Math.round(blob.size / 1048576) });
    showStatus('ss.exported', { name: a.download, mb: Math.round(blob.size / 1048576) });
  } catch (e) {
    showStatus('error', { msg: e.message });
  }
});
$('ss-import').addEventListener('click', () => {
  if (running || ssBusy) return showStatus('ss.import.running');
  $('ss-import-file').click();
});
$('ss-import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || running || ssBusy) return;
  let info;
  try {
    info = await sessionFileHead(file);
  } catch {
    return showStatus('ss.import.bad', { name: file.name });
  }
  const vols = info.head.files.filter((f) => f.dir === 'dasd').map((f) => f.name);
  const have = (await listVolumes()).map((v) => v.file).filter((n) => vols.includes(n));
  const when = new Date(info.head.date).toLocaleString(getLanguage());
  if (!confirm(t('ss.import.confirm', { date: when, list: have.length ? have.join(', ') : '—', current: suspended ? ssDate(suspended) : '—' }))) return;
  ssBusy = 'import';
  updateButtons();
  ssShow({ title: 'ss.title.import', text: t('ss.importing', { pct: 0 }), progress: true });
  const total = info.head.files.reduce((s, f) => s + f.size, 0);
  let done = 0;
  try {
    const meta = await importSessionFile(file, info, (dir, name, stream, onBytes) => writeVolume(name, stream, onBytes, dir), (n) => {
      done += n;
      ssProgress('ss.importing', done, total);
    });
    await keepStorage();
    suspended = meta;
    ssBusy = '';
    logEvent('ss.imported', { name: file.name, date: when });
    ssShow({ title: 'ss.title', text: ssDescribe(meta), result: t('ss.imported'), buttons: ['drop', 'later', 'resume'] });
  } catch (err) {
    ssBusy = '';
    suspended = await readSession();
    ssShow({ title: 'ss.title.import', result: t('ss.import.failed', { msg: err.message }), ok: false, buttons: ['close'] });
  } finally {
    updateButtons();
    renderVolumes();
  }
});
$('ss-drop').addEventListener('click', async () => {
  if (!confirm(t('ss.drop.confirm'))) return;
  await dropSession();
  suspended = null;
  ssForce = false;
  ssDialog.close();
  updateButtons();
  showStatus('ss.dropped');
});
// Pas de fermeture par Échap pendant la mise en veille ou la reprise.
ssDialog.addEventListener('cancel', (e) => {
  if (ssBusy) e.preventDefault();
});

function onWorkerMessage({ data }) {
  if (ssMessage(data)) return;
  switch (data.type) {
    case 'ready':
      updateButtons();
      break;
    case 'started':
      if (data.remote) {
        remoteStarted(data);
        break;
      }
      setLight('lt-load', false);
      setLight('lt-sys', true);
      runEth = !!data.eth;
      ethState = '';
      showEth();
      if (data.resumed) {
        ssBusy = '';
        ssAuto = false;
        suspended = null;
        ssDialog.close();
        showStatus('ss.resumed');
        updateButtons();
        break;
      }
      showStatus(runArch === 'z' ? 'ipl.started.z' : 'ipl.started', { n: data.volumes.length });
      break;
    case 'console':
      if (isZ() && !zLinux && data.text.includes('Linux version')) {
        zLinux = true;
        consoleHint();
      }
      appendConsole(data.text);
      volConsole(data.text);
      questions.console(data.text);
      tapesConsole(data.text);
      break;
    case 'screen':
      // Alarme (WCC) : un bip à l'arrivée de l'écran, pour le terminal affiché seulement;
      // l'indicateur est effacé (l'écran est redessiné au clignotement du curseur).
      if (data.data[4] & 4) {
        data.data[4] &= ~4;
        if (currentTab === `t${data.addr}`) beep();
      }
      screens.set(data.addr, data.data);
      if (data.host) {
        journalLater(data.addr);
        questions.screen(data.addr, screenText(data.data));
      }
      if (currentTab === `t${data.addr}`) drawScreen();
      else markTab(`t${data.addr}`);
      break;
    case 'printer':
      if (data.addr === 0x00F) volPrinter(data.text);
      printers[data.addr] = (printers[data.addr] ?? '') + data.text;
      // Sortie non lue : marquée dans la liste des imprimantes (●).
      if (!(currentTab === 'printer' && prefs.printer === data.addr)) unreadPrinters.add(data.addr);
      if ([0x00E, 0x00F, 0x002].includes(data.addr)) lastJobPrinter = data.addr;
      if (printers[data.addr].length > 2_000_000) printers[data.addr] = printers[data.addr].slice(-1_500_000);
      if (currentTab === 'printer') showPrinter();
      else markTab('printer');
      break;
    case 'stats':
      if (REMOTE) remoteStats(data);
      speed.textContent = t('speed', { mips: data.mips.toFixed(1) });
      speed.dataset.dbg = data.dbg ?? '';
      $('psw').textContent = data.psw;
      setLight('lt-wait', data.wait);
      setLight('lt-sys', !data.wait);
      break;
    case 'shutdown':
      shuttingDown = true;
      showStatus(runArch === 'z' ? 'power.shutting.z' : 'power.shutting');
      sdPhase(data);
      break;
    case 'relay':
      relayState = data;
      if (REMOTE) {
        remoteTermsSet(remoteTerms());
        renderMachine();
      } else showRelay();
      break;
    case 'turbo':
      remoteTurbo = !!data.on;
      showTurbo();
      break;
    case 'who':
      remoteAccess = data.access;
      updateButtons();
      break;
    case 'remote':
      remoteInfo(data);
      break;
    case 'remote-lost':
      // Serveur parti (machine arrêtée, réseau) : la page attend son retour.
      if (running) {
        running = false;
        shuttingDown = false;
        setLight('lt-sys', false);
        setLight('lt-wait', false);
        speed.textContent = '';
        showStatus('remote.lost');
        updateButtons();
      }
      break;
    case 'eth':
      ethState = data.status ?? '';
      showEth();
      break;
    case 'vol':
      volSettle(data);
      break;
    case 'leds':
      flashIo(data.mask);
      break;
    case 'cards':
      $('cards-status').textContent = t('cards.sent', { n: data.left });
      break;
    case 'beep':
      beep();
      break;
    case 'console-refused':
      showStatus('console.refused');
      break;
    case 'error':
      lastError = data.msg;
      // Échec de l'IPL (« ipl|adresse ») : expliqué dans l'onglet Moniteur.
      if (/^locked\|/.test(data.msg)) {
        lastError = t('vol.locked', { file: data.msg.slice(7) });
        showStatus('error', { msg: lastError });
        logEvent('error', { msg: lastError });
      } else if (/^nomem\|/.test(data.msg)) {
        // Le fureteur refuse la mémoire centrale demandée (z/Architecture).
        lastError = t('err.nomem', { mb: data.msg.slice(6) });
        showStatus('error', { msg: lastError });
        logEvent('error', { msg: lastError });
      } else if (/^ipl\|/.test(data.msg)) {
        lastError = t('ipl.failed', { addr: data.msg.slice(4) });
        showStatus('error', { msg: lastError });
        selectTab('events');
      } else {
        showStatus('error', { msg: data.msg });
        logEvent('error', { msg: data.msg });
      }
      break;
    case 'monitor':
      logEvent(data.key, data.vals);
      break;
    case 'fatal':
      workerBroken = true;
      break;
    case 'tapes':
      tapesState(data.list);
      break;
    case 'stopped': {
      const wasResume = ssBusy === 'resume';
      tapesStopped();
      runEth = false;
      ethState = '';
      // Machine arrêtée : plus de question en attente (reprise : relevées de nouveau).
      questions.clear();
      if (data.reason === 'suspended') {
        suspended = data.meta;
        ssBusy = '';
        ssShow({ title: 'ss.title.suspend', text: ssDescribe(suspended), result: t('ss.suspended'), buttons: ['close'] });
        // Mise en veille automatique : la page est déjà revenue au premier plan.
        if (ssAuto && document.visibilityState === 'visible') setTimeout(() => resumeSession(), 0);
      } else if (wasResume) {
        // Reprise refusée ou en échec : la session reste (nouvel essai, ou abandon).
        ssBusy = '';
        ssShow({ title: 'ss.title', text: ssDescribe(suspended), result: t('ss.resume.failed', { msg: ssError(lastError) }), ok: false, buttons: ['drop', 'later', 'resume'] });
      }
      running = false;
      if (shuttingDown && data.reason === 'stopped') data.reason = 'shutdown';
      shuttingDown = false;
      setLight('lt-sys', false);
      setLight('lt-wait', false);
      setLight('lt-load', false);
      for (const [, id] of IO_LIGHTS) setLight(id, false);
      speed.textContent = '';
      if (data.reason === 'error' && lastError) showStatus('error', { msg: lastError });
      else if (data.reason === 'shutdown' && runArch === 'z') showStatus('stop.shutdown.z');
      else showStatus(data.reason === 'user' ? 'power.stopped' : `stop.${data.reason}`);
      updateButtons();
      consoleHint();
      renderVolumes();
      volMachineChanged();
      punchMachineChanged();
      sdStopped(data.reason);
      renderZboot();
      break;
    }
    case 'closed':
      break;
  }
}

// ------------------------------------------------------------------ relais TN3270

const relayOn = $('relay-on');
const relayUrlInput = $('relay-url');
relayOn.checked = prefs.relay;
relayUrlInput.value = prefs.relayUrl;

/** La machine a une carte Ethernet (configuration, ou choix du menu Réseau local). */
const ethDevice = () => machineDevices().some((d) => d.kind === 'lcs' || d.kind === 'osa');

/** Relais voulu : terminaux TN3270, ou réseau de la carte Ethernet. */
function relayWanted() {
  return prefs.relay || (running ? runEth : ethDevice());
}

function relayConfig() {
  worker?.postMessage({ type: 'relay', url: running && relayWanted() ? prefs.relayUrl : null, terms: prefs.relay });
}

relayOn.addEventListener('change', () => {
  prefs.relay = relayOn.checked;
  savePrefs();
  if (running) relayConfig();
  showRelay();
});

const ethSel = $('eth-card');
ethSel.value = ethCard() || '';
ethSel.addEventListener('change', () => {
  prefs.eth = ethSel.value || false;
  savePrefs();
  showRelay();
});
relayUrlInput.addEventListener('change', () => {
  const v = relayUrlInput.value.trim();
  prefs.relayUrl = /^wss?:\/\//.test(v) ? v : 'ws://127.0.0.1:8370';
  relayUrlInput.value = prefs.relayUrl;
  savePrefs();
  if (running) relayConfig();
});

/** Terminaux tenus par un client TN3270. */
function remoteTerms() {
  return new Set((relayState.clients ?? []).map((c) => c.addr));
}

function showRelay() {
  const box = $('relay-status');
  let key;
  if (!prefs.relay) key = 'net.off';
  else if (!running) key = 'net.later';
  else key = { connecting: 'net.connecting', open: 'net.open', closed: 'net.closed', off: 'net.later' }[relayState.state] ?? 'net.later';
  box.textContent = t(key, { url: prefs.relayUrl, n: relayState.clients?.length ?? 0 });
  box.classList.toggle('error', key === 'net.closed');
  box.hidden = !prefs.relay && relayWanted();
  showEth();
  const list = $('relay-clients');
  list.replaceChildren(...(relayState.clients ?? []).map((c) => {
    const li = document.createElement('li');
    li.className = 'mono';
    li.textContent = `${c.console ? t('net.console') : hex3(c.addr)}  ${c.ttype}`;
    return li;
  }));
  showTermStatus();
}
languageListeners.push(showRelay);

/** État de la carte Ethernet : branchée au prochain IPL, attendue du système, démarrée. */
function showEth() {
  const box = $('eth-status');
  let key = 'net.eth.off';
  let vals = {};
  if (running && runEth) {
    // « adresse|démarrée|émises|reçues|perdues » (Emulator.lcs_status).
    const [mac, up, tx, rx] = ethState.split('|');
    if (relayState.state !== 'open') key = 'net.eth.norelay';
    else key = up === '1' ? 'net.eth.up' : 'net.eth.wait';
    vals = { mac: mac ?? '', tx: tx ?? 0, rx: rx ?? 0 };
  } else if (ethCard() || ethDevice()) {
    key = isZ() ? (running ? 'net.eth.next' : 'net.eth.later') : 'net.eth.s370';
    const d = machineDevices().filter((x) => x.kind === 'lcs' || x.kind === 'osa');
    vals = { card: d[0]?.kind === 'osa' ? 'OSA' : 'LCS', addrs: d.length ? `${hex4(d[0].addr)}-${hex4(d.at(-1).addr)}` : '' };
  }
  box.textContent = t(key, vals);
}
// ------------------------------------------------------------------ pupitre

const dials = [...document.querySelectorAll('.dial')];

function showDials() {
  const d = iplPref().padStart(3, '0');
  dials.forEach((b, i) => {
    b.querySelector('span').textContent = d[i];
    b.style.setProperty('--angle', `${parseInt(d[i], 16) * 22.5}deg`);
  });
  iplInput.value = iplPref();
  consoleHint();
}

for (const b of dials) {
  const step = (k) => {
    const i = Number(b.dataset.digit);
    const d = iplPref().padStart(3, '0').split('');
    d[i] = ((parseInt(d[i], 16) + k + 16) % 16).toString(16).toUpperCase();
    setIplPref(d.join(''));
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

// Voyants d'activité : allumés 150 ms après chaque accès (prolongés s'il continue).
const IO_LIGHTS = [[1, 'lt-dasd'], [2, 'lt-prt'], [4, 'lt-rdr'], [8, 'lt-pun']];
const ioTimers = {};
function flashIo(mask) {
  for (const [bit, id] of IO_LIGHTS) {
    if (!(mask & bit)) continue;
    setLight(id, true);
    clearTimeout(ioTimers[id]);
    ioTimers[id] = setTimeout(() => setLight(id, false), 150);
  }
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
  eventsOut.hidden = name !== 'events';
  if (name === 'events') eventsOut.scrollTop = eventsOut.scrollHeight;
  journalOut.hidden = name !== 'journal';
  $('remote-machine').hidden = name !== 'machine';
  if (name === 'machine') renderMachine();
  $('journal-clear').hidden = name !== 'journal';
  if (name === 'journal') journalOut.scrollTop = journalOut.scrollHeight;
  $('key-bar').hidden = !(name.startsWith('t') && showKeys());
  $('full-button').hidden = !name.startsWith('t');
  // Liste des imprimantes : seulement sous l'onglet Imprimante.
  const ps = $('printer-select');
  if (ps) ps.hidden = name !== 'printer';
  const pj = $('printer-job');
  if (pj && name !== 'printer') pj.hidden = true;
  $('printer-fit').hidden = name !== 'printer';
  for (const id of ['printer-txt', 'printer-pdf', 'printer-clear']) $(id).hidden = name !== 'printer';
  $('term-fit').hidden = !name.startsWith('t');
  finder?.tab();
  if (!name.startsWith('t')) $('monitor').classList.remove('term-scroll');
  if (!name.startsWith('t') && isFull()) setFull(false);
  if (name.startsWith('t')) {
    drawScreen();
    canvas.focus();
  } else if (name === 'console') {
    consoleInput.focus();
  } else {
    // La dernière sortie d'un travail, si elle n'est pas lue, est montrée d'emblée.
    if (lastJobPrinter !== null && unreadPrinters.has(lastJobPrinter) && prefs.printer !== lastJobPrinter) {
      prefs.printer = lastJobPrinter;
      savePrefs();
    }
    showPrinter();
  }
  showTermStatus();
}
for (const b of tabsBox.querySelectorAll('.term-tab')) b.onclick = () => selectTab(b.dataset.tab);

// --- moniteur : événements de l'émulateur (démarrage, volumes, IPL, arrêts, erreurs),
// gardés en clés et valeurs pour suivre la langue.

const eventsOut = $('events-out');

// --- onglet Journal : les écrans écrits par le système sur les terminaux, à la suite (texte
// ordinaire : il se sélectionne et se copie). Un écran y va quand il est stable (le système
// l'écrit souvent en plusieurs fois); un écran identique au précédent n'est pas répété.
const journalOut = $('journal-out');
const JOURNAL_MAX = 3_000_000; // caractères gardés (les plus anciens partent)
const journalTimers = new Map();
const journalLast = new Map();
let journalSize = 0;

function journalLater(addr) {
  clearTimeout(journalTimers.get(addr));
  journalTimers.set(addr, setTimeout(() => journalAdd(addr), 500));
}

function screenText(d) {
  const lines = [];
  for (let r = 0; r < d[0]; r++) {
    let line = '';
    for (let c = 0; c < d[1]; c++) {
      const p = r * d[1] + c;
      line += d[6 + 2 * p] & 0x40 ? ' ' : String.fromCharCode(d[5 + 2 * p] || 32);
    }
    lines.push(line.trimEnd());
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join('\n');
}

function journalAdd(addr) {
  journalTimers.delete(addr);
  const d = screens.get(addr);
  if (!d) return;
  const text = screenText(d);
  if (!text || text === journalLast.get(addr)) return;
  journalLast.set(addr, text);
  journalAppend(`── ${t('tab.terminal')} ${hex3(addr)} · ${new Date().toLocaleTimeString()} ──\n${text}\n\n`);
}

function journalAppend(s) {
  // Défilement : suit la fin seulement si on y était (une sélection en cours reste).
  const atEnd = journalOut.scrollHeight - journalOut.scrollTop - journalOut.clientHeight < 40;
  journalOut.append(document.createTextNode(s));
  journalSize += s.length;
  while (journalSize > JOURNAL_MAX && journalOut.firstChild) {
    journalSize -= journalOut.firstChild.textContent.length;
    journalOut.firstChild.remove();
  }
  if (atEnd && !journalOut.hidden) journalOut.scrollTop = journalOut.scrollHeight;
  if (currentTab !== 'journal') markTab('journal');
  else finder?.changed();
}

$('journal-clear').addEventListener('click', () => {
  journalOut.replaceChildren();
  journalSize = 0;
  journalLast.clear();
});
const events = [];   // [{time, key, vals}]
const EV_ERROR = new Set(['error', 'vol.err', 'diskerr', 'r.ipl.fail', 'r.ipl.nodev', 'r.wait', 'r.loop', 'page']);
// Avertissement : souvent un sondage du système, qui se passe ensuite de l'instruction.
const EV_WARN = new Set(['r.badop']);
const EV_OK = new Set(['r.ipl.ok', 'vol', 'mount', 'boot']);

/** Noms des bits d'un octet d'état (liste de i18n séparée par des virgules). */
function bitNames(listKey, hex) {
  const names = t(listKey).split(',');
  const v = parseInt(hex, 16) || 0;
  const on = names.filter((_, i) => v & (0x80 >> i));
  return on.length ? on.join(', ') : '—';
}

function eventText({ key, vals }) {
  const v = vals ?? {};
  switch (key) {
    case 'start':
      return t('mon.start', { ...v, arch: t(v.arch === 'z' ? 'arch.z' : 'arch.s370'), lp: (v.ncpu > 1 ? t('mon.cpus', { n: v.ncpu }) : '') + (v.loadparm ? t('mon.lp', { v: v.loadparm }) : '') });
    case 'boot':
      return t('mon.boot', { ...v, k: fmtSize(v.k), i: fmtSize(v.i) });
    case 'stop':
      return v.reason === 'user' ? t('mon.stop.user') : t('mon.stop', { reason: t(`stop.${v.reason}`) });
    case 'r.ipl.fail':
      return t('mon.r.ipl.fail', { ...v, ub: bitNames('mon.ubits', v.b), cb: bitNames('mon.cbits', v.c) });
    case 'page':
      return t(v.key, v);
    default:
      return t(`mon.${key}`, v);
  }
}

function renderEvent(e) {
  const line = document.createElement('div');
  if (EV_ERROR.has(e.key)) line.className = 'ev-error';
  else if (EV_WARN.has(e.key)) line.className = 'ev-warn';
  else if (EV_OK.has(e.key)) line.className = 'ev-ok';
  const time = document.createElement('span');
  time.className = 'ev-time';
  time.textContent = `${e.time.toLocaleTimeString(langList.value === 'en' ? 'en-GB' : langList.value)}  `;
  line.append(time, eventText(e));
  return line;
}

function logEvent(key, vals = {}) {
  const e = { time: new Date(), key, vals };
  events.push(e);
  if (events.length > 2000) {
    events.splice(0, 500);
    renderEvents();
    return;
  }
  const atEnd = eventsOut.scrollTop + eventsOut.clientHeight >= eventsOut.scrollHeight - 30;
  if (eventsOut.firstChild?.classList?.contains('ev-empty')) eventsOut.replaceChildren();
  eventsOut.append(renderEvent(e));
  if (atEnd) eventsOut.scrollTop = eventsOut.scrollHeight;
  if (currentTab !== 'events') markTab('events');
}

function renderEvents() {
  if (!events.length) {
    const p = document.createElement('div');
    p.className = 'ev-empty ev-time';
    p.textContent = t('mon.empty');
    eventsOut.replaceChildren(p);
    return;
  }
  eventsOut.replaceChildren(...events.map(renderEvent));
}
languageListeners.push(renderEvents);
renderEvents();

// --- console 3215

function appendConsole(text) {
  consoleText += text;
  if (consoleText.length > 400_000) consoleText = consoleText.slice(-300_000);
  const atEnd = consoleOut.scrollTop + consoleOut.clientHeight >= consoleOut.scrollHeight - 30;
  consoleOut.textContent = consoleText;
  if (atEnd) consoleOut.scrollTop = consoleOut.scrollHeight;
  if (currentTab !== 'console') markTab('console');
  else finder?.changed();
}

// Recherche dans la console et le journal (find.js); Ctrl+F sous ces onglets.
finder = initFind(
  { box: $('find-box'), input: $('find-input'), count: $('find-count'), prev: $('find-prev'), next: $('find-next'), filter: $('find-filter'), copy: $('find-copy') },
  () => (currentTab === 'console' ? consoleOut : currentTab === 'journal' ? journalOut : null),
  (text) => copyText(text),
);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f' && finder.focus()) e.preventDefault();
});

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

// Travail choisi dans la sortie de chaque imprimante (clé de jobs.js; absent : toute la
// sortie).
const printerJobs = new Map();

/** Liste des travaux de l'imprimante courante (sous l'onglet Imprimante). */
function printerJobSelect() {
  let sel = $('printer-job');
  if (!sel) {
    sel = document.createElement('select');
    sel.id = 'printer-job';
    sel.className = 'small-select';
    sel.title = t('prt.job.tip');
    sel.addEventListener('change', () => {
      if (sel.value) printerJobs.set(prefs.printer, sel.value);
      else printerJobs.delete(prefs.printer);
      printerOut.scrollTop = 0;
      showPrinter();
    });
    $('printer-fit').before(sel);
  }
  return sel;
}

/** Ce que montre l'onglet Imprimante : toute la sortie, ou le travail choisi. Rend
 *  {text, job}. */
function printerShown() {
  const text = printers[prefs.printer] ?? '';
  const key = printerJobs.get(prefs.printer);
  const job = key ? splitJobs(text).find((j) => j.key === key) : null;
  return job ? { text: text.slice(job.start, job.end), job } : { text, job: null };
}

function printerSelect() {
  let sel = $('printer-select');
  if (!sel) {
    sel = document.createElement('select');
    sel.id = 'printer-select';
    sel.className = 'small-select';
    sel.addEventListener('change', () => { prefs.printer = Number(sel.value); savePrefs(); showPrinter(); });
    $('printer-fit').before(sel);
  }
  return sel;
}

// Feuille de 66 lignes (hauteur de .printer-out .page) : marges de 3 lignes en haut et de 2
// en bas (padding de .page), 61 lignes imprimées (LINECT de JES2 par défaut).
const PAGE_LINES = 61;
const unreadPrinters = new Set();
let lastJobPrinter = null; // imprimante de travaux (00E, 00F, 002) qui a reçu la dernière sortie

function showPrinter() {
  const sel = printerSelect();
  if (currentTab === 'printer') unreadPrinters.delete(prefs.printer);
  // Imprimantes et perforatrices de la configuration (rôles connus pour celles de TK5;
  // en z/Architecture, le type seulement : les rôles dépendent du système).
  const known = isZ() ? {} : { 0x00E: 'prt.a', 0x00F: 'prt.b', 0x002: 'prt.x', 0x30E: 'prt.log' };
  const units = machineDevices().filter((d) => d.kind === 'printer' || d.kind === 'punch')
    .map((d) => [d.addr, d.kind === 'punch' ? 'prt.punch' : known[d.addr] ?? null, d.type]);
  if (!units.some(([a]) => a === prefs.printer) && units.length) prefs.printer = units[0][0];
  sel.replaceChildren(...units.map(([a, k, type]) => new Option(`${unreadPrinters.has(a) ? '● ' : ''}${hex3(a)} ${k ? t(k) : `${t('prt.printer')} ${type}`}`, String(a))));
  sel.value = String(prefs.printer);
  sel.hidden = currentTab !== 'printer';
  // Imprimante 2 (00F, travaux du gestionnaire de volumes) : police de l'IBM 1403.
  printerOut.classList.toggle('font-1403', prefs.printer === 0x00F);
  // Travaux de cette sortie (pages de séparation de JES2).
  const all = printers[prefs.printer] ?? '';
  const jobs = splitJobs(all);
  const jsel = printerJobSelect();
  const want = printerJobs.get(prefs.printer) ?? '';
  const opts = [new Option(t('prt.job.all', { n: jobs.length }), '')];
  for (const j of jobs) {
    const label = `${j.kind} ${j.num} ${j.name} · ${t('prt.job.pages', { n: pageCount(all.slice(j.start, j.end)) })}${j.open ? ' …' : ''}`;
    opts.push(new Option(label, j.key));
  }
  if (jsel.options.length !== opts.length || [...jsel.options].some((o, i) => o.text !== opts[i].text)) jsel.replaceChildren(...opts);
  jsel.value = jobs.some((j) => j.key === want) ? want : '';
  jsel.hidden = currentTab !== 'printer' || !jobs.length;
  const text = printerShown().text;
  const atEnd = printerOut.scrollTop + printerOut.clientHeight >= printerOut.scrollHeight - 30;
  // Feuilles de 66 lignes (11 pouces à 6 lignes au pouce), dont 61 imprimées : un saut de
  // page passe à la feuille suivante (le reste de la feuille reste blanc), une page plus longue continue
  // sur la suivante. Le saut en tête de sortie ne laisse pas de feuille vide; seules les
  // feuilles changées sont refaites.
  const pages = printerPages(text).map((lines) => lines.join('\n'));
  if (!pages.length) pages.push(text ? '' : t('prt.empty'));
  const sheets = printerOut.children;
  pages.forEach((p, i) => {
    let sheet = sheets[i];
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.className = 'page';
      printerOut.append(sheet);
    }
    if (sheet.textContent !== p) sheet.textContent = p;
  });
  while (sheets.length > pages.length) sheets[sheets.length - 1].remove();
  fitPrinter();
  if (atEnd) printerOut.scrollTop = printerOut.scrollHeight;
}
languageListeners.push(showPrinter);

/** Feuilles de la sortie d'une imprimante (lignes de chacune), comme à l'écran. */
function printerPages(text) {
  const pages = [];
  for (const page of text.split('\f')) {
    if (page === '') continue;
    const lines = page.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    for (let i = 0; i < lines.length; i += PAGE_LINES) pages.push(lines.slice(i, i + PAGE_LINES));
  }
  return pages;
}

/**
 * Sortie de l'imprimante en texte, sans les lignes vides inutiles : sauts de page et
 * lignes vides en haut et en bas des feuilles retirés, une seule ligne vide entre deux
 * blocs (plusieurs retours de chariot de suite, saut à la page suivante).
 */
function printerText(text) {
  const out = [];
  for (const page of printerPages(text)) {
    for (const raw of page) {
      const line = raw.trimEnd();
      if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
      out.push(line);
    }
    if (out.length && out[out.length - 1] !== '') out.push('');
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.length ? `${out.join('\n')}\n` : '';
}

/** Chaîne PDF : parenthèses et barres obliques inverses protégées, Latin-1 seulement. */
function pdfString(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (c < 32 || c > 255) out += c < 32 ? ' ' : '?';
    else out += ch;
  }
  return out;
}

/**
 * Papier en continu du PDF (comme à l'écran : images/paper-*.png) : bandes bleues et grises de
 * trois lignes, bandes d'entraînement à gauche et à droite avec deux trous par tuile de six
 * lignes et une ligne de perforation, cadre fin de la zone imprimée. Mesures d'un listage :
 * 6 lignes au pouce (12 pt), 66 lignes par feuille de 11 po, 14⅞ po de large.
 */
const PDF_PAPER = (() => {
  const W = 1071;
  const H = 792;
  const LH = 12;
  const TILE = 6 * LH;                 // deux bandes : une tuile de l'image (147 px)
  const STRIP = (TILE * 104) / 147;    // bande d'entraînement (104 px de l'image)
  const px = (v) => (v * TILE) / 147;  // pixels de l'image -> points
  const rgb = (r, g, b) => `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)}`;
  const f = (v) => v.toFixed(2);
  // Cercle plein (quatre arcs de Bézier).
  const circle = (cx, cy, r) => {
    const k = r * 0.5523;
    return `${f(cx + r)} ${f(cy)} m ${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c `
      + `${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} c `
      + `${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c `
      + `${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} c f`;
  };
  const ops = [`${rgb(224, 224, 224)} rg 0 0 ${W} ${H} re f`];
  // Bandes bleues (la première moitié de chaque tuile), entre les bandes d'entraînement.
  ops.push(`${rgb(202, 220, 236)} rg`);
  for (let top = H; top > 0; top -= TILE) ops.push(`${f(STRIP)} ${f(top - TILE / 2)} ${f(W - 2 * STRIP)} ${f(TILE / 2)} re f`);
  // Trous d'entraînement (centres à 34,5 et 68,5 px du bord de chaque bande; 36 et 109,5 px
  // du haut de la tuile; rayon 11,75 px).
  ops.push(`${rgb(8, 8, 8)} rg`);
  for (let top = H; top > 0; top -= TILE) {
    for (const dy of [36, 109.5]) {
      ops.push(circle(px(34.5), top - px(dy), px(11.75)));
      ops.push(circle(W - STRIP + px(68.5), top - px(dy), px(11.75)));
    }
  }
  // Lignes de perforation des bandes d'entraînement (72 et 32 px), bord de la feuille.
  ops.push(`${rgb(196, 198, 198)} RG 0.6 w [1.5 1.5] 0 d`);
  ops.push(`${f(px(72))} 0 m ${f(px(72))} ${H} l S ${f(W - STRIP + px(32))} 0 m ${f(W - STRIP + px(32))} ${H} l S`);
  ops.push(`[] 0 d ${rgb(200, 202, 202)} RG 0.5 w 0.25 0.25 ${W - 0.5} ${H - 0.5} re S`);
  // Cadre fin de la zone imprimée (132 colonnes, 61 lignes), un peu en dehors du texte.
  const cw = 7.2;
  ops.push(`${rgb(177, 191, 202)} RG 0.6 w ${f(STRIP + 0.4 * cw)} ${f(1.75 * LH)} ${f(W - 2 * (STRIP + 0.4 * cw))} ${f(H - 4.5 * LH)} re S`);
  return { W, H, LH, STRIP, cw, stream: ops.join('\n') };
})();

/**
 * Sortie de l'imprimante en PDF : une feuille de papier en continu par page (61 lignes,
 * comme à l'écran : 3 lignes de marge en haut, 2 en bas), en Courier (police de base du
 * PDF : rien à inclure) à 10 caractères au pouce, réduite si une ligne dépasse 132 colonnes.
 */
function printerPdf(text) {
  const pages = printerPages(text);
  if (!pages.length) pages.push(['']);
  const { W, H, LH, STRIP, cw } = PDF_PAPER;
  const cols = Math.max(132, ...pages.flat().map((l) => l.trimEnd().length));
  const size = Math.min(12, (W - 2 * STRIP - 2 * cw) / (cols * 0.6));
  // Ligne de base de la première ligne imprimée (quatrième ligne de la feuille).
  const y0 = H - 4 * LH + 0.22 * size;
  // Objets : 1 catalogue, 2 pages, 3 police, 4 papier (repris sur chaque page), puis pour
  // chaque page son objet et son contenu.
  const objs = [];
  const kids = [];
  pages.forEach((lines, i) => {
    const pageId = 5 + 2 * i;
    kids.push(`${pageId} 0 R`);
    const body = ['q /Paper Do Q', `BT /F1 ${size.toFixed(2)} Tf 0.114 g ${LH} TL ${(STRIP + cw).toFixed(2)} ${y0.toFixed(2)} Td`];
    for (const line of lines) body.push(`(${pdfString(line.trimEnd())}) Tj T*`);
    body.push('ET');
    const stream = body.join('\n');
    objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R >> /XObject << /Paper 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objs[pageId + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>';
  objs[4] = `<< /Type /XObject /Subtype /Form /BBox [0 0 ${W} ${H}] /Length ${PDF_PAPER.stream.length} >>\nstream\n${PDF_PAPER.stream}\nendstream`;
  // Le fichier est fait d'octets Latin-1 : les positions de la table xref sont en octets.
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let n = 1; n < objs.length; n++) {
    offsets[n] = pdf.length;
    pdf += `${n} 0 obj\n${objs[n]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objs.length; n++) pdf += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(pdf, (ch) => ch.charCodeAt(0) & 0xff);
}

/** Fichier à enregistrer (lien de téléchargement). */
function saveFile(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

function printerFileName(ext) {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const { job } = printerShown();
  const what = job ? `${job.name.toLowerCase()}-${job.kind.toLowerCase()}${job.num}` : `printer-${hex3(prefs.printer)}`;
  return `${what}-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.${ext}`;
}

// TXT et PDF : ce qui est montré (toute la sortie, ou le travail choisi).
$('printer-txt').addEventListener('click', () => {
  const { text } = printerShown();
  if (!text) return showStatus('prt.nothing');
  saveFile(printerFileName('txt'), printerText(text), 'text/plain;charset=utf-8');
});
$('printer-pdf').addEventListener('click', () => {
  const { text } = printerShown();
  if (!text) return showStatus('prt.nothing');
  saveFile(printerFileName('pdf'), printerPdf(text), 'application/pdf');
});
$('printer-clear').addEventListener('click', () => {
  if (!printers[prefs.printer]) return;
  if (!confirm(t('prt.clear.confirm', { addr: hex3(prefs.printer) }))) return;
  delete printers[prefs.printer];
  unreadPrinters.delete(prefs.printer);
  if (lastJobPrinter === prefs.printer) lastJobPrinter = null;
  showPrinter();
});

// Toute la largeur de la feuille à l'écran : la feuille, ses bandes et ses marges suivent la
// police de l'imprimante, qui est donc réglée pour que la feuille remplisse la largeur.
$('printer-fit').addEventListener('click', () => {
  prefs.printerFit = !prefs.printerFit;
  savePrefs();
  fitPrinter();
});

function fitPrinter() {
  $('printer-fit').setAttribute('aria-pressed', String(prefs.printerFit));
  const sheet = printerOut.firstElementChild;
  if (!prefs.printerFit) {
    printerOut.style.removeProperty('--term-font-size');
    return;
  }
  if (printerOut.hidden || !sheet) return;
  const cs = getComputedStyle(printerOut);
  const room = printerOut.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const size = parseFloat(cs.fontSize);
  const fit = Math.floor((size * room) / sheet.offsetWidth * 100) / 100;
  if (!(fit > 0) || Math.abs(fit - size) < 0.05) return;
  // Même endroit du listage après le changement de taille.
  const at = printerOut.scrollTop / Math.max(1, printerOut.scrollHeight);
  printerOut.style.setProperty('--term-font-size', `${fit}px`);
  printerOut.scrollTop = at * printerOut.scrollHeight;
}
// Largeur de la fenêtre, onglet affiché, police de l'IBM 1403 chargée.
new ResizeObserver(() => fitPrinter()).observe(printerOut);
document.fonts?.addEventListener('loadingdone', () => fitPrinter());

// --- terminal 3270

const COLORS_DARK = ['#c8ffc8', '#6aa6ff', '#ff5252', '#ff80ff', '#40ff40', '#40ffff', '#ffff40', '#ffffff'];
// Écran d'époque : phosphore du 3278 (vert) et couleurs du 3279, un peu plus douces.
const COLORS_VINTAGE = ['#8dffa8', '#5c9cff', '#ff4a3d', '#ff6ad5', '#36e86a', '#3ff0e2', '#ffe84a', '#e8ffe8'];
const FONT_VINTAGE = '"IBM 3270", "DejaVu Sans Mono", Consolas, monospace';
const vintage = () => prefs.look === 'vintage';
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
  // Plein écran : la plus grande police qui tient; sinon la police choisie, réduite au besoin.
  const full = isFull();
  // Sans ajustement (tablettes par défaut) : la police choisie, le cadre défile.
  const fit0 = full || termFit();
  mon.classList.toggle('term-scroll', !fit0);
  const availW = mon.clientWidth - (full ? 16 : 40);
  const availH = full ? mon.clientHeight - 16 : Math.max(200, innerHeight - box.top - 70);
  let size = full ? 200 : prefs.fontSize;
  const old = vintage();
  const font = old ? FONT_VINTAGE : FONT;
  const palette = old ? COLORS_VINTAGE : COLORS_DARK;
  canvas.classList.toggle('vintage', old);
  ctx.font = `${size}px ${font}`;
  let w = ctx.measureText('M').width;
  const fit = Math.min(availW / (cols * w + 16), availH / (rows * size * 1.25 + 16));
  if (fit < 1 && fit0) size = Math.max(8, Math.floor(size * fit));
  ctx.font = `${size}px ${font}`;
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
  ctx.fillStyle = old ? '#020a04' : '#000';
  ctx.fillRect(-8, -8, pw, ph);
  ctx.font = `${size}px ${font}`;
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
      const color = palette[st & 7];
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
  if (old) vintageGlow(ctx, size, dpr);
  // Sélection (copier une partie de l'écran).
  if (sel && sel.addr === a) {
    const b = selBox();
    ctx.fillStyle = 'rgba(110, 160, 255, 0.38)';
    ctx.fillRect(b.c0 * cellW, b.r0 * cellH, (b.c1 - b.c0 + 1) * cellW, (b.r1 - b.r0 + 1) * cellH);
  }
  // Curseur (bloc en mode insertion, trait sinon).
  const cr = Math.floor(cursor / cols);
  const cc = cursor % cols;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  if (flags & 2) ctx.fillRect(cc * cellW, cr * cellH, cellW, cellH);
  else if (blinkOn || !termFocused()) ctx.fillRect(cc * cellW, cr * cellH + cellH - 3, cellW, 3);
  showTermStatus(d);
}

/** Écran d'époque : lueur du phosphore (le texte flouté ajouté par-dessus), lignes de
 *  balayage, bords assombris du tube. Sans `ctx.filter` (fureteurs anciens) : sans lueur. */
function vintageGlow(ctx, size, dpr) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if ('filter' in ctx) {
    ctx.globalCompositeOperation = 'lighter';
    // Halo étroit et léger : le texte net reste dessous, lisible.
    ctx.globalAlpha = 0.35;
    ctx.filter = `blur(${Math.max(0.8, size / 18) * dpr}px)`;
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  const step = Math.max(2, Math.round(3 * dpr));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  for (let y = 0; y < H; y += step) ctx.fillRect(0, y, W, Math.max(1, Math.round(dpr)));
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
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
  const remote = (relayState.clients ?? []).find((c) => c.addr === a);
  if (remote) parts.push(t('term.remote', { ttype: remote.ttype }));
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
  clearSel();
  const a = currentTerm();
  if (a !== null && running && !remoteTerms().has(a)) worker.postMessage({ type: 'key', addr: a, key });
}

function termChars(text) {
  clearSel();
  const a = currentTerm();
  if (a === null || !running || remoteTerms().has(a)) return;
  // Retour à la ligne : touche NewLine; tabulation : Tab.
  for (const part of text.replace(/\r\n?/g, '\n').split(/(\n|\t)/)) {
    if (part === '\n') worker.postMessage({ type: 'key', addr: a, key: 'NewLine' });
    else if (part === '\t') worker.postMessage({ type: 'key', addr: a, key: 'Tab' });
    else if (part) worker.postMessage({ type: 'char', addr: a, text: part });
  }
}

// Écran ajusté à la fenêtre, ou à la police choisie avec défilement (comme l'imprimante).
function termFit() {
  return prefs.termFit ?? !matchMedia('(pointer: coarse)').matches;
}
$('term-fit').setAttribute('aria-pressed', String(termFit()));
$('term-fit').addEventListener('click', () => {
  prefs.termFit = !termFit();
  savePrefs();
  $('term-fit').setAttribute('aria-pressed', String(prefs.termFit));
  drawScreen();
});

// Tablettes : une toile ne fait pas sortir le clavier virtuel; toucher l'écran donne le
// focus à un champ invisible, qui reçoit les touches comme la toile.
const termInput = $('term-input');
let touchInput = false;

function termFocused() {
  return document.activeElement === canvas || document.activeElement === $('term-input');
}

function termFocus() {
  if (touchInput) termInput.focus({ preventScroll: true });
  else canvas.focus();
}

// Toucher : la souris émulée qui suit (mousedown) donnerait le focus à la toile et fermerait
// le clavier; le champ le prend au clic, dernier événement du toucher.
canvas.addEventListener('pointerdown', (e) => {
  touchInput = e.pointerType !== 'mouse';
});
canvas.addEventListener('click', () => {
  if (touchInput) termInput.focus({ preventScroll: true });
});

// Tablettes et téléphones : toucher hors du terminal, à droite de son centre : PF8 (page
// suivante); à gauche : PF7 (page précédente); double toucher à gauche : PF3 (retour). Pas
// sur les boutons, les champs, le pupitre, les onglets ni la barre des touches; un
// glissement (défilement) n'est pas un toucher.
const TAP_SKIP = 'button, input, select, textarea, a, label, dialog, .op-panel, .term-tabs, .key-bar, .toolbar';
const TAP_DOUBLE_MS = 300;
let tapStart = null;
let tapLeft = 0; // attente d'un second toucher à gauche (minuterie)

function tapFlash(key, x, y) {
  const el = document.createElement('div');
  el.className = 'tap-key';
  el.textContent = key;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.append(el);
  setTimeout(() => el.remove(), 600);
}

function tapKey(key, x, y) {
  termKey(key);
  tapFlash(key, x, y);
}

const contentArea = document.querySelector('main.content');
// Toucher qui sert à une touche : le geste du fureteur est annulé (pas de zoom au double
// toucher sous iPadOS, où touch-action ne suffit pas).
contentArea.addEventListener('touchend', (e) => {
  if (currentTerm() === null || canvas.hidden || !running || e.touches.length) return;
  if (e.target === canvas || e.target.closest(TAP_SKIP)) return;
  e.preventDefault();
}, { passive: false });
contentArea.addEventListener('pointerdown', (e) => {
  tapStart = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
});
contentArea.addEventListener('pointerup', (e) => {
  const s = tapStart;
  tapStart = null;
  if (!s || e.pointerType !== 'touch' || currentTerm() === null || canvas.hidden || !running) return;
  if (e.target === canvas || e.target.closest(TAP_SKIP)) return;
  if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12 || performance.now() - s.t > 600) return;
  const r = canvas.getBoundingClientRect();
  const { clientX: x, clientY: y } = e;
  if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return;
  if (x >= r.left + r.width / 2) {
    tapKey('PF8', x, y);
  } else if (tapLeft) {
    clearTimeout(tapLeft);
    tapLeft = 0;
    tapKey('PF3', x, y);
  } else {
    tapLeft = setTimeout(() => {
      tapLeft = 0;
      tapKey('PF7', x, y);
    }, TAP_DOUBLE_MS);
  }
});

function termKeydown(e) {
  if (e.isComposing) return;
  const k = e.key;
  let key = null;
  // AltGr (Ctrl+Alt sous Windows) donne des caractères : @, [, ], {, }, #…
  const altGr = e.getModifierState?.('AltGraph') ?? false;
  const ctrl = e.ctrlKey && !altGr;
  const alt = e.altKey && !altGr;
  // PA1-PA3 d'après la position de la touche (e.code) : sur AZERTY, Ctrl+1 donne « & »; au
  // pavé numérique sans Verr Num, « End ».
  const pa = /^(?:Digit|Numpad)([1-3])$/.exec(e.code);
  if ((ctrl || alt) && !e.metaKey && pa) key = `PA${pa[1]}`;
  else if (k === 'Enter') key = e.shiftKey ? 'NewLine' : 'Enter';
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
  else if (ctrl && (k === 'r' || k === 'R' || e.code === 'KeyR')) key = 'Reset';
  else if ((ctrl || e.metaKey) && (k === 'c' || k === 'C') && sel) {
    // Copier la sélection.
    e.preventDefault();
    copyText(selText());
    return;
  } else if ((ctrl || e.metaKey) && (k === 'v' || k === 'c')) return; // coller, copier
  if (key) {
    e.preventDefault();
    termKey(key);
    return;
  }
  if (k.length === 1 && !ctrl && !e.metaKey && !alt) {
    e.preventDefault();
    termChars(k);
  }
}
canvas.addEventListener('keydown', termKeydown);
termInput.addEventListener('keydown', termKeydown);

function termPaste(e) {
  e.preventDefault();
  termChars(e.clipboardData.getData('text'));
}
canvas.addEventListener('paste', termPaste);
termInput.addEventListener('paste', termPaste);

// Claviers virtuels qui ne donnent pas la touche au keydown (Android : « Unidentified »,
// correction automatique, dictée) : le texte arrive par beforeinput. Le champ garde une
// espace, pour que l'effacement arrière soit signalé même s'il n'y a rien à effacer.
const TERM_INPUT_FILL = ' ';
function termInputReset() {
  termInput.value = TERM_INPUT_FILL;
  termInput.setSelectionRange(1, 1);
}
termInput.addEventListener('focus', termInputReset);
termInput.addEventListener('beforeinput', (e) => {
  if (e.isComposing || e.inputType === 'insertCompositionText') return;
  e.preventDefault();
  if (e.inputType === 'insertText' || e.inputType === 'insertReplacementText') {
    if (e.data) termChars(e.data);
  } else if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
    termKey('Enter');
  } else if (e.inputType === 'deleteContentBackward') {
    termKey('Backspace');
  } else if (e.inputType === 'deleteContentForward') {
    termKey('Delete');
  }
});
// Saisie composée (accents, chinois) : le texte final, puis le champ est remis à zéro.
termInput.addEventListener('compositionend', (e) => {
  if (e.data) termChars(e.data);
  termInputReset();
});
termInput.addEventListener('input', () => {
  if (termInput.value !== TERM_INPUT_FILL) termInputReset();
});

// Souris : un clic place le curseur; glisser sélectionne un rectangle de l'écran (copié par
// Ctrl+C ou le bouton Copier); un double-clic, un mot.
let sel = null;  // {addr, r0, c0, r1, c1} : cellule de départ et cellule courante
let drag = null; // {addr, row, col, inside, moved}

/** Cellule sous le pointeur (ramenée dans l'écran) et si le pointeur est dans l'écran. */
function cellAt(e, d) {
  const r = canvas.getBoundingClientRect();
  const col = Math.floor((e.clientX - r.left - 8) / cellW);
  const row = Math.floor((e.clientY - r.top - 8) / cellH);
  const inside = row >= 0 && row < d[0] && col >= 0 && col < d[1];
  return { row: Math.min(d[0] - 1, Math.max(0, row)), col: Math.min(d[1] - 1, Math.max(0, col)), inside };
}

/** Rectangle de la sélection, coins dans l'ordre. */
function selBox() {
  return {
    r0: Math.min(sel.r0, sel.r1), r1: Math.max(sel.r0, sel.r1),
    c0: Math.min(sel.c0, sel.c1), c1: Math.max(sel.c0, sel.c1),
  };
}

/** Texte de la sélection : une ligne par rangée, champs cachés en espaces. */
function selText() {
  const d = screens.get(sel.addr);
  if (!d) return '';
  const b = selBox();
  const lines = [];
  for (let r = b.r0; r <= b.r1 && r < d[0]; r++) {
    let line = '';
    for (let c = b.c0; c <= b.c1 && c < d[1]; c++) {
      const p = r * d[1] + c;
      line += d[6 + 2 * p] & 0x40 ? ' ' : String.fromCharCode(d[5 + 2 * p]);
    }
    lines.push(line.trimEnd());
  }
  return lines.join('\n');
}

function clearSel() {
  if (!sel) return;
  sel = null;
  drawScreen();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showStatus('clip.copied');
  } catch {
    showStatus('clip.denied');
  }
}

canvas.addEventListener('mousedown', (e) => {
  if (touchInput) e.preventDefault();
  if (e.button !== 0) return;
  const a = currentTerm();
  const d = screens.get(a);
  if (!d) return;
  const { row, col, inside } = cellAt(e, d);
  drag = { addr: a, row, col, inside, moved: false };
  clearSel();
});

window.addEventListener('mousemove', (e) => {
  if (!drag || touchInput) return;
  const d = screens.get(drag.addr);
  if (!d || currentTerm() !== drag.addr) return;
  const { row, col } = cellAt(e, d);
  if (!drag.moved && row === drag.row && col === drag.col) return;
  drag.moved = true;
  sel = { addr: drag.addr, r0: drag.row, c0: drag.col, r1: row, c1: col };
  drawScreen();
});

window.addEventListener('mouseup', () => {
  if (!drag) return;
  const d = drag;
  drag = null;
  // Simple clic : le curseur va à la cellule.
  const screen = screens.get(d.addr);
  if (!d.moved && d.inside && running && screen) {
    worker.postMessage({ type: 'click', addr: d.addr, pos: d.row * screen[1] + d.col });
  }
});

canvas.addEventListener('dblclick', (e) => {
  const a = currentTerm();
  const d = screens.get(a);
  if (!d) return;
  const { row, col, inside } = cellAt(e, d);
  if (!inside) return;
  const blank = (c) => {
    const p = row * d[1] + c;
    return d[5 + 2 * p] === 32 || d[5 + 2 * p] === 0 || (d[6 + 2 * p] & 0x40) !== 0;
  };
  if (blank(col)) return;
  let c0 = col;
  let c1 = col;
  while (c0 > 0 && !blank(c0 - 1)) c0--;
  while (c1 < d[1] - 1 && !blank(c1 + 1)) c1++;
  sel = { addr: a, r0: row, c0, r1: row, c1 };
  drawScreen();
});

window.addEventListener('resize', () => drawScreen());

// --- plein écran des terminaux (écran et touches 3270). API plein écran (préfixée par
// WebKit au besoin); sinon (iPhone) la zone occupe toute la fenêtre.
const stage = document.querySelector('.stage');
const fullApi = !!(stage.requestFullscreen || stage.webkitRequestFullscreen);
const fullElement = () => document.fullscreenElement ?? document.webkitFullscreenElement ?? null;

function isFull() {
  return stage.classList.contains('full');
}

async function setFull(on) {
  if (on) {
    stage.classList.add('full');
    if (fullApi && !fullElement()) {
      try {
        await (stage.requestFullscreen ? stage.requestFullscreen() : stage.webkitRequestFullscreen());
      } catch { /* refusé : la zone occupe la fenêtre */ }
    }
  } else {
    stage.classList.remove('full');
    if (fullElement()) {
      try { await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen()); } catch { /* rien */ }
    }
  }
  fullChanged();
}

function fullChanged() {
  // Sortie par Échap ou par le fureteur : la classe suit.
  if (fullApi && !fullElement() && stage.classList.contains('full') && fullWasApi) stage.classList.remove('full');
  fullWasApi = !!fullElement();
  $('full-exit').hidden = !isFull();
  drawScreen();
  if (!canvas.hidden) canvas.focus();
}
let fullWasApi = false;
document.addEventListener('fullscreenchange', fullChanged);
document.addEventListener('webkitfullscreenchange', fullChanged);
$('full-button').addEventListener('click', () => setFull(!isFull()));
$('full-exit').addEventListener('click', () => setFull(false));

// Touches 3270 à l'écran.
const keyBar = $('key-bar');
const showKeysBox = $('show-keys');
function showKeys() {
  return prefs.showKeys ?? matchMedia('(pointer: coarse)').matches;
}
// Mise en veille automatique (menu Machine).
const autoSuspendBox = $('auto-suspend');
autoSuspendBox.checked = autoSuspend();
autoSuspendBox.addEventListener('change', () => {
  prefs.autoSuspend = autoSuspendBox.checked;
  savePrefs();
});
// Horloge remise à l'heure à la reprise (désactivé par défaut : risque pour TSO).
const resumeClockBox = $('resume-clock');
resumeClockBox.checked = !!prefs.resumeClock;
resumeClockBox.addEventListener('change', () => {
  prefs.resumeClock = resumeClockBox.checked;
  savePrefs();
});

// Écran 3270 moderne ou d'époque (menu Affichage).
const lookList = $('look-list');
lookList.value = prefs.look === 'vintage' ? 'vintage' : 'modern';
lookList.addEventListener('change', () => {
  prefs.look = lookList.value;
  savePrefs();
  // La police 3270 se charge à la demande : écran redessiné quand elle est prête.
  if (vintage()) document.fonts?.load(`16px ${FONT_VINTAGE}`).then(() => drawScreen());
  drawScreen();
});
if (vintage()) document.fonts?.load(`16px ${FONT_VINTAGE}`).then(() => drawScreen());

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
    // Toucher (tablettes) : le focus ne change pas, le clavier virtuel ne sort pas (il reste
    // ouvert s'il l'était). Souris : le terminal reprend le focus pour la suite des touches.
    let touch = false;
    b.addEventListener('pointerdown', (e) => { touch = e.pointerType !== 'mouse'; });
    b.addEventListener('click', () => {
      if (key === 'shift') {
        pfShift = !pfShift;
        buildKeyBar();
      } else {
        termKey(key);
      }
      if (!touch) termFocus();
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
  if (a !== null && sel && sel.addr === a) {
    text = selText();
  } else if (a !== null) {
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
  } else if (currentTab === 'events') {
    text = eventsOut.textContent;
  } else if (currentTab === 'journal') {
    // La sélection faite dans le journal, sinon tout le journal.
    const s = getSelection();
    text = s && !s.isCollapsed && journalOut.contains(s.anchorNode) ? s.toString() : journalOut.textContent;
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

const SAMPLE_JCL = deckText('hello');

const jcl = $('jcl');
jcl.value = localStorage.getItem('ibmz-jcl') ?? SAMPLE_JCL;
jcl.addEventListener('input', () => {
  try { localStorage.setItem('ibmz-jcl', jcl.value); } catch { /* rien */ }
});
// Exemple : remis dans la zone (texte gardé oublié : l'exemple suit les nouvelles versions).
$('jcl-sample').addEventListener('click', () => {
  jcl.value = SAMPLE_JCL;
  try { localStorage.removeItem('ibmz-jcl'); } catch { /* rien */ }
  jcl.scrollTop = 0;
  jcl.focus();
  $('cards-status').textContent = t('cards.sample.done');
});
$('jcl-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) jcl.value = await f.text();
});
// Perforatrice (punch.js) : jeux de cartes, bibliothèque, soumission au lecteur 00C.
languageListeners.push(initPunch({
  running: () => running,
  submit: (text) => worker?.postMessage({ type: 'submit', text }),
  prefs,
  savePrefs,
}));
function punchCount() {
  const n = savedDeckCount();
  $('punch-count').textContent = n ? t('punch.count', { n }) : '';
}
languageListeners.push(punchCount);
punchCount();
$('punch-open').addEventListener('click', () => {
  openPunch();
  setDrawer(false);
});
$('kp').addEventListener('close', punchCount);

// Aide-mémoire : un travail d'exemple s'ouvre dans la perforatrice, à perforer et à soumettre.
const memo = $('memo');
languageListeners.push(initMemo(memo, (text) => {
  memo.close();
  openPunch({ text });
}));
$('memo-button').addEventListener('click', () => memo.showModal());

// Gestionnaire de volumes (volumes.js) : lecture par vol-worker.js, ou par le fil de la
// machine quand elle tourne.
languageListeners.push(initVolumes({
  volumes: () => volumes,
  // Volumes lus sur place (configuration de Hercules) et leur ombre de la page.
  mounted: () => [...mounts.entries()].map(([addr, m]) => ({
    file: `mnt:${hex3(addr)}`, addr, name: m.file.name, blob: m.file, shadows: m.shadows, overlay: overlayName({ addr, stem: m.stem }), mounted: true,
  })),
  running: () => running,
  // Écriture directe (machine arrêtée) : la session suspendue serait faussée.
  sessionGuard,
  worker: () => worker,
  version: V,
  prefs,
  savePrefs,
  // Travaux du gestionnaire (MVS en marche) : cartes pour le lecteur 00C.
  submit: (text) => worker?.postMessage({ type: 'submit', text }),
  // Onglet Imprimante sur l'unité `addr` (sortie des travaux : 00F).
  showPrinter: (addr) => {
    prefs.printer = addr;
    savePrefs();
    selectTab('printer');
  },
  // Volume vierge : rangé dans l'OPFS comme un volume du dépôt.
  addVolume: async (name, bytes) => {
    await writeVolume(name, new Blob([bytes]).stream());
    await keepStorage();
    await renderVolumes();
  },
}));
$('vm-button').addEventListener('click', () => openVolumes());

// Bandes (tapes.js) : fichiers du dossier tapes de l'OPFS, montés par le fil de la machine.
languageListeners.push(initTapes({
  running: () => running,
  worker: () => worker,
  devices: () => machineDevices(),
  status: showStatus,
  fmtSize,
  iconButton,
  writeFile: (name, stream, dir) => writeVolume(name, stream, null, dir),
  labeledTape: (volser) => new Promise((resolve, reject) => {
    const w = new Worker(new URL(`./vol-worker.js${V}`, import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => {
      w.terminate();
      if (data.ok) resolve(data.result);
      else reject(new Error(data.error));
    };
    w.postMessage({ id: 1, op: 'newtape', volser, owner: 'HERC' });
  }),
}));

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

// Arrière-plan : iPadOS gèle la page, puis la supprime souvent (la page est rechargée au
// retour, la machine perdue). Mise en veille automatique (réglage du menu Machine; par
// défaut sur iPad et iPhone) : la machine est suspendue dès que la page est cachée, et
// reprise au retour, ou au rechargement si la page a été supprimée.
function backgrounded() {
  if (REMOTE) return;
  worker?.postMessage({ type: 'flush' });
  if (autoSuspend() && running && !shuttingDown && !ssBusy) suspendMachine(true);
}
window.addEventListener('pagehide', backgrounded);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') backgrounded();
  else if (ssAuto && !ssBusy && suspended && !running) resumeSession();
});
window.addEventListener('beforeunload', (e) => {
  if (running && !REMOTE) {
    worker?.postMessage({ type: 'flush' });
    e.preventDefault();
  }
});

async function main() {
  if (REMOTE) {
    remoteMain();
    return;
  }
  if (!opfsOk) {
    errorBox.textContent = t('opfs.missing');
  }
  startWorker();
  showMachine();
  await loadZboot();
  await renderVolumes();
  await loadDepot();
  showRelay();
  selectTab('console');
  updateButtons();
  document.documentElement.classList.replace('js-loading', 'js-ready');
  // Session suspendue d'une visite précédente : la reprendre ?
  suspended = await readSession();
  updateButtons();
  // Mise en veille automatique d'une page supprimée en arrière-plan : reprise sans
  // question, sauf si des volumes lus sur place sont à choisir de nouveau.
  const needMounts = (suspended?.cfg.mounts ?? []).some((m) => !mounts.has(m.addr));
  if (suspended?.page?.auto && autoSuspend() && !needMounts) {
    ssAuto = true;
    resumeSession();
  } else if (suspended) ssShow({ title: 'ss.title', text: ssDescribe(suspended), buttons: ['drop', 'later', 'resume'] });
}

/** Mode « machine distante » : menus de la machine du fureteur cachés (configuration,
 *  disques, bandes, dépôt, réseau local), onglet Machine, relié au serveur. */
function remoteMain() {
  for (const name of ['machine', 'volumes', 'tapes', 'depot', 'net']) {
    const item = navItems.find((i) => i.getAttribute('aria-controls') === `panel-${name}`);
    const group = item?.closest('.nav-group');
    if (group) group.hidden = true;
  }
  for (const id of ['btn-load', 'suspend']) if ($(id)) $(id).hidden = true;
  tabsBox.querySelector('[data-tab="machine"]').hidden = false;
  // À propos : le texte de la machine du serveur (gardé au changement de langue).
  const about = document.querySelector('#panel-about [data-i18n-html="about.text"]');
  about.dataset.i18nHtml = 'about.text.remote';
  about.innerHTML = t('about.text.remote');
  languageListeners.push(renderMachine);
  startWorker();
  selectTab('console');
  updateButtons();
  document.documentElement.classList.replace('js-loading', 'js-ready');
}

/** Machine du serveur (dés)reliée : comme au début d'un IPL d'ici, sans le lancer. */
function remoteStarted(data) {
  runArch = data.arch === 'z' ? 'z' : 's370';
  // Nom de la machine du serveur (titre, en-tête).
  const name = runArch === 'z' ? 'IBM z/Architecture' : 'IBM System/370';
  document.title = name;
  for (const el of document.querySelectorAll('.machine-name')) el.textContent = name;
  // Terminaux que le serveur montre aux pages (--web-terminals; 0C0-0C1 par défaut).
  terminals = data.terminals ?? [0x0c0, 0x0c1];
  remotePageTerms(terminals);
  buildTabs();
  consoleText = '';
  consoleOut.textContent = '';
  questions.clear();
  for (const k of Object.keys(printers)) delete printers[k];
  showPrinter();
  running = true;
  shuttingDown = false;
  consoleHint();
  punchMachineChanged();
  updateButtons();
  setLight('lt-load', false);
  setLight('lt-sys', true);
  showStatus(remoteAccess === 'guest' ? 'remote.guest' : 'remote.connected', { n: data.volumes });
}

main();
