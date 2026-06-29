import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { CommunicationView } from "@/components/communication/CommunicationView";

export default async function CommunicationPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const [notifications, classes] = await Promise.all([
    prisma.notification.findMany({
      where: { tenantId: session.user.tenantId },
      include: { envoyePar: { select: { name: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.classe.findMany({
      where: { tenantId: session.user.tenantId },
      select: { id: true, nom: true, niveau: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Communication & Marketing École"
        subtitle="Envoi de notifications groupées aux parents, élèves et enseignants"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <CommunicationView notifications={notifications} classes={classes} />
      </div>
    </div>
  );
}
