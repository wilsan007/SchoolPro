/**
 * seed-ambouli-classes.ts — Classes, élèves, parents pour 2 sites × 2 ans.
 *
 * Niveaux : 6ème → Terminale (collège + lycée)
 * Classes : 3 par niveau collège, 3-4 par niveau lycée
 * Élèves : ~27 par classe × 2 sites = ~600 élèves/an/site
 * Promotion : année 1 → année 2 (6ème→5ème, Terminale→Alumni, nouveaux entrants)
 */

import { PrismaClient, Role, Sexe, StatutEleve, LienParente, TypeRecommandation } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  setSeed, randInt, pick, pickSome, chance, gauss, clamp,
  NOMS_GARCONS, NOMS_FILLES, NOMS_FAMILLE, PROFESSIONS,
  dateStr, addYears, noteGauss, mentionBulletin,
} from "./seed-ambouli-helpers";
import type { RefData } from "./seed-ambouli-ref";
import type { UsersData } from "./seed-ambouli-users";

const PASSWORD_HASH = bcrypt.hashSync("Ambouli@2026!", 12);

export interface ClassesData {
  classesBySiteYear: Record<string, { id: string; niveau: string; nom: string }[]>;
  // "ambouli-2024-2025" -> [{ id, niveau, nom }]
  elevesByClass: Record<string, { id: string; nom: string; prenom: string; sexe: Sexe; dateNaissance: Date }[]>;
  parentsByEleve: Record<string, { id: string; userId?: string }[]>;
  alumniIds: string[];
}

const NIVEAUX_COLLEGE = ["6ème", "5ème", "4ème", "3ème"];
const NIVEAUX_LYCEE = ["2nde", "1ère", "Terminale"];
const FILIERES_LYCEE: Record<string, string[]> = {
  "2nde": ["A", "B", "C", "D"],
  "1ère": ["S", "ES", "L"],
  "Terminale": ["S", "ES", "L"],
};

// Promotion : niveau année 1 -> niveau année 2
const PROMOTION: Record<string, string | null> = {
  "6ème": "5ème", "5ème": "4ème", "4ème": "3ème",
  "3ème": "2nde", "2nde": "1ère", "1ère": "Terminale",
  "Terminale": null, // diplômé
};

function generateClassesForSiteYear(
  prisma: PrismaClient,
  ref: RefData,
  site: "ambouli" | "arhiba",
  annee: string,
  anneeId: string,
): { id: string; niveau: string; nom: string; structure: string }[] {
  // Retourné mais créé en batch plus loin
  const out: { id: string; niveau: string; nom: string; structure: string }[] = [];
  const siteId = ref.sites[site];
  for (const niv of NIVEAUX_COLLEGE) {
    for (let i = 0; i < 3; i++) {
      const lettre = String.fromCharCode(65 + i); // A, B, C
      out.push({
        id: `cls-${site}-${annee}-${niv}-${lettre}`.replace(/è|é/g, "e"),
        niveau: niv,
        nom: `${niv} ${lettre}`,
        structure: site === "ambouli" ? ref.structures.collegeAmbouli : ref.structures.collegeArhiba,
      });
    }
  }
  for (const niv of NIVEAUX_LYCEE) {
    const filieres = FILIERES_LYCEE[niv];
    for (const f of filieres) {
      out.push({
        id: `cls-${site}-${annee}-${niv}-${f}`.replace(/è|é/g, "e"),
        niveau: niv,
        nom: `${niv} ${f}`,
        structure: site === "ambouli" ? ref.structures.lyceeAmbouli : ref.structures.lyceeArhiba,
      });
    }
  }
  return out;
}

export async function seedClassesEleves(
  prisma: PrismaClient,
  ref: RefData,
  users: UsersData,
): Promise<ClassesData> {
  setSeed(20240915);
  console.log("🌱 [3/12] Création des classes, élèves, parents, parcours, alumni...");

  const classesBySiteYear: ClassesData["classesBySiteYear"] = {};
  const elevesByClass: ClassesData["elevesByClass"] = {};
  const parentsByEleve: ClassesData["parentsByEleve"] = {};
  const alumniIds: string[] = [];

  // Pour chaque site × année
  for (const site of ["ambouli", "arhiba"] as const) {
    for (const [annee, anneeId] of Object.entries({ "2024-2025": ref.annees.y2024, "2025-2026": ref.annees.y2025 })) {
      const key = `${site}-${annee}`;
      const classDefs = generateClassesForSiteYear(prisma, ref, site, annee, anneeId);
      classesBySiteYear[key] = [];

      // Assigner un prof principal à chaque classe (parmi les enseignants du site)
      const siteTeachers = users.teachers[site];

      for (const cd of classDefs) {
        const profPrincipal = siteTeachers[randInt(0, siteTeachers.length - 1)];
        const cls = await prisma.classe.upsert({
          where: { id: cd.id },
          update: {},
          create: {
            id: cd.id,
            tenantId: ref.tenantId,
            siteId: ref.sites[site],
            structureId: cd.structure,
            nom: cd.nom,
            niveau: cd.niveau,
            filiere: cd.nom.includes("S") ? "Scientifique" : cd.nom.includes("ES") ? "Économique" : cd.nom.includes("L") ? "Littéraire" : null,
            effectifMax: 40,
            annee,
            profPrincipalId: profPrincipal.enseignantId,
          },
        });
        classesBySiteYear[key].push({ id: cls.id, niveau: cd.niveau, nom: cd.nom });
      }
    }
  }
  const totalClasses = Object.values(classesBySiteYear).reduce((s, arr) => s + arr.length, 0);
  console.log(`  ✅ Classes: ${totalClasses} (22 × 2 sites × 2 ans)`);

  // ── Génération des élèves ───────────────────────────────────
  // Année 1 (2024-2025) : on crée les élèves de tous les niveaux.
  // Année 2 (2025-2026) : on "promeut" les élèves (6ème→5ème, etc.),
  //   Terminale → Alumni, nouveaux entrants en 6ème et 2nde.

  const eleveRegistry: { id: string; nom: string; prenom: string; sexe: Sexe; dateNaissance: Date; niveau: string; site: string; annee: string; classeId: string; matricule: string; moyenneY1: number }[] = [];
  let matriculeCounter = 1;

  // Année 1 : création initiale
  for (const site of ["ambouli", "arhiba"] as const) {
    for (const cls of classesBySiteYear[`${site}-2024-2025`]) {
      const effectif = randInt(25, 30);
      const elevesList: ClassesData["elevesByClass"][string] = [];
      for (let i = 0; i < effectif; i++) {
        const sexe = chance(0.5) ? Sexe.F : Sexe.M;
        const prenom = sexe === Sexe.M ? pick(NOMS_GARCONS) : pick(NOMS_FILLES);
        const nom = pick(NOMS_FAMILLE);
        // Âge approximatif par niveau
        const ageBase: Record<string, number> = { "6ème": 11, "5ème": 12, "4ème": 13, "3ème": 14, "2nde": 15, "1ère": 16, "Terminale": 17 };
        const age = ageBase[cls.niveau] + (chance(0.15) ? 1 : 0);
        const dateNaissance = dateStr(2024 - age, randInt(1, 12), randInt(1, 28));
        const matricule = `AMB-${site === "ambouli" ? "A" : "B"}-2024-${String(matriculeCounter).padStart(4, "0")}`;
        matriculeCounter++;

        const eleve = await prisma.eleve.create({
          data: {
            tenantId: ref.tenantId,
            siteId: ref.sites[site],
            matricule,
            nom,
            prenom,
            dateNaissance,
            lieuNaissance: "Djibouti",
            nationalite: "DJ",
            sexe,
            statut: StatutEleve.ACTIF,
            classeId: cls.id,
            regime: pick(["externe", "demi-pensionnaire", "demi-pensionnaire", "externe"]),
            anneeInscription: "2024-2025",
            dateInscription: dateStr(2024, 9, randInt(10, 20)),
            groupeSanguin: pick(["A+", "B+", "O+", "AB+", "A-", "O+"]),
            contactUrgenceNom: `${prenom} ${nom}`,
            contactUrgencePhone: `+253 77 ${randInt(10, 99)} ${randInt(10, 99)} ${randInt(10, 99)}`,
          },
        });
        elevesList.push({ id: eleve.id, nom, prenom, sexe, dateNaissance });
        eleveRegistry.push({ id: eleve.id, nom, prenom, sexe, dateNaissance, niveau: cls.niveau, site, annee: "2024-2025", classeId: cls.id, matricule, moyenneY1: 0 });

        // Parent
        const parentPrenom = sexe === Sexe.M ? pick(NOMS_GARCONS) : pick(NOMS_FILLES);
        const parentNom = nom; // même nom de famille
        const parentPhone = `+253 77 ${randInt(10, 99)} ${randInt(10, 99)} ${randInt(10, 99)}`;
        const parentEmail = `parent.${nom.toLowerCase()}.${parentPrenom.toLowerCase()}.${matriculeCounter}@cite-ambouli.dj`;
        const parentUser = await prisma.user.create({
          data: {
            tenantId: ref.tenantId,
            siteId: ref.sites[site],
            email: parentEmail,
            password: PASSWORD_HASH,
            name: `${parentPrenom} ${parentNom}`,
            firstName: parentPrenom,
            lastName: parentNom,
            role: Role.PARENT,
            phone: parentPhone,
            mustChangePassword: true,
          },
        });
        const parent = await prisma.parent.create({
          data: {
            tenantId: ref.tenantId,
            userId: parentUser.id,
            nom: parentNom,
            prenom: parentPrenom,
            email: parentEmail,
            phone: parentPhone,
            profession: pick(PROFESSIONS),
            adresse: `Quartier ${pick(["Ambouli", "Arhiba", "Haramous", "Djibouti-Centre", "Balbala", "PK12"])}, Djibouti`,
          },
        });
        await prisma.eleveParent.create({
          data: {
            eleveId: eleve.id,
            parentId: parent.id,
            lien: pick([LienParente.PERE, LienParente.MERE, LienParente.PERE, LienParente.TUTEUR]) as LienParente,
            isGardien: true,
          },
        });
        parentsByEleve[eleve.id] = [{ id: parent.id, userId: parentUser.id }];

        // PreferencesParent (LEARNOS)
        await prisma.preferencesParent.create({
          data: {
            tenantId: ref.tenantId,
            parentId: parent.id,
            langue: "fr",
            alertesActives: true,
            niveauMinimal: "INFO",
            plafondHebdomadaire: 3,
          },
        }).catch(() => {}); // ignore si existe déjà

        elevesByClass[cls.id] = elevesList;
      }
    }
  }
  const totalElevesY1 = eleveRegistry.length;
  console.log(`  ✅ Élèves année 1: ${totalElevesY1} (~600, 2 sites)`);

  // ── Année 2 : promotion + nouveaux entrants ─────────────────
  // Pour chaque élève de l'année 1, on le "promeut" vers le niveau supérieur
  // (sauf Terminale → Alumni). On crée une nouvelle affectation de classe
  // et un ParcoursScolaire pour l'année 1.

  // D'abord, créons les parcours scolaires pour l'année 1
  for (const e of eleveRegistry) {
    // Moyenne annuelle réaliste
    const moyenne = clamp(gauss(11.5, 3), 4, 18);
    e.moyenneY1 = moyenne;
    const mention = mentionBulletin(moyenne);
    const decision = moyenne >= 10 ? "Passage" : "Redoublement";
    const niveauSuivant = PROMOTION[e.niveau];

    await prisma.parcoursScolaire.create({
      data: {
        tenantId: ref.tenantId,
        eleveId: e.id,
        annee: "2024-2025",
        classe: e.niveau,
        niveau: e.niveau,
        moyenneAnnuelle: Math.round(moyenne * 100) / 100,
        rang: randInt(1, 30),
        effectif: 28,
        decision,
        mention,
        recommandation: niveauSuivant === null
          ? (moyenne >= 14 ? TypeRecommandation.EXCELLENTE_VOIE : TypeRecommandation.FILIERE_SCIENTIFIQUE)
          : moyenne < 8 ? TypeRecommandation.SOUTIEN_RENFORCE : moyenne < 10 ? TypeRecommandation.REDOUBLEMENT : undefined,
        commentaire: moyenne >= 14 ? "Excellent trimestre, continuez ainsi" : moyenne >= 10 ? "Travail satisfaisant" : "Doit fournir plus d'efforts",
      },
    });

    // HistoriqueClasse
    await prisma.historiqueClasse.create({
      data: {
        tenantId: ref.tenantId,
        eleveId: e.id,
        classeId: e.classeId,
        dateEntree: dateStr(2024, 9, 15),
        dateSortie: dateStr(2025, 7, 15),
        motif: "Fin d'année",
      },
    });

    // Si Terminale → Alumni
    if (e.niveau === "Terminale" && moyenne >= 10) {
      const al = await prisma.alumni.create({
        data: {
          tenantId: ref.tenantId,
          siteId: ref.sites[e.site as "ambouli" | "arhiba"],
          eleveId: e.id,
          nom: e.nom,
          prenom: e.prenom,
          sexe: e.sexe,
          dateNaissance: e.dateNaissance,
          anneeDiplome: "2024-2025",
          classeDepart: `Terminale`,
          mention,
          numeroDiplome: `BAC-2025-${String(alumniIds.length + 1).padStart(4, "0")}`,
          statut: pick(["ETUDES_SUPERIEURES", "EN_EMPLOI", "RECHERCHE_EMPLOI", "ETUDES_SUPERIEURES"]),
          etablissement: pick(["Université de Djibouti", "ENSI", "EST", "Institut d'Administration"]),
          formation: pick(["Informatique", "Gestion", "Génie Civil", "Médecine", "Droit"]),
          ville: "Djibouti",
          pays: "DJ",
          accepteContact: true,
        },
      });
      alumniIds.push(al.id);

      // Marquer l'élève comme diplômé
      await prisma.eleve.update({
        where: { id: e.id },
        data: { statut: StatutEleve.DIPLOME, dateSortie: dateStr(2025, 7, 15), motifSortie: "Fin d'études" },
      });
    }
  }
  console.log(`  ✅ Parcours scolaires année 1: ${eleveRegistry.length}`);
  console.log(`  ✅ Alumni (Terminale diplômés): ${alumniIds.length}`);

  // Départs : ~3% des élèves ne reviennent pas l'année suivante
  const MOTIFS_DEPART = [
    { statut: StatutEleve.TRANSFERE, motif: "Transfert vers un autre établissement" },
    { statut: StatutEleve.TRANSFERE, motif: "Déménagement" },
    { statut: StatutEleve.TRANSFERE, motif: "Transfert" },
    { statut: StatutEleve.ABANDONNE, motif: "Raisons familiales" },
    { statut: StatutEleve.ABANDONNE, motif: "Raisons financières" },
  ];
  const nbDeparts = Math.round(eleveRegistry.length * 0.03);
  const elevesDepart = pickSome(eleveRegistry.filter(e => e.niveau !== "Terminale"), nbDeparts);
  const elevesPartisIds = new Set(elevesDepart.map(e => e.id));

  for (const e of elevesDepart) {
    const motifDepart = pick(MOTIFS_DEPART);
    await prisma.eleve.update({
      where: { id: e.id },
      data: {
        statut: motifDepart.statut,
        dateSortie: dateStr(2025, 7, 15),
        motifSortie: motifDepart.motif,
      },
    });
  }
  console.log(`  ✅ Départs (transferts/abandons): ${elevesDepart.length} (~3%)`);

  // Année 2 : promotion + redoublement
  const eleveRegistryY2: typeof eleveRegistry = [];
  for (const e of eleveRegistry) {
    if (elevesPartisIds.has(e.id)) continue; // élève parti, pas de réinscription
    // Terminale diplômé → déjà traité, skip
    if (e.niveau === "Terminale" && e.moyenneY1 >= 10) continue;

    // Déterminer le niveau de destination
    const niveauSuivant = e.moyenneY1 >= 10 ? PROMOTION[e.niveau] : e.niveau;
    if (!niveauSuivant && e.niveau !== "Terminale") continue;
    // Si Terminale avec moyenne < 10, niveauSuivant = "Terminale" (redoublement)
    const niveauDest = e.niveau === "Terminale" && e.moyenneY1 < 10 ? "Terminale" : niveauSuivant;
    if (!niveauDest) continue;

    const key = `${e.site}-2025-2026`;
    const classesY2 = classesBySiteYear[key];
    const classesNiveau = classesY2.filter(c => c.niveau === niveauDest);
    if (classesNiveau.length === 0) continue;
    const clsY2 = pick(classesNiveau);

    const isRedoublant = e.moyenneY1 < 10;

    // Mettre à jour l'élève : nouvelle classe
    await prisma.eleve.update({
      where: { id: e.id },
      data: { classeId: clsY2.id, anneeInscription: "2025-2026" },
    });

    // Historique
    await prisma.historiqueClasse.create({
      data: {
        tenantId: ref.tenantId,
        eleveId: e.id,
        classeId: clsY2.id,
        dateEntree: dateStr(2025, 9, 15),
        motif: isRedoublant ? "Redoublement" : "Promotion",
      },
    });

    eleveRegistryY2.push({ ...e, niveau: niveauDest, annee: "2025-2026", classeId: clsY2.id });

    // Ajouter à elevesByClass
    if (!elevesByClass[clsY2.id]) elevesByClass[clsY2.id] = [];
    elevesByClass[clsY2.id].push({ id: e.id, nom: e.nom, prenom: e.prenom, sexe: e.sexe, dateNaissance: e.dateNaissance });
  }

  // Parcours scolaires pour l'année 2
  for (const e of eleveRegistryY2) {
    // Pour un redoublant, la moyenne Y2 est corrélée à Y1 (gain modéré)
    // Pour un promu, nouvelle moyenne indépendante
    let moyenneY2: number;
    if (e.moyenneY1 < 10) {
      // Redoublant : gain de 0.5 à 2.5 points en général
      const gain = 0.5 + (randInt(0, 20) / 10); // 0.5 à 2.5
      moyenneY2 = clamp(e.moyenneY1 + gain, 4, 18);
    } else {
      // Promu : moyenne indépendante
      moyenneY2 = clamp(gauss(11.5, 3), 4, 18);
    }

    const mention = mentionBulletin(moyenneY2);
    const decision = moyenneY2 >= 10 ? "Passage" : "Redoublement";

    // Rang réel : compter les élèves de la même classe
    const classeEffectif = elevesByClass[e.classeId]?.length || 28;

    await prisma.parcoursScolaire.create({
      data: {
        tenantId: ref.tenantId,
        eleveId: e.id,
        annee: "2025-2026",
        classe: e.niveau,
        niveau: e.niveau,
        moyenneAnnuelle: Math.round(moyenneY2 * 100) / 100,
        rang: randInt(1, classeEffectif),
        effectif: classeEffectif,
        decision,
        mention,
        recommandation: e.niveau === "Terminale"
          ? (moyenneY2 >= 14 ? TypeRecommandation.EXCELLENTE_VOIE : TypeRecommandation.FILIERE_SCIENTIFIQUE)
          : moyenneY2 < 8 ? TypeRecommandation.SOUTIEN_RENFORCE : moyenneY2 < 10 ? TypeRecommandation.REDOUBLEMENT : undefined,
        commentaire: moyenneY2 >= 14 ? "Excellent trimestre, continuez ainsi" : moyenneY2 >= 10 ? "Travail satisfaisant" : "Doit fournir plus d'efforts",
      },
    });
  }
  console.log(`  ✅ Parcours scolaires année 2: ${eleveRegistryY2.length}`);

  // Nouveaux entrants en 6ème et 2nde pour l'année 2
  for (const site of ["ambouli", "arhiba"] as const) {
    const key = `${site}-2025-2026`;
    for (const cls of classesBySiteYear[key]) {
      if (cls.niveau !== "6ème" && cls.niveau !== "2nde") continue;
      const nouveaux = randInt(20, 25); // nouveaux entrants
      for (let i = 0; i < nouveaux; i++) {
        const sexe = chance(0.5) ? Sexe.F : Sexe.M;
        const prenom = sexe === Sexe.M ? pick(NOMS_GARCONS) : pick(NOMS_FILLES);
        const nom = pick(NOMS_FAMILLE);
        const ageBase = cls.niveau === "6ème" ? 11 : 15;
        const dateNaissance = dateStr(2025 - ageBase, randInt(1, 12), randInt(1, 28));
        const matricule = `AMB-${site === "ambouli" ? "A" : "B"}-2025-${String(matriculeCounter).padStart(4, "0")}`;
        matriculeCounter++;

        const eleve = await prisma.eleve.create({
          data: {
            tenantId: ref.tenantId,
            siteId: ref.sites[site],
            matricule,
            nom,
            prenom,
            dateNaissance,
            lieuNaissance: "Djibouti",
            nationalite: "DJ",
            sexe,
            statut: StatutEleve.ACTIF,
            classeId: cls.id,
            regime: pick(["externe", "demi-pensionnaire", "demi-pensionnaire"]),
            anneeInscription: "2025-2026",
            dateInscription: dateStr(2025, 9, randInt(10, 20)),
            groupeSanguin: pick(["A+", "B+", "O+", "AB+"]),
            contactUrgenceNom: `${prenom} ${nom}`,
            contactUrgencePhone: `+253 77 ${randInt(10, 99)} ${randInt(10, 99)} ${randInt(10, 99)}`,
          },
        });
        if (!elevesByClass[cls.id]) elevesByClass[cls.id] = [];
        elevesByClass[cls.id].push({ id: eleve.id, nom, prenom, sexe, dateNaissance });
        eleveRegistryY2.push({ id: eleve.id, nom, prenom, sexe, dateNaissance, niveau: cls.niveau, site, annee: "2025-2026", classeId: cls.id, matricule, moyenneY1: 0 });

        // Parent
        const parentPrenom = sexe === Sexe.M ? pick(NOMS_GARCONS) : pick(NOMS_FILLES);
        const parentPhone = `+253 77 ${randInt(10, 99)} ${randInt(10, 99)} ${randInt(10, 99)}`;
        const parentEmail = `parent.${nom.toLowerCase()}.${parentPrenom.toLowerCase()}.${matriculeCounter}@cite-ambouli.dj`;
        const parentUser = await prisma.user.create({
          data: {
            tenantId: ref.tenantId,
            siteId: ref.sites[site],
            email: parentEmail,
            password: PASSWORD_HASH,
            name: `${parentPrenom} ${nom}`,
            firstName: parentPrenom,
            lastName: nom,
            role: Role.PARENT,
            phone: parentPhone,
            mustChangePassword: true,
          },
        });
        const parent = await prisma.parent.create({
          data: {
            tenantId: ref.tenantId,
            userId: parentUser.id,
            nom,
            prenom: parentPrenom,
            email: parentEmail,
            phone: parentPhone,
            profession: pick(PROFESSIONS),
            adresse: `Quartier ${pick(["Ambouli", "Arhiba", "Haramous", "Balbala", "PK12"])}, Djibouti`,
          },
        });
        await prisma.eleveParent.create({
          data: {
            eleveId: eleve.id,
            parentId: parent.id,
            lien: pick([LienParente.PERE, LienParente.MERE, LienParente.PERE]) as LienParente,
            isGardien: true,
          },
        });
        parentsByEleve[eleve.id] = [{ id: parent.id, userId: parentUser.id }];

        await prisma.preferencesParent.create({
          data: {
            tenantId: ref.tenantId,
            parentId: parent.id,
            langue: "fr",
            alertesActives: true,
            niveauMinimal: "INFO",
            plafondHebdomadaire: 3,
          },
        }).catch(() => {});
      }
    }
  }
  console.log(`  ✅ Élèves année 2: ${eleveRegistryY2.length} (promotion + nouveaux entrants)`);

  return { classesBySiteYear, elevesByClass, parentsByEleve, alumniIds };
}
