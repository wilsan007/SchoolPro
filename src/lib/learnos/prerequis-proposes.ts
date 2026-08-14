/**
 * EcolPro / LEARNOS — Proposition du graphe de prérequis
 * ======================================================
 *
 * CE QUE LE MODÈLE FAIT, ET CE QU'IL NE FAIT PAS
 * ----------------------------------------------
 * Relier les compétences d'une matière entre elles est un travail long et
 * fastidieux : cinquante compétences, c'est jusqu'à 2 450 couples à examiner.
 * Aucun enseignant ne le fera à la main, et sans ce graphe LEARNOS ne peut
 * pas dire « c'est ça qui bloque le reste ».
 *
 * Le modèle propose donc des arêtes. Il n'en écrit **aucune** :
 *
 *   - sa sortie est filtrée contre les compétences réellement existantes ;
 *   - toute arête qui créerait un cycle, se référencerait elle-même, ou
 *     remonterait le temps du programme est écartée **avec son motif** ;
 *   - ce qui survit est présenté à l'enseignant, qui accepte ou refuse.
 *
 * Un prérequis erroné n'est pas anodin : il déclare des élèves « bloqués » à
 * tort et déclenche des parcours de remédiation inutiles. D'où le refus
 * systématique d'écrire sans validation humaine.
 *
 * L'ÉCART EST L'INFORMATION
 * -------------------------
 * Les motifs d'écartement ne sont pas du journal technique : ils disent à
 * l'enseignant *pourquoi* une liaison plausible a été refusée — souvent parce
 * que l'ordre des chapitres ne correspond pas à ce que le modèle a supposé.
 * C'est parfois le programme qu'il faut corriger, pas la proposition.
 */

import prisma from "@/lib/prisma";
import { routeAi } from "@/lib/ai/router";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

/** Au-delà, le prompt devient trop long et la qualité chute. */
export const COMPETENCES_MAX = 60;

/** Motifs d'écartement — l'enseignant doit pouvoir juger sur pièces. */
export type MotifEcart =
  | "codeInconnu"
  | "autoReference"
  | "dejaExistant"
  | "cycle"
  | "ordreInverse";

export interface AreteProposee {
  competenceId: string;
  competenceCode: string;
  competenceLibelle: string;
  prerequisId: string;
  prerequisCode: string;
  prerequisLibelle: string;
  /** Justification du modèle, en clair. Jamais interprétée, seulement affichée. */
  justification: string;
}

export interface AreteEcartee {
  competenceCode: string;
  prerequisCode: string;
  motif: MotifEcart;
}

export interface PropositionPrerequis {
  proposees: AreteProposee[];
  ecartees: AreteEcartee[];
  /** Modèle sollicité — pour l'explicabilité a posteriori. */
  modele: string | null;
}

interface Noeud {
  id: string;
  code: string;
  libelle: string;
  /** Rang dans le programme : chapitre puis position dans le chapitre. */
  rang: number;
  chapitre: string;
  prerequis: Set<string>;
}

/**
 * Extrait un tableau JSON d'une réponse de modèle.
 *
 * Les petits modèles encadrent volontiers leur JSON de texte ou de balises
 * ```json. Échouer là-dessus reviendrait à jeter une réponse correcte pour un
 * défaut de présentation.
 */
export function extraireJson(brut: string | null): unknown[] {
  if (!brut) return [];
  const debut = brut.indexOf("[");
  const fin = brut.lastIndexOf("]");
  if (debut === -1 || fin <= debut) return [];
  try {
    const parse = JSON.parse(brut.slice(debut, fin + 1));
    return Array.isArray(parse) ? parse : [];
  } catch {
    return [];
  }
}

/**
 * Valide un lot d'arêtes proposées contre le graphe existant.
 *
 * Fonction pure — c'est elle qui porte les garde-fous, et c'est elle qu'on
 * teste. Les arêtes acceptées sont ajoutées au graphe au fur et à mesure :
 * deux propositions qui, ensemble seulement, formeraient un cycle doivent
 * être détectées.
 */
export function validerAretes(
  noeuds: Map<string, Noeud>,
  parCode: Map<string, Noeud>,
  brutes: { competence: string; prerequis: string; justification?: string }[]
): { proposees: AreteProposee[]; ecartees: AreteEcartee[] } {
  const proposees: AreteProposee[] = [];
  const ecartees: AreteEcartee[] = [];

  // Copie de travail : on y ajoute les arêtes retenues, pour que la détection
  // de cycle tienne compte du lot en cours.
  const arcs = new Map<string, Set<string>>();
  for (const n of noeuds.values()) arcs.set(n.id, new Set(n.prerequis));

  const ecarter = (competenceCode: string, prerequisCode: string, motif: MotifEcart) =>
    ecartees.push({ competenceCode, prerequisCode, motif });

  for (const brute of brutes) {
    const codeA = String(brute.competence ?? "").trim().toUpperCase();
    const codeB = String(brute.prerequis ?? "").trim().toUpperCase();

    const cible = parCode.get(codeA);
    const source = parCode.get(codeB);

    // Un code inventé est le défaut le plus fréquent des petits modèles.
    if (!cible || !source) {
      ecarter(codeA, codeB, "codeInconnu");
      continue;
    }
    if (cible.id === source.id) {
      ecarter(codeA, codeB, "autoReference");
      continue;
    }
    if (arcs.get(cible.id)?.has(source.id)) {
      ecarter(codeA, codeB, "dejaExistant");
      continue;
    }
    // Une compétence ne peut pas exiger ce qui sera enseigné plus tard : la
    // retenir déclarerait toute la classe bloquée dès la rentrée.
    if (source.rang >= cible.rang) {
      ecarter(codeA, codeB, "ordreInverse");
      continue;
    }
    if (creeUnCycle(arcs, cible.id, source.id)) {
      ecarter(codeA, codeB, "cycle");
      continue;
    }

    arcs.get(cible.id)!.add(source.id);
    proposees.push({
      competenceId: cible.id,
      competenceCode: cible.code,
      competenceLibelle: cible.libelle,
      prerequisId: source.id,
      prerequisCode: source.code,
      prerequisLibelle: source.libelle,
      justification: String(brute.justification ?? "").slice(0, 300),
    });
  }

  return { proposees, ecartees };
}

/** Ajouter `source` aux prérequis de `cible` rendrait-il le graphe cyclique ? */
function creeUnCycle(
  arcs: Map<string, Set<string>>,
  cible: string,
  source: string
): boolean {
  // On remonte les prérequis depuis `source` : si l'on retombe sur `cible`,
  // l'arête fermerait la boucle.
  const vus = new Set<string>();
  const pile = [source];
  while (pile.length > 0) {
    const courant = pile.pop()!;
    if (courant === cible) return true;
    if (vus.has(courant)) continue;
    vus.add(courant);
    for (const suivant of arcs.get(courant) ?? []) pile.push(suivant);
  }
  return false;
}

/** Charge le graphe d'une matière, ordonné comme le programme. */
export async function chargerGraphe(
  tenantId: string,
  matiereId: string,
  claims: SessionSiteClaims
): Promise<{ noeuds: Map<string, Noeud>; parCode: Map<string, Noeud> }> {
  const chapitres = await prisma.chapitre.findMany({
    where: { tenantId, matiereId, ...siteFilterForModel("chapitre", claims) },
    orderBy: { ordre: "asc" },
    select: {
      nom: true,
      ordre: true,
      competences: {
        orderBy: { ordre: "asc" },
        select: {
          id: true,
          code: true,
          libelle: true,
          prerequis: { select: { id: true } },
        },
      },
    },
  });

  const noeuds = new Map<string, Noeud>();
  const parCode = new Map<string, Noeud>();
  let rang = 0;

  for (const chapitre of chapitres) {
    for (const c of chapitre.competences) {
      const noeud: Noeud = {
        id: c.id,
        code: c.code,
        libelle: c.libelle,
        // Rang global et non `ordre` local : deux compétences de chapitres
        // différents doivent être comparables entre elles.
        rang: rang++,
        chapitre: chapitre.nom,
        prerequis: new Set(c.prerequis.map((p) => p.id)),
      };
      noeuds.set(noeud.id, noeud);
      parCode.set(noeud.code.toUpperCase(), noeud);
    }
  }

  return { noeuds, parCode };
}

/**
 * Demande au modèle de proposer les liaisons manquantes d'une matière.
 *
 * Ne modifie **rien** : la fonction retourne des propositions. L'écriture
 * passe par la route d'édition habituelle, une fois l'enseignant décidé.
 */
export async function proposerPrerequis(
  tenantId: string,
  matiereId: string,
  claims: SessionSiteClaims,
  siteId?: string | null
): Promise<PropositionPrerequis> {
  const { noeuds, parCode } = await chargerGraphe(tenantId, matiereId, claims);

  if (noeuds.size < 2) {
    // Rien à relier : le dire plutôt que d'appeler un modèle pour rien.
    return { proposees: [], ecartees: [], modele: null };
  }

  const liste = [...noeuds.values()]
    .slice(0, COMPETENCES_MAX)
    .map((n) => `${n.code} | ${n.chapitre} | ${n.libelle}`)
    .join("\n");

  const existantes = [...noeuds.values()]
    .flatMap((n) =>
      [...n.prerequis]
        .map((p) => noeuds.get(p))
        .filter((p): p is Noeud => Boolean(p))
        .map((p) => `${n.code} ← ${p.code}`)
    )
    .join("\n");

  const resultat = await routeAi(
    {
      complexity: "complex",
      promptVersion: "prerequis-v1",
      action: "curriculum.prerequis.propose",
      tenantId,
      siteId,
      inputRef: matiereId,
    },
    [
      {
        role: "system",
        content:
          "Tu aides un enseignant à relier les compétences d'un programme. " +
          "Pour chaque compétence qui en exige une autre pour être acquise, " +
          "propose une liaison.\n" +
          "Règles strictes :\n" +
          "- N'utilise QUE les codes fournis. N'invente aucun code.\n" +
          "- Le prérequis doit être enseigné AVANT la compétence.\n" +
          "- Ne propose une liaison que si elle est nécessaire, pas si elle " +
          "est seulement voisine par le thème.\n" +
          "Réponds uniquement par un tableau JSON de la forme " +
          '[{"competence":"CODE","prerequis":"CODE","justification":"une phrase courte"}]. ' +
          "Aucun texte hors du tableau.",
      },
      {
        role: "user",
        content:
          `Compétences (code | chapitre | libellé), dans l'ordre du programme :\n${liste}` +
          (existantes ? `\n\nLiaisons déjà déclarées :\n${existantes}` : "") +
          "\n\nPropose les liaisons manquantes.",
      },
    ],
    { temperature: 0.2, maxTokens: 1200 }
  );

  const brutes = extraireJson(resultat.content).filter(
    (x): x is { competence: string; prerequis: string; justification?: string } =>
      typeof x === "object" && x !== null && "competence" in x && "prerequis" in x
  );

  return {
    ...validerAretes(noeuds, parCode, brutes),
    modele: resultat.meta.modelName,
  };
}

/**
 * Applique les arêtes retenues par l'enseignant.
 *
 * REVALIDE TOUT, SANS EXCEPTION
 * Les propositions ont transité par le navigateur : ce qui revient n'est plus
 * ce qui est parti. On recharge le graphe et on repasse chaque arête par les
 * mêmes filtres — un client modifié ne doit pas pouvoir injecter un cycle que
 * le moteur de recommandation parcourrait indéfiniment.
 *
 * `connect` et non `set` : on **ajoute** des prérequis, on ne remplace pas la
 * liste. Un `set` effacerait les liaisons déclarées à la main.
 */
export async function appliquerAretes(
  tenantId: string,
  matiereId: string,
  claims: SessionSiteClaims,
  aretes: { competence: string; prerequis: string }[]
): Promise<{ appliquees: number; ecartees: AreteEcartee[] }> {
  const { noeuds, parCode } = await chargerGraphe(tenantId, matiereId, claims);
  const { proposees, ecartees } = validerAretes(
    noeuds,
    parCode,
    aretes.map((a) => ({ ...a, justification: "" }))
  );

  // Regroupées par compétence : une écriture par compétence plutôt qu'une par
  // arête. À ~192 ms l'aller-retour, la différence est visible à l'écran.
  const parCompetence = new Map<string, string[]>();
  for (const a of proposees) {
    if (!parCompetence.has(a.competenceId)) parCompetence.set(a.competenceId, []);
    parCompetence.get(a.competenceId)!.push(a.prerequisId);
  }

  // Contrôle d'appartenance en UN aller-retour plutôt qu'un par compétence :
  // `update` ne sait pas exprimer `tenantId` dans son `where`, et à ~192 ms
  // l'aller-retour, un contrôle par compétence rendrait l'écran poussif.
  const autorisees = await prisma.competence.findMany({
    where: {
      id: { in: [...parCompetence.keys()] },
      tenantId,
      ...siteFilterForModel("competence", claims),
    },
    select: { id: true },
  });
  const idsAutorises = new Set(autorisees.map((c) => c.id));

  let appliquees = 0;
  for (const [competenceId, prerequisIds] of parCompetence) {
    if (!idsAutorises.has(competenceId)) continue;
    await prisma.competence.update({
      where: { id: competenceId },
      data: { prerequis: { connect: prerequisIds.map((id) => ({ id })) } },
    });
    appliquees += prerequisIds.length;
  }

  return { appliquees, ecartees };
}
