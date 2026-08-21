import prisma from "@/lib/prisma";
import type { SessionSiteClaims } from "@/lib/site-scope";
import { siteFilterForModel } from "@/lib/site-scope";

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
  now: Date = new Date()
): Promise<ActivityItem[]> {
  const debut = debutPeriode(periode, now);
  const limite = periode === "recent" ? 10 : 50;
  const filtreDate = debut ? { gte: debut } : undefined;

  // Les requêtes sont lancées en parallèle, puis fusionnées et triées par date.
  const [
    candidatures,
    candidaturesTraitees,
    elevesInscrits,
    absences,
    paiements,
    incidents,
    incidentsResolus,
    notifications,
    conges,
    audits,
  ] = await Promise.all([
    // 1. Nouvelles candidatures
    prisma.candidature.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("candidature", claims),
        ...(filtreDate ? { createdAt: filtreDate } : {}),
      },
      select: { id: true, nom: true, prenom: true, classeVoulue: true, statut: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),

    // 2. Candidatures traitées (statut changé)
    prisma.candidature.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("candidature", claims),
        statut: { in: ["EN_EXAMEN", "ADMIS", "REFUSE", "INSCRIT"] },
        ...(filtreDate ? { updatedAt: filtreDate } : {}),
      },
      select: { id: true, nom: true, prenom: true, classeVoulue: true, statut: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: limite,
    }),

    // 3. Élèves inscrits (dateInscription)
    prisma.eleve.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("eleve", claims),
        dateInscription: filtreDate ?? undefined,
        deletedAt: null,
      },
      select: { id: true, nom: true, prenom: true, matricule: true, dateInscription: true, classe: { select: { nom: true } } },
      orderBy: { dateInscription: "desc" },
      take: limite,
    }),

    // 4. Absences saisies
    prisma.absence.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("absence", claims),
        ...(filtreDate ? { createdAt: filtreDate } : {}),
      },
      select: {
        id: true, statut: true, isRetard: true, createdAt: true,
        eleve: { select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),

    // 5. Paiements enregistrés
    // Paiement n'a pas de tenantId/siteId : le filtre passe par la facture.
    // eslint-disable-next-line ecolpro/require-site-filter -- filtre via facture.tenantId + siteFilterForModel("facture")
    prisma.paiement.findMany({
      where: {
        facture: {
          tenantId,
          ...siteFilterForModel("facture", claims),
        },
        ...(filtreDate ? { date: filtreDate } : {}),
      },
      select: {
        id: true, montant: true, devise: true, methode: true, date: true,
        facture: { select: { id: true, numero: true, eleve: { select: { id: true, nom: true, prenom: true } } } },
      },
      orderBy: { date: "desc" },
      take: limite,
    }),

    // 6. Incidents signalés
    prisma.incident.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("incident", claims),
        ...(filtreDate ? { createdAt: filtreDate } : {}),
      },
      select: {
        id: true, type: true, gravite: true, description: true, createdAt: true,
        eleve: { select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),

    // 7. Incidents résolus
    prisma.incident.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("incident", claims),
        dateResolution: filtreDate ?? undefined,
      },
      select: {
        id: true, type: true, actionPrise: true, dateResolution: true,
        eleve: { select: { id: true, nom: true, prenom: true } },
      },
      orderBy: { dateResolution: "desc" },
      take: limite,
    }),

    // 8. Notifications envoyées
    prisma.notification.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("notification", claims),
        envoyeeAt: filtreDate ?? undefined,
      },
      select: { id: true, titre: true, canal: true, nbDestinataires: true, envoyeeAt: true },
      orderBy: { envoyeeAt: "desc" },
      take: limite,
    }),

    // 9. Congés demandés / approuvés
    // CongePersonnel n'a pas de siteId : le filtre de tenant suffit (les congés
    // sont au niveau établissement, pas par site).
    // eslint-disable-next-line ecolpro/require-site-filter -- pas de siteId sur ce modèle
    prisma.congePersonnel.findMany({
      where: {
        tenantId,
        ...(filtreDate ? { createdAt: filtreDate } : {}),
      },
      select: {
        id: true, type: true, statut: true, nbJours: true, createdAt: true, approuveAt: true,
        enseignant: { select: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),

    // 10. Audit log — connexions et actions sensibles
    prisma.auditLog.findMany({
      where: {
        tenantId,
        verdict: "ALLOWED",
        ...(filtreDate ? { createdAt: filtreDate } : {}),
      },
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
      description: `${p.montant.toLocaleString("fr")} ${p.devise} · ${p.facture.eleve.prenom} ${p.facture.eleve.nom} · ${p.methode}`,
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
