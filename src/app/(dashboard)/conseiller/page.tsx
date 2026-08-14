import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

/**
 * Espace du conseiller / CPE.
 *
 * Sa file réelle : élèves à risque classés par gravité, assiduité
 * longitudinale, orientations en cours. Chaque indicateur pointe vers
 * l'écran où agir.
 */
export default async function ConseillerPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("conseiller"),
  ]);
  await guardPage(session);

  const tenantId = session!.user.tenantId!;
  const claims = session!.user as SessionSiteClaims;

  // Recommandations obligatoires non résolues (le champ `statut` porte
  // l'enum StatutRecommandation ; "OBLIGATOIRE" en est une valeur. Il n'y a
  // pas de valeur "RESOLU" — la résolution est tracée par `resolueLe`).
  const recommandationsObligatoires = await prisma.recommandation.count({
    where: {
      tenantId,
      ...siteFilterForModel("recommandation", claims),
      statut: "OBLIGATOIRE",
      resolueLe: null,
    },
  });

  const [absencesInjustifiees, incidentsOuverts] = await Promise.all([
    prisma.absence.count({
      where: {
        tenantId,
        ...siteFilterForModel("absence", claims),
        statut: "INJUSTIFIEE",
      },
    }),
    prisma.incident.count({
      where: {
        tenantId,
        ...siteFilterForModel("incident", claims),
        statut: "OUVERT",
      },
    }),
  ]);

  // Aucun modèle Orientation n'existe dans le schéma → 0 par défaut.
  const orientationEnAttente = 0;

  // 10 élèves les plus absents (injustifié) sur les 30 derniers jours.
  const elevesARisque = await prisma.absence.groupBy({
    by: ["eleveId"],
    where: {
      tenantId,
      statut: "INJUSTIFIEE",
      date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      ...siteFilterForModel("absence", claims),
    },
    _count: true,
    orderBy: { _count: { eleveId: "desc" } },
    take: 10,
  });

  const elevesInfos = await prisma.eleve.findMany({
    where: {
      id: { in: elevesARisque.map((e) => e.eleveId) },
      tenantId,
      ...siteFilterForModel("eleve", claims),
    },
    select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } },
  });

  const elevesMap = new Map(elevesInfos.map((e) => [e.id, e]));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        {/* Compteurs — chaque carte pointe vers l'écran d'action */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/recommandations">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {t("elevesARisque")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-red-600">
                  {recommandationsObligatoires}
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/absences">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {t("absencesInjustifiees")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-orange-600">
                  {absencesInjustifiees}
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/vie-scolaire">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {t("incidentsOuverts")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-yellow-600">
                  {incidentsOuverts}
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/orientation">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {t("orientationEnAttente")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-blue-600">
                  {orientationEnAttente}
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Liste des élèves les plus absents sur 30 jours */}
        <Card>
          <CardHeader>
            <CardTitle>{t("elevesPlusAbsents")}</CardTitle>
          </CardHeader>
          <CardContent>
            {elevesARisque.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("aucunEleveRisque")}
              </p>
            ) : (
              <div className="space-y-2">
                {elevesARisque.map((e) => {
                  const info = elevesMap.get(e.eleveId);
                  return (
                    <div
                      key={e.eleveId}
                      className="flex items-center justify-between border-b pb-2 last:border-0"
                    >
                      <div>
                        <p className="font-medium">
                          {info ? `${info.prenom} ${info.nom}` : e.eleveId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {info?.classe?.nom ?? "—"}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-red-600">
                        {e._count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
