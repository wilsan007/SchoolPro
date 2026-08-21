# RUNBOOK EcolPro — Procédures d'exploitation

Ce document décrit les procédures à suivre en cas d'incident, de
maintenance, ou de restauration. Il est conçu pour être utilisable
sous pression : chaque section est autonome et commence par la commande
exacte à exécuter.

## Table des matières

1. [Déploiement](#déploiement)
2. [Rollback](#rollback)
3. [Restauration PostgreSQL (PITR)](#restauration-postgresql-pitr)
4. [Restauration complète après sinistre](#restauration-complète-après-sinistre)
5. [Perte d'accès SSH](#perte-daccès-ssh)
6. [Tunnel Cloudflare en panne](#tunnel-cloudflare-en-panne)
7. [Espace disque saturé](#espace-disque-saturé)
8. [Sauvegarde échouée](#sauvegarde-échouée)
9. [Personne ne peut se connecter](#personne-ne-peut-se-connecter)
10. [Rotation des secrets](#rotation-des-secrets)
11. [Rotation du mot de passe PostgreSQL](#rotation-du-mot-de-passe-postgresql)
12. [Réaction à une alerte Telegram](#réaction-à-une-alerte-telegram)
13. [Mise à jour de sécurité urgente (CVE)](#mise-à-jour-de-sécurité-urgente-cve)
14. [Vérification post-incident](#vérification-post-incident)

---

## Déploiement

### Déploiement standard

```bash
make deploy VPS=root@VPS_IP
```

Le rollback est automatique si l'app ne répond pas dans 2 minutes.

### Déploiement sans rebuild (image déjà construite)

```bash
make deploy-no-build VPS=root@VPS_IP
```

### Vérification post-déploiement

```bash
make status
make logs
# Depuis un navigateur externe :
curl -I https://ecolpro.com/api/health
```

---

## Rollback

### Rollback applicatif (image précédente)

```bash
make rollback VPS=root@VPS_IP
```

Remet `ecolpro/app:previous` en service. **Les migrations de schéma ne
sont PAS annulées** : si la panne vient d'une migration, voir la section
« Restauration PostgreSQL » ci-dessous.

### Rollback avec restauration de base de données

À utiliser si une migration a corrompu les données.

```bash
# 1. Identifier la sauvegarde à restaurer
make backup-list VPS=root@VPS_IP

# 2. Arrêter l'app (évite les écritures pendant la restauration)
ssh root@VPS_IP 'cd /opt/ecolpro && docker compose stop app'

# 3. Restaurer (voir section « Restauration PostgreSQL »)
# 4. Redémarrer
ssh root@VPS_IP 'cd /opt/ecolpro && docker compose up -d app'
```

---

## Restauration PostgreSQL (PITR)

### Restauration à un point précis dans le temps

```bash
ssh root@VPS_IP
cd /opt/ecolpro

# 1. Arrêter l'app
docker compose stop app

# 2. Voir les sauvegardes disponibles
docker exec ecolpro-db pgbackrest --stanza=ecolpro info

# 3. Restaurer à un instant T (remplacer la date)
docker exec ecolpro-db pgbackrest --stanza=ecolpro \
  --type=time --target="2025-01-15 14:30:00" --target-action=promote \
  restore

# 4. Redémarrer PostgreSQL
docker compose restart db

# 5. Vérifier
docker exec ecolpro-db psql -U postgres -d ecolpro -c \
  "SELECT count(*) FROM users;"

# 6. Redémarrer l'app
docker compose up -d app
```

### Restauration de la dernière sauvegarde complète

```bash
ssh root@VPS_IP
cd /opt/ecolpro
docker compose stop app
docker exec ecolpro-db pgbackrest --stanza=ecolpro --type=full restore
docker compose restart db
docker compose up -d app
```

### Test de restauration (sans toucher à la production)

```bash
make backup-verify VPS=root@VPS_IP
```

Restaure sur une base scratch et compare les effectifs. À exécuter
régulièrement (Ofelia le fait automatiquement chaque semaine).

---

## Restauration complète après sinistre

### Prérequis

- Un nouveau VPS avec Docker installé
- Le dépôt Git (avec `secrets/production.env` chiffré)
- La clé age (`~/.config/sops/age/keys.txt`) — sauvegardée hors ligne
- L'accès au dépôt de sauvegardes offsite (R2/S3)

### Procédure

```bash
# 1. Durcir le nouveau VPS
make harden-os VPS=root@NEW_VPS_IP

# 2. Cloner le dépôt
ssh root@NEW_VPS_IP 'git clone <repo> /opt/ecolpro && cd /opt/ecolpro'

# 3. Déployer la stack (crée une base vide)
make deploy VPS=root@NEW_VPS_IP

# 4. Configurer le dépôt offsite dans .env.runtime
#    PGBACKREST_REPO1_TYPE=s3
#    PGBACKREST_REPO1_S3_BUCKET=...
#    PGBACKREST_REPO1_S3_ENDPOINT=...
#    PGBACKREST_REPO1_S3_KEY=...
#    PGBACKREST_REPO1_S3_KEY_SECRET=...

# 5. Restaurer depuis le dépôt offsite
ssh root@NEW_VPS_IP 'cd /opt/ecolpro && \
  docker compose stop app && \
  docker exec ecolpro-db pgbackrest --stanza=ecolpro \
    --type=full restore && \
  docker compose restart db && \
  docker compose up -d app'

# 6. Reconfigurer le tunnel Cloudflare vers le nouveau VPS
#    Dashboard Cloudflare → Tunnels → rediriger vers le nouveau cloudflared

# 7. Vérifier
curl -I https://ecolpro.com/api/health
make audit VPS=root@NEW_VPS_IP
```

### Objectif de temps de reprise (RTO)

- Avec dépôt offsite accessible : **< 2 heures**
- Sans dépôt offsite (depuis le VPS détruit) : **perte de données totale**

> C'est pourquoi le dépôt offsite est OBLIGATOIRE pour la production.

---

## Perte d'accès SSH

### Symptômes

- `ssh: connect to host ... Connection refused`
- `Permission denied (publickey)`

### Procédure

1. **Console du fournisseur VPS** (Hetzner/OVH/DigitalOcean proposent un
   accès VNC/serial dans le dashboard)
2. Se connecter en root avec le mot de passe du fournisseur
3. Diagnostiquer :
   ```bash
   systemctl status sshd
   journalctl -u sshd --no-pager -n 50
   ufw status
   fail2ban-client status sshd
   ```
4. Si fail2ban a banni votre IP :
   ```bash
   fail2ban-client set sshd unbanip VOTRE_IP
   ```
5. Si UFW bloque tout :
   ```bash
   ufw allow 22/tcp
   ```
6. Si sshd refuse de démarrer (config cassée) :
   ```bash
   rm /etc/ssh/sshd_config.d/99-ecolpro-hardening.conf
   systemctl restart sshd
   ```
7. Une fois l'accès rétabli, relancer `make harden-os` pour réappliquer
   le durcissement correctement.

---

## Tunnel Cloudflare en panne

### Symptômes

- Le site est inaccessible publiquement
- `make status` montre la stack opérationnelle
- L'app répond en local (`docker exec ecolpro-app curl localhost:3000/api/health`)

### Procédure

```bash
# 1. Vérifier le statut du tunnel
ssh root@VPS_IP 'docker logs ecolpro-cloudflared --tail 50'

# 2. Vérifier le token
ssh root@VPS_IP 'docker exec ecolpro-cloudflared cloudflared tunnel info'

# 3. Dashboard Cloudflare → Networks → Tunnels
#    Vérifier que le tunnel est "Healthy"
#    Vérifier que le hostname "ecolpro.com" pointe vers "http://caddy:80"

# 4. Redémarrer cloudflared
ssh root@VPS_IP 'cd /opt/ecolpro && docker compose restart cloudflared'

# 5. Si le token est invalide, le régénérer dans le dashboard Cloudflare
#    puis mettre à jour les secrets :
make secrets-edit
make deploy VPS=root@VPS_IP
```

---

## Espace disque saturé

### Symptômes

- PostgreSQL refuse les écritures
- Les sauvegardes échouent
- Les conteneurs crashent

### Procédure

```bash
# 1. Identifier ce qui consomme
ssh root@VPS_IP 'df -h'
ssh root@VPS_IP 'docker system df'

# 2. Nettoyer les images orphelines
make prune VPS=root@VPS_IP

# 3. Nettoyer les anciennes sauvegardes pgBackRest
ssh root@VPS_IP 'docker exec ecolpro-db pgbackrest --stanza=ecolpro expire --retention-full=4 --retention-diff=2'

# 4. Nettoyer les journaux Docker
ssh root@VPS_IP 'docker system prune -a --volumes --filter "until=48h" -f'

# 5. Vérifier les journaux système
ssh root@VPS_IP 'journalctl --vacuum-time=7d'

# 6. Si toujours saturé, envisager un disque plus grand
```

---

## Sauvegarde échouée

### Symptômes

- Alerte Telegram : « Échec de la sauvegarde pgBackRest »
- `make backup` retourne une erreur

### Procédure

```bash
# 1. Consulter les logs
ssh root@VPS_IP 'docker exec ecolpro-db pgbackrest --stanza=ecolpro info'
ssh root@VPS_IP 'docker logs ecolpro-db --tail 100'

# 2. Cause fréquente : espace disque
ssh root@VPS_IP 'df -h'

# 3. Cause fréquente : stanza non initialisée (premier démarrage)
ssh root@VPS_IP 'docker exec ecolpro-db pgbackrest --stanza=ecolpro stanza-create'

# 4. Relancer manuellement
make backup VPS=root@VPS_IP

# 5. Si l'échec persiste, faire un pg_dump de secours
ssh root@VPS_IP 'docker exec ecolpro-db pg_dump -U postgres -d ecolpro --format=custom -f /tmp/emergency.dump'
ssh root@VPS_IP 'docker cp ecolpro-db:/tmp/emergency.dump /opt/ecolpro/emergency-$(date +%Y%m%d).dump'
```

---

## Personne ne peut se connecter

### Symptômes

- « Identifiants invalides » pour **tous** les comptes, y compris l'administrateur
- Les comptes existent bien en base et `isActive` vaut `TRUE`
- La stack est saine : `make status` OK, pages publiques accessibles

### Diagnostic

La table `audit_logs` enregistre le motif exact de chaque refus.

```bash
ssh root@VPS_IP 'docker exec ecolpro-db psql -U postgres -d ecolpro -c "SELECT \"createdAt\", reason, metadata FROM audit_logs WHERE action = '"'"'auth:login'"'"' AND verdict = '"'"'DENIED'"'"' ORDER BY \"createdAt\" DESC LIMIT 20;"'
```

| `reason`                | Interprétation                                                   |
| ----------------------- | ---------------------------------------------------------------- |
| `Mot de passe incorrect` | Le compte existe : le hash en base ne vérifie pas le mot de passe |
| `Utilisateur introuvable` | **Cause la plus fréquente : la casse de l'adresse.** Voir ci-dessous. Sinon : mauvaise base, ou données jamais chargées |
| `Compte désactivé`      | `isActive = FALSE`                                                |
| *(aucune ligne)*        | La requête n'atteint pas l'application : voir le tunnel / Caddy   |

### Cause déjà rencontrée n°1 : casse des adresses e-mail

PostgreSQL compare les chaînes octet par octet. Un compte enregistré
`Mohamed.abdi.pk12@gmail.com` est introuvable pour quiconque saisit son
adresse en minuscules — ce que fait spontanément un clavier mobile. Le
symptôme est « Identifiants invalides », la trace dans `audit_logs` est
`Utilisateur introuvable` pour une adresse pourtant présente en base.

Repérer les comptes concernés :

```bash
ssh root@VPS_IP 'docker exec ecolemiriam-postgres sh -c '"'"'PGPASSWORD="$(cat $POSTGRES_PASSWORD_FILE)" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT email FROM users WHERE email <> lower(email);"'"'"''
```

Correctif de données (transactionnel, refuse de s'exécuter en cas de
collision d'unicité) : `prisma/sql/MANUAL-04-normaliser-emails.sql`. Il
rétablit la connexion sans redéploiement.

Côté code, `src/lib/email.ts` (`normaliserEmail`) normalise toute adresse à
la saisie, et les deux chemins d'authentification — `src/lib/auth.ts` et
`src/app/api/auth/mobile/route.ts` — recherchent désormais en
`mode: "insensitive"`, ce qui rend l'application tolérante même si des
adresses en majuscules réapparaissent.

### Cause déjà rencontrée n°2 : hash bcrypt invalide dans les dumps SQL

Les dumps `prisma/sql/*.sql` ont porté un hash fabriqué à la main — un digest
de coût 10 recollé derrière un préfixe `$2a$12$`. Le coût entrant dans la
dérivation de clé bcrypt, `bcrypt.compare()` échouait pour les 6 221 comptes,
sans autre trace qu'un refus de connexion.

Vérifier un hash pris en base :

```bash
ssh root@VPS_IP 'docker exec ecolpro-db psql -U postgres -d ecolpro -tAc "SELECT password FROM users LIMIT 1;"'
node -e "console.log(require('bcryptjs').compareSync('Ambouli@2026!', '<hash>'))"
```

Si la réponse est `false`, appliquer la réparation (idempotente, ne touche que
les lignes portant l'ancien hash cassé) :

```bash
make fix-passwords VPS=root@VPS_IP
```

Le script affiche `comptes_casses` avant et après : la valeur finale doit
être `0`. Se reconnecter ensuite avec `admin@cite-ambouli.dj` /
`Ambouli@2026!`.

**Prévention** : `pnpm seed:check` vérifie désormais que chaque hash présent
dans les dumps correspond réellement au mot de passe documenté, et
`generate-sql.mjs` refuse de générer si sa constante ne concorde pas.

---

## Rotation des secrets

### Rotation de la clé age (SOPS)

```bash
make secrets-rotate
```

Génère une nouvelle clé age, rechiffre tous les secrets, et affiche la
nouvelle clé publique à ajouter à `.sops.yaml`.

### Rotation du token Cloudflare Tunnel

1. Dashboard Cloudflare → Tunnels → recréer le tunnel
2. Copier le nouveau token
3. `make secrets-edit` → mettre à jour `TUNNEL_TOKEN`
4. `make deploy VPS=root@VPS_IP`

---

## Rotation du mot de passe PostgreSQL

Le mot de passe `ecolpro_app` est utilisé par l'application via PgBouncer.
Le changer nécessite de coordonner PostgreSQL, PgBouncer et l'app.

```bash
ssh root@VPS_IP
cd /opt/ecolpro

# 1. Générer un nouveau mot de passe
NEW_PASS=$(openssl rand -base64 32)
echo "Nouveau mot de passe : $NEW_PASS"

# 2. Modifier dans PostgreSQL
docker exec ecolpro-db psql -U postgres -d ecolpro -c \
  "ALTER USER ecolpro_app WITH PASSWORD '$NEW_PASS';"

# 3. Modifier dans PgBouncer (userlist.txt est régénéré au démarrage)
#    Mettre à jour .env.runtime avec le nouveau mot de passe
#    PGB_APP_PASSWORD=$NEW_PASS

# 4. Redémarrer PgBouncer et l'app
docker compose restart pgbouncer app

# 5. Vérifier
docker exec ecolpro-app node -e "
  fetch('http://127.0.0.1:3000/api/health')
    .then(r => r.json()).then(j => console.log(j))
"

# 6. Mettre à jour les secrets chiffrés localement
#    (depuis votre machine)
make secrets-edit  # mettre à jour PGB_APP_PASSWORD et DB_APP_PASSWORD
```

---

## Réaction à une alerte Telegram

### Types d'alertes

| Message | Gravité | Action immédiate |
|---|---|---|
| « Échec de la sauvegarde » | Haute | Voir section « Sauvegarde échouée » |
| « Échec du test de restauration » | Critique | Les sauvegardes existent mais ne restaurent pas — les données sont à risque |
| « Audit sécurité dégradé » | Moyenne | Consulter l'audit, traiter dans la journée |
| « App ne répond pas » | Critique | Voir « Dépannage » dans DEPLOYMENT-VPS.md |
| « Espace disque < 10% » | Haute | Voir section « Espace disque saturé » |

### Procédure générale

1. Ne pas paniquer — les alertes sont là pour prévenir, pas pour alarmer
2. Se connecter au VPS : `ssh root@VPS_IP`
3. Consulter l'état : `cd /opt/ecolpro && docker compose ps`
4. Consulter les logs du service concerné
5. Suivre la procédure correspondante dans ce runbook
6. Documenter l'incident (date, cause, résolution) dans un ticket

---

## Mise à jour de sécurité urgente (CVE)

### Quand une CVE critique affecte PostgreSQL, Next.js, ou le système

```bash
# 1. Vérifier si l'image est affectée
make trivy VPS=root@VPS_IP

# 2. Mettre à jour les images de base
make update-images VPS=root@VPS_IP

# 3. Mettre à jour le système d'exploitation
make update-os VPS=root@VPS_IP

# 4. Si un redémarrage du noyau est requis
ssh root@VPS_IP 'reboot'
# Attendre ~2 min, vérifier la reprise
make status VPS=root@VPS_IP

# 5. Audit post-mise à jour
make audit VPS=root@VPS_IP
```

---

## Vérification post-incident

Après tout incident, exécuter ces vérifications :

```bash
# 1. Santé de la stack
make status VPS=root@VPS_IP

# 2. Application joignable publiquement
curl -I https://ecolpro.com/api/health

# 3. Sauvegarde récente
make backup-list VPS=root@VPS_IP

# 4. Audit de sécurité
make audit VPS=root@VPS_IP

# 5. Test de restauration
make backup-verify VPS=root@VPS_IP

# 6. Journaux d'audit PostgreSQL
ssh root@VPS_IP 'docker logs ecolpro-db --since 1h | grep -i audit'
```

Si toutes les vérifications passent, l'incident est résolu. Documenter :

- Date et heure
- Symptômes observés
- Cause racine
- Résolution appliquée
- Temps d'indisponibilité
- Leçon à enregistrer pour éviter la récurrence
