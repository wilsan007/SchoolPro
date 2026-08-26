/**
 * Moteur de génération automatique de tâches.
 *
 * Scanne l'état du système (évaluations sans notes, séances non validées,
 * devoirs non corrigés, bulletins non publiés, incidents ouverts, absences
 * en attente, factures en retard, invitations de réinscription) et synchronise
 * des enregistrements `Tache` avec `sourceType`/`sourceId` pour l'idempotence.
 *
 * Principes :
 *  - Idempotent : rejouer le moteur ne crée pas de doublons.
 *  - Déterministe : pas de LLM, des règles pures sur l'état de la DB.
 *  - Réversible : si la condition source disparaît (notes saisies, incident
 *    résolu), la tâche est marquée FAIT automatiquement.
 *  - Année-aware : filtre par l'année active (Time Machine-compatible).
 *  - Site-aware : respecte le scope du site.
 *
 * Le moteur peut être appelé :
 *  - Avant le chargement d'une page (lazy, on-demand)
 *  - Par le cron répartiteur (toutes les heures)
 *  - Par un endpoint API dédié
 */

import prisma from "@/lib/prisma";
import type { Prisma, PrioriteTache } from "@prisma/client";
import { anneeActiveId, getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";
import type { SessionSiteClaims } from "@/lib/site-scope";
import { siteFilterForModel } from "@/lib/site-scope";

// ── Types ──────────────────────────────────────────────────────

export interface SourceTache {
  sourceType: string;
  sourceId: string;
  assigneeAId: string;
  titre: string;
  description?: string;
  type: string;
  priorite: PrioriteTache;
  echeance?: Date | null;
  classeId?: string | null;
  matiereId?: string | null;
  siteId?: string | null;
}

export interface SyncResult {
  created: number;
  closed: number;
  total: number;
}

// ── Helpers ────────────────────────────────────────────────────

/** Échéance par défaut : J+3 pour les retards critiques, J+7 pour le reste. */
function echeanceDepuisRetard(jours: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  d.setHours(23, 59, 59, 0);
  return d;
}

/**
 * Synchronise un lot de sources : crée les tâches manquantes et
 * ferme celles dont la source n'est plus pertinente.
 */
async function syncLot(
  tenantId: string,
  sources: SourceTache[]
): Promise<{ created: number; closed: number }> {
  let created = 0;
  let closed = 0;

  if (sources.length === 0) return { created, closed };

  // 1. Récupérer toutes les tâches auto existantes pour ces sources.
  const sourceTypes = [...new Set(sources.map((s) => s.sourceType))];
  const sourceIds = sources.map((s) => s.sourceId);

  const existantes = await prisma.tache.findMany({
    where: {
      tenantId,
      sourceType: { in: sourceTypes },
      sourceId: { in: sourceIds },
      statut: { in: ["A_FAIRE", "EN_COURS"] },
    },
    select: { id: true, sourceType: true, sourceId: true, statut: true },
  });

  const existantesMap = new Map<string, typeof existantes[number]>();
  for (const t of existantes) {
    existantesMap.set(`${t.sourceType}|${t.sourceId}`, t);
  }

  // 2. Créer les tâches manquantes.
  const aCreer = sources.filter((s) => !existantesMap.has(`${s.sourceType}|${s.sourceId}`));

  if (aCreer.length > 0) {
    // Création par batch pour éviter les trop grosses requêtes.
    const BATCH = 50;
    for (let i = 0; i < aCreer.length; i += BATCH) {
      const batch = aCreer.slice(i, i + BATCH);
      await prisma.$transaction(
        batch.map((s) =>
          prisma.tache.create({
            data: {
              tenantId,
              siteId: s.siteId ?? null,
              assigneeAId: s.assigneeAId,
              creeParId: null, // tâche auto-générée
              titre: s.titre,
              description: s.description ?? null,
              type: s.type,
              priorite: s.priorite,
              statut: "A_FAIRE",
              classeId: s.classeId ?? null,
              matiereId: s.matiereId ?? null,
              echeance: s.echeance ?? null,
              sourceType: s.sourceType,
              sourceId: s.sourceId,
            },
          })
        )
      );
      created += batch.length;
    }
  }

  // 3. Fermer les tâches dont la source n'est plus active.
  // (les tâches existantes dont la source n'est plus dans `sources`)
  const sourcesKeys = new Set(sources.map((s) => `${s.sourceType}|${s.sourceId}`));
  const aFermer = existantes.filter(
    (t) => !sourcesKeys.has(`${t.sourceType}|${t.sourceId}`)
  );

  if (aFermer.length > 0) {
    const result = await prisma.tache.updateMany({
      where: {
        tenantId,
        id: { in: aFermer.map((t) => t.id) },
      },
      data: {
        statut: "FAIT",
        dateFaite: new Date(),
      },
    });
    closed = result.count;
  }

  return { created, closed };
}

// ── Scanners par source ────────────────────────────────────────

/**
 * Scanner : évaluations passées sans notes → tâche "saisir les notes".
 * Assignée à l'enseignant responsable (via AffectationEnseignant ou EmploiTemps).
 */
async function scannerEvaluationsSansNotes(
  tenantId: string,
  claims: SessionSiteClaims,
  maintenant: Date,
  anneeLibelle: string | null
): Promise<SourceTache[]> {
  const evaluations = await prisma.evaluation.findMany({
    where: {
      tenantId,
      date: { lt: maintenant },
      statut: { not: "ANNULE" },
      notes: { none: {} },
      ...(anneeLibelle ? { classe: { annee: anneeLibelle } } : {}),
      ...siteFilterForModel("evaluation", claims),
    },
    select: {
      id: true,
      titre: true,
      date: true,
      classeId: true,
      matiereId: true,
      classe: { select: { nom: true, profPrincipalId: true } },
      matiere: { select: { nom: true } },
    },
    take: 200,
  });

  if (evaluations.length === 0) return [];

  // Résoudre les enseignants via AffectationEnseignant (source principale).
  const keys = evaluations.map((e) => `${e.classeId}|${e.matiereId}`);
  const affectations = await prisma.affectationEnseignant.findMany({
    where: { tenantId },
    select: {
      classeId: true,
      matiereId: true,
      enseignantId: true,
      enseignant: { select: { id: true, userId: true, user: { select: { name: true } } } },
    },
  });

  const enseignantMap = new Map<string, string>(); // key → userId
  for (const a of affectations) {
    const key = `${a.classeId}|${a.matiereId}`;
    if (a.enseignant?.userId && !enseignantMap.has(key)) {
      enseignantMap.set(key, a.enseignant.userId);
    }
  }

  // Repli via EmploiTemps pour les données pré-migration.
  const missingKeys = keys.filter((k) => !enseignantMap.has(k));
  if (missingKeys.length > 0) {
    const emplois = await prisma.emploiTemps.findMany({
      where: { tenantId, ...siteFilterForModel("emploiTemps", claims) },
      select: {
        classeId: true,
        matiereId: true,
        enseignant: { select: { id: true, userId: true } },
      },
      distinct: ["classeId", "matiereId", "enseignantId"],
    });
    for (const e of emplois) {
      const key = `${e.classeId}|${e.matiereId}`;
      if (e.enseignant?.userId && !enseignantMap.has(key)) {
        enseignantMap.set(key, e.enseignant.userId);
      }
    }
  }

  const sources: SourceTache[] = [];
  for (const ev of evaluations) {
    const userId = enseignantMap.get(`${ev.classeId}|${ev.matiereId}`);
    if (!userId) continue; // pas d'enseignant identifiable → on ignore

    const joursRetard = Math.floor(
      (maintenant.getTime() - ev.date.getTime()) / (1000 * 60 * 60 * 24)
    );

    sources.push({
      sourceType: "evaluation_sans_notes",
      sourceId: ev.id,
      assigneeAId: userId,
      titre: `Saisir les notes : ${ev.titre}`,
      description: `${ev.classe?.nom ?? "?"} · ${ev.matiere?.nom ?? "?"} — évaluation du ${ev.date.toLocaleDateString("fr-FR")}`,
      type: "saisie_notes",
      priorite: joursRetard > 7 ? "HAUTE" : "NORMALE",
      echeance: echeanceDepuisRetard(1), // demain
      classeId: ev.classeId,
      matiereId: ev.matiereId,
    });
  }

  return sources;
}

/**
 * Scanner : séances planifiées dont la date est passée → tâche "valider la séance".
 */
async function scannerSeancesAValider(
  tenantId: string,
  claims: SessionSiteClaims,
  maintenant: Date,
  anneeLibelle: string | null
): Promise<SourceTache[]> {
  const seances = await prisma.seancePedagogique.findMany({
    where: {
      tenantId,
      statut: "PLANIFIEE",
      date: { lt: maintenant },
      ...(anneeLibelle ? { classe: { annee: anneeLibelle } } : {}),
      ...siteFilterForModel("seancePedagogique", claims),
    },
    select: {
      id: true,
      date: true,
      enseignantId: true,
      enseignant: { select: { userId: true, user: { select: { name: true } } } },
      classe: { select: { nom: true } },
      matiere: { select: { nom: true } },
    },
    take: 200,
  });

  return seances
    .filter((s) => s.enseignant?.userId)
    .map((s) => ({
      sourceType: "seance_a_valider",
      sourceId: s.id,
      assigneeAId: s.enseignant!.userId,
      titre: `Valider la séance : ${s.classe?.nom ?? "?"} · ${s.matiere?.nom ?? "?"}`,
      description: `Séance planifiée le ${s.date.toLocaleDateString("fr-FR")} — marquer comme effectuée`,
      type: "validation_seance",
      priorite: "NORMALE" as PrioriteTache,
      echeance: echeanceDepuisRetard(2),
    }));
}

/**
 * Scanner : devoirs rendus non corrigés → tâche "corriger le devoir".
 */
async function scannerDevoirsACorriger(
  tenantId: string,
  claims: SessionSiteClaims,
  _maintenant: Date,
  anneeLibelle: string | null
): Promise<SourceTache[]> {
  const devoirs = await prisma.devoir.findMany({
    where: {
      tenantId,
      statut: "RENDU",
      ...(anneeLibelle ? { classe: { annee: anneeLibelle } } : {}),
      ...siteFilterForModel("devoir", claims),
    },
    select: {
      id: true,
      titre: true,
      dateRendu: true,
      enseignantId: true,
      enseignant: { select: { userId: true } },
      classe: { select: { nom: true } },
    },
    take: 200,
  });

  return devoirs
    .filter((d) => d.enseignant?.userId)
    .map((d) => ({
      sourceType: "devoir_a_corriger",
      sourceId: d.id,
      assigneeAId: d.enseignant!.userId,
      titre: `Corriger le devoir : ${d.titre}`,
      description: `${d.classe?.nom ?? "?"} — rendu le ${d.dateRendu?.toLocaleDateString("fr-FR") ?? "?"}`,
      type: "correction_devoirs",
      priorite: "NORMALE" as PrioriteTache,
      echeance: echeanceDepuisRetard(3),
    }));
}

/**
 * Scanner : bulletins non publiés → tâche "publier le bulletin" pour le prof principal.
 */
async function scannerBulletinsAPublier(
  tenantId: string,
  claims: SessionSiteClaims,
  _maintenant: Date,
  anneeId: string | null
): Promise<SourceTache[]> {
  const bulletins = await prisma.bulletin.findMany({
    where: {
      tenantId,
      isPublie: false,
      ...(anneeId ? { periode: { anneeId } } : {}),
      ...siteFilterForModel("bulletin", claims),
    },
    select: {
      id: true,
      eleve: {
        select: {
          nom: true,
          prenom: true,
          classe: { select: { nom: true, profPrincipalId: true } },
        },
      },
      periode: { select: { nom: true } },
    },
    take: 200,
  });

  // Résoudre les profs principaux → userId.
  const profPrincipalIds = new Set(
    bulletins.map((b) => b.eleve.classe?.profPrincipalId).filter(Boolean) as string[]
  );
  const profs = profPrincipalIds.size > 0
    // eslint-disable-next-line ecolpro/require-site-filter -- résolution d'ID, bornée par tenantId + IDs déjà filtrés par site
    ? await prisma.enseignant.findMany({
        where: { id: { in: [...profPrincipalIds] }, tenantId },
        select: { id: true, userId: true },
      })
    : [];
  const profMap = new Map(profs.map((p) => [p.id, p.userId]));

  return bulletins
    .filter((b) => {
      const ppId = b.eleve.classe?.profPrincipalId;
      return ppId && profMap.has(ppId);
    })
    .map((b) => ({
      sourceType: "bulletin_a_publier",
      sourceId: b.id,
      assigneeAId: profMap.get(b.eleve.classe!.profPrincipalId!)!,
      titre: `Publier le bulletin : ${b.eleve.prenom} ${b.eleve.nom}`,
      description: `${b.eleve.classe?.nom ?? "?"} · ${b.periode?.nom ?? ""}`,
      type: "remise_bulletins",
      priorite: "HAUTE" as PrioriteTache,
      echeance: echeanceDepuisRetard(2),
    }));
}

/**
 * Scanner : incidents ouverts → tâche "traiter l'incident" pour le prof principal.
 */
async function scannerIncidentsATraiter(
  tenantId: string,
  claims: SessionSiteClaims,
  maintenant: Date,
  anneeLibelle: string | null
): Promise<SourceTache[]> {
  const incidents = await prisma.incident.findMany({
    where: {
      tenantId,
      statut: "OUVERT",
      date: { lte: maintenant },
      ...(anneeLibelle ? { eleve: { classe: { annee: anneeLibelle } } } : {}),
      ...siteFilterForModel("incident", claims),
    },
    select: {
      id: true,
      type: true,
      gravite: true,
      date: true,
      eleve: {
        select: {
          nom: true,
          prenom: true,
          classe: { select: { nom: true, profPrincipalId: true } },
        },
      },
    },
    take: 200,
  });

  const profPrincipalIds = new Set(
    incidents.map((i) => i.eleve.classe?.profPrincipalId).filter(Boolean) as string[]
  );
  const profs = profPrincipalIds.size > 0
    // eslint-disable-next-line ecolpro/require-site-filter -- résolution d'ID, bornée par tenantId + IDs déjà filtrés par site
    ? await prisma.enseignant.findMany({
        where: { id: { in: [...profPrincipalIds] }, tenantId },
        select: { id: true, userId: true },
      })
    : [];
  const profMap = new Map(profs.map((p) => [p.id, p.userId]));

  return incidents
    .filter((i) => {
      const ppId = i.eleve.classe?.profPrincipalId;
      return ppId && profMap.has(ppId);
    })
    .map((i) => ({
      sourceType: "incident_a_traiter",
      sourceId: i.id,
      assigneeAId: profMap.get(i.eleve.classe!.profPrincipalId!)!,
      titre: `Traiter l'incident : ${i.eleve.prenom} ${i.eleve.nom}`,
      description: `${i.eleve.classe?.nom ?? "?"} · ${i.type} (gravité ${i.gravite}) — ${i.date.toLocaleDateString("fr-FR")}`,
      type: "traitement_incident",
      priorite: (i.gravite >= 3 ? "URGENTE" : "HAUTE") as PrioriteTache,
      echeance: echeanceDepuisRetard(1),
    }));
}

/**
 * Scanner : absences en attente de justification → tâche pour le prof principal.
 */
async function scannerAbsencesAJustifier(
  tenantId: string,
  claims: SessionSiteClaims,
  maintenant: Date,
  anneeLibelle: string | null
): Promise<SourceTache[]> {
  const absences = await prisma.absence.findMany({
    where: {
      tenantId,
      statut: "EN_ATTENTE",
      date: { lte: maintenant },
      ...(anneeLibelle ? { eleve: { classe: { annee: anneeLibelle } } } : {}),
      ...siteFilterForModel("absence", claims),
    },
    select: {
      id: true,
      date: true,
      eleve: {
        select: {
          nom: true,
          prenom: true,
          classe: { select: { nom: true, profPrincipalId: true } },
        },
      },
    },
    take: 200,
  });

  const profPrincipalIds = new Set(
    absences.map((a) => a.eleve.classe?.profPrincipalId).filter(Boolean) as string[]
  );
  const profs = profPrincipalIds.size > 0
    // eslint-disable-next-line ecolpro/require-site-filter -- résolution d'ID, bornée par tenantId + IDs déjà filtrés par site
    ? await prisma.enseignant.findMany({
        where: { id: { in: [...profPrincipalIds] }, tenantId },
        select: { id: true, userId: true },
      })
    : [];
  const profMap = new Map(profs.map((p) => [p.id, p.userId]));

  return absences
    .filter((a) => {
      const ppId = a.eleve.classe?.profPrincipalId;
      return ppId && profMap.has(ppId);
    })
    .map((a) => ({
      sourceType: "absence_a_justifier",
      sourceId: a.id,
      assigneeAId: profMap.get(a.eleve.classe!.profPrincipalId!)!,
      titre: `Justifier l'absence : ${a.eleve.prenom} ${a.eleve.nom}`,
      description: `${a.eleve.classe?.nom ?? "?"} — absent le ${a.date.toLocaleDateString("fr-FR")}`,
      type: "justification_absence",
      priorite: "NORMALE" as PrioriteTache,
      echeance: echeanceDepuisRetard(3),
    }));
}

/**
 * Scanner : factures en retard → tâche pour le comptable/admin.
 * Assignée au premier user avec rôle ACCOUNTANT ou TENANT_ADMIN du tenant.
 */
async function scannerFacturesEnRetard(
  tenantId: string,
  claims: SessionSiteClaims,
  _maintenant: Date,
  anneeLibelle: string | null
): Promise<SourceTache[]> {
  const factures = await prisma.facture.findMany({
    where: {
      tenantId,
      statut: "EN_RETARD",
      ...(anneeLibelle ? { eleve: { classe: { annee: anneeLibelle } } } : {}),
      ...siteFilterForModel("facture", claims),
    },
    select: {
      id: true,
      numero: true,
      libelle: true,
      montant: true,
      echeance: true,
      eleve: { select: { nom: true, prenom: true } },
    },
    take: 100,
  });

  if (factures.length === 0) return [];

  // Trouver un comptable ou admin du tenant pour assigner la tâche.
  // eslint-disable-next-line ecolpro/require-site-filter -- résolution d'ID système, bornée par tenantId
  const comptable = await prisma.user.findFirst({
    where: {
      tenantId,
      role: { in: ["ACCOUNTANT", "TENANT_ADMIN"] },
      isActive: true,
    },
    select: { id: true },
  });

  if (!comptable) return [];

  return factures.map((f) => ({
    sourceType: "facture_en_retard",
    sourceId: f.id,
    assigneeAId: comptable.id,
    titre: `Relancer : ${f.eleve.prenom} ${f.eleve.nom} — ${f.libelle}`,
    description: `Facture ${f.numero} · ${f.montant} DJF · échéance ${f.echeance?.toLocaleDateString("fr-FR") ?? "—"}`,
    type: "relance_facture",
    priorite: "HAUTE" as PrioriteTache,
    echeance: echeanceDepuisRetard(1),
  }));
}

/**
 * Scanner : invitations de réinscription en attente → tâche pour le parent.
 */
async function scannerReinscriptionsEnAttente(
  tenantId: string,
  _claims: SessionSiteClaims,
  _maintenant: Date
): Promise<SourceTache[]> {
  const invitations = await prisma.invitationReinscription.findMany({
    where: {
      tenantId,
      statut: { in: ["INVITE", "SANS_REPONSE"] },
    },
    select: {
      id: true,
      eleveId: true,
      eleve: { select: { nom: true, prenom: true } },
      campagne: { select: { libelle: true, anneeCible: true } },
    },
    take: 100,
  });

  if (invitations.length === 0) return [];

  // Pour chaque invitation, trouver le parent (user) lié à l'élève.
  const eleveIdsReels = invitations.map((i) => i.eleveId);

  let parentMap = new Map<string, string>(); // eleveId → userId
  if (eleveIdsReels.length > 0) {
    // eslint-disable-next-line ecolpro/require-site-filter -- résolution d'ID, bornée par tenantId + eleveIds déjà filtrés
    const eleveParents = await prisma.eleveParent.findMany({
      where: { eleveId: { in: eleveIdsReels }, isGardien: true },
      select: {
        eleveId: true,
        parent: { select: { userId: true } },
      },
    });
    for (const ep of eleveParents) {
      if (ep.parent?.userId && !parentMap.has(ep.eleveId)) {
        parentMap.set(ep.eleveId, ep.parent.userId);
      }
    }
  }

  const sources: SourceTache[] = [];
  for (const inv of invitations) {
    const userId = parentMap.get(inv.eleveId);
    if (!userId) continue;

    sources.push({
      sourceType: "reinscription_en_attente",
      sourceId: inv.id,
      assigneeAId: userId,
      titre: `Confirmer la réinscription : ${inv.eleve.prenom} ${inv.eleve.nom}`,
      description: `Campagne ${inv.campagne?.libelle ?? ""} — année ${inv.campagne?.anneeCible ?? ""}`,
      type: "reinscription",
      priorite: "HAUTE" as PrioriteTache,
      echeance: echeanceDepuisRetard(7),
    });
  }

  return sources;
}

// ── Fonction principale ────────────────────────────────────────

/**
 * Synchronise toutes les tâches auto-générées pour un tenant.
 *
 * Peut être appelée :
 *  - Avant le chargement d'une page (lazy)
 *  - Par le cron répartiteur
 *  - Par l'endpoint API dédié
 *
 * @param tenantId Le tenant à scanner
 * @param claims Les claims de session (pour le scope site)
 * @returns Résumé des opérations
 */
export async function synchroniserTachesAuto(
  tenantId: string,
  claims?: SessionSiteClaims
): Promise<SyncResult> {
  const maintenant = await getDemoNow();
  const anneeId = await anneeActiveId(tenantId);
  const anneeLibelle = await getAnneeCouranteLibelle(tenantId);

  // Claims par défaut : accès global (pour le cron).
  const c: SessionSiteClaims = claims ?? {
    siteId: null,
    role: "TENANT_ADMIN",
  };

  // Lancer tous les scanners en parallèle (2 batches pour le pool Supabase).
  const batch1 = await Promise.all([
    scannerEvaluationsSansNotes(tenantId, c, maintenant, anneeLibelle),
    scannerSeancesAValider(tenantId, c, maintenant, anneeLibelle),
    scannerDevoirsACorriger(tenantId, c, maintenant, anneeLibelle),
  ]);

  const batch2 = await Promise.all([
    scannerBulletinsAPublier(tenantId, c, maintenant, anneeId),
    scannerIncidentsATraiter(tenantId, c, maintenant, anneeLibelle),
    scannerAbsencesAJustifier(tenantId, c, maintenant, anneeLibelle),
  ]);

  const batch3 = await Promise.all([
    scannerFacturesEnRetard(tenantId, c, maintenant, anneeLibelle),
    scannerReinscriptionsEnAttente(tenantId, c, maintenant),
  ]);

  const toutesSources = [...batch1.flat(), ...batch2.flat(), ...batch3.flat()];

  // Synchroniser en un seul appel (le moteur gère l'idempotence).
  const result = await syncLot(tenantId, toutesSources);

  return {
    created: result.created,
    closed: result.closed,
    total: toutesSources.length,
  };
}

/**
 * Récupère les tâches d'un utilisateur, groupées par bucket temporel.
 * Lance la synchronisation auto avant la lecture (lazy sync).
 *
 * @param tenantId Le tenant
 * @param userId L'utilisateur connecté
 * @param claims Les claims de session
 * @param options Filtres optionnels (statut, limit)
 */
export async function getTachesUtilisateur(
  tenantId: string,
  userId: string,
  claims: SessionSiteClaims,
  options?: { statut?: string; limit?: number }
): Promise<{
  taches: Array<{
    id: string;
    titre: string;
    description: string | null;
    type: string;
    priorite: string;
    statut: string;
    echeance: string | null;
    dateFaite: string | null;
    sourceType: string | null;
    sourceId: string | null;
    classe: { id: string; nom: string } | null;
    matiere: { id: string; nom: string } | null;
    assigneeA: { id: string; name: string | null; email: string | null };
    creePar: { id: string; name: string | null } | null;
  }>;
}> {
  const limit = options?.limit ?? 200;

  const taches = await prisma.tache.findMany({
    where: {
      tenantId,
      assigneeAId: userId,
      ...(options?.statut ? { statut: options.statut as any } : {}),
      ...siteFilterForModel("tache", claims),
    },
    include: {
      assigneeA: { select: { id: true, name: true, email: true } },
      creePar: { select: { id: true, name: true } },
      classe: { select: { id: true, nom: true } },
      matiere: { select: { id: true, nom: true } },
    },
    orderBy: [
      { statut: "asc" },
      { echeance: "asc" },
      { priorite: "desc" },
      { createdAt: "desc" },
    ],
    take: limit,
  });

  return {
    taches: taches.map((t) => ({
      id: t.id,
      titre: t.titre,
      description: t.description,
      type: t.type,
      priorite: t.priorite,
      statut: t.statut,
      echeance: t.echeance?.toISOString() ?? null,
      dateFaite: t.dateFaite?.toISOString() ?? null,
      sourceType: t.sourceType,
      sourceId: t.sourceId,
      classe: t.classe,
      matiere: t.matiere,
      assigneeA: t.assigneeA,
      creePar: t.creePar,
    })),
  };
}
