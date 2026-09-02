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

// Mapping spécialité (libellé français) → code matière
const SPECIALITE_TO_CODE: Record<string, string> = {
  "Mathématiques": "MATH",
  "Français": "FR",
  "Anglais": "ANG",
  "Arabe": "AR",
  "Histoire-Géographie": "HG",
  "Physique-Chimie": "PC",
  "SVT": "SVT",
  "EPS": "EPS",
  "Technologie": "TECH",
  "Arts Plastiques": "ART",
  "Éducation Musicale": "MUS",
  "Éducation Islamique": "ISL",
  "Philosophie": "PHILO",
  "SES": "SES",
};

export async function seedNotes(
  prisma: PrismaClient,
  ref: RefData,
  users: UsersData,
  classes: ClassesData,
): Promise<void> {
  setSeed(20241001);
  console.log("🌱 [4/12] Création des emplois du temps, évaluations, notes, bulletins...");

  // ── Emploi du temps (sans conflit) ──────────────────────────
  // Numérotation des salles attitrées par site (cohérent avec 03-matieres-salles-tarifs.sql)
  const SALLES_SPECIALISEES_TS: Record<string, Record<string, { salles: string[]; obligatoire: boolean }>> = {
    ambouli: {
      PC:   { salles: ["Labo Physique Ambouli 1", "Labo Physique Ambouli 2"], obligatoire: false },
      SVT:  { salles: ["Labo SVT Ambouli"], obligatoire: false },
      TECH: { salles: ["Salle Info Ambouli"], obligatoire: false },
      EPS:  { salles: ["Gymnase Ambouli", "Terrain de sport Ambouli", "Plateau sportif Ambouli"], obligatoire: true },
    },
    arhiba: {
      PC:   { salles: ["Labo Physique Arhiba 1", "Labo Physique Arhiba 2"], obligatoire: false },
      SVT:  { salles: ["Labo SVT Arhiba"], obligatoire: false },
      TECH: { salles: ["Salle Info Arhiba"], obligatoire: false },
      EPS:  { salles: ["Gymnase Arhiba", "Terrain de sport Arhiba", "Plateau sportif Arhiba"], obligatoire: true },
    },
  };

  // Map des salles attitrées par classe (numérotation cohérente avec le SQL)
  function salleAttitree(site: string, niveau: string, index: number): string {
    const isLycee = ["2nde", "1ère", "Terminale"].includes(niveau);
    if (site === "ambouli") {
      return `Salle ${isLycee ? 200 + index : 100 + index}`;
    } else {
      return `Salle ${isLycee ? 400 + index : 300 + index}`;
    }
  }

  let edtCount = 0;
  for (const site of ["ambouli", "arhiba"] as const) {
    for (const annee of ["2024-2025", "2025-2026"]) {
      const key = `${site}-${annee}`;
      const siteClasses = classes.classesBySiteYear[key] || [];
      const siteTeachers = users.teachers[site];

      // Suivi d'occupation par site
      const occupClasse = new Set<string>(); // `${classeId}|${jour}|${heureDebut}`
      const occupEns = new Set<string>();    // `${enseignantId}|${jour}|${heureDebut}`
      const occupSalle = new Set<string>();  // `${salle}|${jour}|${heureDebut}`

      // Assigner un enseignant fixe par classe × matière (pour cohérence)
      const ensParClasseMatiere = new Map<string, string>(); // `${classeId}|${matCode}` → enseignantId

      for (const cls of siteClasses) {
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

        // Index de la classe pour la salle attitrée
        const allClassesNiveau = siteClasses.filter(c =>
          isLycee ? ["2nde", "1ère", "Terminale"].includes(c.niveau) : ["6ème", "5ème", "4ème", "3ème"].includes(c.niveau)
        );
        const clsIndex = allClassesNiveau.indexOf(cls) + 1;

        for (const code of matiereCodes) {
          const matiereId = ref.matieres[`${site === "ambouli" ? "AMB" : "ARH"}-${code}`];
          if (!matiereId) continue;

          // Assigner un enseignant fixe pour cette classe × matière
          const ensKey = `${cls.id}|${code}`;
          if (!ensParClasseMatiere.has(ensKey)) {
            // Prefer teachers whose specialty matches the subject
            const matchingTeachers = siteTeachers.filter(t => SPECIALITE_TO_CODE[t.specialite] === code);
            const teacher = matchingTeachers.length > 0
              ? pick(matchingTeachers)
              : pick(siteTeachers);
            ensParClasseMatiere.set(ensKey, teacher.enseignantId);
          }
          const enseignantId = ensParClasseMatiere.get(ensKey)!;

          const nbCreneaux = code === "MATH" || code === "FR" ? randInt(4, 5) : code === "ANG" || code === "PC" || code === "SVT" ? randInt(2, 3) : randInt(1, 2);

          for (let c = 0; c < nbCreneaux; c++) {
            // Chercher un créneau libre (classe + enseignant + salle)
            let placed = false;
            const candidats = [...JOURS].sort(() => Math.random() - 0.5);
            for (const jour of candidats) {
              for (const creneau of CRENEAUX) {
                const clsKey = `${cls.id}|${jour}|${creneau.deb}`;
                const ensKey2 = `${enseignantId}|${jour}|${creneau.deb}`;
                if (occupClasse.has(clsKey) || occupEns.has(ensKey2)) continue;

                // Déterminer la salle
                const spec = SALLES_SPECIALISEES_TS[site][code];
                let salle: string;
                if (spec) {
                  // Chercher une salle spécialisée libre
                  const salleLibre = spec.salles.find(s => !occupSalle.has(`${s}|${jour}|${creneau.deb}`));
                  if (!salleLibre) {
                    if (spec.obligatoire) continue; // EPS doit avoir une salle sport
                    salle = salleAttitree(site, cls.niveau, clsIndex); // fallback salle attitrée
                  } else {
                    salle = salleLibre;
                  }
                } else {
                  salle = salleAttitree(site, cls.niveau, clsIndex);
                }

                const salleKey = `${salle}|${jour}|${creneau.deb}`;
                if (occupSalle.has(salleKey)) continue;

                // Placer le créneau
                occupClasse.add(clsKey);
                occupEns.add(ensKey2);
                occupSalle.add(salleKey);

                await prisma.emploiTemps.create({
                  data: {
                    tenantId: ref.tenantId,
                    classeId: cls.id,
                    matiereId,
                    enseignantId,
                    jour,
                    heureDebut: creneau.deb,
                    heureFin: creneau.fin,
                    salle,
                    annee,
                  },
                });
                edtCount++;
                placed = true;
                break;
              }
              if (placed) break;
            }
            // Si non placé, on skip (semaine saturée)
          }
        }
      }
    }
  }
  console.log(`  ✅ Emploi du temps: ${edtCount} créneaux (sans conflit)`);

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
  console.log("  📊 Génération des bulletins...");

  let bulletinCount = 0;
  for (const site of ["ambouli", "arhiba"] as const) {
    for (const annee of ["2024-2025", "2025-2026"]) {
      const key = `${site}-${annee}`;
      const siteClasses = classes.classesBySiteYear[key] || [];
      const anneeKey = annee === "2024-2025" ? "y2024" : "y2025";
      const siteTeachers = users.teachers[site];

      // Cache des noms d'enseignants (userId → "Prénom Nom")
      const teacherNames = new Map<string, string>();
      if (siteTeachers.length > 0) {
        const teacherUsers = await prisma.user.findMany({
          where: { id: { in: siteTeachers.map(t => t.userId) } },
          select: { id: true, firstName: true, lastName: true, name: true },
        });
        for (const u of teacherUsers) {
          const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
          teacherNames.set(u.id, full || u.name || "Professeur");
        }
      }

      for (const cls of siteClasses) {
        const eleves = classes.elevesByClass[cls.id] || [];
        if (eleves.length === 0) continue;

        for (let tri = 1; tri <= 3; tri++) {
          if (annee === "2025-2026" && tri === 3) continue;
          const periodeKey = `${anneeKey}-t${tri}`;
          const periodeId = ref.periodes[periodeKey];
          if (!periodeId) continue;

          // ── Première passe : calculer la moyenne générale de chaque élève ──
          const eleveMoyennes: { eleveId: string; moyenne: number; matiereMoyennes: Record<string, { moyenne: number; coef: number; nbNotes: number }> }[] = [];

          for (const el of eleves) {
            const notes = await prisma.note.findMany({
              where: { eleveId: el.id, classeId: cls.id, periodeId },
            });
            if (notes.length === 0) continue;

            const matiereMoyennes: Record<string, { moyenne: number; coef: number; nbNotes: number }> = {};
            for (const nt of notes) {
              if (!matiereMoyennes[nt.matiereId]) {
                matiereMoyennes[nt.matiereId] = { moyenne: 0, coef: 0, nbNotes: 0 };
              }
              matiereMoyennes[nt.matiereId].moyenne += nt.valeur * nt.coefficient;
              matiereMoyennes[nt.matiereId].coef += nt.coefficient;
              matiereMoyennes[nt.matiereId].nbNotes++;
            }

            let totalPoints = 0, totalCoef = 0;
            for (const [, data] of Object.entries(matiereMoyennes)) {
              const moy = data.moyenne / data.coef;
              const coefMoy = data.coef / Math.max(data.nbNotes, 1);
              totalPoints += moy * coefMoy;
              totalCoef += coefMoy;
            }
            const moyenneGenerale = totalCoef > 0 ? Math.round((totalPoints / totalCoef) * 100) / 100 : 0;
            eleveMoyennes.push({ eleveId: el.id, moyenne: moyenneGenerale, matiereMoyennes });
          }

          // Trier par moyenne décroissante pour les rangs
          eleveMoyennes.sort((a, b) => b.moyenne - a.moyenne);

          // Agrégats de classe
          const moyennesGen = eleveMoyennes.map(em => em.moyenne);
          const moyenneClasse = moyennesGen.length > 0
            ? Math.round((moyennesGen.reduce((s, m) => s + m, 0) / moyennesGen.length) * 100) / 100
            : 0;
          const moyennePremier = moyennesGen.length > 0 ? moyennesGen[0] : 0;

          // ── Deuxième passe : calculer moyenneMax/moyenneMin par matière ──
          const matiereStats: Record<string, { max: number; min: number }> = {};
          for (const em of eleveMoyennes) {
            for (const [matId, data] of Object.entries(em.matiereMoyennes)) {
              const moy = data.moyenne / data.coef;
              if (!matiereStats[matId]) {
                matiereStats[matId] = { max: moy, min: moy };
              } else {
                matiereStats[matId].max = Math.max(matiereStats[matId].max, moy);
                matiereStats[matId].min = Math.min(matiereStats[matId].min, moy);
              }
            }
          }

          // ── Écrire les bulletins avec les vraies valeurs ──
          for (let idx = 0; idx < eleveMoyennes.length; idx++) {
            const em = eleveMoyennes[idx];
            const rang = idx + 1; // vrai rang basé sur le tri
            const decision = decisionBulletin(em.moyenne, cls.niveau);
            const appreciation = em.moyenne >= 14 ? "Travail excellent" : em.moyenne >= 10 ? "Travail satisfaisant" : "Travail insuffisant";

            const bulletin = await prisma.bulletin.create({
              data: {
                tenantId: ref.tenantId,
                eleveId: em.eleveId,
                periodeId,
                moyenneGenerale: em.moyenne,
                moyenneClasse,
                moyennePremier,
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
            for (const [matId, data] of Object.entries(em.matiereMoyennes)) {
              const moy = Math.round((data.moyenne / data.coef) * 100) / 100;
              const stats = matiereStats[matId] || { max: 18, min: 4 };

              // Trouver le nom du professeur pour cette matière
              // On utilise le premier enseignant du site dont la spécialité correspond
              const code = Object.entries(SPECIALITE_TO_CODE).find(([, c]) => ref.matieres[`${site === "ambouli" ? "AMB" : "ARH"}-${c}`] === matId)?.[1];
              const matchingTeacher = code
                ? siteTeachers.find(t => SPECIALITE_TO_CODE[t.specialite] === code)
                : undefined;
              const nomProfesseur = matchingTeacher
                ? (teacherNames.get(matchingTeacher.userId) ?? "Professeur")
                : "Professeur";

              await prisma.bulletinMatiere.create({
                data: {
                  tenantId: ref.tenantId,
                  bulletinId: bulletin.id,
                  matiereId: matId,
                  coefficient: data.coef / Math.max(data.nbNotes, 1),
                  moyenneEleve: moy,
                  rang: randInt(1, eleves.length), // rang par matière (approximatif)
                  moyenneMax: Math.round(stats.max * 100) / 100,
                  moyenneMin: Math.round(stats.min * 100) / 100,
                  appreciation: appreciationNote(moy),
                  nomProfesseur,
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
