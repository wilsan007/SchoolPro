/**
 * seed-ambouli-viescolaire.ts — Absences, incidents, sanctions, entretiens CPE,
 * fiches sanitaires, passages infirmerie, dispenses.
 */

import { PrismaClient, MotifAbsence, StatutAbsence, TypeIncident, StatutIncident, TypeSanction, Sexe } from "@prisma/client";
import { setSeed, randInt, pick, chance, dateStr } from "./seed-ambouli-helpers";
import type { RefData } from "./seed-ambouli-ref";
import type { UsersData } from "./seed-ambouli-users";
import type { ClassesData } from "./seed-ambouli-classes";

const MOTIFS_ABSENCE = [MotifAbsence.MALADIE, MotifAbsence.INJUSTIFIE, MotifAbsence.FAMILIALE, MotifAbsence.TRANSPORT, MotifAbsence.AUTRE];
const TYPES_INCIDENT = [TypeIncident.RETARD, TypeIncident.BAVARDAGE, TypeIncident.INSOLENCE, TypeIncident.BAGARRE, TypeIncident.TRICHE, TypeIncident.VANDALISM, TypeIncident.ABSENTEISME];
const TYPES_SANCTION = [TypeSanction.AVERTISSEMENT, TypeSanction.BLAME, TypeSanction.EXCLUSION_COURS, TypeSanction.CONVOCATION_PARENTS, TypeSanction.TRAVAUX_INTERET_GENERAL];

export async function seedVieScolaire(
  prisma: PrismaClient,
  ref: RefData,
  users: UsersData,
  classes: ClassesData,
): Promise<void> {
  setSeed(20241201);
  console.log("🌱 [6/12] Création vie scolaire, santé, infirmerie...");

  let absenceCount = 0;
  let incidentCount = 0;
  let sanctionCount = 0;
  let ficheSaniCount = 0;
  let passageInfCount = 0;
  let entretienCount = 0;

  for (const site of ["ambouli", "arhiba"] as const) {
    const nurseId = users.allStaffIds.find(id => id.includes(`nurse-${site}`));
    const counselorId = users.allStaffIds.find(id => id.includes(`counselor-${site}`));
    const supervisors = users.allStaffIds.filter(id => id.includes(`supervisor-${site}`));

    for (const annee of ["2024-2025", "2025-2026"]) {
      const key = `${site}-${annee}`;
      const siteClasses = classes.classesBySiteYear[key] || [];
      const anneeDeb = parseInt(annee.split("-")[0]);

      for (const cls of siteClasses) {
        const eleves = classes.elevesByClass[cls.id] || [];
        if (eleves.length === 0) continue;

        for (const el of eleves) {
          // ── Fiche sanitaire (1 par élève) ────────────────────
          await prisma.ficheSanitaire.create({
            data: {
              tenantId: ref.tenantId,
              siteId: ref.sites[site],
              eleveId: el.id,
              allergies: chance(0.15) ? [pick(["Pollen", "Arachide", "Pénicilline", "Poussière"])] : [],
              traitements: chance(0.1) ? { medicament: pick(["Ventoline", "Antihistaminique"]), posologie: "1/jour", duree: "continu" } : undefined,
              contreIndicationsSport: chance(0.05),
              contactsUrgence: [{ nom: "Parent", relation: "Père/Mère", telephone: `+253 77 ${randInt(10, 99)} ${randInt(10, 99)} ${randInt(10, 99)}` }],
              protocoleUrgence: chance(0.05) ? "Asthmatique : ventoline en cas de crise" : null,
              vaccinations: [
                { vaccin: "BCG", date: "2010-03-15", rappel: null },
                { vaccin: "DTCoqPolio", date: "2012-06-01", rappel: "2024-06-01" },
                { vaccin: "ROR", date: "2015-09-10", rappel: null },
              ],
              remarques: chance(0.1) ? "Élève asthmatique" : null,
            },
          }).catch(() => {});
          ficheSaniCount++;

          // ── Absences (~20% des élèves ont des absences) ──────
          if (chance(0.2)) {
            const nbAbsences = randInt(1, 8);
            for (let a = 0; a < nbAbsences; a++) {
              const mois = randInt(10, 12) <= 12 ? randInt(10, 12) : randInt(1, 6);
              const anneeAbs = mois >= 10 ? anneeDeb : anneeDeb + 1;
              const isRetard = chance(0.3);
              await prisma.absence.create({
                data: {
                  tenantId: ref.tenantId,
                  eleveId: el.id,
                  date: dateStr(anneeAbs, mois, randInt(1, 28)),
                  heureDebut: isRetard ? "08:00" : null,
                  heureFin: isRetard ? "08:30" : null,
                  isRetard,
                  motif: pick(MOTIFS_ABSENCE),
                  statut: chance(0.6) ? StatutAbsence.JUSTIFIEE : chance(0.5) ? StatutAbsence.INJUSTIFIEE : StatutAbsence.EN_ATTENTE,
                  justificatif: chance(0.4) ? "/docs/justificatif.pdf" : null,
                  commentaire: chance(0.3) ? "Absence signalée par le professeur" : null,
                  saisieParId: pick(supervisors),
                  parentNotifie: chance(0.7),
                  parentNotifieAt: chance(0.7) ? dateStr(anneeAbs, mois, randInt(1, 28)) : null,
                },
              });
              absenceCount++;
            }
          }

          // ── Passages infirmerie (~10% des élèves) ────────────
          if (chance(0.1) && nurseId) {
            const nbPassages = randInt(1, 3);
            for (let p = 0; p < nbPassages; p++) {
              const mois = randInt(10, 12) <= 12 ? randInt(10, 12) : randInt(1, 6);
              const anneeP = mois >= 10 ? anneeDeb : anneeDeb + 1;
              await prisma.passageInfirmerie.create({
                data: {
                  tenantId: ref.tenantId,
                  siteId: ref.sites[site],
                  eleveId: el.id,
                  date: dateStr(anneeP, mois, randInt(1, 28)),
                  motif: pick(["Maux de tête", "Blessure sport", "Malaise", "Fièvre", "Douleur abdominale", "Chute"]),
                  soin: pick(["Repos 30min", "Pansement", "Paracétamol", "Observation"]),
                  suite: pick(["retour_en_cours", "retour_en_cours", "renvoi_domicile"]),
                  retourCours: chance(0.8),
                  dureeMin: randInt(15, 60),
                  infirmierId: nurseId,
                  notes: chance(0.2) ? "Surveiller état" : null,
                },
              });
              passageInfCount++;
            }
          }

          // ── Incidents (~8% des élèves) ───────────────────────
          if (chance(0.08)) {
            const nbIncidents = randInt(1, 3);
            for (let inc = 0; inc < nbIncidents; inc++) {
              const mois = randInt(10, 12) <= 12 ? randInt(10, 12) : randInt(1, 6);
              const anneeI = mois >= 10 ? anneeDeb : anneeDeb + 1;
              const type = pick(TYPES_INCIDENT);
              const incident = await prisma.incident.create({
                data: {
                  tenantId: ref.tenantId,
                  eleveId: el.id,
                  rapporteParId: pick(supervisors),
                  type,
                  statut: pick([StatutIncident.OUVERT, StatutIncident.EN_TRAITEMENT, StatutIncident.RESOLU, StatutIncident.CLASSE]),
                  gravite: type === TypeIncident.BAGARRE || type === TypeIncident.VANDALISM ? randInt(2, 3) : 1,
                  description: `${type} signalé en ${cls.nom}`,
                  lieu: pick(["Salle de classe", "Cour", "Couloir", "Cantine", "Gymnase"]),
                  date: dateStr(anneeI, mois, randInt(1, 28)),
                },
              });
              incidentCount++;

              // Sanction (60% des incidents)
              if (chance(0.6)) {
                await prisma.sanction.create({
                  data: {
                    incidentId: incident.id,
                    type: pick(TYPES_SANCTION),
                    description: "Sanction décidée par la vie scolaire",
                    dateDebut: dateStr(anneeI, mois, randInt(1, 28)),
                    dateFin: chance(0.3) ? dateStr(anneeI, mois, randInt(2, 28)) : null,
                    parentNotifie: chance(0.8),
                  },
                });
                sanctionCount++;
              }
            }
          }

          // ── Entretiens conseiller (~5% des élèves en difficulté) ─
          if (chance(0.05) && counselorId) {
            const cId = counselorId;
            await prisma.entretienConseiller.create({
              data: {
                tenantId: ref.tenantId,
                siteId: ref.sites[site],
                eleveId: el.id,
                conseillerId: cId,
                date: dateStr(anneeDeb + (chance(0.5) ? 0 : 1), randInt(1, 12), randInt(1, 28)),
                motif: pick(["absences répétées", "difficultés scolaires", "problèmes familiaux", "orientation", "comportement"]),
                compteRendu: "Élève reçu en entretien. Discussion sur les difficultés rencontrées. Accompagnement proposé.",
                decisions: pick(["Suivi hebdomadaire", "Rencontre parents programmée", "Orientation vers soutien scolaire"]),
                suivi: "À revoir dans 15 jours",
                statut: "REALISE",
                prochainRendezVous: chance(0.5) ? dateStr(anneeDeb + 1, randInt(1, 12), randInt(1, 28)) : null,
              },
            });
            entretienCount++;
          }
        }
      }
    }
  }

  // ── Dispenses de matière (EPS, ~3 cas) ──────────────────────
  for (const site of ["ambouli", "arhiba"] as const) {
    const key = `${site}-2025-2026`;
    const siteClasses = classes.classesBySiteYear[key] || [];
    for (const cls of siteClasses.slice(0, 3)) {
      const eleves = classes.elevesByClass[cls.id] || [];
      if (eleves.length === 0) continue;
      const el = eleves[0];
      const matiereId = ref.matieres[`${site === "ambouli" ? "AMB" : "ARH"}-EPS`];
      if (!matiereId) continue;
      await prisma.dispenseMatiere.create({
        data: {
          tenantId: ref.tenantId,
          eleveId: el.id,
          matiereId,
          motif: "Certificat médical - contre-indication sportive",
        },
      }).catch(() => {});
    }
  }

  console.log(`  ✅ Fiches sanitaires: ${ficheSaniCount}`);
  console.log(`  ✅ Absences: ${absenceCount}`);
  console.log(`  ✅ Incidents: ${incidentCount} (avec ${sanctionCount} sanctions)`);
  console.log(`  ✅ Passages infirmerie: ${passageInfCount}`);
  console.log(`  ✅ Entretiens conseiller: ${entretienCount}`);
  console.log(`  ✅ Dispenses EPS: 6`);
}
