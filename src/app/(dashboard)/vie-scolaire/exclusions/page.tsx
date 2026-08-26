import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { Header } from "@/components/layout/Header";
import { ExclusionsView } from "@/components/vie-scolaire/ExclusionsView";
import { guardPage } from "@/lib/guard-page";
import { getDemoNow } from "@/lib/demo-now";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getClassesHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";

/// Types de sanction constituant une exclusion — doit rester aligné avec
/// TYPES_EXCLUSION dans src/app/api/vie-scolaire/exclusions/route.ts.
const TYPES_EXCLUSION = ["EXCLUSION_COURS", "EXCLUSION_TEMP"] as const;

export default async function ExclusionsPage() {
  const session = await auth();
  await guardPage(session, "vie-scolaire:read");
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  // La date de référence suit la Time Machine pour que le registre reflète
  // l'état des exclusions à la date de démonstration sélectionnée.
  const maintenant = await getDemoNow();
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  // Hiérarchie des classes avec scope enseignant + site + année intégrés.
  const hierarchie = await getClassesHierarchie(tenantId, session.user, { anneeCourante });
  const classes = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => ({ id: cls.id, nom: cls.nom }))));

  const [sanctions] = await Promise.all([
    prisma.sanction.findMany({
      where: {
        type: { in: [...TYPES_EXCLUSION] },
        incident: { tenantId, ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}) },
        ...siteFilterForModel("sanction", session.user),
      },
      include: {
        incident: {
          select: {
            id: true,
            type: true,
            gravite: true,
            date: true,
            description: true,
            eleve: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                matricule: true,
                classe: { select: { id: true, nom: true } },
              },
            },
          },
        },
        reintegrePar: { select: { name: true } },
      },
      orderBy: { dateDebut: "desc" },
      take: 200,
    }),
  ]);

  // On calcule l'état et les manquements côté serveur : la vue reste ainsi une
  // simple projection, et la logique est identique à celle de l'API.
  const exclusions = sanctions.map((s) => {
    const close = s.dateRetourEffective !== null;
    const commencee = s.dateDebut <= maintenant;
    return {
      id: s.id,
      type: s.type,
      description: s.description,
      dateDebut: s.dateDebut.toISOString(),
      dateFin: s.dateFin?.toISOString() ?? null,
      dateRetourEffective: s.dateRetourEffective?.toISOString() ?? null,
      travailDonne: s.travailDonne,
      parentNotifie: s.parentNotifie,
      accuseReceptionParent: s.accuseReceptionParent?.toISOString() ?? null,
      reintegrePar: s.reintegrePar?.name ?? null,
      incident: {
        id: s.incident.id,
        type: s.incident.type,
        gravite: s.incident.gravite,
        date: s.incident.date.toISOString(),
        description: s.incident.description,
        eleve: s.incident.eleve,
      },
      etat: (close ? "CLOSE" : commencee ? "EN_COURS" : "A_VENIR") as
        | "CLOSE"
        | "EN_COURS"
        | "A_VENIR",
      joursRetardReintegration:
        !close && s.dateFin && s.dateFin < maintenant
          ? Math.floor((maintenant.getTime() - s.dateFin.getTime()) / 86_400_000)
          : 0,
    };
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Registre des exclusions"
        subtitle="Suivi des exclusions, continuité pédagogique et réintégrations"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <ExclusionsView
          exclusions={exclusions}
          classes={classes}
          hierarchie={hierarchie}
          dateReference={maintenant.toISOString()}
        />
      </div>
    </div>
  );
}
