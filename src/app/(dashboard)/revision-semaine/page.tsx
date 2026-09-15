import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { eleveDeLUtilisateur } from "@/lib/learnos/dossier-eleve";
import { RevisionSemaine } from "@/components/learnos/RevisionSemaine";
import { RevisionSemaineStaff } from "@/components/learnos/RevisionSemaineStaff";
import { anneeActive, getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getClassesHierarchie } from "@/lib/classes-hierarchie";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";

/**
 * Page de révision du cours de la semaine.
 *
 * - STUDENT : révision de son propre cours, re-levelée selon son profil.
 * - PARENT : redirigé vers `/parent` (sélection de la fratrie).
 * - Personnel avec `entrainement:read` : un sélecteur cascade
 *   Catégorie → Classe → Élève permet de consulter la révision d'un élève.
 *   Le site est résolu automatiquement depuis la session. Si l'utilisateur
 *   a accès à plusieurs sites mais n'en a aucun sélectionné, on lui demande
 *   d'en choisir un avant de continuer.
 */
export default async function RevisionSemainePage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("learnos.revisionSemaine"),
  ]);
  await guardPage(session);

  const tenantId = session!.user.tenantId!;
  const role = session!.user.role;

  // Résoudre l'année active (respecte la Time Machine).
  const annee = await anneeActive(tenantId);
  const anneeId = annee?.id ?? null;
  const anneeLibelle = await getAnneeCouranteLibelle(tenantId);

  const headerProps = {
    title: t("titre"),
    subtitle: t("sousTitre"),
    userName: session!.user.name,
    userAvatar: session!.user.image ?? undefined,
  };

  if (!anneeId) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header {...headerProps} />
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
          <p className="text-sm text-muted-foreground">{t("aucuneAnnee")}</p>
        </div>
      </div>
    );
  }

  // — Élève : sa propre révision —
  if (role === "STUDENT") {
    const eleve = await eleveDeLUtilisateur(tenantId, session!.user);
    if (!eleve) redirect("/eleve");
    const eleveFull = await prisma.eleve.findFirst({
      where: { id: eleve.id, tenantId, ...siteFilterForModel("eleve", session!.user) },
      select: { classeId: true },
    });
    const classeId = eleveFull?.classeId ?? null;
    if (!classeId) redirect("/eleve");

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header {...headerProps} />
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
          <RevisionSemaine eleveId={eleve.id} classeId={classeId} anneeId={anneeId} />
        </div>
      </div>
    );
  }

  // — Parent : la fratrie est gérée dans l'espace parent —
  if (role === "PARENT") {
    redirect("/parent");
  }

  // — Personnel : sélecteur cascade Catégorie → Classe → Élève —
  // Le site est résolu automatiquement depuis la session (siteFilterForModel
  // applique le site sélectionné ou les sites autorisés). Si l'utilisateur
  // a accès à plusieurs sites mais n'en a aucun sélectionné, on lui demande
  // d'en choisir un via le SiteSwitcher de la sidebar/workspace.
  const sessionSiteId = (session!.user as { siteId?: string | null }).siteId ?? null;
  const sessionSiteIds = (session!.user as { siteIds?: string[] | null }).siteIds ?? null;
  const tenantHasSites = (session!.user as { tenantHasSites?: boolean }).tenantHasSites ?? true;

  // Détecter le cas multi-sites sans site sélectionné pour les rôles non-admin.
  // Les TENANT_ADMIN / SUPER_ADMIN peuvent voir "tous les sites" (siteId null = ALL).
  const isTenantWide = role === "TENANT_ADMIN" || role === "SUPER_ADMIN";
  const needsSiteSelection =
    tenantHasSites && !isTenantWide && !sessionSiteId &&
    (!sessionSiteIds || sessionSiteIds.length > 1);

  if (needsSiteSelection) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header {...headerProps} />
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground max-w-md">
              {t("selectionnerSiteDabord")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Charger la hiérarchie des classes (Catégorie → Niveau → Classe + élèves).
  // getClassesHierarchie applique déjà le filtre de site et le scope enseignant.
  const hierarchie = await getClassesHierarchie(tenantId, session!.user, {
    anneeCourante: anneeLibelle,
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header {...headerProps} />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <RevisionSemaineStaff hierarchie={hierarchie} anneeId={anneeId} />
      </div>
    </div>
  );
}
