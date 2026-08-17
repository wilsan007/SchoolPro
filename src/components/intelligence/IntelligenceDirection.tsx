"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Activity,
  AlertTriangle,
  Users,
  ShieldAlert,
  VolumeX,
  FlaskConical,
  Stethoscope,
  Gauge,
  Wallet,
  HeartHandshake,
  Cpu,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { SectionIntelligence } from "./SectionIntelligence";
import { IndiceComposite } from "./IndiceComposite";
import { CarteRisque, type EleveRisque } from "./CarteRisque";
import {
  TableauScenarios,
  type ScenarioRemediation,
} from "./TableauScenarios";

// ─── Types (miroir des réponses API /api/learnos/*) ─────────────────────────

interface IndiceCompositeApi {
  code: string;
  nom: string;
  valeur: number;
  composantes: Record<string, number>;
  donneesInsuffisantes: boolean;
  explication: string;
}

interface VitesseApprentissageApi {
  moyenne: number | null;
  min: number | null;
  max: number | null;
  mediane: number | null;
  nbEchantillons: number;
  donneesInsuffisantes: boolean;
}

interface TableauIntelligenceApi {
  isp: IndiceCompositeApi;
  ieis: IndiceCompositeApi;
  ivf: IndiceCompositeApi;
  ics: IndiceCompositeApi;
  roiPedagogique: IndiceCompositeApi | null;
  vitesseApprentissage: VitesseApprentissageApi;
  iro: IndiceCompositeApi;
  santeGlobale: number;
  anneeId: string | null;
  calculeLe: string;
}

interface ScoreRisqueEleveApi {
  eleveId: string;
  nom: string;
  prenom: string;
  classeId: string;
  classeNom: string;
  score: number;
  niveau: "FAIBLE" | "MODERE" | "ELEVE";
  signaux: Record<string, number>;
  decrochageSilencieux: boolean;
  moyenneActuelle: number | null;
}

interface SyntheseRisqueApi {
  totalEleves: number;
  risqueEleve: number;
  risqueModere: number;
  risqueFaible: number;
  decrochageSilencieux: number;
  eleves: ScoreRisqueEleveApi[];
}

interface NoeudCritiqueApi {
  competenceId: string;
  competenceLibelle: string;
  matiereNom: string;
  niveau: string;
  nbDescendants: number;
  centralite: number;
  elevesEnEchec: number;
  impact: "CRITIQUE" | "ELEVE" | "MODERE";
}

interface GrapheCurriculumApi {
  noeudsCritiques: NoeudCritiqueApi[];
  validationPrerequis: unknown[];
}

interface ResultatSimulationApi {
  scenarios: ScenarioRemediation[];
  scenariosPriorises: ScenarioRemediation[];
  deltaMoyenParType: { type: string; delta: number; echantillon: number }[];
  totalElevesARisque: number;
  totalElevesSauvables: number;
  coutTotalOptimal: number;
}

interface EfficacitePlansApi {
  deltaMasteryMoyen: number;
  tauxSucces: number;
  totalPlans: number;
  parType: { type: string; delta: number; tauxSucces: number; count: number }[];
  parMatiere: { matiereId: string; matiereNom: string; delta: number; count: number }[];
}

interface EfficaciteEnseignantApi {
  userId: string;
  nom: string;
  plansTermines: number;
  elevesAides: number;
  deltaMasteryMoyen: number;
  vsMoyenneTenant: number;
  topPerformer: boolean;
}

interface EfficaciteInterventionApi {
  parType: { type: string; deltaMoyen: number; echantillon: number }[];
  typeLePlusEfficace: string | null;
}

interface AdoptionIAApi {
  questions: { generee: number; validee: number; taux: number };
  plansLecon: { genere: number; valide: number; taux: number };
  rubriques: { genere: number; valide: number; taux: number };
}

interface EfficacitePedagogiqueApi {
  plans: EfficacitePlansApi;
  enseignants: EfficaciteEnseignantApi[];
  interventions: EfficaciteInterventionApi;
  correlation: unknown;
  adoptionIA: AdoptionIAApi;
}

interface EfficaciteRelanceApi {
  canal: string;
  nbRelances: number;
  nbRelancesSuiviesPaiement: number;
  tauxConversion: number;
  delaiMoyenPaiementJours: number | null;
  donneesInsuffisantes: boolean;
}

interface DelaiPaiementApi {
  moyenneGlobaleJours: number | null;
  medianeGlobaleJours: number | null;
  nbEcheances: number;
  parNiveau: { niveau: string; delaiMoyenJours: number; nbEcheances: number }[];
  parSite: { siteId: string | null; delaiMoyenJours: number; nbEcheances: number }[];
  donneesInsuffisantes: boolean;
}

interface FinanceIntelligenceApi {
  risqueFamilles: unknown;
  coutParEleve: unknown;
  depassements: unknown;
  efficaciteRelances: EfficaciteRelanceApi[];
  delaiPaiement: DelaiPaiementApi;
  tauxAdmission: unknown;
  contreFactuelRemises: unknown;
}

interface CorrelationEngagementApi {
  statut: "OK" | "DONNEES_INSUFFISANTES";
  coefficientPearson: number | null;
  echantillon: number;
  points: unknown[];
  groupes: unknown[];
}

interface EngagementParentalApi {
  correlation: CorrelationEngagementApi;
  questionsFrequentes: unknown;
  impactAlerte: unknown;
  validationLien: unknown;
}

// ─── Hook de fetch générique ────────────────────────────────────────────────

interface EtatFetch<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useFetchApi<T>(url: string): EtatFetch<T> & { refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let actif = true;
    setLoading(true);
    setError(null);
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Erreur ${res.status}`);
        }
        return res.json() as Promise<T>;
      })
      .then((json) => {
        if (actif) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (actif) {
          setError(e instanceof Error ? e.message : "Erreur de chargement");
          setLoading(false);
        }
      });
    return () => {
      actif = false;
    };
  }, [url, nonce]);

  return { data, loading, error, refetch };
}

// ─── Helpers d'affichage ────────────────────────────────────────────────────

function badgeImpact(impact: string): {
  code: "impactCritique" | "impactEleve" | "impactModere";
  cls: string;
} {
  switch (impact) {
    case "CRITIQUE":
      return {
        code: "impactCritique",
        cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
      };
    case "ELEVE":
      return {
        code: "impactEleve",
        cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
      };
    default:
      return {
        code: "impactModere",
        cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
      };
  }
}

/** Moyenne pondérée simple des taux de conversion des relances. */
function tauxRecouvrementMoyen(relances: EfficaciteRelanceApi[]): number | null {
  const valides = relances.filter((r) => !r.donneesInsuffisantes);
  if (valides.length === 0) return null;
  const total = valides.reduce((a, r) => a + r.tauxConversion, 0);
  return total / valides.length;
}

/** Moyenne des trois taux d'adoption IA. */
function tauxAdoptionIAMoyen(ia: AdoptionIAApi | null): number | null {
  if (!ia) return null;
  const vals = [ia.questions.taux, ia.plansLecon.taux, ia.rubriques.taux];
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ─── Composant principal ────────────────────────────────────────────────────

export function IntelligenceDirection({ devise = "DJF" }: { devise?: string }) {
  const t = useTranslations("directionIntelligence");
  // 1. Tableau de bord — indices composites
  const indices = useFetchApi<TableauIntelligenceApi>("/api/learnos/direction-intelligence");
  // 2. Détection — risque de décrochage
  const risque = useFetchApi<SyntheseRisqueApi>("/api/learnos/risque-decrochage");
  // 3. Diagnostic — nœuds critiques
  const graphe = useFetchApi<GrapheCurriculumApi>("/api/learnos/graphe-curriculum");
  // 4. Prédiction — simulation de remédiation
  const simulation = useFetchApi<ResultatSimulationApi>("/api/learnos/simulation-remediation");
  // 5. Prescription — efficacité pédagogique
  const efficacite = useFetchApi<EfficacitePedagogiqueApi>("/api/learnos/efficacite-pedagogique");
  // 6. Mesure — finance + engagement parental
  const finance = useFetchApi<FinanceIntelligenceApi>("/api/learnos/finance-intelligence");
  const engagement = useFetchApi<EngagementParentalApi>("/api/learnos/engagement-parental");

  return (
    <div className="space-y-8 sm:space-y-10 py-4 sm:py-6">
      {/* En-tête de page */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm sm:text-base text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        {indices.data && (
          <div className="shrink-0 rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">{t("santeGlobaleLabel")}</p>
            <p
              className={cn(
                "text-2xl sm:text-3xl font-bold tabular-nums",
                indices.data.santeGlobale < 0.4
                  ? "text-red-600 dark:text-red-400"
                  : indices.data.santeGlobale < 0.7
                    ? "text-orange-600 dark:text-orange-400"
                    : "text-emerald-600 dark:text-emerald-400"
              )}
            >
              {(indices.data.santeGlobale * 100).toFixed(0)}%
            </p>
          </div>
        )}
      </div>

      {/* ─── Section 1 : Tableau de bord — Indices composites ─────────── */}
      <SectionIntelligence
        titre={t("sectionIndicesTitre")}
        description={t("sectionIndicesDescription")}
        loading={indices.loading}
        error={indices.error}
        onRetry={indices.refetch}
      >
        <SectionIndices data={indices.data} />
      </SectionIntelligence>

      {/* ─── Section 2 : Détection — Risque de décrochage ─────────────── */}
      <SectionIntelligence
        titre={t("sectionRisqueTitre")}
        description={t("sectionRisqueDescription")}
        loading={risque.loading}
        error={risque.error}
        onRetry={risque.refetch}
      >
        <SectionRisque data={risque.data} />
      </SectionIntelligence>

      {/* ─── Section 3 : Diagnostic — Nœuds critiques du curriculum ───── */}
      <SectionIntelligence
        titre={t("sectionNoeudsTitre")}
        description={t("sectionNoeudsDescription")}
        loading={graphe.loading}
        error={graphe.error}
        onRetry={graphe.refetch}
      >
        <SectionNoeudsCritiques data={graphe.data} />
      </SectionIntelligence>

      {/* ─── Section 4 : Prédiction — Simulation de remédiation ───────── */}
      <SectionIntelligence
        titre={t("sectionSimulationTitre")}
        description={t("sectionSimulationDescription")}
        loading={simulation.loading}
        error={simulation.error}
        onRetry={simulation.refetch}
      >
        <SectionSimulation data={simulation.data} devise={devise} />
      </SectionIntelligence>

      {/* ─── Section 5 : Prescription — Efficacité pédagogique ────────── */}
      <SectionIntelligence
        titre={t("sectionEfficaciteTitre")}
        description={t("sectionEfficaciteDescription")}
        loading={efficacite.loading}
        error={efficacite.error}
        onRetry={efficacite.refetch}
      >
        <SectionEfficacite data={efficacite.data} />
      </SectionIntelligence>

      {/* ─── Section 6 : Mesure — Indicateurs de suivi ────────────────── */}
      <SectionIntelligence
        titre={t("sectionMesureTitre")}
        description={t("sectionMesureDescription")}
        loading={finance.loading || engagement.loading}
        error={finance.error ?? engagement.error}
        onRetry={() => {
          finance.refetch();
          engagement.refetch();
        }}
      >
        <SectionMesure finance={finance.data} engagement={engagement.data} efficacite={efficacite.data} />
      </SectionIntelligence>
    </div>
  );
}

// ─── Section 1 : Indices composites ─────────────────────────────────────────

function SectionIndices({ data }: { data: TableauIntelligenceApi | null }) {
  const t = useTranslations("directionIntelligence");
  if (!data) return null;

  const cartes: {
    nom: string;
    indice: IndiceCompositeApi | null;
    unite: "pourcentage" | "score";
  }[] = [
    { nom: t("indiceISP"), indice: data.isp, unite: "score" },
    { nom: t("indiceIEIS"), indice: data.ieis, unite: "score" },
    { nom: t("indiceIVF"), indice: data.ivf, unite: "score" },
    { nom: t("indiceICS"), indice: data.ics, unite: "score" },
    {
      nom: t("indiceROI"),
      indice: data.roiPedagogique,
      unite: "score",
    },
    { nom: t("indiceIRO"), indice: data.iro, unite: "score" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {cartes.map((c) =>
        c.indice ? (
          <IndiceComposite
            key={c.indice.code}
            nom={c.nom}
            valeur={c.indice.valeur}
            description={c.indice.explication}
            donneesInsuffisantes={c.indice.donneesInsuffisantes}
            unite={c.unite}
          />
        ) : (
          <IndiceComposite
            key={c.nom}
            nom={c.nom}
            valeur={null}
            description={t("indiceROIVide")}
            donneesInsuffisantes
            unite={c.unite}
          />
        )
      )}

      {/* Vitesse d'apprentissage — distribution, non bornée 0-1 */}
      <IndiceComposite
        nom={t("indiceVitesse")}
        valeur={data.vitesseApprentissage.moyenne}
        description={t("vitesseDescription", {
          mediane: data.vitesseApprentissage.mediane?.toFixed(3) ?? t("donneesInsuffisantes"),
          nb: data.vitesseApprentissage.nbEchantillons,
        })}
        donneesInsuffisantes={data.vitesseApprentissage.donneesInsuffisantes}
        unite="score"
      />
    </div>
  );
}

// ─── Section 2 : Risque de décrochage ───────────────────────────────────────

function CompteurRisque({
  label,
  valeur,
  icone: Icone,
  couleur,
}: {
  label: string;
  valeur: number;
  icone: React.ElementType;
  couleur: string;
}) {
  return (
    <div className="p-3 sm:p-4 rounded-lg border bg-card shadow-sm">
      <div className="flex items-center gap-2">
        <Icone className={cn("h-4 w-4", couleur)} />
        <span className="text-xs sm:text-sm text-muted-foreground">{label}</span>
      </div>
      <p className={cn("mt-2 text-2xl sm:text-3xl font-bold tabular-nums", couleur)}>
        {valeur}
      </p>
    </div>
  );
}

function SectionRisque({ data }: { data: SyntheseRisqueApi | null }) {
  const t = useTranslations("directionIntelligence");
  if (!data) return null;

  const elevesEleve = data.eleves
    .filter((e) => e.niveau === "ELEVE")
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return (
    <div className="space-y-4">
      {/* 4 compteurs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <CompteurRisque
          label={t("totalEleves")}
          valeur={data.totalEleves}
          icone={Users}
          couleur="text-foreground"
        />
        <CompteurRisque
          label={t("risqueEleve")}
          valeur={data.risqueEleve}
          icone={ShieldAlert}
          couleur="text-red-600 dark:text-red-400"
        />
        <CompteurRisque
          label={t("risqueModere")}
          valeur={data.risqueModere}
          icone={AlertTriangle}
          couleur="text-orange-600 dark:text-orange-400"
        />
        <CompteurRisque
          label={t("decrochageSilencieux")}
          valeur={data.decrochageSilencieux}
          icone={VolumeX}
          couleur="text-purple-600 dark:text-purple-400"
        />
      </div>

      {/* Liste des élèves à risque élevé (top 10) */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-foreground">
          {t("elevesRisqueEleveTop")}
        </h3>
        {elevesEleve.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("aucunEleveRisque")}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {elevesEleve.map((e) => (
              <CarteRisque
                key={e.eleveId}
                eleve={
                  {
                    nom: e.nom,
                    prenom: e.prenom,
                    classeNom: e.classeNom,
                    score: e.score,
                    niveau: e.niveau,
                    decrochageSilencieux: e.decrochageSilencieux,
                  } satisfies EleveRisque
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section 3 : Nœuds critiques du curriculum ──────────────────────────────

function SectionNoeudsCritiques({ data }: { data: GrapheCurriculumApi | null }) {
  const t = useTranslations("directionIntelligence");
  if (!data) return null;

  const top = [...data.noeudsCritiques]
    .sort((a, b) => b.nbDescendants - a.nbDescendants || b.elevesEnEchec - a.elevesEnEchec)
    .slice(0, 10);

  if (top.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("aucunNoeudCritique")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-[640px] w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-3 py-2.5 font-medium text-muted-foreground">{t("colCompetence")}</th>
            <th className="px-3 py-2.5 font-medium text-muted-foreground">{t("colMatiere")}</th>
            <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">{t("colDescendants")}</th>
            <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">{t("colElevesEnEchec")}</th>
            <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">{t("colImpact")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {top.map((n) => {
            const badge = badgeImpact(n.impact);
            return (
              <tr key={n.competenceId} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2.5 font-medium text-foreground leading-tight">
                  {n.competenceLibelle}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{n.matiereNom}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{n.nbDescendants}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">
                  {n.elevesEnEchec}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                      badge.cls
                    )}
                  >
                    {t(badge.code)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section 4 : Simulation de remédiation ──────────────────────────────────

function SectionSimulation({
  data,
  devise,
}: {
  data: ResultatSimulationApi | null;
  devise: string;
}) {
  const t = useTranslations("directionIntelligence");
  if (!data) return null;

  const top5 = data.scenariosPriorises.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Résumé */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <CarteResume
          label={t("elevesARisque")}
          valeur={String(data.totalElevesARisque)}
          icone={Users}
        />
        <CarteResume
          label={t("elevesSauvables")}
          valeur={String(data.totalElevesSauvables)}
          icone={FlaskConical}
          couleur="text-emerald-600 dark:text-emerald-400"
        />
        <CarteResume
          label={t("coutOptimal")}
          valeur={formatCurrency(data.coutTotalOptimal, devise)}
          icone={Wallet}
          couleur="text-blue-600 dark:text-blue-400"
        />
      </div>

      {/* Top 5 scénarios */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-foreground">
          {t("top5Scenarios")}
        </h3>
        <TableauScenarios scenarios={top5} devise={devise} />
      </div>
    </div>
  );
}

// ─── Section 5 : Efficacité pédagogique ─────────────────────────────────────

function CarteResume({
  label,
  valeur,
  icone: Icone,
  couleur = "text-foreground",
}: {
  label: string;
  valeur: string;
  icone: React.ElementType;
  couleur?: string;
}) {
  return (
    <div className="p-3 sm:p-4 rounded-lg border bg-card shadow-sm">
      <div className="flex items-center gap-2">
        <Icone className={cn("h-4 w-4", couleur)} />
        <span className="text-xs sm:text-sm text-muted-foreground">{label}</span>
      </div>
      <p className={cn("mt-2 text-xl sm:text-2xl font-bold tabular-nums", couleur)}>{valeur}</p>
    </div>
  );
}

function SectionEfficacite({ data }: { data: EfficacitePedagogiqueApi | null }) {
  const t = useTranslations("directionIntelligence");
  if (!data) return null;

  const topEnseignants = [...data.enseignants]
    .sort((a, b) => b.deltaMasteryMoyen - a.deltaMasteryMoyen)
    .slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Δ mastery + taux de succès */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <CarteResume
          label={t("deltaMasteryMoyen")}
          valeur={`${(data.plans.deltaMasteryMoyen * 100).toFixed(1)}%`}
          icone={Activity}
          couleur="text-emerald-600 dark:text-emerald-400"
        />
        <CarteResume
          label={t("tauxSuccesPlans")}
          valeur={`${(data.plans.tauxSucces * 100).toFixed(0)}%`}
          icone={Gauge}
          couleur="text-blue-600 dark:text-blue-400"
        />
        <CarteResume
          label={t("typeInterventionEfficace")}
          valeur={data.interventions.typeLePlusEfficace ?? t("donneesInsuffisantes")}
          icone={Stethoscope}
          couleur="text-foreground"
        />
      </div>

      {/* Top 5 enseignants par progression */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-foreground">
          {t("top5Enseignants")}
        </h3>
        {topEnseignants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("aucunPlanEnseignant")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-[480px] w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2.5 font-medium text-muted-foreground">{t("colEnseignant")}</th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">{t("colPlansTermines")}</th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">{t("colElevesAides")}</th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">{t("colDeltaMastery")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {topEnseignants.map((ens) => (
                  <tr key={ens.userId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {ens.nom}
                      {ens.topPerformer && (
                        <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          {t("badgeTop")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{ens.plansTermines}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{ens.elevesAides}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      +{(ens.deltaMasteryMoyen * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section 6 : Mesure — Indicateurs de suivi ──────────────────────────────

function SectionMesure({
  finance,
  engagement,
  efficacite,
}: {
  finance: FinanceIntelligenceApi | null;
  engagement: EngagementParentalApi | null;
  efficacite: EfficacitePedagogiqueApi | null;
}) {
  const t = useTranslations("directionIntelligence");
  const tauxRecouvrement = finance ? tauxRecouvrementMoyen(finance.efficaciteRelances) : null;
  const delaiPaiement = finance?.delaiPaiement.moyenneGlobaleJours ?? null;
  const correlationEng = engagement?.correlation.coefficientPearson ?? null;
  const adoptionIA = tauxAdoptionIAMoyen(efficacite?.adoptionIA ?? null);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      <CarteResume
        label={t("tauxRecouvrement")}
        valeur={tauxRecouvrement !== null ? `${(tauxRecouvrement * 100).toFixed(0)}%` : t("donneesInsuffisantes")}
        icone={Wallet}
        couleur={tauxRecouvrement !== null && tauxRecouvrement < 0.4 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}
      />
      <CarteResume
        label={t("delaiMoyenPaiement")}
        valeur={delaiPaiement !== null ? `${delaiPaiement.toFixed(0)} ${t("jour")}` : t("donneesInsuffisantes")}
        icone={Gauge}
        couleur={delaiPaiement !== null && delaiPaiement > 15 ? "text-orange-600 dark:text-orange-400" : "text-foreground"}
      />
      <CarteResume
        label={t("correlationEngagement")}
        valeur={correlationEng !== null ? correlationEng.toFixed(2) : t("donneesInsuffisantes")}
        icone={HeartHandshake}
        couleur={correlationEng !== null && correlationEng > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}
      />
      <CarteResume
        label={t("tauxAdoptionIA")}
        valeur={adoptionIA !== null ? `${(adoptionIA * 100).toFixed(0)}%` : t("donneesInsuffisantes")}
        icone={Cpu}
        couleur="text-blue-600 dark:text-blue-400"
      />
    </div>
  );
}
