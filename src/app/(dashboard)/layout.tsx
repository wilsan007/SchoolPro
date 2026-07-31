import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { AiChatWidget } from "@/components/ai/AiChatWidget";
import prisma from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { unstable_cache } from "next/cache";

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
  const [session, tRoles] = await Promise.all([
    auth(),
    getTranslations("roles"),
  ]);

  if (!session?.user) {
    redirect("/login");
  }

  const tenantName = session.user.tenantId
    ? await getTenantName(session.user.tenantId)
    : "Mon École";

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
        availableTenants={session.user.availableTenants}
      />
      <main className="flex-1 flex flex-col overflow-hidden bg-background">
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
