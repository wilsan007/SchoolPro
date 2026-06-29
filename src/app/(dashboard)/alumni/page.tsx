import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { AlumniView } from "@/components/alumni/AlumniView";

export const metadata = { title: "Alumni — Anciens élèves | EcolPro" };

export default async function AlumniPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Alumni — Anciens élèves"
        subtitle="Annuaire et suivi post-diplôme des anciens élèves de l'établissement"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <AlumniView />
      </div>
    </div>
  );
}
