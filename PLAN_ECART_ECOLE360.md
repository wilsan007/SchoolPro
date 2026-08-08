# Plan d'implémentation — Résorption des écarts EcolPro / École360

> **Périmètre exclu** : l'architecture multi-tenant SaaS est **conservée**. Aucun slot ne remet en
> cause `Tenant`, `UserTenant`, `Site` ni le modèle mutualisé. Les mesures d'École360 qui découlent
> de son modèle mono-établissement (isolation par infrastructure, un déploiement par école) sont
> traduites en équivalents applicables à un SaaS mutualisé.

**Convention de slot** : un slot est une unité de travail livrable en une session, avec un critère de
sortie vérifiable par la machine. Un slot n'est jamais « à moitié fait » : soit son critère de sortie
passe, soit le slot n'est pas livré.

**Légende de gravité** : 🔴 critique · 🟠 élevée · 🟡 moyenne · ⚪ faible

---

## Table des phases

| Phase | Titre | Slots | Effort | Gravité max |
|---|---|---|---|---|
| **0** | Colmatage immédiat | 0.1 → 0.6 | 1 jour | 🔴 |
| **1** | Audit et traçabilité | 1.1 → 1.3 | 3 jours | 🔴 |
| **2** | Modules activables et offres | 2.1 → 2.4 | 5 jours | 🟠 |
| **3** | L'année scolaire comme frontière | 3.1 → 3.5 | 8 jours | 🟠 |
| **4** | Cadrage pédagogique | 4.1 → 4.5 | 8 jours | 🟠 |
| **5** | Chaîne financière complète | 5.1 → 5.6 | 10 jours | 🟠 |
| **6** | Espaces élève et parent | 6.1 → 6.5 | 10 jours | 🟠 |
| **7** | Gardes relationnelles de messagerie | 7.1 → 7.3 | 5 jours | 🟡 |
| **8** | Classeur imprimable | 8.1 → 8.4 | 7 jours | 🟡 |
| **9** | Import unifié et mise en route | 9.1 → 9.4 | 8 jours | 🟡 |
| **10** | Sécurité renforcée | 10.1 → 10.6 | 10 jours | 🟡 |
| **11** | Gouvernance exécutable | 11.1 → 11.5 | 8 jours | 🔴 |

**Ordre impératif** : Phase 0 avant tout le reste. Phase 1 avant Phase 11. Phase 3 avant Phase 5
(les tarifs sont annuels). Phase 2 avant Phase 6 (le portail familles est un module).

---

# PHASE 0 — Colmatage immédiat

> Six slots, une journée. Ils traitent l'essentiel du risque à coût quasi nul.
> **Aucun autre travail ne doit démarrer avant que la phase 0 soit intégralement livrée.**

---

## Slot 0.1 — Rendre la CI bloquante 🔴

**Constat.** `@/Users/awalehosman/Documents/logiciel EcolPro/.github/workflows/ci.yml` porte
`continue-on-error: true` sur les étapes *Lint* et *Type-check*. Notre règle ESLint
`require-tenant-id` — le garde-fou multi-tenant le plus important du projet — **ne bloque aucun
déploiement**. Elle peut échouer à chaque livraison sans empêcher le `deploy` vers Cloudflare Workers.

**Objectif.** Une gouvernance qui échoue bloque la mise en ligne.

**Fichiers touchés.**
- `.github/workflows/ci.yml`
- `eslint.config.mjs` (à créer — **absent du projet**)
- `package.json` (script `verify`)

**Étapes.**

1. Supprimer les deux `continue-on-error: true` du job `test`.
2. Créer `eslint.config.mjs` (flat config ESLint 9) qui **charge réellement**
   `eslint-rules/require-tenant-id.js`. Vérification préalable indispensable : la règle n'est
   actuellement référencée par aucun fichier de configuration — elle ne s'exécute donc pas du tout.
3. Déclarer la règle en `error` (pas `warn`) sur `src/lib/**` et `src/app/api/**`.
4. Ajouter un script agrégateur :
   ```json
   "verify": "npm run lint && tsc --noEmit && vitest run"
   ```
5. Remplacer les trois étapes CI par `npm run verify`.

**Piège identifié.** Passer la règle en `error` va probablement faire échouer la CI sur du code
existant. Procédure : lancer `npx eslint src --rule ...` en local **avant** de rendre bloquant,
inventorier les violations, les corriger dans le même slot. Si le volume dépasse une session,
utiliser un fichier de dérogations explicites (`// eslint-disable-next-line require-tenant-id --
raison: <justification>`) et créer un slot 0.1b pour les résorber — mais **jamais** repasser en
`continue-on-error`.

**Critère de sortie.**
- `npm run verify` passe en local
- Une PR volontairement fautive (une requête Prisma sans `tenantId` dans `src/lib/`) fait **échouer**
  la CI et bloque le déploiement

**Effort.** 2 h (hors résorption des violations existantes).
**Dépendances.** Aucune.

---

## Slot 0.2 — Fermer les deux fuites tenant résiduelles 🔴

**Constat précis** (vérifié dans le code, plus étroit que l'estimation initiale) :

**Fuite A — `dispatch.ts` ligne 120** :
```@/Users/awalehosman/Documents/logiciel EcolPro/src/lib/notifications/dispatch.ts:120
  const notif = await prisma.notification.findUnique({ where: { id: notificationId } });
```
La fonction `dispatchNotification(notificationId)` ne borne pas la recherche au tenant appelant. Un
appelant du tenant A qui devine ou obtient un `notificationId` du tenant B **déclenche l'envoi réel**
de la notification de B à ses destinataires. Ce n'est pas une lecture de données croisée (les
destinataires sont résolus depuis `notif.tenantId`), c'est une **action inter-tenant** : envoi de SMS,
e-mails et push facturés au tenant B, avec compteurs mis à jour.

**Fuite B — `suggest.ts` ligne 75** :
```@/Users/awalehosman/Documents/logiciel EcolPro/src/lib/emploi-du-temps/suggest.ts:75
    prisma.matiere.findUnique({ where: { id: matiereId }, select: { nom: true } }),
```
Les cinq autres requêtes du même `Promise.all` bornent correctement par `tenantId`. Celle-ci non :
un `matiereId` d'un autre établissement retourne son libellé.

**Objectif.** Toute requête accepte un identifiant *externe* uniquement si elle vérifie son
appartenance au tenant appelant.

**Étapes.**

1. `dispatch.ts` — changer la signature en
   `dispatchNotification(notificationId: string, tenantId: string)` et remplacer par :
   ```ts
   const notif = await prisma.notification.findFirst({
     where: { id: notificationId, tenantId },
   });
   if (!notif) throw new Error("Notification introuvable");
   ```
   Puis corriger **tous les appelants** (recherche `dispatchNotification(`) pour propager le
   `tenantId` de la session. Ne jamais retomber sur `notif.tenantId` : ce serait circulaire.
2. `suggest.ts` — remplacer par
   `prisma.matiere.findFirst({ where: { id: matiereId, tenantId }, select: { nom: true } })`.
   `tenantId` est déjà disponible dans le scope (`opts.tenantId`, ligne 64).
3. **Audit systématique** : lister toutes les `findUnique` du projet qui prennent un identifiant
   d'entrée utilisateur sans contrainte tenant :
   ```
   grep -rn "findUnique({ where: { id" src/
   ```
   Chaque occurrence est soit corrigée en `findFirst` + `tenantId`, soit justifiée par un commentaire
   (cas légitime : `tenant.findUnique`, `user.findUnique({ email })` à la connexion).

**Tests de régression** (fichier `tests/security/tenant-isolation.spec.ts` à créer) :

| Test | Attendu |
|---|---|
| `dispatchNotification(idTenantB, tenantA)` | lève « Notification introuvable » |
| `suggestSlots({ tenantId: A, matiereId: <de B> })` | le nom de matière n'apparaît pas |
| Boucle sur toutes les routes `/api/*` avec un id d'un autre tenant | 403 ou 404, **jamais 200** |

**Critère de sortie.** Les trois tests passent. Aucune `findUnique` non justifiée sur identifiant
externe ne subsiste.

**Effort.** 4 h.
**Dépendances.** Slot 0.1 (pour que les tests bloquent réellement).

---

## Slot 0.3 — Supprimer la cascade destructrice sur les notes 🔴

**Constat.** Perte de données silencieuse :
```@/Users/awalehosman/Documents/logiciel EcolPro/prisma/schema.prisma
  evaluationId String?
  evaluation   Evaluation? @relation(fields: [evaluationId], references: [id], onDelete: Cascade)
```
Supprimer une `Evaluation` **détruit toutes les notes** qui s'y rattachent. École360 énonce la règle
inverse : *« une évaluation déjà notée devient insupprimable »*.

**Objectif.** Une évaluation notée ne peut être supprimée ; les notes ne disparaissent jamais par
effet de bord.

**Étapes.**

1. Schéma : `onDelete: Cascade` → `onDelete: Restrict` sur `Note.evaluation`.
2. Migration SQL :
   ```sql
   ALTER TABLE notes DROP CONSTRAINT notes_evaluationId_fkey;
   ALTER TABLE notes ADD CONSTRAINT notes_evaluationId_fkey
     FOREIGN KEY ("evaluationId") REFERENCES evaluations(id) ON DELETE RESTRICT;
   ```
3. Côté serveur, avant toute suppression d'évaluation : compter les notes liées, refuser avec un
   message explicite (« 23 notes sont rattachées à cette évaluation — dépubliez et supprimez les
   notes d'abord »).
4. Côté interface : désactiver le bouton de suppression et afficher le nombre de notes liées.

**Vérification préalable obligatoire.** La contrainte `RESTRICT` échouera si des données incohérentes
existent. Exécuter avant migration :
```sql
SELECT e.id, COUNT(n.id) FROM evaluations e
LEFT JOIN notes n ON n."evaluationId" = e.id GROUP BY e.id HAVING COUNT(n.id) > 0;
```

**Critère de sortie.** Un test unitaire prouve que la suppression d'une évaluation notée est refusée
et que les notes survivent.

**Effort.** 3 h.
**Dépendances.** Aucune.

---

## Slot 0.4 — Rattacher `Conversation` au tenant 🟠

**Constat.** Seul modèle du schéma portant un `tenantId` **sans relation Prisma** :
```@/Users/awalehosman/Documents/logiciel EcolPro/prisma/schema.prisma
model Conversation {
  id       String  @id @default(cuid())
  tenantId String
```
Conséquences : aucune contrainte de clé étrangère, aucune cascade à la suppression d'un tenant, et la
règle ESLint `require-tenant-id` ne peut pas raisonner sur ce modèle. Des conversations orphelines
survivent à la suppression d'un établissement.

**Étapes.**

1. Ajouter la relation :
   ```prisma
   tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
   ```
2. Ajouter la relation inverse `conversations Conversation[]` sur `Tenant`.
3. Migration : nettoyer les orphelins **avant** de poser la contrainte :
   ```sql
   DELETE FROM conversations WHERE "tenantId" NOT IN (SELECT id FROM tenants);
   ALTER TABLE conversations ADD CONSTRAINT conversations_tenantId_fkey
     FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE CASCADE;
   ```
4. Vérifier que `Message` et `ConversationParticipant` cascadent bien depuis `Conversation`
   (déjà le cas — à confirmer par test).
5. Étendre la RLS Supabase à `conversations` (fichier `supabase/rls_setup.sql`).

**Critère de sortie.** Supprimer un tenant de test supprime ses conversations, messages et
participants. Aucun orphelin.

**Effort.** 2 h.
**Dépendances.** Aucune.

---

## Slot 0.5 — Restreindre les permissions de messagerie des élèves 🟠

**Constat.**
```@/Users/awalehosman/Documents/logiciel EcolPro/src/lib/rbac.ts
  STUDENT: [
    "bulletins:read", "absences:read", "notes:read", "messages:*",
```
L'étoile accorde **toutes** les actions de messagerie à un élève : créer une conversation avec
n'importe quel utilisateur du tenant, y compris le comptable ou le directeur. École360 : *« Élève :
son professeur principal seulement — il répond, n'initie jamais. »*

**Objectif.** Correctif immédiat de la permission d'action. Les gardes relationnelles complètes
relèvent de la Phase 7 ; ce slot ferme le trou le plus large sans attendre.

**Étapes.**

1. Introduire une action distincte `messages:reply` (répondre dans une conversation existante où l'on
   est déjà participant) séparée de `messages:write` (créer une conversation).
2. `STUDENT` : `"messages:read", "messages:reply"` — **retirer** `messages:*`.
3. `PARENT` : conserver `messages:write` (un parent peut légitimement initier vers un professeur),
   mais la cible sera bornée en Phase 7.
4. Faire respecter côté serveur : la route de création de conversation exige `messages:write`.

**Critère de sortie.** Test : un élève tentant de créer une conversation reçoit 403. Un élève
répondant dans une conversation dont il est participant reçoit 200.

**Effort.** 3 h.
**Dépendances.** Aucune.

---

## Slot 0.6 — Une seule année active, une seule source de vérité 🟠

**Constat — deux problèmes liés.**

*Problème 1* : `isCurrent` est un booléen nu, sans contrainte d'unicité.
```@/Users/awalehosman/Documents/logiciel EcolPro/prisma/schema.prisma
  isCurrent Boolean  @default(false)
```
Rien n'empêche deux lignes `isCurrent = true` pour le même `tenantId`. Le même défaut existe sur
`Periode.isCurrent`.

*Problème 2* : double source de vérité contradictoire.
```@/Users/awalehosman/Documents/logiciel EcolPro/prisma/schema.prisma
  currentYear String @default("2025-2026")
```
`Tenant.currentYear` (chaîne libre) coexiste avec `AnneesScolaires.isCurrent`. Elles peuvent
divergent sans alerte. Aggravant : `suggest.ts` ligne 66-67 lit `tenant.currentYear` avec un
**repli codé en dur** `?? "2025-2026"` — donc en cas de valeur absente, le moteur d'emploi du temps
travaille sur une année arbitraire.

**Objectif.** Une seule année courante garantie par la base ; une seule source de vérité.

**Étapes.**

1. Migration — index uniques partiels :
   ```sql
   -- Nettoyage préalable : ne garder que la plus récente si plusieurs actives
   WITH ranked AS (
     SELECT id, ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "dateDebut" DESC) rn
     FROM annees_scolaires WHERE "isCurrent"
   )
   UPDATE annees_scolaires SET "isCurrent" = false
   WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

   CREATE UNIQUE INDEX annees_une_seule_courante
     ON annees_scolaires ("tenantId") WHERE "isCurrent";

   CREATE UNIQUE INDEX periodes_une_seule_courante
     ON periodes ("anneeId") WHERE "isCurrent";
   ```
2. Créer `src/lib/annee-scolaire.ts` exposant `getAnneeCourante(tenantId)` — **unique** accès à
   l'année courante dans tout le code.
3. Remplacer toute lecture de `Tenant.currentYear` par cet accesseur. Commencer par `suggest.ts:66`
   et supprimer le repli `?? "2025-2026"` : en l'absence d'année active, **échouer explicitement**
   plutôt que deviner.
4. Marquer `Tenant.currentYear` comme déprécié en commentaire (suppression en slot 3.1, une fois
   tous les appelants migrés).

**Critère de sortie.**
- Tenter d'activer deux années échoue au niveau base
- `grep -rn "currentYear" src/` ne retourne que `annee-scolaire.ts`
- Aucun repli sur une année codée en dur dans le code

**Effort.** 4 h.
**Dépendances.** Aucune. Prépare la Phase 3.

---

### Bilan phase 0

| Slot | Objet | Effort |
|---|---|---|
| 0.1 | CI bloquante + ESLint réellement branché | 2 h |
| 0.2 | Deux fuites tenant + audit des `findUnique` | 4 h |
| 0.3 | Cascade destructrice sur notes | 3 h |
| 0.4 | `Conversation` rattachée au tenant | 2 h |
| 0.5 | Permissions messagerie élève | 3 h |
| 0.6 | Année unique + source unique | 4 h |

**Total : 18 h.** Livrable : une base saine et une CI qui refuse les régressions.

---

# PHASE 1 — Audit et traçabilité

> **Le manque le plus grave du projet après la CI non bloquante.** Aucun modèle d'audit n'existe
> (vérifié : ni `AuditLog`, ni `auditLog`, nulle part dans `prisma/` ou `src/`). En multi-tenant,
> une tentative de franchissement de frontière ne laisse **aucune trace** : nous ne pourrions ni
> détecter une attaque en cours, ni prouver après coup l'absence de fuite.
>
> École360 : *« Chaque refus est audité — et le journal est consultable depuis l'interface. »*

---

## Slot 1.1 — Modèle d'audit et helper d'écriture 🔴

**Objectif.** Un journal append-only qui enregistre les actions sensibles **et les refus**.

**Conception.**

```prisma
enum AuditVerdict {
  ALLOWED   // action autorisée et exécutée
  DENIED    // refus d'autorisation
  FAILED    // erreur technique après autorisation
}

model AuditLog {
  id String @id @default(cuid())

  // Contexte tenant — nullable car un refus peut survenir AVANT résolution du tenant
  tenantId String?
  userId   String?

  // Qui, quoi, sur quoi
  actorEmail  String?        // dénormalisé : survit à la suppression de l'utilisateur
  actorRole   Role?
  action      String         // "eleves:delete", "switch-tenant", "login"
  resource    String?        // "Eleve"
  resourceId  String?

  verdict AuditVerdict
  reason  String?            // motif du refus, ou motif métier (réouverture de période)

  // Traces techniques
  ip        String?
  userAgent String?
  method    String?          // POST / PATCH / DELETE
  path      String?

  // Charge utile bornée — jamais de données personnelles brutes
  metadata Json?

  createdAt DateTime @default(now())

  @@index([tenantId, createdAt])
  @@index([userId, createdAt])
  @@index([verdict, createdAt])
  @@index([action, createdAt])
  @@map("audit_logs")
}
```

**Décisions de conception à respecter.**

| Décision | Raison |
|---|---|
| `tenantId` **nullable** | Un refus peut survenir avant résolution du tenant — c'est justement le cas le plus intéressant à tracer |
| Pas de relation `onDelete: Cascade` vers `Tenant` | Le journal doit **survivre** à la suppression du tenant (École360 : *« un journal qui survit à la purge »*). Utiliser `onDelete: SetNull` ou aucune relation, avec `actorEmail` dénormalisé |
| `metadata Json` **borné** | Jamais de mot de passe, jamais de contenu de message, jamais de note. Seulement des identifiants et des compteurs |
| Écriture **non bloquante** | Un échec d'écriture d'audit ne doit jamais faire échouer l'action métier — mais doit émettre un log serveur d'alerte |

**Fichier à créer** : `src/lib/audit.ts`

```ts
export async function audit(entry: {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  verdict: AuditVerdict;
  resource?: string;
  resourceId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  req?: Request;          // extrait ip / userAgent / method / path
}): Promise<void>
```

**Étapes.**
1. Modèle + migration.
2. `src/lib/audit.ts` avec extraction automatique du contexte HTTP.
3. Politique de rétention : les journaux au-delà de 24 mois sont agrégés (slot 10.5).
4. Test : l'écriture d'audit ne lève jamais, même avec une base injoignable.

**Critère de sortie.** `audit()` est appelable depuis une route et depuis une server action, et son
échec ne casse rien.

**Effort.** 1 jour.
**Dépendances.** Phase 0 livrée.

---

## Slot 1.2 — Journaliser tous les refus d'autorisation 🔴

**Objectif.** Chaque `403` et chaque `401` laisse une trace exploitable.

**Point d'insertion unique.** `@/Users/awalehosman/Documents/logiciel EcolPro/src/lib/rbac.ts`
concentre déjà l'autorisation :
```
const gate = await authorize({ permission: "eleves:write" });
if (!gate.ok) return gate.response;
```
C'est le **seul** endroit à instrumenter pour couvrir toutes les routes qui l'utilisent.

**Étapes.**

1. Dans `authorize()`, avant de retourner un refus, appeler `audit({ verdict: "DENIED", ... })` avec
   la permission demandée et le rôle effectif.
2. **Audit de couverture préalable** : vérifier que toutes les routes passent par `authorize()`.
   ```
   grep -rLn "authorize(" src/app/api --include=route.ts
   ```
   Chaque route absente de la liste est soit corrigée, soit justifiée (webhooks, cron — qui ont leur
   propre authentification).
3. Instrumenter aussi les points de contrôle **hors RBAC** :
   - `src/lib/tenant-claims.ts` — quand `deriveClaims` retourne `null` (compte désactivé)
   - `src/app/api/switch-tenant/route.ts` — le `403 Accès refusé à ce tenant` ligne ~44 est
     précisément l'événement le plus critique à tracer
   - `src/app/api/switch-site/route.ts` — idem
   - `src/lib/auth.ts` — échec de `bcrypt.compare` (tentative de mot de passe)
4. Journaliser les actions **réussies** sur les opérations destructrices : suppression d'élève, de
   classe, de note publiée, purge, changement de rôle.

**Alerte.** Un seuil sur les `DENIED` par utilisateur et par heure déclenche une alerte (préparé ici,
exploité en slot 10.6).

**Critère de sortie.**
- Un test provoque un `switch-tenant` vers un tenant non autorisé et vérifie la présence d'une ligne
  `AuditLog` avec `verdict = DENIED`
- Aucune route API sans `authorize()` non justifiée

**Effort.** 1 jour.
**Dépendances.** Slot 1.1.

---

## Slot 1.3 — Écran de consultation du journal 🟠

**Objectif.** École360 : *« le journal est consultable depuis l'interface »*. Un audit qu'on ne peut
pas lire ne sert qu'après l'incident.

**Étapes.**

1. Route `GET /api/audit` — permission `audit:read`, réservée à `SUPER_ADMIN` et `TENANT_ADMIN`.
   - Un `TENANT_ADMIN` ne voit que **son** tenant. Un `SUPER_ADMIN` voit tout, avec filtre par tenant.
   - Filtres : période, verdict, action, utilisateur, ressource.
   - Pagination par curseur (le volume peut être élevé).
2. Écran `/parametres` → nouvel onglet **Journal** (ou page dédiée `/audit`).
3. Vue en tableau : horodatage, acteur, action, verdict (badge coloré), ressource, motif.
4. **Encart de synthèse** en tête : nombre de refus sur 24 h, top 5 des actions refusées, comptes
   ayant déclenché le plus de refus. C'est cet encart qui rend le journal utile au quotidien.
5. Export CSV de la sélection.

**Critère de sortie.** Un `TENANT_ADMIN` du tenant A consulte le journal et **ne voit aucune ligne**
du tenant B — vérifié par test automatisé, pas à l'œil.

**Effort.** 1 jour.
**Dépendances.** Slots 1.1, 1.2.

---

### Bilan phase 1

| Slot | Objet | Effort |
|---|---|---|
| 1.1 | Modèle `AuditLog` + helper | 1 j |
| 1.2 | Journalisation des refus (RBAC + switch + login) | 1 j |
| 1.3 | Écran de consultation + synthèse | 1 j |

**Total : 3 jours.**

---

# PHASE 2 — Modules activables et offres

> **Constat.** `PlanType` (`STARTER` / `PRO` / `BUSINESS` / `ENTERPRISE`) est un **palier tarifaire
> par volume d'élèves**, pas un périmètre fonctionnel. Aucun code ne lit `Tenant.plan` pour masquer
> ou refuser une fonctionnalité — c'est une étiquette de facturation.
>
> École360 a 10 modules et 5 offres, avec trois règles : désactiver **masque** sans détruire ;
> verrouillage **double** (UI + serveur), *« jamais l'un sans l'autre »* ; source unique lue par la
> machine (`src/features.ts`).

---

## Slot 2.1 — Source unique de vérité des modules 🟠

**Objectif.** Un seul fichier déclare les modules, les offres, et la correspondance
module → routes → entrées de menu. Aucune autre place ne peut inventer un module.

**Fichier à créer** : `src/lib/features.ts`

```ts
export const MODULES = {
  SOCLE:            { label: "Socle",                    core: true  },
  FINANCE:          { label: "Gestion financière",       core: false },
  NOTES:            { label: "Notes & carnets",          core: false },
  DEVOIRS:          { label: "Devoirs",                  core: false },
  EXAMENS_LIGNE:    { label: "Examens en ligne",         core: false },
  PORTAIL_FAMILLES: { label: "Portail élèves & parents", core: false },
  MESSAGERIE:       { label: "Messagerie interne",       core: false },
  STATISTIQUES:     { label: "Statistiques",             core: false },
  TRANSFERTS:       { label: "Transferts inter-sites",   core: false },
  EMPLOI_TEMPS:     { label: "Emploi du temps & salles", core: false },
  // Modules propres à EcolPro, absents d'École360 :
  RH:               { label: "Ressources humaines",      core: false },
  ADMISSIONS:       { label: "Admissions",               core: false },
  INVENTAIRE:       { label: "Inventaire",               core: false },
  ALUMNI:           { label: "Alumni",                   core: false },
  VIE_SCOLAIRE:     { label: "Vie scolaire",             core: false },
  COURS_LIGNE:      { label: "Cours en ligne",           core: false },
  ORIENTATION:      { label: "Orientation",              core: false },
} as const;

export type ModuleKey = keyof typeof MODULES;

/** Correspondance permission → module. Toute permission appartient à exactement un module. */
export const PERMISSION_MODULE: Record<string, ModuleKey> = { /* ... */ };

/** Les offres commerciales, composées de modules. */
export const OFFRES = {
  ESSENTIEL_FINANCE: { modules: ["SOCLE","FINANCE","ADMISSIONS"], facturation: "SITE"  },
  PEDAGOGIE:         { modules: ["SOCLE","NOTES","DEVOIRS","EXAMENS_LIGNE"], facturation: "ELEVE" },
  ECOLE_CONNECTEE:   { modules: ["SOCLE","PORTAIL_FAMILLES","MESSAGERIE"],   facturation: "ELEVE" },
  PREMIUM:           { modules: "ALL",                                        facturation: "ELEVE" },
  A_LA_CARTE:        { modules: "CUSTOM",                                     facturation: "DEVIS" },
} as const;
```

**Modèle de données.**
```prisma
model TenantModule {
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  module   String // ModuleKey

  isEnabled  Boolean  @default(true)
  enabledAt  DateTime @default(now())
  disabledAt DateTime?
  // Traçabilité : qui a activé/désactivé (audit croisé avec AuditLog)
  changedById String?

  @@id([tenantId, module])
  @@index([tenantId, isEnabled])
  @@map("tenant_modules")
}
```

**Étapes.**
1. `features.ts` + modèle + migration.
2. Migration de données : pour chaque tenant existant, activer **tous** les modules (aucune
   régression fonctionnelle à la livraison).
3. Ajouter `offre` sur `Tenant` (nouvel enum `OffreType`), **sans supprimer** `PlanType` : `plan`
   reste le palier de volume (donc le prix), `offre` devient le périmètre. Les deux sont
   orthogonaux et légitimes.
4. Cache en mémoire des modules par tenant (invalidé à la modification) — ce contrôle sera sur le
   chemin de **chaque** requête.

**Critère de sortie.** `MODULES` et `OFFRES` sont lus par un test qui vérifie que **toute** permission
de `ROLE_PERMISSIONS` est rattachée à un module dans `PERMISSION_MODULE`. Une permission orpheline
fait échouer le test — c'est la politique « module-ready » (P4 d'École360).

**Effort.** 1,5 j.
**Dépendances.** Phase 0.

---

## Slot 2.2 — Verrouillage serveur 🟠

**Objectif.** *« Verrouillage double, toujours : masquage côté interface ET refus côté serveur.
Jamais l'un sans l'autre. »* Ce slot fait la moitié serveur — **d'abord**, car c'est la seule qui
protège réellement.

**Étapes.**

1. Étendre `authorize()` dans `rbac.ts` : après la vérification du rôle, résoudre le module de la
   permission demandée via `PERMISSION_MODULE`, puis vérifier son activation pour le tenant.
2. Retourner **`404 Not Found`** et non `403` pour un module désactivé. Raison : un `403` révèle
   l'existence de la fonctionnalité ; le module désactivé doit être indiscernable de l'inexistant.
3. Journaliser (`audit`, verdict `DENIED`, reason `"module_disabled:FINANCE"`).
4. Le module `SOCLE` est `core: true` — toute tentative de le désactiver est refusée au niveau de la
   couche métier **et** par une contrainte base :
   ```sql
   ALTER TABLE tenant_modules ADD CONSTRAINT socle_toujours_actif
     CHECK (module <> 'SOCLE' OR "isEnabled");
   ```

**Critère de sortie.** Test : tenant avec `FINANCE` désactivé → `GET /api/factures` retourne `404`,
et une ligne d'audit existe. Réactiver le module → `200` avec **les mêmes données qu'avant**
(vérifie la règle « masque, ne détruit pas »).

**Effort.** 1 j.
**Dépendances.** Slots 2.1, 1.1.

---

## Slot 2.3 — Masquage interface 🟡

**Objectif.** La moitié UI du verrouillage double.

**Étapes.**

1. Passer les modules actifs dans la session (`token.modules`) — attention au poids du JWT :
   stocker un tableau de clés courtes, pas les objets.
   *Alternative si le JWT devient trop lourd* : résolution serveur dans le layout dashboard et
   transmission par props (cohérent avec ce qui est déjà fait pour `availableTenants`).
2. `Sidebar.tsx` : ajouter `module?: ModuleKey` sur le type `NavItem`, filtrer sur `roles` **et**
   sur `module`. Les 20 entrées actuelles sont annotées.
3. Un groupe entièrement masqué disparaît (pas de titre de section orphelin).
4. `guard-page.ts` : les pages serveur vérifient aussi le module et redirigent vers `/dashboard`.
5. Invalidation : au changement de modules, forcer le rafraîchissement du JWT via
   `unstable_update()` — même mécanisme que `switch-tenant`.

**Critère de sortie.** Test Playwright : tenant sans `RH` → l'entrée « RH » est absente de la
sidebar **et** `/rh` en accès direct redirige.

**Effort.** 1 j.
**Dépendances.** Slots 2.1, 2.2.

---

## Slot 2.4 — Écran d'activation et offres 🟡

**Objectif.** Un `SUPER_ADMIN` compose l'offre d'un établissement sans toucher au code.

**Étapes.**
1. Dans `/super-admin`, section **Modules & offre** par tenant.
2. Sélection d'une offre prédéfinie → cases des modules pré-cochées ; passage en « À la carte » dès
   qu'on dévie de la composition.
3. Modules `core` affichés verrouillés, non décochables.
4. Avertissement explicite avant désactivation : « Les données du module Finance seront masquées mais
   **conservées**. Réactiver restaurera l'accès. »
5. Chaque changement écrit une ligne d'audit avec l'auteur.
6. Écran client (lecture seule) dans `/parametres` → onglet **Abonnement** : offre en cours, modules
   actifs, modules disponibles à l'achat.

**Critère de sortie.** Composer une offre depuis l'interface, vérifier le masquage effectif côté
client sans redéploiement.

**Effort.** 1,5 j.
**Dépendances.** Slots 2.1 → 2.3.

---

### Bilan phase 2

| Slot | Objet | Effort |
|---|---|---|
| 2.1 | `features.ts` + `TenantModule` + test module-ready | 1,5 j |
| 2.2 | Refus serveur (404) + audit | 1 j |
| 2.3 | Masquage sidebar + garde de page | 1 j |
| 2.4 | Écran d'activation + offres | 1,5 j |

**Total : 5 jours.** Débloque la vente par étapes et la facturation au site.

---

# PHASE 3 — L'année scolaire comme frontière de données

> **Constat.** Notre situation est plus en retard que celle qu'École360 décrit. Ils ont *refermé* une
> porte (empêcher le mélange d'années) ; nous n'avons **pas encore posé le mur** : `Eleve`, `Classe`,
> `Facture`, `Absence` ne portent **aucun rattachement à l'année**. Seules `Note`, `Bulletin` et
> `Evaluation` le font, indirectement via `periodeId`.
>
> Leur cible : 4 états (`DRAFT` / `ACTIVE` / `CLOSED` / `ARCHIVED`) et quatre interdits appliqués
> **par la base**.

---

## Slot 3.1 — Cycle de vie de l'année 🟠

**Objectif.** Remplacer le booléen par un état, et supprimer la source de vérité concurrente.

**Étapes.**

1. Nouvel enum :
   ```prisma
   enum StatutAnnee {
     DRAFT     // en préparation — écritures de structure permises, pas de scolarité
     ACTIVE    // une seule par tenant
     CLOSED    // lecture seule — aucune écriture métier
     ARCHIVED  // gel total — même la lecture est restreinte à l'export
   }
   ```
2. Migration progressive (ne **pas** supprimer `isCurrent` tout de suite) :
   ```sql
   ALTER TABLE annees_scolaires ADD COLUMN statut TEXT NOT NULL DEFAULT 'DRAFT';
   UPDATE annees_scolaires SET statut = 'ACTIVE'  WHERE "isCurrent";
   UPDATE annees_scolaires SET statut = 'CLOSED'  WHERE NOT "isCurrent" AND "dateFin" < NOW();
   UPDATE annees_scolaires SET statut = 'DRAFT'   WHERE NOT "isCurrent" AND "dateFin" >= NOW();

   -- L'index unique du slot 0.6 est remplacé
   DROP INDEX annees_une_seule_courante;
   CREATE UNIQUE INDEX annees_une_seule_active
     ON annees_scolaires ("tenantId") WHERE statut = 'ACTIVE';
   ```
3. Machine à états explicite dans `src/lib/annee-scolaire.ts` : les transitions autorisées sont
   `DRAFT → ACTIVE → CLOSED → ARCHIVED` **uniquement**. Toute autre transition est refusée.
   Une réouverture (`CLOSED → ACTIVE`) est possible mais exige un **motif** et écrit un audit.
4. Supprimer `Tenant.currentYear` et `AnneesScolaires.isCurrent` une fois tous les appelants migrés
   (slot 0.6 a préparé le terrain).

**Critère de sortie.** Test de la machine à états : chaque transition interdite lève. Deux `ACTIVE`
impossible. `grep -rn "isCurrent\|currentYear" src/` ne retourne plus rien pour l'année.

**Effort.** 1,5 j.
**Dépendances.** Slot 0.6.

---

## Slot 3.2 — Rendre les tables « année-ready » 🟠

**Objectif.** Politique P15 d'École360 : *« toute table sait ce que l'année signifie pour elle »*.

**Travail d'analyse préalable** — classer les 52 modèles en trois catégories :

| Catégorie | Signification | Exemples |
|---|---|---|
| **Annuelle** | La ligne appartient à une année précise | `Note`, `Bulletin`, `Evaluation`, `Absence`, `Facture`, `EmploiTemps`, `Examen` |
| **Pluriannuelle** | La ligne traverse les années | `Eleve` (la personne), `User`, `Parent`, `Matiere`, `Salle`, `Site` |
| **Structurelle annuelle** | Recréée chaque année | `Classe` (la 3ᵉA de 2025-2026 ≠ celle de 2026-2027) |

C'est le classement qui pilote la migration. **Il doit être écrit dans le code**, pas dans un
document : un fichier `src/lib/annee-scope.ts` déclare la catégorie de chaque modèle, et un test de
gouvernance vérifie que tout modèle du schéma y figure (politique année-ready).

**Décision structurante à trancher.** `Classe` est-elle annuelle ?
- *Option A* — `Classe` porte `anneeId` : la 3ᵉA est recréée chaque année. Fidèle à la réalité, mais
  impose une migration lourde (toutes les FK vers `Classe` deviennent année-dépendantes).
- *Option B* — introduire `Inscription (eleveId, classeId, anneeId)` et laisser `Classe`
  pluriannuelle. Plus léger, et c'est le modèle d'École360 (ils parlent d'« inscrire les élèves dans
  leurs sections **pour l'année** »).

**→ Retenir l'option B.** Elle isole le changement dans une table nouvelle au lieu de propager
`anneeId` partout.

**Étapes.**
1. `src/lib/annee-scope.ts` + test de couverture des 52 modèles.
2. Nouveau modèle `Inscription` :
   ```prisma
   model Inscription {
     id       String @id @default(cuid())
     tenantId String
     anneeId  String
     eleveId  String
     classeId String
     statut   String   // INSCRIT | TRANSFERE | SORTI
     dateInscription DateTime @default(now())

     @@unique([anneeId, eleveId])           // un élève, une classe par année
     @@index([tenantId, anneeId, classeId])
     @@map("inscriptions")
   }
   ```
3. Ajouter `anneeId` sur les tables annuelles, par lots (un lot = un slot si nécessaire) :
   - Lot 1 : `Facture`, `Absence`
   - Lot 2 : `EmploiTemps` (remplace le champ texte `annee` actuel), `Examen`
   - Lot 3 : `Incident`, `Sanction`
4. Migration de données : rattacher l'existant à l'année active du tenant.
5. Contraintes composites empêchant les croisements. Exemple pour `Note` :
   ```sql
   -- Une note ne peut pointer une période d'une autre année que son inscription
   ALTER TABLE notes ADD CONSTRAINT note_annee_coherente CHECK (...);
   ```
   *Note d'implémentation* : PostgreSQL ne permet pas de `CHECK` avec sous-requête. Utiliser soit un
   `TRIGGER`, soit une clé étrangère composite en dénormalisant `anneeId` sur les deux tables. La
   seconde est préférable (déclarative, vérifiée par le planificateur).

**Critère de sortie.** Les quatre interdits d'École360 sont testés et refusés **par la base** :
deux années actives · inscription vers la classe d'une autre année · note rattachée à une période
d'une autre année · facture d'une année sur une inscription d'une autre.

**Effort.** 3 j (le plus lourd de la phase).
**Dépendances.** Slot 3.1.

---

## Slot 3.3 — Refus d'écriture sur année clôturée 🟠

**Objectif.** `CLOSED` signifie lecture seule, et ce n'est pas une convention mais un refus.

**Étapes.**
1. Helper `assertAnneeEcrivable(anneeId)` dans `annee-scolaire.ts` — lève si `CLOSED` ou `ARCHIVED`.
2. L'appeler dans `authorize()` pour toute permission d'écriture portant sur une table annuelle
   (le classement du slot 3.2 rend ce branchement automatique).
3. Réouverture ponctuelle : `CLOSED → ACTIVE` réservée à `TENANT_ADMIN`, **motif obligatoire**,
   audit systématique. Même mécanisme que la réouverture de période (slot 4.1) — mutualiser le code.
4. Côté interface : bandeau permanent « Année 2024-2025 clôturée — lecture seule » et champs
   désactivés, pas seulement les boutons de sauvegarde.

**Critère de sortie.** Test : écriture sur année `CLOSED` → refus + audit. Réouverture sans motif →
refus.

**Effort.** 1 j.
**Dépendances.** Slots 3.1, 3.2, 1.1.

---

## Slot 3.4 — Assistant de rentrée 🟡

**Objectif.** École360 : 11 étapes T1→T10, chacune **reprenable**, *« une étape partielle ne bascule
jamais les statuts »*.

**Ordonnancement retenu** (du simple au complexe, comme eux) :

| # | Étape | Prérequis |
|---|---|---|
| 1 | Matières | — |
| 2 | Périodes (trimestres/semestres) | — |
| 3 | Cadres d'évaluation | 1, 2 |
| 4 | Grille tarifaire | — |
| 5 | Salles | — |
| 6 | Classes | 1 |
| 7 | Enseignants et affectations matière × classe | 1, 6 |
| 8 | Emplois du temps | 5, 6, 7 |
| 9 | Élèves — inscriptions | 6 |
| 10 | Parents et liaisons | 9 |
| 11 | Comptes de connexion | 7, 9, 10 |

**Étapes.**
1. Modèle de progression :
   ```prisma
   model AssistantRentree {
     anneeId   String @id
     etapes    Json   // { "1": { statut: "FAIT", at: "...", par: "..." }, ... }
     updatedAt DateTime @updatedAt
   }
   ```
2. Chaque étape est **idempotente** : la relancer ne duplique rien.
3. Une étape ne bascule son statut à `FAIT` que si son critère est intégralement satisfait — jamais
   partiellement.
4. La bascule `DRAFT → ACTIVE` exige que les étapes 1, 2, 6, 9 soient `FAIT`.
5. **Mutualisation obligatoire** : la bascule automatique programmée (cron de fin d'année) et la
   bascule manuelle appellent **la même fonction**. École360 : *« impossible que la bascule
   automatique et la bascule manuelle divergent. »*
6. Interface : page `/rentree` avec les 11 étapes, leur état, et reprise au point d'arrêt.

**Critère de sortie.** Créer une année en `DRAFT`, dérouler l'assistant en s'interrompant à l'étape 7,
reprendre, activer. Test qu'une activation avec étape 9 incomplète est refusée.

**Effort.** 2 j.
**Dépendances.** Slots 3.1 → 3.3. Idéalement après 4.2 (cadres) et 5.2 (tarifs), sinon les étapes
3 et 4 sont des coquilles.

---

## Slot 3.5 — Archivage et export d'année 🟡

**Objectif.** `ARCHIVED` = gel total, avec une porte de sortie : l'export.

**Étapes.**
1. Transition `CLOSED → ARCHIVED` : réservée `SUPER_ADMIN`, exige qu'un export complet ait été
   généré et téléchargé. C'est le pendant du verrou de purge d'École360 : *« pas de purge sans
   archive téléchargée »*.
2. Export : archive contenant inscriptions, notes, bulletins, factures et paiements de l'année,
   au format CSV + un PDF récapitulatif.
3. Une année `ARCHIVED` n'apparaît plus dans les sélecteurs, sauf dans un écran « Archives ».
4. L'audit de l'archivage survit à l'archivage (voir slot 1.1, décision de non-cascade).

**Critère de sortie.** Archiver sans export préalable est refusé. L'export réimporté dans une base
vierge reconstitue l'année.

**Effort.** 1,5 j.
**Dépendances.** Slots 3.1 → 3.3.

---

### Bilan phase 3

| Slot | Objet | Effort |
|---|---|---|
| 3.1 | `StatutAnnee` + machine à états | 1,5 j |
| 3.2 | `Inscription` + `anneeId` + contraintes croisées | 3 j |
| 3.3 | Refus d'écriture année clôturée | 1 j |
| 3.4 | Assistant de rentrée 11 étapes | 2 j |
| 3.5 | Archivage verrouillé par export | 1,5 j |

**Total : 9 jours.**

---

# PHASE 4 — Cadrage pédagogique

> École360 formalise **quatre questions de chaque trimestre** (leur chapitre 9). Nous n'en couvrons
> aucune complètement. C'est la phase qui touche au cœur métier.

---

## Slot 4.1 — Fenêtre de saisie appliquée par le serveur 🟠

**Constat.** La structure existe, l'application manque :
```@/Users/awalehosman/Documents/logiciel EcolPro/prisma/schema.prisma
  statut           String  @default("OUVERTE") // OUVERTE | CLOTUREE
  cloturedAt       DateTime?
  dateLimiteSaisie DateTime? // prolongation exceptionnelle
```
Trois défauts : `statut` est un `String` libre (une faute de frappe passe silencieusement) ; **aucun
motif** de réouverture, ni auteur, ni date ; la distinction *saisie bloquée / publication toujours
permise* n'est pas modélisée.

**Cible École360.** *« Fenêtre de saisie par période, décidée par l'école. Hors fenêtre, le serveur
refuse l'enseignant ; la direction rouvre au cas par cas, motif obligatoire. Publier / dépublier
n'est jamais bloqué. »*

**Étapes.**

1. Convertir `statut` en enum :
   ```prisma
   enum StatutPeriode { OUVERTE CLOTUREE }
   ```
   Migration avec contrainte de vérification préalable des valeurs existantes.
2. Nouveau modèle de traçabilité des réouvertures :
   ```prisma
   model ReouverturePeriode {
     id        String   @id @default(cuid())
     periodeId String
     motif     String              // OBLIGATOIRE
     ouvertePar String             // userId
     ouverteJusquau DateTime       // borne explicite, pas indéfinie
     createdAt DateTime @default(now())

     @@index([periodeId])
     @@map("reouvertures_periode")
   }
   ```
   **Décision** : une réouverture est **bornée dans le temps**. École360 dit « au cas par cas » ;
   nous ajoutons une date de fin pour éviter les réouvertures oubliées qui restent ouvertes.
3. Helper `assertSaisieAutorisee(periodeId, userId, role)` :
   - `CLOTUREE` + pas de réouverture active → refus
   - `CLOTUREE` + réouverture active non expirée → autorisé
   - `dateLimiteSaisie` dépassée → refus
   - Rôles de direction (`TENANT_ADMIN`, `PRINCIPAL`) : **non exemptés** de la fenêtre pour la saisie,
     mais autorisés à rouvrir. C'est plus strict qu'un contournement silencieux.
4. **Séparer les permissions** : `notes:write` (soumis à la fenêtre) et `notes:publish` (jamais
   bloqué). Aujourd'hui `notes:*` mélange les deux.
5. Interface : l'enseignant voit l'état de sa fenêtre en tête de l'écran de saisie, avec la date
   limite. Les champs sont désactivés hors fenêtre, avec le motif affiché.
6. Chaque réouverture écrit un audit (`action: "periode:reopen"`, `reason: <motif>`).

**Critère de sortie.**
- Test : saisie hors fenêtre → 403 + audit
- Test : réouverture sans motif → 400
- Test : publication hors fenêtre → **200** (jamais bloquée)

**Effort.** 1,5 j.
**Dépendances.** Slot 1.1 (audit). Cohérent avec 3.3 — mutualiser `assertEcrivable`.

---

## Slot 4.2 — Cadre d'évaluation 🟠

**Constat — trois risques cumulés.**

*Risque 1* : le coefficient est dupliqué sans règle de synchronisation.
```@/Users/awalehosman/Documents/logiciel EcolPro/prisma/schema.prisma
  coefficient Float    @default(1)
```
(sur `Evaluation`) et
```@/Users/awalehosman/Documents/logiciel EcolPro/prisma/schema.prisma
  noteMax     Float    @default(20)
  coefficient Float    @default(1)
```
(sur `Note`). Rien ne garantit leur cohérence.

*Risque 2* : aucune limite au nombre d'évaluations par (classe, matière, période) — une matière peut
peser arbitrairement lourd au bulletin.

*Risque 3* (traité en 0.3) : l'évaluation notée est supprimable.

**Cible École360.** Un cadre par triplet **(classe, matière, période)**, en coefficients ou en
pourcentages. *« Barème, poids et intitulé recopiés par le serveur ; une évaluation déjà notée devient
insupprimable. »*

Et leur avertissement le plus subtil, à respecter à la lettre :

> *« Le pourcentage est un mode de SAISIE, jamais de stockage : la note enregistre un coefficient
> dérivé. Stocker 40 et 60 donnerait à la matière un poids de 100 au bulletin, en silence. »*

**Conception.**

```prisma
enum ModeCadre { COEFFICIENT POURCENTAGE }

model CadreEvaluation {
  id        String @id @default(cuid())
  tenantId  String
  classeId  String
  matiereId String
  periodeId String

  mode ModeCadre @default(COEFFICIENT)

  lignes CadreLigne[]

  @@unique([classeId, matiereId, periodeId])
  @@index([tenantId])
  @@map("cadres_evaluation")
}

model CadreLigne {
  id      String @id @default(cuid())
  cadreId String
  cadre   CadreEvaluation @relation(fields: [cadreId], references: [id], onDelete: Cascade)

  ordre    Int
  intitule String    // "DS n°1"
  type     TypeNote
  noteMax  Float     @default(20)

  /**
   * Poids TEL QUE SAISI. Si le cadre est en POURCENTAGE, cette valeur est 40 ou 60.
   * Elle ne doit JAMAIS être recopiée telle quelle dans Note.coefficient.
   */
  poidsSaisi Float

  /**
   * Coefficient DÉRIVÉ, calculé une seule fois côté serveur. C'est la seule
   * valeur recopiée vers Note.coefficient. En mode POURCENTAGE :
   *   coefficientDerive = poidsSaisi / somme(poidsSaisi du cadre)
   * ce qui garantit que la somme des coefficients d'une matière vaut 1.
   */
  coefficientDerive Float

  @@index([cadreId])
  @@map("cadre_lignes")
}
```

**Étapes.**
1. Modèles + migration.
2. Fonction **unique** `deriveCoefficients(lignes, mode)` dans `src/lib/evaluation-cadre.ts`.
   Elle est appelée par l'aperçu **et** par l'écriture — même exigence que l'arrondi financier
   (slot 5.4). Un test vérifie que la somme des `coefficientDerive` vaut exactement 1 en mode
   pourcentage.
3. À la création d'une `Evaluation`, le serveur **recopie** `intitule`, `noteMax` et
   `coefficientDerive` depuis la ligne de cadre choisie. Le client ne peut pas les fournir.
4. Refuser la création d'une évaluation hors cadre (ou l'autoriser en « hors barème » explicite,
   marquée comme telle et exclue du calcul).
5. Le bulletin lit `coefficientDerive`, jamais `poidsSaisi`.
6. Interface : écran de cadre par (classe, matière, période) avec somme affichée en direct et
   avertissement si elle ne fait pas 100 %.

**Critère de sortie.** Test décisif : cadre en pourcentage 40/60 → deux évaluations créées → la
matière pèse **1** au bulletin, pas 100. C'est exactement le bug qu'École360 signale.

**Effort.** 2,5 j.
**Dépendances.** Slots 0.3, 3.1.

---

## Slot 4.3 — Réclamation de note 🟡

**Cible École360.** Circuit à trois acteurs avec une règle d'intégrité forte :
- la famille réclame depuis son espace
- **seul le professeur concerné** peut corriger
- **la direction arbitre sans jamais écrire la note**
- une note publiée change sans être dépubliée

**Pourquoi la troisième règle est structurante.** Si un directeur modifie une note, `saisieParId`
continue de pointer vers l'enseignant : la trace devient mensongère. La règle protège l'intégrité de
la traçabilité, pas seulement les prérogatives.

**Conception.**

```prisma
enum StatutReclamation {
  OUVERTE       // déposée par la famille
  EN_EXAMEN     // prise en charge par l'enseignant
  CORRIGEE      // l'enseignant a modifié la note
  REJETEE       // l'enseignant maintient la note
  ARBITREE      // la direction a tranché (sans écrire la note)
}

model ReclamationNote {
  id       String @id @default(cuid())
  tenantId String
  noteId   String

  deposeeParId String            // userId du parent ou de l'élève
  motif        String

  statut StatutReclamation @default(OUVERTE)

  // Réponse de l'enseignant
  traiteeParId String?
  reponse      String?
  valeurAvant  Float?            // photographie de la note avant correction
  valeurApres  Float?

  // Arbitrage de la direction — décision et consigne, JAMAIS la valeur
  arbitreParId String?
  decision     String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId, statut])
  @@index([noteId])
  @@map("reclamations_note")
}
```

**Étapes.**
1. Modèle + migration.
2. Permissions : `reclamations:create` (PARENT, STUDENT), `reclamations:treat` (TEACHER — **et
   seulement sur ses propres notes**), `reclamations:arbitrate` (PRINCIPAL, TENANT_ADMIN).
3. Garde forte : la route de correction vérifie que `note.saisieParId === session.user.id`.
   Un enseignant ne corrige pas la note d'un collègue.
4. **Interdiction explicite** : la route d'arbitrage n'a **aucun** champ de valeur de note dans son
   schéma Zod. La règle est appliquée par la forme de l'API, pas par une vérification.
5. Une correction sur note publiée met à jour `valeur` **sans** toucher `isPubliee`.
6. Audit systématique : dépôt, correction (avec avant/après), rejet, arbitrage.
7. Interfaces : dépôt côté famille (Phase 6), traitement côté enseignant, arbitrage côté direction.

**Critère de sortie.** Test : un directeur appelant la route d'arbitrage avec un champ `valeur`
→ rejeté par Zod. Un enseignant corrigeant la note d'un collègue → 403.

**Effort.** 2 j.
**Dépendances.** Slot 1.1. L'interface famille dépend de la Phase 6.

---

## Slot 4.4 — Professeur principal par section 🟡

**Constat.** `CLASS_TEACHER` est un **rôle global** dans notre `enum Role`. École360 est explicite :
*« "professeur principal" n'est PAS un rôle : c'est une désignation par section. »*

**Conséquence de notre modèle** : un enseignant est professeur principal *partout ou nulle part*. Il
ne peut pas être PP de la 3ᵉA et simple enseignant en 3ᵉB — cas pourtant standard.

**Étapes.**
1. Nouveau modèle :
   ```prisma
   model ProfesseurPrincipal {
     id           String @id @default(cuid())
     tenantId     String
     anneeId      String
     classeId     String
     enseignantId String

     @@unique([anneeId, classeId])   // un seul PP par classe et par année
     @@index([tenantId, enseignantId])
     @@map("professeurs_principaux")
   }
   ```
2. Migration de données : pour chaque `User` de rôle `CLASS_TEACHER`, créer les désignations
   correspondantes — **nécessite une décision humaine** (sur quelles classes ?). Prévoir un écran
   de reprise plutôt qu'une migration automatique hasardeuse.
3. Helper `estProfesseurPrincipal(userId, classeId, anneeId)`.
4. Basculer `CLASS_TEACHER` en rôle *déprécié* : conservé pour compatibilité, mais les privilèges de
   PP dérivent désormais de la désignation, pas du rôle.
5. Écran d'affectation des PP par classe (dans l'assistant de rentrée, étape 7).

**Critère de sortie.** Un enseignant PP de la 3ᵉA obtient les privilèges PP sur la 3ᵉA **et pas** sur
la 3ᵉB. Test explicite des deux cas.

**Effort.** 1,5 j.
**Dépendances.** Slot 3.2 (`anneeId`). **Prérequis de la Phase 7** (les gardes de messagerie
reposent sur cette désignation).

---

## Slot 4.5 — Cohérence du barème et de la notation 🟡

**Constat.** Trois sources de vérité pour le barème :
- `Tenant.notationMax Int @default(20)` — configuration globale
- `Note.noteMax Float @default(20)` — par note
- `CadreLigne.noteMax` (slot 4.2) — par ligne de cadre

**Étapes.**
1. Hiérarchie explicite documentée **et testée** : cadre > tenant. `Note.noteMax` est toujours
   **recopié**, jamais saisi.
2. Contrainte base : `CHECK (valeur >= 0 AND valeur <= "noteMax")`. Vérifier d'abord les données
   existantes — des notes hors barème peuvent exister.
3. Contrainte : `noteMax > 0`.
4. Test de non-régression sur le calcul de moyenne avec barèmes hétérogènes (une note sur 10 et une
   sur 20 dans la même matière).

**Critère de sortie.** Insérer une note de 25/20 est refusé **par la base**.

**Effort.** 0,5 j.
**Dépendances.** Slot 4.2.

---

### Bilan phase 4

| Slot | Objet | Effort |
|---|---|---|
| 4.1 | Fenêtre de saisie + réouverture motivée | 1,5 j |
| 4.2 | Cadre d'évaluation + coefficient dérivé | 2,5 j |
| 4.3 | Réclamation de note à trois acteurs | 2 j |
| 4.4 | Professeur principal par section | 1,5 j |
| 4.5 | Cohérence du barème | 0,5 j |

**Total : 8 jours.**

---

# PHASE 5 — Chaîne financière complète

> **Constat.** Sur les six étapes d'École360 (Tarifer · Générer · Remiser · Échelonner · Relancer ·
> Bloquer), **aucune** n'existe. Nous avons deux modèles : `Facture` avec un `montant Float` saisi à
> la main et **une seule** `echeance DateTime?`, et `Paiement` — qui est correct et couvre bien les
> moyens locaux (waffi, cac_pay, dahab_plus, saba_pay, faida).

---

## Slot 5.1 — Assainir la représentation monétaire 🟠

**Deux constats.**

*Constat 1* — `montant Float` pour de l'argent :
```@/Users/awalehosman/Documents/logiciel EcolPro/prisma/schema.prisma
  montant  Float
```
Un flottant binaire ne représente pas exactement les décimales. Pour du DJF (sans subdivision
courante) le risque est faible ; pour toute devise à centimes, les écarts s'accumulent sur les
échéanciers — et la Phase 5 introduit précisément des divisions.

*Constat 2* — triple source de devise, avec des valeurs par défaut **contradictoires** :
`Facture.devise @default("DJF")` · `Paiement.devise @default("DJF")` · `Tenant.currency @default("XOF")`.

**Étapes.**
1. `Float` → `Decimal @db.Decimal(12, 2)` sur `Facture.montant` et `Paiement.montant`.
   Migration : `ALTER TABLE ... TYPE numeric(12,2) USING montant::numeric(12,2)`.
2. Adapter le code : `Prisma.Decimal` n'est pas un `number`. Recenser tous les usages
   (`grep -rn "montant" src/`) — additions, comparaisons, sérialisation JSON (`.toString()`).
3. Devise : **une seule source**, `Tenant.currency`. Supprimer les champs `devise` de `Facture` et
   `Paiement`, ou les conserver en dénormalisation **avec** une contrainte d'égalité au tenant.
   *Décision recommandée* : les conserver (une facture historique doit garder sa devise d'émission
   même si l'école change de devise) mais aligner les défauts et refuser la divergence à l'écriture.
4. Corriger la valeur par défaut incohérente (`XOF` vs `DJF`) selon le marché cible réel.
5. Helper unique `formatMontant(montant, devise)` — jamais de formatage ad hoc.

**Critère de sortie.** Test : `0.1 + 0.2` sur des montants donne exactement `0.30`. Aucun `Float`
monétaire ne subsiste dans le schéma.

**Effort.** 1,5 j.
**Dépendances.** Phase 0.

---

## Slot 5.2 — Grille tarifaire et génération 🟠

**Cible École360.** Étapes 1 et 2 : *« Le prix se décide une fois pour la classe entière »* puis
*« Les comptes élèves naissent sans qu'on tape un montant. »*

**Conception.**

```prisma
enum TypeFrais { SCOLARITE INSCRIPTION CANTINE TRANSPORT UNIFORME EXAMEN AUTRE }

model GrilleTarifaire {
  id       String @id @default(cuid())
  tenantId String
  anneeId  String
  siteId   String?          // null = applicable à tous les sites

  /** null = applicable à toutes les classes de l'année (tarif par défaut) */
  classeId String?

  type    TypeFrais
  libelle String
  montant Decimal @db.Decimal(12, 2)

  /** Nombre d'échéances par défaut pour ce frais */
  nbEcheances Int @default(1)

  obligatoire Boolean @default(true)

  @@unique([anneeId, classeId, type, libelle])
  @@index([tenantId, anneeId])
  @@map("grilles_tarifaires")
}
```

**Étapes.**
1. Modèle + migration.
2. Résolution du tarif applicable : classe spécifique > défaut de l'année. Fonction unique
   `resolveTarifs(anneeId, classeId)`.
3. Génération en masse : pour une année et une classe, créer les factures de tous les élèves
   **inscrits** (dépend de `Inscription`, slot 3.2).
4. **Idempotence obligatoire** : relancer la génération ne duplique pas. Clé de déduplication
   `(anneeId, eleveId, type, libelle)`.
5. Aperçu avant génération : nombre de factures, montant total, élèves déjà facturés (ignorés).
6. Interface : écran de grille tarifaire dans `/parametres` (ou `/facturation/tarifs`), puis bouton
   de génération avec l'aperçu.

**Critère de sortie.** Générer deux fois de suite ne crée pas de doublon. Le total généré égale
exactement effectif × tarif.

**Effort.** 2 j.
**Dépendances.** Slots 5.1, 3.2.

---

## Slot 5.3 — Remises motivées 🟡

**Cible École360.** *« Fratrie, boursier, cas social — avec motif, auteur et date. »*

**Conception.**

```prisma
enum MotifRemise { FRATRIE BOURSIER CAS_SOCIAL PERSONNEL MERITE AUTRE }

model Remise {
  id       String @id @default(cuid())
  tenantId String
  factureId String

  motif       MotifRemise
  commentaire String?              // obligatoire si motif = AUTRE

  /** Exclusif : soit un pourcentage, soit un montant fixe — jamais les deux */
  pourcentage Decimal? @db.Decimal(5, 2)
  montantFixe Decimal? @db.Decimal(12, 2)

  accordeeParId String
  createdAt     DateTime @default(now())

  @@index([tenantId, factureId])
  @@map("remises")
}
```

**Étapes.**
1. Modèle + contrainte base d'exclusivité :
   ```sql
   ALTER TABLE remises ADD CONSTRAINT remise_un_seul_mode
     CHECK ((pourcentage IS NULL) <> ("montantFixe" IS NULL));
   ALTER TABLE remises ADD CONSTRAINT remise_commentaire_si_autre
     CHECK (motif <> 'AUTRE' OR commentaire IS NOT NULL);
   ```
2. Fonction unique de calcul du net à payer : `montant - remises`. Un montant net **négatif** est
   refusé.
3. **Règle d'École360 à respecter** : *« une échéance déjà payée n'est jamais touchée »*. Une remise
   appliquée après paiement partiel ne réduit que les échéances non réglées.
4. Audit de chaque remise avec l'auteur.
5. Interface : dialogue de remise sur la fiche facture, avec aperçu du net recalculé.

**Critère de sortie.** Test : remise de 100 % sur une facture déjà payée à 50 % → les échéances
payées sont intactes, le net ne devient pas négatif.

**Effort.** 1,5 j.
**Dépendances.** Slots 5.1, 5.2.

---

## Slot 5.4 — Échéancier et arrondi unique 🟠

**Constat.** `Facture.echeance DateTime?` est **une seule date**. Un échéancier multi-lignes est
structurellement impossible aujourd'hui.

**Cible École360**, avec leur avertissement technique à respecter mot pour mot :

> *« L'arrondi d'un échéancier vit UNE fois, côté serveur : l'aperçu et l'écriture appellent la même
> fonction. Deux implémentations afficheraient 9 600 et créeraient une ligne à 9 599. »*

**Conception.**

```prisma
enum StatutEcheance { A_VENIR PARTIELLE PAYEE EN_RETARD ANNULEE }

model Echeance {
  id        String @id @default(cuid())
  tenantId  String
  factureId String

  numero Int                              // 1, 2, 3…
  montant Decimal @db.Decimal(12, 2)
  dateEcheance DateTime

  statut StatutEcheance @default(A_VENIR)
  montantPaye Decimal @db.Decimal(12,2) @default(0)

  @@unique([factureId, numero])
  @@index([tenantId, dateEcheance, statut])
  @@map("echeances")
}
```

**Le point critique — la fonction d'arrondi.**

Fichier `src/lib/finance/echeancier.ts`, fonction **unique** :
```ts
/**
 * Répartit un montant en n échéances. La somme des échéances est GARANTIE
 * égale au montant total : le reliquat d'arrondi est porté par la DERNIÈRE
 * échéance. Cette fonction est appelée par l'aperçu ET par l'écriture — toute
 * seconde implémentation est un bug par construction.
 */
export function repartirEcheances(
  montantTotal: Decimal,
  nbEcheances: number,
  premiereDate: Date,
  intervalleMois = 1,
): { numero: number; montant: Decimal; dateEcheance: Date }[]
```

**Étapes.**
1. Modèle + migration. Pour l'existant : créer une échéance unique par facture reprenant
   `montant` et `echeance`, puis déprécier `Facture.echeance`.
2. Écrire `repartirEcheances` **avant** toute interface. Test de propriété : pour tout montant et
   tout n, `somme(échéances) === montantTotal` — vérifié sur un large échantillon aléatoire.
3. Un seul point d'appel côté aperçu, un seul côté écriture, **la même fonction**. Un test de
   gouvernance vérifie qu'aucune autre division de montant n'existe dans le code.
4. Recalcul d'échéancier après remise : les échéances payées sont préservées, seules les restantes
   sont recalculées.
5. Statut dérivé : un `cron` quotidien passe les échéances dépassées en `EN_RETARD`.
6. Interface : timeline de l'échéancier sur la fiche facture, avec état par ligne.

**Critère de sortie.** Test de propriété sur 10 000 combinaisons (montant, n) : la somme est toujours
exacte. Aucune divergence aperçu/écriture.

**Effort.** 2 j.
**Dépendances.** Slots 5.1 → 5.3.

---

## Slot 5.5 — Relances et blocage 🟡

**Cible École360.** Étape 5 : *« Trois niveaux : rappel, ferme, escalade »*. Étape 6 :
*« Blocage assisté au-delà du seuil choisi par l'école »*.

**Conception.**

```prisma
enum NiveauRelance { RAPPEL FERME ESCALADE }

model Relance {
  id         String @id @default(cuid())
  tenantId   String
  echeanceId String

  niveau NiveauRelance
  canal  String              // EMAIL | SMS | PUSH | COURRIER
  destinataire String        // email ou téléphone au moment de l'envoi

  envoyeeLe DateTime @default(now())
  envoyeeParId String?       // null = automatique

  @@index([tenantId, echeanceId])
  @@map("relances")
}
```

Configuration par tenant (à ajouter sur `Tenant` ou dans une table de paramètres) :
- délais de déclenchement par niveau (ex. J+7, J+21, J+45)
- seuil de blocage (montant ou nombre d'échéances en retard)
- modèles de message par niveau

**Étapes.**
1. Modèle + paramètres tenant.
2. Escalade automatique : `cron` quotidien qui sélectionne les échéances en retard et envoie le
   niveau approprié — **sans jamais sauter un niveau** ni renvoyer un niveau déjà envoyé.
3. Réutiliser `dispatch.ts` pour l'envoi (corrigé en slot 0.2).
4. **Blocage « assisté », pas automatique** — c'est la nuance d'École360. Le système *propose* le
   blocage au-delà du seuil ; un humain confirme. Modèle `BlocageEleve` avec motif, auteur, date et
   date de levée.
5. Ce qu'un blocage empêche : à décider explicitement et à documenter. Proposition : masque le
   bulletin PDF, pas l'accès aux notes. **Ne jamais** bloquer l'accès à la messagerie (un parent en
   difficulté doit pouvoir joindre l'école).
6. Interface : file des relances à envoyer, historique par élève, écran de blocages proposés.

**Critère de sortie.** Test : échéance dépassée de 7 jours → relance `RAPPEL` envoyée une seule fois.
À J+21 → `FERME`. Jamais deux fois le même niveau.

**Effort.** 2 j.
**Dépendances.** Slots 5.4, 0.2.

---

## Slot 5.6 — Suivi par élève et pilotage 🟡

**Cible École360.** *« Le suivi par élève répond enfin à "combien devrions-nous encaisser cette
année ?" : total, payé, reste dû, retard par date, prochaine échéance et niveau de relance. »*

**Étapes.**
1. Vue agrégée par élève et par année : total facturé, total remisé, net, payé, reste dû, retard,
   prochaine échéance, dernier niveau de relance atteint.
2. **Décision de performance** : vue matérialisée PostgreSQL rafraîchie par `cron`, ou calcul à la
   volée ? Trancher selon la volumétrie mesurée. Une vue matérialisée introduit un décalage — à
   afficher explicitement (« données de 04:00 »).
3. Tableau de bord établissement : attendu de l'année, encaissé, taux de recouvrement, pyramide des
   retards par tranche (0-30 j, 30-60 j, 60+).
4. Export comptable.

**Critère de sortie.** Le total attendu de l'année égale exactement la somme des nets de toutes les
factures — vérifié par test sur un jeu de données de référence.

**Effort.** 1,5 j.
**Dépendances.** Slots 5.1 → 5.5.

---

### Bilan phase 5

| Slot | Objet | Effort |
|---|---|---|
| 5.1 | `Decimal` + devise unique | 1,5 j |
| 5.2 | Grille tarifaire + génération idempotente | 2 j |
| 5.3 | Remises motivées | 1,5 j |
| 5.4 | Échéancier + arrondi unique testé | 2 j |
| 5.5 | Relances 3 niveaux + blocage assisté | 2 j |
| 5.6 | Suivi par élève + pilotage | 1,5 j |

**Total : 10,5 jours.**

---

# PHASE 6 — Espaces élève et parent

> **Constat.** Nos rôles `STUDENT` et `PARENT` ont des permissions déclarées dans `rbac.ts`, mais
> **aucune page web ne leur est dédiée**. Un élève qui se connecte sur le web arrive sur
> `/dashboard` — une interface d'administration. Les espaces famille n'existent que dans l'app mobile.
>
> Enjeu commercial direct : l'offre « École connectée » se vend sur ce portail.

---

## Slot 6.1 — Socle du portail 🟠

**Objectif.** Un espace distinct, pas un dashboard filtré. École360 : *« Un enseignant n'a pas accès
à "Gestion École" — c'est une règle, pas un réglage. »*

**Arborescence retenue.**
```
src/app/(portail)/
  layout.tsx          — coquille propre : pas de Sidebar admin
  eleve/
    page.tsx          — accueil élève
    notes/
    devoirs/
    bulletins/
    emploi-du-temps/
    finances/
  parent/
    page.tsx          — sélecteur d'enfant + synthèse
    [enfantId]/
      notes/ devoirs/ bulletins/ finances/
  compte/
    page.tsx          — profil et sécurité (commun à tous les rôles)
```

**Étapes.**
1. Créer le groupe de routes `(portail)` avec son propre layout : navigation horizontale simple,
   pas la sidebar administrative.
2. **Redirection au login selon le rôle** — modifier la logique de `/select-tenant` :
   - `STUDENT` → `/eleve`
   - `PARENT` → `/parent`
   - autres → `/dashboard`
3. **Garde réciproque, appliquée serveur** :
   - un `STUDENT` ou `PARENT` accédant à `/dashboard` ou toute route `(dashboard)` → redirigé
   - un rôle personnel accédant à `/eleve` → redirigé
   Implémenter dans `guard-page.ts` **et** dans le middleware, pas seulement l'un des deux.
4. Composant `PortailNav` avec les onglets propres au rôle.
5. Le module `PORTAIL_FAMILLES` conditionne l'accès (Phase 2) : module désactivé → le compte élève
   ne peut pas se connecter au portail, avec un message clair.

**Critère de sortie.** Test Playwright : un élève connecté et redirigé vers `/eleve`, et `/dashboard`
en accès direct redirige. Un `TENANT_ADMIN` accédant à `/eleve` est redirigé.

**Effort.** 2 j.
**Dépendances.** Phase 2 (module), Phase 0.

---

## Slot 6.2 — Espace élève 🟠

**Cible École360.** *« Ses notes une fois publiées — jamais avant —, ses devoirs et son dépôt de
copie, ses examens en ligne, ses bulletins en PDF et la situation de ses paiements. »*

**Étapes.**
1. **Lien User ↔ Eleve** : vérifier l'état du modèle (`migration_eleve_user.sql` existe dans le
   projet). Un élève doit résoudre son `eleveId` depuis sa session, et **uniquement le sien**.
   C'est le point de sécurité central de ce slot.
2. Accueil : prochaines évaluations, moyenne de la période en cours, absences du mois, prochaine
   échéance de paiement.
3. Notes : **filtre serveur strict** `isPubliee = true`. Jamais côté client.
4. Bulletins : liste des périodes, téléchargement PDF (réutilise `bulletin/[eleveId]/[periodeId]`
   avec une garde de propriété).
5. Emploi du temps : sa classe uniquement.
6. Finances : ses factures, échéancier, historique de paiements. **Lecture seule**.
7. Dépôt de réclamation de note (slot 4.3).

**Sécurité — le test qui compte.** Un élève changeant l'`eleveId` dans l'URL ou dans une requête API
obtient `403`, jamais les données d'un camarade. À tester sur **chaque** route du portail.

**Critère de sortie.** Suite de tests d'accès horizontal : pour chaque route élève, un accès avec
l'identifiant d'un autre élève → 403 + audit.

**Effort.** 2,5 j.
**Dépendances.** Slot 6.1.

---

## Slot 6.3 — Espace parent 🟠

**Cible École360.** *« Tous ses enfants au même endroit : notes, devoirs, bulletins, échéances et
alertes financières, et un canal direct vers les professeurs. »*

**Étapes.**
1. Résolution des enfants via `EleveParent`. Un parent ne voit que **ses** enfants — garde à chaque
   requête, jamais seulement à la première.
2. Sélecteur d'enfant persistant en tête d'écran (analogue au `TenantSwitcher` dans son principe).
3. Vue consolidée multi-enfants sur l'accueil : une carte par enfant avec moyenne, absences,
   reste dû.
4. **Alertes financières** — c'est ce qu'ils mettent en avant : bandeau visible si une échéance est
   en retard, avec le montant et la date.
5. Canal vers les professeurs (dépend de la Phase 7 pour les gardes relationnelles).
6. Dépôt de réclamation au nom de l'enfant (slot 4.3).

**Critère de sortie.** Un parent accédant à l'`eleveId` d'un enfant qui n'est pas le sien → 403.
Test avec un parent ayant 3 enfants dans 2 classes différentes.

**Effort.** 2,5 j.
**Dépendances.** Slots 6.1, 6.2.

---

## Slot 6.4 — Écran Compte 🟡

**Constat.** Aucune page `/compte` ou `/profil` n'existe. Le `Header` affiche l'avatar et le nom,
sans écran de gestion.

**Étapes.**
1. Page `/compte` accessible à **tous** les rôles (dashboard comme portail).
2. Profil : nom, avatar, téléphone, langue préférée.
3. Sécurité : changement de mot de passe (avec vérification de l'ancien), sessions actives,
   emplacement pour la 2FA (activée en slot 10.1).
4. Historique de connexion (lecture du journal d'audit filtré sur soi — réutilise la Phase 1).
5. Préférences de notification.

**Critère de sortie.** Changer son mot de passe invalide les autres sessions. L'historique n'affiche
que ses propres connexions.

**Effort.** 1,5 j.
**Dépendances.** Slots 1.1, 6.1.

---

## Slot 6.5 — Écran Rôles & permissions 🟡

**Constat.** `ROLE_PERMISSIONS` est une **matrice codée en dur** :
```@/Users/awalehosman/Documents/logiciel EcolPro/src/lib/rbac.ts
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
```
Modifier une permission exige de modifier le code et de redéployer. École360 a un écran dédié,
réservé au super-administrateur.

**Décision à trancher — deux options.**

*Option A — écran de consultation seule.* Affiche la matrice lue depuis le code. Coût faible, valeur
réelle (un `SUPER_ADMIN` peut expliquer à un client pourquoi tel rôle ne voit pas tel écran), aucun
risque de sécurité.

*Option B — matrice en base, éditable.* Souple, mais déplace la sécurité du code vers la donnée : une
erreur de saisie devient une faille, et l'on perd la revue par diff Git.

**→ Recommandation : Option A d'abord.** Passer en Option B seulement si un besoin client réel
apparaît, et alors avec un audit systématique de chaque modification et une validation par schéma.

**Étapes (option A).**
1. Route `GET /api/rbac/matrix` — `SUPER_ADMIN` uniquement.
2. Écran : matrice rôles × modules, avec le détail des actions au survol.
3. Colonne indiquant, par tenant sélectionné, si le module est actif (croisement avec Phase 2).
4. Simulateur : « que voit un `TEACHER` du tenant X ? » — liste les écrans accessibles.

**Critère de sortie.** L'écran reflète exactement `ROLE_PERMISSIONS` — un test compare les deux pour
éviter la dérive.

**Effort.** 1,5 j.
**Dépendances.** Phase 2.

---

### Bilan phase 6

| Slot | Objet | Effort |
|---|---|---|
| 6.1 | Socle `(portail)` + redirection + gardes réciproques | 2 j |
| 6.2 | Espace élève + tests d'accès horizontal | 2,5 j |
| 6.3 | Espace parent multi-enfants | 2,5 j |
| 6.4 | Écran Compte | 1,5 j |
| 6.5 | Écran Rôles & permissions (consultation) | 1,5 j |

**Total : 10 jours.**

---

# PHASE 7 — Gardes relationnelles de messagerie

> **L'analyse d'École360 est la plus fine de leur document** :
>
> *« Ce n'est pas du contrôle d'accès classique : "le parent de cet élève" ne s'exprime ni en table ni
> en action. Ce sont des gardes relationnelles, sous une permission d'usage unique. »*
>
> Notre RBAC raisonne en `module:action`. Il ne sait pas exprimer *« ce parent est parent de cet élève
> de cette section »*. Le slot 0.5 a fermé le trou le plus large ; cette phase construit le mécanisme.

---

## Slot 7.1 — Moteur de gardes relationnelles 🟡

**Objectif.** Une fonction unique qui répond à *« X peut-il écrire à Y ? »*, dérivée des relations
réelles et non d'un rôle.

**Matrice cible.**

| Émetteur | Destinataires autorisés | Peut initier ? |
|---|---|---|
| Enseignant | Élèves et parents de **ses** classes (via affectation matière × classe) | Oui |
| Professeur principal | **Toute** sa classe, matières non enseignées comprises | Oui |
| Parent | Professeurs des classes **courantes** de ses enfants + PP | Oui |
| Élève | Son professeur principal **seulement** | **Non** — répond uniquement |
| Direction | Enseignants et personnel de son périmètre (site) | Oui |
| Secrétariat | Parents et personnel du site | Oui |

**Fichier à créer** : `src/lib/messagerie/gardes.ts`

```ts
/**
 * Détermine si `emetteurId` peut initier une conversation avec `destinataireId`.
 * Les gardes sont RELATIONNELLES : elles interrogent les affectations réelles
 * (EnseignantSite, ProfesseurPrincipal, EleveParent, Inscription), jamais le
 * seul rôle. Un rôle ne suffit jamais à autoriser un destinataire.
 */
export async function peutEcrireA(
  tenantId: string,
  emetteurId: string,
  destinataireId: string,
): Promise<{ autorise: boolean; raison: string }>

/**
 * Liste les destinataires possibles — utilisée par l'interface pour ne proposer
 * QUE des destinataires autorisés. La garde d'écriture reste appliquée à
 * l'envoi : l'interface propose, le serveur décide.
 */
export async function destinatairesPossibles(
  tenantId: string,
  emetteurId: string,
): Promise<{ userId: string; nom: string; role: Role; relation: string }[]>
```

**Étapes.**
1. Écrire les deux fonctions en s'appuyant sur `ProfesseurPrincipal` (slot 4.4) et `Inscription`
   (slot 3.2). **Sans ces deux modèles, les gardes ne peuvent pas être correctes** — d'où la
   dépendance stricte.
2. Cas particulier élève : `peutEcrireA` retourne `false` sauf si le destinataire est son PP.
   La réponse dans une conversation existante ne passe **pas** par cette fonction (elle passe par
   `messages:reply` + appartenance à `ConversationParticipant`, slot 0.5).
3. Notion de classe **courante** pour un parent : les professeurs de l'année `ACTIVE` uniquement.
   Un parent ne peut pas écrire au professeur de l'an dernier.
4. Performance : ces fonctions seront appelées souvent. Prévoir des requêtes indexées et un cache
   court par (emetteur, année).
5. Tests exhaustifs — un test par ligne de la matrice, dans les deux sens (autorisé **et** refusé).

**Critère de sortie.** Les 6 lignes de la matrice sont testées. En particulier : un enseignant ne peut
pas écrire au parent d'un élève d'une classe qu'il n'enseigne pas.

**Effort.** 2 j.
**Dépendances.** Slots 4.4, 3.2, 0.5.

---

## Slot 7.2 — Application des gardes 🟡

**Objectif.** La garde est appliquée côté serveur à la création de conversation et à l'ajout de
participant.

**Étapes.**
1. Route de création de conversation : pour **chaque** destinataire, appeler `peutEcrireA`. Un seul
   destinataire refusé fait échouer toute la requête (pas de création partielle).
2. Route d'ajout de participant à une conversation existante : même garde.
3. Journaliser les refus (`audit`, `action: "messages:write"`, reason = la raison retournée).
4. Conversations de groupe : une annonce d'un PP à sa classe crée une conversation de groupe — la
   garde vérifie que **tous** les membres sont dans son périmètre.
5. Message d'erreur explicite côté client : « Vous ne pouvez pas écrire à ce destinataire : vous
   n'enseignez pas à ses enfants. » Un `403` muet est inexploitable pour l'utilisateur.

**Critère de sortie.** Test : création de conversation avec un destinataire hors périmètre → 403 +
audit. Aucune conversation partiellement créée.

**Effort.** 1,5 j.
**Dépendances.** Slot 7.1.

---

## Slot 7.3 — Interface de sélection des destinataires 🟡

**Objectif.** L'interface ne propose que des destinataires autorisés — sans jamais devenir la seule
barrière.

**Étapes.**
1. Route `GET /api/messages/destinataires` s'appuyant sur `destinatairesPossibles`.
2. Sélecteur groupé par relation : « Mes élèves », « Parents de mes élèves », « Ma classe (PP) »,
   « Personnel ».
3. Pour un élève : le sélecteur affiche **uniquement** son PP, et le bouton « Nouvelle conversation »
   est masqué s'il n'a pas de PP désigné.
4. Diffusion PP : bouton « Annonce à la classe » avec choix élèves / parents / les deux — c'est le
   cas d'usage que met en avant École360.
5. Rappel visuel de la relation à côté de chaque destinataire (« parent de Fatima D., 3ᵉA »).

**Critère de sortie.** Test Playwright : le sélecteur d'un enseignant ne contient aucun parent d'une
classe qu'il n'enseigne pas.

**Effort.** 1,5 j.
**Dépendances.** Slots 7.1, 7.2.

---

### Bilan phase 7

| Slot | Objet | Effort |
|---|---|---|
| 7.1 | Moteur `peutEcrireA` + matrice testée | 2 j |
| 7.2 | Application serveur + audit des refus | 1,5 j |
| 7.3 | Sélecteur de destinataires | 1,5 j |

**Total : 5 jours.**

---

# PHASE 8 — Le classeur imprimable

> **Constat.** École360 a **12 documents** normalisés, avec des conventions de mise en page précises
> (cartouche école/site/année, champs en pointillés, bloc signature, passage paysage automatique).
> Nous avons `export.ts`, `attestation-generator.ts`, `/eleves/attestations`, `/eleves/cartes` et les
> vues bulletin — nettement moins couvert et sans conventions communes.
>
> Leur observation de terrain est juste : *« la feuille d'appel et la liste d'émargement d'examen sont
> les deux papiers que toute école refait chaque semaine dans un tableur. »*

---

## Slot 8.1 — Socle de mise en page 🟡

**Objectif.** Un composant de document unique dont héritent les 12 sorties. Sans ce socle, chaque
document réinvente son en-tête et les conventions divergent.

**Conventions à implémenter.**

| Convention | Détail |
|---|---|
| **Cartouche** | École (nom, logo) · site · année scolaire · date d'édition · intitulé du document |
| **Pointillés** | Champs à remplir à la main : lignes en pointillés d'une hauteur suffisante pour écrire |
| **Bloc signature** | « Fait à …………… le …………… » + cadre de signature + fonction du signataire |
| **Paysage automatique** | Bascule si le nombre de colonnes dépasse le seuil calculé — pas un réglage manuel |
| **En-tête officiel** | République / Ministère par **défaut**, surchargeable ligne par ligne (École360 : *« l'en-tête officiel est le défaut, pas une fatalité : une école privée met le sien »*) |
| **Pagination** | « Page n / N » + rappel du cartouche sur chaque page |

**Étapes.**
1. Décision technique : génération PDF côté serveur (route handler renvoyant un PDF) ou impression
   navigateur via CSS `@media print` ? Recommandation : **CSS print** pour les listes (léger,
   maintenable, réutilise les composants React) et **PDF serveur** pour les bulletins (mise en page
   exigeante, archivage). Documenter le critère de choix.
2. Composant `<DocumentOfficiel>` avec les props du cartouche, résolvant automatiquement
   école/site/année depuis la session.
3. Réutiliser les champs existants de `Tenant` : `signatureUrl`, `cachetUrl`, `chefEtablissement`
   sont déjà présents dans le schéma.
4. Configuration de l'en-tête par tenant : lignes libres (République, Ministère, Direction régionale…)
   modifiables dans `/parametres`.
5. Feuille de styles print commune : marges, polices, seuils de bascule paysage.

**Critère de sortie.** Un document de démonstration produit les 6 conventions, vérifié visuellement
et par un test de non-régression (capture d'écran de référence).

**Effort.** 2 j.
**Dépendances.** Aucune. Peut être mené en parallèle.

---

## Slot 8.2 — Les 8 documents de liste 🟡

**Documents à produire** (les 8 premiers des 12 d'École360) :

| # | Document | Notes d'implémentation |
|---|---|---|
| 1 | Liste de classe | Effectif, matricule, nom, date de naissance, sexe |
| 2 | **Liste de présence (appel)** | Colonnes vierges pour cocher, une par jour ou par séance |
| 3 | Annuaire des parents | Parent, téléphone, e-mail, enfants rattachés |
| 4 | **Liste d'émargement (examen)** | Nom, matricule, case de signature — le papier hebdomadaire |
| 5 | Liste à colonnes personnalisées | L'utilisateur choisit les colonnes et l'ordre |
| 6 | Tous les élèves du site | Groupé par classe |
| 7 | Les enseignants du site | Matières et classes enseignées |
| 8 | Le personnel du site | Fonction, contact |

**Étapes.**
1. Prioriser 2 et 4 — c'est le gain de terrain immédiat.
2. Route unique `/api/documents/[type]` avec paramètres (classe, site, année) et validation Zod.
3. Chaque document déclare ses colonnes dans un registre unique — le seuil de bascule paysage se
   calcule depuis ce registre.
4. Le document 5 (colonnes personnalisées) lit le même registre : choisir des colonnes existantes,
   jamais du texte libre. **C'est aussi une mesure de sécurité** : le tri et la sélection de colonnes
   pilotés par le client sont exactement ce que la couche 7 d'École360 interdit (*« colonnes en liste
   blanche, aucun tri piloté par le client »*).
5. Permission `documents:print` déjà présente dans `rbac.ts`.

**Critère de sortie.** Les 8 documents s'impriment avec le cartouche correct. Le document à colonnes
personnalisées refuse toute colonne hors registre.

**Effort.** 2,5 j.
**Dépendances.** Slot 8.1.

---

## Slot 8.3 — Les 4 documents d'emploi du temps et de salles 🟡

| # | Document |
|---|---|
| 9 | Emploi du temps d'une classe |
| 10 | Emploi du temps d'un enseignant |
| 11 | Occupation d'une salle |
| 12 | Feuille de notes réimportable (slot 8.4) |

**Étapes.**
1. Grille hebdomadaire en paysage systématique.
2. Emploi du temps enseignant : agrège toutes ses classes, signale les conflits éventuels.
3. Occupation de salle : taux d'occupation et créneaux libres — utile pour la planification.
4. Réutiliser les données de `EmploiTemps`, `DisponibiliteEnseignant` et `Salle`.

**Critère de sortie.** Les trois grilles sortent en paysage, lisibles, avec le cartouche.

**Effort.** 1,5 j.
**Dépendances.** Slots 8.1, 8.2.

---

## Slot 8.4 — Feuille de notes réimportable 🟠

**La boucle papier → écran → papier**, totalement absente chez nous et remarquable chez eux :

> *« On la remplit en classe, on reporte dans le fichier jumeau, on le réimporte. Les élèves sont
> reconnus même sans matricule ou nom inversé ; les incertains sont PROPOSÉS, jamais attribués à
> l'aveugle. »*

**Étapes.**
1. **Export** : feuille de notes PDF pour (classe, matière, période) avec une colonne par évaluation
   du cadre (slot 4.2), les noms pré-remplis, les cases de note vides.
2. **Fichier jumeau** : un XLSX de structure identique, généré en même temps, avec les mêmes lignes
   dans le même ordre et un identifiant technique en colonne masquée.
3. **Réimport** : lecture du XLSX, rapprochement des élèves par ordre de priorité :
   - identifiant technique (si la colonne masquée est intacte) → certain
   - matricule → certain
   - nom + prénom exacts → certain
   - **rapprochement flou** via `text-match.ts` (déjà présent) → **proposé**
   - nom inversé (prénom/nom permutés) → **proposé**
4. **Écran de résolution** — le cœur du slot : trois sections distinctes.
   - *Reconnus* : import direct
   - *Proposés* : ligne du fichier, élève suggéré, score de confiance, boutons Confirmer / Choisir un
     autre / Ignorer
   - *Non reconnus* : à traiter manuellement
   **Aucune attribution automatique dans la section « Proposés »** — c'est la règle d'École360.
5. Validation : les notes hors barème sont refusées avant écriture (slot 4.5), avec la liste des
   lignes fautives.
6. Idempotence : réimporter le même fichier met à jour, ne duplique pas.
7. Audit de l'import : nombre de lignes, reconnus, proposés confirmés, ignorés.

**Critère de sortie.** Test avec un fichier contenant : un nom inversé, un accent manquant, un
matricule absent, un élève inexistant. Les trois premiers sont **proposés** (pas attribués), le
quatrième est en non-reconnu. Aucune note écrite sans confirmation.

**Effort.** 2,5 j.
**Dépendances.** Slots 8.1, 4.2, 4.5.

---

### Bilan phase 8

| Slot | Objet | Effort |
|---|---|---|
| 8.1 | Socle `<DocumentOfficiel>` + 6 conventions | 2 j |
| 8.2 | 8 documents de liste + registre de colonnes | 2,5 j |
| 8.3 | 3 documents emploi du temps / salles | 1,5 j |
| 8.4 | Feuille de notes réimportable + écran de résolution | 2,5 j |

**Total : 8,5 jours.**

---

# PHASE 9 — Import unifié et mise en route

> **Constat.** La mise en route d'une nouvelle école passe par des scripts SQL exécutés à la main
> (`supabase/seed_01` → `seed_08`). Ça ne passe pas à l'échelle commerciale.
>
> École360 : *« Un seul fichier d'import couvre les étapes 1 à 4 en une fois : sites, classes,
> sections, matières, élèves, parents, enseignants, et les comptes de connexion créés au passage.
> Ré-importer n'écrase pas : ça enrichit. »*
>
> Et leur idée sur les mots de passe : *« Le mot de passe de première connexion se DÉDUIT de l'état
> civil (Prénom.Nom.JJMMAAAA) et le service de gestion des identités impose son changement dès la
> première connexion. Rien à distribuer, rien à stocker en clair, rien à réclamer quand un élève
> l'oublie. »*

---

## Slot 9.1 — Format d'import unifié 🟡

**Objectif.** Un seul fichier (XLSX ou CSV) couvrant sites, classes, matières, enseignants, élèves,
parents et comptes — en une passe.

**Conception du format.**

Le fichier comporte **plusieurs feuilles** (XLSX) ou **plusieurs sections** (CSV avec en-tête de
section) :

| Feuille | Lignes | Colonnes obligatoires |
|---|---|---|
| `Sites` | 1 à N | nom, adresse, ville |
| `Classes` | 1 à N | nom, niveau, site |
| `Matieres` | 1 à N | nom, code |
| `Enseignants` | 1 à N | prénom, nom, e-mail, téléphone, matières (séparées par `;`) |
| `Affectations` | 1 à N | enseignant, classe, matière |
| `Eleves` | 1 à N | prénom, nom, dateNaissance, sexe, classe, matricule? |
| `Parents` | 1 à N | prénom, nom, téléphone, e-mail?, enfant (prénom + nom) |
| `Parametres` | 1 | annéeScolaire, devise, notationMax, langue |

**Étapes.**
1. Définir un **template** téléchargeable depuis `/parametres` → onglet **Import**.
2. Validation structurale : un XLSX sans la feuille `Eleves` est refusé avec un message explicite.
3. Validation croisée : chaque `classe` référencée dans `Eleves` doit exister dans `Classes`. Chaque
   `enfant` référencé dans `Parents` doit exister dans `Eleves`.
4. **Sémantique de ré-import** : *« ça enrichit, n'écrase pas »*.
   - Un élève reconnu par matricule ou (nom + prénom + dateNaissance) → **mis à jour**, pas dupliqué.
   - Un élève nouveau → créé.
   - Une classe nouvelle → créée. Une classe existante → ses inscriptions sont enrichies, jamais
     vidées.
5. Rapport d'import : créé N, mis à jour N, ignoré N (avec raisons), en erreur N (avec détails).

**Critère de sortie.** Importer le template rempli avec 5 classes et 30 élèves → tout est créé.
Réimporter le même fichier avec 2 élèves modifiés et 3 nouveaux → 2 mis à jour, 3 créés, 30 ignorés,
0 dupliqués.

**Effort.** 2,5 j.
**Dépendances.** Slot 3.2 (`Inscription`).

---

## Slot 9.2 — Création des comptes à l'import 🟡

**Objectif.** Les comptes de connexion sont créés au passage de l'import, sans saisie manuelle.

**Règle du mot de passe déduit.**

Format : `Prenom.Nom.JJMMAAAA` (première lettre du prénom en majuscule, nom en minuscule, date de
naissance sans séparateurs).

Exemples :
- `Ahmed Ali` né le 15 mars 2008 → `Ahmed.Ali.15032008`
- `Fatima El-Said` née le 3 juillet 2009 → `Fatima.El-said.03072009`

**Étapes.**
1. À l'import, pour chaque enseignant, élève et parent : créer un `User` si aucun n'existe avec le
   même e-mail (ou téléphone pour les parents sans e-mail).
2. Le mot de passe est **hashé** (bcrypt) à partir de la chaîne déduite — jamais stocké en clair.
3. Champ `mustChangePassword Boolean @default(false)` à ajouter sur `User` — mis à `true` à la
   création par import.
4. Au login, si `mustChangePassword = true` : rediriger vers `/changer-mot-de-passe` **avant** tout
   autre écran. Pas de contournement possible.
5. Après changement : `mustChangePassword = false` + audit.
6. **Cas d'oubli** : la fonction « mot de passe oublié » régénère le mot de passe déduit depuis
   l'état civil (vérifié contre la base) et remet `mustChangePassword = true`. *« Rien à réclamer
   quand un élève l'oublie »* — il peut le redéduire lui-même.

**Décision de sécurité à trancher.** Le format `Prenom.Nom.JJMMAAAA` est devinable si on connaît
l'élève. Trois mitigations possibles :
- *Mitigation 1* : imposer le changement à la première connexion (déjà prévu) — le mot de passe
  déduit n'est valable qu'une fois.
- *Mitigation 2* : ajouter un sel tenant au tenant (ex: `Prenom.Nom.JJMMAAAA.{tenantSlug}`) — non
  devinable sans connaître le slug, qui n'est pas public.
- *Mitigation 3* : exiger un canal vérifié (SMS ou e-mail) pour la réinitialisation.

**→ Recommandation : Mitigation 1 + 2.** Le sel tenant est gratuit et ferme l'attaque par devinette
externe. La Mitigation 3 est idéale mais exige un canal fiable — pas toujours disponible à Djibouti.

**Critère de sortie.** Un élève importé se connecte avec le mot de passe déduit + sel tenant, est
redirigé vers le changement obligatoire, puis accède au portail.

**Effort.** 2 j.
**Dépendances.** Slot 9.1. Champ `mustChangePassword` à ajouter au schéma.

---

## Slot 9.3 — Assistant de mise en route 🟡

**Objectif.** Une interface guidée — pas seulement un import brut, mais un parcours qui explique et
vérifie.

**Étapes.**
1. Page `/mise-en-route` accessible depuis `/parametres` tant que l'établissement n'a pas
   d'année `ACTIVE` avec au moins une inscription.
2. **Six étapes** d'École360, adaptées :
   - Étape 1 : créer l'école et ses sites (déjà fait à l'inscription SaaS — afficher le récapitulatif)
   - Étape 2 : importer la structure (télécharger le template, importer le fichier — slot 9.1)
   - Étape 3 : affecter les enseignants (vérifier les affectations, compléter manuellement)
   - Étape 4 : inscrire les élèves (vérifier les inscriptions par année)
   - Étape 5 : choisir l'offre et activer les modules (lien vers l'écran de la Phase 2)
   - Étape 6 : distribuer les comptes (aperçu des comptes créés, impression des fiches de connexion)
3. Chaque étape affiche son état : ✅ fait / ⏳ en cours / ⬜ à faire.
4. **L'assistant est lié à l'assistant de rentrée** (slot 3.4) : la mise en route initiale crée la
   première année en `DRAFT` et déroule l'assistant de rentrée. Les années suivantes n'utilisent que
   l'assistant de rentrée.
5. Fiche de connexion imprimable : nom, identifiant (e-mail ou téléphone), mot de passe déduit
   (masqué par défaut, bouton « révéler » pour impression), URL de connexion.

**Critère de sortie.** Un nouvel établissement passe de l'inscription SaaS à la première année
active entièrement depuis l'interface, sans exécuter de SQL.

**Effort.** 2 j.
**Dépendances.** Slots 9.1, 9.2, 3.4, 2.4.

---

## Slot 9.4 — Anonymisation des seeds 🟡

**Constat.** Nos seeds (`supabase/seed_01` → `seed_08`) contiennent des données nommées d'élèves
réalistes. École360 : *« On ne teste JAMAIS sur des données réelles d'élèves ; données personnelles
masquées avant stockage. »*

**Étapes.**
1. Remplacer tous les noms des seeds par des noms génériques (`Élève Test 01`, `Parent Test 01`).
2. Téléphones en `2537700000XX` (plage de test).
3. E-mails en `test0X@ecolpro.test` (domaine `.test` non résolvable).
4. Documenter dans `README` que les seeds ne contiennent aucune donnée réelle.
5. Un test de gouvernance vérifie qu'aucun seed ne contient un numéro de téléphone hors plage de
   test.

**Critère de sortie.** `grep -r "25377" supabase/seed_*.sql` ne retourne que des numéros en
`2537700000XX`.

**Effort.** 0,5 j.
**Dépendances.** Aucune. Peut être mené en parallèle.

---

### Bilan phase 9

| Slot | Objet | Effort |
|---|---|---|
| 9.1 | Format d'import unifié + template + sémantique enrichissante | 2,5 j |
| 9.2 | Comptes créés à l'import + mot de passe déduit + changement imposé | 2 j |
| 9.3 | Assistant de mise en route 6 étapes | 2 j |
| 9.4 | Anonymisation des seeds | 0,5 j |

**Total : 7 jours.**

---

# PHASE 10 — Sécurité renforcée

> **Constat.** Trois des sept couches d'École360 sont totalement absentes chez nous : couche 3
> (IdP externe + 2FA), couche 6 (preuve humaine), couche 7 (chiffrement, purge verrouillée,
> sauvegardes). Nous conservons notre approche NextAuth interne — mais nous pouvons combler les
> écarts les plus critiques sans changer d'architecture d'identité.

---

## Slot 10.1 — Double authentification (2FA) 🟠

**Constat.** Aucune occurrence de `totp`, `twoFactor` ou `otpauth` dans `src/`. École360 : *« Double
authentification obligatoire pour tout le domaine. »*

**Décision.** Nous ne migrerons pas vers un IdP externe (Keycloak/Auth0) — c'est un changement
d'architecture hors périmètre. Nous implémentons le 2FA TOTP **dans** NextAuth.

**Étapes.**
1. Ajouter `next-auth` providers TOTP ou utiliser une librairie dédiée (`otplib` + `qrcode`).
2. Modèle :
   ```prisma
   model TwoFactorSecret {
     userId     String   @id
     secret     String              // chiffré au repos
     backupCodes String[]           // codes de récupération hashés
     enabledAt  DateTime @default(now())
     @@map("two_factor_secrets")
   }
   ```
3. Champ `User.twoFactorEnabled Boolean @default(false)`.
4. **Obligatoire par défaut** pour `SUPER_ADMIN` et `TENANT_ADMIN` (règle École360 : *« obligatoire
   pour tout le domaine »* — nous l'étendons progressivement : d'abord les administrateurs, puis
   optionnel pour les autres rôles avec bascule dans `/compte`).
5. Flux d'activation dans `/compte` (slot 6.4) : QR code → saisie du code → confirmation → codes de
   récupération affichés une seule fois.
6. Flux de login : après `bcrypt.compare` réussi, si `twoFactorEnabled` → page de saisie du code
   TOTP avant de délivrer le JWT.
7. Codes de récupération : 10 codes à usage unique, hashés en base, utilisables en remplacement du
   TOTP.
8. Audit de chaque activation, désactivation et utilisation de code de récupération.

**Critère de sortie.** Un `TENANT_ADMIN` ne peut pas se connecter sans code TOTP. Un code de
récupération utilisé deux fois est refusé.

**Effort.** 2,5 j.
**Dépendances.** Slot 6.4 (écran Compte).

---

## Slot 10.2 — Jeton de liaison au navigateur 🟡

**Constat.** École360 : *« Jeton de liaison : valeur aléatoire liée au navigateur, comparée au
retour — ce qui ferme le détournement de connexion. »*

Notre JWT NextAuth n'est pas lié à une empreinte navigateur. Un jeton volé est utilisable depuis
n'importe quel client.

**Étapes.**
1. À l'authentification, générer un `nonce` aléatoire stocké dans un cookie `HttpOnly` + `SameSite=Strict`.
2. Inclure le hash du `nonce` dans le JWT.
3. À chaque requête, le middleware compare le hash du cookie avec celui du JWT. Différence →
   invalidation de session + audit.
4. Le `nonce` est **par session**, pas par utilisateur — un même utilisateur sur deux navigateurs a
   deux `nonce` distincts.
5. Rotation : à chaque `unstable_update` (switch tenant, switch site), le `nonce` est régénéré.

**Critère de sortie.** Un JWT volé sans le cookie `nonce` correspondant est refusé. Test : copier le
JWT dans un autre navigateur → session invalidée.

**Effort.** 1,5 j.
**Dépendances.** Slot 1.1 (audit).

---

## Slot 10.3 — Preuve humaine sur tables sensibles 🟡

**Constat.** École360 : *« 19 tables sensibles exigent une preuve humaine scellée
cryptographiquement. »* Aucun mécanisme chez nous.

**Décision pragmatique.** Nous n'implémenterons pas de captcha cryptographique scellé (trop lourd
pour un SaaS). Nous utiliserons **Turnstile de Cloudflare** (déjà présent dans les skills du projet)
sur les routes sensibles — c'est l'équivalent fonctionnel : preuve d'interaction humaine, token
vérifié côté serveur.

**Tables sensibles à protéger.**

| Table | Action | Pourquoi |
|---|---|---|
| `User` | login, changement de mot de passe | force brute |
| `Eleve` | suppression en masse | destruction de données |
| `Note` | modification après publication | intégrité pédagogique |
| `Facture` | suppression | fraude |
| `Paiement` | enregistrement | fraude |
| `UserTenant` | changement de rôle | escalade de privilège |
| `TenantModule` | désactivation | sabotage commercial |

**Étapes.**
1. Middleware Turnstile sur les routes concernées : le client fournit un token, le serveur vérifie
   auprès de Cloudflare.
2. Le token est **à usage unique** — un replay est refusé.
3. En cas d'échec de vérification : `403` + audit (`reason: "human_proof_failed"`).
4. Turnstile est invisible pour l'utilisateur légitime (challenge automatique) — pas de friction
   pour les humains, blocage pour les bots.
5. Configuration par tenant : un tenant peut désactiver la preuve humaine sur certaines actions
   (ex. enregistrement de paiement en mode hors-ligne) — **mais jamais** sur le login ni le
   changement de rôle.

**Critère de sortie.** Une requête de suppression d'élève sans token Turnstile valide est refusée.

**Effort.** 1,5 j.
**Dépendances.** Slot 1.1.

---

## Slot 10.4 — Purge verrouillée 🟠

**Constat.** École360 : *« Aperçu chiffré avant toute suppression, verrou : pas de purge sans archive
téléchargée, journal qui survit à la purge. »*

Nous n'avons aucun mécanisme de purge. La suppression d'un élève est un `DELETE` direct.

**Étapes.**
1. **Soft delete systématique** : ajouter `deletedAt DateTime?` sur les modèles sensibles (`Eleve`,
   `User`, `Facture`, `Note`, `Bulletin`). Les requêtes Prisma filtrent `deletedAt: null` par défaut
   (middleware Prisma ou helper).
2. **Purge = soft delete + archive**. L'archive est un export JSON chiffré (clé tenant) déposé en
   stockage (R2 Supabase ou équivalent).
3. **Verrou** : la route de purge exige qu'une archive ait été **téléchargée** par un
   `TENANT_ADMIN` dans les 7 derniers jours. Un flag `archiveDownloadedAt` sur la demande de purge.
4. **Journal survivant** : les `AuditLog` ne sont jamais purgés avec le tenant (slot 1.1, non-cascade).
5. Modèle de demande :
   ```prisma
   model DemandePurge {
     id String @id @default(cuid())
     tenantId String
     resource String          // "Eleve", "Facture"
     resourceId String
     demandeParId String
     motif String
     archiveUrl String?       // générée à l'approval
     archiveDownloadedAt DateTime?
     statut String            // DEMANDEE | ARCHIVE_PRETE | TELECHARGEE | PURGEE | ANNULEE
     createdAt DateTime @default(now())
     @@map("demandes_purge")
   }
   ```
6. Interface : file des demandes dans `/parametres` → onglet **Purge**.

**Critère de sortie.** Tenter de purger sans archive téléchargée → refus. L'audit de la purge survit
à la suppression.

**Effort.** 2 j.
**Dépendances.** Slots 1.1, 3.5.

---

## Slot 10.5 — Rétention et agrégation des journaux 🟡

**Objectif.** Le journal d'audit grandit indéfiniment. Une politique de rétention est nécessaire.

**Étapes.**
1. **Conservation** : 24 mois en lecture détaillée.
2. **Agrégation** : au-delà de 24 mois, les journaux sont agrégés par jour, par action et par
   verdict — les détails individuels sont supprimés, les compteurs sont conservés.
3. `cron` mensuel : sélectionner les lignes de plus de 24 mois, insérer les agrégats, supprimer les
   détails.
4. **Exception** : les journaux de `verdict = DENIED` sont conservés **intégralement** pendant 36
   mois — les refus sont les traces les plus utiles en investigation.
5. L'agrégation elle-même est auditée.

**Critère de sortie.** Après exécution du cron, les lignes de plus de 24 mois (sauf `DENIED`) sont
remplacées par des agrégats. Le total des agrégats égale le nombre de lignes supprimées.

**Effort.** 1 j.
**Dépendances.** Slot 1.1.

---

## Slot 10.6 — Alertes sur refus anormaux 🟡

**Objectif.** Un journal qu'on ne lit pas ne sert qu'après l'incident. Les alertes amènent l'incident
à l'exploitant.

**Étapes.**
1. Règles d'alerte configurables par tenant :
   - plus de N `DENIED` par utilisateur en 1 heure (défaut : 10)
   - plus de N `DENIED` sur la même action en 1 heure (défaut : 20)
   - tout `DENIED` sur `switch-tenant` ou `switch-site` (défaut : 5)
2. Canal d'alerte : notification in-app + e-mail au `TENANT_ADMIN`.
3. Tableau de bord d'alerte dans `/audit` (slot 1.3) : alertes actives, acquittées, historique.
4. Acquittement : un `TENANT_ADMIN` marque une alerte comme traitée, avec commentaire.

**Critère de sortie.** 11 refus de `switch-tenant` en 1 heure → alerte déclenchée et visible dans
le tableau de bord.

**Effort.** 1,5 j.
**Dépendances.** Slots 1.1, 1.3.

---

### Bilan phase 10

| Slot | Objet | Effort |
|---|---|---|
| 10.1 | 2FA TOTP dans NextAuth | 2,5 j |
| 10.2 | Jeton de liaison navigateur | 1,5 j |
| 10.3 | Turnstile sur tables sensibles | 1,5 j |
| 10.4 | Purge verrouillée par archive | 2 j |
| 10.5 | Rétention et agrégation des journaux | 1 j |
| 10.6 | Alertes sur refus anormaux | 1,5 j |

**Total : 10 jours.**

---

# PHASE 11 — Gouvernance exécutable

> **Le vrai différenciateur d'École360.** Leur thèse : *« Une règle sans test est un vœu. Une
> documentation sans exécution périme en silence. »*
>
> Nous avons l'embryon (règle ESLint `require-tenant-id`, CI GitHub Actions) mais pas la
> systématisation. Cette phase transforme nos règles en **tests exécutables qui bloquent la mise en
> ligne**.

---

## Slot 11.1 — Tests de gouvernance exécutables 🔴

**Objectif.** Chaque politique est un test qui s'exécute en CI et **bloque** le déploiement.

**Politiques à implémenter** (adaptées d'École360, étendues à notre contexte multi-tenant) :

| ID | Politique | Test |
|---|---|---|
| G1 | **Tenant-ready** : toute requête Prisma sur une table métier borne par `tenantId` | Règle ESLint `require-tenant-id` (slot 0.1) + test de non-régression |
| G2 | **Module-ready** : toute permission appartient à un module | Test : `PERMISSION_MODULE` couvre toutes les entrées de `ROLE_PERMISSIONS` (slot 2.1) |
| G3 | **Année-ready** : tout modèle du schéma déclare son scope annuel | Test : `annee-scope.ts` couvre les 52 modèles (slot 3.2) |
| G4 | **Purge-ready** : tout modèle sensible sait comment il s'efface | Test : chaque modèle sensible a un `deletedAt` ou une politique de purge déclarée |
| G5 | **Migrations en ajout seul** : aucune migration ne modifie une contrainte existante | Test : `git diff` sur les migrations de la PR ne contient que des `ADD` |
| G6 | **Fichiers générés jamais édités** : les fichiers du dossier `generated/` ne sont pas modifiés manuellement | Test : `git diff --name-only` ne contient aucun fichier `generated/` |
| G7 | **Source unique des secrets** : aucun secret en clair dans le code | Test : `grep -rn` de patterns de clé (sk_, pk_, AKIA, etc.) — doit retourner 0 |
| G8 | **Pas de `continue-on-error`** en CI | Test : le fichier `ci.yml` ne contient pas `continue-on-error: true` |
| G9 | **Pas de `Float` monétaire** | Test : `grep "Float" prisma/schema.prisma` sur les lignes contenant `montant` → 0 |
| G10 | **Pas de `findUnique` non bornée** sur identifiant externe | Test statique : audit des `findUnique({ where: { id` sans `tenantId` |
| G11 | **Pas de `onDelete: Cascade`** sur une table notée | Test : `grep "onDelete: Cascade" prisma/schema.prisma` sur `Note` → 0 |
| G12 | **Pas de `messages:*`** pour `STUDENT` | Test : `ROLE_PERMISSIONS.STUDENT` ne contient pas `messages:*` |
| G13 | **Une seule année `ACTIVE`** | Test d'intégration : tentative de double activation → refus base |
| G14 | **CI bloquante** | Test : `ci.yml` n'a aucun `continue-on-error` (doublon avec G8, volontaire) |
| G15 | **Toute route API passe par `authorize()`** | Test : `grep -rLn "authorize(" src/app/api --include=route.ts` → liste vide ou justifiée |

**Étapes.**
1. Créer `tests/governance/` avec un fichier par politique.
2. Chaque test est un script Vitest qui passe ou échoue — pas de warning.
3. Ajouter un job CI `governance` qui exécute `vitest run tests/governance/` **avant** le build.
4. **Bloquant** : si un test de gouvernance échoue, le déploiement est annulé.

**Critère de sortie.** `vitest run tests/governance/` passe avec 15/15. Une violation volontaire
(ex: ajouter `continue-on-error: true` dans `ci.yml`) fait échouer G8 et G14.

**Effort.** 2 j.
**Dépendances.** Phases 0, 1, 2, 3.

---

## Slot 11.2 — Assistant des variables 🟡

**Objectif.** École360 : *« D'où vient chaque variable, comment la changer, et la dérive
éventuelle. »*

**Étapes.**
1. Script `scripts/audit-variables.ts` qui :
   - lit `.env.example` et liste toutes les variables attendues
   - pour chaque variable, recherche son usage dans `src/` (`grep`)
   - détecte les variables **déclarées mais non utilisées** (dérive : une variable oubliée)
   - détecte les variables **utilisées mais non déclarées** dans `.env.example` (dérive : une
     variable ajoutée au code sans documentation)
2. Sortie en tableau Markdown : variable · fichier(s) d'usage · déclarée dans `.env.example` ·
   statut (OK / DÉRIVE)
3. Exécuté en CI — une dérive est un warning (pas un blocage, pour ne pas paralyser le dev).

**Critère de sortie.** L'assistant détecte une variable utilisée dans `src/` mais absente de
`.env.example` et la signale.

**Effort.** 1 j.
**Dépendances.** Aucune.

---

## Slot 11.3 — Assistant des identités 🟡

**Objectif.** École360 : *« Comptes, rôles, double authentification, sessions, avec la commande
équivalente affichée. »*

**Étapes.**
1. Script `scripts/audit-identites.ts` qui produit :
   - nombre d'utilisateurs par tenant et par rôle
   - nombre d'utilisateurs avec 2FA activé (taux de couverture)
   - sessions actives (JWT non expirés)
   - comptes désactivés
   - comptes sans connexion depuis 90 jours (dormants)
2. Pour chaque métrique, afficher la **commande équivalente** (requête SQL ou appel API) — c'est ce
   qui rend l'assistant pédagogique, pas seulement informatif.
3. Exécuté à la demande depuis `/super-admin` → onglet **Audit identités**.

**Critère de sortie.** L'assistant affiche le taux de 2FA par tenant et la commande SQL
correspondante.

**Effort.** 1 j.
**Dépendances.** Slot 10.1.

---

## Slot 11.4 — Procédures versionnées avec fichiers sentinelles 🟡

**Objectif.** École360 : *« Chaque procédure déclare ses "fichiers sentinelles" : déplacer un
fichier central fait échouer la vérification tant que la procédure n'est pas mise à jour. »*

**Procédures à versionner.**

| Procédure | Fichiers sentinelles |
|---|---|
| Ajouter une table | `prisma/schema.prisma`, `src/lib/rbac.ts`, `src/lib/annee-scope.ts` |
| Ajouter une route API | `src/lib/rbac.ts`, `src/lib/features.ts` |
| Ajouter un écran | `src/components/layout/Sidebar.tsx`, `src/lib/guard-page.ts` |
| Ajouter une variable | `.env.example`, `scripts/audit-variables.ts` |
| Livrer un chantier | `.github/workflows/ci.yml`, `tests/governance/` |
| Activer un module | `src/lib/features.ts`, `src/lib/rbac.ts` |
| Créer une année | `src/lib/annee-scolaire.ts`, `prisma/schema.prisma` |
| Purger des données | `src/lib/audit.ts`, `tests/governance/g4.test.ts` |

**Étapes.**
1. Créer `.windsurf/workflows/` avec un fichier Markdown par procédure, déclarant en frontmatter
   les fichiers sentinelles.
2. Script `scripts/check-procedures.ts` qui, pour chaque procédure, vérifie que les fichiers
   sentinelles existent et n'ont pas été déplacés.
3. Exécuté en CI — un fichier sentinelle manquant est un **bloquant**.

**Critère de sortie.** Renommer `src/lib/rbac.ts` en `src/lib/authz.ts` sans mettre à jour les
procédures → la CI échoue avec « Fichier sentinelle manquant : src/lib/rbac.ts dans la procédure
"ajouter-une-route" ».

**Effort.** 1,5 j.
**Dépendances.** Aucune.

---

## Slot 11.5 — Guide d'entrée 🟡

**Objectif.** École360 : *« La porte d'entrée : développeur / testeur / commercial / exploitant, par
où commencer ? »* Et leur preuve : *« cette présentation elle-même a été construite à partir du
guide d'entrée »*.

**Étapes.**
1. Script `scripts/guide-entree.ts` qui génère un document Markdown depuis les sources :
   - liste des modules (lus depuis `features.ts`)
   - liste des offres (lues depuis `features.ts`)
   - liste des documents imprimables (lus depuis le registre du slot 8.2)
   - nombre de tables, routes, composants (comptés dans les sources)
   - rôles et permissions (lus depuis `rbac.ts`)
2. Le document généré est commité à chaque livraison — c'est le **README vivant** du projet.
3. Comparaison avec le document précédent : un diff est affiché en CI, pour détecter les changements
   de périmètre entre versions.

**Critère de sortie.** Le guide généré reflète exactement l'état du code. Ajouter un module dans
`features.ts` le fait apparaître dans le guide au prochain commit.

**Effort.** 1,5 j.
**Dépendances.** Phases 2, 8.

---

### Bilan phase 11

| Slot | Objet | Effort |
|---|---|---|
| 11.1 | 15 tests de gouvernance bloquants en CI | 2 j |
| 11.2 | Assistant des variables + détection de dérive | 1 j |
| 11.3 | Assistant des identités + commandes équivalentes | 1 j |
| 11.4 | Procédures versionnées + fichiers sentinelles | 1,5 j |
| 11.5 | Guide d'entrée généré depuis les sources | 1,5 j |

**Total : 7 jours.**

---

# SYNTHÈSE GLOBALE

## Récapitulatif par phase

| Phase | Titre | Slots | Effort | Gravité max |
|---|---|---|---|---|
| **0** | Colmatage immédiat | 6 | **1 j** | 🔴 |
| **1** | Audit et traçabilité | 3 | **3 j** | 🔴 |
| **2** | Modules activables et offres | 4 | **5 j** | 🟠 |
| **3** | L'année scolaire comme frontière | 5 | **9 j** | 🟠 |
| **4** | Cadrage pédagogique | 5 | **8 j** | 🟠 |
| **5** | Chaîne financière complète | 6 | **10,5 j** | 🟠 |
| **6** | Espaces élève et parent | 5 | **10 j** | 🟠 |
| **7** | Gardes relationnelles de messagerie | 3 | **5 j** | 🟡 |
| **8** | Classeur imprimable | 4 | **8,5 j** | 🟠 |
| **9** | Import unifié et mise en route | 4 | **7 j** | 🟡 |
| **10** | Sécurité renforcée | 6 | **10 j** | 🟠 |
| **11** | Gouvernance exécutable | 5 | **7 j** | 🔴 |

**Total : 52 slots · ~84 jours-homme**

## Graphe de dépendances (simplifié)

```
Phase 0 ──→ Phase 1 ──→ Phase 11
  │              │
  │              ├──→ Phase 2 ──→ Phase 6
  │              │         │
  ├──→ Phase 3 ──┼─────────┼──→ Phase 5
  │    │         │         │
  │    ├──→ Phase 4 ──→ Phase 7
  │    │         │
  │    └──→ Phase 9
  │
  ├──→ Phase 8 (indépendante)
  │
  └──→ Phase 10 (après 1 et 6)
```

## Priorité commerciale

Si l'objectif est de **vendre par étapes** le plus vite possible :

1. **Phase 0** (1 j) — sécuriser l'existant
2. **Phase 2** (5 j) — modules activables = vente par étapes
3. **Phase 6** (10 j) — portail familles = offre « École connectée »
4. **Phase 5** (10,5 j) — finances = offre « Essentiel Finance »
5. **Phase 8** (8,5 j) — classeur = valeur terrain immédiate

**Ces 5 phases = 35 jours** et couvrent 3 des 5 offres d'École360.

## Priorité sécurité

Si l'objectif est de **fermer les angles morts** :

1. **Phase 0** (1 j) — CI bloquante + fuites + cascade
2. **Phase 1** (3 j) — audit des refus
3. **Phase 10** (10 j) — 2FA + purge + preuve humaine
4. **Phase 11** (7 j) — gouvernance exécutable

**Ces 4 phases = 21 jours** et ramènent le projet au niveau de sécurité d'École360 sur les couches
applicatives.

---

*Document généré le 8 août 2026 — plan d'implémentation EcolPro / École360.*
