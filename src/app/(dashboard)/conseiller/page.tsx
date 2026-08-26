import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getDemoNow } from "@/lib/demo-now";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

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
  const maintenant = await getDemoNow();
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

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
        ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
      },
    }),
    prisma.incident.count({
      where: {
        tenantId,
        ...siteFilterForModel("incident", claims),
        statut: "OUVERT",
        ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
      },
    }),
  ]);

  // Aucun modèle Orientation n'existe dans le schéma → 0 par défaut.
  const orientationEnAttente = 0;

  // 10 élèves les plus absents (injustifié) sur les 30 derniers jours
  // précédant la date simulée.
  const debutFenetre30j = new Date(
    maintenant.getTime() - 30 * 24 * 60 * 60 * 1000
  );
  const elevesARisque = await prisma.absence.groupBy({
    by: ["eleveId"],
    where: {
      tenantId,
      statut: "INJUSTIFIEE",
      date: { gte: debutFenetre30j, lte: maintenant },
      ...siteFilterForModel("absence", claims),
      ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
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
      ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
    },
    select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } },
  });

  const elevesMap = new Map(elevesInfos.map((e) => [e.id, e]));

  // Entretiens récents (10 derniers) + compteur du mois en cours.
  const now = maintenant;
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);

  const [entretiensRecents, entretiensCeMois] = await Promise.all([
    prisma.entretienConseiller.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("entretienConseiller", claims),
      },
      orderBy: { date: "desc" },
      take: 10,
      include: {
        eleve: {
          select: {
            nom: true,
            prenom: true,
            classe: { select: { nom: true } },
          },
        },
      },
    }),
    prisma.entretienConseiller.count({
      where: {
        tenantId,
        ...siteFilterForModel("entretienConseiller", claims),
        date: { gte: debutMois },
      },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 scrollbar-thin">
        {/* Compteurs — chaque carte pointe vers l'écran d'action */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("entretiensCeMois")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-indigo-600">
                {entretiensCeMois}
              </p>
            </CardContent>
          </Card>
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

        {/* Entretiens récents — suivi longitudinal */}
        <Card>
          <CardHeader>
            <CardTitle>{t("entretiensRecents")}</CardTitle>
          </CardHeader>
          <CardContent>
            {entretiensRecents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("aucunEntretien")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">{t("date")}</th>
                      <th className="py-2 pr-4 font-medium">Élève</th>
                      <th className="py-2 pr-4 font-medium hidden sm:table-cell">{t("motif")}</th>
                      <th className="py-2 pr-4 font-medium">{t("statut")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entretiensRecents.map((ent) => {
                      const statutVariant: Record<
                        string,
                        "default" | "info" | "success" | "destructive" | "warning"
                      > = {
                        PLANIFIE: "info",
                        REALISE: "success",
                        ANNULE: "destructive",
                        "REPORTÉ": "warning",
                      };
                      const statutLabel: Record<string, string> = {
                        PLANIFIE: t("planifie"),
                        REALISE: t("realise"),
                        ANNULE: t("annule"),
                        "REPORTÉ": t("reporte"),
                      };
                      return (
                        <tr key={ent.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 whitespace-nowrap">
                            {new Date(ent.date).toLocaleDateString()}
                          </td>
                          <td className="py-2 pr-4">
                            <span className="font-medium">
                              {ent.eleve.prenom} {ent.eleve.nom}
                            </span>
                            {ent.eleve.classe?.nom && (
                              <span className="text-xs text-muted-foreground ml-2">
                                {ent.eleve.classe.nom}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-4 hidden sm:table-cell">{ent.motif}</td>
                          <td className="py-2 pr-4">
                            <Badge variant={statutVariant[ent.statut] ?? "default"}>
                              {statutLabel[ent.statut] ?? ent.statut}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
