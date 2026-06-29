import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { OrientationView } from "@/components/orientation/OrientationView";

export default async function OrientationPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Orientation & Parcours élève"
        subtitle="Suivi pluriannuel, recommandations de filière et accompagnement personnalisé"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <OrientationView />
      </div>
    </div>
  );
}
