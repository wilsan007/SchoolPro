import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, eleveScopeFilter, mergeFilters } from "@/lib/site-scope";
import { publishEvents, type NoteRecordedPayload } from "@/lib/learnos/events";
import { revalidateTag } from "next/cache";
import { getDemoNow } from "@/lib/demo-now";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

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

    const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

    const where = mergeFilters(
      {
        tenantId: session.user.tenantId,
        ...(classeId && { classeId }),
        ...(matiereId && { matiereId }),
        ...(periodeId && { periodeId }),
        ...(eleveId && { eleveId }),
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
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

    const anneeCourante = await getAnneeCouranteLibelle(tenantId);
    const teacherScope = isTeacherRole(session.user.role as Role)
      ? await getTeacherScope(tenantId, session.user.id as string, session.user.role as Role, anneeCourante)
      : null;
    const teacherClasseFilter = teacherScope?.isRestricted
      ? { classeId: { in: teacherScope.classeIds } }
      : {};

    // Garde-fou : refuse la saisie sur une période clôturée ou dont la date limite est dépassée.
    const periodeIds = [...new Set(notes.map((n) => n.periodeId).filter((id): id is string => !!id))];
    if (periodeIds.length > 0) {
      const periodes = await prisma.periode.findMany({
        where: { id: { in: periodeIds }, annee: { tenantId } },
        select: { id: true, nom: true, statut: true, dateLimiteSaisie: true },
      });
      const now = await getDemoNow();
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

      // ── Verrouillage des bulletins : si un bulletin VERROUILLE ou PUBLIE
      //    existe pour cette période, la saisie de notes est bloquée.
      //    Seul un TENANT_ADMIN / SUPER_ADMIN peut outrepasser ce verrou.
      const estAdmin = session.user.role === "TENANT_ADMIN" || session.user.role === "SUPER_ADMIN";
      if (!estAdmin) {
        const bulletinsVerrouilles = await prisma.bulletin.findFirst({
          where: {
            tenantId,
            ...siteFilterForModel("bulletin", session.user),
            periodeId: { in: periodeIds },
            statut: { in: ["VERROUILLE", "PUBLIE"] },
            ...(anneeCourante ? { periode: { annee: { libelle: anneeCourante } } } : {}),
          },
          select: { id: true, periode: { select: { nom: true } } },
        });
        if (bulletinsVerrouilles) {
          return NextResponse.json(
            {
              error: `Les bulletins de « ${bulletinsVerrouilles.periode.nom} » sont verrouillés. La saisie de notes n'est plus possible. Contactez un administrateur pour déverrouiller.`,
            },
            { status: 403 }
          );
        }
      }
    }

    // Vérifier que TOUS les élèves visés appartiennent au tenant ET au
    // périmètre de sites de l'utilisateur. Sans ce contrôle, `eleveId` n'était
    // pas vérifié du tout : on pouvait saisir des notes sur un élève d'un autre
    // site, voire d'un autre établissement.
    const eleveIds = [...new Set(notes.map((n) => n.eleveId).filter(Boolean))];
    // Le site de chaque élève sert aussi à situer les événements LEARNOS émis
    // plus bas : `Note` n'a pas de `siteId`, il découle de l'élève — et non du
    // site « sélectionné » par l'utilisateur, qui peut différer.
    const siteParEleve = new Map<string, string | null>();
    const classeParEleve = new Map<string, string | null>();
    if (eleveIds.length > 0) {
      const autorises = await prisma.eleve.findMany({
        where: mergeFilters(
          { id: { in: eleveIds }, tenantId },
          eleveFilter,
          teacherClasseFilter
        ),
        select: { id: true, siteId: true, classeId: true },
      });
      if (autorises.length !== eleveIds.length) {
        return NextResponse.json(
          { error: "Un ou plusieurs élèves sont introuvables ou hors de votre périmètre" },
          { status: 403 }
        );
      }
      for (const e of autorises) {
        siteParEleve.set(e.id, e.siteId);
        classeParEleve.set(e.id, e.classeId);
      }
    }

    // Idem pour les matières visées.
    const matiereIds = [...new Set(notes.map((n) => n.matiereId).filter(Boolean))];
    if (teacherScope?.isRestricted && matiereIds.length > 0) {
      const interdit = (matiereIds as string[]).some((id) => !teacherScope.matiereIds.includes(id));
      if (interdit) {
        return NextResponse.json({ error: "Une ou plusieurs matières sont hors de votre périmètre" }, { status: 403 });
      }
    }
    if (matiereIds.length > 0) {
      const matieres = await prisma.matiere.count({
        where: { id: { in: matiereIds as string[] }, tenantId, ...siteFilterForModel("matiere", session.user) },
      });
      if (matieres !== matiereIds.length) {
        return NextResponse.json(
          { error: "Une ou plusieurs matières sont introuvables" },
          { status: 403 }
        );
      }
    }

    // Coherence eleve.classeId ↔ note.classeId (donnée et périmètre)
    for (const note of notes) {
      const eleveClasse = classeParEleve.get(note.eleveId);
      if (eleveClasse && note.classeId !== eleveClasse) {
        return NextResponse.json(
          { error: "La classe de la note ne correspond pas à celle de l'élève" },
          { status: 400 }
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

    // Observation LEARNOS — après la transaction, donc sans jamais peser sur
    // elle : `publishEvents` n'échoue pas, la saisie reste acquise quoi qu'il
    // arrive côté couche d'intelligence (cf. src/lib/learnos/events.ts).
    await publishEvents(
      created.map((note) => ({
        tenantId,
        siteId: siteParEleve.get(note.eleveId) ?? null,
        eventType: "note.recorded" as const,
        aggregateType: "note",
        aggregateId: note.id,
        payload: {
          noteId: note.id,
          eleveId: note.eleveId,
          classeId: note.classeId,
          matiereId: note.matiereId,
          periodeId: note.periodeId,
          evaluationId: note.evaluationId,
          valeur: note.valeur,
          noteMax: note.noteMax,
          coefficient: note.coefficient,
          type: note.type,
          intitule: note.intitule,
          date: note.date.toISOString(),
          saisieParId: note.saisieParId,
        } satisfies NoteRecordedPayload,
      }))
    );

    if (isPubliee && created.length > 0) {
      try {
        const matiereId = created[0].matiereId;
        const matiere = await prisma.matiere.findFirst({
          where: { id: matiereId, tenantId, ...siteFilterForModel("matiere", session.user) },
          select: { nom: true },
        });
        const intitule = created[0].intitule ?? "Évaluation";
        const nbDestinataires = created.length;

        await prisma.notification.create({
          data: {
            tenantId,
            titre: `Notes publiées: ${intitule}`,
            contenu: `Les notes de l'évaluation « ${intitule} » en ${matiere?.nom ?? "matière"} ont été publiées et sont désormais consultables.`,
            canal: "IN_APP",
            statut: "ENVOYEE",
            cible: "PARENTS",
            envoyeParId: session.user.id,
            nbDestinataires,
            nbDelivres: nbDestinataires,
            envoyeeAt: new Date(),
          },
        });
      } catch (notifError) {
        console.error("[API/notes] Notification échouée:", notifError);
      }
    }

    revalidateTag("dashboard-data");

    return NextResponse.json({ notes: created, count: created.length }, { status: 201 });
  } catch (error) {
    console.error("[API/notes POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
