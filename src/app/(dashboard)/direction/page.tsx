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
import { alertesAnticipees } from "@/lib/learnos/planification";
import { siteFilterForModel, isTenantWideRole } from "@/lib/site-scope";
import { getActivityFeed, type ActivityItem } from "@/lib/activity-feed";
import { getTeacherDelays } from "@/lib/teacher-delays";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertTriangle, ShieldAlert, UserX } from "lucide-react";

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
  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId, isCurrent: true },
    select: { id: true },
  });

  const maintenant = await getDemoNow();
  const [kpis, alertes, feedRecent, feedAujourdhui, feedSemaine, feedMois, retards] = await Promise.all([
    kpisDirection(tenantId, claims, maintenant),
    annee ? alertesAnticipees(tenantId, annee.id, claims) : Promise.resolve([]),
    getActivityFeed(tenantId, claims, "recent", maintenant),
    getActivityFeed(tenantId, claims, "aujourdhui", maintenant),
    getActivityFeed(tenantId, claims, "semaine", maintenant),
    getActivityFeed(tenantId, claims, "mois", maintenant),
    getTeacherDelays(tenantId, claims),
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

    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);

    comparateur = await Promise.all(
      sites.map(async (site) => {
        const [effectif, absences, facturesRetard] = await Promise.all([
          prisma.eleve.count({
            where: { tenantId, siteId: site.id, statut: "ACTIF", deletedAt: null, ...siteFilterForModel("eleve", claims) },
          }),
          prisma.absence.count({
            where: {
              tenantId,
              statut: "INJUSTIFIEE",
              eleve: { siteId: site.id },
              date: { gte: debutMois },
              ...siteFilterForModel("absence", claims),
            },
          }),
          prisma.facture.count({
            where: { tenantId, siteId: site.id, statut: "EN_RETARD", ...siteFilterForModel("facture", claims) },
          }),
        ]);
        return { id: site.id, nom: site.nom, code: site.code, effectif, absences, facturesRetard };
      })
    );
  }

  // ──────────────────────────────────────────────────────────────
  // 2. File de validation (TENANT_ADMIN et PRINCIPAL)
  // ──────────────────────────────────────────────────────────────
  const peutVoirFileValidation = role === "TENANT_ADMIN" || role === "SUPER_ADMIN" || role === "PRINCIPAL";

  let fileValidation: { bulletins: number; factures: number; incidents: number; remplacements: number } | null = null;
  if (peutVoirFileValidation) {
    const [bulletins, factures, incidents, remplacements] = await Promise.all([
      // Bulletin n'a pas de champ `statut` ni d'enum StatutBulletin :
      // `isPublie: false` correspond à « en attente de validation ».
      prisma.bulletin.count({
        where: {
          tenantId,
          isPublie: false,
          ...siteFilterForModel("bulletin", claims),
        },
      }),
      prisma.facture.count({
        where: {
          tenantId,
          statut: "EN_RETARD",
          ...siteFilterForModel("facture", claims),
        },
      }),
      prisma.incident.count({
        where: {
          tenantId,
          statut: "OUVERT",
          ...siteFilterForModel("incident", claims),
        },
      }),
      prisma.remplacementCours.count({
        where: {
          tenantId,
          statut: "PROPOSE",
          ...siteFilterForModel("remplacementCours", claims),
        },
      }),
    ]);
    fileValidation = { bulletins, factures, incidents, remplacements };
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titreDirection")}
        subtitle={t("sousTitreDirection")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 space-y-8 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
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
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4 text-blue-600" />
                      {t("bulletinsAValider")}
                    </div>
                    <p className="text-3xl font-semibold">{fileValidation.bulletins}</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/facturation">
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      {t("facturesRetard")}
                    </div>
                    <p className="text-3xl font-semibold">{fileValidation.factures}</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/vie-scolaire">
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ShieldAlert className="h-4 w-4 text-red-600" />
                      {t("incidentsOuverts")}
                    </div>
                    <p className="text-3xl font-semibold">{fileValidation.incidents}</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/couverture">
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <UserX className="h-4 w-4 text-orange-600" />
                      {t("postesNonCouverts")}
                    </div>
                    <p className="text-3xl font-semibold">{fileValidation.remplacements}</p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </section>
        )}

        {/* ── Retards d'exécution des enseignants et profs principaux ── */}
        <section className="space-y-3">
          <h2 className="text-lg sm:text-xl font-semibold">{t("retardsExecution")}</h2>
          <DelaysByTheme themes={retards as ThemeRetardData[]} />
        </section>

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
              <Card>
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
              </Card>
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
