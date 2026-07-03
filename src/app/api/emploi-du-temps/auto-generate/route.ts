import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";

type Jour = "DIMANCHE" | "LUNDI" | "MARDI" | "MERCREDI" | "JEUDI" | "VENDREDI" | "SAMEDI";

const ALL_DAYS: Jour[] = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];
const ALL_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
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

interface SlotCandidate {
  jour: Jour;
  heureDebut: string;
  heureFin: string;
  enseignantId: string | null;
  salle: string | null;
  score: number;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:write");
    if (denied) return denied;

    const tenantId = session.user.tenantId;
    const body = await req.json();
    const { classeId } = body as { classeId?: string };

    if (!classeId) {
      return NextResponse.json({ error: "classeId requis" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currentYear: true } });
    const annee = tenant?.currentYear ?? "2025-2026";

    // Fetch all data needed
    const [classe, matieres, enseignants, salles, existingCreneaux, disponibilites] = await Promise.all([
      prisma.classe.findFirst({ where: { id: classeId, tenantId } }),
      prisma.matiere.findMany({ where: { tenantId }, orderBy: { coefficient: "desc" } }),
      prisma.enseignant.findMany({
        where: { tenantId },
        include: { user: { select: { name: true } } },
      }),
      prisma.salle.findMany({ where: { tenantId } }),
      prisma.emploiTemps.findMany({ where: { tenantId, annee } }),
      prisma.disponibiliteEnseignant.findMany({ where: { tenantId } }),
    ]);

    if (!classe) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const roomNames = salles.length > 0 ? salles.map((s) => s.nom) : ["Salle 01", "Salle 02", "Salle 03"];

    // Build busy maps
    const teacherBusy = new Map<string, Map<string, Array<{ debut: string; fin: string }>>>();
    const roomBusy = new Map<string, Map<string, Array<{ debut: string; fin: string }>>>();
    const dispoMap = new Map<string, Map<string, Array<{ debut: string; fin: string }>>>();

    for (const c of existingCreneaux) {
      // Teacher
      if (c.enseignantId) {
        if (!teacherBusy.has(c.enseignantId)) teacherBusy.set(c.enseignantId, new Map());
        const dm = teacherBusy.get(c.enseignantId)!;
        if (!dm.has(c.jour)) dm.set(c.jour, []);
        dm.get(c.jour)!.push({ debut: c.heureDebut, fin: c.heureFin });
      }
      // Room
      if (c.salle) {
        if (!roomBusy.has(c.salle)) roomBusy.set(c.salle, new Map());
        const dm = roomBusy.get(c.salle)!;
        if (!dm.has(c.jour)) dm.set(c.jour, []);
        dm.get(c.jour)!.push({ debut: c.heureDebut, fin: c.heureFin });
      }
    }

    // Build class busy per jour
    const classBusyByDay = new Map<string, Map<string, Array<{ debut: string; fin: string }>>>();
    for (const c of existingCreneaux) {
      if (c.classeId !== classeId) continue;
      if (!classBusyByDay.has(c.classeId)) classBusyByDay.set(c.classeId, new Map());
      const dm = classBusyByDay.get(c.classeId)!;
      if (!dm.has(c.jour)) dm.set(c.jour, []);
      dm.get(c.jour)!.push({ debut: c.heureDebut, fin: c.heureFin });
    }

    for (const d of disponibilites) {
      if (!dispoMap.has(d.enseignantId)) dispoMap.set(d.enseignantId, new Map());
      const dm = dispoMap.get(d.enseignantId)!;
      if (!dm.has(d.jour)) dm.set(d.jour, []);
      dm.get(d.jour)!.push({ debut: d.heureDebut, fin: d.heureFin });
    }

    // Determine matiere-teacher associations from existing data
    const matiereTeachers = new Map<string, string[]>();
    for (const c of existingCreneaux) {
      if (c.matiereId && c.enseignantId) {
        if (!matiereTeachers.has(c.matiereId)) matiereTeachers.set(c.matiereId, []);
        if (!matiereTeachers.get(c.matiereId)!.includes(c.enseignantId)) {
          matiereTeachers.get(c.matiereId)!.push(c.enseignantId);
        }
      }
    }

    // Algorithm: Greedy with scoring
    // For each matiere (ordered by coefficient desc), assign 2-4 slots per week
    const createdCreneaux: Array<{
      id: string;
      jour: Jour;
      heureDebut: string;
      heureFin: string;
      salle: string | null;
      matiere: { nom: string; code: string | null; couleur: string | null };
      classe: { nom: string };
      enseignant: { user: { name: string | null } } | null;
      classeId?: string;
      matiereId?: string;
      enseignantId?: string | null;
    }> = [];

    const stats = { totalCreated: 0, conflicts: 0, skipped: 0 };

    // Default: 2 slots per matiere, more for high-coefficient ones
    for (const matiere of matieres) {
      const slotsPerWeek = Math.min(4, Math.max(2, Math.ceil(matiere.coefficient / 2)));
      let assigned = 0;

      // Find best candidates for this matiere
      const candidates: SlotCandidate[] = [];

      for (const jour of ALL_DAYS) {
        for (let i = 0; i < ALL_SLOTS.length - 1; i++) {
          const debut = ALL_SLOTS[i];
          const debutMin = timeToMinutes(debut);
          const finMin = debutMin + 60; // 1h slots
          if (finMin > timeToMinutes("18:00")) continue;
          const fin = `${String(Math.floor(finMin / 60)).padStart(2, "0")}:${String(finMin % 60).padStart(2, "0")}`;

          // Skip lunch break
          if (debutMin >= 720 && debutMin < 840) continue;

          // Check class conflict
          const classConf = (classBusyByDay.get(classeId)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
          if (classConf) continue;

          // Find available teacher (prefer those already teaching this matiere)
          const preferredTeacherIds = matiereTeachers.get(matiere.id) || [];
          let bestTeacher: { id: string; nom: string } | null = null;
          let teacherScore = 0;

          for (const ens of enseignants) {
            const isBusy = (teacherBusy.get(ens.id)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
            if (isBusy) continue;
            const dispo = dispoMap.get(ens.id)?.get(jour) || [];
            const hasDispo = dispo.length === 0 || dispo.some((s) => overlaps(debut, fin, s.debut, s.fin));
            if (!hasDispo) continue;

            let s = 10;
            if (preferredTeacherIds.includes(ens.id)) s += 20;
            if (ens.specialite && matiere.nom.toLowerCase().includes(ens.specialite.toLowerCase())) s += 15;
            if (s > teacherScore) {
              teacherScore = s;
              bestTeacher = { id: ens.id, nom: ens.user.name ?? "Enseignant" };
            }
          }

          // Find available room
          const availableRoom = roomNames.find((room) => {
            const isBusy = (roomBusy.get(room)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
            return !isBusy;
          });

          // Score
          let score = 50;
          if (bestTeacher) score += teacherScore;
          if (availableRoom) score += 10;
          if (debutMin >= 420 && debutMin < 720) score += 5; // morning preference
          const dayIdx = ALL_DAYS.indexOf(jour);
          score += Math.max(0, 5 - dayIdx);

          if (!bestTeacher && !availableRoom) continue;

          candidates.push({
            jour,
            heureDebut: debut,
            heureFin: fin,
            enseignantId: bestTeacher?.id ?? null,
            salle: availableRoom ?? null,
            score,
          });
        }
      }

      // Sort by score and pick top N, avoiding consecutive duplicates
      candidates.sort((a, b) => b.score - a.score);
      const usedDays = new Set<string>();

      for (const cand of candidates) {
        if (assigned >= slotsPerWeek) break;
        if (usedDays.has(cand.jour) && usedDays.size < ALL_DAYS.length) continue;

        try {
          const creneau = await prisma.emploiTemps.create({
            data: {
              tenantId,
              classeId,
              matiereId: matiere.id,
              enseignantId: cand.enseignantId,
              jour: cand.jour,
              heureDebut: cand.heureDebut,
              heureFin: cand.heureFin,
              salle: cand.salle,
              annee,
            },
            include: {
              matiere: { select: { nom: true, code: true, couleur: true } },
              classe: { select: { nom: true } },
              enseignant: { include: { user: { select: { name: true } } } },
            },
          });

          createdCreneaux.push(creneau as never);
          assigned++;
          usedDays.add(cand.jour);
          stats.totalCreated++;

          // Update busy maps
          if (cand.enseignantId) {
            if (!teacherBusy.has(cand.enseignantId)) teacherBusy.set(cand.enseignantId, new Map());
            const dm = teacherBusy.get(cand.enseignantId)!;
            if (!dm.has(cand.jour)) dm.set(cand.jour, []);
            dm.get(cand.jour)!.push({ debut: cand.heureDebut, fin: cand.heureFin });
          }
          if (cand.salle) {
            if (!roomBusy.has(cand.salle)) roomBusy.set(cand.salle, new Map());
            const dm = roomBusy.get(cand.salle)!;
            if (!dm.has(cand.jour)) dm.set(cand.jour, []);
            dm.get(cand.jour)!.push({ debut: cand.heureDebut, fin: cand.heureFin });
          }
          if (!classBusyByDay.has(classeId)) classBusyByDay.set(classeId, new Map());
          const cm = classBusyByDay.get(classeId)!;
          if (!cm.has(cand.jour)) cm.set(cand.jour, []);
          cm.get(cand.jour)!.push({ debut: cand.heureDebut, fin: cand.heureFin });
        } catch {
          stats.conflicts++;
        }
      }

      if (assigned === 0) stats.skipped++;
    }

    return NextResponse.json({ creneaux: createdCreneaux, stats });
  } catch (error) {
    console.error("[API/emploi-du-temps/auto-generate]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
