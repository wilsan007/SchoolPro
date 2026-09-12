import type { Database } from "@/types/supabase-generated";

/**
 * Augmentation des types Database pour inclure les fonctions RPC
 * SECURITY DEFINER créées par la migration
 * `20260912140000_add_rls_rpc_query_functions`.
 *
 * `supabase gen types typescript` ne détecte pas les fonctions RPC
 * personnalisées — il faut les déclarer manuellement pour que
 * `supabase.rpc("eleves_with_rls", ...)` soit typé correctement.
 *
 * On utilise une intersection de types : le type `DatabaseWithRls`
 * est `Database` avec la section `public.Functions` enrichie.
 */

export interface EleveRlsRow {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  tenantId: string;
  siteId: string | null;
  classeId: string | null;
  statut: string;
  sexe: string;
  dateNaissance: string;
}

export interface LearnosQuestionRlsRow {
  id: string;
  enonce: string;
  palier: string;
  actif: boolean;
  langue: string;
  bareme: number;
  competenceId: string;
  tenantId: string | null;
}

export interface FactureRlsRow {
  id: string;
  tenantId: string;
  siteId: string | null;
  numero: string;
  montant: number;
  statut: string;
  type: string;
  eleveId: string | null;
  anneeId: string | null;
}

export interface CheckRlsVisibilityRow {
  tenant_id: string | null;
  eleve_count: number;
  context_set: boolean;
}

/** Paramètres RLS standards passés à toutes les fonctions RPC. */
export interface RlsParams {
  p_tenant_id: string;
  p_site_id: string;
  p_site_ids: string;
}

export interface ElevesWithRlsArgs extends RlsParams {
  p_limit?: number;
  p_offset?: number;
}

export interface EleveByIdWithRlsArgs extends RlsParams {
  p_eleve_id: string;
}

export interface LearnosQuestionsWithRlsArgs extends RlsParams {
  p_competence_id?: string | null;
  p_langue?: string;
  p_actif?: boolean;
  p_limit?: number;
}

export interface FacturesWithRlsArgs extends RlsParams {
  p_limit?: number;
  p_offset?: number;
}

export interface CheckRlsVisibilityArgs extends RlsParams {
  p_super_admin?: boolean;
}

/**
 * Type Database augmenté avec nos fonctions RPC personnalisées.
 *
 * On reconstruit le type public en fusionnant les Tables/Views/Enums
 * existants avec nos Functions ajoutées.
 */
export type DatabaseWithRls = {
  public: {
    Tables: Database["public"]["Tables"];
    Views: Database["public"]["Views"];
    Enums: Database["public"]["Enums"];
    CompositeTypes: Database["public"]["CompositeTypes"];
    Functions: Database["public"]["Functions"] & {
      eleves_with_rls: {
        Args: ElevesWithRlsArgs;
        Returns: EleveRlsRow[];
      };
      eleve_by_id_with_rls: {
        Args: EleveByIdWithRlsArgs;
        Returns: EleveRlsRow[];
      };
      learnos_questions_with_rls: {
        Args: LearnosQuestionsWithRlsArgs;
        Returns: LearnosQuestionRlsRow[];
      };
      factures_with_rls: {
        Args: FacturesWithRlsArgs;
        Returns: FactureRlsRow[];
      };
      check_rls_visibility: {
        Args: CheckRlsVisibilityArgs;
        Returns: CheckRlsVisibilityRow[];
      };
    };
  };
};
