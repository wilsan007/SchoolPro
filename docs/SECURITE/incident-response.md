# Plan de réponse aux incidents — SchoolPro / LEARNOS

## 1. Classification des incidents

| Niveau | Description | Exemples | Délai de réponse |
|---|---|---|---|
| **P0 — Critique** | Service indisponible ou fuite de données | Base de données inaccessible, fuite multi-tenant, RLS désactivée | Immédiat (< 15 min) |
| **P1 — Majeur** | Fonctionnalité critique dégradée | Paiements indisponibles, authentification en panne | < 1 h |
| **P2 — Mineur** | Fonctionnalité non critique dégradée | Notifications en retard, export PDF en panne | < 4 h |
| **P3 — Information** | Anomalie sans impact utilisateur | Warning RLS, alerte de performance | < 24 h |

## 2. Procédure de réponse

### Détection
- **Health check** : `GET /api/health` — surveillé par le load balancer
- **Journaux structurés** : `src/lib/logger.ts` — logs JSON sur stdout/stderr
- **Alertes RLS** : `[rls]` dans les logs (mode `warn` ou `enforce`)
- **Audit** : `AuditLog` — actions sensibles journalisées
- **Cron** : tâches planifiées — erreurs visibles dans la réponse `/api/cron/dispatch`

### Containment (endiguement)
1. **Fuite de données** : désactiver le compte concerné (`isActive = false`), révoquer les sessions.
2. **RLS compromise** : passer `RLS_MODE=enforce` immédiatement.
3. **Service indisponible** : redémarrer le conteneur / l'application.

### Eradication
1. Identifier la cause racine via les journaux et l'audit.
2. Appliquer le correctif (hotfix, configuration, migration).
3. Vérifier que l'incident ne se reproduit pas.

### Recovery (rétablissement)
1. **Base de données** : restauration Supabase (Dashboard > Database > Backups > PITR).
2. **Application** : redéploiement via `git push` (Vercel) ou `docker compose up -d`.
3. **Vérification** : `curl https://<app-url>/api/health` — doit retourner `{"ok": true}`.

### Post-mortem
1. Documenter l'incident dans `docs/SECURITE/incidents/` (date, impact, cause, résolution).
2. Ajouter un test de régression pour éviter la récurrence.
3. Revoir les procédures concernées.

## 3. Contacts

- **Responsable technique** : SUPER_ADMIN (configuré dans le tenant par défaut)
- **Supabase** : Dashboard > Support (pour les incidents base de données)
- **Vercel** : Dashboard > Support (pour les incidents de déploiement)

## 4. Rollback

### Code
```bash
git revert <commit>  # annuler le commit fautif
git push            # redéployer
```

### Base de données
```bash
# Supabase PITR : restaurer à un point précis dans le temps
# Via Dashboard > Database > Backups > Point-in-Time Recovery
```

### RLS
```bash
# Désactiver RLS en urgence (si blocage)
RLS_MODE=off  # dans les variables d'environnement
```
