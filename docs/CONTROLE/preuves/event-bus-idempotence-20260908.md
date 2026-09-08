# Bus d'événements LEARNOS — Test d'idempotence

**Date** : 2026-09-08
**Base** : `schoolpro_audit` (conteneur `schoolpro-audit-20260907`, isolée)
**Tenant** : `cmtsft4yq0000zbqt4gzm7l96` (Cité Scolaire Ambouli)

## Architecture du bus d'événements

### Publication (`src/lib/learnos/events.ts`)

- `publishEvent` / `publishEvents` : écrit dans `learnos_events` (outbox)
- **Ne lève jamais** : un échec de publication ne casse pas l'ERP (§49-1)
- Le payload est un instantané autosuffisant (ne relit pas la note)

### Drainage (`src/lib/learnos/event-bus.ts`)

- Garantie de livraison : **au moins une fois**
- Tout traitement doit être **idempotent** (rejeu possible)
- `MAX_ATTEMPTS = 5` : au-delà, l'événement est abandonné
- Marquage `processedAt` + `attempts` avec `updateMany` (exige `tenantId`)
- `replayEvents` : remet en file + remet à zéro le compteur de tentatives

### Handlers enregistrés

| EventType | Handlers | Idempotence |
|-----------|----------|-------------|
| `note.recorded` | `ingererNoteCommePreuve` → `recalculerProfilsApresPreuve` → `recalculerRecommandationsApresProfil` | `upsert` sur `evidenceId` (SHA-256 déterministe) |
| `seance.cloturee` | `onSeanceCloturee` | Ne modifie que les planifications non traitées |
| `curriculum.imported` | `onCurriculumImported` | Exclut les chapitres déjà planifiés, `skipDuplicates` |
| `chapitre.created` | `onChapitreCreated` | Vérifie l'existence avant création, `skipDuplicates` |
| `competence.created` | `onCompetenceCreated` | Vérifie l'existence avant création |

## Mécanismes d'idempotence

### 1. Evidence Engine (`evidence-engine.ts`)

```typescript
export function evidenceId(sourceType, sourceId, competenceId): string {
  return createHash("sha256")
    .update(`${sourceType}|${sourceId}|${competenceId ?? ""}`)
    .digest("hex").slice(0, 24);
}
```

- ID déterministe → `upsert` au lieu de `create`
- Le retraitement met à jour la même ligne au lieu d'en créer une nouvelle

### 2. Learning Twin (`learning-twin.ts`)

- `recalculerProfil` : **recalcul intégral** (non incrémental) à partir de toutes les preuves
- `upsert` sur `@@unique([eleveId, competenceId])`
- Déterministe : même instant → même résultat

### 3. Recommendation Engine (`recommendation-engine.ts`)

- `recalculerRecommandationsApresProfil` : upsert sur les recommandations
- Déterministe : aucune composante aléatoire

### 4. Curriculum Handlers

- `onCurriculumImported` : exclut les chapitres déjà planifiés (Set difference)
- `onChapitreCreated` : `findFirst` avant `create`, retour anticipé si existe
- `onCompetenceCreated` : `findFirst` avant `create`, retour anticipé si existe
- `skipDuplicates: true` sur `createMany` pour les compétences

## Tests exécutés sur la base Ambouli

### Test 1 : Drainage double de la file existante

| Métrique | Avant | Après #1 | Après #2 |
|----------|-------|----------|----------|
| Evidences | 176 353 | 176 353 | 176 353 |
| Profils | 43 378 | 43 378 | 43 378 |
| Recommandations | 29 755 | 29 755 | 29 755 |
| Evidences uniques | — | 176 353 | 176 353 |
| Profils uniques | — | 43 378 | 43 378 |

**Résultat** : ✅ Aucun doublon créé

### Test 2 : Vrai événement `note.recorded` publié et retraité

| Métrique | Avant | Après #1 | Après #2 |
|----------|-------|----------|----------|
| Evidences pour la note | 0 | 2 | 2 |
| Profils pour l'élève | 38 | 38 | 38 |
| Événement traité | — | 1 | 1 (upsert) |

**Résultat** : ✅ 2 evidences créées (1 par compétence rattachée), pas de doublon au retraitement

### Test 3 : Recalcul de profil (`recalculerProfil`)

| Métrique | Recalcul #1 | Recalcul #2 |
|----------|-------------|-------------|
| masteryScore | 0.9108 | 0.9108 |
| confidenceScore | 0.0376 | 0.0376 |
| masteryStatus | UNKNOWN | UNKNOWN |
| evidenceCount | 4 | 4 |
| trend | hausse | hausse |
| Profils en base | 1 | 1 |

**Résultat** : ✅ Déterministe et idempotent

### Test 4 : Moteur de recommandation

| Métrique | Avant | Après #1 | Après #2 |
|----------|-------|----------|----------|
| Recommandations | 1 | 1 | 1 |

**Résultat** : ✅ Pas de doublon

### Test 5 : Cahier-journal (`onSeanceCloturee`)

| Métrique | Avant | Après #1 | Après #2 |
|----------|-------|----------|----------|
| Statut planification | TRAITE | TRAITE | TRAITE |

**Résultat** : ✅ Pas de changement au retraitement

### Test 6 : Curriculum imported (`onCurriculumImported`)

| Métrique | Avant | Après #1 | Après #2 |
|----------|-------|----------|----------|
| Planif. chapitre | 0 | 10 | 10 |
| Planif. compétence | 0 | 28 | 28 |

**Résultat** : ✅ 10 planif. créées au premier appel, aucune au deuxième

## Défauts de qualité du seed identifiés

### 1. Événements outbox avec payloads placeholder

Le seed (`seed-ambouli-learnos-intelligence.ts`, ligne 477) crée des `LearnosEvent` avec :
```typescript
payload: { site, index, timestamp }
```
au lieu de vrais `NoteRecordedPayload`. Sur 20 événements, 4 `note.recorded` ont un payload incomplet et échouent au drainage avec :
```
note.recorded incomplet : noteId/eleveId/valeur requis
```

**Impact** : Pas d'impact sur l'idempotence — le handler rejette correctement les payloads incomplets.
**Recommandation** : Utiliser des payloads conformes ou des event types sans handler enregistré.

### 2. Profils/recommandations avec `.catch(() => {})`

Le seed (`seed-ambouli-learnos-apprentissage.ts`, lignes 146, 193, 222) utilise :
```typescript
await prisma.studentLearningProfile.create({ ... }).catch(() => {});
profilCount++;
```

Ceci avale silencieusement les violations de contrainte unique `@@unique([eleveId, competenceId])` pour les élèves présents sur les deux années. Les compteurs sont gonflés :

| Entité | Compté par le seed | Réel en base | Écart |
|--------|-------------------|--------------|-------|
| StudentLearningProfile | 50 397 | 43 378 | 7 019 |
| Recommandation | 32 755 | 29 755 | 3 000 |

**Impact** : Pas d'impact sur l'idempotence — les doublons sont évités par la contrainte unique.
**Recommandation** : Utiliser `upsert` au lieu de `create().catch(() => {})`.

## Verdict

**Le bus d'événements LEARNOS est idempotent.**

Tous les mécanismes d'idempotence fonctionnent correctement :
1. `evidenceId` déterministe → `upsert` (pas de doublon de preuves)
2. `recalculerProfil` intégral → `upsert` (pas de doublon de profils)
3. Handlers curriculum : vérification d'existence avant création
4. `skipDuplicates: true` sur `createMany`
5. Marquage `processedAt` avec `updateMany` (exige `tenantId`)

Les 4 échecs d'événements sont des défauts de qualité du seed (payloads placeholder), pas des défauts d'idempotence.
