import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { AdmissionsView } from "@/components/admissions/AdmissionsView";

async function getCandidatures(tenantId: string) {
  const anneeActuelle = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

  const candidatures = await prisma.candidature.findMany({
    where: { tenantId, annee: anneeActuelle },
    orderBy: { createdAt: "desc" },
  });

  return { candidatures };
}

export default async function AdmissionsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { candidatures } = await getCandidatures(session.user.tenantId);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Admissions & Inscriptions"
        subtitle="Gestion des candidatures, examens d'entrée et inscriptions"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <AdmissionsView candidatures={candidatures} />
      </div>
    </div>
  );
}
