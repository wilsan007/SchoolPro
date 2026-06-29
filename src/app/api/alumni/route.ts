import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";

const AlumniSchema = z.object({
  nom: z.string().min(1),
  prenom: z.string().min(1),
  email: z.string().email().optional().nullable(),
  telephone: z.string().optional().nullable(),
  sexe: z.enum(["M", "F"]).optional(),
  dateNaissance: z.string().optional().nullable(),
  anneeDiplome: z.string().min(1),
  classeDepart: z.string().min(1),
  mention: z.string().optional().nullable(),
  numeroDiplome: z.string().optional().nullable(),
  statut: z.enum(["ETUDES_SUPERIEURES", "EN_EMPLOI", "RECHERCHE_EMPLOI", "ENTREPRENEUR", "INCONNU"]).optional(),
  etablissement: z.string().optional().nullable(),
  formation: z.string().optional().nullable(),
  ville: z.string().optional().nullable(),
  pays: z.string().optional().nullable(),
  linkedin: z.string().optional().nullable(),
  accepteContact: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  eleveId: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "alumni:read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const statut = searchParams.get("statut");
  const annee = searchParams.get("annee");

  const alumni = await prisma.alumni.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(statut ? { statut: statut as any } : {}),
      ...(annee ? { anneeDiplome: annee } : {}),
      ...(search
        ? {
            OR: [
              { nom: { contains: search, mode: "insensitive" } },
              { prenom: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { etablissement: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ anneeDiplome: "desc" }, { nom: "asc" }],
  });

  // Statistiques
  const stats = {
    total: alumni.length,
    etudes: alumni.filter((a) => a.statut === "ETUDES_SUPERIEURES").length,
    emploi: alumni.filter((a) => a.statut === "EN_EMPLOI").length,
    entrepreneurs: alumni.filter((a) => a.statut === "ENTREPRENEUR").length,
    annees: [...new Set(alumni.map((a) => a.anneeDiplome))].sort().reverse(),
  };

  return NextResponse.json({ alumni, stats });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "alumni:write");
  if (denied) return denied;

  try {
    const json = await request.json();
    const data = AlumniSchema.parse(json);

    const alumni = await prisma.alumni.create({
      data: {
        ...data,
        tenantId: session.user.tenantId,
        dateNaissance: data.dateNaissance ? new Date(data.dateNaissance) : null,
      },
    });

    return NextResponse.json(alumni, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[Alumni POST] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
