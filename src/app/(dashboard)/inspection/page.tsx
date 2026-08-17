import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

/**
 * Espace de l'inspecteur MENFOP.
 *
 * Vue agrégée et lecture seule : statistiques globales, pas de données
 * nominatives. Aucun bouton d'action — c'est un tableau de bord d'observation.
 */
export default async function InspectionPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("inspection"),
  ]);
  await guardPage(session);

  const tenantId = session!.user.tenantId!;
  const claims = session!.user as SessionSiteClaims;

  const [effectif, classes, absences, notesAgg, notesPassees, notesTotal] = await Promise.all([
    prisma.eleve.count({
      where: {
        tenantId,
        statut: "ACTIF",
        ...siteFilterForModel("eleve", claims),
      },
    }),
    prisma.classe.count({
      where: {
        tenantId,
        ...siteFilterForModel("classe", claims),
      },
    }),
    prisma.absence.count({
      where: {
        tenantId,
        ...siteFilterForModel("absence", claims),
      },
    }),
    // Moyenne générale sur l'ensemble des notes (valeur normalisée /20).
    prisma.note.aggregate({
      where: {
        tenantId,
        ...siteFilterForModel("note", claims),
      },
      _avg: { valeur: true },
    }),
    // Taux de réussite : proportion de notes ≥ 10/20.
    prisma.note.count({
      where: {
        tenantId,
        valeur: { gte: 10 },
        ...siteFilterForModel("note", claims),
      },
    }),
    // Effectif total de notes (dénominateur du taux de réussite).
    prisma.note.count({
      where: {
        tenantId,
        ...siteFilterForModel("note", claims),
      },
    }),
  ]);

  const moyenneGenerale = notesAgg._avg.valeur ?? 0;
  const tauxReussite = notesTotal > 0
    ? Math.round((notesPassees / notesTotal) * 100)
    : 0;

  const stats = [
    { label: t("effectif"), value: effectif },
    { label: t("classes"), value: classes },
    { label: t("absences"), value: absences },
    { label: t("moyenneGenerale"), value: moyenneGenerale.toFixed(2) },
    { label: t("tauxReussite"), value: `${tauxReussite}%` },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titre")}
        subtitle={t("sousTitre")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 space-y-6 scrollbar-thin">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
