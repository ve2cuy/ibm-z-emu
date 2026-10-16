# IBM System/370 emulator

An IBM System/370 mainframe that runs in your browser, written in Rust and compiled to
WebAssembly. It runs **MVS 3.8j** in the **TK5** "turnkey" distribution by Rob Prins: JES2,
TSO on 3270 terminals, compilers, card reader and printers.

New to the mainframe? The [step-by-step guide](docs/GUIDE.md) takes you from an empty browser
to your first TSO session and your first batch job.

**Try it: <https://ve2cuy.github.io/ibm-z-emu/>** · [Version française](README_FR.md)

![The TK5 logon screen on a 3270 terminal of the emulator](docs/screenshots/logon.png)

## Status

- **Processor**: complete System/370 instruction set (integer, decimal, hexadecimal floating
  point in short, long and extended formats, system instructions), dynamic address
  translation, storage keys, interruptions and timers, plus the instructions of the
  Hercules "S/370 extension" that TK5 uses. Written from IBM's *Principles of Operation*
  and compared with Hercules on 21,000 random instructions.
- **Machine**: IBM 3033 with 16 MB, S/370 channels, CKD disks (3350, 3380, 3390, in
  Hercules CKD and compressed CCKD formats), 3215 operator console, local 3270 terminals
  (with colors and extended attributes), 1403 and 3211 printers, 3505 card reader, 3525
  punch.
- **MVS 3.8j TK5**: IPL, JES2, VTAM and TSO; logon, line mode and full screen
  applications; batch jobs submitted through the card reader.
- **Page**: operator console, 3270 terminals, operator panel modeled after the System/370
  Model 148 (load unit address dials, LOAD, INTERRUPT, RESTART, lights), printer output,
  four languages (English, French, Spanish, Chinese).

## Getting started

1. Open the emulator. In the **Repository** menu, download **MVS 3.8j TK5** (about 290 MB,
   once): the 15 disk volumes are kept in the storage of your browser.
2. Press **IPL** (or **LOAD** on the operator panel; the load unit address is 390).
3. Watch the **Console** tab: after about a minute, `IKT007I TCAS ACCEPTING LOGONS`
   means TSO is ready.
4. In the **Terminal 0C0** tab, type `HERC01` at `Logon ===>`, press Enter, then the
   password `CUL8TR`.
5. Before closing the page, click **Stop** and accept the clean shutdown (`S SHUTDOWN` of
   TK5, about one minute).

TSO users of TK5: HERC01 and HERC02 (password CUL8TR), HERC03 and HERC04 (PASS4U).

## 3270 keyboard

| PC key | 3270 key |
|---|---|
| Enter | Enter |
| Esc | Clear |
| F1 to F12 (Shift: F13 to F24) | PF1 to PF12 (PF13 to PF24) |
| Page Up / Page Down | PF7 / PF8 |
| Ctrl+1, Ctrl+2, Ctrl+3 | PA1, PA2, PA3 |
| Ctrl+R | Reset (unlocks the keyboard) |
| End | Erase EOF |
| Insert, Delete, Backspace, Tab, Shift+Tab, Home, arrows | as on a 3270 |
| Shift+Enter | New line |

The keys can also be shown under the screen (Display menu).

## Connecting a TN3270 client

A web page cannot receive network connections, so two small programs, available in the
[releases](https://github.com/ve2cuy/ibm-z-emu/releases) for Windows, Linux and macOS, put the
3270 terminals on your local network:

- **ibmz-relay** (with the page): start `ibmz-relay` on the PC that runs the browser,
  check **TN3270 relay** in the **Local network** menu, then IPL. A client (x3270, wc3270,
  c3270, PCOMM, Vista…, model 3278-2) connects to the address of that PC, port 3270, and
  gets a free terminal among 0C0-0C6. The page shows it held by the client.
- **ibmz-server** (without a browser): `ibmz-server <folder of the TK5 volumes>` runs MVS
  in a terminal window, with the operator console in it, TN3270 on port 3270, the card
  reader on port 3505 (`nc host 3505 < job.jcl`) and the printers in files (`prt/`).
  Commands: `.shutdown` (clean shutdown of TK5), `.quit`, `.who`. With `--copy`, the volume
  files are not modified.

Both listen on all the interfaces of the PC (`--bind 127.0.0.1` keeps them on this PC):
your firewall decides who reaches them. There is no password other than the TSO logon.

## Batch jobs

The **Card reader** menu sends a job to the 3505 reader at address 00C, where JES2 reads
it. Its output appears in the **Printer** tab (printer 00E, class A).

## Disks

The volumes are files of the browser's private storage (OPFS) and MVS modifies them as it
runs, like real disks. The **Disks** menu lists them, saves a volume on your PC and imports
volumes in Hercules format (the `dasd` folder of TK5, for example; each file name ends
with the unit address, such as `tk5res.390`).

## Credits and licenses

- Emulator: © 2026 Alain Boudreault (VE2CUY), Apache License 2.0 ([LICENSE](LICENSE),
  [NOTICE](NOTICE)).
- MVS 3.8j: IBM, public domain. TK5: Rob Prins, on the work of Volker Bandke (TK3) and
  Juergen Winkelmann (TK4-), and many contributors (see `SYS2.JCLLIB(CREDITS)` in TK5).
  The volumes come from <https://www.prince-webdesign.nl/tk5>.
- The behavior of the processor was checked against the
  [Hercules](https://github.com/SDL-Hercules-390/hyperion) emulator, run as a reference;
  none of its code is included.
