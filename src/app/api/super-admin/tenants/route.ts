import { NextRequest, NextResponse } from "next/server";
import { ELEVE_NON_ARCHIVE } from "@/lib/eleve-filters";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { Session } from "next-auth";
import { erreurJson } from "@/lib/erreurs-api";

function requireSuperAdmin(session: Session | null) {
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    throw new Error("FORBIDDEN");
  }
}

const CreateTenantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Slug: lettres minuscules, chiffres, tirets uniquement"),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default("SN"),
  plan: z.enum(["STARTER", "PRO", "BUSINESS", "ENTERPRISE"]).default("STARTER"),
  // Compte admin de l'école
  adminEmail: z.string().email(),
  adminName: z.string().min(2),
  adminPassword: z.string().min(8),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  try { requireSuperAdmin(session); } catch {
    return erreurJson("ACCES_REFUSE");
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const plan = searchParams.get("plan");
  const status = searchParams.get("status");

  const tenants = await prisma.tenant.findMany({
    where: {
      ...(search ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      } : {}),
      ...(plan ? { plan: plan as any } : {}),
      ...(status ? { status: status as any } : {}),
    },
    include: {
      _count: {
        select: {
          eleves: ELEVE_NON_ARCHIVE,
          enseignants: true,
          users: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Statistiques globales
  const stats = {
    total: tenants.length,
    actifs: tenants.filter((t) => t.status === "ACTIVE").length,
    trials: tenants.filter((t) => t.status === "TRIAL").length,
    suspendus: tenants.filter((t) => t.status === "SUSPENDED").length,
    totalEleves: tenants.reduce((sum, t) => sum + t._count.eleves, 0),
    parPlan: {
      STARTER: tenants.filter((t) => t.plan === "STARTER").length,
      PRO: tenants.filter((t) => t.plan === "PRO").length,
      BUSINESS: tenants.filter((t) => t.plan === "BUSINESS").length,
      ENTERPRISE: tenants.filter((t) => t.plan === "ENTERPRISE").length,
    },
  };

  return NextResponse.json({ tenants, stats });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  try { requireSuperAdmin(session); } catch {
    return erreurJson("ACCES_REFUSE");
  }

  try {
    const json = await request.json();
    const data = CreateTenantSchema.parse(json);

    // Vérifier slug unique
    const existing = await prisma.tenant.findUnique({ where: { slug: data.slug } });
    if (existing) {
      return erreurJson("SLUG_DEJA_UTILISE");
    }

    const bcrypt = await import("bcryptjs");
    const hashedPassword = await bcrypt.hash(data.adminPassword, 12);

    const tenant = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          name: data.name,
          slug: data.slug,
          email: data.email,
          phone: data.phone,
          city: data.city,
          country: data.country,
          plan: data.plan,
          status: "TRIAL",
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Le UserTenant est indispensable : c'est lui qui alimente
      // `availableTenants` dans le JWT et permet le changement d'établissement.
      await tx.user.create({
        data: {
          tenantId: t.id,
          email: data.adminEmail,
          name: data.adminName,
          password: hashedPassword,
          role: "TENANT_ADMIN",
          isActive: true,
          userTenants: {
            create: {
              tenantId: t.id,
              role: "TENANT_ADMIN",
              isActive: true,
              isDefault: true,
            },
          },
        },
      });

      return t;
    });

    return NextResponse.json(tenant, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: err.errors });
    }
    console.error("[SuperAdmin POST tenant] Erreur:", err);
    return erreurJson("ERREUR_SERVEUR");
  }
}
