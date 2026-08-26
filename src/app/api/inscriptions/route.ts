import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { logInscription, statutSelonPieces, type DocumentsInscription } from "@/lib/inscriptions";

/**
 * GET — liste des dossiers d'inscription (Candidatures) pour le secrétariat.
 * Filtrable par dossierStatut. Inclut le créateur et le compte d'historique.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "admissions:read");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const dossierStatut = searchParams.get("dossierStatut");
  const annee = searchParams.get("annee");

  const siteFilter = siteFilterForModel("candidature", session.user);
  const dossiers = await prisma.candidature.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilter,
      ...(dossierStatut ? { dossierStatut: dossierStatut as never } : {}),
      ...(annee ? { annee } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      creePar: { select: { id: true, name: true } },
      validePar: { select: { id: true, name: true } },
      _count: { select: { historique: true } },
    },
  });

  return NextResponse.json({ dossiers });
}

const CreateSchema = z.object({
  nom: z.string().min(1),
  prenom: z.string().min(1),
  dateNaissance: z.string(),
  lieuNaissance: z.string().optional(),
  sexe: z.enum(["M", "F"]).default("M"),
  nationalite: z.string().optional(),
  classeVoulue: z.string().min(1),
  annee: z.string().min(1),
  parentNom: z.string().min(1),
  parentPrenom: z.string().min(1),
  parentEmail: z.string().email().optional().or(z.literal("")),
  parentPhone: z.string().min(1),
  parentLien: z.enum(["PERE", "MERE", "TUTEUR", "AUTRE"]).default("PERE"),
  documentsInscription: z.record(z.string(), z.any()).optional(),
});

/**
 * POST — crée un nouveau dossier d'inscription depuis le secrétariat.
 * Contrairement à /api/admissions (public), cette route est authentifiée
 * et trace le créateur + l'événement de création dans l'historique.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "admissions:write");
  if (denied) return denied;

  try {
    const body = await req.json();
    const data = CreateSchema.parse(body);

    const docs = (data.documentsInscription ?? {}) as DocumentsInscription;
    const dossierStatut = statutSelonPieces(Object.keys(docs).length > 0 ? docs : null);

    const candidature = await prisma.candidature.create({
      data: {
        tenantId: session.user.tenantId,
        siteId: session.user.siteId ?? null,
        nom: data.nom,
        prenom: data.prenom,
        dateNaissance: new Date(data.dateNaissance),
        lieuNaissance: data.lieuNaissance,
        sexe: data.sexe,
        nationalite: data.nationalite ?? "SN",
        classeVoulue: data.classeVoulue,
        annee: data.annee,
        parentNom: data.parentNom,
        parentPrenom: data.parentPrenom,
        parentEmail: data.parentEmail || null,
        parentPhone: data.parentPhone,
        parentLien: data.parentLien,
        documentsInscription: docs as never,
        dossierStatut,
        creeParId: session.user.id,
        statut: "SOUMISE",
      },
    });

    await logInscription(prisma, {
      tenantId: session.user.tenantId,
      candidatureId: candidature.id,
      type: "CREATION_DOSSIER",
      description: `Dossier d'inscription créé pour ${data.prenom} ${data.nom} (${data.classeVoulue}).`,
      auteurId: session.user.id,
      auteurNom: session.user.name,
      donnees: { dossierStatut },
    });

    return NextResponse.json({ dossier: candidature }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides", details: err.errors }, { status: 400 });
    }
    console.error("[POST /api/inscriptions]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
