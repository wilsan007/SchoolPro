/**
 * EcolPro / LEARNOS — Calculs de planification (sans base de données)
 * ==================================================================
 *
 * POURQUOI CE FICHIER EXISTE
 * L'écran de planification est un composant client : il calcule la frise, les
 * trous et les décalages à la volée pendant que l'enseignant ajuste. Or importer
 * ces fonctions depuis le module principal ferait entrer Prisma — et, de proche
 * en proche, `node:crypto` — dans le bundle du navigateur, où ils n'ont rien à
 * faire et où webpack refuse d'ailleurs de les empaqueter.
 *
 * Tout ce qui touche la base vit donc dans `planification.ts`, qui réexporte
 * ces fonctions pour que les appels serveur n'aient pas à connaître la coupure.
 */

const MS_PAR_SEMAINE = 7 * 86_400_000;

/** Fenêtre d'anticipation par défaut : assez tôt pour agir, assez près pour être pertinent. */
export const ANTICIPATION_SEMAINES = 3;

/** Numéro de semaine scolaire d'une date (1 = première semaine de cours). */
export function semaineScolaire(date: Date, debutAnnee: Date): number {
  const ecart = date.getTime() - debutAnnee.getTime();
  return Math.max(1, Math.floor(ecart / MS_PAR_SEMAINE) + 1);
}

/** Dates de début et de fin d'une semaine scolaire. */
export function datesDeLaSemaine(
  numero: number,
  debutAnnee: Date
): { debut: Date; fin: Date } {
  const debut = new Date(debutAnnee.getTime() + (numero - 1) * MS_PAR_SEMAINE);
  return { debut, fin: new Date(debut.getTime() + 6 * 86_400_000) };
}

/** Nombre de semaines que compte l'année scolaire. */
export function nombreDeSemaines(debut: Date, fin: Date): number {
  return Math.max(1, Math.ceil((fin.getTime() - debut.getTime()) / MS_PAR_SEMAINE));
}

// ------------------------------------------------------------
// Calendrier scolaire — vacances, examens, jours fériés
// ------------------------------------------------------------

/** Un événement du calendrier, tel que défini par le chef d'établissement. */
export interface EvenementCalendaire {
  type: "VACANCE_SCOLAIRE" | "EXAMEN" | "JOUR_FERIE" | "AUTRE";
  dateDebut: Date;
  dateFin: Date;
}

/**
 * Une semaine de l'année, avec son statut calendaire.
 *
 * `enseignee = true` si la semaine n'est ni une vacance ni un jour férié.
 * Les examens sont `enseignee = false` : on n'y répartit pas de nouveau
 * chapitre, mais la semaine reste visible sur la frise.
 */
export interface SemaineCalendaire {
  numero: number;
  enseignee: boolean;
  /** Type d'événement qui couvre cette semaine, ou `null` si c'est une semaine de cours. */
  evenement: EvenementCalendaire["type"] | null;
}

/**
 * Calcule le statut calendaire de chaque semaine de l'année.
 *
 * Une semaine est « non enseignée » si elle chevauche un événement de type
 * `VACANCE_SCOLAIRE` ou `JOUR_FERIE`. Les `EXAMEN` sont aussi non enseignées
 * (on n'y commence pas un nouveau chapitre), mais restent visibles.
 *
 * Le chevauchement se mesure en jours : si au moins un jour ouvré de la
 * semaine tombe dans l'événement, la semaine est marquée.
 */
export function calendrierHebdomadaire(
  debutAnnee: Date,
  totalSemaines: number,
  evenements: EvenementCalendaire[]
): SemaineCalendaire[] {
  const semaines: SemaineCalendaire[] = [];

  for (let s = 1; s <= totalSemaines; s++) {
    const { debut, fin } = datesDeLaSemaine(s, debutAnnee);

    // Chercher un événement qui chevauche cette semaine.
    // Priorité : vacance > jour férié > examen > autre.
    let evenement: SemaineCalendaire["evenement"] = null;
    for (const ev of evenements) {
      if (ev.dateFin < debut || ev.dateDebut > fin) continue;
      if (ev.type === "VACANCE_SCOLAIRE") {
        evenement = "VACANCE_SCOLAIRE";
        break; // La plus haute priorité : on peut s'arrêter.
      }
      if (ev.type === "JOUR_FERIE" && evenement === null) {
        evenement = "JOUR_FERIE";
      } else if (ev.type === "EXAMEN" && evenement === null) {
        evenement = "EXAMEN";
      } else if (ev.type === "AUTRE" && evenement === null) {
        evenement = "AUTRE";
      }
    }

    semaines.push({
      numero: s,
      enseignee: evenement === null,
      evenement,
    });
  }

  return semaines;
}

/**
 * Liste des numéros de semaines réellement enseignées.
 *
 * C'est sur ces semaines — et seulement celles-là — que la répartition
 * automatique place des chapitres. Sans ce filtrage, l'algorithme répartit
 * uniformément sur 44 semaines dont 8 sont des vacances : chaque chapitre
 * se retrouve rallongé d'une semaine de trop.
 */
export function semainesEnseignees(
  debutAnnee: Date,
  totalSemaines: number,
  evenements: EvenementCalendaire[]
): number[] {
  return calendrierHebdomadaire(debutAnnee, totalSemaines, evenements)
    .filter((s) => s.enseignee)
    .map((s) => s.numero);
}

export interface RepartitionProposee {
  chapitreId: string;
  semaineDebut: number;
  semaineFin: number;
}

/**
 * Répartit des chapitres à parts égales sur les semaines disponibles.
 *
 * Point de départ à ajuster, jamais une vérité : personne ne saisira à la main
 * 15 chapitres × 8 matières × 5 niveaux, et un écran qui l'exigerait resterait
 * vide. Le reste (vacances, chapitres plus lourds) se corrige à la souris.
 *
 * Le reliquat est distribué sur les PREMIERS chapitres : les fondamentaux
 * d'un programme sont généralement plus longs que les derniers points, et un
 * retard pris en début d'année ne se rattrape pas.
 *
 * VACANCES ET EXAMENS
 * -------------------
 * Quand `semainesEnseignees` est fourni (liste des numéros de semaines sans
 * vacances ni examens), la répartition se fait sur ces semaines-là uniquement.
 * Sans ce filtrage, l'algorithme répartirait uniformément sur 44 semaines dont
 * 8 sont des vacances : chaque chapitre se retrouverait rallongé d'une semaine
 * de trop, et des chapitres tomberaient sur des semaines sans cours.
 */
export function repartirEgalement(
  chapitreIds: string[],
  semainesDisponibles: number,
  semaineDepart = 1,
  /** Numéros des semaines réellement enseignées. Si fourni, remplace le continuum. */
  semainesEnseigneesListe?: number[]
): RepartitionProposee[] {
  if (chapitreIds.length === 0) return [];

  // Mode calendrier : on répartit sur les semaines enseignées uniquement.
  // Les plages contournent les vacances : un chapitre dont le début est en S1
  // et qui dure 7 semaines enseignées finit en S7 si S8-S9 sont des vacances,
  // puis le chapitre suivant commence en S10.
  if (semainesEnseigneesListe && semainesEnseigneesListe.length > 0) {
    const triees = [...semainesEnseigneesListe].sort((a, b) => a - b);
    const nb = triees.length;
    const base = Math.floor(nb / chapitreIds.length);
    const reste = nb % chapitreIds.length;

    const repartition: RepartitionProposee[] = [];
    let curseur = 0;

    chapitreIds.forEach((chapitreId, index) => {
      const duree = Math.max(1, base + (index < reste ? 1 : 0));
      const debut = triees[curseur];
      const fin = triees[Math.min(curseur + duree - 1, nb - 1)];
      repartition.push({ chapitreId, semaineDebut: debut, semaineFin: fin });
      curseur += duree;
    });

    return repartition;
  }

  // Mode legacy : continuum de semaines, sans filtrage calendaire.
  if (semainesDisponibles <= 0) return [];

  const base = Math.floor(semainesDisponibles / chapitreIds.length);
  const reste = semainesDisponibles % chapitreIds.length;

  const repartition: RepartitionProposee[] = [];
  let curseur = semaineDepart;

  chapitreIds.forEach((chapitreId, index) => {
    const duree = Math.max(1, base + (index < reste ? 1 : 0));
    repartition.push({
      chapitreId,
      semaineDebut: curseur,
      semaineFin: curseur + duree - 1,
    });
    curseur += duree;
  });

  return repartition;
}

export interface Anomalie {
  type: "trou" | "chevauchement";
  semaineDebut: number;
  semaineFin: number;
  chapitres: string[];
}

/**
 * Trous et chevauchements du calendrier.
 *
 * Ce sont les deux défauts qu'un tableau de dates rend invisibles et qu'une
 * frise rend évidents : trois semaines sans rien, ou deux chapitres menés en
 * parallèle sans que personne ne l'ait décidé.
 */
export function detecterAnomalies(
  planifications: { chapitreId: string; nom: string; semaineDebut: number; semaineFin: number }[],
  totalSemaines: number
): Anomalie[] {
  if (planifications.length === 0) return [];

  const triees = [...planifications].sort((a, b) => a.semaineDebut - b.semaineDebut);
  const anomalies: Anomalie[] = [];

  if (triees[0].semaineDebut > 1) {
    anomalies.push({
      type: "trou",
      semaineDebut: 1,
      semaineFin: triees[0].semaineDebut - 1,
      chapitres: [],
    });
  }

  for (let i = 0; i < triees.length - 1; i++) {
    const courant = triees[i];
    const suivant = triees[i + 1];

    if (suivant.semaineDebut > courant.semaineFin + 1) {
      anomalies.push({
        type: "trou",
        semaineDebut: courant.semaineFin + 1,
        semaineFin: suivant.semaineDebut - 1,
        chapitres: [],
      });
    } else if (suivant.semaineDebut <= courant.semaineFin) {
      anomalies.push({
        type: "chevauchement",
        semaineDebut: suivant.semaineDebut,
        semaineFin: Math.min(courant.semaineFin, suivant.semaineFin),
        chapitres: [courant.nom, suivant.nom],
      });
    }
  }

  const derniere = triees[triees.length - 1];
  if (derniere.semaineFin < totalSemaines) {
    anomalies.push({
      type: "trou",
      semaineDebut: derniere.semaineFin + 1,
      semaineFin: totalSemaines,
      chapitres: [],
    });
  }

  return anomalies;
}

// ------------------------------------------------------------
// Ajustement en cours d'année
// ------------------------------------------------------------

export interface DecalageProposee {
  chapitreId: string;
  semaineDebut: number;
  semaineFin: number;
}

/**
 * Décale un chapitre et **tous ceux qui le suivent**.
 *
 * Un enseignant qui prend deux semaines de retard ne veut pas ressaisir dix
 * lignes : il veut dire « je suis en retard, décale la suite ». Sans cette
 * opération, la planification serait abandonnée dès la première semaine de
 * retard — et l'anticipation avec elle.
 *
 * Fonction pure : la décision d'écrire revient à l'appelant, qui peut donc
 * présenter la proposition avant de l'appliquer.
 */
export function decalerAPartirDe(
  planifications: { chapitreId: string; semaineDebut: number; semaineFin: number }[],
  chapitreId: string,
  semaines: number,
  totalSemaines: number
): DecalageProposee[] {
  const triees = [...planifications].sort((a, b) => a.semaineDebut - b.semaineDebut);
  const depart = triees.find((p) => p.chapitreId === chapitreId);
  if (!depart || semaines === 0) return [];

  return triees
    .filter((p) => p.semaineDebut >= depart.semaineDebut)
    .map((p) => ({
      chapitreId: p.chapitreId,
      // Bornage : un décalage ne doit ni sortir de l'année ni inverser les
      // dates. Le dépassement reste visible comme un chapitre collé à la fin,
      // ce qui est exactement le signal qu'il faut alléger le programme.
      semaineDebut: Math.min(totalSemaines, Math.max(1, p.semaineDebut + semaines)),
      semaineFin: Math.min(totalSemaines, Math.max(1, p.semaineFin + semaines)),
    }));
}

export interface EcartPlanification {
  chapitreId: string;
  nom: string;
  semainesDeRetard: number;
  statut: string;
}

/**
 * Écart entre le plan initial et le plan courant.
 *
 * C'est l'indicateur que le chef d'établissement cherche toute l'année sans
 * jamais l'obtenir : « où en est réellement le programme ? ». Un écart n'est
 * pas une faute — il peut venir d'une classe difficile ou d'un approfondissement
 * assumé. C'est une question à poser, pas un verdict.
 */
export function ecartsDePlanification(
  planifications: {
    chapitreId: string;
    nom: string;
    semaineDebut: number;
    semaineDebutInitiale: number | null;
    statut: string;
  }[]
): EcartPlanification[] {
  return planifications
    .filter((p) => p.semaineDebutInitiale !== null && p.semaineDebut !== p.semaineDebutInitiale)
    .map((p) => ({
      chapitreId: p.chapitreId,
      nom: p.nom,
      semainesDeRetard: p.semaineDebut - p.semaineDebutInitiale!,
      statut: p.statut,
    }))
    .sort((a, b) => b.semainesDeRetard - a.semainesDeRetard);
}

// ---------------------------------------------------------------------------
// PLANIFICATION DES COMPÉTENCES À L'INTÉRIEUR D'UN CHAPITRE
// ---------------------------------------------------------------------------

export interface RepartitionCompetence {
  competenceId: string;
  semaineDebut: number;
  semaineFin: number;
}

/**
 * Répartit les compétences d'un chapitre sur les semaines que ce chapitre
 * occupe. Chaque compétence reçoit au moins une semaine ; le reliquat va aux
 * premières compétences (les fondamentaux d'abord).
 *
 * Les semaines enseignées sont respectées : si le chapitre couvre les semaines
 * 3-6 mais que la semaine 4 est un jour férié, on répartit sur [3, 5, 6].
 *
 * @param competences  IDs des compétences du chapitre, dans l'ordre pédagogique.
 * @param semaineDebutChapitre  Numéro de la première semaine du chapitre.
 * @param semaineFinChapitre    Numéro de la dernière semaine du chapitre.
 * @param semainesEnseigneesListe  Semaines enseignées globales (optionnel).
 *        Si fourni, on ne place des compétences que sur les semaines
 *        enseignées qui tombent dans la plage du chapitre.
 */
export function repartirCompetences(
  competences: string[],
  semaineDebutChapitre: number,
  semaineFinChapitre: number,
  semainesEnseigneesListe?: number[]
): RepartitionCompetence[] {
  if (competences.length === 0) return [];

  // Semaines disponibles pour ce chapitre : intersection de la plage du
  // chapitre avec les semaines enseignées (ou la plage brute si pas de
  // calendrier).
  const semainesDuChapitre: number[] = [];
  if (semainesEnseigneesListe && semainesEnseigneesListe.length > 0) {
    for (const s of semainesEnseigneesListe) {
      if (s >= semaineDebutChapitre && s <= semaineFinChapitre) {
        semainesDuChapitre.push(s);
      }
    }
  }
  // Si pas de calendrier ou aucune semaine enseignée dans la plage, on
  // utilise le continuum.
  if (semainesDuChapitre.length === 0) {
    for (let s = semaineDebutChapitre; s <= semaineFinChapitre; s++) {
      semainesDuChapitre.push(s);
    }
  }

  const nbSemaines = semainesDuChapitre.length;
  const nbCompetences = competences.length;

  // Cas dégénéré : une seule semaine → tout sur la même.
  if (nbSemaines === 1) {
    return competences.map((id) => ({
      competenceId: id,
      semaineDebut: semainesDuChapitre[0],
      semaineFin: semainesDuChapitre[0],
    }));
  }

  // Moins de semaines que de compétences : plusieurs compétences par semaine.
  // On regroupe les compétences en lots égaux.
  if (nbSemaines < nbCompetences) {
    const base = Math.floor(nbCompetences / nbSemaines);
    const reste = nbCompetences % nbSemaines;
    const result: RepartitionCompetence[] = [];
    let idx = 0;
    for (let s = 0; s < nbSemaines; s++) {
      const taille = base + (s < reste ? 1 : 0);
      for (let k = 0; k < taille; k++) {
        result.push({
          competenceId: competences[idx],
          semaineDebut: semainesDuChapitre[s],
          semaineFin: semainesDuChapitre[s],
        });
        idx++;
      }
    }
    return result;
  }

  // Autant ou plus de semaines que de compétences : une compétence par
  // semaine au minimum, le reliquat aux premières.
  const base = Math.floor(nbSemaines / nbCompetences);
  const reste = nbSemaines % nbCompetences;

  const result: RepartitionCompetence[] = [];
  let curseur = 0;
  competences.forEach((id, i) => {
    const duree = base + (i < reste ? 1 : 0);
    const debut = semainesDuChapitre[curseur];
    const fin = semainesDuChapitre[Math.min(curseur + duree - 1, nbSemaines - 1)];
    result.push({ competenceId: id, semaineDebut: debut, semaineFin: fin });
    curseur += duree;
  });

  return result;
}

/**
 * Détermine la plage effective d'une compétence : utilise la planification
 * explicite si elle existe, sinon hérite de la plage du chapitre.
 */
export function plageEffectiveCompetence(
  competenceId: string,
  plageChapitre: { debut: number; fin: number },
  planifications: { competenceId: string; semaineDebut: number; semaineFin: number }[]
): { debut: number; fin: number } {
  const explicite = planifications.find((p) => p.competenceId === competenceId);
  if (explicite) {
    return { debut: explicite.semaineDebut, fin: explicite.semaineFin };
  }
  return plageChapitre;
}
