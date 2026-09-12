import prisma from "@/lib/prisma";
import { infererColonnes, valeurChamp } from "@/lib/column-inference";
import { type PlanImport, type LigneImport } from "./types";

// ============================================================
// IMPORT PERSONNEL ADMINISTRATIF
// ============================================================

export interface DonneesPersonnelAdmin {
  [key: string]: unknown;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  role: string;
  site?: string;
  matricule?: string;
}

const ROLES_ADMIN_VALIDES = new Set([
  "PRINCIPAL",
  "SECRETARY",
  "COUNSELOR",
  "NURSE",
  "ACCOUNTANT",
  "CAISSIER",
  "SUPERVISOR",
  "SITE_MANAGER",
  "INSPECTOR",
  "TENANT_ADMIN",
]);

export async function analyserPersonnelAdmin(
  rows: Record<string, string>[],
  tenantId: string,
  headers?: string[]
): Promise<PlanImport<DonneesPersonnelAdmin>> {
  const mapping = headers
    ? infererColonnes(headers, rows, "personnel-admin")
    : infererColonnes(Object.keys(rows[0] ?? {}), rows, "personnel-admin");
  const hs = headers ?? Object.keys(rows[0] ?? {});

  const lignes: LigneImport<DonneesPersonnelAdmin>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nom = valeurChamp(row, hs, mapping, "nom");
    const prenom = valeurChamp(row, hs, mapping, "prenom");
    const email = valeurChamp(row, hs, mapping, "email");
    const role = (valeurChamp(row, hs, mapping, "role") || "").toUpperCase().trim();

    if (!nom || !prenom) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { nom, prenom, role },
        message: "Nom et prénom requis",
      });
      continue;
    }

    if (!role) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { nom, prenom, role },
        message: "Rôle requis. Rôles valides : " + [...ROLES_ADMIN_VALIDES].join(", "),
      });
      continue;
    }

    if (!ROLES_ADMIN_VALIDES.has(role)) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { nom, prenom, role },
        message: `Rôle invalide: "${role}". Rôles valides : ${[...ROLES_ADMIN_VALIDES].join(", ")}`,
      });
      continue;
    }

    // Vérifier si l'utilisateur existe déjà
    let existe = false;
    if (email) {
      // eslint-disable-next-line ecolpro/require-site-filter -- recherche par email pour import
      const user = await prisma.user.findFirst({
        where: { email, tenantId },
      });
      existe = !!user;
    }

    lignes.push({
      numero: i + 2,
      action: existe ? "METTRE_A_JOUR" : "CREER",
      donnees: {
        nom,
        prenom,
        email: email || undefined,
        telephone: valeurChamp(row, hs, mapping, "telephone") || undefined,
        role,
        site: valeurChamp(row, hs, mapping, "site") || undefined,
        matricule: valeurChamp(row, hs, mapping, "matricule") || undefined,
      },
      existe,
    });
  }

  return {
    type: "personnel-admin",
    empreinte: "",
    totalLignes: rows.length,
    lignesValides: lignes.filter((l) => l.action !== "ERREUR").length,
    lignesErreurs: lignes.filter((l) => l.action === "ERREUR").length,
    lignes,
    mappingColonnes: mapping,
    headers: hs,
  };
}
