# SchoolPro — Politique de migrations additives

**Inspiré de GOSE 2.0 (MENFOP Djibouti) — règle non négociable n°5.**

> Les migrations sont ADDITIVES par défaut. On ajoute, on ne supprime jamais
> en une seule étape. La suppression se fait dans une migration ultérieure
> après vérification que l'ancienne colonne n'est plus lue.

---

## 1. Principe directeur

Une migration de base de données modifie l'état permanent de l'application.
Une migration mal conçue peut causer une perte de données irréversible ou
un downtime non planifié. La politique additive minimise ces risques.

**Règle :** Toute migration qui supprime ou modifie une structure existante
doit suivre la procédure en 4 étapes (§2). Les migrations purement additives
(ajout de colonne, de table, d'index) peuvent être appliquées directement.

---

## 2. Procédure en 4 étapes pour toute migration destructive

### Étape 1 — Migration additive

Ajouter la nouvelle colonne/table, garder l'ancienne intacte.

```sql
-- Migration 1 : Ajouter la nouvelle colonne
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "valeurCentimes" Integer;
```

### Étape 2 — Déploiement du code double-écriture

Le code utilise la nouvelle structure en écriture, et lit l'ancienne en
fallback :

```typescript
// Lire : nouvelle colonne, fallback ancienne
const centiemes = note.valeurCentimes ?? Math.round(note.valeur * 100);

// Écrire : les deux colonnes
await prisma.note.update({
  data: { valeur: 14.5, valeurCentimes: 1450 },
});
```

### Étape 3 — Vérification que l'ancienne colonne n'est plus lue

- Audit de code : `grep -r "valeur" src/ --include="*.ts" | grep -v valeurCentimes`
- Monitoring : vérifier que la nouvelle colonne est peuplée à 100%
- Attendre au moins un cycle de déploiement complet

### Étape 4 — Migration de suppression

```sql
-- Migration 2 : Supprimer l'ancienne colonne
ALTER TABLE "notes" DROP COLUMN IF EXISTS "valeur";
```

---

## 3. Règles d'idempotence

Chaque migration doit vérifier l'existence avant d'ajouter. Une migration
qui échoue à mi-chemin doit pouvoir être rejouée sans erreur.

```sql
-- ✅ Correct : idempotent
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "valeurCentimes" Integer;

-- ❌ Incorrect : échoue si la colonne existe déjà
ALTER TABLE "notes" ADD COLUMN "valeurCentimes" Integer;
```

Pour les index :

```sql
-- ✅ Correct : idempotent (PostgreSQL 9.5+)
CREATE INDEX IF NOT EXISTS "idx_notes_valeurCentimes" ON "notes"("valeurCentimes");
```

---

## 4. Règles de nommage

- Format : `YYYYMMDDHHMMSS_description_courte`
- Description en `snake_case`
- Chaque migration a un fichier `migration.sql` et un commentaire descriptif
- Le dossier de migration contient un `README.md` optionnel

Exemples :
```
20260828000000_facture_candidature_inscription/
20260827000000_tache_source_auto/
20260827120000_modele_niveaux_tenant/
```

---

## 5. Checklist pré-migration

Avant de créer une migration, vérifier :

- [ ] La migration est-elle additive ? (si non → procédure 4 étapes)
- [ ] Si destructive, la procédure 4 étapes est-elle documentée ?
- [ ] La migration est-elle idempotente ? (`IF NOT EXISTS`, `IF EXISTS`)
- [ ] Le rollback est-il possible ? (la migration précédente restaure l'état)
- [ ] Les données existantes sont-elles préservées ? (pas de perte)
- [ ] Les index sont-ils créés sans verrouiller la table en production ?
  (`CREATE INDEX CONCURRENTLY` pour les tables > 1M lignes)
- [ ] Le schéma Prisma est-il régénéré après la migration ?
  (`pnpm prisma generate`)
- [ ] Les tests passent après la migration ? (`pnpm verify`)

---

## 6. Exemple concret — migration `valeur` de Float vers Integer (centièmes)

### Migration 1 (additive) — `20260901000000_notes_centimes_add`

```sql
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "valeurCentimes" Integer;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "noteMaxCentimes" Integer;
```

### Backfill — `20260901000001_notes_centimes_backfill`

```sql
UPDATE "notes"
SET "valeurCentimes" = ROUND("valeur" * 100)
WHERE "valeurCentimes" IS NULL;

UPDATE "notes"
SET "noteMaxCentimes" = ROUND("noteMax" * 100)
WHERE "noteMaxCentimes" IS NULL;
```

### Code double-écriture (déploiement)

```typescript
// src/lib/domain/note-adapter.ts
export function adaptNote(note: PrismaNote): Note {
  const centiemes = note.valeurCentimes ?? Math.round(note.valeur * 100);
  return Note.depuisCentiemes(centiemes);
}
```

### Migration 2 (suppression) — après confirmation

```sql
-- 20260915000000_notes_centimes_drop_float
ALTER TABLE "notes" DROP COLUMN IF EXISTS "valeur";
ALTER TABLE "notes" DROP COLUMN IF EXISTS "noteMax";
```

---

## 7. Commandes de vérification

```bash
pnpm prisma migrate status    # Statut des migrations
pnpm prisma validate          # Cohérence du schéma
pnpm prisma migrate diff      # Diff entre schéma et base
pnpm prisma generate          # Régénérer le client après modif
pnpm verify                   # Vérification complète (lint + tsc + tests + audit)
```

---

## 8. Règle pour les index en production

Ne jamais créer un index sur une table de plus de 1M lignes en production
sans utiliser `CREATE INDEX CONCURRENTLY` (PostgreSQL). Un `CREATE INDEX`
standard pose un verrou exclusif sur la table pendant toute la durée de
la création.

```sql
-- ✅ Correct pour les grandes tables
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_notes_valeurCentimes"
  ON "notes"("valeurCentimes");

-- ❌ Incorrect pour les grandes tables (verrou exclusif)
CREATE INDEX "idx_notes_valeurCentimes" ON "notes"("valeurCentimes");
```

Note : `CREATE INDEX CONCURRENTLY` ne peut pas être exécuté dans une
transaction. Prisma migrations l'exécute automatiquement hors transaction
si la migration contient `-- prisma-migrate-concurrent` en commentaire.
