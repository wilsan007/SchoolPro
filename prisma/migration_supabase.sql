-- ============================================================
-- EcolPro — Migration SQL Complète pour Supabase
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 2. ENUMS
-- ============================================================

DO $$ BEGIN CREATE TYPE "PlanType" AS ENUM ('STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN','TENANT_ADMIN','PRINCIPAL','SECRETARY','TEACHER','CLASS_TEACHER','COUNSELOR','NURSE','ACCOUNTANT','PARENT','STUDENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "Sexe" AS ENUM ('M', 'F'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutEleve" AS ENUM ('ACTIF','TRANSFERE','DIPLOME','EXCLU','ABANDONNE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "LienParente" AS ENUM ('PERE','MERE','TUTEUR','AUTRE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "Jour" AS ENUM ('LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MotifAbsence" AS ENUM ('INJUSTIFIE','MALADIE','FAMILIALE','TRANSPORT','AUTRE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutAbsence" AS ENUM ('EN_ATTENTE','JUSTIFIEE','INJUSTIFIEE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TypeNote" AS ENUM ('CONTROLE','DEVOIR','EXAMEN','INTERROGATION','PROJET','ORAL','TP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutExamen" AS ENUM ('PROGRAMME','EN_COURS','TERMINE','ANNULE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutFacture" AS ENUM ('EN_ATTENTE','PAYEE','EN_RETARD','ANNULEE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TypeIncident" AS ENUM ('RETARD','BAVARDAGE','INSOLENCE','BAGARRE','TRICHE','VANDALISM','ABSENTEISME','AUTRE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutIncident" AS ENUM ('OUVERT','EN_TRAITEMENT','RESOLU','CLASSE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TypeSanction" AS ENUM ('AVERTISSEMENT','BLAME','EXCLUSION_COURS','EXCLUSION_TEMP','CONVOCATION_PARENTS','TRAVAUX_INTERET_GENERAL','AUTRE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TypeRecommandation" AS ENUM ('FILIERE_SCIENTIFIQUE','FILIERE_LITTERAIRE','FILIERE_TECHNIQUE','FILIERE_PROFESSIONNELLE','REDOUBLEMENT','SOUTIEN_RENFORCE','EXCELLENTE_VOIE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CanalNotification" AS ENUM ('EMAIL','SMS','PUSH','IN_APP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutNotification" AS ENUM ('BROUILLON','PLANIFIEE','EN_ENVOI','ENVOYEE','ECHEC'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CibleNotification" AS ENUM ('TOUS','PARENTS','ENSEIGNANTS','ELEVES','CLASSE','NIVEAU'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TypeContrat" AS ENUM ('CDI','CDD','VACATAIRE','FONCTIONNAIRE','STAGIAIRE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutCandidature" AS ENUM ('SOUMISE','EN_EXAMEN','ADMIS','REFUSE','INSCRIT','ANNULE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutAlumni" AS ENUM ('ETUDES_SUPERIEURES','EN_EMPLOI','RECHERCHE_EMPLOI','ENTREPRENEUR','INCONNU'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EtatItem" AS ENUM ('NEUF','BON','USE','ENDOMMAGE','HORS_SERVICE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CategorieItem" AS ENUM ('INFORMATIQUE','MOBILIER','SPORTIF','PEDAGOGIQUE','AUDIOVISUEL','ENTRETIEN','SECURITE','AUTRE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NiveauCours" AS ENUM ('DEBUTANT','INTERMEDIAIRE','AVANCE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutCours" AS ENUM ('BROUILLON','PUBLIE','ARCHIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TypeContenu" AS ENUM ('VIDEO','DOCUMENT','LIEN','TEXTE','QUIZ'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 3. TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS "tenants" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "domain" TEXT UNIQUE,
  "logoUrl" TEXT,
  "plan" "PlanType" NOT NULL DEFAULT 'STARTER',
  "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
  "trialEndsAt" TIMESTAMPTZ,
  "address" TEXT, "city" TEXT, "country" TEXT NOT NULL DEFAULT 'SN',
  "phone" TEXT, "email" TEXT, "website" TEXT, "siret" TEXT,
  "currentYear" TEXT NOT NULL DEFAULT '2025-2026',
  "notationMax" INTEGER NOT NULL DEFAULT 20,
  "langue" TEXT NOT NULL DEFAULT 'fr',
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Dakar',
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "primaryColor" TEXT, "secondaryColor" TEXT,
  "stripeCustomerId" TEXT UNIQUE, "stripeSubscriptionId" TEXT UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT REFERENCES "tenants"("id") ON DELETE CASCADE,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" TIMESTAMPTZ, "password" TEXT,
  "name" TEXT NOT NULL, "firstName" TEXT, "lastName" TEXT,
  "avatarUrl" TEXT, "phone" TEXT,
  "role" "Role" NOT NULL DEFAULT 'TEACHER',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "lastLoginAt" TIMESTAMPTZ,
  "langue" TEXT NOT NULL DEFAULT 'fr',
  "notifications" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL, "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT, "access_token" TEXT,
  "expires_at" INTEGER, "token_type" TEXT,
  "scope" TEXT, "id_token" TEXT, "session_state" TEXT,
  UNIQUE("provider", "providerAccountId")
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sessionToken" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification_tokens" (
  "identifier" TEXT NOT NULL, "token" TEXT NOT NULL UNIQUE,
  "expires" TIMESTAMPTZ NOT NULL,
  UNIQUE("identifier", "token")
);

CREATE TABLE IF NOT EXISTS "annees_scolaires" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "libelle" TEXT NOT NULL, "dateDebut" TIMESTAMPTZ NOT NULL,
  "dateFin" TIMESTAMPTZ NOT NULL, "isCurrent" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS "periodes" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "anneeId" TEXT NOT NULL REFERENCES "annees_scolaires"("id") ON DELETE CASCADE,
  "nom" TEXT NOT NULL, "numero" INTEGER NOT NULL,
  "dateDebut" TIMESTAMPTZ NOT NULL, "dateFin" TIMESTAMPTZ NOT NULL,
  "isCurrent" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS "enseignants" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "users"("id"),
  "matricule" TEXT, "specialite" TEXT, "typeContrat" TEXT, "dateEntree" TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "classes" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "nom" TEXT NOT NULL, "niveau" TEXT NOT NULL, "filiere" TEXT,
  "effectifMax" INTEGER NOT NULL DEFAULT 40, "annee" TEXT NOT NULL,
  "profPrincipalId" TEXT REFERENCES "enseignants"("id")
);

CREATE TABLE IF NOT EXISTS "matieres" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "nom" TEXT NOT NULL, "code" TEXT NOT NULL,
  "coefficient" FLOAT NOT NULL DEFAULT 1, "couleur" TEXT, "niveau" TEXT
);

CREATE TABLE IF NOT EXISTS "eleves" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "matricule" TEXT NOT NULL, "nom" TEXT NOT NULL, "prenom" TEXT NOT NULL,
  "dateNaissance" TIMESTAMPTZ NOT NULL, "lieuNaissance" TEXT,
  "nationalite" TEXT DEFAULT 'SN',
  "sexe" "Sexe" NOT NULL DEFAULT 'M',
  "photoUrl" TEXT,
  "statut" "StatutEleve" NOT NULL DEFAULT 'ACTIF',
  "classeId" TEXT REFERENCES "classes"("id"),
  "groupeSanguin" TEXT, "allergies" TEXT, "besoinsSpeciaux" TEXT,
  "regime" TEXT, "transport" TEXT,
  "contactUrgenceNom" TEXT, "contactUrgencePhone" TEXT,
  "anneeInscription" TEXT NOT NULL, "numeroBoursier" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("tenantId", "matricule")
);

CREATE TABLE IF NOT EXISTS "parents" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "userId" TEXT UNIQUE REFERENCES "users"("id"),
  "nom" TEXT NOT NULL, "prenom" TEXT NOT NULL,
  "email" TEXT, "phone" TEXT NOT NULL, "phone2" TEXT,
  "profession" TEXT, "adresse" TEXT, "photoUrl" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "eleve_parents" (
  "eleveId" TEXT NOT NULL REFERENCES "eleves"("id") ON DELETE CASCADE,
  "parentId" TEXT NOT NULL REFERENCES "parents"("id") ON DELETE CASCADE,
  "lien" "LienParente" NOT NULL DEFAULT 'PERE',
  "isGardien" BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY ("eleveId", "parentId")
);

CREATE TABLE IF NOT EXISTS "emplois_temps" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "classeId" TEXT NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE,
  "matiereId" TEXT NOT NULL REFERENCES "matieres"("id"),
  "enseignantId" TEXT REFERENCES "enseignants"("id"),
  "jour" "Jour" NOT NULL,
  "heureDebut" TEXT NOT NULL, "heureFin" TEXT NOT NULL,
  "salle" TEXT, "annee" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "absences" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "eleveId" TEXT NOT NULL REFERENCES "eleves"("id") ON DELETE CASCADE,
  "date" TIMESTAMPTZ NOT NULL, "heureDebut" TEXT, "heureFin" TEXT,
  "isRetard" BOOLEAN NOT NULL DEFAULT FALSE,
  "motif" "MotifAbsence" NOT NULL DEFAULT 'INJUSTIFIE',
  "statut" "StatutAbsence" NOT NULL DEFAULT 'EN_ATTENTE',
  "justificatif" TEXT, "commentaire" TEXT, "saisieParId" TEXT,
  "parentNotifie" BOOLEAN NOT NULL DEFAULT FALSE, "parentNotifieAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "notes" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "eleveId" TEXT NOT NULL REFERENCES "eleves"("id") ON DELETE CASCADE,
  "classeId" TEXT NOT NULL REFERENCES "classes"("id"),
  "matiereId" TEXT NOT NULL REFERENCES "matieres"("id"),
  "periodeId" TEXT REFERENCES "periodes"("id"),
  "type" "TypeNote" NOT NULL DEFAULT 'CONTROLE',
  "intitule" TEXT, "valeur" FLOAT NOT NULL,
  "noteMax" FLOAT NOT NULL DEFAULT 20, "coefficient" FLOAT NOT NULL DEFAULT 1,
  "date" TIMESTAMPTZ NOT NULL, "appreciation" TEXT, "saisieParId" TEXT,
  "isPubliee" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "bulletins" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "eleveId" TEXT NOT NULL REFERENCES "eleves"("id") ON DELETE CASCADE,
  "periodeId" TEXT NOT NULL REFERENCES "periodes"("id"),
  "moyenneGenerale" FLOAT, "rang" INTEGER, "effectifClasse" INTEGER,
  "appreciation" TEXT, "decision" TEXT,
  "isPublie" BOOLEAN NOT NULL DEFAULT FALSE,
  "publishedAt" TIMESTAMPTZ, "pdfUrl" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("eleveId", "periodeId")
);

CREATE TABLE IF NOT EXISTS "examens" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "intitule" TEXT NOT NULL, "description" TEXT,
  "statut" "StatutExamen" NOT NULL DEFAULT 'PROGRAMME',
  "dateDebut" TIMESTAMPTZ NOT NULL, "dateFin" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "sessions_examen" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "examId" TEXT NOT NULL REFERENCES "examens"("id") ON DELETE CASCADE,
  "matiereNom" TEXT NOT NULL, "date" TIMESTAMPTZ NOT NULL,
  "heureDebut" TEXT NOT NULL, "heureFin" TEXT NOT NULL,
  "salle" TEXT, "surveillants" JSONB, "niveau" TEXT
);

CREATE TABLE IF NOT EXISTS "factures" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "eleveId" TEXT NOT NULL REFERENCES "eleves"("id") ON DELETE CASCADE,
  "numero" TEXT NOT NULL, "libelle" TEXT NOT NULL,
  "montant" FLOAT NOT NULL, "devise" TEXT NOT NULL DEFAULT 'XOF',
  "statut" "StatutFacture" NOT NULL DEFAULT 'EN_ATTENTE',
  "echeance" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "paiements" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "factureId" TEXT NOT NULL REFERENCES "factures"("id") ON DELETE CASCADE,
  "montant" FLOAT NOT NULL, "devise" TEXT NOT NULL DEFAULT 'XOF',
  "methode" TEXT NOT NULL, "reference" TEXT,
  "date" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "recu" TEXT
);

CREATE TABLE IF NOT EXISTS "documents" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL, "eleveId" TEXT REFERENCES "eleves"("id"),
  "nom" TEXT NOT NULL, "type" TEXT NOT NULL, "url" TEXT NOT NULL,
  "taille" INTEGER, "mimeType" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "evenements" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "titre" TEXT NOT NULL, "description" TEXT, "type" TEXT NOT NULL,
  "dateDebut" TIMESTAMPTZ NOT NULL, "dateFin" TIMESTAMPTZ,
  "lieu" TEXT, "couleur" TEXT, "cible" TEXT NOT NULL DEFAULT 'all',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "incidents" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "eleveId" TEXT NOT NULL REFERENCES "eleves"("id") ON DELETE CASCADE,
  "rapporteParId" TEXT REFERENCES "users"("id"),
  "type" "TypeIncident" NOT NULL DEFAULT 'AUTRE',
  "statut" "StatutIncident" NOT NULL DEFAULT 'OUVERT',
  "gravite" INTEGER NOT NULL DEFAULT 1, "description" TEXT NOT NULL,
  "lieu" TEXT, "date" TIMESTAMPTZ NOT NULL, "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "sanctions" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "incidentId" TEXT NOT NULL REFERENCES "incidents"("id") ON DELETE CASCADE,
  "type" "TypeSanction" NOT NULL,
  "description" TEXT, "dateDebut" TIMESTAMPTZ NOT NULL,
  "dateFin" TIMESTAMPTZ, "parentNotifie" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "parcours_scolaires" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "eleveId" TEXT NOT NULL REFERENCES "eleves"("id") ON DELETE CASCADE,
  "annee" TEXT NOT NULL, "classe" TEXT NOT NULL, "niveau" TEXT NOT NULL,
  "moyenneAnnuelle" FLOAT, "rang" INTEGER, "effectif" INTEGER,
  "decision" TEXT, "mention" TEXT,
  "recommandation" "TypeRecommandation", "commentaire" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("eleveId", "annee")
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "titre" TEXT NOT NULL, "contenu" TEXT NOT NULL,
  "canal" "CanalNotification" NOT NULL DEFAULT 'IN_APP',
  "statut" "StatutNotification" NOT NULL DEFAULT 'BROUILLON',
  "cible" "CibleNotification" NOT NULL DEFAULT 'TOUS',
  "classeId" TEXT, "niveau" TEXT,
  "envoyeParId" TEXT REFERENCES "users"("id"),
  "nbDestinataires" INTEGER NOT NULL DEFAULT 0,
  "nbDelivres" INTEGER NOT NULL DEFAULT 0,
  "nbLus" INTEGER NOT NULL DEFAULT 0,
  "planifieeAt" TIMESTAMPTZ, "envoyeeAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "fiches_rh" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "enseignantId" TEXT NOT NULL UNIQUE REFERENCES "enseignants"("id") ON DELETE CASCADE,
  "typeContrat" "TypeContrat" NOT NULL DEFAULT 'CDI',
  "dateEntree" TIMESTAMPTZ, "dateSortie" TIMESTAMPTZ,
  "salaireBase" FLOAT, "tarifHoraire" FLOAT,
  "diplome" TEXT, "echelon" INTEGER NOT NULL DEFAULT 1, "grade" TEXT,
  "banque" TEXT, "rib" TEXT, "iban" TEXT,
  "congesAnnuels" INTEGER NOT NULL DEFAULT 30,
  "congesPris" INTEGER NOT NULL DEFAULT 0,
  "absencesCount" INTEGER NOT NULL DEFAULT 0,
  "evaluation" TEXT, "observations" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "bulletins_paie" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "ficheRHId" TEXT NOT NULL REFERENCES "fiches_rh"("id") ON DELETE CASCADE,
  "mois" INTEGER NOT NULL, "annee" INTEGER NOT NULL,
  "heuresEffectuees" FLOAT NOT NULL DEFAULT 0,
  "salaireBase" FLOAT NOT NULL DEFAULT 0,
  "primes" FLOAT NOT NULL DEFAULT 0, "deductions" FLOAT NOT NULL DEFAULT 0,
  "netAPayer" FLOAT NOT NULL DEFAULT 0,
  "isPaye" BOOLEAN NOT NULL DEFAULT FALSE,
  "datePaiement" TIMESTAMPTZ, "reference" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("ficheRHId", "mois", "annee")
);

CREATE TABLE IF NOT EXISTS "candidatures" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "nom" TEXT NOT NULL, "prenom" TEXT NOT NULL,
  "dateNaissance" TIMESTAMPTZ NOT NULL, "lieuNaissance" TEXT,
  "sexe" "Sexe" NOT NULL DEFAULT 'M', "nationalite" TEXT DEFAULT 'SN',
  "photoUrl" TEXT, "classeVoulue" TEXT NOT NULL, "annee" TEXT NOT NULL,
  "parentNom" TEXT NOT NULL, "parentPrenom" TEXT NOT NULL,
  "parentEmail" TEXT, "parentPhone" TEXT NOT NULL,
  "parentLien" "LienParente" NOT NULL DEFAULT 'PERE',
  "statut" "StatutCandidature" NOT NULL DEFAULT 'SOUMISE',
  "dateExamen" TIMESTAMPTZ, "noteExamen" FLOAT,
  "commentaire" TEXT, "motifRefus" TEXT, "documents" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "alumni" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "eleveId" TEXT, "nom" TEXT NOT NULL, "prenom" TEXT NOT NULL,
  "email" TEXT, "telephone" TEXT, "photoUrl" TEXT,
  "sexe" "Sexe" NOT NULL DEFAULT 'M', "dateNaissance" TIMESTAMPTZ,
  "anneeDiplome" TEXT NOT NULL, "classeDepart" TEXT NOT NULL,
  "mention" TEXT, "numeroDiplome" TEXT,
  "statut" "StatutAlumni" NOT NULL DEFAULT 'INCONNU',
  "etablissement" TEXT, "formation" TEXT, "ville" TEXT, "pays" TEXT,
  "linkedin" TEXT, "accepteContact" BOOLEAN NOT NULL DEFAULT TRUE,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "inventaire" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "nom" TEXT NOT NULL, "description" TEXT, "reference" TEXT,
  "categorie" "CategorieItem" NOT NULL DEFAULT 'AUTRE',
  "etat" "EtatItem" NOT NULL DEFAULT 'BON',
  "quantite" INTEGER NOT NULL DEFAULT 1, "quantiteMin" INTEGER NOT NULL DEFAULT 0,
  "localisation" TEXT, "fournisseur" TEXT, "prixUnitaire" FLOAT,
  "devise" TEXT NOT NULL DEFAULT 'XOF',
  "dateAchat" TIMESTAMPTZ, "dateGarantie" TIMESTAMPTZ, "dateRevision" TIMESTAMPTZ,
  "photoUrl" TEXT, "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL, "subject" TEXT,
  "isGroup" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "conversation_participants" (
  "conversationId" TEXT NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "lastReadAt" TIMESTAMPTZ,
  PRIMARY KEY ("conversationId", "userId")
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "conversationId" TEXT NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "senderId" TEXT NOT NULL REFERENCES "users"("id"),
  "content" TEXT NOT NULL,
  "readBy" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "cours" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL, "titre" TEXT NOT NULL, "description" TEXT,
  "niveau" "NiveauCours" NOT NULL DEFAULT 'INTERMEDIAIRE',
  "statut" "StatutCours" NOT NULL DEFAULT 'BROUILLON',
  "matiereNom" TEXT, "classeNom" TEXT, "auteurNom" TEXT,
  "imageUrl" TEXT, "dureeMin" INTEGER,
  "nbVues" INTEGER NOT NULL DEFAULT 0, "nbInscrits" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "contenus_cours" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "coursId" TEXT NOT NULL REFERENCES "cours"("id") ON DELETE CASCADE,
  "titre" TEXT NOT NULL,
  "type" "TypeContenu" NOT NULL DEFAULT 'TEXTE',
  "ordre" INTEGER NOT NULL DEFAULT 0,
  "url" TEXT, "texte" TEXT, "dureeMin" INTEGER,
  "isGratuit" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "progressions_eleves" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "coursId" TEXT NOT NULL REFERENCES "cours"("id") ON DELETE CASCADE,
  "eleveNom" TEXT NOT NULL, "eleveId" TEXT,
  "contenusVus" TEXT[] NOT NULL DEFAULT '{}',
  "pctCompletion" INTEGER NOT NULL DEFAULT 0,
  "noteFinale" FLOAT, "isTermine" BOOLEAN NOT NULL DEFAULT FALSE,
  "termineeAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("coursId", "eleveNom")
);

-- ============================================================
-- 4. INDEX DE PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_tenantId ON "users"("tenantId");
CREATE INDEX IF NOT EXISTS idx_eleves_tenantId ON "eleves"("tenantId");
CREATE INDEX IF NOT EXISTS idx_eleves_classeId ON "eleves"("classeId");
CREATE INDEX IF NOT EXISTS idx_absences_tenantId ON "absences"("tenantId");
CREATE INDEX IF NOT EXISTS idx_absences_eleveId ON "absences"("eleveId");
CREATE INDEX IF NOT EXISTS idx_notes_tenantId ON "notes"("tenantId");
CREATE INDEX IF NOT EXISTS idx_factures_tenantId ON "factures"("tenantId");
CREATE INDEX IF NOT EXISTS idx_incidents_tenantId ON "incidents"("tenantId");
CREATE INDEX IF NOT EXISTS idx_notifications_tenantId ON "notifications"("tenantId");
CREATE INDEX IF NOT EXISTS idx_cours_tenantId ON "cours"("tenantId");
CREATE INDEX IF NOT EXISTS idx_messages_conversationId ON "messages"("conversationId");

-- ============================================================
-- Migration EcolPro terminée avec succès ✓
-- ============================================================
