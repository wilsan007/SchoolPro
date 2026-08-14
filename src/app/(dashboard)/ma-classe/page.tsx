import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { SuiviClasseView } from "@/components/learnos/SuiviClasseView";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel } from "@/lib/site-scope";
import { syntheseClasse } from "@/lib/learnos/suivi-classe";

/**
 * Espace du professeur principal.
 *
 * Porte le dossier de suivi unifié : croiser absences, difficultés, incidents
 * et impayés est ce qui rend visible un décrochage que chaque module, pris
 * séparément, laisse passer.
 */
export default async function MaClassePage({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string }>;
}) {
  const [session, t] = await Promise.all([auth(), getTranslations("learnos.classe")]);
  await guardPage(session);

  const tenantId = session!.user.tenantId!;
  const { classe: classeDemandee } = await searchParams;

  // Classes dont l'utilisateur est professeur principal. La direction, elle,
  // voit toutes les classes de son périmètre.
  const enseignant = await prisma.enseignant.findFirst({
    where: {
      tenantId,
      userId: session!.user.id,
      ...siteFilterForModel("enseignant", session!.user),
    },
    select: { id: true },
  });

  const classes = await prisma.classe.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("classe", session!.user),
      ...(enseignant ? { profPrincipalId: enseignant.id } : {}),
    },
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });

  const classeId = classeDemandee ?? classes[0]?.id;
  const synthese = classeId
    ? await syntheseClasse(tenantId, classeId, session!.user)
    : null;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={synthese ? `${t("titre")} — ${synthese.classeNom}` : t("titre")}
        subtitle={t("sousTitre")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        {!synthese ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t("aucuneClasse")}
            </CardContent>
          </Card>
        ) : (
          <SuiviClasseView synthese={synthese} />
        )}
      </div>
    </div>
  );
}
