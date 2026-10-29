// Bandes (menu Bandes) : fichiers de bandes AWS ou HET de Hercules gardés dans le
// fureteur (dossier « tapes » de l'OPFS), importés, créés vierges avec des étiquettes
// standard (comme IEHINITT), téléchargés; montés sur les dérouleurs de la machine en marche
// (avec ou sans anneau d'écriture). Les demandes de montage du système (IEF233A, IEC501A
// « M 480,TAPE01 ») sont affichées près de l'unité, et la bande du même nom proposée.

import { t } from './i18n.js?v=82ac151a';

const $ = (id) => document.getElementById(id);
const hex3 = (n) => n.toString(16).toUpperCase().padStart(3, '0');
let ctx = null;
let units = [];          // état des unités : [{addr, name, pos, blocks, ro}]
let files = [];          // [{name, size}]
const requests = new Map(); // unité -> volume demandé par le système

async function tapeDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('tapes', { create: true });
}

async function listTapes() {
  const out = [];
  try {
    for await (const [name, h] of (await tapeDir()).entries()) {
      if (h.kind !== 'file' || name.endsWith('.part')) continue;
      out.push({ name, size: (await h.getFile()).size });
    }
  } catch { /* pas d'OPFS */ }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function mountedName(name) {
  return units.some((u) => u.name === name);
}

/** Bande proposée pour une demande du système : nom qui commence par le volume demandé. */
function proposed(vol) {
  const v = vol.toLowerCase();
  return files.find((f) => f.name.toLowerCase().replace(/\.(aws|het)$/, '') === v)?.name
    ?? files.find((f) => f.name.toLowerCase().startsWith(v))?.name;
}

export async function renderTapes() {
  files = await listTapes();
  const list = $('tape-list');
  list.replaceChildren();
  for (const f of files) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'mono';
    name.textContent = f.name + (mountedName(f.name) ? ' ●' : '');
    const size = document.createElement('span');
    size.className = 'hint';
    size.textContent = ctx.fmtSize(f.size);
    const save = ctx.iconButton('download', t('tape.save'), async () => {
      const blob = await (await (await tapeDir()).getFileHandle(f.name)).getFile();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    });
    const del = ctx.iconButton('trash', t('tape.delete'), async () => {
      if (mountedName(f.name)) return ctx.status('tape.busy', { name: f.name });
      if (!confirm(t('tape.delete.confirm', { name: f.name }))) return;
      await (await tapeDir()).removeEntry(f.name).catch(() => {});
      renderTapes();
    });
    li.append(name, size, save, del);
    list.append(li);
  }
  $('tape-summary').textContent = files.length ? t('tape.summary', { n: files.length }) : t('tape.none');
  renderUnits();
}

function renderUnits() {
  const box = $('tape-units');
  box.replaceChildren();
  const devs = ctx.devices().filter((d) => d.kind === 'tape');
  if (!devs.length) {
    box.textContent = t('tape.nounit');
    return;
  }
  for (const d of devs) {
    const u = units.find((x) => x.addr === d.addr);
    const row = document.createElement('div');
    row.className = 'tape-unit';
    const head = document.createElement('div');
    head.className = 'mono';
    head.textContent = `${hex3(d.addr)} ${d.type}  ` + (u?.name
      ? t('tape.on', { name: u.name, pos: u.pos, n: u.blocks, ro: u.ro ? t('tape.ro.short') : '' })
      : t('tape.empty'));
    row.append(head);
    const want = requests.get(d.addr);
    if (want && !u?.name) {
      const req = document.createElement('div');
      req.className = 'hint tape-request';
      req.textContent = t('tape.request', { vol: want });
      row.append(req);
    }
    if (ctx.running()) {
      const ctl = document.createElement('div');
      ctl.className = 'row';
      if (u?.name) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'secondary';
        b.textContent = t('tape.unmount');
        b.onclick = () => ctx.worker().postMessage({ type: 'tape', addr: d.addr, op: 'unmount' });
        ctl.append(b);
      } else if (files.length) {
        const sel = document.createElement('select');
        sel.className = 'small-select';
        for (const f of files) if (!mountedName(f.name)) sel.append(new Option(f.name, f.name));
        const p = want && proposed(want);
        if (p) sel.value = p;
        const ro = document.createElement('label');
        ro.className = 'check';
        ro.title = t('tape.ro.tip');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        ro.append(cb, document.createTextNode(t('tape.ro')));
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = t('tape.mount');
        b.onclick = () => {
          if (!sel.value) return;
          requests.delete(d.addr);
          ctx.worker().postMessage({ type: 'tape', addr: d.addr, op: 'mount', name: sel.value, ro: cb.checked });
        };
        ctl.append(sel, ro, b);
      }
      row.append(ctl);
    }
    box.append(row);
  }
}

/** État des unités envoyé par le fil de la machine (message tapes). */
export function tapesState(list) {
  units = list;
  renderTapes();
}

/** Machine arrêtée : plus de bande montée. */
export function tapesStopped() {
  units = [];
  requests.clear();
  renderTapes();
}

/** Messages de la console : demandes de montage (IEF233A, IEC501A) et de démontage. */
export function tapesConsole(text) {
  let changed = false;
  for (const m of text.matchAll(/\b(?:IEF233A|IEC501A)\s+M\s+([0-9A-F]{3,4}),([A-Z0-9#@$]{1,6})/g)) {
    requests.set(parseInt(m[1], 16), m[2]);
    changed = true;
  }
  for (const m of text.matchAll(/\b(?:IEF234E|IEC502E)\s+[KR]\s+([0-9A-F]{3,4})/g)) {
    changed = requests.delete(parseInt(m[1], 16)) || changed;
  }
  if (changed) renderUnits();
}

export function initTapes(context) {
  ctx = context;
  $('tape-file').addEventListener('change', async (e) => {
    const list = [...e.target.files];
    e.target.value = '';
    for (const f of list) {
      const head = new Uint8Array(await f.slice(0, 6).arrayBuffer());
      // Premier en-tête : début d'enregistrement ou marque de bande.
      if (head.length < 6 || !(head[4] & 0xC0)) {
        ctx.status('tape.badfile', { name: f.name });
        continue;
      }
      await ctx.writeFile(f.name, f.stream(), 'tapes');
    }
    renderTapes();
  });
  $('tape-new').addEventListener('click', async () => {
    const vol = (prompt(t('tape.new.prompt'), 'TAPE01') || '').trim().toUpperCase();
    if (!/^[A-Z0-9#@$]{1,6}$/.test(vol)) return;
    const name = `${vol.toLowerCase()}.aws`;
    if (files.some((f) => f.name === name) && !confirm(t('tape.new.replace', { name }))) return;
    const bytes = await ctx.labeledTape(vol);
    await ctx.writeFile(name, new Blob([bytes]).stream(), 'tapes');
    ctx.status('tape.created', { name, vol });
    renderTapes();
  });
  renderTapes();
  return renderTapes;
}
