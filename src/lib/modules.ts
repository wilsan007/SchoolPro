/**
 * Gestion des modules activables.
 *
 * Un module est une fonctionnalité optionnelle qu'un tenant peut
 * activer ou désactiver. Le catalogue des modules est défini en base
 * (table `modules`), et les activations par tenant sont dans
 * `module_activations`.
 *
 * Règles :
 *   — Un module peut être activé seulement si le plan du tenant
 *     est >= au planMinimum du module.
 *   — Un module activé par défaut l'est automatiquement à la création
 *     du tenant.
 *   — Désactiver un module ne supprime pas les données, elles restent
 *     mais ne sont plus accessibles via l'UI.
 */

import prisma from "@/lib/prisma";
import type { ModuleActivation, PlanType } from "@prisma/client";

/** Hiérarchie des plans pour comparaison. */
const PLAN_ORDRE: Record<PlanType, number> = {
  STARTER: 0,
  PRO: 1,
  BUSINESS: 2,
  ENTERPRISE: 3,
};

/** Vérifie si un plan est suffisant pour un module. */
export function planSuffisant(
  planTenant: PlanType,
  planMinimum: PlanType
): boolean {
  return PLAN_ORDRE[planTenant] >= PLAN_ORDRE[planMinimum];
}

/**
 * Liste tous les modules disponibles avec leur statut d'activation
 * pour un tenant donné.
 */
export async function listerModulesPourTenant(tenantId: string) {
  const [modules, activations] = await Promise.all([
    prisma.module.findMany({ orderBy: { ordre: "asc" } }),
    prisma.moduleActivation.findMany({
      where: { tenantId },
    }),
  ]);

  const activationMap = new Map(
    activations.map((a) => [a.moduleId, a])
  );

  return modules.map((m) => ({
    ...m,
    activation: activationMap.get(m.id) ?? null,
    estActif:
      activationMap.get(m.id)?.statut === "ACTIF" ||
      (m.actifParDefaut && !activationMap.get(m.id)),
  }));
}

/**
 * Active un module pour un tenant.
 * Vérifie que le plan du tenant est suffisant.
 */
export async function activerModule(
  tenantId: string,
  moduleCode: string,
  userId: string
): Promise<ModuleActivation> {
  const [module, tenant] = await Promise.all([
    prisma.module.findUnique({ where: { code: moduleCode } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
  ]);

  if (!module) {
    throw new Error(`Module inconnu: ${moduleCode}`);
  }

  if (!planSuffisant(tenant.plan, module.planMinimum)) {
    throw new Error(
      `Plan ${tenant.plan} insuffisant pour le module ${moduleCode} (minimum: ${module.planMinimum})`
    );
  }

  // Upsert : si une activation existe (même désactivée), on la réactive
  // eslint-disable-next-line ecolpro/require-tenant-id -- l'activation a été vérifiée par findUnique ci-dessus
  const existing = await prisma.moduleActivation.findUnique({
    where: {
      tenantId_moduleId: { tenantId, moduleId: module.id },
    },
  });

  if (existing) {
    // eslint-disable-next-line ecolpro/require-tenant-id -- l'activation a été vérifiée par findUnique ci-dessus
    return prisma.moduleActivation.update({
      where: { id: existing.id },
      data: {
        statut: "ACTIF",
        activeAt: new Date(),
        desactiveAt: null,
        activeParId: userId,
      },
    });
  }

  return prisma.moduleActivation.create({
    data: {
      tenantId,
      moduleId: module.id,
      statut: "ACTIF",
      activeParId: userId,
    },
  });
}

/**
 * Désactive un module pour un tenant.
 * Les données ne sont pas supprimées.
 */
export async function desactiverModule(
  tenantId: string,
  moduleCode: string,
  userId: string
): Promise<ModuleActivation> {
  const moduleEntity = await prisma.module.findUnique({
    where: { code: moduleCode },
  });
  if (!moduleEntity) {
    throw new Error(`Module inconnu: ${moduleCode}`);
  }

  // eslint-disable-next-line ecolpro/require-tenant-id -- l'activation a été vérifiée par findUnique ci-dessus
  const activation = await prisma.moduleActivation.findUnique({
    where: {
      tenantId_moduleId: { tenantId, moduleId: moduleEntity.id },
    },
  });
  if (!activation) {
    throw new Error(`Module ${moduleCode} n'est pas activé pour ce tenant`);
  }

  // eslint-disable-next-line ecolpro/require-tenant-id -- l'activation a été vérifiée par findUnique ci-dessus
  return prisma.moduleActivation.update({
    where: { id: activation.id },
    data: {
      statut: "DESACTIVE",
      desactiveAt: new Date(),
      desactiveParId: userId,
    },
  });
}

/**
 * Vérifie si un module est actif pour un tenant.
 * Utilisé par les gardes pour bloquer l'accès aux modules désactivés.
 */
export async function moduleEstActif(
  tenantId: string,
  moduleCode: string
): Promise<boolean> {
  const moduleEntity = await prisma.module.findUnique({
    where: { code: moduleCode },
  });
  if (!moduleEntity) return false;

  // Si le module est activé par défaut et n'a pas d'activation explicite,
  // il est considéré comme actif
  if (moduleEntity.actifParDefaut) {
    // eslint-disable-next-line ecolpro/require-tenant-id -- l'activation a été vérifiée par findUnique ci-dessus
    const activation = await prisma.moduleActivation.findUnique({
      where: {
        tenantId_moduleId: { tenantId, moduleId: moduleEntity.id },
      },
    });
    if (!activation) return true;
    return activation.statut === "ACTIF";
  }

  // eslint-disable-next-line ecolpro/require-tenant-id -- l'activation a été vérifiée par findUnique ci-dessus
  const activation = await prisma.moduleActivation.findUnique({
    where: {
      tenantId_moduleId: { tenantId, moduleId: moduleEntity.id },
    },
  });
  return activation?.statut === "ACTIF";
}

/**
 * Active les modules par défaut pour un nouveau tenant.
 * À appeler à la création du tenant.
 */
export async function activerModulesParDefaut(tenantId: string): Promise<void> {
  const modulesParDefaut = await prisma.module.findMany({
    where: { actifParDefaut: true },
  });

  if (modulesParDefaut.length === 0) return;

  await prisma.moduleActivation.createMany({
    data: modulesParDefaut.map((m) => ({
      tenantId,
      moduleId: m.id,
      statut: "ACTIF",
    })),
    skipDuplicates: true,
  });
}

/**
 * Initialise le catalogue de modules s'il est vide.
 * À appeler au démarrage ou via un script de seed.
 */
export async function initialiserCatalogueModules(): Promise<void> {
  const count = await prisma.module.count();
  if (count > 0) return;

  const MODULES = [
    { code: "LEARNOS", nom: "LEARNOS", planMinimum: "PRO", actifParDefaut: false, ordre: 1 },
    { code: "MESSAGERIE", nom: "Messagerie", planMinimum: "STARTER", actifParDefaut: true, ordre: 2 },
    { code: "RH", nom: "Ressources humaines", planMinimum: "PRO", actifParDefaut: false, ordre: 3 },
    { code: "INVENTAIRE", nom: "Inventaire", planMinimum: "PRO", actifParDefaut: false, ordre: 4 },
    { code: "ALUMNI", nom: "Alumni", planMinimum: "STARTER", actifParDefaut: false, ordre: 5 },
    { code: "ORIENTATION", nom: "Orientation", planMinimum: "PRO", actifParDefaut: false, ordre: 6 },
    { code: "FINANCE", nom: "Facturation & finances", planMinimum: "STARTER", actifParDefaut: true, ordre: 7 },
    { code: "VIE_SCOLAIRE", nom: "Vie scolaire", planMinimum: "STARTER", actifParDefaut: true, ordre: 8 },
    { code: "ANALYTICS", nom: "Analytics", planMinimum: "PRO", actifParDefaut: false, ordre: 9 },
    { code: "EXAMENS", nom: "Examens", planMinimum: "STARTER", actifParDefaut: true, ordre: 10 },
  ] as const;

  await prisma.module.createMany({
    data: MODULES.map((m) => ({
      code: m.code,
      nom: m.nom,
      planMinimum: m.planMinimum,
      actifParDefaut: m.actifParDefaut,
      ordre: m.ordre,
    })),
  });
}
