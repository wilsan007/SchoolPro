import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { AiChatWidget } from "@/components/ai/AiChatWidget";
import prisma from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { unstable_cache } from "next/cache";
import { checkUserFinancialBlock } from "@/lib/financial-guard";

const AI_GREETINGS: Record<string, string> = {
  SUPER_ADMIN:
    "Posez-moi vos questions sur la gestion de l'établissement : synthèses, aide à la décision, rédaction de communications...",
  TENANT_ADMIN:
    "Posez-moi vos questions sur la gestion de l'établissement : synthèses, aide à la décision, rédaction de communications...",
  PRINCIPAL:
    "Posez-moi vos questions sur la gestion pédagogique et administrative de l'établissement...",
  TEACHER:
    "Posez-moi vos questions : préparation de cours, idées d'exercices, conseils pédagogiques...",
  CLASS_TEACHER:
    "Posez-moi vos questions : préparation de cours, conseil de classe, conseils pédagogiques...",
  PARENT: "Posez-moi vos questions sur la scolarité de votre/vos enfant(s).",
};

const getTenantName = unstable_cache(
  async (tenantId: string) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    return tenant?.name ?? "Mon École";
  },
  ["tenant-name"],
  { revalidate: 300, tags: ["tenant-name"] }
);

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, tRoles, tCommon] = await Promise.all([
    auth(),
    getTranslations("roles"),
    getTranslations("common"),
  ]);

  if (!session?.user) {
    redirect("/login");
  }

  // Blocage financier : rediriger les élèves/parents exclus vers la page d'accès bloqué
  // Pour les parents avec exclusion partielle, on affiche un avertissement mais on ne bloque pas
  let partialBlockMessage: string | null = null;
  if (
    (session.user.role === "STUDENT" || session.user.role === "PARENT") &&
    session.user.tenantId
  ) {
    const block = await checkUserFinancialBlock(session.user.id, session.user.tenantId);
    if (block.blocked) {
      redirect("/acces-bloque");
    }
    if (block.partialBlock && block.messageKey) {
      partialBlockMessage = tCommon(block.messageKey, block.messageParams ?? {});
    }
  }

  const tenantName = session.user.tenantId
    ? await getTenantName(session.user.tenantId)
    : "Mon École";

  // Fetch sites for the current tenant
  // TENANT_ADMIN / SUPER_ADMIN see all sites; other roles see only their assigned sites
  const role = session.user.role;
  const isSiteAdmin = role === "TENANT_ADMIN" || role === "SUPER_ADMIN";
  const sites = session.user.tenantId
    ? isSiteAdmin
      ? await prisma.site.findMany({
          where: { tenantId: session.user.tenantId, actif: true },
          select: { id: true, nom: true, code: true },
          orderBy: { nom: "asc" },
        })
      : await prisma.site.findMany({
          where: {
            tenantId: session.user.tenantId,
            actif: true,
            OR: [
              { userSites: { some: { userId: session.user.id } } },
              { enseignantSites: { some: { enseignant: { userId: session.user.id, tenantId: session.user.tenantId } } } },
            ],
          },
          select: { id: true, nom: true, code: true },
          orderBy: { nom: "asc" },
        })
    : [];

  const siteId = (session.user as { siteId?: string | null }).siteId ?? null;

  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: tRoles("SUPER_ADMIN"),
    TENANT_ADMIN: tRoles("TENANT_ADMIN"),
    PRINCIPAL: tRoles("PRINCIPAL"),
    SECRETARY: tRoles("SECRETARY"),
    TEACHER: tRoles("TEACHER"),
    CLASS_TEACHER: tRoles("CLASS_TEACHER"),
    COUNSELOR: tRoles("COUNSELOR"),
    NURSE: tRoles("NURSE"),
    ACCOUNTANT: tRoles("ACCOUNTANT"),
    PARENT: tRoles("PARENT"),
    STUDENT: tRoles("STUDENT"),
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        userName={session.user.name}
        userRole={roleLabels[session.user.role] ?? session.user.role}
        userAvatar={session.user.image ?? undefined}
        tenantName={tenantName}
        tenantId={session.user.tenantId}
        isSuperAdmin={session.user.role === "SUPER_ADMIN"}
        roleKey={session.user.role}
        availableTenants={session.user.availableTenants}
        sites={sites}
        currentSiteId={siteId}
        isSiteAdmin={isSiteAdmin}
      />
      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        {partialBlockMessage && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2">
            <svg className="h-4 w-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.93 19h12.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L4.2 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
            <p className="text-sm text-amber-800">{partialBlockMessage}</p>
          </div>
        )}
        {children}
      </main>
      {/* AI chat widget temporarily hidden
      {AI_GREETINGS[session.user.role] && (
        <AiChatWidget greeting={AI_GREETINGS[session.user.role]} />
      )}
      */}
    </div>
  );
}
