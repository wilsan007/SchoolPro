import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getDemoNow } from "@/lib/demo-now";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/**
 * Espace de l'infirmerie — rôle NURSE.
 *
 * Le rôle NURSE existait dans le schéma mais n'avait ni modèle de données ni
 * écran dédié : il atterrissait sur le tableau de bord générique. Cet écran est
 * son point d'entrée réel : un registre des passages du jour et de la semaine,
 * le taux de couverture des fiches sanitaires, les allergies connues, et les
 * dix derniers passages enregistrés.
 */
export default async function InfirmeriePage() {
  const [session, t, tCommon] = await Promise.all([
    auth(),
    getTranslations("infirmerie"),
    getTranslations("common"),
  ]);
  await guardPage(session);

  const tenantId = session!.user.tenantId!;
  const claims: SessionSiteClaims = session!.user;
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  // Bornes temporelles : aujourd'hui et les 7 derniers jours, selon la date
  // simulée par la machine à remonter le temps.
  // On reconstruit des dates fraîches pour ne pas muter l'objet `now`.
  const now = await getDemoNow();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6); // aujourd'hui inclus → 7 jours

  const [
    passagesAujourdhui,
    passagesSemaine,
    fichesCompletes,
    totalElevesActifs,
    allergiesConnues,
    derniersPassages,
  ] = await Promise.all([
    // 1. Passages aujourd'hui
    prisma.passageInfirmerie.count({
      where: {
        tenantId,
        ...siteFilterForModel("passageInfirmerie", claims),
        date: { gte: todayStart, lt: todayEnd },
        ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
      },
    }),
    // 2. Passages cette semaine (7 jours glissants)
    prisma.passageInfirmerie.count({
      where: {
        tenantId,
        ...siteFilterForModel("passageInfirmerie", claims),
        date: { gte: weekStart, lt: todayEnd },
        ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
      },
    }),
    // 3. Fiches sanitaires complètes (pour le taux de couverture)
    prisma.ficheSanitaire.count({
      where: {
        tenantId,
        ...siteFilterForModel("ficheSanitaire", claims),
      },
    }),
    // Nombre total d'élèves actifs (dénominateur du taux de couverture)
    prisma.eleve.count({
      where: {
        tenantId,
        ...siteFilterForModel("eleve", claims),
        statut: "ACTIF",
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
      },
    }),
    // 4. Allergies connues : fiches dont le tableau d'allergies n'est pas vide.
    //    Prisma filtre les tableaux non-vides avec `{ isEmpty: false }`.
    prisma.ficheSanitaire.count({
      where: {
        tenantId,
        ...siteFilterForModel("ficheSanitaire", claims),
        allergies: { isEmpty: false },
      },
    }),
    // 10 derniers passages avec le nom de l'élève et sa classe
    prisma.passageInfirmerie.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("passageInfirmerie", claims),
        ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
        date: { lte: now },
      },
      orderBy: { date: "desc" },
      take: 10,
      include: {
        eleve: { select: { nom: true, prenom: true, classe: { select: { nom: true } } } },
      },
    }),
  ]);

  const tauxCouverture =
    totalElevesActifs > 0
      ? Math.round((fichesCompletes / totalElevesActifs) * 100)
      : 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titre")}
        subtitle={t("sousTitre")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 scrollbar-thin">
        {/* Compteurs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("passagesAujourdhui")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{passagesAujourdhui}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("passagesSemaine")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{passagesSemaine}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("fichesCompletes")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{fichesCompletes}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {tauxCouverture}% / {totalElevesActifs}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("allergiesConnues")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-orange-600">
                {allergiesConnues}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Derniers passages */}
        <Card>
          <CardHeader>
            <CardTitle>{t("derniersPassages")}</CardTitle>
          </CardHeader>
          <CardContent>
            {derniersPassages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("aucunPassage")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2 pr-4 font-medium">{tCommon("date")}</th>
                      <th className="py-2 pr-4 font-medium">{t("eleve")}</th>
                      <th className="py-2 pr-4 font-medium">{t("motif")}</th>
                      <th className="py-2 font-medium hidden sm:table-cell">{t("suite")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derniersPassages.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                          {new Intl.DateTimeFormat("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(p.date)}
                        </td>
                        <td className="py-2 pr-4">
                          <p className="font-medium">
                            {p.eleve.prenom} {p.eleve.nom}
                          </p>
                          {p.eleve.classe?.nom && (
                            <p className="text-xs text-muted-foreground">
                              {p.eleve.classe.nom}
                            </p>
                          )}
                        </td>
                        <td className="py-2 pr-4">{p.motif}</td>
                        <td className="py-2 hidden sm:table-cell">
                          {p.retourCours ? t("retourCours") : t("renvoiDomicile")}
                        </td>
                      </tr>
                    ))}
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
