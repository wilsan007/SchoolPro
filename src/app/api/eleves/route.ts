import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { generateMatricule } from "@/lib/utils";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, siteIdForCreate, requireSiteIdForCreate } from "@/lib/site-scope";
import { revalidateTag, revalidatePath } from "next/cache";

const EleveSchema = z.object({
  nom: z.string().min(1).max(100),
  prenom: z.string().min(1).max(100),
  dateNaissance: z.string().datetime(),
  lieuNaissance: z.string().optional(),
  nationalite: z.string().default("SN"),
  sexe: z.enum(["M", "F"]),
  classeId: z.string().min(1).optional(),
  regime: z.enum(["externe", "demi-pensionnaire", "interne"]).default("externe"),
  groupeSanguin: z.string().optional(),
  allergies: z.string().optional(),
});

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const MAX_EXPORT_ROWS = 5000;

// GET /api/eleves — liste paginée des élèves du tenant.
// Passer ?export=true pour récupérer un lot complet (borné) destiné à l'export CSV,
// sans pagination.
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "eleves:read");
    if (denied) return denied;
    const siteFilter = siteFilterForModel("eleve", session.user);

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const statut = searchParams.get("statut");
    const q = searchParams.get("q");
    const isExport = searchParams.get("export") === "true";


    const where = {
      tenantId: session.user.tenantId,
      ...siteFilter,
      deletedAt: null, // Exclure les élèves supprimés (soft delete)
      ...(classeId && { classeId }),
      ...(statut && { statut: statut as "ACTIF" }),
      ...(q && {
        OR: [
          { nom: { contains: q, mode: "insensitive" as const } },
          { prenom: { contains: q, mode: "insensitive" as const } },
          { matricule: { contains: q, mode: "insensitive" as const } },
        ],
      }),
    };

    const include = {
      classe: { select: { nom: true, niveau: true } },
      parents: {
        include: { parent: { select: { nom: true, prenom: true, phone: true } } },
        where: { isGardien: true },
        take: 1,
      },
    };

    if (isExport) {
      const eleves = await prisma.eleve.findMany({
        where,
        include,
        orderBy: [{ classe: { nom: "asc" } }, { prenom: "asc" }],
        take: MAX_EXPORT_ROWS,
      });
      return NextResponse.json({ eleves });
    }

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE));

    const [eleves, total] = await Promise.all([
      prisma.eleve.findMany({
        where,
        include,
        orderBy: [{ prenom: "asc" }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      prisma.eleve.count({ where }),
    ]);

    return NextResponse.json({ eleves, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
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

    const siteError = requireSiteIdForCreate(session.user);
    if (siteError) return NextResponse.json({ error: siteError }, { status: 400 });

    const body = await req.json();
    const parsed = EleveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const tenantId = session.user.tenantId;
    const siteFilter = siteFilterForModel("eleve", session.user);
    // Colonne `siteId` à inscrire sur l'élève créé. `siteFilter` décrit un
    // prédicat (`AND` / `OR`) et n'a rien à faire dans un `data` de création :
    // l'étaler produisait soit une erreur Prisma, soit un élève sans site donc
    // visible depuis tous les sites du tenant.
    // La classe cible doit appartenir au tenant ET au périmètre de sites de
    // l'utilisateur : sans cette vérification, on pouvait rattacher un élève à
    // une classe d'un autre site.
    let resolvedSiteId = siteIdForCreate(session.user);
    if (parsed.data.classeId) {
      const classe = await prisma.classe.findFirst({
        where: { id: parsed.data.classeId, tenantId, ...siteFilter },
        select: { id: true, siteId: true },
      });
      if (!classe) {
        return NextResponse.json({ error: "Classe introuvable ou hors de votre périmètre" }, { status: 403 });
      }
      resolvedSiteId = classe.siteId;
    }

    // Générer le matricule
    const count = await prisma.eleve.count({ where: { tenantId, ...siteFilter } });
    const currentYear = new Date().getFullYear().toString();
    const annee = `${currentYear}-${(parseInt(currentYear) + 1)}`;
    const matricule = generateMatricule(annee, count + 1);

    const eleve = await prisma.eleve.create({
      data: { tenantId, siteId: resolvedSiteId, ...parsed.data,
        dateNaissance: new Date(parsed.data.dateNaissance),
        matricule,
        anneeInscription: annee,
        statut: "ACTIF",
      },
      include: {
        classe: { select: { nom: true, niveau: true } },
      },
    });

    revalidateTag("eleves-stats");
    // Les effectifs par classe affichés dans Paramètres → Pédagogie.
    revalidatePath("/parametres");
    revalidatePath("/eleves");
    revalidateTag("dashboard-data");

    return NextResponse.json({ eleve }, { status: 201 });
  } catch (error) {
    console.error("[API/eleves POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
