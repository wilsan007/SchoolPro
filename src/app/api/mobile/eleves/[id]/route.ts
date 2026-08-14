import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { siteFilterForModel, personalScopeFilter, mergeFilters } from "@/lib/site-scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { id } = await params;

  // Le filtrage par site est indispensable ici : la route expose le dossier
  // complet de l'élève (santé, allergies, contacts d'urgence, coordonnées des
  // parents). Bornée au seul tenant, elle permettait à un personnel du site A
  // de lire le dossier d'un élève du site B.

  // Pour un compte PARENT ou STUDENT le filtre de site est neutre par construction
  // (leur périmètre est familial, pas géographique) : sans `personalScopeFilter`,
  // un parent authentifié lisait le dossier de n'importe quel élève du tenant.
  const siteFilter = mergeFilters(
    siteFilterForModel("eleve", user),
    personalScopeFilter(user, null)
  );
  const eleve = await prisma.eleve.findFirst({
    where: { id, tenantId: user.tenantId, ...siteFilter },
    select: {
      id: true,
      matricule: true,
      nom: true,
      prenom: true,
      dateNaissance: true,
      lieuNaissance: true,
      nationalite: true,
      sexe: true,
      photoUrl: true,
      statut: true,
      regime: true,
      groupeSanguin: true,
      allergies: true,
      contactUrgenceNom: true,
      contactUrgencePhone: true,
      classe: { select: { id: true, nom: true, niveau: true } },
    },
  });

  if (!eleve) {
    return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });
  }

  // Les quatre requêtes suivantes portent sur `id`, dont l'appartenance au tenant,
  // au périmètre de sites et — pour un parent — au foyer vient d'être vérifiée par
  // le `findFirst` ci-dessus, suivi d'un 404 : la portée est acquise en amont.
  const [parents, notes, absences, incidents] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-site-filter
    prisma.eleveParent.findMany({
      where: { eleveId: id },
      select: {
        lien: true,
        isGardien: true,
        parent: {
          select: { id: true, nom: true, prenom: true, phone: true, phone2: true, email: true, profession: true },
        },
      },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter
    prisma.note.findMany({
      where: { eleveId: id, tenantId: user.tenantId },
      select: {
        id: true,
        valeur: true,
        noteMax: true,
        coefficient: true,
        date: true,
        intitule: true,
        matiere: { select: { nom: true, code: true, couleur: true, coefficient: true } },
      },
      orderBy: { date: "desc" },
      take: 20,
    }),
    // eslint-disable-next-line ecolpro/require-site-filter
    prisma.absence.findMany({
      where: { eleveId: id, tenantId: user.tenantId },
      select: { id: true, date: true, isRetard: true, statut: true, motif: true },
      orderBy: { date: "desc" },
      take: 10,
    }),
    // eslint-disable-next-line ecolpro/require-site-filter
    prisma.incident.findMany({
      where: { eleveId: id, tenantId: user.tenantId },
      select: { id: true, type: true, statut: true, gravite: true, description: true, date: true },
      orderBy: { date: "desc" },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    eleve: {
      ...eleve,
      parents,
      notes,
      absences,
      incidents,
    },
  });
}
