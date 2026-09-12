import type { SessionSiteClaims } from "@/lib/site-scope";

// --- Nouvelles bibliothèques d'intelligence (outils fermés étendus) ---

import { tableauIntelligenceDirecteur, calculerISP, calculerIVF, calculerICS } from "@/lib/learnos/direction-intelligence";
import { calculerRisqueDecrochage } from "@/lib/learnos/risque-decrochage";
import { simulerRemediation } from "@/lib/learnos/simulation-remediation";
import {
  analyserEfficacitePlans,
  analyserEfficaciteEnseignants,
  comparerTypesIntervention,
  mesurerAdoptionIA,
} from "@/lib/learnos/efficacite-pedagogique";
import { identifierNoeudsCritiques, validerPrerequisEmpiriquement } from "@/lib/learnos/graphe-curriculum";
import {
  calculerRisqueFamilles,
  calculerCoutParEleve,
  analyserDepassementsBudget,
  analyserEfficaciteRelances,
  calculerDelaiPaiement,
  calculerTauxAdmission,
} from "@/lib/learnos/finance-intelligence";
import {
  analyserCorrelationEngagement,
  analyserQuestionsFrequentes,
  analyserImpactAlertePaiement,
  analyserTauxValidationLien,
} from "@/lib/learnos/engagement-parental";
import {
  calculerTauxCouverture,
  identifierCreneauxOrphelins,
  prioriserRemplacements,
  identifierSallesGoulot,
} from "@/lib/learnos/couverture-remplacements";
import { calculerCourbeOubli, genererAlerteVacances } from "@/lib/learnos/courbe-oubli";
import {
  analyserBesoinsSpeciauxInterventions,
  analyserEquiteInterSite,
  analyserRepresentationGenre,
  comparerInternesExternes,
} from "@/lib/learnos/equite-inclusion";
import {
  analyserEcartGenre,
  comparerBoursiers,
  analyserEfficaciteRedoublement,
  analyserMotifsTransfert,
  calculerProbabiliteDiplomation,
  predireRemplissageClasses,
} from "@/lib/learnos/trajectoires-cohortes";
import { clustererEleves, apparierTutorat } from "@/lib/learnos/clustering-eleves";
import {
  analyserCorrelationInfirmerie,
  identifierHotspotsIncidents,
  analyserEfficaciteEntretiens,
  analyserNotificationParents,
} from "@/lib/learnos/climat-bien-etre";
import {
  analyserReussiteSuperieure,
  analyserInsertionParFiliere,
  analyserReseauAlumni,
} from "@/lib/learnos/alumni-intelligence";

// ---------------------------------------------------------------------------
// Fonctions d'exécution des 14 nouveaux outils fermés
// ---------------------------------------------------------------------------

export async function analyserIntelligence(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "indices_complets") {
    const tableau = await tableauIntelligenceDirecteur(tenantId, claims);
    return { dimension: "indices_complets", tableau };
  }

  if (dimension === "isp") {
    const isp = await calculerISP(tenantId, claims);
    return { dimension: "isp", isp };
  }

  if (dimension === "ivf") {
    const ivf = await calculerIVF(tenantId, claims);
    return { dimension: "ivf", ivf };
  }

  if (dimension === "ics") {
    const ics = await calculerICS(tenantId, claims);
    return { dimension: "ics", ics };
  }

  return { dimension, message: "Dimension non reconnue pour l'intelligence." };
}

export async function analyserRisqueDecrochage(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  const synthese = await calculerRisqueDecrochage(tenantId, claims);

  if (dimension === "synthese") {
    return {
      dimension: "synthese",
      totalEleves: synthese.totalEleves,
      risqueEleve: synthese.risqueEleve,
      risqueModere: synthese.risqueModere,
      risqueFaible: synthese.risqueFaible,
      decrochageSilencieux: synthese.decrochageSilencieux,
    };
  }

  if (dimension === "eleves_risque_eleve") {
    const elevesRisqueEleve = synthese.eleves.filter((e) => e.niveau === "ELEVE");
    return {
      dimension: "eleves_risque_eleve",
      nombre: elevesRisqueEleve.length,
      eleves: elevesRisqueEleve.map((e) => ({
        classeNom: e.classeNom,
        niveau: e.niveau,
        decrochageSilencieux: e.decrochageSilencieux,
        moyenneActuelle: e.moyenneActuelle,
        signaux: e.signaux,
      })),
    };
  }

  if (dimension === "decrochage_silencieux") {
    const silencieux = synthese.eleves.filter((e) => e.decrochageSilencieux);
    return {
      dimension: "decrochage_silencieux",
      nombre: silencieux.length,
      eleves: silencieux.map((e) => ({
        classeNom: e.classeNom,
        niveau: e.niveau,
        moyenneActuelle: e.moyenneActuelle,
        signaux: e.signaux,
      })),
    };
  }

  return { dimension, message: "Dimension non reconnue pour le risque de décrochage." };
}

export async function simulerRemediationOutil(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  const resultat = await simulerRemediation(tenantId, claims);

  if (dimension === "scenarios_priorises") {
    return {
      dimension: "scenarios_priorises",
      scenarios: resultat.scenariosPriorises,
    };
  }

  if (dimension === "impact_total") {
    return {
      dimension: "impact_total",
      totalElevesARisque: resultat.totalElevesARisque,
      totalElevesSauvables: resultat.totalElevesSauvables,
      coutTotalOptimal: resultat.coutTotalOptimal,
      deltaMoyenParType: resultat.deltaMoyenParType,
    };
  }

  return { dimension, message: "Dimension non reconnue pour la simulation de remédiation." };
}

export async function analyserEfficacitePedagogique(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "efficacite_plans") {
    const efficacite = await analyserEfficacitePlans(tenantId, claims);
    return { dimension: "efficacite_plans", efficacite };
  }

  if (dimension === "progression_enseignants") {
    const enseignants = await analyserEfficaciteEnseignants(tenantId, claims);
    return { dimension: "progression_enseignants", enseignants };
  }

  if (dimension === "types_intervention") {
    const types = await comparerTypesIntervention(tenantId, claims);
    return { dimension: "types_intervention", types };
  }

  if (dimension === "adoption_ia") {
    const adoption = await mesurerAdoptionIA(tenantId, claims);
    return { dimension: "adoption_ia", adoption };
  }

  return { dimension, message: "Dimension non reconnue pour l'efficacité pédagogique." };
}

export async function analyserGrapheCurriculum(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "noeuds_critiques") {
    const noeuds = await identifierNoeudsCritiques(tenantId, claims);
    return { dimension: "noeuds_critiques", noeuds };
  }

  if (dimension === "validation_prerequis") {
    const validations = await validerPrerequisEmpiriquement(tenantId, claims);
    return { dimension: "validation_prerequis", validations };
  }

  return { dimension, message: "Dimension non reconnue pour le graphe curriculum." };
}

export async function analyserFinanceIntelligence(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "risque_familles") {
    const risque = await calculerRisqueFamilles(tenantId, claims);
    return { dimension: "risque_familles", risque };
  }

  if (dimension === "cout_par_eleve") {
    const cout = await calculerCoutParEleve(tenantId, claims);
    return { dimension: "cout_par_eleve", cout };
  }

  if (dimension === "depassements_budget") {
    const depassements = await analyserDepassementsBudget(tenantId, claims);
    return { dimension: "depassements_budget", depassements };
  }

  if (dimension === "efficacite_relances") {
    const relances = await analyserEfficaciteRelances(tenantId, claims);
    return { dimension: "efficacite_relances", relances };
  }

  if (dimension === "delai_paiement") {
    const delai = await calculerDelaiPaiement(tenantId, claims);
    return { dimension: "delai_paiement", delai };
  }

  if (dimension === "taux_admission") {
    const taux = await calculerTauxAdmission(tenantId, claims);
    return { dimension: "taux_admission", taux };
  }

  return { dimension, message: "Dimension non reconnue pour l'intelligence financière." };
}

export async function analyserEngagementParental(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "correlation_mastery") {
    const correlation = await analyserCorrelationEngagement(tenantId, claims);
    return { dimension: "correlation_mastery", correlation };
  }

  if (dimension === "questions_frequentes") {
    const questions = await analyserQuestionsFrequentes(tenantId, claims);
    return { dimension: "questions_frequentes", questions };
  }

  if (dimension === "impact_alertes") {
    const impact = await analyserImpactAlertePaiement(tenantId, claims);
    return { dimension: "impact_alertes", impact };
  }

  if (dimension === "validation_lien") {
    const validation = await analyserTauxValidationLien(tenantId, claims);
    return { dimension: "validation_lien", validation };
  }

  return { dimension, message: "Dimension non reconnue pour l'engagement parental." };
}

export async function analyserCouverture(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "taux_couverture") {
    const taux = await calculerTauxCouverture(tenantId, claims);
    return { dimension: "taux_couverture", taux };
  }

  if (dimension === "creneaux_orphelins") {
    const creneaux = await identifierCreneauxOrphelins(tenantId, claims);
    return { dimension: "creneaux_orphelins", creneaux };
  }

  if (dimension === "priorisation") {
    const priorisation = await prioriserRemplacements(tenantId, claims);
    return { dimension: "priorisation", priorisation };
  }

  if (dimension === "salles_goulot") {
    const salles = await identifierSallesGoulot(tenantId, claims);
    return { dimension: "salles_goulot", salles };
  }

  return { dimension, message: "Dimension non reconnue pour la couverture des remplacements." };
}

export async function analyserCourbeOubli(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "demi_vie") {
    const courbe = await calculerCourbeOubli(tenantId, claims);
    return { dimension: "demi_vie", courbe };
  }

  if (dimension === "alerte_vacances") {
    const alerte = await genererAlerteVacances(tenantId, claims);
    return { dimension: "alerte_vacances", alerte };
  }

  return { dimension, message: "Dimension non reconnue pour la courbe d'oubli." };
}

export async function analyserEquite(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "besoins_speciaux") {
    const besoins = await analyserBesoinsSpeciauxInterventions(tenantId, claims);
    return { dimension: "besoins_speciaux", besoins };
  }

  if (dimension === "equite_inter_site") {
    const equite = await analyserEquiteInterSite(tenantId, claims);
    return { dimension: "equite_inter_site", equite };
  }

  if (dimension === "representation_genre") {
    const genre = await analyserRepresentationGenre(tenantId, claims);
    return { dimension: "representation_genre", genre };
  }

  if (dimension === "internes_externes") {
    const comparaison = await comparerInternesExternes(tenantId, claims);
    return { dimension: "internes_externes", comparaison };
  }

  return { dimension, message: "Dimension non reconnue pour l'équité et l'inclusion." };
}

export async function analyserTrajectoires(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "ecart_genre") {
    const ecart = await analyserEcartGenre(tenantId, claims);
    return { dimension: "ecart_genre", ecart };
  }

  if (dimension === "boursiers") {
    const boursiers = await comparerBoursiers(tenantId, claims);
    return { dimension: "boursiers", boursiers };
  }

  if (dimension === "redoublement") {
    const redoublement = await analyserEfficaciteRedoublement(tenantId, claims);
    return { dimension: "redoublement", redoublement };
  }

  if (dimension === "motifs_transfert") {
    const motifs = await analyserMotifsTransfert(tenantId, claims);
    return { dimension: "motifs_transfert", motifs };
  }

  if (dimension === "diplomation") {
    const diplomation = await calculerProbabiliteDiplomation(tenantId, claims);
    return { dimension: "diplomation", diplomation };
  }

  if (dimension === "remplissage_classes") {
    const remplissage = await predireRemplissageClasses(tenantId, claims);
    return { dimension: "remplissage_classes", remplissage };
  }

  return { dimension, message: "Dimension non reconnue pour les trajectoires et cohortes." };
}

export async function analyserClustering(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "clusters") {
    const clusters = await clustererEleves(tenantId, claims);
    return { dimension: "clusters", clusters };
  }

  if (dimension === "tutorat") {
    const tutorat = await apparierTutorat(tenantId, claims);
    return { dimension: "tutorat", tutorat };
  }

  return { dimension, message: "Dimension non reconnue pour le clustering d'élèves." };
}

export async function analyserClimat(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "correlation_infirmerie") {
    const correlation = await analyserCorrelationInfirmerie(tenantId, claims);
    return { dimension: "correlation_infirmerie", correlation };
  }

  if (dimension === "hotspots_incidents") {
    const hotspots = await identifierHotspotsIncidents(tenantId, claims);
    return { dimension: "hotspots_incidents", hotspots };
  }

  if (dimension === "efficacite_entretiens") {
    const entretiens = await analyserEfficaciteEntretiens(tenantId, claims);
    return { dimension: "efficacite_entretiens", entretiens };
  }

  if (dimension === "notification_parents") {
    const notification = await analyserNotificationParents(tenantId, claims);
    return { dimension: "notification_parents", notification };
  }

  return { dimension, message: "Dimension non reconnue pour le climat et le bien-être." };
}

export async function analyserAlumni(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "reussite_superieure") {
    const reussite = await analyserReussiteSuperieure(tenantId, claims);
    return { dimension: "reussite_superieure", reussite };
  }

  if (dimension === "insertion_par_filiere") {
    const insertion = await analyserInsertionParFiliere(tenantId, claims);
    return { dimension: "insertion_par_filiere", insertion };
  }

  if (dimension === "reseau_alumni") {
    const reseau = await analyserReseauAlumni(tenantId, claims);
    return { dimension: "reseau_alumni", reseau };
  }

  return { dimension, message: "Dimension non reconnue pour les alumni." };
}
