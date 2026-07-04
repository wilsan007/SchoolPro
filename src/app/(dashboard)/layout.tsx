import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { AiChatWidget } from "@/components/ai/AiChatWidget";
import prisma from "@/lib/prisma";

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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  let tenantName = "Mon École";
  if (session.user.tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { name: true },
    });
    if (tenant) tenantName = tenant.name;
  }

  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    TENANT_ADMIN: "Directeur",
    PRINCIPAL: "Chef d'établissement",
    SECRETARY: "Secrétariat",
    TEACHER: "Enseignant",
    CLASS_TEACHER: "Prof. Principal",
    COUNSELOR: "Conseiller",
    NURSE: "Infirmier(e)",
    ACCOUNTANT: "Comptable",
    PARENT: "Parent",
    STUDENT: "Élève",
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        userName={session.user.name}
        userRole={roleLabels[session.user.role] ?? session.user.role}
        userAvatar={session.user.image ?? undefined}
        tenantName={tenantName}
        isSuperAdmin={session.user.role === "SUPER_ADMIN"}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
      {AI_GREETINGS[session.user.role] && (
        <AiChatWidget greeting={AI_GREETINGS[session.user.role]} />
      )}
    </div>
  );
}
