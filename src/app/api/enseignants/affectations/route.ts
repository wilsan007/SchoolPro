import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { auditFire } from "@/lib/audit";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/**
 * GET /api/enseignants/affectations
 *
 * Liste toutes les affectations enseignant → classe → matière du tenant.
 * AffectationEnseignant n'a pas de siteId direct : le filtrage par site
 * se fait via les relations classe/enseignant/matiere si nécessaire.
 * Ici on reste tenant-scoped car les affectations sont visibles depuis
 * tous les sites du tenant par la direction.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const denied = checkPermission(session.user.role, "parametres:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  const affectations = await prisma.affectationEnseignant.findMany({
    where: {
      tenantId,
      ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
    },
    include: {
      enseignant: {
        select: {
          id: true,
          user: { select: { id: true, name: true } },
        },
      },
      classe: { select: { id: true, nom: true, niveau: true } },
      matiere: { select: { id: true, nom: true, code: true } },
    },
    orderBy: [{ enseignant: { user: { name: "asc" } } }],
  });

  return NextResponse.json(affectations);
}

/**
 * POST /api/enseignants/affectations
 *
 * Crée une affectation enseignant → classe → matière.
 * Idempotent grâce à la contrainte @@unique([enseignantId, classeId, matiereId]).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const denied = checkPermission(session.user.role, "parametres:write");
  if (denied) return denied;

  const tenantId = session.user.tenantId;

  const BodySchema = z.object({
    enseignantId: z.string().min(1),
    classeId: z.string().min(1),
    matiereId: z.string().min(1),
  });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { enseignantId, classeId, matiereId } = parsed.data;

  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  // Vérifier que l'enseignant, la classe et la matière appartiennent au tenant.
  // Pas de filtre site ici : on valide l'appartenance tenant uniquement,
  // car l'affectation peut relier un enseignant multi-sites à une classe
  // d'un site spécifique.
  const [enseignant, classe, matiere] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-site-filter -- validation tenant-only
    prisma.enseignant.findFirst({
      where: { id: enseignantId, tenantId },
      select: { id: true },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter -- validation tenant-only
    prisma.classe.findFirst({
      where: {
        id: classeId,
        tenantId,
        ...(anneeCourante ? { annee: anneeCourante } : {}),
      },
      select: { id: true },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter -- validation tenant-only
    prisma.matiere.findFirst({
      where: { id: matiereId, tenantId },
      select: { id: true },
    }),
  ]);

  if (!enseignant || !classe || !matiere) {
    return NextResponse.json(
      { error: "Enseignant, classe ou matière introuvable" },
      { status: 404 },
    );
  }

  try {
    const affectation = await prisma.affectationEnseignant.create({
      data: {
        tenantId,
        enseignantId,
        classeId,
        matiereId,
      },
      include: {
        enseignant: { select: { user: { select: { name: true } } } },
        classe: { select: { nom: true } },
        matiere: { select: { nom: true } },
      },
    });

    void auditFire({
      action: "parametres.affectation-enseignant.create",
      verdict: "ALLOWED",
      tenantId,
      userId: session.user.id,
      metadata: { affectationId: affectation.id, enseignantId, classeId, matiereId },
    });

    return NextResponse.json(affectation, { status: 201 });
  } catch (error: unknown) {
    // Contrainte unique → l'affectation existe déjà
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Cette affectation existe déjà" },
        { status: 409 },
      );
    }
    throw error;
  }
}

/**
 * DELETE /api/enseignants/affectations?id=xxx
 *
 * Supprime une affectation.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const denied = checkPermission(session.user.role, "parametres:write");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID requis" }, { status: 400 });
  }

  const existing = await prisma.affectationEnseignant.findFirst({
    where: {
      id,
      tenantId,
      ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Affectation introuvable" }, { status: 404 });
  }

  await prisma.affectationEnseignant.delete({ where: { id } });

  void auditFire({
    action: "parametres.affectation-enseignant.delete",
    verdict: "ALLOWED",
    tenantId,
    userId: session.user.id,
    metadata: { affectationId: id },
  });

  return NextResponse.json({ success: true });
}
