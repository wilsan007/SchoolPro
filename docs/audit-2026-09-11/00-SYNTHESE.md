# Audit SchoolPro / LEARNOS — Synthèse

**Date :** 11/09/2026 · **Base :** commit `4976316` (branche `feat/rls-isolation-et-infra`), analysé dans un worktree propre. Le travail non commité présent dans l'arbre de travail le même jour est traité à part (§ 7).
**Objectif fixé :** plateforme à **9,6**, aucun élément sous **9,7**.

---

## 1. Le verdict en une phrase

L'architecture est de bon niveau : isolation fermée par défaut, RLS prouvée en labo, bus d'événements idempotent, 2FA avant l'émission du jeton, 1 806 tests unitaires au vert. Mais **quatre défauts critiques sont exploitables ou actifs aujourd'hui** (dont deux prouvés par exécution), et la CI qui devait les empêcher **ne tourne plus depuis le 17 août**.

**Note de la plateforme : 6,5 / 10 en moyenne pondérée — plafonnée à 5,0 tant qu'un constat critique reste ouvert.**

## 2. Méthode

### 2.1 Ce qui a été fait

- **Mesures exécutées** sur HEAD : `tsc --noEmit` (0 erreur), `next lint` (0 erreur, 1 avertissement), `vitest run` (1 806 réussis sur 1 807 ; le seul échec vient du client Prisma régénéré par le travail non commité), `node scripts/i18n-audit.mjs` (0 clé manquante), `gh run list` (état de la CI).
- **Balayage outillé** des 266 routes API (`api-scan.mjs`) et des 86 pages (`gen-pages.mjs`), puis **vérification manuelle** de chaque signal suspect.
- **Lecture ligne à ligne** des zones à risque : authentification, middleware, isolation, cron, relances, bulletins, paiements, appel, bus d'événements, moteur de preuves, jumeau d'apprentissage, moteur de requêtes IA, Time Machine, Docker et Fly.io.
- **Deux preuves par exécution** (dossier `C-preuves/`) :
  - `impersonation-escalation.test.ts` : un TENANT_ADMIN bascule son jeton sur un autre établissement (`tenant-VICTIME`) via le vrai handler Auth.js ;
  - `relances-cron.test.ts` : 12 courriels de relance en une heure pour une seule facture, du niveau 1 au niveau 3 en 10 minutes.

### 2.2 Ce qui n'a pas été fait (limites)

- Aucun test contre une base réelle : ni E2E Playwright, ni labo RLS, ni production.
- Les workflows marqués « signaux » dans l'étape 4 n'ont pas été relus en entier : leurs notes sont des plafonds provisoires.
- Aucun test d'intrusion dynamique (hors les deux preuves) ni test de charge.
- Les constats sur les données de production (par exemple « combien de relances en double depuis le 09/09 ? ») exigent une requête en base, fournie dans les cahiers des charges mais **non exécutée**.

## 3. Barème (identique pour tous les éléments)

**Six axes pondérés :** sécurité et isolation 25 %, exactitude métier 25 %, robustesse 15 %, tests 15 %, traçabilité 10 %, maintenabilité 10 %.

**Plafonds :** un constat critique ouvert plafonne l'élément à **5,0** ; un constat haut à **7,0** ; un constat moyen à **8,5**.

**Conditions pour obtenir 9,7 ou plus :**
1. Aucun constat critique, haut ou moyen ouvert.
2. Chaque comportement et chaque **refus** (401/403/400/404) couvert par un test automatisé.
3. CI verte sur `main`, workflow Sécurité compris.
4. Relecture par une seconde personne.
5. Pour une page : aucune violation axe « serious » ou « critical », capture validée contre DESIGN.md.

**Plateforme :** moyenne pondérée des étapes. Les étapes de sécurité et de métier (1 à 4) pèsent 1,5, l'automatisation 1,25, le mobile 0,75, la Time Machine 0,5, les autres 1. La note de la plateforme est plafonnée par le constat le plus grave encore ouvert. **Atteindre 9,6 avec aucun élément sous 9,7 revient donc à amener chaque étape à 9,7.**

## 4. Tableau de bord

| # | Étape | Score | Crit. | Hautes | Moy. | Document |
|---|---|---:|---:|---:|---:|---|
| 1 | Authentification, sessions, rôles | **5,0** | 1 | 4 | 2 | `01-authentification-sessions.md` |
| 2 | Isolation tenant / site / année | **7,0** | 0 | 3 | 3 | `02-isolation-tenant-site-annee.md` |
| 3 | Couche API (266 routes) | **5,0** | 2 | 3 | 4 | `03-couche-api.md` + annexe A |
| 4 | Logique métier et workflows | **6,0** | 0 | 7 | 3 | `04-logique-metier.md` |
| 5 | Cron, événements, webhooks | **5,0** | 1 | 3 | 3 | `05-automatisation-cron-evenements-webhooks.md` |
| 6 | LEARNOS et IA | **6,9** | 0 | 1 | 5 | `06-learnos-ia.md` |
| 7 | Time Machine | **7,0** | 0 | 2 | 1 | `07-time-machine.md` |
| 8 | Pages, accessibilité, i18n, design | **6,8** | 0 | 0 | 4 | `08-pages-ui-a11y-i18n-design.md` + annexe B |
| 9 | Tests et CI | **6,2** | 0 | 2 | 3 | `09-tests-ci.md` |
| 10 | Infrastructure et exploitation | **5,9** | 0 | 3 | 4 | `10-infra-exploitation-observabilite.md` |
| 11 | Données et schéma | **6,0** | 0 | 2 | 5 | `11-donnees-schema.md` |
| 12 | Mobile | **7,4** | 0 | 0 | 2 | `12-mobile.md` |
| | **Plateforme (pondérée)** | **6,5 → 5,0** | **4** | **30** | **39** | |

**Détail élément par élément :** annexe A (266 routes : moyenne automatique 8,94, 97 à 9,7 ou plus, 21 sous 7) ; annexe B (86 pages : moyenne 7,78, aucune au-dessus de 9,0) ; étape 5 (14 tâches planifiées, 20 événements, 4 webhooks) ; étape 4 (15 workflows).

## 5. Les quatre critiques — à traiter sous 48 heures

| ID | Défaut | Preuve | Action immédiate |
|---|---|---|---|
| **AUTH-C1** | Tout utilisateur connecté peut basculer son jeton sur **n'importe quel établissement** en envoyant lui-même un `update` de session contenant les champs d'usurpation. | Exécution : `tenant-VICTIME`, rôle conservé (`src/lib/auth.ts:76-135`) | AUTH-1 : n'accepter l'usurpation que via une autorisation stockée en base et vérifiée |
| **API-C1** | Tout compte, parent compris, peut **clôturer, rouvrir ou archiver l'année scolaire**. | Lecture : `parametres/annees-scolaires/[id]/route.ts:44-100`, aucun contrôle de rôle | API-1 : permission dédiée `annees:gerer` |
| **API-C2** | Tout compte peut **changer des élèves de classe**, avec écriture d'historique hors du tenant. | Lecture : `eleves/changer-classe/route.ts`, `siteFilterForModel` renvoie `{}` pour les familles, `tx.*` sans `tenantId` | API-1 + ISO-1 + ISO-2 |
| **AUT-C1** | Les tâches « quotidiennes » tournent **12 fois par heure**, les mensuelles chaque jour. Les parents en retard de paiement reçoivent **12 relances par jour**, dont la « dernière relance avant mise en recouvrement » dès la 10ᵉ minute. | Exécution : 12 courriels en 1 h (`relances-cron.test.ts`) ; `crontab.txt:11` + `dispatch/route.ts:224-228` | **Tout de suite :** passer `relances-auto` à `heures: []` et déployer. Puis AUT-1 et MET-4 |

**Actions humaines associées** (je ne les ai pas faites) :
- vérifier dans la base de production si des relances multiples sont parties depuis le 09/09, puis décider d'un message aux familles ;
- rechercher dans `AuditLog` et dans les journaux d'accès des `POST /api/auth/session` suspects, puis décider d'une éventuelle rotation d'`AUTH_SECRET`.

## 6. Les 30 constats hauts

| Étape | IDs |
|---|---|
| 1 | AUTH-H1 sessions non révoquées à la désactivation (30 j) · H2 2FA obligatoire pour personne (`TWO_FACTOR_GRACE_DAYS=0`) · H3 limitation de débit contournable (`X-Forwarded-For`) · H4 Turnstile accepte tout si le secret manque |
| 2 | ISO-H1 RLS éteinte en production (`RLS_MODE=off`) · H2 filtre familles ouvert (`RELATION` → `{}`) · H3 lint aveugle aux transactions (`tx.*`) |
| 3 | API-H1 six mutations sans contrôle de rôle · H2 aucun contrôle systématique · H3 18 mutations auditées sur 173, 27 suppressions sur 33 sans trace |
| 4 | MET-H1 règle des centièmes non appliquée (4 calculs de moyenne) · H2 bulletins publiés réécrits · H3 rang sans ex-aequo · H4 relances sans délai ni plafond · H5 double encaissement · H6 appel qui renvoie SMS et WhatsApp à chaque enregistrement · H7 suppression d'utilisateur destructrice et inter-établissements |
| 5 | AUT-H1 tâches exécutées par chaque machine · H2 verrou des notifications non atomique · H3 webhooks ouverts si le secret manque |
| 6 | IA-H1 corriger une note double les preuves et fausse les profils |
| 7 | TM-H1 écritures calculées sur des lectures tronquées · H2 Time Machine disponible dans les écoles réelles |
| 9 | TST-H1 CI inactive depuis le 17/08, workflow Sécurité jamais exécuté, déploiement sans contrôle de types · H2 E2E impossibles en CI (chemin macOS) |
| 10 | INF-H1 aucune supervision · H2 aucune validation de configuration · H3 cinq cibles de déploiement, RUNBOOK limité au VPS |
| 11 | DON-H1 suppression d'établissement en un appel · H2 cascades sur les données financières |

## 7. Travail en cours dans l'arbre de travail — à lire avant de continuer

Le 11/09, pendant l'audit, l'arbre de travail contenait des modifications non commitées qui **suivent l'ancien cahier des charges** : gestionnaires `note-updated`, `note-deleted` et `evaluation-completed`, table `learnosEventDeadletter` avec sa migration, modifications de `event-bus.ts`, `events.ts`, `facture.ts`, `prisma.ts`. En l'état :
- **`tsc` échoue** avec 10 erreurs (`facture.ts` ×6, `facturation/page.tsx` ×1, `evaluation-completed.ts` ×3) ;
- le test `site-scope.model.test.ts` échoue (nouveau modèle sans chemin de site) ;
- la table de lettres mortes **fait doublon** avec l'existant (les événements abandonnés restent en base avec `lastError`, voir l'étape 5) ;
- `evaluation.completed` n'est publié par aucun code : son gestionnaire ne s'exécuterait jamais.

Recommandation : suspendre ce travail et le reprendre selon IA-1 (étape 6) et AUT-2 (étape 5). Je n'ai modifié aucun de ces fichiers.

## 8. Ce que l'audit précédent affirmait à tort

| Affirmation précédente | Réalité vérifiée |
|---|---|
| « 3 à 10 gestionnaires d'événements manquants sur 25 » | Les 20 types publiés ont tous un gestionnaire testé ; 3 types sont réservés et **non publiés** (`events.ts:37-43`) |
| « `replayEvents` n'existe pas » | Il existe (`event-bus.ts`) |
| « Aucune file de lettres mortes » | Elle existe de fait (`attempts`, `lastError`, `eventBacklog`) |
| « Aucune API LEARNOS (`/api/learnos/*` introuvable) » | **43 routes** `src/app/api/learnos/**` |
| « RLS non systématique », « pas de rate limiting », « CAPTCHA absent » | RLS conçue, générée et prouvée en labo… mais **éteinte** ; limitation de débit présente mais **contournable** ; Turnstile présent mais **ouvert si le secret manque** |
| « Time Machine non intégrée à LEARNOS » | `getDemoNow` est utilisé dans 72 fichiers, et l'horizon est posé dans le client Prisma |
| Tests Cypress, métriques `prom-client`, modèle `claude-3-sonnet` | Le projet utilise Playwright, n'a aucune supervision, et route les appels vers Ollama, Groq, OpenRouter et GLM |
| 54 domaines notés entre 6,8 et 8,5 | Notes attribuées **sans lecture** des fichiers |
| Plateforme 7,62, puis 6,2 | Aucun de ces deux chiffres n'était mesuré |

**Et ce qu'il n'avait pas vu :** les quatre critiques, IA-H1, les bulletins publiés réécrits, le double encaissement, l'appel qui renvoie des SMS à chaque enregistrement, la CI arrêtée.

## 9. Feuille de route

L'effort cumulé des cahiers des charges est d'**environ 85 à 113 jours-développeur**, avec des recouvrements. Avec 3 développeurs et une personne chargée des revues, compter **9 à 11 semaines**, hors délais de décision.

### Phase 0 — 48 heures : arrêter les dégâts (≈ 5 jours-développeur)

1. `relances-auto` désactivé (une ligne), déployé.
2. **AUTH-1** (usurpation), **API-1** (année scolaire, changement de classe), **AUT-4** (webhooks fermés sans secret), en une PR d'urgence relue.
3. **TST-1** : protection de `main`, workflow Sécurité fusionné, déploiement conditionné à la CI.

### Phase 1 — semaines 1 et 2 : fermer les hauts de sécurité et d'intégrité

ISO-1, ISO-2 · API-2, API-3 · AUTH-2 à AUTH-5 · AUT-1 (planification exacte), MET-4 (relances) · MET-2 (bulletins publiés), MET-5 (encaissement), MET-6 (appel), MET-7 (suppression d'utilisateur) · IA-1 (preuves stables) · TM-1, TM-2 · INF-1, INF-2 · DON-1, DON-2 · TST-2, TST-3.
**Sortie de phase :** plus aucun critique, ni haut de sécurité. Plateforme attendue autour de 7,5.

### Phase 2 — semaines 3 à 6 : fiabilité, traçabilité, exactitude

MET-1 et MET-3 (moyennes en centièmes, génération des bulletins) · API-4 (audit de toutes les mutations), API-5 · ISO-3, ISO-4 (RLS `warn` puis `enforce`), ISO-5 · AUT-2, AUT-3, AUT-5 · IA-2, IA-3 · INF-3 à INF-5 · UI-1, UI-2 · MOB-1 · TST-5 · DON-3, DON-6.
**Sortie de phase :** plus aucun haut. Plateforme attendue autour de 8,7.

### Phase 3 — semaines 7 à 11 : finition vers 9,7

UI-3 à UI-6 · API-6 à API-8 · IA-4 à IA-6 · INF-6 à INF-8 · ISO-6 · AUT-6 · TM-3, TM-4 · DON-4, DON-5, DON-7 · MOB-2, MOB-3 · relecture complète des workflows « signaux » (étape 4) · régénération des annexes A et B.
**Sortie :** tous les éléments à 9,7 ou plus ; plateforme ≥ 9,6.

### Dépendances clés

- AUTH-2 (version de session) est un prérequis de MET-7 et de MOB-1.
- ISO-1 et ISO-2 précèdent ISO-4 (RLS `enforce`).
- AUT-1 (journal des tâches) précède INF-4 (alertes « tâche non exécutée »).
- MET-1 (domaine des moyennes) précède MET-3 et les écrans analytiques.
- INF-2 (validation de la configuration) rend effectifs AUTH-5 et AUT-4.

## 10. Décisions qui vous reviennent

Les cahiers des charges ne peuvent pas trancher ces points :

1. Cible de production unique : Fly.io + Supabase **ou** VPS (INF-1).
2. Délai de grâce de la 2FA pour les rôles sensibles (AUTH-3) et durée maximale de session (AUTH-2).
3. Qui peut clôturer l'année (PRINCIPAL ?) et qui peut changer un élève de classe (ACCOUNTANT ?) (API-1).
4. Règle d'arrondi officielle des moyennes (MET-1).
5. Délais entre les niveaux de relance et message aux familles déjà touchées (MET-4).
6. Appel par séance ou par demi-journée (MET-6).
7. Fournisseurs d'IA autorisés et registre des flux (IA-4).
8. Durées de conservation des données et délai avant purge d'un établissement supprimé (DON-2, DON-7).
9. Technologie mobile conservée : Expo ou Capacitor (MOB-3).
10. Traducteur somaliphone pour les 587 chaînes restantes (UI-4).
11. Validation de la table de correspondance des couleurs avec DESIGN.md (UI-3).

## 11. Index des documents

| Fichier | Contenu |
|---|---|
| `00-SYNTHESE.md` | Ce document |
| `01` à `12-*.md` | Une étape par fichier : périmètre, points solides, constats avec preuve, angles morts, notation, cahier des charges (tâches numérotées, fichiers, étapes, tests, critères d'acceptation), définition de « terminé » |
| `A-inventaire-routes-api.md` | 266 routes notées une par une, avec motifs |
| `B-inventaire-pages.md` | 86 pages notées une par une, avec motifs |
| `C-preuves/` | Deux tests d'exécution qui échouent sur HEAD (ils deviendront les tests de régression) et leur configuration Vitest |
| `outils/` | Scripts de balayage (`api-scan.mjs`, `gen-annexes.mjs`, `gen-pages.mjs`) pour régénérer les annexes après correction |
