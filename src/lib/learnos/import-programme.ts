/**
 * EcolPro / LEARNOS — Import d'un programme officiel
 * ===================================================
 *
 * DEUX OPÉRATIONS QU'IL NE FAUT PAS CONFONDRE
 * -------------------------------------------
 * **Lire et découper.** Les chapitres sont écrits noir sur blanc dans le
 * document du ministère. Le modèle les transcrit et les structure : la réponse
 * est dans le texte, il n'a rien à inventer. C'est la tâche où il est le plus
 * fiable.
 *
 * **Déduire les compétences.** La plupart des programmes listent des
 * *contenus* (« Les fractions »), pas des *compétences* (« additionner deux
 * fractions de dénominateurs différents »). Passer de l'un à l'autre est une
 * inférence — et c'est là que le modèle fabulera.
 *
 * D'où le champ `origine` sur chaque élément : `"lu"` quand le libellé vient
 * du document (avec l'extrait à l'appui), `"deduit"` quand le modèle l'a
 * proposé. L'écran les distingue visuellement. Sans cette séparation, tout
 * l'import devient suspect et l'enseignant refait le travail à la main.
 *
 * CE QUI N'EST PAS DÉLÉGUÉ
 * ------------------------
 * L'ordre des chapitres **dans l'année** ne se déduit pas d'un PDF : il dépend
 * du calendrier de l'établissement, des vacances et du jugement de
 * l'enseignant. C'est l'écran de planification qui s'en charge. De même,
 * déclarer une compétence bloquante relève de l'enseignant : cette marque
 * déclenche des parcours de remédiation.
 */

import { extractText, getDocumentProxy } from "unpdf";
import { routeAi } from "@/lib/ai/router";

/** Au-delà, le prompt dépasse ce que les modèles gratuits traitent bien. */
export const CARACTERES_MAX = 12_000;

/** En deçà, le PDF est presque certainement une image scannée. */
const CARACTERES_MIN_PAR_PAGE = 80;

export type Origine = "lu" | "deduit";

export interface CompetenceImportee {
  code: string;
  libelle: string;
  origine: Origine;
  /** Extrait du document qui justifie le libellé. Vide si `deduit`. */
  extrait: string;
}

export interface ChapitreImporte {
  nom: string;
  niveau: string;
  origine: Origine;
  extrait: string;
  competences: CompetenceImportee[];
}

export interface AnalyseProgramme {
  chapitres: ChapitreImporte[];
  modele: string | null;
  /** Nombre de caractères réellement soumis au modèle. */
  caracteresAnalyses: number;
  /** `true` quand au moins une tranche n'a pas pu être analysée. */
  tronque: boolean;
  /** Nombre de tranches analysées (1 si le document tenait en une seule fois). */
  tranches: number;
}

/** Le document est-il exploitable, et sinon pourquoi ? */
export type EtatTexte =
  | { exploitable: true; texte: string; pages: number }
  | { exploitable: false; motif: "vide" | "scanne"; pages: number };

/**
 * Extrait le texte d'un PDF.
 *
 * POURQUOI CE DIAGNOSTIC EXISTE
 * Un PDF scanné — cas fréquent des documents ministériels — ne contient
 * aucun texte, seulement des images. `extractText` renvoie alors une chaîne
 * quasi vide, et sans ce contrôle l'utilisateur verrait « aucun chapitre
 * trouvé », conclurait que la fonction ne marche pas, et n'aurait aucun moyen
 * de comprendre pourquoi. Mieux vaut dire « ce document est un scan ».
 */
export async function lirePdf(donnees: Uint8Array): Promise<EtatTexte> {
  const document = await getDocumentProxy(donnees);
  const pages = document.numPages;
  const { text } = await extractText(document, { mergePages: true });
  const texte = (Array.isArray(text) ? text.join("\n") : text).trim();

  if (texte.length === 0) return { exploitable: false, motif: "vide", pages };
  if (texte.length < pages * CARACTERES_MIN_PAR_PAGE) {
    return { exploitable: false, motif: "scanne", pages };
  }
  return { exploitable: true, texte, pages };
}

/**
 * Nettoie un texte de programme avant analyse.
 *
 * Les en-têtes, pieds de page et numéros répétés à chaque page occupent une
 * part notable du budget de caractères sans rien apporter — et le modèle les
 * prend parfois pour des titres de chapitre.
 */
export function nettoyerTexte(brut: string): string {
  const lignes = brut
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);

  // Une ligne courte répétée plus de trois fois est un en-tête ou un pied de
  // page, pas un contenu.
  const occurrences = new Map<string, number>();
  for (const l of lignes) {
    if (l.length <= 60) occurrences.set(l, (occurrences.get(l) ?? 0) + 1);
  }

  return lignes
    .filter((l) => {
      if (/^\d+$/.test(l)) return false; // numéro de page isolé
      return (occurrences.get(l) ?? 0) <= 3;
    })
    .join("\n");
}

/** Codes valides : lettres, chiffres et tirets, en majuscules. */
function normaliserCode(brut: string, repli: string): string {
  const code = String(brut ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 20);
  return code.length >= 2 ? code : repli;
}

/** Forme comparable d'un texte : sans casse, accents ni ponctuation. */
function forme(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Longueur en deçà de laquelle une correspondance ne prouve rien. */
const LONGUEUR_MIN_CITATION = 12;

/** Document préparé pour la recherche de citations. */
export interface Source {
  lignes: { brute: string; forme: string }[];
  global: string;
}

export function preparerSource(texte: string): Source {
  const lignes = texte
    .split("\n")
    .map((brute) => ({ brute: brute.trim(), forme: forme(brute) }))
    .filter((l) => l.brute.length > 0);
  return { lignes, global: lignes.map((l) => l.forme).join(" \n ") };
}

/**
 * Établit l'origine d'un libellé — et c'est ici que se joue la confiance dans
 * tout l'import.
 *
 * POURQUOI ON NE DEMANDE PLUS RIEN AU MODÈLE
 * Mesuré sur un programme réel, avec deux modèles :
 *
 *   - llama3.2:3b a marqué « deduit » une phrase présente mot pour mot, et
 *     « lu » deux reformulations de son cru ;
 *   - llama-3.1-8b-instant, meilleur sur le fond, n'a produit aucun extrait
 *     exploitable.
 *
 * Autrement dit : l'étiquette du modèle ne vaut rien, dans un sens comme dans
 * l'autre. On ne la lui demande donc plus. On **cherche le libellé dans le
 * document** : s'il y figure, c'est une citation, et l'extrait est la ligne
 * qui la contient. Sinon c'est une déduction.
 *
 * L'origine cesse d'être une prétention du modèle pour devenir un fait établi
 * par l'application — et aucun prompt ne peut la contourner.
 *
 * La comparaison ignore casse, accents et ponctuation : les programmes
 * djiboutiens circulent souvent sans accents, et exiger l'exactitude
 * typographique rétrograderait des citations authentiques.
 */
export function attribuerOrigine(
  libelle: string,
  source: Source
): { origine: Origine; extrait: string } {
  const recherche = forme(libelle);
  if (recherche.length < LONGUEUR_MIN_CITATION) {
    return { origine: "deduit", extrait: "" };
  }
  if (!source.global.includes(recherche)) {
    return { origine: "deduit", extrait: "" };
  }

  const ligne = source.lignes.find((l) => l.forme.includes(recherche));
  return { origine: "lu", extrait: (ligne?.brute ?? "").slice(0, 300) };
}

/**
 * Met en forme la sortie brute du modèle.
 *
 * Fonction pure — c'est elle qui porte les garanties, et c'est elle qu'on
 * teste. Toute valeur douteuse retombe sur `deduit` : classer par excès une
 * déduction comme telle ne coûte qu'une vérification de plus, alors que
 * l'inverse ferait passer une invention pour une citation.
 */
export function normaliserStructure(
  brutes: unknown[],
  niveauParDefaut: string,
  prefixeCode: string,
  /** Texte réellement soumis : c'est lui qui établit les citations. */
  source: string
): ChapitreImporte[] {
  const prepare = preparerSource(source);
  const chapitres: ChapitreImporte[] = [];
  const codesVus = new Set<string>();
  let compteur = 1;

  for (const brut of brutes) {
    if (typeof brut !== "object" || brut === null) continue;
    const o = brut as Record<string, unknown>;

    const nom = String(o.nom ?? "").trim().slice(0, 200);
    if (!nom) continue;

    const competences: CompetenceImportee[] = [];
    for (const c of Array.isArray(o.competences) ? o.competences : []) {
      if (typeof c !== "object" || c === null) continue;
      const co = c as Record<string, unknown>;
      const libelle = String(co.libelle ?? "").trim().slice(0, 300);
      if (!libelle) continue;

      // Un code en double casserait la contrainte d'unicité à l'écriture :
      // on suffixe plutôt que de laisser échouer l'import entier.
      let code = normaliserCode(String(co.code ?? ""), `${prefixeCode}-${compteur}`);
      while (codesVus.has(code)) code = `${code}-${compteur}`;
      codesVus.add(code);
      compteur++;

      competences.push({ code, libelle, ...attribuerOrigine(libelle, prepare) });
    }

    chapitres.push({
      nom,
      niveau: String(o.niveau ?? "").trim().slice(0, 50) || niveauParDefaut,
      ...attribuerOrigine(nom, prepare),
      competences,
    });
  }

  return chapitres;
}

/** Extrait un tableau JSON d'une réponse bavarde. */
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
 * Découpe un texte en tranches analysables par un modèle.
 *
 * Un programme de 80 pages dépasse largement ce qu'un modèle gratuit traite en
 * une seule fois (CARACTERES_MAX). Sans découpage, l'import ne voit que le
 * début du document — le sommaire et le premier chapitre — et l'enseignant se
 * retrouve avec deux chapitres sur quatorze.
 *
 * Le chevauchement évite de perdre un titre de chapitre à la frontière de deux
 * tranches : le modèle le voit dans les deux, et la fusion dédoublonne.
 *
 * La coupe se fait sur une limite de ligne : couper au milieu d'une phrase
 * ferait inventer au modèle un chapitre à partir d'un demi-énoncé.
 */
export function decouperEnTranches(
  texte: string,
  tailleMax: number,
  chevauchement = 1000
): string[] {
  if (texte.length <= tailleMax) return [texte];

  const tranches: string[] = [];
  let debut = 0;

  while (debut < texte.length) {
    let fin = Math.min(debut + tailleMax, texte.length);

    if (fin < texte.length) {
      const limiteLigne = texte.lastIndexOf("\n", fin);
      // Inclure le séparateur de ligne dans la tranche : une coupe après le
      // "\n" est propre, une coupe avant laisserait une ligne amputée.
      if (limiteLigne > debut) fin = limiteLigne + 1;
    }

    tranches.push(texte.slice(debut, fin));
    if (fin >= texte.length) break;

    // La prochaine tranche démarre dans le chevauchement : un titre coupé à la
    // frontière reste visible des deux côtés. Mais si la tranche est plus
    // courte que le chevauchement (ligne très longue coupée par la limite),
    // reculer ferait boucler : on avance sans chevauchement dans ce cas.
    const prochainDebut = fin - chevauchement;
    debut = prochainDebut > debut ? prochainDebut : fin;
  }

  return tranches;
}

/**
 * Fusionne les chapitres issus de plusieurs tranches.
 *
 * Un chapitre peut apparaître dans deux tranches chevauchantes : la fusion
 * dédoublonne par nom normalisé et merge les compétences par libellé
 * normalisé. Si une tranche a marqué le chapitre « lu » (présent dans le
 * texte) et l'autre « déduit », c'est « lu » qui l'emporte — c'est la vérité.
 */
export function fusionnerChapitres(chapitres: ChapitreImporte[]): ChapitreImporte[] {
  const parCle = new Map<string, ChapitreImporte>();

  for (const chap of chapitres) {
    const cle = cleChapitre(chap.nom, chap.niveau);
    const existant = parCle.get(cle);
    if (!existant) {
      parCle.set(cle, { ...chap, competences: [...chap.competences] });
      continue;
    }

    const libellesVus = new Set(existant.competences.map((c) => forme(c.libelle)));
    for (const comp of chap.competences) {
      const f = forme(comp.libelle);
      if (f.length < LONGUEUR_MIN_CITATION) {
        // Trop court pour dédoublonner fiablement : on garde si le libellé
        // exact n'y est pas déjà.
        if (!existant.competences.some((c) => c.libelle === comp.libelle)) {
          existant.competences.push(comp);
        }
        continue;
      }
      if (!libellesVus.has(f)) {
        libellesVus.add(f);
        existant.competences.push(comp);
      }
    }

    if (chap.origine === "lu" && existant.origine === "deduit") {
      existant.origine = "lu";
      existant.extrait = chap.extrait;
    }
  }

  return [...parCle.values()];
}

/**
 * Analyse un texte de programme et propose une structure.
 *
 * N'écrit rien. Le résultat est une proposition, revue puis appliquée par
 * l'enseignant.
 *
 * AU-DELÀ DE LA LIMITE D'UN SEUL APPEL
 * ------------------------------------
 * Un document plus long que `CARACTERES_MAX` est découpé en tranches
 * analysées séparément, puis fusionné. Chaque tranche coûte un appel de modèle
 * — mais le cache (24 h) rend les réanalyses gratuites, et le validateur de
 * sortie (voir `routeAi`) fait basculer vers un fournisseur plus capable quand
 * le moins cher répond hors format.
 */
export async function analyserProgramme(
  texte: string,
  contexte: {
    tenantId: string;
    siteId?: string | null;
    matiereNom: string;
    matiereCode: string;
    niveau: string;
  }
): Promise<AnalyseProgramme> {
  const propre = nettoyerTexte(texte);
  const tranches = decouperEnTranches(propre, CARACTERES_MAX);
  const prefixe = contexte.matiereCode.toUpperCase().slice(0, 8);

  let tousChapitres: ChapitreImporte[] = [];
  let modele: string | null = null;
  let caracteresAnalyses = 0;
  let tranchesReussies = 0;

  for (const tranche of tranches) {
    try {
      const resultat = await routeAi(
        {
          complexity: "complex",
          promptVersion: "import-programme-v2",
          action: "curriculum.programme.import",
          tenantId: contexte.tenantId,
          siteId: contexte.siteId,
        },
        [
          {
            role: "system",
            // L'origine n'est PAS demandée : l'application l'établit elle-même
            // en cherchant chaque libellé dans le document (voir
            // `attribuerOrigine`). La consigne « reprends les termes du
            // document » sert donc directement la traçabilité : plus le
            // libellé colle au texte, plus il sera reconnu comme cité.
            content:
              "Tu découpes un programme scolaire officiel en chapitres, et tu " +
              "listes les compétences de chaque chapitre.\n" +
              "- Respecte le découpage en chapitres du document. Ne fusionne " +
              "jamais plusieurs chapitres en un seul.\n" +
              "- Une COMPÉTENCE décrit ce que l'élève sait FAIRE : elle " +
              "commence par un verbe d'action (résoudre, calculer, " +
              "identifier, rédiger…).\n" +
              "- Reprends autant que possible les termes exacts du document " +
              "plutôt que de reformuler.\n" +
              "- N'ajoute aucune compétence qui ne découle pas du texte " +
              "fourni.\n" +
              "Réponds uniquement par un tableau JSON :\n" +
              '[{"nom":"…","niveau":"…","competences":[{"code":"…","libelle":"…"}]}]',
          },
          {
            role: "user",
            // Le document est délimité explicitement : sans ces bornes, un
            // modèle a pris la ligne « Matière : … » pour un titre de chapitre
            // et a fusionné tout le programme sous ce nom. Le code de la
            // matière n'est pas transmis — il ne sert qu'à fabriquer des codes
            // de repli côté serveur, et le modèle s'en emparait comme d'un
            // contenu.
            content:
              `Matière : ${contexte.matiereNom}\nNiveau : ${contexte.niveau}\n\n` +
              `--- DÉBUT DU DOCUMENT ---\n${tranche}\n--- FIN DU DOCUMENT ---\n\n` +
              "Découpe CE DOCUMENT en chapitres. Les noms de chapitres doivent " +
              "provenir du document lui-même, jamais des deux lignes de " +
              "contexte ci-dessus.",
          },
        ],
        {
          temperature: 0.1,
          maxTokens: 3000,
          // Le validateur fait basculer vers un fournisseur plus capable quand
          // le moins cher répond en prose au lieu du JSON demandé. Sans cela,
          // un petit modèle local renvoie un tableau vide et l'enseignant voit
          // « aucun chapitre trouvé » sans explication.
          validate: (res) => extraireJson(res.content).length > 0,
        }
      );

      const chapitresTranche = normaliserStructure(
        extraireJson(resultat.content),
        contexte.niveau,
        prefixe,
        // La tranche, et non le document entier : le modèle n'a pu citer que
        // ce qu'il a reçu.
        tranche
      );

      tousChapitres = tousChapitres.concat(chapitresTranche);
      modele = resultat.meta.modelName;
      caracteresAnalyses += tranche.length;
      tranchesReussies++;
    } catch {
      // Une tranche qui échoue (tous fournisseurs en panne) ne doit pas faire
      // échouer l'import entier : on perd quelques chapitres, pas tout le
      // programme. L'enseignant voit ce qui a été trouvé et peut compléter à
      // la main.
      continue;
    }
  }

  return {
    chapitres: fusionnerChapitres(tousChapitres),
    modele,
    caracteresAnalyses,
    tronque: tranchesReussies < tranches.length,
    tranches: tranches.length,
  };
}

/**
 * Écrit la structure retenue par l'enseignant.
 *
 * TROIS PRÉCAUTIONS
 * -----------------
 * **Les chapitres s'ajoutent, ils ne remplacent pas.** Un import ne doit
 * jamais effacer un chapitre saisi à la main : un enseignant qui réimporte un
 * programme corrigé perdrait tout son travail.
 *
 * **Un chapitre de même nom et même niveau est ignoré**, avec son motif. Le
 * réimport devient alors sans danger — c'est ce qui permet de corriger le PDF
 * et de recommencer.
 *
 * **Les codes de compétence sont uniques par tenant** (`@@unique([tenantId,
 * code])`). On résout les collisions avant d'écrire plutôt que de laisser la
 * base rejeter l'import entier à la trentième ligne.
 */
export interface ResultatImport {
  chapitresCrees: number;
  competencesCreees: number;
  ignores: { nom: string; motif: "chapitreExistant" | "sansCompetence" }[];
}

export async function appliquerImport(
  prismaClient: PrismaImport,
  tenantId: string,
  matiereId: string,
  siteId: string | null,
  chapitres: ChapitreImporte[]
): Promise<ResultatImport> {
  const existants = await prismaClient.chapitre.findMany({
    where: { tenantId, matiereId },
    select: { nom: true, niveau: true, ordre: true },
  });

  const dejaLa = new Set(existants.map((c) => cleChapitre(c.nom, c.niveau)));
  let prochainOrdre =
    existants.reduce((max, c) => Math.max(max, c.ordre), -1) + 1;

  const codesPris = new Set(
    (
      await prismaClient.competence.findMany({
        where: { tenantId },
        select: { code: true },
      })
    ).map((c) => c.code)
  );

  const ignores: ResultatImport["ignores"] = [];
  let chapitresCrees = 0;
  let competencesCreees = 0;

  for (const chapitre of chapitres) {
    const cle = cleChapitre(chapitre.nom, chapitre.niveau);
    if (dejaLa.has(cle)) {
      ignores.push({ nom: chapitre.nom, motif: "chapitreExistant" });
      continue;
    }
    // Un chapitre sans compétence n'apporte rien à LEARNOS : aucune preuve ne
    // pourra s'y rattacher, aucune recommandation n'en sortira.
    if (chapitre.competences.length === 0) {
      ignores.push({ nom: chapitre.nom, motif: "sansCompetence" });
      continue;
    }
    dejaLa.add(cle);

    const aCreer = chapitre.competences.map((c, i) => {
      let code = c.code;
      let suffixe = 2;
      while (codesPris.has(code)) code = `${c.code}-${suffixe++}`;
      codesPris.add(code);
      return { code, libelle: c.libelle, ordre: i };
    });

    await prismaClient.chapitre.create({
      data: {
        tenantId,
        siteId,
        matiereId,
        nom: chapitre.nom,
        niveau: chapitre.niveau,
        ordre: prochainOrdre++,
        competences: {
          create: aCreer.map((c) => ({
            tenantId,
            siteId,
            code: c.code,
            libelle: c.libelle,
            ordre: c.ordre,
          })),
        },
      },
    });

    chapitresCrees++;
    competencesCreees += aCreer.length;
  }

  return { chapitresCrees, competencesCreees, ignores };
}

/** Nom et niveau normalisés : « Les Fractions » et « les fractions » sont un doublon. */
function cleChapitre(nom: string, niveau: string): string {
  const propre = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  return `${propre(nom)}|${propre(niveau)}`;
}

/**
 * Sous-ensemble de Prisma dont l'import a besoin.
 *
 * Passé en paramètre plutôt qu'importé : le module reste testable sans base,
 * et l'appelant décide du client (requête ou tâche de fond).
 */
export interface PrismaImport {
  chapitre: {
    findMany(args: unknown): Promise<{ nom: string; niveau: string; ordre: number }[]>;
    create(args: unknown): Promise<unknown>;
  };
  competence: {
    findMany(args: unknown): Promise<{ code: string }[]>;
  };
}
