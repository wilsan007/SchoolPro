import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getDemoNow } from "@/lib/demo-now";
import { Header } from "@/components/layout/Header";
import { ConseilAugmenteView } from "@/components/conseil-augmente/ConseilAugmenteView";
import { getTranslations } from "next-intl/server";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import type { Role } from "@prisma/client";
import { guardPage } from "@/lib/guard-page";

async function getConseilData(
  tenantId: string,
  claims: SessionSiteClaims,
  scope?: { classeIds: string[]; isRestricted: boolean }
) {
  const classeWhere = {
    tenantId,
    ...siteFilterForModel("classe", claims),
    ...(scope?.isRestricted && scope.classeIds.length > 0
      ? { id: { in: scope.classeIds } }
      : scope?.isRestricted
        ? { id: "__none__" }
        : {}),
  };

  const [classes, periodes] = await Promise.all([
    prisma.classe.findMany({
      where: classeWhere,
      select: {
        id: true,
        nom: true,
        niveau: true,
        annee: true,
        eleves: {
          where: { statut: "ACTIF", ...siteFilterForModel("eleve", claims) },
          select: { id: true, nom: true, prenom: true, matricule: true },
          orderBy: { prenom: "asc" },
        },
      },
      orderBy: { nom: "asc" },
    }),
    prisma.periode.findMany({
      where: { annee: { tenantId } },
      orderBy: { numero: "asc" },
      include: { annee: { select: { id: true, libelle: true } } },
    }),
  ]);

  // La période CONTENANT la date affichée plutôt que celle marquée
  // `isCurrent` : consultée depuis la cohorte précédente, la page proposait
  // sinon l'année active de l'établissement.
  const maintenant = await getDemoNow();
  const periodeCourante =
    periodes.find((p) => p.dateDebut <= maintenant && p.dateFin >= maintenant) ??
    periodes.find((p) => p.isCurrent);

  return { classes, periodes, periodeCouranteId: periodeCourante?.id ?? null };
}

export default async function ConseilAugmentePage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("conseilAugmente"),
  ]);
  await guardPage(session);
  if (!session?.user?.tenantId) redirect("/login");

  const scope = isTeacherRole(session.user.role as Role)
    ? await getTeacherScope(session.user.tenantId, session.user.id, session.user.role as Role)
    : undefined;

  const { classes, periodes, periodeCouranteId } = await getConseilData(
    session.user.tenantId,
    session.user,
    scope
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <ConseilAugmenteView
          classes={classes}
          periodes={periodes}
          periodeCouranteId={periodeCouranteId}
          canWrite={session.user.role === "TENANT_ADMIN" ||
            session.user.role === "PRINCIPAL" ||
            session.user.role === "CLASS_TEACHER" ||
            session.user.role === "SECRETARY"}
        />
      </div>
    </div>
  );
}
