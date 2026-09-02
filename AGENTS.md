# SchoolPro / LEARNOS — Règles du projet

## Gestionnaire de paquets

**TOUJOURS utiliser `pnpm` — JAMAIS `npm`.**

- Installation : `pnpm add <pkg>`
- Scripts : `pnpm <script>` (ex: `pnpm build`, `pnpm lint`, `pnpm test`)
- Prisma : `pnpm prisma <cmd>` (ou `npx prisma` reste acceptable si pnpm pose problème)
- Ne jamais utiliser `npm install`, `npm run`, `npx` pour des scripts du projet

## Stack technique

- Next.js 15 (App Router)
- TypeScript
- Prisma ORM + Supabase/PostgreSQL
- next-intl (traductions fr/en/so)
- Zod (validation)
- Vitest (tests)

## Commandes de vérification

```bash
pnpm build          # Build production (Next.js)
pnpm lint           # ESLint
pnpm test           # Vitest
pnpm tsc --noEmit   # Vérification de types seule
pnpm prisma generate # Régénérer le client Prisma après modif du schema
```

## Conventions LEARNOS

- Les modules LEARNOS vivent dans `src/lib/learnos/`
- Le moteur de recommandation est DÉTERMINISTE (aucun LLM pour les décisions)
- L'IA générative est cantonnée à : import de programme, proposition de prérequis, génération de questions
- L'IA propose, l'enseignant valide — jamais d'écriture automatique dans le graphe
- Les seuils par défaut sont dans `SEUILS_PAR_DEFAUT` (recommendation-engine.ts)
- La calibration des seuils par niveau × matière est dans `src/lib/learnos/calibration.ts`

## Structure du curriculum

- `Matiere` → `Chapitre` → `Competence` (auto-relation many-to-many pour les prérequis)
- `PlanificationChapitre` : répartition des chapitres sur l'année
- `PlanificationCompetence` : répartition des compétences dans un chapitre
- `EvenementCalendaire` : vacances, examens, jours fériés (respectés par la planification)

## Système d'apprentissage (intelligence pédagogique)

- `PatternPedagogique` : patterns détectés dans l'historique (moyenne, taux d'échec par niveau × matière × compétence)
- `PredictionDifficulte` : prédictions émises avant un chapitre, vérifiées a posteriori
- `CalibrationSeuil` : seuils ajustés par niveau × matière selon l'historique
- `JournalApprentissage` : trace d'audit de chaque analyse
- Aucun LLM dans l'analyse — statistiques pures et raisonnement sur graphe

## Règles non négociables

Ces règles sont inspirées du projet GOSE 2.0 (MENFOP Djibouti). Elles ne peuvent pas
être contournées sans approbation explicite et écrite. Un non-respect est un bug, pas
une préférence de style.

### 1. Aucune requête Prisma sans `tenantId` (sauf super-admin explicite)

Toute requête sur une table tenant-scopée DOIT inclure `tenantId` dans son `where`.
L'oubli provoque une fuite de données entre tenants. Les routes `SUPER_ADMIN` sont
l'unique exception et doivent être documentées comme telles.

### 2. Aucune requête de données scoping sans `anneeCourante` (sauf contexte explicite)

Les données pédagogiques (devoirs, notes, évaluations, absences, emplois du temps,
cahier-journal, etc.) DOIVENT être filtrées par l'année scolaire courante via
`getAnneeCouranteLibelle(tenantId)` ou `anneeActive()` (Time Machine). Une requête
sans filtre d'année mélange les données de toutes les années — c'est la cause du bug
qui a affecté 42 fichiers en août 2026.

### 3. Aucun calcul de note en flottant — utiliser des centièmes entiers

Les moyennes et calculs de notes DOIVENT utiliser la classe `Note` (`src/lib/domain/note.ts`)
qui stocke les valeurs en centièmes entiers (14,50 → `1450`). En binaire, `0.1 + 0.2 !== 0.3` ;
sur une moyenne pondérée de 10 matières, l'erreur cumulée peut faire basculer un rang
ou afficher « 10,00 » pour une moyenne réelle de 9,995. Les entiers suppriment cette
classe de défauts. La conversion en flottant ne se fait qu'au moment de l'affichage.

### 4. Aucun `any` TypeScript sans justification écrite

L'usage de `any` ou `@ts-ignore` doit être accompagné d'un commentaire expliquant
pourquoi le type ne peut pas être correctement annoté. La dette de types doit
rétrécir à chaque sprint, jamais grandir.

### 5. Migrations additives uniquement

Une migration ne supprime JAMAIS une colonne ou une table en une seule étape.
Procédure : (1) ajouter la nouvelle colonne, (2) déployer le code qui l'utilise,
(3) attendre confirmation que l'ancienne colonne n'est plus lue, (4) supprimer dans
une migration ultérieure. Chaque migration doit être idempotente (vérifier
l'existence avant d'ajouter).

### 6. Le cloisonnement par défaut est fermé (fail-closed)

En l'absence d'information de périmètre (tenantId, siteId, année), on refuse l'accès,
on ne l'accorde pas. Un `null` dans un filtre ne signifie pas « tous », il signifie
« aucun ». Voir `src/lib/site-scope.ts` — `DENY_ALL` est la valeur par défaut.

### 7. Le domaine métier est pur — aucun import de Prisma dans `src/lib/domain/`

La logique métier (calculs de moyennes, règles de validation, algorithmes de
recommandation) vit dans `src/lib/domain/` et ne dépend d'aucune infrastructure.
Cela permet de tester le domaine sans mocker Prisma, et de changer de ORM sans
réécrire la logique.

## Vérification continue

```bash
pnpm verify          # lint + tsc + tests + prisma validate + audit
pnpm verify:quick    # tsc + lint seulement (rapide)
pnpm test:coverage   # couverture de code
```

Le pre-commit hook (installer avec `node scripts/install-hooks.mjs`) exécute
`tsc --noEmit` et `next lint` avant chaque commit.
