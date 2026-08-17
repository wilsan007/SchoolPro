import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, siteFilterForRelation, type SessionSiteClaims } from "@/lib/site-scope";

/**
 * Espace du secrétariat.
 *
 * Le secrétariat traite des dossiers, pas des statistiques : chaque compteur
 * est une file d'attente qui pointe vers l'écran où agir. Un chiffre sans
 * action derrière n'a pas sa place ici.
 */
export default async function SecretariatPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("secretariat"),
  ]);
  await guardPage(session);

  const tenantId = session!.user.tenantId!;
  const claims = session!.user as SessionSiteClaims;

  const [inscriptionsEnAttente, dossiersIncomplets, absencesAJustifier, parentsSansCompte] =
    await Promise.all([
      prisma.candidature.count({
        where: {
          tenantId,
          statut: "SOUMISE",
          ...siteFilterForModel("candidature", claims),
        },
      }),
      prisma.eleve.count({
        where: {
          tenantId,
          statut: "ACTIF",
          ...siteFilterForModel("eleve", claims),
          OR: [{ lieuNaissance: null }, { nationalite: null }],
        },
      }),
      prisma.absence.count({
        where: {
          tenantId,
          statut: "EN_ATTENTE",
          ...siteFilterForModel("absence", claims),
        },
      }),
      // EleveParent n'a pas de colonne tenantId : le rattachement au tenant
      // passe par la relation parent. Un parent sans `user` est un parent
      // créé « sur papier » dont le compte n'a pas encore été provisionné.
      // Le filtre de site passe par la relation `eleve` (SITE_PATHS.eleveParent = { one: "eleve" }).
      prisma.eleveParent.count({
        where: {
          parent: { tenantId, user: null },
          ...siteFilterForRelation(claims, "eleve"),
        },
      }),
    ]);

  const files = [
    { label: t("inscriptionsEnAttente"), value: inscriptionsEnAttente, href: "/eleves" },
    { label: t("dossiersIncomplets"), value: dossiersIncomplets, href: "/eleves" },
    { label: t("absencesAJustifier"), value: absencesAJustifier, href: "/absences" },
    { label: t("parentsSansCompte"), value: parentsSansCompte, href: "/parents" },
  ];

  const totalATraiter = files.reduce((acc, f) => acc + f.value, 0);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 scrollbar-thin">
        {totalATraiter === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            {t("rienATraiter")}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {files.map((file) => (
              <Link key={file.label} href={file.href} className="block">
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">
                      {file.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={
                        file.value > 0
                          ? "text-2xl font-bold text-amber-600 dark:text-amber-400"
                          : "text-2xl font-bold text-muted-foreground"
                      }
                    >
                      {file.value}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
