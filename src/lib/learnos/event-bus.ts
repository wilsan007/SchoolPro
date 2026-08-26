/**
 * EcolPro / LEARNOS — Bus d'événements (traitement)
 * =================================================
 *
 * Pendant asynchrone de `events.ts` : draine la boîte d'envoi et remet chaque
 * fait aux traitements qui l'écoutent.
 *
 * GARANTIE DE LIVRAISON : **au moins une fois**
 * ---------------------------------------------
 * Un événement peut être traité deux fois — deux drainages concurrents, ou une
 * panne survenue entre le traitement et son marquage. **Tout traitement doit
 * donc être idempotent.** C'est un choix assumé : la garantie « exactement une
 * fois » exigerait un verrouillage distribué disproportionné pour le volume
 * d'un établissement, alors que l'idempotence est de toute façon souhaitable
 * (une preuve d'apprentissage s'identifie par sa source, pas par son rang
 * d'arrivée).
 *
 * ÉVÉNEMENT SANS AUDITEUR
 * -----------------------
 * Un type sans traitement enregistré est marqué traité : il a bien été livré,
 * à zéro auditeur. Le `payload` reste en base, si bien qu'ajouter un traitement
 * plus tard permet de rejouer l'historique avec `replayEvents()` — c'est
 * exactement la situation tant que l'Evidence Engine (P3-B) n'existe pas.
 */

import prisma from "@/lib/prisma";
import type { LearnosEventType } from "@/lib/learnos/events";
import { ingererNoteCommePreuve } from "@/lib/learnos/evidence-engine";
import { recalculerProfilsApresPreuve } from "@/lib/learnos/learning-twin";
import {
  recalculerRecommandationsApresProfil,
  reinitialiserCaches,
} from "@/lib/learnos/recommendation-engine";
import { onSeanceCloturee } from "@/lib/learnos/boucle-cahier-journal";

export interface DrainedEvent {
  id: string;
  tenantId: string;
  siteId: string | null;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  occurredAt: Date;
}

export type LearnosEventHandler = (event: DrainedEvent) => Promise<void>;

/**
 * Registre statique — et non un `registerHandler()` dynamique : en serverless,
 * chaque instance repart à froid, et un enregistrement dynamique ne serait
 * effectif que si le module qui l'exécute a été importé. Une table figée est
 * vérifiable d'un coup d'œil et se comporte pareil partout.
 */
const HANDLERS: Partial<Record<LearnosEventType, LearnosEventHandler[]>> = {
  // L'ordre compte : le jumeau agrège les preuves que le moteur vient d'écrire.
  // C'est la raison pour laquelle les traitements s'exécutent en séquence et
  // non en parallèle (voir `drainEvents`).
  "note.recorded": [
    ingererNoteCommePreuve,
    recalculerProfilsApresPreuve,
    recalculerRecommandationsApresProfil,
  ],
  // La clôture d'une séance déclenche la boucle du cahier-journal : mise à
  // jour des statuts de planification (chapitre et compétences) pour
  // refléter la réalité du terrain. Le traitement est idempotent et ne lève
  // jamais — il peut donc être rejoué sans risque.
  "seance.cloturee": [onSeanceCloturee],
};

/** Au-delà, l'événement est abandonné : inutile de réessayer indéfiniment. */
const MAX_ATTEMPTS = 5;

/** Taille de lot par défaut, calibrée pour tenir dans une exécution de cron. */
const DEFAULT_BATCH = 50;

export interface DrainResult {
  /** Traités avec succès (y compris ceux sans auditeur). */
  processed: number;
  /** Échoués sur ce passage, à retenter. */
  failed: number;
  /** Définitivement abandonnés (seuil de tentatives atteint). */
  abandoned: number;
}

/**
 * Traite les événements en attente, du plus ancien au plus récent.
 *
 * Ne lève jamais : appelée depuis une route cron, elle doit rendre un compte
 * rendu plutôt qu'une 500 — un événement fautif ne doit pas bloquer les autres.
 */
export async function drainEvents(limit = DEFAULT_BATCH): Promise<DrainResult> {
  const resultat: DrainResult = { processed: 0, failed: 0, abandoned: 0 };

  // Les lectures indépendantes de l'élève (graphe de prérequis, seuils) sont
  // mémoïsées pour la durée du passage. On repart d'un cache vide pour qu'une
  // modification du curriculum soit prise en compte dès le drainage suivant.
  reinitialiserCaches();

  let enAttente;
  try {
    // Tâche système : elle balaie délibérément tous les tenants, comme les
    // autres crons de l'application (cf. api/cron/purge-sites).
    // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
    enAttente = await prisma.learnosEvent.findMany({
      where: { processedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { occurredAt: "asc" },
      take: limit,
      select: {
        id: true,
        tenantId: true,
        siteId: true,
        eventType: true,
        aggregateType: true,
        aggregateId: true,
        payload: true,
        occurredAt: true,
        attempts: true,
      },
    });
  } catch (error) {
    console.error("[learnos/event-bus] lecture de la boîte d'envoi échouée", error);
    return resultat;
  }

  for (const evenement of enAttente) {
    const handlers = HANDLERS[evenement.eventType as LearnosEventType] ?? [];

    try {
      // Séquentiel et non `Promise.all` : les traitements d'un même fait
      // peuvent toucher les mêmes lignes (profil de l'élève), et les paralléliser
      // inviterait des écritures concurrentes sans bénéfice à ce volume.
      for (const handler of handlers) {
        await handler(evenement);
      }

      // `updateMany` plutôt qu'`update` : il accepte un `where` non unique, donc
      // permet d'exiger le `tenantId` en plus de l'identifiant. Une écriture ne
      // se contente pas d'un identifiant — même issu de notre propre requête.
      await prisma.learnosEvent.updateMany({
        where: { id: evenement.id, tenantId: evenement.tenantId },
        data: { processedAt: new Date(), attempts: { increment: 1 }, lastError: null },
      });
      resultat.processed++;
    } catch (error) {
      const tentatives = evenement.attempts + 1;
      const abandonne = tentatives >= MAX_ATTEMPTS;
      const motif = error instanceof Error ? error.message : String(error);

      await prisma.learnosEvent
        .updateMany({
          where: { id: evenement.id, tenantId: evenement.tenantId },
          data: {
            attempts: tentatives,
            // Tronqué : un message d'erreur verbeux n'a pas à faire grossir la table.
            lastError: motif.slice(0, 500),
          },
        })
        .catch(() => {});

      if (abandonne) {
        resultat.abandoned++;
        console.error(
          `[learnos/event-bus] événement ${evenement.id} (${evenement.eventType}) abandonné ` +
            `après ${tentatives} tentatives : ${motif}`
        );
      } else {
        resultat.failed++;
      }
    }
  }

  return resultat;
}

/**
 * Remet des événements déjà traités en file d'attente.
 *
 * Sert lorsqu'un nouveau traitement est ajouté et doit rattraper l'historique
 * (les faits antérieurs ont été marqués traités faute d'auditeur), ou après
 * correction d'un traitement fautif. Remet aussi `attempts` à zéro, sans quoi
 * les événements abandonnés resteraient hors du drainage.
 *
 * @returns nombre d'événements remis en file.
 */
export async function replayEvents(options: {
  tenantId: string;
  eventType?: LearnosEventType;
  depuis?: Date;
}): Promise<number> {
  const { count } = await prisma.learnosEvent.updateMany({
    where: {
      tenantId: options.tenantId,
      ...(options.eventType ? { eventType: options.eventType } : {}),
      ...(options.depuis ? { occurredAt: { gte: options.depuis } } : {}),
    },
    data: { processedAt: null, attempts: 0, lastError: null },
  });
  return count;
}

/** État de la boîte d'envoi, pour supervision. */
export async function eventBacklog(tenantId: string): Promise<{
  pending: number;
  abandoned: number;
}> {
  // Supervision de la boîte d'envoi : on compte des ÉVÉNEMENTS EN ATTENTE, pas
  // des données d'élève. Un compteur filtré par site sous-estimerait le retard
  // réel du drainage et masquerait un incident d'infrastructure — exactement ce
  // que cet indicateur existe pour rendre visible. Aucune donnée nominative
  // n'est lue : deux entiers en sortent.
  const [pending, abandoned] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-site-filter -- compteur d'infrastructure, cf. ci-dessus
    prisma.learnosEvent.count({
      where: { tenantId, processedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter -- compteur d'infrastructure, cf. ci-dessus
    prisma.learnosEvent.count({
      where: { tenantId, processedAt: null, attempts: { gte: MAX_ATTEMPTS } },
    }),
  ]);
  return { pending, abandoned };
}
