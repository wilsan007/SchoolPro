/**
 * EcolPro / LEARNOS — Suivi de classe
 * ===================================
 *
 * LE DOSSIER DE SUIVI UNIFIÉ
 * --------------------------
 * Les signaux d'un élève en difficulté sont aujourd'hui éparpillés dans quatre
 * modules qui ne se parlent pas : absences, notes, incidents, impayés. Pris
 * isolément, chacun paraît anodin — six absences, une moyenne en baisse, un
 * incident, une facture en retard. **Personne ne voit le tableau complet.**
 *
 * Croiser ces signaux est ce qui permet de repérer un décrochage avant qu'il
 * ne soit irréversible. C'est probablement la fonction la plus utile
 * socialement de toute l'application — et elle n'utilise aucun modèle : c'est
 * un simple croisement.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

/** Fenêtre d'observation des absences, en jours. */
const FENETRE_ABSENCES_JOURS = 30;

/** Nombre de signaux à partir duquel l'élève est considéré à surveiller. */
export const SIGNAUX_POUR_ALERTE = 2;

export type TypeSignal =
  | "absenteisme"
  | "competencesBloquees"
  | "incidents"
  | "impayes"
  | "parcoursEnRetard";

export interface EleveSuivi {
  id: string;
  nom: string;
  prenom: string;
  /** Signaux détectés, avec leur intensité. */
  signaux: { type: TypeSignal; valeur: number }[];
  /** `true` dès que plusieurs signaux se cumulent. */
  aSurveiller: boolean;
}

export interface SyntheseClasse {
  classeId: string;
  classeNom: string;
  effectif: number;
  aSurveiller: number;
  parcoursActifs: number;
  /** Compétences les moins acquises de la classe — où porter l'effort. */
  competencesFaibles: { competenceId: string; libelle: string; nbEleves: number }[];
  eleves: EleveSuivi[];
}

/**
 * Synthèse d'une classe : effectifs, signaux, points d'effort.
 *
 * Un seul aller-retour par famille de signaux, et non un par élève : à ~200 ms
 * la requête, interroger élève par élève rendrait l'écran inutilisable dès
 * trente inscrits.
 */
export async function syntheseClasse(
  tenantId: string,
  classeId: string,
  claims: SessionSiteClaims,
  maintenant: Date = new Date()
): Promise<SyntheseClasse | null> {
  const classe = await prisma.classe.findFirst({
    where: { id: classeId, tenantId, ...siteFilterForModel("classe", claims) },
    select: { id: true, nom: true },
  });
  if (!classe) return null;

  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      classeId,
      statut: "ACTIF",
      deletedAt: null,
      ...siteFilterForModel("eleve", claims),
    },
    select: { id: true, nom: true, prenom: true },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });
  if (eleves.length === 0) {
    return {
      classeId: classe.id, classeNom: classe.nom, effectif: 0, aSurveiller: 0,
      parcoursActifs: 0, competencesFaibles: [], eleves: [],
    };
  }

  const ids = eleves.map((e) => e.id);
  const depuis = new Date(maintenant.getTime() - FENETRE_ABSENCES_JOURS * 86_400_000);

  const [absences, bloquantes, incidents, impayes, parcours] = await Promise.all([
    prisma.absence.groupBy({
      by: ["eleveId"],
      where: {
        tenantId, eleveId: { in: ids }, statut: "INJUSTIFIEE",
        date: { gte: depuis }, ...siteFilterForModel("absence", claims),
      },
      _count: { eleveId: true },
    }),
    prisma.recommandation.groupBy({
      by: ["eleveId"],
      where: {
        tenantId, eleveId: { in: ids }, statut: "OBLIGATOIRE", resolueLe: null,
        ...siteFilterForModel("recommandation", claims),
      },
      _count: { eleveId: true },
    }),
    prisma.incident.groupBy({
      by: ["eleveId"],
      where: {
        tenantId, eleveId: { in: ids }, statut: { not: "CLASSE" },
        ...siteFilterForModel("incident", claims),
      },
      _count: { eleveId: true },
    }),
    prisma.facture.groupBy({
      by: ["eleveId"],
      where: {
        tenantId, eleveId: { in: ids }, statut: "EN_RETARD", ...siteFilterForModel("facture", claims),
      },
      _count: { eleveId: true },
    }),
    prisma.planProgression.findMany({
      where: {
        tenantId, eleveId: { in: ids }, statut: { in: ["ACTIF", "EN_REVUE"] },
        ...siteFilterForModel("planProgression", claims),
      },
      select: { eleveId: true, statut: true },
    }),
  ]);

  const compter = (l: { eleveId: string; _count: { eleveId: number } }[]) =>
    new Map(l.map((x) => [x.eleveId, x._count.eleveId]));

  const parAbsences = compter(absences);
  const parBloquantes = compter(bloquantes);
  const parIncidents = compter(incidents);
  const parImpayes = compter(impayes);
  const parcoursEnRetard = new Map<string, number>();
  for (const p of parcours) {
    if (p.statut === "EN_REVUE") {
      parcoursEnRetard.set(p.eleveId, (parcoursEnRetard.get(p.eleveId) ?? 0) + 1);
    }
  }

  const suivis: EleveSuivi[] = eleves.map((e) => {
    const signaux: EleveSuivi["signaux"] = [];
    // Trois absences injustifiées en un mois : en deçà, c'est du bruit.
    const abs = parAbsences.get(e.id) ?? 0;
    if (abs >= 3) signaux.push({ type: "absenteisme", valeur: abs });

    const bloq = parBloquantes.get(e.id) ?? 0;
    if (bloq > 0) signaux.push({ type: "competencesBloquees", valeur: bloq });

    const inc = parIncidents.get(e.id) ?? 0;
    if (inc > 0) signaux.push({ type: "incidents", valeur: inc });

    const imp = parImpayes.get(e.id) ?? 0;
    if (imp > 0) signaux.push({ type: "impayes", valeur: imp });

    const ret = parcoursEnRetard.get(e.id) ?? 0;
    if (ret > 0) signaux.push({ type: "parcoursEnRetard", valeur: ret });

    return {
      ...e,
      signaux,
      // Un signal isolé s'explique ; c'est leur CUMUL qui alerte. Un élève
      // absent une fois n'est pas en décrochage — un élève absent, en échec ET
      // avec des impayés, oui.
      aSurveiller: signaux.length >= SIGNAUX_POUR_ALERTE,
    };
  });

  // Compétences les moins acquises : où l'enseignant doit porter l'effort.
  const faibles = await prisma.studentLearningProfile.groupBy({
    by: ["competenceId"],
    where: {
      tenantId, eleveId: { in: ids },
      masteryStatus: { in: ["EMERGING", "DEVELOPING"] },
      ...siteFilterForModel("studentLearningProfile", claims),
    },
    _count: true,
    orderBy: { _count: { competenceId: "desc" } },
    take: 3,
  });

  const libelles = faibles.length
    ? await prisma.competence.findMany({
        where: { id: { in: faibles.map((f) => f.competenceId) }, tenantId },
        select: { id: true, libelle: true },
      })
    : [];
  const parId = new Map(libelles.map((c) => [c.id, c.libelle]));

  return {
    classeId: classe.id,
    classeNom: classe.nom,
    effectif: eleves.length,
    aSurveiller: suivis.filter((s) => s.aSurveiller).length,
    parcoursActifs: parcours.length,
    competencesFaibles: faibles.map((f) => ({
      competenceId: f.competenceId,
      libelle: parId.get(f.competenceId) ?? "—",
      nbEleves: f._count,
    })),
    eleves: suivis,
  };
}
