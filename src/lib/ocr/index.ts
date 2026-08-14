/**
 * EcolPro / LEARNOS — OCR : aiguillage entre les deux moteurs
 * ==========================================================
 *
 * Point d'entrée unique. L'appelant déclare la **nature** du document, pas le
 * moteur : c'est le seul choix qu'un enseignant puisse faire de façon fiable, et
 * la nature commande le reste.
 *
 *   `imprime`   → Tesseract, en local, gratuit, sans quota (programmes
 *                 officiels scannés, énoncés tapés).
 *   `manuscrit` → modèle de vision (copies, corrections au stylo, barèmes
 *                 annotés dans la marge).
 *
 * LE REPLI, ET SA LIMITE
 * ----------------------
 * Un document imprimé mal scanné fait chuter la confiance de Tesseract. Dans ce
 * cas seulement, on tente le modèle de vision : c'est un scan de mauvaise
 * qualité, pas un usage détourné. L'inverse n'existe pas — envoyer une copie
 * manuscrite à Tesseract ne produirait pas un mauvais résultat, mais du bruit
 * pris pour un résultat.
 *
 * ÉCHOUER EN LE DISANT
 * --------------------
 * Le `motif` d'échec est la raison d'être de ce module autant que le texte qu'il
 * rend. « Aucun moteur configuré », « document illisible » et « aucun chapitre
 * trouvé » appellent trois gestes différents de la part de l'enseignant. Les
 * confondre en une erreur générique est exactement ce qui fait conclure à une
 * panne et abandonner la fonction.
 */

import {
  PAGES_MAX_IMPRIME,
  PAGES_MAX_MANUSCRIT,
  imagesDuDocument,
} from "@/lib/ocr/pages";
import {
  CONFIANCE_MINIMALE,
  lireImprime,
  tesseractDisponible,
} from "@/lib/ocr/tesseract";
import { lireParVision, visionDisponible, type ContexteVision } from "@/lib/ocr/vision";
import { nettoyerTranscription } from "@/lib/ocr/texte";

export type NatureDocument = "imprime" | "manuscrit";
export type MoteurOcr = "tesseract" | "vision";

/** Pourquoi la lecture n'a rien donné. */
export type MotifEchecOcr =
  /** Aucun moteur n'est disponible pour cette nature de document. */
  | "aucun_moteur"
  /** Les moteurs ont tourné, mais n'ont rien tiré du document. */
  | "illisible";

export type ResultatOcr =
  | {
      lisible: true;
      texte: string;
      moteur: MoteurOcr;
      /**
       * Confiance 0..1, ou `null` quand le moteur n'en rend pas.
       *
       * `null` plutôt qu'une valeur par défaut : un modèle de vision ne mesure
       * pas sa propre fiabilité, et inventer 0,8 laisserait croire à une mesure.
       */
      confiance: number | null;
      pagesLues: number;
      pagesTotal: number;
      /** `true` si le document dépassait le plafond de pages. */
      tronque: boolean;
      /** Modèle employé, quand la lecture est passée par un modèle. */
      modele: string | null;
    }
  | {
      lisible: false;
      motif: MotifEchecOcr;
      pagesTotal: number;
      /** Moteurs réellement essayés — sert à expliquer l'échec. */
      moteursEssayes: MoteurOcr[];
    };

/**
 * Longueur en deçà de laquelle une lecture ne vaut pas la peine d'être rendue.
 *
 * Une page rendue en trois caractères n'est pas un document court : c'est un
 * échec de reconnaissance.
 */
const CARACTERES_MIN = 40;

export interface OptionsOcr {
  nature: NatureDocument;
  contexte: ContexteVision;
  /** Consigne propre au document, transmise au modèle de vision. */
  consigne?: string;
  pagesMax?: number;
}

/**
 * Lit un document (PDF ou image) et rend son texte.
 *
 * N'interprète pas et n'écrit rien : la suite du traitement appartient au
 * domaine appelant.
 */
export async function lireDocument(
  donnees: Uint8Array,
  options: OptionsOcr
): Promise<ResultatOcr> {
  const pagesMax =
    options.pagesMax ??
    (options.nature === "imprime" ? PAGES_MAX_IMPRIME : PAGES_MAX_MANUSCRIT);

  const { images, pagesTotal, tronque } = await imagesDuDocument(donnees, pagesMax);
  const moteursEssayes: MoteurOcr[] = [];

  if (options.nature === "imprime" && tesseractDisponible()) {
    moteursEssayes.push("tesseract");
    const local = await lireImprime(images);
    const exploitable =
      local.texte.length >= CARACTERES_MIN && local.confiance >= CONFIANCE_MINIMALE;

    if (exploitable) {
      return {
        lisible: true,
        texte: local.texte,
        moteur: "tesseract",
        confiance: local.confiance,
        pagesLues: local.pagesLues,
        pagesTotal,
        tronque,
        modele: null,
      };
    }
    // Sinon : on ne rend pas ce texte-là. Un texte à 40 % de confiance ressemble
    // à du français et n'en est pas ; le modèle qui le découperait en chapitres
    // produirait des libellés faux avec l'aplomb de libellés justes.
  }

  if (!visionDisponible()) {
    return {
      lisible: false,
      motif: moteursEssayes.length > 0 ? "illisible" : "aucun_moteur",
      pagesTotal,
      moteursEssayes,
    };
  }

  moteursEssayes.push("vision");
  const vision = await lireParVision(images, options.contexte, options.consigne);
  const texte = nettoyerTranscription(vision.texte);

  if (texte.length < CARACTERES_MIN) {
    return { lisible: false, motif: "illisible", pagesTotal, moteursEssayes };
  }

  return {
    lisible: true,
    texte,
    moteur: "vision",
    confiance: null,
    pagesLues: vision.pagesLues,
    pagesTotal,
    tronque,
    modele: vision.modele,
  };
}

export { PAGES_MAX_IMPRIME, PAGES_MAX_MANUSCRIT } from "@/lib/ocr/pages";
export { MARQUE_ILLISIBLE, nettoyerTranscription } from "@/lib/ocr/texte";
