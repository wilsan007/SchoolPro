/**
 * Extension du jeu de démonstration LEARNOS pour QA multi-rôles.
 *
 *   sh node_modules/.bin/tsx scripts/qa-extend-demo.ts
 *
 * Ajoute au tenant `demo-learnos` existant :
 *  - Une 2e matière (Physique) avec chapitre + 2 compétences
 *  - Des notes en Physique pour les 3 élèves (profils différents)
 *  - Un compte de connexion pour Youssouf et Fatouma
 *  - Un parent rattaché à Youssouf (en plus d'Amina)
 *  - Le drainage des événements pour produire preuves + profils + recommandations
 *
 * Prérequis : scripts/demo-learnos.ts + scripts/qa-comptes-demo.ts déjà exécutés.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

const SLUG = "demo-learnos";
const ANNEE = "2025-2026";
const MOT_DE_PASSE = "Demo@2026!";

async function main() {
  console.log("═".repeat(60));
  console.log("  EXTENSION QA — 2e matière + comptes élèves + parents");
  console.log("═".repeat(60));

  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) throw new Error("Tenant demo-learnos absent — lancer d'abord demo-learnos.ts");

  const site = await prisma.site.findFirst({ where: { tenantId: tenant.id } });
  if (!site) throw new Error("Aucun site");

  const classe = await prisma.classe.findFirst({ where: { tenantId: tenant.id } });
  if (!classe) throw new Error("Aucune classe");

  const annee = await prisma.anneesScolaires.findFirst({ where: { tenantId: tenant.id, isCurrent: true } });
  if (!annee) throw new Error("Aucune année courante");

  const periode = await prisma.periode.findFirst({ where: { anneeId: annee.id } });
  if (!periode) throw new Error("Aucune période");

  // ── 1. Récupérer les 3 élèves existants ──────────────────────
  const eleves = await prisma.eleve.findMany({
    where: { tenantId: tenant.id, classeId: classe.id },
    orderBy: { matricule: "asc" },
  });
  if (eleves.length < 3) throw new Error(`Attendu 3 élèves, trouvé ${eleves.length}`);

  const [amina, youssouf, fatouma] = eleves;
  console.log(`\nÉlèves : ${amina.prenom} · ${youssouf.prenom} · ${fatouma.prenom}`);

  // ── 2. Créer la 2e matière : Physique ────────────────────────
  console.log("\n▸ 1. Création matière Physique + curriculum");
  // Idempotent : findFirst ou create
  const physique = await prisma.matiere.findFirst({
    where: { tenantId: tenant.id, code: "PHYS" },
  }) ?? await prisma.matiere.create({
    data: { tenantId: tenant.id, siteId: site.id, nom: "Physique", code: "PHYS", coefficient: 1 },
  });

  const chapPhys = await prisma.chapitre.findFirst({
    where: { tenantId: tenant.id, matiereId: physique.id, nom: "Mécanique newtonienne" },
  }) ?? await prisma.chapitre.create({
    data: {
      tenantId: tenant.id, siteId: site.id, matiereId: physique.id,
      nom: "Mécanique newtonienne", niveau: "5ème", ordre: 2,
    },
  });

  const pfd = await prisma.competence.findFirst({
    where: { tenantId: tenant.id, code: "PHYS-PFD" },
  }) ?? await prisma.competence.create({
    data: {
      tenantId: tenant.id, siteId: site.id, chapitreId: chapPhys.id,
      code: "PHYS-PFD", libelle: "Appliquer le principe fondamental de la dynamique", ordre: 1,
    },
  });
  const energie = await prisma.competence.findFirst({
    where: { tenantId: tenant.id, code: "PHYS-ENR" },
  }) ?? await prisma.competence.create({
    data: {
      tenantId: tenant.id, siteId: site.id, chapitreId: chapPhys.id,
      code: "PHYS-ENR", libelle: "Calculer l'énergie cinétique", ordre: 2,
      prerequis: { connect: [{ id: pfd.id }] },
    },
  });
  console.log("   ✓ Physique : 2 compétences (PFD → Énergie)");

  // ── 3. Évaluations en Physique ────────────────────────────────
  console.log("\n▸ 2. Évaluations en Physique");
  async function creerEvalPhys(titre: string, competenceId: string, jours: number) {
    const eval_ = await prisma.evaluation.create({
      data: {
        tenantId: tenant!.id, titre, type: "CONTROLE",
        classeId: classe!.id, matiereId: physique.id, periodeId: periode!.id,
        date: new Date(Date.now() - jours * 86_400_000),
        duree: 55, coefficient: 2, statut: "TERMINE",
      },
    });
    await prisma.evaluationCompetence.create({
      data: {
        tenantId: tenant!.id, siteId: site!.id,
        evaluationId: eval_.id, competenceId, poids: 1,
      },
    });
    return eval_;
  }

  const evalsPhys = await Promise.all([
    creerEvalPhys("DS Phys 1 — PFD", pfd.id, 50),
    creerEvalPhys("DS Phys 2 — PFD", pfd.id, 30),
    creerEvalPhys("DS Phys 3 — PFD", pfd.id, 10),
    creerEvalPhys("DS Phys 4 — Énergie", energie.id, 8),
    creerEvalPhys("DS Phys 5 — Énergie", energie.id, 3),
  ]);
  console.log(`   ✓ ${evalsPhys.length} évaluations en Physique`);

  // ── 4. Notes en Physique — 3 profils différents ──────────────
  // Amina : difficile en Physique aussi (PFD fragile)
  // Youssouf : excellent en Physique (maîtrise)
  // Fatouma : moyen en Physique (en développement)
  console.log("\n▸ 3. Saisie notes Physique");
  const notesPhys: Record<string, (number | null)[]> = {
    [amina.id]:     [7, 8, 6, 5, null],    // difficile
    [youssouf.id]:  [18, 19, 20, 17, 18],  // excellent
    [fatouma.id]:   [12, 11, 13, null, null], // moyen, 3 notes
  };

  const aInserer = evalsPhys.flatMap((evaluation, index) =>
    eleves
      .filter((e) => notesPhys[e.id] && notesPhys[e.id][index] !== null)
      .map((e) => ({
        tenantId: tenant.id, eleveId: e.id, classeId: classe.id,
        matiereId: physique.id, periodeId: periode.id, evaluationId: evaluation.id,
        type: "CONTROLE" as const, intitule: evaluation.titre,
        valeur: notesPhys[e.id][index] as number, noteMax: 20, coefficient: 2,
        date: evaluation.date, isPubliee: true,
      }))
  );
  await prisma.note.createMany({ data: aInserer });
  const notesCreees = await prisma.note.findMany({
    where: { tenantId: tenant.id, matiereId: physique.id },
  });
  console.log(`   ✓ ${notesCreees.length} notes en Physique`);

  // ── 5. Publier + drainer les événements ──────────────────────
  console.log("\n▸ 4. Publication + drainage des événements");
  const { publishEvents } = await import("../src/lib/learnos/events");
  const { drainEvents } = await import("../src/lib/learnos/event-bus");

  await publishEvents(
    notesCreees.map((note) => ({
      tenantId: tenant.id,
      siteId: site.id,
      eventType: "note.recorded" as const,
      aggregateType: "note",
      aggregateId: note.id,
      payload: {
        noteId: note.id, eleveId: note.eleveId, classeId: note.classeId,
        matiereId: note.matiereId, periodeId: note.periodeId,
        evaluationId: note.evaluationId, valeur: note.valeur, noteMax: note.noteMax,
        coefficient: note.coefficient, type: note.type, intitule: note.intitule,
        date: note.date.toISOString(), saisieParId: note.saisieParId,
      },
    }))
  );
  const resultat = await drainEvents(500);
  console.log(`   traités : ${resultat.processed} · échecs : ${resultat.failed} · abandonnés : ${resultat.abandoned}`);

  // ── 6. Comptes de connexion pour Youssouf et Fatouma ────────
  console.log("\n▸ 5. Comptes élèves pour Youssouf et Fatouma");
  const hash = await bcrypt.hash(MOT_DE_PASSE, 12);

  const comptes = [
    { eleve: youssouf, email: "youssouf@demo-learnos.test", prenom: "Youssouf", nom: "Ali" },
    { eleve: fatouma, email: "fatouma@demo-learnos.test", prenom: "Fatouma", nom: "Omar" },
  ];

  for (const c of comptes) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: { tenantId: tenant.id, isActive: true, password: hash },
      create: {
        tenantId: tenant.id, email: c.email, password: hash,
        name: `${c.prenom} ${c.nom}`, firstName: c.prenom, lastName: c.nom,
        role: "STUDENT", isActive: true,
      },
    });
    await prisma.eleve.update({ where: { id: c.eleve.id }, data: { userId: user.id } });
    await prisma.userTenant.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      update: { role: "STUDENT", isActive: true, isDefault: true },
      create: { userId: user.id, tenantId: tenant.id, role: "STUDENT", isActive: true, isDefault: true },
    });
    console.log(`   ✓ ${c.email} rattaché à ${c.prenom}`);
  }

  // ── 7. Parent supplémentaire pour Youssouf ───────────────────
  console.log("\n▸ 6. Parent pour Youssouf");
  const parentYoussouf = await prisma.parent.create({
    data: {
      tenantId: tenant.id,
      nom: "Ali",
      prenom: "Parent Youssouf",
      email: "parent-youssouf@qa-learnos.test",
      phone: "+25377123457",
    },
  });
  await prisma.eleveParent.create({
    data: { eleveId: youssouf.id, parentId: parentYoussouf.id, lien: "PERE", isGardien: true },
  });
  console.log("   ✓ Parent rattaché à Youssouf");

  // ── 8. Vérification finale ───────────────────────────────────
  console.log("\n═".repeat(60));
  console.log("  VÉRIFICATION FINALE");
  console.log("═".repeat(60));

  const counts = await Promise.all([
    prisma.matiere.count({ where: { tenantId: tenant.id } }),
    prisma.competence.count({ where: { tenantId: tenant.id } }),
    prisma.evaluation.count({ where: { tenantId: tenant.id } }),
    prisma.note.count({ where: { tenantId: tenant.id } }),
    prisma.learningEvidence.count({ where: { tenantId: tenant.id } }),
    prisma.studentLearningProfile.count({ where: { tenantId: tenant.id } }),
    prisma.recommandation.count({ where: { tenantId: tenant.id } }),
    prisma.planProgression.count({ where: { tenantId: tenant.id } }),
    prisma.user.count({ where: { tenantId: tenant.id } }),
  ]);

  console.log(`
  Matières        : ${counts[0]}
  Compétences     : ${counts[1]}
  Évaluations     : ${counts[2]}
  Notes           : ${counts[3]}
  Preuves         : ${counts[4]}
  Profils élève   : ${counts[5]}
  Recommandations : ${counts[6]}
  Plans           : ${counts[7]}
  Utilisateurs    : ${counts[8]}
  `);

  // Profils par élève
  for (const eleve of eleves) {
    const profils = await prisma.studentLearningProfile.findMany({
      where: { tenantId: tenant.id, eleveId: eleve.id },
      include: { competence: { select: { libelle: true, chapitre: { select: { matiere: { select: { nom: true } } } } } } },
    });
    console.log(`\n┌─ ${eleve.prenom} ${eleve.nom} ──────────────────────`);
    for (const p of profils) {
      const maitrise = p.masteryStatus === "UNKNOWN" ? "—" : `${Math.round(p.masteryScore * 100)}%`;
      console.log(`│  ${p.competence.chapitre.matiere.nom.padEnd(12)} ${p.competence.libelle.padEnd(40)} ${maitrise.padStart(4)}  ${p.masteryStatus}`);
    }
  }

  // Comptes de connexion
  console.log("\n═".repeat(60));
  console.log("  COMPTES DE CONNEXION QA");
  console.log("═".repeat(60));
  const allUsers = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    select: { email: true, role: true },
    orderBy: { role: "asc" },
  });
  for (const u of allUsers) {
    console.log(`  ${u.role.padEnd(14)} ${u.email}`);
  }
  console.log(`\n  Mot de passe : ${MOT_DE_PASSE}`);
  console.log("\n═".repeat(60));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
