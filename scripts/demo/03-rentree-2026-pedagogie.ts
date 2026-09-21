/**
 * Démo Ambouli — étape 3 : la vie pédagogique de la rentrée 2026-2027.
 *
 * CE QUI MANQUAIT
 * L'année 2026-2027 est l'année courante (`isCurrent`), mais elle n'avait que
 * son ossature : classes, élèves, emploi du temps, affectations, factures.
 * Aucune séance, aucun devoir, aucune évaluation, aucune note. Tous les
 * écrans pédagogiques étaient donc vides à la date réelle comme aux deux
 * dernières positions de la Time Machine (août et octobre 2026) — c'est-à-dire
 * exactement là où la démonstration commence quand on ne touche à rien.
 *
 * CE QUE CE SCRIPT ÉCRIT (1er trimestre : 2 sept. → 19 déc. 2026)
 *   • le cahier journal : une séance par créneau d'emploi du temps et par
 *     semaine de cours, avec contenu, objectifs, présents/absents ;
 *   • les devoirs donnés en classe, rattachés à leur séance ;
 *   • trois évaluations par classe × matière : deux déjà passées (mi-septembre
 *     et début octobre) et la composition de fin de trimestre, encore au
 *     calendrier ;
 *   • les notes des évaluations passées, corrélées au niveau de chaque élève ;
 *   • le passé scolaire de la cohorte (parcours 2025-2026), sans lequel aucune
 *     analyse longitudinale ni prédiction n'a de matière à travailler.
 *
 * L'HORIZON DE DÉMONSTRATION FAIT LE RESTE
 * On écrit tout le trimestre d'un coup ; c'est `demo-horizon` qui masque ce
 * qui n'a pas encore eu lieu à la date choisie. Écrire « jusqu'à aujourd'hui »
 * aurait figé le jeu de données à la date de génération.
 *
 * DÉTERMINISTE ET IDEMPOTENT : les identifiants sont calculés, jamais tirés au
 * sort ; une seconde exécution ne crée aucun doublon.
 *
 *   pnpm exec tsx scripts/demo/03-rentree-2026-pedagogie.ts
 *   pnpm exec tsx scripts/demo/03-rentree-2026-pedagogie.ts --dry-run
 */

import { Prisma, PrismaClient, Jour, TypeNote, StatutSeance, StatutDevoir, DevoirType } from "@prisma/client";
import { setSeed, randInt, pick, chance, clamp, gauss, noteGauss, appreciationNote } from "../../prisma/seed-ambouli-helpers";
import { niveauEleve } from "./_profil-eleve";
import { recalerDates, alignerNotesSurEvaluations } from "./_ecriture-massive";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry-run");
/**
 * Ne recaler que les dates, sans repasser par les écritures.
 *
 * Rejouer le script entier renvoie quatorze mille séances et vingt-huit mille
 * notes que la base possède déjà : sur une base lente, c'est une heure pour ne
 * rien changer. Cette option saute les écritures et va droit à la correction
 * des rendez-vous d'évaluation.
 */
const DATES_SEULEMENT = process.argv.includes("--dates-seulement");

const TENANT = "tenant-ambouli";
const ANNEE = "2026-2027";
const RENTREE = new Date(2026, 8, 2, 8, 0, 0); // 2 septembre 2026
const FIN_T1 = new Date(2026, 11, 19, 18, 0, 0); // 19 décembre 2026

const JOUR_INDEX: Record<Jour, number> = {
  LUNDI: 1, MARDI: 2, MERCREDI: 3, JEUDI: 4, VENDREDI: 5, SAMEDI: 6, DIMANCHE: 0,
};

/** Trames de contenu de séance, par famille de matière. */
const CONTENUS: Record<string, string[]> = {
  MATH: ["Rappels et diagnostic de rentrée", "Calcul littéral : développer et réduire", "Équations du premier degré", "Théorème de Thalès", "Fonctions affines : représentation", "Statistiques : moyenne et médiane", "Géométrie dans l'espace", "Puissances et notation scientifique"],
  FR: ["Lecture analytique : incipit", "Grammaire : les propositions subordonnées", "Expression écrite : le récit", "Étude d'une œuvre intégrale", "Argumentation : thèse et arguments", "Orthographe : accords du participe passé"],
  ANG: ["Present perfect vs simple past", "Reading comprehension: daily life", "Vocabulary: school and studies", "Listening: short interviews", "Writing: informal letter"],
  AR: ["المطالعة والفهم", "قواعد النحو : الجملة الاسمية", "التعبير الكتابي", "النصوص الأدبية"],
  HG: ["La répartition de la population mondiale", "L'Afrique de l'Est : enjeux régionaux", "Djibouti dans la Corne de l'Afrique", "Les grandes découvertes", "Éducation civique : la citoyenneté"],
  PC: ["Sécurité au laboratoire", "États de la matière", "Circuits électriques en série", "Réactions chimiques : conservation de la masse", "Optique : réflexion et réfraction"],
  SVT: ["La cellule, unité du vivant", "Nutrition et digestion", "Le climat aride et la biodiversité", "Reproduction des végétaux", "Géologie : les roches"],
  EPS: ["Test d'évaluation physique", "Athlétisme : course de vitesse", "Sports collectifs : handball", "Renforcement musculaire", "Jeux d'opposition"],
  ISL: ["التربية الإسلامية : العبادات", "السيرة النبوية", "الأخلاق الإسلامية"],
  TECH: ["Découverte de l'ordinateur", "Traitement de texte", "Algorithmique : premiers pas", "Le tableur"],
  ART: ["Le trait et la ligne", "Composition et couleurs", "Volume et matériaux"],
  MUS: ["Le rythme", "La voix et le chant", "Musiques traditionnelles de Djibouti"],
  PHILO: ["Qu'est-ce que penser ?", "La conscience", "Le désir", "La liberté"],
  SES: ["Les acteurs économiques", "Production et croissance", "La monnaie"],
  DEFAUT: ["Séance de cours", "Travaux dirigés", "Exercices d'application", "Correction et remédiation"],
};

const OBJECTIFS: string[] = [
  "Mobiliser les acquis de l'an dernier",
  "Comprendre la notion introduite",
  "Appliquer la méthode sur des exercices guidés",
  "Travailler en autonomie",
  "Rendre compte à l'oral",
];

function joursOuvres(debut: Date, fin: Date): Date[] {
  const jours: Date[] = [];
  const d = new Date(debut);
  while (d <= fin) {
    const jour = d.getDay();
    if (jour >= 1 && jour <= 5) jours.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return jours;
}

function numeroSemaine(date: Date): number {
  const ms = date.getTime() - RENTREE.getTime();
  return Math.max(1, Math.floor(ms / (7 * 24 * 3600 * 1000)) + 1);
}

async function main() {
  if (DRY) console.log("=== SIMULATION — aucune écriture ===");
  setSeed(20260902);

  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId: TENANT, libelle: ANNEE },
    include: { periodes: { orderBy: { numero: "asc" } } },
  });
  if (!annee) throw new Error(`Année ${ANNEE} introuvable`);
  const t1 = annee.periodes.find((p) => p.numero === 1);
  if (!t1) throw new Error("1er trimestre introuvable");

  // Vacances : une séance un jour de vacances décrédibilise tout le reste.
  const vacances = await prisma.evenementCalendaire.findMany({
    where: { anneeId: annee.id },
    select: { libelle: true, type: true, dateDebut: true, dateFin: true },
  });
  const estVacances = (d: Date) =>
    vacances.some(
      (v) =>
        /vacance|congé|férié|fete|fête/i.test(`${v.type} ${v.libelle}`) &&
        d >= new Date(v.dateDebut) &&
        d <= new Date(v.dateFin ?? v.dateDebut),
    );

  const creneaux = await prisma.emploiTemps.findMany({
    where: { tenantId: TENANT, annee: ANNEE },
    select: {
      id: true, classeId: true, matiereId: true, enseignantId: true, jour: true,
      heureDebut: true, heureFin: true, salle: true,
      classe: { select: { id: true, nom: true, niveau: true, siteId: true } },
      matiere: { select: { id: true, code: true, nom: true } },
    },
  });
  console.log(`${creneaux.length} créneaux d'emploi du temps pour ${ANNEE}`);

  const elevesParClasse = new Map<string, { id: string; prenom: string; nom: string }[]>();
  for (const e of await prisma.eleve.findMany({
    where: { tenantId: TENANT, classe: { annee: ANNEE }, deletedAt: null },
    select: { id: true, prenom: true, nom: true, classeId: true },
  })) {
    if (!e.classeId) continue;
    const liste = elevesParClasse.get(e.classeId) ?? [];
    liste.push({ id: e.id, prenom: e.prenom, nom: e.nom });
    elevesParClasse.set(e.classeId, liste);
  }
  console.log(`${[...elevesParClasse.values()].reduce((n, l) => n + l.length, 0)} élèves répartis dans ${elevesParClasse.size} classes`);

  const jours = joursOuvres(RENTREE, FIN_T1).filter((d) => !estVacances(d));
  console.log(`${jours.length} jours de classe du 2 septembre au 19 décembre 2026`);

  // ----------------------------------------------------------------
  // 1. Le cahier journal — une séance par créneau et par semaine
  // ----------------------------------------------------------------
  const seances: Prisma.SeancePedagogiqueCreateManyInput[] = [];
  const devoirs: Prisma.DevoirCreateManyInput[] = [];

  for (const c of creneaux) {
    const eleves = elevesParClasse.get(c.classeId) ?? [];
    const trame = CONTENUS[c.matiere.code] ?? CONTENUS.DEFAUT;
    let rang = 0;

    for (const jour of jours) {
      if (jour.getDay() !== JOUR_INDEX[c.jour]) continue;
      rang++;
      const [h, min] = c.heureDebut.split(":").map(Number);
      const date = new Date(jour);
      date.setHours(h, min ?? 0, 0, 0);

      const absents = Math.round(clamp(gauss(eleves.length * 0.04, 1.5), 0, Math.max(0, eleves.length - 5)));
      seances.push({
        id: `sea-2026-${c.id}-${rang}`,
        tenantId: TENANT,
        siteId: c.classe.siteId,
        classeId: c.classeId,
        matiereId: c.matiereId,
        enseignantId: c.enseignantId,
        emploiTempsId: c.id,
        date,
        dureePrevue: 60,
        dureeReelle: chance(0.12) ? 50 : 60,
        statut: StatutSeance.EFFECTUEE,
        semaine: numeroSemaine(jour),
        contenu: `${trame[(rang - 1) % trame.length]}`,
        objectifs: [OBJECTIFS[rang % OBJECTIFS.length], OBJECTIFS[(rang + 2) % OBJECTIFS.length]],
        activites: [
          { nom: "Rappel de la séance précédente", duree: 10, type: "oral" },
          { nom: "Cours", duree: 25, type: "magistral" },
          { nom: "Exercices d'application", duree: 20, type: "individuel" },
        ],
        rythme: chance(0.15) ? "EN_RETARD" : chance(0.2) ? "EN_AVANCE" : "A_TEMPS",
        presents: eleves.length - absents,
        absents,
      });

      // Un devoir toutes les trois séances, à partir de la DEUXIÈME : donner
      // le premier au bout de trois semaines laisserait le cahier de textes
      // vide pendant tout le mois de septembre.
      if (rang % 3 === 2 && eleves.length > 0) {
        const donne = new Date(date);
        const rendu = new Date(date);
        rendu.setDate(rendu.getDate() + 7);
        devoirs.push({
          id: `dev-2026-${c.id}-${rang}`,
          tenantId: TENANT,
          siteId: c.classe.siteId,
          classeId: c.classeId,
          matiereId: c.matiereId,
          enseignantId: c.enseignantId,
          seanceId: `sea-2026-${c.id}-${rang}`,
          titre: `${c.matiere.nom} — exercices ${Math.ceil(rang / 3)}`,
          description: `À la suite de la séance « ${trame[(rang - 1) % trame.length]} ».`,
          dateDonne: donne,
          dateRendu: rendu,
          statut: StatutDevoir.A_FAIRE,
          type: chance(0.25) ? DevoirType.EXERCICE : DevoirType.AUTRE,
        });
      }
    }
  }

  if (!DATES_SEULEMENT) await ecrireParLots("séances pédagogiques", seances, (lot) =>
    prisma.seancePedagogique.createMany({ data: lot, skipDuplicates: true }),
  );
  if (!DATES_SEULEMENT) await ecrireParLots("devoirs", devoirs, (lot) =>
    prisma.devoir.createMany({ data: lot, skipDuplicates: true }),
  );

  // ----------------------------------------------------------------
  // 2. Les évaluations et leurs notes
  // ----------------------------------------------------------------
  // Un couple classe × matière = un enseignement. L'emploi du temps le dit
  // mieux que les affectations, qui comportent des doublons.
  const enseignements = new Map<string, (typeof creneaux)[number]>();
  for (const c of creneaux) {
    const cle = `${c.classeId}|${c.matiereId}`;
    if (!enseignements.has(cle)) enseignements.set(cle, c);
  }
  console.log(`${enseignements.size} enseignements (classe × matière)`);

  const profUser = new Map<string, string>();
  for (const e of await prisma.enseignant.findMany({ where: { tenantId: TENANT }, select: { id: true, userId: true } })) {
    profUser.set(e.id, e.userId);
  }

  const evaluations: Prisma.EvaluationCreateManyInput[] = [];
  const notes: Prisma.NoteCreateManyInput[] = [];

  /**
   * Les trois rendez-vous du trimestre, repérés en jours de classe depuis la
   * rentrée.
   *
   * La première interrogation tombe au huitième jour de classe — soit la
   * deuxième semaine. Ce n'est pas un détail de calendrier : placée plus tard,
   * la démonstration faite à la date réelle (mi-septembre) ouvrirait sur un
   * carnet de notes vide, alors que c'est le premier écran que l'on montre.
   */
  const RENDEZ_VOUS = [
    { cle: "int1", titre: "Interrogation n°1", type: TypeNote.INTERROGATION, coef: 1, duree: 30, jour: 7, statut: "TERMINE" },
    { cle: "ds1", titre: "Devoir surveillé n°1", type: TypeNote.CONTROLE, coef: 2, duree: 60, jour: 26, statut: "TERMINE" },
    { cle: "compo", titre: "Composition du 1er trimestre", type: TypeNote.EXAMEN, coef: 3, duree: 120, jour: 68, statut: "PLANIFIE" },
  ] as const;

  for (const [cle, c] of enseignements) {
    const eleves = elevesParClasse.get(c.classeId) ?? [];
    if (eleves.length === 0) continue;
    const userProf = c.enseignantId ? profUser.get(c.enseignantId) ?? null : null;

    for (const rdv of RENDEZ_VOUS) {
      const jour = jours[Math.min(rdv.jour, jours.length - 1)];
      const date = new Date(jour);
      date.setHours(9, 0, 0, 0);
      const evaluationId = `eval-2026-${c.classeId}-${c.matiere.code}-${rdv.cle}`;

      evaluations.push({
        id: evaluationId,
        tenantId: TENANT,
        titre: `${rdv.titre} — ${c.matiere.nom}`,
        type: rdv.type,
        classeId: c.classeId,
        matiereId: c.matiereId,
        periodeId: t1.id,
        date,
        duree: rdv.duree,
        coefficient: rdv.coef,
        description: `${c.classe.nom} — ${c.matiere.nom}`,
        statut: rdv.statut,
      });

      if (rdv.statut !== "TERMINE") continue;

      for (const eleve of eleves) {
        // La note tourne autour du niveau de l'élève ; l'écart-type fait le
        // reste — un bon élève peut rater une interrogation.
        const valeur = noteGauss(niveauEleve(eleve.id), 2.2);
        notes.push({
          id: `note-2026-${evaluationId}-${eleve.id}`.slice(0, 190),
          tenantId: TENANT,
          eleveId: eleve.id,
          classeId: c.classeId,
          matiereId: c.matiereId,
          periodeId: t1.id,
          evaluationId,
          type: rdv.type,
          intitule: rdv.titre,
          valeur,
          noteMax: 20,
          coefficient: rdv.coef,
          date,
          appreciation: appreciationNote(valeur),
          saisieParId: userProf,
          isPubliee: true,
        });
      }
    }
  }

  if (!DATES_SEULEMENT) await ecrireParLots("évaluations", evaluations, (lot) =>
    prisma.evaluation.createMany({ data: lot, skipDuplicates: true }),
  );

  // Recaler les rendez-vous déjà posés.
  //
  // Les identifiants étant calculés, une seconde exécution ne recrée rien — et
  // ne corrigerait donc jamais une date fixée par une exécution précédente. Or
  // la date d'une interrogation décide de ce que la démonstration montre à la
  // rentrée : placée une semaine trop tard, le carnet de notes est vide à la
  // mi-septembre. On aligne donc les lignes existantes sur le calendrier voulu,
  // puis les notes sur leur évaluation.
  if (!DRY) {
    await recalerDates(
      "evaluations",
      "date",
      (evaluations as { id: string; date: Date }[]).map((e) => ({ id: e.id, date: e.date })),
      "évaluations",
    );
    await alignerNotesSurEvaluations("eval-2026-");
  }

  // ----------------------------------------------------------------
  // 3. Le passé scolaire de la cohorte
  // ----------------------------------------------------------------
  // Sans année précédente, aucune analyse longitudinale, aucune prédiction,
  // aucun « élève à surveiller » : l'intelligence de l'application n'aurait
  // rien à lire. La moyenne de l'an dernier est corrélée au niveau actuel,
  // sans lui être identique — un élève progresse ou décroche.
  // Les libellés de niveau sont ceux de la base — sans accent ni abréviation
  // fantaisiste. Une clé qui ne correspond pas ferait silencieusement dire à
  // l'élève de 2nde qu'il était déjà en 2nde l'an dernier.
  const NIVEAU_PRECEDENT: Record<string, string> = {
    "6eme": "CM2", "5eme": "6eme", "4eme": "5eme", "3eme": "4eme",
    "2nde": "3eme", "1ere": "2nde", "Terminale": "1ere",
  };

  if (DATES_SEULEMENT) return;

  const parcours: Prisma.ParcoursScolaireCreateManyInput[] = [];
  const classes2026 = await prisma.classe.findMany({
    where: { tenantId: TENANT, annee: ANNEE, deletedAt: null },
    select: { id: true, nom: true, niveau: true },
  });
  // Les parcours déjà posés par un autre script (personas) sont respectés ;
  // ceux que CE script a écrits portent le préfixe `ps-2026-` et sont
  // recalculés, faute de quoi une correction de règle ne s'appliquerait
  // jamais aux exécutions précédentes.
  const dejaParcours = new Set(
    (
      await prisma.parcoursScolaire.findMany({
        where: {
          tenantId: TENANT,
          annee: "2025-2026",
          eleve: { classe: { annee: ANNEE } },
          NOT: { id: { startsWith: "ps-2026-" } },
        },
        select: { eleveId: true },
      })
    ).map((p) => p.eleveId),
  );
  if (!DRY) {
    const { count } = await prisma.parcoursScolaire.deleteMany({
      where: { tenantId: TENANT, annee: "2025-2026", id: { startsWith: "ps-2026-" } },
    });
    if (count > 0) console.log(`parcours 2025-2026 : ${count} ligne(s) recalculée(s)`);
  }

  for (const classe of classes2026) {
    const eleves = elevesParClasse.get(classe.id) ?? [];
    const niveauPrecedent = NIVEAU_PRECEDENT[classe.niveau] ?? classe.niveau;
    for (const eleve of eleves) {
      if (dejaParcours.has(eleve.id)) continue;
      const actuel = niveauEleve(eleve.id);
      const precedent = clamp(actuel + gauss(0, 1.2), 3, 19);
      parcours.push({
        id: `ps-2026-${eleve.id}`,
        tenantId: TENANT,
        eleveId: eleve.id,
        annee: "2025-2026",
        classe: `${niveauPrecedent} ${classe.nom.split(" ")[1] ?? ""}`.trim(),
        // La classe précédente garde la lettre de section : un élève de
        // « 2nde D » venait d'une « 3eme D », pas d'une classe anonyme.
        niveau: niveauPrecedent,
        moyenneAnnuelle: Math.round(precedent * 100) / 100,
        rang: randInt(1, Math.max(2, eleves.length)),
        effectif: eleves.length,
        decision: precedent >= 10 ? "Passage" : "Redoublement",
      });
    }
  }

  if (!DATES_SEULEMENT) await ecrireParLots("parcours 2025-2026", parcours, (lot) =>
    prisma.parcoursScolaire.createMany({ data: lot, skipDuplicates: true }),
  );
}

async function ecrireParLots<T>(
  libelle: string,
  lignes: T[],
  ecrire: (lot: T[]) => Promise<{ count: number }>,
) {
  if (lignes.length === 0) {
    console.log(`${libelle} : rien à écrire`);
    return;
  }
  if (DRY) {
    console.log(`[simulation] ${libelle} : ${lignes.length} ligne(s)`);
    return;
  }
  let ecrites = 0;
  for (let i = 0; i < lignes.length; i += 1000) {
    const { count } = await ecrire(lignes.slice(i, i + 1000));
    ecrites += count;
    process.stdout.write(`\r${libelle} : ${ecrites}/${lignes.length}   `);
  }
  process.stdout.write(`\r${libelle} : ${ecrites} écrite(s) sur ${lignes.length} proposée(s)\n`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
