import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";

const AppelSchema = z.object({
  classeId: z.string().cuid(),
  date: z.string().datetime(),
  presences: z.record(z.string(), z.enum(["present", "absent", "retard"])),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "absences:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = AppelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const { classeId, date, presences } = parsed.data;
    const tenantId = session.user.tenantId;
    const appelDate = new Date(date);

    // Vérifier que la classe appartient au tenant
    const classe = await prisma.classe.findFirst({
      where: { id: classeId, tenantId },
    });
    if (!classe) {
      return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
    }

    // Créer les absences pour les absents et retards
    const operations = Object.entries(presences)
      .filter(([, status]) => status !== "present")
      .map(([eleveId, status]) =>
        prisma.absence.upsert({
          where: {
            // Pas d'unique constraint sur eleveId+date, donc on cherche d'abord
            id: `appel-${classeId}-${eleveId}-${appelDate.toISOString().split("T")[0]}`,
          },
          update: {
            motif: "INJUSTIFIE",
            statut: "EN_ATTENTE",
            isRetard: status === "retard",
          },
          create: {
            id: `appel-${classeId}-${eleveId}-${appelDate.toISOString().split("T")[0]}`,
            tenantId,
            eleveId,
            date: appelDate,
            motif: "INJUSTIFIE",
            statut: "EN_ATTENTE",
            isRetard: status === "retard",
            saisieParId: session.user.id,
          },
        })
      );

    await prisma.$transaction(operations);

    // Compter les absents
    const absentsCount = Object.values(presences).filter((p) => p === "absent").length;
    const retardsCount = Object.values(presences).filter((p) => p === "retard").length;

    return NextResponse.json({
      success: true,
      message: `Appel enregistré : ${absentsCount} absent(s), ${retardsCount} retard(s)`,
    });
  } catch (error) {
    console.error("[API/appel]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
