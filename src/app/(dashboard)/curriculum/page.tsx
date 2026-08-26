import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { CurriculumTabs } from "@/components/curriculum/CurriculumTabs";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import {
  alertesAnticipees,
  nombreDeSemaines,
  semaineScolaire,
} from "@/lib/learnos/planification";
import { getDemoNow } from "@/lib/demo-now";
import { anneeActive } from "@/lib/annee-scolaire";
import { getClassesHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";

/**
 * Curriculum — référentiel de compétences et planification annuelle.
 *
 * Écran dont dépend toute la chaîne d'analyse : sans compétence, une note ne
 * produit qu'une preuve de granularité « matière » ; sans planification, le
 * système constate les échecs au lieu de les anticiper.
 */
async function getDonnees(tenantId: string, claims: SessionSiteClaims, user: SessionSiteClaims & { id?: string; role?: string }) {
  // Respecte la Time Machine : anneeActive() retourne l'année contenant la
  // date simulée, pas l'année isCurrent qui peut être vide pendant une démo.
  const annee = await anneeActive(tenantId);
  const anneeData = annee
    ? { id: annee.id, libelle: annee.libelle, dateDebut: annee.dateDebut, dateFin: annee.dateFin }
    : null;

  // Hiérarchie des classes avec scope enseignant + site + année intégrés.
  const hierarchie = await getClassesHierarchie(tenantId, user, { anneeCourante: anneeData?.libelle ?? null });
  const classes = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => ({ id: cls.id, nom: cls.nom }))));

  const [matieres, chapitres, planifications, evenementsCalendaires, planificationsCompetences] = await Promise.all([
    prisma.matiere.findMany({
      where: { tenantId, ...siteFilterForModel("matiere", claims) },
      select: { id: true, nom: true, code: true, couleur: true },
      orderBy: { nom: "asc" },
    }),
    prisma.chapitre.findMany({
      where: { tenantId, ...siteFilterForModel("chapitre", claims) },
      include: {
        competences: {
          where: siteFilterForModel("competence", claims),
          orderBy: { ordre: "asc" },
          select: {
            id: true,
            code: true,
            libelle: true,
            description: true,
            ordre: true,
            prerequis: { select: { id: true, code: true, libelle: true } },
            _count: { select: { evidences: true, dependants: true } },
          },
        },
      },
      orderBy: [{ niveau: "asc" }, { ordre: "asc" }],
    }),
    anneeData
      ? prisma.planificationChapitre.findMany({
          where: {
            tenantId,
            anneeId: anneeData.id,
            classeId: null,
            ...siteFilterForModel("planificationChapitre", claims),
          },
          select: {
            chapitreId: true, semaineDebut: true, semaineFin: true,
            semaineDebutInitiale: true, statut: true,
          },
        })
      : Promise.resolve([]),
    // Événements calendaires (vacances, examens, jours fériés) définis par le
    // chef d'établissement. La planification les respecte en sautant les
    // semaines non enseignées.
    anneeData
      ? prisma.evenementCalendaire.findMany({
          where: { anneeId: anneeData.id },
          select: { type: true, libelle: true, dateDebut: true, dateFin: true },
          orderBy: { dateDebut: "asc" },
        })
      : Promise.resolve([]),
    // Planifications explicites des compétences à l'intérieur des chapitres.
    // Tant qu'une compétence n'a pas de ligne ici, elle hérite de la plage de
    // son chapitre.
    anneeData
      ? prisma.planificationCompetence.findMany({
          where: {
            tenantId,
            anneeId: anneeData.id,
            classeId: null,
            ...siteFilterForModel("planificationCompetence", claims),
          },
          select: {
            competenceId: true, semaineDebut: true, semaineFin: true, statut: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const maintenant = await getDemoNow();
  const alertes = anneeData ? await alertesAnticipees(tenantId, anneeData.id, claims, maintenant) : [];

  return { annee: anneeData, matieres, classes, hierarchie, chapitres, planifications, alertes, evenementsCalendaires, planificationsCompetences };
}

export default async function CurriculumPage() {
  const [session, t] = await Promise.all([auth(), getTranslations("learnos.curriculum")]);
  await guardPage(session);

  const { annee, matieres, classes, hierarchie, chapitres, planifications, alertes, evenementsCalendaires, planificationsCompetences } = await getDonnees(
    session!.user.tenantId!,
    session!.user,
    session!.user
  );

  const maintenant = await getDemoNow();

  const peutModifier = [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "CLASS_TEACHER", "TEACHER", "SUBJECT_LEAD",
  ].includes(session!.user.role as string);

  const parChapitre = new Map(planifications.map((p) => [p.chapitreId, p]));
  const chapitresPlanifies = chapitres.map((c) => ({
    id: c.id,
    nom: c.nom,
    niveau: c.niveau,
    matiereId: c.matiereId,
    ordre: c.ordre,
    semaineDebut: parChapitre.get(c.id)?.semaineDebut ?? null,
    semaineFin: parChapitre.get(c.id)?.semaineFin ?? null,
    semaineDebutInitiale: parChapitre.get(c.id)?.semaineDebutInitiale ?? null,
    statut: parChapitre.get(c.id)?.statut ?? "PREVU",
    competences: c.competences.map((cp) => ({
      id: cp.id,
      code: cp.code,
      libelle: cp.libelle,
      ordre: cp.ordre,
    })),
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titre")}
        subtitle={t("sousTitre")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <CurriculumTabs
          matieres={matieres}
          chapitres={chapitres}
          chapitresPlanifies={chapitresPlanifies}
          peutModifier={peutModifier}
          anneeId={annee?.id ?? null}
          anneeLibelle={annee?.libelle ?? null}
          totalSemaines={
            annee ? nombreDeSemaines(annee.dateDebut, annee.dateFin) : 36
          }
          semaineCourante={
            annee ? semaineScolaire(maintenant, annee.dateDebut) : 1
          }
          alertes={alertes}
          classes={classes}
          hierarchie={hierarchie}
          evenementsCalendaires={evenementsCalendaires.map((e) => ({
            type: e.type as "VACANCE_SCOLAIRE" | "EXAMEN" | "JOUR_FERIE" | "AUTRE",
            libelle: e.libelle,
            dateDebut: e.dateDebut,
            dateFin: e.dateFin,
          }))}
          debutAnnee={annee?.dateDebut ?? null}
          planificationsCompetences={planificationsCompetences.map((p) => ({
            competenceId: p.competenceId,
            semaineDebut: p.semaineDebut,
            semaineFin: p.semaineFin,
          }))}
        />
      </div>
    </div>
  );
}
