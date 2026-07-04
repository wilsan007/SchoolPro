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

interface BlockCandidate {
  jour: Jour;
  heureDebut: string;
  heureFin: string;
  durationHours: number;
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
    const { classeId, matiereIds, matiereConfigs, heureMin, heureMax, jours } = body as {
      classeId?: string;
      matiereIds?: string[];
      matiereConfigs?: Array<{
        matiereId: string;
        troncCommun?: boolean;
        troncCommunHeures?: number;
        groupes?: boolean;
        groupesHeures?: number;
        pairedMatiereId?: string;
        enseignantId?: string;
      }>;
      heureMin?: string;
      heureMax?: string;
      jours?: string[];
    };

    if (!classeId) {
      return NextResponse.json({ error: "classeId requis" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currentYear: true } });
    const annee = tenant?.currentYear ?? "2025-2026";

    // Determine which days and time range to use
    const activeDays: Jour[] = (jours && jours.length > 0 ? jours : ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"]) as Jour[];
    const minTime = heureMin ?? "07:00";
    const maxTime = heureMax ?? "18:00";
    const minMin = timeToMinutes(minTime);
    const maxMin = timeToMinutes(maxTime);

    // Build the list of slots from the time range
    const timeSlots: string[] = [];
    for (let m = minMin; m < maxMin; m += 30) {
      timeSlots.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    }

    // Fetch all data needed
    const [classe, allMatieres, enseignants, allSalles, existingCreneaux, disponibilites] = await Promise.all([
      prisma.classe.findFirst({ where: { id: classeId, tenantId }, select: { id: true, nom: true, siteId: true } }),
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

    // Filter salles by site if the classe is attached to a site
    const salles = classe.siteId
      ? allSalles.filter((s) => s.siteId === classe.siteId)
      : allSalles;

    // Delete existing creneaux for this classe/year before generating
    const deleteResult = await prisma.emploiTemps.deleteMany({
      where: { classeId, annee, tenantId },
    });
    console.log(`[auto-generate] Deleted ${deleteResult.count} existing creneaux for classe ${classeId}, annee ${annee}`);

    // Re-fetch creneaux AFTER deletion to build accurate busy maps
    const remainingCreneaux = await prisma.emploiTemps.findMany({ where: { tenantId, annee } });
    console.log(`[auto-generate] Remaining creneaux in tenant: ${remainingCreneaux.length}`);

    // Build matiere config map from matiereConfigs or fallback to matiereIds
    const configMap = new Map<string, {
      troncCommun: boolean;
      troncCommunHeures: number;
      groupes: boolean;
      groupesHeures: number;
      pairedMatiereId?: string;
      enseignantId?: string;
    }>();

    if (matiereConfigs && matiereConfigs.length > 0) {
      for (const mc of matiereConfigs) {
        configMap.set(mc.matiereId, {
          troncCommun: mc.troncCommun ?? true,
          troncCommunHeures: mc.troncCommunHeures ?? 2,
          groupes: mc.groupes ?? false,
          groupesHeures: mc.groupesHeures ?? 1,
          pairedMatiereId: mc.pairedMatiereId,
          enseignantId: mc.enseignantId,
        });
      }
    } else if (matiereIds && matiereIds.length > 0) {
      for (const mId of matiereIds) {
        configMap.set(mId, { troncCommun: true, troncCommunHeures: 2, groupes: false, groupesHeures: 1 });
      }
    }

    // Determine paired matiere relationships
    // With reverse links from frontend: A→B and B→A
    // The FIRST in configMap iteration that has a pairedMatiereId is the "owner" (generates group slots + paired slots),
    // the target is "secondary" (gets paired group slots from owner, but still generates its own tronc commun slots)
    const pairedAsSecondary = new Set<string>();
    const owners = new Set<string>();
    const ownerOfSecondary = new Map<string, string>(); // secondaryId -> ownerId
    for (const [matiereId, cfg] of configMap) {
      if (cfg.pairedMatiereId && !owners.has(matiereId) && !pairedAsSecondary.has(matiereId)) {
        owners.add(matiereId);
        pairedAsSecondary.add(cfg.pairedMatiereId);
        ownerOfSecondary.set(cfg.pairedMatiereId, matiereId);
      }
    }
    console.log(`[auto-generate] Owners (generate paired slots): ${[...owners].map(id => allMatieres.find(m => m.id === id)?.nom ?? id).join(', ')}`);
    console.log(`[auto-generate] Paired as secondary (group slots from owner, own tronc commun): ${[...pairedAsSecondary].map(id => allMatieres.find(m => m.id === id)?.nom ?? id).join(', ')}`);

    // Filter matieres: keep owners, non-paired, AND secondary (for their own tronc commun)
    // Secondary matieres are NOT excluded - they just won't generate group slots (only tronc commun)
    const matieres = configMap.size > 0
      ? allMatieres.filter((m) => configMap.has(m.id))
      : allMatieres;
    console.log(`[auto-generate] Matieres to process: ${matieres.map(m => m.nom).join(', ')}`);

    const roomNames = salles.map((s) => s.nom);
    const hasRooms = roomNames.length > 0;

    if (!hasRooms) {
      return NextResponse.json({
        error: "Aucune salle enregistrée pour ce tenant. Ajoutez des salles dans Paramètres avant de générer l'emploi du temps.",
        code: "NO_ROOMS",
      }, { status: 400 });
    }

    // Build busy maps
    const teacherBusy = new Map<string, Map<string, Array<{ debut: string; fin: string }>>>();
    const roomBusy = new Map<string, Map<string, Array<{ debut: string; fin: string }>>>();
    const dispoMap = new Map<string, Map<string, Array<{ debut: string; fin: string }>>>();

    for (const c of remainingCreneaux) {
      // Skip creneaux of the current classe (they were deleted above)
      if (c.classeId === classeId) continue;
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

    // Build class busy per jour (exclude current classe — its creneaux were deleted)
    const classBusyByDay = new Map<string, Map<string, Array<{ debut: string; fin: string }>>>();
    for (const c of remainingCreneaux) {
      if (c.classeId === classeId) continue;
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
    for (const c of remainingCreneaux) {
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
    const report: Array<{
      matiereNom: string;
      requested: number;
      assigned: number;
      reason: string;
      details: string[];
    }> = [];

    // For each matiere, assign slots based on config (tronc commun + groupes independently)
    for (const matiere of matieres) {
      const cfg = configMap.get(matiere.id);
      const hasTroncCommun = cfg?.troncCommun ?? true;
      const troncCommunHeures = cfg?.troncCommunHeures ?? 2;
      const hasGroupes = cfg?.groupes ?? false;
      const groupesHeures = cfg?.groupesHeures ?? 1;
      const forcedEnseignantId = cfg?.enseignantId;
      const pairedMatiereId = cfg?.pairedMatiereId;
      const isSecondary = pairedAsSecondary.has(matiere.id);

      // Total slots: tronc commun slots + groupes slots * 2 (group A + group B)
      // Secondary paired matieres: only tronc commun (group slots are created by the owner)
      const troncCommunSlots = hasTroncCommun ? troncCommunHeures : 0;
      const groupesSlots = (hasGroupes && !isSecondary) ? groupesHeures * 2 : 0;
      const totalSlotsNeeded = troncCommunSlots + groupesSlots;
      let assigned = 0;
      let troncCommunAssigned = 0;
      let groupesAssigned = 0;

      console.log(`[auto-generate] Matiere: ${matiere.nom} ${isSecondary ? '(SECONDARY - paired group slots from owner)' : ''} | troncCommun=${hasTroncCommun ? troncCommunHeures + 'h' : 'non'} | groupes=${hasGroupes && !isSecondary ? groupesHeures + 'h x2' : 'non'} | totalSlotsNeeded=${totalSlotsNeeded}`);

      // Find best candidates for this matiere
      // Candidates are now BLOCKS of consecutive hours (not individual 1h slots)
      // A block of 2h means: 07:00-08:00 AND 08:00-09:00 in the same room, same teacher
      interface BlockCandidate {
        jour: Jour;
        heureDebut: string; // start of first hour
        heureFin: string;   // end of last hour
        durationHours: number;
        enseignantId: string | null;
        salle: string | null;
        score: number;
      }
      const candidates: BlockCandidate[] = [];

      // Determine block size: tronc commun hours per block, or groupes hours per block
      const troncCommunBlockSize = troncCommunHeures;
      const groupesBlockSize = groupesHeures;

      for (const jour of activeDays) {
        for (let i = 0; i < timeSlots.length - 1; i++) {
          const debut = timeSlots[i];
          const debutMin = timeToMinutes(debut);

          // Skip lunch break start (12:00 - 14:00)
          if (debutMin >= 720 && debutMin < 840) continue;

          // Try block sizes: tronc commun always, groupes only for non-secondary
          const blockSizes = isSecondary
            ? [troncCommunBlockSize]
            : [troncCommunBlockSize, groupesBlockSize];
          for (const blockSize of blockSizes) {
            if (blockSize <= 0) continue;
            const blockFinMin = debutMin + blockSize * 60;
            if (blockFinMin > maxMin) continue;

            // Check that no lunch break falls within the block
            let hasLunchBreak = false;
            for (let h = 0; h < blockSize; h++) {
              const slotStart = debutMin + h * 60;
              if (slotStart >= 720 && slotStart < 840) { hasLunchBreak = true; break; }
            }
            if (hasLunchBreak) continue;

            const fin = `${String(Math.floor(blockFinMin / 60)).padStart(2, "0")}:${String(blockFinMin % 60).padStart(2, "0")}`;

            // Check class conflict for the ENTIRE block
            let classConf = false;
            for (let h = 0; h < blockSize; h++) {
              const slotStart = debutMin + h * 60;
              const slotEnd = slotStart + 60;
              const sStart = `${String(Math.floor(slotStart / 60)).padStart(2, "0")}:${String(slotStart % 60).padStart(2, "0")}`;
              const sEnd = `${String(Math.floor(slotEnd / 60)).padStart(2, "0")}:${String(slotEnd % 60).padStart(2, "0")}`;
              if ((classBusyByDay.get(classeId)?.get(jour) || []).some((s) => overlaps(sStart, sEnd, s.debut, s.fin))) {
                classConf = true; break;
              }
            }
            if (classConf) continue;

            // Find available teacher for the ENTIRE block
            const preferredTeacherIds = matiereTeachers.get(matiere.id) || [];
            let bestTeacher: { id: string; nom: string } | null = null;
            let teacherScore = 0;
            let forcedTeacherAvailable = false;

            for (const ens of enseignants) {
              // Check teacher availability for all hours in the block
              let isBusy = false;
              for (let h = 0; h < blockSize; h++) {
                const slotStart = debutMin + h * 60;
                const slotEnd = slotStart + 60;
                const sStart = `${String(Math.floor(slotStart / 60)).padStart(2, "0")}:${String(slotStart % 60).padStart(2, "0")}`;
                const sEnd = `${String(Math.floor(slotEnd / 60)).padStart(2, "0")}:${String(slotEnd % 60).padStart(2, "0")}`;
                if ((teacherBusy.get(ens.id)?.get(jour) || []).some((s) => overlaps(sStart, sEnd, s.debut, s.fin))) {
                  isBusy = true; break;
                }
                const dispo = dispoMap.get(ens.id)?.get(jour) || [];
                const hasDispo = dispo.length === 0 || dispo.some((s) => overlaps(sStart, sEnd, s.debut, s.fin));
                if (!hasDispo) { isBusy = true; break; }
              }
              if (isBusy) continue;

              if (forcedEnseignantId && ens.id === forcedEnseignantId) {
                forcedTeacherAvailable = true;
              }

              let s = 10;
              if (preferredTeacherIds.includes(ens.id)) s += 20;
              if (ens.specialite && matiere.nom.toLowerCase().includes(ens.specialite.toLowerCase())) s += 15;
              if (forcedEnseignantId && ens.id === forcedEnseignantId) s += 50;
              if (s > teacherScore) {
                teacherScore = s;
                bestTeacher = { id: ens.id, nom: ens.user.name ?? "Enseignant" };
              }
            }

            if (!bestTeacher) continue;
            if (forcedEnseignantId && forcedTeacherAvailable && bestTeacher.id !== forcedEnseignantId) {
              const forcedEns = enseignants.find((e) => e.id === forcedEnseignantId);
              if (forcedEns) bestTeacher = { id: forcedEns.id, nom: forcedEns.user.name ?? "Enseignant" };
            }

            // Find available room for the ENTIRE block (same room all hours)
            let availableRoom: string | null = null;
            if (hasRooms) {
              availableRoom = roomNames.find((room) => {
                for (let h = 0; h < blockSize; h++) {
                  const slotStart = debutMin + h * 60;
                  const slotEnd = slotStart + 60;
                  const sStart = `${String(Math.floor(slotStart / 60)).padStart(2, "0")}:${String(slotStart % 60).padStart(2, "0")}`;
                  const sEnd = `${String(Math.floor(slotEnd / 60)).padStart(2, "0")}:${String(slotEnd % 60).padStart(2, "0")}`;
                  if ((roomBusy.get(room)?.get(jour) || []).some((s) => overlaps(sStart, sEnd, s.debut, s.fin))) {
                    return false;
                  }
                }
                return true;
              }) ?? null;
            }

            // Score
            let score = 50;
            score += teacherScore;
            if (availableRoom) score += 10;
            if (debutMin >= 420 && debutMin < 720) score += 5; // morning preference
            const dayIdx = activeDays.indexOf(jour);
            score += Math.max(0, 5 - dayIdx);
            // Prefer blocks that match the needed size exactly
            score += blockSize * 2;

            candidates.push({
              jour,
              heureDebut: debut,
              heureFin: fin,
              durationHours: blockSize,
              enseignantId: bestTeacher.id,
              salle: availableRoom,
              score,
            });
          }
        }
      }

      // Sort by score and pick top N, with live conflict re-checking
      candidates.sort((a, b) => b.score - a.score);
      const usedDays = new Set<string>();

      for (const cand of candidates) {
        if (assigned >= totalSlotsNeeded) break;
        // Spread across days first, then allow same day if all days used
        if (usedDays.has(cand.jour) && usedDays.size < activeDays.length) continue;

        // Determine if this block is tronc commun or groupes based on its durationHours
        // Match the block size to the config
        let isGroupes = false;
        let groupIndex = -1;
        // Secondary paired matieres: only generate tronc commun, skip group slots (those come from owner)
        if (hasGroupes && !isSecondary && cand.durationHours === groupesBlockSize && groupesAssigned < groupesSlots) {
          isGroupes = true;
          groupIndex = Math.floor(groupesAssigned / groupesBlockSize) % 2 === 0 ? 0 : 1;
        } else if (hasTroncCommun && cand.durationHours === troncCommunBlockSize && troncCommunAssigned < troncCommunSlots) {
          isGroupes = false;
        } else {
          continue; // skip candidates that don't match remaining needs
        }

        // RE-CHECK class conflict for the ENTIRE block
        const debutMin = timeToMinutes(cand.heureDebut);
        let classConf = false;
        for (let h = 0; h < cand.durationHours; h++) {
          const slotStart = debutMin + h * 60;
          const slotEnd = slotStart + 60;
          const sStart = `${String(Math.floor(slotStart / 60)).padStart(2, "0")}:${String(slotStart % 60).padStart(2, "0")}`;
          const sEnd = `${String(Math.floor(slotEnd / 60)).padStart(2, "0")}:${String(slotEnd % 60).padStart(2, "0")}`;
          if ((classBusyByDay.get(classeId)?.get(cand.jour) || []).some((s) => overlaps(sStart, sEnd, s.debut, s.fin))) {
            classConf = true; break;
          }
        }
        if (classConf) continue;

        // RE-CHECK teacher conflict for the ENTIRE block
        if (cand.enseignantId) {
          let teacherConf = false;
          for (let h = 0; h < cand.durationHours; h++) {
            const slotStart = debutMin + h * 60;
            const slotEnd = slotStart + 60;
            const sStart = `${String(Math.floor(slotStart / 60)).padStart(2, "0")}:${String(slotStart % 60).padStart(2, "0")}`;
            const sEnd = `${String(Math.floor(slotEnd / 60)).padStart(2, "0")}:${String(slotEnd % 60).padStart(2, "0")}`;
            if ((teacherBusy.get(cand.enseignantId)?.get(cand.jour) || []).some((s) => overlaps(sStart, sEnd, s.debut, s.fin))) {
              teacherConf = true; break;
            }
          }
          if (teacherConf) continue;
        }

        // RE-CHECK room conflict for the ENTIRE block
        if (cand.salle) {
          let roomConf = false;
          for (let h = 0; h < cand.durationHours; h++) {
            const slotStart = debutMin + h * 60;
            const slotEnd = slotStart + 60;
            const sStart = `${String(Math.floor(slotStart / 60)).padStart(2, "0")}:${String(slotStart % 60).padStart(2, "0")}`;
            const sEnd = `${String(Math.floor(slotEnd / 60)).padStart(2, "0")}:${String(slotEnd % 60).padStart(2, "0")}`;
            if ((roomBusy.get(cand.salle)?.get(cand.jour) || []).some((s) => overlaps(sStart, sEnd, s.debut, s.fin))) {
              roomConf = true; break;
            }
          }
          if (roomConf) continue;
        }

        const groupLabel = isGroupes ? (groupIndex === 0 ? " (Groupe A)" : " (Groupe B)") : "";
        const salleLabel = cand.salle ? `${cand.salle}${groupLabel}` : null;
        const sallePhysique = cand.salle ?? null;

        // Create ONE creneau for the entire block (heureDebut to heureFin)
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
              salle: salleLabel,
              annee,
            },
            include: {
              matiere: { select: { nom: true, code: true, couleur: true } },
              classe: { select: { nom: true } },
              enseignant: { include: { user: { select: { name: true } } } },
            },
          });

          createdCreneaux.push(creneau as never);
          assigned += cand.durationHours;
          if (isGroupes) groupesAssigned += cand.durationHours; else troncCommunAssigned += cand.durationHours;
          usedDays.add(cand.jour);
          stats.totalCreated++;

          // Update busy maps for the ENTIRE block
          if (cand.enseignantId) {
            if (!teacherBusy.has(cand.enseignantId)) teacherBusy.set(cand.enseignantId, new Map());
            const dm = teacherBusy.get(cand.enseignantId)!;
            if (!dm.has(cand.jour)) dm.set(cand.jour, []);
            dm.get(cand.jour)!.push({ debut: cand.heureDebut, fin: cand.heureFin });
          }
          if (sallePhysique) {
            if (!roomBusy.has(sallePhysique)) roomBusy.set(sallePhysique, new Map());
            const dm = roomBusy.get(sallePhysique)!;
            if (!dm.has(cand.jour)) dm.set(cand.jour, []);
            dm.get(cand.jour)!.push({ debut: cand.heureDebut, fin: cand.heureFin });
          }
          if (!classBusyByDay.has(classeId)) classBusyByDay.set(classeId, new Map());
          const cm = classBusyByDay.get(classeId)!;
          if (!cm.has(cand.jour)) cm.set(cand.jour, []);
          cm.get(cand.jour)!.push({ debut: cand.heureDebut, fin: cand.heureFin });

          // If groupes mode with paired matiere, create the paired slot
          // (the other group attends the paired matiere at the same time)
          if (isGroupes && pairedMatiereId && groupIndex >= 0) {
            const pairedMatiere = allMatieres.find((m) => m.id === pairedMatiereId);
            if (pairedMatiere) {
              const pairedGroupLabel = groupIndex === 0 ? " (Groupe B)" : " (Groupe A)";
              console.log(`[auto-generate] Creating paired slot: ${pairedMatiere.nom} ${pairedGroupLabel} for ${matiere.nom} ${cand.jour} ${cand.heureDebut}`);

              // Find a DIFFERENT room for the paired group (not the same physical room)
              let pairedSallePhysique: string | null = null;
              if (hasRooms) {
                pairedSallePhysique = roomNames.find((room) => {
                  if (room === sallePhysique) return false; // must be a different room
                  const isBusy = (roomBusy.get(room)?.get(cand.jour) || []).some((s) => overlaps(cand.heureDebut, cand.heureFin, s.debut, s.fin));
                  return !isBusy;
                }) ?? null;
              }
              const pairedSalleLabel = pairedSallePhysique ? `${pairedSallePhysique}${pairedGroupLabel}` : null;

              // Find a teacher for the paired matiere
              const pairedPreferred = matiereTeachers.get(pairedMatiereId) || [];
              let pairedTeacher: { id: string } | null = null;
              for (const ens of enseignants) {
                const isBusy = (teacherBusy.get(ens.id)?.get(cand.jour) || []).some((s) => overlaps(cand.heureDebut, cand.heureFin, s.debut, s.fin));
                if (isBusy) continue;
                const dispo = dispoMap.get(ens.id)?.get(cand.jour) || [];
                const hasDispo = dispo.length === 0 || dispo.some((s) => overlaps(cand.heureDebut, cand.heureFin, s.debut, s.fin));
                if (!hasDispo) continue;
                if (pairedPreferred.includes(ens.id)) {
                  pairedTeacher = { id: ens.id };
                  break;
                }
                if (!pairedTeacher) pairedTeacher = { id: ens.id };
              }

              try {
                const pairedCreneau = await prisma.emploiTemps.create({
                  data: {
                    tenantId,
                    classeId,
                    matiereId: pairedMatiereId,
                    enseignantId: pairedTeacher?.id ?? null,
                    jour: cand.jour,
                    heureDebut: cand.heureDebut,
                    heureFin: cand.heureFin,
                    salle: pairedSalleLabel,
                    annee,
                  },
                  include: {
                    matiere: { select: { nom: true, code: true, couleur: true } },
                    classe: { select: { nom: true } },
                    enseignant: { include: { user: { select: { name: true } } } },
                  },
                });

                createdCreneaux.push(pairedCreneau as never);
                stats.totalCreated++;

                // Update busy maps for paired creneau
                if (pairedTeacher) {
                  if (!teacherBusy.has(pairedTeacher.id)) teacherBusy.set(pairedTeacher.id, new Map());
                  const dm = teacherBusy.get(pairedTeacher.id)!;
                  if (!dm.has(cand.jour)) dm.set(cand.jour, []);
                  dm.get(cand.jour)!.push({ debut: cand.heureDebut, fin: cand.heureFin });
                }
                if (pairedSallePhysique) {
                  if (!roomBusy.has(pairedSallePhysique)) roomBusy.set(pairedSallePhysique, new Map());
                  const dm = roomBusy.get(pairedSallePhysique)!;
                  if (!dm.has(cand.jour)) dm.set(cand.jour, []);
                  dm.get(cand.jour)!.push({ debut: cand.heureDebut, fin: cand.heureFin });
                }
                // Update class busy map for paired creneau (same slot, already marked above, but ensure)
                if (!classBusyByDay.has(classeId)) classBusyByDay.set(classeId, new Map());
                const cm2 = classBusyByDay.get(classeId)!;
                if (!cm2.has(cand.jour)) cm2.set(cand.jour, []);
                // Don't add duplicate slot to class busy (already added above)
              } catch {
                stats.conflicts++;
              }
            }
          }
        } catch {
          stats.conflicts++;
        }
      }

      console.log(`[auto-generate] DONE Matiere: ${matiere.nom} | assigned=${assigned}/${totalSlotsNeeded} | TC=${troncCommunAssigned}/${troncCommunSlots} | Groupes=${groupesAssigned}/${groupesSlots}`);

      if (assigned === 0) {
        stats.skipped++;
        const reasons: string[] = [];
        const matiereEnseignants = matiereTeachers.get(matiere.id) || [];
        if (enseignants.length === 0) {
          reasons.push("Aucun enseignant enregistré dans le système");
        } else if (forcedEnseignantId) {
          const forcedEns = enseignants.find((e) => e.id === forcedEnseignantId);
          reasons.push(`Enseignant forcé (${forcedEns?.user.name ?? "inconnu"}) non disponible sur les créneaux demandés`);
        } else if (matiereEnseignants.length === 0) {
          reasons.push(`Aucun enseignant n'enseigne actuellement "${matiere.nom}" — assignez d'abord un enseignant à cette matière via un créneau manuel`);
        } else {
          const ensNames = matiereEnseignants.map((id) => enseignants.find((e) => e.id === id)?.user.name ?? "?").join(", ");
          reasons.push(`Enseignants de "${matiere.nom}" (${ensNames}) tous occupés ou indisponibles sur les jours/horaires sélectionnés`);
        }
        if (roomNames.length === 0) {
          reasons.push("Aucune salle enregistrée pour ce tenant — ajoutez des salles dans Paramètres avant de générer l'emploi du temps");
        } else {
          // Check if all rooms are busy on all active days
          let allRoomsBusy = true;
          for (const jour of activeDays) {
            for (let i = 0; i < timeSlots.length - 1; i++) {
              const debut = timeSlots[i];
              const debutMin = timeToMinutes(debut);
              const finMin = debutMin + 60;
              if (finMin > maxMin) continue;
              if (debutMin >= 720 && debutMin < 840) continue;
              const fin = `${String(Math.floor(finMin / 60)).padStart(2, "0")}:${String(finMin % 60).padStart(2, "0")}`;
              const classConf = (classBusyByDay.get(classeId)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
              if (classConf) continue;
              const hasFreeRoom = roomNames.some((room) => !((roomBusy.get(room)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin))));
              if (hasFreeRoom) { allRoomsBusy = false; break; }
            }
            if (!allRoomsBusy) break;
          }
          if (allRoomsBusy) {
            reasons.push(`Toutes les salles (${roomNames.join(", ")}) sont occupées sur tous les créneaux disponibles des jours sélectionnés`);
          }
        }
        if (activeDays.length === 0) {
          reasons.push("Aucun jour sélectionné");
        }
        // Check if class is fully booked
        let classFullyBooked = true;
        for (const jour of activeDays) {
          for (let i = 0; i < timeSlots.length - 1; i++) {
            const debut = timeSlots[i];
            const debutMin = timeToMinutes(debut);
            const finMin = debutMin + 60;
            if (finMin > maxMin) continue;
            if (debutMin >= 720 && debutMin < 840) continue;
            const fin = `${String(Math.floor(finMin / 60)).padStart(2, "0")}:${String(finMin % 60).padStart(2, "0")}`;
            const classConf = (classBusyByDay.get(classeId)?.get(jour) || []).some((s) => overlaps(debut, fin, s.debut, s.fin));
            if (!classConf) { classFullyBooked = false; break; }
          }
          if (!classFullyBooked) break;
        }
        if (classFullyBooked && activeDays.length > 0) {
          reasons.push("La classe a déjà des créneaux sur tous les horaires disponibles des jours sélectionnés");
        }
        report.push({
          matiereNom: matiere.nom,
          requested: totalSlotsNeeded,
          assigned: 0,
          reason: reasons[0] ?? "Aucun créneau disponible",
          details: reasons,
        });
      } else if (assigned < totalSlotsNeeded) {
        report.push({
          matiereNom: matiere.nom,
          requested: totalSlotsNeeded,
          assigned,
          reason: `Partiellement généré (${assigned}/${totalSlotsNeeded}) — pas assez de créneaux libres`,
          details: [`Créneaux créés: ${assigned}/${totalSlotsNeeded}`],
        });
      } else {
        report.push({
          matiereNom: matiere.nom,
          requested: totalSlotsNeeded,
          assigned,
          reason: "OK",
          details: [],
        });
      }
    }

    console.log(`[auto-generate] Total created: ${stats.totalCreated}, conflicts: ${stats.conflicts}, matieres processed: ${matieres.length}`);

    return NextResponse.json({ creneaux: createdCreneaux, stats, report });
  } catch (error) {
    console.error("[API/emploi-du-temps/auto-generate]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
