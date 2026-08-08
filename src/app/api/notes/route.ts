import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, eleveScopeFilter, mergeFilters } from "@/lib/site-scope";

const NoteSchema = z.object({
  eleveId: z.string().min(1),
  classeId: z.string().min(1),
  matiereId: z.string().min(1),
  periodeId: z.string().min(1).optional(),
  type: z.enum(["CONTROLE", "DEVOIR", "EXAMEN", "INTERROGATION", "PROJET", "ORAL", "TP"]),
  intitule: z.string().optional(),
  valeur: z.number().min(0).max(100),
  noteMax: z.number().min(1).max(100).default(20),
  coefficient: z.number().min(0.5).max(10).default(1),
  date: z.string().datetime(),
  appreciation: z.string().optional(),
});

const BulkNoteSchema = z.object({
  notes: z.array(NoteSchema),
  isPubliee: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "notes:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const matiereId = searchParams.get("matiereId");
    const periodeId = searchParams.get("periodeId");
    const eleveId = searchParams.get("eleveId");

    // Bornes de sécurité : sans filtre (classe/matière/période/élève), la table peut
    // contenir des centaines de milliers de lignes pour un gros tenant.
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(searchParams.get("pageSize")) || 200));

    const siteId = (session.user as { siteId?: string | null }).siteId ?? null;
    // Isolation par site ET périmètre personnel : un PARENT / STUDENT ne voit
    // que ses propres élèves. Sans cela, le rôle PARENT dispose de `notes:read`
    // et lisait donc les notes de tous les élèves du tenant.
    const scopeFilter = eleveScopeFilter(session.user, "eleve");

    const where = mergeFilters(
      {
        tenantId: session.user.tenantId,
        ...(classeId && { classeId }),
        ...(matiereId && { matiereId }),
        ...(periodeId && { periodeId }),
        ...(eleveId && { eleveId }),
      },
      scopeFilter
    );

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where,
        include: {
          eleve: { select: { nom: true, prenom: true, matricule: true } },
          matiere: { select: { nom: true, code: true, couleur: true } },
          periode: { select: { nom: true, numero: true } },
        },
        orderBy: [{ date: "desc" }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      prisma.note.count({ where }),
    ]);

    return NextResponse.json({ notes, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (error) {
    console.error("[API/notes GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "notes:write");
    if (denied) return denied;
    const eleveFilter = siteFilterForModel("eleve", session.user);

    const body = await req.json();
    const parsed = BulkNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const tenantId = session.user.tenantId;
    // Filtre de site appliqué directement sur `Eleve` (qui porte `siteId`),
    // utilisé pour valider le périmètre des élèves visés par la saisie.
    const { notes, isPubliee } = parsed.data;

    // Garde-fou : refuse la saisie sur une période clôturée ou dont la date limite est dépassée.
    const periodeIds = [...new Set(notes.map((n) => n.periodeId).filter((id): id is string => !!id))];
    if (periodeIds.length > 0) {
      const periodes = await prisma.periode.findMany({
        where: { id: { in: periodeIds }, annee: { tenantId } },
        select: { id: true, nom: true, statut: true, dateLimiteSaisie: true },
      });
      const now = new Date();
      const bloquee = periodes.find(
        (p) => p.statut === "CLOTUREE" || (p.dateLimiteSaisie && p.dateLimiteSaisie < now)
      );
      if (bloquee) {
        return NextResponse.json(
          {
            error:
              bloquee.statut === "CLOTUREE"
                ? `La période « ${bloquee.nom} » est clôturée. La saisie des notes est verrouillée.`
                : `La date limite de saisie de la période « ${bloquee.nom} » est dépassée.`,
          },
          { status: 403 }
        );
      }
    }

    // Vérifier que TOUS les élèves visés appartiennent au tenant ET au
    // périmètre de sites de l'utilisateur. Sans ce contrôle, `eleveId` n'était
    // pas vérifié du tout : on pouvait saisir des notes sur un élève d'un autre
    // site, voire d'un autre établissement.
    const eleveIds = [...new Set(notes.map((n) => n.eleveId).filter(Boolean))];
    if (eleveIds.length > 0) {
      const autorises = await prisma.eleve.findMany({
        where: { id: { in: eleveIds }, tenantId, ...eleveFilter },
        select: { id: true },
      });
      if (autorises.length !== eleveIds.length) {
        return NextResponse.json(
          { error: "Un ou plusieurs élèves sont introuvables ou hors de votre périmètre" },
          { status: 403 }
        );
      }
    }

    // Idem pour les matières visées.
    const matiereIds = [...new Set(notes.map((n) => n.matiereId).filter(Boolean))];
    if (matiereIds.length > 0) {
      const matieres = await prisma.matiere.count({
        where: { id: { in: matiereIds as string[] }, tenantId },
      });
      if (matieres !== matiereIds.length) {
        return NextResponse.json(
          { error: "Une ou plusieurs matières sont introuvables" },
          { status: 403 }
        );
      }
    }

    const created = await prisma.$transaction(
      notes.map((note) =>
        prisma.note.create({
          // `Note` n'a pas de colonne `siteId` : son rattachement découle de
          // l'élève. N'étaler ici aucun fragment `where`.
          data: { tenantId, ...note,
            date: new Date(note.date),
            isPubliee,
            saisieParId: session.user.id,
          },
        })
      )
    );

    return NextResponse.json({ notes: created, count: created.length }, { status: 201 });
  } catch (error) {
    console.error("[API/notes POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
