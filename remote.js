// Mode « machine distante » : la page servie par ibmz-server (--http, image Docker) se relie
// à la machine qui tourne sur le serveur au lieu de la faire tourner elle-même. Le serveur
// l'annonce par <meta name="ibmz-remote"> dans index.html.
//
// RemoteWorker a la forme d'un Worker (postMessage, onmessage) : main.js lui parle comme à
// worker.js, et le serveur répond par les mêmes messages (crates/server/src/web.rs), en JSON
// sur un WebSocket; les écrans des terminaux arrivent en binaire (adresse, écriture du
// système, puis l'écran rendu). Connexion : mot de passe de la console demandé si le serveur
// en a un (sinon lecture seule); reprise automatique après une coupure.

import { t } from './i18n.js?v=16c1386c';

export const REMOTE = !!document.querySelector('meta[name="ibmz-remote"]');

const $ = (id) => document.getElementById(id);

export class RemoteWorker {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
    this.ws = null;
    this.retry = 1000;
    this.closed = false;
    this.wasOpen = false;
    this.start();
  }

  emit(data) {
    this.onmessage?.({ data });
  }

  async start() {
    if (this.closed) return;
    let me;
    try {
      me = await (await fetch('api/me', { cache: 'no-store' })).text();
    } catch {
      this.later();
      return;
    }
    if (me === 'login') await login();
    this.connect();
  }

  later() {
    if (this.closed) return;
    setTimeout(() => this.start(), this.retry);
    this.retry = Math.min(this.retry * 2, 15000);
  }

  connect() {
    const url = new URL('ws', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 1000;
      this.wasOpen = true;
      this.emit({ type: 'ready' });
    };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        this.emit(msg);
        return;
      }
      const d = new Uint8Array(e.data);
      this.emit({ type: 'screen', addr: (d[0] << 8) | d[1], host: d[2] === 1, data: d.slice(3) });
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      // Machine arrêtée, serveur parti ou réseau coupé : la page attend son retour.
      if (this.wasOpen) {
        this.wasOpen = false;
        this.emit({ type: 'remote-lost' });
      }
      this.later();
    };
  }

  postMessage(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  terminate() {
    this.closed = true;
    this.ws?.close();
  }
}

/** Mot de passe de la console (fenêtre de la page), jusqu'à ce qu'il soit accepté. */
function login() {
  const dlg = $('remote-login');
  const form = $('remote-login-form');
  const input = $('remote-login-pw');
  const err = $('remote-login-error');
  return new Promise((resolve) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const r = await fetch('api/login', { method: 'POST', body: input.value }).catch(() => null);
      if (r?.ok) {
        input.value = '';
        err.textContent = '';
        dlg.close();
        resolve();
      } else {
        err.textContent = t('remote.login.bad');
        input.select();
      }
    };
    dlg.oncancel = (e) => e.preventDefault();
    if (!dlg.open) dlg.showModal();
    input.focus();
  });
}

// --- onglet Machine : la machine du serveur ----------------------------------------------

let info = null;
let stats = null;
let terms = new Set();

const fmt = (n) => Number(n).toLocaleString(document.documentElement.lang || 'en');

export function remoteInfo(data) {
  info = data;
  renderMachine();
}

export function remoteStats(data) {
  stats = data;
  if (!$('remote-machine').hidden) renderActivity();
}

/** Terminaux pris par d'autres (clients TN3270, autres pages). */
export function remoteTerms(set) {
  terms = set;
}

let pageTerms = new Set();

/** Terminaux montrés dans la page (les autres servent aux clients TN3270 seulement). */
export function remotePageTerms(list) {
  pageTerms = new Set(list);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function facts(rows) {
  const dl = el('dl', 'rm-facts');
  for (const [k, v, cls] of rows) {
    dl.append(el('dt', '', t(k)));
    const dd = el('dd', cls ?? '', v ?? '—');
    dl.append(dd);
  }
  return dl;
}

function card(title, body, id) {
  const c = el('section', 'rm-card');
  if (id) c.id = id;
  c.append(el('h3', '', t(title)), body);
  return c;
}

function table(heads, rows, cls) {
  const tb = el('table', `rm-table ${cls ?? ''}`);
  const tr = el('tr');
  for (const h of heads) tr.append(el('th', '', t(h)));
  const head = el('thead');
  head.append(tr);
  tb.append(head);
  const body = el('tbody');
  for (const r of rows) {
    const row = el('tr');
    for (const c of r) row.append(el('td', '', c));
    body.append(row);
  }
  tb.append(body);
  return tb;
}

const tracks = (n) => (n === 1 ? t('rm.track') : t('rm.tracks', { n: fmt(n) }));

function deviceName(type) {
  if (/^33[0-9]0$/.test(type)) return t('rm.d.disk');
  const k = `rm.d.${type}`;
  const s = t(k);
  return s === k ? type : s;
}

/** Contenu de l'onglet Machine (aussi au changement de langue). */
export function renderMachine() {
  const box = $('remote-machine');
  if (!box) return;
  box.textContent = '';
  if (!info) return;
  const ext = [info.cpu.ext370 ? t('rm.ext.s370') : null, info.cpu.tcpip ? "TCPIP X'75'" : null].filter(Boolean);
  const cards = el('div', 'rm-cards');
  cards.append(card('rm.cpu', facts([
    ['rm.model', info.cpu.model],
    ['rm.serial', info.cpu.serial],
    ['rm.cpus', String(info.cpu.count)],
    ['rm.arch', 'System/370'],
    ['rm.ext', ext.join(', ') || '—'],
    ['rm.mem', t('rm.mb', { n: info.mem })],
    ['rm.speed', t('rm.mips', { n: fmt(Math.round(1000 / info.nsPerInst)) })],
  ])));
  cards.append(card('rm.activity', el('div'), 'rm-activity'));
  const iplVol = info.volumes.find((v) => v.addr === info.ipl);
  const lang = document.documentElement.lang || 'en';
  cards.append(card('rm.ipl', facts([
    ['rm.unit', info.ipl],
    ['rm.volume', iplVol?.volser],
    ['rm.file', iplVol?.file],
    ['rm.started', new Date(info.started * 1000).toLocaleString(lang === 'zh' ? 'zh-CN' : lang, { dateStyle: 'long', timeStyle: 'medium' })],
  ])));
  cards.append(card('rm.host', facts([
    ['rm.hostarch', info.host.arch],
    ['rm.hostos', info.host.os],
    ['rm.hostcpus', String(info.host.cpus)],
    ['rm.ports', info.ports.map((p) => `${p.port} (${t(`rm.port.${p.use}`)})`).join(' · ')],
    ['rm.version', info.version],
  ])));
  box.append(cards);

  box.append(el('h3', 'rm-h', t('rm.volumes')));
  box.append(table(['rm.addr', 'rm.file', 'rm.type', 'rm.volume', 'rm.writes'], info.volumes.map((v) => [
    v.addr, v.file, v.type, v.volser,
    v.writes === 'ovl' ? t('rm.w.ovl', { n: tracks(v.shadow) }) : t(`rm.w.${v.writes}`),
  ]), 'rm-vols'));

  box.append(el('h3', 'rm-h', t('rm.devices')));
  box.append(table(['rm.addr', 'rm.type', 'rm.device', 'rm.detail'], info.devices.map((d) => [
    d.addr, d.type, deviceName(d.type),
    d.type === '3270' ? termState(parseInt(d.addr, 16)) : d.detail,
  ]), 'rm-devs'));

  const head = el('div', 'rm-row');
  head.append(el('h3', 'rm-h', t('rm.config')));
  const copy = el('button', 'icon-button small', t('rm.copy'));
  copy.type = 'button';
  copy.onclick = async () => {
    await navigator.clipboard?.writeText(info.config).catch(() => {});
    copy.textContent = t('rm.copied');
    setTimeout(() => { copy.textContent = t('rm.copy'); }, 1500);
  };
  head.append(copy);
  box.append(head);
  box.append(el('p', 'hint', t('rm.config.note')));
  box.append(el('pre', 'rm-config', info.config));
  renderActivity();
}

function termState(a) {
  if (!pageTerms.has(a)) return t('rm.term.tn');
  return t(terms.has(a) ? 'rm.term.taken' : 'rm.term.free');
}

function renderActivity() {
  const c = $('rm-activity');
  if (!c || !stats) return;
  const sec = Math.floor(stats.simMs / 1000);
  const hms = `${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  c.querySelector('dl')?.remove();
  c.querySelector('div')?.remove();
  c.append(facts([
    ['rm.state', t(stats.wait ? 'rm.wait' : 'rm.run'), stats.wait ? 'rm-wait' : 'rm-run'],
    ['turbo', t(stats.turbo ? 'rm.turbo.on' : 'rm.turbo.off')],
    ['rm.measured', t('rm.mips', { n: stats.mips.toFixed(1) })],
    ['rm.io', fmt(stats.io)],
    ['rm.simtime', hms],
    ['rm.psw', `${stats.psw.slice(0, 8)} ${stats.psw.slice(8)}`],
  ]));
}
