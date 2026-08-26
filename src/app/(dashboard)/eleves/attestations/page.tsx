import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { Header } from "@/components/layout/Header";
import { AttestationForm } from "@/components/eleves/AttestationForm";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { getClassesHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";

export default async function AttestationsPage() {
  const session = await auth();
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const te = await getTranslations("eleves");

  const siteFilter = siteFilterForModel("classe", session.user);
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  // Hiérarchie des classes avec scope enseignant + site + année intégrés.
  const hierarchie = await getClassesHierarchie(session.user.tenantId, session.user, { anneeCourante });
  const hierarchieClasseIds = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => cls.id)));
  const [classes, tenant] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-site-filter -- where includes ...siteFilter spread
    prisma.classe.findMany({
      where: {
        tenantId: session.user.tenantId,
        ...siteFilter,
        ...(anneeCourante ? { annee: anneeCourante } : {}),
        ...(hierarchieClasseIds.length > 0 ? { id: { in: hierarchieClasseIds } } : {}),
      },
      include: {
        eleves: {
          where: { statut: "ACTIF", ...siteFilterForModel("eleve", session.user) },
          select: { id: true, nom: true, prenom: true, matricule: true, sexe: true, dateNaissance: true },
          orderBy: { prenom: "asc" },
        },
      },
      orderBy: { nom: "asc" },
    }),
    prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: {
        name: true, city: true, country: true, phone: true, email: true,
        address: true, logoUrl: true, chefEtablissement: true,
        signatureUrl: true, cachetUrl: true, currentYear: true,
      },
    }),
  ]);

  if (!tenant) redirect("/login");

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={te("attestations")}
        subtitle={te("attestationsSubtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <AttestationForm classes={classes} tenant={tenant} hierarchie={hierarchie} />
      </div>
    </div>
  );
}
