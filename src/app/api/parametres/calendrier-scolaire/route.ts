import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";

/**
 * Calendrier scolaire — vacances, examens, jours fériés.
 *
 * Défini par le chef d'établissement (PRINCIPAL) ou l'administrateur du
 * tenant (TENANT_ADMIN). La planification annuelle s'en sert pour ne pas
 * répartir de chapitres sur des semaines sans cours.
 */

const TYPES = ["VACANCE_SCOLAIRE", "EXAMEN", "JOUR_FERIE", "AUTRE"] as const;

const QuerySchema = z.object({
  anneeId: z.string().min(1),
});

const CreerSchema = z.object({
  anneeId: z.string().min(1),
  type: z.enum(TYPES),
  libelle: z.string().min(1).max(200),
  dateDebut: z.string().min(1),
  dateFin: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "parametres:read");
  if (denied) return denied;

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, {
      details: parsed.error.issues,
    });
  }

  const { anneeId } = parsed.data;

  // Vérifier que l'année appartient au tenant de l'appelant.
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!annee) return erreurJson("ANNEE_INTROUVABLE");

  const evenements = await prisma.evenementCalendaire.findMany({
    where: { anneeId },
    orderBy: { dateDebut: "asc" },
  });

  return NextResponse.json({ evenements });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "parametres:write");
  if (denied) return denied;

  const parsed = CreerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
  }

  const { anneeId, type, libelle, dateDebut, dateFin } = parsed.data;
  const debut = new Date(dateDebut);
  const fin = new Date(dateFin);

  if (fin < debut) return erreurJson("SEMAINES_INVERSEES");

  // L'année doit appartenir au tenant : sans ce contrôle, un utilisateur
  // pourrait créer des événements sur l'année d'un autre tenant.
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!annee) return erreurJson("ANNEE_INTROUVABLE");

  const evenement = await prisma.evenementCalendaire.create({
    data: { anneeId, type, libelle, dateDebut: debut, dateFin: fin },
  });

  return NextResponse.json(evenement);
}
