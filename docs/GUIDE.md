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

The **Machine** menu also offers a second machine, **z/Architecture (Linux s390x)**: a
64-bit processor (ESA/390 too), the channel subsystem, the system console (SCLP), ECKD
disks (3390), 3270 terminals, card reader, punch and printer; 64 MB to 2 GB of storage.

To start Linux from the card reader:

1. Get the Debian 7 installer for s390x, `kernel.debian` and `initrd.debian`, from
   <https://archive.debian.org/debian/dists/wheezy/main/installer-s390x/current/images/generic/>.
2. In the **Machine** menu, choose **z/Architecture (Linux s390x)**, then **Kernel…** and
   **Initial RAM disk…** (the files stay in the browser). The IPL unit is `00C` (the
   reader).
3. Kernel parameters: `ro locale=C` starts the installer (it asks first for a network
   device, not emulated yet); `ro locale=C init=/bin/sh` gives a BusyBox shell right away.
4. Click **IPL**. Linux writes on the **Console** tab (about one minute); type the commands
   in the field below it (`uname -a`, `ls /`, `cat /proc/cpuinfo`).

A Hercules configuration with `ARCHLVL z/Arch` (import, **Machine** menu) selects this
machine, its storage and its units; the LOADPARM field gives the load parameter of an IPL
from disk.
