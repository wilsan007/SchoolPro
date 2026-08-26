"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { siteFilterForModel, requireSiteIdForCreate } from "@/lib/site-filter";
import { checkPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { trouverDoublon, resoudreIdentiteKey, cleDepuisFiche } from "@/lib/eleve-identity-server";
import { estDateApproximative } from "@/lib/eleve-identity";
import { z } from "zod";

const LienParente = z.enum(["PERE", "MERE", "TUTEUR", "AUTRE"]);

const EleveFormSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  prenom: z.string().min(1, "Le prénom est requis"),
  dateNaissance: z.string().min(1, "La date de naissance est requise"),
  lieuNaissance: z.string().optional(),
  nationalite: z.string().optional(),
  sexe: z.enum(["M", "F"]),
  classeId: z.string().optional(),
  statut: z.enum(["ACTIF", "REINSCRIT", "NON_REINSCRIT", "TRANSFERE", "DIPLOME", "EXCLU", "ABANDONNE"]).optional(),
  groupeSanguin: z.string().optional(),
  allergies: z.string().optional(),
  besoinsSpeciaux: z.string().optional(),
  regime: z.enum(["interne", "demi-pensionnaire", "externe"]).optional(),
  transport: z.string().optional(),
  contactUrgenceNom: z.string().optional(),
  contactUrgencePhone: z.string().optional(),
  numeroBoursier: z.string().optional(),
  matricule: z.string().optional(),
  parentNom: z.string().optional(),
  parentPrenom: z.string().optional(),
  parentPhone: z.string().optional(),
  parentEmail: z.string().email().optional().or(z.literal("")),
  parentProfession: z.string().optional(),
  parentAdresse: z.string().optional(),
  parentLien: LienParente.optional(),
  parentIsGardien: z.boolean().optional(),
  photoUrl: z.string().optional().nullable(),
});

export type EleveFormData = z.infer<typeof EleveFormSchema>;

/**
 * Point de contrôle soumis à l'administrateur avant enregistrement.
 *
 * On ne refuse pas : on expose ce qui est suspect et on laisse trancher.
 * Une date au 1er janvier peut être exacte, deux élèves peuvent réellement
 * partager nom, prénom et date de naissance — seul l'établissement le sait.
 */
export interface ConfirmationRequise {
  code: "DATE_APPROXIMATIVE" | "DOUBLON_IDENTITE";
  titre: string;
  message: string;
}

export interface Confirmations {
  /** L'administrateur atteste que la date de naissance est exacte. */
  dateNaissance?: boolean;
  /** L'administrateur atteste qu'il s'agit d'une personne différente. */
  doublon?: boolean;
}

export type ResultatEleve =
  | { success: true; id: string }
  | { success: false; confirmation: ConfirmationRequise };

export async function getClassesForTenant() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  return prisma.classe.findMany({
    where: { tenantId: session.user.tenantId, ...siteFilterForModel("classe", session.user) },
    orderBy: { nom: "asc" },
  });
}

export async function getSitesForUser() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  const isSiteAdmin = session.user.role === "TENANT_ADMIN" || session.user.role === "SUPER_ADMIN";
  return prisma.site.findMany({
    where: isSiteAdmin
      ? { tenantId: session.user.tenantId, actif: true, deletedAt: null }
      : {
          tenantId: session.user.tenantId,
          actif: true,
          deletedAt: null,
          OR: [
            { userSites: { some: { userId: session.user.id } } },
            { enseignantSites: { some: { enseignant: { userId: session.user.id, tenantId: session.user.tenantId } } } },
          ],
        },
    select: { id: true, nom: true, code: true },
    orderBy: { nom: "asc" },
  });
}

export async function getEleveForEdit(id: string) {
  const session = await auth();
  if (!session?.user?.tenantId) return null;

  const eleve = await prisma.eleve.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilterForModel("eleve", session.user) },
    include: {
      classe: true,
      // EleveParent n'a pas de colonne siteId propre : l'isolation passe par
      // l'élève parent qui est déjà filtré par tenantId et siteId. Un lien
      // eleveParent appartient forcément au même périmètre que son élève.
      // eslint-disable-next-line ecolpro/require-site-filter
      parents: {
        include: { parent: true },
        orderBy: { isGardien: "desc" },
        take: 1,
      },
    },
  });

  if (!eleve) return null;

  const tuteur = eleve.parents[0]?.parent;
  return {
    ...eleve,
    dateNaissance: eleve.dateNaissance.toISOString().split("T")[0],
    lieuNaissance: eleve.lieuNaissance ?? undefined,
    nationalite: eleve.nationalite ?? undefined,
    groupeSanguin: eleve.groupeSanguin ?? undefined,
    allergies: eleve.allergies ?? undefined,
    besoinsSpeciaux: eleve.besoinsSpeciaux ?? undefined,
    regime: eleve.regime ?? undefined,
    transport: eleve.transport ?? undefined,
    contactUrgenceNom: eleve.contactUrgenceNom ?? undefined,
    contactUrgencePhone: eleve.contactUrgencePhone ?? undefined,
    numeroBoursier: eleve.numeroBoursier ?? undefined,
    parentNom: tuteur?.nom ?? "",
    parentPrenom: tuteur?.prenom ?? "",
    parentPhone: tuteur?.phone ?? "",
    parentEmail: tuteur?.email ?? "",
    parentProfession: tuteur?.profession ?? "",
    parentAdresse: tuteur?.adresse ?? "",
    parentLien: eleve.parents[0]?.lien ?? "PERE",
    parentIsGardien: eleve.parents[0]?.isGardien ?? true,
    photoUrl: eleve.photoUrl ?? undefined,
  };
}

export async function createEleve(
  data: EleveFormData,
  confirmations: Confirmations = {}
): Promise<ResultatEleve> {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const tenantId = session.user.tenantId;
  const siteError = requireSiteIdForCreate(session.user);
  if (siteError) throw new Error(siteError);

  const parsed = EleveFormSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const values = parsed.data;
  const anneeInscription = await getAnneeCouranteLibelle(tenantId);
  if (!anneeInscription) throw new Error("Aucune année scolaire active pour ce tenant");

  let matricule = values.matricule?.trim();
  if (!matricule) {
    const count = await prisma.eleve.count({ where: { tenantId, ...siteFilterForModel("eleve", session.user) } });
    matricule = `ECL-${anneeInscription}-${String(count + 1).padStart(4, "0")}`;
  }

  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- findUnique sur contrainte unique tenantId_matricule, le tenantId est dans la clé composite
  const existing = await prisma.eleve.findUnique({
    where: { tenantId_matricule: { tenantId, matricule } },
  });
  if (existing) throw new Error("Ce matricule existe déjà");

  const identite = {
    nom: values.nom,
    prenom: values.prenom,
    dateNaissance: new Date(values.dateNaissance),
  };

  // Date au 1er janvier : très probablement une date de repli. On la signale
  // et on demande confirmation — sans la refuser, car elle peut être exacte.
  if (estDateApproximative(identite.dateNaissance) && !confirmations.dateNaissance) {
    return {
      success: false,
      confirmation: {
        code: "DATE_APPROXIMATIVE",
        titre: "Date de naissance à confirmer",
        message: `La date du ${identite.dateNaissance.toLocaleDateString("fr-FR")} est celle qu'on saisit habituellement quand la date réelle est inconnue. C'est aussi elle qui permet de distinguer deux élèves de même nom. Confirmez-vous qu'il s'agit bien de la date exacte ?`,
      },
    };
  }

  // Contrôle d'identité à la saisie manuelle : jusqu'ici seul l'import
  // vérifiait, une secrétaire pouvait ressaisir un élève déjà inscrit sans le
  // moindre signal. Deux personnes peuvent réellement porter les mêmes nom,
  // prénom et date de naissance : on fait confirmer, on ne refuse pas.
  const doublon = await trouverDoublon(tenantId, identite);
  if (doublon && !confirmations.doublon) {
    return {
      success: false,
      confirmation: {
        code: "DOUBLON_IDENTITE",
        titre: doublon.archive ? "Une fiche archivée correspond" : "Un élève identique existe déjà",
        message: doublon.archive
          ? `${doublon.prenom} ${doublon.nom} figure déjà dans les fiches archivées, sous le matricule ${doublon.matricule}. Il est préférable de la restaurer. Confirmez-vous qu'il s'agit d'une autre personne ?`
          : `${doublon.prenom} ${doublon.nom}, né(e) le ${identite.dateNaissance.toLocaleDateString("fr-FR")}, est déjà inscrit(e) sous le matricule ${doublon.matricule}${doublon.classe ? ` en ${doublon.classe}` : ""}. Confirmez-vous qu'il s'agit d'une autre personne ?`,
      },
    };
  }
  const identiteKey = await resoudreIdentiteKey(tenantId, identite, {
    forcer: confirmations.doublon,
  });

  // L'élève hérite du site de sa classe, unique source de vérité.
  // S'il n'est rattaché à aucune classe, on conserve le site de la session.
  let resolvedSiteId = session.user.siteId ?? null;
  if (values.classeId) {
    // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- findUnique pour récupérer le siteId de la classe
    const classe = await prisma.classe.findUnique({
      where: { id: values.classeId },
      select: { siteId: true },
    });
    if (classe?.siteId) resolvedSiteId = classe.siteId;
  }

  const eleve = await prisma.eleve.create({
    data: {
      tenantId,
      siteId: resolvedSiteId,
      matricule,
      nom: values.nom,
      prenom: values.prenom,
      dateNaissance: new Date(values.dateNaissance),
      lieuNaissance: values.lieuNaissance || null,
      nationalite: values.nationalite || "SN",
      sexe: values.sexe,
      classeId: values.classeId || null,
      statut: values.statut || "ACTIF",
      groupeSanguin: values.groupeSanguin || null,
      allergies: values.allergies || null,
      besoinsSpeciaux: values.besoinsSpeciaux || null,
      regime: values.regime || null,
      transport: values.transport || null,
      contactUrgenceNom: values.contactUrgenceNom || null,
      contactUrgencePhone: values.contactUrgencePhone || null,
      numeroBoursier: values.numeroBoursier || null,
      anneeInscription,
      dateInscription: new Date(),
      photoUrl: values.photoUrl || null,
      identiteKey,
    },
  });

  // Créer l'entrée d'historique de classe initiale
  if (values.classeId) {
    await prisma.historiqueClasse.create({
      data: {
        tenantId,
        eleveId: eleve.id,
        classeId: values.classeId,
        dateEntree: new Date(),
        motif: "Inscription",
      },
    }).catch(() => {}); // Non-bloquant
  }

  if (values.parentNom && values.parentPrenom && values.parentPhone) {
    const parent = await prisma.parent.create({
      data: {
        tenantId,
        nom: values.parentNom,
        prenom: values.parentPrenom,
        phone: values.parentPhone,
        email: values.parentEmail || null,
        profession: values.parentProfession || null,
        adresse: values.parentAdresse || null,
      },
    });

    await prisma.eleveParent.create({
      data: {
        eleveId: eleve.id,
        parentId: parent.id,
        lien: values.parentLien || "PERE",
        isGardien: values.parentIsGardien ?? true,
      },
    });
  }

  revalidatePath("/eleves");
  // Les effectifs par classe sont aussi affichés dans Paramètres → Pédagogie :
  // sans cette invalidation, cet écran garde les chiffres d.avant.
  revalidatePath("/parametres");
  revalidateTag("eleves-stats");
  revalidateTag("dashboard-data");
  return { success: true, id: eleve.id };
}

export async function updateEleve(
  id: string,
  data: EleveFormData,
  confirmations: Confirmations = {}
): Promise<ResultatEleve> {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const tenantId = session.user.tenantId;
  const parsed = EleveFormSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const values = parsed.data;

  const existing = await prisma.eleve.findFirst({
    where: { id, tenantId, ...siteFilterForModel("eleve", session.user) },
    // Voir ci-dessus : eleveParent est isolé par son élève parent.
    // eslint-disable-next-line ecolpro/require-site-filter
    include: { parents: { include: { parent: true } } },
  });
  if (!existing) throw new Error("Élève non trouvé");

  // Corriger un nom ou une date change l'identité : la clé doit suivre, sans
  // quoi elle resterait figée sur l'ancienne valeur et ne protégerait plus
  // rien. Les mêmes points de contrôle qu'à la création s'appliquent.
  const identite = {
    nom: values.nom,
    prenom: values.prenom,
    dateNaissance: new Date(values.dateNaissance),
  };

  if (estDateApproximative(identite.dateNaissance) && !confirmations.dateNaissance) {
    return {
      success: false,
      confirmation: {
        code: "DATE_APPROXIMATIVE",
        titre: "Date de naissance à confirmer",
        message: `La date du ${identite.dateNaissance.toLocaleDateString("fr-FR")} est celle qu'on saisit habituellement quand la date réelle est inconnue. Confirmez-vous qu'il s'agit bien de la date exacte ?`,
      },
    };
  }

  const doublon = await trouverDoublon(tenantId, identite, id);
  if (doublon && !confirmations.doublon) {
    return {
      success: false,
      confirmation: {
        code: "DOUBLON_IDENTITE",
        titre: "Un élève identique existe déjà",
        message: `Cette identité correspond déjà à ${doublon.prenom} ${doublon.nom} (matricule ${doublon.matricule}). Confirmez-vous qu'il s'agit de deux personnes différentes ?`,
      },
    };
  }
  const identiteKey = doublon
    ? await resoudreIdentiteKey(tenantId, identite, { excludeId: id, forcer: true })
    : cleDepuisFiche(identite);

  // L'élève suit le site de sa classe ; s'il n'est rattaché à aucune classe,
  // on conserve son site actuel. La classe doit appartenir au tenant ET au
  // périmètre de l'utilisateur, sinon on pourrait faire suivre la siteId d'une
  // classe d'un autre site/tenant à cet élève.
  let resolvedSiteId = existing.siteId;
  if (values.classeId) {
    const classe = await prisma.classe.findFirst({
      where: {
        id: values.classeId,
        tenantId: session.user.tenantId,
        ...siteFilterForModel("classe", session.user),
      },
      select: { siteId: true },
    });
    if (classe?.siteId) resolvedSiteId = classe.siteId;
  }

  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- existing vérifié avec tenantId + siteFilter ci-dessus
  await prisma.eleve.update({
    where: { id },
    data: {
      nom: values.nom,
      prenom: values.prenom,
      dateNaissance: new Date(values.dateNaissance),
      identiteKey,
      lieuNaissance: values.lieuNaissance || null,
      nationalite: values.nationalite || "SN",
      sexe: values.sexe,
      classeId: values.classeId || null,
      siteId: resolvedSiteId,
      statut: values.statut || "ACTIF",
      groupeSanguin: values.groupeSanguin || null,
      allergies: values.allergies || null,
      besoinsSpeciaux: values.besoinsSpeciaux || null,
      regime: values.regime || null,
      transport: values.transport || null,
      contactUrgenceNom: values.contactUrgenceNom || null,
      contactUrgencePhone: values.contactUrgencePhone || null,
      numeroBoursier: values.numeroBoursier || null,
      photoUrl: values.photoUrl || null,
    },
  });

  const tuteurLink = existing.parents[0];
  if (values.parentNom && values.parentPrenom && values.parentPhone) {
    if (tuteurLink) {
      // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- tuteurLink.parentId vérifié via existing (tenantId + siteFilter)
      await prisma.parent.update({
        where: { id: tuteurLink.parentId },
        data: {
          nom: values.parentNom,
          prenom: values.parentPrenom,
          phone: values.parentPhone,
          email: values.parentEmail || null,
          profession: values.parentProfession || null,
          adresse: values.parentAdresse || null,
        },
      });
      await prisma.eleveParent.update({
        where: { eleveId_parentId: { eleveId: id, parentId: tuteurLink.parentId } },
        data: { lien: values.parentLien || "PERE", isGardien: values.parentIsGardien ?? true },
      });
    } else {
      const parent = await prisma.parent.create({
        data: {
          tenantId,
          nom: values.parentNom,
          prenom: values.parentPrenom,
          phone: values.parentPhone,
          email: values.parentEmail || null,
          profession: values.parentProfession || null,
          adresse: values.parentAdresse || null,
        },
      });
      await prisma.eleveParent.create({
        data: {
          eleveId: id,
          parentId: parent.id,
          lien: values.parentLien || "PERE",
          isGardien: values.parentIsGardien ?? true,
        },
      });
    }
  }

  revalidatePath("/eleves");
  // Les effectifs par classe sont aussi affichés dans Paramètres → Pédagogie :
  // sans cette invalidation, cet écran garde les chiffres d.avant.
  revalidatePath("/parametres");
  revalidatePath(`/eleves/${id}`);
  revalidateTag("eleves-stats");
  revalidateTag("dashboard-data");
  return { success: true, id };
}

/**
 * Suppression d'un élève (soft delete).
 *
 * Bonnes pratiques (PowerSchool, Infinite Campus, Eduka, OpenEducat) :
 * - JAMAIS de hard delete : les données historiques (notes, absences, factures)
 *   doivent être conservées pour la conformité et l'audit.
 * - Soft delete : on marque l'élève avec un timestamp `deletedAt`.
 * - L'élève disparaît des listes actives mais ses données restent en base.
 * - Désactivation du compte utilisateur lié (userId → null).
 * - Audit trail obligatoire (qui, quand, pourquoi).
 * - Restauration possible tant que les données ne sont pas purgées.
 */
export async function deleteEleve(id: string, reason?: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const denied = checkPermission(session.user.role, "eleves:delete");
  if (denied) throw new Error("Permission refusée");

  const tenantId = session.user.tenantId;
  const existing = await prisma.eleve.findFirst({
    where: { id, tenantId, ...siteFilterForModel("eleve", session.user) },
    select: { id: true, nom: true, prenom: true, matricule: true, userId: true, deletedAt: true },
  });

  if (!existing) throw new Error("Élève non trouvé");
  if (existing.deletedAt) throw new Error("Cet élève est déjà supprimé");

  // Soft delete : marquer avec un timestamp + désactiver le compte utilisateur
  await prisma.eleve.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      statut: "ABANDONNE",
      userId: null, // Déconnecter le compte élève
      dateSortie: new Date(),
      motifSortie: reason ?? "Suppression administrative",
      // Libère l'identité : la contrainte d'unicité ignore les NULL, donc une
      // réinscription ultérieure de la même personne reste possible.
      identiteKey: null,
    },
  });

  // Clôturer l'historique de classe
  await prisma.historiqueClasse.updateMany({
    where: { eleveId: id, tenantId, dateSortie: null },
    data: { dateSortie: new Date(), motif: "Départ/suppression" },
  }).catch(() => {}); // Non-bloquant

  // Audit trail
  await audit({
    tenantId,
    userId: session.user.id,
    action: "eleve.delete",
    verdict: "ALLOWED",
    resource: "eleve",
    resourceId: id,
    reason: reason ?? "Suppression administrative",
    metadata: {
      nom: existing.nom,
      prenom: existing.prenom,
      matricule: existing.matricule,
    },
  });

  revalidatePath("/eleves");
  // Les effectifs par classe sont aussi affichés dans Paramètres → Pédagogie :
  // sans cette invalidation, cet écran garde les chiffres d.avant.
  revalidatePath("/parametres");
  revalidatePath(`/eleves/${id}`);
  revalidateTag("eleves-stats");
  revalidateTag("dashboard-data");
  return { success: true as boolean, id };
}

/**
 * Restauration d'un élève supprimé (soft delete).
 */
export async function restoreEleve(id: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const denied = checkPermission(session.user.role, "eleves:delete");
  if (denied) throw new Error("Permission refusée");

  const tenantId = session.user.tenantId;
  const existing = await prisma.eleve.findFirst({
    where: { id, tenantId, ...siteFilterForModel("eleve", session.user) },
    select: { id: true, nom: true, prenom: true, matricule: true, deletedAt: true, dateNaissance: true },
  });

  if (!existing) throw new Error("Élève non trouvé");
  if (!existing.deletedAt) throw new Error("Cet élève n'est pas supprimé");

  // La place a pu être reprise entre-temps par une réinscription : on le
  // vérifie avant de restaurer, plutôt que de laisser la contrainte échouer
  // avec un message technique.
  const identite = {
    nom: existing.nom,
    prenom: existing.prenom,
    dateNaissance: existing.dateNaissance,
  };
  const occupant = await trouverDoublon(tenantId, identite, id);
  if (occupant) {
    throw new Error(
      `Impossible de restaurer : ${occupant.prenom} ${occupant.nom} a été réinscrit(e) entre-temps sous le matricule ${occupant.matricule}.`
    );
  }

  await prisma.eleve.update({
    where: { id },
    data: {
      deletedAt: null,
      statut: "ACTIF",
      identiteKey: cleDepuisFiche(identite),
    },
  });

  await audit({
    tenantId,
    userId: session.user.id,
    action: "eleve.restore",
    verdict: "ALLOWED",
    resource: "eleve",
    resourceId: id,
    reason: "Restauration d'élève supprimé",
    metadata: {
      nom: existing.nom,
      prenom: existing.prenom,
      matricule: existing.matricule,
    },
  });

  revalidatePath("/eleves");
  // Les effectifs par classe sont aussi affichés dans Paramètres → Pédagogie :
  // sans cette invalidation, cet écran garde les chiffres d.avant.
  revalidatePath("/parametres");
  revalidatePath(`/eleves/${id}`);
  revalidateTag("eleves-stats");
  revalidateTag("dashboard-data");
  return { success: true as boolean, id };
}
