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
