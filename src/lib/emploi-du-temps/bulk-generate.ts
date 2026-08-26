/**
 * EcolPro — Génération d'un emploi du temps complet pour une classe
 * ============================================================
 * Contrairement à suggestSlots (une classe+matière → meilleurs créneaux
 * ponctuels), ce module reconstruit TOUTE la grille hebdomadaire d'une classe
 * sous contraintes globales (plage horaire, matières, groupes A/B).
 *
 * Il ne modifie rien en base : il renvoie un plan complet que l'utilisateur
 * doit valider explicitement. L'application effective (suppression des
 * anciens créneaux + création des nouveaux) se fait dans une transaction via
 * POST /api/emploi-du-temps/bulk-apply, qui revalide tout au moment de
 * l'écriture.
 *
 * Deux façons de dédoubler une session en groupes A/B :
 *  - "matière seule en groupes" (groupesAB: true sur une MatiereCible) : les
 *    deux groupes suivent la MÊME matière, avec deux enseignants distincts de
 *    cette matière en parallèle. Exige 2 profs disponibles de la matière —
 *    souvent impossible si elle n'a qu'un seul enseignant.
 *  - "matières appariées" (PaireCible, ex: Mathématiques ↔ Français) : les
 *    deux groupes suivent des matières DIFFÉRENTES au même horaire (1 seul
 *    prof par matière suffit, donc bien plus réalisable), en alternant à
 *    chaque séance qui fait quoi pour équilibrer l'exposition des deux groupes.
 *
 * Note de conception : il n'existe pas de notion de "groupe" dans le schéma
 * Prisma (pas de champ dédié sur EmploiTemps). Un cours en groupes A/B est
 * donc représenté par deux créneaux parallèles (même classe/horaire,
 * enseignant, matière et salle potentiellement différents), la distinction
 * "Groupe A"/"Groupe B" étant ajoutée au libellé de la salle pour rester
 * lisible côté enseignants/administration sans migration de schéma.
 */

import prisma from "@/lib/prisma";
import { fuzzyFind } from "@/lib/text-match";
import { ALL_DAYS, timeToMinutes, minutesToTime, overlaps, type Jour } from "@/lib/emploi-du-temps/suggest";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

export interface BulkCreneauProposal {
  jour: Jour;
  heureDebut: string;
  heureFin: string;
  matiereId: string;
  matiereNom: string;
  enseignantId: string | null;
  enseignantNom: string | null;
  salle: string | null;
  groupe: "A" | "B" | null;
}

const DEFAULT_DUREE_MINUTES = 120;

export interface MatiereCible {
  matiereId: string;
  matiereNom: string;
  minutesParSemaine: number;
  groupesAB?: boolean;
  dureeSessionMinutes?: number;
}

export interface PaireCible {
  matiereAId: string;
  matiereANom: string;
  matiereBId: string;
  matiereBNom: string;
  minutesParSemaine: number;
  dureeSessionMinutes?: number;
}

export interface BulkGenerateOptions {
  tenantId: string;
  classeId: string;
  heureDebutJournee: string;
  heureFinJournee: string;
  pourcentageSessions2h: number;
  groupes: 1 | 2;
  joursAutorises: Jour[];
  matieres?: MatiereCible[];
  paires?: PaireCible[];
}

export type BulkGenerateResult =
  | {
      ok: true;
      matieresUtilisees: MatiereCible[];
      pairesUtilisees: PaireCible[];
      nbCreneauxExistants: number;
      plan: BulkCreneauProposal[];
      warnings: string[];
    }
  | { ok: false; message: string };

const SLOT_STEP_MINUTES = 30;

interface SessionRequest {
  kind: "solo" | "paire";
  duree: number;
  matiereId?: string;
  matiereNom?: string;
  groupesAB?: boolean;
  matiereAId?: string;
  matiereANom?: string;
  matiereBId?: string;
  matiereBNom?: string;
  swap?: boolean;
}

export async function generateBulkPlan(opts: BulkGenerateOptions): Promise<BulkGenerateResult> {
  const { tenantId, classeId, heureDebutJournee, heureFinJournee, pourcentageSessions2h, joursAutorises } = opts;

  const debutJournee = timeToMinutes(heureDebutJournee);
  const finJournee = timeToMinutes(heureFinJournee);
  if (finJournee - debutJournee < 60) {
    return { ok: false, message: "La plage horaire quotidienne est trop courte pour caser une session d'1h." };
  }

  const annee = await getAnneeCouranteLibelle(tenantId);
  if (!annee) throw new Error("Aucune année scolaire active pour ce tenant");

  /* eslint-disable ecolpro/require-site-filter -- library function, caller passes tenantId and is responsible for site scoping */
  const [classeExistants, autresCreneaux, allEnseignants, salles, disponibilites, indisponibilites] = await Promise.all([
    prisma.emploiTemps.findMany({
      where: { tenantId, classeId, annee },
      include: { matiere: { select: { id: true, nom: true } } },
    }),
    prisma.emploiTemps.findMany({ where: { tenantId, annee, classeId: { not: classeId } } }),
    prisma.enseignant.findMany({ where: { tenantId }, include: { user: { select: { name: true } } } }),
    prisma.salle.findMany({ where: { tenantId } }),
    prisma.disponibiliteEnseignant.findMany({ where: { tenantId } }),
    prisma.indisponibiliteEnseignant.findMany({ where: { tenantId } }),
  ]);
  /* eslint-enable ecolpro/require-site-filter */

  // Matières et volume horaire cibles : fournis explicitement, sinon déduits
  // de l'emploi du temps actuel de la classe (on préserve le volume horaire
  // par matière, on ne fait que redistribuer les créneaux). Les paires ne
  // peuvent PAS être déduites automatiquement — un utilisateur doit les décrire.
  let matieresUtilisees: MatiereCible[] = opts.matieres ?? [];
  const pairesUtilisees: PaireCible[] = opts.paires ?? [];
  const matieresEnPaire = new Set(pairesUtilisees.flatMap((p) => [p.matiereAId, p.matiereBId]));

  if (matieresUtilisees.length === 0 && pairesUtilisees.length === 0) {
    const parMatiere = new Map<string, MatiereCible>();
    for (const c of classeExistants) {
      const minutes = timeToMinutes(c.heureFin) - timeToMinutes(c.heureDebut);
      const existing = parMatiere.get(c.matiereId);
      if (existing) {
        existing.minutesParSemaine += minutes;
      } else {
        parMatiere.set(c.matiereId, { matiereId: c.matiereId, matiereNom: c.matiere.nom, minutesParSemaine: minutes });
      }
    }
    matieresUtilisees = [...parMatiere.values()];
  }

  if (matieresUtilisees.length === 0 && pairesUtilisees.length === 0) {
    return {
      ok: false,
      message:
        "Cette classe n'a aucun créneau existant et aucune matière n'a été précisée : indique les matières et le volume horaire hebdomadaire souhaités pour générer un plan.",
    };
  }

  const roomNames = salles.length > 0 ? salles.map((s) => s.nom) : ["Salle 01", "Salle 02", "Salle 03"];

  // Cartes d'occupation globales (autres classes) — ce que ce plan ne doit
  // JAMAIS chevaucher, car ces engagements ne sont pas remis en cause ici.
  const teacherBusy = new Map<string, Map<Jour, Array<{ debut: string; fin: string }>>>();
  const roomBusy = new Map<string, Map<Jour, Array<{ debut: string; fin: string }>>>();
  for (const c of autresCreneaux) {
    if (c.enseignantId) {
      if (!teacherBusy.has(c.enseignantId)) teacherBusy.set(c.enseignantId, new Map());
      const dayMap = teacherBusy.get(c.enseignantId)!;
      if (!dayMap.has(c.jour as Jour)) dayMap.set(c.jour as Jour, []);
      dayMap.get(c.jour as Jour)!.push({ debut: c.heureDebut, fin: c.heureFin });
    }
    if (c.salle) {
      if (!roomBusy.has(c.salle)) roomBusy.set(c.salle, new Map());
      const dayMap = roomBusy.get(c.salle)!;
      if (!dayMap.has(c.jour as Jour)) dayMap.set(c.jour as Jour, []);
      dayMap.get(c.jour as Jour)!.push({ debut: c.heureDebut, fin: c.heureFin });
    }
  }
  const dispoMap = new Map<string, Map<Jour, Array<{ debut: string; fin: string }>>>();
  for (const d of disponibilites) {
    if (!dispoMap.has(d.enseignantId)) dispoMap.set(d.enseignantId, new Map());
    const dayMap = dispoMap.get(d.enseignantId)!;
    if (!dayMap.has(d.jour as Jour)) dayMap.set(d.jour as Jour, []);
    dayMap.get(d.jour as Jour)!.push({ debut: d.heureDebut, fin: d.heureFin });
  }

  // Carte des indisponibilités (occupations externes, congés, formations…)
  // Liste noire : tout créneau chevauchant une indispo est rejeté.
  const indispoMap = new Map<string, Map<Jour, Array<{ debut: string; fin: string }>>>();
  for (const ind of indisponibilites) {
    if (!indispoMap.has(ind.enseignantId)) indispoMap.set(ind.enseignantId, new Map());
    const dayMap = indispoMap.get(ind.enseignantId)!;
    if (!dayMap.has(ind.jour as Jour)) dayMap.set(ind.jour as Jour, []);
    dayMap.get(ind.jour as Jour)!.push({ debut: ind.heureDebut, fin: ind.heureFin });
  }

  // État local du plan en cours de construction (occupation propre à cette classe).
  const classBusy = new Map<Jour, Array<{ debut: string; fin: string }>>();
  const localTeacherBusy = new Map<string, Map<Jour, Array<{ debut: string; fin: string }>>>();
  const localRoomBusy = new Map<string, Map<Jour, Array<{ debut: string; fin: string }>>>();

  function isTeacherFree(enseignantId: string, jour: Jour, debut: string, fin: string): boolean {
    const globalBusy = (teacherBusy.get(enseignantId)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
    const localBusy = (localTeacherBusy.get(enseignantId)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
    const isIndispo = (indispoMap.get(enseignantId)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
    const dispo = dispoMap.get(enseignantId)?.get(jour) || [];
    const hasDispo = dispo.length === 0 || dispo.some((s) => overlaps(debut, fin, s.debut, s.fin));
    return !globalBusy && !localBusy && !isIndispo && hasDispo;
  }

  function isRoomFree(room: string, jour: Jour, debut: string, fin: string): boolean {
    const globalBusy = (roomBusy.get(room)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
    const localBusy = (localRoomBusy.get(room)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
    return !globalBusy && !localBusy;
  }

  function markBusy(map: Map<string, Map<Jour, Array<{ debut: string; fin: string }>>>, key: string, jour: Jour, debut: string, fin: string) {
    if (!map.has(key)) map.set(key, new Map());
    const dayMap = map.get(key)!;
    if (!dayMap.has(jour)) dayMap.set(jour, []);
    dayMap.get(jour)!.push({ debut, fin });
  }

  function teacherPoolFor(matiereNom: string) {
    const bySpecialite = fuzzyFind(allEnseignants.map((e) => ({ id: e.id, nom: e.specialite ?? "" })), matiereNom);
    const ids = new Set(bySpecialite.map((e) => e.id));
    const pool = allEnseignants.filter((e) => ids.has(e.id));
    return pool.length > 0 ? pool : allEnseignants;
  }

  const warnings: string[] = [];
  const requests: SessionRequest[] = [];

  for (const m of matieresUtilisees) {
    if (matieresEnPaire.has(m.matiereId)) continue; // gérée via sa paire, pas en solo
    const duree = m.dureeSessionMinutes;
    if (duree) {
      const nbSessions = Math.max(1, Math.round(m.minutesParSemaine / duree));
      for (let i = 0; i < nbSessions; i++) {
        requests.push({ kind: "solo", duree, matiereId: m.matiereId, matiereNom: m.matiereNom, groupesAB: m.groupesAB ?? false });
      }
      const totalPlace = nbSessions * duree;
      if (Math.abs(totalPlace - m.minutesParSemaine) > 30) {
        warnings.push(
          `${m.matiereNom} : ${Math.round(totalPlace / 60)}h planifiées pour ${Math.round(m.minutesParSemaine / 60)}h souhaitées (arrondi lié à la durée de session choisie).`
        );
      }
    } else {
      // Pas de durée précisée pour cette matière : répartition 2h/1h par défaut.
      const pct = Math.min(100, Math.max(0, pourcentageSessions2h)) / 100;
      const avgDuree = 120 * pct + 60 * (1 - pct);
      const nbSessions = Math.max(1, Math.round(m.minutesParSemaine / avgDuree));
      let nb2h = Math.round(nbSessions * pct);
      let nb1h = nbSessions - nb2h;
      while (nb2h * 120 + nb1h * 60 > m.minutesParSemaine + 60 && nb1h > 0) nb1h--;
      while (nb2h * 120 + nb1h * 60 > m.minutesParSemaine + 60 && nb2h > 0) nb2h--;
      for (let i = 0; i < nb2h; i++) requests.push({ kind: "solo", duree: 120, matiereId: m.matiereId, matiereNom: m.matiereNom, groupesAB: m.groupesAB ?? false });
      for (let i = 0; i < nb1h; i++) requests.push({ kind: "solo", duree: 60, matiereId: m.matiereId, matiereNom: m.matiereNom, groupesAB: m.groupesAB ?? false });
      const totalPlace = nb2h * 120 + nb1h * 60;
      if (Math.abs(totalPlace - m.minutesParSemaine) > 30) {
        warnings.push(
          `${m.matiereNom} : ${Math.round(totalPlace / 60)}h planifiées pour ${Math.round(m.minutesParSemaine / 60)}h souhaitées (arrondi lié à la répartition 2h/1h).`
        );
      }
    }
  }

  for (const p of pairesUtilisees) {
    const duree = p.dureeSessionMinutes ?? DEFAULT_DUREE_MINUTES;
    const nbSessions = Math.max(1, Math.round(p.minutesParSemaine / duree));
    for (let i = 0; i < nbSessions; i++) {
      requests.push({
        kind: "paire",
        duree,
        matiereAId: p.matiereAId,
        matiereANom: p.matiereANom,
        matiereBId: p.matiereBId,
        matiereBNom: p.matiereBNom,
        swap: i % 2 === 1, // alterne qui fait quoi d'une séance à l'autre
      });
    }
    const totalPlace = nbSessions * duree;
    if (Math.abs(totalPlace - p.minutesParSemaine) > 30) {
      warnings.push(
        `${p.matiereANom}/${p.matiereBNom} (bloc apparié) : ${Math.round(totalPlace / 60)}h planifiées pour ${Math.round(p.minutesParSemaine / 60)}h souhaitées.`
      );
    }
  }

  // Entrelace les "types" de sessions (round-robin) pour éviter que la même
  // matière/paire ne s'empile sur les mêmes jours consécutifs.
  const groupKey = (r: SessionRequest) => (r.kind === "solo" ? `m:${r.matiereId}` : `p:${r.matiereAId}-${r.matiereBId}`);
  const byGroup = new Map<string, SessionRequest[]>();
  for (const r of requests) {
    const key = groupKey(r);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(r);
  }
  const interleaved: SessionRequest[] = [];
  let remaining = requests.length;
  while (remaining > 0) {
    for (const list of byGroup.values()) {
      const next = list.shift();
      if (next) {
        interleaved.push(next);
        remaining--;
      }
    }
  }

  const plan: BulkCreneauProposal[] = [];
  let dayPointer = 0;
  const jours = joursAutorises.length > 0 ? joursAutorises : ALL_DAYS.filter((j) => j !== "DIMANCHE");

  // Enseignant épinglé par matière, pour garantir que le MÊME prof enseigne une
  // matière à chaque séance d'un bloc apparié (ex: le prof de maths reste celui
  // qui fait maths, quel que soit le groupe d'une séance à l'autre).
  const pinnedTeacher = new Map<string, string>();

  // Choisit un prof libre pour une matière, en privilégiant celui déjà épinglé.
  // `exclude` évite d'assigner le même prof aux deux groupes d'une même séance.
  function pickTeacher(matiereId: string, matiereNom: string, jour: Jour, debut: string, fin: string, exclude?: string) {
    const pool = teacherPoolFor(matiereNom).filter((e) => e.id !== exclude && isTeacherFree(e.id, jour, debut, fin));
    if (pool.length === 0) return null;
    const pinnedId = pinnedTeacher.get(matiereId);
    return pool.find((e) => e.id === pinnedId) ?? pool[0];
  }

  for (const req of interleaved) {
    let placed = false;

    for (let attempt = 0; attempt < jours.length && !placed; attempt++) {
      const jour = jours[(dayPointer + attempt) % jours.length];

      for (let debutMin = debutJournee; debutMin + req.duree <= finJournee; debutMin += SLOT_STEP_MINUTES) {
        const debut = minutesToTime(debutMin);
        const fin = minutesToTime(debutMin + req.duree);

        if ((classBusy.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin))) continue;

        if (req.kind === "solo") {
          const teacherPool = teacherPoolFor(req.matiereNom!);
          const freeTeachers = teacherPool.filter((e) => isTeacherFree(e.id, jour, debut, fin));
          const freeRooms = roomNames.filter((r) => isRoomFree(r, jour, debut, fin));
          if (freeTeachers.length === 0 || freeRooms.length === 0) continue;

          const profA = freeTeachers[0];
          const salleA = freeRooms[0];
          plan.push({
            jour,
            heureDebut: debut,
            heureFin: fin,
            matiereId: req.matiereId!,
            matiereNom: req.matiereNom!,
            enseignantId: profA.id,
            enseignantNom: profA.user.name,
            salle: req.groupesAB ? `${salleA} (Groupe A)` : salleA,
            groupe: req.groupesAB ? "A" : null,
          });
          classBusy.set(jour, [...(classBusy.get(jour) || []), { debut, fin }]);
          markBusy(localTeacherBusy, profA.id, jour, debut, fin);
          markBusy(localRoomBusy, salleA, jour, debut, fin);

          if (req.groupesAB) {
            const profB = freeTeachers.find((e) => e.id !== profA.id);
            const salleB = freeRooms.find((r) => r !== salleA);
            if (profB && salleB) {
              plan.push({
                jour,
                heureDebut: debut,
                heureFin: fin,
                matiereId: req.matiereId!,
                matiereNom: req.matiereNom!,
                enseignantId: profB.id,
                enseignantNom: profB.user.name,
                salle: `${salleB} (Groupe B)`,
                groupe: "B",
              });
              markBusy(localTeacherBusy, profB.id, jour, debut, fin);
              markBusy(localRoomBusy, salleB, jour, debut, fin);
            } else {
              warnings.push(
                `${req.matiereNom} (${jour}, ${debut}-${fin}) : Groupe B non placé — pas assez de professeurs/salles disponibles en parallèle pour la même matière.`
              );
            }
          }

          placed = true;
          break;
        }

        // req.kind === "paire" : groupe A et groupe B suivent deux matières
        // différentes en même temps — un seul enseignant par matière suffit.
        const matiereGroupeA = req.swap ? { id: req.matiereBId!, nom: req.matiereBNom! } : { id: req.matiereAId!, nom: req.matiereANom! };
        const matiereGroupeB = req.swap ? { id: req.matiereAId!, nom: req.matiereANom! } : { id: req.matiereBId!, nom: req.matiereBNom! };

        const profA = pickTeacher(matiereGroupeA.id, matiereGroupeA.nom, jour, debut, fin);
        const profB = profA
          ? pickTeacher(matiereGroupeB.id, matiereGroupeB.nom, jour, debut, fin, profA.id)
          : null;
        const freeRooms = roomNames.filter((r) => isRoomFree(r, jour, debut, fin));

        if (!profA || !profB || freeRooms.length < 2) continue;

        const salleA = freeRooms[0];
        const salleB = freeRooms[1];

        // Épingle chaque prof à sa matière dès la première séance placée.
        if (!pinnedTeacher.has(matiereGroupeA.id)) pinnedTeacher.set(matiereGroupeA.id, profA.id);
        if (!pinnedTeacher.has(matiereGroupeB.id)) pinnedTeacher.set(matiereGroupeB.id, profB.id);

        plan.push({
          jour,
          heureDebut: debut,
          heureFin: fin,
          matiereId: matiereGroupeA.id,
          matiereNom: matiereGroupeA.nom,
          enseignantId: profA.id,
          enseignantNom: profA.user.name,
          salle: `${salleA} (Groupe A)`,
          groupe: "A",
        });
        plan.push({
          jour,
          heureDebut: debut,
          heureFin: fin,
          matiereId: matiereGroupeB.id,
          matiereNom: matiereGroupeB.nom,
          enseignantId: profB.id,
          enseignantNom: profB.user.name,
          salle: `${salleB} (Groupe B)`,
          groupe: "B",
        });
        classBusy.set(jour, [...(classBusy.get(jour) || []), { debut, fin }]);
        markBusy(localTeacherBusy, profA.id, jour, debut, fin);
        markBusy(localTeacherBusy, profB.id, jour, debut, fin);
        markBusy(localRoomBusy, salleA, jour, debut, fin);
        markBusy(localRoomBusy, salleB, jour, debut, fin);

        placed = true;
        break;
      }
    }

    if (!placed) {
      const label =
        req.kind === "solo"
          ? `${req.matiereNom} (session de ${req.duree}min)`
          : `${req.matiereANom}/${req.matiereBNom} (bloc apparié de ${req.duree}min)`;
      warnings.push(`${label} : aucun créneau libre trouvé dans la plage ${heureDebutJournee}-${heureFinJournee}.`);
    }

    dayPointer = (dayPointer + 1) % jours.length;
  }

  return {
    ok: true,
    matieresUtilisees,
    pairesUtilisees,
    nbCreneauxExistants: classeExistants.length,
    plan,
    warnings,
  };
}
