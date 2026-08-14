/**
 * Validation de bout en bout du bot parent, sur données réelles.
 *
 *   DATABASE_URL="$DIRECT_URL" npx tsx scripts/demo-bot-parent.ts
 *   DATABASE_URL="$DIRECT_URL" npx tsx scripts/demo-bot-parent.ts --langue=so
 *
 * `DATABASE_URL="$DIRECT_URL"` pointe le script sur le pooler en mode session
 * (port 5432) : mesuré 192 ms/requête contre 980 ms sur le pooler transaction,
 * qui coupe en outre la connexion en cours de script (P1017).
 *
 * N'ENVOIE RIEN. Le script affiche ce que le parent recevrait ; l'envoi
 * WhatsApp n'est jamais déclenché. Il détecte aussi les alertes en attente
 * sans vider la file.
 *
 * Pourquoi un script et pas un test : les tests vérifient les règles sur des
 * données fabriquées. Ici on vérifie que le bot tient debout sur le contenu
 * réel de la base — un profil vide, une fratrie, un parent sans enfant actif.
 */

import prisma from "../src/lib/prisma";
import {
  INTENTIONS,
  identifierParent,
  traiterQuestion,
  detecterIntention,
} from "../src/lib/learnos/bot-parent";
import {
  detecterAlertes,
  envoyerAlertesEnAttente,
} from "../src/lib/learnos/alertes-parent";
import { traducteurPour } from "../src/lib/learnos/traducteur";

/**
 * Numéro du parent de démonstration. Le préfixe `+25377` est djiboutien et
 * le suffixe volontairement improbable : aucun risque d'écrire à un vrai
 * numéro, et la fiche se retrouve d'un coup d'œil.
 */
const TELEPHONE_DEMO = "+25377000199";

/** Questions telles qu'un parent les écrit réellement, sans ponctuation. */
const QUESTIONS = [
  "bonjour",
  "comment ca se passe",
  "qu est ce qui bloque",
  "comment l aider",
  "des absences",
  "ou en est le plan",
  "ou en est la scolarite",
  "blablabla incomprehensible",
];

async function main() {
  const langue = process.argv.find((a) => a.startsWith("--langue="))?.split("=")[1] ?? "fr";
  // Même traducteur que celui du webhook : le script valide aussi ce chemin.
  const t = await traducteurPour(langue, "learnos.bot");

  if (process.argv.includes("--clean")) {
    await nettoyer();
    return;
  }

  console.log(`\n=== Bot parent — validation (langue : ${langue}) ===\n`);

  // 1. Trouver un parent avec au moins un enfant actif, ou en créer un.
  let parentBrut = await prisma.parent.findFirst({
    where: { enfants: { some: { eleve: { statut: "ACTIF", deletedAt: null } } } },
    select: { phone: true, prenom: true, nom: true, tenantId: true },
  });

  if (!parentBrut) {
    parentBrut = await amorcer();
    if (!parentBrut) {
      console.log("Aucun élève actif en base — rien à valider.");
      return;
    }
    console.log("(parent de démonstration créé — `--clean` pour le retirer)");
  }
  console.log(`Parent : ${parentBrut.prenom} ${parentBrut.nom} (${parentBrut.phone})`);

  // 2. Identification par le numéro, comme le ferait le webhook.
  const parent = await identifierParent(parentBrut.phone);
  if (!parent) {
    console.error("ÉCHEC : le numéro en base n'est pas reconnu par identifierParent.");
    process.exitCode = 1;
    return;
  }
  console.log(`Enfants rattachés : ${parent.enfants.map((e) => e.prenom).join(", ")}\n`);

  // 3. Un numéro inconnu ne doit jamais rien renvoyer.
  const inconnu = await identifierParent("+253770000000");
  console.log(`Numéro inconnu → ${inconnu === null ? "aucune réponse ✓" : "RÉPONSE — ANOMALIE ✗"}\n`);

  // 4. Chaque question, de bout en bout. Le prénom est ajouté dès que le
  // parent a plusieurs enfants — sans lui, la désambiguïsation répondrait à
  // toutes les questions et masquerait ce qu'on veut vérifier.
  const prefixe =
    parent.enfants.length > 1 ? `${parent.enfants[0].prenom} ` : "";
  if (prefixe) {
    console.log(`Fratrie détectée — les questions ciblent ${parent.enfants[0].prenom}.\n`);
    const sansNom = await traiterQuestion(parent, "comment ca se passe", t);
    console.log("--- « comment ca se passe » (sans prénom)");
    console.log(`    │ ${sansNom?.texte}\n`);
  }

  const couvertes = new Set<string>();

  for (const brute of QUESTIONS) {
    const question = `${prefixe}${brute}`;
    const detectee = detecterIntention(question);
    const reponse = await traiterQuestion(parent, question, t);

    console.log(`--- « ${question} »`);
    console.log(`    intention (mots-clés) : ${detectee ?? "aucune → modèle"}`);
    if (!reponse) {
      console.log("    (aucune réponse — parent sans enfant exploitable)\n");
      continue;
    }
    console.log(`    intention retenue : ${reponse.intention}`);
    couvertes.add(reponse.intention);
    if (reponse.modele) console.log(`    modèle sollicité : ${reponse.modele}`);
    console.log(
      reponse.texte
        .split("\n")
        .map((l) => `    │ ${l}`)
        .join("\n")
    );
    console.log();
  }

  // 5. Couverture : chaque intention doit avoir été atteinte par la boucle
  // ci-dessus. Rejouer les questions en parallèle pour la mesurer saturait le
  // pool session (15 connexions), alors que l'information était déjà là.
  const manquantes = INTENTIONS.filter((i) => !couvertes.has(i));
  console.log(
    manquantes.length === 0
      ? "Toutes les intentions ont été atteintes ✓"
      : `Intentions non atteintes par le jeu de questions : ${manquantes.join(", ")}`
  );

  // 6. Détection d'alertes — met en file, n'envoie pas.
  if (process.argv.includes("--alertes")) {
    await validerAlertes(parent.tenantId, parent.enfants[0].id, parent.enfants[0].prenom, langue);
  } else {
    const alertes = await detecterAlertes(parent.tenantId);
    console.log(
      `\nAlertes : ${alertes.detectees} détectée(s), ${alertes.nouvelles} nouvelle(s) mise(s) en file.`
    );
    const enAttente = await prisma.alerteParent.count({
      where: { tenantId: parent.tenantId, statut: "EN_ATTENTE" },
    });
    console.log(
      `File d'attente : ${enAttente} — aucun envoi déclenché.` +
        ` Ajoutez --alertes pour valider la chaîne complète.\n`
    );
  }
}

/**
 * Valide la chaîne d'alerte complète : déclencheur → file → politique → envoi.
 *
 * Fabrique trois absences injustifiées, puis les retire. C'est le seul moyen
 * d'exercer le chemin le plus risqué du dispositif — celui qui écrit à une
 * famille sans qu'elle ait rien demandé.
 *
 * L'envoi WhatsApp est simulé tant qu'aucun jeton n'est configuré : la
 * fonction d'envoi le détecte seule et journalise au lieu d'appeler Meta.
 */
async function validerAlertes(
  tenantId: string,
  eleveId: string,
  prenom: string,
  langue: string
) {
  console.log("\n=== Chaîne d'alerte ===\n");

  // `Absence` ne porte pas de `siteId` : son rattachement passe par l'élève
  // (voir SITE_PATHS dans site-scope.ts).
  const dates = [1, 3, 5].map((j) => new Date(Date.now() - j * 86_400_000));
  await prisma.absence.createMany({
    data: dates.map((date) => ({
      tenantId,
      eleveId,
      date,
      statut: "INJUSTIFIEE" as const,
    })),
  });
  console.log(`3 absences injustifiées fabriquées pour ${prenom}.`);

  try {
    const premier = await detecterAlertes(tenantId);
    console.log(`Passage 1 : ${premier.detectees} détectée(s), ${premier.nouvelles} en file.`);

    // Le cron passe plusieurs fois par jour : le second passage ne doit RIEN
    // ajouter, sinon la famille reçoit un message par passage.
    const second = await detecterAlertes(tenantId);
    console.log(
      `Passage 2 : ${second.detectees} détectée(s), ${second.nouvelles} en file — ` +
        (second.nouvelles === 0 ? "idempotent ✓" : "DOUBLON — ANOMALIE ✗")
    );

    const enFile = await prisma.alerteParent.findMany({
      where: { tenantId, statut: "EN_ATTENTE" },
      select: { niveau: true, cle: true, params: true },
    });
    const tAlertes = await traducteurPour(langue, "learnos.alertes");
    for (const a of enFile) {
      console.log(
        `\n  [${a.niveau}] ${tAlertes(a.cle, (a.params ?? {}) as Record<string, string | number>)}`
      );
    }

    const envoi = await envoyerAlertesEnAttente();
    console.log(
      `\nEnvoi : ${envoi.envoyees} envoyée(s), ${envoi.supprimees} écartée(s), ${envoi.echouees} en échec.`
    );

    // Troisième passage après envoi : toujours rien de neuf.
    const troisieme = await detecterAlertes(tenantId);
    console.log(
      `Passage 3 (après envoi) : ${troisieme.nouvelles} nouvelle(s) — ` +
        (troisieme.nouvelles === 0 ? "pas de relance ✓" : "RELANCE — ANOMALIE ✗")
    );
  } finally {
    // Les absences fabriquées disparaissent quoi qu'il arrive : elles
    // fausseraient l'assiduité réelle de l'élève.
    const { count } = await prisma.absence.deleteMany({
      where: { eleveId, date: { in: dates }, statut: "INJUSTIFIEE" },
    });
    console.log(`\n${count} absence(s) fabriquée(s) retirée(s).\n`);
  }
}

/**
 * Crée un parent de démonstration rattaché à deux élèves actifs.
 *
 * Deux et non un : c'est la fratrie qui fait apparaître le cas le plus
 * délicat — la désambiguïsation. Un seul enfant validerait un chemin qui
 * n'est pas le plus risqué.
 */
async function amorcer() {
  const eleves = await prisma.eleve.findMany({
    where: { statut: "ACTIF", deletedAt: null },
    select: { id: true, tenantId: true, nom: true },
    take: 2,
  });
  if (eleves.length === 0) return null;

  const parent = await prisma.parent.create({
    data: {
      tenantId: eleves[0].tenantId,
      nom: eleves[0].nom,
      prenom: "Fatouma",
      phone: TELEPHONE_DEMO,
      enfants: {
        create: eleves.map((e, i) => ({ eleveId: e.id, isGardien: i === 0 })),
      },
    },
    select: { phone: true, prenom: true, nom: true, tenantId: true },
  });
  return parent;
}

/** Retire le parent de démonstration et ce qu'il a produit. */
async function nettoyer() {
  const parent = await prisma.parent.findFirst({
    where: { phone: TELEPHONE_DEMO },
    select: { id: true },
  });
  if (!parent) {
    console.log("Aucun parent de démonstration à retirer.");
    return;
  }
  // Les échanges et alertes partent en cascade avec la fiche parent ; on les
  // compte avant pour que la sortie dise ce qui a réellement disparu.
  const [echanges, alertes] = await Promise.all([
    prisma.echangeParent.count({ where: { parentId: parent.id } }),
    prisma.alerteParent.count({ where: { parentId: parent.id } }),
  ]);
  await prisma.parent.delete({ where: { id: parent.id } });
  console.log(
    `Parent de démonstration retiré (${echanges} échange(s), ${alertes} alerte(s) en cascade).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
