import prisma from "@/lib/prisma";

// ------------------------------------------------------------
// Budget IA — un plafond par établissement et par jour
// ------------------------------------------------------------
//
// La correction assistée appelle un modèle à chaque production. Sans plafond, un
// seul établissement (ou un élève qui soumet en boucle) épuise le quota gratuit
// de tous, ou fait basculer le routeur sur un palier payant.
//
// On compte dans `AiDecisionLog` plutôt que dans une table dédiée : chaque appel
// routé y est déjà journalisé avec son action, et un second compteur finirait
// par diverger du premier. Les appels servis par le cache sont journalisés aussi
// (cf. `routeAi`) : le plafond est donc prudent, il compte ce qui a été demandé,
// pas seulement ce qui a été facturé.

export const ACTION_CORRECTION = "correction.assistee";

/** Plafond quotidien par établissement, surchargeable par l'environnement. */
export function plafondQuotidien(): number {
  const brut = Number(process.env.AI_CORRECTIONS_PAR_JOUR);
  return Number.isFinite(brut) && brut >= 0 ? Math.floor(brut) : 200;
}

/** Début du jour UTC : un jour glissant de 24 h déborderait sur la veille. */
export function debutDuJour(maintenant: Date = new Date()): Date {
  return new Date(
    Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate())
  );
}

export interface EtatBudget {
  utilise: number;
  plafond: number;
  restant: number;
  epuise: boolean;
}

/** Calcul pur, testable sans base. */
export function etatBudget(utilise: number, plafond: number): EtatBudget {
  const restant = Math.max(0, plafond - utilise);
  return { utilise, plafond, restant, epuise: restant === 0 };
}

/** Corrections déjà demandées aujourd'hui par cet établissement. */
export async function budgetDuJour(
  tenantId: string,
  maintenant: Date = new Date()
): Promise<EtatBudget> {
  // Transverse au tenant À DESSEIN : le plafond est celui de l'ÉTABLISSEMENT,
  // pas du campus. Le filtrer par site laisserait chaque campus consommer le
  // plafond entier, et le multiplierait par leur nombre. Le résultat n'est
  // qu'un entier — aucune ligne du journal ne sort d'ici.
  // eslint-disable-next-line ecolpro/require-site-filter -- plafond d'établissement, cf. ci-dessus
  const utilise = await prisma.aiDecisionLog.count({
    where: {
      tenantId,
      action: ACTION_CORRECTION,
      createdAt: { gte: debutDuJour(maintenant) },
    },
  });
  return etatBudget(utilise, plafondQuotidien());
}
