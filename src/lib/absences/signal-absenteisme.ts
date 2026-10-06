/**
 * Signal d'absentéisme — lecture commune aux écrans et au moteur LEARNOS.
 *
 * Un retard n'est pas une absence, mais ce n'est pas rien non plus : trois
 * arrivées tardives privent l'élève d'autant de temps de classe qu'une absence,
 * et la répétition est l'un des premiers signes de décrochage. Les retards
 * comptaient pourtant pour zéro partout — `tauxAssiduiteRecent` les excluait
 * explicitement, et le handler `absence.recorded` s'arrêtait dès qu'une ligne
 * portait `isRetard`. Un élève systématiquement en retard n'apparaissait donc
 * dans aucun signal.
 *
 * Ce module fixe la conversion une fois pour toutes, de sorte que l'alerte de
 * l'appel, le taux d'assiduité et le risque de décrochage disent la même chose.
 */

/** Trois retards pèsent autant qu'une absence. */
export const RETARDS_PAR_ABSENCE = 3;

/** Fenêtre d'observation, en jours. */
export const FENETRE_JOURS = 30;

/** À partir de ce nombre d'absences équivalentes, l'élève est signalé. */
export const SEUIL_ATTENTION = 3;

/** Au-delà, le signal passe en alerte forte. */
export const SEUIL_ELEVE = 5;

export type NiveauAbsenteisme = "AUCUN" | "ATTENTION" | "ELEVE";

export interface CompteurAbsences {
  /** Absences injustifiées sur la fenêtre. */
  absences: number;
  /** Retards sur la fenêtre. */
  retards: number;
}

/**
 * Absences « équivalentes » : les absences pleines plus les retards convertis.
 * Arrondi au dixième pour rester lisible dans une infobulle.
 */
export function absencesEquivalentes({ absences, retards }: CompteurAbsences): number {
  return Math.round((absences + retards / RETARDS_PAR_ABSENCE) * 10) / 10;
}

export function niveauAbsenteisme(compteur: CompteurAbsences): NiveauAbsenteisme {
  const equivalent = absencesEquivalentes(compteur);
  if (equivalent >= SEUIL_ELEVE) return "ELEVE";
  if (equivalent >= SEUIL_ATTENTION) return "ATTENTION";
  return "AUCUN";
}

/**
 * Taux d'assiduité normalisé 0..1 attendu par le moteur de prédiction :
 * 1 = aucune absence, 0 = au moins `PLAFOND` absences équivalentes.
 */
export const PLAFOND_ABSENCES = 10;

export function tauxAssiduite(compteur: CompteurAbsences): number {
  return Math.max(0, 1 - absencesEquivalentes(compteur) / PLAFOND_ABSENCES);
}
