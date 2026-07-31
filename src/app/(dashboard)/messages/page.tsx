import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { MessagerieView } from "@/components/messages/MessagerieView";
import { getTranslations } from "next-intl/server";

async function getMessagesData(tenantId: string, userId: string) {
  const users = await prisma.user.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, role: true, avatarUrl: true },
    orderBy: { name: "asc" },
  });

  return { users };
}

export default async function MessagesPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("messages"),
  ]);
  if (!session?.user?.tenantId) redirect("/login");

  const { users } = await getMessagesData(session.user.tenantId, session.user.id);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-hidden">
        <MessagerieView
          currentUserId={session.user.id}
          currentUserName={session.user.name}
          tenantId={session.user.tenantId}
          allUsers={users}
        />
      </div>
    </div>
  );
}
