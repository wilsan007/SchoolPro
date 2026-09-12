import prisma from "@/lib/prisma";
import { siteFilterForModel, siteFilterForRelation, type SessionSiteClaims } from "@/lib/site-scope";
import { semaineScolaire } from "@/lib/learnos/planification";
import { anneeActiveId, getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

// ---------------------------------------------------------------------------
// Exécution des outils — requêtes Prisma déterministes, filtrées par site
// ---------------------------------------------------------------------------

export async function analyserEffectifs(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string,
  anneeCourante?: string | null
): Promise<unknown> {
  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  if (dimension === "total") {
    const total = await prisma.eleve.count({
      where: {
        tenantId,
        statut: "ACTIF",
        deletedAt: null,
        ...siteFilterForModel("eleve", claims),
      },
    });
    return { total, dimension: "total" };
  }

  if (dimension === "par_classe") {
    const classes = await prisma.classe.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(annee ? { annee: annee } : {}),
        ...siteFilterForModel("classe", claims),
      },
      select: {
        id: true,
        nom: true,
        niveau: true,
        _count: { select: { eleves: { where: { statut: "ACTIF", deletedAt: null } } } },
      },
      orderBy: { niveau: "asc" },
    });
    return {
      dimension: "par_classe",
      classes: classes.map((c) => ({ classe: c.nom, niveau: c.niveau, effectif: c._count.eleves })),
    };
  }

  if (dimension === "par_niveau") {
    const eleves = await prisma.eleve.findMany({
      where: {
        tenantId,
        statut: "ACTIF",
        deletedAt: null,
        ...siteFilterForModel("eleve", claims),
      },
      select: { classe: { select: { niveau: true } } },
    });
    const parNiveau = new Map<string, number>();
    for (const e of eleves) {
      const n = e.classe?.niveau ?? "Non assigné";
      parNiveau.set(n, (parNiveau.get(n) ?? 0) + 1);
    }
    return {
      dimension: "par_niveau",
      niveaux: [...parNiveau.entries()].map(([niveau, effectif]) => ({ niveau, effectif })),
    };
  }

  if (dimension === "par_site") {
    const sites = await prisma.site.findMany({
      where: { tenantId },
      select: {
        id: true,
        nom: true,
        _count: { select: { eleves: { where: { statut: "ACTIF", deletedAt: null } } } },
      },
    });
    return {
      dimension: "par_site",
      sites: sites.map((s) => ({ site: s.nom, effectif: s._count.eleves })),
    };
  }

  return { erreur: "Dimension non reconnue" };
}

export async function analyserNotes(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string,
  matiereNom?: string,
  anneeCourante?: string | null
): Promise<unknown> {
  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  if (dimension === "moyenne_par_matiere") {
    const where = {
      tenantId,
      ...(annee ? { classe: { annee: annee } } : {}),
      ...siteFilterForRelation(claims, "classe"),
      ...(matiereNom ? { matiere: { nom: { contains: matiereNom, mode: "insensitive" as const } } } : {}),
    };
    const notes = await prisma.note.findMany({
      where,
      select: { valeur: true, noteMax: true, matiere: { select: { nom: true } } },
    });
    const parMatiere = new Map<string, { somme: number; count: number }>();
    for (const n of notes) {
      const key = n.matiere.nom;
      const normalized = (n.valeur / n.noteMax) * 20;
      const existing = parMatiere.get(key) ?? { somme: 0, count: 0 };
      existing.somme += normalized;
      existing.count++;
      parMatiere.set(key, existing);
    }
    return {
      dimension: "moyenne_par_matiere",
      matieres: [...parMatiere.entries()].map(([matiere, { somme, count }]) => ({
        matiere,
        moyenne: count > 0 ? Math.round((somme / count) * 100) / 100 : null,
        nombreNotes: count,
      })),
    };
  }

  if (dimension === "eleves_en_difficulte") {
    const recommandations = await prisma.recommandation.findMany({
      where: {
        tenantId,
        statut: "OBLIGATOIRE",
        resolueLe: null,
        ...(annee ? { eleve: { classe: { annee: annee } } } : {}),
        ...siteFilterForModel("recommandation", claims),
      },
      select: { eleveId: true },
      distinct: ["eleveId"],
    });
    return {
      dimension: "eleves_en_difficulte",
      nombreEleves: recommandations.length,
    };
  }

  if (dimension === "moyenne_par_classe") {
    const classes = await prisma.classe.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(annee ? { annee: annee } : {}),
        ...siteFilterForModel("classe", claims),
      },
      select: {
        id: true,
        nom: true,
        niveau: true,
        notes: { select: { valeur: true, noteMax: true } },
      },
      orderBy: { niveau: "asc" },
    });
    const result = classes.map((c) => {
      const notes = c.notes;
      const moyennes = notes.map((n) => (n.valeur / n.noteMax) * 20);
      const moyenne = moyennes.length > 0 ? moyennes.reduce((s, v) => s + v, 0) / moyennes.length : null;
      return {
        classe: c.nom,
        niveau: c.niveau,
        moyenne: moyenne !== null ? Math.round(moyenne * 100) / 100 : null,
        nombreNotes: notes.length,
      };
    });
    return { dimension: "moyenne_par_classe", classes: result };
  }

  if (dimension === "evolution") {
    // Comparaison des moyennes entre la première et la dernière période de
    // l'année qui a des notes. On cherche d'abord l'année courante, mais si
    // elle n'a pas de notes (ex: année nouvellement créée sans saisie), on
    // remonte à l'année la plus récente qui en a.
    const annees = await prisma.anneesScolaires.findMany({
      where: { tenantId },
      select: { id: true, libelle: true, isCurrent: true },
      orderBy: { libelle: "desc" },
    });

    let anneeUtilisee: { id: string; libelle: string } | null = null;
    for (const an of annees) {
      const periodes = await prisma.periode.findMany({
        where: { anneeId: an.id },
        select: { id: true },
      });
      if (periodes.length === 0) continue;
      const notesCount = await prisma.note.count({
        where: { tenantId, periodeId: { in: periodes.map((p) => p.id) }, ...(annee ? { classe: { annee: annee } } : {}), ...siteFilterForRelation(claims, "classe") },
      });
      if (notesCount > 0) {
        anneeUtilisee = an;
        break;
      }
    }

    if (!anneeUtilisee) {
      return {
        dimension: "evolution",
        message: "Aucune année avec des notes n'a été trouvée pour ce tenant.",
      };
    }

    const periodes = await prisma.periode.findMany({
      where: { anneeId: anneeUtilisee.id },
      orderBy: { numero: "asc" },
      select: { id: true, nom: true, numero: true },
    });
    if (periodes.length < 2) {
      return { dimension: "evolution", message: "Pas assez de périodes pour comparer l'évolution" };
    }

    const premiere = periodes[0];
    const derniere = periodes[periodes.length - 1];

    // Moyennes par élève pour la première période (Note a periodeId directement)
    const notesPremiere = await prisma.note.findMany({
      where: {
        tenantId,
        ...(annee ? { classe: { annee: annee } } : {}),
        ...siteFilterForRelation(claims, "classe"),
        periodeId: premiere.id,
      },
      select: { eleveId: true, valeur: true, noteMax: true },
    });
    // Moyennes par élève pour la dernière période
    const notesDerniere = await prisma.note.findMany({
      where: {
        tenantId,
        ...(annee ? { classe: { annee: annee } } : {}),
        ...siteFilterForRelation(claims, "classe"),
        periodeId: derniere.id,
      },
      select: { eleveId: true, valeur: true, noteMax: true },
    });

    const moyenneParEleve = (notes: typeof notesPremiere) => {
      const map = new Map<string, { somme: number; count: number }>();
      for (const n of notes) {
        const normalized = (n.valeur / n.noteMax) * 20;
        const existing = map.get(n.eleveId) ?? { somme: 0, count: 0 };
        existing.somme += normalized;
        existing.count++;
        map.set(n.eleveId, existing);
      }
      const result = new Map<string, number>();
      for (const [id, { somme, count }] of map) {
        if (count > 0) result.set(id, somme / count);
      }
      return result;
    };

    const moyennesPremiere = moyenneParEleve(notesPremiere);
    const moyennesDerniere = moyenneParEleve(notesDerniere);

    let enProgression = 0;
    let enBaisse = 0;
    let stable = 0;
    let totalCompare = 0;
    const deltas: number[] = [];

    for (const [eleveId, m1] of moyennesPremiere) {
      const m2 = moyennesDerniere.get(eleveId);
      if (m2 === undefined) continue;
      totalCompare++;
      const delta = m2 - m1;
      deltas.push(delta);
      if (delta > 0.5) enProgression++;
      else if (delta < -0.5) enBaisse++;
      else stable++;
    }

    const pourcentageBaisse = totalCompare > 0 ? Math.round((enBaisse / totalCompare) * 100) : 0;
    const pourcentageProgression = totalCompare > 0 ? Math.round((enProgression / totalCompare) * 100) : 0;
    const pourcentageStable = totalCompare > 0 ? Math.round((stable / totalCompare) * 100) : 0;

    // Répartition par classe des élèves en baisse
    const elevesEnBaisse: string[] = [];
    for (const [eleveId, m1] of moyennesPremiere) {
      const m2 = moyennesDerniere.get(eleveId);
      if (m2 !== undefined && m2 - m1 < -0.5) elevesEnBaisse.push(eleveId);
    }

    let repartitionParClasse: { classe: string; nombre: number }[] = [];
    if (elevesEnBaisse.length > 0) {
      const eleves = await prisma.eleve.findMany({
        where: {
          id: { in: elevesEnBaisse },
          tenantId,
          ...siteFilterForModel("eleve", claims),
        },
        select: { classe: { select: { nom: true } } },
      });
      const parClasse = new Map<string, number>();
      for (const e of eleves) {
        const nom = e.classe?.nom ?? "Non assigné";
        parClasse.set(nom, (parClasse.get(nom) ?? 0) + 1);
      }
      repartitionParClasse = [...parClasse.entries()].map(([classe, nombre]) => ({ classe, nombre }));
    }

    return {
      dimension: "evolution",
      periodeDebut: premiere.nom,
      periodeFin: derniere.nom,
      totalElevesCompare: totalCompare,
      enProgression,
      enBaisse,
      stable,
      pourcentageBaisse,
      pourcentageProgression,
      pourcentageStable,
      repartitionBaisseParClasse: repartitionParClasse,
    };
  }

  // Fallback générique.
  return { dimension, message: "Analyse en cours de développement pour cette dimension." };
}

export async function analyserAbsences(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string,
  maintenant: Date = new Date(),
  anneeCourante?: string | null
): Promise<unknown> {
  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  if (dimension === "taux_global") {
    const totalEleves = await prisma.eleve.count({
      where: {
        tenantId,
        statut: "ACTIF",
        deletedAt: null,
        ...siteFilterForModel("eleve", claims),
      },
    });
    const debutPeriode = new Date(maintenant);
    debutPeriode.setDate(debutPeriode.getDate() - 30);

    const totalAbsences = await prisma.absence.count({
      where: {
        tenantId,
        date: { gte: debutPeriode, lte: maintenant },
        ...(annee ? { eleve: { classe: { annee: annee } } } : {}),
        ...siteFilterForModel("absence", claims),
      },
    });

    const taux = totalEleves > 0 ? Math.round((totalAbsences / (totalEleves * 30)) * 1000) / 10 : 0;
    return {
      dimension: "taux_global",
      tauxAbsenteisme: taux,
      totalAbsences30j: totalAbsences,
      totalEleves,
    };
  }

  if (dimension === "eleves_chroniques") {
    // Élèves avec plus de 20% d'absences sur les 30 derniers jours
    const debutPeriode = new Date(maintenant);
    debutPeriode.setDate(debutPeriode.getDate() - 30);

    const totalEleves = await prisma.eleve.count({
      where: {
        tenantId,
        statut: "ACTIF",
        deletedAt: null,
        ...siteFilterForModel("eleve", claims),
      },
    });

    // Compter les absences par élève (sans groupBy having — incompatible avec le filtre site)
    const absences = await prisma.absence.findMany({
      where: {
        tenantId,
        date: { gte: debutPeriode },
        ...(annee ? { eleve: { classe: { annee: annee } } } : {}),
        ...siteFilterForModel("absence", claims),
      },
      select: { eleveId: true },
    });

    const compteParEleve = new Map<string, number>();
    for (const a of absences) {
      compteParEleve.set(a.eleveId, (compteParEleve.get(a.eleveId) ?? 0) + 1);
    }

    // ~20% de 30 jours ≈ 6 absences
    const elevesChroniquesIds = [...compteParEleve.entries()]
      .filter(([, count]) => count >= 6)
      .map(([id]) => id);

    const elevesChroniques = elevesChroniquesIds.length;
    const pourcentage = totalEleves > 0 ? Math.round((elevesChroniques / totalEleves) * 100) : 0;

    // Répartition par classe
    let repartitionParClasse: { classe: string; nombre: number }[] = [];
    if (elevesChroniques > 0) {
      const eleves = await prisma.eleve.findMany({
        where: {
          id: { in: elevesChroniquesIds },
          tenantId,
          ...siteFilterForModel("eleve", claims),
        },
        select: { classe: { select: { nom: true } } },
      });
      const parClasse = new Map<string, number>();
      for (const e of eleves) {
        const nom = e.classe?.nom ?? "Non assigné";
        parClasse.set(nom, (parClasse.get(nom) ?? 0) + 1);
      }
      repartitionParClasse = [...parClasse.entries()].map(([classe, nombre]) => ({ classe, nombre }));
    }

    return {
      dimension: "eleves_chroniques",
      nombreElevesChroniques: elevesChroniques,
      totalEleves,
      pourcentage,
      repartitionParClasse,
    };
  }

  if (dimension === "par_classe") {
    const debutPeriode = new Date(maintenant);
    debutPeriode.setDate(debutPeriode.getDate() - 30);

    const classes = await prisma.classe.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(annee ? { annee: annee } : {}),
        ...siteFilterForModel("classe", claims),
      },
      select: {
        id: true,
        nom: true,
        niveau: true,
        _count: {
          select: {
            eleves: { where: { statut: "ACTIF", deletedAt: null } },
          },
        },
      },
      orderBy: { niveau: "asc" },
    });

    // Compter les absences par classe via les élèves
    const absences = await prisma.absence.findMany({
      where: {
        tenantId,
        date: { gte: debutPeriode, lte: maintenant },
        ...(annee ? { eleve: { classe: { annee: annee } } } : {}),
        ...siteFilterForModel("absence", claims),
      },
      select: { eleve: { select: { classeId: true } } },
    });

    const absencesParClasse = new Map<string, number>();
    for (const a of absences) {
      const classeId = a.eleve?.classeId;
      if (classeId) {
        absencesParClasse.set(classeId, (absencesParClasse.get(classeId) ?? 0) + 1);
      }
    }

    return {
      dimension: "par_classe",
      classes: classes.map((c) => ({
        classe: c.nom,
        niveau: c.niveau,
        effectif: c._count.eleves,
        absences30j: absencesParClasse.get(c.id) ?? 0,
        taux: c._count.eleves > 0
          ? Math.round(((absencesParClasse.get(c.id) ?? 0) / (c._count.eleves * 30)) * 1000) / 10
          : 0,
      })),
    };
  }

  return { dimension, message: "Analyse en cours de développement pour cette dimension." };
}

export async function analyserProgramme(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string,
  maintenant: Date = new Date()
): Promise<unknown> {
  if (dimension === "couverture_globale") {
    const aId = await anneeActiveId(tenantId);
    const annee = aId ? await prisma.anneesScolaires.findFirst({ where: { id: aId, tenantId }, select: { id: true, dateDebut: true } }) : null;
    if (!annee) return { dimension: "couverture_globale", message: "Aucune année active" };

    const semaine = semaineScolaire(maintenant, annee.dateDebut);
    const planifs = await prisma.planificationChapitre.findMany({
      where: {
        tenantId,
        anneeId: annee.id,
        ...siteFilterForModel("planificationChapitre", claims),
      },
      select: { statut: true, semaineFin: true },
    });

    const dus = planifs.filter((p) => p.semaineFin <= semaine);
    const traites = dus.filter((p) => p.statut === "TRAITE").length;
    const enCours = dus.filter((p) => p.statut === "EN_COURS").length;
    const enRetard = dus.filter((p) => p.statut === "PREVU").length;
    const couverture = dus.length > 0 ? Math.round((traites / dus.length) * 100) : 100;

    return {
      dimension: "couverture_globale",
      semaine,
      couverture,
      chapitresDus: dus.length,
      traites,
      enCours,
      enRetard,
    };
  }

  if (dimension === "retards") {
    const aId = await anneeActiveId(tenantId);
    const annee = aId ? await prisma.anneesScolaires.findFirst({ where: { id: aId, tenantId }, select: { id: true, dateDebut: true } }) : null;
    if (!annee) return { dimension: "retards", message: "Aucune année active" };

    const semaine = semaineScolaire(maintenant, annee.dateDebut);
    const retards = await prisma.planificationChapitre.findMany({
      where: {
        tenantId,
        anneeId: annee.id,
        ...siteFilterForModel("planificationChapitre", claims),
        statut: "PREVU",
        semaineFin: { lt: semaine },
      },
      select: {
        chapitre: { select: { nom: true, matiere: { select: { nom: true } } } },
        semaineFin: true,
      },
    });

    return {
      dimension: "retards",
      nombreRetards: retards.length,
      retards: retards.map((r) => ({
        chapitre: r.chapitre.nom,
        matiere: r.chapitre.matiere.nom,
        semainePrevue: r.semaineFin,
        semaineActuelle: semaine,
      })),
    };
  }

  if (dimension === "predictions_difficulte") {
    const aId = await anneeActiveId(tenantId);
    const annee = aId ? await prisma.anneesScolaires.findFirst({ where: { id: aId, tenantId }, select: { id: true } }) : null;
    if (!annee) return { dimension: "predictions_difficulte", message: "Aucune année active" };

    const predictions = await prisma.predictionDifficulte.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("predictionDifficulte", claims),
      },
      select: {
        predictionCorrecte: true,
        ecart: true,
        chapitre: { select: { nom: true, matiere: { select: { nom: true } } } },
      },
    });

    const total = predictions.length;
    const correctes = predictions.filter((p) => p.predictionCorrecte === true).length;
    const incorrectes = predictions.filter((p) => p.predictionCorrecte === false).length;
    const enAttente = predictions.filter((p) => p.predictionCorrecte === null).length;
    const precision = total > 0 ? Math.round((correctes / total) * 100) : 0;

    return {
      dimension: "predictions_difficulte",
      totalPredictions: total,
      correctes,
      incorrectes,
      enAttente,
      precision,
    };
  }

  return { dimension, message: "Analyse en cours de développement pour cette dimension." };
}

export async function analyserFinances(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  const anneeId = await anneeActiveId(tenantId);
  if (dimension === "impayes_total") {
    const facturesImpayees = await prisma.facture.findMany({
      where: {
        tenantId,
        statut: { in: ["EN_ATTENTE", "EN_RETARD"] },
        ...(anneeId ? { anneeId } : {}),
        ...siteFilterForModel("facture", claims),
      },
      select: { montant: true },
    });
    const total = facturesImpayees.reduce((s, f) => s + (f.montant ?? 0), 0);
    return {
      dimension: "impayes_total",
      nombreImpayes: facturesImpayees.length,
      montantTotal: total,
    };
  }

  if (dimension === "impayes_par_classe") {
    const factures = await prisma.facture.findMany({
      where: {
        tenantId,
        statut: { in: ["EN_ATTENTE", "EN_RETARD"] },
        ...(anneeId ? { anneeId } : {}),
        ...siteFilterForModel("facture", claims),
      },
      select: {
        montant: true,
        eleve: { select: { classe: { select: { nom: true, niveau: true } } } },
      },
    });
    const parClasse = new Map<string, { nombre: number; montant: number }>();
    for (const f of factures) {
      const nom = f.eleve?.classe?.nom ?? "Non assigné";
      const existing = parClasse.get(nom) ?? { nombre: 0, montant: 0 };
      existing.nombre++;
      existing.montant += f.montant ?? 0;
      parClasse.set(nom, existing);
    }
    return {
      dimension: "impayes_par_classe",
      classes: [...parClasse.entries()].map(([classe, { nombre, montant }]) => ({
        classe,
        nombreImpayes: nombre,
        montantTotal: montant,
      })),
    };
  }

  return { dimension, message: "Analyse en cours de développement pour cette dimension." };
}

export async function comparerSites(
  tenantId: string,
  _claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  const sites = await prisma.site.findMany({
    where: { tenantId },
    select: {
      id: true,
      nom: true,
      _count: {
        select: {
          eleves: { where: { statut: "ACTIF", deletedAt: null } },
        },
      },
    },
  });

  if (dimension === "effectifs") {
    return {
      dimension: "effectifs",
      sites: sites.map((s) => ({ site: s.nom, effectif: s._count.eleves })),
    };
  }

  return {
    dimension,
    sites: sites.map((s) => ({ site: s.nom, effectif: s._count.eleves })),
    message: "Comparaison détaillée en cours de développement.",
  };
}
