# Seed SQL — Cité Scolaire Ambouli (Djibouti)

Ce dossier contient les fichiers SQL du seed pour la **Cité Scolaire Ambouli**,
un établissement pilote à Djibouti avec 2 sites (Ambouli + Arhiba), un collège
et un lycée par site, ~1200 élèves, enseignants, personnel, cursus complet,
facturation, vie scolaire, santé, RH, et le moteur pédagogique LEARNOS.

---

## Comment exécuter les fichiers SQL

### Option 1 — `psql` (ligne de commande, recommandé)

```bash
# Exécuter tous les fichiers en une seule transaction
psql "postgresql://user:password@host:5432/dbname" \
  -f prisma/sql/00-run-all.sql
```

Le fichier `00-run-all.sql` orchestre l'exécution de tous les fichiers
`01` → `13` dans l'ordre, à l'intérieur d'une transaction (`BEGIN` / `COMMIT`).
Si une erreur se produit, la transaction est annulée (rollback automatique).

> **Note sur `\i`** : la commande `\i` (include) est spécifique à `psql`.
> Les chemins sont relatifs au répertoire d'où `psql` est lancé.
> Lancez la commande depuis la **racine du projet** (`SchoolPro/`).

### Option 2 — Supabase SQL Editor

Le Supabase SQL Editor ne supporte pas la commande `\i`.
Il faut copier/coller le contenu de chaque fichier **dans l'ordre** :

1. Ouvrir le Supabase Dashboard → SQL Editor
2. Copier le contenu de `01-tenant-sites-structures.sql` → Run
3. Répéter pour `02`, `03`, … `13` dans l'ordre exact
4. Optionnellement, copier la section de vérification de `00-run-all.sql`
   (les `SELECT count(*) …`) pour valider les comptes

### Option 3 — `psql` fichier par fichier

```bash
for f in prisma/sql/0{1,2,3,4,5,6,7,8,9}-*.sql \
         prisma/sql/1{0,1,2,3}-*.sql; do
  echo "→ $f"
  psql "$DATABASE_URL" -f "$f"
done
```

### Option 4 — Script Prisma (seed TypeScript)

Le seed TypeScript équivalent existe dans `prisma/seed-ambouli*.ts` et peut
être exécuté via :

```bash
pnpm db:seed:ambouli
```

Les fichiers SQL de ce dossier sont une **alternative pure-SQL** au seed
TypeScript, utile pour les environnements où Prisma n'est pas disponible
ou pour initialiser une base Supabase cloud directement.

---

## Ordre d'exécution

Les fichiers **doivent** être exécutés dans l'ordre ci-dessous, car chaque
fichier dépend des données créées par les précédents (clés étrangères,
IDs déterministes).

| # | Fichier | Contenu |
|---|---------|---------|
| 01 | `01-tenant-sites-structures.sql` | Tenant (Cité Scolaire Ambouli), 2 sites (Ambouli, Arhiba), 4 structures (Collège + Lycée par site), utilisateur admin, SyncConfig |
| 02 | `02-annees-periodes-calendrier.sql` | 2 années scolaires (2024-2025 clôturée, 2025-2026 courante), 6 périodes (3 trimestres × 2 ans), événements calendaires (vacances, examens, jours fériés) |
| 03 | `03-matieres-salles-tarifs.sql` | 14 matières djiboutiennes **partagées** entre sites (siteId=NULL, visibles de tous les sites), 12 salles × 2 sites, tarifs par niveau × année × site (collège/lycée en DJF) |
| 04 | `04-users-staff-enseignants.sql` | Utilisateurs staff : 1 admin tenant, 4 principals (collège/lycée × 2 sites), 2 secretaries, 1 accountant, 4 supervisors (CPE), 2 nurses, 2 counselors, ~40 enseignants (20/site) avec spécialités ; FichesRH, BulletinsPaie, UserSite, EnseignantSite, DisponibiliteEnseignant |
| 05 | `05-classes-eleves-parents.sql` | Classes (6ème → Terminale, 3-4 par niveau), ~600 élèves/an/site (~1200 au total sur 2 ans), parents avec comptes utilisateurs, EleveParent, ParcoursScolaire, Alumni (terminales de 2024-2025) |
| 06 | `06-enseignants-disponibilites.sql` | Emplois du temps (EmploiTemps), disponibilités enseignants, associations enseignant ↔ classe ↔ matière |
| 07 | `07-notes-evaluations-bulletins.sql` | Évaluations (devoirs, contrôles, examens blancs), Notes par élève × évaluation, Bulletins trimestriels, BulletinMatiere, Examens (BFEM, Bac), SessionsExamen |
| 08 | `08-facturation-paiements.sql` | Factures par élève × année, échéanciers, échéances de paiement, paiements (~70% payées, ~20% en retard, ~10% en attente), relances (SMS, WhatsApp, email, courrier), exclusions pour impayés |
| 09 | `09-vie-scolaire-sanctions.sql` | Absences élèves (maladie, injustifiées, familiales, transport), incidents (retards, bavardages, bagarres, triche, vandalisme), sanctions (avertissement, blâme, exclusion de cours, convocation parents, TIG), entretiens CPE |
| 10 | `10-sante-rh-communication.sql` | Fiches sanitaires, passages infirmerie, dispenses de matière ; RH : absences/congés personnel, remplacements de cours ; Communication : notifications, conversations, messages, événements ; Gouvernance : conseils, réunions, résolutions ; Mentorat ; LMS : cours, contenus, progressions ; Inventaire ; Admissions (candidatures) ; Budget & dépenses ; Tâches du personnel |
| 11 | `11-learnos-curriculum.sql` | LEARNOS — graphe de connaissances : Chapitres (5-8 par matière × niveau), Compétences (3-5 par chapitre avec auto-relation prérequis), PlanificationChapitre (répartition sur l'année), PlanificationCompetence, SeuilsRecommandation, EvaluationCompetence |
| 12 | `12-learnos-apprentissage-exercices.sql` | LEARNOS — jumeau numérique : LearningEvidence (preuves issues des notes, 2 ans), StudentLearningProfile (état de maîtrise, tendance), Recommandation (CRITIQUE/FRAGILE/CONSOLIDE/AVANCE), StudentIntervention, PlanProgression + EtapePlan ; Exercices adaptés : Question, FeuilleExercices, ExerciceAssigne, ExerciceReponse |
| 13 | `13-learnos-intelligence.sql` | LEARNOS — intelligence pédagogique : PatternPedagogique (patterns historiques), PredictionDifficulte (prédictions + vérification), CalibrationSeuil, JournalApprentissage (trace d'audit), KpiSnapshot, AlerteParent, EchangeParent, PlanLecon, RubriqueEvaluation, AiDecisionLog, AiCache |

---

## Comptes de démonstration

Tous les comptes utilisent le même mot de passe :

> **Mot de passe :** `Ambouli@2026!`

| Email | Rôle | Description |
|-------|------|-------------|
| `admin@cite-ambouli.dj` | `TENANT_ADMIN` | Administrateur du tenant (Abdillahi Mahamoud) — accès complet à toute la cité scolaire |
| `principal-coll-amb@cite-ambouli.dj` | `PRINCIPAL` | Principal du Collège Ambouli (Omar Guelleh) |
| `principal-lycee-amb@cite-ambouli.dj` | `PRINCIPAL` | Principal du Lycée Ambouli (Khadra Hassan) |
| `principal-coll-arh@cite-ambouli.dj` | `PRINCIPAL` | Principal du Collège Arhiba (Said Waberi) |
| `principal-lycee-arh@cite-ambouli.dj` | `PRINCIPAL` | Principal du Lycée Arhiba (Fatima Aden) |
| `prof-ambouli-1@cite-ambouli.dj` | `TEACHER` | Enseignant site Ambouli (1er de la liste, ~40 enseignants au total) |
| `parent.farah.mahamoud.1@cite-ambouli.dj` | `PARENT` | Parent d'élève (Farah Mahamoud) — compte de démonstration pour tester le portail famille |
| `accountant-ambouli@cite-ambouli.dj` | `ACCOUNTANT` | Comptable de la cité scolaire — gestion factures, paiements, relances |

---

## IDs déterministes

Tous les enregistrements du seed utilisent des **IDs déterministes** (chaînes
lisibles, non des UUIDs aléatoires) pour garantir la reproductibilité et
permettre les `ON CONFLICT (id) DO NOTHING` (idempotence).

### Tenant

| ID | Valeur |
|----|--------|
| Tenant | `tenant-ambouli` |

### Sites

| ID | Nom | Code |
|----|-----|------|
| `site-ambouli` | Campus Ambouli | `AMB` |
| `site-arhiba` | Annexe Arhiba | `ARH` |

### Structures

| ID | Type | Site |
|----|------|------|
| `struct-coll-amb` | COLLEGE | Ambouli |
| `struct-lycee-amb` | LYCEE | Ambouli |
| `struct-coll-arh` | COLLEGE | Arhiba |
| `struct-lycee-arh` | LYCEE | Arhiba |

### Années scolaires

| ID | Libellé | Statut |
|----|---------|--------|
| `annee-2024-amb` | 2024-2025 | CLOTUREE |
| `annee-2025-amb` | 2025-2026 | OUVERTE (courante) |

### Périodes

Format : `per-{année}-t{trimestre}-amb`

Exemples : `per-y2024-t1-amb`, `per-y2025-t2-amb` (courante)

### Matières

Format : `mat-{code-matiere}` (partagées entre tous les sites, `siteId = NULL`)

Exemples : `mat-MATH`, `mat-FR`, `mat-PHILO`

Codes matières : `MATH`, `FR`, `ANG`, `AR`, `HG`, `PC`, `SVT`, `EPS`, `TECH`,
`ART`, `MUS`, `ISL`, `PHILO`, `SES`

> **Note** : Les matières sont partagées entre tous les sites (`siteId = NULL`).
> Le filtre de site (`SHARED_NULL_MODELS` dans `site-scope.ts`) inclut
> automatiquement les matières `NULL` pour tous les utilisateurs. Dupliquer
> "Français" par site casserait l'agrégation des notes, les bulletins, le
> curriculum et les analytics inter-sites.

### Salles

Format : `salle-{code-site}-{nom-normalisé}`

Exemples : `salle-AMB-salle-101`, `salle-ARH-labo-physique`, `salle-AMB-gymnase`

### Tarifs

Format : `tarif-{coll\|lycee}-{code-site}-{année}`

Exemples : `tarif-coll-AMB-2024-2025`, `tarif-lycee-ARH-2025-2026`

### Utilisateurs

| ID | Email |
|----|-------|
| `user-admin-amb` | admin@cite-ambouli.dj |
| `user-principal-coll-amb` | principal-coll-amb@cite-ambouli.dj |
| `user-principal-lycee-amb` | principal-lycee-amb@cite-ambouli.dj |
| `user-principal-coll-arh` | principal-coll-arh@cite-ambouli.dj |
| `user-principal-lycee-arh` | principal-lycee-arh@cite-ambouli.dj |
| `user-accountant-amb` | accountant-ambouli@cite-ambouli.dj |

### Enseignants

Format : `ens-{code-site}-{numéro}` (ex: `ens-AMB-1`, `ens-ARH-20`)

Association site : `enssite-{code-site}-{numéro}`

Fiche RH : `rh-{code-site}-{numéro}`

### SyncConfig

| ID | Description |
|----|-------------|
| `sync-ambouli` | Configuration de synchronisation (sauvegarde automatique PC local) |

---

## Vérification post-exécution

Le fichier `00-run-all.sql` contient une section de vérification finale qui
compte les enregistrements par table. Vous devriez voir des résultats
similaires à :

| Table | Ordre de grandeur attendu |
|-------|--------------------------|
| `tenants` | 1 |
| `sites` | 2 |
| `structures` | 4 |
| `annees_scolaires` | 2 |
| `periodes` | 6 |
| `matieres` | 14 (partagées entre sites) |
| `salles` | 24 (12 × 2 sites) |
| `tarifs_niveau` | 8 (2 niveaux × 2 ans × 2 sites) |
| `users` | ~55 (1 admin + 4 principals + 2 sec + 1 comptable + 4 CPE + 2 infirmières + 2 conseillers + ~40 enseignants) |
| `classes` | ~80 (2 ans × 2 sites × ~20 classes) |
| `eleves` | ~1200 (600/site/an, avec promotion) |
| `parents` | ~800 |
| `evaluations` | ~5000 |
| `notes` | ~60000 |
| `bulletins` | ~2400 |
| `factures` | ~2400 |
| `paiements` | ~5000 |
| `absences` | ~8000 |
| `learnos_chapitres` | ~200 |
| `learnos_competences` | ~700 |
| `learnos_learning_evidences` | ~50000 |
| `learnos_recommandations` | ~5000 |

---

## Notes techniques

- **Idempotence** : tous les `INSERT` utilisent `ON CONFLICT (id) DO NOTHING`,
  ce qui permet de ré-exécuter le seed sans erreur.
- **Transaction** : `00-run-all.sql` enveloppe tous les `\i` dans un
  `BEGIN TRANSACTION` / `COMMIT`. En cas d'erreur, tout est annulé.
- **Hash bcrypt** : le mot de passe `Ambouli@2026!` est hashé en bcrypt
  (cost 12) : `$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy`
- **Devise** : tous les montants sont en DJF (Francs Djiboutiens)
- **Langue** : français (`fr`), timezone `Africa/Djibouti`
- **Notation** : sur 20
