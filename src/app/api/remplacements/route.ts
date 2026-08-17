import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import type { StatutRemplacement } from "@prisma/client";

// ------------------------------------------------------------
// Validation Zod
// ------------------------------------------------------------

const CreateSchema = z.object({
  classeId: z.string().min(1),
  matiereId: z.string().min(1),
  emploiTempsId: z.string().optional().nullable(),
  enseignantAbsentId: z.string().optional().nullable(),
  enseignantRemplacantId: z.string().optional().nullable(),
  date: z.string().datetime(),
  heureDebut: z.string().regex(/^\d{2}:\d{2}$/),
  heureFin: z.string().regex(/^\d{2}:\d{2}$/),
  salle: z.string().max(50).optional().nullable(),
  motifAbsence: z.string().max(255).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  siteId: z.string().optional().nullable(),
});

const PatchSchema = z.object({
  id: z.string().min(1),
  statut: z.enum(["VALIDE", "REFUSE", "EFFECTUE", "ANNULE"]),
  decideParId: z.string().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

// ------------------------------------------------------------
// GET — lister les remplacements (filtrage tenant + site + date)
// ------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "analytics:read");
    if (denied) return denied;

    const tenantId = session.user.tenantId;
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date"); // ISO yyyy-mm-dd

    // Filtre de date optionnel : borne du jour reçu.
    let dateFilter: Record<string, unknown> | undefined;
    if (dateParam) {
      const d = new Date(dateParam + "T00:00:00");
      if (!isNaN(d.getTime())) {
        const start = new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate()
        );
        const end = new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate() + 1
        );
        dateFilter = { gte: start, lt: end };
      }
    }

    const remplacements = await prisma.remplacementCours.findMany({
      where: {
        tenantId,
        ...(dateFilter ? { date: dateFilter } : {}),
        ...siteFilterForModel("remplacementCours", session.user),
      },
      include: {
        classe: { select: { nom: true } },
        matiere: { select: { nom: true } },
        enseignantAbsent: {
          include: { user: { select: { name: true } } },
        },
        enseignantRemplacant: {
          include: { user: { select: { name: true } } },
        },
      },
      orderBy: [{ date: "asc" }, { heureDebut: "asc" }],
    });

    return NextResponse.json(remplacements);
  } catch (error) {
    console.error("[API/remplacements GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ------------------------------------------------------------
// POST — créer un remplacement
// ------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "rh:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const tenantId = session.user.tenantId;
    const d = parsed.data;

    // Vérifier que la classe et la matière appartiennent au tenant.
    const [classe, matiere] = await Promise.all([
      prisma.classe.findFirst({ where: { id: d.classeId, tenantId, ...siteFilterForModel("classe", session.user) } }),
      prisma.matiere.findFirst({ where: { id: d.matiereId, tenantId, ...siteFilterForModel("matiere", session.user) } }),
    ]);
    if (!classe) {
      return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
    }
    if (!matiere) {
      return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
    }

    const remplacement = await prisma.remplacementCours.create({
      data: {
        tenantId,
        siteId: d.siteId ?? classe.siteId ?? null,
        emploiTempsId: d.emploiTempsId ?? null,
        classeId: d.classeId,
        matiereId: d.matiereId,
        enseignantAbsentId: d.enseignantAbsentId ?? null,
        enseignantRemplacantId: d.enseignantRemplacantId ?? null,
        date: new Date(d.date),
        heureDebut: d.heureDebut,
        heureFin: d.heureFin,
        salle: d.salle ?? null,
        statut: "PROPOSE" as StatutRemplacement,
        motifAbsence: d.motifAbsence ?? null,
        notes: d.notes ?? null,
      },
      include: {
        classe: { select: { nom: true } },
        matiere: { select: { nom: true } },
        enseignantAbsent: {
          include: { user: { select: { name: true } } },
        },
        enseignantRemplacant: {
          include: { user: { select: { name: true } } },
        },
      },
    });

    return NextResponse.json(remplacement, { status: 201 });
  } catch (error) {
    console.error("[API/remplacements POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ------------------------------------------------------------
// PATCH — mettre à jour le statut (PROPOSE → VALIDE / REFUSE / …)
// ------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "rh:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const tenantId = session.user.tenantId;
    const { id, statut, decideParId, notes } = parsed.data;

    // Vérifier l'appartenance au tenant avant toute modification.
    const existing = await prisma.remplacementCours.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Remplacement introuvable" },
        { status: 404 }
      );
    }

    // Un remplacement déjà effectué ou annulé ne doit plus changer.
    if (existing.statut === "EFFECTUE" || existing.statut === "ANNULE") {
      return NextResponse.json(
        { error: "Ce remplacement est clôturé et ne peut plus être modifié" },
        { status: 409 }
      );
    }

    const updated = await prisma.remplacementCours.update({
      where: { id },
      data: {
        statut: statut as StatutRemplacement,
        decideParId: decideParId ?? session.user.id,
        ...(notes !== undefined ? { notes } : {}),
      },
      include: {
        classe: { select: { nom: true } },
        matiere: { select: { nom: true } },
        enseignantAbsent: {
          include: { user: { select: { name: true } } },
        },
        enseignantRemplacant: {
          include: { user: { select: { name: true } } },
        },
      },
    });

    // --- Notification IN_APP au remplaçant quand le statut passe à VALIDE ---
    // Non-bloquante : un échec de notification ne doit pas faire échouer la
    // validation du remplacement.
    if (statut === "VALIDE" && existing.enseignantRemplacantId) {
      try {
        // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- existing vérifié avec tenantId ci-dessus
        const remplacant = await prisma.enseignant.findUnique({
          where: { id: existing.enseignantRemplacantId },
          select: { userId: true },
        });

        if (remplacant?.userId) {
          const dateStr = existing.date.toLocaleDateString("fr-FR");
          const classeNom = updated.classe?.nom ?? "—";
          const matiereNom = updated.matiere?.nom ?? "—";
          const salleStr = existing.salle ? ` (salle ${existing.salle})` : "";

          await prisma.notification.create({
            data: {
              tenantId,
              titre: "Remplacement assigné",
              contenu:
                `Vous êtes assigné(e) à un remplacement de ${matiereNom} en ${classeNom} ` +
                `le ${dateStr} de ${existing.heureDebut} à ${existing.heureFin}${salleStr}.`,
              canal: "IN_APP",
              cible: "ENSEIGNANTS",
              envoyeParId: session.user.id,
              nbDestinataires: 1,
              nbDelivres: 1,
              statut: "ENVOYEE",
              envoyeeAt: new Date(),
            },
          });
        }
      } catch (notifError) {
        console.error("[API/remplacements] Notification remplaçant échouée:", notifError);
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API/remplacements PATCH]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
