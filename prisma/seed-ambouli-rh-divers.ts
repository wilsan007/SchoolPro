/**
 * seed-ambouli-rh-divers.ts — RH (absences/congés personnel, remplacements),
 * communication (notifications, conversations, événements), gouvernance (conseils,
 * réunions, résolutions), mentorat, LMS (cours, progressions), inventaire,
 * admissions (candidatures), budget & dépenses, tâches du personnel.
 */

import { PrismaClient, Role, TypeAbsencePersonnel, StatutAbsencePersonnel, TypeConge, StatutConge, StatutRemplacement, CanalNotification, StatutNotification, CibleNotification, ConversationType, ParticipantRole, NiveauCours, StatutCours, TypeContenu, EtatItem, CategorieItem, StatutCandidature, Sexe, LienParente, CategorieBudget, PrioriteTache, StatutTache, Jour } from "@prisma/client";
import { setSeed, randInt, pick, pickSome, chance, dateStr, addDays, addMonths } from "./seed-ambouli-helpers";
import type { RefData } from "./seed-ambouli-ref";
import type { UsersData } from "./seed-ambouli-users";
import type { ClassesData } from "./seed-ambouli-classes";

// Helper pour index de résolution
let _resIndex = 0;
function r_index() { return ++_resIndex; }

export async function seedRhEtDivers(
  prisma: PrismaClient,
  ref: RefData,
  users: UsersData,
  classes: ClassesData,
): Promise<void> {
  setSeed(20241215);
  _resIndex = 0;
  console.log("🌱 [7/12] RH, communication, gouvernance, mentorat, LMS, inventaire, admissions, budget, tâches...");

  // ════════════════════════════════════════════════════════════
  // RH : Absences & congés du personnel, remplacements
  // ════════════════════════════════════════════════════════════
  let absPersCount = 0, congeCount = 0, remplCount = 0;

  for (const site of ["ambouli", "arhiba"] as const) {
    const teachers = users.teachers[site];
    const supervisors = users.allStaffIds.filter(id => id.includes(`supervisor-${site}`));
    const principalId = users.principals[`${site}-coll`];

    for (const t of teachers) {
      // 1-3 absences personnel sur 2 ans
      const nbAbs = randInt(0, 3);
      for (let i = 0; i < nbAbs; i++) {
        await prisma.absencePersonnel.create({
          data: {
            tenantId: ref.tenantId,
            enseignantId: t.enseignantId,
            date: dateStr(2024 + randInt(0, 1), randInt(1, 12), randInt(1, 28)),
            heureDebut: "08:00",
            heureFin: "12:00",
            type: pick([TypeAbsencePersonnel.MALADIE, TypeAbsencePersonnel.ABSENCE, TypeAbsencePersonnel.FORMATION, TypeAbsencePersonnel.RETARD]),
            statut: chance(0.7) ? StatutAbsencePersonnel.JUSTIFIEE : StatutAbsencePersonnel.EN_ATTENTE,
            motif: pick(["Maladie", "Formation continue", "Rendez-vous administratif", "Problème familial"]),
            justificatif: chance(0.5) ? "/docs/justif.pdf" : null,
            saisieParId: pick(supervisors),
          },
        });
        absPersCount++;
      }

      // 0-2 congés sur 2 ans
      if (chance(0.4)) {
        const dateDebut = dateStr(2024 + randInt(0, 1), randInt(1, 12), randInt(1, 28));
        const nbJours = randInt(3, 21);
        await prisma.congePersonnel.create({
          data: {
            tenantId: ref.tenantId,
            enseignantId: t.enseignantId,
            type: pick([TypeConge.ANNUEL, TypeConge.MALADIE, TypeConge.SPECIAL]),
            statut: pick([StatutConge.APPROUVE, StatutConge.TERMINE, StatutConge.DEMANDE]),
            dateDebut,
            dateFin: addDays(dateDebut, nbJours),
            nbJours,
            motif: pick(["Congé annuel", "Congé maladie", "Congé spécial familial"]),
            demandeParId: t.userId,
            approuveParId: principalId,
            approuveAt: chance(0.7) ? addDays(dateDebut, -7) : null,
          },
        });
        congeCount++;
      }
    }

    // Remplacements (5-10 par site)
    const nbRempl = randInt(5, 10);
    for (let i = 0; i < nbRempl; i++) {
      const absent = pick(teachers);
      const remplacant = pick(teachers.filter(t => t.enseignantId !== absent.enseignantId));
      const key = `${site}-2025-2026`;
      const cls = pick(classes.classesBySiteYear[key] || []);
      if (!cls) continue;
      const matCode = pick(["MATH", "FR", "ANG", "PC", "SVT", "HG"]);
      const matiereId = ref.matieres[`${site === "ambouli" ? "AMB" : "ARH"}-${matCode}`];
      if (!matiereId) continue;

      await prisma.remplacementCours.create({
        data: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          classeId: cls.id,
          matiereId,
          enseignantAbsentId: absent.enseignantId,
          enseignantRemplacantId: remplacant.enseignantId,
          date: dateStr(2025, randInt(10, 12), randInt(1, 28)),
          heureDebut: "08:00",
          heureFin: "09:00",
          salle: `Salle ${randInt(101, 203)}`,
          statut: pick([StatutRemplacement.VALIDE, StatutRemplacement.EFFECTUE, StatutRemplacement.PROPOSE]),
          motifAbsence: pick(["Maladie", "Formation", "Absence imprévue"]),
          decideParId: principalId,
        },
      });
      remplCount++;
    }
  }
  console.log(`  ✅ RH: ${absPersCount} absences personnel, ${congeCount} congés, ${remplCount} remplacements`);

  // ════════════════════════════════════════════════════════════
  // Communication : Notifications, Conversations, Événements
  // ════════════════════════════════════════════════════════════
  let notifCount = 0, convCount = 0, eventCount = 0;

  for (const site of ["ambouli", "arhiba"] as const) {
    const principalId = users.principals[`${site}-coll`];
    const siteClasses = classes.classesBySiteYear[`${site}-2025-2026`] || [];
    const teachers = users.teachers[site];

    // Notifications (10 par site)
    const notifDefs = [
      { titre: "Réunion parents-professeurs", cible: CibleNotification.PARENTS, type: "reunion" },
      { titre: "Sortie pédagogique 3ème", cible: CibleNotification.CLASSE, type: "sortie" },
      { titre: "Examens blancs 1er trimestre", cible: CibleNotification.TOUS, type: "examen" },
      { titre: "Conseil de classe 2ème trimestre", cible: CibleNotification.ENSEIGNANTS, type: "conseil_classe" },
      { titre: "Vacances de Noël", cible: CibleNotification.TOUS, type: "vacances" },
      { titre: "Rentrée scolaire 2025-2026", cible: CibleNotification.TOUS, type: "rentree" },
      { titre: "Distribution des bulletins", cible: CibleNotification.PARENTS, type: "bulletin" },
      { titre: "Inscriptions ouvertes 2026-2027", cible: CibleNotification.TOUS, type: "inscription" },
      { titre: "Cantine : menu de la semaine", cible: CibleNotification.ELEVES, type: "cantine" },
      { titre: "Alerte sécurité : circulation", cible: CibleNotification.TOUS, type: "securite" },
    ];
    for (const n of notifDefs) {
      const cls = n.cible === CibleNotification.CLASSE ? pick(siteClasses) : null;
      await prisma.notification.create({
        data: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          titre: n.titre,
          contenu: `Information : ${n.titre}. Plus de détails sur le portail.`,
          canal: pick([CanalNotification.IN_APP, CanalNotification.IN_APP, CanalNotification.EMAIL]),
          statut: StatutNotification.ENVOYEE,
          cible: n.cible,
          classeId: cls?.id,
          niveau: null,
          envoyeParId: principalId,
          nbDestinataires: randInt(50, 600),
          nbDelivres: randInt(40, 580),
          nbLus: randInt(20, 400),
          envoyeeAt: dateStr(2025, randInt(9, 12), randInt(1, 28)),
        },
      });
      notifCount++;
    }

    // Événements avec responsable (prof principal)
    const eventDefs = [
      { titre: "Conseil de classe 1er trimestre", type: "conseil_classe", responsable: principalId },
      { titre: "Réunion pédagogique", type: "reunion", responsable: principalId },
      { titre: "Sortie au Parc National de Day", type: "sortie", responsable: teachers[0]?.userId },
      { titre: "Conseil de classe 2ème trimestre", type: "conseil_classe", responsable: principalId },
      { titre: "Cérémonie de remise des diplômes", type: "ceremonie", responsable: principalId },
      { titre: "Tournoi inter-classes football", type: "sport", responsable: teachers[5]?.userId },
    ];
    for (const e of eventDefs) {
      await prisma.evenement.create({
        data: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          titre: e.titre,
          description: `${e.titre} - Campus ${site === "ambouli" ? "Ambouli" : "Arhiba"}`,
          type: e.type,
          dateDebut: dateStr(2025, randInt(9, 12), randInt(1, 28)),
          dateFin: chance(0.5) ? dateStr(2025, randInt(9, 12), randInt(1, 28)) : null,
          lieu: pick(["Salle de conférence", "Gymnase", "Cour centrale", "CDI"]),
          couleur: pick(["#3b82f6", "#ef4444", "#10b981", "#f59e0b"]),
          cible: "all",
          responsableId: e.responsable,
        },
      });
      eventCount++;
    }

    // Conversations (annonces de classe + parent-enseignant)
    for (const cls of siteClasses.slice(0, 5)) {
      const prof = pick(teachers);
      const conv = await prisma.conversation.create({
        data: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          subject: `Annonces ${cls.nom}`,
          isGroup: true,
          type: ConversationType.CLASS_ANNOUNCEMENT,
          classeId: cls.id,
          createdBy: prof.userId,
          readOnly: true,
        },
      });
      // Ajouter le prof comme admin
      await prisma.conversationParticipant.create({
        data: { conversationId: conv.id, userId: prof.userId, role: ParticipantRole.ADMIN },
      });
      // Quelques messages
      for (let m = 0; m < 3; m++) {
        await prisma.message.create({
          data: {
            conversationId: conv.id,
            senderId: prof.userId,
            content: pick([
              "N'oubliez pas le devoir pour demain.",
              "Révision pour le contrôle de vendredi.",
              "Sortie pédagogique confirmée pour jeudi.",
              "Apportez vos manuels de mathématiques.",
            ]),
            readBy: [],
          },
        });
      }
      convCount++;
    }

    // Conversation parent-enseignant (3 par site)
    for (let i = 0; i < 3; i++) {
      const prof = pick(teachers);
      // Trouver un parent via un élève
      const cls = pick(siteClasses);
      const eleves = classes.elevesByClass[cls.id] || [];
      if (eleves.length === 0) continue;
      const el = pick(eleves);
      const parentInfo = classes.parentsByEleve[el.id]?.[0];
      if (!parentInfo?.userId) continue;

      const conv = await prisma.conversation.create({
        data: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          subject: `Échange sur ${el.prenom} ${el.nom}`,
          isGroup: false,
          type: ConversationType.PARENT_TEACHER,
          createdBy: prof.userId,
        },
      });
      await prisma.conversationParticipant.create({
        data: { conversationId: conv.id, userId: prof.userId, role: ParticipantRole.ADMIN },
      });
      await prisma.conversationParticipant.create({
        data: { conversationId: conv.id, userId: parentInfo.userId, role: ParticipantRole.MEMBER },
      });
      // Messages
      await prisma.message.create({
        data: { conversationId: conv.id, senderId: parentInfo.userId, content: "Bonjour, comment se comporte mon enfant en classe ?", readBy: [] },
      });
      await prisma.message.create({
        data: { conversationId: conv.id, senderId: prof.userId, content: "Bonjour, tout se passe bien, quelques efforts à fournir en mathématiques.", readBy: [] },
      });
      convCount++;
    }
  }
  console.log(`  ✅ Communication: ${notifCount} notifications, ${convCount} conversations, ${eventCount} événements`);

  // ════════════════════════════════════════════════════════════
  // Gouvernance : Conseils, Réunions, Résolutions
  // ════════════════════════════════════════════════════════════
  for (const site of ["ambouli", "arhiba"] as const) {
    const principalId = users.principals[`${site}-coll`];
    const teachers = users.teachers[site];

    // 3 conseils par site
    const conseilDefs = [
      { nom: "Conseil d'administration", type: "ADMINISTRATION", freq: "TRIMESTRIEL" },
      { nom: "Conseil de discipline", type: "DISCIPLINE", freq: "PONCTUEL" },
      { nom: "Conseil pédagogique", type: "PEDAGOGIQUE", freq: "MENSUEL" },
    ];
    for (const cd of conseilDefs) {
      const conseil = await prisma.conseil.create({
        data: {
          tenantId: ref.tenantId,
          nom: `${cd.nom} - ${site}`,
          type: cd.type,
          frequence: cd.freq,
        },
      });
      // Membres
      await prisma.membreConseil.create({
        data: { conseilId: conseil.id, userId: principalId, role: "PRESIDENT", debutMandat: dateStr(2024, 9, 1) },
      });
      for (const t of teachers.slice(0, 3)) {
        await prisma.membreConseil.create({
          data: { conseilId: conseil.id, userId: t.userId, role: "MEMBRE", debutMandat: dateStr(2024, 9, 1) },
        });
      }
      // 2 réunions
      for (let r = 0; r < 2; r++) {
        await prisma.réunion.create({
          data: {
            conseilId: conseil.id,
            titre: `${cd.nom} - Réunion ${r + 1}`,
            date: dateStr(2025, randInt(1, 12), randInt(1, 28)),
            lieu: "Salle de conférence",
            ordreDuJour: "1. Bilan trimestriel\n2. Points disciplinaires\n3. Questions diverses",
            statut: "TERMINEE",
            compteRendu: "Réunion tenue en présence de tous les membres. Décisions adoptées à l'unanimité.",
            presences: { present: 5, absent: 1 },
          },
        });
      }
      // 1 résolution
      await prisma.résolution.create({
        data: {
          tenantId: ref.tenantId,
          conseilId: conseil.id,
          titre: `Résolution ${cd.type} ${r_index()}`,
          description: "Adoption du règlement intérieur modifié",
          statut: "ADOPTÉE",
          dateVote: dateStr(2025, randInt(1, 12), randInt(1, 28)),
          resultats: { pour: 6, contre: 0, abstentions: 1 },
          dateEffet: dateStr(2025, 9, 1),
        },
      });
    }
  }
  console.log(`  ✅ Gouvernance: 6 conseils (3/site), 12 réunions, 6 résolutions`);

  // ════════════════════════════════════════════════════════════
  // Mentorat
  // ════════════════════════════════════════════════════════════
  let mentoratCount = 0;
  for (const site of ["ambouli", "arhiba"] as const) {
    const teachers = users.teachers[site];
    const siteClasses = classes.classesBySiteYear[`${site}-2025-2026`] || [];
    // 5 mentorats par site
    for (let i = 0; i < 5; i++) {
      const mentor = pick(teachers);
      const cls = pick(siteClasses);
      const eleves = classes.elevesByClass[cls.id] || [];
      if (eleves.length === 0) continue;
      const el = pick(eleves);
      // L'élève a-t-il un compte user ? Non dans notre seed. On utilise le prof comme mentore aussi (enseignant junior)
      const mentore = teachers[(teachers.indexOf(mentor) + 1) % teachers.length];

      const mentorat = await prisma.mentorat.create({
        data: {
          tenantId: ref.tenantId,
          mentorId: mentor.userId,
          mentoreId: mentore.userId,
          type: pick(["ACADEMIQUE", "PROFESSIONNEL"]),
          statut: "ACTIF",
          dateDebut: dateStr(2025, 9, 15),
          frequence: pick(["HEBDOMADAIRE", "BIHEBDOMADAIRE", "MENSUEL"]),
          notes: "Accompagnement pédagogique régulier",
        },
      });
      // 2 objectifs
      for (let o = 0; o < 2; o++) {
        await prisma.objectifMentorat.create({
          data: {
            mentoratId: mentorat.id,
            titre: pick(["Améliorer les pratiques pédagogiques", "Maîtriser l'usage du numérique en classe", "Renforcer la gestion de classe"]),
            description: "Objectif à atteindre sur l'année",
            statut: pick(["EN_COURS", "ATTEINT"]),
            priorite: randInt(1, 3),
            dateCible: dateStr(2026, 6, 30),
            progression: randInt(20, 90),
          },
        });
      }
      // 3 séances
      for (let s = 0; s < 3; s++) {
        await prisma.seanceMentorat.create({
          data: {
            mentoratId: mentorat.id,
            date: dateStr(2025, 9 + s * 2, randInt(1, 28)),
            duree: randInt(45, 90),
            statut: "EFFECTUEE",
            compteRendu: "Séance productive. Échanges sur les pratiques en classe.",
            lieu: "Salle des professeurs",
          },
        });
      }
      mentoratCount++;
    }
  }
  console.log(`  ✅ Mentorat: ${mentoratCount} relations (avec objectifs + séances)`);

  // ════════════════════════════════════════════════════════════
  // LMS : Cours + Contenus + Progressions
  // ════════════════════════════════════════════════════════════
  let coursCount = 0, progCount = 0;
  for (const site of ["ambouli", "arhiba"] as const) {
    const teachers = users.teachers[site];
    const coursDefs = [
      { titre: "Les fractions - 5ème", matiere: "Mathématiques", classe: "5ème", auteur: teachers[0]?.userId },
      { titre: "Le passé composé - 4ème", matiere: "Français", classe: "4ème", auteur: teachers[1]?.userId },
      { titre: "L'eau et son environnement - 3ème", matiere: "SVT", classe: "3ème", auteur: teachers[5]?.userId },
      { titre: "Les équations du 1er degré - 3ème", matiere: "Mathématiques", classe: "3ème", auteur: teachers[0]?.userId },
      { titre: "La Révolution Industrielle - 2nde", matiere: "Histoire-Géographie", classe: "2nde", auteur: teachers[3]?.userId },
    ];
    for (const cd of coursDefs) {
      if (!cd.auteur) continue;
      const cours = await prisma.cours.create({
        data: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          titre: `${cd.titre} - ${site}`,
          description: `Cours de ${cd.matiere} pour la classe de ${cd.classe}`,
          niveau: NiveauCours.INTERMEDIAIRE,
          statut: StatutCours.PUBLIE,
          matiereNom: cd.matiere,
          classeNom: cd.classe,
          auteurNom: teachers.find(t => t.userId === cd.auteur)?.specialite || "Enseignant",
          imageUrl: null,
          dureeMin: randInt(45, 90),
          nbVues: randInt(50, 300),
          nbInscrits: randInt(20, 80),
        },
      });
      coursCount++;
      // 3 contenus
      const contenuTypes = [
        { type: TypeContenu.VIDEO, titre: "Vidéo de cours", url: "https://youtube.com/watch?v=demo" },
        { type: TypeContenu.DOCUMENT, titre: "Fiche de cours (PDF)", url: "/docs/cours.pdf" },
        { type: TypeContenu.QUIZ, titre: "Quiz d'évaluation", texte: JSON.stringify({ questions: [{ q: "Question 1", options: ["A", "B", "C"], answer: 0 }] }) },
      ];
      for (let i = 0; i < contenuTypes.length; i++) {
        const ct = contenuTypes[i];
        await prisma.contenuCours.create({
          data: {
            coursId: cours.id,
            titre: ct.titre,
            type: ct.type,
            ordre: i + 1,
            url: ct.url || null,
            texte: ct.texte || null,
            dureeMin: randInt(15, 30),
            isGratuit: true,
          },
        });
      }
      // Progressions pour quelques élèves
      const cls = (classes.classesBySiteYear[`${site}-2025-2026`] || []).find(c => c.niveau === cd.classe.split(" ")[0] || c.nom.includes(cd.classe));
      if (cls) {
        const eleves = classes.elevesByClass[cls.id] || [];
        for (const el of pickSome(eleves, Math.min(10, eleves.length))) {
          await prisma.progressionEleve.create({
            data: {
              tenantId: ref.tenantId,
              coursId: cours.id,
              eleveNom: `${el.prenom} ${el.nom}`,
              eleveId: el.id,
              contenusVus: ["1", "2"],
              pctCompletion: randInt(30, 100),
              noteFinale: chance(0.5) ? randInt(10, 20) : null,
              isTermine: chance(0.4),
              termineeAt: chance(0.4) ? dateStr(2025, 11, randInt(1, 28)) : null,
            },
          }).catch(() => {});
          progCount++;
        }
      }
    }
  }
  console.log(`  ✅ LMS: ${coursCount} cours (avec contenus), ${progCount} progressions`);

  // ════════════════════════════════════════════════════════════
  // Inventaire
  // ════════════════════════════════════════════════════════════
  let invCount = 0;
  const invDefs = [
    { nom: "Ordinateur portable Dell", cat: CategorieItem.INFORMATIQUE, etat: EtatItem.BON, qte: 30, prix: 120000 },
    { nom: "Vidéoprojecteur Epson", cat: CategorieItem.AUDIOVISUEL, etat: EtatItem.BON, qte: 8, prix: 180000 },
    { nom: "Table-banc élève", cat: CategorieItem.MOBILIER, etat: EtatItem.BON, qte: 200, prix: 15000 },
    { nom: "Tableau blanc", cat: CategorieItem.MOBILIER, etat: EtatItem.USE, qte: 22, prix: 25000 },
    { nom: "Ballons de football", cat: CategorieItem.SPORTIF, etat: EtatItem.BON, qte: 15, prix: 3000 },
    { nom: "Manuels de mathématiques", cat: CategorieItem.PEDAGOGIQUE, etat: EtatItem.BON, qte: 300, prix: 2500 },
    { nom: "Extincteur", cat: CategorieItem.SECURITE, etat: EtatItem.NEUF, qte: 12, prix: 8000 },
    { nom: "Microscopes (labo SVT)", cat: CategorieItem.PEDAGOGIQUE, etat: EtatItem.BON, qte: 10, prix: 45000 },
    { nom: "Imprimante laser", cat: CategorieItem.INFORMATIQUE, etat: EtatItem.USE, qte: 4, prix: 35000 },
    { nom: "Climatiseur", cat: CategorieItem.MOBILIER, etat: EtatItem.BON, qte: 15, prix: 80000 },
    { nom: "Kit de chimie", cat: CategorieItem.PEDAGOGIQUE, etat: EtatItem.BON, qte: 5, prix: 60000 },
    { nom: "Caméra de surveillance", cat: CategorieItem.SECURITE, etat: EtatItem.NEUF, qte: 8, prix: 25000 },
    { nom: "Enceintes Bluetooth", cat: CategorieItem.AUDIOVISUEL, etat: EtatItem.BON, qte: 6, prix: 12000 },
    { nom: "Armoires métalliques", cat: CategorieItem.MOBILIER, etat: EtatItem.BON, qte: 20, prix: 35000 },
    { nom: "Tablette graphique", cat: CategorieItem.INFORMATIQUE, etat: EtatItem.NEUF, qte: 5, prix: 40000 },
  ];
  for (const site of ["ambouli", "arhiba"] as const) {
    for (const item of invDefs) {
      await prisma.itemInventaire.create({
        data: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          nom: item.nom,
          description: `${item.nom} - Campus ${site}`,
          reference: `INV-${site.toUpperCase()}-${item.nom.replace(/\s/g, "").slice(0, 8).toUpperCase()}`,
          categorie: item.cat,
          etat: item.etat,
          quantite: item.qte,
          quantiteMin: Math.floor(item.qte * 0.2),
          localisation: pick(["Salle informatique", "Magasin", "Gymnase", "Labo SVT", "Labo Physique", "Salle 101"]),
          fournisseur: pick(["TechnoDjib", "EduSupplies DJ", "Mobilier Plus", "Bureau Pro"]),
          prixUnitaire: item.prix,
          devise: "DJF",
          dateAchat: dateStr(2023 + randInt(0, 2), randInt(1, 12), randInt(1, 28)),
          dateGarantie: dateStr(2025 + randInt(0, 2), randInt(1, 12), randInt(1, 28)),
          dateRevision: chance(0.3) ? dateStr(2026, randInt(1, 12), randInt(1, 28)) : null,
        },
      });
      invCount++;
    }
  }
  console.log(`  ✅ Inventaire: ${invCount} items`);

  // ════════════════════════════════════════════════════════════
  // Admissions : Candidatures 2026-2027
  // ════════════════════════════════════════════════════════════
  let candCount = 0;
  const NOMS_CAND = ["Mahamoud", "Abdillahi", "Amina", "Fatima", "Omar", "Hassan", "Said", "Ibrahim", "Leyla", "Safia", "Aden", "Mariam", "Yacin", "Rachid", "Hawa"];
  for (const site of ["ambouli", "arhiba"] as const) {
    for (let i = 0; i < 8; i++) {
      const prenom = pick(NOMS_CAND);
      const nom = pick(["Farah", "Waberi", "Guelleh", "Djama", "Gouled", "Barkat", "Elmi", "Hersi"]);
      await prisma.candidature.create({
        data: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          nom,
          prenom,
          dateNaissance: dateStr(2013 - randInt(0, 4), randInt(1, 12), randInt(1, 28)),
          lieuNaissance: "Djibouti",
          sexe: chance(0.5) ? Sexe.M : Sexe.F,
          nationalite: "DJ",
          classeVoulue: pick(["6ème", "5ème", "2nde", "1ère S"]),
          annee: "2026-2027",
          parentNom: nom,
          parentPrenom: pick(NOMS_CAND),
          parentEmail: `parent.${nom.toLowerCase()}.${i}@gmail.com`,
          parentPhone: `+253 77 ${randInt(10, 99)} ${randInt(10, 99)} ${randInt(10, 99)}`,
          parentLien: pick([LienParente.PERE, LienParente.MERE]),
          statut: pick([StatutCandidature.SOUMISE, StatutCandidature.EN_EXAMEN, StatutCandidature.ADMIS, StatutCandidature.REFUSE, StatutCandidature.INSCRIT]),
          dateExamen: chance(0.5) ? dateStr(2026, 6, randInt(1, 15)) : null,
          noteExamen: chance(0.3) ? randInt(8, 18) : null,
          commentaire: chance(0.3) ? "Dossier complet" : null,
          motifRefus: chance(0.1) ? "Places disponibles insuffisantes" : null,
          documents: [{ nom: "Bulletin 2024-2025", url: "/docs/bulletin.pdf" }],
        },
      });
      candCount++;
    }
  }
  console.log(`  ✅ Admissions: ${candCount} candidatures 2026-2027`);

  // ════════════════════════════════════════════════════════════
  // Budget & Dépenses
  // ════════════════════════════════════════════════════════════
  let budgetCount = 0, depenseCount = 0;
  const budgetDefs = [
    { cat: CategorieBudget.FONCTIONNEMENT, montant: 5000000, label: "Fonctionnement (eau, électricité, fournitures)" },
    { cat: CategorieBudget.PEDAGOGIE, montant: 2000000, label: "Pédagogie (manuels, matériel didactique)" },
    { cat: CategorieBudget.MAINTENANCE, montant: 1500000, label: "Maintenance (bâtiments, réparations)" },
    { cat: CategorieBudget.SALAIRES, montant: 80000000, label: "Salaires enseignants & personnel" },
    { cat: CategorieBudget.TRANSPORT, montant: 800000, label: "Transport scolaire" },
    { cat: CategorieBudget.CANTINE, montant: 1200000, label: "Cantine scolaire" },
    { cat: CategorieBudget.EVENEMENTIEL, montant: 500000, label: "Événementiel (sorties, cérémonies)" },
    { cat: CategorieBudget.INVESTISSEMENT, montant: 3000000, label: "Investissement (équipements, travaux)" },
  ];
  for (const site of ["ambouli", "arhiba"] as const) {
    const accountantId = users.accountants[site];
    for (const annee of ["2024-2025", "2025-2026"]) {
      for (const bd of budgetDefs) {
        // Variation entre sites pour comparaison
        const variation = site === "ambouli" ? 1.0 : 0.85;
        const montantPrevu = Math.round(bd.montant * variation);
        const montantDepense = Math.round(montantPrevu * (0.7 + Math.random() * 0.4)); // 70-110%
        const statut = montantDepense > montantPrevu ? "DEPASSE" : annee === "2024-2025" ? "CLOTURE" : "VALIDE";

        const budget = await prisma.budget.create({
          data: {
            tenantId: ref.tenantId,
            siteId: ref.sites[site],
            annee,
            categorie: bd.cat,
            montantPrevu,
            montantDepense,
            devise: "DJF",
            statut,
            description: `${bd.label} - ${annee}`,
          },
        });
        budgetCount++;

        // 5-15 dépenses par budget
        const nbDep = randInt(5, 15);
        for (let d = 0; d < nbDep; d++) {
          const montantUnit = Math.round(montantDepense / nbDep * (0.5 + Math.random()));
          await prisma.depense.create({
            data: {
              tenantId: ref.tenantId,
              siteId: ref.sites[site],
              budgetId: budget.id,
              date: dateStr(parseInt(annee.split("-")[0]) + (d >= nbDep / 2 ? 1 : 0), randInt(1, 12), randInt(1, 28)),
              montant: montantUnit,
              devise: "DJF",
              categorie: bd.cat,
              libelle: `${bd.label.split(" ")[0]} - Achat ${d + 1}`,
              description: `Dépense ${bd.cat} - ${site}`,
              methodePaiement: pick(["especes", "cheque", "virement", "mobile_money"]),
              reference: `DEP-${site.toUpperCase()}-${annee.replace(/-/g, "")}-${d + 1}`,
              justificatifUrl: chance(0.6) ? "/docs/justificatif.pdf" : null,
              enregistreParId: accountantId,
            },
          });
          depenseCount++;
        }
      }
    }
  }
  console.log(`  ✅ Budget: ${budgetCount} budgets, ${depenseCount} dépenses`);

  // ════════════════════════════════════════════════════════════
  // Tâches du personnel
  // ════════════════════════════════════════════════════════════
  let tacheCount = 0;
  const tacheTypes = [
    { type: "saisie_notes", titre: "Saisir les notes du contrôle", priorite: PrioriteTache.HAUTE },
    { type: "conseil_classe", titre: "Préparer le conseil de classe", priorite: PrioriteTache.NORMALE },
    { type: "rendez_vous_parent", titre: "Rencontrer les parents de l'élève X", priorite: PrioriteTache.NORMALE },
    { type: "preparation_cours", titre: "Préparer le cours sur les fractions", priorite: PrioriteTache.NORMALE },
    { type: "correction_devoirs", titre: "Corriger les devoirs maison", priorite: PrioriteTache.HAUTE },
    { type: "remise_bulletins", titre: "Finaliser et remettre les bulletins", priorite: PrioriteTache.URGENTE },
    { type: "reunion_pedagogique", titre: "Assister à la réunion pédagogique", priorite: PrioriteTache.NORMALE },
    { type: "sortie_pedagogique", titre: "Organiser la sortie pédagogique", priorite: PrioriteTache.BASSE },
    { type: "inventaire", titre: "Faire l'inventaire du matériel", priorite: PrioriteTache.BASSE },
  ];
  for (const site of ["ambouli", "arhiba"] as const) {
    const teachers = users.teachers[site];
    const principalId = users.principals[`${site}-coll`];
    const siteClasses = classes.classesBySiteYear[`${site}-2025-2026`] || [];

    for (const t of teachers) {
      // 3-6 tâches par enseignant
      const nbTaches = randInt(3, 6);
      for (let i = 0; i < nbTaches; i++) {
        const tt = pick(tacheTypes);
        const cls = pick(siteClasses);
        const matCode = pick(["MATH", "FR", "ANG", "PC", "SVT"]);
        const matiereId = ref.matieres[`${site === "ambouli" ? "AMB" : "ARH"}-${matCode}`];
        const isFaite = chance(0.5);
        await prisma.tache.create({
          data: {
            tenantId: ref.tenantId,
            siteId: ref.sites[site],
            assigneeAId: t.userId,
            creeParId: chance(0.3) ? principalId : t.userId,
            titre: tt.titre,
            description: `${tt.titre} - ${cls.nom}`,
            type: tt.type,
            priorite: tt.priorite,
            statut: isFaite ? StatutTache.FAIT : chance(0.3) ? StatutTache.EN_COURS : StatutTache.A_FAIRE,
            classeId: cls.id,
            matiereId,
            echeance: dateStr(2025, randInt(10, 12), randInt(1, 28)),
            dateFaite: isFaite ? dateStr(2025, randInt(10, 12), randInt(1, 28)) : null,
          },
        });
        tacheCount++;
      }
    }
  }
  console.log(`  ✅ Tâches: ${tacheCount} (assignées au personnel)`);

  // ════════════════════════════════════════════════════════════
  // Règles d'appréciation
  // ════════════════════════════════════════════════════════════
  const reglesAppreciation = [
    { contexte: "NOTE_MATIERE", seuilMin: 16, seuilMax: 20, libelle: "Très bien", ordre: 1 },
    { contexte: "NOTE_MATIERE", seuilMin: 14, seuilMax: 16, libelle: "Bien", ordre: 2 },
    { contexte: "NOTE_MATIERE", seuilMin: 12, seuilMax: 14, libelle: "Assez bien", ordre: 3 },
    { contexte: "NOTE_MATIERE", seuilMin: 10, seuilMax: 12, libelle: "Passable", ordre: 4 },
    { contexte: "NOTE_MATIERE", seuilMin: 8, seuilMax: 10, libelle: "Insuffisant", ordre: 5 },
    { contexte: "NOTE_MATIERE", seuilMin: 0, seuilMax: 8, libelle: "Très insuffisant", ordre: 6 },
    { contexte: "BULLETIN_PERIODE", seuilMin: 16, seuilMax: 20, libelle: "Félicitations", ordre: 1 },
    { contexte: "BULLETIN_PERIODE", seuilMin: 14, seuilMax: 16, libelle: "Encouragements", ordre: 2 },
    { contexte: "BULLETIN_PERIODE", seuilMin: 12, seuilMax: 14, libelle: "Tableau d'honneur", ordre: 3 },
    { contexte: "BULLETIN_PERIODE", seuilMin: 10, seuilMax: 12, libelle: "Satisfaisant", ordre: 4 },
    { contexte: "BULLETIN_PERIODE", seuilMin: 0, seuilMax: 10, libelle: "Avertissement travail", ordre: 5 },
  ];
  for (const r of reglesAppreciation) {
    await prisma.reglesAppreciation.create({
      data: {
        tenantId: ref.tenantId,
        contexte: r.contexte as any,
        seuilMin: r.seuilMin,
        seuilMax: r.seuilMax,
        libelle: r.libelle,
        ordre: r.ordre,
      },
    }).catch(() => {});
  }
  console.log(`  ✅ Règles d'appréciation: ${reglesAppreciation.length}`);

  // ════════════════════════════════════════════════════════════
  // Documents (actes de naissance, photos)
  // ════════════════════════════════════════════════════════════
  let docCount = 0;
  for (const site of ["ambouli", "arhiba"] as const) {
    for (const annee of ["2024-2025", "2025-2026"]) {
      const siteClasses = classes.classesBySiteYear[`${site}-${annee}`] || [];
      for (const cls of siteClasses.slice(0, 5)) { // Limiter pour performance
        const eleves = classes.elevesByClass[cls.id] || [];
        for (const el of pickSome(eleves, 5)) {
          await prisma.document.create({
            data: {
              tenantId: ref.tenantId,
              eleveId: el.id,
              nom: "Acte de naissance",
              type: "acte_naissance",
              url: `/docs/acte-${el.id}.pdf`,
              taille: 245000,
              mimeType: "application/pdf",
            },
          });
          docCount++;
        }
      }
    }
  }
  console.log(`  ✅ Documents: ${docCount}`);

  // ════════════════════════════════════════════════════════════
  // SyncConfig (sauvegarde locale)
  // ════════════════════════════════════════════════════════════
  await prisma.syncConfig.upsert({
    where: { tenantId: ref.tenantId },
    update: {},
    create: {
      tenantId: ref.tenantId,
      serverNick: "PC-Directeur-Abdillahi",
      syncInterval: 60,
      syncEnabled: true,
      apiKey: `sync-key-${ref.tenantId}-${Date.now()}`,
      lastSyncAt: dateStr(2025, 12, 1),
      lastSyncStatus: "SUCCESS",
    },
  });
  console.log(`  ✅ SyncConfig: 1 (sauvegarde locale)`);
}

