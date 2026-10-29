// Aide-mémoire de MVS 3.8j TK5 (bouton de la barre du haut) : commandes, volumes, connexion,
// compilation COBOL, C, assembleur, PL/I et FORTRAN; réseau de la machine z/Architecture
// (relais, profil TCP/IP, vérifications : essayés avec la carte OSA, en pont). Les textes sont dans i18n.js (clés
// memo.*); les commandes et les travaux, identiques dans toutes les langues, sont ici. Chaque travail a été essayé sur TK5
// (mise à jour 5) dans l'émulateur.

import { t } from './i18n.js?v=45525e9a';
import { deckText } from './decks.js?v=45525e9a';

const COBOL_JOB = deckText('cobdemo');

const C_JOB = deckText('cdemo');

const ASM_JOB = deckText('asmdemo');

const PL1_JOB = deckText('pl1demo');

const FORTRAN_JOB = deckText('fortdemo');

const LOGON_JOB = deckText('mylogon');

const DASD_DISPLAY = `D U,DASD,ONLINE
 IEE450I 14.01.05 UNIT STATUS
 UNIT TYPE STATUS  VOLSER VOLSTATE   UNIT TYPE STATUS  VOLSER VOLSTATE
 190  3390 O       TSO001 STRG/RSDNT 191  3390 O       TSO002 STRG/RSDNT
 192  3390 O       TSO003 STRG/RSDNT 248  3350 A       PAGE00 PRIV/RSDNT
 249  3350 A       SPOOL0 PRIV/RSDNT 290  3390 O       WORK01  PUB/RSDNT
 ...
 390  3390 S       TK5RES PRIV/RSDNT 391  3390 A       TK5CAT PRIV/RSDNT`;

const LOGON_SCREEN = `HERC01 LOGON IN PROGRESS AT 13:59:03 ON OCTOBER 16, 2026
NO BROADCAST MESSAGES
   ...  Welcome to the TSO system on TK5R  ...
HELLO HERC01 - IT IS 13:59:06 ON 10/16/26
DATA SET PREFIX IS HERC01
***`;

// Réseau : profil TCP/IP de la carte OSA en pont (réseau 192.168.2.0/24), ligne du serveur
// de noms, profil de la carte LCS (adresses du NAT du relais), travail PING.
const NET_PROFILE = `HOME
   192.168.2.250     OSDL
GATEWAY
  192.168.2      =         OSDL      1500      0
   defaultnet 192.168.2.1       OSDL   576  0`;

const NET_DNS = 'NSINTERADDR  192.168.2.1';

const NET_LCS = ` DEVICE LCS1   LCS           E20
 LINK ETH1  ETHERNET  0  LCS1
 HOME
    192.168.248.78    ETH1
 GATEWAY
   192.168.248  =        ETH1      576  0
   defaultnet 192.168.248.12     ETH1   576  0
 START LCS1`;

const NET_PING = `//PINGJOB  JOB (1),'PING',CLASS=A,MSGCLASS=H
//S0       EXEC PGM=IEFBR14
//DEL      DD DSN=IBMUSER.PINGOUT,DISP=(MOD,DELETE),UNIT=SYSDA,
//            SPACE=(TRK,(1,1))
//S1       EXEC PGM=IKJEFT01
//SYSTSPRT DD DSN=IBMUSER.PINGOUT,DISP=(NEW,CATLG),UNIT=SYSDA,
//            SPACE=(TRK,(5,5)),DCB=(RECFM=FB,LRECL=80,BLKSIZE=8000)
//SYSTSIN  DD *
PING 192.168.2.1 (COUNT 2
PING 8.8.8.8 (COUNT 2
PING www.ibm.com (COUNT 2
/*`;

// Sections : h (titre), p (paragraphe, HTML de i18n.js), ul/ol (clés), table (colonnes et
// lignes : texte tel quel, ou clé i18n si l'élément est {k}), code (avec job : bouton
// « lecteur de cartes »).
const SECTIONS = [
  {
    id: 'cmds',
    blocks: [
      { h: 'memo.cmds.console.h' },
      { p: 'memo.cmds.console.p' },
      {
        table: ['memo.col.cmd', 'memo.col.effect'],
        rows: [
          ['D A,L', { k: 'memo.c.da' }],
          ['D TS,L', { k: 'memo.c.dts' }],
          ['D T', { k: 'memo.c.dt' }],
          ['D U,DASD,ONLINE', { k: 'memo.c.du' }],
          ['D R,L', { k: 'memo.c.dr' }],
          ['R nn,text', { k: 'memo.c.r' }],
          ['$DA', { k: 'memo.c.jda' }],
          ['$DQ', { k: 'memo.c.jdq' }],
          ['$DU,PRT1', { k: 'memo.c.jdu' }],
          ['C name', { k: 'memo.c.cancel' }],
          ['C U=HERC01', { k: 'memo.c.cancelu' }],
          ['$PJnnn', { k: 'memo.c.purge' }],
          ['S SHUTDOWN', { k: 'memo.c.shutdown' }],
        ],
      },
      { h: 'memo.cmds.tso.h' },
      {
        table: ['memo.col.cmd', 'memo.col.effect'],
        rows: [
          ['LISTCAT', { k: 'memo.t.listcat' }],
          ["LISTDS 'SYS2.JCLLIB' MEMBERS", { k: 'memo.t.listds' }],
          ["SUBMIT 'HERC01.TEST.CNTL(xxx)'", { k: 'memo.t.submit' }],
          ['STATUS', { k: 'memo.t.status' }],
          ['RPF', { k: 'memo.t.rpf' }],
          ['RFE', { k: 'memo.t.rfe' }],
          ['ISPF', { k: 'memo.t.ispf' }],
          ['HELP cmd', { k: 'memo.t.help' }],
          ['TIME', { k: 'memo.t.time' }],
          ['SHUTDOWN', { k: 'memo.t.shutdown' }],
          ['LOGOFF', { k: 'memo.t.logoff' }],
        ],
      },
      { h: 'memo.cmds.ispf.h' },
      {
        table: ['memo.col.key', 'memo.col.effect'],
        rows: [
          ['R', { k: 'memo.i.r' }],
          ['3', { k: 'memo.i.3' }],
          ['6', { k: 'memo.i.6' }],
          ['X', { k: 'memo.i.x' }],
          ['PF3', { k: 'memo.i.pf3' }],
        ],
      },
      { p: 'about.keys' },
    ],
  },
  {
    id: 'volumes',
    blocks: [
      { p: 'memo.vol.p' },
      {
        table: ['memo.col.addr', 'memo.col.vol', 'memo.col.type', 'memo.col.content'],
        rows: [
          ['390', 'TK5RES', '3390', { k: 'memo.v.res' }],
          ['391', 'TK5CAT', '3390', { k: 'memo.v.cat' }],
          ['392', 'TK5DLB', '3390', { k: 'memo.v.dlb' }],
          ['298, 299', 'TK5001, TK5002', '3390', { k: 'memo.v.pkg' }],
          ['248', 'PAGE00', '3350', { k: 'memo.v.page' }],
          ['249', 'SPOOL0', '3350', { k: 'memo.v.spool' }],
          ['190-192', 'TSO001-003', '3390', { k: 'memo.v.tso' }],
          ['290-293', 'WORK01-04', '3390', { k: 'memo.v.work' }],
          ['380', 'INT001', '3380', { k: 'memo.v.int' }],
        ],
      },
      { code: DASD_DISPLAY },
      { h: 'memo.vol.ds.h' },
      {
        table: ['memo.col.ds', 'memo.col.content'],
        rows: [
          ['SYS1.PARMLIB', { k: 'memo.d.parmlib' }],
          ['SYS1.PROCLIB', { k: 'memo.d.proclib' }],
          ['SYS2.PROCLIB', { k: 'memo.d.proclib2' }],
          ['SYS2.JCLLIB', { k: 'memo.d.jcllib' }],
          ['SYS1.CMDPROC', { k: 'memo.d.cmdproc' }],
          ['SYS1.SECURE.CNTL', { k: 'memo.d.secure' }],
          ['SYS1.MACLIB', { k: 'memo.d.maclib' }],
          ['HERC01.CMDPROC', { k: 'memo.d.ucmdproc' }],
          ['HERC01.TEST.CNTL', { k: 'memo.d.ucntl' }],
        ],
      },
      { p: 'memo.vol.cat' },
      { p: 'memo.vol.manager' },
    ],
  },
  {
    id: 'logon',
    blocks: [
      { h: 'memo.logon.users.h' },
      {
        table: ['memo.col.user', 'memo.col.pass', 'memo.col.rights'],
        rows: [
          ['HERC01', 'CUL8TR', { k: 'memo.u.1' }],
          ['HERC02', 'CUL8TR', { k: 'memo.u.2' }],
          ['HERC03, HERC04', 'PASS4U', { k: 'memo.u.3' }],
          ['IBMUSER', 'IBMPASS', { k: 'memo.u.ibm' }],
        ],
      },
      { h: 'memo.logon.steps.h' },
      { ol: ['memo.logon.s1', 'memo.logon.s2', 'memo.logon.s3', 'memo.logon.s4'] },
      { h: 'memo.logon.script.h' },
      { p: 'memo.logon.script.p' },
      { code: LOGON_JOB, job: true },
      { p: 'memo.logon.script.note' },
      { code: LOGON_SCREEN },
    ],
  },
  {
    id: 'cobol',
    blocks: [
      { p: 'memo.cobol.p' },
      { code: COBOL_JOB, job: true },
      { ul: ['memo.cobol.n1', 'memo.cobol.n2', 'memo.cobol.n3', 'memo.cobol.n4'] },
    ],
  },
  {
    id: 'c',
    blocks: [
      { p: 'memo.c.p' },
      { code: C_JOB, job: true },
      { ul: ['memo.c.n1', 'memo.c.n2', 'memo.c.n3', 'memo.c.n4', 'memo.c.n5'] },
    ],
  },
  {
    id: 'asm',
    blocks: [
      { p: 'memo.asm.p' },
      { code: ASM_JOB, job: true },
      { ul: ['memo.asm.n1', 'memo.asm.n2', 'memo.asm.n3'] },
    ],
  },
  {
    id: 'pl1',
    blocks: [
      { p: 'memo.pl1.p' },
      { code: PL1_JOB, job: true },
      { ul: ['memo.pl1.n1', 'memo.pl1.n2', 'memo.pl1.n3'] },
    ],
  },
  {
    id: 'fortran',
    blocks: [
      { p: 'memo.fortran.p' },
      { code: FORTRAN_JOB, job: true },
      { ul: ['memo.fortran.n1', 'memo.fortran.n2', 'memo.fortran.n3'] },
    ],
  },
  {
    id: 'net',
    blocks: [
      { p: 'memo.net.p' },
      { h: 'memo.net.relay.h' },
      {
        table: ['memo.col.cmd', 'memo.col.effect'],
        rows: [
          ['ibmz-relay', { k: 'memo.net.r.nat' }],
          ['ibmz-relay --forward 8080:80', { k: 'memo.net.r.fwd' }],
          ['ibmz-relay --interfaces', { k: 'memo.net.r.list' }],
          ['ibmz-relay --bridge 192.168.2.111', { k: 'memo.net.r.bridge' }],
        ],
      },
      { h: 'memo.net.prof.h' },
      { p: 'memo.net.prof.p' },
      { code: NET_PROFILE },
      { h: 'memo.net.dns.h' },
      { p: 'memo.net.dns.p' },
      { code: NET_DNS },
      { h: 'memo.net.lcs.h' },
      { p: 'memo.net.lcs.p' },
      { code: NET_LCS },
      { h: 'memo.net.check.h' },
      {
        table: ['memo.col.cmd', 'memo.col.effect'],
        rows: [
          ['D TCPIP,,NETSTAT,HOME', { k: 'memo.net.c.home' }],
          ['D TCPIP,,NETSTAT,DEVLINKS', { k: 'memo.net.c.dev' }],
          ['D TCPIP,,NETSTAT,ROUTE', { k: 'memo.net.c.route' }],
          ['D TCPIP,,NETSTAT,CONN', { k: 'memo.net.c.conn' }],
          ['D U,,,0400,3', { k: 'memo.net.c.units' }],
        ],
      },
      { p: 'memo.net.ping.p' },
      { code: NET_PING },
    ],
  },
];

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function cell(tag, v, mono) {
  const c = el(tag);
  if (typeof v === 'object') c.innerHTML = t(v.k);
  else {
    c.textContent = v;
    if (mono) c.className = 'mono';
  }
  return c;
}

function codeBlock(text, job, onJob) {
  const box = el('div', 'memo-code');
  box.append(el('pre', 'mono', text));
  const bar = el('div', 'memo-code-bar');
  const copy = el('button', 'secondary small-button', t('memo.copy'));
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = t('memo.copied');
      setTimeout(() => { copy.textContent = t('memo.copy'); }, 1500);
    } catch { /* presse-papiers refusé */ }
  });
  bar.append(copy);
  if (job) {
    const b = el('button', 'small-button', t('memo.reader'));
    b.type = 'button';
    b.addEventListener('click', () => onJob(text));
    bar.append(b);
  }
  box.append(bar);
  return box;
}

function renderSection(sec, onJob) {
  const pane = el('div', 'memo-pane');
  pane.id = `memo-${sec.id}`;
  pane.setAttribute('role', 'tabpanel');
  for (const b of sec.blocks) {
    if (b.h) pane.append(el('h3', null, t(b.h)));
    else if (b.p) {
      const p = el('p');
      p.innerHTML = t(b.p);
      pane.append(p);
    } else if (b.ul || b.ol) {
      const list = el(b.ul ? 'ul' : 'ol');
      for (const k of b.ul ?? b.ol) {
        const li = el('li');
        li.innerHTML = t(k);
        list.append(li);
      }
      pane.append(list);
    } else if (b.table) {
      const wrap = el('div', 'memo-table');
      const table = el('table');
      const head = el('tr');
      for (const k of b.table) head.append(el('th', null, t(k)));
      table.append(head);
      for (const row of b.rows) {
        const tr = el('tr');
        row.forEach((v, i) => tr.append(cell('td', v, i === 0 || typeof v !== 'object')));
        table.append(tr);
      }
      wrap.append(table);
      pane.append(wrap);
    } else if (b.code) pane.append(codeBlock(b.code, b.job, onJob));
  }
  return pane;
}

/**
 * Prépare la fenêtre de l'aide-mémoire. `onJob(text)` reçoit un travail à mettre dans le
 * lecteur de cartes. Rend la fonction qui refait les textes (changement de langue).
 */
export function initMemo(dialog, onJob) {
  let current = 'cmds';
  const tabs = dialog.querySelector('.memo-tabs');
  const body = dialog.querySelector('.memo-body');
  function render() {
    tabs.replaceChildren();
    body.replaceChildren();
    for (const sec of SECTIONS) {
      const tab = el('button', 'memo-tab', t(`memo.tab.${sec.id}`));
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(sec.id === current));
      tab.setAttribute('aria-controls', `memo-${sec.id}`);
      tab.addEventListener('click', () => {
        current = sec.id;
        for (const b of tabs.children) b.setAttribute('aria-selected', String(b === tab));
        for (const p of body.children) p.hidden = p.id !== `memo-${sec.id}`;
        body.scrollTop = 0;
      });
      tabs.append(tab);
      const pane = renderSection(sec, onJob);
      pane.hidden = sec.id !== current;
      body.append(pane);
    }
  }
  render();
  dialog.querySelector('.memo-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  return render;
}
