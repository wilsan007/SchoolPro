import prisma from "@/lib/prisma";
import { infererColonnes, valeurChamp } from "@/lib/column-inference";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { type PlanImport, type LigneImport } from "./types";

// ============================================================
// IMPORT CLASSES
// ============================================================

export interface DonneesClasse {
  [key: string]: unknown;
  nom: string;
  niveau: string;
  effectif?: number;
  professeurPrincipal?: string;
}

export async function analyserClasses(
  rows: Record<string, string>[],
  tenantId: string,
  headers?: string[]
): Promise<PlanImport<DonneesClasse>> {
  const mapping = headers
    ? infererColonnes(headers, rows, "classes")
    : infererColonnes(Object.keys(rows[0] ?? {}), rows, "classes");
  const hs = headers ?? Object.keys(rows[0] ?? {});

  const lignes: LigneImport<DonneesClasse>[] = [];
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nom = valeurChamp(row, hs, mapping, "nom");
    const niveau = valeurChamp(row, hs, mapping, "niveau");

    if (!nom) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { nom, niveau },
        message: "Nom de classe requis",
      });
      continue;
    }

    // eslint-disable-next-line ecolpro/require-site-filter -- filtré par tenantId
    const existe = !!(await prisma.classe.findFirst({
      where: { nom, tenantId, ...(anneeCourante ? { annee: anneeCourante } : {}) },
    }));

    lignes.push({
      numero: i + 2,
      action: existe ? "IGNORER" : "CREER",
      donnees: {
        nom,
        niveau: niveau || "Non spécifié",
        effectif: parseInt(valeurChamp(row, hs, mapping, "effectif") ?? "0") || undefined,
        professeurPrincipal:
          valeurChamp(row, hs, mapping, "professeurPrincipal") || undefined,
      },
      existe,
    });
  }

  return {
    type: "classes",
    empreinte: "",
    totalLignes: rows.length,
    lignesValides: lignes.filter((l) => l.action !== "ERREUR").length,
    lignesErreurs: lignes.filter((l) => l.action === "ERREUR").length,
    lignes,
    mappingColonnes: mapping,
    headers: hs,
  };
}
