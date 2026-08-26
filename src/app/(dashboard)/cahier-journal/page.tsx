import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { CahierJournalView } from "@/components/cahier-journal/CahierJournalView";
import { SuiviProgrammePanel } from "@/components/cahier-journal/SuiviProgrammePanel";
import { guardPage } from "@/lib/guard-page";
import { siteFilterForModel } from "@/lib/site-scope";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import { anneeActive } from "@/lib/annee-scolaire";
import { getClassesHierarchie, aplatirHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";
import { semaineScolaire } from "@/lib/learnos/planification-pure";
import { getDemoNow } from "@/lib/demo-now";

/** Rôles ayant accès au tableau de suivi du programme (direction / CPE). */
const ROLES_SUIVI = new Set([
  "PRINCIPAL",
  "TENANT_ADMIN",
  "SUPER_ADMIN",
  "COUNSELOR",
  "INSPECTOR",
  "SUPERVISOR",
]);

export default async function CahierJournalPage() {
  const session = await auth();
  await guardPage(session, "curriculum:read");
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const role = session.user.role;
  const canWrite =
    role === "SUPER_ADMIN" ||
    role === "TENANT_ADMIN" ||
    role === "PRINCIPAL" ||
    role === "TEACHER" ||
    role === "CLASS_TEACHER" ||
    role === "SUBJECT_LEAD";

  // La direction et le CPE voient le tableau de suivi du programme.
  const peutVoirSuivi = ROLES_SUIVI.has(role as string);

  // ── Résolution de l'année scolaire courante (une seule fois) ──
  // On récupère l'objet complet pour pouvoir tester si l'année a commencé.
  const anneeCouranteObj = await anneeActive(tenantId);
  const anneeCourante = anneeCouranteObj?.libelle ?? null;
  const maintenant = await getDemoNow();
  // L'année n'a pas encore commencé si sa dateDebut est dans le futur.
  // (Période estivale / pré-rentrée : l'année isCurrent n'a pas démarré.)
  const anneePasEncoreCommencee =
    anneeCouranteObj ? anneeCouranteObj.dateDebut > maintenant : false;

  // Semaine courante pour le tableau de suivi (respecte la Time Machine).
  let semaineCourante = 1;
  if (peutVoirSuivi && anneeCouranteObj) {
    semaineCourante = semaineScolaire(maintenant, anneeCouranteObj.dateDebut);
  }

  // Scope enseignant : restreindre aux classes et matières affectées,
  // pour l'année courante uniquement (évite de voir les classes d'une
  // année passée ou à venir).
  const scope = isTeacherRole(role as any)
    ? await getTeacherScope(tenantId, session.user.id, role as any, anneeCourante)
    : null;
  const scopeMatiereFilter = scope?.isRestricted
    ? scope.matiereIds.length > 0
      ? { id: { in: scope.matiereIds } }
      : { id: "__none__" }
    : {};
  const scopeSeanceFilter = scope?.isRestricted
    ? scope.classeIds.length > 0
      ? { classeId: { in: scope.classeIds } }
      : { id: "__none__" }
    : {};

  // ── Fenêtre temporelle pour les séances ──────────────────────────
  // Charger uniquement les séances autour de la semaine courante
  // (2 semaines avant, 2 semaines après) pour éviter de charger
  // l'intégralité de l'année (potentiellement des dizaines de milliers
  // d'enregistrements avec jointures lourdes → timeout serveur).
  // Les détails (compétences, devoirs, plan leçon, commentaires) sont
  // chargés à la demande via l'API quand l'utilisateur déplie une séance.
  const semaineCouranteCalculee = anneeCouranteObj
    ? semaineScolaire(maintenant, anneeCouranteObj.dateDebut)
    : 1;
  const semaineMin = Math.max(1, semaineCouranteCalculee - 2);
  const semaineMax = Math.min(36, semaineCouranteCalculee + 2);
  const filtreFenetreSeances = { semaine: { gte: semaineMin, lte: semaineMax } };

  // Hiérarchie des classes avec scope enseignant + année + site intégrés.
  // (getClassesHierarchie appelle getTeacherScope en interne pour les
  // enseignants ; le scope matières/séances ci-dessus reste nécessaire car
  // getClassesHierarchie ne gère que les classes.)
  const hierarchie: ClassesHierarchie = await getClassesHierarchie(tenantId, session.user, { anneeCourante });
  const classes = aplatirHierarchie(hierarchie);

  // Les IDs de classes de l'année courante servent à filtrer les séances
  // sans jointure SQL (classeId IN (...) au lieu de classe: { annee: ... }),
  // ce qui est beaucoup plus rapide sur le pooler Supabase.
  const classeIds = classes.map((c) => c.id);

  const [matieres, enseignants, seances, chapitres] = await Promise.all([
    prisma.matiere.findMany({
      where: { tenantId, ...siteFilterForModel("matiere", session.user), ...scopeMatiereFilter },
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
    // Séances : requête PLATE sans includes ni jointure sur classe.annee.
    // On filtre par classeId IN (IDs déjà résolus) + semaine + tenantId.
    // Les relations (matiere, enseignant, chapitre, classe) sont jointes
    // en JavaScript lors de la sérialisation, à partir des données déjà
    // chargées ci-dessus. Les détails (compétences, devoirs, plan leçon,
    // commentaires) sont lazy-loadés via l'API au clic sur une séance.
    prisma.seancePedagogique.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("seancePedagogique", session.user),
        ...(classeIds.length > 0 ? { classeId: { in: classeIds } } : {}),
        ...scopeSeanceFilter,
        ...filtreFenetreSeances,
      },
      orderBy: { date: "asc" },
    }),
    // Chapitres : on charge les chapitres du tenant ET les chapitres
    // nationaux (tenantId = null) pour pouvoir résoudre les noms en JS.
    prisma.chapitre.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
        ...siteFilterForModel("chapitre", session.user),
      },
      select: { id: true, nom: true },
    }),
  ]);

  // ── Jointures JavaScript (évite les JOIN SQL sur le pooler) ──────
  const matiereMap = new Map(matieres.map((m) => [m.id, m]));
  const classeMap = new Map(classes.map((c) => [c.id, c]));
  const enseignantMap = new Map(enseignants.map((e) => [e.id, e]));
  const chapitreMap = new Map(chapitres.map((c) => [c.id, c]));

  const serialized = seances.map((s) => {
    const matiere = matiereMap.get(s.matiereId);
    const classe = classeMap.get(s.classeId);
    const ens = s.enseignantId ? enseignantMap.get(s.enseignantId) : null;
    const chap = s.chapitreId ? chapitreMap.get(s.chapitreId) : null;
    return {
      id: s.id,
      classeId: s.classeId,
      matiereId: s.matiereId,
      enseignantId: s.enseignantId,
      chapitreId: s.chapitreId,
      planificationId: s.planificationId,
      planLeconId: s.planLeconId,
      date: s.date.toISOString(),
      dureePrevue: s.dureePrevue,
      dureeReelle: s.dureeReelle,
      statut: s.statut,
      semaine: s.semaine,
      contenu: s.contenu,
      rythme: s.rythme as "EN_AVANCE" | "A_TEMPS" | "EN_RETARD" | "NON_EVALUEE",
      presents: s.presents,
      absents: s.absents,
      objectifs: s.objectifs as string[] | null,
      activites: s.activites as { nom: string; duree: number; type: string }[] | null,
      supports: s.supports as { type: string; lien: string; description?: string }[] | null,
      differentiation: s.differentiation as { eleve?: string; groupe?: string; adaptation: string }[] | null,
      matiere: matiere
        ? { id: matiere.id, nom: matiere.nom, code: matiere.code, couleur: matiere.couleur }
        : { id: s.matiereId, nom: "—", code: "", couleur: null },
      enseignant: ens
        ? { id: ens.id, name: ens.user?.name ?? "" }
        : null,
      chapitre: chap ? { id: chap.id, nom: chap.nom } : null,
      classe: classe
        ? { id: classe.id, nom: classe.nom, niveau: classe.niveau }
        : { id: s.classeId, nom: "—", niveau: "—" },
      // Les champs détaillés sont chargés à la demande (lazy-load) via
      // l'API quand l'utilisateur déplie une séance.
      competences: [],
      devoirs: [],
      planLecon: null,
      fichiers: s.fichiers as { name: string; type: string; size: number; data: string }[] | null,
      commentaires: [],
    };
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Cahier-Journal"
        subtitle="Journal de Progression Pédagogique — timeline des séances par matière"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        {anneePasEncoreCommencee && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {"L'année scolaire"} {anneeCourante} {"n'a pas encore commencé"}
            {anneeCouranteObj
              ? ` (rentrée le ${anneeCouranteObj.dateDebut.toLocaleDateString("fr-FR")})`
              : ""}
            . Les séances apparaîtront dès le démarrage de l&apos;année.
          </div>
        )}
        <CahierJournalView
          seances={serialized}
          classes={classes}
          hierarchie={hierarchie}
          matieres={matieres}
          enseignants={enseignants.map((e) => ({
            id: e.id,
            name: e.user?.name ?? "",
          }))}
          canWrite={canWrite && !anneePasEncoreCommencee}
          currentUserId={session.user.id}
        />

        {peutVoirSuivi && (
          <div className="mt-6">
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              Suivi du programme
            </h2>
            <SuiviProgrammePanel semaineInitiale={semaineCourante} />
          </div>
        )}
      </div>
    </div>
  );
}
