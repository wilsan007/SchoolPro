import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { AdmissionsView } from "@/components/admissions/AdmissionsView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

async function getCandidatures(tenantId: string, siteFilter: Record<string, unknown>) {
  const anneeActuelle = await getAnneeCouranteLibelle(tenantId);

  const candidatures = await prisma.candidature.findMany({
    where: { tenantId, ...(anneeActuelle ? { annee: anneeActuelle } : {}), ...siteFilter },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nom: true,
      prenom: true,
      dateNaissance: true,
      sexe: true,
      classeVoulue: true,
      annee: true,
      parentNom: true,
      parentPrenom: true,
      parentEmail: true,
      parentPhone: true,
      parentLien: true,
      statut: true,
      dateExamen: true,
      noteExamen: true,
      commentaire: true,
      motifRefus: true,
      createdAt: true,
      dossierStatut: true,
      documentsInscription: true,
      creeParId: true,
      valideParId: true,
      valideLe: true,
    },
  });

  return { candidatures };
}

export default async function AdmissionsPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("admissions"),
  ]);
  await guardPage(session);

  const siteFilter = siteFilterForModel("candidature", session!.user);
  const { candidatures } = await getCandidatures(session!.user.tenantId!, siteFilter);

  // Cast documentsInscription (JsonValue → DocumentInscription[]) pour le composant client
  const candidaturesForView = candidatures.map((c) => ({
    ...c,
    documentsInscription: c.documentsInscription as unknown as Array<{
      type: string;
      url: string;
      nom?: string;
      taille?: number;
      ajouteLe?: string;
      ajouteParId?: string;
    }> | null,
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
        <AdmissionsView candidatures={candidaturesForView} userRole={session!.user.role} />
      </div>
    </div>
  );
}
