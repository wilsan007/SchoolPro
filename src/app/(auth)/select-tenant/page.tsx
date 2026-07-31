import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TenantSelector } from "@/components/auth/TenantSelector";

export default async function SelectTenantPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const tenants = session.user.availableTenants ?? [];

  // Si l'utilisateur n'a qu'un seul tenant, rediriger directement
  if (tenants.length <= 1) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/30 dark:from-slate-950 dark:via-indigo-950/20 dark:to-purple-950/20 p-4">
      <TenantSelector tenants={tenants} userName={session.user.name} />
    </div>
  );
}
