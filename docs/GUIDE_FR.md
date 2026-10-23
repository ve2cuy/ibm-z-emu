# Premiers pas avec MVS 3.8j dans l'émulateur IBM System/370

Ce guide vous mène d'un fureteur vide à une session TSO et à un premier travail en lots,
sans connaissance préalable de l'ordinateur central. [English version](GUIDE.md) ·
[Retour au README](../README_FR.md)

## 1. Ce que vous allez faire tourner

- **MVS 3.8j** est le système d'exploitation des gros ordinateurs IBM de la fin des années
  1970 (l'ancêtre de z/OS). IBM l'a mis dans le domaine public.
- **TK5** est une distribution « clés en main » de MVS 3.8j, préparée par Rob Prins : tout
  est installé (JES2 pour les travaux, TSO pour les sessions interactives, compilateurs,
  éditeurs).
- L'émulateur présente un **IBM 3033** : un processeur, 16 Mo de mémoire, des disques, une
  console d'opérateur, des terminaux 3270, des imprimantes et un lecteur de cartes.

## 2. Obtenir les disques (une seule fois)

1. Ouvrez <https://ve2cuy.github.io/ibm-z-emu/>.
2. Dans le menu de gauche, ouvrez **Dépôt** et cliquez sur **Télécharger** sous
   « MVS 3.8j TK5 ». Les 15 volumes (environ 290 Mo) sont copiés dans le stockage de votre
   fureteur. Ils y restent : la prochaine fois, rien à télécharger.
3. Le menu **Disques** énumère les volumes. Chaque nom finit par l'adresse de l'unité :
   `tk5res.390` est le volume système, à l'adresse 390.

## 3. Démarrer MVS (IPL)

1. Appuyez sur **IPL** dans la barre du haut (ou **LOAD** sur le pupitre : les trois
   cadrans indiquent l'adresse de chargement, 390).
2. L'onglet **Console** affiche les messages du système, comme la machine à écrire de
   l'opérateur. Vous verrez passer `IEA101A`, les volumes, puis JES2, VTAM et TSO.
3. Quand paraît `IKT007I TCAS ACCEPTING LOGONS`, TSO accepte les connexions (environ une
   minute).

Quelques commandes d'opérateur à taper dans la zone sous la console :

| Commande | Effet |
|---|---|
| `D A,L` | Travaux et tâches actifs |
| `D T` | Date et heure |
| `$DA` | Travaux en cours selon JES2 |
| `$DQ` | Files d'attente de JES2 |

## 4. Se connecter à TSO

1. Ouvrez l'onglet **Terminal 0C0** et cliquez dans l'écran.
2. À `Logon ===>`, tapez `HERC01` et appuyez sur **Entrée**.
3. Tapez le mot de passe `CUL8TR` (il ne s'affiche pas), puis **Entrée**.
4. Les messages d'accueil se terminent par `***` : appuyez sur **Entrée** pour continuer.
5. Le menu principal d'ISPF paraît. Tapez le numéro d'une option à `Option ===>` :
   - **R** : RPF, éditeur et gestionnaire de bibliothèques;
   - **3** : utilitaires (bibliothèques, catalogue);
   - **6** : commandes TSO (essayez `LISTCAT` ou `TIME`);
   - **X** : quitter ISPF (vous arrivez à `READY`).
6. Pour vous déconnecter : quittez ISPF, puis tapez `LOGOFF` à `READY`.

Le bouton **plein écran**, à droite des onglets, agrandit le terminal (avec les touches
3270 si elles sont affichées); le bouton en haut à droite de l'écran en sort.

Sur le clavier 3270 : **Échap** est la touche Clear, **F3** (PF3) revient en arrière dans
ISPF, **Ctrl+R** (Reset) libère le clavier s'il reste verrouillé (« X SYSTÈME » dans la
barre au-dessus de l'écran).

## 5. Soumettre un travail en lots

1. Ouvrez le menu **Lecteur de cartes**. L'exemple (bouton **Exemple**) assemble, lie et
   exécute un petit programme en assembleur.
2. Cliquez sur **Soumettre** : les cartes vont au lecteur 3505 à l'adresse 00C.
3. La console affiche le déroulement (`$HASP373 HELLO STARTED`, puis le message du
   programme `HELLO FROM THE S/370 EMULATOR IN YOUR BROWSER`, puis `$HASP395 HELLO ENDED`).
4. L'onglet **Imprimante** montre la sortie du travail (imprimante 00E) : le JCL, les
   messages, la liste de l'assembleur.

## 6. Arrêter proprement

Les disques sont modifiés pendant que MVS tourne. Avant de fermer la page, cliquez sur
**Arrêter** dans la barre du haut et acceptez l'arrêt propre : l'émulateur lance la
procédure `S SHUTDOWN` de TK5, puis répond pour vous aux messages de l'arrêt (`$PJES2`,
`Z EOD`, `QUIESCE`), comme le faisaient les scripts de Hercules. Après environ une minute,
la machine s'éteint et les disques sont à jour.

Pour repartir de zéro, le menu **Dépôt** propose de télécharger de nouveau les volumes
d'origine.

## 7. Pour aller plus loin

- Le **gestionnaire de volumes** (icône du **dossier**, barre du haut) : parcourir les
  volumes, leurs fichiers et les membres des bibliothèques, afficher un membre en texte ou
  en hexadécimal, l'exporter vers le PC; modifier, créer, importer, renommer ou supprimer
  des membres (machine arrêtée : directement dans le volume; MVS en marche : par des
  travaux, dont la sortie paraît dans la fenêtre); créer, renommer, supprimer et
  compresser des fichiers (MVS en marche); créer un volume vierge.
- **Parcourir des volumes de Hercules restés sur le PC** (bouton **Ouvrir du disque…** du
  gestionnaire de volumes) : choisir une ou plusieurs images (`.cckd`, `.ckd`…). Elles
  sont lues sur place, en **lecture seule** et sans copie dans le fureteur, et ne sont pas
  branchées sur la machine (lisibles même MVS en marche). Les bibliothèques (PDS) et les
  fichiers séquentiels s'affichent; les PDSE et HFS de z/OS sont signalés (`PO-E`, `HFS`)
  mais pas lus, ni les fichiers VSAM. Le choix vaut pour la session (le refaire après un
  rechargement de la page).
- **Avec leurs fichiers d'ombre** : quand Hercules est configuré avec `sf=` (par exemple
  `0A81 3390 cckd/zares1.cckd sf=shadow/zares1_*`), il n'écrit jamais dans l'image : les
  pistes modifiées vont dans des fichiers d'ombre (`shadow/zares1_1`, puis `_2`…). Pour
  voir le volume **avec** ces modifications (les fichiers créés sous Hercules, par
  exemple), choisir aussi les ombres, dans le même choix que les images ou après coup :
  la page les reconnaît à leur en-tête, les range sous leur image d'après le nom
  (`zares1_1` sous `zares1.cckd`) et les lit dans l'ordre (la dernière ombre d'abord,
  l'image en dernier). La liste montre alors par exemple
  « ZARES1 (zares1.cckd + 1 fichier(s) d'ombre) ». **Arrêter Hercules d'abord** : tant
  qu'il tourne, il garde les ombres verrouillées.
- La **perforatrice** (menu **Perforatrice**, ou un exemple de l'aide-mémoire) : écrire un
  jeu de cartes, le perforer, voir chaque carte et ses perforations, le garder dans la
  bibliothèque (17 exemples en COBOL, C, assembleur, PL/I, FORTRAN) et le soumettre au
  lecteur de cartes.
- La **configuration Hercules** (menu **Machine**) : importer un fichier `.cnf` de Hercules
  (unités et volumes placés à leurs adresses) ou exporter cette machine pour Hercules.
- L'**aide-mémoire** (bouton **?** de la barre du haut) : commandes de l'opérateur et de
  TSO, volumes et fichiers de TK5, script de connexion, compilation en COBOL, C, assembleur, PL/I et
  FORTRAN (chaque travail s'ouvre dans le lecteur de cartes).
- Le manuel de TK5 : <https://www.prince-webdesign.nl/tk5> (« TK5 Introduction and User
  Manual »).
- Les manuels de MVS 3.8j et de TSO sont dans les archives de Bitsavers
  (<http://bitsavers.org/pdf/ibm/370/>).

## 8. La machine z/Architecture (Linux s390x)

(En cas de problème, l'onglet **Moniteur**, à côté de Console et Imprimante, dit ce que
l'émulateur a fait : volumes branchés, résultat de l'IPL avec l'état de l'unité et du
canal, arrêts avec leur code d'attente, instructions pas encore émulées.)

Sur un terminal, glisser avec la souris sélectionne un bloc de l'écran (un double-clic, un
mot), copié par **Ctrl+C** ou le bouton **Copier**; sans sélection, le bouton copie tout
l'écran. L'onglet **Journal** garde tous les écrans que le système a écrits sur les
terminaux, à la suite, avec le terminal et l'heure : son texte se sélectionne et se copie
comme celui d'une page (**Copier** prend la sélection, ou tout le journal).

Le menu **Machine** offre aussi une seconde machine, **z/Architecture** : un
processeur de 64 bits (ESA/390 aussi), le sous-système de canaux, la console du système
(SCLP), des disques ECKD (3390), des terminaux 3270, un lecteur, une perforatrice et une
imprimante; de 64 Mo à 2 Go de mémoire. **Processeurs** : de 1 à 8. Dans un fureteur de
bureau qui permet la mémoire partagée (Chrome, Edge, Firefox et Safari récents), chaque
processeur tourne dans son propre fil, sur son propre cœur : la page se recharge une fois à
la première visite pour le permettre, et l'onglet **Moniteur** dit combien de fils tournent.
Sinon, les processeurs tournent à tour de rôle dans un seul fil.

Pour démarrer Linux par le lecteur de cartes, le plus simple : dans le menu **Machine**,
sous le lecteur, cliquer **Debian 7 du dépôt** (10 Mo, offert aussi dans le menu
**Dépôt**). Le noyau et l'image initiale de l'installateur de Debian 7 sont gardés dans le
fureteur, et la machine est réglée pour lui (z/Architecture, IPL depuis `00C`, paramètres
`ro locale=C init=/bin/sh`) : appuyer sur **IPL**. Ou, à la main :

1. Prendre l'installateur de Debian 7 pour s390x, `kernel.debian` et `initrd.debian`, sur
   <https://archive.debian.org/debian/dists/wheezy/main/installer-s390x/current/images/generic/>.
2. Dans le menu **Machine**, choisir **z/Architecture**, puis **Noyau…** et
   **Image initiale…** (les fichiers restent dans le fureteur). L'unité d'IPL est `00C`
   (le lecteur).
3. Paramètres du noyau : `ro locale=C` lance l'installateur (il demande d'abord une
   interface réseau, pas encore émulée); `ro locale=C init=/bin/sh` donne tout de suite
   un interpréteur de commandes BusyBox.
4. Appuyer sur **IPL**. Linux écrit dans l'onglet **Console** (environ une minute); les
   commandes se tapent dans le champ du dessous (`uname -a`, `ls /`, `cat /proc/cpuinfo`).

Une configuration Hercules avec `ARCHLVL z/Arch` (import, menu **Machine**) choisit cette
machine, sa mémoire, ses unités, son LOADPARM et une unité d'IPL proposée. Le plus simple
est **Ouvrir un dossier Hercules…** (menu Machine) : choisir le dossier d'où Hercules est
lancé (par exemple `D:\Hercules\R3.13`). La page y trouve la configuration
(`hercules.cnf` d'abord), puis les volumes et leurs fichiers d'ombre d'après les chemins
du fichier (`cckd/…`, `sf=shadow/…_*`), et les **lit sur place**, sans copie dans le
fureteur. Ils restent sur votre disque et ne sont jamais modifiés; ce que le système
écrit va dans une ombre gardée par la page (**Oublier les modifications** l'efface). Dans
Chrome et Edge, la page garde l'accès au dossier : à la visite suivante, **IPL** demande
une fois la permission et retrouve les volumes. Ailleurs (Firefox, Safari), choisir de
nouveau le dossier après un rechargement. Avec **Importer…** (un fichier `.cnf` seul),
choisir soi-même les images (`.cckd`…) et leurs ombres. Arrêter Hercules d'abord : il
garde ses ombres verrouillées.
