import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";

const ItemSchema = z.object({
  nom: z.string().min(1),
  description: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  categorie: z.enum(["INFORMATIQUE", "MOBILIER", "SPORTIF", "PEDAGOGIQUE", "AUDIOVISUEL", "ENTRETIEN", "SECURITE", "AUTRE"]).optional(),
  etat: z.enum(["NEUF", "BON", "USE", "ENDOMMAGE", "HORS_SERVICE"]).optional(),
  quantite: z.number().int().min(0).optional(),
  quantiteMin: z.number().int().min(0).optional(),
  localisation: z.string().optional().nullable(),
  fournisseur: z.string().optional().nullable(),
  prixUnitaire: z.number().optional().nullable(),
  devise: z.string().optional(),
  dateAchat: z.string().optional().nullable(),
  dateGarantie: z.string().optional().nullable(),
  dateRevision: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "inventaire:read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const categorie = searchParams.get("categorie");
  const etat = searchParams.get("etat");
  const alerte = searchParams.get("alerte") === "true"; // items en rupture

  const items = await prisma.itemInventaire.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(categorie ? { categorie: categorie as any } : {}),
      ...(etat ? { etat: etat as any } : {}),
      ...(alerte
        ? {
            // quantite <= quantiteMin
            quantite: { lte: prisma.itemInventaire.fields.quantiteMin as any },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { nom: { contains: search, mode: "insensitive" } },
              { reference: { contains: search, mode: "insensitive" } },
              { localisation: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ categorie: "asc" }, { nom: "asc" }],
  });

  // Filtrer les alertes côté serveur (Prisma ne supporte pas colonne vs colonne directement)
  const itemsFiltres = alerte
    ? items.filter((i) => i.quantite <= i.quantiteMin)
    : items;

  const stats = {
    total: items.length,
    valeurTotale: items.reduce((sum, i) => sum + (i.prixUnitaire ?? 0) * i.quantite, 0),
    alertes: items.filter((i) => i.quantite <= i.quantiteMin).length,
    horsService: items.filter((i) => i.etat === "HORS_SERVICE").length,
    parCategorie: Object.fromEntries(
      ["INFORMATIQUE", "MOBILIER", "SPORTIF", "PEDAGOGIQUE", "AUDIOVISUEL", "ENTRETIEN", "SECURITE", "AUTRE"].map(
        (cat) => [cat, items.filter((i) => i.categorie === cat).length]
      )
    ),
  };

  return NextResponse.json({ items: itemsFiltres, stats });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "inventaire:write");
  if (denied) return denied;

  try {
    const json = await request.json();
    const data = ItemSchema.parse(json);

    const item = await prisma.itemInventaire.create({
      data: {
        ...data,
        tenantId: session.user.tenantId,
        dateAchat: data.dateAchat ? new Date(data.dateAchat) : null,
        dateGarantie: data.dateGarantie ? new Date(data.dateGarantie) : null,
        dateRevision: data.dateRevision ? new Date(data.dateRevision) : null,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[Inventaire POST] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
