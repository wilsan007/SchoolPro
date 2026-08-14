import prisma from "@/lib/prisma";

export interface SiteColor {
  base: string;
  light: string;
  border: string;
  text: string;
}

function generateSiteColor(index: number): SiteColor {
  // Angle d'or : repartition progressive et contrastee sur 360°.
  // L'index est fixe par site (creation), donc la couleur est stable.
  const hue = Math.round((index * 137.5) % 360);
  return {
    base: `hsl(${hue} 75% 35%)`,
    light: `hsl(${hue} 90% 96%)`,
    border: `hsl(${hue} 80% 80%)`,
    text: `hsl(${hue} 80% 28%)`,
  };
}

export async function getSiteColorMap(tenantId: string): Promise<Record<string, SiteColor>> {
  const sites = await prisma.site.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const colors: Record<string, SiteColor> = {};
  for (let i = 0; i < sites.length; i++) {
    colors[sites[i].id] = generateSiteColor(i);
  }
  return colors;
}
