/**
 * Démo Ambouli — étape 4 : vie scolaire, finances et paie de la rentrée 2026.
 *
 * CE QUI MANQUAIT
 * L'année 2026-2027 n'avait ni absence, ni incident, ni sanction, ni relance,
 * ni bulletin de paie. Les espaces surveillant, conseiller, comptabilité,
 * direction et RH ouvraient donc sur des écrans vides, et le parent n'avait
 * aucune notification à recevoir.
 *
 * LA LOGIQUE, PAS LE REMPLISSAGE
 * Chaque ligne écrite ici découle d'une autre : un élève souvent absent est
 * un élève en difficulté (`niveauEleve`), ses absences répétées déclenchent un
 * entretien avec le conseiller ; un incident grave produit une sanction ; une
 * facture impayée à l'échéance produit des relances graduées, puis une
 * exclusion pour non-paiement. C'est cette chaîne qui rend la démonstration
 * crédible : on peut dérouler un cas de bout en bout.
 *
 * DÉTERMINISTE ET IDEMPOTENT.
 *
 *   pnpm exec tsx scripts/demo/04-rentree-2026-viescolaire.ts [--dry-run]
 */

import {
  Prisma, PrismaClient, MotifAbsence, StatutAbsence, TypeIncident, StatutIncident,
  TypeSanction, StatutEntretien,
} from "@prisma/client";
import { setSeed, randInt, pick, chance, clamp, gauss } from "../../prisma/seed-ambouli-helpers";
import { niveauEleve } from "./_profil-eleve";
import { recalerDates } from "./_ecriture-massive";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry-run");
/** Ne recaler que ce qui dépend du calendrier, sans repasser par les écritures
 *  déjà faites (cf. la même option dans l'étape 3). */
const CALENDRIER_SEULEMENT = process.argv.includes("--dates-seulement");

const TENANT = "tenant-ambouli";
const ANNEE = "2026-2027";
const RENTREE = new Date(2026, 8, 2, 8, 0, 0);
const FIN_T1 = new Date(2026, 11, 19, 18, 0, 0);

const MOTIFS_INFIRMERIE = ["Maux de tête", "Douleur abdominale", "Blessure au genou", "Malaise, chaleur", "Saignement de nez", "Fièvre"];
const LIEUX = ["Salle de classe", "Cour de récréation", "Couloir", "Gymnase", "Cantine", "Abords de l'établissement"];

function joursOuvres(debut: Date, fin: Date): Date[] {
  const jours: Date[] = [];
  const d = new Date(debut);
  while (d <= fin) {
    if (d.getDay() >= 1 && d.getDay() <= 5) jours.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return jours;
}

async function ecrireParLots<T>(libelle: string, lignes: T[], ecrire: (lot: T[]) => Promise<{ count: number }>) {
  if (lignes.length === 0) return console.log(`${libelle} : rien à écrire`);
  if (DRY) return console.log(`[simulation] ${libelle} : ${lignes.length} ligne(s)`);
  let n = 0;
  for (let i = 0; i < lignes.length; i += 1000) {
    const { count } = await ecrire(lignes.slice(i, i + 1000));
    n += count;
  }
  console.log(`${libelle} : ${n} écrite(s) sur ${lignes.length} proposée(s)`);
}

async function main() {
  if (DRY) console.log("=== SIMULATION — aucune écriture ===");
  setSeed(20260903);

  const jours = joursOuvres(RENTREE, FIN_T1);

  const eleves = await prisma.eleve.findMany({
    where: { tenantId: TENANT, classe: { annee: ANNEE }, deletedAt: null },
    select: {
      id: true, prenom: true, nom: true, siteId: true,
      classe: { select: { id: true, nom: true, profPrincipal: { select: { userId: true } } } },
    },
  });
  console.log(`${eleves.length} élèves inscrits en ${ANNEE}`);

  // Acteurs : chaque écriture porte le nom de qui l'a faite.
  const acteurs = await prisma.user.findMany({
    where: { tenantId: TENANT, role: { in: ["SUPERVISOR", "COUNSELOR", "NURSE", "ACCOUNTANT", "PRINCIPAL", "TENANT_ADMIN", "CAISSIER"] } },
    select: { id: true, role: true },
  });
  const parRole = (r: string) => acteurs.filter((a) => a.role === r).map((a) => a.id);
  const surveillants = parRole("SUPERVISOR");
  const conseillers = parRole("COUNSELOR");
  const infirmiers = parRole("NURSE");
  const comptables = [...parRole("ACCOUNTANT"), ...parRole("CAISSIER")];
  const direction = [...parRole("PRINCIPAL"), ...parRole("TENANT_ADMIN")];

  // ----------------------------------------------------------------
  // 1. Les absences — plus fréquentes chez les élèves en difficulté
  // ----------------------------------------------------------------
  const absences: Prisma.AbsenceCreateManyInput[] = [];
  const absencesParEleve = new Map<string, number>();

  for (const e of eleves) {
    const niveau = niveauEleve(e.id);
    // Entre 0 et ~9 absences sur le trimestre : le décrochage se voit d'abord
    // dans l'assiduité, bien avant les notes.
    const attendu = clamp(gauss(6.5 - niveau * 0.35, 1.6), 0, 10);
    const nb = Math.round(attendu);
    absencesParEleve.set(e.id, nb);

    for (let i = 0; i < nb; i++) {
      const jour = pick(jours);
      const retard = chance(0.35);
      const justifiee = chance(niveau >= 11 ? 0.75 : 0.35);
      const date = new Date(jour);
      date.setHours(8, 0, 0, 0);
      absences.push({
        id: `abs-2026-${e.id}-${i}`,
        tenantId: TENANT,
        eleveId: e.id,
        date,
        heureDebut: retard ? "08:00" : null,
        heureFin: retard ? "08:15" : null,
        isRetard: retard,
        motif: justifiee ? pick([MotifAbsence.MALADIE, MotifAbsence.FAMILIALE, MotifAbsence.TRANSPORT]) : MotifAbsence.INJUSTIFIE,
        statut: justifiee ? StatutAbsence.JUSTIFIEE : StatutAbsence.INJUSTIFIEE,
        commentaire: justifiee ? pick(["Certificat médical fourni", "Mot des parents", "Retard de bus"]) : null,
        saisieParId: e.classe?.profPrincipal?.userId ?? pick(surveillants.length ? surveillants : [null as unknown as string]),
        parentNotifie: !justifiee,
        parentNotifieAt: justifiee ? null : date,
      });
    }
  }
  // La famille de démonstration, elle, doit être vivante dès la rentrée.
  //
  // Les absences sont tirées au hasard sur les soixante-dix-huit jours du
  // trimestre : pour deux enfants qui en comptent trois ou quatre, aucune ne
  // tombe forcément avant la mi-septembre. L'espace parent ouvrirait alors sur
  // « aucune absence » à la date réelle — pour l'enfant dont toute la
  // démonstration dit qu'il décroche. On lui en garantit donc une par mois.
  //
  // Le compte parent est résolu d'abord, puis ses enfants : filtrer en une
  // seule requête à travers deux relations facultatives (élève → parents →
  // parent → utilisateur) ne renvoyait rien, sans erreur — un silence qui
  // laissait l'écran vide sans que personne le voie.
  const parentDeDemo = await prisma.parent.findFirst({
    where: { tenantId: TENANT, user: { email: "admin@cite-ambouli.dj" } },
    select: { id: true },
  });

  const enfantsDeDemo = parentDeDemo
    ? await prisma.eleve.findMany({
        where: { tenantId: TENANT, classe: { annee: ANNEE }, parents: { some: { parentId: parentDeDemo.id } } },
        select: { id: true, prenom: true, classe: { select: { profPrincipal: { select: { userId: true } } } } },
      })
    : [];
  console.log(`famille de démonstration : ${enfantsDeDemo.length} enfant(s) inscrit(s) en ${ANNEE}`);

  for (const enfant of enfantsDeDemo) {
    const fragile = niveauEleve(enfant.id) < 10;
    // Trois jalons : deuxième semaine de cours, mi-octobre, mi-novembre.
    const jalons = [new Date(2026, 8, 10, 8, 0, 0), new Date(2026, 9, 13, 8, 0, 0), new Date(2026, 10, 12, 8, 0, 0)];
    jalons.forEach((date, i) => {
      // L'élève en difficulté accumule les absences injustifiées ; l'autre a un
      // retard excusé. La différence doit se lire dans l'écran du parent.
      absences.push({
        id: `abs-2026-demo-${enfant.id}-${i}`,
        tenantId: TENANT,
        eleveId: enfant.id,
        date,
        heureDebut: fragile ? null : "08:00",
        heureFin: fragile ? null : "08:20",
        isRetard: !fragile,
        motif: fragile ? MotifAbsence.INJUSTIFIE : MotifAbsence.TRANSPORT,
        statut: fragile ? StatutAbsence.INJUSTIFIEE : StatutAbsence.JUSTIFIEE,
        commentaire: fragile ? null : "Retard de bus signalé par la famille",
        saisieParId: enfant.classe?.profPrincipal?.userId ?? null,
        parentNotifie: true,
        parentNotifieAt: date,
      });
    });
  }

  // Ces absences-là sont écrites même en mode « dates seulement » : c'est une
  // correction de contenu, pas un rejeu de ce qui existe déjà.
  await ecrireParLots("absences", absences, (lot) => prisma.absence.createMany({ data: lot, skipDuplicates: true }));

  // ----------------------------------------------------------------
  // 2. Les incidents et leurs sanctions
  // ----------------------------------------------------------------
  // Un incident n'arrive pas au hasard : les élèves les plus absents et les
  // plus en difficulté en concentrent la majorité.
  const candidatsIncident = eleves
    .filter((e) => niveauEleve(e.id) < 11 || (absencesParEleve.get(e.id) ?? 0) >= 6)
    .slice(0, 400);

  const incidents: { id: string; eleveId: string; date: Date; gravite: number; type: TypeIncident }[] = [];
  for (const e of candidatsIncident) {
    if (!chance(0.18)) continue;
    const jour = pick(jours);
    const date = new Date(jour);
    date.setHours(randInt(8, 16), pick([0, 15, 30, 45]), 0, 0);
    const gravite = chance(0.15) ? 3 : chance(0.4) ? 2 : 1;
    const type = gravite === 3
      ? pick([TypeIncident.BAGARRE, TypeIncident.TRICHE, TypeIncident.VANDALISM])
      : pick([TypeIncident.BAVARDAGE, TypeIncident.INSOLENCE, TypeIncident.RETARD, TypeIncident.ABSENTEISME]);
    incidents.push({ id: `inc-2026-${e.id}`, eleveId: e.id, date, gravite, type });
  }

  const lignesIncidents = incidents.map((i) => {
    const resolu = chance(0.6);
    return {
      id: i.id,
      tenantId: TENANT,
      eleveId: i.eleveId,
      rapporteParId: pick(surveillants.length ? surveillants : direction),
      type: i.type,
      statut: resolu ? StatutIncident.RESOLU : StatutIncident.OUVERT,
      gravite: i.gravite,
      description: `Incident ${i.type.toLowerCase()} signalé par la vie scolaire.`,
      lieu: pick(LIEUX),
      date: i.date,
      actionPrise: resolu ? pick(["Entretien avec l'élève et rappel du règlement", "Convocation des responsables légaux", "Travail d'intérêt scolaire"]) : null,
      resoluParId: resolu ? pick(direction.length ? direction : surveillants) : null,
      dateResolution: resolu ? new Date(i.date.getTime() + 2 * 86400000) : null,
    };
  });
  if (!CALENDRIER_SEULEMENT) await ecrireParLots("incidents", lignesIncidents, (lot) => prisma.incident.createMany({ data: lot, skipDuplicates: true }));

  const sanctions = incidents
    .filter((i) => i.gravite >= 2)
    .map((i) => {
      const debut = new Date(i.date.getTime() + 86400000);
      const type = i.gravite === 3
        ? pick([TypeSanction.EXCLUSION_TEMP, TypeSanction.CONVOCATION_PARENTS])
        : pick([TypeSanction.AVERTISSEMENT, TypeSanction.BLAME, TypeSanction.TRAVAUX_INTERET_GENERAL]);
      const duree = type === TypeSanction.EXCLUSION_TEMP ? randInt(1, 3) : 0;
      const fin = new Date(debut.getTime() + duree * 86400000);
      return {
        id: `san-2026-${i.id}`,
        incidentId: i.id,
        type,
        description: `Suite à l'incident du ${debut.toLocaleDateString("fr-FR")}.`,
        dateDebut: debut,
        dateFin: duree ? fin : null,
        parentNotifie: true,
        travailDonne: duree ? "Exercices à rendre au retour" : null,
        dateRetourEffective: duree ? fin : null,
      };
    });
  if (!CALENDRIER_SEULEMENT) await ecrireParLots("sanctions", sanctions, (lot) => prisma.sanction.createMany({ data: lot, skipDuplicates: true }));

  // ----------------------------------------------------------------
  // 3. Le conseiller : les absences répétées appellent un entretien
  // ----------------------------------------------------------------
  const aSuivre = eleves.filter((e) => (absencesParEleve.get(e.id) ?? 0) >= 7).slice(0, 120);
  const entretiens = aSuivre.map((e, i) => {
    // Les premiers entretiens ont lieu dès la deuxième semaine : une veille
    // d'assiduité qui n'agirait qu'en novembre n'aurait rien à montrer en
    // septembre, au moment même où la démonstration commence.
    const jour = jours[Math.min(jours.length - 1, 6 + (i % 50))];
    const date = new Date(jour);
    date.setHours(randInt(9, 16), 0, 0, 0);
    const passe = chance(0.7);
    return {
      id: `ent-2026-${e.id}`,
      tenantId: TENANT,
      siteId: e.siteId,
      eleveId: e.id,
      conseillerId: conseillers.length ? pick(conseillers) : null,
      date,
      motif: "Absences répétées — veille assiduité",
      compteRendu: passe ? "L'élève évoque des difficultés de transport et un contexte familial tendu." : null,
      decisions: passe ? "Point hebdomadaire avec le professeur principal ; information de la famille." : null,
      statut: passe ? StatutEntretien.REALISE : StatutEntretien.PLANIFIE,
      prochainRendezVous: passe ? new Date(date.getTime() + 21 * 86400000) : null,
    };
  });
  await ecrireParLots("entretiens conseiller", entretiens, (lot) => prisma.entretienConseiller.createMany({ data: lot, skipDuplicates: true }));

  // Même raison que pour les évaluations : les identifiants sont calculés, donc
  // une exécution antérieure fige la date. On recale les entretiens déjà posés.
  if (!DRY) {
    let recales = 0;
    for (const e of entretiens) {
      const existant = await prisma.entretienConseiller.findUnique({ where: { id: e.id }, select: { date: true } });
      if (!existant || existant.date.getTime() === e.date.getTime()) continue;
      await prisma.entretienConseiller.update({ where: { id: e.id }, data: { date: e.date } });
      recales++;
    }
    if (recales > 0) console.log(`entretiens : ${recales} recalé(s)`);
  }

  // ----------------------------------------------------------------
  // 4. L'infirmerie
  // ----------------------------------------------------------------
  const passages = eleves
    .filter(() => chance(0.09))
    .map((e, i) => {
      const jour = pick(jours);
      const date = new Date(jour);
      date.setHours(randInt(8, 16), pick([0, 20, 40]), 0, 0);
      const renvoi = chance(0.18);
      return {
        id: `inf-2026-${e.id}-${i}`,
        tenantId: TENANT,
        siteId: e.siteId,
        eleveId: e.id,
        date,
        motif: pick(MOTIFS_INFIRMERIE),
        soin: pick(["Repos et hydratation", "Désinfection et pansement", "Paracétamol (accord familial)", "Surveillance 20 minutes"]),
        suite: renvoi ? "renvoi_domicile" : "retour_en_cours",
        retourCours: !renvoi,
        dureeMin: randInt(10, 60),
        infirmierId: infirmiers.length ? pick(infirmiers) : null,
      };
    });
  if (!CALENDRIER_SEULEMENT) await ecrireParLots("passages à l'infirmerie", passages, (lot) => prisma.passageInfirmerie.createMany({ data: lot, skipDuplicates: true }));

  // ----------------------------------------------------------------
  // 5. Les encaissements de rentrée
  // ----------------------------------------------------------------
  // Les factures de 2026-2027 existent déjà ; 798 sont marquées payées sans
  // qu'aucun paiement ne les justifie — une facture payée sans encaissement
  // est un trou dans la caisse. On écrit les encaissements manquants, puis on
  // fait vivre le recouvrement des autres.
  const factures = await prisma.facture.findMany({
    where: { tenantId: TENANT, annee: { libelle: ANNEE } },
    select: { id: true, eleveId: true, montant: true, statut: true, echeance: true, paiements: { select: { id: true } } },
  });

  const paiements: Prisma.PaiementCreateManyInput[] = [];
  const relances: Prisma.RelanceCreateManyInput[] = [];
  const METHODES = ["espèces", "waffi", "cac_pay", "dahab_plus", "saba_pay", "virement"];
  let majPayees = 0;

  for (const f of factures) {
    if (f.statut === "PAYEE" && f.paiements.length === 0) {
      const date = new Date(2026, 8, randInt(2, 29), randInt(8, 16), 0, 0);
      paiements.push({
        id: `pay-2026-${f.id}`,
        factureId: f.id,
        montant: f.montant,
        devise: "DJF",
        methode: pick(METHODES),
        reference: `REC-2026-${f.id.slice(-6)}`,
        date,
        dateSaisie: date,
        enregistreParId: comptables.length ? pick(comptables) : null,
      });
      continue;
    }

    // « En attente » ET « en retard » : une facture passée en retard est
    // précisément celle que l'on relance. Ne retenir que « en attente » rendait
    // le script non rejouable — au second passage, les factures avaient changé
    // de statut, plus aucune relance n'était proposée, et l'écran de
    // recouvrement restait vide alors que les impayés, eux, étaient bien là.
    if (f.statut !== "EN_ATTENTE" && f.statut !== "EN_RETARD") continue;

    // Un tiers des familles règle avec retard mais règle : sans cela, le
    // recouvrement n'aurait pas d'issue heureuse à montrer.
    if (chance(0.35)) {
      const date = new Date(2026, 9, randInt(1, 28), randInt(8, 16), 0, 0);
      paiements.push({
        id: `pay-2026-${f.id}`,
        factureId: f.id,
        montant: f.montant,
        devise: "DJF",
        methode: pick(METHODES),
        reference: `REC-2026-${f.id.slice(-6)}`,
        date,
        dateSaisie: date,
        enregistreParId: comptables.length ? pick(comptables) : null,
      });
      majPayees++;
      continue;
    }

    // Les autres entrent dans le circuit de relance, gradué dans le temps.
    //
    // La relance part quinze jours après l'ÉCHÉANCE de la facture, pas à une
    // date fixe du calendrier : une facture exigible au 10 août encore
    // impayée à la mi-septembre aurait déjà été relancée deux fois. Caler les
    // relances sur octobre laissait l'écran de recouvrement vide pendant tout
    // le mois de septembre — et donnait à voir un établissement qui ne
    // réclame rien.
    const niveaux = chance(0.35) ? 3 : chance(0.5) ? 2 : 1;
    const base = f.echeance ?? new Date(2026, 8, 30);
    for (let n = 1; n <= niveaux; n++) {
      const envoi = new Date(base);
      envoi.setDate(envoi.getDate() + n * 15);
      envoi.setHours(9, 0, 0, 0);
      relances.push({
        id: `rel-2026-${f.id}-${n}`,
        tenantId: TENANT,
        factureId: f.id,
        niveau: n,
        canal: n === 1 ? "sms" : n === 2 ? "whatsapp" : "courrier",
        message:
          n === 1
            ? "Rappel : la facture d'inscription 2026-2027 arrive à échéance."
            : n === 2
              ? "Deuxième relance : merci de régulariser la situation sous 15 jours."
              : "Troisième relance : sans règlement, l'accès aux cours sera suspendu.",
        envoyeeParId: comptables.length ? pick(comptables) : null,
        envoyeeLe: envoi,
      });
    }
  }

  if (!CALENDRIER_SEULEMENT) await ecrireParLots("encaissements", paiements, (lot) => prisma.paiement.createMany({ data: lot, skipDuplicates: true }));
  if (!CALENDRIER_SEULEMENT) await ecrireParLots("relances", relances, (lot) => prisma.relance.createMany({ data: lot, skipDuplicates: true }));

  // Les factures réglées en octobre passent à PAYEE ; celles qui restent
  // impayées après l'échéance passent EN_RETARD — sinon « impayés » reste à
  // zéro alors que les relances partent.
  if (!DRY) {
    const idsPayees = paiements.map((p) => (p as { factureId: string }).factureId);
    for (let i = 0; i < idsPayees.length; i += 500) {
      await prisma.facture.updateMany({
        where: { id: { in: idsPayees.slice(i, i + 500) }, statut: "EN_ATTENTE" },
        data: { statut: "PAYEE" },
      });
    }
    const { count } = await prisma.facture.updateMany({
      where: { tenantId: TENANT, annee: { libelle: ANNEE }, statut: "EN_ATTENTE", echeance: { lt: new Date(2026, 9, 1) } },
      data: { statut: "EN_RETARD" },
    });
    console.log(`factures : ${majPayees} réglées en octobre, ${count} passées en retard`);
  }

  // ----------------------------------------------------------------
  // 6. Les exclusions pour non-paiement
  // ----------------------------------------------------------------
  const troisRelances = relances.filter((r) => (r as { niveau: number }).niveau === 3) as { factureId: string }[];
  const facturesRelancees = new Map(factures.map((f) => [f.id, f.eleveId]));
  const exclusions = troisRelances.slice(0, 40).map((r, i) => {
    const debut = new Date(2026, 10, 10 + (i % 15), 8, 0, 0);
    const levee = chance(0.5);
    return {
      id: `exc-2026-${r.factureId}`,
      tenantId: TENANT,
      eleveId: facturesRelancees.get(r.factureId)!,
      motif: "NON_PAIEMENT_REPETE",
      details: "Trois relances restées sans réponse.",
      dateDebut: debut,
      dateFin: levee ? new Date(debut.getTime() + 5 * 86400000) : null,
      decideeParId: direction.length ? pick(direction) : null,
      leveeParId: levee && direction.length ? pick(direction) : null,
      leveeLe: levee ? new Date(debut.getTime() + 5 * 86400000) : null,
    };
  });
  if (!CALENDRIER_SEULEMENT) await ecrireParLots("exclusions pour non-paiement", exclusions, (lot) => prisma.exclusionEleve.createMany({ data: lot, skipDuplicates: true }));

  // ----------------------------------------------------------------
  // 7. La paie et les absences du personnel
  // ----------------------------------------------------------------
  const fiches = await prisma.ficheRH.findMany({
    where: { tenantId: TENANT },
    select: { id: true, salaireBase: true, enseignantId: true },
  });

  const paies: Prisma.BulletinPaieCreateManyInput[] = [];
  for (const f of fiches) {
    // Juillet et août compris : le personnel est payé pendant les vacances, et
    // la démonstration placée au 16 août doit trouver une paie récente.
    for (const mois of [7, 8, 9, 10, 11]) {
      const primes = randInt(0, 20000);
      const deductions = randInt(0, 8000);
      const base = f.salaireBase ?? 250000;
      paies.push({
        id: `bp-${f.id}-2026${String(mois).padStart(2, "0")}`,
        ficheRHId: f.id,
        mois,
        annee: 2026,
        heuresEffectuees: randInt(140, 175),
        salaireBase: base,
        primes,
        deductions,
        netAPayer: base + primes - deductions,
        isPaye: true,
        datePaiement: new Date(2026, mois - 1, 28, 9, 0, 0),
        reference: `VIR-2026${String(mois).padStart(2, "0")}-${f.id.split("-").pop()}`,
      });
    }
  }
  await ecrireParLots("bulletins de paie", paies, (lot) => prisma.bulletinPaie.createMany({ data: lot, skipDuplicates: true }));

  const enseignants = await prisma.enseignant.findMany({ where: { tenantId: TENANT }, select: { id: true } });
  const absPerso = enseignants
    .filter(() => chance(0.3))
    .map((e, i) => {
      const jour = pick(jours);
      return {
        id: `absp-2026-${e.id}-${i}`,
        tenantId: TENANT,
        enseignantId: e.id,
        date: jour,
        motif: pick(["Maladie", "Convocation administrative", "Formation", "Raison familiale"]),
        statut: chance(0.8) ? "JUSTIFIEE" : "EN_ATTENTE",
        justificatif: chance(0.6) ? "Certificat transmis au secrétariat" : null,
      } as const;
    });
  await ecrireParLots("absences du personnel", absPerso, (lot) => prisma.absencePersonnel.createMany({ data: lot, skipDuplicates: true }));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
