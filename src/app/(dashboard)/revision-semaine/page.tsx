import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { eleveDeLUtilisateur } from "@/lib/learnos/dossier-eleve";
import { RevisionSemaine } from "@/components/learnos/RevisionSemaine";
import { anneeActive } from "@/lib/annee-scolaire";

/**
 * Page de révision du cours de la semaine pour l'élève.
 *
 * Les résumés sont re-levelés selon le niveau de lecture de l'élève,
 * déduit de son profil d'apprentissage. Si l'élève progresse, le texte
 * devient moins simplifié ; s'il est en difficulté, le texte est plus
 * accessible.
 *
 * ACCÈS : STUDENT (pour soi), PARENT (pour son enfant), personnel avec
 * entrainement:read.
 */
export default async function RevisionSemainePage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("learnos.revisionSemaine"),
  ]);
  await guardPage(session);

  const tenantId = session!.user.tenantId!;
  const role = session!.user.role;

  // Résoudre l'élève selon le rôle.
  let eleveId: string | null = null;
  let classeId: string | null = null;

  if (role === "STUDENT") {
    const eleve = await eleveDeLUtilisateur(tenantId, session!.user);
    if (!eleve) redirect("/eleve");
    eleveId = eleve.id;
    // eleveDeLUtilisateur ne retourne pas classeId — le charger séparément
    // avec les filtres tenant + site pour respecter l'isolation.
    const eleveFull = await prisma.eleve.findFirst({
      where: { id: eleve.id, tenantId, ...siteFilterForModel("eleve", session!.user) },
      select: { classeId: true },
    });
    classeId = eleveFull?.classeId ?? null;
  } else if (role === "PARENT") {
    // Le parent accède à la révision de son enfant — il faut sélectionner lequel.
    // Pour l'instant, on redirige vers l'espace parent qui gère la fratrie.
    redirect("/parent");
  } else {
    // Personnel : rediriger vers le tableau de bord pour sélectionner un élève.
    redirect("/dashboard");
  }

  if (!eleveId || !classeId) redirect("/dashboard");

  // Charger l'année active (respecte la Time Machine).
  const annee = await anneeActive(tenantId);
  const anneeId = annee?.id ?? null;

  if (!anneeId) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header
          title={t("titre")}
          subtitle={t("sousTitre")}
          userName={session!.user.name}
          userAvatar={session!.user.image ?? undefined}
        />
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
          <p className="text-sm text-muted-foreground">{t("aucuneAnnee")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titre")}
        subtitle={t("sousTitre")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <RevisionSemaine
          eleveId={eleveId}
          classeId={classeId}
          anneeId={anneeId}
        />
      </div>
    </div>
  );
}
