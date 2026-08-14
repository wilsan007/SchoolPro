# Plan d'implémentation LEARNOS dans SchoolPro

> **Public visé : un agent de coding, y compris peu autonome.**
> Chaque lot est atomique, ordonné, et se termine par une commande de vérification.
> **Règle d'or : ne jamais démarrer un lot si le lot précédent n'est pas vert.**

**Prérequis absolu :** lire `docs/learnos-integration-audit.md` avant de commencer.

---

## Table des lots

| Lot | Titre | Dépend de | Effort |
|---|---|---|---|
| **P0-A** | Corriger les 86 violations `require-site-filter` | — | 2–3 j |
| **P0-B** | Corriger les 17 violations `require-tenant-id` | — | 1 j |
| **P0-C** | Corriger l'isolation de `ProgressionEleve` | P0-A | 0,5 j |
| **P0-D** | Verrouiller la CI (lint bloquant) | P0-A, P0-B, P0-C | 0,5 j |
| **P1-A** | Abstraction `AIProvider` + fournisseurs gratuits | P0-D | 1,5 j |
| **P1-B** | Routeur hybride + cache + journal des décisions IA | P1-A | 1,5 j |
| **P2-A** | Schéma Prisma — Curriculum Graph | P0-D | 1 j |
| **P2-B** | API + UI Curriculum | P2-A | 2 j |
| **P3-A** | Schéma `LearningEvidence` + Event Bus | P2-A | 1,5 j |
| **P3-B** | Evidence Engine (règles déterministes) | P3-A, P1-B | 2 j |
| **P4** | Student Learning Twin (mastery + confidence) | P3-B | 2,5 j |
| **P5** | Diagnostic des erreurs | P4 | 2 j |
| **P6** | Intervention Engine (human-in-the-loop) | P4 | 2 j |
| **P7** | Teacher Copilot (UI) | P6 | 2,5 j |
| **P8** | Question Engine + variantes anti-triche | P4, P1-B | 3 j |
| **P9** | School Intelligence | P6 | 2 j |
| **P10** | Vue élève + mobile | P4 | 1,5 j |

**Reporté hors périmètre initial** (à rediscuter après P10) : OCR/copies manuscrites (§20 v2), School Memory/RAG (§33 v2), AI Meeting Manager (§22 v1). Raison : ces briques exigent une infrastructure (workers Python, base vectorielle, transcription) absente de la stack et non justifiée avant que la boucle Evidence→Twin→Intervention ne fonctionne.

---

# PHASE 0 — Sécuriser l'existant (BLOQUANT)

> Justification : LEARNOS ajoute des données d'apprentissage nominatives, plus sensibles que des notes. Les greffer sur une isolation défaillante aggraverait la fuite. Principes non négociables v2 §49-11 et §49-12 : *« Do not bypass RBAC/RLS. Do not break tenant isolation. »*

## Lot P0-A — Corriger les 86 violations `require-site-filter`

### Contexte à connaître
- L'outil est déjà fourni : `siteFilterForModel(model, session.user)` dans `src/lib/site-scope.ts`.
- Fusionner avec `mergeFilters(a, b)` — **jamais** avec un spread `{...a, ...b}` (l'étalement écrase la clé `AND` et supprime silencieusement un filtre).
- Alternative : `prismaSiteScoped()` qui injecte le filtre automatiquement, mais **ne filtre pas les `include`**.

### Procédure exacte

**Étape 1** — Générer la liste de travail :
```bash
pnpm run lint 2>&1 | grep -B50 "require-site-filter" > /tmp/site-filter-todo.txt
```

**Étape 2** — Traiter les fichiers dans **cet ordre** (du plus sensible au moins sensible) :

1. `src/lib/actions/facture.ts` (8)
2. `src/lib/actions/facturation-avancee.ts` (11)
3. `src/lib/financial-guard.ts` (5)
4. `src/lib/actions/parametres.ts` (5)
5. `src/lib/import-eleves-server.ts` (3)
6. `src/lib/attestation-generator.ts` (1)
7. `src/app/api/rh/**` (6)
8. `src/app/api/examens/**` (6)
9. `src/app/api/emploi-du-temps/**` (9)
10. `src/app/api/vie-scolaire/**` (4)
11. `src/app/api/sms/send/route.ts`, `src/app/api/webhooks/**` (5)
12. `src/app/(dashboard)/**` (14)

**Étape 3** — Pour chaque violation, appliquer le patron correspondant :

**Cas A — requête racine sans filtre :**
```typescript
// AVANT
const factures = await prisma.facture.findMany({
  where: { tenantId, statut: "IMPAYEE" },
});

// APRÈS
import { siteFilterForModel, mergeFilters } from "@/lib/site-scope";

const factures = await prisma.facture.findMany({
  where: mergeFilters(
    { tenantId, statut: "IMPAYEE" },
    siteFilterForModel("facture", session.user)
  ),
});
```

**Cas B — `include` d'une relation to-many :**
```typescript
// AVANT
const classes = await prisma.classe.findMany({
  where: mergeFilters({ tenantId }, siteFilterForModel("classe", session.user)),
  include: { eleves: true },
});

// APRÈS
const classes = await prisma.classe.findMany({
  where: mergeFilters({ tenantId }, siteFilterForModel("classe", session.user)),
  include: {
    eleves: { where: siteFilterForModel("eleve", session.user) },
  },
});
```
> Attention : la règle nomme la **relation** (`eleves`), mais `siteFilterForModel` attend le **modèle** (`eleve`). Vérifier la cible dans `prisma/schema.prisma`.

**Cas C — webhook / cron sans session** (`api/webhooks/sms`, `api/webhooks/whatsapp`, `api/cron/*`) : il n'y a pas d'utilisateur. Résoudre le `tenantId` depuis la donnée entrante (ex. numéro de téléphone → `Parent` → `tenantId`), puis **documenter l'exemption** :
```typescript
// eslint-disable-next-line ecolpro/require-site-filter -- webhook entrant : aucune session ;
// le tenant est résolu depuis le numéro appelant, et la réponse ne dévoile aucune donnée d'un autre site.
const parent = await prisma.parent.findFirst({ where: { telephone } });
```
> **Un `eslint-disable` sans commentaire justificatif est un échec du lot.** Chaque exemption doit expliquer *pourquoi* l'isolation est portée autrement.

**Cas D — `src/lib/auth.ts` et `src/lib/tenant-claims.ts`** : ce sont les fonctions qui *établissent* la session. Elles ne peuvent pas dépendre d'elle. Le fichier `auth.ts:93` porte déjà l'exemption correcte — **reproduire ce patron**, ne pas tenter de "corriger" ces appels.

### Vérification du lot P0-A
```bash
pnpm run lint 2>&1 | grep -c "require-site-filter"
```
Attendu : **0**. Puis :
```bash
pnpm exec tsc --noEmit && pnpm run test
```

---

## Lot P0-B — Corriger les 17 violations `require-tenant-id`

### Le patron unique à appliquer
La règle signale une écriture par identifiant sans preuve d'appartenance. Un `update({ where: { id } })` sur un id deviné modifie la donnée d'un autre établissement.

```typescript
// AVANT
await prisma.ficheRH.update({ where: { id }, data: { salaireBase } });

// APRÈS
const existante = await prisma.ficheRH.findFirst({
  where: mergeFilters({ id, tenantId }, siteFilterForModel("ficheRH", session.user)),
  select: { id: true },
});
if (!existante) {
  return NextResponse.json({ error: "Introuvable" }, { status: 404 });
}
await prisma.ficheRH.update({ where: { id }, data: { salaireBase } });
```
> Renvoyer **404**, jamais 403 : un 403 confirmerait à l'attaquant que l'id existe ailleurs.

### Fichiers concernés
`src/app/api/rh/absences/[id]/route.ts:56`, `src/app/api/rh/conges/[id]/route.ts:51`, `src/lib/actions/facturation-avancee.ts:77,386,420`, `src/lib/actions/register.ts:39`, `src/lib/actions/user-tenant.ts:64,208`, `src/lib/financial-guard.ts:138,166`, `src/lib/notifications/dispatch.ts:168,183`, `src/lib/import-eleves-server.ts:101`, `src/lib/auth.ts:94,133` (exemption documentée), `src/lib/tenant-claims.ts:51,206` (exemption documentée).

### Vérification
```bash
pnpm run lint 2>&1 | grep -c "require-tenant-id"
```
Attendu : **0**.

---

## Lot P0-C — Corriger l'isolation de `ProgressionEleve`

**Problème** (`prisma/schema.prisma:1969`) : le modèle n'a ni `tenantId` ni `siteId`, et relie l'élève par un champ texte `eleveNom` au lieu d'une clé étrangère. Il est donc invisible au filtrage par site, alors qu'il portera la progression pédagogique.

**Fichier :** `prisma/schema.prisma`
```prisma
model ProgressionEleve {
  id       String @id @default(cuid())
  tenantId String                                    // AJOUT
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)  // AJOUT

  coursId String
  cours   Cours  @relation(fields: [coursId], references: [id], onDelete: Cascade)

  eleveId String?                                    // CHANGEMENT : devient une vraie FK
  eleve   Eleve? @relation(fields: [eleveId], references: [id], onDelete: Cascade)  // AJOUT
  eleveNom String                                    // conservé (compat. données existantes)

  contenusVus   String[]
  pctCompletion Int       @default(0)
  noteFinale    Float?
  isTermine     Boolean   @default(false)
  termineeAt    DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([coursId, eleveNom])
  @@index([tenantId])                                // AJOUT
  @@index([eleveId])                                 // AJOUT
  @@map("progressions_eleves")
}
```
Ajouter la relation inverse dans `model Eleve` : `progressions ProgressionEleve[]` et dans `model Tenant` : `progressionsEleves ProgressionEleve[]`.

Puis migration :
```bash
pnpm exec prisma migrate dev --name progression_eleve_tenant_isolation
```
> **Migration de données** : les lignes existantes n'ont pas de `tenantId`. Écrire la migration en deux temps — colonne nullable → backfill via `coursId → Cours.tenantId` → passage en `NOT NULL`. Ne jamais rendre la colonne obligatoire d'emblée sur une table peuplée.

`src/lib/site-scope.ts` conserve `progressionEleve: { one: "cours" }` — correct, ne pas modifier.

---

## Lot P0-D — Verrouiller la CI

**Fichier :** `.github/workflows/ci.yml` — vérifier que le job échoue sur le lint (ne pas ajouter `continue-on-error`).

Ajouter un test de non-régression, **fichier neuf** `src/lib/site-scope.regression.test.ts` :
```typescript
import { describe, it, expect } from "vitest";
import { siteFilterForModel, mergeFilters } from "@/lib/site-scope";

describe("garde-fous d'isolation", () => {
  it("refuse tout pour un modèle inconnu (fail-closed)", () => {
    const filtre = siteFilterForModel("modele_inexistant", {
      siteId: "s1", siteIds: ["s1"], tenantHasSites: true, role: "TEACHER",
    } as never);
    expect(filtre).not.toEqual({});
  });

  it("mergeFilters ne perd aucun prédicat AND", () => {
    const a = { AND: [{ x: 1 }] };
    const b = { AND: [{ y: 2 }] };
    expect((mergeFilters(a, b).AND as unknown[]).length).toBe(2);
  });
});
```

### Vérification finale de la Phase 0
```bash
pnpm run verify
```
**Doit être vert. Aucun lot suivant ne démarre tant que ce n'est pas le cas.**

---

# PHASE 1 — Fondation IA (fournisseurs gratuits)

> Spec v2 §37 : *« Créer une interface `AIProvider` permettant de remplacer le fournisseur sans réécrire LEARNOS. »*
> Spec v2 §38 : *« Ne pas appeler un LLM lorsque des règles déterministes suffisent. »*

## Lot P1-A — Abstraction `AIProvider` + fournisseurs gratuits

### Fichier neuf : `src/lib/ai/provider.ts`
```typescript
/**
 * Abstraction de fournisseur LLM (LEARNOS §37).
 * Toute opération IA passe par cette interface — jamais par un client concret.
 */
export interface AiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface AiGenerationMeta {
  /** Traçabilité obligatoire (LEARNOS §37 + §40). */
  providerName: string;
  modelName: string;
  modelVersion: string;
  promptVersion: string;
  latencyMs: number;
  /** null si le fournisseur ne les remonte pas. */
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface AiResult {
  content: string | null;
  toolCalls: { id: string; name: string; arguments: string }[];
  meta: AiGenerationMeta;
}

export interface AiProvider {
  readonly name: string;
  /** false si la config (clé, URL) est absente : le routeur passe au suivant. */
  isAvailable(): boolean;
  /** Coût indicatif : 0 = gratuit/local. Sert au routeur à préférer le moins cher. */
  readonly costTier: 0 | 1 | 2;
  generate(
    messages: AiMessage[],
    options?: { temperature?: number; maxTokens?: number; tools?: unknown[]; promptVersion?: string }
  ): Promise<AiResult>;
}

export class AiUnavailableError extends Error {}
```

### Fichier neuf : `src/lib/ai/providers/ollama.ts`
Fournisseur **local et gratuit** (`costTier: 0`). Variables : `OLLAMA_BASE_URL` (défaut `http://localhost:11434`), `OLLAMA_MODEL` (défaut `gemma2:2b`). API `POST {base}/api/chat`, corps `{ model, messages, stream: false }`. `isAvailable()` retourne `Boolean(process.env.OLLAMA_BASE_URL)`.

### Fichier neuf : `src/lib/ai/providers/groq.ts`
Fournisseur **cloud à palier gratuit** (`costTier: 1`). Variables : `GROQ_API_KEY`, `GROQ_MODEL` (défaut `llama-3.1-8b-instant`). API compatible OpenAI : `POST https://api.groq.com/openai/v1/chat/completions`.
> Groq impose un quota par minute. En cas de `429`, lever `AiUnavailableError` (et non `Error`) pour que le routeur bascule au fournisseur suivant.

### Fichier neuf : `src/lib/ai/providers/glm.ts`
Enrobe le client **existant** `src/lib/ai/glm-client.ts` (`costTier: 2`). **Ne pas réécrire ni supprimer `glm-client.ts`** — il est utilisé en production par `api/ai/chat` avec du function calling qui fonctionne, y compris son repli sur les balises `<tool_call>`.

### Ajouts à `.env.example`
```bash
# --- LEARNOS : fournisseurs IA (par ordre de préférence, du gratuit au payant) ---
# 1. Ollama local — gratuit et illimité. Installer : https://ollama.com
#    puis : ollama pull gemma2:2b
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma2:2b
# 2. Groq — palier gratuit généreux. Clé : https://console.groq.com/keys
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
# 3. GLM/OpenRouter (payant) — déjà configuré plus haut, sert de dernier recours.
```

### Tests — fichier neuf `src/lib/ai/provider.test.ts`
Vérifier : `isAvailable()` est `false` sans variables d'environnement ; un `429` produit bien `AiUnavailableError` ; `meta` est toujours renseigné.

---

## Lot P1-B — Routeur hybride, cache et journal des décisions

### Fichier neuf : `src/lib/ai/router.ts`
```typescript
/**
 * Routeur LEARNOS (§36, §38) : Règles → local gratuit → cloud gratuit → payant.
 * Toute opération IA de LEARNOS passe par ici — jamais par un provider en direct.
 */
export type AiTaskComplexity = "deterministic" | "simple" | "complex";

export async function routeAi(
  task: { complexity: AiTaskComplexity; promptVersion: string },
  messages: AiMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<AiResult>;
```
Comportement exigé :
1. `complexity: "deterministic"` → **lever une erreur**. Une tâche déterministe ne doit jamais atteindre un LLM (§38). Le développeur doit écrire une règle.
2. Sinon : essayer les fournisseurs disponibles par `costTier` croissant. Sur `AiUnavailableError`, passer au suivant. Si aucun ne répond : `AiUnavailableError` finale.
3. **Cache** : clé = `sha256(modelName + promptVersion + JSON(messages))`, TTL 24 h. Un même bulletin re-généré deux fois ne doit pas coûter deux appels (§38 « cachés, idempotents »). Implémentation : table Prisma `AiCache` (pas de dépendance Redis — le plan Vercel est Hobby).

### Nouveau modèle Prisma — `prisma/schema.prisma`
```prisma
/// Journal de toute décision IA (LEARNOS §40 — traçabilité obligatoire).
model AiDecisionLog {
  id       String  @id @default(cuid())
  tenantId String
  tenant   Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  siteId   String?
  site     Site?   @relation(fields: [siteId], references: [id], onDelete: SetNull)

  actorType String   // "AI" | "USER"
  actorId   String?  // userId si USER
  action    String   // "evidence.classify", "twin.recompute", "intervention.propose"

  inputRef  String?  // id de l'entité analysée (evidenceId, eleveId…)
  output    Json
  confidence Float?

  providerName  String
  modelName     String
  modelVersion  String
  promptVersion String

  approvedBy String?   // userId de l'enseignant qui valide (§39 human-in-the-loop)
  approvedAt DateTime?
  rejectedAt DateTime?

  createdAt DateTime @default(now())

  @@index([tenantId])
  @@index([siteId])
  @@index([action])
  @@index([inputRef])
  @@map("ai_decision_logs")
}

/// Cache d'appels LLM — évite de repayer une génération identique (§38).
model AiCache {
  id        String   @id @default(cuid())
  cacheKey  String   @unique
  response  Json
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([expiresAt])
  @@map("ai_cache")
}
```

### ⚠️ Étape obligatoire après TOUT ajout de modèle
Ouvrir `src/lib/site-scope.ts` et déclarer chaque nouveau modèle dans `SITE_PATHS` :
```typescript
aiDecisionLog: "column",   // porte siteId
aiCache:       "tenant",   // cache technique, sans données nominatives
```
> **Un modèle absent de `SITE_PATHS` reçoit `DENY_ALL` (fail-closed) : toutes les requêtes retourneront vide.** Le test `src/lib/site-scope.model.test.ts` échouera — c'est le garde-fou attendu, il indique un oubli de déclaration.

### Vérification
```bash
pnpm exec prisma migrate dev --name learnos_ai_layer && pnpm run verify
```

---

# PHASE 2 — Curriculum Knowledge Graph

> Spec v1 §6 / v2 §7. Fondation de tout le reste : sans compétences, pas de preuve rattachable.

## Lot P2-A — Schéma Prisma

Ajouter à `prisma/schema.prisma` :
```prisma
enum MasteryStatus {
  UNKNOWN
  EMERGING
  DEVELOPING
  PROFICIENT
  MASTERED
  NEEDS_REVIEW
}

/// Chapitre d'une matière (LEARNOS §7 v2).
model Chapitre {
  id       String  @id @default(cuid())
  tenantId String
  tenant   Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  siteId   String? // null = chapitre partagé entre tous les sites du tenant
  site     Site?   @relation(fields: [siteId], references: [id], onDelete: SetNull)

  matiereId String
  matiere   Matiere @relation(fields: [matiereId], references: [id], onDelete: Cascade)

  nom    String
  niveau String  // "Terminale", "CM2" — aligné sur Classe.niveau
  ordre  Int     @default(0)

  competences Competence[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId])
  @@index([siteId])
  @@index([matiereId])
  @@map("chapitres")
}

/// Compétence évaluable, avec ses prérequis (LEARNOS §7 v2, §32 root cause).
model Competence {
  id       String  @id @default(cuid())
  tenantId String
  tenant   Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  siteId   String?
  site     Site?   @relation(fields: [siteId], references: [id], onDelete: SetNull)

  chapitreId String
  chapitre   Chapitre @relation(fields: [chapitreId], references: [id], onDelete: Cascade)

  code        String  // "FRAC-ADD-01"
  libelle     String  // "Additionner deux fractions"
  description String?
  ordre       Int     @default(0)

  /// Auto-relation many-to-many : prérequis ← → dépendants.
  prerequis   Competence[] @relation("CompetencePrerequis")
  dependants  Competence[] @relation("CompetencePrerequis")

  evidences     LearningEvidence[]
  profils       StudentLearningProfile[]
  interventions StudentIntervention[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, code])
  @@index([tenantId])
  @@index([siteId])
  @@index([chapitreId])
  @@map("competences")
}
```
Relations inverses à ajouter : dans `Matiere` → `chapitres Chapitre[]` ; dans `Tenant` et `Site` → les collections correspondantes.

Déclarer dans `SITE_PATHS` (`src/lib/site-scope.ts`) :
```typescript
chapitre:   "column",
competence: "column",
```
Et dans `eslint-rules/require-site-filter.js`, ajouter `"chapitre"`, `"competence"` à `SITE_SCOPED_MODELS`.

> **Piège auto-relation** : Prisma exige que les deux côtés portent le *même* nom de relation (`"CompetencePrerequis"`). Un cycle de prérequis (A requiert B requiert A) n'est pas empêché par la base — le valider en applicatif dans l'API du lot P2-B (parcours en profondeur avant insertion).

## Lot P2-B — API + UI Curriculum

**Routes neuves** (copier la structure de `src/app/api/examens/route.ts` : `auth()` → `checkPermission()` → validation Zod → requête filtrée) :
- `GET/POST /api/learnos/curriculum/chapitres`
- `GET/POST/PATCH/DELETE /api/learnos/curriculum/competences`
- `POST /api/learnos/curriculum/competences/[id]/prerequis`
- `POST /api/learnos/curriculum/suggest` — Shadow Curriculum (v2 §8) : l'IA **propose** un arbre de compétences à partir d'un chapitre ; l'enseignant valide. Passe par `routeAi({ complexity: "complex", promptVersion: "curriculum-suggest-v1" })`.

**Permissions** — ajouter à `ROLE_PERMISSIONS` dans `src/lib/rbac.ts` :
```typescript
// TENANT_ADMIN, PRINCIPAL : "curriculum:*"
// TEACHER, CLASS_TEACHER   : "curriculum:read", "curriculum:write"
// COUNSELOR                : "curriculum:read"
```

**UI** : `src/app/(dashboard)/curriculum/page.tsx` + `src/components/curriculum/CurriculumTree.tsx` (arborescence Matière → Chapitre → Compétence, réutiliser les composants `src/components/ui/*`).

---

# PHASE 3 — Evidence Engine

> Spec v2 §9-12. Principe cardinal (§11) : **une réponse n'est pas une maîtrise**.

## Lot P3-A — Schéma `LearningEvidence` + Event Bus

```prisma
enum EvidenceType {
  DEVOIR
  EXAMEN
  QUIZ
  EXERCICE
  PROJET
  ORAL
  OBSERVATION
  RETEST
}

enum ErrorType {
  CONCEPTUAL_ERROR
  PROCEDURAL_ERROR
  CALCULATION_ERROR
  READING_ERROR
  MISINTERPRETATION
  MISSING_PREREQUISITE
  INCOMPLETE_REASONING
  CARELESS_ERROR
  GUESS
  UNKNOWN
}

/// Preuve d'apprentissage (LEARNOS §10 v2). N'altère JAMAIS la note officielle.
model LearningEvidence {
  id       String  @id @default(cuid())
  tenantId String
  tenant   Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  siteId   String?
  site     Site?   @relation(fields: [siteId], references: [id], onDelete: SetNull)

  eleveId String
  eleve   Eleve  @relation(fields: [eleveId], references: [id], onDelete: Cascade)

  competenceId String
  competence   Competence @relation(fields: [competenceId], references: [id], onDelete: Cascade)

  matiereId String?
  matiere   Matiere? @relation(fields: [matiereId], references: [id], onDelete: SetNull)

  /// Traçabilité vers la production d'origine (§40 : Insight → Evidence → Question → Assignment).
  sourceType String  // "note" | "evaluation" | "examen" | "observation"
  sourceId   String

  noteId       String?
  note         Note?       @relation(fields: [noteId], references: [id], onDelete: SetNull)
  evaluationId String?
  evaluation   Evaluation? @relation(fields: [evaluationId], references: [id], onDelete: SetNull)

  evidenceType EvidenceType
  rawScore     Float?   // score brut observé
  maxScore     Float?
  /// Signal normalisé 0..1 — PAS une note officielle (§9 v1).
  masterySignal Float
  /// Confiance dans CE signal, distincte de la maîtrise (§14 v2).
  confidence    Float
  /// Poids de la preuve, configurable par type (§12 v2).
  weight        Float    @default(1)

  errorType       ErrorType?
  errorConfidence Float?

  metadata Json?

  createdAt DateTime @default(now())

  @@index([tenantId])
  @@index([siteId])
  @@index([eleveId, competenceId])
  @@index([sourceType, sourceId])
  @@map("learning_evidences")
}
```
`SITE_PATHS` : `learningEvidence: "column"`. Ajouter aussi à `SITE_SCOPED_MODELS` de la règle ESLint.

### Event Bus — fichier neuf `src/lib/events/bus.ts`
> Spec v1 §24 / v2 §35 : *« Préférer une couche de domain events à des dépendances directes. »*
> Contrainte réelle : **plan Vercel Hobby, pas de worker persistant.** Donc bus **in-process**, avec persistance des échecs pour reprise par cron — pas de Bull/Redis.

```typescript
export type DomainEvent =
  | { type: "note.recorded"; tenantId: string; siteId: string | null; noteId: string }
  | { type: "evaluation.completed"; tenantId: string; siteId: string | null; evaluationId: string }
  | { type: "evidence.created"; tenantId: string; siteId: string | null; evidenceId: string }
  | { type: "twin.updated"; tenantId: string; siteId: string | null; eleveId: string; competenceId: string };

/** Publie un événement. Ne lève jamais : un échec de LEARNOS ne doit pas casser l'ERP. */
export async function publish(event: DomainEvent): Promise<void>;
export function subscribe<T extends DomainEvent["type"]>(
  type: T, handler: (e: Extract<DomainEvent, { type: T }>) => Promise<void>
): void;
```
**Règle absolue** : `publish()` capture toute exception du handler et la journalise. Si l'enregistrement d'une note échoue parce que le calcul de maîtrise a planté, LEARNOS a violé le principe « zero-change » (v2 §49-1).

Brancher `publish({ type: "note.recorded", ... })` **après** le commit de la note existante, dans les routes de saisie (`src/app/api/evaluations/[id]/notes/route.ts`). Ne modifier aucune logique de notation.

## Lot P3-B — Evidence Engine

### Fichier neuf : `src/lib/learnos/evidence-engine.ts`
```typescript
/**
 * Transforme une production scolaire en preuves d'apprentissage.
 * 100 % déterministe — AUCUN appel LLM ici (§38 : « Do not call an LLM when
 * deterministic logic is sufficient »). Le LLM n'intervient qu'au lot P5,
 * pour classer les erreurs sur réponses ouvertes.
 */
export const EVIDENCE_WEIGHTS: Record<EvidenceType, number> = {
  QUIZ: 0.4, EXERCICE: 0.6, DEVOIR: 1.0, PROJET: 1.4,
  EXAMEN: 1.8, ORAL: 0.8, OBSERVATION: 0.5, RETEST: 2.0, // (§12 v2)
};

export function computeMasterySignal(rawScore: number, maxScore: number): number;
export function computeEvidenceConfidence(type: EvidenceType, maxScore: number): number;
export async function createEvidenceFromNote(noteId: string, claims: SessionSiteClaims): Promise<void>;
```
Règles de calcul, à implémenter littéralement :
- `masterySignal = clamp(rawScore / maxScore, 0, 1)`.
- La confiance d'une preuve croît avec le barème (une note sur 20 informe plus qu'une sur 2) et avec le poids du type : `confidence = min(0.95, 0.3 + 0.1 * log2(maxScore) + 0.15 * weight)`.
- **Si la note n'est rattachée à aucune compétence, ne rien créer** et journaliser. Ne jamais inventer de rattachement.

### Tests obligatoires — `src/lib/learnos/evidence-engine.test.ts`
- Une note de 20/20 sur un quiz ne produit **jamais** `masterySignal = 1` avec une confiance haute (anti « Correct = Mastered », §11 v2).
- Un retest a un poids strictement supérieur à un quiz.
- Une note sans compétence ne crée aucune preuve.

---

# PHASE 4 — Student Learning Twin

> Spec v2 §13-14. **Séparer maîtrise et confiance est non négociable** (§49-9 : « Do not hide AI uncertainty »).

```prisma
/// Jumeau d'apprentissage : état estimé par compétence (LEARNOS §13 v2).
model StudentLearningProfile {
  id       String  @id @default(cuid())
  tenantId String
  tenant   Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  siteId   String?
  site     Site?   @relation(fields: [siteId], references: [id], onDelete: SetNull)

  eleveId String
  eleve   Eleve  @relation(fields: [eleveId], references: [id], onDelete: Cascade)

  competenceId String
  competence   Competence @relation(fields: [competenceId], references: [id], onDelete: Cascade)

  /// 0..1 — estimation de maîtrise. N'est PAS une note officielle (§9 v1).
  masteryScore    Float         @default(0)
  /// 0..1 — confiance dans l'estimation ci-dessus. Distincte (§14 v2).
  confidenceScore Float         @default(0)
  masteryStatus   MasteryStatus @default(UNKNOWN)

  evidenceCount  Int       @default(0)
  lastEvidenceAt DateTime?
  /// "rising" | "stable" | "falling"
  trend          String    @default("stable")

  errorPatterns      Json?
  prerequisiteStatus Json?
  recommendedAction  String?

  computedAt DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([eleveId, competenceId])
  @@index([tenantId])
  @@index([siteId])
  @@index([competenceId, masteryStatus])
  @@map("student_learning_profiles")
}
```

### Fichier neuf : `src/lib/learnos/learning-twin.ts`
Algorithme **déterministe** (aucun LLM) :
1. Charger toutes les preuves `(eleveId, competenceId)`, triées par date.
2. **Décroissance temporelle** : `poidsEffectif = weight * exp(-ageJours / 90)` — une preuve de l'an dernier ne vaut pas celle d'hier (§11 v2 : « Time », « Retention »).
3. `masteryScore = Σ(signal × poidsEffectif) / Σ(poidsEffectif)`.
4. `confidenceScore = min(0.95, 1 - exp(-Σ poidsEffectif / 3))` — croît avec le volume, plafonne à 0,95. **Jamais 1** : LEARNOS ne conclut jamais avec certitude absolue.
5. `masteryStatus` — **fail-safe : la confiance prime sur la maîtrise** :
   ```
   confidence < 0,3                    → UNKNOWN   (quelle que soit la maîtrise)
   mastery ≥ 0,85 && confidence ≥ 0,7  → MASTERED
   mastery ≥ 0,70                      → PROFICIENT
   mastery ≥ 0,50                      → DEVELOPING
   mastery ≥ 0,30                      → EMERGING
   sinon                               → NEEDS_REVIEW
   ```
6. `trend` : comparer la moyenne des 3 dernières preuves à celle des 3 précédentes (écart > 0,1).

**Déclenchement** : abonner le recalcul à `evidence.created` via le bus. **Idempotent** (§38) — recalculer deux fois donne le même résultat.

### Tests — `src/lib/learnos/learning-twin.test.ts`
- Une seule preuve parfaite → `confidenceScore < 0.3` et statut `UNKNOWN` (jamais `MASTERED`).
- Succès, succès, échec → la confiance **baisse** (preuves contradictoires, §24 v2).
- Preuves anciennes → poids moindre que des récentes de même type.
- Recalcul répété → résultat identique (idempotence).

---

# PHASE 5 — Diagnostic des erreurs

> Spec v2 §21-22. Premier lot où le LLM est réellement justifié : classer une réponse ouverte.

- `src/lib/learnos/diagnostic.ts` — classifie une réponse en `ErrorType` avec confiance.
- **Règles d'abord** : réponse vide → `GUESS` ; réponse numérique proche du résultat attendu → `CALCULATION_ERROR`. Le LLM n'est appelé **que** si les règles ne concluent pas.
- **Fausse maîtrise** (§22 v2) : bonne réponse finale + raisonnement erroné → `masterySignal` fortement réduit et `confidence` abaissée. Inversement, mauvaise réponse + raisonnement presque juste → statut `EMERGING` plutôt que `NEEDS_REVIEW`.
- Chaque classification écrit une ligne dans `AiDecisionLog` (§40).
- `promptVersion: "diagnostic-v1"` — versionner tout changement de prompt.

---

# PHASE 6 — Intervention Engine

> Spec v2 §26 : **« L'IA recommande. L'enseignant décide. »** (§39, §49-15)

```prisma
enum InterventionStatus {
  PROPOSED    // l'IA a proposé — RIEN n'est actif
  APPROVED    // un enseignant a validé
  ACTIVE
  UNDER_REVIEW
  COMPLETED
  REJECTED
}

model StudentIntervention {
  id       String  @id @default(cuid())
  tenantId String
  tenant   Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  siteId   String?
  site     Site?   @relation(fields: [siteId], references: [id], onDelete: SetNull)

  eleveId String
  eleve   Eleve  @relation(fields: [eleveId], references: [id], onDelete: Cascade)

  competenceId String
  competence   Competence @relation(fields: [competenceId], references: [id], onDelete: Cascade)

  reason            String   // explicabilité obligatoire (§33 v1)
  evidenceRefs      String[] // ids des preuves qui fondent la recommandation
  interventionType  String   // "remediation" | "retest" | "prerequisite_review"
  recommendedAction String

  responsibleUserId String?
  responsible       User?   @relation(fields: [responsibleUserId], references: [id], onDelete: SetNull)

  status InterventionStatus @default(PROPOSED)

  startDate  DateTime?
  reviewDate DateTime?
  outcome    String?
  /// Mesure d'efficacité (§25 v1) : maîtrise avant / après.
  masteryBefore Float?
  masteryAfter  Float?

  createdByAi Boolean @default(true)
  approvedBy  String?
  approvedAt  DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId])
  @@index([siteId])
  @@index([eleveId, status])
  @@map("student_interventions")
}
```

**Garde-fou à implémenter et tester explicitement** : une intervention créée par l'IA naît en `PROPOSED`. Aucun code ne doit pouvoir la faire passer à `ACTIVE` sans un `approvedBy` non nul. Écrire le test qui échoue si cette transition devient possible.

---

# PHASE 7 — Teacher Copilot

> Spec v2 §27, §29. Structure imposée : **Insight → Reason → Action**, pas une accumulation de graphiques.

- `src/app/(dashboard)/copilot/page.tsx` + `src/components/learnos/CopilotDashboard.tsx`.
- Chaque carte répond aux 4 questions du §27 : **Qui ? Pourquoi ? Quelle preuve ? Quelle action ?**
- Trois boutons obligatoires par recommandation : **[Accepter] [Modifier] [Ignorer]**.
- Afficher **toujours** maîtrise *et* confiance (« 68 % — confiance faible »), jamais la maîtrise seule (§49-9).
- Écran « Ma classe » (§29) : maîtrise globale, répartition 🟢/🟠/🔴, détail par compétence, priorité identifiée.

---

# PHASE 8 — Question Engine + variantes anti-triche

> Spec v2 §15-19. Modèles `Question` (avec `checkpoints Json`, `rubric Json`) et `QuestionVariant`.

Conserver obligatoirement, sur **chaque** variante générée (§18 v2) :
`generationSeed`, `generationVersion`, `modelVersion`, `templateVersion`, `competenceVersion`.
> Le seed rend la génération **reproductible** : sans lui, impossible de rejouer le devoir d'un élève lors d'une contestation.

Ne jamais afficher de promesse d'élimination de la triche (§19 v2) — la formulation UI doit rester « réduit fortement le copiage ».

---

# PHASE 9 — School Intelligence

> Spec v2 §31-32. Agrégations par classe/matière/compétence + Root Cause Analysis via le graphe de prérequis.

**Contrainte de présentation (§32) :** toujours restituer sous forme `Hypothèse / Preuves / Confiance`, jamais un diagnostic affirmatif. Le libellé « La classe a un problème sur C5 » est interdit ; « Les données suggèrent une difficulté concentrée sur C5 (12 preuves, confiance moyenne) » est correct.

---

# PHASE 10 — Vue élève + mobile

> Spec v2 §30 : *« Ne pas exposer inutilement des probabilités complexes. »*

Quatre blocs seulement : **Ce que je maîtrise / À améliorer / Mon prochain objectif / Mon prochain exercice**. Ni pourcentage de confiance, ni score brut côté élève. Étendre `mobile-app/` (§48 : Android courant, faible bande passante, offline-first).

---

# Critères d'acceptation finaux

Les 15 critères de la spec v2 §45, à vérifier un par un avant de déclarer LEARNOS intégré :

1. L'enseignant conserve son workflow habituel (aucune double saisie).
2. Aucune écoute de classe. 3. Aucun micro. 4. Aucune caméra.
5. Les élèves peuvent travailler sur papier.
6. **Les notes officielles restent inchangées** — `masteryScore` n'écrit jamais dans `Note.valeur`.
7. Les compétences sont liées aux productions réelles.
8. Les erreurs sont localisables (checkpoints).
9. Les devoirs peuvent être individualisés.
10. Le Learning Twin évolue avec les preuves.
11. Les recommandations sont explicables (`reason` + `evidenceRefs` non vides).
12. L'enseignant garde le contrôle (aucune intervention `ACTIVE` sans `approvedBy`).
13. **Le multi-tenant est strictement respecté** — `pnpm run lint` retourne 0 erreur.
14. Chaque insight remonte à ses preuves.
15. Les traitements IA coûteux sont contrôlés (cache actif, routeur gratuit d'abord).

## Rituel de fin de lot (obligatoire, spec v1 §38)

```bash
pnpm run lint && pnpm exec tsc --noEmit && pnpm run test
```

Si une commande échoue : **corriger avant de passer au lot suivant**. Ne jamais contourner par un `eslint-disable` non justifié — c'est précisément la dette que la Phase 0 rembourse.
