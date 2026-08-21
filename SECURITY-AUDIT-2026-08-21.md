# Audit de sécurité — ecolemiriam.com — 2026-08-21

Audit white-box (accès au code + root sur le VPS) réalisé sur l'infrastructure
de production, à la demande du propriétaire, avant diffusion large du site.

**Verdict global** : la couche applicative est solide (isolation multi-tenant,
protection IDOR, rate-limiting, en-têtes, cookies, pas d'injection SQL/XSS).
Le point faible réel était **le VPS lui-même, non durci et sous attaque
active**. Corrigé pour l'essentiel ; une étape (pare-feu) reste à lancer par le
propriétaire.

---

## CRITIQUE — VPS non durci, force brute SSH active

**Constat.** Au moment de l'audit :

- `PasswordAuthentication yes` + `PermitRootLogin yes` — connexion root par
  mot de passe ouverte à tout Internet ;
- **89 416 tentatives de connexion SSH échouées** dans les journaux — la
  machine était activement attaquée ;
- aucun pare-feu (`ufw` inactif), aucun fail2ban ;
- toutes les données (élèves, parents, finances) à un mot de passe faible de
  la compromission totale.

**Corrigé (2026-08-21).**

- SSH passé en **clé uniquement** : `/etc/ssh/sshd_config.d/99-ecolemiriam-hardening.conf`
  (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`,
  `MaxAuthTries 3`, `KbdInteractiveAuthentication no`, `X11Forwarding no`).
  La ligne contradictoire de `50-cloud-init.conf` a été neutralisée.
  Accès par clé vérifié avant et après.
- **fail2ban** installé et actif (prison `sshd`, ban 24 h après 3 échecs).
  Un attaquant banni dans les premières secondes.
- Règle **anti-contournement Docker** ajoutée à `/etc/ufw/after.rules`
  (Docker écrit ses règles en amont d'UFW ; sans cela un port publié par un
  conteneur serait joignable malgré UFW).

**Pare-feu UFW activé (2026-08-21).** `default deny incoming`, seul le port
22/tcp ouvert, actif et persistant au redémarrage. Activé avec un filet de
sécurité (rollback auto), puis vérifié : accès SSH OK, app OK, site public en
200 via Cloudflare. Règle anti-contournement Docker en place.

> Le web ne nécessite AUCUN port entrant : le trafic arrive par le tunnel
> Cloudflare (sortant). Seul le port 22 (SSH) reste ouvert.

**Durcissement complémentaire recommandé** (le dépôt fournit
`docker/scripts/harden-os.sh`, plus complet : sysctl, mises à jour
automatiques, etc.). À exécuter à tête reposée.

---

## Secrets de repli en dur (corrigé — code)

Deux secrets par défaut publics permettaient, en l'absence de configuration,
de forger des jetons ou de valider un webhook.

| Fichier | Avant | Après |
| --- | --- | --- |
| `src/app/api/auth/mobile/route.ts` | `?? "ecolpro-dev-secret"` à la **signature** des jetons | secret centralisé `mobileSecret()`, **erreur bloquante en prod** si `AUTH_SECRET` absent |
| `src/lib/mobile-auth.ts` | garde prod déjà présente à la **vérification** | `mobileSecret()` exporté = source unique |
| `src/app/api/webhooks/whatsapp/route.ts` | `?? "ecolpro_whatsapp_token"` | pas de valeur par défaut en prod (handshake refusé) ; les messages restent protégés par signature HMAC |

---

## Endpoints de test exposés en production (corrigé — code)

`/api/test/setup-links` (écrivait des données via un simple GET, sans contrôle
de rôle), `/api/test/telegram` et `/api/test/whatsapp` (envoi de messages vers
des numéros arbitraires — abus du budget SMS/WhatsApp de l'école).

**Corrigé** : `src/middleware.ts` bloque tout `/api/test/*` en production (404),
point de contrôle unique qu'aucun futur endpoint de test ne peut contourner.

---

## Régression CSP dans le dépôt (corrigé — code)

L'image déployée émettait une CSP stricte ; le dépôt, lui, l'avait **affaiblie**
(`'unsafe-eval'` ajouté, `http://localhost:*` et des domaines cloud résiduels
netlify/vercel/pages.dev, durcissement `worker-src`/`frame-src`/
`block-all-mixed-content` perdu). Un redéploiement du code aurait dégradé la
sécurité.

**Corrigé** dans `next.config.ts` : `'unsafe-eval'` et `localhost` réservés au
dev uniquement ; jokers cloud retirés ; `frame-src 'none'`, `worker-src`,
`manifest-src`, `block-all-mixed-content` rétablis ; `Permissions-Policy`
étendue.

> Note : deux en-têtes CSP arrivent en ligne (l'origine + une couche edge).
> À unifier côté Cloudflare/Caddy pour éviter toute confusion, mais l'effet
> combiné reste restrictif.

---

## Dépendances vulnérables (corrigé — 3 critiques éliminées)

`pnpm audit` remontait 20 vulnérabilités (3 critiques). Après correction : 4,
toutes de niveau build-time à faible exploitabilité réelle.

| Paquet | Avant | Action | Après |
| --- | --- | --- | --- |
| `next-auth` | `5.0.0-beta.31` — 2 CRITIQUES (bypass email homoglyphe, config existence-based) + DoS `getToken()` (utilisé par le middleware) | bump | `5.0.0-beta.32` (hors plage vulnérable) |
| `@auth/core` | `0.41.2` (CRITIQUE) tiré par un adaptateur inutilisé | voir ci-dessous | `>=0.41.3` |
| `@auth/prisma-adapter` | présent mais **jamais câblé** (sessions JWT) — seule source de la critique restante | **supprimé** | absent |
| `sharp` | `0.33.5` (HIGH, libvips CVE-2026-33327/8 sur images) | bump | `0.35.3` |
| `postcss` | pin `next>postcss: 8.5.15` (vulnérable) | override | `>=8.5.18` |

Overrides posés dans `pnpm-workspace.yaml` (pnpm 11 n'utilise plus le champ
`pnpm` de `package.json` — piège rencontré au passage). Les overrides
`brace-expansion`/`nanoid` ont été retirés : ils cassaient la chaîne ESLint
(`expand is not a function`) pour un DoS build-time non atteignable.

**Restant (accepté, faible risque)** : `brace-expansion` (via `archiver`,
chemins de glob fixes), `deepmerge-ts` (via le CLI Prisma, build-time),
`uuid` (via `exceljs`, exige un paramètre `buf`). Les forcer casserait ces
outils pour des DoS non exploitables dans les flux réels.

**Validation complète après tous ces changements** : `tsc` ✓, `lint` ✓,
1138 tests ✓, **build de production ✓**.

## Durcissement VPS complémentaire (appliqué)

- **SSH** renforcé : algorithmes modernes uniquement (curve25519, chacha20,
  AES-GCM), `AllowAgentForwarding no`, `X11Forwarding no`, `ClientAlive`,
  `MaxSessions`/`MaxStartups`. `AllowTcpForwarding yes` conservé (tunnels
  d'administration psql). Root reste en clé uniquement.
- **Paramètres noyau** (`/etc/sysctl.d/99-ecolemiriam-hardening.conf`) :
  anti-usurpation (rp_filter, syncookies), redirections/source-routing
  désactivés, `ptrace_scope`, `kptr_restrict`, `protected_symlinks`, etc.
- **Mises à jour de sécurité automatiques** (`unattended-upgrades`) actives.
- **Journaux persistants** (journald `Storage=persistent`, 2 Go) — sans quoi
  toute analyse post-incident est impossible après un redémarrage.
- **Démon Docker** (`/etc/docker/daemon.json`) : `live-restore` (les
  conteneurs survivent à un redémarrage du démon), `no-new-privileges` par
  défaut, limites de logs. Appliqué sans interruption.
- **security.txt** (RFC 9116) : `public/.well-known/security.txt` — pense à
  créer l'adresse `security@ecolemiriam.com` (ou remplace par ton contact).

## Points vérifiés et jugés SAINS

- **Isolation multi-tenant** : filtrage `tenantId` + `siteFilterForModel` /
  `eleveScopeFilter` systématiques ; les `eslint-disable` sont justifiés
  (connexion, dérivation de claims, lookups super-admin).
- **IDOR** : `mobile/eleves/[id]` borne par tenant + site + périmètre
  personnel (un parent ne peut pas lire un élève arbitraire).
- **Élévation de privilège** : `switch-tenant` vérifie l'adhésion active ;
  `impersonate` est SUPER_ADMIN only, cible vérifiée, audit lourd.
- **Injection** : aucun `$queryRawUnsafe` / SQL interpolé ; aucun
  `dangerouslySetInnerHTML` ; aucun `eval`.
- **Rate-limiting login** : actif (429 sur tentatives répétées).
- **En-têtes** : HSTS preload, `X-Frame-Options DENY`, `frame-ancestors none`,
  COOP/COEP/CORP, `nosniff`, pas de `x-powered-by`.
- **Cookies** : `__Host-`/`__Secure-`, `HttpOnly`, `Secure`, `SameSite=Lax`.
- **Fichiers sensibles** (`.env`, `.git`, `schema.prisma`…) : non servis (404).
- **Ports** : aucun binding Docker sur `0.0.0.0` ; base accessible en
  `127.0.0.1` uniquement (ponts `pg-bridge`/`pgb-bridge`).

---

## Reste à la charge du propriétaire

1. **Redéployer** le code à jour (corrige la dérive de schéma + applique les
   correctifs de ce dépôt). Appliquer d'abord `prisma/sql/MANUAL-03` — déjà
   fait le 2026-08-21.
2. **Faire tourner les secrets** qui ont pu être exposés : mot de passe
   Supabase (historique), et par prudence `AUTH_SECRET` / mots de passe
   PostgreSQL si le dépôt a circulé.
3. **Sauvegardes hors-site** : vérifier que pgBackRest pousse vers un stockage
   distant (sinon une perte du VPS = perte totale des données).
4. **Durcissement complémentaire** (optionnel) : `docker/scripts/harden-os.sh`
   (sysctl réseau, mises à jour automatiques de sécurité).
