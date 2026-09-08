# Jeu de données Ambouli — Base d'audit isolée

**Date** : 2026-09-08
**Phase** : Préparation du jeu Ambouli pour workflows réels
**Branche** : `feat/rls-isolation-et-infra`

## Base de données isolée

| Champ | Valeur |
|-------|--------|
| Conteneur | `schoolpro-audit-20260907` |
| Port | `127.0.0.1:52232` |
| Base | `schoolpro_audit` |
| PostgreSQL | 17.11 |
| Isolée | Oui (conteneur Docker local) |
| Production | Non |
| Schéma | `prisma db push` depuis `schema.prisma` (127 tables) |
| RLS | 120 tables avec RLS activé, politiques `02-policies.sql` appliquées |

## Seed Ambouli

- **Script** : `prisma/seed-ambouli.ts`
- **Durée** : 1819.5s (~30 min)
- **Statut** : SUCCÈS (12/12 étapes)

### Corrections de seed appliquées

1. `seed-ambouli-facturation.ts` : `tarifKey` utilisait `ambouli` au lieu de `AMB` (code site)
2. `seed-ambouli-learnos-curriculum.ts` : code compétence préfixé par site (`AMB-`/`ARH-`) pour éviter collision sur la contrainte unique `[tenantId, code]`

## Comptages vérifiés

| Table | Nombre de lignes |
|-------|------------------|
| Tenants | 1 |
| Sites | 2 |
| Users | 1 577 |
| Classes | 88 |
| Élèves | 1 520 |
| Parents | 1 520 |
| Évaluations | 10 320 |
| Notes | 292 230 |
| Bulletins | 6 309 |
| Factures | 3 632 |
| Paiements | 24 175 |
| Absences | 2 234 |
| Incidents | 423 |
| Chapitres LEARNOS | 128 |
| Compétences LEARNOS | 274 |
| Learning evidences | 176 353 |
| Recommandations | 29 755 |
| Questions | 2 790 |
| Prédictions | 4 593 |
| Patterns pédago. | 188 |
| Audit logs | 10 |

## Tests RLS (via `SET ROLE ecolpro_app`)

| Test | Résultat | Attendu | Statut |
|------|----------|---------|--------|
| Sans contexte (fail-closed) | 0 | 0 | PASS |
| Tenant fantôme | 0 | 0 | PASS |
| Site ambouli (élèves) | 761 | 761 | PASS |
| Site arhiba (élèves) | 759 | 759 | PASS |
| Tous sites (élèves) | 1 520 | 1 520 | PASS |
| Notes (tenant-only) | 292 230 | 292 230 | PASS |

**Verdict** : RLS fonctionnel — fail-closed, isolation par tenant et par site vérifiées.

## Comptes de démonstration

| Rôle | Email |
|------|-------|
| Admin tenant | `admin@cite-ambouli.dj` |
| Principal Ambouli | `principal.ambouli@cite-ambouli.dj` |
| Principal Arhiba | `principal.arhiba@cite-ambouli.dj` |
| Enseignant | `enseignant@cite-ambouli.dj` |
| Parent | `parent@cite-ambouli.dj` |
| Élève | `eleve@cite-ambouli.dj` |
| Comptable | `comptable@cite-ambouli.dj` |

**Mot de passe** : `Ambouli@2026!`

## Tenant ID réel

`cmtsft4yq0000zbqt4gzm7l96` (généré par Prisma `cuid()`, slug : `cite-scolaire-ambouli`)

## Prochaines étapes

1. Exécuter les workflows W-1 à W-15 sur cette base isolée
2. Vérifier les rôles et limites par site
3. Vérifier le Time Machine sur données réelles
4. Décision Go/No-Go finale
