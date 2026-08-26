# Migration de référence — sortir de la dérive de schéma

## Le problème

`prisma/schema.prisma` décrit **114 modèles**. `prisma/migrations/` contient
**3 migrations**. L'écart vient du mode de développement : le schéma a été
poussé avec `prisma db push`, qui applique les changements directement à la
base sans produire de migration.

Conséquences constatées le 2026-08-21 sur la production (`ecolemiriam`) :

- la table `_prisma_migrations` **n'existe pas** — le schéma n'a jamais été
  créé par `migrate deploy` ;
- la base compte **64 tables** contre 115 dans le modèle ;
- `users` n'avait ni `mustChangePassword`, ni `twoFactorEnabled`, ni
  `totpSecret`, ni `totpSecretIv`, ni `twoFactorVerifiedAt` ; la table
  `user_roles` était absente (corrigé depuis par
  `prisma/sql/MANUAL-03-fix-schema-connexion.sql`) ;
- le déploiement en production ne fait tourner aucun conteneur `migrate`.

Tant que ce point n'est pas traité, chaque déploiement rejouera le même
écart : le code attend un schéma que la base n'a pas.

## `0_init.sql`

Généré par :

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/baseline/0_init.sql
```

4 225 lignes, 115 tables, 59 types énumérés, **aucune instruction
destructrice**. C'est l'état complet du modèle actuel.

> Ce fichier est délibérément **hors de `prisma/migrations/`**. Placé
> dedans, `migrate deploy` tenterait de l'exécuter au démarrage du
> conteneur applicatif et échouerait sur toute base existante (« relation
> already exists »), ce qui bloquerait le déploiement.

## Procédure de bascule

### 1. Base neuve (recette, nouvel établissement)

```bash
mkdir -p prisma/migrations/0_init
cp prisma/baseline/0_init.sql prisma/migrations/0_init/migration.sql
npx prisma migrate deploy
```

Les 3 migrations existantes (`20260120…`, `20260816…`, `20260818…`) sont
**déjà incluses** dans `0_init` — leurs changements font partie du schéma
courant. Les laisser dans `prisma/migrations/` les ferait rejouer après
`0_init` et échouer. Les déplacer dans `prisma/migrations/_archive/` avant
la bascule.

### 2. Base existante et **conforme** au modèle

Marquer la référence comme déjà appliquée, sans rien exécuter :

```bash
npx prisma migrate resolve --applied 0_init
```

### 3. Base existante et **non conforme** — cas de la production

`migrate resolve` déclarerait un état faux et casserait toutes les
migrations suivantes. Il faut d'abord aligner réellement le schéma :

```bash
npx prisma migrate diff \
  --from-url "$DIRECT_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/ecart.sql
```

Le diff obtenu le 2026-08-21 comportait **20 instructions destructrices**
sur des données réelles — elles demandent un arbitrage, pas une exécution
automatique :

| Cible                                   | Données concernées      |
| --------------------------------------- | ----------------------- |
| `DROP TABLE enseignant_matieres`        | 11 lignes               |
| `DROP TABLE enseignant_affectations`    | 1 ligne                 |
| `paiements.directorRecu`                | 28 lignes renseignées   |
| `remises_caisse` (5 colonnes)           | 3 lignes                |
| `depenses.categorie`, `createdById`     | 1 ligne                 |

Plusieurs `ADD COLUMN … NOT NULL` sans valeur par défaut échoueraient aussi
sur des tables non vides (`remises_caisse.dateRemise`, `depenses.libelle`,
`progressions_eleves.tenantId`) : il faut leur donner une valeur de repli ou
les ajouter en deux temps.

Le diff complet de la production au 2026-08-21 est archivé dans
`prisma/sql/_audit/patch-schema-complet-production.sql`.

Une fois le schéma réellement aligné, et seulement là :

```bash
npx prisma migrate resolve --applied 0_init
```

### 4. Ensuite

Abandonner `prisma db push` au profit de `prisma migrate dev` : chaque
changement de modèle produit alors une migration que `migrate deploy`
rejouera fidèlement en production.
