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
import { fuzzyFind } from "@/lib/text-match";
import { infererColonnes, valeurChamp, type MappingColonnes } from "@/lib/column-inference";

export type TypeImport = "eleves" | "enseignants" | "classes" | "matieres" | "parents" | "edt-externes" | "personnel-admin";

export interface PlanImport<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  type: TypeImport;
  empreinte: string;
  totalLignes: number;
  lignesValides: number;
  lignesErreurs: number;
  lignes: LigneImport<T>[];
  /** Mapping de colonnes inféré par analyse du header + des données. */
  mappingColonnes?: MappingColonnes;
  /** En-têtes du fichier source (pour l'UI de remapping). */
  headers?: string[];
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

/** Résultat de la lecture d'un fichier : headers + lignes. */
export interface FichierLu {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Lit un fichier Excel ou CSV et retourne les en-têtes + lignes brutes.
 */
export async function lireFichier(
  buffer: Buffer,
  mimeType: string
): Promise<FichierLu> {
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
  if (!ws) return { headers: [], rows: [] };

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

  return { headers, rows };
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
  tenantId: string,
  headers?: string[]
): Promise<PlanImport<DonneesClasse>> {
  const mapping = headers
    ? infererColonnes(headers, rows, "classes")
    : infererColonnes(Object.keys(rows[0] ?? {}), rows, "classes");
  const hs = headers ?? Object.keys(rows[0] ?? {});

  const lignes: LigneImport<DonneesClasse>[] = [];

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
      where: { nom, tenantId },
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

// ============================================================
// APPLICATION DES PLANS
// ============================================================

// — Helper : génère un mot de passe temporaire —
function motDePasseTemporaire(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw + "!";
}

// — Helper : résout un nom de site en ID —
async function resoudreSiteId(
  tenantId: string,
  nomSite?: string
): Promise<string | null> {
  if (!nomSite) return null;
  const site = await prisma.site.findFirst({
    where: {
      tenantId,
      OR: [
        { nom: { equals: nomSite, mode: "insensitive" } },
        { code: { equals: nomSite, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  return site?.id ?? null;
}

/**
 * Applique un plan d'import d'enseignants.
 * Crée les comptes User + Enseignant + AffectationEnseignant + EnseignantSite.
 */
export async function appliquerImportEnseignants(
  plan: PlanImport<DonneesEnseignant>,
  tenantId: string,
  opts: { annee: string; siteIdParDefaut?: string | null } = { annee: new Date().getFullYear().toString() }
): Promise<ResultatImport & { details: string[] }> {
  let crees = 0, misAJour = 0, ignores = 0, erreurs = 0;
  const details: string[] = [];

  // Précharger les matières et classes du tenant pour résolution par nom
  // eslint-disable-next-line ecolpro/require-site-filter -- import batch, résolution globale par tenant
  const matieres = await prisma.matiere.findMany({
    where: { tenantId },
    select: { id: true, nom: true },
  });
  const matiereParNom = new Map(matieres.map((m) => [m.nom.toLowerCase(), m.id]));

  // eslint-disable-next-line ecolpro/require-site-filter -- import batch, résolution globale par tenant
  const classes = await prisma.classe.findMany({
    where: { tenantId, annee: opts.annee },
    select: { id: true, nom: true, siteId: true },
  });
  const classeParNom = new Map(classes.map((c) => [c.nom.toLowerCase(), c]));

  for (const ligne of plan.lignes) {
    try {
      if (ligne.action === "IGNORER" || ligne.action === "ERREUR") {
        if (ligne.action === "ERREUR") erreurs++;
        else ignores++;
        continue;
      }

      const d = ligne.donnees;
      let userId: string | null = null;
      let enseignantId: string | null = null;

      // Vérifier si l'utilisateur existe déjà
      if (d.email) {
        // eslint-disable-next-line ecolpro/require-site-filter -- recherche par email
        const existingUser = await prisma.user.findFirst({
          where: { email: d.email, tenantId },
        });
        if (existingUser) {
          userId = existingUser.id;
          // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- vérification par userId
          const existingEns = await prisma.enseignant.findFirst({
            where: { userId: existingUser.id },
          });
          if (existingEns) enseignantId = existingEns.id;
        }
      }

      // Créer l'utilisateur si nécessaire
      if (!userId) {
        const tempPw = motDePasseTemporaire();
        const newUser = await prisma.user.create({
          data: {
            tenantId,
            email: d.email || `${d.nom.toLowerCase()}.${d.prenom.toLowerCase()}.${Date.now()}@import.dj`,
            name: `${d.prenom} ${d.nom}`,
            firstName: d.prenom,
            lastName: d.nom,
            phone: d.telephone || null,
            role: "TEACHER",
            password: tempPw,
            mustChangePassword: true,
          },
        });
        userId = newUser.id;
        details.push(`Compte créé pour ${d.prenom} ${d.nom} (email: ${newUser.email})`);
      }

      // Créer l'enseignant si nécessaire
      if (!enseignantId) {
        const newEns = await prisma.enseignant.create({
          data: {
            tenantId,
            userId: userId!,
            matricule: d.matricule || null,
            specialite: d.matieres || null,
            typeContrat: d.typeContrat || null,
          },
        });
        enseignantId = newEns.id;
        crees++;
      } else {
        misAJour++;
      }

      // Résoudre les sites
      const siteIds: string[] = [];
      if (d.sites && d.sites.length > 0) {
        for (const nomSite of d.sites) {
          const sid = await resoudreSiteId(tenantId, nomSite);
          if (sid) siteIds.push(sid);
          else details.push(`⚠ Site non trouvé: "${nomSite}" pour ${d.prenom} ${d.nom}`);
        }
      }
      if (siteIds.length === 0 && opts.siteIdParDefaut) {
        siteIds.push(opts.siteIdParDefaut);
      }

      // Créer les liens EnseignantSite
      for (const sid of siteIds) {
        await prisma.enseignantSite.upsert({
          where: {
            enseignantId_siteId: { enseignantId: enseignantId!, siteId: sid },
          },
          update: {},
          create: { enseignantId: enseignantId!, siteId: sid },
        });
      }

      // Créer les affectations classe + matière
      const classesList = d.classes?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
      const matieresList = d.matieres?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

      if (classesList.length > 0) {
        for (const nomClasse of classesList) {
          const classe = classeParNom.get(nomClasse.toLowerCase());
          if (!classe) {
            details.push(`⚠ Classe non trouvée: "${nomClasse}" pour ${d.prenom} ${d.nom}`);
            continue;
          }

          if (matieresList.length > 0) {
            // Collège/Lycée : affectation par matière
            for (const nomMatiere of matieresList) {
              const matiereId = matiereParNom.get(nomMatiere.toLowerCase());
              if (!matiereId) {
                details.push(`⚠ Matière non trouvée: "${nomMatiere}" pour ${d.prenom} ${d.nom}`);
                continue;
              }
              await prisma.affectationEnseignant.upsert({
                where: {
                  enseignantId_classeId_matiereId: {
                    enseignantId: enseignantId!,
                    classeId: classe.id,
                    matiereId,
                  },
                },
                update: {},
                create: {
                  tenantId,
                  enseignantId: enseignantId!,
                  classeId: classe.id,
                  matiereId,
                },
              });
            }
          } else {
            // Primaire/Maternelle : pas de matière spécifique
            // On ne crée pas d'affectation sans matière — l'enseignant est
            // prof principal de la classe, géré séparément.
            // TODO: si on veut marquer prof principal, il faut une logique dédiée.
          }
        }
      }
    } catch (e) {
      erreurs++;
      details.push(`Erreur ligne ${ligne.numero}: ${e instanceof Error ? e.message : "inconnue"}`);
    }
  }

  return { crees, misAJour, ignores, erreurs, details };
}

/**
 * Applique un plan d'import de personnel administratif.
 * Crée les comptes User avec le rôle et le site spécifiés.
 */
export async function appliquerImportPersonnelAdmin(
  plan: PlanImport<DonneesPersonnelAdmin>,
  tenantId: string
): Promise<ResultatImport & { details: string[] }> {
  let crees = 0, misAJour = 0, ignores = 0, erreurs = 0;
  const details: string[] = [];

  for (const ligne of plan.lignes) {
    try {
      if (ligne.action === "IGNORER" || ligne.action === "ERREUR") {
        if (ligne.action === "ERREUR") erreurs++;
        else ignores++;
        continue;
      }

      const d = ligne.donnees;

      // Résoudre le site
      let siteId: string | null = null;
      if (d.site) {
        siteId = await resoudreSiteId(tenantId, d.site);
        if (!siteId) {
          details.push(`⚠ Site non trouvé: "${d.site}" pour ${d.prenom} ${d.nom}`);
        }
      }

      // Vérifier si l'utilisateur existe
      let user = null;
      if (d.email) {
        // eslint-disable-next-line ecolpro/require-site-filter -- recherche par email
        user = await prisma.user.findFirst({
          where: { email: d.email, tenantId },
        });
      }

      if (user) {
        // Mettre à jour le rôle et le site
        await prisma.user.update({
          where: { id: user.id },
          data: {
            role: d.role as never,
            ...(siteId ? { siteId } : {}),
            phone: d.telephone || user.phone,
          },
        });
        misAJour++;
      } else {
        const tempPw = motDePasseTemporaire();
        const email = d.email || `${d.nom.toLowerCase()}.${d.prenom.toLowerCase()}.${Date.now()}@import.dj`;
        await prisma.user.create({
          data: {
            tenantId,
            email,
            name: `${d.prenom} ${d.nom}`,
            firstName: d.prenom,
            lastName: d.nom,
            phone: d.telephone || null,
            role: d.role as never,
            siteId: siteId || null,
            password: tempPw,
            mustChangePassword: true,
          },
        });
        crees++;
        details.push(`Compte créé pour ${d.prenom} ${d.nom} (${d.role}) — email: ${email}`);
      }
    } catch (e) {
      erreurs++;
      details.push(`Erreur ligne ${ligne.numero}: ${e instanceof Error ? e.message : "inconnue"}`);
    }
  }

  return { crees, misAJour, ignores, erreurs, details };
}

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

// ============================================================
// IMPORT PERSONNEL ADMINISTRATIF
// ============================================================

interface DonneesPersonnelAdmin {
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

// ============================================================
// IMPORT EDT EXTERNES (indisponibilités enseignants)
// ============================================================

/// Données d'une ligne d'import d'emploi du temps externe.
/// Le fichier représente les cours d'un enseignant dans un autre
/// établissement — chaque ligne devient une indisponibilité dans
/// SchoolPro pour que le moteur d'EDT ne propose pas de créneau
/// en conflit.
export interface DonneesEdtExterne {
  [key: string]: unknown;
  enseignantNom: string;
  enseignantPrenom?: string;
  enseignantEmail?: string;
  enseignantId?: string; // ID SchoolPro si déjà résolu
  jour: string;
  heureDebut: string;
  heureFin: string;
  etablissement?: string; // nom de l'établissement externe
  matiere?: string; // matière enseignée à l'externe (pour info)
  periode?: string; // "T1", "T2", "T3" ou nom de période
}

/// Normalise un jour en enum Jour Prisma.
function normaliserJour(v: string): string | null {
  const s = v.trim().toUpperCase();
  const map: Record<string, string> = {
    "LUNDI": "LUNDI", "LUN": "LUNDI", "MON": "LUNDI", "MONDAY": "LUNDI",
    "MARDI": "MARDI", "MAR": "MARDI", "TUE": "MARDI", "TUESDAY": "MARDI",
    "MERCREDI": "MERCREDI", "MER": "MERCREDI", "WED": "MERCREDI", "WEDNESDAY": "MERCREDI",
    "JEUDI": "JEUDI", "JEU": "JEUDI", "THU": "JEUDI", "THURSDAY": "JEUDI",
    "VENDREDI": "VENDREDI", "VEN": "VENDREDI", "FRI": "VENDREDI", "FRIDAY": "VENDREDI",
    "SAMEDI": "SAMEDI", "SAM": "SAMEDI", "SAT": "SAMEDI", "SATURDAY": "SAMEDI",
    "DIMANCHE": "DIMANCHE", "DIM": "DIMANCHE", "SUN": "DIMANCHE", "SUNDAY": "DIMANCHE",
  };
  return map[s] ?? null;
}

/// Valide qu'une heure est au format HH:MM
function validerHeure(v: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(v.trim());
}

export async function analyserEdtExternes(
  rows: Record<string, string>[],
  tenantId: string,
  headers?: string[]
): Promise<PlanImport<DonneesEdtExterne>> {
  const mapping = headers
    ? infererColonnes(headers, rows, "edt-externes")
    : infererColonnes(Object.keys(rows[0] ?? {}), rows, "edt-externes");
  const hs = headers ?? Object.keys(rows[0] ?? {});

  const lignes: LigneImport<DonneesEdtExterne>[] = [];

  // Charger tous les enseignants du tenant pour la résolution par nom
  // eslint-disable-next-line ecolpro/require-site-filter -- import: résolution par nom sur tout le tenant
  const enseignants = await prisma.enseignant.findMany({
    where: { tenantId },
    include: { user: { select: { name: true, email: true } } },
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nom = valeurChamp(row, hs, mapping, "nom");
    const prenom = valeurChamp(row, hs, mapping, "prenom");
    const email = valeurChamp(row, hs, mapping, "email");
    const jour = valeurChamp(row, hs, mapping, "jour");
    const heureDebut = valeurChamp(row, hs, mapping, "heureDebut");
    const heureFin = valeurChamp(row, hs, mapping, "heureFin");
    const etablissement = valeurChamp(row, hs, mapping, "etablissement");
    const matiere = valeurChamp(row, hs, mapping, "matieres");
    const periode = valeurChamp(row, hs, mapping, "periode");

    // Validations
    if (!nom) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { enseignantNom: nom, jour, heureDebut, heureFin },
        message: "Nom de l'enseignant requis",
      });
      continue;
    }

    const jourNormalise = normaliserJour(jour);
    if (!jourNormalise) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { enseignantNom: nom, jour, heureDebut, heureFin },
        message: `Jour non reconnu: "${jour}". Utilisez LUNDI, MARDI, … ou LUN, MAR, …`,
      });
      continue;
    }

    if (!validerHeure(heureDebut) || !validerHeure(heureFin)) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { enseignantNom: nom, jour, heureDebut, heureFin },
        message: "Heures invalides — format attendu HH:MM (ex: 08:00)",
      });
      continue;
    }

    // Résolution de l'enseignant : par email d'abord, puis par nom fuzzy
    let enseignantId: string | undefined;
    if (email) {
      const match = enseignants.find((e) => e.user.email?.toLowerCase() === email.toLowerCase());
      if (match) enseignantId = match.id;
    }
    if (!enseignantId) {
      const nomComplet = prenom ? `${prenom} ${nom}` : nom;
      // fuzzyFind cherche par substring/préfixe sur le champ `nom`
      const candidats = enseignants.map((e) => ({
        id: e.id,
        nom: e.user.name ?? nom,
      }));
      const matches = fuzzyFind(candidats, nomComplet);
      if (matches.length > 0) enseignantId = matches[0].id;
    }

    if (!enseignantId) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { enseignantNom: nom, enseignantPrenom: prenom, enseignantEmail: email, jour, heureDebut, heureFin, etablissement, matiere, periode },
        message: `Enseignant non trouvé dans SchoolPro: ${prenom} ${nom}${email ? ` (${email})` : ""}. Ajoutez-le d'abord via l'import enseignants.`,
      });
      continue;
    }

    lignes.push({
      numero: i + 2,
      action: "CREER",
      donnees: {
        enseignantNom: nom,
        enseignantPrenom: prenom || undefined,
        enseignantEmail: email || undefined,
        enseignantId,
        jour: jourNormalise,
        heureDebut,
        heureFin,
        etablissement: etablissement || undefined,
        matiere: matiere || undefined,
        periode: periode || undefined,
      },
    });
  }

  return {
    type: "edt-externes",
    empreinte: "",
    totalLignes: rows.length,
    lignesValides: lignes.filter((l) => l.action !== "ERREUR").length,
    lignesErreurs: lignes.filter((l) => l.action === "ERREUR").length,
    lignes,
    mappingColonnes: mapping,
    headers: hs,
  };
}

/// Applique un plan d'import EDT externes en créant des IndisponibiliteEnseignant.
/// Optionnellement limité à une période (trimestre) et une année scolaire.
export async function appliquerImportEdtExternes(
  plan: PlanImport<DonneesEdtExterne>,
  tenantId: string,
  opts: { periodeId?: string; anneeLibelle?: string; siteId?: string | null } = {}
): Promise<ResultatImport> {
  let crees = 0, misAJour = 0, ignores = 0, erreurs = 0;

  for (const ligne of plan.lignes) {
    try {
      if (ligne.action !== "CREER" || !ligne.donnees.enseignantId) {
        ignores++;
        continue;
      }

      // Vérifier qu'une indispo identique n'existe pas déjà (même enseignant,
      // jour, heures, période) pour éviter les doublons à la ré-import.
      // eslint-disable-next-line ecolpro/require-site-filter -- import: dédoublonnage par clé métier
      const existant = await prisma.indisponibiliteEnseignant.findFirst({
        where: {
          tenantId,
          enseignantId: ligne.donnees.enseignantId,
          jour: ligne.donnees.jour as never,
          heureDebut: ligne.donnees.heureDebut,
          heureFin: ligne.donnees.heureFin,
          ...(opts.periodeId ? { periodeId: opts.periodeId } : { periodeId: null }),
        },
      });

      if (existant) {
        ignores++;
        continue;
      }

      await prisma.indisponibiliteEnseignant.create({
        data: {
          tenantId,
          enseignantId: ligne.donnees.enseignantId,
          jour: ligne.donnees.jour as never,
          heureDebut: ligne.donnees.heureDebut,
          heureFin: ligne.donnees.heureFin,
          source: "IMPORT_EXTERNE",
          sourceLibelle: ligne.donnees.etablissement ?? null,
          periodeId: opts.periodeId ?? null,
          anneeLibelle: opts.anneeLibelle ?? null,
          siteId: opts.siteId ?? null,
        },
      });
      crees++;
    } catch {
      erreurs++;
    }
  }

  return { crees, misAJour, ignores, erreurs };
}
