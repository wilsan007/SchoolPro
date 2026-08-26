import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, requireSiteIdForCreate, isRelationScopedRole } from "@/lib/site-scope";
import type { Jour } from "@prisma/client";

const IndispoSchema = z.object({
  enseignantId: z.string().min(1),
  jour: z.enum(["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"]),
  heureDebut: z.string().regex(/^\d{2}:\d{2}$/),
  heureFin: z.string().regex(/^\d{2}:\d{2}$/),
  source: z.enum(["SAISIE_MANUELLE", "IMPORT_EXTERNE", "CONGE", "FORMATION"]).default("SAISIE_MANUELLE"),
  sourceLibelle: z.string().optional(),
  periodeId: z.string().optional(),
  anneeLibelle: z.string().optional(),
});

/**
 * GET /api/indisponibilites?enseignantId=...
 *
 * Liste les indisponibilités d'un enseignant (ou toutes si pas de filtre).
 * Filtré par tenant + site.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:read");
    if (denied) return denied;
    if (isRelationScopedRole(session.user.role)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const enseignantId = searchParams.get("enseignantId");
    const tenantId = session.user.tenantId;

    const indispos = await prisma.indisponibiliteEnseignant.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("indisponibiliteEnseignant", session.user),
        ...(enseignantId ? { enseignantId } : {}),
      },
      include: {
        enseignant: { include: { user: { select: { name: true } } } },
        periode: { select: { nom: true, numero: true } },
      },
      orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
    });
    return NextResponse.json(indispos);
  } catch (error) {
    console.error("[API/indisponibilites GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * POST /api/indisponibilites
 *
 * Crée une indisponibilité manuelle pour un enseignant.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:write");
    if (denied) return denied;

    const siteError = requireSiteIdForCreate(session.user);
    if (siteError) return NextResponse.json({ error: siteError }, { status: 400 });

    const body = await req.json();
    const parsed = IndispoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.issues }, { status: 400 });
    }

    const siteId = (session.user as { siteId?: string | null }).siteId ?? null;

    const indispo = await prisma.indisponibiliteEnseignant.create({
      data: {
        tenantId: session.user.tenantId,
        siteId,
        enseignantId: parsed.data.enseignantId,
        jour: parsed.data.jour as Jour,
        heureDebut: parsed.data.heureDebut,
        heureFin: parsed.data.heureFin,
        source: parsed.data.source,
        sourceLibelle: parsed.data.sourceLibelle ?? null,
        periodeId: parsed.data.periodeId ?? null,
        anneeLibelle: parsed.data.anneeLibelle ?? null,
      },
    });
    return NextResponse.json(indispo, { status: 201 });
  } catch (error) {
    console.error("[API/indisponibilites POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
