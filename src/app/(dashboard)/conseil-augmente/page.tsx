import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getDemoNow } from "@/lib/demo-now";
import { Header } from "@/components/layout/Header";
import { ConseilAugmenteView } from "@/components/conseil-augmente/ConseilAugmenteView";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getClassesHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";
import { guardPage } from "@/lib/guard-page";

async function getConseilData(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeCourante: string | null,
  hierarchieClasseIds: string[],
) {
  const classeWhere = {
    tenantId,
    ...siteFilterForModel("classe", claims),
    ...(anneeCourante ? { annee: anneeCourante } : {}),
    ...(hierarchieClasseIds.length > 0
      ? { id: { in: hierarchieClasseIds } }
      : { id: "__none__" }),
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

  // Hiérarchie des classes avec scope enseignant + année + site intégrés.
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  const hierarchie: ClassesHierarchie = await getClassesHierarchie(session.user.tenantId, session.user, { anneeCourante });
  const hierarchieClasseIds = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => cls.id)));

  const { classes, periodes, periodeCouranteId } = await getConseilData(
    session.user.tenantId,
    session.user,
    anneeCourante,
    hierarchieClasseIds,
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
          hierarchie={hierarchie}
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
