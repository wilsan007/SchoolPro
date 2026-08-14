import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { CommunicationView } from "@/components/communication/CommunicationView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { siteFilterForModel } from "@/lib/site-scope";

export default async function CommunicationPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("communication"),
  ]);
  await guardPage(session, "communication:read");

  const notifFilter = siteFilterForModel("notification", session!.user);
  const classeFilter = siteFilterForModel("classe", session!.user);
  const [notifications, classes] = await Promise.all([
    prisma.notification.findMany({
      where: { tenantId: session!.user.tenantId!, ...notifFilter },
      include: { envoyePar: { select: { name: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.classe.findMany({
      where: { tenantId: session!.user.tenantId!, ...classeFilter },
      select: { id: true, nom: true, niveau: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <CommunicationView notifications={notifications} classes={classes} />
      </div>
    </div>
  );
}
