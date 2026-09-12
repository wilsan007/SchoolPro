import prisma from "@/lib/prisma";
import { infererColonnes, valeurChamp } from "@/lib/column-inference";
import { type PlanImport, type LigneImport } from "./types";

// ============================================================
// IMPORT ENSEIGNANTS
// ============================================================

export interface DonneesEnseignant {
  [key: string]: unknown;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  matieres?: string; // séparées par virgule
  classes?: string; // séparées par virgule
  sites?: string[]; // multi-site
  typeContrat?: string;
  matricule?: string;
}

export async function analyserEnseignants(
  rows: Record<string, string>[],
  tenantId: string,
  headers?: string[]
): Promise<PlanImport<DonneesEnseignant>> {
  // Inférence des colonnes : header + data sampling
  const mapping = headers
    ? infererColonnes(headers, rows, "enseignants")
    : infererColonnes(Object.keys(rows[0] ?? {}), rows, "enseignants");
  const hs = headers ?? Object.keys(rows[0] ?? {});

  // Détecter les colonnes de site (site_1, site_2, site_3, ...)
  const siteColumns = hs.filter((h) => /^site[_\s]?\d+$/i.test(h));

  const lignes: LigneImport<DonneesEnseignant>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nom = valeurChamp(row, hs, mapping, "nom");
    const prenom = valeurChamp(row, hs, mapping, "prenom");
    const email = valeurChamp(row, hs, mapping, "email");

    if (!nom || !prenom) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { nom, prenom, email },
        message: "Nom et prénom requis",
      });
      continue;
    }

    // Récupérer les sites depuis les colonnes site_1, site_2, etc.
    const sites: string[] = [];
    for (const col of siteColumns) {
      const val = row[col]?.trim();
      if (val) sites.push(val);
    }

    // Vérifier si l'enseignant existe déjà
    let existe = false;
    if (email) {
      // eslint-disable-next-line ecolpro/require-site-filter -- recherche par email pour import, pas de scope site
      const user = await prisma.user.findFirst({
        where: { email, tenantId },
      });
      if (user) {
        // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- vérification par userId
        const ens = await prisma.enseignant.findFirst({
          where: { userId: user.id },
        });
        existe = !!ens;
      }
    }

    lignes.push({
      numero: i + 2,
      action: existe ? "METTRE_A_JOUR" : "CREER",
      donnees: {
        nom,
        prenom,
        email: email || undefined,
        telephone: valeurChamp(row, hs, mapping, "telephone") || undefined,
        matieres: valeurChamp(row, hs, mapping, "matieres") || undefined,
        classes: valeurChamp(row, hs, mapping, "classe") || undefined,
        sites: sites.length > 0 ? sites : undefined,
        typeContrat: valeurChamp(row, hs, mapping, "typeContrat") || undefined,
        matricule: valeurChamp(row, hs, mapping, "matricule") || undefined,
      },
      existe,
    });
  }

  return {
    type: "enseignants",
    empreinte: "",
    totalLignes: rows.length,
    lignesValides: lignes.filter((l) => l.action !== "ERREUR").length,
    lignesErreurs: lignes.filter((l) => l.action === "ERREUR").length,
    lignes,
    mappingColonnes: mapping,
    headers: hs,
  };
}
