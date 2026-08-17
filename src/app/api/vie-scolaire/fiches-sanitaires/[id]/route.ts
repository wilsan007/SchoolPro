import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const UpdateSchema = z.object({
  allergies: z.array(z.string()).optional(),
  traitements: z.any().optional().nullable(),
  contreIndicationsSport: z.boolean().optional(),
  contactsUrgence: z.any().optional().nullable(),
  protocoleUrgence: z.string().optional().nullable(),
  vaccinations: z.any().optional().nullable(),
  remarques: z.string().optional().nullable(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "vie-scolaire:read");
  if (denied) return denied;

  const { id } = await params;
  const fiche = await prisma.ficheSanitaire.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      eleve: { select: { nom: true, prenom: true, classe: { select: { nom: true } } } },
    },
  });
  if (!fiche) {
    return NextResponse.json({ error: "Fiche sanitaire introuvable" }, { status: 404 });
  }
  return NextResponse.json(fiche);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "vie-scolaire:write");
  if (denied) return denied;

  try {
    const { id } = await params;
    const json = await request.json();
    const data = UpdateSchema.parse(json);

    const existing = await prisma.ficheSanitaire.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true, eleveId: true, contreIndicationsSport: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Fiche sanitaire introuvable" }, { status: 404 });
    }

    const fiche = await prisma.ficheSanitaire.update({
      where: { id },
      data: {
        ...(data.allergies !== undefined && { allergies: data.allergies }),
        ...(data.traitements !== undefined && { traitements: data.traitements }),
        ...(data.contreIndicationsSport !== undefined && {
          contreIndicationsSport: data.contreIndicationsSport,
        }),
        ...(data.contactsUrgence !== undefined && { contactsUrgence: data.contactsUrgence }),
        ...(data.protocoleUrgence !== undefined && { protocoleUrgence: data.protocoleUrgence }),
        ...(data.vaccinations !== undefined && { vaccinations: data.vaccinations }),
        ...(data.remarques !== undefined && { remarques: data.remarques }),
      },
    });

    // Gérer la dispense EPS automatique.
    if (data.contreIndicationsSport !== undefined) {
      const matiereEPS = await prisma.matiere.findFirst({
        where: {
          tenantId: session.user.tenantId,
          ...siteFilterForModel("matiere", session.user),
          OR: [
            { nom: { contains: "EPS", mode: "insensitive" } },
            { nom: { contains: "Sport", mode: "insensitive" } },
            { nom: { contains: "Éducation physique", mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });

      if (matiereEPS) {
        if (data.contreIndicationsSport && !existing.contreIndicationsSport) {
          // Créer la dispense si elle n'existe pas déjà.
          try {
            await prisma.dispenseMatiere.create({
              data: {
                tenantId: session.user.tenantId,
                eleveId: existing.eleveId,
                matiereId: matiereEPS.id,
                motif: "Contre-indication médicale (fiche sanitaire)",
              },
            });
          } catch {
            // La dispense existe probablement déjà.
          }
        } else if (!data.contreIndicationsSport && existing.contreIndicationsSport) {
          // Supprimer la dispense si elle existe.
          await prisma.dispenseMatiere.deleteMany({
            where: {
              tenantId: session.user.tenantId,
              eleveId: existing.eleveId,
              matiereId: matiereEPS.id,
              motif: { contains: "Contre-indication médicale" },
            },
          });
        }
      }
    }

    return NextResponse.json(fiche);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[FicheSanitaire PATCH] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "vie-scolaire:write");
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.ficheSanitaire.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Fiche sanitaire introuvable" }, { status: 404 });
  }

  await prisma.ficheSanitaire.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
