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
 * Filtre de site pour un modèle donné, en tenant compte d'un site cible
 * explicitement choisi pour l'import (ex: TENANT_ADMIN sans site sélectionné
 * qui importe dans un site précis).
 *
 * Passe systématiquement par `siteFilterForModel` — y compris pour le site
 * explicite — afin que le filtre reste statiquement vérifiable et respecte
 * la même résolution de périmètre que le reste de l'application (un site
 * hors du périmètre autorisé de l'acteur y est refusé, cf. `resolveSiteScope`).
 */
function siteScopeFor(
  model: string,
  acteur: Acteur,
  targetSiteId?: string | null
): Record<string, unknown> {
  if (!targetSiteId) return siteFilterForModel(model, acteur);
  // Seul `siteId` (le site "sélectionné") est remplacé — `siteIds` (les sites
  // réellement autorisés) reste celui de l'acteur, afin qu'un rôle borné à un
  // sous-ensemble de sites ne puisse pas se voir accorder l'accès à un site
  // cible hors de son périmètre via ce paramètre.
  return siteFilterForModel(model, { ...acteur, siteId: targetSiteId });
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
  buffer: ArrayBuffer,
  targetSiteId?: string | null
): Promise<ContextePlan> {
  const { rows, erreurs, hash } = await parseElevesWorkbook(buffer);

  // Lorsqu'un site cible est explicitement fourni pour l'import, on restreint
  // la recherche des élèves et classes existantes à ce site uniquement — sans
  // cela, un TENANT_ADMIN sans site sélectionné chargerait tous les élèves du
  // tenant et l'import « écraserait » les fiches des autres sites.
  const siteFilter = siteScopeFor("eleve", acteur, targetSiteId);
  const classeSiteFilter = siteScopeFor("classe", acteur, targetSiteId);

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
      where: mergeFilters({ tenantId: acteur.tenantId }, classeSiteFilter),
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
      // importPrecedent provient d'un AuditLog déjà filtré par tenantId (ci-dessus) ;
      // revérifier explicitement l'appartenance de l'utilisateur avant la lecture.
      const auteur = await prisma.user.findFirst({
        where: { id: importPrecedent.userId, tenantId: acteur.tenantId, ...siteFilterForModel("user", acteur) },
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
