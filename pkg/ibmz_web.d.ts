/* tslint:disable */
/* eslint-disable */

export class Emulator {
    free(): void;
    [Symbol.dispose](): void;
    attach_console(addr: number): void;
    /**
     * Branche un disque CKD (image de Hercules) à l'adresse `addr`. Rend
     * « type cylindres volume ».
     */
    attach_dasd(addr: number, disk: any): string;
    attach_printer(addr: number, devtype: number): void;
    attach_punch(addr: number): void;
    attach_reader(addr: number): void;
    attach_tape(addr: number): void;
    attach_terminal(addr: number, rows: number, cols: number, alt_rows: number, alt_cols: number): void;
    console_take(addr: number): string;
    console_type(addr: number, line: string): void;
    /**
     * Commandes de Hercules reçues par DIAGNOSE X'008' (une par ligne), depuis le dernier
     * appel. TK5 s'en sert pour son arrêt (« script scripts/shutdown »).
     */
    diag8_take(): string;
    /**
     * Erreur d'entrée-sortie d'une image (dernière), ou vide.
     */
    disk_error(): string;
    /**
     * Écrit tout de suite les pistes modifiées.
     */
    flush(): void;
    /**
     * Touche INTERRUPT du pupitre (interruption externe, touche d'interruption).
     */
    interrupt_key(): void;
    /**
     * Entrées-sorties faites depuis le démarrage.
     */
    io_count(): number;
    /**
     * IPL depuis l'unité `addr`.
     */
    ipl(addr: number): boolean;
    /**
     * `mem_mb` : mémoire centrale (Mo, 1 à 16); `unix_secs` : heure de l'horloge TOD.
     */
    constructor(mem_mb: number, unix_secs: number);
    /**
     * Temps simulé (ms).
     */
    now_ms(): number;
    printer_take(addr: number): string;
    /**
     * PSW courant (16 chiffres hexadécimaux).
     */
    psw(): string;
    reader_left(addr: number): number;
    /**
     * Dépose un paquet de cartes (texte, une carte par ligne) dans le lecteur.
     */
    reader_load(addr: number, text: string): boolean;
    /**
     * Touche RESTART du pupitre.
     */
    restart(): void;
    /**
     * Avance de `ms` millisecondes simulées (au plus `max_inst` instructions). Rend
     * « run », « stopped » (attente définitive) ou « loop ».
     */
    run(ms: number, max_inst: number): string;
    /**
     * Durée simulée d'une instruction (ns) : règle la vitesse apparente du processeur.
     */
    set_ns_per_inst(ns: number): void;
    /**
     * Voyants d'activité : masque des classes d'unités qui ont reçu un SIO depuis le
     * dernier appel (1 disques, 2 imprimantes, 4 lecteurs, 8 perforatrices).
     */
    take_activity(): number;
    take_instructions(): number;
    /**
     * Caractère tapé. Faux s'il est refusé (champ protégé, clavier verrouillé).
     */
    term_char(addr: number, ch: string): boolean;
    /**
     * Clic : place le curseur.
     */
    term_click(addr: number, pos: number): void;
    /**
     * Un client TN3270 (par le relais) prend le terminal : rend l'écran courant à lui
     * envoyer (enregistrement 3270).
     */
    term_connect(addr: number): Uint8Array;
    /**
     * Le client TN3270 est parti.
     */
    term_disconnect(addr: number): void;
    /**
     * Enregistrement reçu du client TN3270.
     */
    term_input(addr: number, rec: Uint8Array): void;
    /**
     * Touche spéciale : Enter, Clear, PA1-PA3, PF1-PF24, Tab, BackTab, Home, NewLine,
     * Left, Right, Up, Down, Backspace, Delete, EraseEOF, Insert, Reset.
     */
    term_key(addr: number, key: string): void;
    /**
     * Prochain enregistrement à envoyer au client TN3270 (vide : aucun).
     */
    term_outbound(addr: number): Uint8Array;
    /**
     * Le terminal est tenu par un client TN3270.
     */
    term_remote(addr: number): boolean;
    /**
     * Écran : rangées, colonnes, curseur (2 octets), état (bit 0 verrouillé, 1 insertion,
     * 2 alarme), puis deux octets par position : caractère (Latin-1) et style (bits 0-2
     * couleur 1-7, ou 0 : vert clair d'un 3278 monochrome, 3-4 surbrillance 1 inverse 2 souligné 3 clignotant, 5 intense,
     * 6 attribut de champ, 7 saisissable).
     */
    term_render(addr: number): Uint8Array;
    /**
     * Texte de l'écran (copier).
     */
    term_text(addr: number): string;
    /**
     * Compteur de changements de l'écran (pour redessiner seulement au besoin).
     */
    term_version(addr: number): number;
    /**
     * Gestionnaire de volumes, machine en marche : opération de lecture `op` (voir
     * `vol_op`) sur le volume de l'unité `addr`, par l'image que la machine tient (piste
     * modifiée écrite d'abord). Rend du JSON.
     */
    vol_call(addr: number, op: string, dsn: string, member: string, limit: number): string;
    /**
     * Octets bruts (blocs à la suite) d'un fichier ou d'un membre, machine en marche.
     */
    vol_raw(addr: number, dsn: string, member: string, limit: number): Uint8Array;
    /**
     * Écriture directe, machine en marche : refusée (MVS réécrirait par-dessus).
     */
    vol_write(): string;
    /**
     * Le processeur attend (PSW d'attente).
     */
    waiting(): boolean;
}

/**
 * Volume ouvert par la page quand la machine est arrêtée (`www/vol-worker.js`).
 */
export class VolumeImage {
    free(): void;
    [Symbol.dispose](): void;
    call(op: string, dsn: string, member: string, limit: number): string;
    constructor(disk: any);
    raw(dsn: string, member: string, limit: number): Uint8Array;
    write(op: string, dsn: string, member: string, text: string, to: string, user: string, changed: number, stamp: Uint16Array, bin: Uint8Array): string;
}

/**
 * Volume vierge (VOL1, VTOC) : image CCKD de `cyls` cylindres pour 3390, 3380 ou 3350.
 */
export function blank_volume(devtype: number, cyls: number, volser: string): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_emulator_free: (a: number, b: number) => void;
    readonly __wbg_volumeimage_free: (a: number, b: number) => void;
    readonly blank_volume: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly emulator_attach_console: (a: number, b: number) => void;
    readonly emulator_attach_dasd: (a: number, b: number, c: any) => [number, number, number, number];
    readonly emulator_attach_printer: (a: number, b: number, c: number) => void;
    readonly emulator_attach_punch: (a: number, b: number) => void;
    readonly emulator_attach_reader: (a: number, b: number) => void;
    readonly emulator_attach_tape: (a: number, b: number) => void;
    readonly emulator_attach_terminal: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly emulator_console_take: (a: number, b: number) => [number, number];
    readonly emulator_console_type: (a: number, b: number, c: number, d: number) => void;
    readonly emulator_diag8_take: (a: number) => [number, number];
    readonly emulator_disk_error: (a: number) => [number, number];
    readonly emulator_flush: (a: number) => void;
    readonly emulator_interrupt_key: (a: number) => void;
    readonly emulator_io_count: (a: number) => number;
    readonly emulator_ipl: (a: number, b: number) => number;
    readonly emulator_new: (a: number, b: number) => number;
    readonly emulator_now_ms: (a: number) => number;
    readonly emulator_printer_take: (a: number, b: number) => [number, number];
    readonly emulator_psw: (a: number) => [number, number];
    readonly emulator_reader_left: (a: number, b: number) => number;
    readonly emulator_reader_load: (a: number, b: number, c: number, d: number) => number;
    readonly emulator_restart: (a: number) => void;
    readonly emulator_run: (a: number, b: number, c: number) => [number, number];
    readonly emulator_set_ns_per_inst: (a: number, b: number) => void;
    readonly emulator_take_activity: (a: number) => number;
    readonly emulator_take_instructions: (a: number) => number;
    readonly emulator_term_char: (a: number, b: number, c: number, d: number) => number;
    readonly emulator_term_click: (a: number, b: number, c: number) => void;
    readonly emulator_term_connect: (a: number, b: number) => [number, number];
    readonly emulator_term_disconnect: (a: number, b: number) => void;
    readonly emulator_term_input: (a: number, b: number, c: number, d: number) => void;
    readonly emulator_term_key: (a: number, b: number, c: number, d: number) => void;
    readonly emulator_term_outbound: (a: number, b: number) => [number, number];
    readonly emulator_term_remote: (a: number, b: number) => number;
    readonly emulator_term_render: (a: number, b: number) => [number, number];
    readonly emulator_term_text: (a: number, b: number) => [number, number];
    readonly emulator_term_version: (a: number, b: number) => number;
    readonly emulator_vol_call: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
    readonly emulator_vol_raw: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly emulator_vol_write: (a: number) => [number, number, number, number];
    readonly emulator_waiting: (a: number) => number;
    readonly volumeimage_call: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly volumeimage_new: (a: any) => [number, number, number];
    readonly volumeimage_raw: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly volumeimage_write: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
