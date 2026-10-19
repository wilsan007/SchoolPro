/**
 * Handler `curriculum.imported` / `chapitre.created` / `competence.created`
 * ========================================================================
 *
 * Alimente la banque d'entraînement au moment où l'enseignant dépose ses
 * cours — et non par un remplissage nocturne de tout le curriculum.
 *
 * POURQUOI CE DÉCLENCHEUR, PAS UN CRON GÉNÉRAL
 * ---------------------------------------------
 * Le stock utile est celui des chapitres que les élèves sont EN TRAIN
 * d'étudier. Remplir la banque d'un niveau que personne ne suit coûte des
 * appels pour des questions que le tirage n'atteindra jamais, et noie les
 * utiles. Le dépôt d'un cours (import de programme, création d'un chapitre
 * ou d'une compétence) est précisément l'instant où l'on sait que le
 * curriculum va être travaillé.
 *
 * GARDE-FOUS, dans l'ordre
 * ------------------------
 * 1. **Des élèves sur ce niveau ?** Une classe du niveau, année courante,
 *    avec au moins un élève. Sinon : rien à préparer.
 * 2. **Pas de remplissage aveugle.** Seuls les couples compétence × palier
 *    sous le seuil de stock sont comblés, et en nombre limité par dépôt.
 * 3. **Budget quotidien.** `comblerTrous` vérifie le plafond avant chaque
 *    appel ; un lot s'arrête au premier épuisement.
 * 4. **Idempotent et silencieux.** Rejouer l'événement ne régénère rien (le
 *    stock est redevenu plein). Une IA indisponible ne bloque JAMAIS le
 *    dépôt de cours : la composition de séance continue sur la banque
 *    existante, et le secours à la volée (`composerFeuille`) prendra le
 *    relais devant l'élève si besoin.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type {
  ChapitreCreatedPayload,
  CompetenceCreatedPayload,
  CurriculumImportedPayload,
} from "@/lib/learnos/events";
import { getAnneeCourante } from "@/lib/annee-scolaire";
import { siteFilterFromSession } from "@/lib/site-scope";
import {
  comblerTrous,
  prioriteParActivite,
  trousDeStock,
} from "@/lib/learnos/stock-questions";

/** Couples compétence × palier maximum comblés par un seul dépôt de cours. */
const TROUS_MAX_PAR_DEPOT = 6;

interface CibleDepot {
  competenceIds: string[];
  /** Niveau du cours déposé, pour la garde « des élèves sont inscrits ». */
  niveau: string;
}

/**
 * Compétences concernées par l'événement.
 *
 * L'import donne une matière × niveau (tous les chapitres importés) ; les
 * créations manuelles donnent directement l'entité. `null` = événement non
 * reconnu ici (jamais arrivé en pratique, mais un cast de payload n'est pas
 * une garantie).
 */
async function ciblesDeLevenement(
  tenantId: string,
  siteId: string | null,
  event: DrainedEvent
): Promise<CibleDepot | null> {
  const siteFilter = siteFilterFromSession("TENANT_ADMIN", siteId, [], true);

  switch (event.eventType) {
    case "curriculum.imported": {
      const payload = event.payload as CurriculumImportedPayload;
      const chapitres = await prisma.chapitre.findMany({
        where: {
          tenantId,
          ...siteFilter,
          matiereId: payload.matiereId,
          niveau: payload.niveau,
        },
        select: { competences: { select: { id: true } } },
      });
      return {
        competenceIds: chapitres.flatMap((c) => c.competences.map((cp) => cp.id)),
        niveau: payload.niveau,
      };
    }
    case "chapitre.created": {
      const payload = event.payload as ChapitreCreatedPayload;
      const chapitre = await prisma.chapitre.findUnique({
        where: { id: payload.chapitreId },
        select: {
          niveau: true,
          competences: { select: { id: true } },
        },
      });
      if (!chapitre) return null;
      return {
        competenceIds: chapitre.competences.map((cp) => cp.id),
        niveau: chapitre.niveau,
      };
    }
    case "competence.created": {
      const payload = event.payload as CompetenceCreatedPayload;
      const competence = await prisma.competence.findUnique({
        where: { id: payload.competenceId },
        select: { id: true, chapitre: { select: { niveau: true } } },
      });
      if (!competence) return null;
      return {
        competenceIds: [competence.id],
        niveau: competence.chapitre.niveau,
      };
    }
    default:
      return null;
  }
}

/**
 * Y a-t-il, sur ce niveau et l'année courante, au moins une classe avec des
 * élèves ? C'est la garde qui empêche de préparer des exercices pour un
 * niveau fantôme — et qui borne naturellement le dispositif aux parcours
 * réellement suivis.
 */
async function niveauSuivi(
  tenantId: string,
  siteId: string | null,
  niveau: string
): Promise<boolean> {
  const annee = await getAnneeCourante(tenantId);
  if (!annee) return false;

  const classe = await prisma.classe.findFirst({
    where: {
      tenantId,
      ...siteFilterFromSession("TENANT_ADMIN", siteId, [], true),
      niveau,
      annee: annee.libelle,
      deletedAt: null,
      eleves: { some: {} },
    },
    select: { id: true },
  });
  return classe !== null;
}

/**
 * Alimente la banque pour les compétences du cours déposé.
 *
 * Le handler ne lève JAMAIS : il tourne dans le bus d'événements, et une
 * panne de génération ne doit pas faire échouer le dépôt de cours qui l'a
 * déclenché. Chaque sortie anormale est journalisée pour être visible.
 */
export async function onBanqueAlimentee(event: DrainedEvent): Promise<void> {
  const { tenantId, siteId } = event;

  const cible = await ciblesDeLevenement(tenantId, siteId, event);
  if (!cible || cible.competenceIds.length === 0) return;

  if (!(await niveauSuivi(tenantId, siteId, cible.niveau))) {
    console.info("[learnos/banque-alimentee] niveau non suivi — rien à préparer", {
      tenantId,
      niveau: cible.niveau,
      evenement: event.eventType,
    });
    return;
  }

  // Même site-filter que dans les handlers voisins : le scope du site porté
  // par l'événement borne la lecture du stock comme la génération.
  const siteFilter = siteFilterFromSession("TENANT_ADMIN", siteId, [], true);

  const comptes = await prisma.question.groupBy({
    by: ["competenceId", "palier"],
    where: {
      tenantId,
      actif: true,
      langue: "fr",
      competenceId: { in: cible.competenceIds },
      format: {
        in: ["SAISIE_COURTE", "CHOIX_UNIQUE", "ETAPES_GUIDEES", "REMISE_EN_ORDRE", "APPARIEMENT"],
      },
      ...siteFilter,
    },
    _count: { _all: true },
  });

  const trous = trousDeStock(
    cible.competenceIds,
    comptes.map((c) => ({
      competenceId: c.competenceId,
      palier: c.palier,
      nombre: c._count._all,
    }))
  );
  if (trous.length === 0) return;

  // Compétences les plus travaillées d'abord : les preuves récentes disent
  // ce qui est EN COURS d'étude dans l'établissement, bien au-delà des deux
  // élèves de test — mais elles limitent le lot au terrain réel.
  const activiteBrute = await prisma.learningEvidence.groupBy({
    by: ["competenceId"],
    where: {
      tenantId,
      competenceId: { in: cible.competenceIds },
      ...siteFilter,
    },
    _count: { _all: true },
  });
  const activite = new Map(
    activiteBrute.flatMap((a) => (a.competenceId ? ([[a.competenceId, a._count._all]] as const) : []))
  );

  // Les claims du handler : périmètre du site porté par l'événement (null =
  // tenant entier), même lecture que `resolveSiteScope` côté sélecteur.
  const claims = {
    role: "TENANT_ADMIN",
    siteId: event.siteId,
    siteIds: event.siteId ? [event.siteId] : null,
  };

  const bilan = await comblerTrous(
    tenantId,
    claims,
    prioriteParActivite(trous, activite),
    "auto:banque-alimentee",
    { max: TROUS_MAX_PAR_DEPOT }
  );

  console.info("[learnos/banque-alimentee] banque alimentée", {
    tenantId,
    niveau: cible.niveau,
    evenement: event.eventType,
    competences: cible.competenceIds.length,
    trous: bilan.trousTotal,
    considérés: bilan.trousConsideres,
    générées: bilan.generees,
    rejetées: bilan.rejetees,
    échecs: bilan.echecs,
    budgetÉpuisé: bilan.budgetEpuise,
    iaIndisponible: bilan.iaIndisponible,
  });
}
