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

---

## 4. Résultat d'application — 23 septembre 2026

### 4.1 Ce qui est en production

| Commit | Objet |
|---|---|
| `8fe5421` | contexte RLS explicite dans `unstable_cache` + fallback `Response` du service worker |
| `b2bc1bf` | formatage de dates déterministe serveur/navigateur |
| `079e01a` | clés `conseilAugmente` + détecteur i18n des namespaces déstructurés |
| `3a0308f` | retrait du garde `useSession` sans `SessionProvider` |
| `a495333` | harnais d'audit UI complet (`pnpm demo:ui`) |
| `09eed16` | rapport d'audit i18n régénéré avec le détecteur corrigé |
| `e3a74c9` | bannière d'impersonation réservée aux super-admins (**4ᵉ correctif**) |

Déploiement : `flyctl deploy -a schoolpro` → *release 32*, image
`schoolpro:deployment-01M37DEMRMBV40W1117WZFJRQ1`, deux machines `started` (cdg).
Aucune migration, aucune écriture de données de production.

La décision laissée ouverte au §3 a été tranchée : **la ligne `scripts/demo/tmp-*`
n'a pas été ajoutée au `.gitignore`** (recommandation du plan suivie).

### 4.2 Contrôles effectivement exécutés

| Contrôle | Cible | Résultat | Preuve |
|---|---|---|---|
| `/api/health` | production | **200** | `database.ok=true` (145 ms), `rls.mode=enforce` |
| `/parametres/audit` se rend | build déployé, servi en local | **OK** | `h1="Journal d'audit"`, 0 erreur console |
| `/parametres/audit` sans `SessionProvider` | idem | **OK** | 0 erreur console |
| `/conseil-augmente` en-tête traduit | idem | **OK** | `h1="Conseil augmenté"` (mesure mobile) |
| `/devoirs` dates `jj/mm/aaaa` | idem | **OK** | `fr=23/09/2026 ×3`, `us=0`, 0 divergence d'hydratation |
| `/travail`, `/ma-journee` | idem | **OK** (refus attendu) | redirection `/acces-bloque` — rôle Directeur, règle 6 |
| Coquille workspace sans requête super-admin refusée | idem | **OK** | 0 erreur console, 0 échec HTTP |

Bilan de l'harnais : **10/10 contrôles** (santé de l'API incluse). `tsc --noEmit`
0 erreur, ESLint sans avertissement, **1 907/1 907 tests**, `prisma validate` OK.

L'harnais est désormais versionné — `scripts/demo/verifier-deploiement.mjs`,
exécutable par `pnpm demo:verifier-deploiement` — pour que ces contrôles ne
dépendent plus d'une procédure manuelle : connecteur unique (une seule tentative
de connexion), lecture seule, rapport dans `audit-reports/verification-deploiement.json`.

> Les trois correctifs restants n'ont **pas** pu être rejoués depuis un navigateur
> automatique contre `schoolpro.fly.dev` : le défi Cloudflare Turnstile y renvoie
> `Error: 600010` (`600*` = « échec générique / comportement de bot détecté »
> selon la documentation Cloudflare) et ne délivre aucun jeton — la vérification
> a donc été menée sur le **même build servi localement**, ce que le plan
> autorisait (« la base et le code sont identiques »).

### 4.3 Deux pièges de mesure corrigés dans l'harnais de vérification

1. **Le workspace rend chaque module dans une iframe** (`WindowFrame` →
   `${route}?embedded=1`). Mesurer `page.content()` sur l'URL nue ne renvoie que
   la coquille (dock, quadrants) : aucun `<h1>`, aucune date — d'où deux faux
   échecs au premier passage. Le harnais **commité** (`audit-ui-complet.mjs`,
   `capture-hydratation.mjs`) mesurait déjà `?embedded=1` : seul l'harnais
   temporaire de vérification était biaisé.
2. **`Header` s'auto-masque en mode embedded** (« la WindowFrame a déjà sa propre
   title bar »). Le titre `conseilAugmente.title` n'existe donc dans le DOM que
   par la **disposition mobile**, qui rend le contenu de page directement : c'est
   ce chemin qui a servi à prouver le correctif i18n.

### 4.4 Quatrième défaut applicatif : un 403 à chaque chargement d'écran

`ImpersonationBanner` est monté par le layout pour **tous** les rôles, alors qu'il
interroge `/api/super-admin/impersonate/status`, route réservée aux `SUPER_ADMIN`
par `authorizeSuperAdmin`. Chaque chargement d'écran produisait donc, dans le
workspace desktop :

- une requête réseau inutile, et
- `Failed to load resource: the server responded with a status of 403 (Forbidden)`
  en console — pour tout le monde sauf les super-admins.

C'est le seul « défaut » que la vérification remontait encore après les trois
premiers correctifs. Corrigé par `e3a74c9` : la bannière n'est montée que si
`currentRole === "SUPER_ADMIN"`. Le rôle reste `SUPER_ADMIN` pendant une
impersonation (le JWT conserve le rôle, seul le `tenantId` bascule), donc la
bannière — et son bouton « Quitter » — reste disponible pendant l'impersonation.
Contrôle après correctif : **0 erreur console, 0 échec HTTP**.

### 4.5 Diagnostic de connexion : Turnstile, pas le rate limiting

Le §3 supposait que « impossible de se connecter » venait du rate limiting
(10 tentatives / 15 min / IP). Le **journal d'audit de production** (les 60
dernières entrées `auth:login`, écrites avant toute session donc sans `tenantId`)
contredit cette hypothèse :

| Motif | Occurrences |
|---|---|
| `DENIED` — **Échec Turnstile** (`turnstileError: "token_manquant"`) | **42** |
| `DENIED` — Utilisateur introuvable | 12 |
| `DENIED` — Mot de passe incorrect | 6 |
| `DENIED` — **Rate limiting** | **0** |

Dernière entrée : `2026-09-23 12:54:38Z`, `admin@cite-ambouli.dj`,
`token_manquant`. Autrement dit : le formulaire partait **sans jeton anti-bot**,
et le serveur — `TURNSTILE_SECRET` configuré en production — rejetait la
connexion avant même de vérifier le mot de passe.

Ce que l'automatisation permet et ne permet pas de conclure :

- **Reproduit** : le widget ne délivre aucun jeton sur `schoolpro.fly.dev`. Dans
  un Chrome fenêtré piloté par Playwright, le défi répond `Error: 600010`
  (`600*` = échec générique, comportement de bot détecté) et n'insère aucune
  iframe. La clé de test Cloudflare `1x00000000000000000000AA` produit bien un
  jeton dans le même navigateur : le widget et la CSP (`frame-src
  'self' https://challenges.cloudflare.com`) sont donc correctement câblés, et
  la clé de production `0x4AAAAAAE0i9t0Fa7N9R0fV` est bien présente dans le
  bundle déployé.
- **Non concluant** : Cloudflare refuse *les navigateurs automatisés eux-mêmes*
  (`600*`), y compris en mode fenêtré. Aucune mesure automatique ne peut donc
  dire si un poste utilisateur réel passe. L'erreur `110200` (« domaine non
  autorisé », qui signalerait que `schoolpro.fly.dev` manque dans *Hostname
  Management*) n'a **pas** été observée.

Bénéfice déjà acquis : le garde client ajouté à la page de connexion empêche
désormais l'envoi d'une requête sans jeton et affiche un message explicite sur le
contrôle anti-bot, au lieu du « identifiants incorrects » trompeur.

### 4.6 Reste à faire (hors dépôt de code)

1. Ouvrir `/login` depuis un **poste réel** (sans extension type bloqueur, sans
   VPN) et vérifier que le défi se résout et qu'un jeton apparaît.
2. En cas d'échec persistant côté Cloudflare : contrôler *Hostname Management* du
   sitekey (l'erreur serait `110200`), puis, pour un échec `600*`, tester un autre
   réseau — la documentation Cloudflare cite extensions, VPN/proxy et
   restrictions réseau parmi les causes de `600*`.
3. Le rate limiting de l'authentification (10 tentatives / 15 min / IP) reste à
   instrumenter : il n'a produit **aucun** refus enregistré, mais il n'est pas
   journalisé — impossible aujourd'hui de le distinguer d'un simple échec
   d'identifiants dans l'audit.
