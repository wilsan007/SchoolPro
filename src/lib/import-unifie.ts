/**
 * Import unifié — étend l'import au-delà des élèves.
 *
 * Types d'import supportés :
 *   — eleves      (existant, délégué à import-eleves.ts)
 *   — enseignants
 *   — classes
 *   — matieres
 *   — parents
 *
 * Chaque type d'import suit le même pattern :
 *   1. Lecture du fichier (Excel/CSV)
 *   2. Construction d'un plan d'import (preview)
 *   3. Application du plan (écriture)
 *
 * L'import unifié ne remplace pas l'import élèves existant qui a une
 * logique riche de dédoublonnage. Il fournit un cadre commun pour les
 * autres types et un point d'entrée unique.
 */

import ExcelJS from "exceljs";
import { createHash } from "crypto";
import prisma from "@/lib/prisma";

export type TypeImport = "eleves" | "enseignants" | "classes" | "matieres" | "parents";

export interface PlanImport<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  type: TypeImport;
  empreinte: string;
  totalLignes: number;
  lignesValides: number;
  lignesErreurs: number;
  lignes: LigneImport<T>[];
}

export interface LigneImport<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  numero: number;
  action: "CREER" | "METTRE_A_JOUR" | "IGNORER" | "ERREUR";
  donnees: T;
  message?: string;
  existe?: boolean;
}

export interface ResultatImport {
  crees: number;
  misAJour: number;
  ignores: number;
  erreurs: number;
}

// ============================================================
// LECTURE DE FICHIER
// ============================================================

/**
 * Lit un fichier Excel ou CSV et retourne les lignes brutes.
 */
export async function lireFichier(
  buffer: Buffer,
  mimeType: string
): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();

  if (mimeType.includes("csv") || mimeType.includes("text/plain")) {
    // ExcelJS CSV loading via read stream
    const { Readable } = await import("stream");
    const stream = Readable.from([buffer.toString("utf-8")]);
    await wb.csv.read(stream);
  } else {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  }

  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headers: string[] = [];
  const rows: Record<string, string>[] = [];

  // Première ligne = en-têtes
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").trim();
  });

  // Lignes de données
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj: Record<string, string> = {};
    let hasData = false;

    headers.forEach((header, i) => {
      if (!header) return;
      const cell = row.getCell(i + 1);
      const value = String(cell.value ?? "").trim();
      obj[header] = value;
      if (value) hasData = true;
    });

    if (hasData) rows.push(obj);
  }

  return rows;
}

/** Calcule l'empreinte SHA-256 d'un fichier. */
export function empreinteFichier(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

// ============================================================
// IMPORT ENSEIGNANTS
// ============================================================

interface DonneesEnseignant {
  [key: string]: unknown;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  matieres?: string; // séparées par virgule
  classes?: string; // séparées par virgule
}

export async function analyserEnseignants(
  rows: Record<string, string>[],
  tenantId: string
): Promise<PlanImport<DonneesEnseignant>> {
  const lignes: LigneImport<DonneesEnseignant>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nom = (row["nom"] ?? row["Nom"] ?? "").trim();
    const prenom = (row["prenom"] ?? row["Prénom"] ?? "").trim();
    const email = (row["email"] ?? row["Email"] ?? "").trim();

    if (!nom || !prenom) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { nom, prenom, email },
        message: "Nom et prénom requis",
      });
      continue;
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
        telephone: (row["telephone"] ?? row["Téléphone"] ?? "").trim() || undefined,
        matieres: (row["matieres"] ?? row["Matières"] ?? "").trim() || undefined,
        classes: (row["classes"] ?? row["Classes"] ?? "").trim() || undefined,
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
  };
}

// ============================================================
// IMPORT CLASSES
// ============================================================

interface DonneesClasse {
  [key: string]: unknown;
  nom: string;
  niveau: string;
  effectif?: number;
  professeurPrincipal?: string;
}

export async function analyserClasses(
  rows: Record<string, string>[],
  tenantId: string
): Promise<PlanImport<DonneesClasse>> {
  const lignes: LigneImport<DonneesClasse>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nom = (row["nom"] ?? row["Nom"] ?? row["classe"] ?? "").trim();
    const niveau = (row["niveau"] ?? row["Niveau"] ?? "").trim();

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
      where: { nom, tenantId },
    }));

    lignes.push({
      numero: i + 2,
      action: existe ? "IGNORER" : "CREER",
      donnees: {
        nom,
        niveau: niveau || "Non spécifié",
        effectif: parseInt(row["effectif"] ?? "0") || undefined,
        professeurPrincipal:
          (row["professeurPrincipal"] ?? row["Professeur Principal"] ?? "").trim() ||
          undefined,
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
  };
}

// ============================================================
// IMPORT MATIERES
// ============================================================

interface DonneesMatiere {
  [key: string]: unknown;
  nom: string;
  code: string;
  coefficient?: number;
}

export async function analyserMatieres(
  rows: Record<string, string>[],
  tenantId: string
): Promise<PlanImport<DonneesMatiere>> {
  const lignes: LigneImport<DonneesMatiere>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nom = (row["nom"] ?? row["Nom"] ?? row["matiere"] ?? "").trim();
    const code = (row["code"] ?? row["Code"] ?? "").trim();

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
        coefficient: parseFloat(row["coefficient"] ?? "1") || 1,
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
  };
}

// ============================================================
// IMPORT PARENTS
// ============================================================

interface DonneesParent {
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
  tenantId: string
): Promise<PlanImport<DonneesParent>> {
  const lignes: LigneImport<DonneesParent>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nom = (row["nom"] ?? row["Nom"] ?? "").trim();
    const prenom = (row["prenom"] ?? row["Prénom"] ?? "").trim();
    const email = (row["email"] ?? row["Email"] ?? "").trim();
    const telephone = (row["telephone"] ?? row["Téléphone"] ?? "").trim();

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
        relation: (row["relation"] ?? row["Relation"] ?? "").trim() || undefined,
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
  };
}

// ============================================================
// APPLICATION DES PLANS
// ============================================================

export async function appliquerImportClasses(
  plan: PlanImport<DonneesClasse>,
  tenantId: string,
  annee: string
): Promise<ResultatImport> {
  let crees = 0, misAJour = 0, ignores = 0, erreurs = 0;

  for (const ligne of plan.lignes) {
    try {
      if (ligne.action === "CREER") {
        await prisma.classe.create({
          data: {
            nom: ligne.donnees.nom,
            niveau: ligne.donnees.niveau,
            tenantId,
            annee,
          },
        });
        crees++;
      } else if (ligne.action === "IGNORER") {
        ignores++;
      }
    } catch {
      erreurs++;
    }
  }

  return { crees, misAJour, ignores, erreurs };
}

export async function appliquerImportMatieres(
  plan: PlanImport<DonneesMatiere>,
  tenantId: string
): Promise<ResultatImport> {
  let crees = 0, misAJour = 0, ignores = 0, erreurs = 0;

  for (const ligne of plan.lignes) {
    try {
      if (ligne.action === "CREER") {
        await prisma.matiere.create({
          data: {
            nom: ligne.donnees.nom,
            code: ligne.donnees.code,
            coefficient: ligne.donnees.coefficient ?? 1,
            tenantId,
          },
        });
        crees++;
      } else if (ligne.action === "IGNORER") {
        ignores++;
      }
    } catch {
      erreurs++;
    }
  }

  return { crees, misAJour, ignores, erreurs };
}
