// Page de l'émulateur IBM System/370 et z/Architecture : menu, volumes (OPFS), dépôt de
// fichiers, fil de la machine (worker.js), console de l'opérateur, terminaux 3270, pupitre,
// lecteur de cartes et imprimantes.

import { LANGUAGES, browserLanguage, setLanguage, t } from './i18n.js?v=0c6f716a';
import { initMemo } from './memo.js?v=0c6f716a';
import { deckText } from './decks.js?v=0c6f716a';
import { initVolumes, openVolumes, volConsole, volMachineChanged, volPrinter, volSettle } from './volumes.js?v=0c6f716a';
import { devices, initHerc, mounts, mountsMissing, overlayName, remountFromDir } from './herc-ui.js?v=0c6f716a';
import { Z_DEVICES } from './herc-conf.js?v=0c6f716a';
import { initPunch, openPunch, punchMachineChanged, savedDeckCount } from './punch.js?v=0c6f716a';

const VERSION = '0.1.22';
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
  depot: 'https://ve2cuy.com/vax/ibmz',
  turbo: false,
  printer: 0x00E,
  printerFit: false,      // imprimante : toute la largeur de la feuille à l'écran
  termFit: null,          // terminal ajusté à la fenêtre (null : oui, sauf sur écran tactile)
  relay: false,
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

/** Copie un flux dans l'OPFS (fichier .part, renommé à la fin si le fureteur sait renommer). */
async function writeVolume(name, stream, onBytes) {
  const dir = await volDir();
  const canMove = typeof FileSystemHandle !== 'undefined' && typeof FileSystemHandle.prototype.move === 'function';
  const part = canMove ? `${name}.part` : name;
  const out = await openWriter(dir, part);
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
  if (canMove) {
    await dir.removeEntry(name).catch(() => {});
    try {
      // Forme à deux arguments : WebKit (Safari, et Chrome et Edge d'iPadOS) exige le
      // dossier de destination (« Not enough arguments » sinon).
      await out.fh.move(dir, name);
    } catch {
      // Renommage refusé : copie sous le nom final, puis le fichier .part est effacé.
      const copy = await openWriter(dir, name);
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
    lic.textContent = localized(entry, 'license');
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

/** Unités de la machine choisie : la configuration importée, sinon celles de TK5 (S/370) ou
 *  du lecteur, de la perforatrice et de l'imprimante (z/Architecture). */
function machineDevices() {
  return isZ() && !prefs.devices?.length ? Z_DEVICES : devices();
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
  volumes: () => volumes,
  running: () => running,
  volDir,
  writeVolume,
  renderVolumes,
  status: showStatus,
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

/** La machine choisie : description, mémoire, unité d'IPL, champs de z/Architecture. */
function showMachine() {
  archList.value = prefs.arch;
  archList.disabled = running;
  // Nom de la machine (titre), exemple de commande de la console.
  const name = isZ() ? 'IBM z/Architecture' : 'IBM System/370';
  document.title = name;
  for (const el of document.querySelectorAll('.machine-name')) el.textContent = name;
  const ci = $('console-input');
  ci.dataset.i18nPlaceholder = isZ() ? 'console.placeholder.z' : 'console.placeholder';
  ci.placeholder = t(ci.dataset.i18nPlaceholder);
  ci.setAttribute('autocapitalize', isZ() ? 'off' : 'characters');
  $('machine-desc').textContent = t(isZ() ? 'machine.desc.z' : 'machine.desc');
  memLabels();
  $('loadparm-field').hidden = !isZ();
  loadparmInput.value = prefs.loadparm;
  $('cpus-field').hidden = !isZ();
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
  powerButton.disabled = !worker || (!running && !canIpl());
  powerLabel.textContent = t(running ? 'power.stop' : 'power.ipl');
  $('btn-load').disabled = running || !canIpl();
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
  worker = new Worker(new URL(`./worker.js${V}`, import.meta.url), { type: 'module' });
  worker.onmessage = onWorkerMessage;
  worker.onerror = (e) => showStatus('error', { msg: `${e.message || 'worker'}${where(e.filename, e.lineno) || ' (worker.js)'}` });
}

let runArch = 's370';   // machine en marche

async function ipl() {
  if (running || !worker) return;
  // Volumes lus sur place d'une visite précédente : retrouvés dans le dossier de Hercules
  // gardé (l'accès se redemande pendant ce clic, avant toute autre attente).
  if (mountsMissing().length) await remountFromDir();
  const vols = await listVolumes();
  const addr = parseInt(iplPref(), 16);
  // z/Architecture : IPL du lecteur avec les fichiers de Linux.
  const readerIpl = isZ() && machineDevices().some((d) => d.kind === 'reader' && d.addr === addr);
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
  for (const k of Object.keys(printers)) delete printers[k];
  showPrinter();
  running = true;
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
    boot: readerIpl ? { parm: prefs.zparm || 'ro' } : null,
    ipl: addr,
    volumes: opfs.map((v) => ({ addr: v.addr, file: v.file })),
    mounts: mounted,
    devices: machineDevices(),
    terminals,
    relay: prefs.relay ? prefs.relayUrl : null,
  });
  worker.postMessage({ type: 'turbo', on: prefs.turbo });
}

let shuttingDown = false;

// --- fenêtre de l'arrêt propre : étapes cochées, durée, fin claire (« vous pouvez fermer
// la page » seulement quand les volumes sont écrits et refermés).
const sd = $('sd');
const SD_STEPS = ['request', 'tso', 'tasks', 'jes2', 'eod', 'quiesce', 'save'];
let sdStart = 0;
let sdClock = 0;

function sdMark(step) {
  const at = SD_STEPS.indexOf(step);
  for (const li of sd.querySelectorAll('#sd-steps li')) {
    const i = SD_STEPS.indexOf(li.dataset.step);
    li.classList.toggle('done', i < at);
    li.classList.toggle('active', i === at);
  }
}

function sdOpen() {
  sdStart = performance.now();
  $('sd-tso').textContent = t('sd.tso');
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

function sdPhase({ phase, users, wait }) {
  if (!sdStart) sdOpen();
  if (phase === 'started') sdMark('tso');
  else if (phase === 'tso') {
    $('sd-tso').textContent = users === 0 ? t('sd.tso.none')
      : users > 0 ? t('sd.tso.some', { n: users, s: Math.round(wait / 1000) }) : t('sd.tso.unknown');
    sdMark('tso');
  } else sdMark(phase);
}

function sdStopped(reason) {
  if (!sdStart) return;
  clearInterval(sdClock);
  const s = Math.round((performance.now() - sdStart) / 1000);
  sdStart = 0;
  const ok = reason === 'shutdown';
  if (ok) sdMark('end');
  for (const li of sd.querySelectorAll('#sd-steps li')) if (ok) li.classList.add('done');
  $('sd-warning').hidden = true;
  $('sd-result').textContent = t(ok ? 'sd.done' : 'sd.other', { s });
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
  // L'arrêt propre (procédure SHUTDOWN de TK5) ne vaut que pour MVS 3.8j.
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
      showStatus(runArch === 'z' ? 'ipl.started.z' : 'ipl.started', { n: data.volumes.length });
      break;
    case 'console':
      appendConsole(data.text);
      volConsole(data.text);
      break;
    case 'screen':
      screens.set(data.addr, data.data);
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
      speed.textContent = t('speed', { mips: data.mips.toFixed(1) });
      speed.dataset.dbg = data.dbg ?? '';
      $('psw').textContent = data.psw;
      setLight('lt-wait', data.wait);
      setLight('lt-sys', !data.wait);
      break;
    case 'shutdown':
      shuttingDown = true;
      showStatus('power.shutting');
      sdPhase(data);
      break;
    case 'relay':
      relayState = data;
      showRelay();
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
      if (/^ipl\|/.test(data.msg)) {
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
    case 'stopped':
      running = false;
      if (shuttingDown && data.reason === 'stopped') data.reason = 'shutdown';
      shuttingDown = false;
      setLight('lt-sys', false);
      setLight('lt-wait', false);
      setLight('lt-load', false);
      for (const [, id] of IO_LIGHTS) setLight(id, false);
      speed.textContent = '';
      if (data.reason === 'error' && lastError) showStatus('error', { msg: lastError });
      else showStatus(data.reason === 'user' ? 'power.stopped' : `stop.${data.reason}`);
      updateButtons();
      renderVolumes();
      volMachineChanged();
      punchMachineChanged();
      sdStopped(data.reason);
      renderZboot();
      break;
    case 'closed':
      break;
  }
}

// ------------------------------------------------------------------ relais TN3270

const relayOn = $('relay-on');
const relayUrlInput = $('relay-url');
let relayState = { state: 'off', clients: [] };
relayOn.checked = prefs.relay;
relayUrlInput.value = prefs.relayUrl;

function relayConfig() {
  worker?.postMessage({ type: 'relay', url: running && prefs.relay ? prefs.relayUrl : null });
}

relayOn.addEventListener('change', () => {
  prefs.relay = relayOn.checked;
  savePrefs();
  if (running) relayConfig();
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
  const list = $('relay-clients');
  list.replaceChildren(...(relayState.clients ?? []).map((c) => {
    const li = document.createElement('li');
    li.className = 'mono';
    li.textContent = `${hex3(c.addr)}  ${c.ttype}`;
    return li;
  }));
  showTermStatus();
}
languageListeners.push(showRelay);

// ------------------------------------------------------------------ pupitre

const dials = [...document.querySelectorAll('.dial')];

function showDials() {
  const d = iplPref().padStart(3, '0');
  dials.forEach((b, i) => {
    b.querySelector('span').textContent = d[i];
    b.style.setProperty('--angle', `${parseInt(d[i], 16) * 22.5}deg`);
  });
  iplInput.value = iplPref();
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
  $('key-bar').hidden = !(name.startsWith('t') && showKeys());
  $('full-button').hidden = !name.startsWith('t');
  // Liste des imprimantes : seulement sous l'onglet Imprimante.
  const ps = $('printer-select');
  if (ps) ps.hidden = name !== 'printer';
  $('printer-fit').hidden = name !== 'printer';
  $('term-fit').hidden = !name.startsWith('t');
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
  const text = printers[prefs.printer] ?? '';
  const atEnd = printerOut.scrollTop + printerOut.clientHeight >= printerOut.scrollHeight - 30;
  // Feuilles de 66 lignes (11 pouces à 6 lignes au pouce), dont 61 imprimées : un saut de
  // page passe à la feuille suivante (le reste de la feuille reste blanc), une page plus longue continue
  // sur la suivante. Le saut en tête de sortie ne laisse pas de feuille vide; seules les
  // feuilles changées sont refaites.
  const pages = [];
  for (const page of text.split('\f')) {
    if (page === '') continue;
    const lines = page.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    for (let i = 0; i < lines.length; i += PAGE_LINES) pages.push(lines.slice(i, i + PAGE_LINES).join('\n'));
  }
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
  ctx.font = `${size}px ${FONT}`;
  let w = ctx.measureText('M').width;
  const fit = Math.min(availW / (cols * w + 16), availH / (rows * size * 1.25 + 16));
  if (fit < 1 && fit0) size = Math.max(8, Math.floor(size * fit));
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
  else if (blinkOn || !termFocused()) ctx.fillRect(cc * cellW, cr * cellH + cellH - 3, cellW, 3);
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
  const a = currentTerm();
  if (a !== null && running && !remoteTerms().has(a)) worker.postMessage({ type: 'key', addr: a, key });
}

function termChars(text) {
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
  else if ((ctrl || e.metaKey) && (k === 'v' || k === 'c')) return; // coller, copier
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

canvas.addEventListener('mousedown', (e) => {
  if (touchInput) e.preventDefault();
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
      termFocus();
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
  } else if (currentTab === 'events') {
    text = eventsOut.textContent;
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
$('jcl-sample').addEventListener('click', () => { jcl.value = SAMPLE_JCL; });
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
  running: () => running,
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
  showMachine();
  await loadZboot();
  await renderVolumes();
  await loadDepot();
  showRelay();
  selectTab('console');
  updateButtons();
  document.documentElement.classList.replace('js-loading', 'js-ready');
}

main();
