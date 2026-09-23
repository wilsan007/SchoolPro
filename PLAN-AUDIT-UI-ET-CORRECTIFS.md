# Plan — Audit UI, correctifs et incident de connexion

**Date** : 23 septembre 2026
**Branche** : `feat/rls-isolation-et-infra`
**Dernier commit déployé** : `8fe5421` — fix(rls) : contexte RLS explicite dans `unstable_cache` + fallback `Response.error()` dans le service worker
**Cible vérifiée** : production `https://schoolpro.fly.dev` + base Supabase `ndtaedcgwnaopopugiql`

---

## 1. Résumé exécutif

L'audit UI demandé (« vérifier que toutes les pages fonctionnent, que tous les boutons sont là et opèrent, que toutes les modales fonctionnent ») a été **créé de zéro puis exécuté sur les 77 écrans** de l'application.

| Résultat | Mesure |
|---|---|
| Écrans audités | 77 (66 rendus, 11 refusés par le contrôle de périmètre) |
| Boutons recensés / cliqués | 6 689 / 288 |
| Modales rencontrées / ouvertes | 37 / 37 (37 fermées par la croix, 27 par Échap) |
| Liens / champs / onglets | 3 924 / 1 080 / 11 |
| Écrans présentant un défaut applicatif réel | **9** |

**Trois défauts corrigés et vérifiés**, dont deux touchant tous les utilisateurs :

1. **Écran en erreur serveur** sur `/parametres/audit` et `/parametres/journal-emails` — `useSession()` appelé sans `SessionProvider`, lequel n'a jamais existé dans le dépôt.
2. **Dates en format américain** (8 emplacements) — `toLocaleDateString()` sans locale produisait `23/09/2026` côté serveur et `9/23/2026` côté navigateur, cassant l'hydratation React.
3. **En-tête non traduit** sur `/conseil-augmente` — clés `title`/`subtitle` absentes des trois langues.

---

## 2. État des lieux du dépôt

**Rien n'est commité.** Le working tree contient 17 fichiers modifiés (~148 insertions, ~63 suppressions) et 7 nouveaux.

**Fichiers modifiés**

- `src/app/(dashboard)/conseiller/page.tsx`, `devoirs/DevoirsManager.tsx`, `ma-journee/page.tsx`, `travail/page.tsx`
- `src/app/(dashboard)/parametres/audit/page.tsx`, `parametres/journal-emails/page.tsx`
- `src/components/learnos/CompetencesEleve.tsx`, `PlansAValider.tsx`, `PropositionsIaValidation.tsx`
- `src/components/super-admin/SuperAdminHealth.tsx`, `src/components/workspace/Dock.tsx`
- `src/i18n/fr.json`, `src/i18n/en.json`, `src/i18n/so.json`
- `scripts/i18n-audit.mjs`, `package.json`, `.gitignore`

**Fichiers nouveaux**

| Fichier | Rôle |
|---|---|
| `src/lib/format-date.ts` + `.test.ts` | Utilitaire de dates déterministe (8 cas de test) |
| `scripts/demo/audit-ui-complet.mjs` | Cœur de l'audit UI |
| `scripts/demo/lancer-audit-ui.sh` | Lancement détaché et journalisé |
| `scripts/demo/resume-audit-ui.py` | Consolidation des rapports d'audit |
| `scripts/demo/classer-erreurs-audit.py` | Sépare défauts réels et artefacts de mesure |
| `scripts/demo/capture-hydratation.mjs` | Capture intégrale des diffs d'hydratation React |

**Validations déjà passées** : `tsc --noEmit` 0 erreur · ESLint sans avertissement · **1 907/1 907 tests** · `prisma validate` OK · audit i18n : 0 clé manquante.

---

## 3. Phase 1 — Commiter et déployer les correctifs vérifiés

**Priorité P0 · effort ~20 min · risque faible**

Découpage en **4 commits**, chacun revertable indépendamment.

### Commit 1 — `fix(date): formatage déterministe serveur/navigateur`

Introduit `src/lib/format-date.ts` (`localeICU`, `formatDate`, `formatDateHeure`) et son test à 8 cas. Remplace les 8 appels non déterministes :

| Fichier | Avant | Après |
|---|---|---|
| `devoirs/DevoirsManager.tsx` | `new Date(x).toLocaleDateString()` | `formatDate(x, locale)` |
| `conseiller/page.tsx` | idem (composant serveur) | `formatDate(x, locale)` via `getLocale()` |
| `learnos/PropositionsIaValidation.tsx` | idem | idem |
| `learnos/PlansAValider.tsx` (2 appels) | idem | idem |
| `learnos/CompetencesEleve.tsx` | idem | idem |
| `super-admin/SuperAdminHealth.tsx` | `toLocaleDateString(undefined, …)` | `localeICU(locale)` |
| `travail/page.tsx` | `toLocaleDateString(undefined, …)` | `formatDate(x, locale, …)` |
| `ma-journee/page.tsx` (2 appels) | idem | idem |

**Preuve du défaut** — capturée par `capture-hydratation.mjs` sur `/devoirs`, le diff React est sans ambiguïté :

```
+   23/09/2026     ← rendu serveur (jj/mm/aaaa)
-   9/23/2026      ← rendu client (mm/jj/aaaa)
```

### Commit 2 — `fix(i18n): clés conseilAugmente + audit des namespaces déstructurés`

- Ajoute `title` et `subtitle` au namespace `conseilAugmente` en **fr / en / so**.
- Corrige `scripts/i18n-audit.mjs`, qui annonçait « 0 clé manquante » alors que le bug existait : il ne reconnaissait que `const t = getTranslations("ns")` et ignorait **56 déclarations** de la forme `const [session, t] = await Promise.all([…])`. Ces fichiers n'avaient donc **aucune clé vérifiée**.

### Commit 3 — `fix(parametres): retire le garde useSession sans SessionProvider`

Sur `/parametres/audit` et `/parametres/journal-emails`, le garde client `useSession()` levait `useSession must be wrapped in a <SessionProvider />` → **erreur serveur pour tout le monde, administrateurs compris**.

Le garde était **redondant** : le middleware (`canAccessRoute`) applique déjà `audit:read` / `parametres:read` et redirige vers `/acces-bloque`, et les routes API revérifient leurs permissions. La triple barrière était la seule à casser l'écran.

### Commit 4 — `test(ui): harnais d'audit UI complet`

Ajoute les scripts d'audit, le script npm `demo:ui`, et deux attributs d'ancrage dans `Dock.tsx` (`data-dock-group`, `data-dock-item`) pour énumérer les modules sans dépendre des classes Tailwind.

**Garantie lecture seule** : un garde-fou réseau intercepte toute méthode non-GET avant qu'elle n'atteigne le serveur. Aucune écriture possible, même par accident.

### Décision requise avant ce commit

La ligne `scripts/demo/tmp-*` ajoutée au `.gitignore`. **Recommandation : la retirer** — les fichiers temporaires ont été supprimés, et ce motif masquerait de futurs vrais fichiers.

### Vérification et déploiement

```bash
pnpm verify                      # lint + tsc + 1907 tests + prisma validate
git push origin feat/rls-isolation-et-infra
flyctl deploy -a schoolpro
```

| Contrôle post-déploiement | Attendu |
|---|---|
| `curl /api/health` | 200 |
| `/parametres/audit` | rendu, plus d'« application error » |
| `/conseil-augmente` | en-tête « Conseil augmenté » |
| `/devoirs` | date au format `jj/mm/aaaa` |

> Aucun changement de schéma, aucune écriture de données dans cette phase.
Un **quatrième problème, non applicatif**, a été identifié comme cause probable de « impossible de se connecter » : le **rate limiting sur l'authentification** (10 tentatives / 15 min / IP). Voir la phase 2 — c'est le point le plus urgent pour l'usage réel.