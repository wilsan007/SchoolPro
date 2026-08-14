"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronUp, ChevronDown, CircleDot, Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Éditeur de structure d'une question.
 *
 * POURQUOI UN ÉDITEUR ET PAS UN CHAMP JSON
 * ----------------------------------------
 * La structure porte les réponses attendues, les identifiants d'options et
 * l'annotation diagnostique des distracteurs. Demander ce JSON à un enseignant
 * garantirait deux choses : qu'il ne s'en servirait pas, et que les rares
 * structures saisies seraient invalides. L'éditeur produit un objet toujours
 * bien formé — la validation serveur (`parseStructure`) reste le juge, mais
 * elle ne devrait jamais avoir à refuser ce qui sort d'ici.
 *
 * CE QUE L'INTERFACE REND IMPOSSIBLE
 * ----------------------------------
 *  - un QCM sans bonne réponse : le premier choix est coché d'office ;
 *  - une remise en ordre incohérente : **l'ordre des lignes EST la réponse**,
 *    il n'y a rien d'autre à saisir, donc rien qui puisse le contredire ;
 *  - un appariement ambigu : gauche et droite se saisissent par paire, jamais
 *    séparément.
 */

export type FormatEtape =
  | "SAISIE_COURTE"
  | "CHOIX_UNIQUE"
  | "REMISE_EN_ORDRE"
  | "APPARIEMENT";

/** Types d'erreur proposés pour annoter un distracteur. */
const TYPES_ERREUR = [
  "CONCEPTUAL_ERROR",
  "PROCEDURAL_ERROR",
  "CALCULATION_ERROR",
  "READING_ERROR",
  "MISSING_PREREQUISITE",
] as const;

export interface OptionSaisie {
  id: string;
  texte: string;
  erreur?: string;
}

export interface PaireSaisie {
  id: string;
  gauche: string;
  droite: string;
}

export interface EtapeSaisie {
  enonce: string;
  format: FormatEtape;
  options: OptionSaisie[];
  paires: PaireSaisie[];
  /** Identifiant de la bonne option (`CHOIX_UNIQUE`) ou valeur attendue. */
  reponse: string;
  tolerance?: number;
  indice?: string;
  points: number;
}

export function etapeVierge(format: FormatEtape = "SAISIE_COURTE"): EtapeSaisie {
  return {
    enonce: "",
    format,
    options:
      format === "CHOIX_UNIQUE" || format === "REMISE_EN_ORDRE"
        ? [
            { id: "o1", texte: "" },
            { id: "o2", texte: "" },
          ]
        : [],
    paires:
      format === "APPARIEMENT"
        ? [
            { id: "p1", gauche: "", droite: "" },
            { id: "p2", gauche: "", droite: "" },
          ]
        : [],
    reponse: format === "CHOIX_UNIQUE" ? "o1" : "",
    points: 1,
  };
}

/**
 * Convertit la saisie en structure serveur.
 *
 * Les champs vides sont retirés plutôt qu'envoyés vides : une `tolerance` à 0
 * et une `tolerance` absente ne veulent pas dire la même chose côté correction.
 */
export function versStructure(etapes: EtapeSaisie[]) {
  return {
    etapes: etapes.map((e) => ({
      enonce: e.enonce.trim(),
      format: e.format,
      points: e.points,
      ...(e.indice?.trim() ? { indice: e.indice.trim() } : {}),
      ...(e.format === "SAISIE_COURTE"
        ? {
            reponse: e.reponse.trim(),
            ...(typeof e.tolerance === "number" ? { tolerance: e.tolerance } : {}),
          }
        : {}),
      ...(e.format === "CHOIX_UNIQUE"
        ? {
            reponse: e.reponse,
            options: e.options.map((o) => ({
              id: o.id,
              texte: o.texte.trim(),
              // La bonne réponse ne porte JAMAIS d'annotation d'erreur.
              ...(o.id !== e.reponse && o.erreur ? { erreur: o.erreur } : {}),
            })),
          }
        : {}),
      ...(e.format === "REMISE_EN_ORDRE"
        ? {
            // L'ordre des lignes est la réponse : il n'y a rien à saisir de plus.
            reponse: e.options.map((o) => o.id).join("|"),
            options: e.options.map((o) => ({ id: o.id, texte: o.texte.trim() })),
          }
        : {}),
      ...(e.format === "APPARIEMENT"
        ? {
            // `reponse` est déduite des paires côté serveur : ne pas l'envoyer.
            paires: e.paires.map((p) => ({
              id: p.id,
              gauche: p.gauche.trim(),
              droite: p.droite.trim(),
            })),
          }
        : {}),
    })),
  };
}

/** Relit une structure existante pour la remettre dans l'éditeur. */
export function depuisStructure(brut: unknown): EtapeSaisie[] {
  const source = brut as { etapes?: unknown };
  if (!Array.isArray(source?.etapes)) return [etapeVierge()];
  return source.etapes.map((raw) => {
    const e = raw as Record<string, unknown>;
    const format = (e.format as FormatEtape) ?? "SAISIE_COURTE";
    const options = Array.isArray(e.options) ? (e.options as OptionSaisie[]) : [];
    const paires = Array.isArray(e.paires) ? (e.paires as PaireSaisie[]) : [];
    // Une remise en ordre stocke l'ordre correct dans `reponse` : on le rejoue
    // pour que l'éditeur affiche les lignes DANS cet ordre — sinon l'enseignant
    // relirait une séquence mélangée et croirait à une erreur.
    const ordonnees =
      format === "REMISE_EN_ORDRE" && typeof e.reponse === "string"
        ? e.reponse
            .split("|")
            .map((id) => options.find((o) => o.id === id))
            .filter((o): o is OptionSaisie => Boolean(o))
        : options;
    return {
      enonce: typeof e.enonce === "string" ? e.enonce : "",
      format,
      options: ordonnees.length > 0 ? ordonnees : options,
      paires,
      reponse: typeof e.reponse === "string" ? e.reponse : "",
      tolerance: typeof e.tolerance === "number" ? e.tolerance : undefined,
      indice: typeof e.indice === "string" ? e.indice : undefined,
      points: typeof e.points === "number" ? e.points : 1,
    };
  });
}

export function EditeurQuestion({
  etapes,
  onChange,
  multiEtapes,
}: {
  etapes: EtapeSaisie[];
  onChange: (etapes: EtapeSaisie[]) => void;
  /** `true` pour `ETAPES_GUIDEES` : l'enseignant peut ajouter des étapes. */
  multiEtapes: boolean;
}) {
  const t = useTranslations("learnos.banque");

  function majEtape(i: number, patch: Partial<EtapeSaisie>) {
    onChange(etapes.map((e, j) => (i === j ? { ...e, ...patch } : e)));
  }

  return (
    <div className="space-y-3">
      {etapes.map((etape, i) => (
        <div key={i} className="space-y-2.5 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            {multiEtapes && (
              <Badge variant="outline" className="shrink-0">
                {t("etapeN", { n: i + 1 })}
              </Badge>
            )}
            <Input
              value={etape.enonce}
              onChange={(e) => majEtape(i, { enonce: e.target.value })}
              placeholder={t("enonceEtape")}
            />
            {multiEtapes && etapes.length > 1 && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onChange(etapes.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {multiEtapes && (
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={etape.format}
              onChange={(e) =>
                majEtape(i, {
                  ...etapeVierge(e.target.value as FormatEtape),
                  enonce: etape.enonce,
                })
              }
            >
              <option value="SAISIE_COURTE">{t("formatSAISIE_COURTE")}</option>
              <option value="CHOIX_UNIQUE">{t("formatCHOIX_UNIQUE")}</option>
            </select>
          )}

          {etape.format === "SAISIE_COURTE" && (
            <div className="flex gap-2">
              <Input
                value={etape.reponse}
                onChange={(e) => majEtape(i, { reponse: e.target.value })}
                placeholder={t("reponseAttendue")}
              />
              <Input
                type="number"
                step="any"
                className="w-32"
                value={etape.tolerance ?? ""}
                onChange={(e) =>
                  majEtape(i, {
                    tolerance: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                placeholder={t("tolerance")}
                title={t("toleranceAide")}
              />
            </div>
          )}

          {etape.format === "CHOIX_UNIQUE" && (
            <ListeOptions
              etape={etape}
              onChange={(patch) => majEtape(i, patch)}
              avecErreur
              avecBonneReponse
            />
          )}

          {etape.format === "REMISE_EN_ORDRE" && (
            <>
              {/* Dit une fois, en clair : sans cette phrase, un enseignant peut
                  chercher où saisir la réponse et croire l'écran incomplet. */}
              <p className="text-xs text-muted-foreground">{t("ordreEstLaReponse")}</p>
              <ListeOptions etape={etape} onChange={(patch) => majEtape(i, patch)} avecOrdre />
            </>
          )}

          {etape.format === "APPARIEMENT" && (
            <ListePaires etape={etape} onChange={(patch) => majEtape(i, patch)} />
          )}

          <Input
            value={etape.indice ?? ""}
            onChange={(e) => majEtape(i, { indice: e.target.value })}
            placeholder={t("indice")}
            title={t("indiceAide")}
          />
        </div>
      ))}

      {multiEtapes && etapes.length < 6 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...etapes, etapeVierge()])}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {t("ajouterEtape")}
        </Button>
      )}
    </div>
  );
}

/** Propositions d'un QCM ou éléments d'une remise en ordre. */
function ListeOptions({
  etape,
  onChange,
  avecErreur,
  avecBonneReponse,
  avecOrdre,
}: {
  etape: EtapeSaisie;
  onChange: (patch: Partial<EtapeSaisie>) => void;
  avecErreur?: boolean;
  avecBonneReponse?: boolean;
  avecOrdre?: boolean;
}) {
  const t = useTranslations("learnos.banque");

  function deplacer(i: number, delta: number) {
    const cible = i + delta;
    if (cible < 0 || cible >= etape.options.length) return;
    const copie = [...etape.options];
    [copie[i], copie[cible]] = [copie[cible], copie[i]];
    onChange({ options: copie });
  }

  return (
    <div className="space-y-1.5">
      {etape.options.map((option, i) => (
        <div key={option.id} className="flex items-center gap-1.5">
          {avecBonneReponse && (
            <button
              type="button"
              onClick={() => onChange({ reponse: option.id })}
              title={t("marquerBonne")}
              className="shrink-0 text-muted-foreground hover:text-emerald-600"
            >
              {etape.reponse === option.id ? (
                <CircleDot className="h-4 w-4 text-emerald-600" />
              ) : (
                <Circle className="h-4 w-4" />
              )}
            </button>
          )}
          {avecOrdre && (
            <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">
              {i + 1}
            </span>
          )}
          <Input
            value={option.texte}
            onChange={(e) =>
              onChange({
                options: etape.options.map((o, j) =>
                  i === j ? { ...o, texte: e.target.value } : o
                ),
              })
            }
            placeholder={t("proposition")}
          />

          {/* Annotation diagnostique — proposée seulement sur les MAUVAISES
              réponses : c'est ce qui transforme un QCM en diagnostic. */}
          {avecErreur && etape.reponse !== option.id && (
            <select
              className="h-9 w-40 shrink-0 rounded-md border bg-background px-1 text-xs"
              value={option.erreur ?? ""}
              onChange={(e) =>
                onChange({
                  options: etape.options.map((o, j) =>
                    i === j ? { ...o, erreur: e.target.value || undefined } : o
                  ),
                })
              }
              title={t("erreurRevelee")}
            >
              <option value="">{t("erreurAucune")}</option>
              {TYPES_ERREUR.map((type) => (
                <option key={type} value={type}>
                  {t(`erreur_${type}`)}
                </option>
              ))}
            </select>
          )}

          {avecOrdre && (
            <div className="flex shrink-0 flex-col">
              <button type="button" onClick={() => deplacer(i, -1)} disabled={i === 0}>
                <ChevronUp className={cn("h-3.5 w-3.5", i === 0 && "opacity-30")} />
              </button>
              <button
                type="button"
                onClick={() => deplacer(i, 1)}
                disabled={i === etape.options.length - 1}
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5",
                    i === etape.options.length - 1 && "opacity-30"
                  )}
                />
              </button>
            </div>
          )}

          {etape.options.length > 2 && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0"
              onClick={() =>
                onChange({ options: etape.options.filter((_, j) => j !== i) })
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}

      {etape.options.length < 5 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({
              options: [
                ...etape.options,
                { id: `o${Date.now().toString(36)}`, texte: "" },
              ],
            })
          }
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("ajouterProposition")}
        </Button>
      )}
    </div>
  );
}

/** Paires d'un appariement — saisies ensemble, jamais séparément. */
function ListePaires({
  etape,
  onChange,
}: {
  etape: EtapeSaisie;
  onChange: (patch: Partial<EtapeSaisie>) => void;
}) {
  const t = useTranslations("learnos.banque");

  return (
    <div className="space-y-1.5">
      {etape.paires.map((paire, i) => (
        <div key={paire.id} className="flex items-center gap-1.5">
          <Input
            value={paire.gauche}
            onChange={(e) =>
              onChange({
                paires: etape.paires.map((p, j) =>
                  i === j ? { ...p, gauche: e.target.value } : p
                ),
              })
            }
            placeholder={t("elementGauche")}
          />
          <span className="shrink-0 text-muted-foreground">→</span>
          <Input
            value={paire.droite}
            onChange={(e) =>
              onChange({
                paires: etape.paires.map((p, j) =>
                  i === j ? { ...p, droite: e.target.value } : p
                ),
              })
            }
            placeholder={t("elementDroite")}
          />
          {etape.paires.length > 2 && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0"
              onClick={() => onChange({ paires: etape.paires.filter((_, j) => j !== i) })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}

      {etape.paires.length < 5 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({
              paires: [
                ...etape.paires,
                { id: `p${Date.now().toString(36)}`, gauche: "", droite: "" },
              ],
            })
          }
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("ajouterPaire")}
        </Button>
      )}
    </div>
  );
}
