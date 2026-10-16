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

- The **cheat sheet** (the **?** button in the top bar): operator and TSO commands, TK5
  volumes and data sets, logon script, COBOL and C compilation (each job opens in the card
  reader).
- The TK5 manual: <https://www.prince-webdesign.nl/tk5> ("TK5 Introduction and User
  Manual").
- The MVS 3.8j and TSO manuals are in the Bitsavers archive
  (<http://bitsavers.org/pdf/ibm/370/>).
