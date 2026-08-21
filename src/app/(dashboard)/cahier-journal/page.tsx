import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { CahierJournalView } from "@/components/cahier-journal/CahierJournalView";
import { guardPage } from "@/lib/guard-page";
import { siteFilterForModel } from "@/lib/site-scope";

export default async function CahierJournalPage() {
  const session = await auth();
  await guardPage(session, "curriculum:read");
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const canWrite =
    session.user.role === "SUPER_ADMIN" ||
    session.user.role === "TENANT_ADMIN" ||
    session.user.role === "PRINCIPAL" ||
    session.user.role === "TEACHER" ||
    session.user.role === "CLASS_TEACHER" ||
    session.user.role === "SUBJECT_LEAD";

  const [classes, matieres, enseignants, seances] = await Promise.all([
    prisma.classe.findMany({
      where: { tenantId, ...siteFilterForModel("classe", session.user) },
      select: { id: true, nom: true, niveau: true },
      orderBy: { nom: "asc" },
    }),
    prisma.matiere.findMany({
      where: { tenantId, ...siteFilterForModel("matiere", session.user) },
      select: { id: true, nom: true, code: true, couleur: true },
      orderBy: { nom: "asc" },
    }),
    prisma.enseignant.findMany({
      where: { tenantId, ...siteFilterForModel("enseignant", session.user) },
      select: {
        id: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.seancePedagogique.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("seancePedagogique", session.user),
      },
      include: {
        matiere: { select: { id: true, nom: true, code: true, couleur: true } },
        enseignant: {
          select: { id: true, user: { select: { id: true, name: true } } },
        },
        chapitre: { select: { id: true, nom: true } },
        classe: { select: { id: true, nom: true, niveau: true } },
        competences: {
          include: {
            competence: { select: { id: true, code: true, libelle: true } },
          },
        },
        devoirs: { select: { id: true, titre: true, dateRendu: true, statut: true } },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const serialized = seances.map((s) => ({
    id: s.id,
    classeId: s.classeId,
    matiereId: s.matiereId,
    enseignantId: s.enseignantId,
    chapitreId: s.chapitreId,
    planificationId: s.planificationId,
    date: s.date.toISOString(),
    dureePrevue: s.dureePrevue,
    dureeReelle: s.dureeReelle,
    statut: s.statut,
    semaine: s.semaine,
    contenu: s.contenu,
    rythme: s.rythme as "EN_AVANCE" | "A_TEMPS" | "EN_RETARD" | "NON_EVALUEE",
    presents: s.presents,
    absents: s.absents,
    matiere: s.matiere,
    enseignant: s.enseignant
      ? { id: s.enseignant.id, name: s.enseignant.user?.name ?? "" }
      : null,
    chapitre: s.chapitre,
    classe: s.classe,
    competences: s.competences.map((sc) => ({
      competenceId: sc.competenceId,
      niveau: sc.niveau,
      competence: sc.competence,
    })),
    devoirs: s.devoirs.map((d) => ({
      id: d.id,
      titre: d.titre,
      dateRendu: d.dateRendu.toISOString(),
      statut: d.statut,
    })),
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Cahier-Journal"
        subtitle="Journal de Progression Pédagogique — timeline des séances par matière"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <CahierJournalView
          seances={serialized}
          classes={classes}
          matieres={matieres}
          enseignants={enseignants.map((e) => ({
            id: e.id,
            name: e.user?.name ?? "",
          }))}
          canWrite={canWrite}
        />
      </div>
    </div>
  );
}
