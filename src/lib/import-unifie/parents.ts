import prisma from "@/lib/prisma";
import { infererColonnes, valeurChamp } from "@/lib/column-inference";
import { type PlanImport, type LigneImport } from "./types";

// ============================================================
// IMPORT PARENTS
// ============================================================

export interface DonneesParent {
  [key: string]: unknown;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  eleveNom?: string;
  elevePrenom?: string;
  relation?: string;
}

export async function analyserParents(
  rows: Record<string, string>[],
  tenantId: string,
  headers?: string[]
): Promise<PlanImport<DonneesParent>> {
  const mapping = headers
    ? infererColonnes(headers, rows, "parents")
    : infererColonnes(Object.keys(rows[0] ?? {}), rows, "parents");
  const hs = headers ?? Object.keys(rows[0] ?? {});

  const lignes: LigneImport<DonneesParent>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nom = valeurChamp(row, hs, mapping, "nom");
    const prenom = valeurChamp(row, hs, mapping, "prenom");
    const email = valeurChamp(row, hs, mapping, "email");
    const telephone = valeurChamp(row, hs, mapping, "telephone");

    if (!nom || !prenom) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { nom, prenom },
        message: "Nom et prénom requis",
      });
      continue;
    }

    let existe = false;
    if (email) {
      // eslint-disable-next-line ecolpro/require-site-filter -- recherche par email pour import, pas de scope site
      const user = await prisma.user.findFirst({
        where: { email, tenantId },
      });
      if (user) {
        // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- vérification par userId
        existe = !!(await prisma.parent.findFirst({
          where: { userId: user.id },
        }));
      }
    }

    lignes.push({
      numero: i + 2,
      action: existe ? "METTRE_A_JOUR" : "CREER",
      donnees: {
        nom,
        prenom,
        email: email || undefined,
        telephone: telephone || undefined,
        eleveNom: (row["eleveNom"] ?? row["Élève Nom"] ?? "").trim() || undefined,
        elevePrenom:
          (row["elevePrenom"] ?? row["Élève Prénom"] ?? "").trim() || undefined,
        relation: valeurChamp(row, hs, mapping, "relation") || undefined,
      },
      existe,
    });
  }

  return {
    type: "parents",
    empreinte: "",
    totalLignes: rows.length,
    lignesValides: lignes.filter((l) => l.action !== "ERREUR").length,
    lignesErreurs: lignes.filter((l) => l.action === "ERREUR").length,
    lignes,
    mappingColonnes: mapping,
    headers: hs,
  };
}
