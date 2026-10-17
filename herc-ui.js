// Configuration de la machine au format de Hercules (menu Machine) : import d'un fichier
// .cnf (unités, mémoire, volumes placés à leurs adresses), export de la configuration de la
// page, retour à la configuration de TK5. Lecture et écriture : herc-conf.js.
//
// Règle de la page : l'extension du nom d'un volume est son adresse (tk5res.390). À
// l'import, un volume déjà présent sous le même nom à une autre adresse est renommé; un
// volume absent est demandé (fichiers choisis par l'usager, copiés sous le bon nom).

import { t } from './i18n.js?v=047e721c';
import { TK5_DEVICES, buildConfig, parseConfig, volumeStem } from './herc-conf.js?v=047e721c';

let ctx = null; // { prefs, savePrefs, volumes(), running(), volDir(), writeVolume(), renderVolumes(), version, status() }
let plan = null;

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
  const text = buildConfig({ mem: ctx.prefs.mem, volumes: vols, devices: devices(), version: `v${ctx.version}` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = ctx.prefs.devicesName && ctx.prefs.devices ? ctx.prefs.devicesName : 'ibm370.cnf';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  ctx.status('hc.exported', { n: vols.length });
}

/** Plan d'import : ce qui sera changé, et ce qui ne peut pas l'être. */
function makePlan(name, conf) {
  const p = { name, warnings: [], dasd: [], missing: [], conflicts: [], devices: [], ignored: conf.ignored, files: new Map() };
  const s = conf.system;
  if (s.mainsize) {
    p.mem = s.mainsize <= 8 ? 8 : 16;
    if (s.mainsize !== p.mem) p.warnings.push(t('hc.w.mem', { n: s.mainsize, m: p.mem }));
  }
  if (s.arch && !/370/.test(s.arch)) p.warnings.push(t('hc.w.arch', { arch: s.arch }));
  if (s.numcpu > 1) p.warnings.push(t('hc.w.cpu', { n: s.numcpu }));
  p.devices = conf.devices.filter((d) => d.kind !== 'dasd').map(({ addr, kind, type }) => ({ addr, kind, type }));
  if (!p.devices.some((d) => d.kind === 'console')) {
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
      p.missing.push({ addr: d.addr, stem, type: d.type, to: want });
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
    ...(plan.mem ? [t('hc.mem', { m: plan.mem })] : []),
    ...Object.entries(kinds).map(([k, list]) => `${t(`hc.k.${k}`)} : ${list.join(', ')}`),
  ]);
  section(t('hc.s.volumes'), [
    ...plan.dasd.map((v) => (v.action === 'ok' ? t('hc.v.ok', { addr: hex3(v.addr), file: v.file })
      : t('hc.v.rename', { addr: hex3(v.addr), file: v.file, to: v.to }))),
    ...plan.missing.map((v) => {
      const f = plan.files.get(v.stem);
      return f ? t('hc.v.chosen', { addr: hex3(v.addr), file: f.name, to: v.to })
        : t('hc.v.missing', { addr: hex3(v.addr), stem: v.stem, type: v.type });
    }),
  ]);
  section(t('hc.s.conflicts'), plan.conflicts.map((c) => t('hc.v.conflict', { addr: hex3(c.addr), stem: c.stem, occupant: c.occupant })));
  section(t('hc.s.warnings'), plan.warnings);
  if (plan.ignored.length) {
    const d = el('details');
    d.append(el('summary', null, t('hc.s.ignored', { n: plan.ignored.length })));
    const pre = el('pre', 'mono hc-ignored', plan.ignored.map((x) => `${String(x.line).padStart(4)}  ${x.text}`).join('\n'));
    d.append(pre);
    box.append(d);
  }
  const waiting = plan.missing.filter((v) => !plan.files.has(v.stem)).length;
  $('hc-files').hidden = !plan.missing.length;
  $('hc-running').hidden = !ctx.running();
  $('hc-apply').disabled = ctx.running();
  $('hc-note').textContent = waiting ? t('hc.note.missing', { n: waiting }) : '';
}

async function importConfig(file) {
  const conf = parseConfig(await file.text());
  if (!conf.devices.length && !conf.system.mainsize) {
    ctx.status('hc.empty', { name: file.name });
    return;
  }
  plan = makePlan(file.name, conf);
  renderPlan();
  $('hc').showModal();
}

/** Fichiers des volumes manquants : rapprochés par leur nom (sans extension). */
function chooseFiles(files) {
  for (const f of files) {
    const stem = volumeStem(f.name);
    if (plan.missing.some((v) => v.stem === stem)) plan.files.set(stem, f);
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
  for (const v of plan.missing) {
    const f = plan.files.get(v.stem);
    if (!f) continue;
    const head = new Uint8Array(await f.slice(0, 8).arrayBuffer());
    if (String.fromCharCode(...head.slice(0, 4)) !== 'CKD_') {
      ctx.status('vol.badfile', { name: f.name });
      continue;
    }
    ctx.status('vol.importing', { name: f.name });
    await ctx.writeVolume(v.to, f.stream());
    done++;
  }
  ctx.prefs.devices = plan.devices;
  ctx.prefs.devicesName = plan.name;
  if (plan.mem) ctx.prefs.mem = plan.mem;
  ctx.savePrefs();
  $('hc').close();
  await ctx.renderVolumes();
  showConfig();
  ctx.applied();
  ctx.status('hc.applied', { name: plan.name, n: done });
}

function reset() {
  ctx.prefs.devices = null;
  ctx.prefs.devicesName = null;
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
  $('hc-apply').addEventListener('click', () => apply().catch((err) => ctx.status('error', { msg: err.message })));
  $('hc-cancel').addEventListener('click', () => $('hc').close());
  showConfig();
  return () => {
    showConfig();
    if ($('hc').open && plan) renderPlan();
  };
}
