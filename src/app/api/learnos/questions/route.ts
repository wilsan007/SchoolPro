import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { siteFilterForModel, siteIdForCreate } from "@/lib/site-scope";
import { parseStructure } from "@/lib/learnos/entrainement";
import { estAutoCorrigeable } from "@/lib/learnos/formats";

const PALIERS = ["RESTITUTION", "APPLICATION", "CONSOLIDATION", "TRANSFERT", "OUVERTURE"] as const;
const FORMATS = [
  "SAISIE_LIBRE",
  "SAISIE_COURTE",
  "CHOIX_UNIQUE",
  "ETAPES_GUIDEES",
  "REMISE_EN_ORDRE",
  "APPARIEMENT",
] as const;

/**
 * Banque de questions d'une compétence.
 *
 * Réservée aux adultes : la réponse contient les structures COMPLÈTES, avec les
 * réponses attendues. C'est voulu — un enseignant ne peut pas relire ce qu'il
 * ne voit pas — et c'est exactement pourquoi `entrainement:read` ne suffit pas
 * ici : ce droit-là est ouvert aux élèves.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "curriculum:write");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const competenceId = searchParams.get("competenceId");
  if (!competenceId) return erreurJson("DONNEES_INVALIDES");

  const questions = await prisma.question.findMany({
    where: {
      tenantId: session.user.tenantId,
      competenceId,
      ...siteFilterForModel("question", session.user),
    },
    select: {
      id: true,
      enonce: true,
      palier: true,
      format: true,
      structure: true,
      bareme: true,
      origine: true,
      relueLe: true,
      relueParId: true,
      actif: true,
      createdAt: true,
      // Une question déjà servie ne doit pas être modifiée à la légère : les
      // preuves produites l'ont été sur l'énoncé d'alors.
      _count: { select: { exercices: true } },
    },
    orderBy: [{ palier: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ questions });
}

const SchemaCreation = z.object({
  competenceId: z.string().min(1),
  enonce: z.string().min(1).max(2000),
  palier: z.enum(PALIERS),
  format: z.enum(FORMATS),
  bareme: z.number().positive().max(100).optional(),
  structure: z.unknown().optional(),
});

/**
 * Saisie manuelle d'une question.
 *
 * La structure est validée par le MÊME lecteur que celui qui la servira à
 * l'élève (`parseStructure`). Une seconde validation, plus permissive, laisserait
 * entrer des structures que la séance refuserait ensuite — et l'enseignant
 * découvrirait le problème par un élève bloqué.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "curriculum:write");
  if (denied) return denied;

  const parsed = SchemaCreation.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.flatten() });
  }
  const { competenceId, enonce, palier, format, bareme, structure } = parsed.data;

  const competence = await prisma.competence.findFirst({
    where: {
      id: competenceId,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("competence", session.user),
    },
    select: { id: true, siteId: true },
  });
  if (!competence) return erreurJson("COMPETENCE_INTROUVABLE");

  // `SAISIE_LIBRE` n'a pas de structure : elle sera relevée par un enseignant.
  let structureValidee = null;
  let baremeCalcule = bareme ?? 1;
  if (estAutoCorrigeable(format)) {
    const lue = parseStructure(structure);
    if (!lue) return erreurJson("STRUCTURE_INVALIDE");
    structureValidee = lue;
    baremeCalcule = bareme ?? lue.etapes.reduce((s, e) => s + e.points, 0);
  }

  const question = await prisma.question.create({
    data: {
      tenantId: session.user.tenantId,
      // Le site vient de la compétence, non de l'utilisateur : une question
      // appartient au périmètre de ce qu'elle enseigne.
      siteId: competence.siteId ?? siteIdForCreate(session.user),
      competenceId,
      enonce,
      palier,
      format,
      structure: (structureValidee ?? undefined) as Prisma.InputJsonValue | undefined,
      bareme: baremeCalcule,
      // Écrite à la main : elle n'a rien à relire, elle l'est d'origine.
      origine: "humain",
      actif: true,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: question.id }, { status: 201 });
}
