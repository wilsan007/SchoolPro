# Adaptation du module Emploi du temps — Spécification INEA ↔ SchoolPro

Date : 2026-08-30
Portée : classification des classes, grille horaire dynamique, import d'EDT.

Ce document mappe la spécification fournie (3 modules interconnectés) sur
l'existant de SchoolPro, liste les écarts et les points d'attention pour une
réplication sur une autre plateforme (INEA).

---

## 1. État des lieux avant adaptation

| Module | État | Fichiers existants |
|--------|------|--------------------|
| 1 — Classification | ✅ Déjà en place (et **plus riche** que la spec) | `Structure`, `Classe`, `Matiere` (schema.prisma), `StructureManager.tsx`, `ClassesTab.tsx`, `school-groups.ts`, `utils-classe.ts`, `niveau-display.ts` |
| 2 — Grille dynamique | ❌ Manquant | — |
| 3 — Import EDT | ❌ Manquant (sauf `bulk-apply`) | `bulk-apply/route.ts` existant |

**Décision utilisateur : ne pas toucher au système de niveaux existant.** Le
code SchoolPro gère un **double modèle** de nommage (`ANNEES` = « 1ère année »…
« 9ème année », `FRANCAIS` = CI/CP/CE1…CM2/6ème…3ème/2nde/1ère/Terminale) via
`niveau-display.ts`, plus riche que la spec qui ne décrit que le système
djiboutien. Ce double modèle est conservé intact.

---

## 2. Ce qui a été implémenté

### Module 2 — Grille horaire dynamique (nouveau)

**Fichier :** `src/lib/grid-config.ts` (+ `grid-config.test.ts`, 14 tests)

| Fonction | Rôle |
|----------|------|
| `getGridConfig(structureType)` | Renvoie `{ stepMinutes, slotHeight, slots, durations, isFineGrid }` |
| `computeEndTime(heureDebut, durationMinutes)` | Calcule l'heure de fin |
| `getValidStartSlots(slots, durationMinutes)` | Filtre les slots de début valides (créneau avant 18:00) |
| `isFineGridType(structureType)` | `true` pour MATERNELLE/PRIMAIRE |
| `snapTimeToGrid` (dans import-parser) | Aligne une heure sur la grille (down/up) |

| Type structure | Pas | Hauteur | Durées |
|---------------|-----|---------|--------|
| MATERNELLE / PRIMAIRE | 10 min | 24px | 10, 15, 20, 30, 35, 45, 50 |
| COLLEGE / LYCEE | 30 min | 48px | 30, 60, 90, 120 |

Plage : 07:00 → 18:00. Limite : 12h45 (765 min/jour, `MAX_MINUTES_PAR_JOUR`).

**Indépendance vis-à-vis du modèle de niveaux :** `grid-config` se base
**uniquement** sur le `StructureType`, pas sur le libellé du niveau → compatible
avec les deux modèles (ANNEES et FRANCAIS).

### Module 3 — Import d'EDT (nouveau)

#### 3.1 Parser multi-format — `src/lib/import-parser.ts` (+ 24 tests)

Formats supportés :
- `.xlsx` → `exceljs`
- `.csv` / `.txt` → `papaparse`
- `.docx` → `jszip` (extraction XML `word/document.xml`, tables `<w:tbl>`)

Deux représentations reconnues automatiquement (`detectFormat`) :
- **LISTE** : `Jour | Heure début | Heure fin | Matière | Classe | Enseignant | Salle`
- **GRILLE** : `Horaire | Lundi | Mardi | …` (cellule = `Matière / Enseignant / Salle`)

Détection intelligente du contenu (`detectCellType`) :
- Récréation/Pause (`recreation, pause, déjeuner, libre, break, recess, lunch, rest, intercours`) → **ignorée**
- Évaluation (`evaluation, examen, controle, devoir, composition, interrogation, test, quiz`) → `isEvaluation=true`, matière « Évaluation »

Snapping à la grille : `snapTimeToGrid(time, stepMinutes, "down"|"up")` —
arrondi inférieur pour le début, supérieur pour la fin. Le pas dépend du type
de structure de la classe cible (10 ou 30 min).

Métadonnées `.docx` : extraction du texte hors tables pour détecter la classe
(`classe : 6ème A`) et l'année (`année scolaire : 2026-2027`). La table avec le
plus de colonnes est sélectionnée comme grille.

`parseMatiereNiveau("Lecture 1")` → `{ nom: "Lecture", niveau: "1" }`.

Réutilise `normalizeText` / `normalizeHeure` / `fuzzyFind` de `src/lib/text-match.ts`
(pas de duplication — conformément aux conventions du projet).

#### 3.2 Route API d'import (preview) — `src/app/api/emploi-du-temps/import/route.ts`

`POST /api/emploi-du-temps/import` — input `multipart/form-data { file, classeId }`.
**AUCUNE écriture en base** (aperçu uniquement).

Pipeline :
1. Auth + permission `emploi-du-temps:write` + `siteFilterForModel` (fail-closed)
2. Chargement de la classe (tenant + site + **année courante** via `getAnneeCouranteLibelle`)
3. Détermination du pas de grille selon le `StructureType` de la classe
4. Parsing du fichier (avec snapping)
5. Chargement des entités du tenant (matières, enseignants, salles — site-scopées)
6. Matching : matière (exacte nom+niveau → fuzzy → **à créer**), enseignant (exacte → fuzzy → non assigné), salle (normalisation vers nom officiel)
7. Détection des conflits : internes au lot + externes (autres classes, même année)
8. Totaux par jour (alerte si > 765 min)
9. Comparaison avec l'existant (inchangés / ajoutés / supprimés)

Output : `{ format, metaClasse, metaAnnee, warnings, stats, matieresACreer, creneaux, conflits, totauxParJour, comparaison, gridConfig }`.

**Génération de code matière :** `genererCodeMatiere(nom)` — 4 premiers
alphanum du nom normalisé, majuscules, non-alphanum → `X`, paddé avec `0`.
Ex : « Lecture » → `LECT`, « Physique-Chimie » → `PHYS`.

#### 3.3 Extension de `bulk-apply` (additive)

`src/app/api/emploi-du-temps/bulk-apply/route.ts` étendu pour supporter
l'auto-création de matières dans la **même transaction** que les créneaux :
- Nouveau champ optionnel `matieresACreer: [{ key, nom, code, niveau }]`
- Les créneaux peuvent référencer une matière à créer via `matiereACreerKey`
- `matiereId` rendu optionnel (refine : `matiereId` OU `matiereACreerKey` requis)
- **Atomicité :** si un conflit annule la transaction, aucune matière n'est créée
- **Upsert par code** pour éviter les doublons au sein du tenant
- Les appelants existants (sans `matieresACreer`) sont **inchangés** (additif)

#### 3.4 Interface — `src/components/emploi-du-temps/ImportEmploiModal.tsx`

Modal en 2 étapes :
1. **Sélection de la classe** : hiérarchie Structure → Niveau → Classes (tri par
   type), affichage du nombre de créneaux existants par classe.
2. **Upload + aperçu** : zone de dépôt (drag & drop), téléchargement d'un modèle
   CSV (format grille), puis affichage de : stats (total/OK/warnings/errors),
   format détecté, métadonnées .docx, matières auto-créées (badge vert + code),
   conflits, totaux par jour (alerte rouge si > 12h45), comparaison avec
   l'existant, tableau des créneaux avec statut par ligne. Bouton « Appliquer »
   → appelle `bulk-apply` (désactivé si erreurs ou conflits).

Intégré dans `EmploiDuTempsView.tsx` : bouton « Importer » dans la toolbar
(visible quand `!readOnly`). Après application, rechargement de la page pour
récupérer l'état cohérent (l'import remplace intégralement l'EDT).

i18n : clés ajoutées dans `fr.json`, `en.json`, `so.json` (namespace `emploi`).

---

## 3. Écarts avec la spécification

| Point spec | Implémentation SchoolPro | Justification |
|------------|--------------------------|---------------|
| Système djiboutien strict (1ère→1, 6ème→6, Seconde→10) | Double modèle ANNEES + FRANCAIS conservé | Décision utilisateur : « ne rien toucher ». Le nouveau code se base sur `StructureType`, pas sur le libellé du niveau → compatible avec les deux. |
| `school-groups.ts` à réécrire | Non modifié | Le code existant est plus riche et gère déjà la classification. |
| Exemple spec : « Évaluation » → code `VAL0` | `genererCodeMatiere("Évaluation")` → `EVAL` | La spec donne un exemple incohérent avec sa propre règle (« 4 premières lettres »). L'implémentation suit la **règle décrite** (4 premiers alphanum), qui donne `LECT` pour « Lecture » (conforme). `EVAL` est donc correct. |
| `normalizeText` à reproduire | Réutilise `src/lib/text-match.ts` | Pas de duplication (convention projet : réutiliser les utilitaires existants). |
| Auto-création dans la route preview | Auto-création reportée à `bulk-apply` (transaction) | La spec dit « preview = AUCUNE écriture » mais liste l'auto-création dans le pipeline preview. Résolution : la preview **propose** les matières à créer (code généré), la création effective se fait dans `bulk-apply` de façon atomique. |
| `periodeId` | Import cible `periodeId: null` (toute l'année) | L'EDT importé s'applique à l'année commune. La gestion par période existe déjà dans `bulk-apply`. |
| `revalidateTag("emploi-du-temps-data")` | `revalidatePath("/emploi-du-temps")` (existant) | Conserve le mécanisme de cache déjà en place dans `bulk-apply`. |

---

## 4. Règles non négociables respectées (AGENTS.md)

| Règle | Application |
|-------|-------------|
| 1. `tenantId` sur toute requête | ✅ Toutes les requêtes Prisma de la route d'import incluent `tenantId` |
| 2. Filtrage par `anneeCourante` | ✅ `getAnneeCouranteLibelle(tenantId)` sur la classe et les EDT existants/externes |
| 3. Notes en centièmes entiers | N/A (pas de calcul de note dans ce module) |
| 4. Pas de `any` sans justification | ✅ Un seul cast `as unknown as never` justifié (friction de types exceljs/@types/node) |
| 5. Migrations additives | ✅ Aucune migration DB nécessaire (schéma existant suffisant). Extension `bulk-apply` additive (champs optionnels). |
| 6. Fail-closed | ✅ `siteFilterForModel` sur toutes les requêtes ; `DENY_ALL` par défaut |
| 7. Domaine pur sans Prisma | ✅ `grid-config.ts` et `import-parser.ts` n'importent pas le client Prisma (uniquement des types `@prisma/client`) |

---

## 5. Dépendances

| Paquet | Statut | Usage |
|--------|--------|------|
| `exceljs` | ✅ déjà installé (`^4.4.0`) | Parsing `.xlsx` |
| `papaparse` | ✅ déjà installé (`^5.5.4`) | Parsing `.csv`/`.txt` |
| `jszip` | ✅ ajouté (`3.10.1`) | Parsing `.docx` (extraction XML) |
| `zod` | ✅ déjà installé (`^3.23.8`) | Validation des entrées API |

---

## 6. Fichiers créés / modifiés

### Créés
- `src/lib/grid-config.ts` — configuration grille dynamique
- `src/lib/grid-config.test.ts` — 14 tests
- `src/lib/import-parser.ts` — parser multi-format
- `src/lib/import-parser.test.ts` — 24 tests
- `src/app/api/emploi-du-temps/import/route.ts` — route preview
- `src/components/emploi-du-temps/ImportEmploiModal.tsx` — UI 2 étapes

### Modifiés (additif)
- `src/app/api/emploi-du-temps/bulk-apply/route.ts` — auto-création matières
- `src/components/emploi-du-temps/EmploiDuTempsView.tsx` — bouton Import + modal
- `src/i18n/{fr,en,so}.json` — clés d'import (namespace `emploi`)
- `package.json` — ajout `jszip`

---

## 7. Points d'attention pour une réplication (INEA)

1. **Système éducatif** : le mapping `NIVEAU_TO_YEAR` de `school-groups.ts` est
   spécifique. Pour un autre pays, recalculer Primaire/Collège/Lycée selon les
   années locales. SchoolPro gère deux modèles — un seul suffit sur une nouvelle
   plateforme mono-système.

2. **Multi-tenant / multi-site** : toutes les tables portent `tenantId` et
   `siteId`. Si la plateforme cible est mono-tenant, supprimer ces champs mais
   **garder la logique de filtrage** (fail-closed).

3. **Année scolaire** : chaque classe et créneau porte `annee`. L'import ne
   touche que l'année courante (`getAnneeCouranteLibelle`).

4. **Snapping** : le pas dépend du `StructureType` de la classe cible. Vérifier
   que la classe est bien rattachée à une `Structure` (sinon, grille standard
   30 min par défaut — fail-safe).

5. **Auto-création de matières** : se fait dans la transaction `bulk-apply`,
   pas dans la preview. Le code généré est un upsert par `(tenantId, code,
   niveau)` pour éviter les doublés.

6. **Conflits** : revalidés au moment de l'écriture dans `bulk-apply` (le plan
   a pu être généré minutes avant). Transaction annulée en cas de conflit.

7. **`.docx`** : le parsing XML par regex est robuste pour les tables Word
   standard mais peut échouer sur des documents très atypiques (tables
   imbriquées, drawings). Préférer le format `.xlsx` ou `.csv` pour les imports
   critiques.

8. **Tests** : 38 nouveaux tests couvrent `grid-config` et `import-parser`
   (détection de jours, types de cellules, snapping, parsing CSV grille/liste,
   métadonnées, formats non supportés).
