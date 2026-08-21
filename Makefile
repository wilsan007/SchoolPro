# ============================================================
# EcolPro — Makefile : point d'entrée unique des opérations
#
# Toutes les actions d'exploitation passent par ici. Un opérateur qui
# tape « make » doit voir exactement ce qu'il peut faire, sans avoir à
# retenir des chemins de scripts.
# ============================================================

.DEFAULT_GOAL := help
SHELL := /usr/bin/env bash

VPS ?= root@localhost
DEPLOY_DIR ?= /opt/ecolpro

# Labo de test (docker-compose.test.yml) — mots de passe publics assumés :
# base éphémère, en mémoire, publiée sur 127.0.0.1 uniquement.
RLS_TEST_OWNER_URL ?= postgresql://ecolpro_owner:test_owner_local_only@127.0.0.1:55433/ecolpro_test?schema=public&sslmode=require
# client_min_messages=warning : les « policy does not exist, skipping » des
# DROP POLICY IF EXISTS noieraient une vraie erreur sous 109 lignes de bruit.
RLS_TEST_PSQL ?= host=127.0.0.1 port=5432 user=ecolpro_owner dbname=ecolpro_test sslmode=require options=-cclient_min_messages=warning

# Couleurs pour l'aide
G := \033[0;32m
Y := \033[1;33m
B := \033[1m
N := \033[0m

.PHONY: help
help: ## Affiche cette aide
	@echo ""
	@echo "$(B)EcolPro — opérations d'exploitation$(N)"
	@echo ""
	@echo "$(Y)Sécurité$(N)"
	@grep -E '^[a-zA-Z_-]+:.*## Sécurité' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  $(G)%-22s$(N) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(Y)Secrets$(N)"
	@grep -E '^[a-zA-Z_-]+:.*## Secrets' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  $(G)%-22s$(N) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(Y)Déploiement$(N)"
	@grep -E '^[a-zA-Z_-]+:.*## Déploiement' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  $(G)%-22s$(N) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(Y)Migration$(N)"
	@grep -E '^[a-zA-Z_-]+:.*## Migration' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  $(G)%-22s$(N) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(Y)Vérification locale$(N)"
	@grep -E '^[a-zA-Z_-]+:.*## Vérification' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  $(G)%-22s$(N) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(Y)Maintenance VPS$(N)"
	@grep -E '^[a-zA-Z_-]+:.*## Maintenance' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  $(G)%-22s$(N) %s\n", $$1, $$2}'
	@echo ""

# ============================================================
# Sécurité
# ============================================================

.PHONY: harden-os
harden-os: ## Sécurité — durcit le système d'exploitation du VPS (UFW, SSH, fail2ban)
	@echo "$(B)[1/1] Durcissement du système d'exploitation$(N)"
	ssh $(VPS) 'bash -s' < docker/scripts/harden-os.sh

.PHONY: audit
audit: ## Sécurité — exécute l'audit scoré sur le VPS
	@echo "$(B)[1/1] Audit de sécurité$(N)"
	ssh $(VPS) 'cd $(DEPLOY_DIR) && ./docker/scripts/security-audit.sh'

.PHONY: audit-db
audit-db: ## Sécurité — audit de la base de données (rôles, RLS, pgaudit)
	@echo "$(B)[1/1] Audit de la base de données$(N)"
	ssh $(VPS) 'cd $(DEPLOY_DIR) && ./docker/scripts/security-audit-db.sh'

.PHONY: trivy
trivy: ## Sécurité — analyse les images Docker avec Trivy
	@echo "$(B)[1/1] Analyse Trivy des images$(N)"
	ssh $(VPS) 'cd $(DEPLOY_DIR) && \
		for img in ecolpro/app ecolpro/db ecolpro/pgbouncer ecolpro/caddy; do \
			docker image inspect $$img >/dev/null 2>&1 && trivy image --severity HIGH,CRITICAL $$img || true; \
		done'

# ============================================================
# Secrets (SOPS + age)
# ============================================================

.PHONY: secrets-init
secrets-init: ## Secrets — initialise age + SOPS et crée le fichier de secrets
	./docker/scripts/secrets.sh init

.PHONY: secrets-edit
secrets-edit: ## Secrets — édite le fichier de secrets chiffré
	./docker/scripts/secrets.sh edit

.PHONY: secrets-rotate
secrets-rotate: ## Secrets — fait tourner la clé age et rechiffre les secrets
	./docker/scripts/secrets.sh rotate

.PHONY: secrets-check
secrets-check: ## Secrets — vérifie la complétude et les permissions
	./docker/scripts/secrets.sh check

.PHONY: secrets-view
secrets-view: ## Secrets — affiche les secrets en clair (à n'utiliser qu'en cas de besoin)
	./docker/scripts/secrets.sh view

# ============================================================
# Déploiement
# ============================================================

.PHONY: deploy
deploy: ## Déploiement — construit et déploie sur le VPS avec rollback auto
	./docker/scripts/deploy.sh --vps $(VPS) --deploy-dir $(DEPLOY_DIR)

.PHONY: deploy-no-build
deploy-no-build: ## Déploiement — déploie sans reconstruire les images
	./docker/scripts/deploy.sh --vps $(VPS) --deploy-dir $(DEPLOY_DIR) --skip-build

.PHONY: rollback
rollback: ## Déploiement — revient à l'image précédente (ecolpro/app:previous)
	@echo "$(B)[1/1] Rollback vers l'image précédente$(N)"
	ssh $(VPS) 'cd $(DEPLOY_DIR) && \
		docker image inspect ecolpro/app:previous >/dev/null 2>&1 && \
		docker tag ecolpro/app:previous ecolpro/app:latest && \
		docker compose --env-file .env.runtime up -d --force-recreate app && \
		echo "Rollback effectué. ATTENTION : les migrations de schéma ne sont PAS annulées." || \
		echo "Aucune image précédente disponible."'

.PHONY: status
status: ## Déploiement — affiche l'état de la stack sur le VPS
	ssh $(VPS) 'cd $(DEPLOY_DIR) && docker compose ps'

.PHONY: logs
logs: ## Déploiement — journaux de l'application en direct
	ssh $(VPS) 'docker logs -f --tail 100 ecolpro-app'

.PHONY: logs-db
logs-db: ## Déploiement — journaux de PostgreSQL en direct
	ssh $(VPS) 'docker logs -f --tail 100 ecolpro-db'

.PHONY: shell
shell: ## Déploiement — ouvre un shell sur le conteneur applicatif
	ssh $(VPS) 'docker exec -it ecolpro-app sh'

.PHONY: shell-db
shell-db: ## Déploiement — ouvre psql sur le conteneur PostgreSQL
	ssh $(VPS) 'docker exec -it ecolpro-db psql -U postgres -d ecolpro'

.PHONY: ps
ps: status

# ============================================================
# Migration
# ============================================================

.PHONY: migrate
migrate: ## Migration — Supabase Cloud → VPS (avec vérification des effectifs)
	./docker/scripts/migrate-from-supabase.sh --vps $(VPS) --deploy-dir $(DEPLOY_DIR)

.PHONY: fix-passwords
fix-passwords: ## Migration — répare les hash de mots de passe des comptes chargés par SQL
	@echo "$(B)[1/2] Envoi du script de réparation$(N)"
	scp prisma/sql/MANUAL-02-fix-hash-mots-de-passe.sql $(VPS):/tmp/fix-hash.sql
	@echo "$(B)[2/2] Exécution — « comptes_casses » doit finir à 0$(N)"
	ssh $(VPS) 'docker exec -i ecolpro-db psql -U postgres -d ecolpro -v ON_ERROR_STOP=1 < /tmp/fix-hash.sql && rm -f /tmp/fix-hash.sql'

# ============================================================
# Sauvegardes
# ============================================================

.PHONY: backup
backup: ## Maintenance — déclenche une sauvegarde pgBackRest immédiate
	@echo "$(B)[1/1] Sauvegarde pgBackRest$(N)"
	ssh $(VPS) 'docker exec ecolpro-db pgbackrest --stanza=ecolpro --type=full backup'

.PHONY: backup-verify
backup-verify: ## Maintenance — teste la restauration sur une base scratch
	@echo "$(B)[1/1] Test de restauration$(N)"
	ssh $(VPS) 'cd $(DEPLOY_DIR) && ./docker/scripts/backup-verify.sh'

.PHONY: backup-offsite-init
backup-offsite-init: ## Maintenance — initialise et teste le dépôt de sauvegarde hors site
	@echo "$(B)[1/3] Création de la stanza sur le dépôt distant$(N)"
	ssh $(VPS) 'docker exec ecolpro-db sh -c ". /usr/local/bin/pgbackrest-offsite.sh && pgbackrest --stanza=ecolpro --repo=2 stanza-create"'
	@echo "$(B)[2/3] Vérification de l'\''accès au dépôt$(N)"
	ssh $(VPS) 'docker exec ecolpro-db sh -c ". /usr/local/bin/pgbackrest-offsite.sh && pgbackrest --stanza=ecolpro --repo=2 check"'
	@echo "$(B)[3/3] Première sauvegarde complète hors site$(N)"
	ssh $(VPS) 'docker exec ecolpro-db sh -c ". /usr/local/bin/pgbackrest-offsite.sh && pgbackrest --stanza=ecolpro --repo=2 --type=full backup"'
	@echo "$(G)Dépôt hors site opérationnel.$(N) Vérifier : make backup-list"

.PHONY: backup-list
backup-list: ## Maintenance — liste les sauvegardes disponibles
	ssh $(VPS) 'docker exec ecolpro-db pgbackrest --stanza=ecolpro info'

# ============================================================
# Maintenance VPS
# ============================================================

.PHONY: update-images
update-images: ## Maintenance — met à jour les images de base et reconstruit
	@echo "$(B)[1/1] Mise à jour des images$(N)"
	ssh $(VPS) 'cd $(DEPLOY_DIR) && \
		docker compose --env-file .env.runtime pull && \
		docker compose --env-file .env.runtime build --pull db pgbouncer caddy app && \
		docker compose --env-file .env.runtime up -d'

.PHONY: update-os
update-os: ## Maintenance — met à jour les paquets du système d'exploitation
	@echo "$(B)[1/1] Mise à jour du système$(N)"
	ssh $(VPS) 'apt-get update && apt-get -y upgrade && apt-get -y autoremove'

.PHONY: prune
prune: ## Maintenance — nettoie les images et conteneurs inutilisés
	ssh $(VPS) 'docker system prune -f --volumes=false'

.PHONY: restart
restart: ## Maintenance — redémarre toute la stack
	ssh $(VPS) 'cd $(DEPLOY_DIR) && docker compose --env-file .env.runtime restart'

.PHONY: down
down: ## Maintenance — arrête toute la stack (sans supprimer les données)
	ssh $(VPS) 'cd $(DEPLOY_DIR) && docker compose --env-file .env.runtime down'

.PHONY: up
up: ## Maintenance — démarre la stack sans reconstruire
	ssh $(VPS) 'cd $(DEPLOY_DIR) && docker compose --env-file .env.runtime up -d'

# ============================================================
# Vérification locale
# ============================================================

.PHONY: verify
verify: ## Vérification — tsc + lint + build (avant de pousser/déployer)
	@echo "$(B)[1/3] TypeScript$(N)"
	pnpm tsc --noEmit
	@echo "$(B)[2/3] Lint$(N)"
	pnpm lint
	@echo "$(B)[3/3] Build Next.js$(N)"
	pnpm build

.PHONY: tsc
tsc: ## Vérification — contrôle de types uniquement
	pnpm tsc --noEmit

.PHONY: lint
lint: ## Vérification — lint uniquement
	pnpm lint

.PHONY: build
build: ## Vérification — build Next.js uniquement
	pnpm build

.PHONY: test
test: ## Vérification — tests Vitest
	pnpm test

# --- Labo de test fidèle à la production ---------------------------------
# Le Postgres de développement (docker-compose.dev.yml) tourne avec un rôle
# superutilisateur, qui contourne intégralement la RLS : une politique
# manquante ou trop permissive y est invisible. Le labo reproduit les rôles
# et la configuration de production, seul endroit où la RLS peut être testée
# honnêtement.

.PHONY: test-db-up
test-db-up: ## Vérification — démarre le labo Postgres fidèle à la prod (RLS testable)
	@echo "$(B)[1/2] Construction et démarrage du labo$(N)"
	docker compose -f docker-compose.test.yml up -d --build
	@echo "$(B)[2/2] Attente de disponibilité$(N)"
	@for i in $$(seq 1 40); do \
		[ "$$(docker inspect -f '{{.State.Health.Status}}' ecolpro-test-db 2>/dev/null)" = "healthy" ] \
			&& { echo "  Labo prêt sur 127.0.0.1:55433"; exit 0; }; \
		sleep 3; \
	done; \
	echo "  Le labo n'est pas devenu disponible — voir : make test-db-logs"; exit 1

.PHONY: test-db-down
test-db-down: ## Vérification — arrête le labo et efface ses données
	docker compose -f docker-compose.test.yml down -v

.PHONY: test-db-logs
test-db-logs: ## Vérification — journaux du labo Postgres
	docker compose -f docker-compose.test.yml logs -f db

.PHONY: test-db-psql
test-db-psql: ## Vérification — psql sur le labo, en tant que ecolpro_app (rôle de l'app)
	docker exec -it ecolpro-test-db env PGPASSWORD=test_app_local_only \
		psql "host=127.0.0.1 port=5432 user=ecolpro_app dbname=ecolpro_test sslmode=require"

# --- Row Level Security --------------------------------------------------

.PHONY: rls-generate
rls-generate: ## Sécurité — régénère les politiques RLS depuis schema.prisma
	pnpm rls:generate

.PHONY: rls-check
rls-check: ## Sécurité — échoue si les politiques RLS ne suivent plus le schéma
	pnpm rls:check

.PHONY: rls-apply-test
rls-apply-test: ## Sécurité — applique fonctions + politiques RLS sur le labo
	@echo "$(B)[1/3] Schéma Prisma$(N)"
	DATABASE_URL="$(RLS_TEST_OWNER_URL)" DIRECT_URL="$(RLS_TEST_OWNER_URL)" \
		pnpm exec prisma db push --skip-generate --accept-data-loss
	@echo "$(B)[2/3] Fonctions de contexte$(N)"
	docker exec -i ecolpro-test-db env PGPASSWORD=test_owner_local_only psql -q -v ON_ERROR_STOP=1 \
		"$(RLS_TEST_PSQL)" < docker/postgres/init/03-rls-functions.sql
	@echo "$(B)[3/3] Politiques$(N)"
	docker exec -i ecolpro-test-db env PGPASSWORD=test_owner_local_only psql -q -v ON_ERROR_STOP=1 \
		"$(RLS_TEST_PSQL)" < prisma/sql/rls/02-policies.sql
	@echo "  Politiques en place."

.PHONY: rls-test
rls-test: ## Sécurité — prouve l'isolation multi-tenant en base (labo requis)
	RLS_MODE=enforce pnpm test:rls

.PHONY: rls-full
rls-full: test-db-up rls-apply-test rls-test ## Sécurité — labo + application + preuve, d'un trait

.PHONY: rls-apply-prod
rls-apply-prod: ## Sécurité — applique fonctions + politiques RLS en PRODUCTION
	@echo "$(Y)Application de la RLS sur la PRODUCTION ($(VPS)).$(N)"
	@echo "Prérequis : RLS_MODE=warn déployé, journaux [rls] silencieux, sauvegarde fraîche."
	@echo "Voir RUNBOOK.md — « Activation de la RLS ». Ctrl-C pour annuler."
	@read -r -p "Taper OUI pour continuer : " ok; [ "$$ok" = "OUI" ] || { echo "Annulé."; exit 1; }
	@echo "$(B)[1/3] Sauvegarde préalable$(N)"
	$(MAKE) backup
	@echo "$(B)[2/3] Fonctions de contexte$(N)"
	ssh $(VPS) 'docker exec -i ecolpro-db sh -c "PGPASSWORD=\$$PG_OWNER_PASSWORD psql -q -v ON_ERROR_STOP=1 -U ecolpro_owner -d \$${POSTGRES_DB:-ecolpro} -h /var/run/postgresql"' \
		< docker/postgres/init/03-rls-functions.sql
	@echo "$(B)[3/3] Politiques$(N)"
	ssh $(VPS) 'docker exec -i ecolpro-db sh -c "PGPASSWORD=\$$PG_OWNER_PASSWORD psql -q -v ON_ERROR_STOP=1 -U ecolpro_owner -d \$${POSTGRES_DB:-ecolpro} -h /var/run/postgresql"' \
		< prisma/sql/rls/02-policies.sql
	@echo "$(G)Politiques en place.$(N) Vérifier IMMÉDIATEMENT une page de notes et une page de facturation."
	@echo "Retour arrière si besoin : make shell-db puis DROP POLICY <nom> ON <table>;"

.PHONY: compose-validate
compose-validate: ## Vérification — valide la configuration docker-compose
	docker compose --env-file .env.production.example config -q

.PHONY: docker-build
docker-build: ## Vérification — construit les images localement
	docker compose --env-file .env.production.example build

.PHONY: clean-dead-supabase
clean-dead-supabase: ## Vérification — supprime le code mort Supabase
	@echo "$(B)[1/1] Suppression du code mort Supabase$(N)"
	rm -f src/lib/supabase-server.ts
	pnpm remove @supabase/supabase-js || true
	@echo "Code mort supprimé. Vérifier avec : make verify"
