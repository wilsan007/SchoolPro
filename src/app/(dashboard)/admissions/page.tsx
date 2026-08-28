import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { AdmissionsView } from "@/components/admissions/AdmissionsView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { siteFilterForModel, resolveSiteScope } from "@/lib/site-scope";
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
      siteId: true,
    },
  });

  // Charger les factures liées à ces candidatures
  const candidatureIds = candidatures.map((c) => c.id);
  const factures = candidatureIds.length > 0
    ? // eslint-disable-next-line ecolpro/require-site-filter -- recherche par candidatureIds, pas de filtre site nécessaire
      await prisma.facture.findMany({
        where: { candidatureId: { in: candidatureIds }, tenantId },
        select: {
          id: true,
          candidatureId: true,
          numero: true,
          libelle: true,
          montant: true,
          devise: true,
          statut: true,
          mois: true,
          paiements: { select: { montant: true } },
        },
      })
    : [];

  return { candidatures, factures };
}

async function getClasses(tenantId: string, user: { role: string; siteId?: string | null }) {
  const anneeActuelle = await getAnneeCouranteLibelle(tenantId);
  return prisma.classe.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(anneeActuelle ? { annee: anneeActuelle } : {}),
      ...siteFilterForModel("classe", user),
    },
    select: {
      id: true,
      nom: true,
      niveau: true,
      siteId: true,
      site: { select: { nom: true } },
    },
    orderBy: [{ niveau: "asc" }, { nom: "asc" }],
  });
}

export default async function AdmissionsPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("admissions"),
  ]);
  await guardPage(session);

  const siteFilter = siteFilterForModel("candidature", session!.user);
  const [{ candidatures, factures }, classes] = await Promise.all([
    getCandidatures(session!.user.tenantId!, siteFilter),
    getClasses(session!.user.tenantId!, session!.user),
  ]);

  // Détecter si l'admin a "Tous les sites" sélectionné → bloquer la création
  const siteScope = resolveSiteScope(session!.user);
  const allSitesSelected = siteScope.kind === "ALL";

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

  // Map factures par candidatureId
  const facturesMap = new Map<string, typeof factures>();
  for (const f of factures) {
    if (f.candidatureId) {
      const existing = facturesMap.get(f.candidatureId) ?? [];
      existing.push(f);
      facturesMap.set(f.candidatureId, existing);
    }
  }
  const facturesByCandidature = Object.fromEntries(facturesMap);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
        <AdmissionsView
          candidatures={candidaturesForView}
          userRole={session!.user.role}
          classes={classes}
          facturesByCandidature={facturesByCandidature}
          allSitesSelected={allSitesSelected}
        />
      </div>
    </div>
  );
}
