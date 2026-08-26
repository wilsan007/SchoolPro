# Série de dumps en double — mise à l'écart, rien n'est supprimé

Ce dossier contient 520 fichiers `*-partNNN.sql` (≈ 245 Mo) qui faisaient
double emploi avec les `*-partNN.sql` restés à la racine de `prisma/sql/`.

## Pourquoi ils ont été écartés

Les deux séries décrivent les **mêmes identifiants** avec des **contenus
différents** — ce ne sont pas deux découpages du même jeu :

| Famille                            | `partNN` | `partNNN` |
| ---------------------------------- | -------- | --------- |
| `05-classes-eleves-parents`        | 13       | 19        |
| `06-edt-evaluations-notes-bulletins` | 69     | 69        |
| `07-facturation-paiements-relances` | 29      | 39        |
| `08-vie-scolaire-sante`            | 13       | 13        |
| `11-learnos-apprentissage`         | 99       | 374       |

La série `partNNN` est la plus fournie (1 848 comptes parents contre 1 232),
mais **aucun script du dépôt ne la produit** : `generate-sql.mjs` nomme ses
sorties sur deux chiffres (`String(n).padStart(2, '0')`). Elle n'était pas
non plus suivie par git.

Conséquences de la coexistence :

- `pnpm seed:check` remontait 2 464 identifiants `users` dupliqués et
  64 795 violations d'unicité — du bruit qui masquait les vrais problèmes ;
- le chargement d'un environnement traitait deux fois le même jeu (les
  seconds `INSERT` étant absorbés par `ON CONFLICT (id) DO NOTHING`) ;
- la prochaine exécution de `generate-sql.mjs` aurait de toute façon
  supprimé ces fichiers : sa routine de nettoyage efface tout
  `<base>-part*` avant de régénérer.

## Ce que ça change

`validate.mjs` et `generate-sql.mjs` ne lisent que le premier niveau de
`prisma/sql/` : les fichiers placés ici sont donc ignorés par l'outillage,
tout en restant disponibles.

## Si c'est cette série qu'il faut garder

Alors c'est `generate-sql.mjs` qui doit être repris (données et format de
nom), et la série `partNN` remontée ici à son tour. Tant que le générateur
produit `partNN`, garder `partNNN` à la racine ramènerait le doublon à la
première régénération.

Aucun de ces fichiers n'est utilisé par la production : la base
`ecolemiriam` n'a jamais été chargée depuis ces dumps.
