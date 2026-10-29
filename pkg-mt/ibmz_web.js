export class Emulator {
    static __wrap(ptr) {
        const obj = Object.create(Emulator.prototype);
        obj.__wbg_ptr = ptr;
        EmulatorFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        EmulatorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_emulator_free(ptr, 0);
    }
    /**
     * « s370 » ou « z ».
     * @returns {string}
     */
    arch() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.emulator_arch(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} addr
     */
    attach_console(addr) {
        wasm.emulator_attach_console(this.__wbg_ptr, addr);
    }
    /**
     * Branche un disque CKD (image de Hercules) à l'adresse `addr`. Rend
     * « type cylindres volume ».
     * @param {number} addr
     * @param {any} disk
     * @returns {string}
     */
    attach_dasd(addr, disk) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.emulator_attach_dasd(this.__wbg_ptr, addr, disk);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Carte Ethernet LCS : lecture à `addr` (pair), écriture à `addr + 1`. `mac` : 6
     * octets, ou vide (02-49-42-4D et le numéro de l'unité).
     * @param {number} addr
     * @param {Uint8Array} mac
     */
    attach_lcs(addr, mac) {
        const ptr0 = passArray8ToWasm0(mac, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.emulator_attach_lcs(this.__wbg_ptr, addr, ptr0, len0);
    }
    /**
     * Adaptateur OSA-Express en QDIO : lecture à `addr`, écriture à `addr + 1`, données à
     * `addr + 2`. `mac` : 6 octets, ou vide (02-49-42-4D et le numéro de l'unité).
     * @param {number} addr
     * @param {Uint8Array} mac
     */
    attach_osa(addr, mac) {
        const ptr0 = passArray8ToWasm0(mac, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.emulator_attach_osa(this.__wbg_ptr, addr, ptr0, len0);
    }
    /**
     * @param {number} addr
     * @param {number} devtype
     */
    attach_printer(addr, devtype) {
        wasm.emulator_attach_printer(this.__wbg_ptr, addr, devtype);
    }
    /**
     * @param {number} addr
     */
    attach_punch(addr) {
        wasm.emulator_attach_punch(this.__wbg_ptr, addr);
    }
    /**
     * @param {number} addr
     */
    attach_reader(addr) {
        wasm.emulator_attach_reader(this.__wbg_ptr, addr);
    }
    /**
     * Dérouleur de bande (3420, 3480, 3490…), sans bande.
     * @param {number} addr
     * @param {number} devtype
     */
    attach_tape(addr, devtype) {
        wasm.emulator_attach_tape(this.__wbg_ptr, addr, devtype);
    }
    /**
     * @param {number} addr
     * @param {number} rows
     * @param {number} cols
     * @param {number} alt_rows
     * @param {number} alt_cols
     */
    attach_terminal(addr, rows, cols, alt_rows, alt_cols) {
        wasm.emulator_attach_terminal(this.__wbg_ptr, addr, rows, cols, alt_rows, alt_cols);
    }
    /**
     * Reprise : l'horloge du système remise à l'heure `unix_ms` (temps passé en veille
     * compté, minuteries des processeurs non). Rend l'avance en secondes (0 : l'horloge
     * était déjà à l'heure ou en avance).
     * @param {number} unix_ms
     * @returns {number}
     */
    clock_to_now(unix_ms) {
        const ret = wasm.emulator_clock_to_now(this.__wbg_ptr, unix_ms);
        return ret;
    }
    /**
     * @param {number} addr
     * @returns {string}
     */
    console_take(addr) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.emulator_console_take(this.__wbg_ptr, addr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Ligne de l'opérateur. Faux si le système ne la reçoit pas (z/Architecture : le
     * système n'accepte pas encore les commandes).
     * @param {number} addr
     * @param {string} line
     * @returns {boolean}
     */
    console_type(addr, line) {
        const ptr0 = passStringToWasm0(line, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.emulator_console_type(this.__wbg_ptr, addr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Commandes de Hercules reçues par DIAGNOSE X'008' (une par ligne), depuis le dernier
     * appel. TK5 s'en sert pour son arrêt (« script scripts/shutdown »).
     * @returns {string}
     */
    diag8_take() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.emulator_diag8_take(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Erreur d'entrée-sortie d'une image (dernière), ou vide.
     * @returns {string}
     */
    disk_error() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.emulator_disk_error(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Événements pour l'onglet Moniteur depuis le dernier appel, un par ligne
     * (« clé|valeur|… »).
     * @returns {string}
     */
    events_take() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.emulator_events_take(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Écrit tout de suite les pistes modifiées.
     */
    flush() {
        wasm.emulator_flush(this.__wbg_ptr);
    }
    /**
     * Touche INTERRUPT du pupitre (interruption externe, touche d'interruption).
     */
    interrupt_key() {
        wasm.emulator_interrupt_key(this.__wbg_ptr);
    }
    /**
     * Adresse de la sonnette du fil des E-S dans la mémoire partagée (`Int32Array`).
     * @returns {number}
     */
    io_bell_addr() {
        const ret = wasm.emulator_io_bell_addr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Entrées-sorties faites depuis le démarrage.
     * @returns {number}
     */
    io_count() {
        const ret = wasm.emulator_io_count(this.__wbg_ptr);
        return ret;
    }
    /**
     * Délai (ms) jusqu'à la prochaine échéance des E-S (`Infinity` : aucune).
     * @returns {number}
     */
    io_next_ms() {
        const ret = wasm.emulator_io_next_ms(this.__wbg_ptr);
        return ret;
    }
    /**
     * Fil des E-S (un fil par processeur) : programmes de canal en attente, unités, fins
     * d'E-S.
     */
    io_service() {
        wasm.emulator_io_service(this.__wbg_ptr);
    }
    /**
     * IPL depuis l'unité `addr`. Le moniteur reçoit le résultat : « ipl.ok|adresse|PSW »,
     * « ipl.nodev|adresse » ou « ipl.fail|adresse|état de l'unité|état du canal ».
     * @param {number} addr
     * @returns {boolean}
     */
    ipl(addr) {
        const ret = wasm.emulator_ipl(this.__wbg_ptr, addr);
        return ret !== 0;
    }
    /**
     * Trames Ethernet émises par le système depuis le dernier appel (carte LCS ou OSA
     * d'adresse `addr`), chacune précédée
     * de sa longueur (2 octets, gros-boutiste); vide s'il n'y en a pas.
     * @param {number} addr
     * @returns {Uint8Array}
     */
    lcs_outbound(addr) {
        const ret = wasm.emulator_lcs_outbound(this.__wbg_ptr, addr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Trame Ethernet du réseau pour le système (gardée si elle est pour lui et que le
     * système a démarré son réseau). Le programme de lecture en attente reprend au
     * prochain relevé des E-S.
     * @param {number} addr
     * @param {Uint8Array} frame
     * @returns {boolean}
     */
    lcs_receive(addr, frame) {
        const ptr0 = passArray8ToWasm0(frame, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.emulator_lcs_receive(this.__wbg_ptr, addr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * État de la carte : « adresse de station|réseau démarré (0/1)|émises|reçues|perdues »,
     * ou vide (pas de carte).
     * @param {number} addr
     * @returns {string}
     */
    lcs_status(addr) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.emulator_lcs_status(this.__wbg_ptr, addr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Volume lu sur place (fichier du disque de l'usager, lecture seule) : l'image de
     * Hercules d'abord, puis ses ombres dans l'ordre de création (`mount_shadow`), puis
     * l'ombre de la page (`mount_finish`), où vont les écritures.
     * @param {any} disk
     */
    mount_begin(disk) {
        const ret = wasm.emulator_mount_begin(this.__wbg_ptr, disk);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Branche le volume monté à l'adresse `addr`, avec l'ombre de la page `overlay`
     * (fichier de l'OPFS, vide la première fois). Rend « type cylindres volume pistes »,
     * pistes : celles que l'ombre de la page garde déjà.
     * @param {number} addr
     * @param {any} overlay
     * @returns {string}
     */
    mount_finish(addr, overlay) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.emulator_mount_finish(this.__wbg_ptr, addr, overlay);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {any} disk
     */
    mount_shadow(disk) {
        const ret = wasm.emulator_mount_shadow(this.__wbg_ptr, disk);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Machine z/Architecture : `mem_mb` de 16 Mo à 2 Go.
     * @param {number} mem_mb
     * @param {number} unix_secs
     * @returns {Emulator}
     */
    static newZ(mem_mb, unix_secs) {
        const ret = wasm.emulator_newZ(mem_mb, unix_secs);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Emulator.__wrap(ret[0]);
    }
    /**
     * Machine S/370 : `mem_mb` : mémoire centrale (Mo, 1 à 16); `unix_secs` : heure de
     * l'horloge TOD.
     * @param {number} mem_mb
     * @param {number} unix_secs
     */
    constructor(mem_mb, unix_secs) {
        const ret = wasm.emulator_new(mem_mb, unix_secs);
        this.__wbg_ptr = ret;
        EmulatorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Temps simulé (ms).
     * @returns {number}
     */
    now_ms() {
        const ret = wasm.emulator_now_ms(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} addr
     * @returns {string}
     */
    printer_take(addr) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.emulator_printer_take(this.__wbg_ptr, addr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * PSW courant (16 chiffres hexadécimaux; 32 en z/Architecture).
     * @returns {string}
     */
    psw() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.emulator_psw(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} addr
     * @returns {number}
     */
    reader_left(addr) {
        const ret = wasm.emulator_reader_left(this.__wbg_ptr, addr);
        return ret >>> 0;
    }
    /**
     * Dépose un paquet de cartes (texte, une carte par ligne) dans le lecteur.
     * @param {number} addr
     * @param {string} text
     * @returns {boolean}
     */
    reader_load(addr, text) {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.emulator_reader_load(this.__wbg_ptr, addr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Dépose un fichier binaire (cartes de 80 octets, puis une fin de fichier) : noyau,
     * paramètres et image initiale de Linux, chargés par l'IPL du lecteur.
     * @param {number} addr
     * @param {Uint8Array} data
     * @returns {boolean}
     */
    reader_load_binary(addr, data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.emulator_reader_load_binary(this.__wbg_ptr, addr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Touche RESTART du pupitre.
     */
    restart() {
        wasm.emulator_restart(this.__wbg_ptr);
    }
    /**
     * Reprise d'une session suspendue, machine neuve aux mêmes unités, avant tout IPL : un
     * morceau du flux (décomprimé). Erreur « code|détail » (traduite par la page).
     * @param {Uint8Array} data
     */
    restore_feed(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.emulator_restore_feed(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Fin de la reprise : tout ce qui est indispensable a été lu. Le moniteur reçoit
     * « resume|PSW ».
     */
    restore_finish() {
        const ret = wasm.emulator_restore_finish(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Avance de `ms` millisecondes simulées (au plus `max_inst` instructions). Rend
     * « run », « stopped » (attente définitive) ou « loop ».
     * @param {number} ms
     * @param {number} max_inst
     * @returns {string}
     */
    run(ms, max_inst) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.emulator_run(this.__wbg_ptr, ms, max_inst);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Nombre de processeurs (z/Architecture, avant l'IPL).
     * @param {number} n
     */
    set_cpus(n) {
        wasm.emulator_set_cpus(this.__wbg_ptr, n);
    }
    /**
     * LOADPARM de l'IPL (z/Architecture).
     * @param {string} text
     */
    set_loadparm(text) {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.emulator_set_loadparm(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Durée simulée d'une instruction (ns) : règle la vitesse apparente du processeur.
     * Plusieurs processeurs : l'hôte se partage entre eux, une instruction de chacun vaut
     * donc n fois plus de temps simulé (le temps simulé suit le temps réel).
     * @param {number} ns
     */
    set_ns_per_inst(ns) {
        wasm.emulator_set_ns_per_inst(this.__wbg_ptr, ns);
    }
    /**
     * Début de la mise en veille : blocs de l'état (sans la mémoire), à écrire d'abord.
     * Un fil par processeur : les fils doivent avoir fini (`stop_threads`, puis
     * `threads_done`); la machine revient alors à un seul fil (`start_threads` la relance).
     * @returns {Uint8Array}
     */
    snap_begin() {
        const ret = wasm.emulator_snap_begin(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Fin du flux de la mise en veille.
     * @returns {Uint8Array}
     */
    snap_end() {
        const ret = wasm.emulator_snap_end(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Bloc de mémoire `i` à écrire (vide s'il est nul).
     * @param {number} i
     * @returns {Uint8Array}
     */
    snap_mem(i) {
        const ret = wasm.emulator_snap_mem(this.__wbg_ptr, i);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Nombre de blocs de mémoire (1 Mo) : `snap_mem(0)` à `snap_mem(n - 1)`.
     * @returns {number}
     */
    snap_mem_count() {
        const ret = wasm.emulator_snap_mem_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Un fil par processeur (z/Architecture, plusieurs processeurs, après l'IPL) : rend
     * l'adresse de la machine à donner à `cpu_thread` dans chaque Web Worker de
     * processeur, ou 0 si ce n'est pas possible.
     * @returns {number}
     */
    start_threads() {
        const ret = wasm.emulator_start_threads(this.__wbg_ptr);
        return ret;
    }
    /**
     * Arrêt des fils des processeurs (avant `free`); `threads_done` dit quand c'est fait.
     */
    stop_threads() {
        wasm.emulator_stop_threads(this.__wbg_ptr);
    }
    /**
     * Voyants d'activité : masque des classes d'unités qui ont reçu un SIO depuis le
     * dernier appel (1 disques, 2 imprimantes, 4 lecteurs, 8 perforatrices).
     * @returns {number}
     */
    take_activity() {
        const ret = wasm.emulator_take_activity(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    take_instructions() {
        const ret = wasm.emulator_take_instructions(this.__wbg_ptr);
        return ret;
    }
    /**
     * Monte une bande (image AWS ou HET) sur l'unité `addr`; `read_only` : sans anneau
     * d'écriture. Rend le nombre de blocs.
     * @param {number} addr
     * @param {any} disk
     * @param {string} name
     * @param {boolean} read_only
     * @returns {number}
     */
    tape_mount(addr, disk, name, read_only) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.emulator_tape_mount(this.__wbg_ptr, addr, disk, ptr0, len0, read_only);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Reprise d'une session : nom de la bande qui était montée (à remonter), ou vide.
     * @param {number} addr
     * @returns {string}
     */
    tape_pending(addr) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.emulator_tape_pending(this.__wbg_ptr, addr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Reprise d'une session : la bande remontée à sa position, sans signal au système.
     * @param {number} addr
     * @param {any} disk
     */
    tape_remount(addr, disk) {
        const ret = wasm.emulator_tape_remount(this.__wbg_ptr, addr, disk);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * État de l'unité : « nom|position|blocs|lecture seule (0/1)|déchargée (0/1) », ou
     * vide (pas d'unité de bande).
     * @param {number} addr
     * @returns {string}
     */
    tape_status(addr) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.emulator_tape_status(this.__wbg_ptr, addr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Démonte la bande de l'unité `addr`.
     * @param {number} addr
     */
    tape_unmount(addr) {
        wasm.emulator_tape_unmount(this.__wbg_ptr, addr);
    }
    /**
     * Caractère tapé. Faux s'il est refusé (champ protégé, clavier verrouillé).
     * @param {number} addr
     * @param {string} ch
     * @returns {boolean}
     */
    term_char(addr, ch) {
        const ptr0 = passStringToWasm0(ch, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.emulator_term_char(this.__wbg_ptr, addr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Clic : place le curseur.
     * @param {number} addr
     * @param {number} pos
     */
    term_click(addr, pos) {
        wasm.emulator_term_click(this.__wbg_ptr, addr, pos);
    }
    /**
     * Un client TN3270 (par le relais) prend le terminal : rend l'écran courant à lui
     * envoyer (enregistrement 3270).
     * @param {number} addr
     * @returns {Uint8Array}
     */
    term_connect(addr) {
        const ret = wasm.emulator_term_connect(this.__wbg_ptr, addr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Le client TN3270 est parti.
     * @param {number} addr
     */
    term_disconnect(addr) {
        wasm.emulator_term_disconnect(this.__wbg_ptr, addr);
    }
    /**
     * Écritures du système sur le terminal (journal de la page).
     * @param {number} addr
     * @returns {number}
     */
    term_host_writes(addr) {
        const ret = wasm.emulator_term_host_writes(this.__wbg_ptr, addr);
        return ret;
    }
    /**
     * Enregistrement reçu du client TN3270.
     * @param {number} addr
     * @param {Uint8Array} rec
     */
    term_input(addr, rec) {
        const ptr0 = passArray8ToWasm0(rec, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.emulator_term_input(this.__wbg_ptr, addr, ptr0, len0);
    }
    /**
     * Touche spéciale : Enter, Clear, PA1-PA3, PF1-PF24, Tab, BackTab, Home, NewLine,
     * Left, Right, Up, Down, Backspace, Delete, EraseEOF, Insert, Reset.
     * @param {number} addr
     * @param {string} key
     */
    term_key(addr, key) {
        const ptr0 = passStringToWasm0(key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.emulator_term_key(this.__wbg_ptr, addr, ptr0, len0);
    }
    /**
     * Prochain enregistrement à envoyer au client TN3270 (vide : aucun).
     * @param {number} addr
     * @returns {Uint8Array}
     */
    term_outbound(addr) {
        const ret = wasm.emulator_term_outbound(this.__wbg_ptr, addr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Le terminal est tenu par un client TN3270.
     * @param {number} addr
     * @returns {boolean}
     */
    term_remote(addr) {
        const ret = wasm.emulator_term_remote(this.__wbg_ptr, addr);
        return ret !== 0;
    }
    /**
     * Écran : rangées, colonnes, curseur (2 octets), état (bit 0 verrouillé, 1 insertion,
     * 2 alarme), puis deux octets par position : caractère (Latin-1) et style (bits 0-2
     * couleur 1-7, ou 0 : vert clair d'un 3278 monochrome, 3-4 surbrillance 1 inverse 2 souligné 3 clignotant, 5 intense,
     * 6 attribut de champ, 7 saisissable).
     * @param {number} addr
     * @returns {Uint8Array}
     */
    term_render(addr) {
        const ret = wasm.emulator_term_render(this.__wbg_ptr, addr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Texte de l'écran (copier).
     * @param {number} addr
     * @returns {string}
     */
    term_text(addr) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.emulator_term_text(this.__wbg_ptr, addr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Compteur de changements de l'écran (pour redessiner seulement au besoin).
     * @param {number} addr
     * @returns {number}
     */
    term_version(addr) {
        const ret = wasm.emulator_term_version(this.__wbg_ptr, addr);
        return ret;
    }
    /**
     * Nombre de fils de processeurs (0 : un seul fil).
     * @returns {number}
     */
    threads() {
        const ret = wasm.emulator_threads(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {boolean}
     */
    threads_done() {
        const ret = wasm.emulator_threads_done(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Gestionnaire de volumes, machine en marche : opération de lecture `op` (voir
     * `vol_op`) sur le volume de l'unité `addr`, par l'image que la machine tient (piste
     * modifiée écrite d'abord). Rend du JSON.
     * @param {number} addr
     * @param {string} op
     * @param {string} dsn
     * @param {string} member
     * @param {number} limit
     * @returns {string}
     */
    vol_call(addr, op, dsn, member, limit) {
        let deferred5_0;
        let deferred5_1;
        try {
            const ptr0 = passStringToWasm0(op, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(dsn, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(member, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len2 = WASM_VECTOR_LEN;
            const ret = wasm.emulator_vol_call(this.__wbg_ptr, addr, ptr0, len0, ptr1, len1, ptr2, len2, limit);
            var ptr4 = ret[0];
            var len4 = ret[1];
            if (ret[3]) {
                ptr4 = 0; len4 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred5_0 = ptr4;
            deferred5_1 = len4;
            return getStringFromWasm0(ptr4, len4);
        } finally {
            wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
        }
    }
    /**
     * Octets bruts (blocs à la suite) d'un fichier ou d'un membre, machine en marche.
     * @param {number} addr
     * @param {string} dsn
     * @param {string} member
     * @param {number} limit
     * @returns {Uint8Array}
     */
    vol_raw(addr, dsn, member, limit) {
        const ptr0 = passStringToWasm0(dsn, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(member, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.emulator_vol_raw(this.__wbg_ptr, addr, ptr0, len0, ptr1, len1, limit);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * Écriture directe, machine en marche : refusée (MVS réécrirait par-dessus).
     * @returns {string}
     */
    vol_write() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.emulator_vol_write(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Le processeur attend (PSW d'attente).
     * @returns {boolean}
     */
    waiting() {
        const ret = wasm.emulator_waiting(this.__wbg_ptr);
        return ret !== 0;
    }
}
if (Symbol.dispose) Emulator.prototype[Symbol.dispose] = Emulator.prototype.free;

/**
 * Volume ouvert par la page quand la machine est arrêtée (`www/vol-worker.js`).
 */
export class VolumeImage {
    static __wrap(ptr) {
        const obj = Object.create(VolumeImage.prototype);
        obj.__wbg_ptr = ptr;
        VolumeImageFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        VolumeImageFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_volumeimage_free(ptr, 0);
    }
    /**
     * @param {string} op
     * @param {string} dsn
     * @param {string} member
     * @param {number} limit
     * @returns {string}
     */
    call(op, dsn, member, limit) {
        let deferred5_0;
        let deferred5_1;
        try {
            const ptr0 = passStringToWasm0(op, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(dsn, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(member, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len2 = WASM_VECTOR_LEN;
            const ret = wasm.volumeimage_call(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, limit);
            var ptr4 = ret[0];
            var len4 = ret[1];
            if (ret[3]) {
                ptr4 = 0; len4 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred5_0 = ptr4;
            deferred5_1 = len4;
            return getStringFromWasm0(ptr4, len4);
        } finally {
            wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
        }
    }
    /**
     * @param {any} disk
     */
    constructor(disk) {
        const ret = wasm.volumeimage_new(disk);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        VolumeImageFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Pose un fichier d'ombre de Hercules (`CKD_S370`) sur l'image, dans l'ordre de
     * création : le volume est ensuite vu tel que z/OS le voit, en lecture seule.
     * @param {any} disk
     */
    push_shadow(disk) {
        const ret = wasm.volumeimage_push_shadow(this.__wbg_ptr, disk);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} dsn
     * @param {string} member
     * @param {number} limit
     * @returns {Uint8Array}
     */
    raw(dsn, member, limit) {
        const ptr0 = passStringToWasm0(dsn, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(member, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.volumeimage_raw(this.__wbg_ptr, ptr0, len0, ptr1, len1, limit);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * Pose l'ombre de la page (volume lu sur place, fichier de l'OPFS) : le volume est vu
     * comme la machine le voit, et les écritures vont dans l'ombre (l'image et ses ombres
     * de Hercules restent intactes).
     * @param {any} disk
     * @returns {VolumeImage}
     */
    with_overlay(disk) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.volumeimage_with_overlay(ptr, disk);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return VolumeImage.__wrap(ret[0]);
    }
    /**
     * @param {string} op
     * @param {string} dsn
     * @param {string} member
     * @param {string} text
     * @param {string} to
     * @param {string} user
     * @param {number} changed
     * @param {Uint16Array} stamp
     * @param {Uint8Array} bin
     * @returns {string}
     */
    write(op, dsn, member, text, to, user, changed, stamp, bin) {
        let deferred10_0;
        let deferred10_1;
        try {
            const ptr0 = passStringToWasm0(op, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(dsn, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(member, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len2 = WASM_VECTOR_LEN;
            const ptr3 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len3 = WASM_VECTOR_LEN;
            const ptr4 = passStringToWasm0(to, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len4 = WASM_VECTOR_LEN;
            const ptr5 = passStringToWasm0(user, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len5 = WASM_VECTOR_LEN;
            const ptr6 = passArray16ToWasm0(stamp, wasm.__wbindgen_malloc);
            const len6 = WASM_VECTOR_LEN;
            const ptr7 = passArray8ToWasm0(bin, wasm.__wbindgen_malloc);
            const len7 = WASM_VECTOR_LEN;
            const ret = wasm.volumeimage_write(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, changed, ptr6, len6, ptr7, len7);
            var ptr9 = ret[0];
            var len9 = ret[1];
            if (ret[3]) {
                ptr9 = 0; len9 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred10_0 = ptr9;
            deferred10_1 = len9;
            return getStringFromWasm0(ptr9, len9);
        } finally {
            wasm.__wbindgen_free(deferred10_0, deferred10_1, 1);
        }
    }
}
if (Symbol.dispose) VolumeImage.prototype[Symbol.dispose] = VolumeImage.prototype.free;

/**
 * Noms des boucles de mesure du processeur (`s370::bench`), une par ligne.
 * @returns {string}
 */
export function bench_names() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.bench_names();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Exécute la boucle de mesure `k` pendant `iters` tours : nombre d'instructions (le
 * temps est pris par l'appelant, `tools/chrome/bench_check.py`).
 * @param {number} k
 * @param {number} iters
 * @returns {number}
 */
export function bench_run(k, iters) {
    const ret = wasm.bench_run(k, iters);
    return ret;
}

/**
 * Volume vierge (VOL1, VTOC) : image CCKD de `cyls` cylindres pour 3390, 3380 ou 3350.
 * @param {number} devtype
 * @param {number} cyls
 * @param {string} volser
 * @returns {Uint8Array}
 */
export function blank_volume(devtype, cyls, volser) {
    const ptr0 = passStringToWasm0(volser, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.blank_volume(devtype, cyls, ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Fil d'un processeur (Web Worker de la page, mémoire partagée) : `ptr` vient de
 * `Emulator::start_threads`. Ne rend la main qu'à l'arrêt (`stop_threads`).
 * @param {number} ptr
 * @param {number} idx
 */
export function cpu_thread(ptr, idx) {
    wasm.cpu_thread(ptr, idx);
}

/**
 * Bande vierge avec étiquettes standard (VOL1, HDR1, marque), comme IEHINITT.
 * @param {string} volser
 * @param {string} owner
 * @returns {Uint8Array}
 */
export function labeled_tape(volser, owner) {
    const ptr0 = passStringToWasm0(volser, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(owner, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.labeled_tape(ptr0, len0, ptr1, len1);
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * Ombre de la page d'un volume lu sur place (fichier `IBMZOVL1`) convertie en fichier
 * d'ombre de Hercules (`CKD_S370`, le suivant de la chaîne `sf=`).
 * @param {Uint8Array} overlay
 * @returns {Uint8Array}
 */
export function overlay_shadow(overlay) {
    const ptr0 = passArray8ToWasm0(overlay, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.overlay_shadow(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Le module a été construit avec les atomics (mémoire partagée : un fil par processeur
 * possible).
 * @returns {boolean}
 */
export function threads_supported() {
    const ret = wasm.threads_supported();
    return ret !== 0;
}

/**
 * Noms des boucles de mesure du processeur z/Architecture (`zarch::bench`).
 * @returns {string}
 */
export function zbench_names() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.zbench_names();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Exécute la boucle de mesure z/Architecture `k` pendant `iters` tours : nombre
 * d'instructions.
 * @param {number} k
 * @param {number} iters
 * @returns {number}
 */
export function zbench_run(k, iters) {
    const ret = wasm.zbench_run(k, iters);
    return ret;
}
function __wbg_get_imports(memory) {
    const import0 = {
        __proto__: null,
        __wbg_Error_30c8987f7c2ed4e2: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_flush_9a2e7b245a44b026: function(arg0) {
            arg0.flush();
        },
        __wbg_now_6ea148a23172e9e2: function() {
            const ret = performance.now();
            return ret;
        },
        __wbg_now_bb11b3c037aa72d6: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_read_e601f55869d793fd: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.read(arg1, getArrayU8FromWasm0(arg2, arg3));
            return ret;
        },
        __wbg_size_476df0d2edd70b64: function(arg0) {
            const ret = arg0.size();
            return ret;
        },
        __wbg_static_accessor_TIME_ORIGIN_5c8e3e62980e2e56: function() {
            const ret = performance.timeOrigin;
            return ret;
        },
        __wbg_truncate_f9070d7298b90b29: function(arg0, arg1) {
            const ret = arg0.truncate(arg1);
            return ret;
        },
        __wbg_write_4b0606c103bf73f9: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.write(arg1, getArrayU8FromWasm0(arg2, arg3));
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
        memory: memory || new WebAssembly.Memory({initial:18,maximum:65536,shared:true}),
    };
    return {
        __proto__: null,
        "./ibmz_web_bg.js": import0,
    };
}

const EmulatorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_emulator_free(ptr, 1));
const VolumeImageFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_volumeimage_free(ptr, 1));

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint16ArrayMemory0 = null;
function getUint16ArrayMemory0() {
    if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.buffer !== wasm.memory.buffer) {
        cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachedUint16ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.buffer !== wasm.memory.buffer) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray16ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 2, 2) >>> 0;
    getUint16ArrayMemory0().set(arg, ptr / 2);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : undefined);
if (cachedTextDecoder) cachedTextDecoder.decode();

const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().slice(ptr, ptr + len));
}

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder() : undefined);

if (cachedTextEncoder) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module, thread_stack_size) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedUint16ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    if (typeof thread_stack_size !== 'undefined' && (typeof thread_stack_size !== 'number' || thread_stack_size === 0 || thread_stack_size % 65536 !== 0)) {
        throw new Error('invalid stack size');
    }

    wasm.__wbindgen_start(thread_stack_size);
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module, memory) {
    if (wasm !== undefined) return wasm;

    let thread_stack_size
    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module, memory, thread_stack_size} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports(memory);
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module, thread_stack_size);
}

async function __wbg_init(module_or_path, memory) {
    if (wasm !== undefined) return wasm;

    let thread_stack_size
    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path, memory, thread_stack_size} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('ibmz_web_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports(memory);

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module, thread_stack_size);
}

export { initSync, __wbg_init as default };
