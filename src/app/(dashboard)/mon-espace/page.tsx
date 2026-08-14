import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { GrilleKpi } from "@/components/learnos/GrilleKpi";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { kpisEnseignant } from "@/lib/learnos/kpi";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

/**
 * Espace de l'enseignant.
 *
 * Un enseignant n'a pas besoin d'un tableau de bord : il a besoin de savoir ce
 * qu'il doit faire cette semaine. Chaque indicateur pointe donc vers un écran
 * où agir, jamais vers une simple contemplation.
 */
export default async function MonEspacePage() {
  const [session, t] = await Promise.all([auth(), getTranslations("learnos.kpi")]);
  await guardPage(session);

  const role = session!.user.role as Role;
  // Un enseignant est borné à ses classes ; la direction voit tout.
  const scope = isTeacherRole(role)
    ? await getTeacherScope(session!.user.tenantId!, session!.user.id, role)
    : undefined;

  const kpis = await kpisEnseignant(
    session!.user.tenantId!,
    session!.user,
    session!.user.id,
    scope?.isRestricted ? scope.classeIds : null
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titreEnseignant")}
        subtitle={t("sousTitreEnseignant")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <GrilleKpi kpis={kpis} />
      </div>
    </div>
  );
}
