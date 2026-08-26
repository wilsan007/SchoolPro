import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { VieScolaireView } from "@/components/vie-scolaire/VieScolaireView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { roleHasPermission } from "@/lib/permissions";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getClassesHierarchie, aplatirHierarchie } from "@/lib/classes-hierarchie";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";

async function getVieScolaireData(
  tenantId: string,
  claims: SessionSiteClaims,
  hierarchieClasseIds: string[]
) {
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const maintenant = await getDemoNow();
  // Le scope enseignant est déjà résolu via la hiérarchie : hierarchieClasseIds
  // contient exactement les classes accessibles (toutes pour un admin, les
  // classes affectées pour un enseignant).
  const scopeFilter = hierarchieClasseIds.length > 0
    ? { eleve: { classeId: { in: hierarchieClasseIds }, ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}) } }
    : { id: "__none__" };

  const [incidents, eleves] = await Promise.all([
    prisma.incident.findMany({
      where: { tenantId, ...siteFilterForModel("incident", claims), ...scopeFilter, date: { lte: maintenant } },
      include: {
        eleve: { select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } } },
        rapportePar: { select: { name: true } },
        sanctions: true,
      },
      orderBy: { date: "desc" },
      take: 100,
    }),
    prisma.eleve.findMany({
      where: { tenantId, statut: "ACTIF", ...siteFilterForModel("eleve", claims), ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}), ...(hierarchieClasseIds.length > 0 ? { classeId: { in: hierarchieClasseIds } } : { id: "__none__" }) },
      select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    }),
  ]);

  return { incidents, eleves };
}

export default async function VieScolairePage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("vieScolaire"),
  ]);
  await guardPage(session);
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const claims = session.user as SessionSiteClaims;
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  // Hiérarchie des classes avec scope enseignant + année + site intégrés.
  const hierarchie = await getClassesHierarchie(tenantId, session.user, { anneeCourante });
  const hierarchieClasseIds = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => cls.id)));
  const classes = aplatirHierarchie(hierarchie).map(c => ({ id: c.id, nom: c.nom }));

  const { incidents, eleves } = await getVieScolaireData(tenantId, claims, hierarchieClasseIds);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <VieScolaireView
          incidents={incidents}
          eleves={eleves}
          classes={classes}
          hierarchie={hierarchie}
          currentUserId={session.user.id}
          tenantId={tenantId}
          canWrite={roleHasPermission(session.user.role as string, "vie-scolaire:write")}
        />
      </div>
    </div>
  );
}
