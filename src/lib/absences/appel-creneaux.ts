import type { Jour } from "@prisma/client";

/**
 * Appel par créneau horaire.
 *
 * Un appel se fait pour un jour et, optionnellement, un créneau (heureDebut →
 * heureFin). Sans créneau, l'appel couvre la journée entière — comportement
 * historique, dont l'identifiant d'absence reste inchangé pour que l'appel
 * mobile et l'appel web continuent d'écrire la même ligne.
 *
 * Pour un retard, la ligne `Absence` porte `heureDebut` = début du créneau et
 * `heureFin` = heure d'arrivée de l'élève : l'intervalle stocké est le temps
 * de cours réellement manqué, ce que le calcul d'heures d'absence du bulletin
 * sait déjà exploiter.
 */

export const JOURS: Jour[] = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];

const HEURE_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function estHeureValide(h: string): boolean {
  return HEURE_RE.test(h);
}

export function heureEnMinutes(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}

/** Jour de la semaine d'une date "AAAA-MM-JJ", indépendamment du fuseau. */
export function jourDepuisDate(dateJour: string): Jour {
  const [y, m, d] = dateJour.split("-").map(Number);
  return JOURS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * Identifiant déterministe de l'absence saisie par l'appel : ré-enregistrer le
 * même appel met à jour la ligne au lieu de la dupliquer.
 */
export function absenceIdAppel(classeId: string, eleveId: string, dateJour: string, heureDebut?: string | null): string {
  const base = `appel-${classeId}-${eleveId}-${dateJour}`;
  return heureDebut ? `${base}-${heureDebut.replace(":", "")}` : base;
}

export interface CreneauAppel {
  heureDebut: string;
  heureFin: string;
  /** Libellé de la matière quand le créneau vient de l'emploi du temps. */
  matiere?: string | null;
  salle?: string | null;
}

/** Créneaux d'une heure par défaut quand la classe n'a pas d'emploi du temps ce jour-là. */
export function creneauxHoraires(debut = "07:00", fin = "18:00"): CreneauAppel[] {
  const out: CreneauAppel[] = [];
  for (let m = heureEnMinutes(debut); m + 60 <= heureEnMinutes(fin); m += 60) {
    out.push({ heureDebut: minutesEnHeure(m), heureFin: minutesEnHeure(m + 60) });
  }
  return out;
}

function minutesEnHeure(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Retourne un message d'erreur si le créneau / les heures d'arrivée sont incohérents, sinon null. */
export function validerCreneau(
  heureDebut: string | null | undefined,
  heureFin: string | null | undefined,
  heuresArrivee: Record<string, string> = {},
): string | null {
  if (!heureDebut && !heureFin) {
    return Object.keys(heuresArrivee).length > 0 ? "Heure d'arrivée sans créneau" : null;
  }
  if (!heureDebut || !heureFin || !estHeureValide(heureDebut) || !estHeureValide(heureFin)) {
    return "Créneau invalide";
  }
  if (heureEnMinutes(heureFin) <= heureEnMinutes(heureDebut)) return "Créneau invalide";
  for (const h of Object.values(heuresArrivee)) {
    if (!estHeureValide(h)) return "Heure d'arrivée invalide";
    const m = heureEnMinutes(h);
    if (m <= heureEnMinutes(heureDebut) || m > heureEnMinutes(heureFin)) {
      return "Heure d'arrivée hors du créneau";
    }
  }
  return null;
}
