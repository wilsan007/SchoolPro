-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'TENANT_ADMIN', 'PRINCIPAL', 'SECRETARY', 'TEACHER', 'CLASS_TEACHER', 'COUNSELOR', 'NURSE', 'ACCOUNTANT', 'CAISSIER', 'SUPERVISOR', 'SUBJECT_LEAD', 'SITE_MANAGER', 'INSPECTOR', 'PARENT', 'STUDENT');

-- CreateEnum
CREATE TYPE "StructureType" AS ENUM ('MATERNELLE', 'PRIMAIRE', 'COLLEGE', 'LYCEE');

-- CreateEnum
CREATE TYPE "Sexe" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "StatutEleve" AS ENUM ('ACTIF', 'TRANSFERE', 'DIPLOME', 'EXCLU', 'ABANDONNE');

-- CreateEnum
CREATE TYPE "LienParente" AS ENUM ('PERE', 'MERE', 'TUTEUR', 'AUTRE');

-- CreateEnum
CREATE TYPE "Jour" AS ENUM ('DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI');

-- CreateEnum
CREATE TYPE "MotifAbsence" AS ENUM ('INJUSTIFIE', 'MALADIE', 'FAMILIALE', 'TRANSPORT', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutAbsence" AS ENUM ('EN_ATTENTE', 'JUSTIFIEE', 'INJUSTIFIEE');

-- CreateEnum
CREATE TYPE "TypeNote" AS ENUM ('CONTROLE', 'DEVOIR', 'EXAMEN', 'INTERROGATION', 'PROJET', 'ORAL', 'TP');

-- CreateEnum
CREATE TYPE "StatutExamen" AS ENUM ('PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE');

-- CreateEnum
CREATE TYPE "StatutFacture" AS ENUM ('EN_ATTENTE', 'PAYEE', 'EN_RETARD', 'ANNULEE');

-- CreateEnum
CREATE TYPE "TypeIncident" AS ENUM ('RETARD', 'BAVARDAGE', 'INSOLENCE', 'BAGARRE', 'TRICHE', 'VANDALISM', 'ABSENTEISME', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutIncident" AS ENUM ('OUVERT', 'EN_TRAITEMENT', 'RESOLU', 'CLASSE');

-- CreateEnum
CREATE TYPE "TypeSanction" AS ENUM ('AVERTISSEMENT', 'BLAME', 'EXCLUSION_COURS', 'EXCLUSION_TEMP', 'CONVOCATION_PARENTS', 'TRAVAUX_INTERET_GENERAL', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypeRecommandation" AS ENUM ('FILIERE_SCIENTIFIQUE', 'FILIERE_LITTERAIRE', 'FILIERE_TECHNIQUE', 'FILIERE_PROFESSIONNELLE', 'REDOUBLEMENT', 'SOUTIEN_RENFORCE', 'EXCELLENTE_VOIE');

-- CreateEnum
CREATE TYPE "CanalNotification" AS ENUM ('EMAIL', 'SMS', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "StatutNotification" AS ENUM ('BROUILLON', 'PLANIFIEE', 'EN_ENVOI', 'ENVOYEE', 'ECHEC');

-- CreateEnum
CREATE TYPE "CibleNotification" AS ENUM ('TOUS', 'PARENTS', 'ENSEIGNANTS', 'ELEVES', 'CLASSE', 'NIVEAU');

-- CreateEnum
CREATE TYPE "TypeContrat" AS ENUM ('CDI', 'CDD', 'VACATAIRE', 'FONCTIONNAIRE', 'STAGIAIRE');

-- CreateEnum
CREATE TYPE "TypeAbsencePersonnel" AS ENUM ('ABSENCE', 'RETARD', 'MISSION', 'FORMATION', 'MALADIE', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutAbsencePersonnel" AS ENUM ('EN_ATTENTE', 'JUSTIFIEE', 'INJUSTIFIEE');

-- CreateEnum
CREATE TYPE "StatutConge" AS ENUM ('DEMANDE', 'APPROUVE', 'REFUSE', 'EN_COURS', 'TERMINE', 'ANNULE');

-- CreateEnum
CREATE TYPE "TypeConge" AS ENUM ('ANNUEL', 'MALADIE', 'SPECIAL', 'MATERNITE', 'PATERNITE', 'SANS_SOLDE', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutCandidature" AS ENUM ('SOUMISE', 'EN_EXAMEN', 'ADMIS', 'REFUSE', 'INSCRIT', 'ANNULE');

-- CreateEnum
CREATE TYPE "StatutAlumni" AS ENUM ('ETUDES_SUPERIEURES', 'EN_EMPLOI', 'RECHERCHE_EMPLOI', 'ENTREPRENEUR', 'INCONNU');

-- CreateEnum
CREATE TYPE "EtatItem" AS ENUM ('NEUF', 'BON', 'USE', 'ENDOMMAGE', 'HORS_SERVICE');

-- CreateEnum
CREATE TYPE "CategorieItem" AS ENUM ('INFORMATIQUE', 'MOBILIER', 'SPORTIF', 'PEDAGOGIQUE', 'AUDIOVISUEL', 'ENTRETIEN', 'SECURITE', 'AUTRE');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'CLASS_ANNOUNCEMENT', 'CLASS_DISCUSSION', 'ADMIN_BROADCAST', 'PARENT_TEACHER', 'PARENT_ADMIN', 'STAFF_GROUP', 'FREE');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('ADMIN', 'MEMBER', 'READONLY');

-- CreateEnum
CREATE TYPE "PlatformMobile" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "NiveauCours" AS ENUM ('DEBUTANT', 'INTERMEDIAIRE', 'AVANCE');

-- CreateEnum
CREATE TYPE "StatutCours" AS ENUM ('BROUILLON', 'PUBLIE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "TypeContenu" AS ENUM ('VIDEO', 'DOCUMENT', 'LIEN', 'TEXTE', 'QUIZ');

-- CreateEnum
CREATE TYPE "ContexteAppreciation" AS ENUM ('NOTE_MATIERE', 'BULLETIN_PERIODE', 'BULLETIN_ANNUEL', 'ABSENCE');

-- CreateEnum
CREATE TYPE "AuditVerdict" AS ENUM ('ALLOWED', 'DENIED');

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

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "logoUrl" TEXT,
    "plan" "PlanType" NOT NULL DEFAULT 'STARTER',
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "address" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'SN',
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "siret" TEXT,
    "currentYear" TEXT NOT NULL DEFAULT '2025-2026',
    "notationMax" INTEGER NOT NULL DEFAULT 20,
    "langue" TEXT NOT NULL DEFAULT 'fr',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Dakar',
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "signatureUrl" TEXT,
    "cachetUrl" TEXT,
    "chefEtablissement" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "code" TEXT,
    "adresse" TEXT,
    "ville" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deletedReason" TEXT,
    "scheduledPurgeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_deletion_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "siteNom" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "performedBy" TEXT NOT NULL,
    "performedByName" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "site_deletion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "role" "Role",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "user_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enseignant_sites" (
    "id" TEXT NOT NULL,
    "enseignantId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enseignant_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annees_scolaires" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "statut" TEXT NOT NULL DEFAULT 'OUVERTE',
    "cloturedAt" TIMESTAMP(3),
    "archiveeAt" TIMESTAMP(3),
    "cloturePar" TEXT,
    "archiveePar" TEXT,

    CONSTRAINT "annees_scolaires_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "periodes" (
    "id" TEXT NOT NULL,
    "anneeId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "statut" TEXT NOT NULL DEFAULT 'OUVERTE',
    "cloturedAt" TIMESTAMP(3),
    "dateLimiteSaisie" TIMESTAMP(3),

    CONSTRAINT "periodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "siteId" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "password" TEXT,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatarUrl" TEXT,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'TEACHER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpSecret" TEXT,
    "totpSecretIv" TEXT,
    "backupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "twoFactorVerifiedAt" TIMESTAMP(3),
    "langue" TEXT NOT NULL DEFAULT 'fr',
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "notifications" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tenants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_tenants_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "structures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "type" "StructureType" NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "structureId" TEXT,
    "nom" TEXT NOT NULL,
    "niveau" TEXT NOT NULL,
    "filiere" TEXT,
    "effectifMax" INTEGER NOT NULL DEFAULT 40,
    "annee" TEXT NOT NULL,
    "profPrincipalId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deletedReason" TEXT,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "matieres" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "nom" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "couleur" TEXT,
    "niveau" TEXT,

    CONSTRAINT "matieres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eleves" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "matricule" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "dateNaissance" TIMESTAMP(3) NOT NULL,
    "lieuNaissance" TEXT,
    "nationalite" TEXT DEFAULT 'SN',
    "sexe" "Sexe" NOT NULL DEFAULT 'M',
    "photoUrl" TEXT,
    "statut" "StatutEleve" NOT NULL DEFAULT 'ACTIF',
    "classeId" TEXT,
    "userId" TEXT,
    "groupeSanguin" TEXT,
    "allergies" TEXT,
    "besoinsSpeciaux" TEXT,
    "regime" TEXT,
    "transport" TEXT,
    "contactUrgenceNom" TEXT,
    "contactUrgencePhone" TEXT,
    "anneeInscription" TEXT NOT NULL,
    "numeroBoursier" TEXT,
    "dateInscription" TIMESTAMP(3),
    "dateSortie" TIMESTAMP(3),
    "motifSortie" TEXT,
    "identiteKey" TEXT,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "eleves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "phone2" TEXT,
    "telegramChatId" TEXT,
    "profession" TEXT,
    "adresse" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eleve_parents" (
    "eleveId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "lien" "LienParente" NOT NULL DEFAULT 'PERE',
    "isGardien" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "eleve_parents_pkey" PRIMARY KEY ("eleveId","parentId")
);

-- CreateTable
CREATE TABLE "enseignants" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matricule" TEXT,
    "specialite" TEXT,
    "typeContrat" TEXT,
    "dateEntree" TIMESTAMP(3),

    CONSTRAINT "enseignants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emplois_temps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "enseignantId" TEXT,
    "jour" "Jour" NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "salle" TEXT,
    "annee" TEXT NOT NULL,

    CONSTRAINT "emplois_temps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disponibilites_enseignants" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "enseignantId" TEXT NOT NULL,
    "jour" "Jour" NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,

    CONSTRAINT "disponibilites_enseignants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "nom" TEXT NOT NULL,
    "capacite" INTEGER NOT NULL DEFAULT 30,
    "type" TEXT,
    "batiment" TEXT,

    CONSTRAINT "salles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "heureDebut" TEXT,
    "heureFin" TEXT,
    "isRetard" BOOLEAN NOT NULL DEFAULT false,
    "motif" "MotifAbsence" NOT NULL DEFAULT 'INJUSTIFIE',
    "statut" "StatutAbsence" NOT NULL DEFAULT 'EN_ATTENTE',
    "justificatif" TEXT,
    "commentaire" TEXT,
    "saisieParId" TEXT,
    "parentNotifie" BOOLEAN NOT NULL DEFAULT false,
    "parentNotifieAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "type" "TypeNote" NOT NULL DEFAULT 'CONTROLE',
    "classeId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "duree" INTEGER NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "description" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'PLANIFIE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "periodeId" TEXT,
    "type" "TypeNote" NOT NULL DEFAULT 'CONTROLE',
    "intitule" TEXT,
    "valeur" DOUBLE PRECISION NOT NULL,
    "noteMax" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "coefficient" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "date" TIMESTAMP(3) NOT NULL,
    "appreciation" TEXT,
    "commentaire" TEXT,
    "saisieParId" TEXT,
    "isPubliee" BOOLEAN NOT NULL DEFAULT false,
    "evaluationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletins" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "moyenneGenerale" DOUBLE PRECISION,
    "moyenneClasse" DOUBLE PRECISION,
    "moyennePremier" DOUBLE PRECISION,
    "heuresAbsence" INTEGER DEFAULT 0,
    "rang" INTEGER,
    "effectifClasse" INTEGER,
    "appreciation" TEXT,
    "decision" TEXT,
    "isPublie" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulletins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletin_matieres" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bulletinId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "nomProfesseur" TEXT,
    "coefficient" DOUBLE PRECISION NOT NULL,
    "moyenneEleve" DOUBLE PRECISION,
    "rang" INTEGER,
    "moyenneMax" DOUBLE PRECISION,
    "moyenneMin" DOUBLE PRECISION,
    "appreciation" TEXT,

    CONSTRAINT "bulletin_matieres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examens" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "intitule" TEXT NOT NULL,
    "description" TEXT,
    "statut" "StatutExamen" NOT NULL DEFAULT 'PROGRAMME',
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "feuilleExercicesId" TEXT,

    CONSTRAINT "examens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions_examen" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "matiereNom" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "salle" TEXT,
    "surveillants" JSONB,
    "niveau" TEXT,

    CONSTRAINT "sessions_examen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'DJF',
    "statut" "StatutFacture" NOT NULL DEFAULT 'EN_ATTENTE',
    "echeance" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "factures_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "paiements" (
    "id" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'DJF',
    "methode" TEXT NOT NULL,
    "reference" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateSaisie" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recu" TEXT,
    "enregistreParId" TEXT,

    CONSTRAINT "paiements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarifs_niveau" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "niveau" TEXT NOT NULL,
    "annee" TEXT NOT NULL,
    "mensualite" DOUBLE PRECISION NOT NULL,
    "fraisInscription" DOUBLE PRECISION NOT NULL,
    "fraisRenouvellement" DOUBLE PRECISION NOT NULL,
    "fraisCantine" DOUBLE PRECISION,
    "fraisTransport" DOUBLE PRECISION,
    "devise" TEXT NOT NULL DEFAULT 'DJF',
    "nbMois" INTEGER NOT NULL DEFAULT 10,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarifs_niveau_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "niveau" INTEGER NOT NULL,
    "canal" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "envoyeeParId" TEXT,
    "envoyeeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exclusions_eleve" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "details" TEXT,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),
    "leveeParId" TEXT,
    "leveeLe" TIMESTAMP(3),
    "decideeParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exclusions_eleve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eleveId" TEXT,
    "nom" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "taille" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evenements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),
    "lieu" TEXT,
    "couleur" TEXT,
    "cible" TEXT NOT NULL DEFAULT 'all',
    "responsableId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "rapporteParId" TEXT,
    "type" "TypeIncident" NOT NULL DEFAULT 'AUTRE',
    "statut" "StatutIncident" NOT NULL DEFAULT 'OUVERT',
    "gravite" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT NOT NULL,
    "lieu" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "actionPrise" TEXT,
    "resoluParId" TEXT,
    "dateResolution" TIMESTAMP(3),
    "classeParId" TEXT,
    "dateClassement" TIMESTAMP(3),
    "motifClassement" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanctions" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "type" "TypeSanction" NOT NULL,
    "description" TEXT,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),
    "parentNotifie" BOOLEAN NOT NULL DEFAULT false,
    "dateRetourEffective" TIMESTAMP(3),
    "reintegreParId" TEXT,
    "travailDonne" TEXT,
    "accuseReceptionParent" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sanctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcours_scolaires" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "annee" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "niveau" TEXT NOT NULL,
    "moyenneAnnuelle" DOUBLE PRECISION,
    "rang" INTEGER,
    "effectif" INTEGER,
    "decision" TEXT,
    "mention" TEXT,
    "recommandation" "TypeRecommandation",
    "commentaire" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcours_scolaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "titre" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "canal" "CanalNotification" NOT NULL DEFAULT 'IN_APP',
    "statut" "StatutNotification" NOT NULL DEFAULT 'BROUILLON',
    "cible" "CibleNotification" NOT NULL DEFAULT 'TOUS',
    "classeId" TEXT,
    "niveau" TEXT,
    "envoyeParId" TEXT,
    "nbDestinataires" INTEGER NOT NULL DEFAULT 0,
    "nbDelivres" INTEGER NOT NULL DEFAULT 0,
    "nbLus" INTEGER NOT NULL DEFAULT 0,
    "planifieeAt" TIMESTAMP(3),
    "envoyeeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiches_rh" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enseignantId" TEXT NOT NULL,
    "typeContrat" "TypeContrat" NOT NULL DEFAULT 'CDI',
    "dateEntree" TIMESTAMP(3),
    "dateSortie" TIMESTAMP(3),
    "salaireBase" DOUBLE PRECISION,
    "tarifHoraire" DOUBLE PRECISION,
    "diplome" TEXT,
    "echelon" INTEGER NOT NULL DEFAULT 1,
    "grade" TEXT,
    "banque" TEXT,
    "rib" TEXT,
    "iban" TEXT,
    "congesAnnuels" INTEGER NOT NULL DEFAULT 30,
    "congesPris" INTEGER NOT NULL DEFAULT 0,
    "absencesCount" INTEGER NOT NULL DEFAULT 0,
    "evaluation" TEXT,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiches_rh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletins_paie" (
    "id" TEXT NOT NULL,
    "ficheRHId" TEXT NOT NULL,
    "mois" INTEGER NOT NULL,
    "annee" INTEGER NOT NULL,
    "heuresEffectuees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salaireBase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "primes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAPayer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPaye" BOOLEAN NOT NULL DEFAULT false,
    "datePaiement" TIMESTAMP(3),
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulletins_paie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absences_personnel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enseignantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "heureDebut" TEXT,
    "heureFin" TEXT,
    "type" "TypeAbsencePersonnel" NOT NULL DEFAULT 'ABSENCE',
    "statut" "StatutAbsencePersonnel" NOT NULL DEFAULT 'EN_ATTENTE',
    "motif" TEXT,
    "justificatif" TEXT,
    "commentaire" TEXT,
    "saisieParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absences_personnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conges_personnel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enseignantId" TEXT NOT NULL,
    "type" "TypeConge" NOT NULL DEFAULT 'ANNUEL',
    "statut" "StatutConge" NOT NULL DEFAULT 'DEMANDE',
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "nbJours" DOUBLE PRECISION NOT NULL,
    "motif" TEXT,
    "justificatif" TEXT,
    "demandeParId" TEXT,
    "approuveParId" TEXT,
    "approuveAt" TIMESTAMP(3),
    "commentaire" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conges_personnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidatures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "dateNaissance" TIMESTAMP(3) NOT NULL,
    "lieuNaissance" TEXT,
    "sexe" "Sexe" NOT NULL DEFAULT 'M',
    "nationalite" TEXT DEFAULT 'SN',
    "photoUrl" TEXT,
    "classeVoulue" TEXT NOT NULL,
    "annee" TEXT NOT NULL,
    "parentNom" TEXT NOT NULL,
    "parentPrenom" TEXT NOT NULL,
    "parentEmail" TEXT,
    "parentPhone" TEXT NOT NULL,
    "parentLien" "LienParente" NOT NULL DEFAULT 'PERE',
    "statut" "StatutCandidature" NOT NULL DEFAULT 'SOUMISE',
    "dateExamen" TIMESTAMP(3),
    "noteExamen" DOUBLE PRECISION,
    "commentaire" TEXT,
    "motifRefus" TEXT,
    "documents" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT,
    "telephone" TEXT,
    "photoUrl" TEXT,
    "sexe" "Sexe" NOT NULL DEFAULT 'M',
    "dateNaissance" TIMESTAMP(3),
    "anneeDiplome" TEXT NOT NULL,
    "classeDepart" TEXT NOT NULL,
    "mention" TEXT,
    "numeroDiplome" TEXT,
    "statut" "StatutAlumni" NOT NULL DEFAULT 'INCONNU',
    "etablissement" TEXT,
    "formation" TEXT,
    "ville" TEXT,
    "pays" TEXT,
    "linkedin" TEXT,
    "accepteContact" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventaire" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "categorie" "CategorieItem" NOT NULL DEFAULT 'AUTRE',
    "etat" "EtatItem" NOT NULL DEFAULT 'BON',
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "quantiteMin" INTEGER NOT NULL DEFAULT 0,
    "localisation" TEXT,
    "fournisseur" TEXT,
    "prixUnitaire" DOUBLE PRECISION,
    "devise" TEXT NOT NULL DEFAULT 'DJF',
    "dateAchat" TIMESTAMP(3),
    "dateGarantie" TIMESTAMP(3),
    "dateRevision" TIMESTAMP(3),
    "photoUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subject" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "type" "ConversationType" NOT NULL DEFAULT 'DIRECT',
    "classeId" TEXT,
    "siteId" TEXT,
    "createdBy" TEXT NOT NULL,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "readBy" TEXT[],
    "replyToId" TEXT,
    "attachmentUrl" TEXT,
    "attachmentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "PlatformMobile" NOT NULL DEFAULT 'ANDROID',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cours" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "country" TEXT,
    "siteId" TEXT,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "niveau" "NiveauCours" NOT NULL DEFAULT 'INTERMEDIAIRE',
    "statut" "StatutCours" NOT NULL DEFAULT 'BROUILLON',
    "matiereNom" TEXT,
    "classeNom" TEXT,
    "auteurNom" TEXT,
    "imageUrl" TEXT,
    "dureeMin" INTEGER,
    "nbVues" INTEGER NOT NULL DEFAULT 0,
    "nbInscrits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contenus_cours" (
    "id" TEXT NOT NULL,
    "coursId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "type" "TypeContenu" NOT NULL DEFAULT 'TEXTE',
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT,
    "texte" TEXT,
    "dureeMin" INTEGER,
    "isGratuit" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contenus_cours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progressions_eleves" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "coursId" TEXT NOT NULL,
    "eleveNom" TEXT NOT NULL,
    "eleveId" TEXT,
    "contenusVus" TEXT[],
    "pctCompletion" INTEGER NOT NULL DEFAULT 0,
    "noteFinale" DOUBLE PRECISION,
    "isTermine" BOOLEAN NOT NULL DEFAULT false,
    "termineeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progressions_eleves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regles_appreciation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contexte" "ContexteAppreciation" NOT NULL,
    "seuilMin" DOUBLE PRECISION NOT NULL,
    "seuilMax" DOUBLE PRECISION NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regles_appreciation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispenses_matiere" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "periodeId" TEXT,
    "motif" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispenses_matiere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "verdict" "AuditVerdict" NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "annee" TEXT NOT NULL,
    "categorie" "CategorieBudget" NOT NULL,
    "montantPrevu" DOUBLE PRECISION NOT NULL,
    "montantDepense" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "devise" TEXT NOT NULL DEFAULT 'DJF',
    "statut" TEXT NOT NULL DEFAULT 'VALIDE',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depenses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "budgetId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'DJF',
    "categorie" "CategorieBudget" NOT NULL DEFAULT 'AUTRE',
    "libelle" TEXT NOT NULL,
    "description" TEXT,
    "methodePaiement" TEXT,
    "reference" TEXT,
    "justificatifUrl" TEXT,
    "autoriseParId" TEXT,
    "payeParId" TEXT,
    "typeEngagement" TEXT,
    "fournisseur" TEXT,
    "fournisseurContact" TEXT,
    "enregistreParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "depenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remises_caisse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "caissierId" TEXT NOT NULL,
    "montantDeclare" DOUBLE PRECISION NOT NULL,
    "dateRemise" TIMESTAMP(3) NOT NULL,
    "dateSaisieRemise" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receveurId" TEXT,
    "montantRecu" DOUBLE PRECISION,
    "dateReception" TIMESTAMP(3),
    "dateSaisieReception" TIMESTAMP(3),
    "commentaireReceveur" TEXT,
    "statut" "StatutRemiseCaisse" NOT NULL DEFAULT 'EN_ATTENTE',
    "periodeDebut" TIMESTAMP(3) NOT NULL,
    "periodeFin" TIMESTAMP(3) NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'DJF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remises_caisse_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_domain_key" ON "tenants"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_stripeCustomerId_key" ON "tenants"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_stripeSubscriptionId_key" ON "tenants"("stripeSubscriptionId");

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
CREATE INDEX "sites_tenantId_idx" ON "sites"("tenantId");

-- CreateIndex
CREATE INDEX "site_deletion_logs_tenantId_idx" ON "site_deletion_logs"("tenantId");

-- CreateIndex
CREATE INDEX "site_deletion_logs_siteId_idx" ON "site_deletion_logs"("siteId");

-- CreateIndex
CREATE INDEX "user_sites_userId_idx" ON "user_sites"("userId");

-- CreateIndex
CREATE INDEX "user_sites_siteId_idx" ON "user_sites"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "user_sites_userId_siteId_key" ON "user_sites"("userId", "siteId");

-- CreateIndex
CREATE INDEX "enseignant_sites_enseignantId_idx" ON "enseignant_sites"("enseignantId");

-- CreateIndex
CREATE INDEX "enseignant_sites_siteId_idx" ON "enseignant_sites"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "enseignant_sites_enseignantId_siteId_key" ON "enseignant_sites"("enseignantId", "siteId");

-- CreateIndex
CREATE INDEX "annees_scolaires_tenantId_idx" ON "annees_scolaires"("tenantId");

-- CreateIndex
CREATE INDEX "annees_scolaires_tenantId_statut_idx" ON "annees_scolaires"("tenantId", "statut");

-- CreateIndex
CREATE INDEX "evenements_calendaires_anneeId_idx" ON "evenements_calendaires"("anneeId");

-- CreateIndex
CREATE INDEX "evenements_calendaires_anneeId_type_idx" ON "evenements_calendaires"("anneeId", "type");

-- CreateIndex
CREATE INDEX "calendriers_officiels_country_anneeLibelle_idx" ON "calendriers_officiels"("country", "anneeLibelle");

-- CreateIndex
CREATE INDEX "calendriers_officiels_country_anneeLibelle_type_idx" ON "calendriers_officiels"("country", "anneeLibelle", "type");

-- CreateIndex
CREATE INDEX "periodes_anneeId_idx" ON "periodes"("anneeId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "users_siteId_idx" ON "users"("siteId");

-- CreateIndex
CREATE INDEX "user_tenants_tenantId_idx" ON "user_tenants"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "user_tenants_userId_tenantId_key" ON "user_tenants"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "user_roles_tenantId_idx" ON "user_roles"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_tenantId_role_key" ON "user_roles"("userId", "tenantId", "role");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "structures_tenantId_idx" ON "structures"("tenantId");

-- CreateIndex
CREATE INDEX "structures_siteId_idx" ON "structures"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "structures_tenantId_siteId_type_key" ON "structures"("tenantId", "siteId", "type");

-- CreateIndex
CREATE INDEX "classes_tenantId_idx" ON "classes"("tenantId");

-- CreateIndex
CREATE INDEX "classes_siteId_idx" ON "classes"("siteId");

-- CreateIndex
CREATE INDEX "classes_structureId_idx" ON "classes"("structureId");

-- CreateIndex
CREATE INDEX "classes_deletedAt_idx" ON "classes"("deletedAt");

-- CreateIndex
CREATE INDEX "historique_classes_tenantId_idx" ON "historique_classes"("tenantId");

-- CreateIndex
CREATE INDEX "historique_classes_eleveId_idx" ON "historique_classes"("eleveId");

-- CreateIndex
CREATE INDEX "historique_classes_classeId_idx" ON "historique_classes"("classeId");

-- CreateIndex
CREATE INDEX "matieres_tenantId_idx" ON "matieres"("tenantId");

-- CreateIndex
CREATE INDEX "matieres_siteId_idx" ON "matieres"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "eleves_userId_key" ON "eleves"("userId");

-- CreateIndex
CREATE INDEX "eleves_tenantId_idx" ON "eleves"("tenantId");

-- CreateIndex
CREATE INDEX "eleves_classeId_idx" ON "eleves"("classeId");

-- CreateIndex
CREATE INDEX "eleves_siteId_idx" ON "eleves"("siteId");

-- CreateIndex
CREATE INDEX "eleves_importBatchId_idx" ON "eleves"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "eleves_tenantId_matricule_key" ON "eleves"("tenantId", "matricule");

-- CreateIndex
CREATE UNIQUE INDEX "eleves_tenantId_identiteKey_key" ON "eleves"("tenantId", "identiteKey");

-- CreateIndex
CREATE INDEX "parents_tenantId_idx" ON "parents"("tenantId");

-- CreateIndex
CREATE INDEX "parents_userId_idx" ON "parents"("userId");

-- CreateIndex
CREATE INDEX "eleve_parents_parentId_idx" ON "eleve_parents"("parentId");

-- CreateIndex
CREATE INDEX "enseignants_tenantId_idx" ON "enseignants"("tenantId");

-- CreateIndex
CREATE INDEX "enseignants_userId_idx" ON "enseignants"("userId");

-- CreateIndex
CREATE INDEX "emplois_temps_tenantId_idx" ON "emplois_temps"("tenantId");

-- CreateIndex
CREATE INDEX "emplois_temps_classeId_idx" ON "emplois_temps"("classeId");

-- CreateIndex
CREATE INDEX "emplois_temps_matiereId_idx" ON "emplois_temps"("matiereId");

-- CreateIndex
CREATE INDEX "emplois_temps_enseignantId_idx" ON "emplois_temps"("enseignantId");

-- CreateIndex
CREATE INDEX "disponibilites_enseignants_tenantId_idx" ON "disponibilites_enseignants"("tenantId");

-- CreateIndex
CREATE INDEX "disponibilites_enseignants_siteId_idx" ON "disponibilites_enseignants"("siteId");

-- CreateIndex
CREATE INDEX "disponibilites_enseignants_enseignantId_idx" ON "disponibilites_enseignants"("enseignantId");

-- CreateIndex
CREATE INDEX "salles_tenantId_idx" ON "salles"("tenantId");

-- CreateIndex
CREATE INDEX "salles_siteId_idx" ON "salles"("siteId");

-- CreateIndex
CREATE INDEX "absences_tenantId_idx" ON "absences"("tenantId");

-- CreateIndex
CREATE INDEX "absences_eleveId_idx" ON "absences"("eleveId");

-- CreateIndex
CREATE INDEX "absences_tenantId_date_idx" ON "absences"("tenantId", "date");

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
CREATE INDEX "evaluations_tenantId_idx" ON "evaluations"("tenantId");

-- CreateIndex
CREATE INDEX "evaluations_classeId_idx" ON "evaluations"("classeId");

-- CreateIndex
CREATE INDEX "evaluations_matiereId_idx" ON "evaluations"("matiereId");

-- CreateIndex
CREATE INDEX "evaluations_periodeId_idx" ON "evaluations"("periodeId");

-- CreateIndex
CREATE INDEX "notes_tenantId_idx" ON "notes"("tenantId");

-- CreateIndex
CREATE INDEX "notes_eleveId_idx" ON "notes"("eleveId");

-- CreateIndex
CREATE INDEX "notes_classeId_idx" ON "notes"("classeId");

-- CreateIndex
CREATE INDEX "notes_matiereId_idx" ON "notes"("matiereId");

-- CreateIndex
CREATE INDEX "notes_periodeId_idx" ON "notes"("periodeId");

-- CreateIndex
CREATE INDEX "notes_evaluationId_idx" ON "notes"("evaluationId");

-- CreateIndex
CREATE INDEX "bulletins_tenantId_idx" ON "bulletins"("tenantId");

-- CreateIndex
CREATE INDEX "bulletins_periodeId_idx" ON "bulletins"("periodeId");

-- CreateIndex
CREATE UNIQUE INDEX "bulletins_eleveId_periodeId_key" ON "bulletins"("eleveId", "periodeId");

-- CreateIndex
CREATE INDEX "bulletin_matieres_tenantId_idx" ON "bulletin_matieres"("tenantId");

-- CreateIndex
CREATE INDEX "bulletin_matieres_bulletinId_idx" ON "bulletin_matieres"("bulletinId");

-- CreateIndex
CREATE INDEX "bulletin_matieres_matiereId_idx" ON "bulletin_matieres"("matiereId");

-- CreateIndex
CREATE INDEX "examens_tenantId_idx" ON "examens"("tenantId");

-- CreateIndex
CREATE INDEX "examens_siteId_idx" ON "examens"("siteId");

-- CreateIndex
CREATE INDEX "sessions_examen_examId_idx" ON "sessions_examen"("examId");

-- CreateIndex
CREATE INDEX "factures_tenantId_idx" ON "factures"("tenantId");

-- CreateIndex
CREATE INDEX "factures_eleveId_idx" ON "factures"("eleveId");

-- CreateIndex
CREATE INDEX "factures_tenantId_statut_idx" ON "factures"("tenantId", "statut");

-- CreateIndex
CREATE INDEX "factures_siteId_idx" ON "factures"("siteId");

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
CREATE INDEX "paiements_factureId_idx" ON "paiements"("factureId");

-- CreateIndex
CREATE INDEX "tarifs_niveau_tenantId_idx" ON "tarifs_niveau"("tenantId");

-- CreateIndex
CREATE INDEX "tarifs_niveau_siteId_idx" ON "tarifs_niveau"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "tarifs_niveau_tenantId_niveau_annee_siteId_key" ON "tarifs_niveau"("tenantId", "niveau", "annee", "siteId");

-- CreateIndex
CREATE INDEX "relances_tenantId_idx" ON "relances"("tenantId");

-- CreateIndex
CREATE INDEX "relances_factureId_idx" ON "relances"("factureId");

-- CreateIndex
CREATE INDEX "exclusions_eleve_tenantId_idx" ON "exclusions_eleve"("tenantId");

-- CreateIndex
CREATE INDEX "exclusions_eleve_eleveId_idx" ON "exclusions_eleve"("eleveId");

-- CreateIndex
CREATE INDEX "documents_tenantId_idx" ON "documents"("tenantId");

-- CreateIndex
CREATE INDEX "documents_eleveId_idx" ON "documents"("eleveId");

-- CreateIndex
CREATE INDEX "evenements_tenantId_idx" ON "evenements"("tenantId");

-- CreateIndex
CREATE INDEX "evenements_siteId_idx" ON "evenements"("siteId");

-- CreateIndex
CREATE INDEX "evenements_responsableId_idx" ON "evenements"("responsableId");

-- CreateIndex
CREATE INDEX "incidents_tenantId_idx" ON "incidents"("tenantId");

-- CreateIndex
CREATE INDEX "incidents_eleveId_idx" ON "incidents"("eleveId");

-- CreateIndex
CREATE INDEX "sanctions_incidentId_idx" ON "sanctions"("incidentId");

-- CreateIndex
CREATE INDEX "sanctions_type_dateRetourEffective_idx" ON "sanctions"("type", "dateRetourEffective");

-- CreateIndex
CREATE INDEX "parcours_scolaires_tenantId_idx" ON "parcours_scolaires"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "parcours_scolaires_eleveId_annee_key" ON "parcours_scolaires"("eleveId", "annee");

-- CreateIndex
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");

-- CreateIndex
CREATE INDEX "notifications_siteId_idx" ON "notifications"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "fiches_rh_enseignantId_key" ON "fiches_rh"("enseignantId");

-- CreateIndex
CREATE INDEX "fiches_rh_tenantId_idx" ON "fiches_rh"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "bulletins_paie_ficheRHId_mois_annee_key" ON "bulletins_paie"("ficheRHId", "mois", "annee");

-- CreateIndex
CREATE INDEX "absences_personnel_tenantId_idx" ON "absences_personnel"("tenantId");

-- CreateIndex
CREATE INDEX "absences_personnel_enseignantId_idx" ON "absences_personnel"("enseignantId");

-- CreateIndex
CREATE INDEX "absences_personnel_tenantId_date_idx" ON "absences_personnel"("tenantId", "date");

-- CreateIndex
CREATE INDEX "conges_personnel_tenantId_idx" ON "conges_personnel"("tenantId");

-- CreateIndex
CREATE INDEX "conges_personnel_enseignantId_idx" ON "conges_personnel"("enseignantId");

-- CreateIndex
CREATE INDEX "conges_personnel_tenantId_statut_idx" ON "conges_personnel"("tenantId", "statut");

-- CreateIndex
CREATE INDEX "candidatures_tenantId_idx" ON "candidatures"("tenantId");

-- CreateIndex
CREATE INDEX "candidatures_tenantId_statut_idx" ON "candidatures"("tenantId", "statut");

-- CreateIndex
CREATE INDEX "candidatures_siteId_idx" ON "candidatures"("siteId");

-- CreateIndex
CREATE INDEX "alumni_tenantId_idx" ON "alumni"("tenantId");

-- CreateIndex
CREATE INDEX "alumni_siteId_idx" ON "alumni"("siteId");

-- CreateIndex
CREATE INDEX "inventaire_tenantId_idx" ON "inventaire"("tenantId");

-- CreateIndex
CREATE INDEX "inventaire_siteId_idx" ON "inventaire"("siteId");

-- CreateIndex
CREATE INDEX "conversations_tenantId_idx" ON "conversations"("tenantId");

-- CreateIndex
CREATE INDEX "conversations_classeId_idx" ON "conversations"("classeId");

-- CreateIndex
CREATE INDEX "conversations_siteId_idx" ON "conversations"("siteId");

-- CreateIndex
CREATE INDEX "conversation_participants_userId_idx" ON "conversation_participants"("userId");

-- CreateIndex
CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");

-- CreateIndex
CREATE INDEX "messages_senderId_idx" ON "messages"("senderId");

-- CreateIndex
CREATE INDEX "messages_replyToId_idx" ON "messages"("replyToId");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_userId_idx" ON "device_tokens"("userId");

-- CreateIndex
CREATE INDEX "device_tokens_tenantId_idx" ON "device_tokens"("tenantId");

-- CreateIndex
CREATE INDEX "cours_tenantId_idx" ON "cours"("tenantId");

-- CreateIndex
CREATE INDEX "cours_country_idx" ON "cours"("country");

-- CreateIndex
CREATE INDEX "cours_siteId_idx" ON "cours"("siteId");

-- CreateIndex
CREATE INDEX "contenus_cours_coursId_idx" ON "contenus_cours"("coursId");

-- CreateIndex
CREATE INDEX "progressions_eleves_tenantId_idx" ON "progressions_eleves"("tenantId");

-- CreateIndex
CREATE INDEX "progressions_eleves_eleveId_idx" ON "progressions_eleves"("eleveId");

-- CreateIndex
CREATE UNIQUE INDEX "progressions_eleves_coursId_eleveNom_key" ON "progressions_eleves"("coursId", "eleveNom");

-- CreateIndex
CREATE INDEX "regles_appreciation_tenantId_contexte_idx" ON "regles_appreciation"("tenantId", "contexte");

-- CreateIndex
CREATE INDEX "dispenses_matiere_tenantId_idx" ON "dispenses_matiere"("tenantId");

-- CreateIndex
CREATE INDEX "dispenses_matiere_eleveId_idx" ON "dispenses_matiere"("eleveId");

-- CreateIndex
CREATE UNIQUE INDEX "dispenses_matiere_eleveId_matiereId_periodeId_key" ON "dispenses_matiere"("eleveId", "matiereId", "periodeId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_verdict_idx" ON "audit_logs"("verdict");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

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
CREATE INDEX "budgets_tenantId_idx" ON "budgets"("tenantId");

-- CreateIndex
CREATE INDEX "budgets_siteId_idx" ON "budgets"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_tenantId_siteId_annee_categorie_key" ON "budgets"("tenantId", "siteId", "annee", "categorie");

-- CreateIndex
CREATE INDEX "depenses_tenantId_idx" ON "depenses"("tenantId");

-- CreateIndex
CREATE INDEX "depenses_siteId_idx" ON "depenses"("siteId");

-- CreateIndex
CREATE INDEX "depenses_budgetId_idx" ON "depenses"("budgetId");

-- CreateIndex
CREATE INDEX "depenses_date_idx" ON "depenses"("date");

-- CreateIndex
CREATE INDEX "remises_caisse_tenantId_idx" ON "remises_caisse"("tenantId");

-- CreateIndex
CREATE INDEX "remises_caisse_siteId_idx" ON "remises_caisse"("siteId");

-- CreateIndex
CREATE INDEX "remises_caisse_caissierId_idx" ON "remises_caisse"("caissierId");

-- CreateIndex
CREATE INDEX "remises_caisse_receveurId_idx" ON "remises_caisse"("receveurId");

-- CreateIndex
CREATE INDEX "remises_caisse_statut_idx" ON "remises_caisse"("statut");

-- CreateIndex
CREATE INDEX "remises_caisse_dateRemise_idx" ON "remises_caisse"("dateRemise");

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
ALTER TABLE "sites" ADD CONSTRAINT "sites_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sites" ADD CONSTRAINT "user_sites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sites" ADD CONSTRAINT "user_sites_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enseignant_sites" ADD CONSTRAINT "enseignant_sites_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "enseignants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enseignant_sites" ADD CONSTRAINT "enseignant_sites_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annees_scolaires" ADD CONSTRAINT "annees_scolaires_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenements_calendaires" ADD CONSTRAINT "evenements_calendaires_anneeId_fkey" FOREIGN KEY ("anneeId") REFERENCES "annees_scolaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodes" ADD CONSTRAINT "periodes_anneeId_fkey" FOREIGN KEY ("anneeId") REFERENCES "annees_scolaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structures" ADD CONSTRAINT "structures_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structures" ADD CONSTRAINT "structures_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_profPrincipalId_fkey" FOREIGN KEY ("profPrincipalId") REFERENCES "enseignants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historique_classes" ADD CONSTRAINT "historique_classes_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historique_classes" ADD CONSTRAINT "historique_classes_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matieres" ADD CONSTRAINT "matieres_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matieres" ADD CONSTRAINT "matieres_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eleves" ADD CONSTRAINT "eleves_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eleves" ADD CONSTRAINT "eleves_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eleves" ADD CONSTRAINT "eleves_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eleves" ADD CONSTRAINT "eleves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parents" ADD CONSTRAINT "parents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parents" ADD CONSTRAINT "parents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eleve_parents" ADD CONSTRAINT "eleve_parents_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eleve_parents" ADD CONSTRAINT "eleve_parents_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enseignants" ADD CONSTRAINT "enseignants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enseignants" ADD CONSTRAINT "enseignants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emplois_temps" ADD CONSTRAINT "emplois_temps_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emplois_temps" ADD CONSTRAINT "emplois_temps_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emplois_temps" ADD CONSTRAINT "emplois_temps_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "enseignants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilites_enseignants" ADD CONSTRAINT "disponibilites_enseignants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilites_enseignants" ADD CONSTRAINT "disponibilites_enseignants_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilites_enseignants" ADD CONSTRAINT "disponibilites_enseignants_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "enseignants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salles" ADD CONSTRAINT "salles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salles" ADD CONSTRAINT "salles_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "periodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "periodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "periodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_matieres" ADD CONSTRAINT "bulletin_matieres_bulletinId_fkey" FOREIGN KEY ("bulletinId") REFERENCES "bulletins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_matieres" ADD CONSTRAINT "bulletin_matieres_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examens" ADD CONSTRAINT "examens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examens" ADD CONSTRAINT "examens_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examens" ADD CONSTRAINT "examens_feuilleExercicesId_fkey" FOREIGN KEY ("feuilleExercicesId") REFERENCES "learnos_feuilles_exercices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions_examen" ADD CONSTRAINT "sessions_examen_examId_fkey" FOREIGN KEY ("examId") REFERENCES "examens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeanciers" ADD CONSTRAINT "echeanciers_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeances_paiement" ADD CONSTRAINT "echeances_paiement_echeancierId_fkey" FOREIGN KEY ("echeancierId") REFERENCES "echeanciers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeances_paiement" ADD CONSTRAINT "echeances_paiement_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeances_paiement" ADD CONSTRAINT "echeances_paiement_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_enregistreParId_fkey" FOREIGN KEY ("enregistreParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifs_niveau" ADD CONSTRAINT "tarifs_niveau_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifs_niveau" ADD CONSTRAINT "tarifs_niveau_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relances" ADD CONSTRAINT "relances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relances" ADD CONSTRAINT "relances_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relances" ADD CONSTRAINT "relances_envoyeeParId_fkey" FOREIGN KEY ("envoyeeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exclusions_eleve" ADD CONSTRAINT "exclusions_eleve_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exclusions_eleve" ADD CONSTRAINT "exclusions_eleve_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exclusions_eleve" ADD CONSTRAINT "exclusions_eleve_leveeParId_fkey" FOREIGN KEY ("leveeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exclusions_eleve" ADD CONSTRAINT "exclusions_eleve_decideeParId_fkey" FOREIGN KEY ("decideeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenements" ADD CONSTRAINT "evenements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenements" ADD CONSTRAINT "evenements_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenements" ADD CONSTRAINT "evenements_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_rapporteParId_fkey" FOREIGN KEY ("rapporteParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resoluParId_fkey" FOREIGN KEY ("resoluParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_classeParId_fkey" FOREIGN KEY ("classeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_reintegreParId_fkey" FOREIGN KEY ("reintegreParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcours_scolaires" ADD CONSTRAINT "parcours_scolaires_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_envoyeParId_fkey" FOREIGN KEY ("envoyeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiches_rh" ADD CONSTRAINT "fiches_rh_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "enseignants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_ficheRHId_fkey" FOREIGN KEY ("ficheRHId") REFERENCES "fiches_rh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences_personnel" ADD CONSTRAINT "absences_personnel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences_personnel" ADD CONSTRAINT "absences_personnel_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "enseignants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences_personnel" ADD CONSTRAINT "absences_personnel_saisieParId_fkey" FOREIGN KEY ("saisieParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conges_personnel" ADD CONSTRAINT "conges_personnel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conges_personnel" ADD CONSTRAINT "conges_personnel_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "enseignants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conges_personnel" ADD CONSTRAINT "conges_personnel_demandeParId_fkey" FOREIGN KEY ("demandeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conges_personnel" ADD CONSTRAINT "conges_personnel_approuveParId_fkey" FOREIGN KEY ("approuveParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidatures" ADD CONSTRAINT "candidatures_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidatures" ADD CONSTRAINT "candidatures_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni" ADD CONSTRAINT "alumni_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni" ADD CONSTRAINT "alumni_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire" ADD CONSTRAINT "inventaire_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire" ADD CONSTRAINT "inventaire_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cours" ADD CONSTRAINT "cours_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contenus_cours" ADD CONSTRAINT "contenus_cours_coursId_fkey" FOREIGN KEY ("coursId") REFERENCES "cours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progressions_eleves" ADD CONSTRAINT "progressions_eleves_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progressions_eleves" ADD CONSTRAINT "progressions_eleves_coursId_fkey" FOREIGN KEY ("coursId") REFERENCES "cours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progressions_eleves" ADD CONSTRAINT "progressions_eleves_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regles_appreciation" ADD CONSTRAINT "regles_appreciation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispenses_matiere" ADD CONSTRAINT "dispenses_matiere_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispenses_matiere" ADD CONSTRAINT "dispenses_matiere_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispenses_matiere" ADD CONSTRAINT "dispenses_matiere_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_autoriseParId_fkey" FOREIGN KEY ("autoriseParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_payeParId_fkey" FOREIGN KEY ("payeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_enregistreParId_fkey" FOREIGN KEY ("enregistreParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remises_caisse" ADD CONSTRAINT "remises_caisse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remises_caisse" ADD CONSTRAINT "remises_caisse_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remises_caisse" ADD CONSTRAINT "remises_caisse_caissierId_fkey" FOREIGN KEY ("caissierId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

