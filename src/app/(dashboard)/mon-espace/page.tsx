import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { GrilleKpi } from "@/components/learnos/GrilleKpi";
import { ActionRubricGrid, type RubricData } from "@/components/dashboard/ActionRubric";
import { ActivityTimeline, type ActivityItemData } from "@/components/dashboard/ActivityTimeline";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { kpisEnseignant } from "@/lib/learnos/kpi";
import { getDemoNow } from "@/lib/demo-now";
import { isTeacherRole } from "@/lib/teacher-classes";
import { siteFilterForModel } from "@/lib/site-scope";
import { getTeacherCounts } from "@/lib/action-counts";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getClassesHierarchie } from "@/lib/classes-hierarchie";
import { getActivityFeed, type ActivityItem } from "@/lib/activity-feed";
import prisma from "@/lib/prisma";
import type { Jour, Role } from "@prisma/client";

/**
 * Espace de l'enseignant.
 *
 * Un enseignant n'a pas besoin d'un tableau de bord : il a besoin de savoir ce
 * qu'il doit faire cette semaine. Chaque indicateur pointe donc vers un écran
 * où agir, jamais vers une simple contemplation.
 *
 * Au-delà des KPI, deux sections opérationnelles :
 * 1. « Ma semaine » — planning des créneaux de l'enseignant, avec détection
 *    des chevauchements horaires mis en évidence en rouge.
 * 2. « Grille compétences » — élèves × compétences pour la première classe de
 *    l'enseignant, cellules colorées selon le niveau moyen (0..20).
 */
export default async function MonEspacePage() {
  const [session, t, tEspace] = await Promise.all([
    auth(),
    getTranslations("learnos.kpi"),
    getTranslations("monEspace"),
  ]);
  await guardPage(session);

  const role = session!.user.role as Role;
  // Un enseignant est borné à ses classes ; la direction voit tout.
  const maintenant = await getDemoNow();
  const tenantId = session!.user.tenantId!;
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const claims = session!.user;

  // Hiérarchie des classes avec scope enseignant + année + site intégrés.
  const hierarchie = await getClassesHierarchie(tenantId, claims, { anneeCourante });
  const hierarchieClasseIds = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => cls.id)));
  // Un enseignant est restreint à ses classes ; la direction (null) voit tout.
  const scopedClasseIds = isTeacherRole(role) ? hierarchieClasseIds : null;

  const [kpis, rubrics, feedRecent, feedAujourdhui, feedSemaine, feedMois] = await Promise.all([
    kpisEnseignant(
      tenantId,
      claims,
      session!.user.id,
      scopedClasseIds,
      maintenant
    ),
    getTeacherCounts(
      tenantId,
      claims,
      session!.user.id,
      scopedClasseIds
    ),
    getActivityFeed(tenantId, claims, "recent", maintenant),
    getActivityFeed(tenantId, claims, "aujourdhui", maintenant),
    getActivityFeed(tenantId, claims, "semaine", maintenant),
    getActivityFeed(tenantId, claims, "mois", maintenant),
  ]);

  const serialiser = (items: ActivityItem[]): ActivityItemData[] =>
    items.map((i) => ({
      id: i.id, type: i.type, titre: i.titre, description: i.description,
      date: i.date.toISOString(), href: i.href,
    }));

  const itemsParPeriode = {
    recent: serialiser(feedRecent),
    aujourdhui: serialiser(feedAujourdhui),
    semaine: serialiser(feedSemaine),
    mois: serialiser(feedMois),
  };

  // --------------------------------------------------------------
  // 1. Planning « ma semaine »
  // --------------------------------------------------------------
  // tenantId et claims sont déjà définis ci-dessus.

  // L'enseignant est recherché par userId+tenantId ; le filtrage par site est
  // appliqué via siteFilterForModel pour respecter l'isolation multi-sites.
  const enseignant = await prisma.enseignant.findFirst({
    where: {
      userId: session!.user.id,
      tenantId,
      ...siteFilterForModel("enseignant", claims),
    },
    select: { id: true },
  });

  type Creneau = {
    id: string;
    jour: Jour;
    heureDebut: string;
    heureFin: string;
    salle: string | null;
    matiere: { nom: string; couleur: string | null };
    classe: { nom: string };
  };

  let creneaux: Creneau[] = [];
  if (enseignant) {
    creneaux = await prisma.emploiTemps.findMany({
      where: {
        enseignantId: enseignant.id,
        tenantId,
        ...siteFilterForModel("emploiTemps", claims),
        ...(anneeCourante ? { annee: anneeCourante } : {}),
      },
      include: {
        matiere: { select: { nom: true, couleur: true } },
        classe: { select: { nom: true } },
      },
      orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
    });
  }

  // Ordre d'affichage des jours (la semaine commence le lundi).
  const ORDRE_JOURS: Jour[] = [
    "LUNDI",
    "MARDI",
    "MERCREDI",
    "JEUDI",
    "VENDREDI",
    "SAMEDI",
    "DIMANCHE",
  ];
  const LIBELLE_JOUR: Record<Jour, string> = {
    LUNDI: "Lundi",
    MARDI: "Mardi",
    MERCREDI: "Mercredi",
    JEUDI: "Jeudi",
    VENDREDI: "Vendredi",
    SAMEDI: "Samedi",
    DIMANCHE: "Dimanche",
  };

  // Détection des chevauchements : deux créneaux du même jour dont les plages
  // horaires se recoupent. La comparaison lexicographique fonctionne car les
  // heures sont au format "HH:MM".
  const chevauchementIds = new Set<string>();
  const parJour = new Map<Jour, Creneau[]>();
  for (const c of creneaux) {
    const liste = parJour.get(c.jour) ?? [];
    liste.push(c);
    parJour.set(c.jour, liste);
  }
  for (const liste of parJour.values()) {
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        const a = liste[i];
        const b = liste[j];
        if (a.heureDebut < b.heureFin && b.heureDebut < a.heureFin) {
          chevauchementIds.add(a.id);
          chevauchementIds.add(b.id);
        }
      }
    }
  }

  const creneauxTri = [...creneaux].sort(
    (a, b) =>
      ORDRE_JOURS.indexOf(a.jour) - ORDRE_JOURS.indexOf(b.jour) ||
      a.heureDebut.localeCompare(b.heureDebut)
  );

  // --------------------------------------------------------------
  // 2. Grille élèves × compétences (première classe de l'enseignant)
  // --------------------------------------------------------------
  // Récupère la première classe de l'enseignant (la plus petite
  // alphabétiquement). On s'appuie sur le scope déjà résolu ; à défaut on
  // interroge l'emploi du temps + les classes dont il est prof principal.
  let classeCible: { id: string; nom: string } | null = null;
  let eleves: { id: string; nom: string; prenom: string }[] = [];
  let competences: { id: string; code: string; libelle: string }[] = [];
  // Map « eleveId|competenceId » → niveau moyen (0..20).
  const niveaux = new Map<string, number>();

  if (enseignant) {
    // Classes de l'enseignant : via le scope restreint, sinon via une requête.
    let classeIdsDispo = scopedClasseIds;
    if (!classeIdsDispo || classeIdsDispo.length === 0) {
      const [emp, principals] = await Promise.all([
        prisma.emploiTemps.findMany({
          where: {
            enseignantId: enseignant.id,
            tenantId,
            ...siteFilterForModel("emploiTemps", claims),
            ...(anneeCourante ? { annee: anneeCourante } : {}),
          },
          select: { classeId: true },
          distinct: ["classeId"],
        }),
        prisma.classe.findMany({
          where: {
            profPrincipalId: enseignant.id,
            tenantId,
            ...siteFilterForModel("classe", claims),
          },
          select: { id: true },
        }),
      ]);
      classeIdsDispo = Array.from(
        new Set([
          ...emp.map((e) => e.classeId),
          ...principals.map((c) => c.id),
        ])
      );
    }

    if (classeIdsDispo.length > 0) {
      const classes = await prisma.classe.findMany({
        where: {
          id: { in: classeIdsDispo },
          tenantId,
          ...siteFilterForModel("classe", claims),
        },
        select: { id: true, nom: true },
        orderBy: { nom: "asc" },
      });
      classeCible = classes[0] ?? null;
    }

    if (classeCible) {
      const [elevesDb, competencesDb] = await Promise.all([
        prisma.eleve.findMany({
          where: {
            classeId: classeCible.id,
            tenantId,
            statut: "ACTIF",
            ...siteFilterForModel("eleve", claims),
            ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
          },
          select: { id: true, nom: true, prenom: true },
          orderBy: [{ nom: "asc" }, { prenom: "asc" }],
        }),
        prisma.competence.findMany({
          where: {
            tenantId,
            ...siteFilterForModel("competence", claims),
          },
          take: 10,
          orderBy: { code: "asc" },
          select: { id: true, code: true, libelle: true },
        }),
      ]);
      eleves = elevesDb;
      competences = competencesDb;

      // EvaluationCompetence n'expose ni eleveId ni niveau : elle relie une
      // Evaluation à une Competence. Le niveau par élève se calcule donc en
      // rejoignant les Notes de l'évaluation pour les élèves concernés, puis
      // en normalisant chaque note sur 20 et en moyennant.
      if (eleves.length > 0 && competences.length > 0) {
        const eleveIds = eleves.map((e) => e.id);
        const competenceIds = competences.map((c) => c.id);

        const evalComps = await prisma.evaluationCompetence.findMany({
          where: {
            tenantId,
            competenceId: { in: competenceIds },
            ...siteFilterForModel("evaluationCompetence", claims),
            ...(anneeCourante ? { evaluation: { classe: { annee: anneeCourante } } } : {}),
          },
          select: {
            competenceId: true,
            evaluation: {
              select: {
                notes: {
                  where: { eleveId: { in: eleveIds } },
                  select: { eleveId: true, valeur: true, noteMax: true },
                },
              },
            },
          },
        });

        const sommes = new Map<string, { total: number; count: number }>();
        for (const ec of evalComps) {
          for (const note of ec.evaluation.notes) {
            const key = `${note.eleveId}|${ec.competenceId}`;
            const max = note.noteMax || 20;
            const normalisee = (note.valeur / max) * 20;
            const cur = sommes.get(key) ?? { total: 0, count: 0 };
            cur.total += normalisee;
            cur.count += 1;
            sommes.set(key, cur);
          }
        }
        for (const [key, { total, count }] of sommes) {
          niveaux.set(key, count > 0 ? total / count : 0);
        }
      }
    }
  }

  const aDesEvaluations = eleves.length > 0 && competences.length > 0;

  // Couleur de la cellule selon le niveau (0..20).
  function couleurNiveau(n: number): string {
    if (n < 8) return "bg-red-100 text-red-700";
    if (n < 10) return "bg-orange-100 text-orange-700";
    if (n < 12) return "bg-yellow-100 text-yellow-700";
    if (n < 14) return "bg-lime-100 text-lime-700";
    return "bg-green-100 text-green-700";
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titreEnseignant")}
        subtitle={t("sousTitreEnseignant")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <GrilleKpi kpis={kpis} />

        {/* Rubriques d'action — files d'attente cliquables */}
        <section className="mt-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {tEspace("actionsATraiter")}
          </h2>
          <ActionRubricGrid rubrics={rubrics as RubricData[]} />
        </section>

        {/* Timeline d'activité */}
        <section className="mt-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {tEspace("activiteRecente")}
          </h2>
          <ActivityTimeline itemsParPeriode={itemsParPeriode} />
        </section>

        {/* 1. Planning « ma semaine » */}
        <section className="mt-6 sm:mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            {tEspace("maSemaine")}
          </h2>
          {creneauxTri.length === 0 ? (
            <p className="text-sm text-gray-500">{tEspace("aucunCours")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-[640px] w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">{tEspace("jour")}</th>
                    <th className="px-3 py-2 font-medium">{tEspace("heure")}</th>
                    <th className="px-3 py-2 font-medium">{tEspace("matiere")}</th>
                    <th className="px-3 py-2 font-medium">{tEspace("classe")}</th>
                    <th className="px-3 py-2 font-medium">{tEspace("salle")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {creneauxTri.map((c) => {
                    const enChevauchement = chevauchementIds.has(c.id);
                    return (
                      <tr
                        key={c.id}
                        className={enChevauchement ? "bg-red-50" : "bg-white"}
                      >
                        <td className="px-3 py-2 text-gray-700">
                          {LIBELLE_JOUR[c.jour]}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {c.heureDebut}–{c.heureFin}
                          {enChevauchement && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                              {tEspace("chevauchement")}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2">
                            {c.matiere.couleur && (
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: c.matiere.couleur }}
                              />
                            )}
                            <span className="text-gray-700">
                              {c.matiere.nom}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {c.classe.nom}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {c.salle ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 2. Grille élèves × compétences */}
        <section className="mt-6 sm:mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            {tEspace("grilleCompetences")}
            {classeCible && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                · {classeCible.nom}
              </span>
            )}
          </h2>
          {!aDesEvaluations ? (
            <p className="text-sm text-gray-500">
              {tEspace("aucuneEvaluation")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-[640px] w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-3 py-2 font-medium sticky left-0 bg-gray-50">
                      {tEspace("eleve")}
                    </th>
                    {competences.map((comp) => (
                      <th
                        key={comp.id}
                        className="px-3 py-2 font-medium whitespace-nowrap"
                        title={comp.libelle}
                      >
                        {comp.code}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {eleves.map((eleve) => (
                    <tr key={eleve.id} className="bg-white">
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap sticky left-0 bg-white">
                        {eleve.prenom} {eleve.nom}
                      </td>
                      {competences.map((comp) => {
                        const n = niveaux.get(`${eleve.id}|${comp.id}`);
                        return (
                          <td key={comp.id} className="px-3 py-2">
                            {n === undefined ? (
                              <span className="text-gray-300">—</span>
                            ) : (
                              <span
                                className={`inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-medium ${couleurNiveau(
                                  n
                                )}`}
                              >
                                {n.toFixed(1)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
