import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { GrilleKpi } from "@/components/learnos/GrilleKpi";
import { AlertesAnticipees } from "@/components/curriculum/PlanificationView";
import { AlerteDecalage } from "@/components/learnos/AlerteDecalage";
import { ActivityTimeline, type ActivityItemData } from "@/components/dashboard/ActivityTimeline";
import { DelaysByTheme, type ThemeRetardData } from "@/components/dashboard/DelaysByTheme";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { kpisDirection } from "@/lib/learnos/kpi";
import { getDemoNow } from "@/lib/demo-now";
import { anneeALaDate, getContexteAnnees } from "@/lib/annee-scolaire";
import { alertesAnticipees } from "@/lib/learnos/planification";
import { siteFilterForModel, isTenantWideRole, type SessionSiteClaims } from "@/lib/site-scope";
import { getActivityFeedAllPeriodes, type ActivityItem, type Periode } from "@/lib/activity-feed";
import { getTeacherDelays, type ThemeRetard } from "@/lib/teacher-delays";
import { TaskTimeline, type TacheData } from "@/components/taches/TaskTimeline";
import { synchroniserTachesAuto } from "@/lib/tache-engine";
import { Card, CardContent, CardHeader, CardTitle, AccentCard } from "@/components/ui/card";
import { FileText, AlertTriangle, ShieldAlert, UserX } from "lucide-react";
import { unstable_cache } from "next/cache";

// ── Cache pour les données below-the-fold ────────────────────────────
// L'activity feed (10 requêtes) et les retards enseignants (6 requêtes)
// sont coûteux et changent peu d'une minute à l'autre. On les met en cache
// 60s avec unstable_cache, clés par tenant + rôle + site + date simulée.
// Les Date sont sérialisées en ISO pour le cache et reconverties au retour.

type FeedCacheKey = string;

const getCachedActivityFeed = unstable_cache(
  async (
    _key: FeedCacheKey,
    tenantId: string,
    claims: SessionSiteClaims,
    maintenantKey: string,
    anneeId: string | null,
    anneeLibelle: string | null
  ) => {
    void _key;
    const result = await getActivityFeedAllPeriodes(
      tenantId, claims, new Date(maintenantKey), anneeId, anneeLibelle
    );
    // Sérialiser les Date en ISO pour que le cache puisse stocker du JSON.
    const serialized = {
      recent: result.recent.map((i) => ({ ...i, date: i.date.toISOString() })),
      aujourdhui: result.aujourdhui.map((i) => ({ ...i, date: i.date.toISOString() })),
      semaine: result.semaine.map((i) => ({ ...i, date: i.date.toISOString() })),
      mois: result.mois.map((i) => ({ ...i, date: i.date.toISOString() })),
    };
    return serialized;
  },
  ["direction-activity-feed"],
  { revalidate: 60, tags: ["direction-activity-feed"] }
);

const getCachedTeacherDelays = unstable_cache(
  async (
    _key: FeedCacheKey,
    tenantId: string,
    claims: SessionSiteClaims,
    maintenantKey: string,
    anneeId: string | null,
    anneeDateDebut: string | null
  ) => {
    void _key;
    const anneePasse = anneeId && anneeDateDebut
      ? { id: anneeId, dateDebut: new Date(anneeDateDebut) }
      : null;
    return getTeacherDelays(tenantId, claims, new Date(maintenantKey), anneePasse);
  },
  ["direction-teacher-delays"],
  { revalidate: 60, tags: ["direction-teacher-delays"] }
);

/**
 * Espace de pilotage — direction et chef d'établissement.
 *
 * Répond à trois questions, dans cet ordre : qu'est-ce qui ne va pas, sur quoi
 * agir avant qu'il ne soit trop tard, où en sommes-nous. Un chiffre qui
 * n'appelle aucune décision n'a pas sa place ici.
 */
export default async function DirectionPage() {
  const [session, t] = await Promise.all([auth(), getTranslations("learnos.kpi")]);
  await guardPage(session);

  const tenantId = session!.user.tenantId!;
  const claims = session!.user;
  const role = claims.role;

  const maintenant = await getDemoNow();
  // Contexte annuel : en période estivale, anneeActive = année à venir (isCurrent)
  // et anneeEcoulee = année clôturée (pour bulletins et paiements en retard).
  const ctx = await getContexteAnnees(tenantId);
  const annee = ctx.anneeActive;
  const anneeId = annee?.id;
  const fenetreDebut = annee?.dateDebut;
  // Batch 1 (critical, needed for first paint) — kpisDirection (5 requêtes)
  // + alertesAnticipees (3 requêtes) = 8 requêtes concurrentes max.
  const [kpis, alertes] = await Promise.all([
    kpisDirection(tenantId, claims, maintenant),
    anneeId ? alertesAnticipees(tenantId, anneeId, claims, maintenant) : Promise.resolve([]),
  ]);

  const serialiser = (items: ActivityItem[]): ActivityItemData[] =>
    items.map((i) => ({
      id: i.id, type: i.type, titre: i.titre, description: i.description,
      date: i.date.toISOString(), href: i.href,
    }));

  // ──────────────────────────────────────────────────────────────
  // 1. Comparateur inter-sites (TENANT_ADMIN et SUPER_ADMIN seulement)
  // ──────────────────────────────────────────────────────────────
  const peutComparerSites = isTenantWideRole(role) && !claims.siteId;

  let comparateur: { id: string; nom: string; code: string | null; effectif: number; absences: number; facturesRetard: number }[] = [];
  if (peutComparerSites) {
    const sites = await prisma.site.findMany({
      where: { tenantId, actif: true },
      select: { id: true, nom: true, code: true },
    });

    // Premier jour du mois contenant `maintenant` — respecte la Time Machine.
    const debutMois = new Date(maintenant);
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);

    const siteIds = sites.map((s) => s.id);

    // 3 requêtes groupBy au lieu de 3N requêtes (N = nombre de sites).
    const [effectifs, absencesParSite, facturesParSite] = await Promise.all([
      prisma.eleve.groupBy({
        by: ["siteId"],
        where: {
          tenantId,
          siteId: { in: siteIds },
          statut: "ACTIF",
          deletedAt: null,
          ...siteFilterForModel("eleve", claims),
        },
        _count: true,
      }),
      prisma.absence.groupBy({
        by: ["eleveId"],
        where: {
          tenantId,
          statut: "INJUSTIFIEE",
          date: { gte: debutMois, lte: maintenant },
          eleve: { siteId: { in: siteIds } },
          ...siteFilterForModel("absence", claims),
        },
        _count: true,
      }),
      prisma.facture.groupBy({
        by: ["siteId"],
        where: {
          tenantId,
          ...(ctx.phase !== "normale" && ctx.anneeEcoulee
            ? { anneeId: { in: [anneeId, ctx.anneeEcoulee.id].filter(Boolean) as string[] } }
            : anneeId ? { anneeId } : {}),
          siteId: { in: siteIds },
          statut: "EN_RETARD",
          echeance: {
            lt: maintenant,
          },
          ...siteFilterForModel("facture", claims),
        },
        _count: true,
      }),
    ]);

    // Pour les absences, il faut retrouver le site de chaque élève.
    // On a groupé par eleveId car absence n'a pas toujours siteId.
    // On fait une seule requête pour mapper eleveId → siteId.
    const eleveIdsAvecAbsences = absencesParSite.map((a) => a.eleveId);
    const elevesSites = eleveIdsAvecAbsences.length > 0
      ? await prisma.eleve.findMany({
          where: {
            tenantId,
            id: { in: eleveIdsAvecAbsences },
            ...siteFilterForModel("eleve", claims),
          },
          select: { id: true, siteId: true },
        })
      : [];
    const absencesParSiteId = new Map<string, number>();
    const eleveToSite = new Map(elevesSites.map((e) => [e.id, e.siteId]));
    for (const a of absencesParSite) {
      const sid = eleveToSite.get(a.eleveId);
      if (sid) absencesParSiteId.set(sid, (absencesParSiteId.get(sid) ?? 0) + a._count);
    }

    const effectifMap = new Map(effectifs.map((e) => [e.siteId, e._count]));
    const factureMap = new Map(facturesParSite.map((f) => [f.siteId, f._count]));

    comparateur = sites.map((site) => ({
      id: site.id,
      nom: site.nom,
      code: site.code,
      effectif: effectifMap.get(site.id) ?? 0,
      absences: absencesParSiteId.get(site.id) ?? 0,
      facturesRetard: factureMap.get(site.id) ?? 0,
    }));
  }

  // ──────────────────────────────────────────────────────────────
  // 2. File de validation (TENANT_ADMIN et PRINCIPAL)
  // ──────────────────────────────────────────────────────────────
  const peutVoirFileValidation = role === "TENANT_ADMIN" || role === "SUPER_ADMIN" || role === "PRINCIPAL";

  let fileValidation: { bulletins: number; factures: number; incidents: number; remplacements: number; inscriptionsIncomplets: number; inscriptionsEnCours: number; inscriptionsCompletes: number; inscriptionsValides: number } | null = null;
  if (peutVoirFileValidation) {
    const [bulletins, factures, incidents, remplacements, inscriptionsParStatut] = await Promise.all([
      // Bulletin n'a pas de champ `statut` ni d'enum StatutBulletin :
      // `isPublie: false` correspond à « en attente de validation ».
      // Filtré par l'année active via la période.
      prisma.bulletin.count({
        where: {
          tenantId,
          isPublie: false,
          ...(anneeId ? { periode: { anneeId } } : {}),
          ...siteFilterForModel("bulletin", claims),
        },
      }),
      // Factures en retard : en période normale, celles de l'année active.
      // En période estivale, les retards de l'année écoulée sont aussi comptés.
      prisma.facture.count({
        where: {
          tenantId,
          ...(ctx.phase !== "normale" && ctx.anneeEcoulee
            ? { anneeId: { in: [anneeId, ctx.anneeEcoulee.id].filter(Boolean) as string[] } }
            : anneeId ? { anneeId } : {}),
          statut: "EN_RETARD",
          echeance: {
            lt: maintenant,
          },
          ...siteFilterForModel("facture", claims),
        },
      }),
      // Incidents ouverts : seulement ceux survenus avant `maintenant`
      // et dans la fenêtre de l'année active.
      prisma.incident.count({
        where: {
          tenantId,
          statut: "OUVERT",
          date: {
            gte: fenetreDebut ?? new Date(0),
            lte: maintenant,
          },
          ...siteFilterForModel("incident", claims),
        },
      }),
      // Remplacements proposés : seulement ceux dont la date est dans
      // la fenêtre de l'année active et avant `maintenant`.
      prisma.remplacementCours.count({
        where: {
          tenantId,
          statut: "PROPOSE",
          date: {
            gte: fenetreDebut ?? new Date(0),
            lte: maintenant,
          },
          ...siteFilterForModel("remplacementCours", claims),
        },
      }),
      // Dossiers d'inscription : un seul groupBy au lieu de 4 count séparés.
      // Récupère tous les statuts de dossier en une seule requête.
      prisma.candidature.groupBy({
        by: ["dossierStatut"],
        where: {
          tenantId,
          ...siteFilterForModel("candidature", claims),
        },
        _count: true,
      }),
    ]);
    // Mapper les résultats du groupBy vers les compteurs individuels.
    const inscriptionsMap = Object.fromEntries(
      inscriptionsParStatut.map((s) => [s.dossierStatut, s._count])
    );
    fileValidation = {
      bulletins,
      factures,
      incidents,
      remplacements,
      inscriptionsIncomplets: inscriptionsMap["INCOMPLET"] ?? 0,
      inscriptionsEnCours: inscriptionsMap["EN_COURS"] ?? 0,
      inscriptionsCompletes: inscriptionsMap["COMPLETE"] ?? 0,
      inscriptionsValides: inscriptionsMap["VALIDE"] ?? 0,
    };
  }

  // Batch 2 (below the fold) — séquentiel pour rester sous la limite du pool.
  // getActivityFeedAllPeriodes (10 requêtes) puis getTeacherDelays (6 requêtes).
  // En parallèle, on dépasserait les 15 connexions du mode session Supabase.
  // On passe anneeId/anneeLibelle déjà résolus pour éviter 2-3 requêtes DB redondantes.
  // Les deux appels sont mis en cache (60s) car ils sont coûteux (16 requêtes)
  // et changent peu d'une minute à l'autre.
  const anneeLibelle = annee?.libelle ?? null;
  const cacheKey = [tenantId, claims.role, claims.siteId ?? "all", maintenant.toISOString()].join(":");
  const [feedCache, retards] = await Promise.all([
    getCachedActivityFeed(cacheKey, tenantId, claims, maintenant.toISOString(), anneeId ?? null, anneeLibelle),
    getCachedTeacherDelays(cacheKey, tenantId, claims, maintenant.toISOString(), anneeId ?? null, annee?.dateDebut?.toISOString() ?? null),
  ]);

  // Reconvertir les dates ISO du cache en Date pour le serialiser.
  const itemsParPeriode = {
    recent: serialiser(feedCache.recent.map((i) => ({ ...i, date: new Date(i.date) }))),
    aujourdhui: serialiser(feedCache.aujourdhui.map((i) => ({ ...i, date: new Date(i.date) }))),
    semaine: serialiser(feedCache.semaine.map((i) => ({ ...i, date: new Date(i.date) }))),
    mois: serialiser(feedCache.mois.map((i) => ({ ...i, date: new Date(i.date) }))),
  };

  // ── Tâches auto-générées pour la direction ──
  // Auto-sync silencieux : régénère les tâches depuis l'état du système.
  try {
    await synchroniserTachesAuto(tenantId, claims);
  } catch (e) {
    console.error("[Direction page] Auto-sync tâches échoué:", e);
  }

  // La direction voit toutes les tâches du personnel (pas seulement les siennes).
  const tachesDirection = await prisma.tache.findMany({
    where: {
      tenantId,
      statut: { in: ["A_FAIRE", "EN_COURS"] },
      ...siteFilterForModel("tache", claims),
    },
    include: {
      assigneeA: { select: { id: true, name: true, email: true } },
      creePar: { select: { id: true, name: true } },
      classe: { select: { id: true, nom: true } },
      matiere: { select: { id: true, nom: true } },
    },
    orderBy: [
      { echeance: "asc" },
      { priorite: "desc" },
      { createdAt: "desc" },
    ],
    take: 200,
  });

  const tachesDirectionSerialisees: TacheData[] = tachesDirection.map((t) => ({
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
    assigneeA: t.assigneeA,
    creePar: t.creePar,
    classe: t.classe,
    matiere: t.matiere,
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titreDirection")}
        subtitle={t("sousTitreDirection")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 space-y-8 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
        {ctx.phase !== "normale" && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            <strong>
              {ctx.phase === "pre_rentree"
                ? `Rentrée dans ${ctx.joursAvantRentree} jours`
                : "Période estivale"}
            </strong>
            {" — "}
            Préparation de la rentrée {ctx.anneeAVenir?.libelle}
            {ctx.anneeEcoulee && (
              <>· Bulletins et paiements en retard de {ctx.anneeEcoulee.libelle} disponibles.</>
            )}
          </div>
        )}
        <GrilleKpi kpis={kpis} />
        {/* Les alertes anticipatives valent surtout pour la direction : c'est
            elle qui peut réorganiser un emploi du temps trois semaines avant. */}
        <AlertesAnticipees alertes={alertes} />

        {/* ── Alerte précoce de décalage pédagogique ──────────────── */}
        {/* Compare le programme prévu la semaine dernière avec ce qui a
            réellement été fait (déclarations enseignant + preuves élèves).
            Apparaît uniquement pour PRINCIPAL, TENANT_ADMIN, SUPER_ADMIN —
            la garde de page filtre déjà les autres rôles. */}
        <section className="space-y-3">
          <AlerteDecalage />
        </section>

        {/* ── File de validation ──────────────────────────────────── */}
        {fileValidation && (
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-semibold">{t("fileValidation")}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Link href="/notes/bulletins">
                <AccentCard accent="sky" className="h-full">
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4 text-vif-sky" />
                      {t("bulletinsAValider")}
                    </div>
                    <p className="text-3xl font-semibold font-data text-vif-sky">{fileValidation.bulletins}</p>
                  </CardContent>
                </AccentCard>
              </Link>

              <Link href="/facturation">
                <AccentCard accent="amber" className="h-full">
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle className="h-4 w-4 text-vif-amber" />
                      {t("facturesRetard")}
                    </div>
                    <p className="text-3xl font-semibold font-data text-vif-amber">{fileValidation.factures}</p>
                  </CardContent>
                </AccentCard>
              </Link>

              <Link href="/vie-scolaire">
                <AccentCard accent="rose" className="h-full">
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ShieldAlert className="h-4 w-4 text-vif-rose" />
                      {t("incidentsOuverts")}
                    </div>
                    <p className="text-3xl font-semibold font-data text-vif-rose">{fileValidation.incidents}</p>
                  </CardContent>
                </AccentCard>
              </Link>

              <Link href="/couverture">
                <AccentCard accent="violet" className="h-full">
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <UserX className="h-4 w-4 text-vif-violet" />
                      {t("postesNonCouverts")}
                    </div>
                    <p className="text-3xl font-semibold font-data text-vif-violet">{fileValidation.remplacements}</p>
                  </CardContent>
                </AccentCard>
              </Link>
            </div>
          </section>
        )}

        {/* ── Indicateurs dossiers d'inscription (secrétariat) ──────── */}
        {fileValidation && (
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-semibold">{t("inscriptionsDossiers")}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Link href="/secretariat/inscriptions">
                <AccentCard accent="rose" className="h-full">
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4 text-vif-rose" />
                      {t("dossiersIncomplets")}
                    </div>
                    <p className="text-3xl font-semibold font-data text-vif-rose">{fileValidation.inscriptionsIncomplets}</p>
                  </CardContent>
                </AccentCard>
              </Link>

              <Link href="/secretariat/inscriptions">
                <AccentCard accent="amber" className="h-full">
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4 text-vif-amber" />
                      {t("dossiersEnCours")}
                    </div>
                    <p className="text-3xl font-semibold font-data text-vif-amber">{fileValidation.inscriptionsEnCours}</p>
                  </CardContent>
                </AccentCard>
              </Link>

              <Link href="/secretariat/inscriptions">
                <AccentCard accent="sky" className="h-full">
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4 text-vif-sky" />
                      {t("dossiersCompletes")}
                    </div>
                    <p className="text-3xl font-semibold font-data text-vif-sky">{fileValidation.inscriptionsCompletes}</p>
                  </CardContent>
                </AccentCard>
              </Link>

              <Link href="/secretariat/inscriptions">
                <AccentCard accent="emerald" className="h-full">
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4 text-vif-emerald" />
                      {t("dossiersValides")}
                    </div>
                    <p className="text-3xl font-semibold font-data text-vif-emerald">{fileValidation.inscriptionsValides}</p>
                  </CardContent>
                </AccentCard>
              </Link>
            </div>
          </section>
        )}

        {/* ── Retards d'exécution des enseignants et profs principaux ── */}
        <section className="space-y-3">
          <h2 className="text-lg sm:text-xl font-semibold">{t("retardsExecution")}</h2>
          <DelaysByTheme themes={retards as ThemeRetardData[]} />
        </section>

        {/* ── Tâches du personnel (timeline par bucket temporel) ── */}
        {tachesDirectionSerialisees.length > 0 && (
          <section className="space-y-3">
            <TaskTimeline
              taches={tachesDirectionSerialisees}
              maintenant={maintenant.toISOString()}
              showSync
              compact
              title="Tâches du personnel"
            />
          </section>
        )}

        {/* ── Comparateur inter-sites ─────────────────────────────── */}
        {peutComparerSites && (
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-semibold">{t("comparateurSites")}</h2>
            {comparateur.length === 0 ? (
              <Card>
                <CardContent className="p-4 sm:p-6 text-sm text-muted-foreground">
                  {t("aucunSite")}
                </CardContent>
              </Card>
            ) : (
              <AccentCard accent="indigo">
                <CardHeader>
                  <CardTitle className="text-base">{t("comparateurSites")}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="px-4 py-3 font-medium">{t("site")}</th>
                          <th className="px-4 py-3 text-right font-medium">{t("effectif")}</th>
                          <th className="px-4 py-3 text-right font-medium">{t("absencesInjustifiees")}</th>
                          <th className="px-4 py-3 text-right font-medium">{t("facturesRetard")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparateur.map((site) => (
                          <tr key={site.id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="px-4 py-3 font-medium">
                              {site.nom}
                              {site.code && (
                                <span className="ml-2 text-xs text-muted-foreground">{site.code}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">{site.effectif}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{site.absences}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{site.facturesRetard}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </AccentCard>
            )}
          </section>
        )}

        {/* ── Timeline d'activité ─────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-lg sm:text-xl font-semibold">{t("activiteRecente")}</h2>
          <ActivityTimeline itemsParPeriode={itemsParPeriode} />
        </section>
      </div>
    </div>
  );
}
