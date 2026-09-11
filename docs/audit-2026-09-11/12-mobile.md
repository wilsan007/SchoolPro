# Étape 12 — Application mobile et API mobile

**Score actuel : 7,4 / 10** (brut 7,4)
**Score cible : 9,7** · **Effort estimé : 3 à 4 jours-développeur**

---

## 1. Périmètre

`mobile-app/` (Expo 52, React Native 0.76, expo-secure-store), `mobile/` (Capacitor), `src/app/api/auth/mobile/route.ts`, `src/lib/mobile-auth.ts`, 22 routes `src/app/api/mobile/*`, `src/app/api/mobile/mobile.test.ts`.

## 2. Ce qui est solide

- **2FA appliquée à la connexion mobile** (`auth/mobile/route.ts`, contrôle de `twoFactorEnabled` puis `verifierCodeConnexion`) : aucun contournement de la 2FA web par l'application.
- **Périmètre relu en base à chaque appel** (`verifyMobileScope` → `deriveClaims`) : un rattachement révoqué prend effet immédiatement, contrairement au web (AUTH-H1).
- **Jeton stocké dans le trousseau sécurisé** (`expo-secure-store`, `mobile-app/lib/api.ts:18-28`).
- **Limitation de débit** sur la connexion mobile (10 tentatives / 15 min, avec la réserve AUTH-H3 sur l'adresse IP).
- **Les 22 routes mobiles s'authentifient toutes** via `verifyMobileScope` (vérifié fichier par fichier).
- **Plus de secret de repli** : `mobileSecret()` lève une erreur si `AUTH_SECRET` manque (pentest H-02 corrigé).

## 3. Constats

### MOB-M1 — Moyenne — Jeton de 30 jours, irrévocable, clé partagée avec le web

`auth/mobile/route.ts:29-33` : JWT HS256, valable 30 jours, signé avec `AUTH_SECRET` **brut** (`mobile-auth.ts:29`), sans `aud` ni `iss`, sans identifiant de jeton (`jti`) ni jeton de rafraîchissement. Conséquences :
- un téléphone perdu reste connecté 30 jours. La désactivation du compte bloque bien les appels (via `deriveClaims`), mais pas un changement de mot de passe, ni une « déconnexion de tous les appareils » ;
- un seul secret pour deux usages : tout autre JWT HS256 signé avec `AUTH_SECRET`, par exemple un futur outil interne, serait accepté comme jeton mobile, faute de contrôle d'audience.

### MOB-M2 — Moyenne — Time Machine depuis le mobile

`mobile/demo-now` (GET, POST, DELETE) expose la Time Machine à l'application, avec les mêmes risques qu'à l'étape 7 (TM-H1, TM-H2), et un corps sans validation Zod (API-M1).

### MOB-B1 — Basse — Chaîne d'outillage divergente

`mobile-app/` utilise `package-lock.json` (npm), alors que le dépôt impose pnpm (`AGENTS.md`). Ses dépendances ne sont couvertes ni par `pnpm audit` ni par Dependabot : `.github/dependabot.yml` ne déclare que `/` pour l’écosystème npm. Deux technologies mobiles coexistent (Expo dans `mobile-app/`, Capacitor dans `mobile/` et `capacitor.config.ts`) sans décision écrite sur celle qui sera maintenue.

## 4. Angles morts

1. **Aucun test de contrat** entre `mobile-app/lib/api.ts` et les 22 routes (voir TST, angles morts).
2. **Données hors ligne** : ce que l'application met en cache sur l'appareil (notes, factures, santé) et pour combien de temps n'est pas documenté.
3. **Notifications push** (`mobile/register-device`, `DeviceToken`) : aucune purge des jetons d'appareils inactifs, ni vérification que le jeton appartient à l'utilisateur à chaque envoi.

## 5. Notation

| Axe (poids) | Actuel | Justification | Cible |
|---|---:|---|---:|
| Sécurité (25 %) | 7 | 2FA et périmètre relu ; jeton long et irrévocable | 10 |
| Exactitude (25 %) | 8 | Routes scopées et testées | 9,5 |
| Robustesse (15 %) | 7 | Pas de rafraîchissement de jeton | 9,5 |
| Tests (15 %) | 7 | `mobile.test.ts` ; pas de contrat | 9,5 |
| Traçabilité (10 %) | 7 | Connexions auditées | 9,5 |
| Maintenabilité (10 %) | 8 | Code clair ; deux technologies | 9,5 |
| **Brut** | **7,4** | | |

---

## 6. Cahier des charges

### MOB-1 — Jetons courts, révocables, clé dédiée *(P1, 2 j)*

1. Nouvelle variable `MOBILE_JWT_SECRET` (≥ 32 octets, validée par INF-2). Jeton d'accès de 15 minutes avec `aud: "schoolpro-mobile"`, `iss: "schoolpro"` et `jti`, vérifiés par `jwtVerify(token, secret, { audience, issuer })`.
2. Jeton de rafraîchissement opaque (32 octets aléatoires), stocké **haché** en base (`MobileSession { id, userId, deviceId, hash, expiresAt, revokedAt, sessionVersion }`), valable 30 jours et **renouvelé à chaque usage**. Réutiliser un jeton déjà renouvelé révoque toute la famille de jetons (détection de vol).
3. Contrôle de `User.sessionVersion` (AUTH-2) à chaque rafraîchissement.
4. Application : intercepteur de `mobile-app/lib/api.ts` qui rafraîchit sur 401, puis renvoie vers la connexion si le rafraîchissement échoue.
5. Période de transition : accepter les anciens jetons 30 jours au plus, avec un avertissement dans les journaux.

**Tests.** Jeton d'accès expiré → 401 ; rafraîchissement → nouveau couple de jetons ; réutilisation d'un jeton de rafraîchissement déjà utilisé → toute la session révoquée ; changement de mot de passe → rafraîchissement refusé.

### MOB-2 — Time Machine mobile *(P2, 0,5 j)*

Appliquer TM-1 et TM-2 à `mobile/demo-now`, et valider le corps avec Zod.

### MOB-3 — Outillage et décision technologique *(P3, 0,5 j + décision)*

- **Décision** : Expo **ou** Capacitor. Archiver l'autre.
- Passer `mobile-app/` à pnpm (espace de travail déclaré dans `pnpm-workspace.yaml`), l'ajouter à Dependabot et à `pnpm audit` en CI.
- Test de contrat : schémas Zod partagés (`src/lib/mobile/contrats.ts`) utilisés par les routes **et** par l'application, avec un test qui valide les réponses réelles des 22 routes contre ces schémas.

## 7. Définition de « terminé »

- [ ] Jetons d'accès de 15 minutes, rafraîchissement révocable, clé dédiée.
- [ ] Contrats mobiles validés en CI.
- [ ] Une seule technologie mobile maintenue.
