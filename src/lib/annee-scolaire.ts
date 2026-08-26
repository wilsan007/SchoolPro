/**
 * SchoolPro — Source unique de vérité pour l'année scolaire courante.
 * ============================================================
 * Remplace les lectures directes de `Tenant.currentYear` qui
 * peuvent être désynchronisées de la table `annees_scolaires`.
 *
 * @deprecated Tenant.currentYear — utiliser getAnneeCourante() à la place.
 *
 * Gestion du cycle de vie d'une année scolaire :
 *   OUVERTE → CLOTUREE → ARCHIVEE
 *
 * Règles :
 *   — Une seule année OUVERTE par tenant à la fois (isCurrent).
 *   — Clôturer une année clôture aussi toutes ses périodes ouvertes.
 *   — Archiver exige que l'année soit d'abord clôturée.
 *   — L'année courante (isCurrent) ne peut pas être archivée directement :
 *     il faut d'abord basculer isCurrent sur une autre année.
 *
 * PÉRIODE ESTIVALE (trou entre deux années) :
 *   Pendant l'été, l'année écoulée est clôturée mais la nouvelle n'a pas
 *   encore commencé. On bascule en mode « préparation de rentrée » :
 *     — L'année isCurrent (à venir) devient l'année active pour la
 *       préparation : inscriptions, emplois du temps, dossiers, tarifs.
 *     — L'année écoulée reste accessible pour : bulletins, paiements en
 *       retard (encaissés et marqués « retard »), archives.
 *     — Une semaine avant la rentrée (dateDebut - 7j), toutes les options
 *       et modules de gestion sont activés (phase « pré-rentree »).
 */

import prisma from "@/lib/prisma";
import { getDemoDate, getDemoNow } from "@/lib/demo-now";
import type { AnneesScolaires } from "@prisma/client";

export type StatutAnnee = "OUVERTE" | "CLOTUREE" | "ARCHIVEE";

// ============================================================
// PÉRIODE ESTIVALE — contexte dual entre deux années
// ============================================================

/** Phase du cycle annuel. */
export type PhaseAnnee = "normale" | "estivale" | "pre_rentree";

/** Nombre de jours avant la rentrée pour activer la phase pré-rentree. */
const JOURS_PRE_RENTREE = 7;

/**
 * Contexte annuel complet, tenant compte de la période estivale.
 *
 * Pendant l'été (entre la fin de l'année écoulée et le début de la
 * nouvelle), on a besoin des DEUX années simultanément :
 *   — `anneePreparation` (isCurrent, à venir) pour préparer la rentrée
 *   — `anneeEcoulee` (clôturée) pour les bulletins et paiements en retard
 *
 * En période normale (durant l'année scolaire), `anneePreparation` et
 * `anneeEcoulee` peuvent être null — seule `anneeActive` compte.
 */
export interface ContexteAnnees {
  /** Phase du cycle : 'normale' (en cours), 'estivale' (été), 'pre_rentree' (J-7). */
  phase: PhaseAnnee;
  /** L'année à utiliser pour les NOUVELLES données (inscriptions, factures, etc.). */
  anneeActive: AnneesScolaires | null;
  /** L'année écoulée, accessible pour bulletins et paiements en retard. */
  anneeEcoulee: AnneesScolaires | null;
  /** L'année à venir (isCurrent). Identique à anneeActive en période estivale. */
  anneeAVenir: AnneesScolaires | null;
  /** Jours restants avant la rentrée (null hors période estivale). */
  joursAvantRentree: number | null;
}

/**
 * Détermine le contexte annuel complet pour un tenant.
 *
 * Logique :
 *   1. Trouver l'année isCurrent (à venir ou en cours).
 *   2. Trouver l'année écoulée (dernière année dont dateFin < maintenant).
 *   3. Si maintenant est dans [dateFin écoulée, dateDebut à venir] :
 *      → période estivale ou pré-rentree.
 *   4. Si maintenant < dateDebut à venir - 7j → 'estivale' (préparation).
 *   5. Si maintenant ≥ dateDebut à venir - 7j → 'pre_rentree' (tout activé).
 *   6. Sinon → 'normale'.
 */
export async function getContexteAnnees(tenantId: string): Promise<ContexteAnnees> {
  const maintenant = await getDemoNow();

  const annees = await prisma.anneesScolaires.findMany({
    where: { tenantId },
    orderBy: { dateDebut: "desc" },
  });

  const anneeAVenir = annees.find((a) => a.isCurrent) ?? null;
  const anneeEcoulee = annees.find((a) => a.dateFin < maintenant) ?? null;

  // Cas 1 : une année contient aujourd'hui → période normale
  const contenante = annees.find((a) => a.dateDebut <= maintenant && a.dateFin >= maintenant);
  if (contenante) {
    return {
      phase: "normale",
      anneeActive: contenante,
      anneeEcoulee: null,
      anneeAVenir: null,
      joursAvantRentree: null,
    };
  }

  // Cas 2 : trou estival — on a une année à venir (isCurrent) pas encore commencée
  if (anneeAVenir && anneeAVenir.dateDebut > maintenant) {
    const msAvantRentree = anneeAVenir.dateDebut.getTime() - maintenant.getTime();
    const joursAvantRentree = Math.ceil(msAvantRentree / (1000 * 60 * 60 * 24));

    const phase: PhaseAnnee = joursAvantRentree <= JOURS_PRE_RENTREE ? "pre_rentree" : "estivale";

    return {
      phase,
      anneeActive: anneeAVenir, // préparer la rentrée sur la nouvelle année
      anneeEcoulee,
      anneeAVenir,
      joursAvantRentree,
    };
  }

  // Cas 3 : pas d'année à venir, juste l'écoulée → on garde l'écoulée
  if (anneeEcoulee) {
    return {
      phase: "normale",
      anneeActive: anneeEcoulee,
      anneeEcoulee: null,
      anneeAVenir: null,
      joursAvantRentree: null,
    };
  }

  // Cas 4 : aucune année — tenant vide
  return {
    phase: "normale",
    anneeActive: anneeAVenir,
    anneeEcoulee: null,
    anneeAVenir: null,
    joursAvantRentree: null,
  };
}

/**
 * Retourne l'année scolaire courante pour un tenant donné.
 * Lit la table `annees_scolaires` (isCurrent = true) en priorité.
 * Si aucune année n'est marquée comme courante, retourne null
 * plutôt que de fallback sur une valeur hardcodée.
 */
export async function getAnneeCourante(tenantId: string) {
  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId, isCurrent: true },
  });

  if (annee) return annee;

  // Fallback: dernière année par date de fin (au cas où isCurrent n'est pas set)
  const latest = await prisma.anneesScolaires.findFirst({
    where: { tenantId },
    orderBy: { dateFin: "desc" },
  });

  return latest ?? null;
}

/**
 * Année scolaire contenant une date donnée.
 *
 * `isCurrent` désigne l'année ACTIVE de l'établissement, pas l'année
 * chronologique : pendant l'été, l'année active peut être 2024-2025 alors que
 * la date réelle est en juillet 2025 — déjà dans 2025-2026. Sans cette
 * fonction, les compteurs basculaient d'une cohorte à l'autre au 1er juillet :
 * `isCurrent` = 2025-2026, tout calcul rapporté au début de cette année
 * devenait incohérent : le numéro de semaine repassait à 1 (l'écart étant
 * négatif, il était écrasé par le `Math.max(1, …)` de `semaineScolaire`), et
 * les compteurs mélangeaient les deux cohortes.
 *
 * Replie sur l'année courante si aucune ne contient la date — cas des vacances
 * entre deux années, où il n'existe pas d'année « en cours ».
 */
export async function anneeALaDate(tenantId: string, date: Date) {
  const contenante = await prisma.anneesScolaires.findFirst({
    where: { tenantId, dateDebut: { lte: date }, dateFin: { gte: date } },
  });
  if (contenante) return contenante;

  // Trou estival entre deux années.
  // L'année isCurrent (à venir) est l'année active pour la préparation :
  // inscriptions, emplois du temps, dossiers. On la retourne en priorité.
  const courante = await getAnneeCourante(tenantId);
  if (courante) return courante;

  // Pas d'année isCurrent : prendre l'année la plus récente dont la fin est passée.
  const derniereTerminee = await prisma.anneesScolaires.findFirst({
    where: { tenantId, dateFin: { lt: date } },
    orderBy: { dateFin: "desc" },
  });
  return derniereTerminee ?? null;
}

/**
 * Année contenant le « maintenant » applicatif.
 *
 * Variante sans argument d'`anneeALaDate`, pour les fonctions qui n'ont pas de
 * date sous la main. `getDemoNow()` rend la date simulée en contexte de requête
 * et l'heure réelle ailleurs (scripts, cron) : le repli est donc toujours le
 * bon, et un traitement de fond continue de voir l'année réellement en cours.
 *
 * À préférer partout où l'on écrivait `findFirst({ isCurrent: true })` pour
 * répondre à la question « quelle année sommes-nous ? ». `isCurrent` reste
 * légitime pour désigner l'année ACTIVE de l'établissement — celle qu'on ouvre,
 * clôture ou archive — qui ne dépend pas de la date affichée.
 */
export async function anneeAffichee(tenantId: string) {
  return anneeALaDate(tenantId, await getDemoNow());
}

/**
 * Année scolaire à utiliser selon le contexte d'exécution.
 *
 * - Time Machine **inactive** → `getAnneeCourante()` : l'année marquée
 *   `isCurrent` dans la base, c'est-à-dire l'année réellement active pour
 *   l'établissement (celle qu'on ouvre, clôture, archive).
 * - Time Machine **active** → `anneeAffichee()` : l'année contenant la
 *   date simulée, pour que les indicateurs et requêtes suivent le curseur.
 * - **Période estivale** → l'année `isCurrent` (à venir) est retournée
 *   pour permettre la préparation de la rentrée (inscriptions, emplois du
 *   temps, dossiers). L'année écoulée reste accessible via
 *   `getContexteAnnees().anneeEcoulee`.
 *
 * C'est la fonction à appeler partout où l'on veut « l'année en cours »
 * sans savoir si l'utilisateur fait une démonstration ou non.
 */
export async function anneeActive(tenantId: string) {
  const demoDate = await getDemoDate();
  if (demoDate) {
    // Time Machine : utiliser la date simulée, mais si on est dans le trou
    // estival, privilégier l'année isCurrent (à venir) plutôt que l'écoulée.
    const contenante = await prisma.anneesScolaires.findFirst({
      where: { tenantId, dateDebut: { lte: demoDate }, dateFin: { gte: demoDate } },
    });
    if (contenante) return contenante;

    // Trou estival : retourner l'année isCurrent si elle n'a pas encore commencé
    const courante = await getAnneeCourante(tenantId);
    if (courante) return courante;

    // Sinon, dernière termininée
    return anneeALaDate(tenantId, demoDate);
  }
  return getAnneeCourante(tenantId);
}

/**
 * ID de l'année active selon le contexte (cf. `anneeActive`).
 *
 * Pratique pour filtrer les requêtes Prisma par `anneeId` sans avoir
 * à destructurer l'objet complet. Retourne `null` si aucune année
 * n'existe pour ce tenant — l'appelant doit alors décider s'il filtre
 * ou non (ne pas filtrer = comportement historique, toutes années).
 */
export async function anneeActiveId(tenantId: string): Promise<string | null> {
  const annee = await anneeActive(tenantId);
  return annee?.id ?? null;
}

/**
 * Libellé de l'année active selon le contexte (cf. `anneeActive`).
 */
export async function anneeActiveLibelle(tenantId: string): Promise<string | null> {
  const annee = await anneeActive(tenantId);
  return annee?.libelle ?? null;
}

/**
 * Fenêtre [début ; fin] de l'année contenant `date`, ou `null`.
 *
 * Sert à cantonner un compteur à SA cohorte : sans elle, « factures en retard »
 * ou « incidents ouverts » cumulent les années et affichent le même total du
 * premier au dernier jour des deux cohortes.
 */
export async function fenetreAnneeALaDate(
  tenantId: string,
  date: Date
): Promise<{ gte: Date; lte: Date } | null> {
  const annee = await anneeALaDate(tenantId, date);
  return annee ? { gte: annee.dateDebut, lte: annee.dateFin } : null;
}

/**
 * Retourne le libellé de l'année courante (ex: "2025-2026").
 * Pratique pour les requêtes qui filtrent par `annee` string.
 *
 * ⚠️ Respecte la Time Machine : utilise `anneeActive()` qui choisit
 * `getAnneeCourante()` (drapeau `isCurrent`) en usage normal, ou
 * `anneeAffichee()` (intervalle de dates) quand la Time Machine est active.
 */
export async function getAnneeCouranteLibelle(tenantId: string): Promise<string | null> {
  const annee = await anneeActive(tenantId);
  return annee?.libelle ?? null;
}

/**
 * Active une année scolaire pour un tenant et désactive les autres.
 * Garantit qu'une seule année est active à la fois.
 */
export async function setAnneeCourante(tenantId: string, anneeId: string) {
  // Vérifier que l'année appartient bien au tenant
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId },
  });
  if (!annee) throw new Error("Année scolaire introuvable pour ce tenant");

  // Transaction : désactiver toutes les autres, activer celle-ci
  await prisma.$transaction([
    prisma.anneesScolaires.updateMany({
      where: { tenantId, isCurrent: true },
      data: { isCurrent: false },
    }),
    prisma.anneesScolaires.update({
      where: { id: anneeId },
      data: { isCurrent: true },
    }),
  ]);
}

// ============================================================
// CYCLE DE VIE : OUVERTE → CLOTUREE → ARCHIVEE
// ============================================================

/** Vérifie qu'une année peut être clôturée. */
export function peutCloturer(annee: Pick<AnneesScolaires, "statut">): boolean {
  return annee.statut === "OUVERTE";
}

/** Vérifie qu'une année peut être archivée. */
export function peutArchiver(
  annee: Pick<AnneesScolaires, "statut" | "isCurrent">
): boolean {
  return annee.statut === "CLOTUREE" && !annee.isCurrent;
}

/** Vérifie qu'une année clôturée peut être réouverte. */
export function peutReouvrir(annee: Pick<AnneesScolaires, "statut">): boolean {
  return annee.statut === "CLOTUREE";
}

/**
 * Clôture une année scolaire : passe son statut à CLOTUREE, clôture toutes
 * ses périodes encore ouvertes, et enregistre la date et l'auteur.
 */
export async function cloturerAnnee(
  anneeId: string,
  userId: string
): Promise<AnneesScolaires> {
  return prisma.$transaction(async (tx) => {
    const annee = await tx.anneesScolaires.findUniqueOrThrow({
      where: { id: anneeId },
    });

    if (!peutCloturer(annee)) {
      throw new Error(
        `L'année ne peut pas être clôturée (statut actuel: ${annee.statut})`
      );
    }

    // Clôturer toutes les périodes encore ouvertes
    await tx.periode.updateMany({
      where: { anneeId, statut: "OUVERTE" },
      data: { statut: "CLOTUREE", cloturedAt: new Date() },
    });

    return tx.anneesScolaires.update({
      where: { id: anneeId },
      data: {
        statut: "CLOTUREE",
        cloturedAt: new Date(),
        cloturePar: userId,
      },
    });
  });
}

/**
 * Réouvre une année clôturée : repasse à OUVERTE et rouvre les périodes
 * qui étaient clôturées en même temps que l'année.
 */
export async function reouvrirAnnee(
  anneeId: string,
  _userId: string
): Promise<AnneesScolaires> {
  return prisma.$transaction(async (tx) => {
    const annee = await tx.anneesScolaires.findUniqueOrThrow({
      where: { id: anneeId },
    });

    if (!peutReouvrir(annee)) {
      throw new Error(
        `L'année ne peut pas être réouverte (statut actuel: ${annee.statut})`
      );
    }

    // Rouvrir les périodes clôturées en même temps que l'année
    if (annee.cloturedAt) {
      await tx.periode.updateMany({
        where: {
          anneeId,
          statut: "CLOTUREE",
          cloturedAt: annee.cloturedAt,
        },
        data: { statut: "OUVERTE", cloturedAt: null },
      });
    }

    return tx.anneesScolaires.update({
      where: { id: anneeId },
      data: {
        statut: "OUVERTE",
        cloturedAt: null,
        cloturePar: null,
      },
    });
  });
}

/**
 * Archive une année clôturée : point de non-retour. L'année doit être
 * CLOTUREE et ne pas être l'année courante (isCurrent = false).
 */
export async function archiverAnnee(
  anneeId: string,
  userId: string
): Promise<AnneesScolaires> {
  return prisma.$transaction(async (tx) => {
    const annee = await tx.anneesScolaires.findUniqueOrThrow({
      where: { id: anneeId },
    });

    if (!peutArchiver(annee)) {
      const raison = annee.isCurrent
        ? "L'année courante ne peut pas être archivée. Basculez isCurrent sur une autre année d'abord."
        : `L'année doit être clôturée avant archivage (statut actuel: ${annee.statut})`;
      throw new Error(raison);
    }

    return tx.anneesScolaires.update({
      where: { id: anneeId },
      data: {
        statut: "ARCHIVEE",
        archiveeAt: new Date(),
        archiveePar: userId,
      },
    });
  });
}

/**
 * Définit une année comme année courante.
 * Désactive isCurrent sur toutes les autres années du tenant.
 */
export async function definirAnneeCourante(
  anneeId: string,
  tenantId: string
): Promise<AnneesScolaires> {
  return prisma.$transaction(async (tx) => {
    await tx.anneesScolaires.updateMany({
      where: { tenantId, isCurrent: true },
      data: { isCurrent: false },
    });

    return tx.anneesScolaires.update({
      where: { id: anneeId },
      data: { isCurrent: true, statut: "OUVERTE" },
    });
  });
}

/**
 * Liste les années d'un tenant avec un résumé : nombre de périodes,
 * nombre d'événements, statut.
 */
export async function listerAnneesAvecResume(tenantId: string) {
  const annees = await prisma.anneesScolaires.findMany({
    where: { tenantId },
    include: {
      _count: {
        select: {
          periodes: true,
          evenements: true,
          learnosPlanifications: true,
        },
      },
    },
    orderBy: { dateDebut: "desc" },
  });

  return annees;
}
