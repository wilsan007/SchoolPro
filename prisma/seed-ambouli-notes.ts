/**
 * seed-ambouli-notes.ts — Emploi du temps, évaluations, notes, bulletins.
 * Couvre les 2 années × 2 sites.
 */

import { PrismaClient, Jour, TypeNote } from "@prisma/client";
import { setSeed, randInt, pick, chance, clamp, gauss, noteGauss, appreciationNote, mentionBulletin, decisionBulletin, dateStr } from "./seed-ambouli-helpers";
import type { RefData } from "./seed-ambouli-ref";
import type { UsersData } from "./seed-ambouli-users";
import type { ClassesData } from "./seed-ambouli-classes";

const JOURS = [Jour.LUNDI, Jour.MARDI, Jour.MERCREDI, Jour.JEUDI, Jour.VENDREDI];
const CRENEAUX = [
  { deb: "08:00", fin: "09:00" }, { deb: "09:00", fin: "10:00" },
  { deb: "10:15", fin: "11:15" }, { deb: "11:15", fin: "12:15" },
  { deb: "14:00", fin: "15:00" }, { deb: "15:00", fin: "16:00" },
];

// Matières par niveau (codes)
const MATIERES_COLLEGE = ["MATH", "FR", "ANG", "AR", "HG", "PC", "SVT", "EPS", "TECH", "ART", "MUS", "ISL"];
const MATIERES_LYCEE_COMMUN = ["MATH", "FR", "ANG", "AR", "HG", "PC", "SVT", "EPS", "ISL"];
const MATIERES_LYCEE_FILIERE: Record<string, string[]> = {
  S: ["MATH", "PC", "SVT"],
  ES: ["SES", "MATH", "HG"],
  L: ["FR", "PHILO", "ANG"],
};

export async function seedNotes(
  prisma: PrismaClient,
  ref: RefData,
  users: UsersData,
  classes: ClassesData,
): Promise<void> {
  setSeed(20241001);
  console.log("🌱 [4/12] Création des emplois du temps, évaluations, notes, bulletins...");

  // ── Emploi du temps ─────────────────────────────────────────
  let edtCount = 0;
  for (const site of ["ambouli", "arhiba"] as const) {
    for (const annee of ["2024-2025", "2025-2026"]) {
      const key = `${site}-${annee}`;
      const siteClasses = classes.classesBySiteYear[key] || [];
      const siteTeachers = users.teachers[site];

      for (const cls of siteClasses) {
        // Déterminer les matières selon le niveau
        const isLycee = ["2nde", "1ère", "Terminale"].includes(cls.niveau);
        let matiereCodes: string[];
        if (!isLycee) {
          matiereCodes = MATIERES_COLLEGE;
        } else {
          const filiere = cls.nom.split(" ")[1]; // S, ES, L, A, B, C, D
          matiereCodes = [...MATIERES_LYCEE_COMMUN];
          if (MATIERES_LYCEE_FILIERE[filiere]) {
            matiereCodes = [...matiereCodes, ...MATIERES_LYCEE_FILIERE[filiere]];
          }
          if (cls.niveau !== "2nde") matiereCodes.push("PHILO");
        }

        // Pour chaque matière, assigner 2-4 créneaux/semaine
        for (const code of matiereCodes) {
          const matiereId = ref.matieres[`${site === "ambouli" ? "AMB" : "ARH"}-${code}`];
          if (!matiereId) continue;
          const nbCreneaux = code === "MATH" || code === "FR" ? randInt(4, 5) : code === "ANG" || code === "PC" || code === "SVT" ? randInt(2, 3) : randInt(1, 2);
          const usedSlots = new Set<string>();
          for (let c = 0; c < nbCreneaux; c++) {
            let jour: Jour, creneau: typeof CRENEAUX[0], slotKey: string;
            let attempts = 0;
            do {
              jour = pick(JOURS);
              creneau = pick(CRENEAUX);
              slotKey = `${jour}-${creneau.deb}`;
              attempts++;
            } while (usedSlots.has(slotKey) && attempts < 20);
            usedSlots.add(slotKey);

            const teacher = pick(siteTeachers);
            await prisma.emploiTemps.create({
              data: {
                tenantId: ref.tenantId,
                classeId: cls.id,
                matiereId,
                enseignantId: teacher.enseignantId,
                jour,
                heureDebut: creneau.deb,
                heureFin: creneau.fin,
                salle: `Salle ${randInt(101, 203)}`,
                annee,
              },
            });
            edtCount++;
          }
        }
      }
    }
  }
  console.log(`  ✅ Emploi du temps: ${edtCount} créneaux`);

  // ── Évaluations + Notes ─────────────────────────────────────
  // Pour chaque classe × matière × période : 1-3 évaluations
  // Pour chaque évaluation : notes pour tous les élèves de la classe

  const evalTypes = [
    { type: TypeNote.CONTROLE, intitule: "Contrôle", coef: 2, nb: 2 },
    { type: TypeNote.DEVOIR, intitule: "Devoir maison", coef: 1, nb: 1 },
    { type: TypeNote.EXAMEN, intitule: "Examen", coef: 3, nb: 1 },
  ];

  let evalCount = 0;
  let noteCount = 0;

  for (const site of ["ambouli", "arhiba"] as const) {
    for (const annee of ["2024-2025", "2025-2026"]) {
      const key = `${site}-${annee}`;
      const siteClasses = classes.classesBySiteYear[key] || [];
      const siteTeachers = users.teachers[site];
      const anneeKey = annee === "2024-2025" ? "y2024" : "y2025";

      for (const cls of siteClasses) {
        const eleves = classes.elevesByClass[cls.id] || [];
        if (eleves.length === 0) continue;

        const isLycee = ["2nde", "1ère", "Terminale"].includes(cls.niveau);
        let matiereCodes: string[];
        if (!isLycee) {
          matiereCodes = MATIERES_COLLEGE;
        } else {
          const filiere = cls.nom.split(" ")[1];
          matiereCodes = [...MATIERES_LYCEE_COMMUN];
          if (MATIERES_LYCEE_FILIERE[filiere]) matiereCodes = [...matiereCodes, ...MATIERES_LYCEE_FILIERE[filiere]];
          if (cls.niveau !== "2nde") matiereCodes.push("PHILO");
        }

        for (const code of matiereCodes) {
          const matiereId = ref.matieres[`${site === "ambouli" ? "AMB" : "ARH"}-${code}`];
          if (!matiereId) continue;
          const teacher = pick(siteTeachers);

          // Moyenne de base pour cette classe × matière (varie pour réalisme)
          const moyenneBase = clamp(11 + gauss(0, 2), 7, 15);

          for (let tri = 1; tri <= 3; tri++) {
            const periodeKey = `${anneeKey}-t${tri}`;
            const periodeId = ref.periodes[periodeKey];
            if (!periodeId) continue;

            // Sauter le 3ème trimestre de l'année 2 (pas encore passé)
            if (annee === "2025-2026" && tri === 3) continue;

            for (const evType of evalTypes) {
              for (let n = 0; n < evType.nb; n++) {
                const evalDate = tri === 1 ? dateStr(parseInt(annee.split("-")[0]), 10 + n, randInt(5, 25))
                  : tri === 2 ? dateStr(parseInt(annee.split("-")[0]) + (tri === 2 && annee === "2024-2025" ? 1 : 0), randInt(1, 3), randInt(5, 25))
                  : dateStr(parseInt(annee.split("-")[1]), randInt(4, 6), randInt(5, 25));

                const eval_ = await prisma.evaluation.create({
                  data: {
                    tenantId: ref.tenantId,
                    titre: `${evType.intitule} ${n + 1} - ${code} - ${cls.nom}`,
                    type: evType.type,
                    classeId: cls.id,
                    matiereId,
                    periodeId,
                    date: evalDate,
                    duree: evType.type === TypeNote.EXAMEN ? 120 : 60,
                    coefficient: evType.coef,
                    statut: "TERMINE",
                  },
                });
                evalCount++;

                // Notes pour chaque élève
                for (const el of eleves) {
                  // L'élève a-t-il été transféré ? (pas de notes après transfert)
                  if (annee === "2025-2026" && tri > 1 && chance(0.02)) continue;

                  const note = noteGauss(moyenneBase, 2.5);
                  await prisma.note.create({
                    data: {
                      tenantId: ref.tenantId,
                      eleveId: el.id,
                      classeId: cls.id,
                      matiereId,
                      periodeId,
                      type: evType.type,
                      intitule: `${evType.intitule} ${n + 1}`,
                      valeur: note,
                      noteMax: 20,
                      coefficient: evType.coef,
                      date: evalDate,
                      appreciation: appreciationNote(note),
                      saisieParId: teacher.userId,
                      isPubliee: true,
                      evaluationId: eval_.id,
                    },
                  });
                  noteCount++;
                }
              }
            }
          }
        }
      }
    }
  }
  console.log(`  ✅ Évaluations: ${evalCount}`);
  console.log(`  ✅ Notes: ${noteCount}`);

  // ── Bulletins ───────────────────────────────────────────────
  // Pour chaque élève × période : calculer moyenne générale et créer bulletin
  console.log("  📊 Génération des bulletins...");

  let bulletinCount = 0;
  for (const site of ["ambouli", "arhiba"] as const) {
    for (const annee of ["2024-2025", "2025-2026"]) {
      const key = `${site}-${annee}`;
      const siteClasses = classes.classesBySiteYear[key] || [];
      const anneeKey = annee === "2024-2025" ? "y2024" : "y2025";

      for (const cls of siteClasses) {
        const eleves = classes.elevesByClass[cls.id] || [];
        if (eleves.length === 0) continue;

        for (let tri = 1; tri <= 3; tri++) {
          if (annee === "2025-2026" && tri === 3) continue;
          const periodeKey = `${anneeKey}-t${tri}`;
          const periodeId = ref.periodes[periodeKey];
          if (!periodeId) continue;

          // Calculer les moyennes par matière pour cette classe × période
          const notesByMatiere = new Map<string, { sum: number; coef: number; count: number }>();
          for (const el of eleves) {
            const notes = await prisma.note.findMany({
              where: { eleveId: el.id, classeId: cls.id, periodeId },
            });
            for (const nt of notes) {
              const key2 = nt.matiereId;
              const cur = notesByMatiere.get(key2) || { sum: 0, coef: 0, count: 0 };
              cur.sum += nt.valeur * nt.coefficient;
              cur.coef += nt.coefficient;
              cur.count++;
              notesByMatiere.set(key2, cur);
            }
          }

          // Pour chaque élève : bulletin
          for (const el of eleves) {
            const notes = await prisma.note.findMany({
              where: { eleveId: el.id, classeId: cls.id, periodeId },
            });
            if (notes.length === 0) continue;

            // Moyenne générale pondérée
            let totalPoints = 0, totalCoef = 0;
            const matiereMoyennes: Record<string, { moyenne: number; coef: number }> = {};
            for (const nt of notes) {
              if (!matiereMoyennes[nt.matiereId]) {
                matiereMoyennes[nt.matiereId] = { moyenne: 0, coef: 0 };
              }
              matiereMoyennes[nt.matiereId].moyenne += nt.valeur * nt.coefficient;
              matiereMoyennes[nt.matiereId].coef += nt.coefficient;
            }
            for (const [matId, data] of Object.entries(matiereMoyennes)) {
              const moy = data.moyenne / data.coef;
              totalPoints += moy * (data.coef / notes.filter(n => n.matiereId === matId).length);
              totalCoef += data.coef / notes.filter(n => n.matiereId === matId).length;
            }
            const moyenneGenerale = totalCoef > 0 ? Math.round((totalPoints / totalCoef) * 100) / 100 : 0;

            // Rang dans la classe (approximatif)
            const rang = randInt(1, eleves.length);
            const decision = decisionBulletin(moyenneGenerale, cls.niveau);
            const appreciation = moyenneGenerale >= 14 ? "Travail excellent" : moyenneGenerale >= 10 ? "Travail satisfaisant" : "Travail insuffisant";

            const bulletin = await prisma.bulletin.create({
              data: {
                tenantId: ref.tenantId,
                eleveId: el.id,
                periodeId,
                moyenneGenerale,
                moyenneClasse: 11.2,
                moyennePremier: 16.5,
                heuresAbsence: randInt(0, 15),
                rang,
                effectifClasse: eleves.length,
                appreciation,
                decision,
                isPublie: true,
                publishedAt: dateStr(parseInt(annee.split("-")[0]) + (tri === 3 ? 1 : 0), tri === 1 ? 12 : tri === 2 ? 3 : 6, randInt(10, 20)),
              },
            });
            bulletinCount++;

            // BulletinMatiere pour chaque matière
            for (const [matId, data] of Object.entries(matiereMoyennes)) {
              const moy = Math.round((data.moyenne / data.coef) * 100) / 100;
              await prisma.bulletinMatiere.create({
                data: {
                  tenantId: ref.tenantId,
                  bulletinId: bulletin.id,
                  matiereId: matId,
                  coefficient: data.coef / notes.filter(n => n.matiereId === matId).length,
                  moyenneEleve: moy,
                  rang: randInt(1, eleves.length),
                  moyenneMax: 18,
                  moyenneMin: 4,
                  appreciation: appreciationNote(moy),
                },
              });
            }
          }
        }
      }
    }
  }
  console.log(`  ✅ Bulletins: ${bulletinCount} (avec BulletinMatiere)`);
}
