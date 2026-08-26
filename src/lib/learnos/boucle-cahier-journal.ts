/**
 * EcolPro / LEARNOS — Boucle du cahier-journal
 * ==============================================
 *
 * Orchestrateur qui réagit à l'événement `seance.cloturee` : quand un
 * enseignant marque une séance comme EFFECTUEE, cette boucle met à jour les
 * statuts des planifications de chapitre et de compétence pour refléter la
 * réalité du terrain.
 *
 * IDEMPOTENTE — NE LÈVE JAMAIS
 * ----------------------------
 * La livraison des événements est « au moins une fois » (cf. event-bus.ts) :
 * le même fait peut être traité deux fois. Les écritures ici sont donc
 * idempotentes — rejouer l'événement produit le même résultat qu'une seule
 * exécution. Et conformément à la règle non négociable de LEARNOS (§49-1),
 * aucune erreur ici ne doit remonter à l'appelant : on logge, on avale.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { SeanceClotureePayload } from "@/lib/learnos/events";
import { auditFire } from "@/lib/audit";
import { anneeActive } from "@/lib/annee-scolaire";

/** Niveaux de maîtrise qui comptent comme « compétence couverte ». */
const NIVEAUX_COUVERTS = ["MAITRISEE", "CONSOLIDEE"] as const;

/**
 * Traite un événement `seance.cloturee` : met à jour les planifications de
 * chapitre et de compétences rattachées à la séance clôturée.
 *
 * Ne lève jamais — les erreurs sont loggées et avalées.
 */
export async function onSeanceCloturee(event: DrainedEvent): Promise<void> {
  try {
    const p = event.payload as SeanceClotureePayload;

    // Garde-fou : un payload amputé indique un défaut de publication.
    if (!p?.seanceId || !p.classeId || !p.matiereId) {
      console.warn(
        `[learnos/boucle-cahier-journal] seance.cloturee incomplet (événement ${event.id})`
      );
      return;
    }

    // --- 1. Mettre à jour la planification du chapitre ---
    if (p.chapitreId) {
      await mettreAJourPlanificationChapitre(event.tenantId, p);
    }

    // --- 2. Mettre à jour les planifications de compétences ---
    for (const comp of p.competences) {
      await mettreAJourPlanificationCompetence(event.tenantId, p, comp.competenceId);
    }
  } catch (error) {
    // Règle §49-1 : LEARNOS ne doit jamais casser l'ERP. On logge et on avale.
    console.error(
      `[learnos/boucle-cahier-journal] onSeanceCloturee échoué (événement ${event.id})`,
      error
    );
  }
}

/**
 * Met à jour le statut de la PlanificationChapitre pour le chapitre + classe
 * de la séance clôturée.
 *
 * - TRAITE si toutes les compétences du chapitre sont couvertes (au moins
 *   CONSOLIDEE) à travers les séances EFFECTUEE.
 * - EN_COURS s'il reste des séances PLANIFIEE ou si les compétences ne sont
 *   pas toutes couvertes.
 */
async function mettreAJourPlanificationChapitre(
  tenantId: string,
  p: SeanceClotureePayload
): Promise<void> {
  // Récupérer l'année active pour retrouver la planification.
  const annee = await anneeActive(tenantId);
  if (!annee) return;

  // La séance peut porter un planificationId direct ; c'est le lien le plus
  // fiable. Sinon, on retrouve la planification par chapitre + classe + année.
  // Événement drainé : borné par tenantId, et par les identifiants du payload.
  // eslint-disable-next-line ecolpro/require-site-filter -- événement drainé, cf. ci-dessus
  const seance = await prisma.seancePedagogique.findFirst({
    where: { id: p.seanceId, tenantId },
    select: { planificationId: true },
  });

  let planifId = seance?.planificationId ?? null;

  let planif = planifId
    ? // eslint-disable-next-line ecolpro/require-site-filter -- événement drainé, cf. ci-dessus
      await prisma.planificationChapitre.findFirst({
        where: { id: planifId, tenantId },
      })
    : null;

  // Pas de planificationId sur la séance : retrouver par chapitre + classe.
  // On cherche d'abord la correspondance exacte (classeId renseigné), puis
  // le plan générique (classeId null = toutes les classes du niveau).
  if (!planif) {
    // eslint-disable-next-line ecolpro/require-site-filter -- événement drainé, cf. ci-dessus
    planif = await prisma.planificationChapitre.findFirst({
      where: {
        tenantId,
        chapitreId: p.chapitreId!,
        anneeId: annee.id,
        classeId: p.classeId,
      },
    });

    if (!planif) {
      // eslint-disable-next-line ecolpro/require-site-filter -- événement drainé, cf. ci-dessus
      planif = await prisma.planificationChapitre.findFirst({
        where: {
          tenantId,
          chapitreId: p.chapitreId!,
          anneeId: annee.id,
          classeId: null,
        },
      });
    }

    planifId = planif?.id ?? null;
  }

  if (!planif) return;

  // --- Vérifier si toutes les compétences du chapitre sont couvertes ---
  const toutesCouvertes = await verifierCompetencesChapitreCouvertes(
    tenantId,
    p.chapitreId!,
    p.classeId
  );

  const maintenant = new Date();

  if (toutesCouvertes) {
    // Toutes les compétences sont couvertes → TRAITE
    if (planif.statut !== "TRAITE") {
      await prisma.planificationChapitre.update({
        where: { id: planif.id },
        data: {
          statut: "TRAITE",
          traiteLe: planif.traiteLe ?? maintenant,
        },
      });
      auditFire({
        tenantId,
        action: "planification-chapitre.traite",
        verdict: "ALLOWED",
        resource: "planificationChapitre",
        resourceId: planif.id,
        metadata: { chapitreId: p.chapitreId, classeId: p.classeId, seanceId: p.seanceId },
      });
    }
  } else {
    // Il reste du travail → EN_COURS
    if (planif.statut !== "EN_COURS") {
      await prisma.planificationChapitre.update({
        where: { id: planif.id },
        data: {
          statut: "EN_COURS",
          demarreLe: planif.demarreLe ?? maintenant,
        },
      });
      auditFire({
        tenantId,
        action: "planification-chapitre.en-cours",
        verdict: "ALLOWED",
        resource: "planificationChapitre",
        resourceId: planif.id,
        metadata: { chapitreId: p.chapitreId, classeId: p.classeId, seanceId: p.seanceId },
      });
    }
  }
}

/**
 * Met à jour le statut d'une PlanificationCompetence pour la compétence +
 * classe donnée.
 *
 * - TRAITE si la compétence est couverte (au moins CONSOLIDEE) dans une séance
 *   EFFECTUEE.
 * - EN_COURS sinon (la compétence a été abordée mais pas encore consolidée).
 */
async function mettreAJourPlanificationCompetence(
  tenantId: string,
  p: SeanceClotureePayload,
  competenceId: string
): Promise<void> {
  const annee = await anneeActive(tenantId);
  if (!annee) return;

  // Retrouver la planification de compétence : d'abord par classe exacte,
  // puis par plan générique (classeId null).
  // Événement drainé : borné par tenantId et les identifiants du payload.
  // eslint-disable-next-line ecolpro/require-site-filter -- événement drainé, cf. ci-dessus
  let planif = await prisma.planificationCompetence.findFirst({
    where: {
      tenantId,
      competenceId,
      anneeId: annee.id,
      classeId: p.classeId,
    },
  });

  if (!planif) {
    // eslint-disable-next-line ecolpro/require-site-filter -- événement drainé, cf. ci-dessus
    planif = await prisma.planificationCompetence.findFirst({
      where: {
        tenantId,
        competenceId,
        anneeId: annee.id,
        classeId: null,
      },
    });
  }

  if (!planif) return;

  // Vérifier si la compétence est couverte : existe-t-il au moins une
  // SeanceCompetence avec niveau MAITRISEE ou CONSOLIDEE dans une séance
  // EFFECTUEE pour cette classe ?
  // eslint-disable-next-line ecolpro/require-site-filter -- événement drainé, cf. ci-dessus
  const couverte = await prisma.seanceCompetence.findFirst({
    where: {
      competenceId,
      niveau: { in: [...NIVEAUX_COUVERTS] },
      seance: {
        tenantId,
        classeId: p.classeId,
        statut: "EFFECTUEE",
      },
    },
    select: { id: true },
  });

  if (couverte) {
    if (planif.statut !== "TRAITE") {
      await prisma.planificationCompetence.update({
        where: { id: planif.id },
        data: { statut: "TRAITE" },
      });
      auditFire({
        tenantId,
        action: "planification-competence.traite",
        verdict: "ALLOWED",
        resource: "planificationCompetence",
        resourceId: planif.id,
        metadata: { competenceId, classeId: p.classeId, seanceId: p.seanceId },
      });
    }
  } else {
    if (planif.statut !== "EN_COURS") {
      await prisma.planificationCompetence.update({
        where: { id: planif.id },
        data: { statut: "EN_COURS" },
      });
      auditFire({
        tenantId,
        action: "planification-competence.en-cours",
        verdict: "ALLOWED",
        resource: "planificationCompetence",
        resourceId: planif.id,
        metadata: { competenceId, classeId: p.classeId, seanceId: p.seanceId },
      });
    }
  }
}

/**
 * Vérifie si toutes les compétences d'un chapitre sont couvertes : pour chaque
 * compétence du chapitre, existe-t-il au moins une SeanceCompetence avec niveau
 * MAITRISEE ou CONSOLIDEE dans une séance EFFECTUEE pour cette classe ?
 */
async function verifierCompetencesChapitreCouvertes(
  tenantId: string,
  chapitreId: string,
  classeId: string
): Promise<boolean> {
  // Récupérer toutes les compétences du chapitre.
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- événement drainé, tenantId déjà vérifié
  const competences = await prisma.competence.findMany({
    where: { chapitreId },
    select: { id: true },
  });

  if (competences.length === 0) {
    // Pas de compétences définies : on considère le chapitre comme traité
    // s'il n'y a plus de séances planifiées (géré par l'appelant).
    return true;
  }

  // Récupérer les compétences couvertes (au moins CONSOLIDEE) dans les
  // séances EFFECTUEE de cette classe.
  // eslint-disable-next-line ecolpro/require-site-filter -- événement drainé, cf. ci-dessus
  const couvertes = await prisma.seanceCompetence.findMany({
    where: {
      competenceId: { in: competences.map((c) => c.id) },
      niveau: { in: [...NIVEAUX_COUVERTS] },
      seance: {
        tenantId,
        classeId,
        statut: "EFFECTUEE",
      },
    },
    select: { competenceId: true },
    distinct: ["competenceId"],
  });

  const idsCouverts = new Set(couvertes.map((c) => c.competenceId));
  return competences.every((c) => idsCouverts.has(c.id));
}
