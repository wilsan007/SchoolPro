# Démonstration — Cité Scolaire Ambouli

Ce document décrit **ce qui est montrable, où, et à quelle date**. Il sert de
conducteur pendant une démonstration, et de référence quand un écran paraît
vide : il indique alors si c'est normal (rien ne s'est encore produit à cette
date) ou s'il manque des données.

---

## Le compte unique

| | |
|---|---|
| Identifiant | `admin@cite-ambouli.dj` |
| Mot de passe | dans le gestionnaire de mots de passe de l'équipe — jamais dans le dépôt |
| Établissement | Cité Scolaire Ambouli — 2 sites (Ambouli, Arhiba) |
| Rôles possédés | 14, du directeur à l'élève |

Un seul compte fait toute la démonstration : le **sélecteur de rôle** (barre du
haut) rejoue l'application telle que la voit un enseignant, un parent, un
élève, un comptable… sans jamais se déconnecter. La **Time Machine** (même
barre) déplace la date : l'application se comporte alors comme si l'on était à
cette date, et **masque ce qui n'a pas encore eu lieu** (`src/lib/demo-horizon.ts`).

> La Time Machine reste accessible après une bascule de rôle : c'est toujours
> le directeur qui fait la démonstration, même quand il regarde par-dessus
> l'épaule d'un enseignant. Un compte qui ne possède pas le rôle `TENANT_ADMIN`
> ne voit pas le bouton — et le serveur refuserait la date de toute façon.

---

## Les personnages

La démonstration repose sur **une famille**, ce qui permet de raconter une
histoire continue d'un rôle à l'autre :

| Rôle basculé | Qui l'on incarne | Ce qu'on lui a rattaché |
|---|---|---|
| `TEACHER` / `CLASS_TEACHER` | **M. Mahamoud, professeur de mathématiques** | 18 classes, emploi du temps complet, professeur principal de la **2nde D** sur les trois années, cahier journal, devoirs, notes saisies, appels |
| `PARENT` | **le même, comme père de famille** | deux enfants dans la 2nde D dont il est professeur principal |
| `STUDENT` | **Deqa Mahamoud**, sa fille en difficulté | son dossier, ses compétences, son entraînement IA |

Les deux enfants sont **dans la même classe**, et c'est là tout l'intérêt :

- **Ragueh Mahamoud** — 17,8 de moyenne, compétences acquises, exercices
  d'approfondissement. Passe en **1ère S** en 2026-2027.
- **Deqa Mahamoud** — 6,0 de moyenne, douze absences, deux incidents, une
  facture impayée, un plan de remédiation en cours, des alertes envoyées à la
  famille. **Redouble la 2nde D** en 2026-2027.

Le professeur voit les deux côte à côte dans sa classe ; le parent voit les
deux dans son espace ; l'élève voit son propre dossier. Même source, trois
points de vue.

---

## Les six dates de la Time Machine

| Date | Année active | Ce qu'il faut montrer |
|---|---|---|
| **Octobre 2025** | 2025-2026 | Début du T1 : premières notes, premiers appels, cahier journal qui se remplit, aucun bulletin (normal) |
| **Janvier 2026** | 2025-2026 | Début du T2 : bulletins du T1 publiés, conseil de classe passé, impayés qui s'installent, premières alertes LEARNOS |
| **Mars 2026** | 2025-2026 | Fin du T2 : l'année est pleine — 48 000 notes, plans d'accompagnement en cours, recouvrement en escalade, prédictions vérifiables |
| **Juin 2026** | 2025-2026 | Fin d'année : décisions de passage et de redoublement, bulletin annuel, mentions, analyse de cohortes |
| **Août 2026** | 2026-2027 (préparation) | Vacances : année close, rentrée en préparation — inscriptions, réinscriptions, emploi du temps prêt, frais d'inscription à régler, paie d'août |
| **Octobre 2026** | 2026-2027 | Six semaines de cours : interrogations et devoirs surveillés passés, composition du trimestre au calendrier, absences, premiers impayés, entraînement IA lancé |

Sans Time Machine (mode réel, septembre 2026), l'application ouvre sur la
deuxième semaine de la rentrée 2026-2027 : peu de données, mais **cohérentes** —
c'est ce que voit une école deux semaines après la rentrée.

---

## Le fil rouge, rôle par rôle

**Direction** (`/direction`, `/analytics`, `/intelligence`)
Effectifs, moyennes, assiduité, trésorerie, élèves à risque. L'analyse de
cohortes s'appuie sur les parcours de l'année précédente : efficacité du
redoublement, écart entre filles et garçons, devenir des boursiers.

**Enseignant** (`/mon-espace`, `/cahier-journal`, `/notes`, `/devoirs`, `/recommandations`)
Son service, ses séances déjà faites, ses devoirs donnés, ses notes saisies —
et les recommandations que le moteur lui adresse sur SES classes. Certaines
sont déjà tranchées : acceptées, écartées, avec la date et son nom.

**Professeur principal** (`/ma-classe`)
La 2nde D : ses 28 élèves, dont l'élève fort et l'élève en difficulté. Le plan
d'accompagnement de Deqa est ouvert, une étape est faite, une autre est à faire
cette semaine.

**Parent** (`/parent`, `/parent/factures`)
Les deux enfants, leurs notes, leurs absences, les alertes reçues, les
factures et leur état. Rien d'autre : le périmètre relationnel protège.

**Élève** (`/eleve`, `/entrainement`, `/ma-journee`, `/travail`)
Son dossier de compétences, ses feuilles d'exercices générées par matière —
dont une terminée et corrigée par le professeur, une encore en cours — sa
journée et ses devoirs à rendre.

**Vie scolaire** (`/vie-scolaire`, `/veille-assiduite`)
Absences, retards, incidents, sanctions, exclusions. La chaîne est complète :
absences répétées → entretien avec le conseiller → information de la famille.

**Comptabilité** (`/facturation`, `/caisse`, `/comptabilite`)
Frais d'inscription, mensualités, encaissements par moyen de paiement,
relances graduées (SMS, WhatsApp, courrier), puis exclusion pour non-paiement
répété — et sa levée quand la famille régularise.

**Infirmerie, orientation, RH, exploitation, inspection**
Passages à l'infirmerie, entretiens d'orientation, bulletins de paie et
absences du personnel, occupation des salles, indicateurs agrégés.

---

## Remettre le jeu de données d'aplomb

Tous les scripts sont **idempotents** : on peut les rejouer sans rien dupliquer.
Ils ne sont pas pour autant inoffensifs — ils écrivent dans la base visée par
`DATABASE_URL`, et certains **remplacent** des données pour construire la
famille de démonstration :

- `01-personas.ts` retire les rattachements parent-enfant hérités, supprime le
  service de la fiche enseignant coquille, et **écrase l'identité** (nom,
  prénom, date de naissance) de deux fiches élèves de la cohorte 2026-2027
  pour en faire la suite des deux enfants de 2025-2026 ;
- `03-rentree-2026-pedagogie.ts` recalcule les parcours qu'il a lui-même
  écrits (préfixe `ps-2026-`) et recale la date des évaluations existantes.

À ne lancer que sur le tenant de démonstration. Chaque commande passe par le
garde-fou `scripts/guard-target-db.cjs`, qui refuse d'écrire si la base visée
n'est pas celle attendue.

```bash
pnpm demo:personas    # rattache le compte de démo à l'enseignant, au parent et à l'élève
pnpm demo:traces      # attribue notes et appels à leur auteur (journal d'activité)
pnpm demo:rentree     # génère la vie scolaire 2026-2027 (pédagogie, vie scolaire, LEARNOS, facturation)
pnpm demo:verifier    # contrôle, date par date et rôle par rôle, que les écrans ont de la matière
```

`pnpm demo:verifier` répond en quelques secondes et signale par un `✗` tout
écran vide à une date donnée. Pour aller plus loin — ouvrir réellement chaque
page et chaque onglet dans un navigateur :

```bash
pnpm demo:parcours --dates mars-2026
```

(le serveur de développement doit tourner ; le rapport est écrit dans
`audit-reports/`).

---

## Ce qui est volontairement vide

Un écran vide n'est pas toujours un défaut. À vérifier avant de corriger :

- **aucun bulletin avant décembre** — ils sont publiés en fin de trimestre ;
- **aucune exclusion pour non-paiement avant novembre** — il faut trois
  relances, donc du temps ;
- **peu de choses au 16 août** — l'année est close, la suivante n'a pas
  commencé : c'est la préparation de rentrée que l'on montre alors ;
- **2026-2027 s'arrête au 19 décembre** — le premier trimestre est généré, pas
  l'année entière.
