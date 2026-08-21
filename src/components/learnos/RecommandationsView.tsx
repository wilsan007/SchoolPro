"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Sparkles, Check, X, Loader2, CheckCircle2,
  Link2, ExternalLink, Target,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { texteErreur } from "@/lib/erreurs-client";
import { cn } from "@/lib/utils";
import { TexteRegle } from "@/components/learnos/TexteRegle";

interface Recommandation {
  id: string;
  niveau: string;
  statut: string;
  motif: string;
  actionProposee: string;
  regleDeclenchee: string;
  motifParams: unknown;
  competencesBloquees: number;
  createdAt: string | Date;
  eleve: { id: string; nom: string; prenom: string; classe: { nom: string } | null };
  competence: {
    code: string;
    libelle: string;
    chapitre: { matiere: { nom: string } | null } | null;
  };
}

/**
 * Trois files distinctes, dans cet ordre.
 *
 * Ce n'est pas un tri décoratif : mélanger « un élève est bloqué » et « un
 * élève pourrait aller plus loin » dans une même liste ferait perdre les
 * premiers dans la masse. Les ouvertures sont volontairement reléguées en
 * dernier — elles comptent, mais elles n'ont aucune urgence.
 */
const FILES = [
  {
    cle: "OBLIGATOIRE",
    titreCle: "fileObligatoire",
    sousTitreCle: "fileObligatoireAide",
    icone: AlertTriangle,
    accent: "text-red-600",
    bordure: "border-l-red-500",
    bg: "bg-red-500/5",
    ring: "ring-red-500/20",
  },
  {
    cle: "RECOMMANDEE",
    titreCle: "fileRecommandee",
    sousTitreCle: "fileRecommandeeAide",
    icone: Target,
    accent: "text-amber-600",
    bordure: "border-l-amber-500",
    bg: "bg-amber-500/5",
    ring: "ring-amber-500/20",
  },
  {
    cle: "PROPOSEE",
    titreCle: "fileProposee",
    sousTitreCle: "fileProposeeAide",
    icone: Sparkles,
    accent: "text-violet-600",
    bordure: "border-l-violet-500",
    bg: "bg-violet-500/5",
    ring: "ring-violet-500/20",
  },
] as const;

export function RecommandationsView({
  recommandations,
}: {
  recommandations: Recommandation[];
}) {
  const t = useTranslations("learnos.recommandations");
  const tc = useTranslations("learnos.commun");
  const te = useTranslations("learnos.erreurs");
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [traitees, setTraitees] = useState<Set<string>>(new Set());

  const parStatut = useMemo(() => {
    const map = new Map<string, Recommandation[]>();
    for (const r of recommandations) {
      if (traitees.has(r.id)) continue;
      if (!map.has(r.statut)) map.set(r.statut, []);
      map.get(r.statut)!.push(r);
    }
    return map;
  }, [recommandations, traitees]);

  const restantes = recommandations.length - traitees.size;

  function decider(id: string, statut: "ACCEPTEE" | "ECARTEE") {
    demarrer(async () => {
      try {
        const res = await fetch(`/api/learnos/recommandations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statut }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));

        // Retrait immédiat de la liste : l'enseignant voit sa file décroître
        // au lieu d'attendre un rechargement complet.
        setTraitees((s) => new Set(s).add(id));
        toast.success(t(statut === "ACCEPTEE" ? "priseEnCharge" : "ecartee"));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  if (restantes === 0) {
    return (
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="py-10 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
          <p className="font-medium text-emerald-700 dark:text-emerald-400">{t("rienATraiter")}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {t(recommandations.length > 0 ? "toutesTraitees" : "aucunePourInstant")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {FILES.map((file) => {
        const items = parStatut.get(file.cle) ?? [];
        if (items.length === 0) return null;
        const Icone = file.icone;

        return (
          <section key={file.cle} className={cn("rounded-xl ring-1 p-4", file.ring, file.bg)}>
            {/* En-tête de file — plus visible qu'avant */}
            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border/40">
              <div className={cn("flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center", file.bg)}>
                <Icone className={cn("h-5 w-5", file.accent)} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="flex items-center gap-2 font-semibold text-base">
                  {t(file.titreCle)}
                  <Badge variant="secondary" className="h-5">{items.length}</Badge>
                </h2>
                <p className="text-sm text-muted-foreground">{t(file.sousTitreCle)}</p>
              </div>
            </div>

            <div className="space-y-2">
              {items.map((r) => (
                <Card key={r.id} className={cn("border-l-4 shadow-none", file.bordure)}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/eleves/${r.eleve.id}`}
                          className="font-medium hover:underline"
                        >
                          {r.eleve.prenom} {r.eleve.nom}
                        </Link>
                        {r.eleve.classe && (
                          <Badge variant="outline">{r.eleve.classe.nom}</Badge>
                        )}
                        <span className="text-sm text-muted-foreground">
                          {r.competence.chapitre?.matiere?.nom}
                        </span>
                      </div>

                      <p className="text-sm">
                        <TexteRegle
                          regle={r.regleDeclenchee}
                          params={r.motifParams}
                          secours={r.motif}
                        />
                      </p>
                      <p className="text-sm font-medium">
                        →{" "}
                        <TexteRegle
                          regle={r.regleDeclenchee}
                          params={r.motifParams}
                          secours={r.actionProposee}
                          action
                        />
                      </p>

                      {r.competencesBloquees > 0 && (
                        <p className="flex items-center gap-1.5 text-xs text-red-600">
                          <Link2 className="h-3.5 w-3.5" />
                          {t("conditionneCompetences", { n: r.competencesBloquees })}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decider(r.id, "ACCEPTEE")}
                        disabled={enCours}
                      >
                        {enCours ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        <span className="ml-1.5">{t("prendreEnCharge")}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => decider(r.id, "ECARTEE")}
                        disabled={enCours}
                        title={t("ecarter")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Link href={`/eleves/${r.eleve.id}`}>
                        <Button size="sm" variant="ghost" title={t("voirFiche")}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      <p className="text-xs text-muted-foreground">
        {t("noteBas")}
      </p>
    </div>
  );
}
