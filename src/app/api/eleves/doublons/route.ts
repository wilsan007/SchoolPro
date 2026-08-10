import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, mergeFilters } from "@/lib/site-scope";
import { detectDuplicates, MATCH_LABELS } from "@/lib/eleve-identity";

/**
 * GET /api/eleves/doublons
 *
 * Contrôle permanent des fiches faisant doublon. L'import prévient désormais
 * en amont, mais des doublons peuvent naître d'une saisie manuelle ou d'un
 * historique antérieur : mieux vaut les voir arriver que les découvrir des
 * semaines plus tard en additionnant les effectifs.
 *
 * Renvoie aussi, pour chaque fiche, le volume de données rattachées — c'est
 * ce qui permet de choisir laquelle conserver sans rien orphelinner.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "eleves:read");
    if (denied) return denied;

    const eleves = await prisma.eleve.findMany({
      where: mergeFilters(
        { tenantId: session.user.tenantId, deletedAt: null },
        siteFilterForModel("eleve", session.user)
      ),
      select: {
        id: true,
        nom: true,
        prenom: true,
        matricule: true,
        dateNaissance: true,
        statut: true,
        createdAt: true,
        classe: { select: { nom: true } },
        _count: {
          select: { notes: true, absences: true, factures: true, bulletins: true, parents: true },
        },
      },
    });

    const groupes = detectDuplicates(eleves).map((g) => {
      const donnees = (e: (typeof eleves)[0]) =>
        e._count.notes + e._count.absences + e._count.factures + e._count.bulletins + e._count.parents;

      // Fiche à conserver : la mieux renseignée ; à égalité, la plus ancienne.
      const triees = [...g.fiches].sort(
        (a, b) => donnees(b) - donnees(a) || +a.createdAt - +b.createdAt
      );

      return {
        niveau: g.level,
        libelle: MATCH_LABELS[g.level],
        fiches: triees.map((e, i) => ({
          id: e.id,
          nom: e.nom,
          prenom: e.prenom,
          matricule: e.matricule,
          dateNaissance: e.dateNaissance,
          statut: e.statut,
          classe: e.classe?.nom ?? null,
          createdAt: e.createdAt,
          donneesLiees: donnees(e),
          detail: e._count,
          /** Fiche recommandée à la conservation. */
          recommandee: i === 0,
        })),
      };
    });

    // Les rapprochements les plus sûrs d'abord.
    const ordre = { MATRICULE: 0, IDENTITE: 1, CLASSE: 2, APPROCHE: 3 } as const;
    groupes.sort((a, b) => ordre[a.niveau] - ordre[b.niveau]);

    // Dates de naissance suspectes : l'ancien import appliquait `2008-01-01`
    // par défaut quand le fichier n'en fournissait pas. Ces fiches n'ont donc
    // pas de vraie date, ce qui affaiblit toute identification — la clé
    // d'unicité repose dessus.
    const parDate = new Map<string, typeof eleves>();
    for (const e of eleves) {
      const jour = e.dateNaissance.toISOString().slice(0, 10);
      if (!parDate.has(jour)) parDate.set(jour, []);
      parDate.get(jour)!.push(e);
    }
    // Un 1er janvier partagé par au moins 5 élèves trahit une valeur par
    // défaut, pas une coïncidence.
    const datesSuspectes = [...parDate.entries()]
      .filter(([jour, liste]) => liste.length >= 5 && jour.endsWith("-01-01"))
      .map(([jour, liste]) => ({
        date: jour,
        nombre: liste.length,
        eleves: liste.slice(0, 50).map((e) => ({
          id: e.id,
          nom: e.nom,
          prenom: e.prenom,
          matricule: e.matricule,
          classe: e.classe?.nom ?? null,
        })),
      }))
      .sort((a, b) => b.nombre - a.nombre);

    return NextResponse.json({
      groupes,
      datesSuspectes,
      resume: {
        groupes: groupes.length,
        fichesConcernees: groupes.reduce((s, g) => s + g.fiches.length, 0),
        fichesEnTrop: groupes.reduce((s, g) => s + g.fiches.length - 1, 0),
        totalAnalyse: eleves.length,
        sansDateFiable: datesSuspectes.reduce((s, d) => s + d.nombre, 0),
      },
    });
  } catch (error) {
    console.error("[API/eleves/doublons GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
