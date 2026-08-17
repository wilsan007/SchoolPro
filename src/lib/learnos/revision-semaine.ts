/**
 * EcolPro / LEARNOS — Révision du cours de la semaine
 * =====================================================
 *
 * Propose à l'élève un résumé du cours de la semaine, adapté à son niveau
 * de lecture. Le résumé est généré à partir des chapitres et compétences
 * traités cette semaine, puis re-levelé selon le profil d'apprentissage de
 * l'élève.
 *
 * LE NIVEAU EST ADAPTATIF
 * -----------------------
 * Si l'élève progresse (masteryScore qui monte), le texte est moins
 * simplifié. Si l'élève est en difficulté (masteryScore bas), le texte est
 * plus accessible. C'est le re-leveling dynamique : le niveau du texte
 * suit le niveau de l'élève.
 *
 * CE QUE L'IA FAIT, ET CE QU'ELLE NE FAIT PAS
 * -------------------------------------------
 *   - L'IA **résume** le contenu des chapitres traités cette semaine.
 *   - L'IA **re-level** le résumé au niveau de l'élève.
 *   - L'IA **n'invente pas** de contenu : elle ne parle que des chapitres
 *     et compétences qui sont dans le curriculum.
 *   - L'IA **ne remplace pas** le cours : c'est un résumé de révision,
 *     pas un cours complet.
 *
 * DÉTERMINISTE POUR LE CHOIX, IA POUR LE TEXTE
 * --------------------------------------------
 * Le choix des chapitres à réviser est déterministe (ceux traités cette
 * semaine dans `PlanificationChapitre`). Seul le résumé et le re-leveling
 * font appel à l'IA.
 */

import { routeAi } from "@/lib/ai/router";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { semaineScolaire } from "@/lib/learnos/planification";
import { niveauLectureDepuisProfil, releverTexte, type NiveauLecture } from "@/lib/learnos/releveling";

const VERSION_PROMPT_RESUME = "revision-semaine-resume-v1";

export interface ChapitreDeLaSemaine {
  chapitreId: string;
  chapitreNom: string;
  matiereNom: string;
  matiereId: string;
  niveau: string;
  /** Compétences traitées cette semaine dans ce chapitre. */
  competences: { code: string; libelle: string; description: string | null }[];
  /** Statut de la planification : EN_COURS ou TRAITE. */
  statut: string;
}

export interface ResumeChapitre {
  chapitreId: string;
  chapitreNom: string;
  matiereNom: string;
  /** Résumé généré par l'IA, au niveau de l'élève. */
  resume: string;
  /** Compétences clés à retenir. */
  competencesCles: string[];
  /** Niveau de lecture appliqué. */
  niveauLecture: NiveauLecture;
  /** `true` si le résumé a été re-levelé (simplifié). */
  releveled: boolean;
  /** Modèle utilisé. */
  modele: string;
}

export interface RevisionSemaine {
  /** Numéro de la semaine scolaire. */
  semaine: number;
  /** Niveau de lecture appliqué à tous les résumés. */
  niveauLecture: NiveauLecture;
  /** Résumés par chapitre, groupés implicitement par matière. */
  resumes: ResumeChapitre[];
  /** Points de révision suggérés (déterministes, basés sur les profils). */
  pointsDeRevision: { matiereNom: string; competence: string; raison: string }[];
}

const CONSIGNE_SYSTEME_RESUME = `Tu rédiges un résumé de cours pour un élève qui révise sa semaine.

RÈGLES IMPÉRATIVES :
- Tu ne parles QUE des compétences et chapitres fournis. N'invente rien.
- Le résumé est structuré : 1 paragraphe court par compétence clé.
- Tu commences par l'idée principale, puis les détails.
- Tu donnes un exemple concret si la compétence s'y prête.
- Pas de Markdown, pas de LaTeX : texte brut lisible par un élève.
- 150 à 300 mots maximum par chapitre.`;

/**
 * Charge les chapitres traités cette semaine pour une classe donnée.
 *
 * Déterministe : lit `PlanificationChapitre` pour la semaine courante.
 */
export async function chapitresDeLaSemaine(
  tenantId: string,
  claims: SessionSiteClaims,
  classeId: string,
  anneeId: string,
  aujourdhui: Date = new Date()
): Promise<ChapitreDeLaSemaine[]> {
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId },
    select: { dateDebut: true },
  });
  if (!annee) return [];

  const semaine = semaineScolaire(aujourdhui, annee.dateDebut);

  // Chapitres EN_COURS ou TRAITE cette semaine pour cette classe.
  const planifications = await prisma.planificationChapitre.findMany({
    where: {
      tenantId,
      anneeId,
      classeId,
      ...siteFilterForModel("planificationChapitre", claims),
      statut: { in: ["EN_COURS", "TRAITE"] },
      // La semaine courante est dans la plage [semaineDebut, semaineFin].
      AND: [
        { semaineDebut: { lte: semaine } },
        { semaineFin: { gte: semaine } },
      ],
    },
    include: {
      chapitre: {
        select: {
          id: true,
          nom: true,
          niveau: true,
          matiere: { select: { id: true, nom: true } },
          competences: {
            select: { code: true, libelle: true, description: true },
            orderBy: { ordre: "asc" },
          },
        },
      },
    },
  });

  return planifications.map((p) => ({
    chapitreId: p.chapitre.id,
    chapitreNom: p.chapitre.nom,
    matiereNom: p.chapitre.matiere.nom,
    matiereId: p.chapitre.matiere.id,
    niveau: p.chapitre.niveau,
    competences: p.chapitre.competences.map((c) => ({
      code: c.code,
      libelle: c.libelle,
      description: c.description,
    })),
    statut: p.statut,
  }));
}

/**
 * Calcule le masteryScore moyen d'un élève sur une matière, à partir de
 * ses profils d'apprentissage.
 *
 * Utilisé pour déterminer le niveau de lecture adaptatif.
 */
async function masteryMoyenPourMatiere(
  tenantId: string,
  claims: SessionSiteClaims,
  eleveId: string,
  matiereId: string
): Promise<number | null> {
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      eleveId,
      competence: { chapitre: { matiereId } },
      ...siteFilterForModel("studentLearningProfile", claims),
    },
    select: { masteryScore: true },
  });

  if (profils.length === 0) return null;
  return profils.reduce((s, p) => s + p.masteryScore, 0) / profils.length;
}

/**
 * Génère un résumé pour un chapitre, à partir de ses compétences.
 *
 * L'IA rédige le résumé, puis le re-level est appliqué si nécessaire.
 */
async function resumerChapitre(
  tenantId: string,
  claims: SessionSiteClaims,
  chapitre: ChapitreDeLaSemaine,
  niveauLecture: NiveauLecture,
  niveauScolaire: string
): Promise<ResumeChapitre> {
  const contexte = [
    `Matière : ${chapitre.matiereNom}`,
    `Chapitre : ${chapitre.chapitreNom}`,
    `Niveau scolaire : ${niveauScolaire}`,
    `Compétences traitées cette semaine :`,
    ...chapitre.competences.map(
      (c) => `  - ${c.libelle}${c.description ? ` : ${c.description}` : ""}`
    ),
  ].join("\n");

  let resume: string;

  try {
    const resultat = await routeAi(
      {
        complexity: "simple",
        promptVersion: VERSION_PROMPT_RESUME,
        action: "revision.semaine.resumer",
        tenantId,
        siteId: claims.siteId ?? null,
        inputRef: chapitre.chapitreId,
      },
      [
        { role: "system", content: CONSIGNE_SYSTEME_RESUME },
        { role: "user", content: `Rédige un résumé de révision pour cet élève :\n\n${contexte}` },
      ],
      {
        temperature: 0.4,
        maxTokens: 600,
        validate: (r) => Boolean(r.content && r.content.trim().length >= 50),
      }
    );

    resume = resultat.content?.trim() ?? resumeParDefaut(chapitre);
  } catch {
    resume = resumeParDefaut(chapitre);
  }

  // Appliquer le re-leveling si le niveau n'est pas AVANCE.
  let releveled = false;
  let modele = "none";

  if (niveauLecture !== "AVANCE") {
    const resultatRelevel = await releverTexte(tenantId, claims, {
      texte: resume,
      niveau: niveauLecture,
      matiereNom: chapitre.matiereNom,
      niveauScolaire,
    });
    resume = resultatRelevel.texte;
    releveled = resultatRelevel.modifie;
    modele = resultatRelevel.modele;
  }

  return {
    chapitreId: chapitre.chapitreId,
    chapitreNom: chapitre.chapitreNom,
    matiereNom: chapitre.matiereNom,
    resume,
    competencesCles: chapitre.competences.map((c) => c.libelle),
    niveauLecture,
    releveled,
    modele,
  };
}

/**
 * Résumé déterministe de secours quand l'IA n'est pas disponible.
 */
function resumeParDefaut(chapitre: ChapitreDeLaSemaine): string {
  const competences = chapitre.competences.map((c) => `• ${c.libelle}`).join("\n");
  return `Cette semaine en ${chapitre.matiereNom}, nous avons travaillé le chapitre « ${chapitre.chapitreNom} ».\n\nCompétences à retenir :\n${competences}\n\nRelisez vos notes et refaites les exercices clés.`;
}

/**
 * Génère la révision de la semaine pour un élève.
 *
 * 1. Charge les chapitres traités cette semaine pour sa classe.
 * 2. Calcule le niveau de lecture adaptatif à partir de son profil.
 * 3. Génère un résumé par chapitre, re-levelé au niveau de l'élève.
 * 4. Suggère des points de révision (déterministes, basés sur les profils).
 */
export async function genererRevisionSemaine(
  tenantId: string,
  claims: SessionSiteClaims,
  eleveId: string,
  classeId: string,
  anneeId: string,
  aujourdhui: Date = new Date()
): Promise<RevisionSemaine> {
  // 1. Charger les chapitres de la semaine.
  const chapitres = await chapitresDeLaSemaine(tenantId, claims, classeId, anneeId, aujourdhui);

  if (chapitres.length === 0) {
    const annee = await prisma.anneesScolaires.findFirst({
      where: { id: anneeId, tenantId },
      select: { dateDebut: true },
    });
    const semaine = annee ? semaineScolaire(aujourdhui, annee.dateDebut) : 0;
    return {
      semaine,
      niveauLecture: "INTERMEDIAIRE",
      resumes: [],
      pointsDeRevision: [],
    };
  }

  // 2. Calculer le niveau de lecture adaptatif.
  // On prend la moyenne des masteryScores sur toutes les matières de la semaine.
  const matiereIds = [...new Set(chapitres.map((c) => c.matiereId))];
  const masteryParMatiere = await Promise.all(
    matiereIds.map((mid) => masteryMoyenPourMatiere(tenantId, claims, eleveId, mid))
  );
  const masteryValides = masteryParMatiere.filter((m): m is number => m !== null);
  const masteryMoyenGlobal =
    masteryValides.length > 0
      ? masteryValides.reduce((s, m) => s + m, 0) / masteryValides.length
      : null;

  const niveauLecture = niveauLectureDepuisProfil(masteryMoyenGlobal);
  const niveauScolaire = chapitres[0]?.niveau ?? "non spécifié";

  // 3. Générer les résumés par chapitre (par lots de 3).
  const resumes: ResumeChapitre[] = [];
  const TAILLE_LOT = 3;

  for (let i = 0; i < chapitres.length; i += TAILLE_LOT) {
    const lot = chapitres.slice(i, i + TAILLE_LOT);
    const lotResumes = await Promise.all(
      lot.map((c) => resumerChapitre(tenantId, claims, c, niveauLecture, niveauScolaire))
    );
    resumes.push(...lotResumes);
  }

  // 4. Points de révision : compétences avec masteryScore bas.
  const pointsDeRevision = await calculerPointsDeRevision(tenantId, claims, eleveId, chapitres);

  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId },
    select: { dateDebut: true },
  });
  const semaine = annee ? semaineScolaire(aujourdhui, annee.dateDebut) : 0;

  return {
    semaine,
    niveauLecture,
    resumes,
    pointsDeRevision,
  };
}

/**
 * Calcule les points de révision suggérés pour l'élève.
 *
 * Déterministe : pour chaque compétence traitée cette semaine, on regarde
 * le masteryScore de l'élève. Si bas (< 0.55), on suggère de la réviser.
 */
async function calculerPointsDeRevision(
  tenantId: string,
  claims: SessionSiteClaims,
  eleveId: string,
  chapitres: ChapitreDeLaSemaine[]
): Promise<{ matiereNom: string; competence: string; raison: string }[]> {
  const competenceIds = chapitres.flatMap((c) =>
    // On n'a pas les IDs ici, juste les codes/libellés. On charge par libellé.
    []
  );

  // Charger les profils de l'élève pour les compétences de cette semaine.
  const competenceCodes = chapitres.flatMap((c) => c.competences.map((comp) => comp.code));

  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      eleveId,
      competence: { code: { in: competenceCodes } },
      ...siteFilterForModel("studentLearningProfile", claims),
    },
    select: {
      masteryScore: true,
      competence: { select: { code: true, libelle: true, chapitre: { select: { matiere: { select: { nom: true } } } } } },
    },
  });

  const points: { matiereNom: string; competence: string; raison: string }[] = [];

  for (const profil of profils) {
    if (profil.masteryScore < 0.55) {
      points.push({
        matiereNom: profil.competence.chapitre.matiere.nom,
        competence: profil.competence.libelle,
        raison:
          profil.masteryScore < 0.35
            ? "Compétence critique à reprendre en priorité"
            : "Compétence fragile, à consolider",
      });
    }
  }

  // Si aucun point de révision (élève qui maîtrise tout), suggérer les
  // compétences clés de la semaine.
  if (points.length === 0) {
    for (const chapitre of chapitres) {
      for (const comp of chapitre.competences.slice(0, 2)) {
        points.push({
          matiereNom: chapitre.matiereNom,
          competence: comp.libelle,
          raison: "Compétence de la semaine à consolider",
        });
      }
    }
  }

  return points.slice(0, 8); // Limiter à 8 points pour ne pas noyer l'élève.
}
