# Dérive schéma ↔ base — constat du 29 septembre 2026

> **Statut : CONSTAT, aucune correction appliquée.** Ce document existe pour que
> la décision soit prise explicitement, et non par accident dans une migration
> qui parlait d'autre chose.

## Comment la dérive a été découverte

En préparant la migration `20260929160000_add_invitation`, j'ai généré le DDL
attendu avec l'outil officiel plutôt que de l'écrire à la main :

```bash
pnpm prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel  prisma/schema.prisma \
  --script
```

Le script produit ne contenait pas seulement la table `invitations`. Il
contenait aussi des corrections sans rapport — que je n'ai **pas** appliquées.

## Ce que la base porte en plus (ou autrement) que le schéma

| Objet | Action que Prisma demandait | Pourquoi je ne l'ai pas fait |
|---|---|---|
| `impersonation_grants` : 3 clés étrangères (`adminId`, `targetTenantId`, `targetUserId`) | `DROP CONSTRAINT` puis `ADD CONSTRAINT` (Prisma veut `ON UPDATE CASCADE`, absent en base) | Ce n'est pas additif (règle 5). Rejouer un `DROP`+`ADD` de FK sur une table en service verrouille la table le temps de la vérification, et une interruption au mauvais moment laisse la contrainte absente. |
| `learnos_event_deadletters` : 2 clés étrangères | idem | idem — et cette table est la file de rebut LEARNOS : c'est le pire endroit pour une opération non atomique décidée par effet de bord. |
| `seances_pedagogiques_emploiTempsId_idx` | `DROP INDEX` | L'index existe en base mais pas dans le schéma. Le supprimer dégraderait peut-être une requête chaude ; le garder ne coûte qu'un peu d'écriture. Dans le doute, **on ne supprime pas** (règle 5). |
| `rate_limit_counters."updatedAt"` | `ALTER COLUMN … DROP DEFAULT` | Changement de comportement d'une table utilisée avant authentification (login, set-password). À traiter à part, avec un test. |

## Ce qu'il faut décider (et comment)

1. **Les `ON UPDATE CASCADE` manquants** : sont-ils un oubli des migrations
   d'origine, ou un choix ? Les deux tables sont créées par des migrations du
   dépôt ; vérifier si les FK y sont déclarées sans `ON UPDATE`.
   ```bash
   grep -n "FOREIGN KEY" prisma/migrations/*add_impersonation_grant*/migration.sql \
                        prisma/migrations/*add_learnos_event_deadletter*/migration.sql
   ```
   Si le dépôt ne les déclare pas, c'est le SCHÉMA qu'il faut aligner (retirer
   la mention), pas la base qu'il faut modifier.

2. **L'index `seances_pedagogiques_emploiTempsId_idx`** : l'ajouter au schéma
   (`@@index([emploiTempsId])` sur `SeancePedagogique`) s'il est utile, ou
   l'attribuer à un outil externe et le documenter.

3. **Le défaut sur `rate_limit_counters."updatedAt"`** : sans incidence
   fonctionnelle connue (la colonne est toujours écrite par Prisma), mais la
   dérive doit être résorbée pour que `migrate diff` redevienne vide — c'est
   notre seul moyen de vérifier que la base correspond au schéma.

## Pourquoi c'est important

Une dérive schéma ↔ base rend **aveugle** le principal garde-fou de migration :
`migrate diff` devrait répondre « rien à faire » sur une base saine. Tant qu'il
répond autre chose, chaque nouvelle migration arrive noyée dans du bruit — et
c'est précisément dans ce bruit qu'une correction destructrice passe inaperçue.