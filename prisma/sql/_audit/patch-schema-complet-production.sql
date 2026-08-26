-- CreateEnum
CREATE TYPE "MasteryStatus" AS ENUM ('UNKNOWN', 'EMERGING', 'DEVELOPING', 'PROFICIENT', 'MASTERED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('DEVOIR', 'EXAMEN', 'QUIZ', 'EXERCICE', 'PROJET', 'ORAL', 'OBSERVATION', 'RETEST', 'AUTO_ENTRAINEMENT');

-- CreateEnum
CREATE TYPE "ErrorType" AS ENUM ('CONCEPTUAL_ERROR', 'PROCEDURAL_ERROR', 'CALCULATION_ERROR', 'READING_ERROR', 'MISINTERPRETATION', 'MISSING_PREREQUISITE', 'INCOMPLETE_REASONING', 'CARELESS_ERROR', 'GUESS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "NiveauRecommandation" AS ENUM ('CRITIQUE', 'FRAGILE', 'CONSOLIDE', 'AVANCE', 'EXCELLENCE');

-- CreateEnum
CREATE TYPE "StatutRecommandation" AS ENUM ('OBLIGATOIRE', 'RECOMMANDEE', 'PROPOSEE', 'ACCEPTEE', 'ECARTEE');

-- CreateEnum
CREATE TYPE "StatutPlan" AS ENUM ('BROUILLON', 'PROPOSE', 'ACTIF', 'EN_REVUE', 'TERMINE', 'ABANDONNE');

-- CreateEnum
CREATE TYPE "StatutEtape" AS ENUM ('A_FAIRE', 'EN_COURS', 'FAIT', 'VALIDE', 'ECHOUE');

-- CreateEnum
CREATE TYPE "InterventionStatus" AS ENUM ('PROPOSED', 'APPROVED', 'ACTIVE', 'UNDER_REVIEW', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NiveauAlerteParent" AS ENUM ('INFO', 'ATTENTION', 'URGENT');

-- CreateEnum
CREATE TYPE "PalierExercice" AS ENUM ('RESTITUTION', 'APPLICATION', 'CONSOLIDATION', 'TRANSFERT', 'OUVERTURE');

-- CreateEnum
CREATE TYPE "FormatQuestion" AS ENUM ('SAISIE_LIBRE', 'SAISIE_COURTE', 'CHOIX_UNIQUE', 'ETAPES_GUIDEES', 'REMISE_EN_ORDRE', 'APPARIEMENT');

-- CreateEnum
CREATE TYPE "StatutFeuille" AS ENUM ('PROPOSEE', 'ASSIGNEE', 'EN_COURS', 'TERMINEE', 'REFUSEE');

-- CreateEnum
CREATE TYPE "StatutDevoir" AS ENUM ('A_FAIRE', 'EN_COURS', 'RENDU', 'CORRIGE');

-- CreateEnum
CREATE TYPE "StatutSeance" AS ENUM ('PLANIFIEE', 'EFFECTUEE', 'ANNULEE', 'REPORTEE');

-- CreateEnum
CREATE TYPE "StatutRemplacement" AS ENUM ('PROPOSE', 'VALIDE', 'REFUSE', 'EFFECTUE', 'ANNULE');

-- CreateEnum
CREATE TYPE "StatutEntretien" AS ENUM ('PLANIFIE', 'REALISE', 'ANNULE', 'REPORTÉ');

-- CreateEnum
CREATE TYPE "StatutDemandeLien" AS ENUM ('EN_ATTENTE', 'VALIDE', 'REFUSE');

-- CreateEnum
CREATE TYPE "StatutPropositionIa" AS ENUM ('PROPOSE', 'AJUSTE', 'VALIDE', 'REJETE');

-- CreateEnum
CREATE TYPE "CategorieBudget" AS ENUM ('FONCTIONNEMENT', 'PEDAGOGIE', 'MAINTENANCE', 'SALAIRES', 'TRANSPORT', 'CANTINE', 'EVENEMENTIEL', 'INVESTISSEMENT', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutRemiseCaisse" AS ENUM ('EN_ATTENTE', 'CONFIRME', 'REJETE');

-- CreateEnum
CREATE TYPE "PrioriteTache" AS ENUM ('BASSE', 'NORMALE', 'HAUTE', 'URGENTE');

-- CreateEnum
CREATE TYPE "StatutTache" AS ENUM ('A_FAIRE', 'EN_COURS', 'FAIT', 'ANNULE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'CAISSIER';
ALTER TYPE "Role" ADD VALUE 'SUPERVISOR';
ALTER TYPE "Role" ADD VALUE 'SUBJECT_LEAD';
ALTER TYPE "Role" ADD VALUE 'SITE_MANAGER';
ALTER TYPE "Role" ADD VALUE 'INSPECTOR';

-- DropForeignKey
ALTER TABLE "budgets" DROP CONSTRAINT "budgets_createdById_fkey";

-- DropForeignKey
ALTER TABLE "depenses" DROP CONSTRAINT "depenses_createdById_fkey";

-- DropForeignKey
ALTER TABLE "enseignant_affectations" DROP CONSTRAINT "enseignant_affectations_classeId_fkey";

-- DropForeignKey
ALTER TABLE "enseignant_affectations" DROP CONSTRAINT "enseignant_affectations_enseignantId_fkey";

-- DropForeignKey
ALTER TABLE "enseignant_affectations" DROP CONSTRAINT "enseignant_affectations_matiereId_fkey";

-- DropForeignKey
ALTER TABLE "enseignant_affectations" DROP CONSTRAINT "enseignant_affectations_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "enseignant_matieres" DROP CONSTRAINT "enseignant_matieres_enseignantId_fkey";

-- DropForeignKey
ALTER TABLE "enseignant_matieres" DROP CONSTRAINT "enseignant_matieres_matiereId_fkey";

-- DropForeignKey
ALTER TABLE "enseignant_matieres" DROP CONSTRAINT "enseignant_matieres_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "paiements" DROP CONSTRAINT "paiements_depotParId_fkey";

-- DropForeignKey
ALTER TABLE "paiements" DROP CONSTRAINT "paiements_directorRecuParId_fkey";

-- DropForeignKey
ALTER TABLE "remises_caisse" DROP CONSTRAINT "remises_caisse_destinataireId_fkey";

-- DropForeignKey
ALTER TABLE "remises_caisse" DROP CONSTRAINT "remises_caisse_recuParId_fkey";

-- DropIndex
DROP INDEX "budgets_tenantId_siteId_categorie_periode_key";

-- DropIndex
DROP INDEX "paiements_depotParId_idx";

-- DropIndex
DROP INDEX "paiements_directorRecuParId_idx";

-- DropIndex
DROP INDEX "structures_tenantId_type_key";

-- AlterTable
ALTER TABLE "annees_scolaires" ADD COLUMN     "archiveeAt" TIMESTAMP(3),
ADD COLUMN     "archiveePar" TEXT,
ADD COLUMN     "cloturePar" TEXT,
ADD COLUMN     "cloturedAt" TIMESTAMP(3),
ADD COLUMN     "statut" TEXT NOT NULL DEFAULT 'OUVERTE';

-- AlterTable
ALTER TABLE "budgets" DROP COLUMN "createdById",
DROP COLUMN "periode",
ADD COLUMN     "annee" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "devise" TEXT NOT NULL DEFAULT 'DJF',
ADD COLUMN     "montantDepense" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "statut" TEXT NOT NULL DEFAULT 'VALIDE',
DROP COLUMN "categorie",
ADD COLUMN     "categorie" "CategorieBudget" NOT NULL;

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT,
ADD COLUMN     "deletedReason" TEXT;

-- AlterTable
ALTER TABLE "cours" ADD COLUMN     "country" TEXT,
ALTER COLUMN "tenantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "depenses" DROP COLUMN "createdById",
DROP COLUMN "justificatif",
ADD COLUMN     "budgetId" TEXT,
ADD COLUMN     "enregistreParId" TEXT,
ADD COLUMN     "fournisseurContact" TEXT,
ADD COLUMN     "justificatifUrl" TEXT,
ADD COLUMN     "libelle" TEXT NOT NULL,
ADD COLUMN     "methodePaiement" TEXT,
ADD COLUMN     "reference" TEXT,
DROP COLUMN "categorie",
ADD COLUMN     "categorie" "CategorieBudget" NOT NULL DEFAULT 'AUTRE',
ALTER COLUMN "date" DROP DEFAULT;

-- AlterTable
ALTER TABLE "eleves" ADD COLUMN     "dateInscription" TIMESTAMP(3),
ADD COLUMN     "dateSortie" TIMESTAMP(3),
ADD COLUMN     "motifSortie" TEXT;

-- AlterTable
ALTER TABLE "evenements" ADD COLUMN     "responsableId" TEXT;

-- AlterTable
ALTER TABLE "examens" ADD COLUMN     "feuilleExercicesId" TEXT;

-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "actionPrise" TEXT,
ADD COLUMN     "classeParId" TEXT,
ADD COLUMN     "dateClassement" TIMESTAMP(3),
ADD COLUMN     "dateResolution" TIMESTAMP(3),
ADD COLUMN     "motifClassement" TEXT,
ADD COLUMN     "resoluParId" TEXT;

-- AlterTable
ALTER TABLE "paiements" DROP COLUMN "depotBanque",
DROP COLUMN "depotDate",
DROP COLUMN "depotParId",
DROP COLUMN "directorRecu",
DROP COLUMN "directorRecuAt",
DROP COLUMN "directorRecuParId",
ADD COLUMN     "dateSaisie" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "progressions_eleves" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "remises_caisse" DROP COLUMN "dateDeclaration",
DROP COLUMN "destinataireId",
DROP COLUMN "paiementIds",
DROP COLUMN "recuParId",
ADD COLUMN     "commentaireReceveur" TEXT,
ADD COLUMN     "dateRemise" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "dateSaisieReception" TIMESTAMP(3),
ADD COLUMN     "dateSaisieRemise" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "devise" TEXT NOT NULL DEFAULT 'DJF',
ADD COLUMN     "periodeDebut" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "periodeFin" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "receveurId" TEXT,
DROP COLUMN "statut",
ADD COLUMN     "statut" "StatutRemiseCaisse" NOT NULL DEFAULT 'EN_ATTENTE';

-- AlterTable
ALTER TABLE "sanctions" ADD COLUMN     "accuseReceptionParent" TIMESTAMP(3),
ADD COLUMN     "dateRetourEffective" TIMESTAMP(3),
ADD COLUMN     "reintegreParId" TEXT,
ADD COLUMN     "travailDonne" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "backupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpSecret" TEXT,
ADD COLUMN     "totpSecretIv" TEXT,
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorVerifiedAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "enseignant_affectations";

-- DropTable
DROP TABLE "enseignant_matieres";

-- DropEnum
DROP TYPE "StatutRemise";

-- CreateTable
CREATE TABLE "sync_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serverNick" TEXT NOT NULL,
    "syncInterval" INTEGER NOT NULL DEFAULT 60,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "apiKey" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "includeBulletins" BOOLEAN NOT NULL DEFAULT true,
    "includeNotes" BOOLEAN NOT NULL DEFAULT true,
    "includeEmploiTemps" BOOLEAN NOT NULL DEFAULT true,
    "includeExamens" BOOLEAN NOT NULL DEFAULT true,
    "includePersonnel" BOOLEAN NOT NULL DEFAULT true,
    "includeComptabilite" BOOLEAN NOT NULL DEFAULT true,
    "includeAbsences" BOOLEAN NOT NULL DEFAULT true,
    "includeParametres" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conseils" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "frequence" TEXT NOT NULL DEFAULT 'TRIMESTRIEL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conseils_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membres_conseil" (
    "id" TEXT NOT NULL,
    "conseilId" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBRE',
    "nomExterne" TEXT,
    "debutMandat" TIMESTAMP(3),
    "finMandat" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membres_conseil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reunions" (
    "id" TEXT NOT NULL,
    "conseilId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "lieu" TEXT,
    "ordreDuJour" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'PLANIFIEE',
    "compteRendu" TEXT,
    "presences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reunions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resolutions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conseilId" TEXT,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "dateVote" TIMESTAMP(3),
    "resultats" JSONB,
    "dateEffet" TIMESTAMP(3),
    "dateFin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentorats" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "mentoreId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ACADEMIQUE',
    "statut" TEXT NOT NULL DEFAULT 'ACTIF',
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFin" TIMESTAMP(3),
    "frequence" TEXT NOT NULL DEFAULT 'MENSUEL',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentorats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objectifs_mentorat" (
    "id" TEXT NOT NULL,
    "mentoratId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'EN_COURS',
    "priorite" INTEGER NOT NULL DEFAULT 3,
    "dateCible" TIMESTAMP(3),
    "progression" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "objectifs_mentorat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seances_mentorat" (
    "id" TEXT NOT NULL,
    "mentoratId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "duree" INTEGER,
    "statut" TEXT NOT NULL DEFAULT 'PLANIFIEE',
    "compteRendu" TEXT,
    "lieu" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seances_mentorat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "planMinimum" "PlanType" NOT NULL DEFAULT 'STARTER',
    "actifParDefaut" BOOLEAN NOT NULL DEFAULT false,
    "payant" BOOLEAN NOT NULL DEFAULT false,
    "prixMensuel" DOUBLE PRECISION,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_activations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'ACTIF',
    "activeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desactiveAt" TIMESTAMP(3),
    "activeParId" TEXT,
    "desactiveParId" TEXT,
    "finEssaiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "module_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evenements_calendaires" (
    "id" TEXT NOT NULL,
    "anneeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evenements_calendaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendriers_officiels" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "anneeLibelle" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ministere',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendriers_officiels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historique_classes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "classeId" TEXT,
    "dateEntree" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateSortie" TIMESTAMP(3),
    "motif" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historique_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passages_infirmerie" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "motif" TEXT NOT NULL,
    "soin" TEXT,
    "suite" TEXT NOT NULL,
    "retourCours" BOOLEAN NOT NULL DEFAULT true,
    "dureeMin" INTEGER,
    "infirmierId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passages_infirmerie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiches_sanitaires" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "allergies" TEXT[],
    "traitements" JSONB,
    "contreIndicationsSport" BOOLEAN NOT NULL DEFAULT false,
    "contactsUrgence" JSONB,
    "protocoleUrgence" TEXT,
    "vaccinations" JSONB,
    "remarques" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiches_sanitaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "echeanciers" (
    "id" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "nbEcheances" INTEGER NOT NULL,
    "intervalleJours" INTEGER NOT NULL DEFAULT 30,
    "datePremiereEcheance" TIMESTAMP(3) NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'ACTIF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "echeanciers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "echeances_paiement" (
    "id" TEXT NOT NULL,
    "echeancierId" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'DJF',
    "dateEcheance" TIMESTAMP(3) NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "paiementId" TEXT,
    "payeeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "echeances_paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "learnos_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_chapitres" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "country" TEXT,
    "siteId" TEXT,
    "matiereId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "niveau" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_chapitres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_competences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "country" TEXT,
    "siteId" TEXT,
    "chapitreId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "description" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_competences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_evaluation_competences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "evaluationId" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "poids" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learnos_evaluation_competences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_learning_evidences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "competenceId" TEXT,
    "matiereId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "noteId" TEXT,
    "evaluationId" TEXT,
    "evidenceType" "EvidenceType" NOT NULL,
    "rawScore" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "masterySignal" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "errorType" "ErrorType",
    "errorConfidence" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learnos_learning_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_student_learning_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "masteryStatus" "MasteryStatus" NOT NULL DEFAULT 'UNKNOWN',
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "lastEvidenceAt" TIMESTAMP(3),
    "trend" TEXT NOT NULL DEFAULT 'indetermine',
    "errorPatterns" JSONB,
    "prerequisiteStatus" JSONB,
    "recommendedAction" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_student_learning_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_student_interventions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceRefs" TEXT[],
    "interventionType" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "responsibleUserId" TEXT,
    "status" "InterventionStatus" NOT NULL DEFAULT 'PROPOSED',
    "startDate" TIMESTAMP(3),
    "reviewDate" TIMESTAMP(3),
    "outcome" TEXT,
    "masteryBefore" DOUBLE PRECISION,
    "masteryAfter" DOUBLE PRECISION,
    "createdByAi" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_student_interventions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_seuils_recommandation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "niveau" TEXT,
    "matiereId" TEXT,
    "seuilCritique" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    "seuilFragile" DOUBLE PRECISION NOT NULL DEFAULT 0.55,
    "seuilConsolide" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "seuilAvance" DOUBLE PRECISION NOT NULL DEFAULT 0.92,
    "confianceMinimale" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "prerequisBloquantsMin" INTEGER NOT NULL DEFAULT 2,
    "declenchementPlanCritiques" INTEGER NOT NULL DEFAULT 2,
    "declenchementPlanAvances" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_seuils_recommandation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_recommandations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "niveau" "NiveauRecommandation" NOT NULL,
    "statut" "StatutRecommandation" NOT NULL,
    "motif" TEXT NOT NULL,
    "actionProposee" TEXT NOT NULL,
    "regleDeclenchee" TEXT NOT NULL,
    "motifParams" JSONB,
    "prerequisManquants" JSONB,
    "competencesBloquees" INTEGER NOT NULL DEFAULT 0,
    "decideParId" TEXT,
    "decideeLe" TIMESTAMP(3),
    "resolueLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_recommandations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_planification_chapitres" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "anneeId" TEXT NOT NULL,
    "chapitreId" TEXT NOT NULL,
    "classeId" TEXT,
    "semaineDebut" INTEGER NOT NULL,
    "semaineFin" INTEGER NOT NULL,
    "heuresPrevues" INTEGER,
    "semaineDebutInitiale" INTEGER,
    "semaineFinInitiale" INTEGER,
    "statut" TEXT NOT NULL DEFAULT 'PREVU',
    "demarreLe" TIMESTAMP(3),
    "traiteLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_planification_chapitres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_planification_competences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "anneeId" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "classeId" TEXT,
    "semaineDebut" INTEGER NOT NULL,
    "semaineFin" INTEGER NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'PREVU',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_planification_competences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_plans_progression" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "matiereId" TEXT,
    "type" TEXT NOT NULL,
    "origine" TEXT NOT NULL DEFAULT 'automatique',
    "statut" "StatutPlan" NOT NULL DEFAULT 'PROPOSE',
    "motif" TEXT NOT NULL,
    "regleDeclenchee" TEXT NOT NULL,
    "motifParams" JSONB,
    "responsableUserId" TEXT,
    "valideParId" TEXT,
    "valideLe" TIMESTAMP(3),
    "dateDebut" TIMESTAMP(3),
    "dateRevue" TIMESTAMP(3),
    "dateFin" TIMESTAMP(3),
    "parentInforme" BOOLEAN NOT NULL DEFAULT false,
    "masteryAvant" DOUBLE PRECISION,
    "masteryApres" DOUBLE PRECISION,
    "resultat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_plans_progression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_etapes_plan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "responsable" TEXT NOT NULL DEFAULT 'enseignant',
    "echeance" TIMESTAMP(3),
    "statut" "StatutEtape" NOT NULL DEFAULT 'A_FAIRE',
    "evaluationJalonId" TEXT,
    "evidenceValidanteId" TEXT,
    "valideeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_etapes_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_ai_decision_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "inputRef" TEXT,
    "output" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "providerName" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learnos_ai_decision_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_kpi_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "role" TEXT NOT NULL,
    "kpiKey" TEXT NOT NULL,
    "valeur" DOUBLE PRECISION NOT NULL,
    "cible" DOUBLE PRECISION,
    "periode" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learnos_kpi_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_questions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "country" TEXT,
    "siteId" TEXT,
    "competenceId" TEXT NOT NULL,
    "palier" "PalierExercice" NOT NULL,
    "enonce" TEXT NOT NULL,
    "corrige" TEXT,
    "format" "FormatQuestion" NOT NULL DEFAULT 'SAISIE_LIBRE',
    "structure" JSONB,
    "bareme" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "origine" TEXT NOT NULL DEFAULT 'humain',
    "relueParId" TEXT,
    "relueLe" TIMESTAMP(3),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_feuilles_exercices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "matiereId" TEXT,
    "type" TEXT NOT NULL,
    "statut" "StatutFeuille" NOT NULL DEFAULT 'ASSIGNEE',
    "etapePlanId" TEXT,
    "competenceAttesteeId" TEXT,
    "valideParId" TEXT,
    "valideeLe" TIMESTAMP(3),
    "assigneeLe" TIMESTAMP(3),
    "termineeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_feuilles_exercices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_exercices_assignes" (
    "id" TEXT NOT NULL,
    "feuilleId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "competenceViseeId" TEXT,
    "ordre" INTEGER NOT NULL,
    "palier" "PalierExercice" NOT NULL,
    "regleDeclenchee" TEXT NOT NULL,
    "motifParams" JSONB,
    "priorite" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learnos_exercices_assignes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_exercices_reponses" (
    "id" TEXT NOT NULL,
    "exerciceAssigneId" TEXT NOT NULL,
    "reponse" TEXT,
    "etapes" JSONB,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "dureeMs" INTEGER,
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "corrigeParId" TEXT,
    "corrigeeLe" TIMESTAMP(3),
    "evidenceId" TEXT,
    "repondueLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_exercices_reponses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_ai_cache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learnos_ai_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_preferences_parent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "langue" TEXT,
    "alertesActives" BOOLEAN NOT NULL DEFAULT true,
    "niveauMinimal" "NiveauAlerteParent" NOT NULL DEFAULT 'INFO',
    "plafondHebdomadaire" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_preferences_parent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_alertes_parent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "niveau" "NiveauAlerteParent" NOT NULL,
    "cle" TEXT NOT NULL,
    "params" JSONB,
    "canal" TEXT NOT NULL DEFAULT 'whatsapp',
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "motifSuppression" TEXT,
    "envoyeeLe" TIMESTAMP(3),
    "erreur" TEXT,
    "empreinte" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_alertes_parent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_echanges_parent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "parentId" TEXT NOT NULL,
    "eleveId" TEXT,
    "canal" TEXT NOT NULL DEFAULT 'whatsapp',
    "question" TEXT NOT NULL,
    "intention" TEXT NOT NULL,
    "reponse" TEXT NOT NULL,
    "modele" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learnos_echanges_parent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_patterns_pedago" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "niveau" TEXT NOT NULL,
    "matiereId" TEXT,
    "competenceId" TEXT,
    "masteryMoyenne" DOUBLE PRECISION NOT NULL,
    "confidenceMoyenne" DOUBLE PRECISION NOT NULL,
    "effectif" INTEGER NOT NULL,
    "ecartType" DOUBLE PRECISION NOT NULL,
    "tauxEchec" DOUBLE PRECISION NOT NULL,
    "periodeDebut" TIMESTAMP(3) NOT NULL,
    "periodeFin" TIMESTAMP(3) NOT NULL,
    "anneesCouvertes" INTEGER NOT NULL,
    "semaineChapitre" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_patterns_pedago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_predictions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "chapitreId" TEXT,
    "anneeId" TEXT NOT NULL,
    "probaReussite" DOUBLE PRECISION NOT NULL,
    "difficultePredite" TEXT NOT NULL,
    "masteryAvant" DOUBLE PRECISION,
    "confidenceAvant" DOUBLE PRECISION,
    "prerequisManquants" INTEGER,
    "masteryApres" DOUBLE PRECISION,
    "predictionCorrecte" BOOLEAN,
    "ecart" DOUBLE PRECISION,
    "emiseLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifieeLe" TIMESTAMP(3),

    CONSTRAINT "learnos_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_calibration_seuils" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "niveau" TEXT NOT NULL,
    "matiereId" TEXT,
    "seuilCritique" DOUBLE PRECISION NOT NULL,
    "seuilFragile" DOUBLE PRECISION NOT NULL,
    "seuilConsolide" DOUBLE PRECISION NOT NULL,
    "seuilAvance" DOUBLE PRECISION NOT NULL,
    "confianceMinimale" DOUBLE PRECISION NOT NULL,
    "echantillon" INTEGER NOT NULL,
    "ameliorationMesuree" BOOLEAN,
    "gainPrecision" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_calibration_seuils_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_journal_apprentissage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "typeAnalyse" TEXT NOT NULL,
    "resume" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "echantillon" INTEGER NOT NULL,
    "perimetre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learnos_journal_apprentissage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devoirs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "classeId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "enseignantId" TEXT,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "dateDonne" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateRendu" TIMESTAMP(3) NOT NULL,
    "statut" "StatutDevoir" NOT NULL DEFAULT 'A_FAIRE',
    "seanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devoirs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seances_pedagogiques" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "classeId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "enseignantId" TEXT,
    "chapitreId" TEXT,
    "planificationId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "dureePrevue" INTEGER NOT NULL DEFAULT 60,
    "dureeReelle" INTEGER,
    "statut" "StatutSeance" NOT NULL DEFAULT 'PLANIFIEE',
    "semaine" INTEGER NOT NULL,
    "contenu" TEXT,
    "rythme" TEXT NOT NULL DEFAULT 'NON_EVALUEE',
    "presents" INTEGER,
    "absents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seances_pedagogiques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seances_competences" (
    "id" TEXT NOT NULL,
    "seanceId" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "niveau" TEXT NOT NULL DEFAULT 'ABORDEE',

    CONSTRAINT "seances_competences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remplacements_cours" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "emploiTempsId" TEXT,
    "classeId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "enseignantAbsentId" TEXT,
    "enseignantRemplacantId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "salle" TEXT,
    "statut" "StatutRemplacement" NOT NULL DEFAULT 'PROPOSE',
    "motifAbsence" TEXT,
    "notes" TEXT,
    "decideParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remplacements_cours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entretiens_conseiller" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "conseillerId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motif" TEXT NOT NULL,
    "compteRendu" TEXT,
    "decisions" TEXT,
    "suivi" TEXT,
    "statut" "StatutEntretien" NOT NULL DEFAULT 'PLANIFIE',
    "prochainRendezVous" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entretiens_conseiller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demandes_lien_parent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "matriculeSaisi" TEXT NOT NULL,
    "dateNaissanceSaisie" TIMESTAMP(3) NOT NULL,
    "statut" "StatutDemandeLien" NOT NULL DEFAULT 'EN_ATTENTE',
    "traitePar" TEXT,
    "traiteLe" TIMESTAMP(3),
    "motifRefus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demandes_lien_parent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_plans_lecon" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "competenceId" TEXT NOT NULL,
    "niveauScolaire" TEXT NOT NULL,
    "dureeTotale" INTEGER NOT NULL,
    "titre" TEXT NOT NULL,
    "objectifs" TEXT NOT NULL,
    "etapes" TEXT NOT NULL,
    "materiel" TEXT,
    "evaluation" TEXT,
    "differentiation" TEXT,
    "statut" "StatutPropositionIa" NOT NULL DEFAULT 'PROPOSE',
    "proposeParId" TEXT,
    "ajusteParId" TEXT,
    "ajusteLe" TIMESTAMP(3),
    "valideParId" TEXT,
    "valideLe" TIMESTAMP(3),
    "motifRejet" TEXT,
    "modeleIa" TEXT,
    "cachedIa" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_plans_lecon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnos_rubriques_evaluation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "competenceId" TEXT NOT NULL,
    "niveauScolaire" TEXT NOT NULL,
    "totalPoints" INTEGER NOT NULL,
    "titre" TEXT NOT NULL,
    "criteres" TEXT NOT NULL,
    "statut" "StatutPropositionIa" NOT NULL DEFAULT 'PROPOSE',
    "proposeParId" TEXT,
    "ajusteParId" TEXT,
    "ajusteLe" TIMESTAMP(3),
    "valideParId" TEXT,
    "valideLe" TIMESTAMP(3),
    "motifRejet" TEXT,
    "modeleIa" TEXT,
    "cachedIa" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_rubriques_evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "assigneeAId" TEXT NOT NULL,
    "creeParId" TEXT,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'autre',
    "priorite" "PrioriteTache" NOT NULL DEFAULT 'NORMALE',
    "statut" "StatutTache" NOT NULL DEFAULT 'A_FAIRE',
    "classeId" TEXT,
    "matiereId" TEXT,
    "echeance" TIMESTAMP(3),
    "dateFaite" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CompetencePrerequis" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CompetencePrerequis_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "sync_configs_tenantId_key" ON "sync_configs"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "sync_configs_apiKey_key" ON "sync_configs"("apiKey");

-- CreateIndex
CREATE INDEX "conseils_tenantId_idx" ON "conseils"("tenantId");

-- CreateIndex
CREATE INDEX "membres_conseil_conseilId_idx" ON "membres_conseil"("conseilId");

-- CreateIndex
CREATE INDEX "membres_conseil_userId_idx" ON "membres_conseil"("userId");

-- CreateIndex
CREATE INDEX "reunions_conseilId_idx" ON "reunions"("conseilId");

-- CreateIndex
CREATE INDEX "reunions_date_idx" ON "reunions"("date");

-- CreateIndex
CREATE INDEX "resolutions_tenantId_idx" ON "resolutions"("tenantId");

-- CreateIndex
CREATE INDEX "resolutions_conseilId_idx" ON "resolutions"("conseilId");

-- CreateIndex
CREATE INDEX "mentorats_tenantId_idx" ON "mentorats"("tenantId");

-- CreateIndex
CREATE INDEX "mentorats_mentorId_idx" ON "mentorats"("mentorId");

-- CreateIndex
CREATE INDEX "mentorats_mentoreId_idx" ON "mentorats"("mentoreId");

-- CreateIndex
CREATE UNIQUE INDEX "mentorats_mentorId_mentoreId_key" ON "mentorats"("mentorId", "mentoreId");

-- CreateIndex
CREATE INDEX "objectifs_mentorat_mentoratId_idx" ON "objectifs_mentorat"("mentoratId");

-- CreateIndex
CREATE INDEX "seances_mentorat_mentoratId_idx" ON "seances_mentorat"("mentoratId");

-- CreateIndex
CREATE INDEX "seances_mentorat_date_idx" ON "seances_mentorat"("date");

-- CreateIndex
CREATE UNIQUE INDEX "modules_code_key" ON "modules"("code");

-- CreateIndex
CREATE INDEX "module_activations_tenantId_idx" ON "module_activations"("tenantId");

-- CreateIndex
CREATE INDEX "module_activations_moduleId_idx" ON "module_activations"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "module_activations_tenantId_moduleId_key" ON "module_activations"("tenantId", "moduleId");

-- CreateIndex
CREATE INDEX "evenements_calendaires_anneeId_idx" ON "evenements_calendaires"("anneeId");

-- CreateIndex
CREATE INDEX "evenements_calendaires_anneeId_type_idx" ON "evenements_calendaires"("anneeId", "type");

-- CreateIndex
CREATE INDEX "calendriers_officiels_country_anneeLibelle_idx" ON "calendriers_officiels"("country", "anneeLibelle");

-- CreateIndex
CREATE INDEX "calendriers_officiels_country_anneeLibelle_type_idx" ON "calendriers_officiels"("country", "anneeLibelle", "type");

-- CreateIndex
CREATE INDEX "user_roles_tenantId_idx" ON "user_roles"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_tenantId_role_key" ON "user_roles"("userId", "tenantId", "role");

-- CreateIndex
CREATE INDEX "historique_classes_tenantId_idx" ON "historique_classes"("tenantId");

-- CreateIndex
CREATE INDEX "historique_classes_eleveId_idx" ON "historique_classes"("eleveId");

-- CreateIndex
CREATE INDEX "historique_classes_classeId_idx" ON "historique_classes"("classeId");

-- CreateIndex
CREATE INDEX "passages_infirmerie_tenantId_idx" ON "passages_infirmerie"("tenantId");

-- CreateIndex
CREATE INDEX "passages_infirmerie_eleveId_idx" ON "passages_infirmerie"("eleveId");

-- CreateIndex
CREATE INDEX "passages_infirmerie_siteId_idx" ON "passages_infirmerie"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "fiches_sanitaires_eleveId_key" ON "fiches_sanitaires"("eleveId");

-- CreateIndex
CREATE INDEX "fiches_sanitaires_tenantId_idx" ON "fiches_sanitaires"("tenantId");

-- CreateIndex
CREATE INDEX "fiches_sanitaires_eleveId_idx" ON "fiches_sanitaires"("eleveId");

-- CreateIndex
CREATE UNIQUE INDEX "echeanciers_factureId_key" ON "echeanciers"("factureId");

-- CreateIndex
CREATE INDEX "echeanciers_factureId_idx" ON "echeanciers"("factureId");

-- CreateIndex
CREATE UNIQUE INDEX "echeances_paiement_paiementId_key" ON "echeances_paiement"("paiementId");

-- CreateIndex
CREATE INDEX "echeances_paiement_echeancierId_idx" ON "echeances_paiement"("echeancierId");

-- CreateIndex
CREATE INDEX "echeances_paiement_factureId_idx" ON "echeances_paiement"("factureId");

-- CreateIndex
CREATE INDEX "echeances_paiement_dateEcheance_idx" ON "echeances_paiement"("dateEcheance");

-- CreateIndex
CREATE UNIQUE INDEX "echeances_paiement_echeancierId_numero_key" ON "echeances_paiement"("echeancierId", "numero");

-- CreateIndex
CREATE INDEX "learnos_events_tenantId_idx" ON "learnos_events"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_events_siteId_idx" ON "learnos_events"("siteId");

-- CreateIndex
CREATE INDEX "learnos_events_processedAt_occurredAt_idx" ON "learnos_events"("processedAt", "occurredAt");

-- CreateIndex
CREATE INDEX "learnos_events_aggregateType_aggregateId_idx" ON "learnos_events"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "learnos_chapitres_tenantId_idx" ON "learnos_chapitres"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_chapitres_country_idx" ON "learnos_chapitres"("country");

-- CreateIndex
CREATE INDEX "learnos_chapitres_siteId_idx" ON "learnos_chapitres"("siteId");

-- CreateIndex
CREATE INDEX "learnos_chapitres_matiereId_idx" ON "learnos_chapitres"("matiereId");

-- CreateIndex
CREATE INDEX "learnos_competences_tenantId_idx" ON "learnos_competences"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_competences_country_idx" ON "learnos_competences"("country");

-- CreateIndex
CREATE INDEX "learnos_competences_siteId_idx" ON "learnos_competences"("siteId");

-- CreateIndex
CREATE INDEX "learnos_competences_chapitreId_idx" ON "learnos_competences"("chapitreId");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_competences_tenantId_code_key" ON "learnos_competences"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_competences_country_code_key" ON "learnos_competences"("country", "code");

-- CreateIndex
CREATE INDEX "learnos_evaluation_competences_tenantId_idx" ON "learnos_evaluation_competences"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_evaluation_competences_siteId_idx" ON "learnos_evaluation_competences"("siteId");

-- CreateIndex
CREATE INDEX "learnos_evaluation_competences_competenceId_idx" ON "learnos_evaluation_competences"("competenceId");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_evaluation_competences_evaluationId_competenceId_key" ON "learnos_evaluation_competences"("evaluationId", "competenceId");

-- CreateIndex
CREATE INDEX "learnos_learning_evidences_tenantId_idx" ON "learnos_learning_evidences"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_learning_evidences_siteId_idx" ON "learnos_learning_evidences"("siteId");

-- CreateIndex
CREATE INDEX "learnos_learning_evidences_eleveId_competenceId_idx" ON "learnos_learning_evidences"("eleveId", "competenceId");

-- CreateIndex
CREATE INDEX "learnos_learning_evidences_sourceType_sourceId_idx" ON "learnos_learning_evidences"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "learnos_student_learning_profiles_tenantId_idx" ON "learnos_student_learning_profiles"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_student_learning_profiles_siteId_idx" ON "learnos_student_learning_profiles"("siteId");

-- CreateIndex
CREATE INDEX "learnos_student_learning_profiles_competenceId_masteryStatu_idx" ON "learnos_student_learning_profiles"("competenceId", "masteryStatus");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_student_learning_profiles_eleveId_competenceId_key" ON "learnos_student_learning_profiles"("eleveId", "competenceId");

-- CreateIndex
CREATE INDEX "learnos_student_interventions_tenantId_idx" ON "learnos_student_interventions"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_student_interventions_siteId_idx" ON "learnos_student_interventions"("siteId");

-- CreateIndex
CREATE INDEX "learnos_student_interventions_eleveId_status_idx" ON "learnos_student_interventions"("eleveId", "status");

-- CreateIndex
CREATE INDEX "learnos_seuils_recommandation_tenantId_idx" ON "learnos_seuils_recommandation"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_seuils_recommandation_siteId_idx" ON "learnos_seuils_recommandation"("siteId");

-- CreateIndex
CREATE INDEX "learnos_recommandations_tenantId_idx" ON "learnos_recommandations"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_recommandations_siteId_idx" ON "learnos_recommandations"("siteId");

-- CreateIndex
CREATE INDEX "learnos_recommandations_competenceId_idx" ON "learnos_recommandations"("competenceId");

-- CreateIndex
CREATE INDEX "learnos_recommandations_niveau_statut_idx" ON "learnos_recommandations"("niveau", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_recommandations_eleveId_competenceId_key" ON "learnos_recommandations"("eleveId", "competenceId");

-- CreateIndex
CREATE INDEX "learnos_planification_chapitres_tenantId_idx" ON "learnos_planification_chapitres"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_planification_chapitres_siteId_idx" ON "learnos_planification_chapitres"("siteId");

-- CreateIndex
CREATE INDEX "learnos_planification_chapitres_anneeId_semaineDebut_idx" ON "learnos_planification_chapitres"("anneeId", "semaineDebut");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_planification_chapitres_anneeId_chapitreId_classeId_key" ON "learnos_planification_chapitres"("anneeId", "chapitreId", "classeId");

-- CreateIndex
CREATE INDEX "learnos_planification_competences_tenantId_idx" ON "learnos_planification_competences"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_planification_competences_siteId_idx" ON "learnos_planification_competences"("siteId");

-- CreateIndex
CREATE INDEX "learnos_planification_competences_anneeId_semaineDebut_idx" ON "learnos_planification_competences"("anneeId", "semaineDebut");

-- CreateIndex
CREATE INDEX "learnos_planification_competences_competenceId_idx" ON "learnos_planification_competences"("competenceId");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_planification_competences_anneeId_competenceId_clas_key" ON "learnos_planification_competences"("anneeId", "competenceId", "classeId");

-- CreateIndex
CREATE INDEX "learnos_plans_progression_tenantId_idx" ON "learnos_plans_progression"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_plans_progression_siteId_idx" ON "learnos_plans_progression"("siteId");

-- CreateIndex
CREATE INDEX "learnos_plans_progression_eleveId_statut_idx" ON "learnos_plans_progression"("eleveId", "statut");

-- CreateIndex
CREATE INDEX "learnos_plans_progression_eleveId_matiereId_statut_idx" ON "learnos_plans_progression"("eleveId", "matiereId", "statut");

-- CreateIndex
CREATE INDEX "learnos_etapes_plan_planId_idx" ON "learnos_etapes_plan"("planId");

-- CreateIndex
CREATE INDEX "learnos_etapes_plan_competenceId_idx" ON "learnos_etapes_plan"("competenceId");

-- CreateIndex
CREATE INDEX "learnos_ai_decision_logs_tenantId_idx" ON "learnos_ai_decision_logs"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_ai_decision_logs_siteId_idx" ON "learnos_ai_decision_logs"("siteId");

-- CreateIndex
CREATE INDEX "learnos_ai_decision_logs_action_idx" ON "learnos_ai_decision_logs"("action");

-- CreateIndex
CREATE INDEX "learnos_ai_decision_logs_inputRef_idx" ON "learnos_ai_decision_logs"("inputRef");

-- CreateIndex
CREATE INDEX "learnos_kpi_snapshots_tenantId_role_idx" ON "learnos_kpi_snapshots"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_kpi_snapshots_tenantId_siteId_role_kpiKey_periode_key" ON "learnos_kpi_snapshots"("tenantId", "siteId", "role", "kpiKey", "periode");

-- CreateIndex
CREATE INDEX "learnos_questions_tenantId_idx" ON "learnos_questions"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_questions_country_idx" ON "learnos_questions"("country");

-- CreateIndex
CREATE INDEX "learnos_questions_siteId_idx" ON "learnos_questions"("siteId");

-- CreateIndex
CREATE INDEX "learnos_questions_competenceId_palier_actif_idx" ON "learnos_questions"("competenceId", "palier", "actif");

-- CreateIndex
CREATE INDEX "learnos_feuilles_exercices_tenantId_idx" ON "learnos_feuilles_exercices"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_feuilles_exercices_siteId_idx" ON "learnos_feuilles_exercices"("siteId");

-- CreateIndex
CREATE INDEX "learnos_feuilles_exercices_eleveId_statut_idx" ON "learnos_feuilles_exercices"("eleveId", "statut");

-- CreateIndex
CREATE INDEX "learnos_exercices_assignes_feuilleId_idx" ON "learnos_exercices_assignes"("feuilleId");

-- CreateIndex
CREATE INDEX "learnos_exercices_assignes_competenceId_idx" ON "learnos_exercices_assignes"("competenceId");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_exercices_reponses_exerciceAssigneId_key" ON "learnos_exercices_reponses"("exerciceAssigneId");

-- CreateIndex
CREATE INDEX "learnos_exercices_reponses_evidenceId_idx" ON "learnos_exercices_reponses"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_ai_cache_cacheKey_key" ON "learnos_ai_cache"("cacheKey");

-- CreateIndex
CREATE INDEX "learnos_ai_cache_expiresAt_idx" ON "learnos_ai_cache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_preferences_parent_parentId_key" ON "learnos_preferences_parent"("parentId");

-- CreateIndex
CREATE INDEX "learnos_preferences_parent_tenantId_idx" ON "learnos_preferences_parent"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_alertes_parent_empreinte_key" ON "learnos_alertes_parent"("empreinte");

-- CreateIndex
CREATE INDEX "learnos_alertes_parent_tenantId_idx" ON "learnos_alertes_parent"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_alertes_parent_siteId_idx" ON "learnos_alertes_parent"("siteId");

-- CreateIndex
CREATE INDEX "learnos_alertes_parent_parentId_createdAt_idx" ON "learnos_alertes_parent"("parentId", "createdAt");

-- CreateIndex
CREATE INDEX "learnos_alertes_parent_statut_idx" ON "learnos_alertes_parent"("statut");

-- CreateIndex
CREATE INDEX "learnos_echanges_parent_tenantId_idx" ON "learnos_echanges_parent"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_echanges_parent_siteId_idx" ON "learnos_echanges_parent"("siteId");

-- CreateIndex
CREATE INDEX "learnos_echanges_parent_parentId_createdAt_idx" ON "learnos_echanges_parent"("parentId", "createdAt");

-- CreateIndex
CREATE INDEX "learnos_patterns_pedago_tenantId_niveau_matiereId_idx" ON "learnos_patterns_pedago"("tenantId", "niveau", "matiereId");

-- CreateIndex
CREATE INDEX "learnos_patterns_pedago_competenceId_idx" ON "learnos_patterns_pedago"("competenceId");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_patterns_pedago_tenantId_siteId_niveau_matiereId_co_key" ON "learnos_patterns_pedago"("tenantId", "siteId", "niveau", "matiereId", "competenceId", "periodeDebut");

-- CreateIndex
CREATE INDEX "learnos_predictions_tenantId_anneeId_idx" ON "learnos_predictions"("tenantId", "anneeId");

-- CreateIndex
CREATE INDEX "learnos_predictions_eleveId_competenceId_idx" ON "learnos_predictions"("eleveId", "competenceId");

-- CreateIndex
CREATE INDEX "learnos_predictions_competenceId_anneeId_idx" ON "learnos_predictions"("competenceId", "anneeId");

-- CreateIndex
CREATE INDEX "learnos_calibration_seuils_tenantId_niveau_idx" ON "learnos_calibration_seuils"("tenantId", "niveau");

-- CreateIndex
CREATE UNIQUE INDEX "learnos_calibration_seuils_tenantId_siteId_niveau_matiereId_key" ON "learnos_calibration_seuils"("tenantId", "siteId", "niveau", "matiereId");

-- CreateIndex
CREATE INDEX "learnos_journal_apprentissage_tenantId_typeAnalyse_createdA_idx" ON "learnos_journal_apprentissage"("tenantId", "typeAnalyse", "createdAt");

-- CreateIndex
CREATE INDEX "devoirs_tenantId_idx" ON "devoirs"("tenantId");

-- CreateIndex
CREATE INDEX "devoirs_classeId_dateRendu_idx" ON "devoirs"("classeId", "dateRendu");

-- CreateIndex
CREATE INDEX "devoirs_matiereId_idx" ON "devoirs"("matiereId");

-- CreateIndex
CREATE INDEX "devoirs_siteId_idx" ON "devoirs"("siteId");

-- CreateIndex
CREATE INDEX "seances_pedagogiques_tenantId_idx" ON "seances_pedagogiques"("tenantId");

-- CreateIndex
CREATE INDEX "seances_pedagogiques_siteId_idx" ON "seances_pedagogiques"("siteId");

-- CreateIndex
CREATE INDEX "seances_pedagogiques_classeId_date_idx" ON "seances_pedagogiques"("classeId", "date");

-- CreateIndex
CREATE INDEX "seances_pedagogiques_matiereId_idx" ON "seances_pedagogiques"("matiereId");

-- CreateIndex
CREATE INDEX "seances_pedagogiques_semaine_idx" ON "seances_pedagogiques"("semaine");

-- CreateIndex
CREATE INDEX "seances_pedagogiques_statut_idx" ON "seances_pedagogiques"("statut");

-- CreateIndex
CREATE INDEX "seances_competences_seanceId_idx" ON "seances_competences"("seanceId");

-- CreateIndex
CREATE INDEX "seances_competences_competenceId_idx" ON "seances_competences"("competenceId");

-- CreateIndex
CREATE UNIQUE INDEX "seances_competences_seanceId_competenceId_key" ON "seances_competences"("seanceId", "competenceId");

-- CreateIndex
CREATE INDEX "remplacements_cours_tenantId_idx" ON "remplacements_cours"("tenantId");

-- CreateIndex
CREATE INDEX "remplacements_cours_date_idx" ON "remplacements_cours"("date");

-- CreateIndex
CREATE INDEX "remplacements_cours_classeId_idx" ON "remplacements_cours"("classeId");

-- CreateIndex
CREATE INDEX "remplacements_cours_siteId_idx" ON "remplacements_cours"("siteId");

-- CreateIndex
CREATE INDEX "entretiens_conseiller_tenantId_idx" ON "entretiens_conseiller"("tenantId");

-- CreateIndex
CREATE INDEX "entretiens_conseiller_eleveId_date_idx" ON "entretiens_conseiller"("eleveId", "date");

-- CreateIndex
CREATE INDEX "entretiens_conseiller_siteId_idx" ON "entretiens_conseiller"("siteId");

-- CreateIndex
CREATE INDEX "demandes_lien_parent_tenantId_idx" ON "demandes_lien_parent"("tenantId");

-- CreateIndex
CREATE INDEX "demandes_lien_parent_statut_idx" ON "demandes_lien_parent"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "demandes_lien_parent_parentId_eleveId_key" ON "demandes_lien_parent"("parentId", "eleveId");

-- CreateIndex
CREATE INDEX "learnos_plans_lecon_tenantId_idx" ON "learnos_plans_lecon"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_plans_lecon_siteId_idx" ON "learnos_plans_lecon"("siteId");

-- CreateIndex
CREATE INDEX "learnos_plans_lecon_competenceId_idx" ON "learnos_plans_lecon"("competenceId");

-- CreateIndex
CREATE INDEX "learnos_plans_lecon_statut_idx" ON "learnos_plans_lecon"("statut");

-- CreateIndex
CREATE INDEX "learnos_rubriques_evaluation_tenantId_idx" ON "learnos_rubriques_evaluation"("tenantId");

-- CreateIndex
CREATE INDEX "learnos_rubriques_evaluation_siteId_idx" ON "learnos_rubriques_evaluation"("siteId");

-- CreateIndex
CREATE INDEX "learnos_rubriques_evaluation_competenceId_idx" ON "learnos_rubriques_evaluation"("competenceId");

-- CreateIndex
CREATE INDEX "learnos_rubriques_evaluation_statut_idx" ON "learnos_rubriques_evaluation"("statut");

-- CreateIndex
CREATE INDEX "taches_tenantId_idx" ON "taches"("tenantId");

-- CreateIndex
CREATE INDEX "taches_siteId_idx" ON "taches"("siteId");

-- CreateIndex
CREATE INDEX "taches_assigneeAId_idx" ON "taches"("assigneeAId");

-- CreateIndex
CREATE INDEX "taches_statut_idx" ON "taches"("statut");

-- CreateIndex
CREATE INDEX "_CompetencePrerequis_B_index" ON "_CompetencePrerequis"("B");

-- CreateIndex
CREATE INDEX "annees_scolaires_tenantId_statut_idx" ON "annees_scolaires"("tenantId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_tenantId_siteId_annee_categorie_key" ON "budgets"("tenantId", "siteId", "annee", "categorie");

-- CreateIndex
CREATE INDEX "classes_deletedAt_idx" ON "classes"("deletedAt");

-- CreateIndex
CREATE INDEX "cours_country_idx" ON "cours"("country");

-- CreateIndex
CREATE INDEX "depenses_budgetId_idx" ON "depenses"("budgetId");

-- CreateIndex
CREATE INDEX "evenements_responsableId_idx" ON "evenements"("responsableId");

-- CreateIndex
CREATE INDEX "progressions_eleves_tenantId_idx" ON "progressions_eleves"("tenantId");

-- CreateIndex
CREATE INDEX "progressions_eleves_eleveId_idx" ON "progressions_eleves"("eleveId");

-- CreateIndex
CREATE INDEX "remises_caisse_receveurId_idx" ON "remises_caisse"("receveurId");

-- CreateIndex
CREATE INDEX "remises_caisse_statut_idx" ON "remises_caisse"("statut");

-- CreateIndex
CREATE INDEX "remises_caisse_dateRemise_idx" ON "remises_caisse"("dateRemise");

-- CreateIndex
CREATE INDEX "sanctions_type_dateRetourEffective_idx" ON "sanctions"("type", "dateRetourEffective");

-- CreateIndex
CREATE UNIQUE INDEX "structures_tenantId_siteId_type_key" ON "structures"("tenantId", "siteId", "type");

-- AddForeignKey
ALTER TABLE "sync_configs" ADD CONSTRAINT "sync_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conseils" ADD CONSTRAINT "conseils_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membres_conseil" ADD CONSTRAINT "membres_conseil_conseilId_fkey" FOREIGN KEY ("conseilId") REFERENCES "conseils"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membres_conseil" ADD CONSTRAINT "membres_conseil_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reunions" ADD CONSTRAINT "reunions_conseilId_fkey" FOREIGN KEY ("conseilId") REFERENCES "conseils"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_conseilId_fkey" FOREIGN KEY ("conseilId") REFERENCES "conseils"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorats" ADD CONSTRAINT "mentorats_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorats" ADD CONSTRAINT "mentorats_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorats" ADD CONSTRAINT "mentorats_mentoreId_fkey" FOREIGN KEY ("mentoreId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectifs_mentorat" ADD CONSTRAINT "objectifs_mentorat_mentoratId_fkey" FOREIGN KEY ("mentoratId") REFERENCES "mentorats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances_mentorat" ADD CONSTRAINT "seances_mentorat_mentoratId_fkey" FOREIGN KEY ("mentoratId") REFERENCES "mentorats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_activations" ADD CONSTRAINT "module_activations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_activations" ADD CONSTRAINT "module_activations_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenements_calendaires" ADD CONSTRAINT "evenements_calendaires_anneeId_fkey" FOREIGN KEY ("anneeId") REFERENCES "annees_scolaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historique_classes" ADD CONSTRAINT "historique_classes_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historique_classes" ADD CONSTRAINT "historique_classes_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passages_infirmerie" ADD CONSTRAINT "passages_infirmerie_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passages_infirmerie" ADD CONSTRAINT "passages_infirmerie_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passages_infirmerie" ADD CONSTRAINT "passages_infirmerie_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passages_infirmerie" ADD CONSTRAINT "passages_infirmerie_infirmierId_fkey" FOREIGN KEY ("infirmierId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiches_sanitaires" ADD CONSTRAINT "fiches_sanitaires_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiches_sanitaires" ADD CONSTRAINT "fiches_sanitaires_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiches_sanitaires" ADD CONSTRAINT "fiches_sanitaires_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examens" ADD CONSTRAINT "examens_feuilleExercicesId_fkey" FOREIGN KEY ("feuilleExercicesId") REFERENCES "learnos_feuilles_exercices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeanciers" ADD CONSTRAINT "echeanciers_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeances_paiement" ADD CONSTRAINT "echeances_paiement_echeancierId_fkey" FOREIGN KEY ("echeancierId") REFERENCES "echeanciers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeances_paiement" ADD CONSTRAINT "echeances_paiement_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeances_paiement" ADD CONSTRAINT "echeances_paiement_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenements" ADD CONSTRAINT "evenements_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resoluParId_fkey" FOREIGN KEY ("resoluParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_classeParId_fkey" FOREIGN KEY ("classeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_reintegreParId_fkey" FOREIGN KEY ("reintegreParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progressions_eleves" ADD CONSTRAINT "progressions_eleves_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progressions_eleves" ADD CONSTRAINT "progressions_eleves_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_events" ADD CONSTRAINT "learnos_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_events" ADD CONSTRAINT "learnos_events_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_chapitres" ADD CONSTRAINT "learnos_chapitres_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_chapitres" ADD CONSTRAINT "learnos_chapitres_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_chapitres" ADD CONSTRAINT "learnos_chapitres_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_competences" ADD CONSTRAINT "learnos_competences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_competences" ADD CONSTRAINT "learnos_competences_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_competences" ADD CONSTRAINT "learnos_competences_chapitreId_fkey" FOREIGN KEY ("chapitreId") REFERENCES "learnos_chapitres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_evaluation_competences" ADD CONSTRAINT "learnos_evaluation_competences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_evaluation_competences" ADD CONSTRAINT "learnos_evaluation_competences_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_evaluation_competences" ADD CONSTRAINT "learnos_evaluation_competences_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_evaluation_competences" ADD CONSTRAINT "learnos_evaluation_competences_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_learning_evidences" ADD CONSTRAINT "learnos_learning_evidences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_learning_evidences" ADD CONSTRAINT "learnos_learning_evidences_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_learning_evidences" ADD CONSTRAINT "learnos_learning_evidences_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_learning_evidences" ADD CONSTRAINT "learnos_learning_evidences_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_learning_evidences" ADD CONSTRAINT "learnos_learning_evidences_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_learning_evidences" ADD CONSTRAINT "learnos_learning_evidences_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_learning_evidences" ADD CONSTRAINT "learnos_learning_evidences_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_student_learning_profiles" ADD CONSTRAINT "learnos_student_learning_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_student_learning_profiles" ADD CONSTRAINT "learnos_student_learning_profiles_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_student_learning_profiles" ADD CONSTRAINT "learnos_student_learning_profiles_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_student_learning_profiles" ADD CONSTRAINT "learnos_student_learning_profiles_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_student_interventions" ADD CONSTRAINT "learnos_student_interventions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_student_interventions" ADD CONSTRAINT "learnos_student_interventions_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_student_interventions" ADD CONSTRAINT "learnos_student_interventions_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_student_interventions" ADD CONSTRAINT "learnos_student_interventions_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_student_interventions" ADD CONSTRAINT "learnos_student_interventions_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_seuils_recommandation" ADD CONSTRAINT "learnos_seuils_recommandation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_seuils_recommandation" ADD CONSTRAINT "learnos_seuils_recommandation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_seuils_recommandation" ADD CONSTRAINT "learnos_seuils_recommandation_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_recommandations" ADD CONSTRAINT "learnos_recommandations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_recommandations" ADD CONSTRAINT "learnos_recommandations_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_recommandations" ADD CONSTRAINT "learnos_recommandations_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_recommandations" ADD CONSTRAINT "learnos_recommandations_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_planification_chapitres" ADD CONSTRAINT "learnos_planification_chapitres_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_planification_chapitres" ADD CONSTRAINT "learnos_planification_chapitres_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_planification_chapitres" ADD CONSTRAINT "learnos_planification_chapitres_anneeId_fkey" FOREIGN KEY ("anneeId") REFERENCES "annees_scolaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_planification_chapitres" ADD CONSTRAINT "learnos_planification_chapitres_chapitreId_fkey" FOREIGN KEY ("chapitreId") REFERENCES "learnos_chapitres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_planification_chapitres" ADD CONSTRAINT "learnos_planification_chapitres_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_planification_competences" ADD CONSTRAINT "learnos_planification_competences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_planification_competences" ADD CONSTRAINT "learnos_planification_competences_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_planification_competences" ADD CONSTRAINT "learnos_planification_competences_anneeId_fkey" FOREIGN KEY ("anneeId") REFERENCES "annees_scolaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_planification_competences" ADD CONSTRAINT "learnos_planification_competences_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_planification_competences" ADD CONSTRAINT "learnos_planification_competences_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_plans_progression" ADD CONSTRAINT "learnos_plans_progression_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_plans_progression" ADD CONSTRAINT "learnos_plans_progression_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_plans_progression" ADD CONSTRAINT "learnos_plans_progression_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_plans_progression" ADD CONSTRAINT "learnos_plans_progression_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_plans_progression" ADD CONSTRAINT "learnos_plans_progression_responsableUserId_fkey" FOREIGN KEY ("responsableUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_etapes_plan" ADD CONSTRAINT "learnos_etapes_plan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "learnos_plans_progression"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_etapes_plan" ADD CONSTRAINT "learnos_etapes_plan_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_ai_decision_logs" ADD CONSTRAINT "learnos_ai_decision_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_ai_decision_logs" ADD CONSTRAINT "learnos_ai_decision_logs_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_kpi_snapshots" ADD CONSTRAINT "learnos_kpi_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_kpi_snapshots" ADD CONSTRAINT "learnos_kpi_snapshots_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_questions" ADD CONSTRAINT "learnos_questions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_questions" ADD CONSTRAINT "learnos_questions_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_questions" ADD CONSTRAINT "learnos_questions_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_feuilles_exercices" ADD CONSTRAINT "learnos_feuilles_exercices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_feuilles_exercices" ADD CONSTRAINT "learnos_feuilles_exercices_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_feuilles_exercices" ADD CONSTRAINT "learnos_feuilles_exercices_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_feuilles_exercices" ADD CONSTRAINT "learnos_feuilles_exercices_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_feuilles_exercices" ADD CONSTRAINT "learnos_feuilles_exercices_etapePlanId_fkey" FOREIGN KEY ("etapePlanId") REFERENCES "learnos_etapes_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_feuilles_exercices" ADD CONSTRAINT "learnos_feuilles_exercices_competenceAttesteeId_fkey" FOREIGN KEY ("competenceAttesteeId") REFERENCES "learnos_competences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_exercices_assignes" ADD CONSTRAINT "learnos_exercices_assignes_feuilleId_fkey" FOREIGN KEY ("feuilleId") REFERENCES "learnos_feuilles_exercices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_exercices_assignes" ADD CONSTRAINT "learnos_exercices_assignes_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "learnos_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_exercices_assignes" ADD CONSTRAINT "learnos_exercices_assignes_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_exercices_reponses" ADD CONSTRAINT "learnos_exercices_reponses_exerciceAssigneId_fkey" FOREIGN KEY ("exerciceAssigneId") REFERENCES "learnos_exercices_assignes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_preferences_parent" ADD CONSTRAINT "learnos_preferences_parent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_preferences_parent" ADD CONSTRAINT "learnos_preferences_parent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_alertes_parent" ADD CONSTRAINT "learnos_alertes_parent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_alertes_parent" ADD CONSTRAINT "learnos_alertes_parent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_alertes_parent" ADD CONSTRAINT "learnos_alertes_parent_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_alertes_parent" ADD CONSTRAINT "learnos_alertes_parent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_echanges_parent" ADD CONSTRAINT "learnos_echanges_parent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_echanges_parent" ADD CONSTRAINT "learnos_echanges_parent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_echanges_parent" ADD CONSTRAINT "learnos_echanges_parent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_echanges_parent" ADD CONSTRAINT "learnos_echanges_parent_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_patterns_pedago" ADD CONSTRAINT "learnos_patterns_pedago_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_patterns_pedago" ADD CONSTRAINT "learnos_patterns_pedago_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_patterns_pedago" ADD CONSTRAINT "learnos_patterns_pedago_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_predictions" ADD CONSTRAINT "learnos_predictions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_predictions" ADD CONSTRAINT "learnos_predictions_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_predictions" ADD CONSTRAINT "learnos_predictions_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_predictions" ADD CONSTRAINT "learnos_predictions_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_predictions" ADD CONSTRAINT "learnos_predictions_chapitreId_fkey" FOREIGN KEY ("chapitreId") REFERENCES "learnos_chapitres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_calibration_seuils" ADD CONSTRAINT "learnos_calibration_seuils_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_calibration_seuils" ADD CONSTRAINT "learnos_calibration_seuils_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_journal_apprentissage" ADD CONSTRAINT "learnos_journal_apprentissage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_journal_apprentissage" ADD CONSTRAINT "learnos_journal_apprentissage_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoirs" ADD CONSTRAINT "devoirs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoirs" ADD CONSTRAINT "devoirs_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoirs" ADD CONSTRAINT "devoirs_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoirs" ADD CONSTRAINT "devoirs_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoirs" ADD CONSTRAINT "devoirs_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "enseignants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "seances_competences" ADD CONSTRAINT "seances_competences_seanceId_fkey" FOREIGN KEY ("seanceId") REFERENCES "seances_pedagogiques"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances_competences" ADD CONSTRAINT "seances_competences_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remplacements_cours" ADD CONSTRAINT "remplacements_cours_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remplacements_cours" ADD CONSTRAINT "remplacements_cours_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remplacements_cours" ADD CONSTRAINT "remplacements_cours_emploiTempsId_fkey" FOREIGN KEY ("emploiTempsId") REFERENCES "emplois_temps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remplacements_cours" ADD CONSTRAINT "remplacements_cours_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remplacements_cours" ADD CONSTRAINT "remplacements_cours_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remplacements_cours" ADD CONSTRAINT "remplacements_cours_enseignantAbsentId_fkey" FOREIGN KEY ("enseignantAbsentId") REFERENCES "enseignants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remplacements_cours" ADD CONSTRAINT "remplacements_cours_enseignantRemplacantId_fkey" FOREIGN KEY ("enseignantRemplacantId") REFERENCES "enseignants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remplacements_cours" ADD CONSTRAINT "remplacements_cours_decideParId_fkey" FOREIGN KEY ("decideParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entretiens_conseiller" ADD CONSTRAINT "entretiens_conseiller_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entretiens_conseiller" ADD CONSTRAINT "entretiens_conseiller_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entretiens_conseiller" ADD CONSTRAINT "entretiens_conseiller_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entretiens_conseiller" ADD CONSTRAINT "entretiens_conseiller_conseillerId_fkey" FOREIGN KEY ("conseillerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_lien_parent" ADD CONSTRAINT "demandes_lien_parent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_lien_parent" ADD CONSTRAINT "demandes_lien_parent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_lien_parent" ADD CONSTRAINT "demandes_lien_parent_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_plans_lecon" ADD CONSTRAINT "learnos_plans_lecon_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_plans_lecon" ADD CONSTRAINT "learnos_plans_lecon_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_plans_lecon" ADD CONSTRAINT "learnos_plans_lecon_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_rubriques_evaluation" ADD CONSTRAINT "learnos_rubriques_evaluation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_rubriques_evaluation" ADD CONSTRAINT "learnos_rubriques_evaluation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnos_rubriques_evaluation" ADD CONSTRAINT "learnos_rubriques_evaluation_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_enregistreParId_fkey" FOREIGN KEY ("enregistreParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remises_caisse" ADD CONSTRAINT "remises_caisse_receveurId_fkey" FOREIGN KEY ("receveurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taches" ADD CONSTRAINT "taches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taches" ADD CONSTRAINT "taches_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taches" ADD CONSTRAINT "taches_assigneeAId_fkey" FOREIGN KEY ("assigneeAId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taches" ADD CONSTRAINT "taches_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taches" ADD CONSTRAINT "taches_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taches" ADD CONSTRAINT "taches_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompetencePrerequis" ADD CONSTRAINT "_CompetencePrerequis_A_fkey" FOREIGN KEY ("A") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompetencePrerequis" ADD CONSTRAINT "_CompetencePrerequis_B_fkey" FOREIGN KEY ("B") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

