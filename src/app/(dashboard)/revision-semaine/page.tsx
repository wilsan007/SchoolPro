import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { siteFilterForModel, isRelationScopedRole } from "@/lib/site-scope";
import { eleveDeLUtilisateur } from "@/lib/learnos/dossier-eleve";
import { RevisionSemaine } from "@/components/learnos/RevisionSemaine";
import { RevisionSemaineStaff } from "@/components/learnos/RevisionSemaineStaff";
import { anneeActive, getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

/**
 * Page de révision du cours de la semaine.
 *
 * - STUDENT : révision de son propre cours, re-levelée selon son profil.
 * - PARENT : redirigé vers `/parent` (sélection de la fratrie).
 * - Personnel avec `entrainement:read` : un sélecteur classe/élève permet
 *   de consulter la révision d'un élève donné.
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

  // — Personnel : sélecteur classe/élève —
  // Charger les classes selon le périmètre (site, enseignant, année).
  let classeIds: string[] | null = null;
  if (isTeacherRole(role as Role) && session!.user.id) {
    const scope = await getTeacherScope(tenantId, session!.user.id, role as Role, anneeLibelle);
    if (scope.classeIds.length === 0) {
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header {...headerProps} />
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
            <p className="text-sm text-muted-foreground">{t("aucuneClasse")}</p>
          </div>
        </div>
      );
    }
    classeIds = scope.classeIds;
  }

  const classes = await prisma.classe.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("classe", session!.user),
      ...(anneeLibelle ? { annee: anneeLibelle } : {}),
      ...(classeIds ? { id: { in: classeIds } } : {}),
    },
    select: {
      id: true,
      nom: true,
      niveau: true,
      annee: true,
      eleves: {
        where: { statut: "ACTIF", ...siteFilterForModel("eleve", session!.user) },
        select: { id: true, nom: true, prenom: true, matricule: true },
        orderBy: { prenom: "asc" },
      },
    },
    orderBy: { nom: "asc" },
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header {...headerProps} />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <RevisionSemaineStaff classes={classes} anneeId={anneeId} />
      </div>
    </div>
  );
}
