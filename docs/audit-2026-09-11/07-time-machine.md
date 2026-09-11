# Étape 7 — Time Machine et horizon de démonstration

**Score actuel : 7,0 / 10** (brut 7,1 — plafonné à 7,0 par TM-H1 et TM-H2)
**Score cible : 9,7** · **Effort estimé : 2 à 3 jours-développeur**

---

## 1. Périmètre

`src/lib/demo-now.ts` (371 lignes), `src/lib/demo-horizon.ts` (extension Prisma, 218 lignes), `src/lib/demo-presets.ts`, `src/app/api/demo-now/route.ts`, `src/app/api/mobile/demo-now/route.ts`, `src/components/time-machine/*`. 72 fichiers de production appellent `getDemoNow()`, dont 42 routes d’API et actions serveur.

## 2. Ce qui est solide

- **Accès restreint côté serveur** : seul TENANT_ADMIN peut déplacer l'horloge (`ROLES_HORLOGE`, `demo-now.ts:35`), et c'est vérifié à **chaque** lecture de la date, pas seulement dans l'interface.
- **Cookies liés au compte et au tenant** (`demo_now_scope = [userId, tenantId]`) : un parent qui hérite des cookies d'un administrateur sur un poste partagé ne voit pas la date simulée.
- **Protection contre la récursion** (`AsyncLocalStorage`) lors de la résolution de session.
- **Horizon posé une seule fois**, dans le client Prisma, sur les seuls « faits constatés » (notes, absences, incidents, paiements…) et jamais sur les modèles structurels ou les événements planifiés. Le raisonnement est documenté (`demo-horizon.ts:1-60`).
- **Tests** : `demo-now.test.ts`, `demo-now-session.test.ts`, `demo-horizon.test.ts`, `demo-now-acces.test.ts`.

## 3. Constats

### TM-H1 — Haute — Des écritures réelles sont calculées à partir de lectures tronquées

L'extension borne les **lectures** de `Note`, `Absence`, `Paiement`, `Evaluation`… à la date simulée (`demo-horizon.ts`, tableau `HORIZON`, et `LECTURES`). Mais **aucune écriture n'est bloquée** pendant la simulation. Un administrateur placé en février qui lance `POST /api/bulletins/generer` écrit donc dans les **vrais** bulletins des moyennes calculées sur les seules notes antérieures à février. Même mécanisme pour toute action qui lit puis écrit : clôture de période, décisions de fin d'année, instantanés, tâches.

Symétriquement, une écriture faite pendant la simulation porte la date **réelle** (`new Date()` dans les routes, par exemple `facturation/paiement/route.ts`). Elle est donc **invisible** dans la vue simulée, ce qui produit un « j'ai créé un incident, il n'apparaît pas ».

### TM-H2 — Haute — La Time Machine est disponible dans les établissements réels

Rien ne réserve la fonction aux tenants de démonstration : aucun champ `Tenant.estDemo` dans le schéma, aucune variable d'environnement. L'administrateur de l'école réelle (voir `GARDE-FOUS.md` : EcolPro / ecolemiriam est en production) peut déplacer l'horloge et déclencher TM-H1 sur des données officielles.

### TM-M1 — Moyenne — Les relations imbriquées échappent à l'horizon

Limite documentée dans `demo-horizon.ts:18-24` : `eleve.findMany({ include: { notes: true } })` n'est pas borné. Pendant une démonstration, un même écran peut donc mélanger des données bornées et non bornées (une moyenne calculée sur `include` à côté d'une liste bornée). Aucun inventaire ne recense les `include` concernés.

## 4. Angles morts

- **Aucune indication visuelle permanente** dans les documents générés (PDF de bulletin, export Excel) qu'ils ont été produits sous une date simulée.
- **Aucune trace d'audit** d'activation ni de désactivation de la Time Machine.

## 5. Notation

| Axe (poids) | Actuel | Cible |
|---|---:|---|
| Sécurité (25 %) | 7 | 10 |
| Exactitude (25 %) | 6 | 9,5 |
| Robustesse (15 %) | 7 | 9,5 |
| Tests (15 %) | 9 | 9,5 |
| Traçabilité (10 %) | 5 | 9,5 |
| Maintenabilité (10 %) | 9 | 9,5 |
| **Brut** | **7,1** → plafonné à **7,0** | |

---

## 6. Cahier des charges

### TM-1 — Mode lecture seule pendant la simulation *(P1, 1 j)*

1. Dans `demo-horizon.ts`, ajouter au client Prisma une seconde branche : pour les opérations d'écriture (`create`, `createMany`, `update`, `updateMany`, `upsert`, `delete`, `deleteMany`), si `getDemoDate()` renvoie une date, **lever** `new ErreurTimeMachineLectureSeule()`. Exceptions explicites : la liste `ECRITURES_AUTORISEES_EN_DEMO` (journal d'audit, préférences d'interface, cache IA).
2. Dans les routes, capturer cette erreur et renvoyer `erreurJson("TIME_MACHINE_LECTURE_SEULE")` (nouveau code, traduit en fr, en et so). Dans l'interface, les boutons de mutation sont désactivés tant que la simulation est active, et un bandeau indique « Démonstration au JJ/MM/AAAA — lecture seule ».
3. **Décision produit** : si l'on veut **simuler aussi des écritures** (démonstration de saisie), elles doivent se faire dans un **tenant de démonstration** (TM-2), jamais dans un tenant réel.

**Tests.** Horloge déplacée, puis `prisma.bulletin.upsert` → erreur. Horloge réelle → écriture acceptée. `auditLog.create` en démonstration → accepté.

### TM-2 — Réserver la Time Machine aux tenants de démonstration *(P1, 0,5 j)*

Migration additive `Tenant.estDemo Boolean @default(false)`. `peutDeplacerHorloge` reçoit aussi le tenant : `ROLES_HORLOGE.includes(role) && tenant.estDemo`. La valeur est lue dans la session : ajouter `estDemo` aux claims et incrémenter `CLAIMS_VERSION`. Le seed Ambouli pose `estDemo = true`. Seul SUPER_ADMIN peut changer ce champ, avec audit.

**Test.** Un TENANT_ADMIN d'un tenant non démo reçoit `autorise: false`, et les cookies éventuellement posés sont ignorés.

### TM-3 — Traçabilité et marquage *(P2, 0,5 j)*

- `auditFire("time-machine:activer" | "time-machine:desactiver", { date })`.
- Filigrane « Document de démonstration — date simulée » sur les PDF et les exports générés sous simulation, à condition que TM-1 autorise leur génération : ce sont des lectures, sans écriture en base.

### TM-4 — Inventaire des `include` sensibles à l'horizon *(P3, 1 j)*

Script `scripts/audit-horizon-include.mjs`, qui liste les `include` et `select` imbriqués portant sur un modèle de `HORIZON` sans `where` de date. Chaque occurrence reçoit soit le filtre `lte: maintenant`, soit une justification.

## 7. Définition de « terminé »

- [ ] Aucune écriture possible sous simulation, hors liste blanche ; tests au vert.
- [ ] Time Machine indisponible dans tout tenant où `estDemo = false`.
- [ ] Activation et désactivation auditées.
