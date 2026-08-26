import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

const Schema = z.object({
  classeId: z.string().min(1),
  periodeId: z.string().min(1),
  decisions: z.array(
    z.object({
      eleveId: z.string().min(1),
      decision: z.enum(["PASSAGE", "REDOUBLEMENT", "FELICITATIONS", "ENCOURAGEMENTS", "AVERTISSEMENT"]).nullable(),
      appreciation: z.string().max(500).optional(),
    })
  ),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.issues }, { status: 400 });
    }

    const { periodeId, decisions } = parsed.data;
    const { classeId } = parsed.data;
    const tenantId = session.user.tenantId;

    // Vérifier que la classe existe et appartient au périmètre enseignant.
    const classe = await prisma.classe.findFirst({
      where: { id: classeId, tenantId, ...siteFilterForModel("classe", session.user) },
      select: { id: true },
    });
    if (!classe) {
      return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
    }
    if (isTeacherRole(session.user.role as Role)) {
      const anneeCourante = await getAnneeCouranteLibelle(tenantId);
      const scope = await getTeacherScope(tenantId, session.user.id as string, session.user.role as Role, anneeCourante);
      if (scope.isRestricted && !scope.classeIds.includes(classeId)) {
        return NextResponse.json({ error: "Classe hors de votre périmètre" }, { status: 403 });
      }
    }

    // Vérifier que la période existe pour ce tenant.
    const periode = await prisma.periode.findFirst({
      where: { id: periodeId, annee: { tenantId } },
      select: { id: true },
    });
    if (!periode) {
      return NextResponse.json({ error: "Période introuvable" }, { status: 404 });
    }

    // Vérifier que chaque élève visé appartient à la classe.
    const eleveIds = [...new Set(decisions.map((d) => d.eleveId))];
    const elevesValides = await prisma.eleve.findMany({
      where: { id: { in: eleveIds }, tenantId, ...siteFilterForModel("eleve", session.user), classeId },
      select: { id: true },
    });
    if (elevesValides.length !== eleveIds.length) {
      return NextResponse.json({ error: "Un ou plusieurs élèves ne sont pas dans cette classe" }, { status: 403 });
    }

    await Promise.all(
      decisions.map(({ eleveId, decision, appreciation }) =>
        prisma.bulletin.upsert({
          where: { eleveId_periodeId: { eleveId, periodeId } },
          update: {
            decision: decision ?? null,
            ...(appreciation !== undefined && { appreciation }),
          },
          create: {
            tenantId,
            eleveId,
            periodeId,
            decision: decision ?? null,
            appreciation: appreciation ?? null,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      message: `${decisions.length} décisions enregistrées`,
    });
  } catch (error) {
    console.error("[API/bulletins/conseil]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
