import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { calculerMoyenne } from "@/lib/utils";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";

const Schema = z.object({
  classeId: z.string().min(1),
  periodeId: z.string().min(1),
});

function genererAppréciation(moyenne: number | null): string {
  if (!moyenne) return "Travail à évaluer.";
  if (moyenne >= 18) return "Excellent trimestre. Résultats remarquables, continuez ainsi.";
  if (moyenne >= 16) return "Très bons résultats. Élève sérieux et appliqué.";
  if (moyenne >= 14) return "Bons résultats. Peut encore progresser avec plus d'efforts.";
  if (moyenne >= 12) return "Résultats satisfaisants. Des efforts supplémentaires sont attendus.";
  if (moyenne >= 10) return "Résultats moyens. Un travail plus régulier s'impose.";
  if (moyenne >= 8)  return "Résultats insuffisants. Des difficultés persistantes nécessitent un suivi.";
  return "Résultats très insuffisants. Un soutien scolaire est fortement recommandé.";
}

function calculateHours(heureDebut: string | null, heureFin: string | null): number {
  if (!heureDebut || !heureFin) return 4; // Demi-journée par défaut
  try {
    const [h1, m1] = heureDebut.split(':').map(Number);
    const [h2, m2] = heureFin.split(':').map(Number);
    let diff = (h2 + m2 / 60) - (h1 + m1 / 60);
    return diff > 0 ? diff : 4;
  } catch {
    return 4;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const { classeId, periodeId } = parsed.data;
    const tenantId = session.user.tenantId;

    const classe = await prisma.classe.findFirst({
      where: { id: classeId, tenantId },
      include: { eleves: { where: { statut: "ACTIF" } } },
    });
    if (!classe) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const periode = await prisma.periode.findUnique({ where: { id: periodeId } });
    if (!periode) return NextResponse.json({ error: "Période introuvable" }, { status: 404 });

    const allNotes = await prisma.note.findMany({
      where: { tenantId, classeId, periodeId, isPubliee: true },
      include: { matiere: true },
    });

    const absences = await prisma.absence.findMany({
      where: {
        tenantId,
        eleveId: { in: classe.eleves.map(e => e.id) },
        date: { gte: periode.dateDebut, lte: periode.dateFin }
      }
    });

    // 1. Averages per subject per student
    const matieresMap = new Map<string, any>();
    const eleveMatiereMoyennes: Record<string, Record<string, number>> = {};
    const matiereStats: Record<string, { max: number, min: number }> = {};

    for (const note of allNotes) {
      if (!matieresMap.has(note.matiereId)) {
        matieresMap.set(note.matiereId, note.matiere);
        eleveMatiereMoyennes[note.matiereId] = {};
      }
    }

    for (const [matiereId, matiere] of matieresMap.entries()) {
      let max = -1, min = 21;
      for (const eleve of classe.eleves) {
        const notesEleve = allNotes.filter(n => n.eleveId === eleve.id && n.matiereId === matiereId);
        if (notesEleve.length > 0) {
          const moy = calculerMoyenne(notesEleve.map(n => ({ valeur: n.valeur, noteMax: n.noteMax, coefficient: n.coefficient })));
          if (moy !== null) {
            eleveMatiereMoyennes[matiereId][eleve.id] = moy;
            if (moy > max) max = moy;
            if (moy < min) min = moy;
          }
        }
      }
      matiereStats[matiereId] = { max: max === -1 ? 0 : max, min: min === 21 ? 0 : min };
    }

    // 2. Generate bulletins for each student — écritures DB en parallèle (au lieu d'une boucle séquentielle)
    const bulletinsGlobalAverages = await Promise.all(classe.eleves.map(async (eleve) => {
      const absEleve = absences.filter(a => a.eleveId === eleve.id);
      const heuresAbsence = Math.round(absEleve.reduce((acc, a) => acc + calculateHours(a.heureDebut, a.heureFin), 0));

      let totalCoef = 0;
      let totalPoints = 0;
      const matieresToSave = [];

      for (const [matiereId, matiere] of matieresMap.entries()) {
        const moy = eleveMatiereMoyennes[matiereId]?.[eleve.id] ?? null;
        if (moy !== null) {
          totalPoints += moy * matiere.coefficient;
          totalCoef += matiere.coefficient;
        }

        // Rang de l'élève dans cette matière
        let rangMatiere = null;
        if (moy !== null) {
          const allMoyMatiere = Object.values(eleveMatiereMoyennes[matiereId] || {}).sort((a, b) => b - a);
          rangMatiere = allMoyMatiere.indexOf(moy) + 1;
        }

        matieresToSave.push({
          matiereId,
          nomProfesseur: "Professeur", // TODO: fetch from EmploiTemps
          coefficient: matiere.coefficient,
          moyenneEleve: moy,
          rang: rangMatiere,
          moyenneMax: matiereStats[matiereId].max,
          moyenneMin: matiereStats[matiereId].min,
          appreciation: moy !== null ? genererAppréciation(moy) : "Non noté"
        });
      }

      const moyenneGenerale = totalCoef > 0 ? Number((totalPoints / totalCoef).toFixed(2)) : null;
      const appreciation = genererAppréciation(moyenneGenerale);

      // Save bulletin
      const bulletin = await prisma.bulletin.upsert({
        where: { eleveId_periodeId: { eleveId: eleve.id, periodeId } },
        update: {
          moyenneGenerale,
          heuresAbsence,
          appreciation,
          effectifClasse: classe.eleves.length,
        },
        create: {
          tenantId,
          eleveId: eleve.id,
          periodeId,
          moyenneGenerale,
          heuresAbsence,
          appreciation,
          effectifClasse: classe.eleves.length,
        },
      });

      // Update BulletinMatieres
      await prisma.bulletinMatiere.deleteMany({ where: { bulletinId: bulletin.id } });
      if (matieresToSave.length > 0) {
        await prisma.bulletinMatiere.createMany({
          data: matieresToSave.map(m => ({
            ...m,
            bulletinId: bulletin.id,
            tenantId,
          }))
        });
      }

      return { eleveId: eleve.id, moyenne: moyenneGenerale };
    }));

    // 3. Update global rankings and class averages
    const validMoyennes = bulletinsGlobalAverages.filter(b => b.moyenne !== null).map(b => b.moyenne as number);
    const moyenneClasse = validMoyennes.length > 0 ? Number((validMoyennes.reduce((a, b) => a + b, 0) / validMoyennes.length).toFixed(2)) : null;
    const moyennePremier = validMoyennes.length > 0 ? Math.max(...validMoyennes) : null;

    bulletinsGlobalAverages.sort((a, b) => (b.moyenne ?? -1) - (a.moyenne ?? -1));

    await Promise.all(bulletinsGlobalAverages.map((b, i) =>
      prisma.bulletin.update({
        where: { eleveId_periodeId: { eleveId: b.eleveId, periodeId } },
        data: {
          rang: b.moyenne !== null ? i + 1 : null,
          moyenneClasse,
          moyennePremier
        }
      })
    ));

    return NextResponse.json({ success: true, count: classe.eleves.length });
  } catch (error) {
    console.error("[API/bulletins/generer]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
