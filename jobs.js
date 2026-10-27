// Sortie d'une imprimante découpée par travail, d'après les pages de séparation de JES2 :
// lignes « ****A  START  JOB   21  HELLO1 … » et « ****A   END   JOB   21  HELLO1 … »
// (MVS 3.8j; z/OS : numéro écrit JOB00021). Un travail va du début de la page de son START
// à la fin de la page de son END (pages de séparation comprises); un travail encore en
// cours d'impression va jusqu'à la fin de la sortie.

const SEP = /^\*{4}[A-Z0-9]\s+(START|END)\s+(JOB|STC|TSU)\s*0*(\d+)\s+(\S+)/m;

/** Travaux de `text` : [{key, kind, num, name, start, end, open}] (positions dans le texte). */
export function splitJobs(text) {
  const jobs = [];
  let cur = null;
  let lastEnd = 0;
  let pos = 0;
  for (const page of text.split('\f')) {
    const start = pos;
    const end = pos + page.length;
    pos = end + 1;
    const m = SEP.exec(page);
    if (!m) continue;
    const [, what, kind, num, name] = m;
    const key = `${kind}${num}:${name}`;
    if (what === 'START') {
      if (!cur || cur.key !== key) {
        if (cur) {
          cur.end = start;
          cur.open = false;
        }
        cur = { key, kind, num: Number(num), name, start, end: text.length, open: true };
        jobs.push(cur);
      }
    } else if (cur && cur.key === key) {
      cur.end = end;
      cur.open = false;
      lastEnd = end;
      cur = null;
    } else {
      // Fin sans début vu (sortie coupée) : depuis le travail précédent.
      jobs.push({ key, kind, num: Number(num), name, start: lastEnd, end, open: false });
      lastEnd = end;
    }
  }
  return jobs;
}

/** Nombre de pages (sauts de page) d'un morceau de sortie. */
export function pageCount(text) {
  return text.split('\f').filter((p) => p.trim()).length;
}
