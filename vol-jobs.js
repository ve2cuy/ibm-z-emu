// Gestionnaire de volumes, MVS en marche (étape 3 de docs/edition-volumes.md) : les
// modifications passent par des travaux que MVS exécute. Ce module écrit leur JCL (IEBGENER,
// IEHPROGM, IEBCOPY, IEFBR14, IDCAMS) et suit chaque travail : soumission au lecteur 00C,
// fin d'après la console ($HASP395, $HASP250), sortie en classe Z sur PRINTER2 (00F),
// codes de retour du journal du travail (IEFACTRT de TK5 : « RC= nnnn »).

export const JOB_PRINTER = 0x00F;
const TIMEOUT_MS = 5 * 60 * 1000;

let seq = 0;

/** Nom de travail unique : VM suivi de 6 caractères (base 36). */
export function jobName() {
  seq = (seq + 1) % 1296;
  const n = (Math.floor(Date.now() / 1000) % 1679616) * 1296 + seq;
  return `VM${n.toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;
}

/** Erreur « code|détail » (traduite par volumes.js). */
function fail(code, detail = '') {
  return new Error(`${code}|${detail}`);
}

/** Type d'unité pour UNIT= et VOL= (3390, 3380, 3350…). */
function unit(devtype) {
  return String(devtype ?? '3390').toUpperCase();
}

function jobCard(name, user, password, title) {
  return [
    `//${name.padEnd(8)} JOB (VM),'${title.slice(0, 20).replace(/'/g, '')}',CLASS=A,MSGCLASS=Z,`,
    `//             MSGLEVEL=(1,1),USER=${user},PASSWORD=${password}`,
  ];
}

/** Délimiteur de données en ligne qui n'apparaît pas en colonnes 1-2. */
function delimiter(lines) {
  for (const d of ['@@', '##', '$$', '%%', '¢¢', '!!']) {
    if (!lines.some((l) => l.startsWith(d))) return d;
  }
  throw fail('jobdata');
}

/** Lignes de données en ligne : 80 colonnes au plus, sans caractère hors Latin-1. */
function cards(text) {
  const body = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  const lines = body ? body.split('\n').map((l) => l.replace(/\t/g, '        ').trimEnd()) : [];
  lines.forEach((l, i) => {
    if (l.length > 80) throw fail('toolong', `${i + 1}:${l.length}:80`);
  });
  return lines;
}

/**
 * Instruction d'utilitaire (IEHPROGM…) : opérandes séparés par des virgules, colonnes 1 à
 * 71; une instruction plus longue continue sur la ligne suivante, en colonne 16, avec un
 * caractère non blanc en colonne 72.
 */
function utility(op, operands) {
  const lines = [];
  let cur = `  ${op} `;
  operands.forEach((o, i) => {
    const piece = o + (i < operands.length - 1 ? ',' : '');
    if (cur.length + piece.length > 71 && cur.trim() !== op) {
      lines.push(`${cur.padEnd(71)}X`);
      cur = ' '.repeat(15);
    }
    cur += piece;
  });
  lines.push(cur);
  return lines;
}

/** Commande IDCAMS : mots séparés par des blancs, colonnes 2 à 72; suite par « - ». */
function idcams(words) {
  const lines = [];
  let cur = ' ';
  for (const w of words) {
    if (cur.length + w.length + 3 > 71 && cur.trim()) {
      lines.push(`${cur} -`);
      cur = '   ';
    }
    cur += ` ${w}`;
  }
  lines.push(cur);
  return lines;
}

/** Remplace un membre (ou l'ajoute), ou le contenu d'un fichier séquentiel : IEBGENER. */
export function saveJcl({ name, user, password, dsn, member, text }) {
  const lines = cards(text);
  const dlm = delimiter(lines);
  const target = member ? `${dsn}(${member})` : dsn;
  return [
    ...jobCard(name, user, password, member ? `SAVE ${member}` : 'SAVE'),
    '//SAVE     EXEC PGM=IEBGENER',
    '//SYSPRINT DD SYSOUT=Z',
    '//SYSIN    DD DUMMY',
    `//SYSUT2   DD DISP=${member ? 'SHR' : 'OLD'},DSN=${target}`,
    `//SYSUT1   DD DATA,DLM='${dlm}'`,
    ...lines,
    dlm,
    '//',
  ].join('\n');
}

/** Supprime ou renomme un membre : IEHPROGM. */
export function memberJcl({ name, user, password, dsn, member, to, volser, devtype }) {
  const u = unit(devtype);
  const stmt = to
    ? utility('RENAME', [`DSNAME=${dsn}`, `VOL=${u}=${volser}`, `NEWNAME=${to}`, `MEMBER=${member}`])
    : utility('SCRATCH', [`DSNAME=${dsn}`, `VOL=${u}=${volser}`, `MEMBER=${member}`]);
  return [
    ...jobCard(name, user, password, to ? `REN ${member}` : `DEL ${member}`),
    '//PROGM    EXEC PGM=IEHPROGM',
    '//SYSPRINT DD SYSOUT=Z',
    `//DD1      DD UNIT=${u},VOL=SER=${volser},DISP=OLD`,
    '//SYSIN    DD *',
    ...stmt,
    '/*',
    '//',
  ].join('\n');
}

/** Compresse une bibliothèque : IEBCOPY. */
export function compressJcl({ name, user, password, dsn }) {
  return [
    ...jobCard(name, user, password, 'COMPRESS'),
    '//COMPRESS EXEC PGM=IEBCOPY',
    '//SYSPRINT DD SYSOUT=Z',
    '//SYSUT3   DD UNIT=SYSDA,SPACE=(TRK,(5,5))',
    '//SYSUT4   DD UNIT=SYSDA,SPACE=(TRK,(5,5))',
    `//PDS      DD DISP=OLD,DSN=${dsn}`,
    '//SYSIN    DD *',
    '  COPY INDD=PDS,OUTDD=PDS',
    '/*',
    '//',
  ].join('\n');
}

/** Crée et catalogue un fichier : IEFBR14. */
export function createJcl({ name, user, password, dsn, volser, devtype, dsorg, recfm, lrecl, blksize, spaceUnit, primary, secondary, dirBlocks }) {
  const u = unit(devtype);
  const space = dsorg === 'PO' ? `(${spaceUnit},(${primary},${secondary},${dirBlocks}))` : `(${spaceUnit},(${primary},${secondary}))`;
  return [
    ...jobCard(name, user, password, 'CREATE'),
    '//CREATE   EXEC PGM=IEFBR14',
    `//DD1      DD DSN=${dsn},DISP=(NEW,CATLG,DELETE),`,
    `//            UNIT=${u},VOL=SER=${volser},SPACE=${space},`,
    `//            DCB=(DSORG=${dsorg},RECFM=${recfm},LRECL=${lrecl},BLKSIZE=${blksize})`,
    '//',
  ].join('\n');
}

/** Supprime un fichier : IDCAMS (catalogué), sinon IEHPROGM (VTOC seulement). */
export function deleteJcl({ name, user, password, dsn, volser, devtype }) {
  const u = unit(devtype);
  return [
    ...jobCard(name, user, password, 'DELETE'),
    '//DELETE   EXEC PGM=IDCAMS',
    '//SYSPRINT DD SYSOUT=Z',
    '//SYSIN    DD *',
    ...idcams(['DELETE', `'${dsn}'`, 'NONVSAM']),
    '/*',
    // Pas catalogué (ou catalogué ailleurs) : effacé de la VTOC du volume.
    '//SCRATCH  EXEC PGM=IEHPROGM,COND=(0,EQ,DELETE)',
    '//SYSPRINT DD SYSOUT=Z',
    `//DD1      DD UNIT=${u},VOL=SER=${volser},DISP=OLD`,
    '//SYSIN    DD *',
    ...utility('SCRATCH', [`DSNAME=${dsn}`, `VOL=${u}=${volser}`, 'PURGE']),
    '/*',
    '//',
  ].join('\n');
}

/** Renomme un fichier : IEHPROGM (VTOC), puis le catalogue (IDCAMS). */
export function renameJcl({ name, user, password, dsn, to, volser, devtype }) {
  const u = unit(devtype);
  return [
    ...jobCard(name, user, password, 'RENAME'),
    '//RENAME   EXEC PGM=IEHPROGM',
    '//SYSPRINT DD SYSOUT=Z',
    `//DD1      DD UNIT=${u},VOL=SER=${volser},DISP=OLD`,
    '//SYSIN    DD *',
    ...utility('RENAME', [`DSNAME=${dsn}`, `VOL=${u}=${volser}`, `NEWNAME=${to}`]),
    '/*',
    '//CATALOG  EXEC PGM=IDCAMS,COND=(0,NE,RENAME)',
    '//SYSPRINT DD SYSOUT=Z',
    '//SYSIN    DD *',
    ...idcams(['DELETE', `'${dsn}'`, 'NOSCRATCH']),
    ...idcams(['DEFINE', 'NONVSAM', `(NAME('${to}')`, `DEVICETYPES(${u})`, `VOLUMES(${volser}))`]),
    '/*',
    '//',
  ].join('\n');
}

/** Liste des catalogues : IDCAMS LISTCAT (entrées et volumes), lu à l'imprimante 00F. */
export function listcatJcl({ name, user, password, level }) {
  return [
    ...jobCard(name, user, password, 'LISTCAT'),
    '//LISTCAT  EXEC PGM=IDCAMS',
    '//SYSPRINT DD SYSOUT=Z',
    '//SYSIN    DD *',
    ...idcams(level ? ['LISTCAT', `LEVEL(${level})`, 'VOLUME'] : ['LISTCAT', 'VOLUME']),
    '/*',
    '//',
  ].join('\n');
}

/**
 * Suivi des travaux : `submit(text)` dépose les cartes au lecteur; `console(text)` et
 * `printer(text)` reçoivent la console et l'imprimante 00F (main.js).
 */
export class JobTracker {
  constructor(submit) {
    this.submit = submit;
    this.jobs = new Map(); // nom -> {resolve, reject, out, ended, timer}
    this.printed = '';
  }

  /** Soumet `text` (travail `name`); rend {name, output, rcs, maxRc, abend, jclError}. */
  run(name, text) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.jobs.delete(name);
        reject(fail('jobtimeout', name));
      }, TIMEOUT_MS);
      this.jobs.set(name, { resolve, reject, timer, jclError: false, ended: false });
      this.submit(text);
    });
  }

  console(text) {
    for (const line of text.split('\n')) {
      for (const [name, job] of this.jobs) {
        if (!line.includes(name)) continue;
        if (/IEF452I|JCL ERROR/.test(line)) job.jclError = true;
        if (line.includes('$HASP395')) job.ended = true;
        // Sortie imprimée et retirée de la file. Le texte de l'imprimante peut arriver
        // après la console : on attend la page de séparation de fin du travail (5 s au plus).
        if (line.includes('$HASP250') && job.ended && !job.purged) {
          job.purged = true;
          job.deadline = Date.now() + 5000;
          job.poll = setInterval(() => this.check(name), 200);
          this.check(name);
        }
      }
    }
  }

  printer(text) {
    this.printed = (this.printed + text).slice(-4_000_000);
    for (const [name, job] of this.jobs) if (job.purged) this.check(name);
  }

  /** Sortie complète (séparateur « END JOB … nom ») ou délai passé : travail fini. */
  check(name) {
    const job = this.jobs.get(name);
    if (!job) return;
    if (new RegExp(`END\\s+JOB\\s+\\d+\\s+${name}`).test(this.printed) || Date.now() > job.deadline) this.finish(name);
  }

  finish(name) {
    const job = this.jobs.get(name);
    if (!job) return;
    clearTimeout(job.timer);
    clearInterval(job.poll);
    this.jobs.delete(name);
    // Sortie de ce travail : de la première page qui porte son nom (séparateur de début)
    // à la page de séparation de fin.
    const mine = [];
    let inJob = false;
    for (const p of this.printed.split('\f')) {
      if (p.includes(name)) inJob = true;
      if (inJob) mine.push(p);
      if (inJob && new RegExp(`END\\s+JOB\\s+\\d+\\s+${name}`).test(p)) break;
    }
    const output = mine.join('\f');
    const rcs = [...output.matchAll(new RegExp(`${name}\\s+(\\S+)\\s+(?:(\\S+)\\s+)?(\\S+)\\s+RC=\\s*(\\d+)`, 'g'))]
      .map((m) => ({ step: m[1], program: m[3], rc: Number(m[4]) }));
    const abend = /ABEND|AB\s+[SU][0-9A-F]{3}/.test(output.split('\n').filter((l) => l.includes(name)).join('\n'));
    const maxRc = rcs.reduce((a, r) => Math.max(a, r.rc), 0);
    job.resolve({ name, output, rcs, maxRc, abend, jclError: job.jclError });
  }
}
