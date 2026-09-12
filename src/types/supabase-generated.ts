export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      _CompetencePrerequis: {
        Row: {
          A: string
          B: string
        }
        Insert: {
          A: string
          B: string
        }
        Update: {
          A?: string
          B?: string
        }
        Relationships: [
          {
            foreignKeyName: "_CompetencePrerequis_A_fkey"
            columns: ["A"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "_CompetencePrerequis_B_fkey"
            columns: ["B"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
        ]
      }
      _prisma_migrations: {
        Row: {
          applied_steps_count: number
          checksum: string
          finished_at: string | null
          id: string
          logs: string | null
          migration_name: string
          migration_script: string
          rolled_back_at: string | null
          started_at: string
        }
        Insert: {
          applied_steps_count?: number
          checksum: string
          finished_at?: string | null
          id: string
          logs?: string | null
          migration_name: string
          migration_script: string
          rolled_back_at?: string | null
          started_at?: string
        }
        Update: {
          applied_steps_count?: number
          checksum?: string
          finished_at?: string | null
          id?: string
          logs?: string | null
          migration_name?: string
          migration_script?: string
          rolled_back_at?: string | null
          started_at?: string
        }
        Relationships: []
      }
      absences: {
        Row: {
          commentaire: string | null
          createdAt: string
          date: string
          eleveId: string
          heureDebut: string | null
          heureFin: string | null
          id: string
          isRetard: boolean
          justificatif: string | null
          motif: Database["public"]["Enums"]["MotifAbsence"]
          parentNotifie: boolean
          parentNotifieAt: string | null
          saisieParId: string | null
          statut: Database["public"]["Enums"]["StatutAbsence"]
          tenantId: string
          updatedAt: string
        }
        Insert: {
          commentaire?: string | null
          createdAt?: string
          date: string
          eleveId: string
          heureDebut?: string | null
          heureFin?: string | null
          id: string
          isRetard?: boolean
          justificatif?: string | null
          motif?: Database["public"]["Enums"]["MotifAbsence"]
          parentNotifie?: boolean
          parentNotifieAt?: string | null
          saisieParId?: string | null
          statut?: Database["public"]["Enums"]["StatutAbsence"]
          tenantId: string
          updatedAt: string
        }
        Update: {
          commentaire?: string | null
          createdAt?: string
          date?: string
          eleveId?: string
          heureDebut?: string | null
          heureFin?: string | null
          id?: string
          isRetard?: boolean
          justificatif?: string | null
          motif?: Database["public"]["Enums"]["MotifAbsence"]
          parentNotifie?: boolean
          parentNotifieAt?: string | null
          saisieParId?: string | null
          statut?: Database["public"]["Enums"]["StatutAbsence"]
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      absences_personnel: {
        Row: {
          commentaire: string | null
          createdAt: string
          date: string
          enseignantId: string
          heureDebut: string | null
          heureFin: string | null
          id: string
          justificatif: string | null
          motif: string | null
          saisieParId: string | null
          statut: Database["public"]["Enums"]["StatutAbsencePersonnel"]
          tenantId: string
          type: Database["public"]["Enums"]["TypeAbsencePersonnel"]
          updatedAt: string
        }
        Insert: {
          commentaire?: string | null
          createdAt?: string
          date: string
          enseignantId: string
          heureDebut?: string | null
          heureFin?: string | null
          id: string
          justificatif?: string | null
          motif?: string | null
          saisieParId?: string | null
          statut?: Database["public"]["Enums"]["StatutAbsencePersonnel"]
          tenantId: string
          type?: Database["public"]["Enums"]["TypeAbsencePersonnel"]
          updatedAt: string
        }
        Update: {
          commentaire?: string | null
          createdAt?: string
          date?: string
          enseignantId?: string
          heureDebut?: string | null
          heureFin?: string | null
          id?: string
          justificatif?: string | null
          motif?: string | null
          saisieParId?: string | null
          statut?: Database["public"]["Enums"]["StatutAbsencePersonnel"]
          tenantId?: string
          type?: Database["public"]["Enums"]["TypeAbsencePersonnel"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_personnel_enseignantId_fkey"
            columns: ["enseignantId"]
            isOneToOne: false
            referencedRelation: "enseignants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_personnel_saisieParId_fkey"
            columns: ["saisieParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_personnel_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          access_token: string | null
          expires_at: number | null
          id: string
          id_token: string | null
          provider: string
          providerAccountId: string
          refresh_token: string | null
          scope: string | null
          session_state: string | null
          token_type: string | null
          type: string
          userId: string
        }
        Insert: {
          access_token?: string | null
          expires_at?: number | null
          id: string
          id_token?: string | null
          provider: string
          providerAccountId: string
          refresh_token?: string | null
          scope?: string | null
          session_state?: string | null
          token_type?: string | null
          type: string
          userId: string
        }
        Update: {
          access_token?: string | null
          expires_at?: number | null
          id?: string
          id_token?: string | null
          provider?: string
          providerAccountId?: string
          refresh_token?: string | null
          scope?: string | null
          session_state?: string | null
          token_type?: string | null
          type?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      affectations_enseignants: {
        Row: {
          classeId: string
          createdAt: string
          enseignantId: string
          id: string
          matiereId: string
          tenantId: string
        }
        Insert: {
          classeId: string
          createdAt?: string
          enseignantId: string
          id: string
          matiereId: string
          tenantId: string
        }
        Update: {
          classeId?: string
          createdAt?: string
          enseignantId?: string
          id?: string
          matiereId?: string
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "affectations_enseignants_classeId_fkey"
            columns: ["classeId"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affectations_enseignants_enseignantId_fkey"
            columns: ["enseignantId"]
            isOneToOne: false
            referencedRelation: "enseignants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affectations_enseignants_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affectations_enseignants_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni: {
        Row: {
          accepteContact: boolean
          anneeDiplome: string
          classeDepart: string
          createdAt: string
          dateNaissance: string | null
          eleveId: string | null
          email: string | null
          etablissement: string | null
          formation: string | null
          id: string
          linkedin: string | null
          mention: string | null
          nom: string
          notes: string | null
          numeroDiplome: string | null
          pays: string | null
          photoUrl: string | null
          prenom: string
          sexe: Database["public"]["Enums"]["Sexe"]
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutAlumni"]
          telephone: string | null
          tenantId: string
          updatedAt: string
          ville: string | null
        }
        Insert: {
          accepteContact?: boolean
          anneeDiplome: string
          classeDepart: string
          createdAt?: string
          dateNaissance?: string | null
          eleveId?: string | null
          email?: string | null
          etablissement?: string | null
          formation?: string | null
          id: string
          linkedin?: string | null
          mention?: string | null
          nom: string
          notes?: string | null
          numeroDiplome?: string | null
          pays?: string | null
          photoUrl?: string | null
          prenom: string
          sexe?: Database["public"]["Enums"]["Sexe"]
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutAlumni"]
          telephone?: string | null
          tenantId: string
          updatedAt: string
          ville?: string | null
        }
        Update: {
          accepteContact?: boolean
          anneeDiplome?: string
          classeDepart?: string
          createdAt?: string
          dateNaissance?: string | null
          eleveId?: string | null
          email?: string | null
          etablissement?: string | null
          formation?: string | null
          id?: string
          linkedin?: string | null
          mention?: string | null
          nom?: string
          notes?: string | null
          numeroDiplome?: string | null
          pays?: string | null
          photoUrl?: string | null
          prenom?: string
          sexe?: Database["public"]["Enums"]["Sexe"]
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutAlumni"]
          telephone?: string | null
          tenantId?: string
          updatedAt?: string
          ville?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alumni_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      annees_scolaires: {
        Row: {
          archiveeAt: string | null
          archiveePar: string | null
          cloturedAt: string | null
          cloturePar: string | null
          dateDebut: string
          dateFin: string
          id: string
          isCurrent: boolean
          libelle: string
          statut: string
          tenantId: string
        }
        Insert: {
          archiveeAt?: string | null
          archiveePar?: string | null
          cloturedAt?: string | null
          cloturePar?: string | null
          dateDebut: string
          dateFin: string
          id: string
          isCurrent?: boolean
          libelle: string
          statut?: string
          tenantId: string
        }
        Update: {
          archiveeAt?: string | null
          archiveePar?: string | null
          cloturedAt?: string | null
          cloturePar?: string | null
          dateDebut?: string
          dateFin?: string
          id?: string
          isCurrent?: boolean
          libelle?: string
          statut?: string
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "annees_scolaires_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          createdAt: string
          id: string
          ip: string | null
          metadata: Json | null
          reason: string | null
          resource: string | null
          resourceId: string | null
          tenantId: string | null
          userAgent: string | null
          userId: string | null
          verdict: Database["public"]["Enums"]["AuditVerdict"]
        }
        Insert: {
          action: string
          createdAt?: string
          id: string
          ip?: string | null
          metadata?: Json | null
          reason?: string | null
          resource?: string | null
          resourceId?: string | null
          tenantId?: string | null
          userAgent?: string | null
          userId?: string | null
          verdict: Database["public"]["Enums"]["AuditVerdict"]
        }
        Update: {
          action?: string
          createdAt?: string
          id?: string
          ip?: string | null
          metadata?: Json | null
          reason?: string | null
          resource?: string | null
          resourceId?: string | null
          tenantId?: string | null
          userAgent?: string | null
          userId?: string | null
          verdict?: Database["public"]["Enums"]["AuditVerdict"]
        }
        Relationships: []
      }
      budgets: {
        Row: {
          annee: string
          categorie: Database["public"]["Enums"]["CategorieBudget"]
          createdAt: string
          description: string | null
          devise: string
          id: string
          montantDepense: number
          montantPrevu: number
          siteId: string | null
          statut: string
          tenantId: string
          updatedAt: string
        }
        Insert: {
          annee: string
          categorie: Database["public"]["Enums"]["CategorieBudget"]
          createdAt?: string
          description?: string | null
          devise?: string
          id: string
          montantDepense?: number
          montantPrevu: number
          siteId?: string | null
          statut?: string
          tenantId: string
          updatedAt: string
        }
        Update: {
          annee?: string
          categorie?: Database["public"]["Enums"]["CategorieBudget"]
          createdAt?: string
          description?: string | null
          devise?: string
          id?: string
          montantDepense?: number
          montantPrevu?: number
          siteId?: string | null
          statut?: string
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_historique: {
        Row: {
          action: string
          ancienneValeur: string | null
          auteurId: string | null
          auteurNom: string | null
          auteurRole: string | null
          bulletinId: string
          champ: string
          createdAt: string
          id: string
          nouvelleValeur: string | null
          tenantId: string
        }
        Insert: {
          action: string
          ancienneValeur?: string | null
          auteurId?: string | null
          auteurNom?: string | null
          auteurRole?: string | null
          bulletinId: string
          champ: string
          createdAt?: string
          id: string
          nouvelleValeur?: string | null
          tenantId: string
        }
        Update: {
          action?: string
          ancienneValeur?: string | null
          auteurId?: string | null
          auteurNom?: string | null
          auteurRole?: string | null
          bulletinId?: string
          champ?: string
          createdAt?: string
          id?: string
          nouvelleValeur?: string | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_historique_bulletinId_fkey"
            columns: ["bulletinId"]
            isOneToOne: false
            referencedRelation: "bulletins"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_matieres: {
        Row: {
          appreciation: string | null
          bulletinId: string
          coefficient: number
          id: string
          matiereId: string
          moyenneEleve: number | null
          moyenneMax: number | null
          moyenneMin: number | null
          nomProfesseur: string | null
          rang: number | null
          tenantId: string
        }
        Insert: {
          appreciation?: string | null
          bulletinId: string
          coefficient: number
          id: string
          matiereId: string
          moyenneEleve?: number | null
          moyenneMax?: number | null
          moyenneMin?: number | null
          nomProfesseur?: string | null
          rang?: number | null
          tenantId: string
        }
        Update: {
          appreciation?: string | null
          bulletinId?: string
          coefficient?: number
          id?: string
          matiereId?: string
          moyenneEleve?: number | null
          moyenneMax?: number | null
          moyenneMin?: number | null
          nomProfesseur?: string | null
          rang?: number | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_matieres_bulletinId_fkey"
            columns: ["bulletinId"]
            isOneToOne: false
            referencedRelation: "bulletins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_matieres_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletins: {
        Row: {
          appreciation: string | null
          createdAt: string
          decision: string | null
          effectifClasse: number | null
          eleveId: string
          heuresAbsence: number | null
          id: string
          isPublie: boolean
          moyenneClasse: number | null
          moyenneGenerale: number | null
          moyennePremier: number | null
          pdfUrl: string | null
          periodeId: string
          publishedAt: string | null
          rang: number | null
          statut: string
          tenantId: string
          updatedAt: string
          verrouilleAt: string | null
          verrouilleParId: string | null
        }
        Insert: {
          appreciation?: string | null
          createdAt?: string
          decision?: string | null
          effectifClasse?: number | null
          eleveId: string
          heuresAbsence?: number | null
          id: string
          isPublie?: boolean
          moyenneClasse?: number | null
          moyenneGenerale?: number | null
          moyennePremier?: number | null
          pdfUrl?: string | null
          periodeId: string
          publishedAt?: string | null
          rang?: number | null
          statut?: string
          tenantId: string
          updatedAt: string
          verrouilleAt?: string | null
          verrouilleParId?: string | null
        }
        Update: {
          appreciation?: string | null
          createdAt?: string
          decision?: string | null
          effectifClasse?: number | null
          eleveId?: string
          heuresAbsence?: number | null
          id?: string
          isPublie?: boolean
          moyenneClasse?: number | null
          moyenneGenerale?: number | null
          moyennePremier?: number | null
          pdfUrl?: string | null
          periodeId?: string
          publishedAt?: string | null
          rang?: number | null
          statut?: string
          tenantId?: string
          updatedAt?: string
          verrouilleAt?: string | null
          verrouilleParId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bulletins_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletins_periodeId_fkey"
            columns: ["periodeId"]
            isOneToOne: false
            referencedRelation: "periodes"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletins_paie: {
        Row: {
          annee: number
          createdAt: string
          datePaiement: string | null
          deductions: number
          ficheRHId: string
          heuresEffectuees: number
          id: string
          isPaye: boolean
          mois: number
          netAPayer: number
          primes: number
          reference: string | null
          salaireBase: number
        }
        Insert: {
          annee: number
          createdAt?: string
          datePaiement?: string | null
          deductions?: number
          ficheRHId: string
          heuresEffectuees?: number
          id: string
          isPaye?: boolean
          mois: number
          netAPayer?: number
          primes?: number
          reference?: string | null
          salaireBase?: number
        }
        Update: {
          annee?: number
          createdAt?: string
          datePaiement?: string | null
          deductions?: number
          ficheRHId?: string
          heuresEffectuees?: number
          id?: string
          isPaye?: boolean
          mois?: number
          netAPayer?: number
          primes?: number
          reference?: string | null
          salaireBase?: number
        }
        Relationships: [
          {
            foreignKeyName: "bulletins_paie_ficheRHId_fkey"
            columns: ["ficheRHId"]
            isOneToOne: false
            referencedRelation: "fiches_rh"
            referencedColumns: ["id"]
          },
        ]
      }
      calendriers_officiels: {
        Row: {
          anneeLibelle: string
          country: string
          createdAt: string
          dateDebut: string
          dateFin: string
          id: string
          libelle: string
          source: string
          type: string
          updatedAt: string
        }
        Insert: {
          anneeLibelle: string
          country: string
          createdAt?: string
          dateDebut: string
          dateFin: string
          id: string
          libelle: string
          source?: string
          type: string
          updatedAt: string
        }
        Update: {
          anneeLibelle?: string
          country?: string
          createdAt?: string
          dateDebut?: string
          dateFin?: string
          id?: string
          libelle?: string
          source?: string
          type?: string
          updatedAt?: string
        }
        Relationships: []
      }
      campagne_reinscription: {
        Row: {
          anneeCible: string
          anneeSource: string
          creeParId: string | null
          dateDebut: string
          dateFin: string | null
          etapeActuelle: number
          id: string
          libelle: string
          nbDiplomes: number
          nbElevesTotal: number
          nbNonReinscrits: number
          nbReinscrits: number
          revenusPrevus: number
          statut: string
          tenantId: string
        }
        Insert: {
          anneeCible: string
          anneeSource: string
          creeParId?: string | null
          dateDebut?: string
          dateFin?: string | null
          etapeActuelle?: number
          id: string
          libelle: string
          nbDiplomes?: number
          nbElevesTotal?: number
          nbNonReinscrits?: number
          nbReinscrits?: number
          revenusPrevus?: number
          statut?: string
          tenantId: string
        }
        Update: {
          anneeCible?: string
          anneeSource?: string
          creeParId?: string | null
          dateDebut?: string
          dateFin?: string | null
          etapeActuelle?: number
          id?: string
          libelle?: string
          nbDiplomes?: number
          nbElevesTotal?: number
          nbNonReinscrits?: number
          nbReinscrits?: number
          revenusPrevus?: number
          statut?: string
          tenantId?: string
        }
        Relationships: []
      }
      candidatures: {
        Row: {
          annee: string
          classeVoulue: string
          closLe: string | null
          commentaire: string | null
          createdAt: string
          creeParId: string | null
          dateExamen: string | null
          dateNaissance: string
          documents: Json | null
          documentsInscription: Json | null
          dossierStatut: Database["public"]["Enums"]["StatutDossier"]
          id: string
          lieuNaissance: string | null
          motifRefus: string | null
          nationalite: string | null
          nom: string
          noteExamen: number | null
          parentEmail: string | null
          parentLien: Database["public"]["Enums"]["LienParente"]
          parentNom: string
          parentPhone: string
          parentPrenom: string
          photoUrl: string | null
          prenom: string
          sexe: Database["public"]["Enums"]["Sexe"]
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutCandidature"]
          tenantId: string
          updatedAt: string
          valideLe: string | null
          valideParId: string | null
        }
        Insert: {
          annee: string
          classeVoulue: string
          closLe?: string | null
          commentaire?: string | null
          createdAt?: string
          creeParId?: string | null
          dateExamen?: string | null
          dateNaissance: string
          documents?: Json | null
          documentsInscription?: Json | null
          dossierStatut?: Database["public"]["Enums"]["StatutDossier"]
          id: string
          lieuNaissance?: string | null
          motifRefus?: string | null
          nationalite?: string | null
          nom: string
          noteExamen?: number | null
          parentEmail?: string | null
          parentLien?: Database["public"]["Enums"]["LienParente"]
          parentNom: string
          parentPhone: string
          parentPrenom: string
          photoUrl?: string | null
          prenom: string
          sexe?: Database["public"]["Enums"]["Sexe"]
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutCandidature"]
          tenantId: string
          updatedAt: string
          valideLe?: string | null
          valideParId?: string | null
        }
        Update: {
          annee?: string
          classeVoulue?: string
          closLe?: string | null
          commentaire?: string | null
          createdAt?: string
          creeParId?: string | null
          dateExamen?: string | null
          dateNaissance?: string
          documents?: Json | null
          documentsInscription?: Json | null
          dossierStatut?: Database["public"]["Enums"]["StatutDossier"]
          id?: string
          lieuNaissance?: string | null
          motifRefus?: string | null
          nationalite?: string | null
          nom?: string
          noteExamen?: number | null
          parentEmail?: string | null
          parentLien?: Database["public"]["Enums"]["LienParente"]
          parentNom?: string
          parentPhone?: string
          parentPrenom?: string
          photoUrl?: string | null
          prenom?: string
          sexe?: Database["public"]["Enums"]["Sexe"]
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutCandidature"]
          tenantId?: string
          updatedAt?: string
          valideLe?: string | null
          valideParId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidatures_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidatures_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          annee: string
          deletedAt: string | null
          deletedBy: string | null
          deletedReason: string | null
          effectifMax: number
          filiere: string | null
          id: string
          niveau: string
          nom: string
          profPrincipalId: string | null
          siteId: string | null
          structureId: string | null
          tenantId: string
        }
        Insert: {
          annee: string
          deletedAt?: string | null
          deletedBy?: string | null
          deletedReason?: string | null
          effectifMax?: number
          filiere?: string | null
          id: string
          niveau: string
          nom: string
          profPrincipalId?: string | null
          siteId?: string | null
          structureId?: string | null
          tenantId: string
        }
        Update: {
          annee?: string
          deletedAt?: string | null
          deletedBy?: string | null
          deletedReason?: string | null
          effectifMax?: number
          filiere?: string | null
          id?: string
          niveau?: string
          nom?: string
          profPrincipalId?: string | null
          siteId?: string | null
          structureId?: string | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_profPrincipalId_fkey"
            columns: ["profPrincipalId"]
            isOneToOne: false
            referencedRelation: "enseignants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_structureId_fkey"
            columns: ["structureId"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conges_personnel: {
        Row: {
          approuveAt: string | null
          approuveParId: string | null
          commentaire: string | null
          createdAt: string
          dateDebut: string
          dateFin: string
          demandeParId: string | null
          enseignantId: string
          id: string
          justificatif: string | null
          motif: string | null
          nbJours: number
          statut: Database["public"]["Enums"]["StatutConge"]
          tenantId: string
          type: Database["public"]["Enums"]["TypeConge"]
          updatedAt: string
        }
        Insert: {
          approuveAt?: string | null
          approuveParId?: string | null
          commentaire?: string | null
          createdAt?: string
          dateDebut: string
          dateFin: string
          demandeParId?: string | null
          enseignantId: string
          id: string
          justificatif?: string | null
          motif?: string | null
          nbJours: number
          statut?: Database["public"]["Enums"]["StatutConge"]
          tenantId: string
          type?: Database["public"]["Enums"]["TypeConge"]
          updatedAt: string
        }
        Update: {
          approuveAt?: string | null
          approuveParId?: string | null
          commentaire?: string | null
          createdAt?: string
          dateDebut?: string
          dateFin?: string
          demandeParId?: string | null
          enseignantId?: string
          id?: string
          justificatif?: string | null
          motif?: string | null
          nbJours?: number
          statut?: Database["public"]["Enums"]["StatutConge"]
          tenantId?: string
          type?: Database["public"]["Enums"]["TypeConge"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "conges_personnel_approuveParId_fkey"
            columns: ["approuveParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conges_personnel_demandeParId_fkey"
            columns: ["demandeParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conges_personnel_enseignantId_fkey"
            columns: ["enseignantId"]
            isOneToOne: false
            referencedRelation: "enseignants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conges_personnel_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conseils: {
        Row: {
          createdAt: string
          description: string | null
          frequence: string
          id: string
          nom: string
          tenantId: string
          type: string
          updatedAt: string
        }
        Insert: {
          createdAt?: string
          description?: string | null
          frequence?: string
          id: string
          nom: string
          tenantId: string
          type: string
          updatedAt: string
        }
        Update: {
          createdAt?: string
          description?: string | null
          frequence?: string
          id?: string
          nom?: string
          tenantId?: string
          type?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "conseils_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contenus_cours: {
        Row: {
          coursId: string
          createdAt: string
          dureeMin: number | null
          id: string
          isGratuit: boolean
          ordre: number
          texte: string | null
          titre: string
          type: Database["public"]["Enums"]["TypeContenu"]
          url: string | null
        }
        Insert: {
          coursId: string
          createdAt?: string
          dureeMin?: number | null
          id: string
          isGratuit?: boolean
          ordre?: number
          texte?: string | null
          titre: string
          type?: Database["public"]["Enums"]["TypeContenu"]
          url?: string | null
        }
        Update: {
          coursId?: string
          createdAt?: string
          dureeMin?: number | null
          id?: string
          isGratuit?: boolean
          ordre?: number
          texte?: string | null
          titre?: string
          type?: Database["public"]["Enums"]["TypeContenu"]
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contenus_cours_coursId_fkey"
            columns: ["coursId"]
            isOneToOne: false
            referencedRelation: "cours"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversationId: string
          joinedAt: string
          lastReadAt: string | null
          role: Database["public"]["Enums"]["ParticipantRole"]
          userId: string
        }
        Insert: {
          conversationId: string
          joinedAt?: string
          lastReadAt?: string | null
          role?: Database["public"]["Enums"]["ParticipantRole"]
          userId: string
        }
        Update: {
          conversationId?: string
          joinedAt?: string
          lastReadAt?: string | null
          role?: Database["public"]["Enums"]["ParticipantRole"]
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversationId_fkey"
            columns: ["conversationId"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          classeId: string | null
          createdAt: string
          createdBy: string
          id: string
          isGroup: boolean
          pinned: boolean
          readOnly: boolean
          siteId: string | null
          subject: string | null
          tenantId: string
          type: Database["public"]["Enums"]["ConversationType"]
          updatedAt: string
        }
        Insert: {
          classeId?: string | null
          createdAt?: string
          createdBy: string
          id: string
          isGroup?: boolean
          pinned?: boolean
          readOnly?: boolean
          siteId?: string | null
          subject?: string | null
          tenantId: string
          type?: Database["public"]["Enums"]["ConversationType"]
          updatedAt: string
        }
        Update: {
          classeId?: string | null
          createdAt?: string
          createdBy?: string
          id?: string
          isGroup?: boolean
          pinned?: boolean
          readOnly?: boolean
          siteId?: string | null
          subject?: string | null
          tenantId?: string
          type?: Database["public"]["Enums"]["ConversationType"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_classeId_fkey"
            columns: ["classeId"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_createdBy_fkey"
            columns: ["createdBy"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cours: {
        Row: {
          auteurNom: string | null
          classeNom: string | null
          country: string | null
          createdAt: string
          description: string | null
          dureeMin: number | null
          id: string
          imageUrl: string | null
          matiereNom: string | null
          nbInscrits: number
          nbVues: number
          niveau: Database["public"]["Enums"]["NiveauCours"]
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutCours"]
          tenantId: string | null
          titre: string
          updatedAt: string
        }
        Insert: {
          auteurNom?: string | null
          classeNom?: string | null
          country?: string | null
          createdAt?: string
          description?: string | null
          dureeMin?: number | null
          id: string
          imageUrl?: string | null
          matiereNom?: string | null
          nbInscrits?: number
          nbVues?: number
          niveau?: Database["public"]["Enums"]["NiveauCours"]
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutCours"]
          tenantId?: string | null
          titre: string
          updatedAt: string
        }
        Update: {
          auteurNom?: string | null
          classeNom?: string | null
          country?: string | null
          createdAt?: string
          description?: string | null
          dureeMin?: number | null
          id?: string
          imageUrl?: string | null
          matiereNom?: string | null
          nbInscrits?: number
          nbVues?: number
          niveau?: Database["public"]["Enums"]["NiveauCours"]
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutCours"]
          tenantId?: string | null
          titre?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "cours_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      demandes_fournitures: {
        Row: {
          commentaireValidation: string | null
          createdAt: string
          description: string | null
          enseignantId: string
          format: string | null
          id: string
          matiereId: string | null
          niveau: string
          nom: string
          prixEstime: number | null
          quantite: number
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutDemandeFourniture"]
          tenantId: string
          type: Database["public"]["Enums"]["TypeFourniture"]
          updatedAt: string
          valideeLe: string | null
          valideeParId: string | null
        }
        Insert: {
          commentaireValidation?: string | null
          createdAt?: string
          description?: string | null
          enseignantId: string
          format?: string | null
          id: string
          matiereId?: string | null
          niveau: string
          nom: string
          prixEstime?: number | null
          quantite?: number
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutDemandeFourniture"]
          tenantId: string
          type: Database["public"]["Enums"]["TypeFourniture"]
          updatedAt: string
          valideeLe?: string | null
          valideeParId?: string | null
        }
        Update: {
          commentaireValidation?: string | null
          createdAt?: string
          description?: string | null
          enseignantId?: string
          format?: string | null
          id?: string
          matiereId?: string | null
          niveau?: string
          nom?: string
          prixEstime?: number | null
          quantite?: number
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutDemandeFourniture"]
          tenantId?: string
          type?: Database["public"]["Enums"]["TypeFourniture"]
          updatedAt?: string
          valideeLe?: string | null
          valideeParId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demandes_fournitures_enseignantId_fkey"
            columns: ["enseignantId"]
            isOneToOne: false
            referencedRelation: "enseignants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_fournitures_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_fournitures_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_fournitures_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      demandes_lien_parent: {
        Row: {
          createdAt: string
          dateNaissanceSaisie: string
          eleveId: string
          id: string
          matriculeSaisi: string
          motifRefus: string | null
          parentId: string
          statut: Database["public"]["Enums"]["StatutDemandeLien"]
          tenantId: string
          traiteLe: string | null
          traitePar: string | null
          updatedAt: string
        }
        Insert: {
          createdAt?: string
          dateNaissanceSaisie: string
          eleveId: string
          id: string
          matriculeSaisi: string
          motifRefus?: string | null
          parentId: string
          statut?: Database["public"]["Enums"]["StatutDemandeLien"]
          tenantId: string
          traiteLe?: string | null
          traitePar?: string | null
          updatedAt: string
        }
        Update: {
          createdAt?: string
          dateNaissanceSaisie?: string
          eleveId?: string
          id?: string
          matriculeSaisi?: string
          motifRefus?: string | null
          parentId?: string
          statut?: Database["public"]["Enums"]["StatutDemandeLien"]
          tenantId?: string
          traiteLe?: string | null
          traitePar?: string | null
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "demandes_lien_parent_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_lien_parent_parentId_fkey"
            columns: ["parentId"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_lien_parent_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      depenses: {
        Row: {
          autoriseParId: string | null
          budgetId: string | null
          categorie: Database["public"]["Enums"]["CategorieBudget"]
          createdAt: string
          date: string
          description: string | null
          devise: string
          enregistreParId: string | null
          fournisseur: string | null
          fournisseurContact: string | null
          id: string
          justificatifUrl: string | null
          libelle: string
          methodePaiement: string | null
          montant: number
          payeParId: string | null
          reference: string | null
          siteId: string | null
          tenantId: string
          typeEngagement: string | null
          updatedAt: string
        }
        Insert: {
          autoriseParId?: string | null
          budgetId?: string | null
          categorie?: Database["public"]["Enums"]["CategorieBudget"]
          createdAt?: string
          date: string
          description?: string | null
          devise?: string
          enregistreParId?: string | null
          fournisseur?: string | null
          fournisseurContact?: string | null
          id: string
          justificatifUrl?: string | null
          libelle: string
          methodePaiement?: string | null
          montant: number
          payeParId?: string | null
          reference?: string | null
          siteId?: string | null
          tenantId: string
          typeEngagement?: string | null
          updatedAt: string
        }
        Update: {
          autoriseParId?: string | null
          budgetId?: string | null
          categorie?: Database["public"]["Enums"]["CategorieBudget"]
          createdAt?: string
          date?: string
          description?: string | null
          devise?: string
          enregistreParId?: string | null
          fournisseur?: string | null
          fournisseurContact?: string | null
          id?: string
          justificatifUrl?: string | null
          libelle?: string
          methodePaiement?: string | null
          montant?: number
          payeParId?: string | null
          reference?: string | null
          siteId?: string | null
          tenantId?: string
          typeEngagement?: string | null
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "depenses_autoriseParId_fkey"
            columns: ["autoriseParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depenses_budgetId_fkey"
            columns: ["budgetId"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depenses_enregistreParId_fkey"
            columns: ["enregistreParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depenses_payeParId_fkey"
            columns: ["payeParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depenses_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depenses_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          createdAt: string
          id: string
          isActive: boolean
          platform: Database["public"]["Enums"]["PlatformMobile"]
          tenantId: string | null
          token: string
          updatedAt: string
          userId: string
        }
        Insert: {
          createdAt?: string
          id: string
          isActive?: boolean
          platform?: Database["public"]["Enums"]["PlatformMobile"]
          tenantId?: string | null
          token: string
          updatedAt: string
          userId: string
        }
        Update: {
          createdAt?: string
          id?: string
          isActive?: boolean
          platform?: Database["public"]["Enums"]["PlatformMobile"]
          tenantId?: string | null
          token?: string
          updatedAt?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      devoirs: {
        Row: {
          classeId: string
          createdAt: string
          dateDonne: string
          dateRendu: string
          description: string | null
          enseignantId: string | null
          id: string
          matiereId: string
          seanceId: string | null
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutDevoir"]
          tenantId: string
          titre: string
          type: Database["public"]["Enums"]["DevoirType"]
          updatedAt: string
        }
        Insert: {
          classeId: string
          createdAt?: string
          dateDonne?: string
          dateRendu: string
          description?: string | null
          enseignantId?: string | null
          id: string
          matiereId: string
          seanceId?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutDevoir"]
          tenantId: string
          titre: string
          type?: Database["public"]["Enums"]["DevoirType"]
          updatedAt: string
        }
        Update: {
          classeId?: string
          createdAt?: string
          dateDonne?: string
          dateRendu?: string
          description?: string | null
          enseignantId?: string | null
          id?: string
          matiereId?: string
          seanceId?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutDevoir"]
          tenantId?: string
          titre?: string
          type?: Database["public"]["Enums"]["DevoirType"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "devoirs_classeId_fkey"
            columns: ["classeId"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoirs_enseignantId_fkey"
            columns: ["enseignantId"]
            isOneToOne: false
            referencedRelation: "enseignants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoirs_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoirs_seanceId_fkey"
            columns: ["seanceId"]
            isOneToOne: false
            referencedRelation: "seances_pedagogiques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoirs_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoirs_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dispenses_matiere: {
        Row: {
          createdAt: string
          eleveId: string
          id: string
          matiereId: string
          motif: string | null
          periodeId: string | null
          tenantId: string
          updatedAt: string
        }
        Insert: {
          createdAt?: string
          eleveId: string
          id: string
          matiereId: string
          motif?: string | null
          periodeId?: string | null
          tenantId: string
          updatedAt: string
        }
        Update: {
          createdAt?: string
          eleveId?: string
          id?: string
          matiereId?: string
          motif?: string | null
          periodeId?: string | null
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispenses_matiere_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispenses_matiere_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispenses_matiere_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      disponibilites_enseignants: {
        Row: {
          enseignantId: string
          heureDebut: string
          heureFin: string
          id: string
          jour: Database["public"]["Enums"]["Jour"]
          siteId: string | null
          tenantId: string
        }
        Insert: {
          enseignantId: string
          heureDebut: string
          heureFin: string
          id: string
          jour: Database["public"]["Enums"]["Jour"]
          siteId?: string | null
          tenantId: string
        }
        Update: {
          enseignantId?: string
          heureDebut?: string
          heureFin?: string
          id?: string
          jour?: Database["public"]["Enums"]["Jour"]
          siteId?: string | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "disponibilites_enseignants_enseignantId_fkey"
            columns: ["enseignantId"]
            isOneToOne: false
            referencedRelation: "enseignants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilites_enseignants_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilites_enseignants_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          createdAt: string
          eleveId: string | null
          id: string
          mimeType: string | null
          nom: string
          taille: number | null
          tenantId: string
          type: string
          url: string
        }
        Insert: {
          createdAt?: string
          eleveId?: string | null
          id: string
          mimeType?: string | null
          nom: string
          taille?: number | null
          tenantId: string
          type: string
          url: string
        }
        Update: {
          createdAt?: string
          eleveId?: string | null
          id?: string
          mimeType?: string | null
          nom?: string
          taille?: number | null
          tenantId?: string
          type?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
        ]
      }
      echeances_paiement: {
        Row: {
          createdAt: string
          dateEcheance: string
          devise: string
          echeancierId: string
          factureId: string
          id: string
          montant: number
          numero: number
          paiementId: string | null
          payeeLe: string | null
          statut: string
          updatedAt: string
        }
        Insert: {
          createdAt?: string
          dateEcheance: string
          devise?: string
          echeancierId: string
          factureId: string
          id: string
          montant: number
          numero: number
          paiementId?: string | null
          payeeLe?: string | null
          statut?: string
          updatedAt: string
        }
        Update: {
          createdAt?: string
          dateEcheance?: string
          devise?: string
          echeancierId?: string
          factureId?: string
          id?: string
          montant?: number
          numero?: number
          paiementId?: string | null
          payeeLe?: string | null
          statut?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "echeances_paiement_echeancierId_fkey"
            columns: ["echeancierId"]
            isOneToOne: false
            referencedRelation: "echeanciers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "echeances_paiement_factureId_fkey"
            columns: ["factureId"]
            isOneToOne: false
            referencedRelation: "factures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "echeances_paiement_paiementId_fkey"
            columns: ["paiementId"]
            isOneToOne: false
            referencedRelation: "paiements"
            referencedColumns: ["id"]
          },
        ]
      }
      echeanciers: {
        Row: {
          createdAt: string
          datePremiereEcheance: string
          factureId: string
          id: string
          intervalleJours: number
          nbEcheances: number
          statut: string
          updatedAt: string
        }
        Insert: {
          createdAt?: string
          datePremiereEcheance: string
          factureId: string
          id: string
          intervalleJours?: number
          nbEcheances: number
          statut?: string
          updatedAt: string
        }
        Update: {
          createdAt?: string
          datePremiereEcheance?: string
          factureId?: string
          id?: string
          intervalleJours?: number
          nbEcheances?: number
          statut?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "echeanciers_factureId_fkey"
            columns: ["factureId"]
            isOneToOne: false
            referencedRelation: "factures"
            referencedColumns: ["id"]
          },
        ]
      }
      eleve_parents: {
        Row: {
          eleveId: string
          isGardien: boolean
          lien: Database["public"]["Enums"]["LienParente"]
          parentId: string
        }
        Insert: {
          eleveId: string
          isGardien?: boolean
          lien?: Database["public"]["Enums"]["LienParente"]
          parentId: string
        }
        Update: {
          eleveId?: string
          isGardien?: boolean
          lien?: Database["public"]["Enums"]["LienParente"]
          parentId?: string
        }
        Relationships: [
          {
            foreignKeyName: "eleve_parents_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleve_parents_parentId_fkey"
            columns: ["parentId"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      eleves: {
        Row: {
          allergies: string | null
          anneeInscription: string
          besoinsSpeciaux: string | null
          classeId: string | null
          contactUrgenceNom: string | null
          contactUrgencePhone: string | null
          createdAt: string
          dateInscription: string | null
          dateNaissance: string
          dateSortie: string | null
          deletedAt: string | null
          groupeSanguin: string | null
          id: string
          identiteKey: string | null
          importBatchId: string | null
          lieuNaissance: string | null
          matricule: string
          motifSortie: string | null
          nationalite: string | null
          nom: string
          numeroBoursier: string | null
          photoUrl: string | null
          prenom: string
          regime: string | null
          sexe: Database["public"]["Enums"]["Sexe"]
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutEleve"]
          tenantId: string
          transport: string | null
          updatedAt: string
          userId: string | null
        }
        Insert: {
          allergies?: string | null
          anneeInscription: string
          besoinsSpeciaux?: string | null
          classeId?: string | null
          contactUrgenceNom?: string | null
          contactUrgencePhone?: string | null
          createdAt?: string
          dateInscription?: string | null
          dateNaissance: string
          dateSortie?: string | null
          deletedAt?: string | null
          groupeSanguin?: string | null
          id: string
          identiteKey?: string | null
          importBatchId?: string | null
          lieuNaissance?: string | null
          matricule: string
          motifSortie?: string | null
          nationalite?: string | null
          nom: string
          numeroBoursier?: string | null
          photoUrl?: string | null
          prenom: string
          regime?: string | null
          sexe?: Database["public"]["Enums"]["Sexe"]
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutEleve"]
          tenantId: string
          transport?: string | null
          updatedAt: string
          userId?: string | null
        }
        Update: {
          allergies?: string | null
          anneeInscription?: string
          besoinsSpeciaux?: string | null
          classeId?: string | null
          contactUrgenceNom?: string | null
          contactUrgencePhone?: string | null
          createdAt?: string
          dateInscription?: string | null
          dateNaissance?: string
          dateSortie?: string | null
          deletedAt?: string | null
          groupeSanguin?: string | null
          id?: string
          identiteKey?: string | null
          importBatchId?: string | null
          lieuNaissance?: string | null
          matricule?: string
          motifSortie?: string | null
          nationalite?: string | null
          nom?: string
          numeroBoursier?: string | null
          photoUrl?: string | null
          prenom?: string
          regime?: string | null
          sexe?: Database["public"]["Enums"]["Sexe"]
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutEleve"]
          tenantId?: string
          transport?: string | null
          updatedAt?: string
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eleves_classeId_fkey"
            columns: ["classeId"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleves_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleves_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleves_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          bouncedAt: string | null
          complainedAt: string | null
          createdAt: string
          deliveredAt: string | null
          envoyeParId: string | null
          erreur: string | null
          id: string
          openedAt: string | null
          resendId: string | null
          resourceId: string | null
          statut: string
          subject: string
          tenantId: string | null
          to: string
          type: string | null
          updatedAt: string
        }
        Insert: {
          bouncedAt?: string | null
          complainedAt?: string | null
          createdAt?: string
          deliveredAt?: string | null
          envoyeParId?: string | null
          erreur?: string | null
          id: string
          openedAt?: string | null
          resendId?: string | null
          resourceId?: string | null
          statut?: string
          subject: string
          tenantId?: string | null
          to: string
          type?: string | null
          updatedAt: string
        }
        Update: {
          bouncedAt?: string | null
          complainedAt?: string | null
          createdAt?: string
          deliveredAt?: string | null
          envoyeParId?: string | null
          erreur?: string | null
          id?: string
          openedAt?: string | null
          resendId?: string | null
          resourceId?: string | null
          statut?: string
          subject?: string
          tenantId?: string | null
          to?: string
          type?: string | null
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_envoyeParId_fkey"
            columns: ["envoyeParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      emplois_temps: {
        Row: {
          annee: string
          classeId: string
          enseignantId: string | null
          heureDebut: string
          heureFin: string
          id: string
          jour: Database["public"]["Enums"]["Jour"]
          matiereId: string
          periodeId: string | null
          salle: string | null
          tenantId: string
        }
        Insert: {
          annee: string
          classeId: string
          enseignantId?: string | null
          heureDebut: string
          heureFin: string
          id: string
          jour: Database["public"]["Enums"]["Jour"]
          matiereId: string
          periodeId?: string | null
          salle?: string | null
          tenantId: string
        }
        Update: {
          annee?: string
          classeId?: string
          enseignantId?: string | null
          heureDebut?: string
          heureFin?: string
          id?: string
          jour?: Database["public"]["Enums"]["Jour"]
          matiereId?: string
          periodeId?: string | null
          salle?: string | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "emplois_temps_classeId_fkey"
            columns: ["classeId"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emplois_temps_enseignantId_fkey"
            columns: ["enseignantId"]
            isOneToOne: false
            referencedRelation: "enseignants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emplois_temps_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emplois_temps_periodeId_fkey"
            columns: ["periodeId"]
            isOneToOne: false
            referencedRelation: "periodes"
            referencedColumns: ["id"]
          },
        ]
      }
      enseignant_sites: {
        Row: {
          createdAt: string
          enseignantId: string
          id: string
          siteId: string
        }
        Insert: {
          createdAt?: string
          enseignantId: string
          id: string
          siteId: string
        }
        Update: {
          createdAt?: string
          enseignantId?: string
          id?: string
          siteId?: string
        }
        Relationships: [
          {
            foreignKeyName: "enseignant_sites_enseignantId_fkey"
            columns: ["enseignantId"]
            isOneToOne: false
            referencedRelation: "enseignants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enseignant_sites_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      enseignants: {
        Row: {
          dateEntree: string | null
          id: string
          matricule: string | null
          specialite: string | null
          tenantId: string
          typeContrat: string | null
          userId: string
        }
        Insert: {
          dateEntree?: string | null
          id: string
          matricule?: string | null
          specialite?: string | null
          tenantId: string
          typeContrat?: string | null
          userId: string
        }
        Update: {
          dateEntree?: string | null
          id?: string
          matricule?: string | null
          specialite?: string | null
          tenantId?: string
          typeContrat?: string | null
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "enseignants_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enseignants_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      entretiens_conseiller: {
        Row: {
          compteRendu: string | null
          conseillerId: string | null
          createdAt: string
          date: string
          decisions: string | null
          eleveId: string
          id: string
          motif: string
          prochainRendezVous: string | null
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutEntretien"]
          suivi: string | null
          tenantId: string
          updatedAt: string
        }
        Insert: {
          compteRendu?: string | null
          conseillerId?: string | null
          createdAt?: string
          date?: string
          decisions?: string | null
          eleveId: string
          id: string
          motif: string
          prochainRendezVous?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutEntretien"]
          suivi?: string | null
          tenantId: string
          updatedAt: string
        }
        Update: {
          compteRendu?: string | null
          conseillerId?: string | null
          createdAt?: string
          date?: string
          decisions?: string | null
          eleveId?: string
          id?: string
          motif?: string
          prochainRendezVous?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutEntretien"]
          suivi?: string | null
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "entretiens_conseiller_conseillerId_fkey"
            columns: ["conseillerId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entretiens_conseiller_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entretiens_conseiller_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entretiens_conseiller_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          classeId: string
          coefficient: number
          createdAt: string
          date: string
          description: string | null
          duree: number
          id: string
          matiereId: string
          periodeId: string
          statut: string
          tenantId: string
          titre: string
          type: Database["public"]["Enums"]["TypeNote"]
          updatedAt: string
        }
        Insert: {
          classeId: string
          coefficient?: number
          createdAt?: string
          date: string
          description?: string | null
          duree: number
          id: string
          matiereId: string
          periodeId: string
          statut?: string
          tenantId: string
          titre: string
          type?: Database["public"]["Enums"]["TypeNote"]
          updatedAt: string
        }
        Update: {
          classeId?: string
          coefficient?: number
          createdAt?: string
          date?: string
          description?: string | null
          duree?: number
          id?: string
          matiereId?: string
          periodeId?: string
          statut?: string
          tenantId?: string
          titre?: string
          type?: Database["public"]["Enums"]["TypeNote"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_classeId_fkey"
            columns: ["classeId"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_periodeId_fkey"
            columns: ["periodeId"]
            isOneToOne: false
            referencedRelation: "periodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      evenements: {
        Row: {
          cible: string
          couleur: string | null
          createdAt: string
          dateDebut: string
          dateFin: string | null
          description: string | null
          id: string
          lieu: string | null
          responsableId: string | null
          siteId: string | null
          tenantId: string
          titre: string
          type: string
        }
        Insert: {
          cible?: string
          couleur?: string | null
          createdAt?: string
          dateDebut: string
          dateFin?: string | null
          description?: string | null
          id: string
          lieu?: string | null
          responsableId?: string | null
          siteId?: string | null
          tenantId: string
          titre: string
          type: string
        }
        Update: {
          cible?: string
          couleur?: string | null
          createdAt?: string
          dateDebut?: string
          dateFin?: string | null
          description?: string | null
          id?: string
          lieu?: string | null
          responsableId?: string | null
          siteId?: string | null
          tenantId?: string
          titre?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "evenements_responsableId_fkey"
            columns: ["responsableId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evenements_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evenements_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      evenements_calendaires: {
        Row: {
          anneeId: string
          createdAt: string
          dateDebut: string
          dateFin: string
          id: string
          libelle: string
          type: string
          updatedAt: string
        }
        Insert: {
          anneeId: string
          createdAt?: string
          dateDebut: string
          dateFin: string
          id: string
          libelle: string
          type: string
          updatedAt: string
        }
        Update: {
          anneeId?: string
          createdAt?: string
          dateDebut?: string
          dateFin?: string
          id?: string
          libelle?: string
          type?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "evenements_calendaires_anneeId_fkey"
            columns: ["anneeId"]
            isOneToOne: false
            referencedRelation: "annees_scolaires"
            referencedColumns: ["id"]
          },
        ]
      }
      examens: {
        Row: {
          dateDebut: string
          dateFin: string
          description: string | null
          feuilleExercicesId: string | null
          id: string
          intitule: string
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutExamen"]
          tenantId: string
        }
        Insert: {
          dateDebut: string
          dateFin: string
          description?: string | null
          feuilleExercicesId?: string | null
          id: string
          intitule: string
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutExamen"]
          tenantId: string
        }
        Update: {
          dateDebut?: string
          dateFin?: string
          description?: string | null
          feuilleExercicesId?: string | null
          id?: string
          intitule?: string
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutExamen"]
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "examens_feuilleExercicesId_fkey"
            columns: ["feuilleExercicesId"]
            isOneToOne: false
            referencedRelation: "learnos_feuilles_exercices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "examens_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "examens_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      exclusions_eleve: {
        Row: {
          createdAt: string
          dateDebut: string
          dateFin: string | null
          decideeParId: string | null
          details: string | null
          eleveId: string
          id: string
          leveeLe: string | null
          leveeParId: string | null
          motif: string
          tenantId: string
        }
        Insert: {
          createdAt?: string
          dateDebut: string
          dateFin?: string | null
          decideeParId?: string | null
          details?: string | null
          eleveId: string
          id: string
          leveeLe?: string | null
          leveeParId?: string | null
          motif: string
          tenantId: string
        }
        Update: {
          createdAt?: string
          dateDebut?: string
          dateFin?: string | null
          decideeParId?: string | null
          details?: string | null
          eleveId?: string
          id?: string
          leveeLe?: string | null
          leveeParId?: string | null
          motif?: string
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "exclusions_eleve_decideeParId_fkey"
            columns: ["decideeParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exclusions_eleve_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exclusions_eleve_leveeParId_fkey"
            columns: ["leveeParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exclusions_eleve_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      factures: {
        Row: {
          anneeId: string | null
          candidatureId: string | null
          createdAt: string
          createdById: string | null
          devise: string
          echeance: string | null
          eleveId: string | null
          id: string
          libelle: string
          mois: string | null
          montant: number
          numero: string
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutFacture"]
          tenantId: string
          type: Database["public"]["Enums"]["TypeFacture"]
          updatedAt: string
        }
        Insert: {
          anneeId?: string | null
          candidatureId?: string | null
          createdAt?: string
          createdById?: string | null
          devise?: string
          echeance?: string | null
          eleveId?: string | null
          id: string
          libelle: string
          mois?: string | null
          montant: number
          numero: string
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutFacture"]
          tenantId: string
          type?: Database["public"]["Enums"]["TypeFacture"]
          updatedAt: string
        }
        Update: {
          anneeId?: string | null
          candidatureId?: string | null
          createdAt?: string
          createdById?: string | null
          devise?: string
          echeance?: string | null
          eleveId?: string | null
          id?: string
          libelle?: string
          mois?: string | null
          montant?: number
          numero?: string
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutFacture"]
          tenantId?: string
          type?: Database["public"]["Enums"]["TypeFacture"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "factures_anneeId_fkey"
            columns: ["anneeId"]
            isOneToOne: false
            referencedRelation: "annees_scolaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_candidatureId_fkey"
            columns: ["candidatureId"]
            isOneToOne: false
            referencedRelation: "candidatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_createdById_fkey"
            columns: ["createdById"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiches_rh: {
        Row: {
          absencesCount: number
          banque: string | null
          congesAnnuels: number
          congesPris: number
          createdAt: string
          dateEntree: string | null
          dateSortie: string | null
          diplome: string | null
          echelon: number
          enseignantId: string
          evaluation: string | null
          grade: string | null
          iban: string | null
          id: string
          observations: string | null
          rib: string | null
          salaireBase: number | null
          tarifHoraire: number | null
          tenantId: string
          typeContrat: Database["public"]["Enums"]["TypeContrat"]
          updatedAt: string
        }
        Insert: {
          absencesCount?: number
          banque?: string | null
          congesAnnuels?: number
          congesPris?: number
          createdAt?: string
          dateEntree?: string | null
          dateSortie?: string | null
          diplome?: string | null
          echelon?: number
          enseignantId: string
          evaluation?: string | null
          grade?: string | null
          iban?: string | null
          id: string
          observations?: string | null
          rib?: string | null
          salaireBase?: number | null
          tarifHoraire?: number | null
          tenantId: string
          typeContrat?: Database["public"]["Enums"]["TypeContrat"]
          updatedAt: string
        }
        Update: {
          absencesCount?: number
          banque?: string | null
          congesAnnuels?: number
          congesPris?: number
          createdAt?: string
          dateEntree?: string | null
          dateSortie?: string | null
          diplome?: string | null
          echelon?: number
          enseignantId?: string
          evaluation?: string | null
          grade?: string | null
          iban?: string | null
          id?: string
          observations?: string | null
          rib?: string | null
          salaireBase?: number | null
          tarifHoraire?: number | null
          tenantId?: string
          typeContrat?: Database["public"]["Enums"]["TypeContrat"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiches_rh_enseignantId_fkey"
            columns: ["enseignantId"]
            isOneToOne: false
            referencedRelation: "enseignants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiches_sanitaires: {
        Row: {
          allergies: string[] | null
          contactsUrgence: Json | null
          contreIndicationsSport: boolean
          createdAt: string
          eleveId: string
          id: string
          protocoleUrgence: string | null
          remarques: string | null
          siteId: string | null
          tenantId: string
          traitements: Json | null
          updatedAt: string
          vaccinations: Json | null
        }
        Insert: {
          allergies?: string[] | null
          contactsUrgence?: Json | null
          contreIndicationsSport?: boolean
          createdAt?: string
          eleveId: string
          id: string
          protocoleUrgence?: string | null
          remarques?: string | null
          siteId?: string | null
          tenantId: string
          traitements?: Json | null
          updatedAt: string
          vaccinations?: Json | null
        }
        Update: {
          allergies?: string[] | null
          contactsUrgence?: Json | null
          contreIndicationsSport?: boolean
          createdAt?: string
          eleveId?: string
          id?: string
          protocoleUrgence?: string | null
          remarques?: string | null
          siteId?: string | null
          tenantId?: string
          traitements?: Json | null
          updatedAt?: string
          vaccinations?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fiches_sanitaires_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiches_sanitaires_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiches_sanitaires_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      historique_classes: {
        Row: {
          classeId: string | null
          createdAt: string
          dateEntree: string
          dateSortie: string | null
          eleveId: string
          id: string
          motif: string | null
          tenantId: string
        }
        Insert: {
          classeId?: string | null
          createdAt?: string
          dateEntree?: string
          dateSortie?: string | null
          eleveId: string
          id: string
          motif?: string | null
          tenantId: string
        }
        Update: {
          classeId?: string | null
          createdAt?: string
          dateEntree?: string
          dateSortie?: string | null
          eleveId?: string
          id?: string
          motif?: string | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "historique_classes_classeId_fkey"
            columns: ["classeId"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historique_classes_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_grants: {
        Row: {
          adminId: string
          createdAt: string
          endedAt: string | null
          expiresAt: string
          id: string
          targetTenantId: string
          targetUserId: string
        }
        Insert: {
          adminId: string
          createdAt?: string
          endedAt?: string | null
          expiresAt: string
          id: string
          targetTenantId: string
          targetUserId: string
        }
        Update: {
          adminId?: string
          createdAt?: string
          endedAt?: string | null
          expiresAt?: string
          id?: string
          targetTenantId?: string
          targetUserId?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_grants_adminId_fkey"
            columns: ["adminId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_grants_targetTenantId_fkey"
            columns: ["targetTenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_grants_targetUserId_fkey"
            columns: ["targetUserId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          actionPrise: string | null
          classeParId: string | null
          createdAt: string
          date: string
          dateClassement: string | null
          dateResolution: string | null
          description: string
          eleveId: string
          gravite: number
          id: string
          lieu: string | null
          motifClassement: string | null
          notes: string | null
          rapporteParId: string | null
          resoluParId: string | null
          statut: Database["public"]["Enums"]["StatutIncident"]
          tenantId: string
          type: Database["public"]["Enums"]["TypeIncident"]
          updatedAt: string
        }
        Insert: {
          actionPrise?: string | null
          classeParId?: string | null
          createdAt?: string
          date: string
          dateClassement?: string | null
          dateResolution?: string | null
          description: string
          eleveId: string
          gravite?: number
          id: string
          lieu?: string | null
          motifClassement?: string | null
          notes?: string | null
          rapporteParId?: string | null
          resoluParId?: string | null
          statut?: Database["public"]["Enums"]["StatutIncident"]
          tenantId: string
          type?: Database["public"]["Enums"]["TypeIncident"]
          updatedAt: string
        }
        Update: {
          actionPrise?: string | null
          classeParId?: string | null
          createdAt?: string
          date?: string
          dateClassement?: string | null
          dateResolution?: string | null
          description?: string
          eleveId?: string
          gravite?: number
          id?: string
          lieu?: string | null
          motifClassement?: string | null
          notes?: string | null
          rapporteParId?: string | null
          resoluParId?: string | null
          statut?: Database["public"]["Enums"]["StatutIncident"]
          tenantId?: string
          type?: Database["public"]["Enums"]["TypeIncident"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_classeParId_fkey"
            columns: ["classeParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_rapporteParId_fkey"
            columns: ["rapporteParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_resoluParId_fkey"
            columns: ["resoluParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      indisponibilites_enseignants: {
        Row: {
          anneeLibelle: string | null
          createdAt: string
          enseignantId: string
          heureDebut: string
          heureFin: string
          id: string
          jour: Database["public"]["Enums"]["Jour"]
          periodeId: string | null
          siteId: string | null
          source: string
          sourceLibelle: string | null
          tenantId: string
        }
        Insert: {
          anneeLibelle?: string | null
          createdAt?: string
          enseignantId: string
          heureDebut: string
          heureFin: string
          id: string
          jour: Database["public"]["Enums"]["Jour"]
          periodeId?: string | null
          siteId?: string | null
          source?: string
          sourceLibelle?: string | null
          tenantId: string
        }
        Update: {
          anneeLibelle?: string | null
          createdAt?: string
          enseignantId?: string
          heureDebut?: string
          heureFin?: string
          id?: string
          jour?: Database["public"]["Enums"]["Jour"]
          periodeId?: string | null
          siteId?: string | null
          source?: string
          sourceLibelle?: string | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "indisponibilites_enseignants_enseignantId_fkey"
            columns: ["enseignantId"]
            isOneToOne: false
            referencedRelation: "enseignants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indisponibilites_enseignants_periodeId_fkey"
            columns: ["periodeId"]
            isOneToOne: false
            referencedRelation: "periodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indisponibilites_enseignants_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indisponibilites_enseignants_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inscription_historique: {
        Row: {
          auteurId: string | null
          auteurNom: string | null
          candidatureId: string
          createdAt: string
          description: string
          donnees: Json | null
          id: string
          tenantId: string
          type: Database["public"]["Enums"]["TypeEvenementInscription"]
        }
        Insert: {
          auteurId?: string | null
          auteurNom?: string | null
          candidatureId: string
          createdAt?: string
          description: string
          donnees?: Json | null
          id: string
          tenantId: string
          type: Database["public"]["Enums"]["TypeEvenementInscription"]
        }
        Update: {
          auteurId?: string | null
          auteurNom?: string | null
          candidatureId?: string
          createdAt?: string
          description?: string
          donnees?: Json | null
          id?: string
          tenantId?: string
          type?: Database["public"]["Enums"]["TypeEvenementInscription"]
        }
        Relationships: []
      }
      inventaire: {
        Row: {
          categorie: Database["public"]["Enums"]["CategorieItem"]
          createdAt: string
          dateAchat: string | null
          dateGarantie: string | null
          dateRevision: string | null
          description: string | null
          devise: string
          etat: Database["public"]["Enums"]["EtatItem"]
          fournisseur: string | null
          id: string
          localisation: string | null
          nom: string
          notes: string | null
          photoUrl: string | null
          prixUnitaire: number | null
          quantite: number
          quantiteMin: number
          reference: string | null
          siteId: string | null
          tenantId: string
          updatedAt: string
        }
        Insert: {
          categorie?: Database["public"]["Enums"]["CategorieItem"]
          createdAt?: string
          dateAchat?: string | null
          dateGarantie?: string | null
          dateRevision?: string | null
          description?: string | null
          devise?: string
          etat?: Database["public"]["Enums"]["EtatItem"]
          fournisseur?: string | null
          id: string
          localisation?: string | null
          nom: string
          notes?: string | null
          photoUrl?: string | null
          prixUnitaire?: number | null
          quantite?: number
          quantiteMin?: number
          reference?: string | null
          siteId?: string | null
          tenantId: string
          updatedAt: string
        }
        Update: {
          categorie?: Database["public"]["Enums"]["CategorieItem"]
          createdAt?: string
          dateAchat?: string | null
          dateGarantie?: string | null
          dateRevision?: string | null
          description?: string | null
          devise?: string
          etat?: Database["public"]["Enums"]["EtatItem"]
          fournisseur?: string | null
          id?: string
          localisation?: string | null
          nom?: string
          notes?: string | null
          photoUrl?: string | null
          prixUnitaire?: number | null
          quantite?: number
          quantiteMin?: number
          reference?: string | null
          siteId?: string | null
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventaire_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventaire_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_reinscription: {
        Row: {
          campagneId: string
          canal: string
          createdAt: string
          dateInvitation: string
          dateReponse: string | null
          decisionPromotion: string | null
          derniereRelance: string | null
          eleveId: string
          expiresAt: string | null
          id: string
          nbRelances: number
          parentEmail: string | null
          parentPhone: string | null
          statut: string
          tenantId: string
          token: string | null
          updatedAt: string
        }
        Insert: {
          campagneId: string
          canal?: string
          createdAt?: string
          dateInvitation?: string
          dateReponse?: string | null
          decisionPromotion?: string | null
          derniereRelance?: string | null
          eleveId: string
          expiresAt?: string | null
          id: string
          nbRelances?: number
          parentEmail?: string | null
          parentPhone?: string | null
          statut?: string
          tenantId: string
          token?: string | null
          updatedAt: string
        }
        Update: {
          campagneId?: string
          canal?: string
          createdAt?: string
          dateInvitation?: string
          dateReponse?: string | null
          decisionPromotion?: string | null
          derniereRelance?: string | null
          eleveId?: string
          expiresAt?: string | null
          id?: string
          nbRelances?: number
          parentEmail?: string | null
          parentPhone?: string | null
          statut?: string
          tenantId?: string
          token?: string | null
          updatedAt?: string
        }
        Relationships: []
      }
      learnos_ai_cache: {
        Row: {
          cacheKey: string
          createdAt: string
          expiresAt: string
          id: string
          response: Json
        }
        Insert: {
          cacheKey: string
          createdAt?: string
          expiresAt: string
          id: string
          response: Json
        }
        Update: {
          cacheKey?: string
          createdAt?: string
          expiresAt?: string
          id?: string
          response?: Json
        }
        Relationships: []
      }
      learnos_ai_decision_logs: {
        Row: {
          action: string
          actorId: string | null
          actorType: string
          approvedAt: string | null
          approvedBy: string | null
          confidence: number | null
          createdAt: string
          id: string
          inputRef: string | null
          modelName: string
          modelVersion: string
          output: Json
          promptVersion: string
          providerName: string
          rejectedAt: string | null
          siteId: string | null
          tenantId: string
        }
        Insert: {
          action: string
          actorId?: string | null
          actorType: string
          approvedAt?: string | null
          approvedBy?: string | null
          confidence?: number | null
          createdAt?: string
          id: string
          inputRef?: string | null
          modelName: string
          modelVersion: string
          output: Json
          promptVersion: string
          providerName: string
          rejectedAt?: string | null
          siteId?: string | null
          tenantId: string
        }
        Update: {
          action?: string
          actorId?: string | null
          actorType?: string
          approvedAt?: string | null
          approvedBy?: string | null
          confidence?: number | null
          createdAt?: string
          id?: string
          inputRef?: string | null
          modelName?: string
          modelVersion?: string
          output?: Json
          promptVersion?: string
          providerName?: string
          rejectedAt?: string | null
          siteId?: string | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_ai_decision_logs_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_ai_decision_logs_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_alertes_parent: {
        Row: {
          canal: string
          cle: string
          createdAt: string
          eleveId: string
          empreinte: string
          envoyeeLe: string | null
          erreur: string | null
          id: string
          motifSuppression: string | null
          niveau: Database["public"]["Enums"]["NiveauAlerteParent"]
          params: Json | null
          parentId: string
          siteId: string | null
          statut: string
          tenantId: string
          updatedAt: string
        }
        Insert: {
          canal?: string
          cle: string
          createdAt?: string
          eleveId: string
          empreinte: string
          envoyeeLe?: string | null
          erreur?: string | null
          id: string
          motifSuppression?: string | null
          niveau: Database["public"]["Enums"]["NiveauAlerteParent"]
          params?: Json | null
          parentId: string
          siteId?: string | null
          statut?: string
          tenantId: string
          updatedAt: string
        }
        Update: {
          canal?: string
          cle?: string
          createdAt?: string
          eleveId?: string
          empreinte?: string
          envoyeeLe?: string | null
          erreur?: string | null
          id?: string
          motifSuppression?: string | null
          niveau?: Database["public"]["Enums"]["NiveauAlerteParent"]
          params?: Json | null
          parentId?: string
          siteId?: string | null
          statut?: string
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_alertes_parent_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_alertes_parent_parentId_fkey"
            columns: ["parentId"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_alertes_parent_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_alertes_parent_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_calibration_seuils: {
        Row: {
          ameliorationMesuree: boolean | null
          confianceMinimale: number
          createdAt: string
          echantillon: number
          gainPrecision: number | null
          id: string
          matiereId: string | null
          niveau: string
          seuilAvance: number
          seuilConsolide: number
          seuilCritique: number
          seuilFragile: number
          siteId: string | null
          tenantId: string
          updatedAt: string
        }
        Insert: {
          ameliorationMesuree?: boolean | null
          confianceMinimale: number
          createdAt?: string
          echantillon: number
          gainPrecision?: number | null
          id: string
          matiereId?: string | null
          niveau: string
          seuilAvance: number
          seuilConsolide: number
          seuilCritique: number
          seuilFragile: number
          siteId?: string | null
          tenantId: string
          updatedAt: string
        }
        Update: {
          ameliorationMesuree?: boolean | null
          confianceMinimale?: number
          createdAt?: string
          echantillon?: number
          gainPrecision?: number | null
          id?: string
          matiereId?: string | null
          niveau?: string
          seuilAvance?: number
          seuilConsolide?: number
          seuilCritique?: number
          seuilFragile?: number
          siteId?: string | null
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_calibration_seuils_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_calibration_seuils_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_chapitres: {
        Row: {
          country: string | null
          createdAt: string
          id: string
          matiereId: string
          niveau: string
          nom: string
          ordre: number
          siteId: string | null
          tenantId: string | null
          updatedAt: string
        }
        Insert: {
          country?: string | null
          createdAt?: string
          id: string
          matiereId: string
          niveau: string
          nom: string
          ordre?: number
          siteId?: string | null
          tenantId?: string | null
          updatedAt: string
        }
        Update: {
          country?: string | null
          createdAt?: string
          id?: string
          matiereId?: string
          niveau?: string
          nom?: string
          ordre?: number
          siteId?: string | null
          tenantId?: string | null
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_chapitres_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_chapitres_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_chapitres_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_competences: {
        Row: {
          chapitreId: string
          code: string
          country: string | null
          createdAt: string
          description: string | null
          id: string
          libelle: string
          ordre: number
          siteId: string | null
          tenantId: string | null
          updatedAt: string
        }
        Insert: {
          chapitreId: string
          code: string
          country?: string | null
          createdAt?: string
          description?: string | null
          id: string
          libelle: string
          ordre?: number
          siteId?: string | null
          tenantId?: string | null
          updatedAt: string
        }
        Update: {
          chapitreId?: string
          code?: string
          country?: string | null
          createdAt?: string
          description?: string | null
          id?: string
          libelle?: string
          ordre?: number
          siteId?: string | null
          tenantId?: string | null
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_competences_chapitreId_fkey"
            columns: ["chapitreId"]
            isOneToOne: false
            referencedRelation: "learnos_chapitres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_competences_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_competences_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_echanges_parent: {
        Row: {
          canal: string
          createdAt: string
          eleveId: string | null
          id: string
          intention: string
          modele: string | null
          parentId: string
          question: string
          reponse: string
          siteId: string | null
          tenantId: string
        }
        Insert: {
          canal?: string
          createdAt?: string
          eleveId?: string | null
          id: string
          intention: string
          modele?: string | null
          parentId: string
          question: string
          reponse: string
          siteId?: string | null
          tenantId: string
        }
        Update: {
          canal?: string
          createdAt?: string
          eleveId?: string | null
          id?: string
          intention?: string
          modele?: string | null
          parentId?: string
          question?: string
          reponse?: string
          siteId?: string | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_echanges_parent_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_echanges_parent_parentId_fkey"
            columns: ["parentId"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_echanges_parent_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_echanges_parent_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_etapes_plan: {
        Row: {
          action: string
          competenceId: string
          createdAt: string
          echeance: string | null
          evaluationJalonId: string | null
          evidenceValidanteId: string | null
          id: string
          ordre: number
          planId: string
          responsable: string
          statut: Database["public"]["Enums"]["StatutEtape"]
          updatedAt: string
          valideeLe: string | null
        }
        Insert: {
          action: string
          competenceId: string
          createdAt?: string
          echeance?: string | null
          evaluationJalonId?: string | null
          evidenceValidanteId?: string | null
          id: string
          ordre: number
          planId: string
          responsable?: string
          statut?: Database["public"]["Enums"]["StatutEtape"]
          updatedAt: string
          valideeLe?: string | null
        }
        Update: {
          action?: string
          competenceId?: string
          createdAt?: string
          echeance?: string | null
          evaluationJalonId?: string | null
          evidenceValidanteId?: string | null
          id?: string
          ordre?: number
          planId?: string
          responsable?: string
          statut?: Database["public"]["Enums"]["StatutEtape"]
          updatedAt?: string
          valideeLe?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learnos_etapes_plan_competenceId_fkey"
            columns: ["competenceId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_etapes_plan_planId_fkey"
            columns: ["planId"]
            isOneToOne: false
            referencedRelation: "learnos_plans_progression"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_evaluation_competences: {
        Row: {
          competenceId: string
          createdAt: string
          evaluationId: string
          id: string
          poids: number
          siteId: string | null
          tenantId: string
        }
        Insert: {
          competenceId: string
          createdAt?: string
          evaluationId: string
          id: string
          poids?: number
          siteId?: string | null
          tenantId: string
        }
        Update: {
          competenceId?: string
          createdAt?: string
          evaluationId?: string
          id?: string
          poids?: number
          siteId?: string | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_evaluation_competences_competenceId_fkey"
            columns: ["competenceId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_evaluation_competences_evaluationId_fkey"
            columns: ["evaluationId"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_evaluation_competences_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_evaluation_competences_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_event_deadletters: {
        Row: {
          aggregateId: string
          aggregateType: string
          attempts: number
          deadletteredAt: string
          eventType: string
          id: string
          lastError: string | null
          occurredAt: string
          payload: Json
          resolution: string
          siteId: string | null
          tenantId: string
        }
        Insert: {
          aggregateId: string
          aggregateType: string
          attempts: number
          deadletteredAt?: string
          eventType: string
          id: string
          lastError?: string | null
          occurredAt: string
          payload: Json
          resolution?: string
          siteId?: string | null
          tenantId: string
        }
        Update: {
          aggregateId?: string
          aggregateType?: string
          attempts?: number
          deadletteredAt?: string
          eventType?: string
          id?: string
          lastError?: string | null
          occurredAt?: string
          payload?: Json
          resolution?: string
          siteId?: string | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_event_deadletters_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_event_deadletters_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_events: {
        Row: {
          aggregateId: string
          aggregateType: string
          attempts: number
          eventType: string
          id: string
          lastError: string | null
          occurredAt: string
          payload: Json
          processedAt: string | null
          siteId: string | null
          tenantId: string
        }
        Insert: {
          aggregateId: string
          aggregateType: string
          attempts?: number
          eventType: string
          id: string
          lastError?: string | null
          occurredAt?: string
          payload: Json
          processedAt?: string | null
          siteId?: string | null
          tenantId: string
        }
        Update: {
          aggregateId?: string
          aggregateType?: string
          attempts?: number
          eventType?: string
          id?: string
          lastError?: string | null
          occurredAt?: string
          payload?: Json
          processedAt?: string | null
          siteId?: string | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_events_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_events_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_exercices_assignes: {
        Row: {
          competenceId: string
          competenceViseeId: string | null
          createdAt: string
          feuilleId: string
          id: string
          motifParams: Json | null
          ordre: number
          palier: Database["public"]["Enums"]["PalierExercice"]
          priorite: number
          questionId: string
          regleDeclenchee: string
        }
        Insert: {
          competenceId: string
          competenceViseeId?: string | null
          createdAt?: string
          feuilleId: string
          id: string
          motifParams?: Json | null
          ordre: number
          palier: Database["public"]["Enums"]["PalierExercice"]
          priorite: number
          questionId: string
          regleDeclenchee: string
        }
        Update: {
          competenceId?: string
          competenceViseeId?: string | null
          createdAt?: string
          feuilleId?: string
          id?: string
          motifParams?: Json | null
          ordre?: number
          palier?: Database["public"]["Enums"]["PalierExercice"]
          priorite?: number
          questionId?: string
          regleDeclenchee?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_exercices_assignes_competenceId_fkey"
            columns: ["competenceId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_exercices_assignes_feuilleId_fkey"
            columns: ["feuilleId"]
            isOneToOne: false
            referencedRelation: "learnos_feuilles_exercices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_exercices_assignes_questionId_fkey"
            columns: ["questionId"]
            isOneToOne: false
            referencedRelation: "learnos_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_exercices_reponses: {
        Row: {
          corrigeeLe: string | null
          corrigeParId: string | null
          dureeMs: number | null
          etapes: Json | null
          evidenceId: string | null
          exerciceAssigneId: string
          id: string
          maxScore: number | null
          repondueLe: string
          reponse: string | null
          score: number | null
          tentatives: number
          updatedAt: string
        }
        Insert: {
          corrigeeLe?: string | null
          corrigeParId?: string | null
          dureeMs?: number | null
          etapes?: Json | null
          evidenceId?: string | null
          exerciceAssigneId: string
          id: string
          maxScore?: number | null
          repondueLe?: string
          reponse?: string | null
          score?: number | null
          tentatives?: number
          updatedAt: string
        }
        Update: {
          corrigeeLe?: string | null
          corrigeParId?: string | null
          dureeMs?: number | null
          etapes?: Json | null
          evidenceId?: string | null
          exerciceAssigneId?: string
          id?: string
          maxScore?: number | null
          repondueLe?: string
          reponse?: string | null
          score?: number | null
          tentatives?: number
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_exercices_reponses_exerciceAssigneId_fkey"
            columns: ["exerciceAssigneId"]
            isOneToOne: false
            referencedRelation: "learnos_exercices_assignes"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_feuilles_exercices: {
        Row: {
          assigneeLe: string | null
          competenceAttesteeId: string | null
          createdAt: string
          eleveId: string
          etapePlanId: string | null
          id: string
          matiereId: string | null
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutFeuille"]
          tenantId: string
          termineeLe: string | null
          type: string
          updatedAt: string
          valideeLe: string | null
          valideParId: string | null
        }
        Insert: {
          assigneeLe?: string | null
          competenceAttesteeId?: string | null
          createdAt?: string
          eleveId: string
          etapePlanId?: string | null
          id: string
          matiereId?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutFeuille"]
          tenantId: string
          termineeLe?: string | null
          type: string
          updatedAt: string
          valideeLe?: string | null
          valideParId?: string | null
        }
        Update: {
          assigneeLe?: string | null
          competenceAttesteeId?: string | null
          createdAt?: string
          eleveId?: string
          etapePlanId?: string | null
          id?: string
          matiereId?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutFeuille"]
          tenantId?: string
          termineeLe?: string | null
          type?: string
          updatedAt?: string
          valideeLe?: string | null
          valideParId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learnos_feuilles_exercices_competenceAttesteeId_fkey"
            columns: ["competenceAttesteeId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_feuilles_exercices_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_feuilles_exercices_etapePlanId_fkey"
            columns: ["etapePlanId"]
            isOneToOne: false
            referencedRelation: "learnos_etapes_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_feuilles_exercices_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_feuilles_exercices_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_feuilles_exercices_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_journal_apprentissage: {
        Row: {
          createdAt: string
          detail: string
          echantillon: number
          id: string
          perimetre: string
          resume: string
          siteId: string | null
          tenantId: string
          typeAnalyse: string
        }
        Insert: {
          createdAt?: string
          detail: string
          echantillon: number
          id: string
          perimetre: string
          resume: string
          siteId?: string | null
          tenantId: string
          typeAnalyse: string
        }
        Update: {
          createdAt?: string
          detail?: string
          echantillon?: number
          id?: string
          perimetre?: string
          resume?: string
          siteId?: string | null
          tenantId?: string
          typeAnalyse?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_journal_apprentissage_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_journal_apprentissage_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_kpi_snapshots: {
        Row: {
          cible: number | null
          createdAt: string
          id: string
          kpiKey: string
          periode: string
          role: string
          siteId: string | null
          tenantId: string
          valeur: number
        }
        Insert: {
          cible?: number | null
          createdAt?: string
          id: string
          kpiKey: string
          periode: string
          role: string
          siteId?: string | null
          tenantId: string
          valeur: number
        }
        Update: {
          cible?: number | null
          createdAt?: string
          id?: string
          kpiKey?: string
          periode?: string
          role?: string
          siteId?: string | null
          tenantId?: string
          valeur?: number
        }
        Relationships: [
          {
            foreignKeyName: "learnos_kpi_snapshots_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_kpi_snapshots_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_learning_evidences: {
        Row: {
          competenceId: string | null
          confidence: number
          createdAt: string
          eleveId: string
          errorConfidence: number | null
          errorType: Database["public"]["Enums"]["ErrorType"] | null
          evaluationId: string | null
          evidenceType: Database["public"]["Enums"]["EvidenceType"]
          id: string
          masterySignal: number
          matiereId: string | null
          maxScore: number | null
          metadata: Json | null
          noteId: string | null
          occurredAt: string
          rawScore: number | null
          siteId: string | null
          sourceId: string
          sourceType: string
          tenantId: string
          weight: number
        }
        Insert: {
          competenceId?: string | null
          confidence: number
          createdAt?: string
          eleveId: string
          errorConfidence?: number | null
          errorType?: Database["public"]["Enums"]["ErrorType"] | null
          evaluationId?: string | null
          evidenceType: Database["public"]["Enums"]["EvidenceType"]
          id: string
          masterySignal: number
          matiereId?: string | null
          maxScore?: number | null
          metadata?: Json | null
          noteId?: string | null
          occurredAt?: string
          rawScore?: number | null
          siteId?: string | null
          sourceId: string
          sourceType: string
          tenantId: string
          weight?: number
        }
        Update: {
          competenceId?: string | null
          confidence?: number
          createdAt?: string
          eleveId?: string
          errorConfidence?: number | null
          errorType?: Database["public"]["Enums"]["ErrorType"] | null
          evaluationId?: string | null
          evidenceType?: Database["public"]["Enums"]["EvidenceType"]
          id?: string
          masterySignal?: number
          matiereId?: string | null
          maxScore?: number | null
          metadata?: Json | null
          noteId?: string | null
          occurredAt?: string
          rawScore?: number | null
          siteId?: string | null
          sourceId?: string
          sourceType?: string
          tenantId?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "learnos_learning_evidences_competenceId_fkey"
            columns: ["competenceId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_learning_evidences_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_learning_evidences_evaluationId_fkey"
            columns: ["evaluationId"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_learning_evidences_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_learning_evidences_noteId_fkey"
            columns: ["noteId"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_learning_evidences_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_learning_evidences_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_patterns_pedago: {
        Row: {
          anneesCouvertes: number
          competenceId: string | null
          confidenceMoyenne: number
          createdAt: string
          ecartType: number
          effectif: number
          id: string
          masteryMoyenne: number
          matiereId: string | null
          niveau: string
          periodeDebut: string
          periodeFin: string
          semaineChapitre: number | null
          siteId: string | null
          tauxEchec: number
          tenantId: string
          updatedAt: string
        }
        Insert: {
          anneesCouvertes: number
          competenceId?: string | null
          confidenceMoyenne: number
          createdAt?: string
          ecartType: number
          effectif: number
          id: string
          masteryMoyenne: number
          matiereId?: string | null
          niveau: string
          periodeDebut: string
          periodeFin: string
          semaineChapitre?: number | null
          siteId?: string | null
          tauxEchec: number
          tenantId: string
          updatedAt: string
        }
        Update: {
          anneesCouvertes?: number
          competenceId?: string | null
          confidenceMoyenne?: number
          createdAt?: string
          ecartType?: number
          effectif?: number
          id?: string
          masteryMoyenne?: number
          matiereId?: string | null
          niveau?: string
          periodeDebut?: string
          periodeFin?: string
          semaineChapitre?: number | null
          siteId?: string | null
          tauxEchec?: number
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_patterns_pedago_competenceId_fkey"
            columns: ["competenceId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_patterns_pedago_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_patterns_pedago_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_planification_chapitres: {
        Row: {
          anneeId: string
          chapitreId: string
          classeId: string | null
          createdAt: string
          demarreLe: string | null
          heuresPrevues: number | null
          id: string
          semaineDebut: number
          semaineDebutInitiale: number | null
          semaineFin: number
          semaineFinInitiale: number | null
          siteId: string | null
          statut: string
          tenantId: string
          traiteLe: string | null
          updatedAt: string
        }
        Insert: {
          anneeId: string
          chapitreId: string
          classeId?: string | null
          createdAt?: string
          demarreLe?: string | null
          heuresPrevues?: number | null
          id: string
          semaineDebut: number
          semaineDebutInitiale?: number | null
          semaineFin: number
          semaineFinInitiale?: number | null
          siteId?: string | null
          statut?: string
          tenantId: string
          traiteLe?: string | null
          updatedAt: string
        }
        Update: {
          anneeId?: string
          chapitreId?: string
          classeId?: string | null
          createdAt?: string
          demarreLe?: string | null
          heuresPrevues?: number | null
          id?: string
          semaineDebut?: number
          semaineDebutInitiale?: number | null
          semaineFin?: number
          semaineFinInitiale?: number | null
          siteId?: string | null
          statut?: string
          tenantId?: string
          traiteLe?: string | null
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_planification_chapitres_anneeId_fkey"
            columns: ["anneeId"]
            isOneToOne: false
            referencedRelation: "annees_scolaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_planification_chapitres_chapitreId_fkey"
            columns: ["chapitreId"]
            isOneToOne: false
            referencedRelation: "learnos_chapitres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_planification_chapitres_classeId_fkey"
            columns: ["classeId"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_planification_chapitres_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_planification_chapitres_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_planification_competences: {
        Row: {
          anneeId: string
          classeId: string | null
          competenceId: string
          createdAt: string
          id: string
          semaineDebut: number
          semaineFin: number
          siteId: string | null
          statut: string
          tenantId: string
          updatedAt: string
        }
        Insert: {
          anneeId: string
          classeId?: string | null
          competenceId: string
          createdAt?: string
          id: string
          semaineDebut: number
          semaineFin: number
          siteId?: string | null
          statut?: string
          tenantId: string
          updatedAt: string
        }
        Update: {
          anneeId?: string
          classeId?: string | null
          competenceId?: string
          createdAt?: string
          id?: string
          semaineDebut?: number
          semaineFin?: number
          siteId?: string | null
          statut?: string
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_planification_competences_anneeId_fkey"
            columns: ["anneeId"]
            isOneToOne: false
            referencedRelation: "annees_scolaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_planification_competences_classeId_fkey"
            columns: ["classeId"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_planification_competences_competenceId_fkey"
            columns: ["competenceId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_planification_competences_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_planification_competences_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_plans_lecon: {
        Row: {
          ajusteLe: string | null
          ajusteParId: string | null
          cachedIa: boolean
          competenceId: string
          createdAt: string
          differentiation: string | null
          dureeTotale: number
          etapes: string
          evaluation: string | null
          id: string
          materiel: string | null
          modeleIa: string | null
          motifRejet: string | null
          niveauScolaire: string
          objectifs: string
          proposeParId: string | null
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutPropositionIa"]
          tenantId: string
          titre: string
          updatedAt: string
          valideLe: string | null
          valideParId: string | null
        }
        Insert: {
          ajusteLe?: string | null
          ajusteParId?: string | null
          cachedIa?: boolean
          competenceId: string
          createdAt?: string
          differentiation?: string | null
          dureeTotale: number
          etapes: string
          evaluation?: string | null
          id: string
          materiel?: string | null
          modeleIa?: string | null
          motifRejet?: string | null
          niveauScolaire: string
          objectifs: string
          proposeParId?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutPropositionIa"]
          tenantId: string
          titre: string
          updatedAt: string
          valideLe?: string | null
          valideParId?: string | null
        }
        Update: {
          ajusteLe?: string | null
          ajusteParId?: string | null
          cachedIa?: boolean
          competenceId?: string
          createdAt?: string
          differentiation?: string | null
          dureeTotale?: number
          etapes?: string
          evaluation?: string | null
          id?: string
          materiel?: string | null
          modeleIa?: string | null
          motifRejet?: string | null
          niveauScolaire?: string
          objectifs?: string
          proposeParId?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutPropositionIa"]
          tenantId?: string
          titre?: string
          updatedAt?: string
          valideLe?: string | null
          valideParId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learnos_plans_lecon_competenceId_fkey"
            columns: ["competenceId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_plans_lecon_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_plans_lecon_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_plans_progression: {
        Row: {
          createdAt: string
          dateDebut: string | null
          dateFin: string | null
          dateRevue: string | null
          eleveId: string
          id: string
          masteryApres: number | null
          masteryAvant: number | null
          matiereId: string | null
          motif: string
          motifParams: Json | null
          origine: string
          parentInforme: boolean
          regleDeclenchee: string
          responsableUserId: string | null
          resultat: string | null
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutPlan"]
          tenantId: string
          type: string
          updatedAt: string
          valideLe: string | null
          valideParId: string | null
        }
        Insert: {
          createdAt?: string
          dateDebut?: string | null
          dateFin?: string | null
          dateRevue?: string | null
          eleveId: string
          id: string
          masteryApres?: number | null
          masteryAvant?: number | null
          matiereId?: string | null
          motif: string
          motifParams?: Json | null
          origine?: string
          parentInforme?: boolean
          regleDeclenchee: string
          responsableUserId?: string | null
          resultat?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutPlan"]
          tenantId: string
          type: string
          updatedAt: string
          valideLe?: string | null
          valideParId?: string | null
        }
        Update: {
          createdAt?: string
          dateDebut?: string | null
          dateFin?: string | null
          dateRevue?: string | null
          eleveId?: string
          id?: string
          masteryApres?: number | null
          masteryAvant?: number | null
          matiereId?: string | null
          motif?: string
          motifParams?: Json | null
          origine?: string
          parentInforme?: boolean
          regleDeclenchee?: string
          responsableUserId?: string | null
          resultat?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutPlan"]
          tenantId?: string
          type?: string
          updatedAt?: string
          valideLe?: string | null
          valideParId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learnos_plans_progression_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_plans_progression_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_plans_progression_responsableUserId_fkey"
            columns: ["responsableUserId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_plans_progression_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_plans_progression_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_predictions: {
        Row: {
          anneeId: string
          chapitreId: string | null
          competenceId: string
          confidenceAvant: number | null
          difficultePredite: string
          ecart: number | null
          eleveId: string
          emiseLe: string
          id: string
          masteryApres: number | null
          masteryAvant: number | null
          predictionCorrecte: boolean | null
          prerequisManquants: number | null
          probaReussite: number
          siteId: string | null
          tenantId: string
          verifieeLe: string | null
        }
        Insert: {
          anneeId: string
          chapitreId?: string | null
          competenceId: string
          confidenceAvant?: number | null
          difficultePredite: string
          ecart?: number | null
          eleveId: string
          emiseLe?: string
          id: string
          masteryApres?: number | null
          masteryAvant?: number | null
          predictionCorrecte?: boolean | null
          prerequisManquants?: number | null
          probaReussite: number
          siteId?: string | null
          tenantId: string
          verifieeLe?: string | null
        }
        Update: {
          anneeId?: string
          chapitreId?: string | null
          competenceId?: string
          confidenceAvant?: number | null
          difficultePredite?: string
          ecart?: number | null
          eleveId?: string
          emiseLe?: string
          id?: string
          masteryApres?: number | null
          masteryAvant?: number | null
          predictionCorrecte?: boolean | null
          prerequisManquants?: number | null
          probaReussite?: number
          siteId?: string | null
          tenantId?: string
          verifieeLe?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learnos_predictions_chapitreId_fkey"
            columns: ["chapitreId"]
            isOneToOne: false
            referencedRelation: "learnos_chapitres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_predictions_competenceId_fkey"
            columns: ["competenceId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_predictions_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_predictions_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_predictions_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_preferences_parent: {
        Row: {
          alertesActives: boolean
          createdAt: string
          id: string
          langue: string | null
          niveauMinimal: Database["public"]["Enums"]["NiveauAlerteParent"]
          parentId: string
          plafondHebdomadaire: number
          tenantId: string
          updatedAt: string
        }
        Insert: {
          alertesActives?: boolean
          createdAt?: string
          id: string
          langue?: string | null
          niveauMinimal?: Database["public"]["Enums"]["NiveauAlerteParent"]
          parentId: string
          plafondHebdomadaire?: number
          tenantId: string
          updatedAt: string
        }
        Update: {
          alertesActives?: boolean
          createdAt?: string
          id?: string
          langue?: string | null
          niveauMinimal?: Database["public"]["Enums"]["NiveauAlerteParent"]
          parentId?: string
          plafondHebdomadaire?: number
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_preferences_parent_parentId_fkey"
            columns: ["parentId"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_preferences_parent_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_questions: {
        Row: {
          actif: boolean
          bareme: number
          competenceId: string
          corrige: string | null
          country: string | null
          createdAt: string
          enonce: string
          format: Database["public"]["Enums"]["FormatQuestion"]
          id: string
          langue: string
          origine: string
          palier: Database["public"]["Enums"]["PalierExercice"]
          relueLe: string | null
          relueParId: string | null
          siteId: string | null
          structure: Json | null
          tenantId: string | null
          updatedAt: string
        }
        Insert: {
          actif?: boolean
          bareme?: number
          competenceId: string
          corrige?: string | null
          country?: string | null
          createdAt?: string
          enonce: string
          format?: Database["public"]["Enums"]["FormatQuestion"]
          id: string
          langue?: string
          origine?: string
          palier: Database["public"]["Enums"]["PalierExercice"]
          relueLe?: string | null
          relueParId?: string | null
          siteId?: string | null
          structure?: Json | null
          tenantId?: string | null
          updatedAt: string
        }
        Update: {
          actif?: boolean
          bareme?: number
          competenceId?: string
          corrige?: string | null
          country?: string | null
          createdAt?: string
          enonce?: string
          format?: Database["public"]["Enums"]["FormatQuestion"]
          id?: string
          langue?: string
          origine?: string
          palier?: Database["public"]["Enums"]["PalierExercice"]
          relueLe?: string | null
          relueParId?: string | null
          siteId?: string | null
          structure?: Json | null
          tenantId?: string | null
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_questions_competenceId_fkey"
            columns: ["competenceId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_questions_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_questions_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_recommandations: {
        Row: {
          actionProposee: string
          competenceId: string
          competencesBloquees: number
          createdAt: string
          decideeLe: string | null
          decideParId: string | null
          eleveId: string
          id: string
          motif: string
          motifParams: Json | null
          niveau: Database["public"]["Enums"]["NiveauRecommandation"]
          prerequisManquants: Json | null
          regleDeclenchee: string
          resolueLe: string | null
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutRecommandation"]
          tenantId: string
          updatedAt: string
        }
        Insert: {
          actionProposee: string
          competenceId: string
          competencesBloquees?: number
          createdAt?: string
          decideeLe?: string | null
          decideParId?: string | null
          eleveId: string
          id: string
          motif: string
          motifParams?: Json | null
          niveau: Database["public"]["Enums"]["NiveauRecommandation"]
          prerequisManquants?: Json | null
          regleDeclenchee: string
          resolueLe?: string | null
          siteId?: string | null
          statut: Database["public"]["Enums"]["StatutRecommandation"]
          tenantId: string
          updatedAt: string
        }
        Update: {
          actionProposee?: string
          competenceId?: string
          competencesBloquees?: number
          createdAt?: string
          decideeLe?: string | null
          decideParId?: string | null
          eleveId?: string
          id?: string
          motif?: string
          motifParams?: Json | null
          niveau?: Database["public"]["Enums"]["NiveauRecommandation"]
          prerequisManquants?: Json | null
          regleDeclenchee?: string
          resolueLe?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutRecommandation"]
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_recommandations_competenceId_fkey"
            columns: ["competenceId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_recommandations_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_recommandations_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_recommandations_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_rubriques_evaluation: {
        Row: {
          ajusteLe: string | null
          ajusteParId: string | null
          cachedIa: boolean
          competenceId: string
          createdAt: string
          criteres: string
          id: string
          modeleIa: string | null
          motifRejet: string | null
          niveauScolaire: string
          proposeParId: string | null
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutPropositionIa"]
          tenantId: string
          titre: string
          totalPoints: number
          updatedAt: string
          valideLe: string | null
          valideParId: string | null
        }
        Insert: {
          ajusteLe?: string | null
          ajusteParId?: string | null
          cachedIa?: boolean
          competenceId: string
          createdAt?: string
          criteres: string
          id: string
          modeleIa?: string | null
          motifRejet?: string | null
          niveauScolaire: string
          proposeParId?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutPropositionIa"]
          tenantId: string
          titre: string
          totalPoints: number
          updatedAt: string
          valideLe?: string | null
          valideParId?: string | null
        }
        Update: {
          ajusteLe?: string | null
          ajusteParId?: string | null
          cachedIa?: boolean
          competenceId?: string
          createdAt?: string
          criteres?: string
          id?: string
          modeleIa?: string | null
          motifRejet?: string | null
          niveauScolaire?: string
          proposeParId?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutPropositionIa"]
          tenantId?: string
          titre?: string
          totalPoints?: number
          updatedAt?: string
          valideLe?: string | null
          valideParId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learnos_rubriques_evaluation_competenceId_fkey"
            columns: ["competenceId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_rubriques_evaluation_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_rubriques_evaluation_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_seuils_recommandation: {
        Row: {
          confianceMinimale: number
          createdAt: string
          declenchementPlanAvances: number
          declenchementPlanCritiques: number
          id: string
          matiereId: string | null
          niveau: string | null
          prerequisBloquantsMin: number
          seuilAvance: number
          seuilConsolide: number
          seuilCritique: number
          seuilFragile: number
          siteId: string | null
          tenantId: string
          updatedAt: string
        }
        Insert: {
          confianceMinimale?: number
          createdAt?: string
          declenchementPlanAvances?: number
          declenchementPlanCritiques?: number
          id: string
          matiereId?: string | null
          niveau?: string | null
          prerequisBloquantsMin?: number
          seuilAvance?: number
          seuilConsolide?: number
          seuilCritique?: number
          seuilFragile?: number
          siteId?: string | null
          tenantId: string
          updatedAt: string
        }
        Update: {
          confianceMinimale?: number
          createdAt?: string
          declenchementPlanAvances?: number
          declenchementPlanCritiques?: number
          id?: string
          matiereId?: string | null
          niveau?: string | null
          prerequisBloquantsMin?: number
          seuilAvance?: number
          seuilConsolide?: number
          seuilCritique?: number
          seuilFragile?: number
          siteId?: string | null
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_seuils_recommandation_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_seuils_recommandation_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_seuils_recommandation_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_student_interventions: {
        Row: {
          approvedAt: string | null
          approvedBy: string | null
          competenceId: string
          createdAt: string
          createdByAi: boolean
          eleveId: string
          evidenceRefs: string[] | null
          id: string
          interventionType: string
          masteryAfter: number | null
          masteryBefore: number | null
          outcome: string | null
          reason: string
          recommendedAction: string
          responsibleUserId: string | null
          reviewDate: string | null
          siteId: string | null
          startDate: string | null
          status: Database["public"]["Enums"]["InterventionStatus"]
          tenantId: string
          updatedAt: string
        }
        Insert: {
          approvedAt?: string | null
          approvedBy?: string | null
          competenceId: string
          createdAt?: string
          createdByAi?: boolean
          eleveId: string
          evidenceRefs?: string[] | null
          id: string
          interventionType: string
          masteryAfter?: number | null
          masteryBefore?: number | null
          outcome?: string | null
          reason: string
          recommendedAction: string
          responsibleUserId?: string | null
          reviewDate?: string | null
          siteId?: string | null
          startDate?: string | null
          status?: Database["public"]["Enums"]["InterventionStatus"]
          tenantId: string
          updatedAt: string
        }
        Update: {
          approvedAt?: string | null
          approvedBy?: string | null
          competenceId?: string
          createdAt?: string
          createdByAi?: boolean
          eleveId?: string
          evidenceRefs?: string[] | null
          id?: string
          interventionType?: string
          masteryAfter?: number | null
          masteryBefore?: number | null
          outcome?: string | null
          reason?: string
          recommendedAction?: string
          responsibleUserId?: string | null
          reviewDate?: string | null
          siteId?: string | null
          startDate?: string | null
          status?: Database["public"]["Enums"]["InterventionStatus"]
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_student_interventions_competenceId_fkey"
            columns: ["competenceId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_student_interventions_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_student_interventions_responsibleUserId_fkey"
            columns: ["responsibleUserId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_student_interventions_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_student_interventions_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learnos_student_learning_profiles: {
        Row: {
          competenceId: string
          computedAt: string
          confidenceScore: number
          eleveId: string
          errorPatterns: Json | null
          evidenceCount: number
          id: string
          lastEvidenceAt: string | null
          masteryScore: number
          masteryStatus: Database["public"]["Enums"]["MasteryStatus"]
          prerequisiteStatus: Json | null
          recommendedAction: string | null
          siteId: string | null
          tenantId: string
          trend: string
          updatedAt: string
        }
        Insert: {
          competenceId: string
          computedAt?: string
          confidenceScore?: number
          eleveId: string
          errorPatterns?: Json | null
          evidenceCount?: number
          id: string
          lastEvidenceAt?: string | null
          masteryScore?: number
          masteryStatus?: Database["public"]["Enums"]["MasteryStatus"]
          prerequisiteStatus?: Json | null
          recommendedAction?: string | null
          siteId?: string | null
          tenantId: string
          trend?: string
          updatedAt: string
        }
        Update: {
          competenceId?: string
          computedAt?: string
          confidenceScore?: number
          eleveId?: string
          errorPatterns?: Json | null
          evidenceCount?: number
          id?: string
          lastEvidenceAt?: string | null
          masteryScore?: number
          masteryStatus?: Database["public"]["Enums"]["MasteryStatus"]
          prerequisiteStatus?: Json | null
          recommendedAction?: string | null
          siteId?: string | null
          tenantId?: string
          trend?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnos_student_learning_profiles_competenceId_fkey"
            columns: ["competenceId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_student_learning_profiles_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_student_learning_profiles_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnos_student_learning_profiles_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      liste_fourniture_items: {
        Row: {
          description: string | null
          format: string | null
          id: string
          listeId: string
          matiereId: string | null
          nom: string
          prixEstime: number | null
          quantite: number
          sourceDemandeId: string | null
          type: Database["public"]["Enums"]["TypeFourniture"]
        }
        Insert: {
          description?: string | null
          format?: string | null
          id: string
          listeId: string
          matiereId?: string | null
          nom: string
          prixEstime?: number | null
          quantite?: number
          sourceDemandeId?: string | null
          type: Database["public"]["Enums"]["TypeFourniture"]
        }
        Update: {
          description?: string | null
          format?: string | null
          id?: string
          listeId?: string
          matiereId?: string | null
          nom?: string
          prixEstime?: number | null
          quantite?: number
          sourceDemandeId?: string | null
          type?: Database["public"]["Enums"]["TypeFourniture"]
        }
        Relationships: [
          {
            foreignKeyName: "liste_fourniture_items_listeId_fkey"
            columns: ["listeId"]
            isOneToOne: false
            referencedRelation: "listes_fournitures_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liste_fourniture_items_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
        ]
      }
      listes_fournitures_classes: {
        Row: {
          classeId: string
          createdAt: string
          id: string
          niveau: string
          publieeLe: string | null
          publieeParId: string | null
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutListeFourniture"]
          tenantId: string
          updatedAt: string
        }
        Insert: {
          classeId: string
          createdAt?: string
          id: string
          niveau: string
          publieeLe?: string | null
          publieeParId?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutListeFourniture"]
          tenantId: string
          updatedAt: string
        }
        Update: {
          classeId?: string
          createdAt?: string
          id?: string
          niveau?: string
          publieeLe?: string | null
          publieeParId?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutListeFourniture"]
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "listes_fournitures_classes_classeId_fkey"
            columns: ["classeId"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listes_fournitures_classes_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listes_fournitures_classes_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matieres: {
        Row: {
          code: string
          coefficient: number
          couleur: string | null
          id: string
          niveau: string | null
          nom: string
          siteId: string | null
          tenantId: string
        }
        Insert: {
          code: string
          coefficient?: number
          couleur?: string | null
          id: string
          niveau?: string | null
          nom: string
          siteId?: string | null
          tenantId: string
        }
        Update: {
          code?: string
          coefficient?: number
          couleur?: string | null
          id?: string
          niveau?: string | null
          nom?: string
          siteId?: string | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "matieres_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matieres_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      membres_conseil: {
        Row: {
          conseilId: string
          createdAt: string
          debutMandat: string | null
          finMandat: string | null
          id: string
          nomExterne: string | null
          role: string
          userId: string | null
        }
        Insert: {
          conseilId: string
          createdAt?: string
          debutMandat?: string | null
          finMandat?: string | null
          id: string
          nomExterne?: string | null
          role?: string
          userId?: string | null
        }
        Update: {
          conseilId?: string
          createdAt?: string
          debutMandat?: string | null
          finMandat?: string | null
          id?: string
          nomExterne?: string | null
          role?: string
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membres_conseil_conseilId_fkey"
            columns: ["conseilId"]
            isOneToOne: false
            referencedRelation: "conseils"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membres_conseil_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mentorats: {
        Row: {
          createdAt: string
          dateDebut: string
          dateFin: string | null
          frequence: string
          id: string
          mentoreId: string
          mentorId: string
          notes: string | null
          statut: string
          tenantId: string
          type: string
          updatedAt: string
        }
        Insert: {
          createdAt?: string
          dateDebut?: string
          dateFin?: string | null
          frequence?: string
          id: string
          mentoreId: string
          mentorId: string
          notes?: string | null
          statut?: string
          tenantId: string
          type?: string
          updatedAt: string
        }
        Update: {
          createdAt?: string
          dateDebut?: string
          dateFin?: string | null
          frequence?: string
          id?: string
          mentoreId?: string
          mentorId?: string
          notes?: string | null
          statut?: string
          tenantId?: string
          type?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentorats_mentoreId_fkey"
            columns: ["mentoreId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentorats_mentorId_fkey"
            columns: ["mentorId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentorats_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachmentType: string | null
          attachmentUrl: string | null
          content: string
          conversationId: string
          createdAt: string
          deletedAt: string | null
          editedAt: string | null
          id: string
          readBy: string[] | null
          replyToId: string | null
          senderId: string
        }
        Insert: {
          attachmentType?: string | null
          attachmentUrl?: string | null
          content: string
          conversationId: string
          createdAt?: string
          deletedAt?: string | null
          editedAt?: string | null
          id: string
          readBy?: string[] | null
          replyToId?: string | null
          senderId: string
        }
        Update: {
          attachmentType?: string | null
          attachmentUrl?: string | null
          content?: string
          conversationId?: string
          createdAt?: string
          deletedAt?: string | null
          editedAt?: string | null
          id?: string
          readBy?: string[] | null
          replyToId?: string | null
          senderId?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversationId_fkey"
            columns: ["conversationId"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_replyToId_fkey"
            columns: ["replyToId"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_senderId_fkey"
            columns: ["senderId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      module_activations: {
        Row: {
          activeAt: string
          activeParId: string | null
          createdAt: string
          desactiveAt: string | null
          desactiveParId: string | null
          finEssaiAt: string | null
          id: string
          moduleId: string
          statut: string
          tenantId: string
          updatedAt: string
        }
        Insert: {
          activeAt?: string
          activeParId?: string | null
          createdAt?: string
          desactiveAt?: string | null
          desactiveParId?: string | null
          finEssaiAt?: string | null
          id: string
          moduleId: string
          statut?: string
          tenantId: string
          updatedAt: string
        }
        Update: {
          activeAt?: string
          activeParId?: string | null
          createdAt?: string
          desactiveAt?: string | null
          desactiveParId?: string | null
          finEssaiAt?: string | null
          id?: string
          moduleId?: string
          statut?: string
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_activations_moduleId_fkey"
            columns: ["moduleId"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_activations_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          actifParDefaut: boolean
          code: string
          createdAt: string
          description: string | null
          id: string
          nom: string
          ordre: number
          payant: boolean
          planMinimum: Database["public"]["Enums"]["PlanType"]
          prixMensuel: number | null
          updatedAt: string
        }
        Insert: {
          actifParDefaut?: boolean
          code: string
          createdAt?: string
          description?: string | null
          id: string
          nom: string
          ordre?: number
          payant?: boolean
          planMinimum?: Database["public"]["Enums"]["PlanType"]
          prixMensuel?: number | null
          updatedAt: string
        }
        Update: {
          actifParDefaut?: boolean
          code?: string
          createdAt?: string
          description?: string | null
          id?: string
          nom?: string
          ordre?: number
          payant?: boolean
          planMinimum?: Database["public"]["Enums"]["PlanType"]
          prixMensuel?: number | null
          updatedAt?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          appreciation: string | null
          classeId: string
          coefficient: number
          commentaire: string | null
          createdAt: string
          date: string
          eleveId: string
          evaluationId: string | null
          id: string
          intitule: string | null
          isPubliee: boolean
          matiereId: string
          noteMax: number
          periodeId: string | null
          saisieParId: string | null
          tenantId: string
          type: Database["public"]["Enums"]["TypeNote"]
          updatedAt: string
          valeur: number
        }
        Insert: {
          appreciation?: string | null
          classeId: string
          coefficient?: number
          commentaire?: string | null
          createdAt?: string
          date: string
          eleveId: string
          evaluationId?: string | null
          id: string
          intitule?: string | null
          isPubliee?: boolean
          matiereId: string
          noteMax?: number
          periodeId?: string | null
          saisieParId?: string | null
          tenantId: string
          type?: Database["public"]["Enums"]["TypeNote"]
          updatedAt: string
          valeur: number
        }
        Update: {
          appreciation?: string | null
          classeId?: string
          coefficient?: number
          commentaire?: string | null
          createdAt?: string
          date?: string
          eleveId?: string
          evaluationId?: string | null
          id?: string
          intitule?: string | null
          isPubliee?: boolean
          matiereId?: string
          noteMax?: number
          periodeId?: string | null
          saisieParId?: string | null
          tenantId?: string
          type?: Database["public"]["Enums"]["TypeNote"]
          updatedAt?: string
          valeur?: number
        }
        Relationships: [
          {
            foreignKeyName: "notes_classeId_fkey"
            columns: ["classeId"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_evaluationId_fkey"
            columns: ["evaluationId"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_periodeId_fkey"
            columns: ["periodeId"]
            isOneToOne: false
            referencedRelation: "periodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          canal: Database["public"]["Enums"]["CanalNotification"]
          cible: Database["public"]["Enums"]["CibleNotification"]
          classeId: string | null
          contenu: string
          createdAt: string
          envoyeeAt: string | null
          envoyeParId: string | null
          id: string
          nbDelivres: number
          nbDestinataires: number
          nbLus: number
          niveau: string | null
          planifieeAt: string | null
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutNotification"]
          tenantId: string
          titre: string
          updatedAt: string
        }
        Insert: {
          canal?: Database["public"]["Enums"]["CanalNotification"]
          cible?: Database["public"]["Enums"]["CibleNotification"]
          classeId?: string | null
          contenu: string
          createdAt?: string
          envoyeeAt?: string | null
          envoyeParId?: string | null
          id: string
          nbDelivres?: number
          nbDestinataires?: number
          nbLus?: number
          niveau?: string | null
          planifieeAt?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutNotification"]
          tenantId: string
          titre: string
          updatedAt: string
        }
        Update: {
          canal?: Database["public"]["Enums"]["CanalNotification"]
          cible?: Database["public"]["Enums"]["CibleNotification"]
          classeId?: string | null
          contenu?: string
          createdAt?: string
          envoyeeAt?: string | null
          envoyeParId?: string | null
          id?: string
          nbDelivres?: number
          nbDestinataires?: number
          nbLus?: number
          niveau?: string | null
          planifieeAt?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutNotification"]
          tenantId?: string
          titre?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_envoyeParId_fkey"
            columns: ["envoyeParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      objectifs_mentorat: {
        Row: {
          createdAt: string
          dateCible: string | null
          description: string | null
          id: string
          mentoratId: string
          priorite: number
          progression: number
          statut: string
          titre: string
          updatedAt: string
        }
        Insert: {
          createdAt?: string
          dateCible?: string | null
          description?: string | null
          id: string
          mentoratId: string
          priorite?: number
          progression?: number
          statut?: string
          titre: string
          updatedAt: string
        }
        Update: {
          createdAt?: string
          dateCible?: string | null
          description?: string | null
          id?: string
          mentoratId?: string
          priorite?: number
          progression?: number
          statut?: string
          titre?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "objectifs_mentorat_mentoratId_fkey"
            columns: ["mentoratId"]
            isOneToOne: false
            referencedRelation: "mentorats"
            referencedColumns: ["id"]
          },
        ]
      }
      paiements: {
        Row: {
          date: string
          dateSaisie: string
          devise: string
          enregistreParId: string | null
          factureId: string
          id: string
          methode: string
          montant: number
          recu: string | null
          reference: string | null
        }
        Insert: {
          date?: string
          dateSaisie?: string
          devise?: string
          enregistreParId?: string | null
          factureId: string
          id: string
          methode: string
          montant: number
          recu?: string | null
          reference?: string | null
        }
        Update: {
          date?: string
          dateSaisie?: string
          devise?: string
          enregistreParId?: string | null
          factureId?: string
          id?: string
          methode?: string
          montant?: number
          recu?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paiements_enregistreParId_fkey"
            columns: ["enregistreParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paiements_factureId_fkey"
            columns: ["factureId"]
            isOneToOne: false
            referencedRelation: "factures"
            referencedColumns: ["id"]
          },
        ]
      }
      parcours_scolaires: {
        Row: {
          annee: string
          classe: string
          commentaire: string | null
          createdAt: string
          decision: string | null
          effectif: number | null
          eleveId: string
          id: string
          mention: string | null
          moyenneAnnuelle: number | null
          niveau: string
          rang: number | null
          recommandation:
            | Database["public"]["Enums"]["TypeRecommandation"]
            | null
          tenantId: string
        }
        Insert: {
          annee: string
          classe: string
          commentaire?: string | null
          createdAt?: string
          decision?: string | null
          effectif?: number | null
          eleveId: string
          id: string
          mention?: string | null
          moyenneAnnuelle?: number | null
          niveau: string
          rang?: number | null
          recommandation?:
            | Database["public"]["Enums"]["TypeRecommandation"]
            | null
          tenantId: string
        }
        Update: {
          annee?: string
          classe?: string
          commentaire?: string | null
          createdAt?: string
          decision?: string | null
          effectif?: number | null
          eleveId?: string
          id?: string
          mention?: string | null
          moyenneAnnuelle?: number | null
          niveau?: string
          rang?: number | null
          recommandation?:
            | Database["public"]["Enums"]["TypeRecommandation"]
            | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcours_scolaires_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
        ]
      }
      parents: {
        Row: {
          adresse: string | null
          createdAt: string
          email: string | null
          id: string
          nom: string
          phone: string
          phone2: string | null
          photoUrl: string | null
          prenom: string
          profession: string | null
          telegramChatId: string | null
          tenantId: string
          updatedAt: string
          userId: string | null
        }
        Insert: {
          adresse?: string | null
          createdAt?: string
          email?: string | null
          id: string
          nom: string
          phone: string
          phone2?: string | null
          photoUrl?: string | null
          prenom: string
          profession?: string | null
          telegramChatId?: string | null
          tenantId: string
          updatedAt: string
          userId?: string | null
        }
        Update: {
          adresse?: string | null
          createdAt?: string
          email?: string | null
          id?: string
          nom?: string
          phone?: string
          phone2?: string | null
          photoUrl?: string | null
          prenom?: string
          profession?: string | null
          telegramChatId?: string | null
          tenantId?: string
          updatedAt?: string
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parents_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      passages_infirmerie: {
        Row: {
          createdAt: string
          date: string
          dureeMin: number | null
          eleveId: string
          id: string
          infirmierId: string | null
          motif: string
          notes: string | null
          retourCours: boolean
          siteId: string | null
          soin: string | null
          suite: string
          tenantId: string
          updatedAt: string
        }
        Insert: {
          createdAt?: string
          date: string
          dureeMin?: number | null
          eleveId: string
          id: string
          infirmierId?: string | null
          motif: string
          notes?: string | null
          retourCours?: boolean
          siteId?: string | null
          soin?: string | null
          suite: string
          tenantId: string
          updatedAt: string
        }
        Update: {
          createdAt?: string
          date?: string
          dureeMin?: number | null
          eleveId?: string
          id?: string
          infirmierId?: string | null
          motif?: string
          notes?: string | null
          retourCours?: boolean
          siteId?: string | null
          soin?: string | null
          suite?: string
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "passages_infirmerie_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passages_infirmerie_infirmierId_fkey"
            columns: ["infirmierId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passages_infirmerie_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passages_infirmerie_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      periodes: {
        Row: {
          anneeId: string
          cloturedAt: string | null
          dateDebut: string
          dateFin: string
          dateLimiteSaisie: string | null
          id: string
          isCurrent: boolean
          nom: string
          numero: number
          statut: string
        }
        Insert: {
          anneeId: string
          cloturedAt?: string | null
          dateDebut: string
          dateFin: string
          dateLimiteSaisie?: string | null
          id: string
          isCurrent?: boolean
          nom: string
          numero: number
          statut?: string
        }
        Update: {
          anneeId?: string
          cloturedAt?: string | null
          dateDebut?: string
          dateFin?: string
          dateLimiteSaisie?: string | null
          id?: string
          isCurrent?: boolean
          nom?: string
          numero?: number
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: "periodes_anneeId_fkey"
            columns: ["anneeId"]
            isOneToOne: false
            referencedRelation: "annees_scolaires"
            referencedColumns: ["id"]
          },
        ]
      }
      progressions_eleves: {
        Row: {
          contenusVus: string[] | null
          coursId: string
          createdAt: string
          eleveId: string | null
          eleveNom: string
          id: string
          isTermine: boolean
          noteFinale: number | null
          pctCompletion: number
          tenantId: string
          termineeAt: string | null
          updatedAt: string
        }
        Insert: {
          contenusVus?: string[] | null
          coursId: string
          createdAt?: string
          eleveId?: string | null
          eleveNom: string
          id: string
          isTermine?: boolean
          noteFinale?: number | null
          pctCompletion?: number
          tenantId: string
          termineeAt?: string | null
          updatedAt: string
        }
        Update: {
          contenusVus?: string[] | null
          coursId?: string
          createdAt?: string
          eleveId?: string | null
          eleveNom?: string
          id?: string
          isTermine?: boolean
          noteFinale?: number | null
          pctCompletion?: number
          tenantId?: string
          termineeAt?: string | null
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "progressions_eleves_coursId_fkey"
            columns: ["coursId"]
            isOneToOne: false
            referencedRelation: "cours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progressions_eleves_eleveId_fkey"
            columns: ["eleveId"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progressions_eleves_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_counters: {
        Row: {
          count: number
          id: string
          key: string
          updatedAt: string
          windowStart: string
        }
        Insert: {
          count?: number
          id: string
          key: string
          updatedAt?: string
          windowStart: string
        }
        Update: {
          count?: number
          id?: string
          key?: string
          updatedAt?: string
          windowStart?: string
        }
        Relationships: []
      }
      regles_appreciation: {
        Row: {
          contexte: Database["public"]["Enums"]["ContexteAppreciation"]
          createdAt: string
          id: string
          libelle: string
          ordre: number
          seuilMax: number
          seuilMin: number
          tenantId: string
          updatedAt: string
        }
        Insert: {
          contexte: Database["public"]["Enums"]["ContexteAppreciation"]
          createdAt?: string
          id: string
          libelle: string
          ordre?: number
          seuilMax: number
          seuilMin: number
          tenantId: string
          updatedAt: string
        }
        Update: {
          contexte?: Database["public"]["Enums"]["ContexteAppreciation"]
          createdAt?: string
          id?: string
          libelle?: string
          ordre?: number
          seuilMax?: number
          seuilMin?: number
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "regles_appreciation_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      relances: {
        Row: {
          canal: string
          envoyeeLe: string
          envoyeeParId: string | null
          factureId: string
          id: string
          message: string
          niveau: number
          tenantId: string
        }
        Insert: {
          canal: string
          envoyeeLe?: string
          envoyeeParId?: string | null
          factureId: string
          id: string
          message: string
          niveau: number
          tenantId: string
        }
        Update: {
          canal?: string
          envoyeeLe?: string
          envoyeeParId?: string | null
          factureId?: string
          id?: string
          message?: string
          niveau?: number
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "relances_envoyeeParId_fkey"
            columns: ["envoyeeParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relances_factureId_fkey"
            columns: ["factureId"]
            isOneToOne: false
            referencedRelation: "factures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relances_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      remises_caisse: {
        Row: {
          caissierId: string
          commentaireReceveur: string | null
          createdAt: string
          dateReception: string | null
          dateRemise: string
          dateSaisieReception: string | null
          dateSaisieRemise: string
          devise: string
          id: string
          montantDeclare: number
          montantRecu: number | null
          periodeDebut: string
          periodeFin: string
          receveurId: string | null
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutRemiseCaisse"]
          tenantId: string
          updatedAt: string
        }
        Insert: {
          caissierId: string
          commentaireReceveur?: string | null
          createdAt?: string
          dateReception?: string | null
          dateRemise: string
          dateSaisieReception?: string | null
          dateSaisieRemise?: string
          devise?: string
          id: string
          montantDeclare: number
          montantRecu?: number | null
          periodeDebut: string
          periodeFin: string
          receveurId?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutRemiseCaisse"]
          tenantId: string
          updatedAt: string
        }
        Update: {
          caissierId?: string
          commentaireReceveur?: string | null
          createdAt?: string
          dateReception?: string | null
          dateRemise?: string
          dateSaisieReception?: string | null
          dateSaisieRemise?: string
          devise?: string
          id?: string
          montantDeclare?: number
          montantRecu?: number | null
          periodeDebut?: string
          periodeFin?: string
          receveurId?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutRemiseCaisse"]
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "remises_caisse_caissierId_fkey"
            columns: ["caissierId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remises_caisse_receveurId_fkey"
            columns: ["receveurId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remises_caisse_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remises_caisse_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      remplacements_cours: {
        Row: {
          classeId: string
          createdAt: string
          date: string
          decideParId: string | null
          emploiTempsId: string | null
          enseignantAbsentId: string | null
          enseignantRemplacantId: string | null
          heureDebut: string
          heureFin: string
          id: string
          matiereId: string
          motifAbsence: string | null
          notes: string | null
          salle: string | null
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutRemplacement"]
          tenantId: string
          updatedAt: string
        }
        Insert: {
          classeId: string
          createdAt?: string
          date: string
          decideParId?: string | null
          emploiTempsId?: string | null
          enseignantAbsentId?: string | null
          enseignantRemplacantId?: string | null
          heureDebut: string
          heureFin: string
          id: string
          matiereId: string
          motifAbsence?: string | null
          notes?: string | null
          salle?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutRemplacement"]
          tenantId: string
          updatedAt: string
        }
        Update: {
          classeId?: string
          createdAt?: string
          date?: string
          decideParId?: string | null
          emploiTempsId?: string | null
          enseignantAbsentId?: string | null
          enseignantRemplacantId?: string | null
          heureDebut?: string
          heureFin?: string
          id?: string
          matiereId?: string
          motifAbsence?: string | null
          notes?: string | null
          salle?: string | null
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutRemplacement"]
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "remplacements_cours_classeId_fkey"
            columns: ["classeId"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remplacements_cours_decideParId_fkey"
            columns: ["decideParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remplacements_cours_emploiTempsId_fkey"
            columns: ["emploiTempsId"]
            isOneToOne: false
            referencedRelation: "emplois_temps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remplacements_cours_enseignantAbsentId_fkey"
            columns: ["enseignantAbsentId"]
            isOneToOne: false
            referencedRelation: "enseignants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remplacements_cours_enseignantRemplacantId_fkey"
            columns: ["enseignantRemplacantId"]
            isOneToOne: false
            referencedRelation: "enseignants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remplacements_cours_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remplacements_cours_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remplacements_cours_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      resolutions: {
        Row: {
          conseilId: string | null
          createdAt: string
          dateEffet: string | null
          dateFin: string | null
          dateVote: string | null
          description: string | null
          id: string
          resultats: Json | null
          statut: string
          tenantId: string
          titre: string
          updatedAt: string
        }
        Insert: {
          conseilId?: string | null
          createdAt?: string
          dateEffet?: string | null
          dateFin?: string | null
          dateVote?: string | null
          description?: string | null
          id: string
          resultats?: Json | null
          statut?: string
          tenantId: string
          titre: string
          updatedAt: string
        }
        Update: {
          conseilId?: string | null
          createdAt?: string
          dateEffet?: string | null
          dateFin?: string | null
          dateVote?: string | null
          description?: string | null
          id?: string
          resultats?: Json | null
          statut?: string
          tenantId?: string
          titre?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "resolutions_conseilId_fkey"
            columns: ["conseilId"]
            isOneToOne: false
            referencedRelation: "conseils"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resolutions_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reunions: {
        Row: {
          compteRendu: string | null
          conseilId: string
          createdAt: string
          date: string
          id: string
          lieu: string | null
          ordreDuJour: string | null
          presences: Json | null
          statut: string
          titre: string
          updatedAt: string
        }
        Insert: {
          compteRendu?: string | null
          conseilId: string
          createdAt?: string
          date: string
          id: string
          lieu?: string | null
          ordreDuJour?: string | null
          presences?: Json | null
          statut?: string
          titre: string
          updatedAt: string
        }
        Update: {
          compteRendu?: string | null
          conseilId?: string
          createdAt?: string
          date?: string
          id?: string
          lieu?: string | null
          ordreDuJour?: string | null
          presences?: Json | null
          statut?: string
          titre?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "reunions_conseilId_fkey"
            columns: ["conseilId"]
            isOneToOne: false
            referencedRelation: "conseils"
            referencedColumns: ["id"]
          },
        ]
      }
      salles: {
        Row: {
          batiment: string | null
          capacite: number
          id: string
          nom: string
          siteId: string | null
          tenantId: string
          type: string | null
        }
        Insert: {
          batiment?: string | null
          capacite?: number
          id: string
          nom: string
          siteId?: string | null
          tenantId: string
          type?: string | null
        }
        Update: {
          batiment?: string | null
          capacite?: number
          id?: string
          nom?: string
          siteId?: string | null
          tenantId?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salles_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salles_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sanctions: {
        Row: {
          accuseReceptionParent: string | null
          createdAt: string
          dateDebut: string
          dateFin: string | null
          dateRetourEffective: string | null
          description: string | null
          id: string
          incidentId: string
          parentNotifie: boolean
          reintegreParId: string | null
          travailDonne: string | null
          type: Database["public"]["Enums"]["TypeSanction"]
        }
        Insert: {
          accuseReceptionParent?: string | null
          createdAt?: string
          dateDebut: string
          dateFin?: string | null
          dateRetourEffective?: string | null
          description?: string | null
          id: string
          incidentId: string
          parentNotifie?: boolean
          reintegreParId?: string | null
          travailDonne?: string | null
          type: Database["public"]["Enums"]["TypeSanction"]
        }
        Update: {
          accuseReceptionParent?: string | null
          createdAt?: string
          dateDebut?: string
          dateFin?: string | null
          dateRetourEffective?: string | null
          description?: string | null
          id?: string
          incidentId?: string
          parentNotifie?: boolean
          reintegreParId?: string | null
          travailDonne?: string | null
          type?: Database["public"]["Enums"]["TypeSanction"]
        }
        Relationships: [
          {
            foreignKeyName: "sanctions_incidentId_fkey"
            columns: ["incidentId"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sanctions_reintegreParId_fkey"
            columns: ["reintegreParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      seance_commentaires: {
        Row: {
          auteurId: string | null
          contenu: string
          createdAt: string
          id: string
          seanceId: string
          updatedAt: string
        }
        Insert: {
          auteurId?: string | null
          contenu: string
          createdAt?: string
          id: string
          seanceId: string
          updatedAt: string
        }
        Update: {
          auteurId?: string | null
          contenu?: string
          createdAt?: string
          id?: string
          seanceId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "seance_commentaires_auteurId_fkey"
            columns: ["auteurId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seance_commentaires_seanceId_fkey"
            columns: ["seanceId"]
            isOneToOne: false
            referencedRelation: "seances_pedagogiques"
            referencedColumns: ["id"]
          },
        ]
      }
      seances_competences: {
        Row: {
          competenceId: string
          id: string
          niveau: string
          seanceId: string
        }
        Insert: {
          competenceId: string
          id: string
          niveau?: string
          seanceId: string
        }
        Update: {
          competenceId?: string
          id?: string
          niveau?: string
          seanceId?: string
        }
        Relationships: [
          {
            foreignKeyName: "seances_competences_competenceId_fkey"
            columns: ["competenceId"]
            isOneToOne: false
            referencedRelation: "learnos_competences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seances_competences_seanceId_fkey"
            columns: ["seanceId"]
            isOneToOne: false
            referencedRelation: "seances_pedagogiques"
            referencedColumns: ["id"]
          },
        ]
      }
      seances_mentorat: {
        Row: {
          compteRendu: string | null
          createdAt: string
          date: string
          duree: number | null
          id: string
          lieu: string | null
          mentoratId: string
          statut: string
          updatedAt: string
        }
        Insert: {
          compteRendu?: string | null
          createdAt?: string
          date: string
          duree?: number | null
          id: string
          lieu?: string | null
          mentoratId: string
          statut?: string
          updatedAt: string
        }
        Update: {
          compteRendu?: string | null
          createdAt?: string
          date?: string
          duree?: number | null
          id?: string
          lieu?: string | null
          mentoratId?: string
          statut?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "seances_mentorat_mentoratId_fkey"
            columns: ["mentoratId"]
            isOneToOne: false
            referencedRelation: "mentorats"
            referencedColumns: ["id"]
          },
        ]
      }
      seances_pedagogiques: {
        Row: {
          absents: number | null
          activites: Json | null
          chapitreId: string | null
          classeId: string
          contenu: string | null
          createdAt: string
          date: string
          differentiation: Json | null
          dureePrevue: number
          dureeReelle: number | null
          enseignantId: string | null
          fichiers: Json | null
          id: string
          matiereId: string
          objectifs: Json | null
          planificationId: string | null
          planLeconId: string | null
          presents: number | null
          rythme: string
          semaine: number
          siteId: string | null
          statut: Database["public"]["Enums"]["StatutSeance"]
          supports: Json | null
          tenantId: string
          updatedAt: string
        }
        Insert: {
          absents?: number | null
          activites?: Json | null
          chapitreId?: string | null
          classeId: string
          contenu?: string | null
          createdAt?: string
          date: string
          differentiation?: Json | null
          dureePrevue?: number
          dureeReelle?: number | null
          enseignantId?: string | null
          fichiers?: Json | null
          id: string
          matiereId: string
          objectifs?: Json | null
          planificationId?: string | null
          planLeconId?: string | null
          presents?: number | null
          rythme?: string
          semaine: number
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutSeance"]
          supports?: Json | null
          tenantId: string
          updatedAt: string
        }
        Update: {
          absents?: number | null
          activites?: Json | null
          chapitreId?: string | null
          classeId?: string
          contenu?: string | null
          createdAt?: string
          date?: string
          differentiation?: Json | null
          dureePrevue?: number
          dureeReelle?: number | null
          enseignantId?: string | null
          fichiers?: Json | null
          id?: string
          matiereId?: string
          objectifs?: Json | null
          planificationId?: string | null
          planLeconId?: string | null
          presents?: number | null
          rythme?: string
          semaine?: number
          siteId?: string | null
          statut?: Database["public"]["Enums"]["StatutSeance"]
          supports?: Json | null
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "seances_pedagogiques_chapitreId_fkey"
            columns: ["chapitreId"]
            isOneToOne: false
            referencedRelation: "learnos_chapitres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seances_pedagogiques_classeId_fkey"
            columns: ["classeId"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seances_pedagogiques_enseignantId_fkey"
            columns: ["enseignantId"]
            isOneToOne: false
            referencedRelation: "enseignants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seances_pedagogiques_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seances_pedagogiques_planificationId_fkey"
            columns: ["planificationId"]
            isOneToOne: false
            referencedRelation: "learnos_planification_chapitres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seances_pedagogiques_planLeconId_fkey"
            columns: ["planLeconId"]
            isOneToOne: false
            referencedRelation: "learnos_plans_lecon"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seances_pedagogiques_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seances_pedagogiques_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          expires: string
          id: string
          sessionToken: string
          userId: string
        }
        Insert: {
          expires: string
          id: string
          sessionToken: string
          userId: string
        }
        Update: {
          expires?: string
          id?: string
          sessionToken?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions_examen: {
        Row: {
          date: string
          examId: string
          heureDebut: string
          heureFin: string
          id: string
          matiereNom: string
          niveau: string | null
          salle: string | null
          surveillants: Json | null
        }
        Insert: {
          date: string
          examId: string
          heureDebut: string
          heureFin: string
          id: string
          matiereNom: string
          niveau?: string | null
          salle?: string | null
          surveillants?: Json | null
        }
        Update: {
          date?: string
          examId?: string
          heureDebut?: string
          heureFin?: string
          id?: string
          matiereNom?: string
          niveau?: string | null
          salle?: string | null
          surveillants?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_examen_examId_fkey"
            columns: ["examId"]
            isOneToOne: false
            referencedRelation: "examens"
            referencedColumns: ["id"]
          },
        ]
      }
      site_deletion_logs: {
        Row: {
          action: string
          id: string
          metadata: Json | null
          performedAt: string
          performedBy: string
          performedByName: string | null
          reason: string | null
          siteId: string
          siteNom: string
          tenantId: string
        }
        Insert: {
          action: string
          id: string
          metadata?: Json | null
          performedAt?: string
          performedBy: string
          performedByName?: string | null
          reason?: string | null
          siteId: string
          siteNom: string
          tenantId: string
        }
        Update: {
          action?: string
          id?: string
          metadata?: Json | null
          performedAt?: string
          performedBy?: string
          performedByName?: string | null
          reason?: string | null
          siteId?: string
          siteNom?: string
          tenantId?: string
        }
        Relationships: []
      }
      sites: {
        Row: {
          actif: boolean
          adresse: string | null
          code: string | null
          createdAt: string
          deletedAt: string | null
          deletedBy: string | null
          deletedReason: string | null
          email: string | null
          id: string
          nom: string
          scheduledPurgeAt: string | null
          telephone: string | null
          tenantId: string
          updatedAt: string
          ville: string | null
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          code?: string | null
          createdAt?: string
          deletedAt?: string | null
          deletedBy?: string | null
          deletedReason?: string | null
          email?: string | null
          id: string
          nom: string
          scheduledPurgeAt?: string | null
          telephone?: string | null
          tenantId: string
          updatedAt: string
          ville?: string | null
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          code?: string | null
          createdAt?: string
          deletedAt?: string | null
          deletedBy?: string | null
          deletedReason?: string | null
          email?: string | null
          id?: string
          nom?: string
          scheduledPurgeAt?: string | null
          telephone?: string | null
          tenantId?: string
          updatedAt?: string
          ville?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      structures: {
        Row: {
          actif: boolean
          createdAt: string
          id: string
          nom: string
          siteId: string | null
          tenantId: string
          type: Database["public"]["Enums"]["StructureType"]
          updatedAt: string
        }
        Insert: {
          actif?: boolean
          createdAt?: string
          id: string
          nom: string
          siteId?: string | null
          tenantId: string
          type: Database["public"]["Enums"]["StructureType"]
          updatedAt: string
        }
        Update: {
          actif?: boolean
          createdAt?: string
          id?: string
          nom?: string
          siteId?: string | null
          tenantId?: string
          type?: Database["public"]["Enums"]["StructureType"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "structures_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "structures_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_configs: {
        Row: {
          apiKey: string
          createdAt: string
          id: string
          includeAbsences: boolean
          includeBulletins: boolean
          includeComptabilite: boolean
          includeEmploiTemps: boolean
          includeExamens: boolean
          includeNotes: boolean
          includeParametres: boolean
          includePersonnel: boolean
          lastSyncAt: string | null
          lastSyncError: string | null
          lastSyncStatus: string | null
          serverNick: string
          syncEnabled: boolean
          syncInterval: number
          tenantId: string
          updatedAt: string
        }
        Insert: {
          apiKey: string
          createdAt?: string
          id: string
          includeAbsences?: boolean
          includeBulletins?: boolean
          includeComptabilite?: boolean
          includeEmploiTemps?: boolean
          includeExamens?: boolean
          includeNotes?: boolean
          includeParametres?: boolean
          includePersonnel?: boolean
          lastSyncAt?: string | null
          lastSyncError?: string | null
          lastSyncStatus?: string | null
          serverNick: string
          syncEnabled?: boolean
          syncInterval?: number
          tenantId: string
          updatedAt: string
        }
        Update: {
          apiKey?: string
          createdAt?: string
          id?: string
          includeAbsences?: boolean
          includeBulletins?: boolean
          includeComptabilite?: boolean
          includeEmploiTemps?: boolean
          includeExamens?: boolean
          includeNotes?: boolean
          includeParametres?: boolean
          includePersonnel?: boolean
          lastSyncAt?: string | null
          lastSyncError?: string | null
          lastSyncStatus?: string | null
          serverNick?: string
          syncEnabled?: boolean
          syncInterval?: number
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_configs_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tache_cron_executions: {
        Row: {
          executeeAt: string
          fenetre: string
          id: string
          nom: string
          resultat: Json | null
        }
        Insert: {
          executeeAt?: string
          fenetre: string
          id: string
          nom: string
          resultat?: Json | null
        }
        Update: {
          executeeAt?: string
          fenetre?: string
          id?: string
          nom?: string
          resultat?: Json | null
        }
        Relationships: []
      }
      taches: {
        Row: {
          assigneeAId: string
          classeId: string | null
          createdAt: string
          creeParId: string | null
          dateFaite: string | null
          description: string | null
          echeance: string | null
          id: string
          matiereId: string | null
          priorite: Database["public"]["Enums"]["PrioriteTache"]
          siteId: string | null
          sourceId: string | null
          sourceType: string | null
          statut: Database["public"]["Enums"]["StatutTache"]
          tenantId: string
          titre: string
          type: string
          updatedAt: string
        }
        Insert: {
          assigneeAId: string
          classeId?: string | null
          createdAt?: string
          creeParId?: string | null
          dateFaite?: string | null
          description?: string | null
          echeance?: string | null
          id: string
          matiereId?: string | null
          priorite?: Database["public"]["Enums"]["PrioriteTache"]
          siteId?: string | null
          sourceId?: string | null
          sourceType?: string | null
          statut?: Database["public"]["Enums"]["StatutTache"]
          tenantId: string
          titre: string
          type?: string
          updatedAt: string
        }
        Update: {
          assigneeAId?: string
          classeId?: string | null
          createdAt?: string
          creeParId?: string | null
          dateFaite?: string | null
          description?: string | null
          echeance?: string | null
          id?: string
          matiereId?: string | null
          priorite?: Database["public"]["Enums"]["PrioriteTache"]
          siteId?: string | null
          sourceId?: string | null
          sourceType?: string | null
          statut?: Database["public"]["Enums"]["StatutTache"]
          tenantId?: string
          titre?: string
          type?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "taches_assigneeAId_fkey"
            columns: ["assigneeAId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taches_classeId_fkey"
            columns: ["classeId"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taches_creeParId_fkey"
            columns: ["creeParId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taches_matiereId_fkey"
            columns: ["matiereId"]
            isOneToOne: false
            referencedRelation: "matieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taches_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taches_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tarifs_niveau: {
        Row: {
          actif: boolean
          annee: string
          createdAt: string
          devise: string
          fraisCantine: number | null
          fraisInscription: number
          fraisRenouvellement: number
          fraisTransport: number | null
          id: string
          mensualite: number
          nbMois: number
          niveau: string
          siteId: string | null
          tenantId: string
          updatedAt: string
        }
        Insert: {
          actif?: boolean
          annee: string
          createdAt?: string
          devise?: string
          fraisCantine?: number | null
          fraisInscription: number
          fraisRenouvellement: number
          fraisTransport?: number | null
          id: string
          mensualite: number
          nbMois?: number
          niveau: string
          siteId?: string | null
          tenantId: string
          updatedAt: string
        }
        Update: {
          actif?: boolean
          annee?: string
          createdAt?: string
          devise?: string
          fraisCantine?: number | null
          fraisInscription?: number
          fraisRenouvellement?: number
          fraisTransport?: number | null
          id?: string
          mensualite?: number
          nbMois?: number
          niveau?: string
          siteId?: string | null
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarifs_niveau_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarifs_niveau_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          cachetUrl: string | null
          chefEtablissement: string | null
          city: string | null
          country: string
          createdAt: string
          currency: string
          currentYear: string
          domain: string | null
          email: string | null
          id: string
          langue: string
          logoUrl: string | null
          modeleNiveaux: Database["public"]["Enums"]["ModeleNiveaux"]
          name: string
          notationMax: number
          phone: string | null
          plan: Database["public"]["Enums"]["PlanType"]
          primaryColor: string | null
          secondaryColor: string | null
          signatureUrl: string | null
          siret: string | null
          slug: string
          status: Database["public"]["Enums"]["TenantStatus"]
          stripeCustomerId: string | null
          stripeSubscriptionId: string | null
          timezone: string
          trialEndsAt: string | null
          updatedAt: string
          website: string | null
        }
        Insert: {
          address?: string | null
          cachetUrl?: string | null
          chefEtablissement?: string | null
          city?: string | null
          country?: string
          createdAt?: string
          currency?: string
          currentYear?: string
          domain?: string | null
          email?: string | null
          id: string
          langue?: string
          logoUrl?: string | null
          modeleNiveaux?: Database["public"]["Enums"]["ModeleNiveaux"]
          name: string
          notationMax?: number
          phone?: string | null
          plan?: Database["public"]["Enums"]["PlanType"]
          primaryColor?: string | null
          secondaryColor?: string | null
          signatureUrl?: string | null
          siret?: string | null
          slug: string
          status?: Database["public"]["Enums"]["TenantStatus"]
          stripeCustomerId?: string | null
          stripeSubscriptionId?: string | null
          timezone?: string
          trialEndsAt?: string | null
          updatedAt: string
          website?: string | null
        }
        Update: {
          address?: string | null
          cachetUrl?: string | null
          chefEtablissement?: string | null
          city?: string | null
          country?: string
          createdAt?: string
          currency?: string
          currentYear?: string
          domain?: string | null
          email?: string | null
          id?: string
          langue?: string
          logoUrl?: string | null
          modeleNiveaux?: Database["public"]["Enums"]["ModeleNiveaux"]
          name?: string
          notationMax?: number
          phone?: string | null
          plan?: Database["public"]["Enums"]["PlanType"]
          primaryColor?: string | null
          secondaryColor?: string | null
          signatureUrl?: string | null
          siret?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["TenantStatus"]
          stripeCustomerId?: string | null
          stripeSubscriptionId?: string | null
          timezone?: string
          trialEndsAt?: string | null
          updatedAt?: string
          website?: string | null
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          createdAt: string
          id: string
          mode: string
          permission: string
          tenantId: string
          updatedAt: string
          userId: string
        }
        Insert: {
          createdAt?: string
          id: string
          mode?: string
          permission: string
          tenantId: string
          updatedAt: string
          userId: string
        }
        Update: {
          createdAt?: string
          id?: string
          mode?: string
          permission?: string
          tenantId?: string
          updatedAt?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          createdAt: string
          id: string
          isActive: boolean
          role: Database["public"]["Enums"]["Role"]
          tenantId: string
          updatedAt: string
          userId: string
        }
        Insert: {
          createdAt?: string
          id: string
          isActive?: boolean
          role: Database["public"]["Enums"]["Role"]
          tenantId: string
          updatedAt: string
          userId: string
        }
        Update: {
          createdAt?: string
          id?: string
          isActive?: boolean
          role?: Database["public"]["Enums"]["Role"]
          tenantId?: string
          updatedAt?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sites: {
        Row: {
          createdAt: string
          id: string
          role: Database["public"]["Enums"]["Role"] | null
          siteId: string
          updatedAt: string | null
          userId: string
        }
        Insert: {
          createdAt?: string
          id: string
          role?: Database["public"]["Enums"]["Role"] | null
          siteId: string
          updatedAt?: string | null
          userId: string
        }
        Update: {
          createdAt?: string
          id?: string
          role?: Database["public"]["Enums"]["Role"] | null
          siteId?: string
          updatedAt?: string | null
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sites_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sites_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tenants: {
        Row: {
          createdAt: string
          id: string
          isActive: boolean
          isDefault: boolean
          role: Database["public"]["Enums"]["Role"]
          tenantId: string
          updatedAt: string
          userId: string
        }
        Insert: {
          createdAt?: string
          id: string
          isActive?: boolean
          isDefault?: boolean
          role: Database["public"]["Enums"]["Role"]
          tenantId: string
          updatedAt: string
          userId: string
        }
        Update: {
          createdAt?: string
          id?: string
          isActive?: boolean
          isDefault?: boolean
          role?: Database["public"]["Enums"]["Role"]
          tenantId?: string
          updatedAt?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tenants_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tenants_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatarUrl: string | null
          backupCodes: string[] | null
          createdAt: string
          email: string
          emailVerified: string | null
          firstName: string | null
          id: string
          isActive: boolean
          langue: string
          lastLoginAt: string | null
          lastName: string | null
          locale: string
          mustChangePassword: boolean
          name: string
          notifications: Json | null
          password: string | null
          phone: string | null
          role: Database["public"]["Enums"]["Role"]
          sessionVersion: number
          siteId: string | null
          tenantId: string | null
          totpSecret: string | null
          totpSecretIv: string | null
          twoFactorEnabled: boolean
          twoFactorVerifiedAt: string | null
          updatedAt: string
        }
        Insert: {
          avatarUrl?: string | null
          backupCodes?: string[] | null
          createdAt?: string
          email: string
          emailVerified?: string | null
          firstName?: string | null
          id: string
          isActive?: boolean
          langue?: string
          lastLoginAt?: string | null
          lastName?: string | null
          locale?: string
          mustChangePassword?: boolean
          name: string
          notifications?: Json | null
          password?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["Role"]
          sessionVersion?: number
          siteId?: string | null
          tenantId?: string | null
          totpSecret?: string | null
          totpSecretIv?: string | null
          twoFactorEnabled?: boolean
          twoFactorVerifiedAt?: string | null
          updatedAt: string
        }
        Update: {
          avatarUrl?: string | null
          backupCodes?: string[] | null
          createdAt?: string
          email?: string
          emailVerified?: string | null
          firstName?: string | null
          id?: string
          isActive?: boolean
          langue?: string
          lastLoginAt?: string | null
          lastName?: string | null
          locale?: string
          mustChangePassword?: boolean
          name?: string
          notifications?: Json | null
          password?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["Role"]
          sessionVersion?: number
          siteId?: string | null
          tenantId?: string | null
          totpSecret?: string | null
          totpSecretIv?: string | null
          twoFactorEnabled?: boolean
          twoFactorVerifiedAt?: string | null
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_siteId_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_tokens: {
        Row: {
          expires: string
          identifier: string
          token: string
        }
        Insert: {
          expires: string
          identifier: string
          token: string
        }
        Update: {
          expires?: string
          identifier?: string
          token?: string
        }
        Relationships: []
      }
    }
    Views: {
      hypopg_hidden_indexes: {
        Row: {
          am_name: unknown
          index_name: unknown
          indexrelid: unknown
          is_hypo: boolean | null
          schema_name: unknown
          table_name: unknown
        }
        Relationships: []
      }
      hypopg_list_indexes: {
        Row: {
          am_name: unknown
          index_name: string | null
          indexrelid: unknown
          schema_name: unknown
          table_name: unknown
        }
        Relationships: []
      }
      pg_all_foreign_keys: {
        Row: {
          fk_columns: unknown[] | null
          fk_constraint_name: unknown
          fk_schema_name: unknown
          fk_table_name: unknown
          fk_table_oid: unknown
          is_deferrable: boolean | null
          is_deferred: boolean | null
          match_type: string | null
          on_delete: string | null
          on_update: string | null
          pk_columns: unknown[] | null
          pk_constraint_name: unknown
          pk_index_name: unknown
          pk_schema_name: unknown
          pk_table_name: unknown
          pk_table_oid: unknown
        }
        Relationships: []
      }
      tap_funky: {
        Row: {
          args: string | null
          is_definer: boolean | null
          is_strict: boolean | null
          is_visible: boolean | null
          kind: unknown
          langoid: unknown
          name: unknown
          oid: unknown
          owner: unknown
          returns: string | null
          returns_set: boolean | null
          schema: unknown
          volatility: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      __plpgsql_show_dependency_tb:
        | {
            Args: {
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              funcoid: unknown
              relid?: unknown
            }
            Returns: {
              name: string
              oid: unknown
              params: string
              schema: string
              type: string
            }[]
          }
        | {
            Args: {
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              name: string
              relid?: unknown
            }
            Returns: {
              name: string
              oid: unknown
              params: string
              schema: string
              type: string
            }[]
          }
      _cleanup: { Args: never; Returns: boolean }
      _contract_on: { Args: { "": string }; Returns: unknown }
      _currtest: { Args: never; Returns: number }
      _db_privs: { Args: never; Returns: unknown[] }
      _extensions: { Args: never; Returns: unknown[] }
      _get: { Args: { "": string }; Returns: number }
      _get_latest: { Args: { "": string }; Returns: number[] }
      _get_note: { Args: { "": string }; Returns: string }
      _is_verbose: { Args: never; Returns: boolean }
      _prokind: { Args: { p_oid: unknown }; Returns: unknown }
      _query: { Args: { "": string }; Returns: string }
      _refine_vol: { Args: { "": string }; Returns: string }
      _retval: { Args: { "": string }; Returns: string }
      _table_privs: { Args: never; Returns: unknown[] }
      _temptypes: { Args: { "": string }; Returns: string }
      _todo: { Args: never; Returns: string }
      col_is_null:
        | {
            Args: {
              column_name: unknown
              description?: string
              schema_name: unknown
              table_name: unknown
            }
            Returns: string
          }
        | {
            Args: {
              column_name: unknown
              description?: string
              table_name: unknown
            }
            Returns: string
          }
      col_not_null:
        | {
            Args: {
              column_name: unknown
              description?: string
              schema_name: unknown
              table_name: unknown
            }
            Returns: string
          }
        | {
            Args: {
              column_name: unknown
              description?: string
              table_name: unknown
            }
            Returns: string
          }
      current_site_id: { Args: never; Returns: string }
      current_site_ids: { Args: never; Returns: string[] }
      current_tenant_id: { Args: never; Returns: string }
      diag:
        | {
            Args: { msg: unknown }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { msg: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      diag_test_name: { Args: { "": string }; Returns: string }
      do_tap:
        | { Args: never; Returns: string[] }
        | { Args: { "": string }; Returns: string[] }
      fail:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      findfuncs: { Args: { "": string }; Returns: string[] }
      finish: { Args: { exception_on_failure?: boolean }; Returns: string[] }
      format_type_string: { Args: { "": string }; Returns: string }
      has_unique: { Args: { "": string }; Returns: string }
      hypopg: { Args: never; Returns: Record<string, unknown>[] }
      hypopg_create_index: {
        Args: { sql_order: string }
        Returns: Record<string, unknown>[]
      }
      hypopg_drop_index: { Args: { indexid: unknown }; Returns: boolean }
      hypopg_get_indexdef: { Args: { indexid: unknown }; Returns: string }
      hypopg_hidden_indexes: {
        Args: never
        Returns: {
          indexid: unknown
        }[]
      }
      hypopg_hide_index: { Args: { indexid: unknown }; Returns: boolean }
      hypopg_relation_size: { Args: { indexid: unknown }; Returns: number }
      hypopg_reset: { Args: never; Returns: undefined }
      hypopg_reset_index: { Args: never; Returns: undefined }
      hypopg_unhide_all_indexes: { Args: never; Returns: undefined }
      hypopg_unhide_index: { Args: { indexid: unknown }; Returns: boolean }
      in_todo: { Args: never; Returns: boolean }
      is_empty: { Args: { "": string }; Returns: string }
      is_site_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      isnt_empty: { Args: { "": string }; Returns: string }
      lives_ok: { Args: { "": string }; Returns: string }
      no_plan: { Args: never; Returns: boolean[] }
      num_failed: { Args: never; Returns: number }
      os_name: { Args: never; Returns: string }
      pass:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      pg_version: { Args: never; Returns: string }
      pg_version_num: { Args: never; Returns: number }
      pgtap_version: { Args: never; Returns: number }
      plpgsql_check_function:
        | {
            Args: {
              all_warnings?: boolean
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              compatibility_warnings?: boolean
              constant_tracing?: boolean
              extra_warnings?: boolean
              fatal_errors?: boolean
              format?: string
              funcoid: unknown
              incomment_options_usage_warning?: boolean
              newtable?: unknown
              oldtable?: unknown
              other_warnings?: boolean
              performance_warnings?: boolean
              relid?: unknown
              security_warnings?: boolean
              use_incomment_options?: boolean
              without_warnings?: boolean
            }
            Returns: string[]
          }
        | {
            Args: {
              all_warnings?: boolean
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              compatibility_warnings?: boolean
              constant_tracing?: boolean
              extra_warnings?: boolean
              fatal_errors?: boolean
              format?: string
              incomment_options_usage_warning?: boolean
              name: string
              newtable?: unknown
              oldtable?: unknown
              other_warnings?: boolean
              performance_warnings?: boolean
              relid?: unknown
              security_warnings?: boolean
              use_incomment_options?: boolean
              without_warnings?: boolean
            }
            Returns: string[]
          }
      plpgsql_check_function_tb:
        | {
            Args: {
              all_warnings?: boolean
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              compatibility_warnings?: boolean
              constant_tracing?: boolean
              extra_warnings?: boolean
              fatal_errors?: boolean
              funcoid: unknown
              incomment_options_usage_warning?: boolean
              newtable?: unknown
              oldtable?: unknown
              other_warnings?: boolean
              performance_warnings?: boolean
              relid?: unknown
              security_warnings?: boolean
              use_incomment_options?: boolean
              without_warnings?: boolean
            }
            Returns: {
              context: string
              detail: string
              functionid: unknown
              hint: string
              level: string
              lineno: number
              message: string
              position: number
              query: string
              sqlstate: string
              statement: string
            }[]
          }
        | {
            Args: {
              all_warnings?: boolean
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              compatibility_warnings?: boolean
              constant_tracing?: boolean
              extra_warnings?: boolean
              fatal_errors?: boolean
              incomment_options_usage_warning?: boolean
              name: string
              newtable?: unknown
              oldtable?: unknown
              other_warnings?: boolean
              performance_warnings?: boolean
              relid?: unknown
              security_warnings?: boolean
              use_incomment_options?: boolean
              without_warnings?: boolean
            }
            Returns: {
              context: string
              detail: string
              functionid: unknown
              hint: string
              level: string
              lineno: number
              message: string
              position: number
              query: string
              sqlstate: string
              statement: string
            }[]
          }
      plpgsql_check_pragma: { Args: { name: string[] }; Returns: number }
      plpgsql_check_profiler: { Args: { enable?: boolean }; Returns: boolean }
      plpgsql_check_tracer: {
        Args: { enable?: boolean; verbosity?: string }
        Returns: boolean
      }
      plpgsql_coverage_branches:
        | { Args: { funcoid: unknown }; Returns: number }
        | { Args: { name: string }; Returns: number }
      plpgsql_coverage_statements:
        | { Args: { funcoid: unknown }; Returns: number }
        | { Args: { name: string }; Returns: number }
      plpgsql_profiler_function_statements_tb:
        | {
            Args: { funcoid: unknown }
            Returns: {
              avg_time: number
              block_num: number
              exec_stmts: number
              exec_stmts_err: number
              lineno: number
              max_time: number
              parent_note: string
              parent_stmtid: number
              processed_rows: number
              queryid: number
              stmtid: number
              stmtname: string
              total_time: number
            }[]
          }
        | {
            Args: { name: string }
            Returns: {
              avg_time: number
              block_num: number
              exec_stmts: number
              exec_stmts_err: number
              lineno: number
              max_time: number
              parent_note: string
              parent_stmtid: number
              processed_rows: number
              queryid: number
              stmtid: number
              stmtname: string
              total_time: number
            }[]
          }
      plpgsql_profiler_function_tb:
        | {
            Args: { funcoid: unknown }
            Returns: {
              avg_time: number
              cmds_on_row: number
              exec_stmts: number
              exec_stmts_err: number
              lineno: number
              max_time: number[]
              processed_rows: number[]
              queryids: number[]
              source: string
              stmt_lineno: number
              total_time: number
            }[]
          }
        | {
            Args: { name: string }
            Returns: {
              avg_time: number
              cmds_on_row: number
              exec_stmts: number
              exec_stmts_err: number
              lineno: number
              max_time: number[]
              processed_rows: number[]
              queryids: number[]
              source: string
              stmt_lineno: number
              total_time: number
            }[]
          }
      plpgsql_profiler_functions_all: {
        Args: never
        Returns: {
          avg_time: number
          exec_count: number
          exec_stmts_err: number
          funcoid: unknown
          max_time: number
          min_time: number
          stddev_time: number
          total_time: number
        }[]
      }
      plpgsql_profiler_install_fake_queryid_hook: {
        Args: never
        Returns: undefined
      }
      plpgsql_profiler_remove_fake_queryid_hook: {
        Args: never
        Returns: undefined
      }
      plpgsql_profiler_reset: { Args: { funcoid: unknown }; Returns: undefined }
      plpgsql_profiler_reset_all: { Args: never; Returns: undefined }
      plpgsql_show_dependency_tb:
        | {
            Args: {
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              fnname: string
              relid?: unknown
            }
            Returns: {
              name: string
              oid: unknown
              params: string
              schema: string
              type: string
            }[]
          }
        | {
            Args: {
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              funcoid: unknown
              relid?: unknown
            }
            Returns: {
              name: string
              oid: unknown
              params: string
              schema: string
              type: string
            }[]
          }
      rls_context_is_set: { Args: never; Returns: boolean }
      runtests:
        | { Args: never; Returns: string[] }
        | { Args: { "": string }; Returns: string[] }
      set_app_context: {
        Args: {
          p_site_id: string
          p_site_ids: string
          p_super_admin: boolean
          p_tenant_id: string
        }
        Returns: undefined
      }
      set_site_context: { Args: { p_site_id: string }; Returns: undefined }
      set_tenant_context: { Args: { p_tenant_id: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      site_matches: { Args: { p_site_id: string }; Returns: boolean }
      skip:
        | { Args: { "": string }; Returns: string }
        | { Args: { how_many: number; why: string }; Returns: string }
      tenant_matches: { Args: { p_tenant_id: string }; Returns: boolean }
      throws_ok: { Args: { "": string }; Returns: string }
      todo:
        | { Args: { how_many: number }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] }
        | { Args: { why: string }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] }
      todo_end: { Args: never; Returns: boolean[] }
      todo_start:
        | { Args: never; Returns: boolean[] }
        | { Args: { "": string }; Returns: boolean[] }
    }
    Enums: {
      AuditVerdict: "ALLOWED" | "DENIED"
      CanalNotification: "EMAIL" | "SMS" | "PUSH" | "IN_APP"
      CategorieBudget:
        | "FONCTIONNEMENT"
        | "PEDAGOGIE"
        | "MAINTENANCE"
        | "SALAIRES"
        | "TRANSPORT"
        | "CANTINE"
        | "EVENEMENTIEL"
        | "INVESTISSEMENT"
        | "AUTRE"
      CategorieItem:
        | "INFORMATIQUE"
        | "MOBILIER"
        | "SPORTIF"
        | "PEDAGOGIQUE"
        | "AUDIOVISUEL"
        | "ENTRETIEN"
        | "SECURITE"
        | "AUTRE"
      CibleNotification:
        | "TOUS"
        | "PARENTS"
        | "ENSEIGNANTS"
        | "ELEVES"
        | "CLASSE"
        | "NIVEAU"
        | "DIRECTION"
      ContexteAppreciation:
        | "NOTE_MATIERE"
        | "BULLETIN_PERIODE"
        | "BULLETIN_ANNUEL"
        | "ABSENCE"
      ConversationType:
        | "DIRECT"
        | "CLASS_ANNOUNCEMENT"
        | "CLASS_DISCUSSION"
        | "ADMIN_BROADCAST"
        | "PARENT_TEACHER"
        | "PARENT_ADMIN"
        | "STAFF_GROUP"
        | "FREE"
      DevoirType: "EXERCICE" | "LECTURE" | "REVISION" | "PROJET" | "AUTRE"
      ErrorType:
        | "CONCEPTUAL_ERROR"
        | "PROCEDURAL_ERROR"
        | "CALCULATION_ERROR"
        | "READING_ERROR"
        | "MISINTERPRETATION"
        | "MISSING_PREREQUISITE"
        | "INCOMPLETE_REASONING"
        | "CARELESS_ERROR"
        | "GUESS"
        | "UNKNOWN"
      EtatItem: "NEUF" | "BON" | "USE" | "ENDOMMAGE" | "HORS_SERVICE"
      EvidenceType:
        | "DEVOIR"
        | "EXAMEN"
        | "QUIZ"
        | "EXERCICE"
        | "PROJET"
        | "ORAL"
        | "OBSERVATION"
        | "RETEST"
        | "AUTO_ENTRAINEMENT"
      FormatQuestion:
        | "SAISIE_LIBRE"
        | "SAISIE_COURTE"
        | "CHOIX_UNIQUE"
        | "ETAPES_GUIDEES"
        | "REMISE_EN_ORDRE"
        | "APPARIEMENT"
      InterventionStatus:
        | "PROPOSED"
        | "APPROVED"
        | "ACTIVE"
        | "UNDER_REVIEW"
        | "COMPLETED"
        | "REJECTED"
      Jour:
        | "DIMANCHE"
        | "LUNDI"
        | "MARDI"
        | "MERCREDI"
        | "JEUDI"
        | "VENDREDI"
        | "SAMEDI"
      LienParente: "PERE" | "MERE" | "TUTEUR" | "AUTRE"
      MasteryStatus:
        | "UNKNOWN"
        | "EMERGING"
        | "DEVELOPING"
        | "PROFICIENT"
        | "MASTERED"
        | "NEEDS_REVIEW"
      ModeleNiveaux: "ANNEES" | "FRANCAIS"
      MotifAbsence:
        | "INJUSTIFIE"
        | "MALADIE"
        | "FAMILIALE"
        | "TRANSPORT"
        | "AUTRE"
      NiveauAlerteParent: "INFO" | "ATTENTION" | "URGENT"
      NiveauCours: "DEBUTANT" | "INTERMEDIAIRE" | "AVANCE"
      NiveauRecommandation:
        | "CRITIQUE"
        | "FRAGILE"
        | "CONSOLIDE"
        | "AVANCE"
        | "EXCELLENCE"
      PalierExercice:
        | "RESTITUTION"
        | "APPLICATION"
        | "CONSOLIDATION"
        | "TRANSFERT"
        | "OUVERTURE"
      ParticipantRole: "ADMIN" | "MEMBER" | "READONLY"
      PlanType: "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE"
      PlatformMobile: "IOS" | "ANDROID" | "WEB"
      PrioriteTache: "BASSE" | "NORMALE" | "HAUTE" | "URGENTE"
      Role:
        | "SUPER_ADMIN"
        | "TENANT_ADMIN"
        | "PRINCIPAL"
        | "SECRETARY"
        | "TEACHER"
        | "CLASS_TEACHER"
        | "COUNSELOR"
        | "NURSE"
        | "ACCOUNTANT"
        | "PARENT"
        | "STUDENT"
        | "SUPERVISOR"
        | "SUBJECT_LEAD"
        | "SITE_MANAGER"
        | "INSPECTOR"
        | "CAISSIER"
      Sexe: "M" | "F"
      StatutAbsence: "EN_ATTENTE" | "JUSTIFIEE" | "INJUSTIFIEE"
      StatutAbsencePersonnel: "EN_ATTENTE" | "JUSTIFIEE" | "INJUSTIFIEE"
      StatutAlumni:
        | "ETUDES_SUPERIEURES"
        | "EN_EMPLOI"
        | "RECHERCHE_EMPLOI"
        | "ENTREPRENEUR"
        | "INCONNU"
      StatutCandidature:
        | "SOUMISE"
        | "EN_EXAMEN"
        | "ADMIS"
        | "REFUSE"
        | "INSCRIT"
        | "ANNULE"
        | "DOSSIER_COMPLET"
      StatutConge:
        | "DEMANDE"
        | "APPROUVE"
        | "REFUSE"
        | "EN_COURS"
        | "TERMINE"
        | "ANNULE"
      StatutCours: "BROUILLON" | "PUBLIE" | "ARCHIVE"
      StatutDemandeFourniture: "PROPOSEE" | "VALIDEE" | "REJETEE"
      StatutDemandeLien: "EN_ATTENTE" | "VALIDE" | "REFUSE"
      StatutDevoir: "A_FAIRE" | "EN_COURS" | "RENDU" | "CORRIGE"
      StatutDossier: "INCOMPLET" | "EN_COURS" | "COMPLETE" | "VALIDE" | "CLOS"
      StatutEleve:
        | "ACTIF"
        | "TRANSFERE"
        | "DIPLOME"
        | "EXCLU"
        | "ABANDONNE"
        | "REINSCRIT"
        | "NON_REINSCRIT"
      StatutEntretien: "PLANIFIE" | "REALISE" | "ANNULE" | "REPORTÉ"
      StatutEtape: "A_FAIRE" | "EN_COURS" | "FAIT" | "VALIDE" | "ECHOUE"
      StatutExamen: "PROGRAMME" | "EN_COURS" | "TERMINE" | "ANNULE"
      StatutFacture: "EN_ATTENTE" | "PAYEE" | "EN_RETARD" | "ANNULEE"
      StatutFeuille:
        | "PROPOSEE"
        | "ASSIGNEE"
        | "EN_COURS"
        | "TERMINEE"
        | "REFUSEE"
      StatutIncident: "OUVERT" | "EN_TRAITEMENT" | "RESOLU" | "CLASSE"
      StatutListeFourniture: "BROUILLON" | "PUBLIEE"
      StatutNotification:
        | "BROUILLON"
        | "PLANIFIEE"
        | "EN_ENVOI"
        | "ENVOYEE"
        | "ECHEC"
      StatutPlan:
        | "BROUILLON"
        | "PROPOSE"
        | "ACTIF"
        | "EN_REVUE"
        | "TERMINE"
        | "ABANDONNE"
      StatutPropositionIa: "PROPOSE" | "AJUSTE" | "VALIDE" | "REJETE"
      StatutRecommandation:
        | "OBLIGATOIRE"
        | "RECOMMANDEE"
        | "PROPOSEE"
        | "ACCEPTEE"
        | "ECARTEE"
      StatutRemiseCaisse: "EN_ATTENTE" | "CONFIRME" | "REJETE"
      StatutRemplacement:
        | "PROPOSE"
        | "VALIDE"
        | "REFUSE"
        | "EFFECTUE"
        | "ANNULE"
      StatutSeance: "PLANIFIEE" | "EFFECTUEE" | "ANNULEE" | "REPORTEE"
      StatutTache: "A_FAIRE" | "EN_COURS" | "FAIT" | "ANNULE"
      StructureType: "MATERNELLE" | "PRIMAIRE" | "COLLEGE" | "LYCEE"
      TenantStatus: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED"
      TypeAbsencePersonnel:
        | "ABSENCE"
        | "RETARD"
        | "MISSION"
        | "FORMATION"
        | "MALADIE"
        | "AUTRE"
      TypeConge:
        | "ANNUEL"
        | "MALADIE"
        | "SPECIAL"
        | "MATERNITE"
        | "PATERNITE"
        | "SANS_SOLDE"
        | "AUTRE"
      TypeContenu: "VIDEO" | "DOCUMENT" | "LIEN" | "TEXTE" | "QUIZ"
      TypeContrat: "CDI" | "CDD" | "VACATAIRE" | "FONCTIONNAIRE" | "STAGIAIRE"
      TypeDocumentInscription:
        | "PHOTO"
        | "ACTE_NAISSANCE"
        | "PIECE_PARENT"
        | "BULLETIN_SCOLAIRE"
      TypeEvenementInscription:
        | "CREATION_DOSSIER"
        | "AJOUT_DOCUMENT"
        | "SUPPRESSION_DOCUMENT"
        | "CHANGEMENT_STATUT"
        | "COMPLETION_DOSSIER"
        | "VALIDATION_DOSSIER"
        | "CLOTURE_DOSSIER"
        | "MODIFICATION_INFOS"
        | "NOTE_AJOUTEE"
      TypeFacture:
        | "MENSUALITE"
        | "INSCRIPTION"
        | "RENOUVELLEMENT"
        | "CANTINE"
        | "TRANSPORT"
        | "LIBRE"
      TypeFourniture: "LIVRE" | "CAHIER" | "INSTRUMENT" | "AUTRE"
      TypeIncident:
        | "RETARD"
        | "BAVARDAGE"
        | "INSOLENCE"
        | "BAGARRE"
        | "TRICHE"
        | "VANDALISM"
        | "ABSENTEISME"
        | "AUTRE"
      TypeNote:
        | "CONTROLE"
        | "DEVOIR"
        | "EXAMEN"
        | "INTERROGATION"
        | "PROJET"
        | "ORAL"
        | "TP"
      TypeRecommandation:
        | "FILIERE_SCIENTIFIQUE"
        | "FILIERE_LITTERAIRE"
        | "FILIERE_TECHNIQUE"
        | "FILIERE_PROFESSIONNELLE"
        | "REDOUBLEMENT"
        | "SOUTIEN_RENFORCE"
        | "EXCELLENTE_VOIE"
      TypeSanction:
        | "AVERTISSEMENT"
        | "BLAME"
        | "EXCLUSION_COURS"
        | "EXCLUSION_TEMP"
        | "CONVOCATION_PARENTS"
        | "TRAVAUX_INTERET_GENERAL"
        | "AUTRE"
    }
    CompositeTypes: {
      _time_trial_type: {
        a_time: number | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      AuditVerdict: ["ALLOWED", "DENIED"],
      CanalNotification: ["EMAIL", "SMS", "PUSH", "IN_APP"],
      CategorieBudget: [
        "FONCTIONNEMENT",
        "PEDAGOGIE",
        "MAINTENANCE",
        "SALAIRES",
        "TRANSPORT",
        "CANTINE",
        "EVENEMENTIEL",
        "INVESTISSEMENT",
        "AUTRE",
      ],
      CategorieItem: [
        "INFORMATIQUE",
        "MOBILIER",
        "SPORTIF",
        "PEDAGOGIQUE",
        "AUDIOVISUEL",
        "ENTRETIEN",
        "SECURITE",
        "AUTRE",
      ],
      CibleNotification: [
        "TOUS",
        "PARENTS",
        "ENSEIGNANTS",
        "ELEVES",
        "CLASSE",
        "NIVEAU",
        "DIRECTION",
      ],
      ContexteAppreciation: [
        "NOTE_MATIERE",
        "BULLETIN_PERIODE",
        "BULLETIN_ANNUEL",
        "ABSENCE",
      ],
      ConversationType: [
        "DIRECT",
        "CLASS_ANNOUNCEMENT",
        "CLASS_DISCUSSION",
        "ADMIN_BROADCAST",
        "PARENT_TEACHER",
        "PARENT_ADMIN",
        "STAFF_GROUP",
        "FREE",
      ],
      DevoirType: ["EXERCICE", "LECTURE", "REVISION", "PROJET", "AUTRE"],
      ErrorType: [
        "CONCEPTUAL_ERROR",
        "PROCEDURAL_ERROR",
        "CALCULATION_ERROR",
        "READING_ERROR",
        "MISINTERPRETATION",
        "MISSING_PREREQUISITE",
        "INCOMPLETE_REASONING",
        "CARELESS_ERROR",
        "GUESS",
        "UNKNOWN",
      ],
      EtatItem: ["NEUF", "BON", "USE", "ENDOMMAGE", "HORS_SERVICE"],
      EvidenceType: [
        "DEVOIR",
        "EXAMEN",
        "QUIZ",
        "EXERCICE",
        "PROJET",
        "ORAL",
        "OBSERVATION",
        "RETEST",
        "AUTO_ENTRAINEMENT",
      ],
      FormatQuestion: [
        "SAISIE_LIBRE",
        "SAISIE_COURTE",
        "CHOIX_UNIQUE",
        "ETAPES_GUIDEES",
        "REMISE_EN_ORDRE",
        "APPARIEMENT",
      ],
      InterventionStatus: [
        "PROPOSED",
        "APPROVED",
        "ACTIVE",
        "UNDER_REVIEW",
        "COMPLETED",
        "REJECTED",
      ],
      Jour: [
        "DIMANCHE",
        "LUNDI",
        "MARDI",
        "MERCREDI",
        "JEUDI",
        "VENDREDI",
        "SAMEDI",
      ],
      LienParente: ["PERE", "MERE", "TUTEUR", "AUTRE"],
      MasteryStatus: [
        "UNKNOWN",
        "EMERGING",
        "DEVELOPING",
        "PROFICIENT",
        "MASTERED",
        "NEEDS_REVIEW",
      ],
      ModeleNiveaux: ["ANNEES", "FRANCAIS"],
      MotifAbsence: [
        "INJUSTIFIE",
        "MALADIE",
        "FAMILIALE",
        "TRANSPORT",
        "AUTRE",
      ],
      NiveauAlerteParent: ["INFO", "ATTENTION", "URGENT"],
      NiveauCours: ["DEBUTANT", "INTERMEDIAIRE", "AVANCE"],
      NiveauRecommandation: [
        "CRITIQUE",
        "FRAGILE",
        "CONSOLIDE",
        "AVANCE",
        "EXCELLENCE",
      ],
      PalierExercice: [
        "RESTITUTION",
        "APPLICATION",
        "CONSOLIDATION",
        "TRANSFERT",
        "OUVERTURE",
      ],
      ParticipantRole: ["ADMIN", "MEMBER", "READONLY"],
      PlanType: ["STARTER", "PRO", "BUSINESS", "ENTERPRISE"],
      PlatformMobile: ["IOS", "ANDROID", "WEB"],
      PrioriteTache: ["BASSE", "NORMALE", "HAUTE", "URGENTE"],
      Role: [
        "SUPER_ADMIN",
        "TENANT_ADMIN",
        "PRINCIPAL",
        "SECRETARY",
        "TEACHER",
        "CLASS_TEACHER",
        "COUNSELOR",
        "NURSE",
        "ACCOUNTANT",
        "PARENT",
        "STUDENT",
        "SUPERVISOR",
        "SUBJECT_LEAD",
        "SITE_MANAGER",
        "INSPECTOR",
        "CAISSIER",
      ],
      Sexe: ["M", "F"],
      StatutAbsence: ["EN_ATTENTE", "JUSTIFIEE", "INJUSTIFIEE"],
      StatutAbsencePersonnel: ["EN_ATTENTE", "JUSTIFIEE", "INJUSTIFIEE"],
      StatutAlumni: [
        "ETUDES_SUPERIEURES",
        "EN_EMPLOI",
        "RECHERCHE_EMPLOI",
        "ENTREPRENEUR",
        "INCONNU",
      ],
      StatutCandidature: [
        "SOUMISE",
        "EN_EXAMEN",
        "ADMIS",
        "REFUSE",
        "INSCRIT",
        "ANNULE",
        "DOSSIER_COMPLET",
      ],
      StatutConge: [
        "DEMANDE",
        "APPROUVE",
        "REFUSE",
        "EN_COURS",
        "TERMINE",
        "ANNULE",
      ],
      StatutCours: ["BROUILLON", "PUBLIE", "ARCHIVE"],
      StatutDemandeFourniture: ["PROPOSEE", "VALIDEE", "REJETEE"],
      StatutDemandeLien: ["EN_ATTENTE", "VALIDE", "REFUSE"],
      StatutDevoir: ["A_FAIRE", "EN_COURS", "RENDU", "CORRIGE"],
      StatutDossier: ["INCOMPLET", "EN_COURS", "COMPLETE", "VALIDE", "CLOS"],
      StatutEleve: [
        "ACTIF",
        "TRANSFERE",
        "DIPLOME",
        "EXCLU",
        "ABANDONNE",
        "REINSCRIT",
        "NON_REINSCRIT",
      ],
      StatutEntretien: ["PLANIFIE", "REALISE", "ANNULE", "REPORTÉ"],
      StatutEtape: ["A_FAIRE", "EN_COURS", "FAIT", "VALIDE", "ECHOUE"],
      StatutExamen: ["PROGRAMME", "EN_COURS", "TERMINE", "ANNULE"],
      StatutFacture: ["EN_ATTENTE", "PAYEE", "EN_RETARD", "ANNULEE"],
      StatutFeuille: [
        "PROPOSEE",
        "ASSIGNEE",
        "EN_COURS",
        "TERMINEE",
        "REFUSEE",
      ],
      StatutIncident: ["OUVERT", "EN_TRAITEMENT", "RESOLU", "CLASSE"],
      StatutListeFourniture: ["BROUILLON", "PUBLIEE"],
      StatutNotification: [
        "BROUILLON",
        "PLANIFIEE",
        "EN_ENVOI",
        "ENVOYEE",
        "ECHEC",
      ],
      StatutPlan: [
        "BROUILLON",
        "PROPOSE",
        "ACTIF",
        "EN_REVUE",
        "TERMINE",
        "ABANDONNE",
      ],
      StatutPropositionIa: ["PROPOSE", "AJUSTE", "VALIDE", "REJETE"],
      StatutRecommandation: [
        "OBLIGATOIRE",
        "RECOMMANDEE",
        "PROPOSEE",
        "ACCEPTEE",
        "ECARTEE",
      ],
      StatutRemiseCaisse: ["EN_ATTENTE", "CONFIRME", "REJETE"],
      StatutRemplacement: ["PROPOSE", "VALIDE", "REFUSE", "EFFECTUE", "ANNULE"],
      StatutSeance: ["PLANIFIEE", "EFFECTUEE", "ANNULEE", "REPORTEE"],
      StatutTache: ["A_FAIRE", "EN_COURS", "FAIT", "ANNULE"],
      StructureType: ["MATERNELLE", "PRIMAIRE", "COLLEGE", "LYCEE"],
      TenantStatus: ["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"],
      TypeAbsencePersonnel: [
        "ABSENCE",
        "RETARD",
        "MISSION",
        "FORMATION",
        "MALADIE",
        "AUTRE",
      ],
      TypeConge: [
        "ANNUEL",
        "MALADIE",
        "SPECIAL",
        "MATERNITE",
        "PATERNITE",
        "SANS_SOLDE",
        "AUTRE",
      ],
      TypeContenu: ["VIDEO", "DOCUMENT", "LIEN", "TEXTE", "QUIZ"],
      TypeContrat: ["CDI", "CDD", "VACATAIRE", "FONCTIONNAIRE", "STAGIAIRE"],
      TypeDocumentInscription: [
        "PHOTO",
        "ACTE_NAISSANCE",
        "PIECE_PARENT",
        "BULLETIN_SCOLAIRE",
      ],
      TypeEvenementInscription: [
        "CREATION_DOSSIER",
        "AJOUT_DOCUMENT",
        "SUPPRESSION_DOCUMENT",
        "CHANGEMENT_STATUT",
        "COMPLETION_DOSSIER",
        "VALIDATION_DOSSIER",
        "CLOTURE_DOSSIER",
        "MODIFICATION_INFOS",
        "NOTE_AJOUTEE",
      ],
      TypeFacture: [
        "MENSUALITE",
        "INSCRIPTION",
        "RENOUVELLEMENT",
        "CANTINE",
        "TRANSPORT",
        "LIBRE",
      ],
      TypeFourniture: ["LIVRE", "CAHIER", "INSTRUMENT", "AUTRE"],
      TypeIncident: [
        "RETARD",
        "BAVARDAGE",
        "INSOLENCE",
        "BAGARRE",
        "TRICHE",
        "VANDALISM",
        "ABSENTEISME",
        "AUTRE",
      ],
      TypeNote: [
        "CONTROLE",
        "DEVOIR",
        "EXAMEN",
        "INTERROGATION",
        "PROJET",
        "ORAL",
        "TP",
      ],
      TypeRecommandation: [
        "FILIERE_SCIENTIFIQUE",
        "FILIERE_LITTERAIRE",
        "FILIERE_TECHNIQUE",
        "FILIERE_PROFESSIONNELLE",
        "REDOUBLEMENT",
        "SOUTIEN_RENFORCE",
        "EXCELLENTE_VOIE",
      ],
      TypeSanction: [
        "AVERTISSEMENT",
        "BLAME",
        "EXCLUSION_COURS",
        "EXCLUSION_TEMP",
        "CONVOCATION_PARENTS",
        "TRAVAUX_INTERET_GENERAL",
        "AUTRE",
      ],
    },
  },
} as const

