import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import prisma from "@/lib/prisma";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Charger les infos du tenant
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
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
