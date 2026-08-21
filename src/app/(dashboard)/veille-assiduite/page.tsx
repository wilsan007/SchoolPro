import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { Header } from "@/components/layout/Header";
import { VeilleAssiduiteView } from "@/components/veille-assiduite/VeilleAssiduiteView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import type { Role } from "@prisma/client";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";

export default async function VeilleAssiduitePage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("veilleAssiduite"),
  ]);
  await guardPage(session);
  if (!session?.user?.tenantId) redirect("/login");

  // Classes accessibles à l'appelant.
  const scope = isTeacherRole(session.user.role as Role)
    ? await getTeacherScope(session.user.tenantId, session.user.id, session.user.role as Role)
    : undefined;

  const classeWhere = {
    tenantId: session.user.tenantId,
    ...siteFilterForModel("classe", session.user),
    ...(scope?.isRestricted && scope.classeIds.length > 0
      ? { id: { in: scope.classeIds } }
      : scope?.isRestricted
        ? { id: "__none__" }
        : {}),
  };

  const classes = await prisma.classe.findMany({
    where: classeWhere,
    select: { id: true, nom: true, niveau: true, annee: true },
    orderBy: { nom: "asc" },
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <VeilleAssiduiteView classes={classes} />
      </div>
    </div>
  );
}
