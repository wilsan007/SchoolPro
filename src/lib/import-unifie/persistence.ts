import prisma from "@/lib/prisma";
import { type PlanImport, type ResultatImport } from "./types";
import { type DonneesEnseignant } from "./enseignants";
import { type DonneesClasse } from "./classes";
import { type DonneesMatiere } from "./matieres";
import { type DonneesPersonnelAdmin } from "./personnel-admin";

// ============================================================
// APPLICATION DES PLANS
// ============================================================

// — Helper : génère un mot de passe temporaire —
function motDePasseTemporaire(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw + "!";
}

// — Helper : résout un nom de site en ID —
async function resoudreSiteId(
  tenantId: string,
  nomSite?: string
): Promise<string | null> {
  if (!nomSite) return null;
  const site = await prisma.site.findFirst({
    where: {
      tenantId,
      OR: [
        { nom: { equals: nomSite, mode: "insensitive" } },
        { code: { equals: nomSite, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  return site?.id ?? null;
}

/**
 * Applique un plan d'import d'enseignants.
 * Crée les comptes User + Enseignant + AffectationEnseignant + EnseignantSite.
 */
export async function appliquerImportEnseignants(
  plan: PlanImport<DonneesEnseignant>,
  tenantId: string,
  opts: { annee: string; siteIdParDefaut?: string | null } = { annee: new Date().getFullYear().toString() }
): Promise<ResultatImport & { details: string[] }> {
  let crees = 0, misAJour = 0, ignores = 0, erreurs = 0;
  const details: string[] = [];

  // Précharger les matières et classes du tenant pour résolution par nom
  // eslint-disable-next-line ecolpro/require-site-filter -- import batch, résolution globale par tenant
  const matieres = await prisma.matiere.findMany({
    where: { tenantId },
    select: { id: true, nom: true },
  });
  const matiereParNom = new Map(matieres.map((m) => [m.nom.toLowerCase(), m.id]));

  // eslint-disable-next-line ecolpro/require-site-filter -- import batch, résolution globale par tenant
  const classes = await prisma.classe.findMany({
    where: { tenantId, annee: opts.annee },
    select: { id: true, nom: true, siteId: true },
  });
  const classeParNom = new Map(classes.map((c) => [c.nom.toLowerCase(), c]));

  for (const ligne of plan.lignes) {
    try {
      if (ligne.action === "IGNORER" || ligne.action === "ERREUR") {
        if (ligne.action === "ERREUR") erreurs++;
        else ignores++;
        continue;
      }

      const d = ligne.donnees;
      let userId: string | null = null;
      let enseignantId: string | null = null;

      // Vérifier si l'utilisateur existe déjà
      if (d.email) {
        // eslint-disable-next-line ecolpro/require-site-filter -- recherche par email
        const existingUser = await prisma.user.findFirst({
          where: { email: d.email, tenantId },
        });
        if (existingUser) {
          userId = existingUser.id;
          // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- vérification par userId
          const existingEns = await prisma.enseignant.findFirst({
            where: { userId: existingUser.id },
          });
          if (existingEns) enseignantId = existingEns.id;
        }
      }

      // Créer l'utilisateur si nécessaire
      if (!userId) {
        const tempPw = motDePasseTemporaire();
        const newUser = await prisma.user.create({
          data: {
            tenantId,
            email: d.email || `${d.nom.toLowerCase()}.${d.prenom.toLowerCase()}.${Date.now()}@import.dj`,
            name: `${d.prenom} ${d.nom}`,
            firstName: d.prenom,
            lastName: d.nom,
            phone: d.telephone || null,
            role: "TEACHER",
            password: tempPw,
            mustChangePassword: true,
          },
        });
        userId = newUser.id;
        details.push(`Compte créé pour ${d.prenom} ${d.nom} (email: ${newUser.email})`);
      }

      // Créer l'enseignant si nécessaire
      if (!enseignantId) {
        const newEns = await prisma.enseignant.create({
          data: {
            tenantId,
            userId: userId!,
            matricule: d.matricule || null,
            specialite: d.matieres || null,
            typeContrat: d.typeContrat || null,
          },
        });
        enseignantId = newEns.id;
        crees++;
      } else {
        misAJour++;
      }

      // Résoudre les sites
      const siteIds: string[] = [];
      if (d.sites && d.sites.length > 0) {
        for (const nomSite of d.sites) {
          const sid = await resoudreSiteId(tenantId, nomSite);
          if (sid) siteIds.push(sid);
          else details.push(`⚠ Site non trouvé: "${nomSite}" pour ${d.prenom} ${d.nom}`);
        }
      }
      if (siteIds.length === 0 && opts.siteIdParDefaut) {
        siteIds.push(opts.siteIdParDefaut);
      }

      // Créer les liens EnseignantSite
      for (const sid of siteIds) {
        await prisma.enseignantSite.upsert({
          where: {
            enseignantId_siteId: { enseignantId: enseignantId!, siteId: sid },
          },
          update: {},
          create: { enseignantId: enseignantId!, siteId: sid },
        });
      }

      // Créer les affectations classe + matière
      const classesList = d.classes?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
      const matieresList = d.matieres?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

      if (classesList.length > 0) {
        for (const nomClasse of classesList) {
          const classe = classeParNom.get(nomClasse.toLowerCase());
          if (!classe) {
            details.push(`⚠ Classe non trouvée: "${nomClasse}" pour ${d.prenom} ${d.nom}`);
            continue;
          }

          if (matieresList.length > 0) {
            // Collège/Lycée : affectation par matière
            for (const nomMatiere of matieresList) {
              const matiereId = matiereParNom.get(nomMatiere.toLowerCase());
              if (!matiereId) {
                details.push(`⚠ Matière non trouvée: "${nomMatiere}" pour ${d.prenom} ${d.nom}`);
                continue;
              }
              await prisma.affectationEnseignant.upsert({
                where: {
                  enseignantId_classeId_matiereId: {
                    enseignantId: enseignantId!,
                    classeId: classe.id,
                    matiereId,
                  },
                },
                update: {},
                create: {
                  tenantId,
                  enseignantId: enseignantId!,
                  classeId: classe.id,
                  matiereId,
                },
              });
            }
          } else {
            // Primaire/Maternelle : pas de matière spécifique
            // On ne crée pas d'affectation sans matière — l'enseignant est
            // prof principal de la classe, géré séparément.
            // TODO: si on veut marquer prof principal, il faut une logique dédiée.
          }
        }
      }
    } catch (e) {
      erreurs++;
      details.push(`Erreur ligne ${ligne.numero}: ${e instanceof Error ? e.message : "inconnue"}`);
    }
  }

  return { crees, misAJour, ignores, erreurs, details };
}

/**
 * Applique un plan d'import de personnel administratif.
 * Crée les comptes User avec le rôle et le site spécifiés.
 */
export async function appliquerImportPersonnelAdmin(
  plan: PlanImport<DonneesPersonnelAdmin>,
  tenantId: string
): Promise<ResultatImport & { details: string[] }> {
  let crees = 0, misAJour = 0, ignores = 0, erreurs = 0;
  const details: string[] = [];

  for (const ligne of plan.lignes) {
    try {
      if (ligne.action === "IGNORER" || ligne.action === "ERREUR") {
        if (ligne.action === "ERREUR") erreurs++;
        else ignores++;
        continue;
      }

      const d = ligne.donnees;

      // Résoudre le site
      let siteId: string | null = null;
      if (d.site) {
        siteId = await resoudreSiteId(tenantId, d.site);
        if (!siteId) {
          details.push(`⚠ Site non trouvé: "${d.site}" pour ${d.prenom} ${d.nom}`);
        }
      }

      // Vérifier si l'utilisateur existe
      let user = null;
      if (d.email) {
        // eslint-disable-next-line ecolpro/require-site-filter -- recherche par email
        user = await prisma.user.findFirst({
          where: { email: d.email, tenantId },
        });
      }

      if (user) {
        // Mettre à jour le rôle et le site
        await prisma.user.update({
          where: { id: user.id },
          data: {
            role: d.role as never,
            ...(siteId ? { siteId } : {}),
            phone: d.telephone || user.phone,
          },
        });
        misAJour++;
      } else {
        const tempPw = motDePasseTemporaire();
        const email = d.email || `${d.nom.toLowerCase()}.${d.prenom.toLowerCase()}.${Date.now()}@import.dj`;
        await prisma.user.create({
          data: {
            tenantId,
            email,
            name: `${d.prenom} ${d.nom}`,
            firstName: d.prenom,
            lastName: d.nom,
            phone: d.telephone || null,
            role: d.role as never,
            siteId: siteId || null,
            password: tempPw,
            mustChangePassword: true,
          },
        });
        crees++;
        details.push(`Compte créé pour ${d.prenom} ${d.nom} (${d.role}) — email: ${email}`);
      }
    } catch (e) {
      erreurs++;
      details.push(`Erreur ligne ${ligne.numero}: ${e instanceof Error ? e.message : "inconnue"}`);
    }
  }

  return { crees, misAJour, ignores, erreurs, details };
}

export async function appliquerImportClasses(
  plan: PlanImport<DonneesClasse>,
  tenantId: string,
  annee: string
): Promise<ResultatImport> {
  let crees = 0, misAJour = 0, ignores = 0, erreurs = 0;

  for (const ligne of plan.lignes) {
    try {
      if (ligne.action === "CREER") {
        await prisma.classe.create({
          data: {
            nom: ligne.donnees.nom,
            niveau: ligne.donnees.niveau,
            tenantId,
            annee,
          },
        });
        crees++;
      } else if (ligne.action === "IGNORER") {
        ignores++;
      }
    } catch {
      erreurs++;
    }
  }

  return { crees, misAJour, ignores, erreurs };
}

export async function appliquerImportMatieres(
  plan: PlanImport<DonneesMatiere>,
  tenantId: string
): Promise<ResultatImport> {
  let crees = 0, misAJour = 0, ignores = 0, erreurs = 0;

  for (const ligne of plan.lignes) {
    try {
      if (ligne.action === "CREER") {
        await prisma.matiere.create({
          data: {
            nom: ligne.donnees.nom,
            code: ligne.donnees.code,
            coefficient: ligne.donnees.coefficient ?? 1,
            tenantId,
          },
        });
        crees++;
      } else if (ligne.action === "IGNORER") {
        ignores++;
      }
    } catch {
      erreurs++;
    }
  }

  return { crees, misAJour, ignores, erreurs };
}
