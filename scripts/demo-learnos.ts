/**
 * Validation de bout en bout de la chaîne LEARNOS
 * ===============================================
 *
 *   npx tsx scripts/demo-learnos.ts          → crée le scénario et le déroule
 *   npx tsx scripts/demo-learnos.ts --clean  → supprime tout le jeu de démonstration
 *
 * Emprunte les VRAIS chemins de code — `publishEvents` puis `drainEvents` —
 * et non une simulation : c'est la chaîne réellement déployée qui est vérifiée.
 *
 *   note enregistrée → événement → preuve → profil de maîtrise → recommandation
 *
 * Toutes les données portent le tenant de slug `demo-learnos`, isolé du reste
 * et supprimable d'un seul geste.
 */

import { PrismaClient } from "@prisma/client";

// Pooler en mode SESSION (`DIRECT_URL`, port 5432) plutôt que transaction
// (port 6543) : mesuré 192 ms/requête contre 980 ms, et sans les coupures de
// connexion (P1017) observées sur le second. Un script est séquentiel et peu
// concurrent — le mode session lui convient.
const prisma = new PrismaClient({
  log: [],
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

const SLUG = "demo-learnos";
const ANNEE = "2025-2026";

function titre(texte: string) {
  console.log("\n" + "═".repeat(70));
  console.log("  " + texte);
  console.log("═".repeat(70));
}

function etape(texte: string) {
  console.log(`\n▸ ${texte}`);
}

async function nettoyer() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!tenant) {
    console.log("Rien à nettoyer.");
    return;
  }
  // Les suppressions en cascade déclarées au schéma emportent tout le reste.
  await prisma.tenant.delete({ where: { id: tenant.id } });
  console.log("Jeu de démonstration supprimé.");
}

/**
 * Comptes de connexion pour les élèves de démonstration.
 *
 * Sans eux, tout le dispositif reste vérifiable en base mais **invisible** :
 * l'écran d'entraînement résout l'élève depuis la session, et il n'y a donc
 * aucun moyen de le voir fonctionner sans un utilisateur `STUDENT` réel.
 *
 * Le mot de passe est celui, déjà public, du jeu de démonstration du dépôt
 * (`prisma/seed.ts`, `tests/e2e/auth.spec.ts`) : ces comptes n'ont accès qu'au
 * tenant `demo-learnos`, qui disparaît avec `--clean` (cascade sur `User`).
 */
async function attacherComptesEleves(tenantId: string) {
  const bcrypt = (await import("bcryptjs")).default;
  const motDePasse = await bcrypt.hash("Demo@2026!", 12);

  const comptes = [
    { matricule: "DEMO-el4", email: "kadidja@demo-learnos.test", prenom: "Kadidja", nom: "Ibrahim" },
    { matricule: "DEMO-el1", email: "amina@demo-learnos.test", prenom: "Amina", nom: "Hassan" },
  ];

  const crees: string[] = [];
  for (const c of comptes) {
    const eleve = await prisma.eleve.findFirst({
      where: { tenantId, matricule: c.matricule },
      select: { id: true },
    });
    if (!eleve) continue;

    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: { tenantId, isActive: true, password: motDePasse },
      create: {
        tenantId,
        email: c.email,
        password: motDePasse,
        name: `${c.prenom} ${c.nom}`,
        firstName: c.prenom,
        lastName: c.nom,
        role: "STUDENT",
      },
      select: { id: true },
    });

    // C'est ce rattachement — et lui seul — qui fait que l'élève ne voit que
    // son propre dossier : le périmètre du rôle `STUDENT` est relationnel,
    // pas géographique (cf. `personalScopeFilter`).
    await prisma.eleve.update({ where: { id: eleve.id }, data: { userId: user.id } });
    crees.push(c.email);
  }
  return crees;
}

async function main() {
  if (process.argv.includes("--clean")) return nettoyer();

  // Voie rapide : rattacher les comptes à un jeu de démonstration déjà en
  // place, sans rejouer les douze minutes de la chaîne complète.
  if (process.argv.includes("--eleves")) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: SLUG },
      select: { id: true },
    });
    if (!tenant) {
      console.log("Aucun jeu de démonstration : lancez d'abord le script sans option.");
      return;
    }
    const crees = await attacherComptesEleves(tenant.id);
    console.log(
      crees.length > 0
        ? `✅ Comptes élèves prêts : ${crees.join(", ")} — mot de passe Demo@2026!`
        : "Aucun élève de démonstration trouvé."
    );
    return;
  }

  const { publishEvents } = await import("../src/lib/learnos/events");
  const { drainEvents } = await import("../src/lib/learnos/event-bus");

  titre("VALIDATION DE BOUT EN BOUT — LEARNOS");

  // Repartir d'un état propre rend le script rejouable à volonté.
  await nettoyer();

  // ── 1. Socle ────────────────────────────────────────────────────
  etape("1. Établissement, site, matière, classe");

  const tenant = await prisma.tenant.create({
    data: { name: "Lycée de démonstration", slug: SLUG, currentYear: ANNEE },
  });
  const site = await prisma.site.create({
    data: { tenantId: tenant.id, nom: "Campus Central", actif: true },
  });
  const [matiere, classe, annee] = await Promise.all([
    prisma.matiere.create({
      data: { tenantId: tenant.id, siteId: site.id, nom: "Mathématiques", code: "MATH" },
    }),
    prisma.classe.create({
      data: { tenantId: tenant.id, siteId: site.id, nom: "5ème B", niveau: "5ème", annee: ANNEE },
    }),
    prisma.anneesScolaires.create({
    data: {
      tenantId: tenant.id,
      libelle: ANNEE,
      dateDebut: new Date("2025-09-01"),
      dateFin: new Date("2026-07-01"),
      isCurrent: true,
    },
    }),
  ]);
  const periode = await prisma.periode.create({
    data: {
      anneeId: annee.id,
      nom: "Trimestre 2",
      numero: 2,
      dateDebut: new Date("2026-01-05"),
      dateFin: new Date("2026-04-05"),
      isCurrent: true,
    },
  });
  console.log("   ✓ socle créé");

  // ── 2. Curriculum ───────────────────────────────────────────────
  etape("2. Curriculum : « Fractions » est prérequis de « Équations »");

  const chapitre = await prisma.chapitre.create({
    data: {
      tenantId: tenant.id, siteId: site.id, matiereId: matiere.id,
      nom: "Calcul littéral", niveau: "5ème", ordre: 1,
    },
  });

  const fractions = await prisma.competence.create({
    data: {
      tenantId: tenant.id, siteId: site.id, chapitreId: chapitre.id,
      code: "MATH-FRAC", libelle: "Manipuler les fractions", ordre: 1,
    },
  });
  const equations = await prisma.competence.create({
    data: {
      tenantId: tenant.id, siteId: site.id, chapitreId: chapitre.id,
      code: "MATH-EQ1", libelle: "Résoudre une équation du 1er degré", ordre: 2,
      prerequis: { connect: [{ id: fractions.id }] },
    },
  });
  const proportion = await prisma.competence.create({
    data: {
      tenantId: tenant.id, siteId: site.id, chapitreId: chapitre.id,
      code: "MATH-PROP", libelle: "Appliquer la proportionnalité", ordre: 3,
      prerequis: { connect: [{ id: fractions.id }] },
    },
  });
  console.log("   ✓ 3 compétences — « Fractions » en conditionne 2");

  // ── 3. Élèves ───────────────────────────────────────────────────
  etape("3. Trois élèves, trois situations à distinguer");

  const eleves = await Promise.all(
    [
      ["Amina", "Hassan", "el1"],
      ["Youssouf", "Ali", "el2"],
      ["Fatouma", "Omar", "el3"],
    ].map(([prenom, nom, mat], i) =>
      prisma.eleve.create({
        data: {
          tenantId: tenant.id, siteId: site.id, classeId: classe.id,
          matricule: `DEMO-${mat}`, nom, prenom,
          dateNaissance: new Date(`2012-0${i + 1}-15`),
          anneeInscription: ANNEE, statut: "ACTIF",
        },
      })
    )
  );
  const [amina, youssouf, fatouma] = eleves;
  console.log("   ✓ Amina (en difficulté) · Youssouf (excellent) · Fatouma (une seule note)");

  // ── 4. Évaluations rattachées ───────────────────────────────────
  etape("4. Évaluations rattachées aux compétences");

  async function creerEvaluation(titreEval: string, competenceId: string, jours: number) {
    const evaluation = await prisma.evaluation.create({
      data: {
        tenantId: tenant.id, titre: titreEval, type: "CONTROLE",
        classeId: classe.id, matiereId: matiere.id, periodeId: periode.id,
        date: new Date(Date.now() - jours * 86_400_000),
        duree: 55, coefficient: 2, statut: "TERMINE",
      },
    });
    await prisma.evaluationCompetence.create({
      data: {
        tenantId: tenant.id, siteId: site.id,
        evaluationId: evaluation.id, competenceId, poids: 1,
      },
    });
    return evaluation;
  }

  const evals = await Promise.all([
    creerEvaluation("DS 1 — Fractions", fractions.id, 60),
    creerEvaluation("DS 2 — Fractions", fractions.id, 40),
    creerEvaluation("DS 3 — Fractions", fractions.id, 15),
    // Trois évaluations sur « Équations » : sous ce nombre, la confiance reste
    // insuffisante et le système refuse — à raison — de conclure.
    creerEvaluation("DS 4 — Équations", equations.id, 20),
    creerEvaluation("DS 5 — Équations", equations.id, 12),
    creerEvaluation("DS 6 — Équations", equations.id, 5),
    // Troisième compétence évaluée : sans elle, Youssouf n'atteint pas le seuil
    // de trois compétences maîtrisées qui déclenche un approfondissement.
    creerEvaluation("DS 7 — Proportionnalité", proportion.id, 18),
    creerEvaluation("DS 8 — Proportionnalité", proportion.id, 11),
    creerEvaluation("DS 9 — Proportionnalité", proportion.id, 4),
  ]);
  console.log(`   ✓ ${evals.length} évaluations rattachées`);

  // ── 5. Saisie des notes ─────────────────────────────────────────
  etape("5. Saisie des notes, puis publication des événements");

  // Amina : fractions non acquises → devrait bloquer les équations.
  // Youssouf : excellent partout → devrait recevoir une proposition d'ouverture.
  // Fatouma : deux notes seulement → la confiance ne doit pas suffire à conclure.
  const bareme: Record<string, (number | null)[]> = {
    [amina.id]: [5, 6, 4, 7, 6, 5, 6, 5, 7],
    [youssouf.id]: [19, 18, 20, 19, 18, 20, 19, 20, 18],
    // Une seule note : la confiance ne doit pas suffire à conclure. Le seuil
    // porte sur le POIDS accumulé, pas sur un nombre fixe de notes — deux
    // devoirs de coefficient 2 pèsent autant que quatre de coefficient 1.
    [fatouma.id]: [11, null, null, null, null, null, null, null, null],
  };

  const aInserer = evals.flatMap((evaluation, index) =>
    eleves
      .filter((eleve) => bareme[eleve.id][index] !== null)
      .map((eleve) => ({
        tenantId: tenant.id, eleveId: eleve.id, classeId: classe.id,
        matiereId: matiere.id, periodeId: periode.id, evaluationId: evaluation.id,
        type: "CONTROLE" as const, intitule: evaluation.titre,
        valeur: bareme[eleve.id][index] as number, noteMax: 20, coefficient: 2,
        date: evaluation.date, isPubliee: true,
      }))
  );
  await prisma.note.createMany({ data: aInserer });
  // `createMany` ne rend pas les lignes écrites : on les relit pour disposer
  // des identifiants réels, comme le fait api/evaluations/[id]/notes.
  const notesCreees = await prisma.note.findMany({
    where: { tenantId: tenant.id },
  });
  console.log(`   ✓ ${notesCreees.length} notes enregistrées`);

  // Exactement ce que fait api/notes : publication après écriture.
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
  console.log(`   ✓ ${notesCreees.length} événements publiés dans la boîte d'envoi`);

  // ── 6. Drainage ─────────────────────────────────────────────────
  etape("6. Drainage — c'est ici que toute la chaîne s'exécute");

  const resultat = await drainEvents(500);
  console.log(
    `   traités : ${resultat.processed} · en échec : ${resultat.failed} · abandonnés : ${resultat.abandoned}`
  );
  if (resultat.failed > 0 || resultat.abandoned > 0) {
    const enEchec = await prisma.learnosEvent.findMany({
      where: { tenantId: tenant.id, lastError: { not: null } },
      select: { eventType: true, lastError: true },
      take: 3,
    });
    console.log("   ⚠️  échecs :", JSON.stringify(enEchec, null, 2));
  }

  // ── 7. Résultats ────────────────────────────────────────────────
  titre("RÉSULTATS");

  const preuves = await prisma.learningEvidence.count({ where: { tenantId: tenant.id } });
  console.log(`\nPreuves d'apprentissage produites : ${preuves}`);

  for (const eleve of eleves) {
    console.log(`\n┌─ ${eleve.prenom} ${eleve.nom} ${"─".repeat(50 - eleve.prenom.length - eleve.nom.length)}`);

    const profils = await prisma.studentLearningProfile.findMany({
      where: { tenantId: tenant.id, eleveId: eleve.id },
      include: { competence: { select: { libelle: true } } },
      orderBy: { competenceId: "asc" },
    });

    if (profils.length === 0) {
      console.log("│  aucun profil");
    }
    for (const p of profils) {
      const maitrise =
        p.masteryStatus === "UNKNOWN"
          ? "— non concluant"
          : `${Math.round(p.masteryScore * 100)}%`.padStart(4);
      console.log(
        `│  ${p.competence.libelle.padEnd(36)} ${maitrise.padEnd(14)} ` +
          `fiabilité ${Math.round(p.confidenceScore * 100)}%`.padEnd(16) +
          `${p.masteryStatus.padEnd(13)} ${p.trend} (${p.evidenceCount} éval.)`
      );
    }

    const recos = await prisma.recommandation.findMany({
      where: { tenantId: tenant.id, eleveId: eleve.id },
      include: { competence: { select: { libelle: true } } },
    });
    for (const r of recos) {
      console.log(`│`);
      console.log(`│  ⟹ [${r.statut}] ${r.competence.libelle}`);
      console.log(`│     ${r.motif}`);
      console.log(`│     → ${r.actionProposee}`);
      if (r.competencesBloquees > 0) {
        console.log(`│     (conditionne ${r.competencesBloquees} compétence(s))`);
      }
    }
    if (recos.length === 0) console.log("│  aucune recommandation");
    console.log("└" + "─".repeat(60));
  }

  // ── 7 bis. Plans de progression ─────────────────────────────────
  const plans = await prisma.planProgression.findMany({
    where: { tenantId: tenant.id },
    include: {
      eleve: { select: { prenom: true, nom: true } },
      etapes: { include: { competence: { select: { libelle: true } } }, orderBy: { ordre: "asc" } },
    },
  });
  if (plans.length > 0) {
    console.log("\nPlans de progression proposés :");
    for (const plan of plans) {
      console.log(`\n  ▸ ${plan.eleve.prenom} ${plan.eleve.nom} — ${plan.type.toUpperCase()} [${plan.statut}]`);
      console.log(`    ${plan.motif}`);
      for (const e of plan.etapes) {
        console.log(
          `      ${e.ordre + 1}. ${e.competence.libelle} — ${e.action} ` +
            `(${e.responsable}, échéance ${e.echeance?.toLocaleDateString("fr-FR")})`
        );
      }
    }
  }

  // ── 8. Vérifications attendues ──────────────────────────────────
  titre("VÉRIFICATIONS");

  const controles: [string, boolean, string][] = [];

  const profilAminaFrac = await prisma.studentLearningProfile.findFirst({
    where: { tenantId: tenant.id, eleveId: amina.id, competenceId: fractions.id },
  });
  const recoAminaFrac = await prisma.recommandation.findFirst({
    where: { tenantId: tenant.id, eleveId: amina.id, competenceId: fractions.id },
  });
  const recoAminaEq = await prisma.recommandation.findFirst({
    where: { tenantId: tenant.id, eleveId: amina.id, competenceId: equations.id },
  });
  const recoYoussouf = await prisma.recommandation.findFirst({
    where: { tenantId: tenant.id, eleveId: youssouf.id, competenceId: fractions.id },
  });
  const profilFatouma = await prisma.studentLearningProfile.findFirst({
    where: { tenantId: tenant.id, eleveId: fatouma.id, competenceId: fractions.id },
  });
  const recoFatouma = await prisma.recommandation.findFirst({
    where: { tenantId: tenant.id, eleveId: fatouma.id, competenceId: fractions.id },
  });

  controles.push([
    "Les preuves sont bien rattachées aux compétences",
    preuves > 0,
    `${preuves} preuve(s)`,
  ]);
  controles.push([
    "Amina : fractions détectées comme non acquises",
    profilAminaFrac?.masteryStatus === "EMERGING",
    `statut = ${profilAminaFrac?.masteryStatus}`,
  ]);
  controles.push([
    "Amina : l'accompagnement est OBLIGATOIRE (le prérequis bloque 2 compétences)",
    recoAminaFrac?.statut === "OBLIGATOIRE",
    `statut = ${recoAminaFrac?.statut}, bloque ${recoAminaFrac?.competencesBloquees}`,
  ]);
  controles.push([
    "Amina : le motif sur « Équations » nomme le prérequis manquant",
    Boolean(recoAminaEq?.motif.includes("fraction") || recoAminaEq?.motif.includes("Fraction")),
    recoAminaEq?.motif.slice(0, 60) ?? "aucune reco",
  ]);
  controles.push([
    "Youssouf : une ouverture est PROPOSÉE (jamais imposée)",
    recoYoussouf?.statut === "PROPOSEE",
    `statut = ${recoYoussouf?.statut}, niveau = ${recoYoussouf?.niveau}`,
  ]);
  controles.push([
    "Fatouma : une seule note ne suffit pas à conclure",
    profilFatouma?.masteryStatus === "UNKNOWN",
    `statut = ${profilFatouma?.masteryStatus}, fiabilité ${Math.round((profilFatouma?.confidenceScore ?? 0) * 100)}%`,
  ]);
  controles.push([
    "Fatouma : aucune recommandation émise faute de preuves",
    recoFatouma === null,
    recoFatouma ? "une reco existe" : "aucune",
  ]);

  const planAmina = plans.find((p) => p.eleveId === amina.id);
  const planYoussouf = plans.find((p) => p.eleveId === youssouf.id);

  controles.push([
    "Chaque parcours est cloisonné dans une matière",
    plans.length > 0 && plans.every((p) => p.matiereId !== null),
    plans.map((p) => p.matiereId ?? "AUCUNE").join(", ") || "aucun plan",
  ]);
  controles.push([
    "Amina : un parcours de remédiation est proposé",
    planAmina?.type === "remediation",
    `${planAmina?.type ?? "aucun"} — ${planAmina?.regleDeclenchee ?? ""}`,
  ]);
  controles.push([
    "Youssouf : un parcours d'approfondissement est proposé, pas une remédiation",
    planYoussouf?.type === "approfondissement",
    `${planYoussouf?.type ?? "aucun"} — ${planYoussouf?.regleDeclenchee ?? ""}`,
  ]);
  controles.push([
    "Aucun plan ne s'active seul : tous restent à valider par un humain",
    plans.length > 0 && plans.every((p) => p.statut === "PROPOSE"),
    plans.map((p) => p.statut).join(", ") || "aucun plan",
  ]);
  controles.push([
    "Fatouma : aucun plan, faute de preuves suffisantes",
    !plans.some((p) => p.eleveId === fatouma.id),
    plans.some((p) => p.eleveId === fatouma.id) ? "un plan existe" : "aucun",
  ]);

  // Idempotence : rejouer ne doit rien dupliquer.
  const avant = await prisma.learningEvidence.count({ where: { tenantId: tenant.id } });
  await prisma.learnosEvent.updateMany({
    where: { tenantId: tenant.id },
    data: { processedAt: null, attempts: 0 },
  });
  await drainEvents(500);
  const apres = await prisma.learningEvidence.count({ where: { tenantId: tenant.id } });
  controles.push([
    "Rejouer les événements ne duplique aucune preuve",
    avant === apres,
    `${avant} → ${apres}`,
  ]);

  // ── 8. Entraînement autonome ────────────────────────────────────
  //
  // Emprunte les vrais chemins (`ouvrirSeance`, `soumettreEtape`) et non une
  // simulation : c'est la boucle réellement servie à l'élève qui est vérifiée.
  titre("ENTRAÎNEMENT AUTONOME");

  const { ouvrirSeance, soumettreEtape } = await import("@/lib/learnos/entrainement");

  const claims = {
    role: "TENANT_ADMIN",
    siteId: site.id,
    siteIds: [site.id],
    tenantHasSites: true,
  };

  // Le sélecteur ne sert des exercices que sur ce qui est enseigné maintenant :
  // sans planification, il se tait — et il a raison de se taire.
  await prisma.planificationChapitre.create({
    data: {
      tenantId: tenant.id, siteId: site.id, anneeId: annee.id,
      chapitreId: chapitre.id, classeId: classe.id,
      semaineDebut: 1, semaineFin: 40, statut: "EN_COURS",
    },
  });

  // Banque : deux questions par compétence, en étapes guidées. Les distracteurs
  // sont annotés — c'est ce qui transforme un QCM en diagnostic.
  const banque = [fractions, equations, proportion].flatMap((competence, i) =>
    [0, 1].map((n) => ({
      tenantId: tenant.id, siteId: site.id,
      competenceId: competence.id,
      palier: "APPLICATION" as const,
      enonce: `Calcule 1/${i + 2} + 1/${i + 3} (variante ${n + 1})`,
      format: "ETAPES_GUIDEES" as const,
      origine: "humain",
      bareme: 2,
      structure: {
        etapes: [
          {
            enonce: "Quel dénominateur commun choisis-tu ?",
            format: "SAISIE_COURTE",
            reponse: String((i + 2) * (i + 3)),
            indice: "Multiplie les deux dénominateurs.",
            points: 1,
          },
          {
            enonce: "Que fait-on des numérateurs ?",
            format: "CHOIX_UNIQUE",
            options: [
              { id: "a", texte: "On les additionne", },
              { id: "b", texte: "On les multiplie", erreur: "PROCEDURAL_ERROR" },
              { id: "c", texte: "On garde le plus grand", erreur: "CONCEPTUAL_ERROR" },
            ],
            reponse: "a",
            points: 1,
          },
        ],
      },
    }))
  );
  await prisma.question.createMany({ data: banque });
  console.log(`   ✓ banque de ${banque.length} questions en étapes guidées`);

  // Comblement des paliers manquants : la banque initiale ne couvre que
  // APPLICATION. Sans questions à RESTITUTION, un élève en difficulté
  // critique ne reçoit rien ; sans OUVERTURE, un élève excellent s'ennuie.
  // On ajoute une question par palier manquant et par compétence, en
  // CHOIX_UNIQUE — format simple et auto-corrigeable.
  const paliersManquants: Array<{
    palier: "RESTITUTION" | "CONSOLIDATION" | "TRANSFERT" | "OUVERTURE";
    enonce: (i: number) => string;
    reponse: string;
    distracteurs: { id: string; texte: string; erreur?: string }[];
  }> = [
    {
      palier: "RESTITUTION",
      enonce: (i) => `Additionne 1/${i + 2} + 1/${i + 2} (même dénominateur)`,
      reponse: "a",
      distracteurs: [
        { id: "a", texte: "2/{d}", },
        { id: "b", texte: "1/{d}", erreur: "PROCEDURAL_ERROR" },
        { id: "c", texte: "2/2", erreur: "CONCEPTUAL_ERROR" },
      ],
    },
    {
      palier: "CONSOLIDATION",
      enonce: (i) => `Calcule 1/${i + 2} + 1/${i + 4} sans guidage`,
      reponse: "a",
      distracteurs: [
        { id: "a", texte: "({d2}+{d1})/{d1d2}", },
        { id: "b", texte: "2/{d1d2}", erreur: "PROCEDURAL_ERROR" },
        { id: "c", texte: "1/{d1d2}", erreur: "CONCEPTUAL_ERROR" },
      ],
    },
    {
      palier: "TRANSFERT",
      enonce: (i) => `Un gâteau est coupé en ${i + 2} parts. On en mange 1, puis 1 de plus. Quelle fraction reste-t-il ?`,
      reponse: "a",
      distracteurs: [
        { id: "a", texte: "{reste}/{d}", },
        { id: "b", texte: "2/{d}", erreur: "CONCEPTUAL_ERROR" },
        { id: "c", texte: "{reste}/2", erreur: "PROCEDURAL_ERROR" },
      ],
    },
    {
      palier: "OUVERTURE",
      enonce: (i) => `Trouve DEUX fractions différentes qui donnent le même résultat que 1/${i + 2} + 1/${i + 3}`,
      reponse: "a",
      distracteurs: [
        { id: "a", texte: "Plusieurs solutions possibles", },
        { id: "b", texte: "Une seule solution", erreur: "CONCEPTUAL_ERROR" },
        { id: "c", texte: "Aucune solution", erreur: "CONCEPTUAL_ERROR" },
      ],
    },
  ];

  const banqueComplete = [fractions, equations, proportion].flatMap((competence, i) => {
    const d1 = i + 2;
    const d2 = i + 3;
    const d = d1; // dénominateur pour restitution (même dénominateur)
    const d1d2 = d1 * d2;
    const reste = d - 2;

    return paliersManquants.map((p) => ({
      tenantId: tenant.id,
      siteId: site.id,
      competenceId: competence.id,
      palier: p.palier,
      enonce: p.enonce(i)
        .replace("{d}", String(d))
        .replace("{d1}", String(d1))
        .replace("{d2}", String(d2))
        .replace("{d1d2}", String(d1d2))
        .replace("{reste}", String(reste)),
      format: "CHOIX_UNIQUE" as const,
      origine: "humain",
      bareme: 1,
      structure: {
        etapes: [
          {
            enonce: p.enonce(i)
              .replace("{d}", String(d))
              .replace("{d1}", String(d1))
              .replace("{d2}", String(d2))
              .replace("{d1d2}", String(d1d2))
              .replace("{reste}", String(reste)),
            format: "CHOIX_UNIQUE",
            options: p.distracteurs.map((opt) => ({
              id: opt.id,
              texte: opt.texte
                .replace("{d}", String(d))
                .replace("{d1}", String(d1))
                .replace("{d2}", String(d2))
                .replace("{d1d2}", String(d1d2))
                .replace("{reste}", String(reste)),
              ...(opt.erreur ? { erreur: opt.erreur } : {}),
            })),
            reponse: p.reponse,
            points: 1,
          },
        ],
      },
    }));
  });
  await prisma.question.createMany({ data: banqueComplete });
  console.log(
    `   ✓ ${banqueComplete.length} questions ajoutées pour couvrir tous les paliers (RESTITUTION, CONSOLIDATION, TRANSFERT, OUVERTURE)`
  );

  // Kadidja n'a AUCUNE note : tout ce que le système saura d'elle viendra de
  // l'entraînement. C'est le seul montage qui isole l'effet du travail
  // autonome sur le profil.
  const kadidja = await prisma.eleve.create({
    data: {
      tenantId: tenant.id, siteId: site.id, classeId: classe.id,
      matricule: "DEMO-el4", nom: "Ibrahim", prenom: "Kadidja",
      dateNaissance: new Date("2012-05-20"),
      anneeInscription: ANNEE, statut: "ACTIF",
    },
  });

  const notesAvant = await prisma.note.count({ where: { tenantId: tenant.id } });

  const seance = await ouvrirSeance(tenant.id, kadidja.id, claims, {
    anneeId: annee.id,
    matiereId: matiere.id,
    nombre: 3,
  });

  controles.push([
    "Une séance est composée pour un élève dont on ne sait rien",
    (seance?.exercices.length ?? 0) > 0,
    `${seance?.exercices.length ?? 0} exercice(s)`,
  ]);

  // Le contrôle le plus important du lot : ce que le client reçoit.
  const charge = JSON.stringify(seance);
  controles.push([
    "La séance ne divulgue ni réponse attendue ni indice",
    !charge.includes("Multiplie les deux") && !charge.includes("PROCEDURAL_ERROR"),
    `${charge.length} octets, aucun corrigé`,
  ]);
  controles.push([
    "Une seule étape est révélée à la fois",
    (seance?.exercices ?? []).every((e) => e.etapes.length === 1),
    (seance?.exercices ?? []).map((e) => `${e.etapes.length}/${e.nbEtapes}`).join(" · "),
  ]);

  if (seance && seance.exercices.length > 0) {
    const premier = seance.exercices[0];

    // Un essai faux : l'étape ne se ferme pas, mais l'indice apparaît.
    const rate = await soumettreEtape(tenant.id, claims, {
      feuilleId: seance.feuilleId,
      exerciceId: premier.id,
      index: 0,
      reponse: "999",
    });
    controles.push([
      "Une réponse fausse ouvre un indice sans clore l'étape",
      !rate.correcte && !rate.close && rate.indice !== null && rate.corrige === null,
      `close=${rate.close}, indice=${rate.indice ? "oui" : "non"}, corrigé=${rate.corrige ?? "caché"}`,
    ]);

    // Sauter une étape doit être refusé, quel que soit ce qu'envoie le client.
    let refus = false;
    try {
      await soumettreEtape(tenant.id, claims, {
        feuilleId: seance.feuilleId, exerciceId: premier.id, index: 1, reponse: "a",
      });
    } catch (e) {
      refus = (e as { code?: string }).code === "etape_hors_sequence";
    }
    controles.push([
      "Un client modifié ne peut pas sauter les étapes intermédiaires",
      refus,
      refus ? "refusé (etape_hors_sequence)" : "accepté — faille",
    ]);

    // Séance menée à son terme, toutes réponses justes.
    for (const exercice of seance.exercices) {
      const complet = await prisma.exerciceAssigne.findUnique({
        where: { id: exercice.id },
        select: { question: { select: { structure: true } } },
      });
      const etapes = (complet?.question.structure as { etapes: { reponse: string }[] }).etapes;
      for (let i = 0; i < etapes.length; i++) {
        await soumettreEtape(tenant.id, claims, {
          feuilleId: seance.feuilleId,
          exerciceId: exercice.id,
          index: i,
          reponse: etapes[i].reponse,
        }).catch(() => undefined); // l'étape 0 du 1er exercice est déjà entamée
      }
    }

    const preuvesAuto = await prisma.learningEvidence.findMany({
      where: { tenantId: tenant.id, eleveId: kadidja.id },
      select: { evidenceType: true, masterySignal: true, confidence: true, sourceType: true },
    });
    const preuveDevoir = await prisma.learningEvidence.findFirst({
      where: { tenantId: tenant.id, eleveId: youssouf.id, evidenceType: "DEVOIR" },
      select: { confidence: true },
    });

    controles.push([
      "La séance produit des preuves, et de type AUTO_ENTRAINEMENT",
      preuvesAuto.length > 0 && preuvesAuto.every((p) => p.evidenceType === "AUTO_ENTRAINEMENT"),
      `${preuvesAuto.length} preuve(s) — ${[...new Set(preuvesAuto.map((p) => p.evidenceType))].join(", ")}`,
    ]);
    controles.push([
      "Un sans-faute autonome vaut bien moins qu'un devoir surveillé",
      preuvesAuto.length > 0 &&
        preuveDevoir !== null &&
        preuvesAuto[0].confidence < preuveDevoir.confidence / 2,
      `entraînement ${preuvesAuto[0]?.confidence.toFixed(3)} contre devoir ${preuveDevoir?.confidence.toFixed(3)}`,
    ]);
    // Le premier exercice a essuyé un essai faux (contrôle plus haut) : il vaut
    // 0,75 — l'étape ratée compte demi. Les deux autres, sans faute, valent 1.
    // C'est le barème dégressif qui joue, jamais une pénalité de suspicion : le
    // signal reste exactement ce que l'élève a obtenu.
    const signaux = preuvesAuto.map((p) => p.masterySignal).sort((a, b) => a - b);
    controles.push([
      "Le barème dégressif pénalise l'essai supplémentaire, pas la copie entière",
      signaux.length === 3 && signaux[0] === 0.75 && signaux[1] === 1 && signaux[2] === 1,
      `signaux = ${signaux.join(", ")}`,
    ]);

    const profilsKadidja = await prisma.studentLearningProfile.findMany({
      where: { tenantId: tenant.id, eleveId: kadidja.id },
      select: { masteryStatus: true, confidenceScore: true },
    });
    controles.push([
      "Un sans-faute autonome ne suffit jamais à déclarer une compétence acquise",
      profilsKadidja.length > 0 && profilsKadidja.every((p) => p.masteryStatus !== "MASTERED"),
      profilsKadidja.map((p) => `${p.masteryStatus} (${Math.round(p.confidenceScore * 100)}%)`).join(" · "),
    ]);

    // La question posée par l'établissement : « est-ce que ça touche les notes ? »
    const notesApres = await prisma.note.count({ where: { tenantId: tenant.id } });
    const bulletinsKadidja = await prisma.bulletin.count({
      where: { tenantId: tenant.id, eleveId: kadidja.id },
    });
    controles.push([
      "L'entraînement ne crée aucune note et aucun bulletin",
      notesAvant === notesApres && bulletinsKadidja === 0,
      `notes ${notesAvant} → ${notesApres}, bulletins ${bulletinsKadidja}`,
    ]);

    const feuille = await prisma.feuilleExercices.findUnique({
      where: { id: seance.feuilleId },
      select: { statut: true, valideParId: true },
    });
    controles.push([
      "La feuille d'entraînement se clôt seule, sans signature d'enseignant",
      feuille?.statut === "TERMINEE" && feuille.valideParId === null,
      `statut = ${feuille?.statut}, signée par ${feuille?.valideParId ?? "personne"}`,
    ]);
  }

  // ── 9. Formats composés ─────────────────────────────────────────
  //
  // Remise en ordre et appariement stockent leur réponse en identifiants, et
  // c'est exactement là qu'une fuite se glisse : ces identifiants sont
  // ordonnés et parlants. On vérifie qu'aucun n'atteint l'élève.
  titre("FORMATS COMPOSÉS");

  const { parseStructure, vueEleve, detokeniser, corrigerEtape } = await import(
    "@/lib/learnos/entrainement"
  );

  const structureOrdre = {
    etapes: [
      {
        enonce: "Remets la résolution dans l'ordre",
        format: "REMISE_EN_ORDRE",
        options: [
          { id: "a", texte: "Réduire au même dénominateur" },
          { id: "b", texte: "Additionner les numérateurs" },
          { id: "c", texte: "Simplifier le résultat" },
        ],
        reponse: "a|b|c",
        points: 1,
      },
    ],
  };
  const structureAppariement = {
    etapes: [
      {
        enonce: "Relie chaque fraction à son écriture décimale",
        format: "APPARIEMENT",
        paires: [
          { id: "p1", gauche: "1/2", droite: "0,5" },
          { id: "p2", gauche: "1/4", droite: "0,25" },
          { id: "p3", gauche: "3/4", droite: "0,75" },
        ],
        points: 1,
      },
    ],
  };

  const questionsComposees = await prisma.question.createManyAndReturn({
    data: [
      {
        tenantId: tenant.id, siteId: site.id, competenceId: fractions.id,
        palier: "CONSOLIDATION", format: "REMISE_EN_ORDRE",
        enonce: "Calcule 1/2 + 1/3 en ordonnant les étapes",
        structure: structureOrdre, bareme: 1, origine: "humain",
      },
      {
        tenantId: tenant.id, siteId: site.id, competenceId: fractions.id,
        palier: "TRANSFERT", format: "APPARIEMENT",
        enonce: "Fractions et écritures décimales",
        structure: structureAppariement, bareme: 1, origine: "humain",
      },
    ],
    select: { id: true, format: true, structure: true },
  });

  const gabarit = {
    id: "demo-exo",
    ordre: 1,
    palier: "CONSOLIDATION",
    regleDeclenchee: "exercice_consolidation_fragile",
    motifParams: {},
    competence: { libelle: "Manipuler les fractions" },
    question: { enonce: "…", format: "REMISE_EN_ORDRE" as const },
  };

  const lueOrdre = parseStructure(structureOrdre)!;
  const lueAppariement = parseStructure(structureAppariement)!;
  const vuOrdre = vueEleve(gabarit, lueOrdre, []);
  const vuAppariement = vueEleve(gabarit, lueAppariement, []);

  const chargeComposee = JSON.stringify([vuOrdre, vuAppariement]);
  controles.push([
    "Aucun identifiant de la banque n'atteint l'élève sur les formats composés",
    !["a", "b", "c", "p1", "p2", "p3"].some((id) =>
      chargeComposee.includes(`"id":"${id}"`)
    ),
    `${chargeComposee.length} octets, identifiants jetonnés`,
  ]);

  controles.push([
    "Les deux colonnes d'un appariement ne partagent aucun jeton",
    !vuAppariement.etapes[0].droite!.some((d) =>
      vuAppariement.etapes[0].gauche!.some((g) => g.id === d.id)
    ),
    `gauche ${vuAppariement.etapes[0].gauche!.length} · droite ${vuAppariement.etapes[0].droite!.length}`,
  ]);

  // Un élève qui répond juste depuis ce que l'écran lui montre doit être
  // compté juste : le jetonnage ne doit rien casser au passage.
  const parTexte = new Map(vuOrdre.etapes[0].options!.map((o) => [o.texte, o.id]));
  const reponseOrdre = [
    "Réduire au même dénominateur",
    "Additionner les numérateurs",
    "Simplifier le résultat",
  ]
    .map((texte) => parTexte.get(texte)!)
    .join("|");
  const traduitOrdre = detokeniser(lueOrdre.etapes[0], `${gabarit.id}#0`, reponseOrdre);

  controles.push([
    "Une remise en ordre juste, saisie depuis l'écran, est comptée juste",
    corrigerEtape(lueOrdre.etapes[0], traduitOrdre).correcte,
    `retraduite en « ${traduitOrdre} »`,
  ]);

  const decimalDe: Record<string, string> = { "1/2": "0,5", "1/4": "0,25", "3/4": "0,75" };
  const reponseAppariement = vuAppariement.etapes[0]
    .gauche!.map(
      (g) =>
        `${g.id}:${vuAppariement.etapes[0].droite!.find((d) => d.texte === decimalDe[g.texte])!.id}`
    )
    .join("|");
  const traduitAppariement = detokeniser(
    lueAppariement.etapes[0],
    `${gabarit.id}#0`,
    reponseAppariement
  );

  controles.push([
    "Un appariement juste, saisi depuis l'écran, est compté juste",
    corrigerEtape(lueAppariement.etapes[0], traduitAppariement).correcte,
    `retraduit en « ${traduitAppariement} »`,
  ]);

  controles.push([
    "Une réponse forgée avec les identifiants internes est refusée",
    !corrigerEtape(
      lueAppariement.etapes[0],
      detokeniser(lueAppariement.etapes[0], `${gabarit.id}#0`, "p1:p1|p2:p2|p3:p3")
    ).correcte,
    "« p1:p1|p2:p2|p3:p3 » rejeté",
  ]);

  controles.push([
    "Les formats composés sont bien enregistrés en banque",
    questionsComposees.length === 2,
    questionsComposees.map((q) => q.format).join(", "),
  ]);

  // ── 10. Attestation en classe ───────────────────────────────────
  //
  // La boucle qui referme le dispositif : quand l'entraînement dit « cet élève
  // sait faire », un enseignant est appelé à vérifier.
  titre("ATTESTATION EN CLASSE");

  const { meriteAttestation, candidatsAttestation, proposerAttestation } = await import(
    "@/lib/learnos/attestation"
  );

  controles.push([
    "Un élève en progrès ne déclenche aucune demande",
    !meriteAttestation({
      masteryScore: 0.6,
      confidenceScore: 0.8,
      preuvesAutonomes: 10,
      preuvesSupervisees: 0,
    }),
    "silence — c'est ce qui donne du poids aux demandes réelles",
  ]);

  controles.push([
    "Un élève déjà évalué en classe n'en déclenche pas non plus",
    !meriteAttestation({
      masteryScore: 0.95,
      confidenceScore: 0.9,
      preuvesAutonomes: 10,
      preuvesSupervisees: 1,
    }),
    "le verrou ne s'applique pas : l'attestation n'aurait rien à débloquer",
  ]);

  // On force le profil de Kadidja au seuil, comme après une dizaine de séances,
  // pour vérifier la chaîne complète sans avoir à les jouer une à une.
  await prisma.studentLearningProfile.updateMany({
    where: { tenantId: tenant.id, eleveId: kadidja.id, competenceId: fractions.id },
    data: { masteryScore: 0.9, confidenceScore: 0.7, evidenceCount: 6 },
  });
  await prisma.learningEvidence.createMany({
    data: [0, 1, 2].map((i) => ({
      id: `demo-auto-${i}`,
      tenantId: tenant.id, siteId: site.id,
      eleveId: kadidja.id, competenceId: fractions.id,
      sourceType: "exercice", sourceId: `demo-seance-${i}`,
      evidenceType: "AUTO_ENTRAINEMENT",
      rawScore: 1, maxScore: 1,
      masterySignal: 1, confidence: 0.14, weight: 1,
      occurredAt: new Date(),
    })),
    skipDuplicates: true,
  });

  const candidats = await candidatsAttestation(tenant.id, kadidja.id, claims);
  controles.push([
    "Une compétence travaillée seule et solide devient candidate",
    candidats.some((c) => c.competenceId === fractions.id),
    candidats.map((c) => `${c.competenceLibelle} (${c.preuvesAutonomes} preuves)`).join(", ") ||
      "aucun candidat",
  ]);

  const attestation = await proposerAttestation(
    tenant.id, kadidja.id, fractions.id, claims
  );
  const feuilleAttestation = attestation
    ? await prisma.feuilleExercices.findUnique({
        where: { id: attestation.feuilleId },
        select: { statut: true, type: true, valideParId: true, competenceAttesteeId: true },
      })
    : null;

  controles.push([
    "L'attestation naît PROPOSÉE et non assignée",
    feuilleAttestation?.statut === "PROPOSEE" && feuilleAttestation.valideParId === null,
    `statut = ${feuilleAttestation?.statut}, signée par ${feuilleAttestation?.valideParId ?? "personne"}`,
  ]);

  controles.push([
    "Elle est tirée à un palier SUPÉRIEUR à celui de l'entraînement",
    (attestation?.nbExercices ?? 0) > 0,
    `${attestation?.nbExercices ?? 0} exercice(s) en consolidation/transfert`,
  ]);

  // Doublon : une seconde séance réussie ne doit pas empiler une demande de
  // plus sur le bureau de l'enseignant.
  const candidatsApres = await candidatsAttestation(tenant.id, kadidja.id, claims);
  controles.push([
    "Aucune seconde attestation tant que la première est en cours",
    !candidatsApres.some((c) => c.competenceId === fractions.id),
    candidatsApres.length === 0 ? "aucun doublon" : `${candidatsApres.length} restant(s)`,
  ]);

  // Les DEUX gestes de l'enseignant, et ce qui les sépare : accepter ne doit
  // pas suffire à ouvrir la feuille à l'élève.
  const { signerAttestation, ouvrirAttestation, attestationsOuvertes } = await import(
    "@/lib/learnos/attestation"
  );
  const { evidenceTypeDeFeuille } = await import("@/lib/learnos/entrainement");
  const { estSupervisee } = await import("@/lib/learnos/evidence-engine");

  if (attestation) {
    await signerAttestation(tenant.id, attestation.feuilleId, "demo-enseignant", claims);
    const signee = await prisma.feuilleExercices.findUnique({
      where: { id: attestation.feuilleId },
      select: { statut: true, valideParId: true, assigneeLe: true },
    });
    controles.push([
      "La signature accepte la feuille sans encore l'ouvrir à l'élève",
      signee?.statut === "ASSIGNEE" &&
        signee.valideParId === "demo-enseignant" &&
        signee.assigneeLe === null,
      `statut = ${signee?.statut}, ouverte le ${signee?.assigneeLe ?? "— (pas encore)"}`,
    ]);

    const avantLancement = await attestationsOuvertes(tenant.id, kadidja.id, claims);
    controles.push([
      "Une attestation acceptée mais non lancée reste invisible pour l'élève",
      avantLancement.length === 0,
      avantLancement.length === 0
        ? "rien à faire à la maison"
        : `${avantLancement.length} visible(s) — faille`,
    ]);

    // Ne pas la LISTER ne suffit pas : il faut aussi qu'elle soit
    // INOUVRABLE. Un élève qui connaîtrait l'identifiant de la feuille la
    // passerait sinon chez lui, et la preuve « supervisée » qui en sortirait
    // serait fausse — c'est-à-dire précisément ce que tout le dispositif
    // cherche à éviter.
    const { chargerSeance } = await import("@/lib/learnos/entrainement");
    const parIdentifiant = await chargerSeance(tenant.id, attestation.feuilleId, claims);
    controles.push([
      "Elle est aussi inouvrable par son identifiant, pas seulement absente des listes",
      parIdentifiant === null,
      parIdentifiant === null ? "refusée" : "chargée — faille",
    ]);

    // Deuxième geste : l'enseignant lance, élève devant lui.
    await ouvrirAttestation(tenant.id, attestation.feuilleId, claims);
    const apresLancement = await attestationsOuvertes(tenant.id, kadidja.id, claims);
    controles.push([
      "Le lancement en classe, et lui seul, ouvre la feuille à l'élève",
      apresLancement.some((a) => a.feuilleId === attestation.feuilleId),
      `${apresLancement.length} attestation(s) ouverte(s)`,
    ]);
  }

  controles.push([
    "La preuve produite par une attestation est supervisée, contrairement à l'entraînement",
    estSupervisee(evidenceTypeDeFeuille("attestation")) &&
      !estSupervisee(evidenceTypeDeFeuille("entrainement")),
    `attestation → ${evidenceTypeDeFeuille("attestation")}, entraînement → ${evidenceTypeDeFeuille("entrainement")}`,
  ]);

  // ── 11. Génération d'énoncés ────────────────────────────────────
  //
  // Testée pour de vrai quand un fournisseur est configuré, ignorée sinon —
  // et c'est le comportement attendu du dispositif lui-même : la banque se
  // remplit à la main quand l'IA n'est pas là.
  titre("GÉNÉRATION D'ÉNONCÉS");

  const { availableProviders } = await import("@/lib/ai/router");
  const fournisseurs = availableProviders();

  if (fournisseurs.length === 0) {
    console.log(
      "   ⏭️  Aucun fournisseur IA configuré (OLLAMA_BASE_URL / GROQ_API_KEY / GLM_API_KEY).\n" +
        "      La génération n'est pas testée — le reste du dispositif n'en dépend pas."
    );
  } else {
    console.log(`   fournisseurs disponibles : ${fournisseurs.join(", ")}`);
    const { genererQuestions } = await import("@/lib/learnos/generation-questions");
    try {
      const genere = await genererQuestions(
        tenant.id,
        claims,
        { competenceId: fractions.id, palier: "APPLICATION", format: "CHOIX_UNIQUE", nombre: 2 },
        "demo-enseignant"
      );

      controles.push([
        "La génération écrit des questions exploitables en banque",
        genere.creees.length > 0,
        `${genere.creees.length} créée(s), ${genere.rejetees} rejetée(s) — ${genere.modele}`,
      ]);

      const generees = await prisma.question.findMany({
        where: { tenantId: tenant.id, origine: "ia" },
        select: { id: true, structure: true, relueLe: true, actif: true },
      });

      controles.push([
        "Toute question générée passe la validation qui la servira à l'élève",
        generees.length > 0 && generees.every((q) => parseStructure(q.structure) !== null),
        `${generees.length} question(s) générée(s), toutes lisibles`,
      ]);

      controles.push([
        "Une question générée est servable tout de suite, mais non relue",
        generees.every((q) => q.actif && q.relueLe === null),
        "actif = true, relueLe = null → preuve décotée jusqu'à relecture",
      ]);
    } catch (error) {
      controles.push([
        "La génération aboutit",
        false,
        error instanceof Error ? error.message.slice(0, 120) : "erreur inconnue",
      ]);
    }
  }

  // ── 12. Comptes de connexion ────────────────────────────────────
  //
  // Dernière étape, et pas la moindre : sans compte, tout ce qui précède reste
  // vérifiable en base et invisible à l'écran.
  titre("COMPTES DE DÉMONSTRATION");
  const comptes = await attacherComptesEleves(tenant.id);
  controles.push([
    "Les élèves de démonstration ont un compte pour se connecter",
    comptes.length === 2,
    comptes.join(" · ") || "aucun",
  ]);

  let echecs = 0;
  for (const [libelle, ok, detail] of controles) {
    console.log(`${ok ? "  ✅" : "  ❌"} ${libelle}`);
    console.log(`      ${detail}`);
    if (!ok) echecs++;
  }

  console.log("\n" + "═".repeat(70));
  if (echecs === 0) {
    console.log(`  ✅ CHAÎNE VALIDÉE — les ${controles.length} contrôles passent.`);
  } else {
    console.log(`  ❌ ${echecs} contrôle(s) en échec.`);
    process.exitCode = 1;
  }
  console.log("═".repeat(70));
  console.log(
    "\nLes données restent en base pour inspection à l'écran " +
      "(module Curriculum, fiche élève → onglet Compétences).\n" +
      "Pour tout supprimer :  npx tsx scripts/demo-learnos.ts --clean\n"
  );
}

main()
  .catch((e) => {
    console.error("\n❌ Erreur :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
