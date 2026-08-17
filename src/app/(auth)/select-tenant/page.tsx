import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TenantSelector } from "@/components/auth/TenantSelector";
import { accueilPourRole } from "@/lib/accueil-par-role";

export default async function SelectTenantPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const tenants = session.user.availableTenants ?? [];

  // Si l'utilisateur n'a qu'un seul tenant (ou aucun), rediriger
  // directement vers la route d'accueil de son rôle — pas vers /dashboard.
  // SUPER_ADMIN sans tenant tombe aussi ici : accueilPourRole("SUPER_ADMIN")
  // renvoie "/super-admin".
  if (tenants.length <= 1) {
    const accueil = accueilPourRole(session.user.role);
    redirect(accueil ?? "/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/30 dark:from-slate-950 dark:via-indigo-950/20 dark:to-purple-950/20 px-4 sm:px-6 lg:px-8 py-8">
      <TenantSelector tenants={tenants} userName={session.user.name} />
    </div>
  );
}
