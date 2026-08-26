import prisma from "@/lib/prisma";
import { roleHasPermission, ROLE_PERMISSIONS, type RoleKey } from "@/lib/permissions";

export async function getUserPermissionOverrides(
  userId: string,
  tenantId: string
): Promise<{ grants: string[]; denies: string[] }> {
  const overrides = await prisma.userPermission.findMany({
    where: { userId, tenantId },
    select: { permission: true, mode: true },
  });
  return {
    grants: overrides.filter((o) => o.mode === "grant").map((o) => o.permission),
    denies: overrides.filter((o) => o.mode === "deny").map((o) => o.permission),
  };
}

export async function checkUserPermission(
  userId: string,
  tenantId: string,
  role: string,
  permission: string
): Promise<boolean> {
  const { grants, denies } = await getUserPermissionOverrides(userId, tenantId);
  if (denies.includes(permission)) return false;
  if (grants.includes(permission)) return true;
  return roleHasPermission(role as RoleKey, permission);
}

export async function getEffectivePermissions(
  userId: string,
  tenantId: string,
  role: string
): Promise<string[]> {
  const { grants, denies } = await getUserPermissionOverrides(userId, tenantId);
  const rolePerms = ROLE_PERMISSIONS[role as RoleKey] ?? [];
  const base = new Set<string>(rolePerms.filter((p) => !denies.includes(p)));
  for (const g of grants) base.add(g);
  return [...base];
}
