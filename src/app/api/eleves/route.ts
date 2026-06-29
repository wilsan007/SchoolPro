import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { generateMatricule } from "@/lib/utils";
import { checkPermission } from "@/lib/rbac";

const EleveSchema = z.object({
  nom: z.string().min(1).max(100),
  prenom: z.string().min(1).max(100),
  dateNaissance: z.string().datetime(),
  lieuNaissance: z.string().optional(),
  nationalite: z.string().default("SN"),
  sexe: z.enum(["M", "F"]),
  classeId: z.string().cuid().optional(),
  regime: z.enum(["externe", "demi-pensionnaire", "interne"]).default("externe"),
  groupeSanguin: z.string().optional(),
  allergies: z.string().optional(),
});

// GET /api/eleves — liste des élèves du tenant
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "eleves:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const statut = searchParams.get("statut");
    const q = searchParams.get("q");

    const eleves = await prisma.eleve.findMany({
      where: {
        tenantId: session.user.tenantId,
        ...(classeId && { classeId }),
        ...(statut && { statut: statut as "ACTIF" }),
        ...(q && {
          OR: [
            { nom: { contains: q, mode: "insensitive" } },
            { prenom: { contains: q, mode: "insensitive" } },
            { matricule: { contains: q, mode: "insensitive" } },
          ],
        }),
      },
      include: {
        classe: { select: { nom: true, niveau: true } },
      },
      orderBy: [{ nom: "asc" }],
    });

    return NextResponse.json({ eleves });
  } catch (error) {
    console.error("[API/eleves GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/eleves — créer un élève
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "eleves:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = EleveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const tenantId = session.user.tenantId;

    // Générer le matricule
    const count = await prisma.eleve.count({ where: { tenantId } });
    const currentYear = new Date().getFullYear().toString();
    const annee = `${currentYear}-${(parseInt(currentYear) + 1)}`;
    const matricule = generateMatricule(annee, count + 1);

    const eleve = await prisma.eleve.create({
      data: {
        tenantId,
        ...parsed.data,
        dateNaissance: new Date(parsed.data.dateNaissance),
        matricule,
        anneeInscription: annee,
        statut: "ACTIF",
      },
      include: {
        classe: { select: { nom: true, niveau: true } },
      },
    });

    return NextResponse.json({ eleve }, { status: 201 });
  } catch (error) {
    console.error("[API/eleves POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
