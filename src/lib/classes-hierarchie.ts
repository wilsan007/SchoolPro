import prisma from "@/lib/prisma";
import type { Prisma, Role } from "@prisma/client";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getSchoolGroup, SCHOOL_GROUP_ORDER, type SchoolGroup } from "@/lib/school-groups";

/**
 * Hiérarchie d'affichage des classes :
 * Catégorie (Structure / SchoolGroup) → Niveau → Classe
 *
 * Utilisée par toutes les pages dashboard qui affichent des classes ou des
 * élèves, afin de présenter un arbre repliable ou des filtres cascade.
 */

export interface ClasseNode {
  id: string;
  nom: string;
  niveau: string;
  filiere: string | null;
  siteId: string | null;
  siteNom: string | null;
  effectif: number;
}

export interface NiveauNode {
  niveau: string;
  classes: ClasseNode[];
}

export interface CategorieNode {
  categorie: SchoolGroup;
  label: string;
  niveaux: NiveauNode[];
}

export type ClassesHierarchie = CategorieNode[];

/** Libellés localisables par catégorie (clés de traduction). */
export const CATEGORIE_LABEL_KEYS: Record<SchoolGroup, string> = {
  Primaire: "primaire",
  Collège: "college",
  Lycée: "lycee",
  Autre: "autre",
};

export interface GetClassesHierarchieOptions {
  /** Libellé année scolaire (ex: "2025-2026"). Si omis, résolu automatiquement. */
  anneeCourante?: string | null;
  /** IDs de classes autorisés (scope enseignant). null = toutes les classes. */
  classeIdsRestriction?: string[] | null;
  /** Inclure le compte d'élèves par classe (coût supplémentaire). Défaut: true. */
  avecEffectifs?: boolean;
}

/**
 * Récupère les classes du tenant, groupées par catégorie → niveau → classe.
 *
 * - Filtre par tenant, site, année scolaire, et scope enseignant.
 * - La catégorie est déterminée par la `Structure` rattachée à la classe,
 *   avec fallback sur `getSchoolGroup(niveau)` si aucune structure.
 * - Les classes archivées (deletedAt non null) sont exclues.
 *
 * @returns Tableau ordonné par SCHOOL_GROUP_ORDER, chaque niveau trié
 *   alphabétiquement, chaque classe triée par nom.
 */
export async function getClassesHierarchie(
  tenantId: string,
  user: SessionSiteClaims & { id?: string | null; role?: Role | string | null },
  options: GetClassesHierarchieOptions = {},
): Promise<ClassesHierarchie> {
  const { anneeCourante: anneeOverride, classeIdsRestriction = null, avecEffectifs = true } = options;

  const anneeCourante = anneeOverride !== undefined ? anneeOverride : await getAnneeCouranteLibelle(tenantId);
  const siteFilter = siteFilterForModel("classe", user);

  // Résoudre le scope enseignant si non déjà fourni.
  let classeIds = classeIdsRestriction;
  if (classeIds === null && user.id && user.role && isTeacherRole(user.role as Role)) {
    const scope = await getTeacherScope(tenantId, user.id as string, user.role as Role, anneeCourante);
    classeIds = scope.classeIds;
  }

  const classes = await prisma.classe.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...(classeIds ? { id: { in: classeIds } } : {}),
      ...siteFilter,
    } as Prisma.ClasseWhereInput,
    select: {
      id: true,
      nom: true,
      niveau: true,
      filiere: true,
      siteId: true,
      site: { select: { nom: true } },
      structure: { select: { type: true, nom: true } },
    },
    orderBy: [{ niveau: "asc" }, { nom: "asc" }],
  });

  // Effectifs réels par classe (une seule requête groupBy).
  let effectifsMap: Record<string, number> = {};
  if (avecEffectifs && classes.length > 0) {
    const classeIdList = classes.map((c) => c.id);
    const parClasse = await prisma.eleve.groupBy({
      by: ["classeId"],
      where: {
        tenantId,
        deletedAt: null,
        classeId: { in: classeIdList },
        // Le paramètre s'appelle `user` : `claims` n'existe pas dans cette
        // portée et faisait planter l'écran Emploi du temps au chargement.
        ...siteFilterForModel("eleve", user),
      },
      _count: true,
    });
    for (const row of parClasse) {
      if (row.classeId) effectifsMap[row.classeId] = row._count;
    }
  }

  // Grouper par catégorie → niveau → classe.
  const categorieMap = new Map<SchoolGroup, Map<string, ClasseNode[]>>();

  for (const c of classes) {
    // Déterminer la catégorie : Structure en priorité, fallback sur getSchoolGroup.
    let categorie: SchoolGroup;
    const structType = c.structure?.type;
    if (structType === "MATERNELLE") categorie = "Autre"; // pas de groupe Maternelle dans SchoolGroup
    else if (structType === "PRIMAIRE") categorie = "Primaire";
    else if (structType === "COLLEGE") categorie = "Collège";
    else if (structType === "LYCEE") categorie = "Lycée";
    else categorie = getSchoolGroup(c.niveau, c.nom);

    if (!categorieMap.has(categorie)) categorieMap.set(categorie, new Map());
    const niveauMap = categorieMap.get(categorie)!;

    const niveauKey = c.niveau || "—";
    if (!niveauMap.has(niveauKey)) niveauMap.set(niveauKey, []);
    niveauMap.get(niveauKey)!.push({
      id: c.id,
      nom: c.nom,
      niveau: c.niveau,
      filiere: c.filiere,
      siteId: c.siteId,
      siteNom: c.site?.nom ?? null,
      effectif: effectifsMap[c.id] ?? 0,
    });
  }

  // Construire le résultat ordonné.
  return SCHOOL_GROUP_ORDER.map((group) => {
    const niveauMap = categorieMap.get(group);
    if (!niveauMap) return null;
    const niveaux: NiveauNode[] = Array.from(niveauMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([niveau, classes]) => ({
        niveau,
        classes: classes.sort((a, b) => a.nom.localeCompare(b.nom)),
      }));
    return {
      categorie: group,
      label: CATEGORIE_LABEL_KEYS[group],
      niveaux,
    };
  }).filter((n): n is CategorieNode => n !== null);
}

/**
 * Aplatit la hiérarchie en une liste plate de classes (pour compatibilité
 * avec les composants existants qui attendent `{ id, nom }[]`).
 */
export function aplatirHierarchie(hierarchie: ClassesHierarchie): { id: string; nom: string; niveau: string }[] {
  const result: { id: string; nom: string; niveau: string }[] = [];
  for (const cat of hierarchie) {
    for (const niv of cat.niveaux) {
      for (const cls of niv.classes) {
        result.push({ id: cls.id, nom: cls.nom, niveau: cls.niveau });
      }
    }
  }
  return result;
}

/**
 * Extrait tous les IDs de classes de la hiérarchie.
 */
export function extraireClasseIds(hierarchie: ClassesHierarchie): string[] {
  const ids: string[] = [];
  for (const cat of hierarchie) {
    for (const niv of cat.niveaux) {
      for (const cls of niv.classes) {
        ids.push(cls.id);
      }
    }
  }
  return ids;
}
