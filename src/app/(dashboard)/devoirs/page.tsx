import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import { DevoirsManager } from "./DevoirsManager";

/**
 * Devoirs — saisie et suivi pour les enseignants et la direction.
 *
 * Les enseignants (TEACHER / CLASS_TEACHER) ne voient que les classes de leur
 * périmètre (`getTeacherScope`). La direction (TENANT_ADMIN, SUPER_ADMIN,
 * PRINCIPAL) voit toutes les classes du tenant.
 */
export default async function DevoirsPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("devoirs"),
  ]);
  await guardPage(session);
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const role = session.user.role;
  const userId = session.user.id;
  const claims = session.user as SessionSiteClaims;

  // Résoudre le périmètre de classes.
  let classeIds: string[] | null = null; // null = toutes les classes
  if (isTeacherRole(role)) {
    const scope = await getTeacherScope(tenantId, userId, role);
    classeIds = scope.classeIds;
  }

  const [classes, matieres, devoirs] = await Promise.all([
    prisma.classe.findMany({
      where: {
        tenantId,
        ...(classeIds ? { id: { in: classeIds } } : {}),
        ...siteFilterForModel("classe", claims),
      },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
    prisma.matiere.findMany({
      where: { tenantId, ...siteFilterForModel("matiere", claims) },
      select: { id: true, nom: true, couleur: true },
      orderBy: { nom: "asc" },
    }),
    prisma.devoir.findMany({
      where: {
        tenantId,
        ...(classeIds ? { classeId: { in: classeIds } } : {}),
        ...siteFilterForModel("devoir", claims),
      },
      include: {
        classe: { select: { nom: true } },
        matiere: { select: { nom: true, couleur: true } },
      },
      orderBy: { dateRendu: "desc" },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titre")}
        subtitle={t("sousTitre")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <DevoirsManager
          classes={classes.map((c) => ({ id: c.id, nom: c.nom }))}
          matieres={matieres.map((m) => ({
            id: m.id,
            nom: m.nom,
            couleur: m.couleur,
          }))}
          devoirs={devoirs.map((d) => ({
            id: d.id,
            titre: d.titre,
            description: d.description,
            dateRendu: d.dateRendu.toISOString(),
            statut: d.statut,
            classe: { nom: d.classe.nom },
            matiere: { nom: d.matiere.nom, couleur: d.matiere.couleur },
          }))}
        />
      </div>
    </div>
  );
}
