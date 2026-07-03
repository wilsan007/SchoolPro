import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";

type Jour = "DIMANCHE" | "LUNDI" | "MARDI" | "MERCREDI" | "JEUDI" | "VENDREDI" | "SAMEDI";

const ALL_DAYS: Jour[] = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];
const ALL_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30",
];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const aS = timeToMinutes(aStart);
  const aE = timeToMinutes(aEnd);
  const bS = timeToMinutes(bStart);
  const bE = timeToMinutes(bEnd);
  return aS < bE && bS < aE;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:read");
    if (denied) return denied;

    const tenantId = session.user.tenantId;
    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const matiereId = searchParams.get("matiereId");
    const enseignantId = searchParams.get("enseignantId") || undefined;
    const duree = parseInt(searchParams.get("duree") || "60", 10);

    if (!classeId || !matiereId) {
      return NextResponse.json({ error: "classeId et matiereId requis" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currentYear: true } });
    const annee = tenant?.currentYear ?? "2025-2026";

    // Fetch existing creneaux for the class, teacher, and all rooms
    const [classCreneaux, teacherCreneaux, allCreneaux, enseignants, salles, disponibilites] = await Promise.all([
      prisma.emploiTemps.findMany({ where: { tenantId, classeId, annee } }),
      enseignantId
        ? prisma.emploiTemps.findMany({ where: { tenantId, enseignantId, annee } })
        : prisma.emploiTemps.findMany({ where: { tenantId, annee, enseignantId: { not: null } } }),
      prisma.emploiTemps.findMany({ where: { tenantId, annee } }),
      prisma.enseignant.findMany({
        where: { tenantId },
        include: { user: { select: { name: true } } },
      }),
      prisma.salle.findMany({ where: { tenantId } }),
      prisma.disponibiliteEnseignant.findMany({ where: { tenantId } }),
    ]);

    // Build room usage map: jour -> time -> set of rooms
    const roomUsage = new Map<string, Set<string>>();
    for (const c of allCreneaux) {
      if (!c.salle) continue;
      const key = `${c.jour}`;
      if (!roomUsage.has(key)) roomUsage.set(key, new Set());
      // We'll check overlap dynamically
    }

    // Build teacher busy map: enseignantId -> jour -> [{start, end}]
    const teacherBusy = new Map<string, Map<string, Array<{ debut: string; fin: string }>>>();
    for (const c of allCreneaux) {
      if (!c.enseignantId) continue;
      if (!teacherBusy.has(c.enseignantId)) teacherBusy.set(c.enseignantId, new Map());
      const dayMap = teacherBusy.get(c.enseignantId)!;
      if (!dayMap.has(c.jour)) dayMap.set(c.jour, []);
      dayMap.get(c.jour)!.push({ debut: c.heureDebut, fin: c.heureFin });
    }

    // Build class busy map: jour -> [{start, end}]
    const classBusy = new Map<string, Array<{ debut: string; fin: string }>>();
    for (const c of classCreneaux) {
      if (!classBusy.has(c.jour)) classBusy.set(c.jour, []);
      classBusy.get(c.jour)!.push({ debut: c.heureDebut, fin: c.heureFin });
    }

    // Build room busy map: salle -> jour -> [{start, end}]
    const roomBusy = new Map<string, Map<string, Array<{ debut: string; fin: string }>>>();
    for (const c of allCreneaux) {
      if (!c.salle) continue;
      if (!roomBusy.has(c.salle)) roomBusy.set(c.salle, new Map());
      const dayMap = roomBusy.get(c.salle)!;
      if (!dayMap.has(c.jour)) dayMap.set(c.jour, []);
      dayMap.get(c.jour)!.push({ debut: c.heureDebut, fin: c.heureFin });
    }

    // Build disponibilites map: enseignantId -> jour -> [{start, end}]
    const dispoMap = new Map<string, Map<string, Array<{ debut: string; fin: string }>>>();
    for (const d of disponibilites) {
      if (!dispoMap.has(d.enseignantId)) dispoMap.set(d.enseignantId, new Map());
      const dayMap = dispoMap.get(d.enseignantId)!;
      if (!dayMap.has(d.jour)) dayMap.set(d.jour, []);
      dayMap.get(d.jour)!.push({ debut: d.heureDebut, fin: d.heureFin });
    }

    // Generate suggestions
    const suggestions: Array<{
      jour: Jour;
      heureDebut: string;
      heureFin: string;
      enseignantId: string | null;
      enseignantNom: string | null;
      salle: string | null;
      score: number;
      conflits: string[];
      raison: string;
    }> = [];

    const dureeMin = duree;
    const roomNames = salles.length > 0 ? salles.map((s) => s.nom) : ["Salle 01", "Salle 02", "Salle 03"];

    for (const jour of ALL_DAYS) {
      for (let i = 0; i < ALL_SLOTS.length; i++) {
        const debut = ALL_SLOTS[i];
        const debutMin = timeToMinutes(debut);
        const finMin = debutMin + dureeMin;
        if (finMin > timeToMinutes("18:00")) continue;

        const fin = `${String(Math.floor(finMin / 60)).padStart(2, "0")}:${String(finMin % 60).padStart(2, "0")}`;

        // Check class conflict
        const classConflicts = (classBusy.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
        if (classConflicts) continue;

        // Find available teachers
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

        // Find available rooms
        const availableRooms = roomNames.filter((room) => {
          const isBusy = (roomBusy.get(room)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
          return !isBusy;
        });

        // Score this slot
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

        // Prefer morning slots (07:00-12:00)
        if (debutMin >= 420 && debutMin < 720) {
          score += 10;
          raisons.push("Matinée");
        }

        // Penalize lunch time
        if (debutMin >= 720 && debutMin < 840) {
          score -= 15;
          raisons.push("Pause déjeuner");
        }

        // Prefer earlier in the week
        const dayIndex = ALL_DAYS.indexOf(jour);
        score += Math.max(0, 5 - dayIndex);

        score = Math.min(100, Math.max(0, score));

        // Only include if at least a teacher or room is available
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

    // Sort by score descending, take top 10
    suggestions.sort((a, b) => b.score - a.score);
    const top = suggestions.slice(0, 10);

    return NextResponse.json({ suggestions: top });
  } catch (error) {
    console.error("[API/emploi-du-temps/suggest]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
