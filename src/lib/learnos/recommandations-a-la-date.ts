/**
 * Recommandations cohérentes avec les profils AFFICHÉS.
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * `profile-recompute` recale les profils sur les preuves connues à la date
 * simulée. Les recommandations, elles, sont un ÉTAT stocké — celui de la
 * dernière preuve de l'année — et `createdAt` ne porte aucune information dans
 * le jeu de démonstration : l'horizon ne peut donc pas les borner.
 *
 * Les deux finissaient par se contredire à l'écran : une compétence affichée
 * « À reprendre » en octobre n'avait aucune action, parce que l'élève l'avait
 * acquise en juin et que la recommandation n'existait plus (ou pas encore).
 * Les compteurs « actions à mener » restaient à zéro devant une liste de
 * compétences non acquises.
 *
 * Ce module rejoue donc les règles du moteur (`evaluerBande`,
 * `statutParDefaut`, `formuler`) sur les profils recalculés. Rien n'est écrit
 * en base : c'est une vue, comme l'horizon.
 *
 * Il s'applique aussi hors date simulée : la fiche élève affiche toujours des
 * profils recalculés depuis les preuves, et une recommandation absente de la
 * base (import, reprise de données, recalcul en attente) laisserait de la même
 * façon une compétence non acquise sans action en regard.
 */

import type { NiveauRecommandation, StatutRecommandation } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { EtatPrerequis } from "@/lib/learnos/learning-twin";
import {
  evaluerBande,
  statutParDefaut,
  formuler,
  choisirSeuils,
  type LigneSeuils,
  type Seuils,
} from "@/lib/learnos/recommendation-engine";

/** Profondeur maximale du parcours en aval — même garde-fou que le moteur. */
const PROFONDEUR_MAX_AVAL = 5;

export interface ProfilALaDate {
  competenceId: string;
  masteryScore: number;
  confidenceScore: number;
  trend: string;
  masteryStatus: string;
  prerequisiteStatus: unknown;
  competence: {
    libelle: string;
    chapitre: { niveau: string; matiere: { id: string } } | null;
  };
}

export interface RecommandationAffichee {
  id: string;
  competenceId: string;
  niveau: NiveauRecommandation;
  statut: StatutRecommandation;
  motif: string;
  actionProposee: string;
  regleDeclenchee: string;
  motifParams: unknown;
  competencesBloquees: number;
}

/**
 * Recommandations qu'aurait portées chaque profil à la date simulée.
 *
 * - Compétence sans preuve à cette date (`UNKNOWN`) : rien — on ne recommande
 *   pas sur ce qu'on n'a pas encore mesuré.
 * - Bande inchangée par rapport à la recommandation stockée : celle-ci est
 *   rendue telle quelle, avec sa décision humaine éventuelle.
 * - Bande différente, ou aucune recommandation stockée : elle est reformulée
 *   par le moteur. Une décision humaine (acceptée / écartée) est conservée.
 */
export function recommandationsALaDate(
  profils: ProfilALaDate[],
  stockees: RecommandationAffichee[],
  seuilsPour: (profil: ProfilALaDate) => Seuils,
  competencesEnAval: (competenceId: string) => number
): RecommandationAffichee[] {
  const stockeeParCompetence = new Map(stockees.map((r) => [r.competenceId, r]));
  const resultat: RecommandationAffichee[] = [];

  for (const profil of profils) {
    if (profil.masteryStatus === "UNKNOWN") continue;

    const seuils = seuilsPour(profil);
    const bande = evaluerBande(profil, seuils);
    const stockee = stockeeParCompetence.get(profil.competenceId);

    if (bande === null) {
      // Confiance insuffisante : le moteur se tait, mais une décision humaine
      // n'est jamais effacée par un recalcul.
      if (stockee && estDecideeParUnHumain(stockee)) resultat.push(stockee);
      continue;
    }
    if (bande === "CONSOLIDE") continue;

    if (stockee && stockee.niveau === bande) {
      resultat.push(stockee);
      continue;
    }

    const prerequis = Array.isArray(profil.prerequisiteStatus)
      ? (profil.prerequisiteStatus as EtatPrerequis[])
      : [];
    const manquants = prerequis.filter((p) => !p.acquis);
    const bloquees = competencesEnAval(profil.competenceId);
    const formulation = formuler(bande, profil.competence.libelle, manquants, bloquees);

    resultat.push({
      id: stockee?.id ?? `date-${profil.competenceId}`,
      competenceId: profil.competenceId,
      niveau: bande,
      statut:
        stockee && estDecideeParUnHumain(stockee)
          ? stockee.statut
          : statutParDefaut(bande, bloquees, seuils),
      motif: formulation.motif,
      actionProposee: formulation.actionProposee,
      regleDeclenchee: formulation.regleDeclenchee,
      motifParams: formulation.params,
      competencesBloquees: bloquees,
    });
  }

  return resultat;
}

function estDecideeParUnHumain(reco: RecommandationAffichee): boolean {
  return reco.statut === "ACCEPTEE" || reco.statut === "ECARTEE";
}

/**
 * Compteur de compétences en aval, à partir du graphe chargé en une requête.
 *
 * `compterCompetencesEnAval` du moteur interroge la base niveau par niveau,
 * compétence par compétence : acceptable pour un recalcul isolé, pas pour les
 * dizaines de compétences d'une fiche élève.
 */
export function compteurEnAval(graphe: GraphePrerequis): (competenceId: string) => number {
  const dependants = new Map<string, string[]>();
  for (const c of graphe) {
    for (const p of c.prerequis) {
      const liste = dependants.get(p.id);
      if (liste) liste.push(c.id);
      else dependants.set(p.id, [c.id]);
    }
  }

  return (competenceId) => {
    const vues = new Set<string>([competenceId]);
    let frontiere = [competenceId];
    for (let profondeur = 0; profondeur < PROFONDEUR_MAX_AVAL && frontiere.length > 0; profondeur++) {
      const suivantes: string[] = [];
      for (const id of frontiere) {
        for (const d of dependants.get(id) ?? []) {
          if (!vues.has(d)) {
            vues.add(d);
            suivantes.push(d);
          }
        }
      }
      frontiere = suivantes;
    }
    return vues.size - 1;
  };
}

export type GraphePrerequis = { id: string; prerequis: { id: string }[] }[];

/** Graphe de prérequis du tenant : chaque compétence et ce qu'elle exige. */
export function chargerGraphePrerequis(tenantId: string): Promise<GraphePrerequis> {
  // eslint-disable-next-line ecolpro/require-site-filter -- graphe de prérequis structurel, volontairement tenant-wide, cf. en-tête « ISOLATION » de recommendation-engine
  return prisma.competence.findMany({
    where: { tenantId },
    select: { id: true, prerequis: { select: { id: true } } },
  });
}

/**
 * Barème de seuils du tenant, du plus récent au plus ancien.
 *
 * Lu en une fois pour toutes les matières de la fiche : `resoudreSeuils`
 * coûterait un aller-retour par matière, soit plusieurs secondes sur un pooler
 * distant pour un élève de lycée.
 */
export function chargerBareme(tenantId: string): Promise<LigneSeuils[]> {
  // eslint-disable-next-line ecolpro/require-site-filter -- barème structurel, volontairement tenant-wide, cf. en-tête « ISOLATION » de recommendation-engine
  return prisma.seuilsRecommandation.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Variante branchée sur la base : tranche les seuils, charge le graphe de
 * prérequis si nécessaire, puis délègue à `recommandationsALaDate`.
 */
export async function recommandationsPourProfils(
  tenantId: string,
  profils: ProfilALaDate[],
  stockees: RecommandationAffichee[],
  bareme: LigneSeuils[],
  /** Graphe déjà en cours de chargement, si l'appelant l'a lancé en avance. */
  grapheEnAvance?: Promise<GraphePrerequis>
): Promise<RecommandationAffichee[]> {
  const seuilsParContexte = new Map<string, Seuils>();
  const seuilsPour = (p: ProfilALaDate) => {
    const niveau = p.competence.chapitre?.niveau ?? null;
    const matiereId = p.competence.chapitre?.matiere.id ?? null;
    const cle = `${niveau ?? ""}|${matiereId ?? ""}`;
    let seuils = seuilsParContexte.get(cle);
    if (!seuils) {
      // Même règle d'applicabilité que `resoudreSeuils` : une ligne vaut pour
      // tout niveau / toute matière quand elle n'en précise pas.
      seuils = choisirSeuils(
        bareme.filter(
          (l) =>
            (l.niveau === null || l.niveau === niveau) &&
            (l.matiereId === null || l.matiereId === matiereId)
        )
      );
      seuilsParContexte.set(cle, seuils);
    }
    return seuils;
  };

  // Le graphe ne sert qu'à formuler une recommandation absente ou dont la
  // bande a changé. Quand les recommandations stockées collent déjà aux
  // profils — le cas courant hors date simulée — il n'est pas chargé.
  const stockeeParCompetence = new Map(stockees.map((r) => [r.competenceId, r]));
  const aFormuler = profils.some((p) => {
    if (p.masteryStatus === "UNKNOWN") return false;
    const bande = evaluerBande(p, seuilsPour(p));
    if (bande === null || bande === "CONSOLIDE") return false;
    return stockeeParCompetence.get(p.competenceId)?.niveau !== bande;
  });

  const graphe = aFormuler ? await (grapheEnAvance ?? chargerGraphePrerequis(tenantId)) : [];

  return recommandationsALaDate(profils, stockees, seuilsPour, compteurEnAval(graphe));
}
