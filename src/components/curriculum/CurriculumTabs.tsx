"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Target, CalendarRange, ListChecks, ScanLine, Brain } from "lucide-react";
import { useTranslations } from "next-intl";
import { CurriculumView } from "@/components/curriculum/CurriculumView";
import {
  PlanificationView,
  AlertesAnticipees,
} from "@/components/curriculum/PlanificationView";
import { BanqueQuestions } from "@/components/learnos/BanqueQuestions";
import { CouvertureBanque } from "@/components/learnos/CouvertureBanque";
import { CopiesPapier } from "@/components/learnos/CopiesPapier";
import { IntelligencePedagogique } from "@/components/learnos/IntelligencePedagogique";

/**
 * Deux vues du même domaine : ce qu'on enseigne, et quand on l'enseigne.
 *
 * Les réunir sous un seul module évite l'aller-retour entre deux écrans —
 * on définit un chapitre, on le place dans l'année, sans changer de contexte.
 */
export function CurriculumTabs(props: {
  matieres: { id: string; nom: string; code: string; couleur: string | null }[];
  chapitres: Parameters<typeof CurriculumView>[0]["chapitres"];
  chapitresPlanifies: Parameters<typeof PlanificationView>[0]["chapitres"];
  peutModifier: boolean;
  anneeId: string | null;
  anneeLibelle: string | null;
  totalSemaines: number;
  semaineCourante: number;
  alertes: Parameters<typeof AlertesAnticipees>[0]["alertes"];
  classes: { id: string; nom: string }[];
  evenementsCalendaires: { type: string; libelle: string; dateDebut: Date; dateFin: Date }[];
  debutAnnee: Date | null;
  planificationsCompetences: { competenceId: string; semaineDebut: number; semaineFin: number }[];
}) {
  const t = useTranslations("learnos.curriculum");
  const nbAlertes = props.alertes.length;

  return (
    <Tabs defaultValue={nbAlertes > 0 ? "planification" : "competences"}>
      <TabsList className="mb-5 w-full sm:w-auto overflow-x-auto">
        <TabsTrigger value="competences" className="gap-1.5">
          <Target className="h-3.5 w-3.5" />
          {t("ongletCompetences")}
        </TabsTrigger>
        <TabsTrigger value="planification" className="gap-1.5">
          <CalendarRange className="h-3.5 w-3.5" />
          {t("ongletPlanification")}
          {/* Une alerte anticipée perd toute sa valeur si elle n'est pas vue :
              le compteur la porte jusque sur l'onglet. */}
          {nbAlertes > 0 && (
            <Badge variant="destructive" className="ml-1">
              {nbAlertes}
            </Badge>
          )}
        </TabsTrigger>
        {/* La banque vit ici, et pas dans un module à part : une question se
            rattache à UNE compétence, et l'écrire suppose d'avoir le
            référentiel sous les yeux. */}
        {props.peutModifier && (
          <TabsTrigger value="banque" className="gap-1.5">
            <ListChecks className="h-3.5 w-3.5" />
            {t("ongletBanque")}
          </TabsTrigger>
        )}
        {/* Les exercices sur papier vivent ici pour la même raison que la
            banque : un exercice scanné doit être rattaché à une compétence, et
            ce rattachement se fait le référentiel sous les yeux. */}
        {props.peutModifier && (
          <TabsTrigger value="copies" className="gap-1.5">
            <ScanLine className="h-3.5 w-3.5" />
            {t("ongletCopies")}
          </TabsTrigger>
        )}
        {/* Intelligence pédagogique : ce que le système a appris de
            l'historique. Ouvert à tous les rôles qui voient le curriculum,
            car c'est un tableau de bord, pas une action d'écriture. */}
        <TabsTrigger value="intelligence" className="gap-1.5">
          <Brain className="h-3.5 w-3.5" />
          {t("ongletIntelligence")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="competences">
        <CurriculumView
          matieres={props.matieres}
          chapitres={props.chapitres}
          peutModifier={props.peutModifier}
        />
      </TabsContent>

      <TabsContent value="planification" className="space-y-6">
        <AlertesAnticipees alertes={props.alertes} />
        <PlanificationView
          matieres={props.matieres}
          chapitres={props.chapitresPlanifies}
          anneeId={props.anneeId}
          anneeLibelle={props.anneeLibelle}
          totalSemaines={props.totalSemaines}
          semaineCourante={props.semaineCourante}
          peutModifier={props.peutModifier}
          evenementsCalendaires={props.evenementsCalendaires}
          debutAnnee={props.debutAnnee}
          planificationsCompetences={props.planificationsCompetences}
        />
      </TabsContent>

      {props.peutModifier && (
        <TabsContent value="copies">
          <CopiesPapier
            matieres={props.matieres.map((m) => ({ id: m.id, nom: m.nom }))}
            classes={props.classes}
          />
        </TabsContent>
      )}

      {props.peutModifier && (
        <TabsContent value="banque" className="space-y-6">
          <CouvertureBanque />
          <BanqueQuestions
            chapitres={props.chapitres.map((c) => ({
              id: c.id,
              nom: c.nom,
              niveau: c.niveau,
              competences: c.competences.map((k) => ({
                id: k.id,
                code: k.code,
                libelle: k.libelle,
              })),
            }))}
          />
        </TabsContent>
      )}

      <TabsContent value="intelligence">
        <IntelligencePedagogique anneeId={props.anneeId ?? undefined} />
      </TabsContent>
    </Tabs>
  );
}
