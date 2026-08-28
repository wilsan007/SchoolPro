"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ModeleNiveaux } from "@prisma/client";
import { libelleNiveau as libelleNiveauPure } from "@/lib/niveau-display";

// ============================================================
// Context React pour le modèle de nommage des niveaux
// ============================================================
//
// Fournit le modèle (ANNEES ou FRANCAIS) à tous les composants
// client via un hook useLibelleNiveau(). Le modèle est injecté
// au niveau du layout du dashboard.

const NiveauContext = createContext<ModeleNiveaux>("ANNEES");

export function NiveauProvider({
  modele,
  children,
}: {
  modele: ModeleNiveaux;
  children: ReactNode;
}) {
  return (
    <NiveauContext.Provider value={modele}>
      {children}
    </NiveauContext.Provider>
  );
}

/**
 * Hook pour récupérer le modèle de niveaux courant.
 */
export function useModeleNiveaux(): ModeleNiveaux {
  return useContext(NiveauContext);
}

/**
 * Hook qui retourne une fonction libelleNiveau() pré-configurée
 * avec le modèle du tenant courant.
 *
 * Usage :
 *   const libelleNiveau = useLibelleNiveau();
 *   <td>{libelleNiveau(classe.niveau)}</td>
 */
export function useLibelleNiveau(): (niveau: string) => string {
  const modele = useContext(NiveauContext);
  return (niveau: string) => libelleNiveauPure(niveau, modele);
}
