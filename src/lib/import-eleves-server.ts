/**
 * Préparation d'un import d'élèves : lecture du fichier, chargement du
 * contexte de l'établissement, construction du plan.
 *
 * Isolé du module d'analyse pur (`import-eleves.ts`) parce qu'il touche la
 * base : c'est aussi ce qui permet de tester l'analyse sans base de données.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, mergeFilters, type SessionSiteClaims } from "@/lib/site-scope";
import { normalizeName } from "@/lib/eleve-identity";
import {
  analyzeImport,
  parseElevesWorkbook,
  type FicheExistante,
  type PlanImport,
  type ParsedRow,
} from "@/lib/import-eleves";

interface Acteur extends SessionSiteClaims {
  id: string;
  tenantId: string;
}

export interface ContextePlan {
  plan: PlanImport;
  rows: ParsedRow[];
  hash: string;
}

/**
 * Construit le plan d'import à partir du fichier téléversé.
 *
 * Les fiches archivées sont incluses dans le rapprochement : leur matricule
 * reste réservé (contrainte `@@unique([tenantId, matricule])`) et réimporter
 * un élève archivé doit le restaurer plutôt que d'en créer un second.
 */
export async function preparerPlan(
  acteur: Acteur,
  buffer: ArrayBuffer
): Promise<ContextePlan> {
  const { rows, erreurs, hash } = await parseElevesWorkbook(buffer);

  const siteFilter = siteFilterForModel("eleve", acteur);

  const [existantsBruts, classes, importPrecedent] = await Promise.all([
    prisma.eleve.findMany({
      where: mergeFilters({ tenantId: acteur.tenantId }, siteFilter),
      select: {
        id: true,
        matricule: true,
        nom: true,
        prenom: true,
        dateNaissance: true,
        deletedAt: true,
        classe: { select: { nom: true } },
      },
    }),
    prisma.classe.findMany({
      where: mergeFilters({ tenantId: acteur.tenantId }, siteFilterForModel("classe", acteur)),
      select: { nom: true },
    }),
    // Empreinte du fichier : a-t-il déjà été importé dans cet établissement ?
    prisma.auditLog.findFirst({
      where: {
        tenantId: acteur.tenantId,
        action: "eleves.import",
        metadata: { path: ["hash"], equals: hash },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, userId: true },
    }),
  ]);

  const existants: FicheExistante[] = existantsBruts.map((e) => ({
    id: e.id,
    matricule: e.matricule,
    nom: e.nom,
    prenom: e.prenom,
    dateNaissance: e.dateNaissance,
    classeNom: e.classe?.nom ?? null,
    archive: e.deletedAt !== null,
  }));

  const classesConnues = new Set(classes.map((c) => normalizeName(c.nom)));
  const plan = analyzeImport(rows, erreurs, existants, classesConnues, hash);

  if (importPrecedent) {
    let par: string | null = null;
    if (importPrecedent.userId) {
      const auteur = await prisma.user.findUnique({
        where: { id: importPrecedent.userId },
        select: { name: true },
      });
      par = auteur?.name ?? null;
    }
    plan.dejaImporte = { date: importPrecedent.createdAt.toISOString(), par };
  }

  return { plan, rows, hash };
}

/**
 * Dernier matricule émis pour l'année, fiches archivées comprises.
 *
 * Volontairement sans filtre `deletedAt` : un matricule attribué puis archivé
 * ne doit jamais être réattribué, sans quoi la contrainte d'unicité échoue au
 * milieu d'un lot.
 */
export async function dernierMatricule(tenantId: string, annee: number): Promise<string | null> {
  // eslint-disable-next-line ecolpro/require-site-filter -- unicité du matricule au niveau tenant, par construction
  const dernier = await prisma.eleve.findFirst({
    where: { tenantId, matricule: { startsWith: `${annee}-` } },
    orderBy: { matricule: "desc" },
    select: { matricule: true },
  });
  return dernier?.matricule ?? null;
}
