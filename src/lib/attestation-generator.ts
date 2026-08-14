/**
 * Générateur d'attestation de scolarité PDF — EcolPro
 * Calqué sur bulletin-generator.ts, utilise les données existantes (Eleve, Classe, Tenant).
 */
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

export type AttestationData = {
  ecoleName: string;
  ecoleVille: string;
  ecolePays: string;
  ecolePhone?: string | null;
  ecoleEmail?: string | null;
  ecoleLogo?: string | null;
  ecoleAddress?: string | null;

  eleveNom: string;
  elevePrenom: string;
  eleveMatricule: string;
  eleveClasse: string;
  eleveNiveau: string;
  eleveSexe: "M" | "F";
  eleveDateNaissance?: Date;

  annee: string;
  dateDelivrance: Date;

  chefEtablissement?: string | null;
  signatureUrl?: string | null;
  cachetUrl?: string | null;

  honorifique: string;
  titre: string;
};

/**
 * Charge les données nécessaires pour une attestation de scolarité.
 */
export async function getAttestationData(
  eleveId: string,
  tenantId: string,
  honorifique: string,
  titre: string,
  claims: SessionSiteClaims
): Promise<AttestationData | null> {
  const { default: prisma } = await import("@/lib/prisma");

  const eleve = await prisma.eleve.findFirst({
    where: { id: eleveId, tenantId, ...siteFilterForModel("eleve", claims) },
    include: { classe: true },
  });

  if (!eleve || !eleve.classe) return null;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return null;

  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId, libelle: tenant.currentYear },
  });

  return {
    ecoleName: tenant.name,
    ecoleVille: tenant.city ?? "Ville",
    ecolePays: tenant.country,
    ecolePhone: tenant.phone,
    ecoleEmail: tenant.email,
    ecoleLogo: tenant.logoUrl,
    ecoleAddress: tenant.address,

    eleveNom: eleve.nom,
    elevePrenom: eleve.prenom,
    eleveMatricule: eleve.matricule,
    eleveClasse: eleve.classe.nom,
    eleveNiveau: eleve.classe.niveau,
    eleveSexe: eleve.sexe,
    eleveDateNaissance: eleve.dateNaissance,

    annee: annee?.libelle ?? tenant.currentYear,
    dateDelivrance: new Date(),

    chefEtablissement: tenant.chefEtablissement,
    signatureUrl: tenant.signatureUrl,
    cachetUrl: tenant.cachetUrl,

    honorifique,
    titre,
  };
}
