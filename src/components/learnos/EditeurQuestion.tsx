"use client";

import type { ErrorType } from "@prisma/client";
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

/**
 * Types d'erreur proposés pour annoter une mauvaise réponse ou anticiper ce
 * qu'une grille doit relever. La liste est celle de `TYPES_ERREUR_GRILLE` : les
 * deux endroits doivent proposer les mêmes valeurs, sinon une erreur anticipée
 * saisie ici serait illisible pour la correction.
 */
const TYPES_ERREUR = [
  "CONCEPTUAL_ERROR",
  "PROCEDURAL_ERROR",
  "CALCULATION_ERROR",
  "READING_ERROR",
  "MISINTERPRETATION",
  "MISSING_PREREQUISITE",
  "INCOMPLETE_REASONING",
  "NOTATION_ERROR",
  "ARGUMENT_UNJUSTIFIED",
  "WRITING_ERROR",
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

/** Une partie de dossier, telle que saisie. */
export interface PartieSaisie {
  id: string;
  titre: string;
  but?: string;
}

/** Bornes alignées sur `MAX_PARTIES` et `MAX_ETAPES` (structure-question.ts). */
export const MAX_PARTIES_SAISIE = 8;
export const MAX_ETAPES_SAISIE = 30;

export interface EtapeSaisie {
  enonce: string;
  /** Identifiant de la partie (dossier uniquement). */
  partie?: string;
  format: FormatEtape;
  options: OptionSaisie[];
  paires: PaireSaisie[];
  /** Identifiant de la bonne option (`CHOIX_UNIQUE`) ou valeur attendue. */
  reponse: string;
  tolerance?: number;
  indice?: string;
  points: number;
}

/** Un critère de la grille de correction, tel que saisi. */
export interface CritereSaisie {
  id: string;
  libelle: string;
  points: number;
}

/** Une erreur que l'auteur s'attend à voir relever sur cette question. */
export interface ErreurAnticipeeSaisie {
  type: ErrorType;
  description: string;
}

export function etapeVierge(format: FormatEtape = "SAISIE_COURTE", partie?: string): EtapeSaisie {
  return {
    enonce: "",
    ...(partie ? { partie } : {}),
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
export function versStructure(etapes: EtapeSaisie[], parties?: PartieSaisie[]) {
  const dossier = parties !== undefined && parties.length > 0;
  // Dans un dossier, les étapes sont rangées PARTIE PAR PARTIE (tri stable) : le
  // serveur exige des parties contiguës et ordonnées, et laisser l'enseignant
  // y veiller à la main reviendrait à lui faire découvrir l'erreur au clic.
  const rang = (id?: string) => {
    const i = parties?.findIndex((p) => p.id === id) ?? -1;
    return i < 0 ? parties?.length ?? 0 : i;
  };
  const rangees = dossier
    ? etapes
        .map((e, i) => ({ e, i }))
        .sort((a, b) => rang(a.e.partie) - rang(b.e.partie) || a.i - b.i)
        .map(({ e }) => e)
    : etapes;

  return {
    ...(dossier
      ? {
          parties: parties!.map((p) => ({
            id: p.id,
            titre: p.titre.trim(),
            ...(p.but?.trim() ? { but: p.but.trim() } : {}),
          })),
        }
      : {}),
    etapes: rangees.map((e) => ({
      enonce: e.enonce.trim(),
      ...(dossier && e.partie ? { partie: e.partie } : {}),
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
      partie: typeof e.partie === "string" ? e.partie : undefined,
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

/** Relit les parties d'une structure existante (vide hors dossier). */
export function depuisParties(brut: unknown): PartieSaisie[] {
  const source = brut as { parties?: unknown };
  if (!Array.isArray(source?.parties)) return [];
  return source.parties.flatMap((raw) => {
    const p = raw as Record<string, unknown>;
    if (typeof p?.id !== "string") return [];
    return [
      {
        id: p.id,
        titre: typeof p.titre === "string" ? p.titre : "",
        but: typeof p.but === "string" ? p.but : undefined,
      },
    ];
  });
}

/** Deux parties pour démarrer : un dossier à une seule partie ne découpe rien. */
export function partiesVierges(): PartieSaisie[] {
  return [
    { id: "p1", titre: "" },
    { id: "p2", titre: "" },
  ];
}

// ------------------------------------------------------------
// Grille de correction — conversion
// ------------------------------------------------------------

/**
 * Relit une grille existante pour l'éditer.
 *
 * Le même lecteur défensif que partout ailleurs : la grille vient de la base ou
 * du serveur, et ce qui ne passe pas est vidé plutôt que proposé à la main.
 */
export function depuisGrille(brut: unknown): {
  criteres: CritereSaisie[];
  erreurs: ErreurAnticipeeSaisie[];
} {
  const source = brut as { criteres?: unknown; erreursAnticipees?: unknown } | null;
  const criteres: CritereSaisie[] = Array.isArray(source?.criteres)
    ? source.criteres.flatMap((raw) => {
        const c = raw as Record<string, unknown>;
        if (typeof c?.libelle !== "string" || typeof c?.points !== "number") return [];
        return [
          {
            id: typeof c.id === "string" && c.id !== "" ? c.id : `crit-${Math.random().toString(36).slice(2, 9)}`,
            libelle: c.libelle,
            points: c.points,
          },
        ];
      })
    : [];
  const erreurs: ErreurAnticipeeSaisie[] = Array.isArray(source?.erreursAnticipees)
    ? source.erreursAnticipees.flatMap((raw) => {
        const e = raw as Record<string, unknown>;
        if (typeof e?.description !== "string" || typeof e?.type !== "string") return [];
        return [{ type: e.type as ErrorType, description: e.description }];
      })
    : [];
  return { criteres, erreurs };
}

/**
 * Produit la grille à envoyer au serveur.
 *
 * Les critères vides sont retirés plutôt que refusés à l'envoi : un libellé
 * effacé en cours de saisie ne doit pas bloquer l'enregistrement d'une grille
 * par ailleurs complète. Le serveur reste le juge (`parseGrille`,
 * `grilleCoherente`).
 */
export function versGrille(grille: {
  criteres: CritereSaisie[];
  erreurs: ErreurAnticipeeSaisie[];
}): Record<string, unknown> {
  return {
    criteres: grille.criteres
      .filter((c) => c.libelle.trim() !== "")
      .map((c) => ({ id: c.id, libelle: c.libelle.trim(), points: c.points })),
    erreursAnticipees: grille.erreurs
      .filter((e) => e.description.trim() !== "")
      .map((e) => ({ type: e.type, description: e.description.trim() })),
  };
}

/**
 * Totaux comparables de deux saisies de grille.
 *
 * Utilisée avant la relecture : si rien n'a changé, la grille n'est pas
 * renvoyée et le serveur ne l'incrémente pas (`grilleVersion`) — sinon, les
 * propositions de correction déjà produites deviendraient inexplicables.
 * Compare au centième car les points sont des flottants.
 */
export function memeSaisieGrille(
  a: { criteres: CritereSaisie[]; erreurs: ErreurAnticipeeSaisie[] },
  b: { criteres: CritereSaisie[]; erreurs: ErreurAnticipeeSaisie[] }
): boolean {
  const somme = (cs: CritereSaisie[]) => Math.round(cs.reduce((s, c) => s + c.points, 0) * 100) / 100;
  return (
    somme(a.criteres) === somme(b.criteres) &&
    JSON.stringify(a.criteres.map((c) => c.id)) === JSON.stringify(b.criteres.map((c) => c.id)) &&
    JSON.stringify(a.erreurs.map((e) => `${e.type}:${e.description}`)) ===
      JSON.stringify(b.erreurs.map((e) => `${e.type}:${e.description}`))
  );
}

export function EditeurQuestion({
  etapes,
  onChange,
  multiEtapes,
  parties,
  onPartiesChange,
  grille,
  onGrilleChange,
  bareme,
}: {
  etapes: EtapeSaisie[];
  onChange: (etapes: EtapeSaisie[]) => void;
  /** `true` pour `ETAPES_GUIDEES` : l'enseignant peut ajouter des étapes. */
  multiEtapes: boolean;
  /** Défini = mode dossier : l'exercice est découpé en parties. */
  parties?: PartieSaisie[];
  onPartiesChange?: (parties: PartieSaisie[]) => void;
  /** Grille de correction de la question, si elle est éditable ici. */
  grille?: { criteres: CritereSaisie[]; erreurs: ErreurAnticipeeSaisie[] };
  onGrilleChange?: (grille: { criteres: CritereSaisie[]; erreurs: ErreurAnticipeeSaisie[] }) => void;
  /** Barème de l'énoncé, pour signaler une grille qui ne totalise pas le barème. */
  bareme?: number | null;
}) {
  const t = useTranslations("learnos.banque");
  const dossier = parties !== undefined && onPartiesChange !== undefined;
  const maxEtapes = dossier ? MAX_ETAPES_SAISIE : 6;

  function majEtape(i: number, patch: Partial<EtapeSaisie>) {
    onChange(etapes.map((e, j) => (i === j ? { ...e, ...patch } : e)));
  }

  function majPartie(i: number, patch: Partial<PartieSaisie>) {
    onPartiesChange?.((parties ?? []).map((p, j) => (i === j ? { ...p, ...patch } : p)));
  }

  function ajouterPartie() {
    const existantes = parties ?? [];
    let n = existantes.length + 1;
    while (existantes.some((p) => p.id === `p${n}`)) n++;
    onPartiesChange?.([...existantes, { id: `p${n}`, titre: "" }]);
  }

  function retirerPartie(i: number) {
    const existantes = parties ?? [];
    if (existantes.length <= 2) return;
    const retiree = existantes[i].id;
    const reste = existantes.filter((_, j) => j !== i);
    onPartiesChange?.(reste);
    // Les étapes de la partie retirée passent à la première : les supprimer en
    // silence ferait perdre du travail à l'enseignant.
    onChange(etapes.map((e) => (e.partie === retiree ? { ...e, partie: reste[0].id } : e)));
  }

  return (
    <div className="space-y-3">
      {dossier && (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <p className="text-xs text-muted-foreground">{t("partiesAide")}</p>
          {(parties ?? []).map((partie, i) => (
            <div key={partie.id} className="flex items-center gap-2">
              <Badge variant="outline" className="shrink-0">
                {t("partieN", { n: i + 1 })}
              </Badge>
              <Input
                value={partie.titre}
                onChange={(e) => majPartie(i, { titre: e.target.value })}
                placeholder={t("partieTitre")}
                aria-label={t("partieTitre")}
              />
              <Input
                value={partie.but ?? ""}
                onChange={(e) => majPartie(i, { but: e.target.value })}
                placeholder={t("partieBut")}
                aria-label={t("partieBut")}
              />
              {(parties ?? []).length > 2 && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => retirerPartie(i)}
                  aria-label={t("retirerPartie")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {(parties ?? []).length < MAX_PARTIES_SAISIE && (
            <Button type="button" variant="outline" size="sm" onClick={ajouterPartie}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("ajouterPartie")}
            </Button>
          )}
        </div>
      )}

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

          {dossier && (
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={etape.partie ?? parties?.[0]?.id ?? ""}
              onChange={(e) => majEtape(i, { partie: e.target.value })}
              aria-label={t("partieDeLEtape")}
            >
              {(parties ?? []).map((p, k) => (
                <option key={p.id} value={p.id}>
                  {t("partieN", { n: k + 1 })}
                  {p.titre.trim() ? ` — ${p.titre}` : ""}
                </option>
              ))}
            </select>
          )}

          {multiEtapes && (
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={etape.format}
              onChange={(e) =>
                majEtape(i, {
                  ...etapeVierge(e.target.value as FormatEtape),
                  enonce: etape.enonce,
                  // Changer de format ne doit pas faire changer de partie.
                  partie: etape.partie,
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

      {multiEtapes && etapes.length < maxEtapes && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...etapes,
              {
                ...etapeVierge(),
                // Une étape ajoutée rejoint la dernière partie : c'est là que
                // l'enseignant écrit, et elle reste réaffectable d'un clic.
                ...(dossier && parties?.length ? { partie: parties[parties.length - 1].id } : {}),
              },
            ])
          }
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {t("ajouterEtape")}
        </Button>
      )}

      {/* Grille — présente même sans étapes : pour un énoncé libre
          (SAISIE_LIBRE), c'est elle seule qui rend la correction assistée
          possible, et un format auto-corrigeable peut en porter une aussi. */}
      {grille !== undefined && onGrilleChange && (
        <EditeurGrille bareme={bareme} grille={grille} onChange={onGrilleChange} />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Grille de correction
// ------------------------------------------------------------

/** Garde-fous alignés sur `MAX_CRITERES` (grille-correction.ts). */
const MAX_CRITERES_SAISIE = 20;
const MAX_ERREURS_SAISIE = 10;

/** Somme des points saisis, arrondie au centième comme le fait le serveur. */
function totalSaisi(grille: { criteres: CritereSaisie[] }): number {
  return Math.round(grille.criteres.reduce((s, c) => s + c.points, 0) * 100) / 100;
}

/**
 * Grille de correction : ce qui est vérifié, et ce que ça rapporte.
 *
 * La grille n'est pas une note : elle est la liste des points attribuables, et
 * toute note en découle par addition (règle non négociable, `AGENTS.md`).
 * L'enseignant ne saisit donc que des critères — le total n'a aucun champ, et
 * le serveur le recalcule toujours.
 */
function EditeurGrille({
  grille,
  onChange,
  bareme,
}: {
  grille: { criteres: CritereSaisie[]; erreurs: ErreurAnticipeeSaisie[] };
  onChange: (grille: { criteres: CritereSaisie[]; erreurs: ErreurAnticipeeSaisie[] }) => void;
  /** Barème de l'énoncé, pour signaler une grille qui ne le totalise pas. */
  bareme?: number | null;
}) {
  const t = useTranslations("learnos.banque");
  const total = totalSaisi(grille);
  // Comparé au centième, pas en égalité stricte de flottants : 0,1 + 0,2 ≠ 0,3.
  const incoherent =
    bareme != null && bareme > 0 && Math.round(bareme * 100) !== Math.round(total * 100);

  function majCritere(i: number, patch: Partial<CritereSaisie>) {
    onChange({
      ...grille,
      criteres: grille.criteres.map((c, j) => (i === j ? { ...c, ...patch } : c)),
    });
  }

  function ajouterCritere() {
    if (grille.criteres.length >= MAX_CRITERES_SAISIE) return;
    onChange({
      ...grille,
      criteres: [
        ...grille.criteres,
        { id: `crit-${Date.now().toString(36)}`, libelle: "", points: 1 },
      ],
    });
  }

  function ajouterErreur() {
    if (grille.erreurs.length >= MAX_ERREURS_SAISIE) return;
    onChange({
      ...grille,
      erreurs: [...grille.erreurs, { type: TYPES_ERREUR[0], description: "" }],
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <p className="text-xs text-muted-foreground">{t("grilleAide")}</p>

      <div className="space-y-1.5">
        {grille.criteres.map((critere, i) => (
          <div key={critere.id} className="flex items-center gap-1.5">
            <Input
              value={critere.libelle}
              onChange={(e) => majCritere(i, { libelle: e.target.value })}
              placeholder={t("critereLibelle")}
              aria-label={t("critereLibelle")}
            />
            <Input
              type="number"
              step="any"
              min="0"
              className="w-24 shrink-0"
              value={critere.points}
              onChange={(e) => {
                const v = Number(e.target.value);
                majCritere(i, { points: Number.isFinite(v) ? v : 0 });
              }}
              placeholder={t("points")}
              aria-label={t("points")}
            />
            {grille.criteres.length > 1 && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0"
                aria-label={t("retirerCritere")}
                onClick={() =>
                  onChange({ ...grille, criteres: grille.criteres.filter((_, j) => i !== j) })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {grille.criteres.length < MAX_CRITERES_SAISIE && (
          <Button type="button" variant="outline" size="sm" onClick={ajouterCritere}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("ajouterCritere")}
          </Button>
        )}
        <span className="text-xs text-muted-foreground">{t("totalGrille", { total })}</span>
        {/* Dit avant l'enregistrement, pas refusé après : le serveur reste juge,
            mais il n'y a aucune raison de le laisser rejeter un oubli. */}
        {incoherent && (
          <span className="text-xs font-medium text-amber-600">
            {t("grilleIncoherente", { bareme })}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">{t("erreursAnticipees")}</p>
        {grille.erreurs.map((erreur, i) => (
          <div key={`err-${i}`} className="flex items-center gap-1.5">
            <select
              className="h-9 w-44 shrink-0 rounded-md border bg-background px-1 text-xs"
              value={erreur.type}
              onChange={(e) =>
                onChange({
                  ...grille,
                  erreurs: grille.erreurs.map((x, j) =>
                    i === j ? { ...x, type: e.target.value as ErrorType } : x
                  ),
                })
              }
              aria-label={t("erreurRevelee")}
            >
              {TYPES_ERREUR.map((type) => (
                <option key={type} value={type}>
                  {t(`erreur_${type}`)}
                </option>
              ))}
            </select>
            <Input
              value={erreur.description}
              onChange={(e) =>
                onChange({
                  ...grille,
                  erreurs: grille.erreurs.map((x, j) =>
                    i === j ? { ...x, description: e.target.value } : x
                  ),
                })
              }
              placeholder={t("erreurDescription")}
              aria-label={t("erreurDescription")}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0"
              aria-label={t("retirerErreur")}
              onClick={() =>
                onChange({ ...grille, erreurs: grille.erreurs.filter((_, j) => i !== j) })
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {grille.erreurs.length < MAX_ERREURS_SAISIE && (
          <Button type="button" variant="ghost" size="sm" onClick={ajouterErreur}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("ajouterErreurAnticipee")}
          </Button>
        )}
      </div>
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
