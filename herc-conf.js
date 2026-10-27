// Fichiers de configuration de Hercules (https://sdl-hercules-390.github.io/html/hercconf.html) :
// lecture (paramètres du système, symboles, unités) et écriture de la configuration de la
// page. Seules les unités que l'émulateur sait faire sont gardées; le reste est signalé.

/** Familles d'unités émulées, d'après le type Hercules. */
const KINDS = {
  dasd: ['2311', '2314', '3330', '3340', '3350', '3375', '3380', '3390'],
  console: ['3215', '3215-C', '1052', '1052-C'],
  terminal: ['3270', '3277', '3278', '3279'],
  printer: ['1403', '3211', '1443', '3203'],
  reader: ['3505', '2540R', '2501', '1442'],
  punch: ['3525', '2540P'],
  tape: ['3410', '3420', '3422', '3430', '3480', '3490'],
  // Carte Ethernet (LAN Channel Station) : deux unités, lecture (paire) et écriture.
  lcs: ['LCS'],
  // OSA-Express en QDIO : trois unités, lecture, écriture, données.
  osa: ['QETH', 'OSA', 'OSD'],
};

export function kindOf(type) {
  const t = type.toUpperCase();
  for (const [k, list] of Object.entries(KINDS)) if (list.includes(t)) return k;
  return null;
}

/** Unités de TK5 (configuration par défaut de la page, sans les disques). */
export const TK5_DEVICES = [
  { addr: 0x009, kind: 'console', type: '3215-C' },
  { addr: 0x00C, kind: 'reader', type: '3505' },
  { addr: 0x10C, kind: 'reader', type: '3505' },
  { addr: 0x00D, kind: 'punch', type: '3525' },
  { addr: 0x10D, kind: 'punch', type: '3525' },
  { addr: 0x00E, kind: 'printer', type: '1403' },
  { addr: 0x00F, kind: 'printer', type: '1403' },
  { addr: 0x002, kind: 'printer', type: '3211' },
  { addr: 0x30E, kind: 'printer', type: '1403' },
  { addr: 0x480, kind: 'tape', type: '3420' },
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => ({ addr: 0x0C0 + i, kind: 'terminal', type: '3270' })),
];

/** Unités de la machine z/Architecture sans configuration importée (sans les disques) :
 *  lecteur (IPL de Linux), perforatrice, imprimante; la console est celle du système. */
export const Z_DEVICES = [
  { addr: 0x00C, kind: 'reader', type: '3505' },
  { addr: 0x00D, kind: 'punch', type: '3525' },
  { addr: 0x00E, kind: 'printer', type: '1403' },
];

/** Nom de volume d'un chemin : dernier élément, sans extension d'image ni d'adresse. */
export function volumeStem(path) {
  const base = path.replace(/\\/g, '/').split('/').pop();
  return base.replace(/\.(cckd|cckd64|ckd|cck|dasd|dsk|img|[0-9a-f]{3,4})$/i, '').toLowerCase();
}

/** Remplace $(X), ${X} et ${X:=défaut} (le défaut définit X s'il ne l'est pas). */
function substitute(text, syms) {
  return text.replace(/\$\{([A-Za-z0-9_]+)(?::=([^}]*))?\}|\$\(([A-Za-z0-9_]+)\)/g, (all, a, def, b) => {
    const name = (a ?? b).toUpperCase();
    if (!(name in syms) && def !== undefined) syms[name] = def;
    return syms[name] ?? '';
  });
}

/** Adresses d'une instruction d'unité : 0700, 0700-0704, 0700.5, 0700,0702, lcss:cuu. */
function addresses(spec) {
  const out = [];
  for (const part of spec.split(',')) {
    const p = part.replace(/^[0-9a-f]+:/i, '');
    let m;
    if ((m = /^([0-9a-f]{1,4})-([0-9a-f]{1,4})$/i.exec(p))) {
      for (let a = parseInt(m[1], 16); a <= parseInt(m[2], 16); a++) out.push(a);
    } else if ((m = /^([0-9a-f]{1,4})\.(\d+)$/i.exec(p))) {
      for (let i = 0; i < Number(m[2]); i++) out.push(parseInt(m[1], 16) + i);
    } else if (/^[0-9a-f]{1,4}$/i.test(p)) {
      out.push(parseInt(p, 16));
    } else {
      return null;
    }
  }
  return out;
}

/** Retire un commentaire de fin de ligne (« # » précédé d'un blanc, hors guillemets). */
function stripComment(line) {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') q = !q;
    if (!q && line[i] === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/**
 * Lit une configuration. Rend {system: {mainsize, numcpu, arch, …}, devices: [{addr, kind,
 * type, path, line}], ignored: [{line, text, why}], symbols}.
 */
export function parseConfig(text) {
  const syms = {};
  const system = {};
  const devices = [];
  const ignored = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((raw, i) => {
    const n = i + 1;
    if (/^\s*[#*]/.test(raw)) return;
    const line = stripComment(raw).trim();
    if (!line) return;
    const words = line.split(/\s+/);
    const head = words[0];
    // Unité : adresse hexadécimale (ou liste, plage) suivie d'un type.
    const addrs = /^[0-9a-f:.,-]+$/i.test(head) && words.length >= 2 ? addresses(head) : null;
    if (addrs) {
      const type = words[1].toUpperCase();
      const kind = kindOf(type);
      const args = substitute(words.slice(2).join(' '), syms);
      if (!kind) {
        ignored.push({ line: n, text: raw.trim(), why: 'device' });
        return;
      }
      if (kind === 'console' && /\bCONS\b/i.test(args) && type.startsWith('3270')) {
        ignored.push({ line: n, text: raw.trim(), why: 'device' });
        return;
      }
      const path = kind === 'dasd' ? (args.split(/\s+/)[0] ?? '') : '';
      // Fichiers d'ombre de Hercules (sf=shadow/zares1_*).
      const sf = kind === 'dasd' ? (/(?:^|\s)sf=(\S+)/i.exec(args)?.[1] ?? '') : '';
      for (const addr of addrs) devices.push({ addr, kind, type, path, sf, line: n });
      return;
    }
    const kw = head.toUpperCase();
    const rest = substitute(words.slice(1).join(' '), syms).trim();
    switch (kw) {
      case 'DEFSYM': {
        const [name, ...val] = rest.split(/\s+/);
        if (name) syms[name.toUpperCase()] = val.join(' ').replace(/^"(.*)"$/, '$1');
        break;
      }
      case 'MAINSIZE': system.mainsize = parseInt(rest, 10); break;
      case 'NUMCPU': system.numcpu = parseInt(rest, 10); break;
      case 'ARCHLVL': case 'ARCHMODE': system.arch = rest; break;
      case 'CPUMODEL': system.cpumodel = rest; break;
      case 'CPUSERIAL': system.cpuserial = rest; break;
      case 'CNSLPORT': system.cnslport = rest; break;
      // LOADPARM : un point tient lieu d'un blanc.
      case 'LOADPARM': system.loadparm = rest.replace(/\./g, ' ').trimEnd().toUpperCase(); break;
      case 'INCLUDE': case 'IGNORE':
        ignored.push({ line: n, text: raw.trim(), why: kw === 'INCLUDE' ? 'include' : 'statement' });
        break;
      default:
        // Paramètres sans effet ici (HTTP, PANTITLE, TZOFFSET, CCKD, priorités…).
        ignored.push({ line: n, text: raw.trim(), why: 'statement' });
    }
  });
  return { system, devices, ignored, symbols: syms };
}

const CU = { 3390: 'cu=3990', 3380: 'cu=3880', 3350: 'cu=3830' };
const hex4 = (a) => a.toString(16).toUpperCase().padStart(4, '0');

/**
 * Écrit une configuration Hercules : `volumes` [{file, addr, devtype}], `devices` (sans les
 * disques), `mem` (Mo). Chemins relatifs : dasd/, prt/, pch/ à côté du fichier (comme TK5).
 */
export function buildConfig({ mem, volumes, devices, version, arch = 's370' }) {
  const out = [
    '#' + '*'.repeat(78),
    `# Hercules configuration exported by the IBM System/370 emulator (VE2CUY) ${version}`,
    '# Copy the volume files (Disks menu, download icon) into dasd/ next to this file.',
    '#' + '*'.repeat(78),
    'CPUSERIAL 000611',
    arch === 'z' ? 'CPUMODEL  2064' : 'CPUMODEL  3033',
    `MAINSIZE  ${mem}`,
    'XPNDSIZE  0',
    'NUMCPU    1',
    'MAXCPU    1',
    arch === 'z' ? 'ARCHLVL   z/Arch' : 'ARCHLVL   S/370',
    'OSTAILOR  QUIET',
    'CNSLPORT  3270',
    'TZOFFSET  +0000',
    ...(arch === 'z' ? [] : ['DIAG8CMD  ENABLE ECHO']),
    '#',
    '# DASD',
    '#',
  ];
  for (const v of [...volumes].sort((a, b) => a.addr - b.addr)) {
    const t = v.devtype ?? '3390';
    out.push(`${hex4(v.addr)} ${t} dasd/${v.file}${CU[t] ? ` ${CU[t]}` : ''}`);
  }
  const groups = [['console', 'consoles'], ['reader', 'card readers'], ['punch', 'card punches'],
    ['printer', 'printers'], ['tape', 'tapes'], ['terminal', 'local 3270 terminals (VTAM)'], ['lcs', 'Ethernet (LCS)'], ['osa', 'Ethernet (OSA-Express, QDIO)']];
  for (const [kind, title] of groups) {
    // LCS, OSA : une instruction pour le groupe (première adresse).
    let list = devices.filter((d) => d.kind === kind).sort((a, b) => a.addr - b.addr);
    if (kind === 'lcs') list = list.filter((d) => d.addr % 2 === 0);
    if (kind === 'osa') list = list.slice(0, 1);
    if (!list.length) continue;
    out.push('#', `# ${title}`, '#');
    for (const d of list) {
      const a = hex4(d.addr);
      const low = a.toLowerCase();
      out.push({
        console: `${a} ${d.type}`,
        reader: d.addr === 0x00C ? `${a} ${d.type} \${RDRPORT:=3505} sockdev ascii trunc eof` : `${a} ${d.type} jcl/dummy eof ascii trunc`,
        punch: `${a} ${d.type} pch/pch${low.slice(1)}.txt ascii`,
        printer: `${a} ${d.type} prt/prt${low.slice(1)}.txt crlf`,
        tape: `${a} ${d.type} *`,
        terminal: `${a} ${d.type}`,
        lcs: `${a}.2 LCS`,
        osa: `${a}.3 QETH`,
      }[kind]);
    }
  }
  out.push('#', '# (end)', '');
  return out.join('\n');
}
