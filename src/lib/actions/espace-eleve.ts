"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ESPACE_ELEVE_CHOISI_COOKIE } from "@/lib/learnos/dossier-eleve";
import { auditFire } from "@/lib/audit";

/**
 * Bascule d'élève dans l'espace STUDENT — comptes hybrides (parent+élève).
 *
 * Un compte qui possède à la fois PARENT et STUDENT peut incarner l'un de
 * ses enfants dans l'espace élève, pour la démonstration comme pour une
 * famille qui gère le suivi de l'enfant depuis son propre compte. Le choix
 * est posé dans un cookie httpOnly ; chaque lecture (`eleveDeLUtilisateur`)
 * le REVALIDE contre le périmètre familial — le cookie seul ne donne rien.
 *
 * La porte est double : rôle actif STUDENT et rôle PARENT possédé. Un
 * compte élève ordinaire ne peut rien choisir, et un parent sans rôle
 * élève n'a pas à passer par ici — son espace (`/parent`) couvre déjà tout.
 */
export async function choisirEleveEspaceAction(
  eleveId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.tenantId) {
      return { success: false, error: "NON_AUTORISE" };
    }

    const { id: userId, tenantId } = session.user;
    const roles = (session.user as { availableRoles?: string[] }).availableRoles;

    if (session.user.role !== "STUDENT" || !roles?.includes("PARENT")) {
      auditFire({
        userId,
        tenantId,
        action: "espace-eleve:basculer",
        verdict: "DENIED",
        resource: "eleve",
        reason: "Bascule d'élève réservée aux comptes hybrides STUDENT+PARENT",
      });
      return { success: false, error: "NON_AUTORISE" };
    }

    // Fail-closed : la fiche doit être un enfant ACTIF du compte, dans ce
    // tenant. Un identifiant arbitraire — l'élève d'un autre compte — est
    // refusé ici, avant même de toucher au cookie.
    // eslint-disable-next-line ecolpro/require-site-filter -- validation du périmètre familial : parent.userId borne déjà au compte connecté
    const enfant = await prisma.eleve.findFirst({
      where: {
        id: eleveId,
        tenantId,
        deletedAt: null,
        statut: "ACTIF",
        parents: { some: { parent: { userId } } },
      },
      select: { id: true, prenom: true, nom: true },
    });

    if (!enfant) {
      auditFire({
        userId,
        tenantId,
        action: "espace-eleve:basculer",
        verdict: "DENIED",
        resource: "eleve",
        reason: "Fiche hors du périmètre familial",
        metadata: { eleveId },
      });
      return { success: false, error: "ELEVE_INTROUVABLE" };
    }

    const store = await cookies();
    store.set(ESPACE_ELEVE_CHOISI_COOKIE, enfant.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    auditFire({
      userId,
      tenantId,
      action: "espace-eleve:basculer",
      verdict: "ALLOWED",
      resource: "eleve",
      reason: `Espace élève incarné : ${enfant.prenom} ${enfant.nom}`,
      metadata: { eleveId: enfant.id },
    });

    // Rafraîchir l'espace entier : dossier, compétences, évolution et
    // entraînement suivent tous le choix.
    revalidatePath("/", "layout");

    return { success: true };
  } catch (error) {
    console.error("Erreur bascule espace élève:", error);
    return { success: false, error: "ERREUR_SERVEUR" };
  }
}

/**
 * Revient à la fiche liée au compte (comportement par défaut de l'espace
 * élève). Même double porte que la bascule : STUDENT actif + PARENT possédé.
 */
export async function reinitialiserEleveEspaceAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.tenantId) {
      return { success: false, error: "NON_AUTORISE" };
    }

    const roles = (session.user as { availableRoles?: string[] }).availableRoles;
    if (session.user.role !== "STUDENT" || !roles?.includes("PARENT")) {
      return { success: false, error: "NON_AUTORISE" };
    }

    const store = await cookies();
    store.delete(ESPACE_ELEVE_CHOISI_COOKIE);

    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    console.error("Erreur réinitialisation espace élève:", error);
    return { success: false, error: "ERREUR_SERVEUR" };
  }
}
