import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { Header } from "@/components/layout/Header";
import { AttestationForm } from "@/components/eleves/AttestationForm";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";

export default async function AttestationsPage() {
  const session = await auth();
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const te = await getTranslations("eleves");

  const siteFilter = siteFilterForModel("classe", session.user);
  const [classes, tenant] = await Promise.all([
    prisma.classe.findMany({
      where: { tenantId: session.user.tenantId, ...siteFilter },
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
        <AttestationForm classes={classes} tenant={tenant} />
      </div>
    </div>
  );
}
