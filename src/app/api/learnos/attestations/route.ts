import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  siteFilterForModel,
  personalScopeFilter,
  mergeFilters,
  isRelationScopedRole,
} from "@/lib/site-scope";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role, Prisma } from "@prisma/client";

/**
 * Attestations en attente de signature.
 *
 * Ce que l'enseignant voit ici, c'est du travail que des élèves ont fait seuls
 * et dont le système pense qu'il tient. Il ne lui demande pas de le croire : il
 * lui demande d'aller vérifier en classe. La liste porte donc le nombre de
 * séances autonomes derrière chaque demande — sans ce chiffre, l'enseignant
 * n'aurait aucun moyen de juger si la demande est sérieuse.
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "entrainement:write");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const role = session.user.role as Role;

  // Un enseignant ne signe que pour ses classes ; la direction voit tout.
  const scope = isTeacherRole(role)
    ? await getTeacherScope(tenantId, session.user.id, role)
    : undefined;

  // Périmètre personnel pour PARENT / STUDENT : `siteFilterForModel` seul
  // renvoie un filtre vide pour ces rôles (périmètre relationnel), ce qui
  // exposerait les attestations — données nominatives (nom, prénom, classe de
  // l'élève) — de tout le tenant. `personalScopeFilter` restreint via la
  // relation `eleve` : un élève ne voit que ses propres demandes, un parent
  // celles de ses enfants.
  const relationFilter = personalScopeFilter(session.user, "eleve");

  const feuilles = await prisma.feuilleExercices.findMany({
    where: mergeFilters(
      { tenantId, type: "attestation" },
      // Deux états, deux gestes attendus : `PROPOSEE` demande une décision,
      // `ASSIGNEE` sans `assigneeLe` attend d'être lancée en classe. Ne montrer
      // que la première laisserait les attestations acceptées disparaître de
      // l'écran sans jamais être passées.
      {
        OR: [
          { statut: "PROPOSEE" },
          { statut: "ASSIGNEE", assigneeLe: null },
        ],
      },
      ...(scope?.isRestricted ? [{ eleve: { classeId: { in: scope.classeIds } } }] : []),
      siteFilterForModel("feuilleExercices", session.user),
      relationFilter,
    ) as Prisma.FeuilleExercicesWhereInput,
    select: {
      id: true,
      statut: true,
      assigneeLe: true,
      createdAt: true,
      competenceAttesteeId: true,
      competenceAttestee: { select: { libelle: true, code: true } },
      matiere: { select: { nom: true, couleur: true } },
      eleve: {
        select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } },
      },
      _count: { select: { exercices: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (feuilles.length === 0) return NextResponse.json({ attestations: [] });

  // Le profil qui a déclenché la demande, lu en une passe : c'est lui qui
  // justifie la proposition, et l'afficher évite à l'enseignant d'aller le
  // chercher dans un autre écran pour décider.
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      OR: feuilles
        .filter((f) => f.competenceAttesteeId)
        .map((f) => ({ eleveId: f.eleve.id, competenceId: f.competenceAttesteeId! })),
      ...siteFilterForModel("studentLearningProfile", session.user),
    },
    select: {
      eleveId: true,
      competenceId: true,
      masteryScore: true,
      confidenceScore: true,
      evidenceCount: true,
    },
  });
  const profilDe = new Map(profils.map((p) => [`${p.eleveId}|${p.competenceId}`, p]));

  return NextResponse.json({
    attestations: feuilles.map((f) => ({
      id: f.id,
      // `true` = signée, en attente d'être lancée devant l'élève.
      signee: f.statut === "ASSIGNEE",
      creeeLe: f.createdAt,
      nbExercices: f._count.exercices,
      competence: f.competenceAttestee,
      matiere: f.matiere,
      eleve: f.eleve,
      profil: profilDe.get(`${f.eleve.id}|${f.competenceAttesteeId}`) ?? null,
    })),
  });
}
