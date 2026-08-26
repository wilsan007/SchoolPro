import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { CommunicationView } from "@/components/communication/CommunicationView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getClassesHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";

export default async function CommunicationPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("communication"),
  ]);
  await guardPage(session);

  const notifFilter = siteFilterForModel("notification", session!.user);
  const anneeCourante = await getAnneeCouranteLibelle(session!.user.tenantId!);

  // Hiérarchie des classes avec scope enseignant + site + année intégrés.
  const hierarchie = await getClassesHierarchie(session!.user.tenantId!, session!.user, { anneeCourante });
  const classes = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => ({ id: cls.id, nom: cls.nom, niveau: cls.niveau }))));

  const [notifications] = await Promise.all([
    prisma.notification.findMany({
      where: { tenantId: session!.user.tenantId!, ...notifFilter },
      include: { envoyePar: { select: { name: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
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
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
        <CommunicationView notifications={notifications} classes={classes} hierarchie={hierarchie} />
      </div>
    </div>
  );
}
