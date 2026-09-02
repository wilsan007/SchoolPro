# Réparation du seed Ambouli

> Ce qui a été corrigé, ce qui reste à faire, et exactement comment le faire —
> étape par étape, sans rien laisser à deviner.

| | |
|---|---|
| **Au départ** | 9 erreurs bloquantes |
| **Maintenant** | 1 erreur restante |
| **Objectif** | 0 — seed chargeable |
| **Étapes restantes** | 6, dont 5 côté TypeScript |

**Ordre d'exécution.** Les étapes 01 et 02 concernent le générateur SQL et doivent
passer en premier : elles débloquent le chargement. Les étapes 03 à 07 concernent
le seed TypeScript et sont indépendantes entre elles, à l'exception de 05 qui
suppose 03 faite. L'étape 08 clôt l'ensemble.

---

## 00 — Ce qui vient d'être corrigé — ✅ FAIT

La fonction `genFile06()` de `prisma/sql/generate-sql.mjs` a été réécrite. Elle
produisait à elle seule 8 des 9 erreurs.

### Les deux changements

1. **L'emploi du temps** était tiré au hasard : le jour venait de
   `matCode.charCodeAt(0)`, le créneau de `matCode.length`, la salle de
   `randInt(101,203)`. Aucune vérification de disponibilité. Il appelle
   désormais `construireEmploisDuTemps(classes)`, qui place chaque heure sous
   contrainte de classe, d'enseignant et de salle.

2. **Les bulletins** écrivaient `null` dans six colonnes affichées à l'écran.
   Elles sont maintenant calculées à partir des notes réellement générées, en
   deux passes : d'abord toutes les notes, ensuite les agrégats qui en découlent.

### Résultat mesuré

| Erreur | Avant | Après |
|---|---|---|
| `moyenneClasse` toujours NULL | 7 470 lignes | ✅ résolu |
| `moyennePremier` toujours NULL | 7 470 lignes | ✅ résolu |
| `moyenneMax` toujours NULL | 29 880 lignes | ✅ résolu |
| `moyenneMin` toujours NULL | 29 880 lignes | ✅ résolu |
| `appreciation` toujours NULL | 29 880 lignes | ✅ résolu |
| `nomProfesseur` toujours NULL | 29 880 lignes | ✅ résolu |
| Conflit enseignant | 1 654 créneaux | ✅ 0 |
| Conflit classe | 615 créneaux | ✅ 0 |
| Matière simultanée massive | 48 créneaux | ✅ 0 |
| Conflit salle | 522 créneaux | ⚠️ 779 — étape 01 |

> **Pourquoi le conflit de salle a augmenté.** Avant, les salles étaient tirées
> au hasard entre 101 et 203, ce qui les dispersait par accident. Maintenant
> chaque classe a une salle attitrée, donc les collisions apparentes sont
> systématiques et visibles. Ce n'est pas une régression : c'est le vrai
> problème qui remonte à la surface, et l'étape 01 le règle.

---

## 01 — Rendre les noms de salle uniques entre les deux sites — ⏳ À FAIRE

> **La cause exacte.** L'audit détecte un conflit de salle avec la clé
> `annee | jour | heureDebut | salle` — sans le site. Or la table
> `emplois_temps` ne stocke que le *libellé* de la salle, pas son identifiant ni
> son site. Ambouli et Arhiba ont tous deux une « Salle 101 », un « Gymnase »,
> un « Labo SVT ». Deux cours simultanés sur les deux campus sont donc
> indiscernables d'une double réservation. Il ne s'agit pas d'assouplir
> l'audit : l'audit a raison, ce sont les libellés qui sont ambigus.

La correction : donner à chaque campus sa propre numérotation, et suffixer les
salles nommées par le nom du site. C'est ce que fait un vrai groupe scolaire à
deux implantations.

| | Ambouli | Arhiba |
|---|---|---|
| Collège (12 classes) | `Salle 101` → `112` | `Salle 301` → `312` |
| Lycée (10 classes) | `Salle 201` → `210` | `Salle 401` → `410` |
| Laboratoires | `Labo Physique Ambouli 1/2`<br>`Labo SVT Ambouli` | `Labo Physique Arhiba 1/2`<br>`Labo SVT Arhiba` |
| Informatique | `Salle Info Ambouli` | `Salle Info Arhiba` |
| Sport | `Gymnase Ambouli`<br>`Terrain de sport Ambouli`<br>`Plateau sportif Ambouli` | `Gymnase Arhiba`<br>`Terrain de sport Arhiba`<br>`Plateau sportif Arhiba` |
| Divers | `Salle des professeurs Ambouli`<br>`CDI Ambouli` | `Salle des professeurs Arhiba`<br>`CDI Arhiba` |

### 1.1 — L'inventaire des salles

**Fichier :** `prisma/sql/03-matieres-salles-tarifs.sql`, lignes 55–120

Les 62 lignes du `INSERT INTO salles` sont réécrites avec les libellés
ci-dessus. Les identifiants (`salle-AMB-…`, `salle-ARH-…`) ne changent pas —
rien d'autre ne les référence par nom.

> ⚠️ **État actuel : cette sous-étape a déjà été appliquée.** Le fichier porte
> les nouveaux noms, mais les sous-étapes 1.2 à 1.4 ne sont pas faites. Le SQL
> est donc incohérent : ne pas régénérer ni charger avant d'avoir terminé
> l'étape 01, ou annuler la modification du fichier 03.

### 1.2 — La numérotation des salles attitrées

**Fichier :** `prisma/sql/generate-sql.mjs`, ligne 282, dans `generateClasses()`

```diff
-      let numCollege = 100, numLycee = 200;
+      let numCollege = site === 'ambouli' ? 100 : 300;
+      let numLycee   = site === 'ambouli' ? 200 : 400;
```

### 1.3 — Les salles spécialisées deviennent propres à chaque site

**Fichier :** `prisma/sql/generate-sql.mjs`, ligne 887

```diff
  // Avant : un seul jeu de noms, partagé par les deux sites.
- const SALLES_SPECIALISEES = {
-   PC:   { salles: ['Labo Physique 1', 'Labo Physique 2'], obligatoire: false },
-   SVT:  { salles: ['Labo SVT'],                           obligatoire: false },
-   TECH: { salles: ['Salle Info'],                          obligatoire: false },
-   EPS:  { salles: ['Gymnase', 'Terrain de sport', 'Plateau sportif'], obligatoire: true },
- };

  // Après : un jeu par site, construit à partir du nom du site.
+ const NOM_SITE = { ambouli: 'Ambouli', arhiba: 'Arhiba' };
+ const SALLES_SPECIALISEES = Object.fromEntries(
+   ['ambouli', 'arhiba'].map(site => {
+     const s = NOM_SITE[site];
+     return [site, {
+       PC:   { salles: [`Labo Physique ${s} 1`, `Labo Physique ${s} 2`], obligatoire: false },
+       SVT:  { salles: [`Labo SVT ${s}`],  obligatoire: false },
+       TECH: { salles: [`Salle Info ${s}`], obligatoire: false },
+       EPS:  { salles: [`Gymnase ${s}`, `Terrain de sport ${s}`,
+                        `Plateau sportif ${s}`], obligatoire: true },
+     }];
+   })
+ );
```

### 1.4 — Le planificateur lit le bon jeu de salles

**Fichier :** `prisma/sql/generate-sql.mjs`, ligne 962, dans `construireEmploisDuTemps()`

```diff
-        const spec = SALLES_SPECIALISEES[matCode];
+        const spec = SALLES_SPECIALISEES[site][matCode];
```

Rien d'autre à toucher dans cette fonction : `occupSalle` est déjà déclaré à
l'intérieur de la boucle par site, et sa clé contient déjà le site.

### ✅ Vérification

```bash
cd prisma/sql && node generate-sql.mjs && node _audit/validate.mjs
```

Attendu : `0 erreur(s) de niveau ERROR`. Si un `[EDT] n créneaux non placés`
apparaît, c'est un avertissement, pas une erreur — il signale seulement que la
semaine est saturée pour l'EPS.

---

## 02 — Vérifier que le SQL se charge vraiment — ⏳ À FAIRE

> **Pourquoi cette étape existe.** L'audit lit les fichiers SQL en texte ; il ne
> les exécute pas. Une contrainte de clé étrangère ou d'unicité que l'audit ne
> modélise pas peut encore faire échouer le chargement réel. Tant qu'on n'a pas
> chargé une fois, on ne sait pas.

1. Créer une base jetable (ne jamais viser la base de développement).
2. Appliquer le schéma Prisma dessus.
3. Charger les fichiers `01` à `14` dans l'ordre numérique.
4. Noter la première erreur PostgreSQL s'il y en a une, la corriger **dans le
   générateur** — jamais dans le SQL produit, qui est réécrit à chaque exécution.

### ✅ Point d'attention

Le script `scripts/guard-target-db.cjs` protège déjà contre un chargement sur la
mauvaise base. Le laisser en place.

---

## 03 — Seed TypeScript : faire redoubler ceux qui redoublent — ⏳ À FAIRE

> **La contradiction actuelle.** Le seed TypeScript écrit dans
> `parcoursScolaire` une décision `"Redoublement"` quand la moyenne est
> inférieure à 10 — puis promeut l'élève au niveau supérieur quelques lignes
> plus loin. Le bulletin dit « redouble », le dossier dit « est passé en 4ème ».
> Les six analyses longitudinales de LEARNOS lisent précisément ce couple, et il
> est incohérent.

**Fichier :** `prisma/seed-ambouli-classes.ts`, lignes 316–352

Aujourd'hui la boucle exclut la Terminale et promeut tout le reste :

```ts
// ligne 318
if (e.niveau === "Terminale") continue;   // déjà diplômé
const niveauSuivant = PROMOTION[e.niveau];
if (!niveauSuivant) continue;
// → puis affectation systématique au niveau suivant
```

### Ce qu'il faut faire

1. **Conserver la moyenne de l'année 1.** Elle est actuellement calculée à la
   ligne 243 (`clamp(gauss(11.5, 3), 4, 18)`) dans la boucle des parcours, puis
   perdue. La stocker sur l'entrée du registre : `e.moyenneY1 = moyenne`, et
   déclarer le champ dans le type de `eleveRegistry`.

2. **Choisir le niveau de destination selon cette moyenne**, et non plus
   systématiquement le suivant :
   - moyenne ≥ 10 → `PROMOTION[e.niveau]`
   - moyenne < 10 → `e.niveau` (il reste où il est)
   - Terminale avec moyenne ≥ 10 → diplômé, déjà traité plus haut
   - Terminale avec moyenne < 10 → redouble la Terminale, il ne faut donc plus
     l'exclure d'office ligne 318

3. **Marquer l'origine** de l'inscription année 2 (`PROMU` ou `REDOUBLANT`) pour
   que le motif de `historiqueClasse` soit juste : « Promotion » ou
   « Redoublement », pas « Promotion » pour tout le monde.

### ✅ Vérification

Après le seed, aucun élève ne doit avoir un `parcoursScolaire` 2024-2025 avec
`decision = 'Redoublement'` et une classe 2025-2026 d'un niveau supérieur. Une
requête de contrôle sur ce couple doit renvoyer zéro ligne.

---

## 04 — Seed TypeScript : les départs en cours de scolarité — ⏳ À FAIRE

> **Ce qui manque.** Dans le seed TypeScript, hors Terminale, *tout le monde*
> revient l'année suivante. Un établissement réel perd chaque année 3 à 5 % de
> son effectif : déménagement, transfert, abandon. L'analyse des motifs de
> transfert n'a aujourd'hui rien à lire.

**Fichier :** `prisma/seed-ambouli-classes.ts`, même boucle, avant la réinscription

1. Tirer environ **3 %** des élèves de l'année 1 — la même proportion que le
   seed SQL, pour que les deux jeux de données racontent la même école.
2. Ne pas les réinscrire en année 2 : `continue` avant l'affectation de classe.
3. Mettre à jour leur fiche : `statut` à `TRANSFERE` (ou `ABANDON`),
   `dateSortie` au 15 juillet 2025, et un `motifSortie` tiré parmi des motifs
   réalistes — déménagement, transfert vers un autre établissement, raisons
   familiales, raisons financières.
4. Clore leur `historiqueClasse` de l'année 1 avec cette même date de sortie.

### ✅ Vérification

Le nombre d'élèves au statut `ACTIF` en 2025-2026 doit être inférieur à celui de
2024-2025 diminué des seuls diplômés. L'écart correspond aux départs.

---

## 05 — Seed TypeScript : le parcours de la seconde année — ⏳ À FAIRE

> **Une seule année de parcours, pas de longitude.** Le seed ne crée un
> `parcoursScolaire` que pour 2024-2025 (boucle ligne 241). Comparer deux années
> demande deux points. C'est exactement ce qui bloque l'analyse d'efficacité du
> redoublement : elle veut mettre en regard la moyenne d'un redoublant avant et
> après.

**Fichier :** `prisma/seed-ambouli-classes.ts`, après la boucle de réinscription

1. Ajouter une boucle sur `eleveRegistryY2` qui crée un `parcoursScolaire` pour
   `2025-2026`, avec les mêmes champs que celui de l'année 1.

2. **Le point important :** la moyenne de l'année 2 d'un redoublant doit être
   *corrélée* à celle de l'année 1, pas retirée à neuf. Un élève qui redouble
   avec 8,5 progresse en général, mais modérément. Partir de `e.moyenneY1` et
   ajouter un gain aléatoire borné plutôt que d'appeler `gauss()` une seconde
   fois — sinon l'analyse du redoublement ne mesurera que du bruit.

3. Renseigner `rang` et `effectif` à partir de la classe réelle de l'année 2,
   pas avec `randInt(1, 30)` et `28` en dur comme aujourd'hui (ligne 251).

---

## 06 — Seed TypeScript : des bulletins qui disent la vérité — ⏳ À FAIRE

> **Des constantes déguisées en données.** Ces colonnes ne sont pas NULL dans le
> seed TypeScript — elles sont pires : identiques pour tous. Chaque bulletin de
> l'établissement affirme que la moyenne de classe est 11,2 et que le premier a
> 16,5. C'est immédiatement visible à l'écran dès qu'on ouvre deux bulletins de
> classes différentes.

**Fichier :** `prisma/seed-ambouli-notes.ts`, lignes 281–282 et 305–306

```ts
// ligne 281 — pour absolument tous les bulletins
  moyenneClasse: 11.2,
  moyennePremier: 16.5,
// ligne 305 — pour toutes les matières de tous les bulletins
  moyenneMax: 18,
  moyenneMin: 4,
```

### Ce qu'il faut faire

1. **Passer en deux temps**, comme dans le générateur SQL : d'abord calculer la
   moyenne de chaque élève de la classe pour la période, ensuite seulement
   écrire les bulletins. Aujourd'hui le bulletin est écrit élève par élève, sans
   jamais voir la classe entière — d'où les constantes.
2. `moyenneClasse` = moyenne des moyennes générales de la classe sur cette période.
3. `moyennePremier` = la plus haute d'entre elles.
4. `moyenneMax` / `moyenneMin` = la meilleure et la moins bonne note *de cette
   matière* dans cette classe.
5. `rang` = le vrai rang, déduit du tri des moyennes. Il est aujourd'hui tiré au
   sort par `randInt(1, eleves.length)` (ligne 270), ce qui produit des ex æquo
   impossibles et des premiers de classe à 7 de moyenne.
6. `nomProfesseur` = le nom de l'enseignant titulaire de la classe dans cette
   matière. Ce champ n'est aujourd'hui pas renseigné du tout.

---

## 07 — Seed TypeScript : un emploi du temps sans conflit — ⏳ À FAIRE

> **Le même défaut qu'en SQL, non corrigé.** L'emploi du temps du seed
> TypeScript souffre exactement des trois conflits qu'on vient d'éliminer côté
> SQL. Il n'est pas audité aujourd'hui, donc le problème est simplement
> invisible — pas absent.

**Fichier :** `prisma/seed-ambouli-notes.ts`, lignes 61–92

| Ligne | Code actuel | Conséquence |
|---|---|---|
| 77 | `pick(siteTeachers)` | N'importe quel professeur, y compris hors de sa spécialité, et sans vérifier s'il est déjà en cours ailleurs. |
| 87 | `` `Salle ${randInt(101, 203)}` `` | Salle tirée au hasard, sans vérifier qu'elle est libre — ni même qu'elle existe. |
| 65–75 | `usedSlots` | L'ensemble est réinitialisé à chaque matière : il empêche deux heures de maths au même moment, mais pas les maths et le français au même moment. |

### Deux options

1. **Porter la logique** de `construireEmploisDuTemps()` en TypeScript. Le plus
   propre, mais c'est une duplication : deux implémentations du même algorithme
   à maintenir.

2. **Recommandé —** extraire le planificateur dans un module partagé, importé à
   la fois par le seed TypeScript et par le générateur SQL. Une seule
   implémentation, une seule vérité sur ce qu'est un emploi du temps valide.

### ⚠️ Décision à prendre

L'option 2 demande un peu de réorganisation — le générateur SQL est en `.mjs` et
devra importer du TypeScript compilé, ou le module partagé devra rester en
JavaScript pur. À trancher avant de commencer l'étape.

---

## 08 — Vérification finale — ⏳ À FAIRE

### Les deux seeds doivent passer

```bash
# Le générateur SQL et son audit
pnpm seed:check
```

```bash
# Le seed TypeScript, sur une base jetable
pnpm db:seed:ambouli
```

### Les six analyses longitudinales

Elles vivent dans `src/lib/learnos/trajectoires-cohortes.ts`. Chacune doit
renvoyer des résultats non vides sur les deux jeux de données :

- **Efficacité du redoublement** — a besoin de deux parcours par redoublant *(étapes 03 et 05)*
- **Motifs de transfert** — a besoin des départs *(étape 04)*
- **Diplomation par cohorte** — a besoin de la chaîne complète jusqu'à la Terminale
- **Prédiction de remplissage des classes** — a besoin d'effectifs qui varient selon le flux

### ✅ Critère d'acceptation

Le seed SQL passe l'audit à **zéro erreur**, se charge sans erreur PostgreSQL,
et le seed TypeScript produit une population où le nombre d'élèves traversant
les deux années est cohérent avec les décisions inscrites dans leurs parcours.
