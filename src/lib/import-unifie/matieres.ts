import prisma from "@/lib/prisma";
import { infererColonnes, valeurChamp } from "@/lib/column-inference";
import { type PlanImport, type LigneImport } from "./types";

// ============================================================
// IMPORT MATIERES
// ============================================================

export interface DonneesMatiere {
  [key: string]: unknown;
  nom: string;
  code: string;
  coefficient?: number;
}

export async function analyserMatieres(
  rows: Record<string, string>[],
  tenantId: string,
  headers?: string[]
): Promise<PlanImport<DonneesMatiere>> {
  const mapping = headers
    ? infererColonnes(headers, rows, "matieres")
    : infererColonnes(Object.keys(rows[0] ?? {}), rows, "matieres");
  const hs = headers ?? Object.keys(rows[0] ?? {});

  const lignes: LigneImport<DonneesMatiere>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nom = valeurChamp(row, hs, mapping, "nom");
    const code = valeurChamp(row, hs, mapping, "code");

    if (!nom) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { nom, code },
        message: "Nom de matière requis",
      });
      continue;
    }

    // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- filtré par tenantId
    const existe = !!(await prisma.matiere.findFirst({
      where: { OR: [{ nom, tenantId }, { code, tenantId }].filter((c) => c.code || c.nom) },
    }));

    lignes.push({
      numero: i + 2,
      action: existe ? "IGNORER" : "CREER",
      donnees: {
        nom,
        code: code || nom.substring(0, 4).toUpperCase(),
        coefficient: parseFloat(valeurChamp(row, hs, mapping, "coefficient") ?? "1") || 1,
      },
      existe,
    });
  }

  return {
    type: "matieres",
    empreinte: "",
    totalLignes: rows.length,
    lignesValides: lignes.filter((l) => l.action !== "ERREUR").length,
    lignesErreurs: lignes.filter((l) => l.action === "ERREUR").length,
    lignes,
    mappingColonnes: mapping,
    headers: hs,
  };
}
