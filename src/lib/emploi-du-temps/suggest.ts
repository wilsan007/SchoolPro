/**
 * EcolPro — Moteur de suggestion de créneaux d'emploi du temps
 * ============================================================
 * Extrait de GET /api/emploi-du-temps/suggest pour être partagé avec l'outil
 * IA (src/lib/ai/schedule-tool.ts) sans dupliquer la logique de scoring.
 */

import prisma from "@/lib/prisma";
import { fuzzyFind } from "@/lib/text-match";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

export type Jour = "DIMANCHE" | "LUNDI" | "MARDI" | "MERCREDI" | "JEUDI" | "VENDREDI" | "SAMEDI";

export const ALL_DAYS: Jour[] = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];

const ALL_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30",
];

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const aS = timeToMinutes(aStart);
  const aE = timeToMinutes(aEnd);
  const bS = timeToMinutes(bStart);
  const bE = timeToMinutes(bEnd);
  return aS < bE && bS < aE;
}

export interface CreneauSuggestion {
  jour: Jour;
  heureDebut: string;
  heureFin: string;
  enseignantId: string | null;
  enseignantNom: string | null;
  salle: string | null;
  score: number;
  conflits: string[];
  raison: string;
}

export interface SuggestSlotsResult {
  suggestions: CreneauSuggestion[];
  /** false si aucun enseignant ne correspond à la spécialité de la matière — toutes les disponibilités ont alors été considérées. */
  filteredBySpecialite: boolean;
}

export async function suggestSlots(opts: {
  tenantId: string;
  classeId: string;
  matiereId: string;
  enseignantId?: string;
  duree?: number;
}): Promise<SuggestSlotsResult> {
  const { tenantId, classeId, matiereId, enseignantId, duree = 60 } = opts;

  const annee = await getAnneeCouranteLibelle(tenantId);
  if (!annee) throw new Error("Aucune année scolaire active pour ce tenant");

  const [classCreneaux, allCreneaux, allEnseignants, salles, disponibilites, matiere] = await Promise.all([
    prisma.emploiTemps.findMany({ where: { tenantId, classeId, annee } }),
    prisma.emploiTemps.findMany({ where: { tenantId, annee } }),
    prisma.enseignant.findMany({ where: { tenantId }, include: { user: { select: { name: true } } } }),
    prisma.salle.findMany({ where: { tenantId } }),
    prisma.disponibiliteEnseignant.findMany({ where: { tenantId } }),
    prisma.matiere.findFirst({ where: { id: matiereId, tenantId }, select: { nom: true } }),
  ]);

  // Il n'existe pas de relation Enseignant <-> Matiere en base : on se base
  // sur le champ libre `specialite`. Si aucun prof ne correspond à la
  // spécialité recherchée, on retombe sur la liste complète plutôt que de ne
  // renvoyer aucune suggestion (les données de spécialité sont souvent partielles).
  let filteredBySpecialite = false;
  let enseignants = allEnseignants;
  if (matiere) {
    const bySpecialite = fuzzyFind(
      allEnseignants.map((e) => ({ id: e.id, nom: e.specialite ?? "" })),
      matiere.nom
    );
    if (bySpecialite.length > 0) {
      const ids = new Set(bySpecialite.map((e) => e.id));
      enseignants = allEnseignants.filter((e) => ids.has(e.id));
      filteredBySpecialite = true;
    }
  }

  const teacherBusy = new Map<string, Map<string, Array<{ debut: string; fin: string }>>>();
  for (const c of allCreneaux) {
    if (!c.enseignantId) continue;
    if (!teacherBusy.has(c.enseignantId)) teacherBusy.set(c.enseignantId, new Map());
    const dayMap = teacherBusy.get(c.enseignantId)!;
    if (!dayMap.has(c.jour)) dayMap.set(c.jour, []);
    dayMap.get(c.jour)!.push({ debut: c.heureDebut, fin: c.heureFin });
  }

  const classBusy = new Map<string, Array<{ debut: string; fin: string }>>();
  for (const c of classCreneaux) {
    if (!classBusy.has(c.jour)) classBusy.set(c.jour, []);
    classBusy.get(c.jour)!.push({ debut: c.heureDebut, fin: c.heureFin });
  }

  const roomBusy = new Map<string, Map<string, Array<{ debut: string; fin: string }>>>();
  for (const c of allCreneaux) {
    if (!c.salle) continue;
    if (!roomBusy.has(c.salle)) roomBusy.set(c.salle, new Map());
    const dayMap = roomBusy.get(c.salle)!;
    if (!dayMap.has(c.jour)) dayMap.set(c.jour, []);
    dayMap.get(c.jour)!.push({ debut: c.heureDebut, fin: c.heureFin });
  }

  const dispoMap = new Map<string, Map<string, Array<{ debut: string; fin: string }>>>();
  for (const d of disponibilites) {
    if (!dispoMap.has(d.enseignantId)) dispoMap.set(d.enseignantId, new Map());
    const dayMap = dispoMap.get(d.enseignantId)!;
    if (!dayMap.has(d.jour)) dayMap.set(d.jour, []);
    dayMap.get(d.jour)!.push({ debut: d.heureDebut, fin: d.heureFin });
  }

  const suggestions: CreneauSuggestion[] = [];
  const roomNames = salles.length > 0 ? salles.map((s) => s.nom) : ["Salle 01", "Salle 02", "Salle 03"];

  for (const jour of ALL_DAYS) {
    for (const debut of ALL_SLOTS) {
      const debutMin = timeToMinutes(debut);
      const finMin = debutMin + duree;
      if (finMin > timeToMinutes("18:00")) continue;
      const fin = `${String(Math.floor(finMin / 60)).padStart(2, "0")}:${String(finMin % 60).padStart(2, "0")}`;

      const classConflicts = (classBusy.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
      if (classConflicts) continue;

      let availableTeachers: Array<{ id: string; nom: string }> = [];
      if (enseignantId) {
        const ens = enseignants.find((e) => e.id === enseignantId);
        if (ens) {
          const isBusy = (teacherBusy.get(enseignantId)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
          const dispo = dispoMap.get(enseignantId)?.get(jour) || [];
          const hasDispo = dispo.length === 0 || dispo.some((s) => overlaps(debut, fin, s.debut, s.fin));
          if (!isBusy && hasDispo) {
            availableTeachers = [{ id: enseignantId, nom: ens.user.name ?? "Enseignant" }];
          }
        }
      } else {
        for (const ens of enseignants) {
          const isBusy = (teacherBusy.get(ens.id)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
          if (isBusy) continue;
          const dispo = dispoMap.get(ens.id)?.get(jour) || [];
          const hasDispo = dispo.length === 0 || dispo.some((s) => overlaps(debut, fin, s.debut, s.fin));
          if (hasDispo) {
            availableTeachers.push({ id: ens.id, nom: ens.user.name ?? "Enseignant" });
          }
        }
      }

      const availableRooms = roomNames.filter((room) => {
        const isBusy = (roomBusy.get(room)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
        return !isBusy;
      });

      let score = 50;
      const conflits: string[] = [];
      const raisons: string[] = [];

      if (availableTeachers.length > 0) {
        score += 20;
        raisons.push(`${availableTeachers.length} prof(s) dispo`);
      } else {
        conflits.push("Aucun enseignant disponible");
      }

      if (availableRooms.length > 0) {
        score += 15;
        raisons.push(`${availableRooms.length} salle(s) dispo`);
      } else {
        conflits.push("Aucune salle disponible");
      }

      if (debutMin >= 420 && debutMin < 720) {
        score += 10;
        raisons.push("Matinée");
      }
      if (debutMin >= 720 && debutMin < 840) {
        score -= 15;
        raisons.push("Pause déjeuner");
      }

      const dayIndex = ALL_DAYS.indexOf(jour);
      score += Math.max(0, 5 - dayIndex);
      score = Math.min(100, Math.max(0, score));

      if (availableTeachers.length === 0 && availableRooms.length === 0) continue;

      suggestions.push({
        jour,
        heureDebut: debut,
        heureFin: fin,
        enseignantId: availableTeachers[0]?.id ?? null,
        enseignantNom: availableTeachers[0]?.nom ?? null,
        salle: availableRooms[0] ?? null,
        score,
        conflits,
        raison: raisons.join(", "),
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score);

  // Sélection diversifiée par période de la journée : sans ça, le bonus fixe
  // "Matinée" fait que les meilleurs scores sont presque toujours des
  // créneaux du matin, qui écrasent entièrement les options d'après-midi
  // dans un simple top-10 par score.
  const buckets: Record<"matin" | "midi" | "apresmidi", CreneauSuggestion[]> = {
    matin: [],
    midi: [],
    apresmidi: [],
  };
  for (const s of suggestions) {
    const minutes = timeToMinutes(s.heureDebut);
    const bucket = minutes < 720 ? "matin" : minutes < 840 ? "midi" : "apresmidi";
    buckets[bucket].push(s);
  }
  // Entrelacement plutôt qu'un simple re-tri par score : sinon le bonus fixe
  // "Matinée" repousserait quand même tout l'après-midi en fin de liste, et
  // un `.slice` en aval ne montrerait jamais de créneau d'après-midi.
  const diversified: CreneauSuggestion[] = [];
  const maxLen = Math.max(buckets.matin.length, buckets.apresmidi.length, buckets.midi.length);
  for (let i = 0; i < maxLen && diversified.length < 10; i++) {
    if (buckets.matin[i]) diversified.push(buckets.matin[i]);
    if (buckets.apresmidi[i]) diversified.push(buckets.apresmidi[i]);
    if (i < 2 && buckets.midi[i]) diversified.push(buckets.midi[i]);
  }

  return { suggestions: diversified.slice(0, 10), filteredBySpecialite };
}
