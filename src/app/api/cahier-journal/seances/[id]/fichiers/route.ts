import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { siteFilterForModel } from "@/lib/site-scope";
import { auditFire } from "@/lib/audit";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
const MAX_FICHIERS = 5;
const TYPES_AUTORISES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

const UploadSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1),
  size: z.number().int().positive(),
  data: z.string().min(1),
});

const DeleteSchema = z.object({
  index: z.number().int().min(0),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "cahier-journal:write");
    if (denied) return denied;

    const { id } = await params;
    const seance = await prisma.seancePedagogique.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        ...siteFilterForModel("seancePedagogique", session.user),
      },
      select: { id: true, fichiers: true },
    });
    if (!seance) return erreurJson("SEANCE_INTROUVABLE");

    const body = await req.json();
    const parsed = UploadSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    const { name, type, size, data } = parsed.data;

    if (size > MAX_SIZE) return erreurJson("FICHIER_TROP_VOLUMINEUX", { limiteMo: 10 });
    if (!TYPES_AUTORISES.includes(type)) return erreurJson("DONNEES_INVALIDES");

    const fichiersActuels = (seance.fichiers as unknown[] | null) ?? [];
    if (fichiersActuels.length >= MAX_FICHIERS) {
      return erreurJson("DONNEES_INVALIDES");
    }

    const nouveauFichier = { name, type, size, data };
    const fichiersMisAJour = [...fichiersActuels, nouveauFichier];

    await prisma.seancePedagogique.update({
      where: { id },
      data: { fichiers: fichiersMisAJour as unknown as Prisma.InputJsonValue },
    });

    auditFire({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "cahier-journal:fichier-ajout",
      verdict: "ALLOWED",
      resource: "seancePedagogique",
      resourceId: id,
      metadata: { fileName: name, fileSize: size },
    });

    return NextResponse.json({ fichiers: fichiersMisAJour });
  } catch (error) {
    console.error("[API/cahier-journal/seances/:id/fichiers POST]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "cahier-journal:write");
    if (denied) return denied;

    const { id } = await params;
    const seance = await prisma.seancePedagogique.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        ...siteFilterForModel("seancePedagogique", session.user),
      },
      select: { id: true, fichiers: true },
    });
    if (!seance) return erreurJson("SEANCE_INTROUVABLE");

    const body = await req.json();
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    const { index } = parsed.data;
    const fichiersActuels = (seance.fichiers as unknown[] | null) ?? [];
    if (index >= fichiersActuels.length) return erreurJson("DONNEES_INVALIDES");

    const fichiersMisAJour = fichiersActuels.filter((_, i) => i !== index);

    await prisma.seancePedagogique.update({
      where: { id },
      data: { fichiers: fichiersMisAJour as unknown as Prisma.InputJsonValue },
    });

    auditFire({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "cahier-journal:fichier-suppression",
      verdict: "ALLOWED",
      resource: "seancePedagogique",
      resourceId: id,
      metadata: { index },
    });

    return NextResponse.json({ fichiers: fichiersMisAJour });
  } catch (error) {
    console.error("[API/cahier-journal/seances/:id/fichiers DELETE]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
