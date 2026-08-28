import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { SuperAdminView } from "@/components/super-admin/SuperAdminView";
import { SuperAdminHealth, type TenantHealthRow, type PaymentFailureRow, type AuditRow } from "@/components/super-admin/SuperAdminHealth";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

export default async function SuperAdminPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("nav"),
  ]);

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/login");
  }

  // ── Calcul du début du mois courant ──────────────────────────────
  const now = new Date();
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);

  // ── 1. Santé des tenants ─────────────────────────────────────────
  // eslint-disable-next-line ecolpro/require-tenant-id -- super-admin cross-tenant query
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Pour chaque tenant, calculer les métriques en parallèle
  const tenantHealthPromises = tenants.map(async (tenant) => {
    const [activeUsers, lastLoginAgg, elevesCount, facturesCeMois, adminUser] = await Promise.all([
      // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- super-admin cross-tenant query
      prisma.user.count({
        where: { tenantId: tenant.id, isActive: true },
      }),
      // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- super-admin cross-tenant query
      prisma.user.aggregate({
        where: { tenantId: tenant.id },
        _max: { lastLoginAt: true },
      }),
      // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- super-admin cross-tenant query
      prisma.eleve.count({
        where: { tenantId: tenant.id, statut: "ACTIF", deletedAt: null },
      }),
      // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- super-admin cross-tenant query
      prisma.facture.count({
        where: { tenantId: tenant.id, createdAt: { gte: debutMois } },
      }),
      // Trouver un admin du tenant pour la prise de contrôle
      // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- super-admin cross-tenant query
      prisma.user.findFirst({
        where: {
          tenantId: tenant.id,
          isActive: true,
          role: { in: ["TENANT_ADMIN", "PRINCIPAL"] as Role[] },
        },
        select: { id: true, email: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      activeUsers,
      lastLoginAt: lastLoginAgg._max.lastLoginAt?.toISOString() ?? null,
      elevesCount,
      facturesCeMois,
      adminUserId: adminUser?.id ?? null,
      adminUserEmail: adminUser?.email ?? null,
    } satisfies TenantHealthRow;
  });

  const tenantHealthRows = await Promise.all(tenantHealthPromises);

  // ── 2. Échecs de paiement ────────────────────────────────────────
  // Le modèle Paiement n'a pas de champ `statut` ni d'enum StatutPaiement.
  // On utilise les factures en statut EN_RETARD comme proxy des échecs de
  // paiement, avec les relations eleve et tenant.
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- super-admin cross-tenant query
  const facturesEnRetard = await prisma.facture.findMany({
    where: {
      statut: "EN_RETARD",
      createdAt: { gte: debutMois },
    },
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      eleve: { select: { nom: true, prenom: true } },
      tenant: { select: { name: true } },
    },
  });

  const paymentFailures: PaymentFailureRow[] = facturesEnRetard.map((f) => ({
    id: f.id,
    numero: f.numero,
    montant: f.montant,
    devise: f.devise,
    createdAt: f.createdAt.toISOString(),
    tenantName: f.tenant.name,
    eleveNom: f.eleve?.nom ?? "",
    elevePrenom: f.eleve?.prenom ?? "",
  }));

  // ── 3. Audit inter-tenants (impersonation) ───────────────────────
  // On récupère les entrées JournalApprentissage avec typeAnalyse "impersonation"
  // ainsi que les AuditLog avec action commençant par "impersonation:".
  // AuditLog n'a pas de relation `tenant` — on résout les noms via le lookup.
  const tenantNameMap = new Map(tenants.map((t) => [t.id, t.name]));

  const [journalAudit, auditLogEntries] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-tenant-id -- super-admin cross-tenant query
    prisma.journalApprentissage.findMany({
      where: { typeAnalyse: "impersonation" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        tenant: { select: { name: true } },
      },
    }),
    // eslint-disable-next-line ecolpro/require-tenant-id -- super-admin cross-tenant query
    prisma.auditLog.findMany({
      where: { action: { startsWith: "impersonation:" } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  // Fusionner et trier par date décroissante
  const auditRows: AuditRow[] = [
    ...journalAudit.map((j) => {
      let targetEmail: string | null = null;
      try {
        const detail = JSON.parse(j.detail) as Record<string, unknown>;
        targetEmail = (detail.targetUserEmail as string | null) ?? null;
      } catch { /* ignore */ }
      return {
        id: j.id,
        createdAt: j.createdAt.toISOString(),
        tenantName: j.tenant?.name ?? "—",
        action: "impersonation",
        reason: j.resume,
        targetUserEmail: targetEmail,
      };
    }),
    ...auditLogEntries.map((a) => {
      let targetEmail: string | null = null;
      if (a.metadata && typeof a.metadata === "object") {
        const meta = a.metadata as Record<string, unknown>;
        targetEmail = (meta.targetUserEmail as string | null) ?? null;
      }
      return {
        id: a.id,
        createdAt: a.createdAt.toISOString(),
        tenantName: (a.tenantId && tenantNameMap.get(a.tenantId)) ?? "—",
        action: a.action,
        reason: a.reason ?? "",
        targetUserEmail: targetEmail,
      };
    }),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("superAdmin")}
        subtitle=""
        userName={session.user.name ?? undefined}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Nouvelles sections : santé, échecs, audit */}
          <SuperAdminHealth
            tenants={tenantHealthRows}
            paymentFailures={paymentFailures}
            auditLogs={auditRows}
          />
          {/* Gestion existante des tenants */}
          <SuperAdminView />
        </div>
      </div>
    </div>
  );
}
