/**
 * seed-ambouli.ts — Orchestrateur central du seed Cité Scolaire Ambouli.
 *
 * Crée un établissement complet à Djibouti avec :
 * - 1 tenant (Cité Scolaire Ambouli)
 * - 2 sites (Ambouli, Arhiba)
 * - 2 années scolaires (2024-2025, 2025-2026)
 * - Collège + Lycée
 * - ~1200 élèves, parents, enseignants, personnel
 * - Cursus complet, évaluations, bulletins, facturation, vie scolaire, santé, RH
 * - LEARNOS : curriculum, apprentissage, exercices adaptés, intelligence pédagogique
 *
 * Usage: pnpm db:seed:ambouli
 */

import { PrismaClient } from "@prisma/client";
import { seedReferenceData, type RefData } from "./seed-ambouli-ref";
import { seedUsers, type UsersData } from "./seed-ambouli-users";
import { seedClassesEleves, type ClassesData } from "./seed-ambouli-classes";
import { seedNotes } from "./seed-ambouli-notes";
import { seedFacturation } from "./seed-ambouli-facturation";
import { seedVieScolaire } from "./seed-ambouli-viescolaire";
import { seedRhEtDivers } from "./seed-ambouli-rh-divers";
import { seedLearnosCurriculum, type LearnosCurriculumData } from "./seed-ambouli-learnos-curriculum";
import { seedLearnosApprentissage } from "./seed-ambouli-learnos-apprentissage";
import { seedLearnosExercices } from "./seed-ambouli-learnos-exercices";
import { seedLearnosIntelligence } from "./seed-ambouli-learnos-intelligence";

const prisma = new PrismaClient();

async function main() {
  const startTime = Date.now();
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  SEED — Cité Scolaire Ambouli (Djibouti)                     ║");
  console.log("║  2 sites × 2 années × Collège + Lycée × LEARNOS             ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();

  try {
    // 1+2. Tenant, sites, structures, années, périodes, calendrier, matières, salles, tarifs
    const ref: RefData = await seedReferenceData();

    // 3. Utilisateurs : staff, enseignants, FicheRH
    const users: UsersData = await seedUsers(prisma, ref);

    // 4. Classes, élèves, parents, parcours, alumni
    const classes: ClassesData = await seedClassesEleves(prisma, ref, users);

    // 5. Emploi du temps, évaluations, notes, bulletins
    await seedNotes(prisma, ref, users, classes);

    // 6. Facturation, paiements, relances, exclusions
    await seedFacturation(prisma, ref, users, classes);

    // 7. Vie scolaire, santé, infirmerie
    await seedVieScolaire(prisma, ref, users, classes);

    // 8. RH, communication, gouvernance, mentorat, LMS, inventaire, admissions, budget, tâches
    await seedRhEtDivers(prisma, ref, users, classes);

    // 9. LEARNOS : curriculum (chapitres, compétences, prérequis, planifications, seuils)
    const curriculum: LearnosCurriculumData = await seedLearnosCurriculum(prisma, ref, users, classes);

    // 10. LEARNOS : apprentissage (evidences, profils, recommandations, interventions, plans)
    await seedLearnosApprentissage(prisma, ref, users, classes, curriculum);

    // 11. LEARNOS : exercices adaptés (questions, feuilles, réponses)
    await seedLearnosExercices(prisma, ref, users, classes, curriculum);

    // 12. LEARNOS : intelligence (patterns, prédictions, calibrations, journal, KPIs, bot parent, IA)
    await seedLearnosIntelligence(prisma, ref, users, classes, curriculum);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log();
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log(`║  SEED TERMINÉ AVEC SUCCÈS en ${elapsed}s${" ".repeat(34 - elapsed.length)}║`);
    console.log("║  Établissement : Cité Scolaire Ambouli                       ║");
    console.log("║  Sites : Ambouli + Arhiba                                    ║");
    console.log("║  Années : 2024-2025, 2025-2026                              ║");
    console.log("║  Niveaux : 6ème → Terminale (Collège + Lycée)               ║");
    console.log("║  LEARNOS : Curriculum + Apprentissage + Exercices + IA      ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log();
    console.log("🔑 Comptes de démonstration (mot de passe : Ambouli@2026!) :");
    console.log("  - admin@cite-scolaire-ambouli.ecolpro.app (Admin tenant)");
    console.log("  - principal.ambouli@cite-scolaire-ambouli.ecolpro.app (Principal Ambouli)");
    console.log("  - principal.arhiba@cite-scolaire-ambouli.ecolpro.app (Principal Arhiba)");
    console.log("  - enseignant@cite-scolaire-ambouli.ecolpro.app (Enseignant)");
    console.log("  - parent@cite-scolaire-ambouli.ecolpro.app (Parent)");
    console.log("  - eleve@cite-scolaire-ambouli.ecolpro.app (Élève)");
    console.log("  - comptable@cite-scolaire-ambouli.ecolpro.app (Comptable)");
  } catch (error) {
    console.error("❌ Erreur pendant le seed :", error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed échoué :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
