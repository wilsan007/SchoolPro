import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { validerPrerequis } from "@/lib/learnos/curriculum";
import { revalidatePath } from "next/cache";

const PatchSchema = z.object({
  libelle: z.string().min(2).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  ordre: z.number().int().min(0).optional(),
  /** Remplace intégralement la liste des prérequis lorsqu'il est fourni. */
  prerequisIds: z.array(z.string()).max(20).optional(),
});

/** Profondeur maximale explorée — garde-fou, en écho au moteur de recommandation. */
const PROFONDEUR_MAX = 10;

/**
 * `cible` figure-t-elle parmi les prérequis, directs ou indirects, de `depart` ?
 *
 * Sert à refuser un cycle : « A exige B, qui exige A » rendrait la progression
 * impossible à parcourir et fausserait le comptage des compétences bloquées.
 * Mieux vaut l'interdire à la saisie que le contourner ensuite à chaque lecture.
 */
async function creeUnCycle(
  tenantId: string,
  cible: string,
  depart: string[]
): Promise<boolean> {
  const vues = new Set<string>();
  let frontiere = depart.filter((id) => id !== cible);

  if (depart.includes(cible)) return true; // une compétence ne peut être son propre prérequis

  for (let d = 0; d < PROFONDEUR_MAX && frontiere.length > 0; d++) {
    // Tenant-wide À DESSEIN, contrairement au reste du fichier. Un cycle est une
    // propriété du graphe entier : restreindre la traversée au périmètre de
    // l'appelant ferait manquer un cycle passant par une compétence hors de sa
    // vue, et l'écriture serait alors acceptée. Un contrôle d'intégrité qui ne
    // voit qu'une partie du graphe ne contrôle rien.
    // La fuite est nulle en pratique : le parcours part d'identifiants déjà
    // validés par `validerPrerequis` sous filtre de site, et ne rend qu'un
    // booléen. L'autorisation d'écrire, elle, est établie ligne 72.
    // eslint-disable-next-line ecolpro/require-site-filter -- intégrité du graphe, cf. ci-dessus
    const noeuds = await prisma.competence.findMany({
      where: { tenantId, id: { in: frontiere } },
      select: { prerequis: { select: { id: true } } },
    });

    const suivants = noeuds.flatMap((n) => n.prerequis.map((p) => p.id));
    if (suivants.includes(cible)) return true;

    frontiere = suivants.filter((id) => !vues.has(id));
    for (const id of frontiere) vues.add(id);
  }
  return false;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "evaluations:write");
  if (denied) return denied;

  const { id } = await params;
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES");
  }
  const tenantId = session.user.tenantId;

  const existante = await prisma.competence.findFirst({
    where: { id, tenantId, ...siteFilterForModel("competence", session.user) },
    select: { id: true },
  });
  if (!existante) {
    return erreurJson("COMPETENCE_INTROUVABLE");
  }

  const { prerequisIds, ...champs } = parsed.data;

  let relationPrerequis = {};
  if (prerequisIds !== undefined) {
    const valides = await validerPrerequis(
      tenantId,
      session.user as SessionSiteClaims,
      prerequisIds
    );
    if ("erreur" in valides) {
      return erreurJson(valides.erreur);
    }

    if (await creeUnCycle(tenantId, id, valides.ids)) {
      return erreurJson("CYCLE_PREREQUIS");
    }

    // `set` et non `connect` : la liste fournie remplace la précédente, ce qui
    // permet de retirer un prérequis depuis l'écran d'édition.
    relationPrerequis = { prerequis: { set: valides.ids.map((p) => ({ id: p })) } };
  }

  const competence = await prisma.competence.update({
    where: { id },
    data: { ...champs, ...relationPrerequis },
    include: { prerequis: { select: { id: true, code: true, libelle: true } } },
  });

  revalidatePath("/curriculum");
  return NextResponse.json(competence);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "evaluations:delete");
  if (denied) return denied;

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existante = await prisma.competence.findFirst({
    where: { id, tenantId, ...siteFilterForModel("competence", session.user) },
    select: { id: true, _count: { select: { evidences: true, dependants: true } } },
  });
  if (!existante) {
    return erreurJson("COMPETENCE_INTROUVABLE");
  }

  // Une compétence déjà évaluée porte des preuves d'apprentissage et des profils
  // d'élèves. La supprimer effacerait cet historique en cascade — refus explicite.
  if (existante._count.evidences > 0) {
    return erreurJson("COMPETENCE_A_DES_PREUVES", {
      nb: existante._count.evidences,
    });
  }

  if (existante._count.dependants > 0) {
    return erreurJson("COMPETENCE_A_DES_DEPENDANTS", {
      nb: existante._count.dependants,
    });
  }

  await prisma.competence.delete({ where: { id } });

  revalidatePath("/curriculum");
  return NextResponse.json({ success: true });
}
