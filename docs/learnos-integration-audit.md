# Audit d'intégration LEARNOS — Phase 0

> Document produit conformément à l'instruction absolue des deux spécifications sources
> (`LEARNOS_AI_School_Operating_System_Integration.md` §5 et `LEARNOS_v2...md` §0) :
> *« Avant de coder, inspecter intégralement l'application existante. »*
> Date de l'audit : 2026-08-12. Codebase auditée : SchoolPro (`ecolpro`), commit `81d0bff`.

Pour chaque brique demandée par LEARNOS : **EXISTE** (réutiliser tel quel) / **PARTIEL** (étendre) / **N'EXISTE PAS** (créer).

## 1. Architecture

| Domaine | État | Détail |
|---|---|---|
| Frontend | EXISTE | Next.js 14 App Router, `src/app/(dashboard)/*`, composants React + Tailwind + Radix UI (`src/components/`) |
| Backend | EXISTE | Next.js Route Handlers (`src/app/api/**/route.ts`), Server Actions (`src/lib/actions/*.ts`) |
| Base de données | EXISTE | PostgreSQL + Prisma ORM, schéma unique `prisma/schema.prisma` (2076 lignes, 60+ modèles) |
| Authentification | EXISTE | NextAuth v5 (`src/lib/auth.ts`), credentials + bcrypt, JWT enrichi de `tenantId/role/siteId/siteIds` |
| RBAC | EXISTE | `src/lib/rbac.ts` — matrice `ROLE_PERMISSIONS` par rôle, `checkPermission()` dans chaque route |
| Multi-tenancy | EXISTE | `tenantId` sur (quasi) tous les modèles + `Tenant`/`Site`/`UserSite`/`EnseignantSite` |
| Isolation multi-site | EXISTE | Couche dédiée `src/lib/site-scope.ts` (`siteFilterForModel`, `mergeFilters`) + wrapper `prismaSiteScoped()` + **2 règles ESLint custom** (`ecolpro/require-site-filter`, `ecolpro/require-tenant-id`) qui font échouer le build si une requête Prisma sur un modèle sensible omet le filtre |

## 2. Entités pédagogiques existantes (à réutiliser, ne pas dupliquer)

| Concept LEARNOS | Modèle SchoolPro existant | État |
|---|---|---|
| Students / Teachers / Classes | `Eleve`, `Enseignant`, `Classe` | EXISTE |
| Subjects | `Matiere` | EXISTE |
| Attendance | `Absence` | EXISTE |
| Assignments / Assessments | `Evaluation` (type `CONTROLE/DEVOIR/EXAMEN/INTERROGATION/PROJET/ORAL/TP`) | EXISTE |
| Grades | `Note` (liée à `Evaluation`, `Eleve`, `Matiere`) | EXISTE |
| Examens formels | `Examen`, `SessionExamen` | EXISTE |
| Communication | `Conversation`, `Message`, dispatch multi-canal (`src/lib/notifications/dispatch.ts` : push FCM, SMS Twilio/Africa's Talking, WhatsApp, Telegram, email Resend) | EXISTE |
| Documents / rapports | `Document`, générateurs PDF (`src/lib/pdf/*`) | EXISTE |
| Curriculum Knowledge Graph (Subject→Chapter→Competency→Prerequisite) | — | **N'EXISTE PAS** |
| Learning Evidence | — | **N'EXISTE PAS** — la `Note` est la seule trace, sans lien vers une compétence |
| Student Learning Twin | — | **N'EXISTE PAS** |
| Question / Checkpoints de raisonnement | — | **N'EXISTE PAS** |
| Interventions pédagogiques | — | **N'EXISTE PAS** (à distinguer de `Sanction`, qui est disciplinaire) |
| AI decision log / explicabilité | `AuditLog` existe mais couvre uniquement les décisions RBAC (`ALLOWED`/`DENIED`), pas les recommandations IA | **PARTIEL** |
| Cours en ligne / contenu pédagogique | `Cours`, `ContenuCours`, `ProgressionEleve` — bibliothèque de contenu **indépendante des classes**, `ProgressionEleve.eleveId` est optionnel et non relié par FK (`eleveNom` en texte libre), **sans `tenantId` ni `siteId` propre** | **PARTIEL** — utilisable comme brique de contenu, mais `ProgressionEleve` a un défaut d'isolation à corriger avant d'y adosser quoi que ce soit (voir §5) |
| Règles d'appréciation configurables | `ReglesAppreciation` (seuils → libellés) | EXISTE — patron réutilisable pour les statuts de maîtrise |

## 3. IA existante

| Brique LEARNOS | État |
|---|---|
| AI Provider Abstraction | **PARTIEL** — `src/lib/ai/glm-client.ts` est un client unique et non abstrait (GLM via OpenRouter, payant à l'usage), utilisé par `api/ai/chat` (copilote emploi du temps avec function calling) et `api/ai/appreciation` (génération de texte). Aucune interface `AIProvider`, aucun fournisseur gratuit, aucun routeur de fallback. |
| LLM gratuit | **N'EXISTE PAS** — `GLM_API_KEY` est une clé OpenRouter payante à l'usage. Aucun fournisseur à palier gratuit n'est configuré. |
| Rules Engine / Deterministic | EXISTE implicitement (validations Zod, `financial-guard.ts`, `rbac.ts`) mais rien d'unifié pour la maîtrise/mastery |
| RAG / School Memory | **N'EXISTE PAS** |
| OCR / Computer Vision | **N'EXISTE PAS** |

## 4. Infrastructure transverse

| Besoin LEARNOS | État |
|---|---|
| Event Bus / domain events | **N'EXISTE PAS** — aucune couche d'événements ; les effets de bord sont appelés directement dans les Server Actions/routes |
| Traitement asynchrone / batch | **PARTIEL** — deux crons existants (`api/cron/dispatch-scheduled`, `api/cron/purge-sites`), mais **le plan Vercel est Hobby** (cf. commit `949d94d`/`16cb9fd` : cron ramené à fréquence quotidienne). Pas de file de jobs (pas de Bull/Redis en usage actif malgré `UPSTASH_REDIS_REST_URL` disponible dans `.env.example`). |
| Offline-first / faible bande passante | **PARTIEL** — app mobile Capacitor existe (`mobile-app/`), mais pas de sync queue ni de mode dégradé dédiés |
| Audit / traçabilité générique | EXISTE (`AuditLog` + `auditFire()`), pattern réutilisable |
| Notifications multi-canal | EXISTE (voir §2) — réutilisable telle quelle pour les alertes d'intervention |

## 5. Vulnérabilités à corriger avant toute intégration LEARNOS

L'ajout de données d'apprentissage individuelles (bien plus sensibles qu'une note) sur une couche d'isolation déjà imparfaite serait aggravant. État actuel (`pnpm run lint`, 2026-08-12) :

```
103 erreurs ecolpro/require-site-filter | ecolpro/require-tenant-id
  86 × require-site-filter (requêtes Prisma sans filtre de site, ou include non filtré)
  17 × require-tenant-id  (écriture par id sans vérification d'appartenance au tenant)
répartis sur 39 fichiers
```

Fichiers les plus critiques (données financières et RH, avant le reste) :
- `src/lib/actions/facture.ts` (8 occurrences), `src/lib/actions/facturation-avancee.ts` (11 occurrences)
- `src/lib/actions/parametres.ts` (5), `src/lib/actions/user-tenant.ts` (3), `src/lib/actions/register.ts` (2)
- `src/lib/auth.ts` (2), `src/lib/tenant-claims.ts` (2), `src/lib/financial-guard.ts` (5)
- `src/lib/import-eleves-server.ts` (3), `src/lib/attestation-generator.ts` (1), `src/lib/notifications/dispatch.ts` (2)
- 24 fichiers `src/app/api/**` et `src/app/(dashboard)/**` (académique/RH/vie scolaire)

Défaut de conception additionnel identifié : `ProgressionEleve` (modèle `Cours`) n'a ni `tenantId` ni `siteId` propres, et relie l'élève par un champ texte libre `eleveNom` plutôt qu'une clé étrangère `eleveId` — non conforme au patron du reste du schéma.

**Conclusion : la Phase 0 du plan d'implémentation (ci-joint, `docs/learnos-integration-plan.md`) traite en premier lieu ces 103 violations avant toute ligne de code LEARNOS.**

## 6. Composants UI réutilisables

`src/components/ui/*` (Radix-based design system), `src/components/{eleves,notes,examens,cours,rapports}/*` — patrons de dashboards, tableaux, cartes de stats déjà en place (ex. `RHView.tsx`, `NotesView` etc.) directement réutilisables pour les écrans « Ma classe », Teacher Copilot, School Intelligence.

## 7. Verdict global

L'application est un candidat solide pour LEARNOS : RBAC, multi-tenant, isolation par site et un client LLM existent déjà comme fondations. Les manques sont concentrés et bien délimités : graphe de curriculum, moteur de preuves, Learning Twin, moteur d'intervention, abstraction multi-fournisseur IA, event bus léger. Rien ne nécessite de reconstruire l'ERP existant — conforme au principe non négociable n°1 des deux spécifications.
