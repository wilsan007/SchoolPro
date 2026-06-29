import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";

const UpdateSchema = z.object({
  nom: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  categorie: z.enum(["INFORMATIQUE", "MOBILIER", "SPORTIF", "PEDAGOGIQUE", "AUDIOVISUEL", "ENTRETIEN", "SECURITE", "AUTRE"]).optional(),
  etat: z.enum(["NEUF", "BON", "USE", "ENDOMMAGE", "HORS_SERVICE"]).optional(),
  quantite: z.number().int().min(0).optional(),
  quantiteMin: z.number().int().min(0).optional(),
  localisation: z.string().optional().nullable(),
  fournisseur: z.string().optional().nullable(),
  prixUnitaire: z.number().optional().nullable(),
  dateRevision: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "inventaire:write");
  if (denied) return denied;

  const { id } = await params;

  try {
    const json = await request.json();
    const data = UpdateSchema.parse(json);

    const item = await prisma.itemInventaire.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...data,
        dateRevision: data.dateRevision ? new Date(data.dateRevision) : undefined,
      },
    });

    return NextResponse.json(item);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
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
  const denied = checkPermission(session.user.role, "inventaire:delete");
  if (denied) return denied;

  const { id } = await params;

  await prisma.itemInventaire.delete({
    where: { id, tenantId: session.user.tenantId },
  });

  return NextResponse.json({ ok: true });
}
