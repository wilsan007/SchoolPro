import prisma from "@/lib/prisma";
import type { SessionSiteClaims } from "@/lib/site-scope";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCourante } from "@/lib/annee-scolaire";

/**
 * Activity Feed — actions réelles des acteurs de l'établissement.
 *
 * Contrairement à l'ancien feed (lecture des createdAt des enregistrements
 * back-office), ce feed s'appuie sur les champs d'acteur (saisieParId,
 * enregistreParId, createdById, auteurId, approuveParId, etc.) pour montrer
 * ce que chaque utilisateur a réellement fait. Les actions sans acteur
 * identifié sont volontairement filtrées.
 *
 * Le feed est volontairement limité à 50 items par période : au-delà, la
 * timeline devient une liste de logs, pas un tableau de bord.
 */

export type Periode = "aujourdhui" | "semaine" | "mois" | "recent";

export type ActivityType =
  | "saisie_absence"
  | "saisie_note"
  | "rapport_incident"
  | "resolution_incident"
  | "classement_incident"
  | "reintegration_sanction"
  | "facture"
  | "paiement"
  | "depense"
  | "conge_demande"
  | "conge_approbation"
  | "inscription"
  | "bulletin_genere"
  | "bulletin_publie"
  | "bulletin_modifie"
  | "bulletin_verrouille"
  | "passage_infirmerie"
  | "entretien"
  | "communication"
  | "seance_commentaire"
  | "audit";

export interface ActivityActeur {
  id: string;
  nom: string;
  role: string;
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  titre: string;
  description?: string;
  date: Date;
  href: string;
  acteur?: ActivityActeur | null;
}

interface AnneeFeed {
  id: string | null;
  libelle: string | null;
  dateDebut: Date | null;
  dateFin: Date | null;
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  TENANT_ADMIN: "Directeur",
  PRINCIPAL: "Chef d'établissement",
  SECRETARY: "Secrétariat",
  TEACHER: "Enseignant",
  CLASS_TEACHER: "Prof. principal",
  COUNSELOR: "Conseiller / CPE",
  NURSE: "Infirmier·ère",
  ACCOUNTANT: "Comptable",
  CAISSIER: "Caissier",
  SUPERVISOR: "Surveillant",
  SUBJECT_LEAD: "Coord. matière",
  SITE_MANAGER: "Responsable site",
  INSPECTOR: "Inspecteur",
  PARENT: "Parent",
  STUDENT: "Élève",
};

function debutPeriode(periode: Periode, now: Date): Date | null {
  if (periode === "recent") return null;
  const d = new Date(now);
  if (periode === "aujourdhui") {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (periode === "semaine") {
    const jour = d.getDay();
    const delta = jour === 0 ? 6 : jour - 1;
    d.setDate(d.getDate() - delta);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (periode === "mois") {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

function formatRole(role?: string | null): string {
  if (!role) return "Utilisateur";
  return ROLE_LABELS[role] ?? role;
}

function collecteActeurs(
  items: { acteurId: string | null; nom?: string | null; role?: string | null }[]
): Set<string> {
  const ids = new Set<string>();
  for (const i of items) {
    if (i.acteurId && !i.nom) ids.add(i.acteurId);
  }
  return ids;
}

function grouperParCle<K, T>(items: T[], cle: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = cle(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

function cleJour(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Requête principale
// ─────────────────────────────────────────────────────────────────────────────

export async function getActivityFeed(
  tenantId: string,
  claims: SessionSiteClaims,
  periode: Periode,
  now: Date = new Date(),
  anneeIdPasse?: string | null,
  anneeLibellePasse?: string | null,
  anneeDateDebutPasse?: Date | null,
  anneeDateFinPasse?: Date | null
): Promise<ActivityItem[]> {
  const debut = debutPeriode(periode, now);
  const limite = periode === "recent" ? 15 : 50;
  const filtreDate = debut ? { gte: debut } : undefined;

  let annee: AnneeFeed;
  if (
    anneeIdPasse !== undefined &&
    anneeLibellePasse !== undefined &&
    anneeDateDebutPasse !== undefined &&
    anneeDateFinPasse !== undefined
  ) {
    annee = {
      id: anneeIdPasse,
      libelle: anneeLibellePasse,
      dateDebut: anneeDateDebutPasse,
      dateFin: anneeDateFinPasse,
    };
  } else if (anneeLibellePasse !== undefined && anneeIdPasse !== undefined) {
    const complete = await getAnneeCourante(tenantId);
    annee = {
      id: anneeIdPasse,
      libelle: anneeLibellePasse,
      dateDebut: complete?.dateDebut ?? null,
      dateFin: complete?.dateFin ?? null,
    };
  } else {
    const complete = await getAnneeCourante(tenantId);
    annee = {
      id: complete?.id ?? null,
      libelle: complete?.libelle ?? null,
      dateDebut: complete?.dateDebut ?? null,
      dateFin: complete?.dateFin ?? null,
    };
  }

  const anneeId = annee.id;
  const anneeLibelle = annee.libelle;
  const anneeDateDebut = annee.dateDebut;
  const anneeDateFin = annee.dateFin;

  const filtreAnneeString = anneeLibelle ? { annee: anneeLibelle } : {};
  const filtreFactureAnnee = anneeId ? { anneeId } : {};

  // Batches séquentiels pour rester sous la limite du pool de connexions.
  // Chaque batch lance 2-3 requêtes Prisma en parallèle.

  // Batch 1 — Inscription + Bulletins
  const [inscriptionEvents, bulletinsHistorique] = await Promise.all([
    prisma.inscriptionHistorique.findMany({
      where: {
        tenantId,
        auteurId: { not: null },
        ...(filtreDate ? { createdAt: filtreDate } : {}),
        ...siteFilterForModel("inscriptionHistorique", claims),
        candidature: filtreAnneeString,
      },
      select: {
        id: true,
        createdAt: true,
        type: true,
        auteurId: true,
        auteurNom: true,
        description: true,
        candidature: { select: { id: true, prenom: true, nom: true, annee: true, classeVoulue: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
    prisma.bulletinHistorique.findMany({
      where: {
        tenantId,
        auteurId: { not: null },
        ...(filtreDate ? { createdAt: filtreDate } : {}),
        ...siteFilterForModel("bulletinHistorique", claims),
        bulletin: { eleve: { classe: { annee: anneeLibelle ?? undefined } } },
      },
      select: {
        id: true,
        createdAt: true,
        action: true,
        auteurId: true,
        auteurNom: true,
        auteurRole: true,
        bulletin: { select: { eleve: { select: { prenom: true, nom: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
  ]);

  // Batch 2 — Notes + Absences
  const [notes, absences] = await Promise.all([
    prisma.note.findMany({
      where: {
        tenantId,
        saisieParId: { not: null },
        ...(filtreDate ? { createdAt: filtreDate } : {}),
        ...siteFilterForModel("note", claims),
        classe: { annee: anneeLibelle ?? undefined },
      },
      select: {
        id: true,
        createdAt: true,
        saisieParId: true,
        intitule: true,
        matiereId: true,
        classeId: true,
        periodeId: true,
        evaluationId: true,
        matiere: { select: { nom: true } },
        classe: { select: { nom: true } },
        periode: { select: { nom: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
    prisma.absence.findMany({
      where: {
        tenantId,
        saisieParId: { not: null },
        ...(filtreDate ? { createdAt: filtreDate } : {}),
        ...siteFilterForModel("absence", claims),
        eleve: { classe: { annee: anneeLibelle ?? undefined } },
      },
      select: {
        id: true,
        createdAt: true,
        saisieParId: true,
        isRetard: true,
        statut: true,
        eleve: { select: { prenom: true, nom: true, classe: { select: { nom: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
  ]);

  // Batch 3 — Incidents + Sanctions
  const [incidentsRapportes, incidentsResolus, incidentsClasses, sanctionsReintegrees] =
    await Promise.all([
      prisma.incident.findMany({
        where: {
          tenantId,
          rapporteParId: { not: null },
          ...(filtreDate ? { createdAt: filtreDate } : {}),
          ...siteFilterForModel("incident", claims),
          eleve: { classe: { annee: anneeLibelle ?? undefined } },
        },
        select: {
          id: true,
          createdAt: true,
          rapporteParId: true,
          type: true,
          gravite: true,
          eleve: { select: { prenom: true, nom: true, classe: { select: { nom: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: limite,
      }),
      prisma.incident.findMany({
        where: {
          tenantId,
          resoluParId: { not: null },
          dateResolution: filtreDate ?? undefined,
          ...siteFilterForModel("incident", claims),
          eleve: { classe: { annee: anneeLibelle ?? undefined } },
        },
        select: {
          id: true,
          dateResolution: true,
          resoluParId: true,
          type: true,
          actionPrise: true,
          eleve: { select: { prenom: true, nom: true } },
        },
        orderBy: { dateResolution: "desc" },
        take: limite,
      }),
      prisma.incident.findMany({
        where: {
          tenantId,
          classeParId: { not: null },
          dateClassement: filtreDate ?? undefined,
          ...siteFilterForModel("incident", claims),
          eleve: { classe: { annee: anneeLibelle ?? undefined } },
        },
        select: {
          id: true,
          dateClassement: true,
          classeParId: true,
          type: true,
          motifClassement: true,
          eleve: { select: { prenom: true, nom: true } },
        },
        orderBy: { dateClassement: "desc" },
        take: limite,
      }),
      prisma.sanction.findMany({
        where: {
          reintegreParId: { not: null },
          dateRetourEffective: filtreDate ?? undefined,
          ...siteFilterForModel("sanction", claims),
          incident: {
            eleve: { classe: { annee: anneeLibelle ?? undefined } },
          },
        },
        select: {
          id: true,
          dateRetourEffective: true,
          reintegreParId: true,
          incident: { select: { eleve: { select: { prenom: true, nom: true } } } },
        },
        orderBy: { dateRetourEffective: "desc" },
        take: limite,
      }),
    ]);

  // Batch 4 — Finance (Paiements + Factures + Dépenses)
  const [paiements, factures, depenses] = await Promise.all([
    prisma.paiement.findMany({
      where: {
        enregistreParId: { not: null },
        ...(filtreDate ? { dateSaisie: filtreDate } : {}),
        facture: { tenantId, ...filtreFactureAnnee, ...siteFilterForModel("facture", claims) },
      },
      select: {
        id: true,
        dateSaisie: true,
        enregistreParId: true,
        montant: true,
        devise: true,
        methode: true,
        facture: { select: { numero: true, eleve: { select: { prenom: true, nom: true } } } },
      },
      orderBy: { dateSaisie: "desc" },
      take: limite,
    }),
    prisma.facture.findMany({
      where: {
        tenantId,
        createdById: { not: null },
        ...(filtreDate ? { createdAt: filtreDate } : {}),
        ...siteFilterForModel("facture", claims),
        ...filtreFactureAnnee,
      },
      select: {
        id: true,
        createdAt: true,
        createdById: true,
        numero: true,
        montant: true,
        devise: true,
        type: true,
        eleve: { select: { prenom: true, nom: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
    prisma.depense.findMany({
      where: {
        tenantId,
        enregistreParId: { not: null },
        ...(filtreDate ? { createdAt: filtreDate } : {}),
        ...siteFilterForModel("depense", claims),
      },
      select: {
        id: true,
        createdAt: true,
        enregistreParId: true,
        montant: true,
        devise: true,
        libelle: true,
        categorie: true,
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
  ]);

  // Batch 5 — RH (Congés)
  const [congesDemandes, congesApprouves] = await Promise.all([
    prisma.congePersonnel.findMany({
      where: {
        tenantId,
        demandeParId: { not: null },
        ...(filtreDate ? { createdAt: filtreDate } : {}),
        ...siteFilterForModel("congePersonnel", claims),
      },
      select: {
        id: true,
        createdAt: true,
        demandeParId: true,
        type: true,
        nbJours: true,
        enseignant: { select: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
    prisma.congePersonnel.findMany({
      where: {
        tenantId,
        approuveParId: { not: null },
        approuveAt: filtreDate ?? undefined,
        ...siteFilterForModel("congePersonnel", claims),
      },
      select: {
        id: true,
        approuveAt: true,
        approuveParId: true,
        type: true,
        nbJours: true,
        enseignant: { select: { user: { select: { name: true } } } },
      },
      orderBy: { approuveAt: "desc" },
      take: limite,
    }),
  ]);

  // Batch 6 — Santé + Conseil + Communication
  const [passagesInfirmerie, entretiensConseil, notifications] = await Promise.all([
    prisma.passageInfirmerie.findMany({
      where: {
        tenantId,
        infirmierId: { not: null },
        ...(filtreDate ? { createdAt: filtreDate } : {}),
        ...siteFilterForModel("passageInfirmerie", claims),
        eleve: { classe: { annee: anneeLibelle ?? undefined } },
      },
      select: {
        id: true,
        createdAt: true,
        infirmierId: true,
        motif: true,
        eleve: { select: { prenom: true, nom: true, classe: { select: { nom: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
    prisma.entretienConseiller.findMany({
      where: {
        tenantId,
        conseillerId: { not: null },
        ...(filtreDate ? { createdAt: filtreDate } : {}),
        ...siteFilterForModel("entretienConseiller", claims),
        eleve: { classe: { annee: anneeLibelle ?? undefined } },
      },
      select: {
        id: true,
        createdAt: true,
        conseillerId: true,
        motif: true,
        eleve: { select: { prenom: true, nom: true, classe: { select: { nom: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
    prisma.notification.findMany({
      where: {
        tenantId,
        envoyeParId: { not: null },
        envoyeeAt: filtreDate ?? undefined,
        ...siteFilterForModel("notification", claims),
      },
      select: {
        id: true,
        envoyeeAt: true,
        envoyeParId: true,
        titre: true,
        canal: true,
        nbDestinataires: true,
      },
      orderBy: { envoyeeAt: "desc" },
      take: limite,
    }),
  ]);

  // Batch 7 — Commentaires de séance + Audit
  const [seanceCommentaires, audits] = await Promise.all([
    prisma.seanceCommentaire.findMany({
      where: {
        auteurId: { not: null },
        ...(filtreDate ? { createdAt: filtreDate } : {}),
        seance: {
          tenantId,
          ...(anneeDateDebut && anneeDateFin
            ? { date: { gte: anneeDateDebut, lte: anneeDateFin } }
            : {}),
          ...siteFilterForModel("seancePedagogique", claims),
        },
      },
      select: {
        id: true,
        createdAt: true,
        auteurId: true,
        seance: {
          select: { date: true, matiere: { select: { nom: true } }, classe: { select: { nom: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId,
        userId: { not: null },
        verdict: "ALLOWED",
        ...(filtreDate ? { createdAt: filtreDate } : {}),
      },
      select: { id: true, createdAt: true, userId: true, action: true, resource: true },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
  ]);

  // ──────────────────────────────────────────────────────────────────────────
  // Normalisation en items partiels avec acteurId
  // ──────────────────────────────────────────────────────────────────────────

  type PartialItem = {
    id: string;
    type: ActivityType;
    titre: string;
    description?: string;
    date: Date;
    href: string;
    acteurId: string;
    nom?: string | null;
    role?: string | null;
  };

  const partials: PartialItem[] = [];

  // Inscription
  for (const i of inscriptionEvents) {
    if (!i.auteurId) continue;
    const type = "inscription";
    const action =
      i.type === "VALIDATION_DOSSIER"
        ? "a validé un dossier d'inscription"
        : i.type === "CLOTURE_DOSSIER"
          ? "a clôturé un dossier d'inscription"
          : "a traité un dossier d'inscription";
    partials.push({
      id: `inscription-${i.id}`,
      type,
      titre: action,
      description: `${i.candidature?.prenom ?? ""} ${i.candidature?.nom ?? ""} · ${i.candidature?.classeVoulue ?? ""}`.trim() || i.description,
      date: i.createdAt,
      href: i.candidature?.id ? `/admissions/${i.candidature.id}` : "/admissions",
      acteurId: i.auteurId,
      nom: i.auteurNom,
    });
  }

  // Bulletins (agrégation par action + auteur + heure)
  const bulletinGroups = grouperParCle(
    bulletinsHistorique.filter((b) => b.auteurId),
    (b) => `${b.auteurId}|${b.action}|${cleJour(b.createdAt)}`
  );
  for (const [, group] of bulletinGroups) {
    const first = group[0];
    if (!first || !first.auteurId) continue;
    const type: ActivityType =
      first.action === "GENERER"
        ? "bulletin_genere"
        : first.action === "PUBLIER"
          ? "bulletin_publie"
          : first.action === "VERROUILLER"
            ? "bulletin_verrouille"
            : "bulletin_modifie";
    const action =
      type === "bulletin_genere"
        ? "a généré des bulletins"
        : type === "bulletin_publie"
          ? "a publié des bulletins"
          : type === "bulletin_verrouille"
            ? "a verrouillé des bulletins"
            : "a modifié des bulletins";
    partials.push({
      id: `bulletin-${first.id}`,
      type,
      titre: action,
      description: `${group.length} bulletin${group.length > 1 ? "s" : ""}`,
      date: first.createdAt,
      href: "/bulletins",
      acteurId: first.auteurId,
      nom: first.auteurNom,
      role: first.auteurRole,
    });
  }

  // Notes (agrégation par auteur + matière + classe + période + jour)
  const notesAvecActeur = notes.filter((n) => n.saisieParId);
  const noteGroups = grouperParCle(
    notesAvecActeur,
    (n) => `${n.saisieParId}|${n.matiereId ?? n.matiere?.nom ?? ""}|${n.classeId ?? n.classe?.nom ?? ""}|${n.periodeId ?? "-"}|${cleJour(n.createdAt)}`
  );
  for (const [, group] of noteGroups) {
    const first = group[0];
    if (!first || !first.saisieParId) continue;
    const matiere = first.matiere?.nom ?? "";
    const classe = first.classe?.nom ?? "";
    const periode = first.periode?.nom ?? "";
    partials.push({
      id: `note-${first.id}`,
      type: "saisie_note",
      titre: "a saisi des notes",
      description: [matiere, classe, periode, `${group.length} note${group.length > 1 ? "s" : ""}`]
        .filter(Boolean)
        .join(" · "),
      date: first.createdAt,
      href: first.evaluationId ? `/evaluations/${first.evaluationId}` : "/notes",
      acteurId: first.saisieParId,
    });
  }

  // Absences
  for (const a of absences) {
    if (!a.saisieParId) continue;
    partials.push({
      id: `abs-${a.id}`,
      type: "saisie_absence",
      titre: `a saisi un ${a.isRetard ? "retard" : "absence"}`,
      description: `${a.eleve.prenom} ${a.eleve.nom}${a.eleve.classe ? ` · ${a.eleve.classe.nom}` : ""} · ${a.statut}`,
      date: a.createdAt,
      href: "/absences",
      acteurId: a.saisieParId,
    });
  }

  // Incidents rapportés
  for (const i of incidentsRapportes) {
    if (!i.rapporteParId) continue;
    partials.push({
      id: `inc-rap-${i.id}`,
      type: "rapport_incident",
      titre: "a rapporté un incident",
      description: `${i.eleve.prenom} ${i.eleve.nom} · ${i.type}${i.eleve.classe ? ` · ${i.eleve.classe.nom}` : ""}`,
      date: i.createdAt,
      href: "/vie-scolaire",
      acteurId: i.rapporteParId,
    });
  }

  // Incidents résolus
  for (const i of incidentsResolus) {
    if (!i.resoluParId || !i.dateResolution) continue;
    partials.push({
      id: `inc-res-${i.id}`,
      type: "resolution_incident",
      titre: "a résolu un incident",
      description: `${i.eleve.prenom} ${i.eleve.nom} · ${i.type}${i.actionPrise ? ` · ${i.actionPrise}` : ""}`,
      date: i.dateResolution,
      href: "/vie-scolaire",
      acteurId: i.resoluParId,
    });
  }

  // Incidents classés
  for (const i of incidentsClasses) {
    if (!i.classeParId || !i.dateClassement) continue;
    partials.push({
      id: `inc-cl-${i.id}`,
      type: "classement_incident",
      titre: "a classé un incident sans suite",
      description: `${i.eleve.prenom} ${i.eleve.nom} · ${i.type}${i.motifClassement ? ` · ${i.motifClassement}` : ""}`,
      date: i.dateClassement,
      href: "/vie-scolaire",
      acteurId: i.classeParId,
    });
  }

  // Réintégrations
  for (const s of sanctionsReintegrees) {
    if (!s.reintegreParId || !s.dateRetourEffective) continue;
    partials.push({
      id: `sanction-reint-${s.id}`,
      type: "reintegration_sanction",
      titre: "a réintégré un élève",
      description: `${s.incident?.eleve?.prenom ?? ""} ${s.incident?.eleve?.nom ?? ""}`,
      date: s.dateRetourEffective,
      href: "/vie-scolaire",
      acteurId: s.reintegreParId,
    });
  }

  // Paiements
  for (const p of paiements) {
    if (!p.enregistreParId || !p.dateSaisie) continue;
    partials.push({
      id: `pay-${p.id}`,
      type: "paiement",
      titre: "a enregistré un paiement",
      description: `${p.montant.toLocaleString("fr")} ${p.devise} · ${p.facture.eleve?.prenom ?? ""} ${p.facture.eleve?.nom ?? ""} · ${p.methode}`,
      date: p.dateSaisie,
      href: "/facturation",
      acteurId: p.enregistreParId,
    });
  }

  // Factures
  for (const f of factures) {
    if (!f.createdById) continue;
    partials.push({
      id: `fact-${f.id}`,
      type: "facture",
      titre: "a créé une facture",
      description: `${f.numero} · ${f.montant.toLocaleString("fr")} ${f.devise} · ${f.eleve?.prenom ?? ""} ${f.eleve?.nom ?? ""} · ${f.type}`,
      date: f.createdAt,
      href: "/facturation",
      acteurId: f.createdById,
    });
  }

  // Dépenses
  for (const d of depenses) {
    if (!d.enregistreParId) continue;
    partials.push({
      id: `dep-${d.id}`,
      type: "depense",
      titre: "a enregistré une dépense",
      description: `${d.libelle} · ${d.montant.toLocaleString("fr")} ${d.devise} · ${d.categorie}`,
      date: d.createdAt,
      href: "/comptabilite",
      acteurId: d.enregistreParId,
    });
  }

  // Congés demandés
  for (const c of congesDemandes) {
    if (!c.demandeParId) continue;
    const nomEnseignant = c.enseignant?.user?.name ?? "enseignant";
    partials.push({
      id: `cong-dem-${c.id}`,
      type: "conge_demande",
      titre: "a demandé un congé",
      description: `${nomEnseignant} · ${c.type} · ${c.nbJours} jour${c.nbJours !== 1 ? "s" : ""}`,
      date: c.createdAt,
      href: "/rh",
      acteurId: c.demandeParId,
    });
  }

  // Congés approuvés
  for (const c of congesApprouves) {
    if (!c.approuveParId || !c.approuveAt) continue;
    const nomEnseignant = c.enseignant?.user?.name ?? "enseignant";
    partials.push({
      id: `cong-app-${c.id}`,
      type: "conge_approbation",
      titre: "a approuvé un congé",
      description: `${nomEnseignant} · ${c.type} · ${c.nbJours} jour${c.nbJours !== 1 ? "s" : ""}`,
      date: c.approuveAt,
      href: "/rh",
      acteurId: c.approuveParId,
    });
  }

  // Infirmerie
  for (const p of passagesInfirmerie) {
    if (!p.infirmierId) continue;
    partials.push({
      id: `inf-${p.id}`,
      type: "passage_infirmerie",
      titre: "a reçu un élève à l'infirmerie",
      description: `${p.eleve.prenom} ${p.eleve.nom}${p.eleve.classe ? ` · ${p.eleve.classe.nom}` : ""} · ${p.motif}`,
      date: p.createdAt,
      href: "/sante/infirmerie",
      acteurId: p.infirmierId,
    });
  }

  // Entretiens
  for (const e of entretiensConseil) {
    if (!e.conseillerId) continue;
    partials.push({
      id: `ent-${e.id}`,
      type: "entretien",
      titre: "a tenu un entretien",
      description: `${e.eleve.prenom} ${e.eleve.nom}${e.eleve.classe ? ` · ${e.eleve.classe.nom}` : ""} · ${e.motif}`,
      date: e.createdAt,
      href: "/conseil",
      acteurId: e.conseillerId,
    });
  }

  // Communications
  for (const n of notifications) {
    if (!n.envoyeParId || !n.envoyeeAt) continue;
    partials.push({
      id: `notif-${n.id}`,
      type: "communication",
      titre: "a envoyé une communication",
      description: `${n.titre} · ${n.canal} · ${n.nbDestinataires} destinataire${n.nbDestinataires > 1 ? "s" : ""}`,
      date: n.envoyeeAt,
      href: "/communication",
      acteurId: n.envoyeParId,
    });
  }

  // Commentaires de séance
  for (const s of seanceCommentaires) {
    if (!s.auteurId) continue;
    const matiere = s.seance?.matiere?.nom ?? "";
    const classe = s.seance?.classe?.nom ?? "";
    partials.push({
      id: `sc-${s.id}`,
      type: "seance_commentaire",
      titre: "a commenté une séance",
      description: [matiere, classe].filter(Boolean).join(" · "),
      date: s.createdAt,
      href: "/cours",
      acteurId: s.auteurId,
    });
  }

  // Audit logs
  for (const a of audits) {
    if (!a.userId || a.action.includes("check") || a.action.includes("guard")) continue;
    partials.push({
      id: `audit-${a.id}`,
      type: "audit",
      titre: `a effectué "${a.action}"`,
      description: a.resource ?? undefined,
      date: a.createdAt,
      href: "#",
      acteurId: a.userId,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Résolution des acteurs en une seule requête
  // ──────────────────────────────────────────────────────────────────────────

  const idsInconnus = collecteActeurs(partials);
  const acteurParId = new Map<string, ActivityActeur>();

  if (idsInconnus.size > 0) {
    const acteurs = await prisma.user.findMany({
      where: { id: { in: Array.from(idsInconnus) } },
      select: { id: true, name: true, role: true },
    });
    for (const u of acteurs) {
      acteurParId.set(u.id, { id: u.id, nom: u.name, role: formatRole(u.role) });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Construction finale et tri
  // ──────────────────────────────────────────────────────────────────────────

  const items: ActivityItem[] = [];

  for (const p of partials) {
    const acteur: ActivityActeur | null =
      p.nom && p.role ? { id: p.acteurId, nom: p.nom, role: formatRole(p.role) } : acteurParId.get(p.acteurId) ?? null;

    if (!acteur) continue; // filtre : action sans acteur identifié = ignorée

    items.push({
      id: p.id,
      type: p.type,
      titre: `${acteur.nom} ${p.titre}`.trim(),
      description: p.description,
      date: p.date,
      href: p.href,
      acteur,
    });
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  return items.slice(0, periode === "recent" ? 15 : 50);
}

/**
 * Toutes les périodes en une seule série de requêtes.
 *
 * Récupère la période la plus large (`mois`) et partitionne en mémoire.
 * « recent » correspond aux 15 items les plus récents du lot complet.
 */
export async function getActivityFeedAllPeriodes(
  tenantId: string,
  claims: SessionSiteClaims,
  now: Date = new Date(),
  anneeIdPasse?: string | null,
  anneeLibellePasse?: string | null,
  anneeDateDebutPasse?: Date | null,
  anneeDateFinPasse?: Date | null
): Promise<Record<Periode, ActivityItem[]>> {
  const tous = await getActivityFeed(
    tenantId,
    claims,
    "mois",
    now,
    anneeIdPasse,
    anneeLibellePasse,
    anneeDateDebutPasse,
    anneeDateFinPasse
  );

  const debutAujourdhui = debutPeriode("aujourdhui", now)!;
  const debutSemaine = debutPeriode("semaine", now)!;

  return {
    recent: tous.slice(0, 15),
    aujourdhui: tous.filter((i) => i.date >= debutAujourdhui),
    semaine: tous.filter((i) => i.date >= debutSemaine),
    mois: tous,
  };
}
