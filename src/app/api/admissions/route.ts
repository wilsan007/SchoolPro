import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, requireSiteIdForCreate } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

const CandidatureSchema = z.object({
  nom: z.string().min(1),
  prenom: z.string().min(1),
  dateNaissance: z.string(),
  lieuNaissance: z.string().optional(),
  sexe: z.enum(["M", "F"]).default("M"),
  nationalite: z.string().optional(),
  classeVoulue: z.string().optional(),
  classeId: z.string().optional(),
  annee: z.string().min(1),
  parentNom: z.string().min(1),
  parentPrenom: z.string().min(1),
  parentEmail: z.string().email().optional().or(z.literal("")),
  parentPhone: z.string().min(1),
  parentLien: z.enum(["PERE", "MERE", "TUTEUR", "AUTRE"]).default("PERE"),
  commentaire: z.string().optional(),
  documents: z.array(z.object({ nom: z.string(), url: z.string() })).optional(),
});

// GET — liste des candidatures (admin seulement)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "admissions:read");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const statut = searchParams.get("statut");
  const annee = searchParams.get("annee");


  const siteFilter = siteFilterForModel("candidature", session.user);
  const candidatures = await prisma.candidature.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilter,
      ...(statut ? { statut: statut as never } : {}),
      ...(annee ? { annee } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ candidatures });
}

// POST — soumettre une candidature (public, pas d'auth requise)
export async function POST(req: NextRequest) {
  try {
    // ── Rate limiting : 5 candidatures / 5 min par IP ──
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? req.headers.get("x-real-ip")
      ?? "unknown";
    const cinqMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- rate limiting global par IP
    const recentCount = await prisma.candidature.count({
      where: { createdAt: { gte: cinqMinAgo } },
    });
    // On utilise une heuristique simple : si plus de 50 candidatures en 5 min
    // globalement, on bloque (évite le spam massif). Le rate limiting par IP
    // précis nécessiterait un middleware Edge ou Redis.
    if (recentCount > 50) {
      return NextResponse.json(
        { error: "Trop de candidatures récentes. Veuillez réessayer dans quelques minutes." },
        { status: 429 }
      );
    }

    // Identifier le tenant via le subdomain ou header
    const host = req.headers.get("host") ?? "";
    const slug = host.split(".")[0];

    let tenantId: string | null = null;

    // Si appelé depuis le dashboard (session active)
    const session = await auth();
    if (session?.user?.tenantId) {
      tenantId = session.user.tenantId;

      // Bloquer la création si l'admin a "Tous les sites" sélectionné
      // → la candidature serait orpheline (siteId null)
      const siteError = requireSiteIdForCreate(session.user);
      if (siteError) {
        return NextResponse.json({ error: siteError }, { status: 400 });
      }
    } else {
      // Appel public : résoudre le tenant via le slug
      const tenant = await prisma.tenant.findUnique({ where: { slug } });
      if (!tenant) {
        return NextResponse.json({ error: "École introuvable" }, { status: 404 });
      }
      tenantId = tenant.id;
    }

    const body = await req.json();
    const data = CandidatureSchema.parse(body);

    // Année par défaut si non précisée
    const annee = data.annee || new Date().getFullYear() + "-" + (new Date().getFullYear() + 1);

    // ── Résolution classeId → classeVoulue (nom) + siteId ──
    let classeVoulue = data.classeVoulue ?? "";
    let siteId: string | undefined;

    if (data.classeId && session?.user) {
      const anneeCourante = await getAnneeCouranteLibelle(tenantId!);
      // Résoudre la classe dans le périmètre de l'utilisateur
      const classe = await prisma.classe.findFirst({
        where: {
          id: data.classeId,
          tenantId,
          ...siteFilterForModel("classe", session.user),
          ...(anneeCourante ? { annee: anneeCourante } : {}),
        },
        select: { nom: true, siteId: true },
      });

      if (!classe) {
        return NextResponse.json(
          { error: "Classe introuvable ou hors de votre périmètre" },
          { status: 400 }
        );
      }

      classeVoulue = classe.nom;
      siteId = classe.siteId ?? undefined;
    } else if (data.classeId && tenantId) {
      const anneeCourante = await getAnneeCouranteLibelle(tenantId);
      // Appel public avec classeId : résoudre sans filtre de site
      // eslint-disable-next-line ecolpro/require-site-filter -- appel public, pas de session utilisateur
      const classe = await prisma.classe.findFirst({
        where: { id: data.classeId, tenantId, ...(anneeCourante ? { annee: anneeCourante } : {}) },
        select: { nom: true, siteId: true },
      });

      if (!classe) {
        return NextResponse.json(
          { error: "Classe introuvable" },
          { status: 400 }
        );
      }

      classeVoulue = classe.nom;
      siteId = classe.siteId ?? undefined;
    }

    if (!classeVoulue) {
      return NextResponse.json(
        { error: "La classe souhaitée est requise" },
        { status: 400 }
      );
    }

    const candidature = await prisma.candidature.create({
      data: {
        tenantId,
        siteId,
        nom: data.nom,
        prenom: data.prenom,
        dateNaissance: new Date(data.dateNaissance),
        lieuNaissance: data.lieuNaissance,
        sexe: data.sexe,
        nationalite: data.nationalite ?? "SN",
        classeVoulue,
        annee,
        parentNom: data.parentNom,
        parentPrenom: data.parentPrenom,
        parentEmail: data.parentEmail || null,
        parentPhone: data.parentPhone,
        parentLien: data.parentLien,
        commentaire: data.commentaire,
        documents: data.documents ?? [],
        ...(session?.user?.id ? { creeParId: session.user.id } : {}),
      },
    });

    return NextResponse.json({ candidature }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides", details: err.errors }, { status: 400 });
    }
    console.error("[POST /api/admissions]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
