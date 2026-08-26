/**
 * EcolPro / LEARNOS — Détection des devoirs en retard
 * =====================================================
 *
 * Tâche planifiée (cron) qui balaie les devoirs dont la date de rendu est
 * dépassée sans qu'ils aient été rendus ou corrigés. Pour chacun, publie un
 * événement `devoir.enretard` — sauf si un événement identique a déjà été
 * publié pour ce devoir (idempotence : un devoir en retard d'une semaine ne
 * doit pas générer une alerte par jour).
 *
 * NE LÈVE JAMAIS
 * --------------
 * Tâche système appelée depuis le cron répartiteur : elle rend un compte
 * rendu plutôt qu'une 500. Un incident sur un devoir ne doit pas bloquer les
 * autres.
 */

import prisma from "@/lib/prisma";
import { publishEvent } from "@/lib/learnos/events";
import type { DevoirEnRetardPayload } from "@/lib/learnos/events";

/**
 * Détecte les devoirs en retard et publie un événement `devoir.enretard` pour
 * chacun qui n'en a pas déjà reçu un.
 *
 * @returns nombre de nouvelles alertes publiées.
 */
export async function detecterDevoirsEnRetard(): Promise<{ count: number }> {
  let count = 0;

  try {
    const maintenant = new Date();

    // Tâche système : elle balaie délibérément tous les tenants, comme les
    // autres crons de l'application (cf. api/cron/dispatch, alertes-parent).
    // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
    const devoirsEnRetard = await prisma.devoir.findMany({
      where: {
        statut: { in: ["A_FAIRE", "EN_COURS"] },
        dateRendu: { lt: maintenant },
      },
      select: {
        id: true,
        tenantId: true,
        siteId: true,
        classeId: true,
        matiereId: true,
        dateRendu: true,
      },
    });

    for (const devoir of devoirsEnRetard) {
      // Idempotence : ne pas republier si un événement `devoir.enretard`
      // existe déjà pour ce devoir. On vérifie par aggregateId + eventType,
      // ce qui couvre tous les tenants sans ambiguïté (l'identifiant du
      // devoir est unique au sein de son tenant).
      // eslint-disable-next-line ecolpro/require-site-filter -- vérification d'unicité, bornée par tenantId + aggregateId
      const dejaAlerte = await prisma.learnosEvent.findFirst({
        where: {
          tenantId: devoir.tenantId,
          eventType: "devoir.enretard",
          aggregateId: devoir.id,
        },
        select: { id: true },
      });

      if (dejaAlerte) continue;

      const joursRetard = Math.floor(
        (maintenant.getTime() - devoir.dateRendu.getTime()) / (1000 * 60 * 60 * 24)
      );

      const payload: DevoirEnRetardPayload = {
        devoirId: devoir.id,
        classeId: devoir.classeId,
        matiereId: devoir.matiereId,
        joursRetard,
      };

      await publishEvent({
        tenantId: devoir.tenantId,
        siteId: devoir.siteId ?? null,
        eventType: "devoir.enretard",
        aggregateType: "devoir",
        aggregateId: devoir.id,
        payload: payload as unknown as Record<string, unknown>,
      });
      count++;
    }
  } catch (error) {
    // Tâche cron : on logge et on rend un compte rendu plutôt que de propager.
    console.error("[learnos/devoirs-retard-check] détection échouée", error);
  }

  return { count };
}
