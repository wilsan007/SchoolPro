/**
 * EcolPro / LEARNOS — Attestation en classe
 * =========================================
 *
 * Ferme la boucle de l'entraînement autonome.
 *
 * LE PROBLÈME QUE CE MODULE RÉSOUT
 * --------------------------------
 * Le jumeau d'apprentissage refuse de déclarer une compétence acquise sur des
 * preuves que personne n'a supervisées (cf. `statutDeMaitrise`). C'est le bon
 * verrou — sans lui, la faible fiabilité du travail fait seul se contournerait
 * par le volume. Mais pris isolément, il produit une impasse : un élève qui
 * réussit tout chez lui reste indéfiniment « en cours d'acquisition », sans
 * qu'on lui dise jamais comment en sortir. Un dispositif qui ne récompense
 * jamais l'effort finit par ne plus être ouvert.
 *
 * L'attestation est la sortie, et elle passe par un adulte. Quand
 * l'entraînement dit « cet élève sait faire », le système ne conclut pas : il
 * **demande à l'enseignant de vérifier**, en classe, sur des exercices qu'il
 * n'a pas encore vus. Cette feuille-là produit une preuve supervisée, et c'est
 * elle — pas les dix séances qui l'ont précédée — qui débloque « acquis ».
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE
 * ------------------------------------------------
 * Comparaisons de seuils et comptages. Un LLM qui déciderait qui mérite d'être
 * attesté produirait deux réponses pour deux élèves identiques.
 *
 * PROPOSER, JAMAIS IMPOSER
 * ------------------------
 * La feuille naît `PROPOSEE` et n'atteint l'élève qu'après signature — même
 * garde-fou que `PlanProgression` et les feuilles-jalons. Rien de ce que
 * l'entraînement produit ne peut engager l'établissement tout seul.
 */

import type { PalierExercice, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  type SessionSiteClaims,
  mergeFilters,
  personalScopeFilter,
  siteFilterForModel,
} from "@/lib/site-scope";
import { estSupervisee } from "@/lib/learnos/evidence-engine";
import { CONFIANCE_MINIMALE, SEUILS_MAITRISE } from "@/lib/learnos/learning-twin";
import { FORMATS_AUTO_CORRIGEABLES } from "@/lib/learnos/formats";

/**
 * Preuves autonomes exigées avant de déranger un enseignant.
 *
 * Deux séances réussies ne prouvent rien — c'est le même raisonnement que le
 * seuil de confiance du jumeau. Quatre, c'est assez pour que la demande soit
 * crédible, et assez peu pour qu'elle arrive tant que l'élève est encore
 * motivé.
 */
export const PREUVES_MIN_ATTESTATION = 4;

/**
 * Exercices d'une feuille d'attestation.
 *
 * Court volontairement : elle se passe en classe, sur un temps que
 * l'enseignant n'a pas. Une feuille de dix exercices ne serait jamais donnée.
 */
const EXERCICES_ATTESTATION = 3;

/**
 * Paliers servis en attestation.
 *
 * Au-dessus de ce que l'entraînement a servi : attester en resservant le même
 * palier ne mesurerait que la mémoire des exercices déjà faits. C'est le
 * transfert qui distingue « sait refaire » de « a compris ».
 */
const PALIERS_ATTESTATION: PalierExercice[] = ["CONSOLIDATION", "TRANSFERT"];

/**
 * Délai avant de redemander une attestation qu'un enseignant a écartée.
 *
 * Une seule des deux réponses simples est bonne. Ne plus jamais redemander
 * condamnerait l'élève : un refus de mars n'a rien à dire de son niveau en mai.
 * Redemander dès la séance suivante transformerait le refus en clic sans
 * effet, et l'enseignant cesserait de lire la liste. Un mois laisse le temps
 * que quelque chose change réellement — et l'entraînement, lui, continue.
 */
export const JOURS_APRES_REFUS = 30;

export interface CandidatAttestation {
  eleveId: string;
  competenceId: string;
  competenceLibelle: string;
  masteryScore: number;
  confidenceScore: number;
  preuvesAutonomes: number;
}

/**
 * Décide si une compétence mérite une vérification en classe.
 *
 * Quatre conditions, toutes nécessaires :
 *
 *  1. **Le niveau y est** — au seuil « acquis », pas en dessous.
 *  2. **On en sait assez** — sous le seuil de confiance, on ne conclut rien,
 *     pas même « il faudrait vérifier ».
 *  3. **Personne n'a encore vu l'élève faire** — s'il existe une preuve
 *     supervisée, le verrou ne s'applique pas et l'attestation n'a plus d'objet.
 *  4. **Assez de séances** — voir `PREUVES_MIN_ATTESTATION`.
 *
 * Fonction pure : le tri des preuves est fait par l'appelant.
 */
export function meriteAttestation(profil: {
  masteryScore: number;
  confidenceScore: number;
  preuvesAutonomes: number;
  preuvesSupervisees: number;
}): boolean {
  if (profil.preuvesSupervisees > 0) return false;
  if (profil.preuvesAutonomes < PREUVES_MIN_ATTESTATION) return false;
  if (profil.confidenceScore < CONFIANCE_MINIMALE) return false;
  return profil.masteryScore >= SEUILS_MAITRISE.acquis;
}

/**
 * Compétences d'un élève prêtes à être attestées.
 *
 * Ne crée rien : sépare la décision de son effet, pour que la règle reste
 * lisible et testable sans base de données.
 */
export async function candidatsAttestation(
  tenantId: string,
  eleveId: string,
  claims: SessionSiteClaims,
  maintenant: Date = new Date()
): Promise<CandidatAttestation[]> {
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      eleveId,
      masteryScore: { gte: SEUILS_MAITRISE.acquis },
      confidenceScore: { gte: CONFIANCE_MINIMALE },
      ...siteFilterForModel("studentLearningProfile", claims),
    },
    select: {
      competenceId: true,
      masteryScore: true,
      confidenceScore: true,
      competence: { select: { libelle: true } },
    },
  });
  if (profils.length === 0) return [];

  const competenceIds = profils.map((p) => p.competenceId);

  // Un seul groupBy plutôt qu'une requête par compétence : la boucle tourne
  // après chaque séance, et un aller-retour par compétence la rendrait
  // sensible au nombre de compétences du niveau.
  // eslint-disable-next-line ecolpro/require-site-filter
  const preuves = await prisma.learningEvidence.groupBy({
    by: ["competenceId", "evidenceType"],
    where: { tenantId, eleveId, competenceId: { in: competenceIds } },
    _count: { _all: true },
  });

  const comptes = new Map<string, { autonomes: number; supervisees: number }>();
  for (const p of preuves) {
    if (!p.competenceId) continue;
    const entree = comptes.get(p.competenceId) ?? { autonomes: 0, supervisees: 0 };
    if (estSupervisee(p.evidenceType)) entree.supervisees += p._count._all;
    else entree.autonomes += p._count._all;
    comptes.set(p.competenceId, entree);
  }

  // Demandes qui bloquent une nouvelle proposition. Deux cas, pour deux
  // raisons distinctes :
  //
  //  - une attestation **en cours** : en empiler une seconde sur la même
  //    compétence ferait cesser de lire la liste ;
  //  - une attestation **récemment écartée** : l'enseignant a répondu, et
  //    reposer la question la semaine suivante viderait sa réponse de son sens.
  const seuilRefus = new Date(maintenant.getTime() - JOURS_APRES_REFUS * 86_400_000);
  const dejaDemandees = await prisma.feuilleExercices.findMany({
    where: {
      tenantId,
      eleveId,
      type: "attestation",
      competenceAttesteeId: { in: competenceIds },
      OR: [
        { statut: { in: ["PROPOSEE", "ASSIGNEE", "EN_COURS"] } },
        { statut: "REFUSEE", valideeLe: { gte: seuilRefus } },
      ],
      ...siteFilterForModel("feuilleExercices", claims),
    },
    select: { competenceAttesteeId: true },
  });
  const bloquees = new Set(dejaDemandees.map((f) => f.competenceAttesteeId));

  return profils
    .filter((profil) => {
      if (bloquees.has(profil.competenceId)) return false;
      const compte = comptes.get(profil.competenceId) ?? { autonomes: 0, supervisees: 0 };
      return meriteAttestation({
        masteryScore: profil.masteryScore,
        confidenceScore: profil.confidenceScore,
        preuvesAutonomes: compte.autonomes,
        preuvesSupervisees: compte.supervisees,
      });
    })
    .map((profil) => ({
      eleveId,
      competenceId: profil.competenceId,
      competenceLibelle: profil.competence.libelle,
      masteryScore: profil.masteryScore,
      confidenceScore: profil.confidenceScore,
      preuvesAutonomes: comptes.get(profil.competenceId)?.autonomes ?? 0,
    }));
}

/**
 * Compose une feuille d'attestation pour une compétence.
 *
 * N'emprunte PAS `composerFeuille` : celui-ci choisit les compétences par
 * parcours de graphe, alors qu'ici la cible est déjà connue et qu'il ne reste
 * qu'à tirer des questions dessus. Détourner le sélecteur reviendrait à lui
 * demander de retrouver une conclusion qu'on lui donne déjà.
 *
 * @returns `null` si la banque n'a pas de question au bon palier — on ne
 *   demande pas à un enseignant de valider une feuille vide.
 */
export async function proposerAttestation(
  tenantId: string,
  eleveId: string,
  competenceId: string,
  claims: SessionSiteClaims,
  maintenant: Date = new Date()
): Promise<{ feuilleId: string; nbExercices: number } | null> {
  // Le périmètre personnel s'applique aussi ici : la boucle est déclenchée par
  // la séance d'un élève, et un identifiant de compétence venu d'ailleurs ne
  // doit pas permettre d'écrire une feuille pour un autre.
  const eleve = await prisma.eleve.findFirst({
    where: mergeFilters(
      { id: eleveId, tenantId },
      siteFilterForModel("eleve", claims),
      personalScopeFilter(claims, null)
    ),
    select: { id: true, siteId: true },
  });
  if (!eleve) return null;

  const competence = await prisma.competence.findFirst({
    where: { id: competenceId, tenantId, ...siteFilterForModel("competence", claims) },
    select: { id: true, chapitre: { select: { matiereId: true } } },
  });
  if (!competence) return null;

  // Questions jamais servies à cet élève : attester sur un énoncé déjà fait à
  // la maison mesurerait la mémoire de l'exercice, pas la maîtrise.
  const vues = await prisma.exerciceAssigne.findMany({
    where: { feuille: { tenantId, eleveId, ...siteFilterForModel("feuilleExercices", claims) } },
    select: { questionId: true },
  });
  const dejaVues = vues.map((v) => v.questionId);

  const banque = await prisma.question.findMany({
    where: {
      tenantId,
      competenceId,
      actif: true,
      palier: { in: PALIERS_ATTESTATION },
      format: { in: [...FORMATS_AUTO_CORRIGEABLES] },
      ...(dejaVues.length > 0 ? { id: { notIn: dejaVues } } : {}),
      ...siteFilterForModel("question", claims),
    },
    select: { id: true, palier: true },
    // Tri stable : à banque identique, la même feuille deux fois.
    orderBy: { id: "asc" },
    take: EXERCICES_ATTESTATION,
  });

  if (banque.length === 0) return null;

  const feuille = await prisma.feuilleExercices.create({
    data: {
      tenantId,
      siteId: eleve.siteId,
      eleveId,
      matiereId: competence.chapitre?.matiereId ?? null,
      type: "attestation",
      // Signature obligatoire : c'est elle qui fait toute la valeur de la
      // preuve produite ensuite. Une attestation auto-assignée ne vaudrait pas
      // mieux que l'entraînement qu'elle est censée confirmer.
      statut: "PROPOSEE",
      competenceAttesteeId: competenceId,
      assigneeLe: null,
      exercices: {
        create: banque.map((question, i) => ({
          questionId: question.id,
          competenceId,
          ordre: i + 1,
          palier: question.palier,
          regleDeclenchee: "exercice_attestation",
          motifParams: {
            competence: competenceId,
          } as unknown as Prisma.InputJsonValue,
          priorite: 1,
        })),
      },
      createdAt: maintenant,
    },
    select: { id: true },
  });

  return { feuilleId: feuille.id, nbExercices: banque.length };
}

/**
 * Signature de l'enseignant : il accepte de faire passer l'attestation.
 *
 * POURQUOI LA SIGNATURE N'OUVRE PAS LA FEUILLE À L'ÉLÈVE
 * -----------------------------------------------------
 * `assigneeLe` reste vide, contrairement à `validerFeuille` qui l'a toujours
 * renseigné pour les feuilles-jalons. C'est délibéré et c'est tout l'enjeu :
 * une attestation ne vaut que parce qu'un adulte a vu l'élève produire. Un
 * enseignant qui parcourt sa liste le dimanche soir dit « oui, je le ferai » —
 * pas « il peut le faire maintenant, chez lui ». Ouvrir la feuille à cet
 * instant produirait une preuve estampillée « supervisée » sans supervision :
 * exactement le mensonge silencieux que tout le reste du dispositif évite.
 *
 * La feuille attend donc `ouvrirAttestation`, en classe, élève devant soi.
 */
export async function signerAttestation(
  tenantId: string,
  feuilleId: string,
  valideParId: string,
  claims: SessionSiteClaims,
  maintenant: Date = new Date()
): Promise<boolean> {
  if (!valideParId) {
    throw new Error("signerAttestation: la signature d'un enseignant est obligatoire.");
  }

  const maj = await prisma.feuilleExercices.updateMany({
    where: {
      id: feuilleId,
      tenantId,
      type: "attestation",
      statut: "PROPOSEE",
      ...siteFilterForModel("feuilleExercices", claims),
    },
    data: {
      statut: "ASSIGNEE",
      valideParId,
      valideeLe: maintenant,
      // Volontairement pas d'`assigneeLe` : voir l'en-tête de cette fonction.
      assigneeLe: null,
    },
  });
  return maj.count > 0;
}

/**
 * Ouverture de la fenêtre, en classe.
 *
 * Le geste par lequel l'enseignant atteste, de fait, qu'il est là. C'est
 * `assigneeLe` — et lui seul — qui rend la feuille visible à l'élève.
 *
 * Cela reste une déclaration, pas une preuve de présence : rien n'empêche un
 * enseignant de cliquer depuis chez lui. Mais l'action est explicite, datée,
 * nominative, et située au bon moment — c'est le maximum qu'un logiciel puisse
 * offrir sans surveiller personne.
 */
export async function ouvrirAttestation(
  tenantId: string,
  feuilleId: string,
  claims: SessionSiteClaims,
  maintenant: Date = new Date()
): Promise<boolean> {
  const maj = await prisma.feuilleExercices.updateMany({
    where: {
      id: feuilleId,
      tenantId,
      type: "attestation",
      statut: "ASSIGNEE",
      assigneeLe: null,
      ...siteFilterForModel("feuilleExercices", claims),
    },
    data: { assigneeLe: maintenant },
  });
  return maj.count > 0;
}

/**
 * Attestations qu'un élève peut ouvrir maintenant.
 *
 * `assigneeLe` non nul est le seul critère : c'est la marque que l'enseignant
 * a ouvert la fenêtre. Une attestation signée mais pas encore lancée n'apparaît
 * pas — sans quoi la signature suffirait à la faire passer à la maison.
 */
export async function attestationsOuvertes(
  tenantId: string,
  eleveId: string,
  claims: SessionSiteClaims
): Promise<{ feuilleId: string; competenceLibelle: string | null }[]> {
  const feuilles = await prisma.feuilleExercices.findMany({
    where: {
      tenantId,
      eleveId,
      type: "attestation",
      statut: { in: ["ASSIGNEE", "EN_COURS"] },
      assigneeLe: { not: null },
      ...siteFilterForModel("feuilleExercices", claims),
      ...personalScopeFilter(claims, "eleve"),
    },
    select: {
      id: true,
      competenceAttestee: { select: { libelle: true } },
    },
    orderBy: { assigneeLe: "asc" },
  });

  return feuilles.map((f) => ({
    feuilleId: f.id,
    competenceLibelle: f.competenceAttestee?.libelle ?? null,
  }));
}

/**
 * Déclenche la boucle après une séance : propose une attestation pour chaque
 * compétence qui vient de franchir le seuil.
 *
 * Ne lève jamais. Appelée depuis la correction d'un exercice, elle ne doit pas
 * transformer une réponse d'élève enregistrée en erreur 500 — même principe
 * que `publishEvent` vis-à-vis de l'ERP.
 */
export async function proposerAttestationsApresSeance(
  tenantId: string,
  eleveId: string,
  claims: SessionSiteClaims,
  maintenant: Date = new Date()
): Promise<string[]> {
  try {
    const candidats = await candidatsAttestation(tenantId, eleveId, claims, maintenant);
    const creees: string[] = [];
    for (const candidat of candidats) {
      const feuille = await proposerAttestation(
        tenantId,
        eleveId,
        candidat.competenceId,
        claims,
        maintenant
      );
      if (feuille) creees.push(feuille.feuilleId);
    }
    return creees;
  } catch (error) {
    console.error("[learnos/attestation] proposition échouée", error);
    return [];
  }
}
