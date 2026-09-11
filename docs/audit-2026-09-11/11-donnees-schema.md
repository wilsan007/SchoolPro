# Étape 11 — Données, schéma Prisma, migrations, conservation

**Score actuel : 6,0 / 10** (brut 6,0)
**Score cible : 9,7** · **Effort estimé : 5 à 7 jours-développeur + décisions**

---

## 1. Périmètre

`prisma/schema.prisma` (124 modèles sur HEAD, 5 889 lignes), `prisma/migrations/` (17 migrations et un `baseline/`), 20 fichiers `migration*.sql` à la racine du dépôt, 5 `migration_*.sql` et `rls_setup.sql` dans `prisma/`, `supabase/`, `docs/SECURITE/politique-migrations.md`, seeds (`prisma/seed*.ts`).

## 2. Ce qui est solide

- **Politique de migrations additives** écrite (règle n°5 d'`AGENTS.md`, `docs/SECURITE/politique-migrations.md`) et suivie dans les migrations récentes.
- **Index `tenantId`** sur tous les modèles qui portent la colonne, sauf un (`SyncConfig`, unique par tenant, donc sans impact).
- **Suppression logique** des élèves et des sites, avec délai de grâce ; la purge des sites est auditée et ne supprime en cascade que les rattachements (`UserSite`, `EnseignantSite`).
- **Unicité métier** portée par la base : `Bulletin @@unique([eleveId, periodeId])`, numéros de facture.
- **Notes protégées** : `Note.evaluation` en `onDelete: Restrict` (une évaluation notée ne se supprime pas), doublé par `checkEvaluationDeletable`.

## 3. Constats

### DON-H1 — Haute — Suppression définitive d'un établissement en un appel

`DELETE /api/super-admin/tenants/[id]` (`route.ts:64`) exécute `prisma.tenant.delete`, et 192 relations `onDelete: Cascade` emportent tout : élèves, notes, factures, paiements, dossiers de santé. Il n'y a ni confirmation, ni audit (API-H3), ni export préalable, ni délai de grâce. Une erreur de clic, ou une session SUPER_ADMIN compromise, efface une école.

### DON-H2 — Haute — Des données financières disparaissent par cascade

- `Eleve → Facture` : `onDelete: Cascade` ; `Facture → Paiement` et `Facture → Relance` : `onDelete: Cascade`. Une suppression physique d'élève (fusion, purge future, script) efface donc son historique comptable.
- `User → RemiseCaisse` (caissier) : `onDelete: Cascade`. Voir MET-H7 : `deleteUser` le déclenche aujourd'hui.

En comptabilité, un encaissement ne disparaît jamais : on l'annule par une écriture inverse.

### DON-M1 — Moyenne — Montants en `Float`

Sept modèles stockent de l'argent en `Float` : `Facture.montant` (`schema.prisma:2172`), `EcheancePaiement.montant` (2250), `Paiement.montant` (2278), `TarifNiveau.mensualite` (2311), `Budget.montantPrevu/montantDepense` (5487-5488), `Depense.montant` (5519), `RemiseCaisse.montantDeclare/montantRecu` (5595, 5607). Pour le franc djiboutien (sans subdivision), les valeurs entières restent exactes. Mais les sommes et les comparaisons (`restant <= 0`) deviennent fragiles dès qu'une devise à centimes est utilisée (`devise` est un champ libre) ou qu'une remise en pourcentage produit une décimale.

### DON-M2 — Moyenne — Tenant absent des tables financières et RH

30 modèles n'ont pas de `tenantId`, dont `Paiement`, `EcheancePaiement`, `Echeancier`, `BulletinPaie`, `Sanction`, `Message`, `EleveParent`. Leur isolation passe par une jointure : les politiques RLS sont plus coûteuses, les audits et exports plus complexes, et une requête directe par identifiant (`prisma.paiement.findMany({ where: { factureId } })`) dépend d'une vérification préalable du parent.

### DON-M3 — Moyenne — Traçabilité des modifications faible

48 modèles sur 124 n'ont pas de `updatedAt`, et seuls 4 ont une suppression logique. Combiné à la faible couverture de l'audit (API-H3), il est impossible de répondre à « qui a modifié cette absence, cette sanction, cette dispense, et quand ? ».

### DON-M4 — Moyenne — Sources de migration dispersées

Coexistent : `prisma/migrations/` (Prisma Migrate), `prisma/baseline/`, 20 fichiers `migration_*.sql` à la racine, 5 `migration_*.sql` et `rls_setup.sql` dans `prisma/`, un dossier `supabase/`, et le script `db:push` (`prisma db push`, sans migration). Aucun contrôle ne vérifie que le schéma issu des migrations correspond à `schema.prisma` (dérive possible).

### DON-M5 — Moyenne — Fusion d'élèves fragile

`parametres.ts:2300-2360` déplace les lignes de l'élève fusionné vers l'élève conservé par des `updateMany`, sans `tenantId` (écritures `tx.*`, invisibles pour le lint, voir ISO-H3). `tx.bulletin.updateMany` viole la contrainte `@@unique([eleveId, periodeId])` dès que les deux élèves ont un bulletin sur la même période : la transaction entière échoue, et la fusion devient impossible sans intervention manuelle. Les données LEARNOS ne sont pas déplacées (IA-M2).

## 4. Angles morts

1. **Aucune politique de conservation des données personnelles** : élèves partis, dossiers de santé, pièces d'inscription, messages, journaux. Aucune purge ni anonymisation. C'est à confronter à la réglementation applicable à Djibouti et, pour les éventuels ressortissants européens, au RGPD.
2. **Aucun droit d'accès ni export des données** d'une famille (« quelles données détenez-vous sur mon enfant ? »).
3. **Données de santé** (`FicheSanitaire`, `PassageInfirmerie`) : aucune règle d'accès renforcée n'est documentée au-delà du rôle NURSE. Aucun chiffrement au niveau des colonnes.
4. **Aucune contrainte `CHECK`** sur les montants ou les notes : montant négatif, note supérieure au barème, coefficient à 0.

## 5. Notation

| Axe (poids) | Actuel | Justification | Cible |
|---|---:|---|---:|
| Sécurité (25 %) | 6 | Suppression d'établissement sans garde, cascades | 10 |
| Exactitude (25 %) | 6 | `Float` monétaire, fusion fragile | 9,5 |
| Robustesse (15 %) | 6 | Pas de contrainte `CHECK`, dérive de migrations possible | 9,5 |
| Tests (15 %) | 6 | Pas de test de migration ni de fusion | 9,5 |
| Traçabilité (10 %) | 5 | `updatedAt` absent de 48 modèles | 9,5 |
| Maintenabilité (10 %) | 7 | Politique écrite ; sources dispersées | 9,5 |
| **Brut** | **6,0** | | |

---

## 6. Cahier des charges

### DON-1 — Protéger les données financières *(P1, 1,5 j)*

Migrations additives, **précédées d'un script de contrôle** qui compte les lignes susceptibles d'être touchées :
- `Facture.eleve` : `onDelete: Restrict` (un élève qui a des factures ne se supprime pas physiquement, seulement logiquement) ;
- `Paiement.facture` et `Relance.facture` : `Restrict` ;
- `RemiseCaisse.caissier` : `Restrict` ;
- ajouter `Facture.annuleeLe`, `Facture.motifAnnulation` et `Paiement.annuleLe` pour les annulations comptables.

**Test.** Supprimer physiquement un élève facturé échoue avec un message métier ; l'annulation d'un paiement produit une écriture, pas une suppression.

### DON-2 — Suppression d'établissement en deux temps *(P1, 1 j)*

1. `DELETE /api/super-admin/tenants/[id]` passe le tenant en `status = "CANCELLED"` et pose `Tenant.suppressionDemandeeLe` (migration additive). Modifier `deriveClaims` (`src/lib/tenant-claims.ts`) pour qu’il ignore les tenants en `CANCELLED` : l’accès est alors bloqué immédiatement, et les données restent.
2. Le corps de la requête exige `{ confirmation: "<slug du tenant>" }`. Audit systématique.
3. Export complet automatique (JSON et fichiers) déposé dans le stockage de sauvegarde.
4. Purge définitive par une tâche planifiée après 90 jours (**durée à valider**), si et seulement si l'export existe et qu'aucun retour arrière n'a été demandé. Audit de la purge.

### DON-3 — Tenant sur les tables financières et RH *(P2, 1,5 j)*

Ajouter `tenantId` (avec index) à `Paiement`, `EcheancePaiement`, `Echeancier`, `BulletinPaie`, `Sanction` : colonne nullable, **remplissage** depuis le parent, puis passage en non nullable dans une migration ultérieure (règle n°5). Mettre à jour `SITE_PATHS`, régénérer les politiques RLS (`pnpm rls:generate`) et adapter les écritures.

### DON-4 — Montants en unités mineures entières *(P2, 2 j)*

1. Créer un domaine pur `src/lib/domain/montant.ts` : entiers en unités mineures (0 décimale pour DJF et XOF, 2 pour EUR et USD, selon une table `DECIMALES_PAR_DEVISE`), addition, répartition sans perte (algorithme du plus grand reste pour les échéanciers), formatage.
2. Colonnes `...Minor Int` (ou `BigInt`) ajoutées à côté des `Float`, remplies, lues par le nouveau code, puis retrait des `Float` en fin de transition.
3. Test : répartir 100 000 DJF en 3 échéances donne 33 334 + 33 333 + 33 333, sans aucun écart.

### DON-5 — Une seule chaîne de migrations *(P2, 1 j)*

Archiver les SQL épars dans `prisma/sql/historique/`, avec un `README` indiquant pour chacun s'il a été intégré à `prisma/migrations`. Retirer `db:push` des usages documentés hors développement. Job CI « dérive de schéma » : voir TST-5.

### DON-6 — Fusion d'élèves robuste *(P2, 1 j)*

Traiter les conflits d'unicité avant le déplacement : bulletins sur la même période → garder celui de l'élève conservé et archiver l'autre (`BulletinVersion`, MET-2). Ajouter `tenantId` à tous les `where` des `tx.*`, déplacer les données LEARNOS (IA-1, étape 4) et auditer la fusion (liste des lignes déplacées par table).

### DON-7 — Conservation et droits des familles *(P3 — décision juridique, puis 3 j)*

1. **Décision** de la direction, avec avis juridique : durées de conservation par catégorie (scolarité, santé, finances, messages, journaux).
2. Tâche de purge ou d'anonymisation par catégorie, auditée.
3. Export « mes données » pour un parent (JSON et PDF), déclenché depuis l'espace parent et journalisé.
4. Contraintes `CHECK` (montants ≥ 0, `0 ≤ valeur ≤ noteMax`, `coefficient > 0`) via une migration SQL manuelle.

## 7. Définition de « terminé »

- [ ] Aucune cascade de suppression vers une donnée financière.
- [ ] Suppression d'établissement réversible pendant 90 jours, exportée et auditée.
- [ ] Contrôle de dérive de schéma vert en CI.
- [ ] Politique de conservation validée et appliquée.
