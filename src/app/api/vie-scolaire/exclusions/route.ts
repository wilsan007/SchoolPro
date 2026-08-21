import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { erreurJson } from "@/lib/erreurs-api";
import { getDemoNow } from "@/lib/demo-now";

/// Types de sanction qui constituent une exclusion : seules celles-ci ont un
/// cycle de vie (continuité pédagogique + réintégration) à suivre.
const TYPES_EXCLUSION = ["EXCLUSION_COURS", "EXCLUSION_TEMP"] as const;

/**
 * Registre des exclusions disciplinaires.
 *
 * Les exclusions existent en base comme `Sanction` de type EXCLUSION_*, rattachées
 * à un incident. Sans registre dédié, la vie scolaire devait ouvrir chaque incident
 * pour savoir qui est actuellement exclu — d'où cette vue transversale.
 *
 * Paramètre `etat` :
 *   - "EN_COURS"  : exclusion commencée, élève pas encore réintégré
 *   - "A_VENIR"   : exclusion décidée mais qui ne commence pas encore
 *   - "CLOSE"     : élève réintégré
 *   - "TOUTES"    : pas de filtre (défaut)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "vie-scolaire:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const etat = searchParams.get("etat") ?? "TOUTES";
    const classeId = searchParams.get("classeId");
    const tenantId = session.user.tenantId;

    // La date de référence suit la Time Machine : un registre consulté à une date
    // simulée doit refléter les exclusions telles qu'elles étaient à cette date.
    const maintenant = await getDemoNow();

    const sanctions = await prisma.sanction.findMany({
      where: {
        type: { in: [...TYPES_EXCLUSION] },
        // Le périmètre tenant passe par incident, le périmètre site par la
        // chaîne incident -> eleve (siteFilterForModel("sanction") produit
        // un AND sur incident.eleve.siteId, compatible avec la clé incident).
        incident: {
          tenantId,
          ...(classeId ? { eleve: { classeId } } : {}),
        },
        ...siteFilterForModel("sanction", session.user),
        ...(etat === "EN_COURS"
          ? { dateRetourEffective: null, dateDebut: { lte: maintenant } }
          : {}),
        ...(etat === "A_VENIR"
          ? { dateRetourEffective: null, dateDebut: { gt: maintenant } }
          : {}),
        ...(etat === "CLOSE" ? { dateRetourEffective: { not: null } } : {}),
      },
      include: {
        incident: {
          select: {
            id: true,
            type: true,
            gravite: true,
            date: true,
            description: true,
            eleve: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                matricule: true,
                classe: { select: { id: true, nom: true } },
              },
            },
          },
        },
        reintegrePar: { select: { name: true } },
      },
      orderBy: { dateDebut: "desc" },
      take: 200,
    });

    // On enrichit chaque ligne d'un état calculé et du retard de réintégration :
    // c'est l'information qui manque le plus à la vie scolaire au quotidien.
    const exclusions = sanctions.map((s) => {
      const close = s.dateRetourEffective !== null;
      const commencee = s.dateDebut <= maintenant;
      const etatCalcule = close ? "CLOSE" : commencee ? "EN_COURS" : "A_VENIR";

      // Retard = l'exclusion devait finir, l'élève n'est toujours pas réintégré.
      const joursRetardReintegration =
        !close && s.dateFin && s.dateFin < maintenant
          ? Math.floor((maintenant.getTime() - s.dateFin.getTime()) / 86_400_000)
          : 0;

      return {
        id: s.id,
        type: s.type,
        description: s.description,
        dateDebut: s.dateDebut,
        dateFin: s.dateFin,
        dateRetourEffective: s.dateRetourEffective,
        travailDonne: s.travailDonne,
        parentNotifie: s.parentNotifie,
        accuseReceptionParent: s.accuseReceptionParent,
        reintegrePar: s.reintegrePar?.name ?? null,
        incident: s.incident,
        etat: etatCalcule,
        joursRetardReintegration,
        // Deux manquements réglementaires fréquents, remontés explicitement.
        continuitePedagogiqueManquante: !s.travailDonne,
        accuseReceptionManquant: s.accuseReceptionParent === null,
      };
    });

    const stats = {
      total: exclusions.length,
      enCours: exclusions.filter((e) => e.etat === "EN_COURS").length,
      aVenir: exclusions.filter((e) => e.etat === "A_VENIR").length,
      closes: exclusions.filter((e) => e.etat === "CLOSE").length,
      retardsReintegration: exclusions.filter((e) => e.joursRetardReintegration > 0).length,
      sansContinuitePedagogique: exclusions.filter(
        (e) => e.etat !== "CLOSE" && e.continuitePedagogiqueManquante
      ).length,
      sansAccuseReception: exclusions.filter(
        (e) => e.etat !== "CLOSE" && e.accuseReceptionManquant
      ).length,
    };

    return NextResponse.json({ exclusions, stats, dateReference: maintenant });
  } catch (error) {
    console.error("[API/vie-scolaire/exclusions GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
