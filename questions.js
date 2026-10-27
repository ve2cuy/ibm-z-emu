// Questions de l'opérateur en attente (WTOR) : relevées dans la console (3215 de MVS,
// console du système en z/Architecture) et sur les écrans des consoles 3270, pour que la
// page les signale et propose une réponse, que l'usager peut changer avant de l'envoyer
// (aucune réponse n'est envoyée sans lui).
//
// Formes reconnues :
// - « *nn texte » : question numérotée (MVS 3.8j, consoles MCS), d'ordinaire
//   « *nn MSGID texte »;
// - « nn MSGID texte », MSGID finissant par D (ou $HASP098) : question numérotée de la
//   console du système;
// - « MSGID texte », MSGID finissant par D, sur un écran de console sans numéro (NIP : la
//   réponse se tape « R 00,… »).
// Une question est close par « IEE600I REPLY TO nn IS », par une réponse « R nn,… » vue
// après elle sur le même écran, ou par l'envoi de la réponse depuis la page.

/** Réponses habituelles proposées (l'usager les voit et peut les changer). */
const PROPOSALS = {
  IXC420D: 'I',    // initialiser le sysplex
  IFB010D: 'U',    // raison de l'IPL (LOGREC)
  BPXI078D: 'Y',   // zFS : arrêt
  IKT010D: 'SIC',  // TSO : arrêt avec usagers connectés
  IKT003D: 'RETRY', // TSO : TCAS démarré avant que VTAM soit prêt (code 0090)
};

const RE_STAR = /(?:^|\s)[*@](\d{1,4})\s+(\S+)\s*(.*)$/;
const RE_NUM = new RegExp(String.raw`^\s*(\d{1,4})\s+((?:[A-Z][A-Z0-9#@$]{2,4}\d{3,5}D)|\$HASP098)\b\s*(.*)$`);
const RE_NIP = /^\s*\|?\s*([A-Z][A-Z0-9#@$]{2,4}\d{3,5}D)\s+(.*)$/;
const RE_DONE = /IEE600I\s+REPLY\s+TO\s+(\d{1,4})\s+IS/;
const RE_REPLY = /^\s*R\s+(\d{1,4})\s*,/i;

export class Questions {
  constructor(onChange) {
    this.open = new Map();   // clé -> {key, id, msgid, text, src, addr, proposal}
    this.closed = new Map(); // numéro -> msgid (réponse déjà donnée)
    this.onChange = onChange;
    this.tail = '';          // reste d'une ligne de console pas encore finie
  }

  list() {
    return [...this.open.values()];
  }

  clear() {
    this.open.clear();
    this.closed.clear();
    this.tail = '';
    this.onChange?.([]);
  }

  /** Texte reçu de la console (`src` : 'console'). */
  console(text) {
    const lines = (this.tail + text).split('\n');
    this.tail = lines.pop();
    this.#scan(lines, { src: 'console', nip: false });
  }

  /** Écran d'un terminal (texte), s'il est une console (messages du système). */
  screen(addr, text) {
    if (!/IEE612I|IEA\d{3}[AIDE]\b|IXC\d{3}[AIDE]\b|\$HASP\d{3}/.test(text)) return;
    this.#scan(text.split('\n'), { src: 'term', addr, nip: true });
  }

  /** La réponse a été envoyée depuis la page. */
  answered(key) {
    const q = this.open.get(key);
    if (!q) return;
    this.open.delete(key);
    if (q.id !== null) this.closed.set(q.id, q.msgid);
    else this.closed.set(`nip:${q.addr}:${q.msgid}`, q.text);
    this.onChange?.(this.list());
  }

  #add(q) {
    const before = this.open.size;
    const key = q.id !== null ? `id:${q.id}` : `nip:${q.addr}:${q.msgid}`;
    const closedAs = this.closed.get(q.id !== null ? q.id : key);
    if (closedAs !== undefined && closedAs === (q.id !== null ? q.msgid : q.text)) return null;
    if (q.id !== null) this.closed.delete(q.id);
    const old = this.open.get(key);
    if (old && old.msgid === q.msgid) return key;
    this.open.set(key, { ...q, key, proposal: PROPOSALS[q.msgid] ?? '' });
    return this.open.size !== before || old ? key : null;
  }

  #close(id) {
    const q = this.open.get(`id:${id}`);
    if (q) {
      this.open.delete(`id:${id}`);
      this.closed.set(q.id, q.msgid);
    } else if (!this.closed.has(id)) this.closed.set(id, '');
  }

  #scan(lines, { src, addr = null, nip }) {
    const before = JSON.stringify(this.list().map((q) => q.key));
    const added = [];
    let nipOpen = null; // question sans numéro de cet écran, pas encore répondue
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m = RE_DONE.exec(line);
      if (m) {
        this.#close(m[1].padStart(2, '0'));
        continue;
      }
      m = RE_REPLY.exec(line);
      if (m) {
        if (nip && nipOpen) nipOpen = null;
        continue;
      }
      m = RE_STAR.exec(line) || RE_NUM.exec(line);
      if (m) {
        const id = m[1].padStart(2, '0');
        const k = this.#add({ id, msgid: m[2], text: `${m[2]} ${m[3]}`.trim() + more(lines, i), src, addr });
        if (k) added.push(k);
        continue;
      }
      if (nip) {
        m = RE_NIP.exec(line);
        if (m) nipOpen = { id: null, msgid: m[1], text: `${m[1]} ${m[2]}`.trim() + more(lines, i), src, addr };
      }
    }
    // Écran : la question sans numéro la plus récente reste ouverte tant qu'aucune
    // réponse ne la suit; les autres de cet écran sont closes.
    if (nip) {
      for (const [k, q] of this.open) {
        if (q.id === null && q.addr === addr && (!nipOpen || q.msgid !== nipOpen.msgid)) this.open.delete(k);
      }
      if (nipOpen) {
        const k = this.#add(nipOpen);
        if (k) added.push(k);
      }
    }
    if (JSON.stringify(this.list().map((q) => q.key)) !== before) this.onChange?.(this.list(), added);
  }
}

/** Lignes de suite d'un message (indentées, sans numéro ni identifiant). */
function more(lines, i) {
  let s = '';
  for (let k = i + 1; k < lines.length && k <= i + 3; k++) {
    const l = lines[k];
    if (!/^\s{3,}\S/.test(l) || RE_STAR.test(l) || RE_NUM.test(l) || RE_NIP.test(l) || RE_DONE.test(l)) break;
    s += ` ${l.trim()}`;
  }
  return s;
}

/** Texte de la réponse proposée : « R nn,réponse ». */
export function replyText(q) {
  return `R ${q.id ?? '00'},${q.proposal}`;
}
