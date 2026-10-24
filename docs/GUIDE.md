# First steps with MVS 3.8j in the IBM System/370 emulator

This guide takes you from an empty browser to a TSO session and a first batch job, with no
prior mainframe knowledge. [Version française](GUIDE_FR.md) · [Back to the README](../README.md)

## 1. What you are going to run

- **MVS 3.8j** is the operating system of IBM's large computers of the late 1970s (the
  ancestor of z/OS). IBM placed it in the public domain.
- **TK5** is a "turnkey" distribution of MVS 3.8j prepared by Rob Prins: everything is
  installed (JES2 for jobs, TSO for interactive sessions, compilers, editors).
- The emulator presents an **IBM 3033**: one processor, 16 MB of storage, disks, an
  operator console, 3270 terminals, printers and a card reader.

## 2. Getting the disks (once)

1. Open <https://ve2cuy.github.io/ibm-z-emu/>.
2. In the left menu, open **Repository** and click **Download** under "MVS 3.8j TK5".
   The 15 volumes (about 290 MB) are copied into the storage of your browser. They stay
   there: next time, nothing to download.
3. The **Disks** menu lists the volumes. Each name ends with the unit address:
   `tk5res.390` is the system volume, at address 390.

## 3. Starting MVS (IPL)

1. Press **IPL** in the top bar (or **LOAD** on the operator panel: the three dials show
   the load unit address, 390).
2. The **Console** tab shows the system messages, like the operator's typewriter. You will
   see `IEA101A`, the volumes, then JES2, VTAM and TSO.
3. When `IKT007I TCAS ACCEPTING LOGONS` appears, TSO accepts logons (about one minute).

A few operator commands to type in the field under the console:

| Command | Effect |
|---|---|
| `D A,L` | Active jobs and tasks |
| `D T` | Date and time |
| `$DA` | Jobs running, according to JES2 |
| `$DQ` | JES2 queues |

### The PSW on the operator panel

Under **PSW**, the panel shows the processor's **Program Status Word** (processor 0 when
there are several): the address of the next instruction and the state of the machine, in
hexadecimal.

**System/370** (MVS 3.8j): one 8-byte word, for example `070E000000000000`.

| Byte | Meaning |
|---|---|
| 0 | `40` PER (tracing), `04` **DAT** (virtual addresses), `02` **I/O** interruptions enabled, `01` **external** interruptions enabled (timers) |
| 1 | storage protection key (left 4 bits), then `08` EC mode (the one MVS uses), `04` machine checks enabled, `02` **wait**, `01` problem state (user program; 0: supervisor) |
| 2 | condition code (bits 18-19, result of the last comparison), program mask (bits 20-23) |
| 5-7 | address of the next instruction (24 bits) |

(In BC mode, the older System/360 format, byte 0 holds the channel masks and bytes 2-3 the
interruption code; MVS 3.8j runs in EC mode.)

**z/Architecture**: 16 bytes, shown as two 64-bit words, for example
`0706000180000000 000000000001816E`. The second word is the address of the next instruction.
The first one:

| Byte (bits) | Meaning |
|---|---|
| 0 (0-7) | `40` PER (tracing), `04` **DAT** (virtual addresses), `02` **I/O** interruptions enabled, `01` **external** interruptions enabled |
| 1 (8-15) | protection key (left 4 bits), `04` machine checks enabled, `02` **wait**, `01` problem state |
| 2 (16-23) | address space (bits 16-17: primary, access registers, secondary, home), condition code (18-19), program mask (20-23) |
| bits 31-32 | addressing mode: `…00 00…` 24-bit, `…00 80…` 31-bit, `…01 80…` 64-bit |

What you see most often:

- **wait, interruptions enabled** (`070E…` on System/370, `0706…` on z/Architecture): the
  system has nothing to do and waits for an I/O or a timer. This is normal;
- **the processor is working**: the wait bit is 0 and the address changes between readings;
- **wait with interruptions disabled** (wait bit 1, I/O and external bits 0): the system has
  **stopped** (*disabled wait*). Its stop code is in the right 12 bits of the address (for
  example `…A71`); the page stops and reports it in the **Monitor** tab.

Every bit is described in the "Control" chapter of IBM's *Principles of Operation*
(System/370 or z/Architecture).

## 4. Logging on to TSO

1. Open the **Terminal 0C0** tab and click in the screen.
2. At `Logon ===>`, type `HERC01` and press **Enter**.
3. Type the password `CUL8TR` (it is not displayed), then **Enter**.
4. The welcome messages end with `***`: press **Enter** to go on.
5. The ISPF primary menu appears. Type an option number at `Option ===>`:
   - **R**: RPF, editor and library manager;
   - **3**: utilities (libraries, catalog);
   - **6**: TSO commands (try `LISTCAT` or `TIME`);
   - **X**: leave ISPF (you get to `READY`).
6. To log off: leave ISPF, then type `LOGOFF` at `READY`.

The **full screen** button, right of the tabs, enlarges the terminal (with the 3270 keys if
they are shown); the button at the top right of the screen leaves it.

On the 3270 keyboard: **Esc** is the Clear key, **F3** (PF3) goes back in ISPF, **Ctrl+R**
(Reset) unlocks the keyboard if it stays locked ("X SYSTEM" in the bar above the screen).

## 5. Submitting a batch job

1. Open the **Card reader** menu. The example (button **Example**) assembles, links and
   runs a small assembler program.
2. Click **Submit**: the cards go to the 3505 reader at address 00C.
3. The console shows the progress (`$HASP373 HELLO STARTED`, the program's message
   `HELLO FROM THE S/370 EMULATOR IN YOUR BROWSER`, then `$HASP395 HELLO ENDED`).
4. The **Printer** tab shows the job output (printer 00E): the JCL, the messages, the
   assembler listing.

## 6. Shutting down cleanly

The disks are modified while MVS runs. Before closing the page, click **Stop** in the top
bar and accept the clean shutdown: the emulator starts the `S SHUTDOWN` procedure of TK5,
then answers the shutdown messages for you (`$PJES2`, `Z EOD`, `QUIESCE`), as the Hercules
scripts did. After about one minute, the machine stops and the disks are up to date.

To start over, the **Repository** menu downloads the original volumes again.

### Suspending and resuming

To stop without shutting MVS down, click **Suspend** (next to **Stop**): the machine stops
where it is, its state (memory, processor, terminals, running jobs) is kept in the
browser, and the disks are written and closed. You can close the page; even after a reload
or an update of the emulator, the page offers to **resume** the session: MVS goes on
exactly where it was, TSO sessions included (on the page's terminals; a TN3270 client of
the relay must reconnect).

- The MVS clock resumes from the time of the suspension: it is behind by the time spent
  suspended.
- A suspended session can be resumed only once. An IPL, erasing the volumes or a direct
  write of the volume manager discards it (the page asks first): MVS could not go on with
  changed disks.
- A clean shutdown remains the best way to end the day: a suspended session depends on
  this browser and its volumes.

## 7. Going further

- The **volume manager** (the **folder** icon, top bar): browse the volumes, their data
  sets and library members, show a member as text or in hexadecimal, export it to the PC;
  edit, create, import, rename or delete members (machine stopped: directly in the
  volume; MVS running: through jobs whose output shows in the window); create, rename,
  delete and compress data sets (MVS running); create a blank volume.
- **Browse Hercules volumes kept on the PC** (the **Open from disk…** button of the volume
  manager): choose one or more images (`.cckd`, `.ckd`…). They are read in place,
  **read-only** and without copying them into the browser, and they are not attached to
  the machine (readable even while MVS runs). Libraries (PDS) and sequential data sets are
  shown; z/OS PDSE and HFS data sets are flagged (`PO-E`, `HFS`) but not read, nor are
  VSAM data sets. The choice lasts for the session (make it again after reloading the
  page).
- **With their shadow files**: when Hercules is configured with `sf=` (for example
  `0A81 3390 cckd/zares1.cckd sf=shadow/zares1_*`), it never writes into the image: the
  changed tracks go into shadow files (`shadow/zares1_1`, then `_2`…). To see the volume
  **with** these changes (data sets created under Hercules, for example), choose the
  shadow files too, together with the images or afterwards: the page recognizes them by
  their header, files each one under its image by name (`zares1_1` under `zares1.cckd`)
  and reads them in order (the last shadow first, the image last). The list then shows,
  for example, "ZARES1 (zares1.cckd + 1 shadow file(s))". **Stop Hercules first**: while
  it runs, it keeps the shadow files locked.
- The **card punch** (**Card punch** menu, or an example of the cheat sheet): write a deck of
  cards, punch it, look at each card and its holes, keep it in the library (17 examples in
  COBOL, C, assembler, PL/I, FORTRAN) and submit it to the card reader.
- The **Hercules configuration** (**Machine** menu): import a Hercules `.cnf` file (units and
  volumes placed at their addresses) or export this machine for Hercules.
- The **cheat sheet** (the **?** button in the top bar): operator and TSO commands, TK5
  volumes and data sets, logon script, COBOL, C, assembler, PL/I and FORTRAN compilation (each job
  opens in the card reader).
- The TK5 manual: <https://www.prince-webdesign.nl/tk5> ("TK5 Introduction and User
  Manual").
- The MVS 3.8j and TSO manuals are in the Bitsavers archive
  (<http://bitsavers.org/pdf/ibm/370/>).

## 8. The z/Architecture machine (Linux s390x)

(If something goes wrong, the **Monitor** tab, next to Console and Printer, tells what the
emulator did: volumes attached, IPL result with the unit and channel status, stops with
their wait state code, instructions not emulated yet.)

On a terminal, drag with the mouse to select a block of the screen (a double click selects
a word), then **Ctrl+C** or the **Copy** button; without a selection, the button copies the
whole screen. The **Log** tab keeps every screen the system wrote on the terminals, one
after the other, with the terminal and the time: its text is selected and copied like any
text on a page (**Copy** takes the selection, or the whole log).

Under the **Printer** tab, three buttons act on the chosen printer: **TXT** saves its output
as text, without the useless blank lines (page bottoms, page skips, several blank lines in a
row); **PDF** saves it as a PDF, one sheet of continuous form paper per page (blue bars, tractor
strips and their holes, as on screen; 132 columns, 6 lines per inch); the trash can clears it.

Commands after the IPL (system loaded from a disk): the **Commands after the IPL** field of
the **Machine** menu takes operator commands, one per line (for example `$S PRT1`). When JES2
has finished starting (`$HASP492`), the page types them on the system console. They are kept
by the page, not on the volumes: they remain when the changes to the volumes are forgotten.

Clean shutdown of a system loaded from a disk: **Stop**, then accept the clean shutdown.
The emulator goes through the system console (`V CN(*),ACTIVATE`) and starts the fitting
shutdown procedure (`S SHUTDB` when DB2 runs, `S SHUTALL` with CICS or MQ, otherwise
`S SHUTDOWN`). It answers `Y` to the zFS question (`BPXI078D`), then stops what remains
(`P`, then `C`, then `FORCE`) and finally `$PI`, `WRITELOG CLOSE`, `$PJES2` and `Z EOD`. A
window follows the steps. The machine stops after `IEE334I HALT EOD SUCCESSFUL`, and the
page can then be closed.

**Suspend** works on z/Architecture too (see "Suspending and resuming", section 6): the
memory is kept compressed in the browser (a few hundred MB for 1 GB, from a few seconds to
a minute depending on the size). Volumes read in place: on resumption, the page asks again
for access to the Hercules folder, then checks that the files and the page's shadow have
not changed.

The **Machine** menu also offers a second machine, **z/Architecture**: a
64-bit processor (ESA/390 too), the channel subsystem, the system console (SCLP), ECKD
disks (3390), 3270 terminals, card reader, punch and printer; 64 MB to 2 GB of storage.
**Processors**: 1 to 8. In a desktop browser that allows shared memory (Chrome, Edge, and
recent Firefox and Safari), each processor runs in its own thread, on its own core: the page
reloads once at the first visit to turn this on, and the **Monitor** tab says how many
threads are running. Otherwise, the processors take turns in a single thread.

To start Linux from the card reader, the quickest way: in the **Machine** menu, under the
reader, click **Debian 7 from the repository** (10 MB, also offered in the **Repository**
menu). The kernel and the initial RAM disk of the Debian 7 installer are kept in the
browser, and the machine is set for it (z/Architecture, IPL from `00C`, parameters
`ro locale=C init=/bin/sh`): click **IPL**. Or, by hand:

1. Get the Debian 7 installer for s390x, `kernel.debian` and `initrd.debian`, from
   <https://archive.debian.org/debian/dists/wheezy/main/installer-s390x/current/images/generic/>.
2. In the **Machine** menu, choose **z/Architecture**, then **Kernel…** and
   **Initial RAM disk…** (the files stay in the browser). The IPL unit is `00C` (the
   reader).
3. Kernel parameters: `ro locale=C` starts the installer (it asks first for a network
   device, not emulated yet); `ro locale=C init=/bin/sh` gives a BusyBox shell right away.
4. Click **IPL**. Linux writes on the **Console** tab (about one minute); type the commands
   in the field below it (`uname -a`, `ls /`, `cat /proc/cpuinfo`).

A Hercules configuration with `ARCHLVL z/Arch` (import, **Machine** menu) selects this
machine, its storage, its units, its LOADPARM and a proposed IPL unit. The simplest way
is **Open a Hercules folder…** (Machine menu): choose the folder Hercules is started from
(for example `D:\Hercules\R3.13`). The page finds the configuration in it (`hercules.cnf`
first), then the volumes and their shadow files from the paths of the file (`cckd/…`,
`sf=shadow/…_*`), and reads them **in place**, without copying them into the browser.
They stay on your disk and are never modified; what the system writes goes into a shadow
kept by the page (**Forget the changes** erases it). In Chrome and Edge, the page keeps
access to the folder: at the next visit, **IPL** asks once for permission and finds the
volumes again. Elsewhere (Firefox, Safari), choose the folder again after reloading.
With **Import…** (a single `.cnf` file), choose the images (`.cckd`…) and their shadow
files yourself. Stop Hercules first: it keeps its shadow files locked.
