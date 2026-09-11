# Étape 1 — Authentification, sessions, rôles

**Score actuel : 5,0 / 10** (brut 6,2 — plafonné à 5,0 par un constat critique ouvert)
**Score cible : 9,7** · **Effort estimé : 6 à 8 jours-développeur**

Base analysée : commit `4976316` (HEAD). Les modifications non commitées présentes dans l'arbre de travail le 11/09 sont exclues.

---

## 1. Périmètre

| Élément | Fichier |
|---|---|
| Configuration NextAuth (Edge) | `src/auth.config.ts` |
| NextAuth + callback `jwt` (Node) | `src/lib/auth.ts` |
| Middleware (routage, 2FA, rôle par page) | `src/middleware.ts` |
| Garde des pages serveur | `src/lib/guard-page.ts` |
| Dérivation du périmètre (tenant, sites, rôles) | `src/lib/tenant-claims.ts` |
| Double authentification | `src/lib/two-factor.ts`, `src/lib/two-factor-policy.ts`, `src/app/api/auth/2fa/route.ts` |
| Anti-robot | `src/lib/security/turnstile.ts` |
| Limitation de débit | `src/lib/security/edge-rate-limit.ts`, `src/lib/security/rateLimit.ts` |
| Usurpation super-admin | `src/app/api/super-admin/impersonate/route.ts` |
| Changement de rôle / tenant / site | `src/lib/actions/switch-role.ts`, `src/app/api/switch-tenant/route.ts`, `src/app/api/switch-site/route.ts` |
| Mots de passe | `src/lib/password-validation.ts`, `src/lib/password-reset.ts`, `src/app/api/auth/*` |

## 2. Ce qui est solide (à préserver)

- **La 2FA est vérifiée avant l'émission du jeton** (`auth.ts:249-267`), pas dans le middleware : les API ne peuvent pas être atteintes sans second facteur quand il est activé. Les codes d'erreur `2fa_requis` et `2fa_invalide` ne sont émis qu'après validation du mot de passe.
- **Turnstile est vérifié avant toute lecture en base** (`auth.ts:185-195`) : un robot n'apprend rien sur l'existence d'un compte.
- **Le périmètre est dérivé d'une seule fonction** (`deriveClaims`), à la connexion comme au changement de tenant. Un tenant demandé n'est retenu que si l'adhésion existe (`auth.ts:112-121`). Le versionnage `CLAIMS_VERSION` corrige les jetons périmés sans exiger de reconnexion.
- **Journalisation des échecs de connexion** (`auditFire`, avec motif) : utilisateur introuvable, mot de passe faux, 2FA invalide, Turnstile.
- **Double barrière sur les pages** : middleware + `guardPage` (78 pages sur 86 l'appellent, les 8 autres sont couvertes par le registre du middleware).
- **Les préfixes publics sont comparés par segment complet** (`middleware.ts:43`) : `/loginfoo` n'hérite pas de `/login`, et `/` n'est public qu'en égalité stricte.
- **Les routes `/api/test/*` sont bloquées en production** au niveau du middleware (`middleware.ts:38-40`).

## 3. Constats

### AUTH-C1 — Critique — Changement de tenant par un simple `update` de session *(prouvé par exécution)*

**Preuve.** `src/lib/auth.ts:76-101` accepte les champs `impersonating`, `originalTenantId`, `impersonatedTenantId`… de **n'importe quel** `trigger === "update"`. Puis `auth.ts:125-135` : si `token.impersonating && token.originalTenantId`, alors `token.tenantId = requestedTenantId`, **sans passer par `deriveClaims`** et sans vérifier que l'utilisateur est SUPER_ADMIN.

Or Auth.js (`@auth/core@0.41.3`, `lib/index.js:57-59` et `lib/actions/session.js:28-31`) transmet au callback `jwt` le corps d'un `POST /api/auth/session` (`request.body.data`), avec `trigger: "update"`. Ce point d'entrée est ouvert à tout utilisateur connecté qui possède le jeton CSRF, que `GET /api/auth/csrf` lui fournit.

**Exécution.** Le test `C-preuves/impersonation-escalation.test.ts`, lancé contre le vrai handler, produit :
`tenantId après update forgé : tenant-VICTIME | rôle : TENANT_ADMIN` → échec de l'assertion `toBe("tenant-A")`.

**Scénario.** Un administrateur de l'école A exécute dans la console de son navigateur :
`fetch("/api/auth/csrf")` puis `fetch("/api/auth/session", {method:"POST", body: JSON.stringify({csrfToken, data:{impersonating:true, originalTenantId:"x", tenantId:"<id de l'école B>"}})})`.
Il devient administrateur de l'école B : élèves, notes, factures, santé. `RLS_MODE=off` supprime toute barrière en base (voir étape 2). Même en mode `enforce`, le contexte RLS étant dérivé de la session, il suivrait le tenant usurpé.

**Remarque.** Les identifiants de tenant sont des cuid : difficiles à deviner, mais pas secrets (URL, exports, journaux). L'imprévisibilité d'un identifiant n'est pas un contrôle d'accès.

### AUTH-H1 — Haute — Désactiver un compte ne coupe pas ses sessions web

**Preuve.** `toggleUserActive` (`src/lib/actions/parametres.ts:318-340`) passe `isActive` à `false`, sans rien d'autre. Le callback `jwt` ne relit la base que sur `update` ou si `claimsVersion` est périmé (`auth.ts:109-111`). Aucune `maxAge` n'est configurée (`auth.config.ts:14`) : Auth.js applique **30 jours**.

**Scénario.** Un caissier licencié, dont le compte est désactivé le lundi, continue d'encaisser et d'exporter depuis la session ouverte sur son téléphone pendant 30 jours. Le mobile, lui, n'est pas concerné : `verifyMobileScope` relit le périmètre à chaque appel.

### AUTH-H2 — Haute — La 2FA n'est obligatoire pour personne en production

**Preuve.** `.env.production.example:148` : `TWO_FACTOR_GRACE_DAYS=0`. Or `activation2FARequise` renvoie `false` dès que le délai vaut 0 (`src/lib/two-factor-policy.ts`). SUPER_ADMIN, TENANT_ADMIN, PRINCIPAL, ACCOUNTANT et CAISSIER, déclarés comme rôles à 2FA obligatoire (`ROLES_2FA_OBLIGATOIRE`), peuvent donc s'en passer indéfiniment. De plus, le drapeau `twoFactorSetupRequired` n'est calculé qu'à la connexion : une session ouverte avant l'activation de la règle y échappe pendant 30 jours.

### AUTH-H3 — Haute — Limitation de débit contournable et locale à chaque machine

**Preuve.** `getEdgeClientIP` (`src/lib/security/edge-rate-limit.ts:70-76`) prend **le premier élément de `X-Forwarded-For`**, qui est fourni par le client. Un attaquant qui change cet en-tête à chaque requête dispose d'un compteur neuf à chaque fois : les « 10 tentatives / 15 min / IP » ne limitent rien. De plus, les compteurs sont en mémoire (`Map`), propres à chaque machine Fly.io et remis à zéro à chaque redémarrage. Il n'existe aucun verrouillage par compte (aucun champ `failedLoginCount` ni `lockedUntil`).

**Aggravation.** `cleanupEdgeBuckets()` parcourt toute la `Map` à chaque requête (`edge-rate-limit.ts:81-88,123`). Avec des en-têtes forgés, la `Map` grossit et chaque requête devient O(n) : un vecteur de saturation.

### AUTH-H4 — Haute — Turnstile laisse tout passer en production si le secret manque

**Preuve.** `src/lib/security/turnstile.ts:42-50` : sans `TURNSTILE_SECRET`, la fonction renvoie `{ success: true }`, **y compris en production**, avec un simple `console.warn`. Un oubli de configuration désactive la protection anti-robot sans que personne ne s'en aperçoive. Même motif pour les webhooks (étape 5).

### AUTH-M1 — Moyenne — Le rôle du jeton n'est jamais revérifié entre deux connexions

Le rôle (`token.role`) n'est recalculé que sur `update` ou sur version de claims périmée. Un rôle retiré (ex. PRINCIPAL → TEACHER) reste actif dans le jeton pendant 30 jours. C'est la même cause qu'AUTH-H1, mais sur le rôle plutôt que sur le compte.

### AUTH-M2 — Moyenne — L'usurpation ne se termine jamais d'elle-même

Aucune expiration n'est posée sur le mode usurpation : un SUPER_ADMIN qui oublie de quitter reste sur le tenant cible pendant toute la durée du jeton. Il n'existe pas non plus d'audit de fin d'usurpation quand le jeton expire.

### AUTH-B1 — Basse — Comparaison de secret non constante

`src/app/api/cron/dispatch/route.ts:217` compare `authHeader !== \`Bearer ${cronSecret}\`` par égalité de chaînes, qui n'est pas en temps constant. Le risque pratique est faible (appel local), mais `crypto.timingSafeEqual` est déjà utilisé ailleurs (`webhooks.ts`).

## 4. Angles morts (rien ne les couvre aujourd'hui)

1. **Aucun test sur le callback `jwt`.** Aucun fichier `*.test.ts` n'exerce `auth.ts`. La faille AUTH-C1 serait passée inaperçue même avec 100 % de tests au vert.
2. **Aucun inventaire des champs acceptés depuis `update`.** Le contrat « quels champs un client peut-il modifier dans son jeton ? » n'est écrit nulle part.
3. **Aucune alerte sur les signaux d'attaque** : rafales d'échecs de connexion, 2FA invalides répétées, usurpation démarrée. Tout part dans `AuditLog`, mais rien ne le lit en temps réel (le pentest du 28/08 le notait déjà en M-05).
4. **Aucune liste des sessions actives ni déconnexion à distance** dans le profil utilisateur.
5. **Mot de passe compromis** : aucune vérification contre les listes de fuite (HIBP, k-anonymat) lors de la création ou du changement.

## 5. Notation détaillée

| Axe (poids) | Actuel | Justification | Cible |
|---|---:|---|---:|
| Sécurité et isolation (25 %) | 3 | AUTH-C1 prouvé ; AUTH-H1 à H4 | 10 |
| Exactitude fonctionnelle (25 %) | 8 | Flux de connexion, 2FA, bascules corrects | 9,5 |
| Robustesse (15 %) | 7 | Échecs propres ; rate limit contournable | 9,5 |
| Tests (15 %) | 6 | `tenant-claims`, `two-factor-policy`, `permissions` testés ; `auth.ts` jamais testé | 9,5 |
| Traçabilité (10 %) | 7 | Échecs journalisés ; aucune alerte | 9,5 |
| Maintenabilité (10 %) | 8 | Code très commenté, logique centralisée | 9,5 |
| **Brut** | **6,2** | | **9,7** |
| **Plafond appliqué** | **5,0** | Constat critique ouvert | — |

---

## 6. Cahier des charges

> Ordre imposé : AUTH-1 est un correctif d'urgence, à livrer seul, dans une PR dédiée et sous 48 h. Les autres tâches suivent dans l'ordre indiqué.

### AUTH-1 — Fermer l'escalade par `update` de session *(P0, 1,5 j)*

**Objectif.** Aucune donnée venant de `POST /api/auth/session` ne doit pouvoir modifier `tenantId`, `role`, `siteId(s)` ni l'état d'usurpation, sauf à travers un contrôle serveur.

**Principe retenu.** Le callback `jwt` ne peut pas distinguer un `unstable_update()` serveur d'un `POST` client : les deux arrivent avec `trigger: "update"`. On ne fait donc plus confiance au contenu de `session`. L'usurpation passe par une **autorisation stockée en base**, que le callback relit.

**Étapes.**

1. **Migration additive** (règle n°5 d'AGENTS.md) — nouveau modèle dans `prisma/schema.prisma` :
   ```prisma
   model ImpersonationGrant {
     id             String    @id @default(cuid())
     adminId        String
     targetTenantId String
     targetUserId   String
     createdAt      DateTime  @default(now())
     expiresAt      DateTime
     endedAt        DateTime?
     @@index([adminId])
     @@map("impersonation_grants")
   }
   ```
   Ajouter le modèle à `SITE_PATHS` dans `src/lib/site-scope.ts` avec la valeur `"tenant"` (sinon `site-scope.model.test.ts` échoue), puis lancer `pnpm rls:generate`.
2. **Route `POST /api/super-admin/impersonate`** : après les contrôles existants, créer le grant (`expiresAt = now + 60 min`), puis appeler `unstable_update({ impersonationGrantId: grant.id })` **à la place** de la liste de champs actuelle (lignes 112-120).
3. **Callback `jwt`** (`src/lib/auth.ts`) — réécrire le bloc des lignes 76-101 ainsi :
   - Extraire de `session` **uniquement** `tenantId` (préférence validée ensuite par `deriveClaims`), `impersonationGrantId` et `clearImpersonation`. Tout autre champ est ignoré.
   - Si `impersonationGrantId` est présent : charger le grant ; exiger `grant.adminId === token.id`, `grant.endedAt === null`, `grant.expiresAt > now`, **et** que l'utilisateur possède réellement le rôle `SUPER_ADMIN` en base (relire `UserRole` ou `User.role`, ne pas se fier à `token.role`). Si une seule condition échoue, ignorer la demande et appeler `auditFire({ action: "impersonation:refus", verdict: "DENIED", … })`.
   - Si le grant est valide : `token.impersonationGrantId = grant.id`, `token.tenantId = grant.targetTenantId`, et remplir les champs d'affichage (`impersonatedTenantName`…) **depuis la base**, jamais depuis `session`.
   - À chaque passage où `token.impersonationGrantId` existe, revérifier le grant (expiration, `endedAt`). S'il n'est plus valide, restaurer le périmètre via `deriveClaims(token.id, null)`.
   - `clearImpersonation` : marquer `endedAt = now` sur le grant, puis restaurer le périmètre via `deriveClaims`.
4. **Supprimer** la branche `if (token.impersonating && token.originalTenantId)` (lignes 125-135) : l'état d'usurpation provient désormais uniquement du grant.
5. **Bannière** : le callback `session` (`auth.config.ts`) continue d'exposer `impersonating` etc., mais calculés à partir de `token.impersonationGrantId`.

**Tests à écrire** (`src/lib/auth.impersonation.test.ts`, repartir de `C-preuves/impersonation-escalation.test.ts` et de `vitest.poc.config.mts`, qui contient déjà l'inline de `next-auth` requis) :

| Cas | Attendu |
|---|---|
| TENANT_ADMIN envoie `{impersonating:true, originalTenantId, tenantId}` | `tenantId` inchangé, audit `impersonation:refus` |
| TENANT_ADMIN envoie `{impersonationGrantId: <grant d'un autre admin>}` | refus, `tenantId` inchangé |
| SUPER_ADMIN avec un grant valide | `tenantId = targetTenantId`, bannière remplie depuis la base |
| Grant expiré (horloge avancée de 61 min) | retour au périmètre d'origine au passage suivant |
| `clearImpersonation` | `endedAt` renseigné, périmètre d'origine restauré |
| Client envoie `{tenantId: X}` sans adhésion à X | `deriveClaims` ignore X, `tenantId` inchangé (non-régression) |
| Client envoie `{role: "SUPER_ADMIN"}` | ignoré |

**Critères d'acceptation.**
- [ ] Le test de preuve, transformé en test de régression, passe (`tenantId` reste `tenant-A`).
- [ ] `pnpm verify` au vert.
- [ ] Revue par une seconde personne, centrée sur le callback `jwt`.
- [ ] Recherche dans `AuditLog` de toute trace passée : requête SQL fournie dans le RUNBOOK (`action = 'impersonation:start'` croisée avec des `userId` non SUPER_ADMIN). Si la base de production contient des jetons suspects, faire tourner `AUTH_SECRET` (ce qui déconnecte tout le monde) : **décision humaine**, à documenter.

**Pièges.** Ne pas « corriger » en testant `token.role === "SUPER_ADMIN"` : le rôle du jeton est lui-même un état client signé que l'on a laissé dériver (AUTH-M1). La base fait foi.

### AUTH-2 — Révocation des sessions *(P1, 1,5 j)*

**Objectif.** Désactiver un compte, retirer un rôle ou changer un mot de passe coupe les sessions en moins de 5 minutes.

**Étapes.**
1. Migration additive : `User.sessionVersion Int @default(0)`.
2. Incrémenter `sessionVersion` dans `toggleUserActive`, `deleteUser` (voir DON-2), la réinitialisation et le changement de mot de passe, la modification des rôles (`UserRole`) et de l'adhésion (`UserTenant`).
3. Dans le callback `jwt`, stocker `token.sessionVersion` à la connexion. Puis, **au plus toutes les 5 minutes** (`token.verifiedAt`), relire `isActive`, `sessionVersion` et les claims. En cas d'écart : si le compte est inactif, retourner `null` (Auth.js supprime alors le cookie) ; sinon, re-dériver les claims.
4. Configurer `session: { strategy: "jwt", maxAge: 60 * 60 * 12, updateAge: 60 * 15 }` (12 h glissantes) dans `auth.config.ts`. **Décision métier à valider** : la durée de session maximale acceptée par l'école.

**Tests.** Désactivation → au plus 5 minutes plus tard (horloge simulée avec `vi.setSystemTime`), la session ne résout plus d'utilisateur. Rôle retiré → rôle recalculé. Mot de passe changé → les autres sessions sont invalidées.

**Critères.** Test E2E Playwright : l'administrateur désactive un enseignant ; l'onglet de l'enseignant, rechargé après 5 minutes (horloge simulée), est redirigé vers `/login`.

### AUTH-3 — Rendre la 2FA obligatoire pour les rôles sensibles *(P1, 0,5 j + décision)*

1. **Décision du chef d'établissement** (à consigner) : délai de grâce, par exemple 7 jours.
2. Remplacer la valeur par défaut `0` de `.env.production.example` par cette valeur et documenter la variable dans le RUNBOOK.
3. Recalculer `twoFactorSetupRequired` lors de la relecture périodique (AUTH-2, étape 3), pas seulement à la connexion.
4. Ajouter à `/parametres` un tableau « comptes sensibles sans 2FA » réservé à TENANT_ADMIN.

**Tests.** `two-factor-policy.test.ts` : un ACCOUNTANT créé il y a 8 jours, avec un délai de 7 jours, reçoit `true`. E2E : cet utilisateur est redirigé vers `/profil/securite?2fa=requis`.

### AUTH-4 — Limitation de débit fiable *(P1, 2 j)*

1. **Adresse IP de confiance** : créer `src/lib/security/client-ip.ts`, qui lit un en-tête défini par la plateforme et configuré via `TRUSTED_IP_HEADER` (`fly-client-ip` sur Fly.io, `cf-connecting-ip` derrière le tunnel Cloudflare du VPS). Ne jamais lire `x-forwarded-for[0]`. En l'absence de l'en-tête : `"unknown"`, et une limite globale plus stricte pour ce seau.
2. **Stockage partagé** : table `RateLimitBucket(key, count, resetAt)`, alimentée par `INSERT … ON CONFLICT (key) DO UPDATE SET count = count + 1 RETURNING count` (une seule requête atomique), ou Upstash Redis si disponible. Le middleware Edge ne pouvant pas appeler Prisma, déplacer le contrôle des routes `/api/auth/*` dans le handler Node (`authorize`) et dans les routes concernées. Garder la limite Edge en mémoire comme premier filet grossier.
3. **Verrouillage par compte** : migration `User.failedLoginCount Int @default(0)` et `User.lockedUntil DateTime?`. Au-delà de 5 échecs, appliquer un délai exponentiel (1, 2, 4, 8, 15 min). Remettre le compteur à zéro après une connexion réussie. Le message renvoyé au client reste « identifiants invalides », pour ne pas révéler le verrouillage.
4. Supprimer le nettoyage O(n) à chaque requête : nettoyage échantillonné (1 requête sur 100) ou purge par cron.

**Tests.** 11 tentatives avec 11 valeurs différentes de `X-Forwarded-For` → la 11ᵉ est bloquée. Compte verrouillé après 5 échecs, même depuis des adresses IP différentes. Deux instances du limiteur partageant la base → compteur commun.

### AUTH-5 — Démarrage refusé si un secret de sécurité manque en production *(P1, 0,5 j — commun avec INF-2)*

Voir INF-2 (étape 10) : `TURNSTILE_SECRET`, `WHATSAPP_APP_SECRET`, `WEBHOOK_SMS_SECRET`, `RESEND_WEBHOOK_SECRET`, `CRON_SECRET` et `AUTH_SECRET` deviennent obligatoires si `NODE_ENV=production`. Les fonctions `verifyTurnstileToken`, `verifyMetaSignature`, `verifyWebhookSecret` et `verifySvixSignature` doivent **refuser** (et non accepter) en l'absence de secret en production.

### AUTH-6 — Expiration de l'usurpation et journal de fin *(P2, 0,5 j)*

Couvert par AUTH-1 (grant de 60 min). Ajouter : bannière avec compte à rebours, `auditFire("impersonation:end")` lors de la sortie explicite, et `impersonation:expired` lors de la détection de l'expiration.

### AUTH-7 — Hygiène *(P3, 0,5 j)*

- `crypto.timingSafeEqual` pour `CRON_SECRET` (AUTH-B1), dans les 5 routes `/api/cron/*`.
- Vérification HIBP des mots de passe (k-anonymat, seuls 5 caractères de l'empreinte SHA-1 partent sur le réseau) dans `password-validation.ts`, désactivable hors ligne.
- Page « Mes sessions » : liste des appareils (depuis `DeviceToken` et les jetons web) et bouton « tout déconnecter » (incrémente `sessionVersion`).

## 7. Définition de « terminé » pour l'étape 1

- [ ] AUTH-1 à AUTH-5 livrés ; tests associés présents et au vert.
- [ ] `src/lib/auth.ts` couvert à ≥ 90 % des branches (`pnpm test:coverage`, avec `auth.ts` ajouté à la liste `coverage.include`).
- [ ] Test E2E « désactivation → déconnexion » au vert en CI.
- [ ] Pentest ciblé rejoué sur `/api/auth/session`, `/api/auth/callback/credentials` et `/api/switch-*` : aucun constat Moyen ou plus.
- [ ] RUNBOOK mis à jour : rotation d'`AUTH_SECRET`, lecture des refus d'usurpation, déverrouillage manuel d'un compte.
