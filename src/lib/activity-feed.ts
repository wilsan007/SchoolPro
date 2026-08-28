import prisma from "@/lib/prisma";
import type { SessionSiteClaims } from "@/lib/site-scope";
import { siteFilterForModel } from "@/lib/site-scope";
import { anneeActiveId, getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/**
 * Activity Feed — agrège les événements récents de l'établissement.
 *
 * Source : pas de nouveau modèle. On lit les `createdAt` / `updatedAt` /
 * champs de résolution des modèles métier existants. Chaque événement est
 * normalisé en un item de timeline avec un type, un libellé, un lien et une
 * date.
 *
 * Le feed est volontairement limité à 50 items par période : au-delà, la
 * timeline devient une liste de logs, pas un tableau de bord.
 */

export type Periode = "aujourdhui" | "semaine" | "mois" | "recent";

export interface ActivityItem {
  id: string;
  type:
    | "admission"
    | "inscription"
    | "absence"
    | "paiement"
    | "incident"
    | "incident_resolu"
    | "notification"
    | "conge"
    | "bulletin"
    | "audit";
  titre: string;
  description?: string;
  date: Date;
  href: string;
  utilisateur?: string | null;
}

function debutPeriode(periode: Periode, now: Date): Date | null {
  if (periode === "recent") return null;
  const d = new Date(now);
  if (periode === "aujourdhui") {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (periode === "semaine") {
    const jour = d.getDay(); // 0 = dimanche
    const delta = jour === 0 ? 6 : jour - 1; // revenir à lundi
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

export async function getActivityFeed(
  tenantId: string,
  claims: SessionSiteClaims,
  periode: Periode,
  now: Date = new Date(),
  // Passer anneeId/anneeLibelle en paramètre évite 2-3 requêtes DB
  // redondantes quand l'appelant les a déjà résolues (ex: page direction).
  anneeIdPasse?: string | null,
  anneeLibellePasse?: string | null
): Promise<ActivityItem[]> {
  const debut = debutPeriode(periode, now);
  const limite = periode === "recent" ? 10 : 50;
  const filtreDate = debut ? { gte: debut } : undefined;
  const anneeId = anneeIdPasse !== undefined ? anneeIdPasse : await anneeActiveId(tenantId);
  const anneeLibelle = anneeLibellePasse !== undefined ? anneeLibellePasse : await getAnneeCouranteLibelle(tenantId);
  // Filtre pour les modèles qui utilisent un champ `annee` string (ex: "2025-2026")
  const filtreAnneeString = anneeLibelle ? { annee: anneeLibelle } : {};
  // Filtre pour les modèles sans champ année direct, via eleve.classe.annee
  const filtreAnneeViaClasse = anneeLibelle ? { eleve: { classe: { annee: anneeLibelle } } } : {};

  // Les requêtes sont lancées en 4 batches de 2-3 pour rester sous la limite
  // du pool de connexions Supabase (15 en mode session), même avec des
  // requêtes API concurrentes (alerte-decalage, demo-now, communication).

  // Batch 1/4 : candidatures + élèves — filtrés par année scolaire courante
  const [candidatures, candidaturesTraitees, elevesInscrits] = await Promise.all([
    prisma.candidature.findMany({
      where: { tenantId, ...siteFilterForModel("candidature", claims), ...filtreAnneeString, ...(filtreDate ? { createdAt: filtreDate } : {}) },
      select: { id: true, nom: true, prenom: true, classeVoulue: true, statut: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
    prisma.candidature.findMany({
      where: { tenantId, ...siteFilterForModel("candidature", claims), ...filtreAnneeString, statut: { in: ["EN_EXAMEN", "ADMIS", "REFUSE", "INSCRIT"] }, ...(filtreDate ? { updatedAt: filtreDate } : {}) },
      select: { id: true, nom: true, prenom: true, classeVoulue: true, statut: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: limite,
    }),
    prisma.eleve.findMany({
      where: { tenantId, ...siteFilterForModel("eleve", claims), anneeInscription: anneeLibelle ?? undefined, dateInscription: filtreDate ?? undefined, deletedAt: null },
      select: { id: true, nom: true, prenom: true, matricule: true, dateInscription: true, classe: { select: { nom: true } } },
      orderBy: { dateInscription: "desc" },
      take: limite,
    }),
  ]);

  // Batch 2/4 : absences + paiements — absences filtrées par année via eleve.classe.annee
  const [absences, paiements] = await Promise.all([
    prisma.absence.findMany({
      where: { tenantId, ...siteFilterForModel("absence", claims), ...filtreAnneeViaClasse, ...(filtreDate ? { createdAt: filtreDate } : {}) },
      select: { id: true, statut: true, isRetard: true, createdAt: true, eleve: { select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } } } },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
    // eslint-disable-next-line ecolpro/require-site-filter -- filtre via facture.tenantId + siteFilterForModel("facture")
    prisma.paiement.findMany({
      where: { facture: { tenantId, ...(anneeId ? { anneeId } : {}), ...siteFilterForModel("facture", claims) }, ...(filtreDate ? { date: filtreDate } : {}) },
      select: { id: true, montant: true, devise: true, methode: true, date: true, facture: { select: { id: true, numero: true, eleve: { select: { id: true, nom: true, prenom: true } } } } },
      orderBy: { date: "desc" },
      take: limite,
    }),
  ]);

  // Batch 3/4 : incidents + notifications — incidents filtrés par année via eleve.classe.annee
  const [incidents, incidentsResolus, notifications] = await Promise.all([
    prisma.incident.findMany({
      where: { tenantId, ...siteFilterForModel("incident", claims), ...filtreAnneeViaClasse, ...(filtreDate ? { createdAt: filtreDate } : {}) },
      select: { id: true, type: true, gravite: true, description: true, createdAt: true, eleve: { select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } } } },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
    prisma.incident.findMany({
      where: { tenantId, ...siteFilterForModel("incident", claims), ...filtreAnneeViaClasse, dateResolution: filtreDate ?? undefined },
      select: { id: true, type: true, actionPrise: true, dateResolution: true, eleve: { select: { id: true, nom: true, prenom: true } } },
      orderBy: { dateResolution: "desc" },
      take: limite,
    }),
    prisma.notification.findMany({
      where: { tenantId, ...siteFilterForModel("notification", claims), envoyeeAt: filtreDate ?? undefined },
      select: { id: true, titre: true, canal: true, nbDestinataires: true, envoyeeAt: true },
      orderBy: { envoyeeAt: "desc" },
      take: limite,
    }),
  ]);

  // Batch 4/4 : congés + audits
  const [conges, audits] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-site-filter -- pas de siteId sur ce modèle
    prisma.congePersonnel.findMany({
      where: { tenantId, ...(filtreDate ? { createdAt: filtreDate } : {}) },
      select: { id: true, type: true, statut: true, nbJours: true, createdAt: true, approuveAt: true, enseignant: { select: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
    prisma.auditLog.findMany({
      where: { tenantId, verdict: "ALLOWED", ...(filtreDate ? { createdAt: filtreDate } : {}) },
      select: { id: true, action: true, resource: true, createdAt: true, userId: true },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
  ]);

  // Normalisation en ActivityItem[]
  const items: ActivityItem[] = [];

  for (const c of candidatures) {
    items.push({
      id: `cand-${c.id}`,
      type: "admission",
      titre: `Candidature de ${c.prenom} ${c.nom}`,
      description: `${c.classeVoulue} · ${c.statut}`,
      date: c.createdAt,
      href: "/admissions",
    });
  }

  for (const c of candidaturesTraitees) {
    const verbe = c.statut === "ADMIS" ? "admise" : c.statut === "REFUSE" ? "refusée" : c.statut === "INSCRIT" ? "inscrite" : "en examen";
    items.push({
      id: `cand-tr-${c.id}`,
      type: "admission",
      titre: `Candidature de ${c.prenom} ${c.nom} ${verbe}`,
      description: `${c.classeVoulue}`,
      date: c.updatedAt,
      href: "/admissions",
    });
  }

  for (const e of elevesInscrits) {
    if (!e.dateInscription) continue;
    items.push({
      id: `eleve-${e.id}`,
      type: "inscription",
      titre: `Élève inscrit : ${e.prenom} ${e.nom}`,
      description: `${e.matricule}${e.classe ? ` · ${e.classe.nom}` : ""}`,
      date: e.dateInscription,
      href: `/eleves/${e.id}`,
    });
  }

  for (const a of absences) {
    items.push({
      id: `abs-${a.id}`,
      type: "absence",
      titre: `${a.isRetard ? "Retard" : "Absence"} — ${a.eleve.prenom} ${a.eleve.nom}`,
      description: `${a.eleve.classe?.nom ?? ""} · ${a.statut}`,
      date: a.createdAt,
      href: "/absences",
    });
  }

  for (const p of paiements) {
    items.push({
      id: `pay-${p.id}`,
      type: "paiement",
      titre: `Paiement ${p.facture.numero}`,
      description: `${p.montant.toLocaleString("fr")} ${p.devise} · ${p.facture.eleve?.prenom ?? ""} ${p.facture.eleve?.nom ?? ""} · ${p.methode}`,
      date: p.date,
      href: "/facturation",
    });
  }

  for (const i of incidents) {
    items.push({
      id: `inc-${i.id}`,
      type: "incident",
      titre: `Incident — ${i.eleve.prenom} ${i.eleve.nom}`,
      description: `${i.type} · gravité ${i.gravite}${i.eleve.classe ? ` · ${i.eleve.classe.nom}` : ""}`,
      date: i.createdAt,
      href: "/vie-scolaire",
    });
  }

  for (const i of incidentsResolus) {
    if (!i.dateResolution) continue;
    items.push({
      id: `inc-res-${i.id}`,
      type: "incident_resolu",
      titre: `Incident résolu — ${i.eleve.prenom} ${i.eleve.nom}`,
      description: `${i.type}${i.actionPrise ? ` · ${i.actionPrise}` : ""}`,
      date: i.dateResolution,
      href: "/vie-scolaire",
    });
  }

  for (const n of notifications) {
    if (!n.envoyeeAt) continue;
    items.push({
      id: `notif-${n.id}`,
      type: "notification",
      titre: `Communication envoyée : ${n.titre}`,
      description: `${n.canal} · ${n.nbDestinataires} destinataire(s)`,
      date: n.envoyeeAt,
      href: "/communication",
    });
  }

  for (const c of conges) {
    const isApprouve = c.statut === "APPROUVE" && c.approuveAt;
    const nomEnseignant = c.enseignant?.user?.name ?? "Enseignant";
    items.push({
      id: `conge-${c.id}`,
      type: "conge",
      titre: `Congé ${isApprouve ? "approuvé" : "demandé"} — ${nomEnseignant}`,
      description: `${c.type} · ${c.nbJours} jour(s)`,
      date: isApprouve ? c.approuveAt! : c.createdAt,
      href: "/rh",
    });
  }

  for (const a of audits) {
    // Filtrer les actions intéressantes (pas les checks de permission triviaux)
    if (a.action.includes("check") || a.action.includes("guard")) continue;
    items.push({
      id: `audit-${a.id}`,
      type: "audit",
      titre: a.action,
      description: a.resource ?? undefined,
      date: a.createdAt,
      href: "#",
      utilisateur: a.userId,
    });
  }

  // Tri par date décroissante + limite
  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  return items.slice(0, periode === "recent" ? 10 : 50);
}

/**
 * Toutes les périodes en une seule série de requêtes.
 *
 * Au lieu d'appeler `getActivityFeed` 4 fois (recent / aujourdhui / semaine /
 * mois) — soit 40 requêtes concurrentes contre un pool de 21 connexions —
 * cette fonction récupère une seule fois la période la plus large (`mois`)
 * et partitionne les résultats en mémoire.
 *
 * « recent » correspond aux 10 items les plus récents du lot complet ;
 * « aujourdhui » et « semaine » sont des sous-ensembles filtrés par date.
 */
export async function getActivityFeedAllPeriodes(
  tenantId: string,
  claims: SessionSiteClaims,
  now: Date = new Date(),
  anneeIdPasse?: string | null,
  anneeLibellePasse?: string | null
): Promise<Record<Periode, ActivityItem[]>> {
  // Une seule série de 10 requêtes : la période « mois » (la plus large).
  const tous = await getActivityFeed(tenantId, claims, "mois", now, anneeIdPasse, anneeLibellePasse);

  const debutAujourdhui = debutPeriode("aujourdhui", now)!;
  const debutSemaine = debutPeriode("semaine", now)!;

  return {
    recent: tous.slice(0, 10),
    aujourdhui: tous.filter((i) => i.date >= debutAujourdhui),
    semaine: tous.filter((i) => i.date >= debutSemaine),
    mois: tous,
  };
}
