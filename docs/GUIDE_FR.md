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
- L'**aide-mémoire** (bouton **?** de la barre du haut) : commandes de l'opérateur et de
  TSO, volumes et fichiers de TK5, script de connexion, compilation en COBOL, C, assembleur, PL/I et
  FORTRAN (chaque travail s'ouvre dans le lecteur de cartes).
- Le manuel de TK5 : <https://www.prince-webdesign.nl/tk5> (« TK5 Introduction and User
  Manual »).
- Les manuels de MVS 3.8j et de TSO sont dans les archives de Bitsavers
  (<http://bitsavers.org/pdf/ibm/370/>).
