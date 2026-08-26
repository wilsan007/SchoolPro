-- ============================================================
-- MANUAL-05 — Rattrapage de migration de la base de démonstration
-- ============================================================
--
-- POURQUOI CE FICHIER
-- La base de démonstration a été construite en chargeant des dumps SQL, non
-- en rejouant les migrations Prisma. Elle a donc les tables et les données,
-- mais pas les contraintes que les migrations auraient posées :
--   — la colonne `emplois_temps.periodeId`, déclarée au schéma, est absente.
--     Prisma construisant ses requêtes à partir du schéma, TOUTE requête sur
--     `emplois_temps` échoue — l'écran Emploi du temps est inaccessible, pas
--     seulement dégradé ;
--   — la table `indisponibilites_enseignants` n'existe pas ;
--   — une quarantaine de clés étrangères manquent, sur `affectations_enseignants`,
--     `seances_pedagogiques`, `remises_caisse`, `demandes_fournitures`,
--     `listes_fournitures_classes`, `factures`, `incidents`, `sanctions`… :
--     ces tables n'ont aujourd'hui AUCUNE intégrité référentielle en base.
--
-- COMMENT L'APPLIQUER
--   psql "$DIRECT_URL" -f prisma/sql/MANUAL-05-rattrapage-migration.sql
--
-- Les DROP CONSTRAINT en tête retirent des clés qui vont être recréées
-- immédiatement après, avec la définition du schéma : ils ne suppriment
-- aucune donnée.
--
-- Régénérer ce fichier après une évolution du schéma :
--   npx prisma migrate diff --from-url "$DIRECT_URL" \
--     --to-schema-datamodel prisma/schema.prisma --script
-- ============================================================

-- DropForeignKey
ALTER TABLE "candidatures" DROP CONSTRAINT "candidatures_creeParId_fkey";

-- DropForeignKey
ALTER TABLE "candidatures" DROP CONSTRAINT "candidatures_valideParId_fkey";

-- DropForeignKey
ALTER TABLE "inscription_historique" DROP CONSTRAINT "inscription_historique_auteurId_fkey";

-- DropForeignKey
ALTER TABLE "inscription_historique" DROP CONSTRAINT "inscription_historique_candidatureId_fkey";

-- DropForeignKey
ALTER TABLE "inscription_historique" DROP CONSTRAINT "inscription_historique_tenantId_fkey";

-- AlterTable
ALTER TABLE "emplois_temps" ADD COLUMN     "periodeId" TEXT;

-- CreateTable
CREATE TABLE "indisponibilites_enseignants" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "enseignantId" TEXT NOT NULL,
    "jour" "Jour" NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SAISIE_MANUELLE',
    "sourceLibelle" TEXT,
    "periodeId" TEXT,
    "anneeLibelle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indisponibilites_enseignants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "indisponibilites_enseignants_tenantId_idx" ON "indisponibilites_enseignants"("tenantId");

-- CreateIndex
CREATE INDEX "indisponibilites_enseignants_siteId_idx" ON "indisponibilites_enseignants"("siteId");

-- CreateIndex
CREATE INDEX "indisponibilites_enseignants_enseignantId_idx" ON "indisponibilites_enseignants"("enseignantId");

-- CreateIndex
CREATE INDEX "indisponibilites_enseignants_periodeId_idx" ON "indisponibilites_enseignants"("periodeId");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_competences_country_code_key" ON "learnos_competences"("country", "code");

-- CreateIndex
CREATE INDEX "sanctions_type_dateRetourEffective_idx" ON "sanctions"("type", "dateRetourEffective");

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affectations_enseignants" ADD CONSTRAINT "affectations_enseignants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affectations_enseignants" ADD CONSTRAINT "affectations_enseignants_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "enseignants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affectations_enseignants" ADD CONSTRAINT "affectations_enseignants_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affectations_enseignants" ADD CONSTRAINT "affectations_enseignants_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emplois_temps" ADD CONSTRAINT "emplois_temps_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "periodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indisponibilites_enseignants" ADD CONSTRAINT "indisponibilites_enseignants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indisponibilites_enseignants" ADD CONSTRAINT "indisponibilites_enseignants_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indisponibilites_enseignants" ADD CONSTRAINT "indisponibilites_enseignants_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "enseignants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indisponibilites_enseignants" ADD CONSTRAINT "indisponibilites_enseignants_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "periodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_historique" ADD CONSTRAINT "bulletin_historique_bulletinId_fkey" FOREIGN KEY ("bulletinId") REFERENCES "bulletins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_anneeId_fkey" FOREIGN KEY ("anneeId") REFERENCES "annees_scolaires"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resoluParId_fkey" FOREIGN KEY ("resoluParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_classeParId_fkey" FOREIGN KEY ("classeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_reintegreParId_fkey" FOREIGN KEY ("reintegreParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidatures" ADD CONSTRAINT "candidatures_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidatures" ADD CONSTRAINT "candidatures_valideParId_fkey" FOREIGN KEY ("valideParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscription_historique" ADD CONSTRAINT "inscription_historique_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscription_historique" ADD CONSTRAINT "inscription_historique_candidatureId_fkey" FOREIGN KEY ("candidatureId") REFERENCES "candidatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscription_historique" ADD CONSTRAINT "inscription_historique_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoirs" ADD CONSTRAINT "devoirs_seanceId_fkey" FOREIGN KEY ("seanceId") REFERENCES "seances_pedagogiques"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances_pedagogiques" ADD CONSTRAINT "seances_pedagogiques_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances_pedagogiques" ADD CONSTRAINT "seances_pedagogiques_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances_pedagogiques" ADD CONSTRAINT "seances_pedagogiques_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances_pedagogiques" ADD CONSTRAINT "seances_pedagogiques_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances_pedagogiques" ADD CONSTRAINT "seances_pedagogiques_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "enseignants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances_pedagogiques" ADD CONSTRAINT "seances_pedagogiques_chapitreId_fkey" FOREIGN KEY ("chapitreId") REFERENCES "learnos_chapitres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances_pedagogiques" ADD CONSTRAINT "seances_pedagogiques_planificationId_fkey" FOREIGN KEY ("planificationId") REFERENCES "learnos_planification_chapitres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances_pedagogiques" ADD CONSTRAINT "seances_pedagogiques_planLeconId_fkey" FOREIGN KEY ("planLeconId") REFERENCES "learnos_plans_lecon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seance_commentaires" ADD CONSTRAINT "seance_commentaires_seanceId_fkey" FOREIGN KEY ("seanceId") REFERENCES "seances_pedagogiques"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seance_commentaires" ADD CONSTRAINT "seance_commentaires_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances_competences" ADD CONSTRAINT "seances_competences_seanceId_fkey" FOREIGN KEY ("seanceId") REFERENCES "seances_pedagogiques"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances_competences" ADD CONSTRAINT "seances_competences_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_autoriseParId_fkey" FOREIGN KEY ("autoriseParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_payeParId_fkey" FOREIGN KEY ("payeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remises_caisse" ADD CONSTRAINT "remises_caisse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remises_caisse" ADD CONSTRAINT "remises_caisse_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remises_caisse" ADD CONSTRAINT "remises_caisse_caissierId_fkey" FOREIGN KEY ("caissierId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remises_caisse" ADD CONSTRAINT "remises_caisse_receveurId_fkey" FOREIGN KEY ("receveurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_fournitures" ADD CONSTRAINT "demandes_fournitures_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_fournitures" ADD CONSTRAINT "demandes_fournitures_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_fournitures" ADD CONSTRAINT "demandes_fournitures_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "enseignants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_fournitures" ADD CONSTRAINT "demandes_fournitures_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listes_fournitures_classes" ADD CONSTRAINT "listes_fournitures_classes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listes_fournitures_classes" ADD CONSTRAINT "listes_fournitures_classes_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listes_fournitures_classes" ADD CONSTRAINT "listes_fournitures_classes_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liste_fourniture_items" ADD CONSTRAINT "liste_fourniture_items_listeId_fkey" FOREIGN KEY ("listeId") REFERENCES "listes_fournitures_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liste_fourniture_items" ADD CONSTRAINT "liste_fourniture_items_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

