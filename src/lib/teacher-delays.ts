import prisma from "@/lib/prisma";
import type { SessionSiteClaims } from "@/lib/site-scope";
import { siteFilterForModel } from "@/lib/site-scope";
import { anneeALaDate } from "@/lib/annee-scolaire";

/**
 * Retards d'exécution des tâches prévues pour les enseignants et les
 * professeurs principaux.
 *
 * Le directeur voit ces retards groupés par thème. Chaque thème liste les
 * personnes concernées avec le nombre d'items en retard. Un clic sur un
 * thème déploie le détail.
 *
 * Les thèmes :
 *  - Côté enseignant : saisie des notes, validation des séances, correction des devoirs
 *  - Côté prof principal : publication des bulletins, traitement des incidents,
 *    justification des absences
 */

export interface PersonneEnRetard {
  /** userId ou enseignantId */
  id: string;
  nom: string;
  count: number;
  /** Détails supplémentaires (ex: noms des classes, matières) */
  details: string[];
}

export interface ThemeRetard {
  key: string;
  label: string;
  /** Total d'items en retard toutes personnes confondues */
  total: number;
  /** Nombre de personnes distinctes en retard */
  nbPersonnes: number;
  personnes: PersonneEnRetard[];
  href: string;
  /** Couleur sémantique : rouge = critique, orange = important, ambre = modéré */
  niveau: "critique" | "important" | "modere";
}

type EnseignantAvecUser = {
  id: string;
  user: { name: string | null };
};

export async function getTeacherDelays(
  tenantId: string,
  claims: SessionSiteClaims,
  maintenant: Date = new Date(),
  // Passer l'année déjà résolue évite une requête DB redondante
  // quand l'appelant (ex: page direction) l'a déjà calculée.
  anneePasse?: { id: string; dateDebut: Date; libelle: string } | null
): Promise<ThemeRetard[]> {
  // Année active au sens chronologique : pendant l'été, c'est la dernière
  // année terminée. Sans ce filtre, les retards cumulent toutes les années.
  const annee = anneePasse !== undefined ? anneePasse : await anneeALaDate(tenantId, maintenant);
  const anneeId = annee?.id;
  const anneeLibelle = annee?.libelle ?? null;
  const fenetreDebut = annee?.dateDebut;

  // ── Requêtes en parallèle ──────────────────────────────────────

  // 2 batches de 3 pour rester sous la limite du pool Supabase (15 connexions).
  const [evalsSansNotes, seancesPlanifiees, devoirsARendre] = await Promise.all([
    // 1. Évaluations passées sans notes (dans l'année active)
    prisma.evaluation.findMany({
      where: {
        tenantId,
        date: {
          gte: fenetreDebut ?? new Date(0),
          lt: maintenant,
        },
        statut: { not: "ANNULE" },
        notes: { none: {} },
        ...(anneeLibelle ? { classe: { annee: anneeLibelle } } : {}),
        ...siteFilterForModel("evaluation", claims),
      },
      select: {
        id: true, titre: true, date: true,
        classeId: true, matiereId: true,
        classe: { select: { nom: true, profPrincipalId: true } },
        matiere: { select: { nom: true } },
      },
      take: 200,
    }),

    // 2. Séances planifiées dont la date est passée (dans l'année active)
    prisma.seancePedagogique.findMany({
      where: {
        tenantId,
        statut: "PLANIFIEE",
        date: {
          gte: fenetreDebut ?? new Date(0),
          lt: maintenant,
        },
        ...(anneeLibelle ? { classe: { annee: anneeLibelle } } : {}),
        ...siteFilterForModel("seancePedagogique", claims),
      },
      select: {
        id: true,
        enseignantId: true,
        enseignant: { select: { id: true, user: { select: { name: true } } } },
        classe: { select: { nom: true } },
        matiere: { select: { nom: true } },
      },
      take: 200,
    }),

    // 3. Devoirs rendus mais non corrigés (dans l'année active)
    prisma.devoir.findMany({
      where: {
        tenantId,
        statut: "RENDU",
        dateRendu: { gte: fenetreDebut ?? new Date(0) },
        ...siteFilterForModel("devoir", claims),
      },
      select: {
        id: true, titre: true, dateRendu: true,
        enseignantId: true,
        enseignant: { select: { id: true, user: { select: { name: true } } } },
        classe: { select: { nom: true } },
      },
      take: 200,
    }),
  ]);

  const [bulletinsNonPublies, incidentsOuverts, absencesEnAttente] = await Promise.all([
    // 4. Bulletins non publiés (de l'année active) → prof principal
    prisma.bulletin.findMany({
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
            id: true, nom: true, prenom: true,
            classe: { select: { id: true, nom: true, profPrincipalId: true } },
          },
        },
        periode: { select: { nom: true } },
      },
      take: 200,
    }),

    // 5. Incidents ouverts (survenus dans l'année active)
    prisma.incident.findMany({
      where: {
        tenantId,
        statut: "OUVERT",
        date: {
          gte: fenetreDebut ?? new Date(0),
          lte: maintenant,
        },
        ...siteFilterForModel("incident", claims),
      },
      select: {
        id: true, type: true, gravite: true,
        eleve: {
          select: {
            id: true, nom: true, prenom: true,
            classe: { select: { id: true, nom: true, profPrincipalId: true } },
          },
        },
      },
      take: 200,
    }),

    // 6. Absences en attente de justification (dans l'année active)
    prisma.absence.findMany({
      where: {
        tenantId,
        statut: "EN_ATTENTE",
        date: {
          gte: fenetreDebut ?? new Date(0),
          lte: maintenant,
        },
        ...siteFilterForModel("absence", claims),
      },
      select: {
        id: true, date: true,
        eleve: {
          select: {
            id: true, nom: true, prenom: true,
            classe: { select: { id: true, nom: true, profPrincipalId: true } },
          },
        },
      },
      take: 200,
    }),
  ]);

  // ── Recherche des profs principaux pour les thèmes prof principal ──
  // On collecte les profPrincipalId uniques depuis bulletins, incidents, absences.
  const profPrincipalIds = new Set<string>();
  for (const b of bulletinsNonPublies) {
    if (b.eleve.classe?.profPrincipalId) profPrincipalIds.add(b.eleve.classe.profPrincipalId);
  }
  for (const i of incidentsOuverts) {
    if (i.eleve.classe?.profPrincipalId) profPrincipalIds.add(i.eleve.classe.profPrincipalId);
  }
  for (const a of absencesEnAttente) {
    if (a.eleve.classe?.profPrincipalId) profPrincipalIds.add(a.eleve.classe.profPrincipalId);
  }

  const profsPrincipaux = profPrincipalIds.size > 0
    ? await prisma.enseignant.findMany({
        where: {
          id: { in: Array.from(profPrincipalIds) },
          tenantId,
          ...siteFilterForModel("enseignant", claims),
        },
        select: { id: true, user: { select: { name: true } } },
      })
    : [];

  const profPrincipalMap = new Map<string, string>(
    profsPrincipaux.map((p) => [p.id, p.user?.name ?? "Enseignant"])
  );

  // ── Recherche des enseignants pour les évaluations sans notes ──
  // L'évaluation n'a pas d'enseignantId direct : on cherche via
  // AffectationEnseignant (source principale) puis EmploiTemps (repli).
  const evalKeys = new Set(
    evalsSansNotes.map((e) => `${e.classeId}|${e.matiereId}`)
  );

  // Source principale : AffectationEnseignant
  const affectationLinks = evalKeys.size > 0
    ? await prisma.affectationEnseignant.findMany({
        where: {
          tenantId,
          ...(anneeLibelle ? { classe: { annee: anneeLibelle } } : {}),
        },
        select: {
          classeId: true, matiereId: true,
          enseignantId: true,
          enseignant: { select: { id: true, user: { select: { name: true } } } },
        },
      })
    : [];

  // Source secondaire : EmploiTemps (repli pour les données pré-migration)
  const emploiLinks = evalKeys.size > 0
    ? await prisma.emploiTemps.findMany({
        where: {
          tenantId,
          ...(anneeLibelle ? { annee: anneeLibelle } : {}),
          ...siteFilterForModel("emploiTemps", claims),
        },
        select: {
          classeId: true, matiereId: true,
          enseignantId: true,
          enseignant: { select: { id: true, user: { select: { name: true } } } },
        },
        distinct: ["classeId", "matiereId", "enseignantId"],
      })
    : [];

  const enseignantParClasseMatiere = new Map<string, EnseignantAvecUser>();
  // D'abord les affectations (source de vérité)
  for (const a of affectationLinks) {
    const key = `${a.classeId}|${a.matiereId}`;
    if (!enseignantParClasseMatiere.has(key) && a.enseignant) {
      enseignantParClasseMatiere.set(key, a.enseignant);
    }
  }
  // Puis l'emploi du temps en repli
  for (const e of emploiLinks) {
    const key = `${e.classeId}|${e.matiereId}`;
    if (!enseignantParClasseMatiere.has(key) && e.enseignant) {
      enseignantParClasseMatiere.set(key, e.enseignant);
    }
  }

  // ── Normalisation par thème ────────────────────────────────────

  // Helper : regrouper par personne
  function grouperParPersonne<T>(
    items: T[],
    getPersonne: (item: T) => { id: string; nom: string } | null,
    getDetail: (item: T) => string
  ): PersonneEnRetard[] {
    const map = new Map<string, PersonneEnRetard>();
    for (const item of items) {
      const personne = getPersonne(item);
      if (!personne) continue;
      const existing = map.get(personne.id) ?? {
        id: personne.id,
        nom: personne.nom,
        count: 0,
        details: [],
      };
      existing.count++;
      const detail = getDetail(item);
      if (detail && existing.details.length < 5) {
        existing.details.push(detail);
      }
      map.set(personne.id, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }

  // Thème 1 : Saisie des notes
  const personnesSaisie = grouperParPersonne(
    evalsSansNotes,
    (e) => {
      const ens = enseignantParClasseMatiere.get(`${e.classeId}|${e.matiereId}`);
      if (ens) return { id: ens.id, nom: ens.user?.name ?? "Enseignant" };
      // Fallback : prof principal de la classe
      if (e.classe?.profPrincipalId) {
        return { id: e.classe.profPrincipalId, nom: profPrincipalMap.get(e.classe.profPrincipalId) ?? "Prof principal" };
      }
      return null;
    },
    (e) => `${e.classe?.nom ?? "?"} · ${e.matiere?.nom ?? "?"} · ${e.titre}`
  );

  // Thème 2 : Validation des séances
  const personnesSeances = grouperParPersonne(
    seancesPlanifiees,
    (s) => s.enseignant
      ? { id: s.enseignant.id, nom: s.enseignant.user?.name ?? "Enseignant" }
      : null,
    (s) => `${s.classe?.nom ?? "?"} · ${s.matiere?.nom ?? "?"}`
  );

  // Thème 3 : Correction des devoirs
  const personnesDevoirs = grouperParPersonne(
    devoirsARendre,
    (d) => d.enseignant
      ? { id: d.enseignant.id, nom: d.enseignant.user?.name ?? "Enseignant" }
      : null,
    (d) => `${d.classe?.nom ?? "?"} · ${d.titre}`
  );

  // Thème 4 : Publication des bulletins
  const personnesBulletins = grouperParPersonne(
    bulletinsNonPublies,
    (b) => {
      const ppId = b.eleve.classe?.profPrincipalId;
      if (!ppId) return null;
      return { id: ppId, nom: profPrincipalMap.get(ppId) ?? "Prof principal" };
    },
    (b) => `${b.eleve.classe?.nom ?? "?"} · ${b.eleve.prenom} ${b.eleve.nom} · ${b.periode?.nom ?? ""}`
  );

  // Thème 5 : Traitement des incidents
  const personnesIncidents = grouperParPersonne(
    incidentsOuverts,
    (i) => {
      const ppId = i.eleve.classe?.profPrincipalId;
      if (!ppId) return null;
      return { id: ppId, nom: profPrincipalMap.get(ppId) ?? "Prof principal" };
    },
    (i) => `${i.eleve.classe?.nom ?? "?"} · ${i.eleve.prenom} ${i.eleve.nom} · ${i.type} (gravité ${i.gravite})`
  );

  // Thème 6 : Justification des absences
  const personnesAbsences = grouperParPersonne(
    absencesEnAttente,
    (a) => {
      const ppId = a.eleve.classe?.profPrincipalId;
      if (!ppId) return null;
      return { id: ppId, nom: profPrincipalMap.get(ppId) ?? "Prof principal" };
    },
    (a) => `${a.eleve.classe?.nom ?? "?"} · ${a.eleve.prenom} ${a.eleve.nom}`
  );

  // ── Construction des thèmes ────────────────────────────────────
  const themes: ThemeRetard[] = [];

  if (personnesSaisie.length > 0) {
    themes.push({
      key: "saisie-notes",
      label: "Saisie des notes",
      total: personnesSaisie.reduce((a, p) => a + p.count, 0),
      nbPersonnes: personnesSaisie.length,
      personnes: personnesSaisie,
      href: "/evaluations",
      niveau: "critique",
    });
  }

  if (personnesSeances.length > 0) {
    themes.push({
      key: "validation-seances",
      label: "Validation des séances",
      total: personnesSeances.reduce((a, p) => a + p.count, 0),
      nbPersonnes: personnesSeances.length,
      personnes: personnesSeances,
      href: "/curriculum",
      niveau: "important",
    });
  }

  if (personnesDevoirs.length > 0) {
    themes.push({
      key: "correction-devoirs",
      label: "Correction des devoirs",
      total: personnesDevoirs.reduce((a, p) => a + p.count, 0),
      nbPersonnes: personnesDevoirs.length,
      personnes: personnesDevoirs,
      href: "/cahier-de-texte",
      niveau: "modere",
    });
  }

  if (personnesBulletins.length > 0) {
    themes.push({
      key: "publication-bulletins",
      label: "Publication des bulletins",
      total: personnesBulletins.reduce((a, p) => a + p.count, 0),
      nbPersonnes: personnesBulletins.length,
      personnes: personnesBulletins,
      href: "/notes/bulletins",
      niveau: "critique",
    });
  }

  if (personnesIncidents.length > 0) {
    themes.push({
      key: "traitement-incidents",
      label: "Traitement des incidents",
      total: personnesIncidents.reduce((a, p) => a + p.count, 0),
      nbPersonnes: personnesIncidents.length,
      personnes: personnesIncidents,
      href: "/vie-scolaire",
      niveau: "important",
    });
  }

  if (personnesAbsences.length > 0) {
    themes.push({
      key: "justification-absences",
      label: "Justification des absences",
      total: personnesAbsences.reduce((a, p) => a + p.count, 0),
      nbPersonnes: personnesAbsences.length,
      personnes: personnesAbsences,
      href: "/absences",
      niveau: "modere",
    });
  }

  return themes;
}
