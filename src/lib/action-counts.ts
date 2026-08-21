import prisma from "@/lib/prisma";
import type { SessionSiteClaims } from "@/lib/site-scope";
import { siteFilterForModel, siteFilterForRelation } from "@/lib/site-scope";

/**
 * Compteurs pour les rubriques d'action du secrétariat et de la direction.
 *
 * Chaque compteur est une file d'attente qui pointe vers l'écran où agir.
 * Un chiffre sans action derrière n'a pas sa place ici.
 */

export interface RubricCount {
  key: string;
  label: string;
  href: string;
  count: number;
  icon: string;
  color: string;
}

export async function getSecretariatCounts(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<RubricCount[]> {
  const [
    inscriptionsEnAttente,
    dossiersIncomplets,
    absencesAJustifier,
    parentsSansCompte,
    convocationsBrouillon,
    communicationsPlanifiees,
  ] = await Promise.all([
    prisma.candidature.count({
      where: {
        tenantId,
        statut: "SOUMISE",
        ...siteFilterForModel("candidature", claims),
      },
    }),
    prisma.eleve.count({
      where: {
        tenantId,
        statut: "ACTIF",
        deletedAt: null,
        ...siteFilterForModel("eleve", claims),
        OR: [{ lieuNaissance: null }, { nationalite: null }],
      },
    }),
    prisma.absence.count({
      where: {
        tenantId,
        statut: "EN_ATTENTE",
        ...siteFilterForModel("absence", claims),
      },
    }),
    prisma.eleveParent.count({
      where: {
        parent: { tenantId, user: null },
        ...siteFilterForRelation(claims, "eleve"),
      },
    }),
    prisma.notification.count({
      where: {
        tenantId,
        statut: "BROUILLON",
        ...siteFilterForModel("notification", claims),
      },
    }),
    prisma.notification.count({
      where: {
        tenantId,
        statut: "PLANIFIEE",
        ...siteFilterForModel("notification", claims),
      },
    }),
  ]);

  return [
    { key: "admissions", label: "Admissions en attente", href: "/admissions", count: inscriptionsEnAttente, icon: "UserPlus", color: "text-teal-600" },
    { key: "dossiers", label: "Dossiers incomplets", href: "/eleves", count: dossiersIncomplets, icon: "FileText", color: "text-amber-600" },
    { key: "absences", label: "Absences à justifier", href: "/absences", count: absencesAJustifier, icon: "ClipboardList", color: "text-orange-600" },
    { key: "parents", label: "Parents sans compte", href: "/parents", count: parentsSansCompte, icon: "UserCheck", color: "text-pink-600" },
    { key: "brouillons", label: "Communications en brouillon", href: "/communication", count: convocationsBrouillon, icon: "Bell", color: "text-sky-600" },
    { key: "planifiees", label: "Communications programmées", href: "/communication", count: communicationsPlanifiees, icon: "Calendar", color: "text-indigo-600" },
  ];
}

export async function getDirectionCounts(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<RubricCount[]> {
  const [
    bulletinsAValider,
    facturesRetard,
    incidentsOuverts,
    remplacements,
    congesAApprouver,
    admissionsEnAttente,
    communicationsPlanifiees,
  ] = await Promise.all([
    prisma.bulletin.count({
      where: {
        tenantId,
        isPublie: false,
        ...siteFilterForModel("bulletin", claims),
      },
    }),
    prisma.facture.count({
      where: {
        tenantId,
        statut: "EN_RETARD",
        ...siteFilterForModel("facture", claims),
      },
    }),
    prisma.incident.count({
      where: {
        tenantId,
        statut: "OUVERT",
        ...siteFilterForModel("incident", claims),
      },
    }),
    prisma.remplacementCours.count({
      where: {
        tenantId,
        statut: "PROPOSE",
        ...siteFilterForModel("remplacementCours", claims),
      },
    }),
    // CongePersonnel n'a pas de siteId : filtre au niveau tenant uniquement.
    // eslint-disable-next-line ecolpro/require-site-filter -- pas de siteId sur ce modèle
    prisma.congePersonnel.count({
      where: {
        tenantId,
        statut: "DEMANDE",
      },
    }),
    prisma.candidature.count({
      where: {
        tenantId,
        statut: "SOUMISE",
        ...siteFilterForModel("candidature", claims),
      },
    }),
    prisma.notification.count({
      where: {
        tenantId,
        statut: "PLANIFIEE",
        ...siteFilterForModel("notification", claims),
      },
    }),
  ]);

  return [
    { key: "bulletins", label: "Bulletins à valider", href: "/notes/bulletins", count: bulletinsAValider, icon: "FileText", color: "text-blue-600" },
    { key: "factures", label: "Factures en retard", href: "/facturation", count: facturesRetard, icon: "Receipt", color: "text-amber-600" },
    { key: "incidents", label: "Incidents ouverts", href: "/vie-scolaire", count: incidentsOuverts, icon: "ShieldAlert", color: "text-red-600" },
    { key: "remplacements", label: "Remplacements à pourvoir", href: "/couverture", count: remplacements, icon: "UserX", color: "text-orange-600" },
    { key: "conges", label: "Congés à approuver", href: "/rh", count: congesAApprouver, icon: "Briefcase", color: "text-violet-600" },
    { key: "admissions", label: "Admissions en attente", href: "/admissions", count: admissionsEnAttente, icon: "UserPlus", color: "text-teal-600" },
    { key: "commPlanifiees", label: "Communications programmées", href: "/communication", count: communicationsPlanifiees, icon: "Calendar", color: "text-indigo-600" },
  ];
}

/**
 * Compteurs pour les rubriques d'action de l'enseignant.
 *
 * L'enseignant agit sur sa pédagogie : saisir les notes des évaluations
 * passées, traiter les recommandations, faire avancer ses plans de
 * progression, préparer ses séances et corriger les devoirs.
 */
export async function getTeacherCounts(
  tenantId: string,
  claims: SessionSiteClaims,
  userId: string,
  classeIds: string[] | null
): Promise<RubricCount[]> {
  const perimetre = classeIds ? { classeId: { in: classeIds } } : {};
  const maintenant = new Date();

  // Trouver l'enseignant pour filtrer par ses ressources.
  const enseignant = await prisma.enseignant.findFirst({
    where: {
      userId,
      tenantId,
      ...siteFilterForModel("enseignant", claims),
    },
    select: { id: true },
  });

  const [
    saisiesEnRetard,
    recommandationsATraiter,
    plansActifs,
    seancesAValider,
    devoirsACorriger,
    evaluationsAVenir,
  ] = await Promise.all([
    // Évaluations passées sans notes saisies
    prisma.evaluation.count({
      where: {
        tenantId,
        date: { lt: maintenant },
        statut: { not: "ANNULE" },
        notes: { none: {} },
        ...siteFilterForModel("evaluation", claims),
        ...perimetre,
      },
    }),
    // Recommandations obligatoires/recommandées non résolues
    prisma.recommandation.count({
      where: {
        tenantId,
        resolueLe: null,
        statut: { in: ["OBLIGATOIRE", "RECOMMANDEE"] },
        ...siteFilterForModel("recommandation", claims),
        ...(classeIds ? { eleve: { classeId: { in: classeIds } } } : {}),
      },
    }),
    // Plans de progression actifs ou en revue
    prisma.planProgression.count({
      where: {
        tenantId,
        statut: { in: ["ACTIF", "EN_REVUE"] },
        responsableUserId: userId,
        ...siteFilterForModel("planProgression", claims),
      },
    }),
    // Séances pédagogiques planifiées dont la date est passée (à valider comme effectuées)
    enseignant
      ? prisma.seancePedagogique.count({
          where: {
            tenantId,
            enseignantId: enseignant.id,
            statut: "PLANIFIEE",
            ...siteFilterForModel("seancePedagogique", claims),
          },
        })
      : Promise.resolve(0),
    // Devoirs à corriger (statut RENDU)
    enseignant
      ? prisma.devoir.count({
          where: {
            tenantId,
            enseignantId: enseignant.id,
            statut: "RENDU",
            ...siteFilterForModel("devoir", claims),
          },
        })
      : Promise.resolve(0),
    // Évaluations à venir (planifiées dans le futur)
    prisma.evaluation.count({
      where: {
        tenantId,
        date: { gte: maintenant },
        statut: "PLANIFIE",
        ...siteFilterForModel("evaluation", claims),
        ...perimetre,
      },
    }),
  ]);

  return [
    { key: "saisies", label: "Notes à saisir", href: "/evaluations", count: saisiesEnRetard, icon: "ClipboardList", color: "text-red-600" },
    { key: "recommandations", label: "Recommandations à traiter", href: "/recommandations", count: recommandationsATraiter, icon: "Lightbulb", color: "text-amber-600" },
    { key: "plans", label: "Plans de progression actifs", href: "/recommandations", count: plansActifs, icon: "TrendingUp", color: "text-blue-600" },
    { key: "seances", label: "Séances à valider", href: "/curriculum", count: seancesAValider, icon: "BookOpen", color: "text-teal-600" },
    { key: "devoirs", label: "Devoirs à corriger", href: "/cahier-de-texte", count: devoirsACorriger, icon: "FileEdit", color: "text-violet-600" },
    { key: "evaluationsAVenir", label: "Évaluations à venir", href: "/evaluations", count: evaluationsAVenir, icon: "Calendar", color: "text-indigo-600" },
  ];
}

/**
 * Compteurs pour les rubriques d'action du professeur principal.
 *
 * Le prof principal porte le dossier de suivi de sa classe : il croise
 * absences, incidents, bulletins et élèves à risque. Il a les permissions
 * de l'enseignant + vie-scolaire, bulletins et orientation sur sa classe.
 */
export async function getClassTeacherCounts(
  tenantId: string,
  claims: SessionSiteClaims,
  userId: string,
  classeIds: string[]
): Promise<RubricCount[]> {
  const maintenant = new Date();

  const enseignant = await prisma.enseignant.findFirst({
    where: {
      userId,
      tenantId,
      ...siteFilterForModel("enseignant", claims),
    },
    select: { id: true },
  });

  const [
    saisiesEnRetard,
    bulletinsAValider,
    incidentsClasse,
    absencesAJustifierClasse,
    elevesARisque,
    devoirsACorriger,
  ] = await Promise.all([
    // Évaluations passées sans notes (ses classes)
    prisma.evaluation.count({
      where: {
        tenantId,
        date: { lt: maintenant },
        statut: { not: "ANNULE" },
        notes: { none: {} },
        classeId: { in: classeIds },
        ...siteFilterForModel("evaluation", claims),
      },
    }),
    // Bulletins non publiés de ses classes
    prisma.bulletin.count({
      where: {
        tenantId,
        isPublie: false,
        eleve: { classeId: { in: classeIds } },
        ...siteFilterForModel("bulletin", claims),
      },
    }),
    // Incidents ouverts dans ses classes
    prisma.incident.count({
      where: {
        tenantId,
        statut: "OUVERT",
        eleve: { classeId: { in: classeIds } },
        ...siteFilterForModel("incident", claims),
      },
    }),
    // Absences en attente dans ses classes
    prisma.absence.count({
      where: {
        tenantId,
        statut: "EN_ATTENTE",
        eleve: { classeId: { in: classeIds } },
        ...siteFilterForModel("absence", claims),
      },
    }),
    // Élèves à risque (recommandations non résolues) dans ses classes
    prisma.recommandation.count({
      where: {
        tenantId,
        resolueLe: null,
        statut: "OBLIGATOIRE",
        eleve: { classeId: { in: classeIds } },
        ...siteFilterForModel("recommandation", claims),
      },
    }),
    // Devoirs à corriger
    enseignant
      ? prisma.devoir.count({
          where: {
            tenantId,
            enseignantId: enseignant.id,
            statut: "RENDU",
            ...siteFilterForModel("devoir", claims),
          },
        })
      : Promise.resolve(0),
  ]);

  return [
    { key: "saisies", label: "Notes à saisir", href: "/evaluations", count: saisiesEnRetard, icon: "ClipboardList", color: "text-red-600" },
    { key: "bulletins", label: "Bulletins à valider", href: "/notes/bulletins", count: bulletinsAValider, icon: "FileText", color: "text-blue-600" },
    { key: "incidents", label: "Incidents de ma classe", href: "/vie-scolaire", count: incidentsClasse, icon: "ShieldAlert", color: "text-red-600" },
    { key: "absences", label: "Absences à justifier", href: "/absences", count: absencesAJustifierClasse, icon: "UserX", color: "text-orange-600" },
    { key: "risque", label: "Élèves à risque", href: "/ma-classe", count: elevesARisque, icon: "AlertTriangle", color: "text-amber-600" },
    { key: "devoirs", label: "Devoirs à corriger", href: "/cahier-de-texte", count: devoirsACorriger, icon: "FileEdit", color: "text-violet-600" },
  ];
}
