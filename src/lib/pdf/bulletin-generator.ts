/**
 * Générateur de bulletins PDF — EcolPro
 * Récupère les données préparées par le script de génération.
 */

export type NoteMatiere = {
  matiereNom: string;
  matiereCode: string;
  coefficient: number;
  moyenne: number | null;
  rang: number | null;
  moyenneMax: number | null;
  moyenneMin: number | null;
  nomProfesseur: string | null;
  appreciation: string | null;
};

export type BulletinData = {
  // École
  ecoleName: string;
  ecoleVille: string;
  ecolePays: string;
  ecoleLogo?: string | null;

  // Élève
  eleveNom: string;
  elevePrenom: string;
  eleveMatricule: string;
  eleveClasse: string;
  eleveNiveau: string;
  eleveFiliere?: string | null;
  eleveSexe: "M" | "F";
  eleveDateNaissance?: Date;

  // Période
  periodeNom: string;
  periodeNumero: number;
  annee: string;

  // Résultats
  notes: NoteMatiere[];
  moyenneGenerale: number | null;
  moyenneClasse: number | null;
  moyennePremier: number | null;
  heuresAbsence: number | null;
  
  rang: number | null;
  effectifClasse: number | null;
  appreciation: string | null;
  decision?: string | null;

  // Prof principal
  profPrincipalNom?: string | null;

  // Génération
  generatedAt: Date;
};

/**
 * Charge les données complètes d'un bulletin depuis la base de données
 * pour un élève et une période donnés.
 */
export async function getBulletinData(
  eleveId: string,
  periodeId: string,
  tenantId: string
): Promise<BulletinData | null> {
  const { default: prisma } = await import("@/lib/prisma");

  const eleve = await prisma.eleve.findFirst({
    where: { id: eleveId, tenantId },
    include: {
      classe: {
        include: {
          profPrincipal: {
            include: { user: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!eleve || !eleve.classe) return null;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return null;

  const periode = await prisma.periode.findUnique({ 
    where: { id: periodeId },
    include: { annee: true }
  });
  if (!periode) return null;

  const bulletin = await prisma.bulletin.findUnique({
    where: { eleveId_periodeId: { eleveId, periodeId } },
    include: { matieres: { include: { matiere: true } } }
  });

  if (!bulletin) return null;

  // Formater les notes/matières à partir de BulletinMatiere
  const notesMatiere: NoteMatiere[] = bulletin.matieres.map((bm) => ({
    matiereNom: bm.matiere.nom,
    matiereCode: bm.matiere.code,
    coefficient: bm.coefficient,
    moyenne: bm.moyenneEleve,
    rang: bm.rang,
    moyenneMax: bm.moyenneMax,
    moyenneMin: bm.moyenneMin,
    nomProfesseur: bm.nomProfesseur,
    appreciation: bm.appreciation,
  }));

  // Tri alphabétique par nom de matière
  notesMatiere.sort((a, b) => a.matiereNom.localeCompare(b.matiereNom));

  return {
    ecoleName: tenant.name,
    ecoleVille: tenant.city ?? "Ville",
    ecolePays: tenant.country,
    ecoleLogo: tenant.logoUrl,

    eleveNom: eleve.nom,
    elevePrenom: eleve.prenom,
    eleveMatricule: eleve.matricule,
    eleveClasse: eleve.classe.nom,
    eleveNiveau: eleve.classe.niveau,
    eleveFiliere: eleve.classe.filiere,
    eleveSexe: eleve.sexe,
    eleveDateNaissance: eleve.dateNaissance,

    periodeNom: periode.nom,
    periodeNumero: periode.numero,
    annee: periode.annee.libelle,

    notes: notesMatiere,
    moyenneGenerale: bulletin.moyenneGenerale,
    moyenneClasse: bulletin.moyenneClasse,
    moyennePremier: bulletin.moyennePremier,
    heuresAbsence: bulletin.heuresAbsence,
    rang: bulletin.rang,
    effectifClasse: bulletin.effectifClasse,
    appreciation: bulletin.appreciation,
    decision: bulletin.decision,

    profPrincipalNom: eleve.classe.profPrincipal?.user.name,

    generatedAt: bulletin.createdAt,
  };
}
