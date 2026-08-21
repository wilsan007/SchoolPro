# Déploiement EcolPro sur VPS — Stack durcie

Guide d'auto-hébergement complet d'EcolPro sur un VPS, avec une architecture
orientée sécurité : zéro port entrant, tunnel Cloudflare, secrets chiffrés,
sauvegardes PITR, rôles PostgreSQL à privilèges minimaux.

## Architecture cible

```
Internet
   │  (aucun port entrant sur le VPS)
   ▼
Cloudflare WAF / DDoS / TLS public
   │  (tunnel sortant chiffré)
   ▼
cloudflared ──► Caddy (HTTP interne) ──► Next.js app
                                            │
                                            ▼
                                        PgBouncer (mode transaction)
                                            │
                                            ▼
                                        PostgreSQL 17 (+ pgaudit, SCRAM, TLS interne)
                                            ▲
                                            │
                                        pgBackRest (PITR + incrémental + offsite)
```

Services supports :

- **Ofelia** : crons applicatifs + sauvegardes + audits (via socket-proxy)
- **Uptime Kuma** : monitoring (derrière Cloudflare Access)
- **SOPS + age** : secrets chiffrés, jamais en clair dans Git
- **Telegram** : alertes en cas d'échec de sauvegarde ou d'audit

### Pourquoi cette stack ?

| Préoccupation | Solution | Raison |
|---|---|---|
| Hébergement PostgreSQL | PostgreSQL 17 conteneurisé | Le seul usage réel de Supabase |
| TLS public | Cloudflare Tunnel | Aucun port entrant, WAF inclus |
| Connexions DB | PgBouncer (mode transaction) | Pooling, multi-instances futur |
| Sauvegardes | pgBackRest (PITR + incrémental) | RPO ≈ 0, restauration testée |
| Secrets | SOPS + age | Rien en clair dans Git |
| Crons | Ofelia via socket-proxy | Remplace Vercel Cron |
| Monitoring | Uptime Kuma + Telegram | Alertes proactives |

> **Note sur Supabase** : L'application n'utilise Supabase que comme
> PostgreSQL. L'auth est NextAuth/Auth.js, les photos sont en base64 en
> base, le rate limiting est en mémoire. Redis et MinIO/R2 ne sont pas
> nécessaires aujourd'hui ; ils pourront être ajoutés pour la scalabilité
> future sans changer l'architecture applicative.

## Pré-requis VPS

### Configuration recommandée

| Niveau | RAM | CPU | Disque | Usage |
|---|---|---|---|---|
| Minimum | 4 Go | 2 vCPU | 40 Go SSD | 1 école, < 200 élèves |
| **Recommandé** | **8 Go** | **4 vCPU** | **80 Go NVMe** | 1-5 écoles, < 1000 élèves |
| Confortable | 16 Go | 8 vCPU | 160 Go NVMe | 10+ écoles, IA LEARNOS |

### Logiciel requis

```bash
# Docker + Compose v2
curl -fsSL https://get.docker.com | sh

# Vérifier
docker --version          # >= 24.0
docker compose version    # >= v2.20
```

### Domaine

Le domaine `ecolpro.com` est géré par Cloudflare Registrar. La configuration
DNS et Tunnel se fait depuis le dashboard Cloudflare (voir section
« Cloudflare » ci-dessous). Aucun enregistrement A n'est nécessaire : le
tunnel publie automatiquement le hostname.

## Déploiement — vue d'ensemble

Toutes les opérations passent par le `Makefile`. Taper `make` affiche l'aide.

```
make deploy          # construit et déploie avec rollback automatique
make status          # état de la stack
make logs            # journaux applicatifs en direct
make audit           # audit de sécurité scoré
make backup          # sauvegarde pgBackRest immédiate
make backup-verify   # test de restauration
```

### 1. Durcir le système d'exploitation (une fois)

```bash
make harden-os VPS=root@VPS_IP
```

Active UFW (SSH seul autorisé), durcit SSH (clés uniquement), fail2ban,
mises à jour automatiques, journaux persistants, paramètres noyau, Trivy.

### 2. Initialiser les secrets

```bash
make secrets-init
make secrets-edit    # remplir toutes les valeurs
make secrets-check   # vérifier la complétude
```

Les secrets sont chiffrés avec SOPS + age. Le fichier `secrets/production.env`
est chiffré et peut être committé. La clé age (`~/.config/sops/age/keys.txt`)
reste sur votre machine et ne part jamais sur le VPS en clair.

### 3. Configurer Cloudflare

1. **Dashboard Cloudflare → Networks → Tunnels → Create a tunnel**
2. Choisir `cloudflared`, copier le token
3. Ajouter le token dans `secrets/production.env` sous `TUNNEL_TOKEN`
4. **Public Hostname** : `ecolpro.com` → service `http://caddy:80`
5. SSL/TLS mode : **Full (strict)** si un Origin Certificate est utilisé,
   sinon **Flexible** (Cloudflare termine le TLS, Caddy est en HTTP interne)
6. Activer WAF et DDoS protection (activés par défaut sur les plans free+)
7. (Optionnel) **Cloudflare Access** : protéger `uptime.ecolpro.com` avec
   une politique default-deny (OIDC Google/GitHub)

### 4. Déployer

```bash
make deploy VPS=root@VPS_IP
```

Le script `deploy.sh` :

1. Vérifie les pré-requis et les secrets
2. Déchiffre les secrets en fichier temporaire (0600, détruit à la fin)
3. Synchronise le code via rsync
4. Construit les images sur le VPS
5. Prend une sauvegarde de sécurité
6. Lance les migrations Prisma (rôle `ecolpro_owner`)
7. Démarre la stack (rôle `ecolpro_app` pour le runtime)
8. Vérifie la santé de l'application
9. **Rollback automatique** si l'app ne répond pas dans 2 min
10. Lance un audit de sécurité

### 5. Migrer depuis Supabase (si données existantes)

```bash
make migrate VPS=root@VPS_IP
# Le script demande l'hôte Supabase et le mot de passe
```

Le script `migrate-from-supabase.sh` :

- Utilise la connexion **directe** Supabase (pas le pooler)
- Extrait uniquement le schéma `public` (ignore auth/storage/realtime)
- Restaure sans propriétaire, puis réattribue à `ecolpro_owner`
- Vérifie les effectifs avant/après
- Conserve le dump local jusqu'à validation

## Opérations courantes

```bash
make status              # état de la stack
make logs                # journaux app
make logs-db             # journaux PostgreSQL
make shell               # shell dans le conteneur app
make shell-db            # psql dans PostgreSQL
make restart             # redémarrer la stack
make backup              # sauvegarde immédiate
make backup-list         # lister les sauvegardes
make backup-verify       # tester la restauration
make audit               # audit sécurité scoré
make audit-db            # audit base de données
make trivy               # scan CVE des images
make update-images       # mettre à jour les images de base
make update-os           # mettre à jour le système
make rollback            # revenir à l'image précédente
```

## Sauvegardes et restauration

### Stratégie

- **pgBackRest** : sauvegardes incrémentales quotidiennes + full hebdomadaire
- **PITR** : restauration à un point précis dans le temps (WAL archivés)
- **Offsite** : un dépôt R2/S3 optionnel pour la reprise après sinistre
- **Test automatique** : `backup-verify.sh` restaure sur une base scratch
  et compare les effectifs, toutes les semaines
- **Alertes** : Telegram notifie tout échec de sauvegarde ou de restauration

### Restauration manuelle

Voir `RUNBOOK.md` — section « Restauration PostgreSQL ».

## Sécurité

### Principes

- **Zéro port entrant** : seul SSH est ouvert. Le trafic web arrive par le
  tunnel Cloudflare (connexion sortante).
- **Secrets chiffrés** : SOPS + age, jamais en clair dans Git
- **Rôles PostgreSQL séparés** : `ecolpro_owner` (migrations),
  `ecolpro_app` (runtime, pas de DDL), `ecolpro_backup`, `ecolpro_ro`
- **Conteneur non-root** : l'app tourne en UID 1001, rootfs en lecture seule
- **pgaudit** : journalisation des requêtes DDL et de lecture/écriture
- **SCRAM-SHA-256** : authentification PostgreSQL moderne
- **TLS interne** : PgBouncer ↔ PostgreSQL en TLS

### Audit automatique

```bash
make audit     # audit hôte + conteneurs (scoré)
make audit-db  # audit base de données
```

L'audit vérifie : ports exposés, conteneurs root, rootfs inscriptible,
CVEs Trivy, fraîcheur des sauvegardes, UFW, fail2ban, SSH, pgaudit,
permissions des fichiers de secrets, mises à jour en attente.

## Scalabilité future

L'architecture est conçue pour évoluer sans refonte :

- **Multi-instances app** : PgBouncer déjà en place ; remplacer le
  rate-limiting en mémoire par Redis (`UPSTASH_REDIS_*` déjà prévus)
- **Stockage photos** : migrer les base64 vers MinIO ou Cloudflare R2
  (`R2_*` déjà prévus dans `.env.example`)
- **PostgreSQL dédié** : déplacer le conteneur DB vers un VPS séparé
- **Read replicas** : pgBackRest supporte la restauration sur un réplica

## Dépannage

### L'app ne démarre pas

```bash
make logs
ssh root@VPS_IP 'docker exec ecolpro-app node -e "
  fetch(\"http://127.0.0.1:3000/api/health\")
    .then(r => r.json()).then(j => console.log(j))
    .catch(e => console.error(e.message))
"'
```

### Le tunnel Cloudflare ne répond pas

1. Dashboard Cloudflare → Tunnels → vérifier le statut (Healthy)
2. `ssh root@VPS_IP 'docker logs ecolpro-cloudflared --tail 50'`
3. Vérifier que `TUNNEL_TOKEN` est correct dans les secrets
4. Vérifier que le hostname pointe vers `http://caddy:80`

### PostgreSQL inaccessible

```bash
ssh root@VPS_IP 'docker exec ecolpro-db pg_isready -U postgres'
ssh root@VPS_IP 'docker logs ecolpro-db --tail 50'
```

### OOM (mémoire insuffisante)

Si le VPS a moins de 8 Go, réduire `shared_buffers` dans
`docker/postgres/postgresql.conf` :

```
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
```

## Fichiers clés

| Fichier | Rôle |
|---|---|
| `Makefile` | Point d'entrée unique des opérations |
| `docker-compose.yml` | Orchestration de la stack |
| `Dockerfile` | Image Next.js standalone durcie |
| `docker/postgres/` | PostgreSQL 17 + init (rôles, RLS, TLS, pgaudit) |
| `docker/pgbouncer/` | Pooler transactionnel + TLS interne |
| `docker/caddy/` | Reverse proxy interne + rate limiting |
| `docker/pgbackrest/` | Configuration PITR + incrémental |
| `docker/ofelia/` | Crons applicatifs + sauvegardes + audits |
| `docker/scripts/` | deploy, migrate, harden-os, audits, secrets, backup |
| `.sops.yaml` | Configuration SOPS |
| `secrets/production.env` | Secrets chiffrés (committable) |
| `RUNBOOK.md` | Procédures d'incident et de restauration |
