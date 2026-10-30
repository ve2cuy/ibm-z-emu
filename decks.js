// Jeux de cartes d'exemple (bibliothèque de la perforatrice, aide-mémoire, lecteur de
// cartes). Chaque travail a été soumis à MVS 3.8j TK5 dans l'émulateur et finit avec un code
// de retour 0 (COBOL, C, assembleur, PL/I, FORTRAN, JCL). Titres et descriptions : i18n.js
// (deck.<id>, deck.<id>.d).

export const DECKS = [
  { id: 'hello', lang: 'ASM', text: `//HELLO    JOB (ACCT),'HELLO WORLD',CLASS=A,MSGCLASS=A,
//             MSGLEVEL=(1,1),USER=HERC01,PASSWORD=CUL8TR
//* Compile, link and run a small assembler program: a message on
//* the console, and the first 10 prime numbers on printer 1
//* (SYSOUT class A, unit 00E).
//STEP1    EXEC ASMFCLG
//ASM.SYSPUNCH DD DUMMY
//ASM.SYSIN DD *
HELLO    CSECT
         STM   14,12,12(13)
         BALR  12,0
         USING *,12
         ST    13,SAVE+4          Chain the save areas
         LA    13,SAVE
         WTO   'HELLO FROM THE S/370 EMULATOR IN YOUR BROWSER'
* The first 10 prime numbers, on the printer (SYSPRINT)
         OPEN  (PRINT,OUTPUT)
         MVC   TEXT(L'TITLE),TITLE
         PUT   PRINT,LINE
         MVI   CC,C'0'            Blank line before the list
         LA    2,2                N: number to test
         SR    3,3                Primes found
NEXTN    LA    6,2                D: divisor
TESTD    LR    5,6
         MR    4,6                R4-R5 = D * D
         CR    5,2
         BH    PRIME              D * D > N: N is prime
         SR    4,4
         LR    5,2
         DR    4,6                R4 = N modulo D
         LTR   4,4
         BZ    NOTPRIME
         LA    6,1(6)
         B     TESTD
PRIME    LA    3,1(3)
         MVC   TEXT,BLANKS
         CVD   3,DW
         MVC   TEXT(4),PAT
         ED    TEXT(4),DW+6
         MVI   TEXT+4,C'.'
         CVD   2,DW
         MVC   TEXT+5(4),PAT
         ED    TEXT+5(4),DW+6
         PUT   PRINT,LINE
         MVI   CC,C' '
         C     3,=F'10'
         BNL   DONE
NOTPRIME LA    2,1(2)
         B     NEXTN
DONE     CLOSE (PRINT)
         L     13,SAVE+4
         LM    14,12,12(13)
         SR    15,15
         BR    14
SAVE     DS    18F
DW       DS    D
PRINT    DCB   DSORG=PS,MACRF=PM,DDNAME=SYSPRINT,RECFM=FA,BLKSIZE=133
LINE     DS    0CL133
CC       DC    C' '
TEXT     DC    CL132' '
BLANKS   DC    CL132' '
TITLE    DC    C'THE FIRST 10 PRIME NUMBERS'
PAT      DC    X'40202120'
         LTORG
         END   HELLO
/*
//GO.SYSPRINT DD SYSOUT=A
//` },
  { id: 'cobdemo', lang: 'COBOL', text: `//COBDEMO  JOB (ACCT),'COBOL DEMO',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1)
//*
//* COMPILE, LINK AND RUN A COBOL PROGRAM (ANS COBOL 68)
//*
//DEMO     EXEC COBUCLG
//COB.SYSIN DD *
       IDENTIFICATION DIVISION.
       PROGRAM-ID. SQUARES.
       ENVIRONMENT DIVISION.
       CONFIGURATION SECTION.
       SOURCE-COMPUTER. IBM-370.
       OBJECT-COMPUTER. IBM-370.
       SPECIAL-NAMES.
           CONSOLE IS CNSL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       77  N           PIC 99.
       77  SQ          PIC 9999.
       01  LINE-OUT.
           05  FILLER  PIC X(4) VALUE 'N = '.
           05  N-OUT   PIC Z9.
           05  FILLER  PIC X(9) VALUE '   N2 = '.
           05  SQ-OUT  PIC ZZZ9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY 'HELLO FROM COBOL ON MVS 3.8J' UPON CNSL.
           PERFORM SHOW-SQUARE VARYING N FROM 1 BY 1
               UNTIL N GREATER THAN 10.
           STOP RUN.
       SHOW-SQUARE.
           COMPUTE SQ = N * N.
           MOVE N TO N-OUT.
           MOVE SQ TO SQ-OUT.
           DISPLAY LINE-OUT.
/*
//LKED.SYSLIB DD DSNAME=SYS1.COBLIB,DISP=SHR
//            DD DSNAME=SYS1.LINKLIB,DISP=SHR
//GO.SYSOUT DD SYSOUT=A
//` },
  { id: 'cobfizz', lang: 'COBOL', text: `//COBFIZZ  JOB (ACCT),'FIZZBUZZ',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1)
//*
//* FIZZBUZZ FROM 1 TO 30 IN ANS COBOL 68
//*
//DEMO     EXEC COBUCLG
//COB.SYSIN DD *
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FIZZBUZZ.
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       77  N           PIC 99.
       77  Q           PIC 99.
       77  R3          PIC 9.
       77  R5          PIC 9.
       01  OUT-LINE.
           05  N-OUT   PIC Z9.
           05  FILLER  PIC X(2) VALUE SPACES.
           05  WORD    PIC X(8).
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM ONE-NUMBER VARYING N FROM 1 BY 1
               UNTIL N GREATER THAN 30.
           STOP RUN.
       ONE-NUMBER.
           DIVIDE N BY 3 GIVING Q REMAINDER R3.
           DIVIDE N BY 5 GIVING Q REMAINDER R5.
           MOVE SPACES TO WORD.
           IF R3 = 0 AND R5 = 0 MOVE 'FIZZBUZZ' TO WORD
           ELSE IF R3 = 0 MOVE 'FIZZ' TO WORD
           ELSE IF R5 = 0 MOVE 'BUZZ' TO WORD.
           MOVE N TO N-OUT.
           DISPLAY OUT-LINE.
/*
//LKED.SYSLIB DD DSNAME=SYS1.COBLIB,DISP=SHR
//            DD DSNAME=SYS1.LINKLIB,DISP=SHR
//GO.SYSOUT DD SYSOUT=A
//` },
  { id: 'cobmult', lang: 'COBOL', text: `//COBMULT  JOB (ACCT),'COBOL TABLE',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1)
//*
//* MULTIPLICATION TABLE 1 TO 9 IN ANS COBOL 68
//*
//DEMO     EXEC COBUCLG
//COB.SYSIN DD *
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MULTTAB.
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       77  I           PIC 99.
       77  J           PIC 99.
       77  K           PIC 99.
       01  TAB-LINE.
           05  CELL    OCCURS 9 TIMES.
               10  CELL-N  PIC ZZZ9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY '  MULTIPLICATION TABLE'.
           PERFORM ONE-ROW VARYING I FROM 1 BY 1
               UNTIL I GREATER THAN 9.
           STOP RUN.
       ONE-ROW.
           PERFORM ONE-CELL VARYING J FROM 1 BY 1
               UNTIL J GREATER THAN 9.
           DISPLAY TAB-LINE.
       ONE-CELL.
           COMPUTE K = I * J.
           MOVE K TO CELL-N (J).
/*
//LKED.SYSLIB DD DSNAME=SYS1.COBLIB,DISP=SHR
//            DD DSNAME=SYS1.LINKLIB,DISP=SHR
//GO.SYSOUT DD SYSOUT=A
//` },
  { id: 'cobfact', lang: 'COBOL', text: `//COBFACT  JOB (ACCT),'FACTORIALS',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1)
//*
//* FACTORIALS 1 TO 15 IN PACKED DECIMAL (COMP-3) WITH EDITING
//*
//DEMO     EXEC COBUCLG
//COB.SYSIN DD *
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FACTS.
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       77  N           PIC 99     COMP-3.
       77  F           PIC 9(15)  COMP-3 VALUE 1.
       01  OUT-LINE.
           05  N-OUT   PIC Z9.
           05  FILLER  PIC X(5) VALUE '! = '.
           05  F-OUT   PIC ZZZ,ZZZ,ZZZ,ZZZ,ZZ9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM ONE-FACT VARYING N FROM 1 BY 1
               UNTIL N GREATER THAN 15.
           STOP RUN.
       ONE-FACT.
           MULTIPLY N BY F.
           MOVE N TO N-OUT.
           MOVE F TO F-OUT.
           DISPLAY OUT-LINE.
/*
//LKED.SYSLIB DD DSNAME=SYS1.COBLIB,DISP=SHR
//            DD DSNAME=SYS1.LINKLIB,DISP=SHR
//GO.SYSOUT DD SYSOUT=A
//` },
  { id: 'cobprime', lang: 'COBOL', text: `//COBPRIME JOB (ACCT),'COBOL PRIMES',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1)
//*
//* PRIME NUMBERS BELOW 100 BY TRIAL DIVISION IN ANS COBOL 68
//*
//DEMO     EXEC COBUCLG
//COB.SYSIN DD *
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PRIMES.
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       77  N           PIC 999.
       77  D           PIC 999.
       77  Q           PIC 999.
       77  R           PIC 999.
       77  IS-PRIME    PIC X.
       77  COUNT-P     PIC 99 VALUE 0.
       01  OUT-LINE.
           05  FILLER  PIC X(7) VALUE 'PRIME: '.
           05  N-OUT   PIC ZZ9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM TEST-N THRU TEST-N-EXIT VARYING N FROM 2 BY 1
               UNTIL N GREATER THAN 99.
           DISPLAY 'PRIMES BELOW 100: ' COUNT-P.
           STOP RUN.
       TEST-N.
           MOVE 'Y' TO IS-PRIME.
           PERFORM TRY-D THRU TRY-D-EXIT VARYING D FROM 2 BY 1
               UNTIL D * D GREATER THAN N OR IS-PRIME = 'N'.
           IF IS-PRIME = 'Y'
               ADD 1 TO COUNT-P
               MOVE N TO N-OUT
               DISPLAY OUT-LINE.
       TEST-N-EXIT.
           EXIT.
       TRY-D.
           DIVIDE N BY D GIVING Q REMAINDER R.
           IF R = 0 MOVE 'N' TO IS-PRIME.
       TRY-D-EXIT.
           EXIT.
/*
//LKED.SYSLIB DD DSNAME=SYS1.COBLIB,DISP=SHR
//            DD DSNAME=SYS1.LINKLIB,DISP=SHR
//GO.SYSOUT DD SYSOUT=A
//` },
  { id: 'cdemo', lang: 'C', text: `//CDEMO    JOB (ACCT),'C DEMO',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1),
//             REGION=8M
//*
//* COMPILE, LINK AND RUN A C PROGRAM (GCC AND PDPCLIB)
//*
//DEMO     EXEC GCCCLG
//COMP.SYSIN DD *
#include <stdio.h>

static unsigned long fact(int n)
{
    return n <= 1 ? 1 : n * fact(n - 1);
}

int main(void)
{
    int i;
    printf("Hello from C on MVS 3.8j\\n");
    for (i = 1; i <= 10; i++)
        printf("%2d! = %lu\\n", i, fact(i));
    return 0;
}
/*
//` },
  { id: 'cfib', lang: 'C', text: `//CFIB     JOB (ACCT),'C FIBONACCI',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1),
//             REGION=8M
//*
//* FIRST 30 FIBONACCI NUMBERS IN C (GCC AND PDPCLIB)
//*
//DEMO     EXEC GCCCLG
//COMP.SYSIN DD *
#include <stdio.h>

int main(void)
{
    unsigned long a = 0, b = 1, t;
    int i;
    for (i = 1; i <= 30; i++) {
        printf("F(%2d) = %8lu\\n", i, b);
        t = a + b;
        a = b;
        b = t;
    }
    return 0;
}
/*
//` },
  { id: 'csieve', lang: 'C', text: `//CSIEVE   JOB (ACCT),'C SIEVE',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1),
//             REGION=8M
//*
//* SIEVE OF ERATOSTHENES UP TO 200 IN C (GCC AND PDPCLIB)
//*
//DEMO     EXEC GCCCLG
//COMP.SYSIN DD *
#include <stdio.h>
#include <string.h>

#define N 200

int main(void)
{
    char composite[N + 1];
    int i, j, count = 0;
    memset(composite, 0, sizeof composite);
    for (i = 2; i * i <= N; i++)
        if (!composite[i])
            for (j = i * i; j <= N; j += i)
                composite[j] = 1;
    for (i = 2; i <= N; i++) {
        if (!composite[i]) {
            printf("%4d", i);
            if (++count % 10 == 0)
                printf("\\n");
        }
    }
    printf("\\n%d primes up to %d\\n", count, N);
    return 0;
}
/*
//` },
  { id: 'cwords', lang: 'C', text: `//CWORDS   JOB (ACCT),'C STRINGS',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1),
//             REGION=8M
//*
//* WORDS OF A SENTENCE: COUNT, LENGTHS, REVERSED AND IN CAPITALS
//*
//DEMO     EXEC GCCCLG
//COMP.SYSIN DD *
#include <stdio.h>
#include <string.h>
#include <ctype.h>

static void reverse(char *s)
{
    size_t i, n = strlen(s);
    for (i = 0; i < n / 2; i++) {
        char c = s[i];
        s[i] = s[n - 1 - i];
        s[n - 1 - i] = c;
    }
}

int main(void)
{
    char text[] = "the quick brown fox jumps over the lazy dog";
    char *w;
    int count = 0;
    for (w = strtok(text, " "); w != NULL; w = strtok(NULL, " ")) {
        char up[32], rev[32];
        size_t i, len = strlen(w);
        for (i = 0; i <= len; i++)
            up[i] = (char)toupper((unsigned char)w[i]);
        strcpy(rev, w);
        reverse(rev);
        printf("%-8s %2d  %s\\n", up, (int)len, rev);
        count++;
    }
    printf("%d words\\n", count);
    return 0;
}
/*
//` },
  { id: 'asmdemo', lang: 'ASM', text: `//ASMDEMO  JOB (ACCT),'ASM DEMO',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1)
//*
//* ASSEMBLE, LINK AND RUN AN ASSEMBLER PROGRAM (ASSEMBLER F)
//*
//DEMO     EXEC ASMFCLG
//ASM.SYSPUNCH DD DUMMY
//ASM.SYSIN DD *
SUM      CSECT
         STM   14,12,12(13)       SAVE THE CALLER'S REGISTERS
         BALR  12,0               BASE REGISTER
         USING *,12
         SR    3,3                R3 = SUM
         LA    4,1                R4 = 1, 2, ... 10
LOOP     AR    3,4
         LA    4,1(,4)
         C     4,=F'10'
         BNH   LOOP
         CVD   3,DW               SUM IN PACKED DECIMAL
         MVC   RESULT,PATTERN
         ED    RESULT,DW+6        EDITED INTO THE MESSAGE
         WTO   MF=(E,WTOLIST)     MESSAGE ON THE CONSOLE
         LM    14,12,12(13)
         SR    15,15              RETURN CODE 0
         BR    14
DW       DS    D
PATTERN  DC    X'40202120'
WTOLIST  DC    AL2(WTOEND-WTOLIST),AL2(0)
         DC    C'SUM OF 1 TO 10 ='
RESULT   DS    CL4
WTOEND   EQU   *
         END   SUM
/*
//` },
  { id: 'asmcount', lang: 'ASM', text: `//ASMCOUNT JOB (ACCT),'ASM COUNT',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1)
//*
//* COUNT FROM 1 TO 10 ON THE CONSOLE (WTO IN A LOOP, CVD AND UNPK)
//*
//DEMO     EXEC ASMFCLG
//ASM.SYSPUNCH DD DUMMY
//ASM.SYSIN DD *
COUNT    CSECT
         STM   14,12,12(13)       SAVE THE CALLER'S REGISTERS
         BALR  12,0
         USING *,12
         LA    4,1                R4 = 1, 2, ... 10
LOOP     CVD   4,DW               NUMBER IN PACKED DECIMAL
         UNPK  NUM,DW+6(2)        ZONED DECIMAL, 3 DIGITS
         OI    NUM+2,X'F0'        PRINTABLE LAST DIGIT
         WTO   MF=(E,WTOLIST)
         LA    4,1(,4)
         C     4,=F'10'
         BNH   LOOP
         LM    14,12,12(13)
         SR    15,15
         BR    14
DW       DS    D
WTOLIST  DC    AL2(WTOEND-WTOLIST),AL2(0)
         DC    C'COUNTING: '
NUM      DS    CL3
WTOEND   EQU   *
         END   COUNT
/*
//` },
  { id: 'asmprint', lang: 'ASM', text: `//ASMPRINT JOB (ACCT),'ASM QSAM',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1)
//*
//* WRITE A SQUARES TABLE TO SYSPRINT WITH QSAM (DCB, OPEN, PUT, CLOSE)
//*
//DEMO     EXEC ASMFCLG
//ASM.SYSPUNCH DD DUMMY
//ASM.SYSIN DD *
SQTAB    CSECT
         STM   14,12,12(13)
         BALR  12,0
         USING *,12
         ST    13,SAVE+4          CHAIN THE SAVE AREAS
         LA    13,SAVE
         OPEN  (PRINT,(OUTPUT))
         PUT   PRINT,TITLE
         LA    4,1                N = 1, 2, ... 12
LOOP     LR    7,4
         MR    6,4                R6:R7 = N * N
         CVD   4,DW
         MVC   LINE+4(4),PAT3
         ED    LINE+4(4),DW+6     N, EDITED
         CVD   7,DW
         MVC   LINE+12(6),PAT5
         ED    LINE+12(6),DW+5    N**2, EDITED
         PUT   PRINT,LINE
         LA    4,1(,4)
         C     4,=F'12'
         BNH   LOOP
         CLOSE (PRINT)
         L     13,SAVE+4
         LM    14,12,12(13)
         SR    15,15
         BR    14
SAVE     DS    18F
DW       DS    D
PAT3     DC    X'40202120'
PAT5     DC    X'402020202120'
TITLE    DC    CL80'       N      N**2'
LINE     DC    CL80' '
PRINT    DCB   DDNAME=SYSPRINT,DSORG=PS,MACRF=PM,RECFM=FB,             X
               LRECL=80,BLKSIZE=80
         END   SQTAB
/*
//GO.SYSPRINT DD SYSOUT=A
//` },
  { id: 'asmhex', lang: 'ASM', text: `//ASMHEX   JOB (ACCT),'ASM HEX',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1)
//*
//* SHOW A FULLWORD IN HEXADECIMAL (UNPK AND TR) ON THE CONSOLE
//*
//DEMO     EXEC ASMFCLG
//ASM.SYSPUNCH DD DUMMY
//ASM.SYSIN DD *
HEX      CSECT
         STM   14,12,12(13)
         BALR  12,0
         USING *,12
         UNPK  WORK(9),VALUE(5)   ONE NIBBLE PER BYTE, X'F0'-X'FF'
         TR    WORK(8),TRTAB      X'F0'-X'FF' BECOME 0-9, A-F
         MVC   DIGITS,WORK
         WTO   MF=(E,WTOLIST)
         LM    14,12,12(13)
         SR    15,15
         BR    14
VALUE    DC    X'C0FFEE42',X'00'  THE WORD, PLUS A PAD BYTE
WORK     DS    CL9
TRTAB    DC    240C' ',C'0123456789ABCDEF'
WTOLIST  DC    AL2(WTOEND-WTOLIST),AL2(0)
         DC    C'VALUE IN HEXADECIMAL: '
DIGITS   DS    CL8
WTOEND   EQU   *
         END   HEX
/*
//` },
  { id: 'pl1demo', lang: 'PL/I', text: `//PL1DEMO  JOB (ACCT),'PL/I DEMO',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1)
//*
//* COMPILE, LINK AND RUN A PL/I PROGRAM (PL/I F)
//*
//DEMO     EXEC PL1LFCLG
//PL1L.SYSLIN DD UNIT=SYSDA
//PL1L.SYSIN DD *
 SQUARES: PROC OPTIONS(MAIN);
   DCL I FIXED BIN(31);
   PUT FILE(SYSPRINT) SKIP LIST('HELLO FROM PL/I ON MVS 3.8J');
   DO I = 1 TO 10;
     PUT FILE(SYSPRINT) SKIP EDIT('N = ', I, '   N**2 = ', I * I)
                  (A, F(2), A, F(4));
   END;
 END SQUARES;
/*
//LKED.SYSLIB DD DSN=SYS1.PL1LIB,DISP=SHR
//GO.STEPLIB DD DSN=SYS1.PL1LIB,DISP=SHR
//` },
  { id: 'fortdemo', lang: 'FORTRAN', text: `//FORTDEMO JOB (ACCT),'FORTRAN DEMO',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1)
//*
//* COMPILE, LINK AND RUN A FORTRAN PROGRAM (FORTRAN IV G)
//*
//DEMO     EXEC FORTGCLG,REGION.FORT=1024K
//FORT.SYSLIN DD UNIT=SYSDA
//FORT.SYSIN DD *
C     SQUARES IN FORTRAN IV
      WRITE (6,10)
   10 FORMAT (' HELLO FROM FORTRAN ON MVS 3.8J')
      DO 20 I = 1, 10
      J = I * I
      WRITE (6,30) I, J
   20 CONTINUE
   30 FORMAT (' N = ', I2, '   N**2 = ', I4)
      STOP
      END
/*
//` },
  { id: 'mylogon', lang: 'JCL', text: `//MYLOGON  JOB (ACCT),'MYLOGON',CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1),
//             USER=HERC01,PASSWORD=CUL8TR
//*
//* STORE THE LOGON SCRIPT HERC01.CMDPROC(MYLOGON)
//*
//UPDATE   EXEC PGM=IEBUPDTE,PARM=NEW
//SYSPRINT DD SYSOUT=A
//SYSUT2   DD DISP=SHR,DSN=HERC01.CMDPROC
//SYSIN    DD DATA
./ ADD NAME=MYLOGON,LIST=ALL
PROC 0
CONTROL NOMSG NOLIST
WRITE HELLO &SYSUID - IT IS &SYSTIME ON &SYSDATE
PROFILE PREFIX(&SYSUID) MSGID
WRITE DATA SET PREFIX IS &SYSUID
EXIT CODE(0)
./ ENDUP
/*` },
];

/** Texte d'un jeu d'exemple. */
export function deckText(id) {
  return DECKS.find((d) => d.id === id)?.text ?? '';
}
