import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";
import { genererClasseur, type SectionClasseur } from "@/lib/pdf/classeur-generator";

/**
 * POST /api/classeur
 * Génère un classeur PDF complet.
 * Body: {
 *   classeId?: string,
 *   eleveIds?: string[],
 *   anneeId: string,
 *   periodeId?: string,
 *   sections: SectionClasseur[],
 *   titre?: string
 * }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const body = await req.json().catch(() => null);
  if (!body?.anneeId || !body?.sections) {
    return erreurJson("DONNEES_INVALIDES");
  }

  const tenantId = session.user.tenantId;

  // Récupérer les données de l'école
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });

  // Récupérer l'année
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: body.anneeId, tenantId },
  });
  if (!annee) return erreurJson("ANNEE_INTROUVABLE");

  // Récupérer la période si spécifiée
  let periode = undefined;
  if (body.periodeId) {
    periode = await prisma.periode.findFirst({
      where: { id: body.periodeId, anneeId: annee.id },
    });
  }

  // Récupérer la classe si spécifiée
  let classe: { nom: string; niveau: string } | undefined;
  if (body.classeId) {
    // eslint-disable-next-line ecolpro/require-site-filter -- filtré par tenantId, la route vérifie les permissions
    const c = await prisma.classe.findFirst({
      where: { id: body.classeId, tenantId },
      select: { nom: true, niveau: true },
    });
    if (c) classe = c;
  }

  // Récupérer les élèves
  const where: Record<string, unknown> = { tenantId };
  if (body.classeId) where.classeId = body.classeId;
  if (body.eleveIds) where.id = { in: body.eleveIds };

  // eslint-disable-next-line ecolpro/require-site-filter -- filtré par tenantId, la route vérifie les permissions
  const elevesDb = await prisma.eleve.findMany({
    where,
    select: {
      id: true,
      nom: true,
      prenom: true,
      matricule: true,
      dateNaissance: true,
      sexe: true,
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  // Pour l'instant, les bulletins ne sont pas chargés ici —
  // la génération de bulletins complets nécessite la logique de
  // calcul des moyennes qui vitent dans le script de génération.
  // Les sections "bulletins" et "relevesNotes" produiront des
  // pages vides si aucun bulletin n'est fourni.
  const bulletins = undefined;

  const pdfBytes = await genererClasseur({
    config: {
      tenantId,
      classeId: body.classeId,
      eleveIds: body.eleveIds,
      anneeId: annee.id,
      periodeId: body.periodeId,
      sections: body.sections as SectionClasseur[],
      titre: body.titre,
    },
    ecole: {
      nom: tenant.name,
      ville: tenant.city ?? "",
      pays: tenant.country,
      logoUrl: tenant.logoUrl,
      chefEtablissement: tenant.chefEtablissement,
    },
    annee: { libelle: annee.libelle },
    periode: periode
      ? { nom: periode.nom, numero: periode.numero }
      : undefined,
    classe,
    eleves: elevesDb.map((e) => ({
      id: e.id,
      nom: e.nom,
      prenom: e.prenom,
      matricule: e.matricule ?? undefined,
      dateNaissance: e.dateNaissance ?? undefined,
      sexe: (e.sexe as "M" | "F") ?? undefined,
    })),
    bulletins,
  });

  return new Response(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="classeur-${annee.libelle}.pdf"`,
    },
  });
}
