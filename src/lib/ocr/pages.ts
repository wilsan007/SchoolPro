/**
 * EcolPro / LEARNOS — Préparation des images d'un document
 * ========================================================
 *
 * Étape commune aux deux OCR : ni Tesseract ni un modèle de vision ne lisent un
 * PDF. Il faut d'abord obtenir des images de pages, puis les préparer — et la
 * préparation n'est pas la même selon le lecteur :
 *
 *   - **Tesseract** veut du contraste et de la résolution. Niveaux de gris,
 *     égalisation, largeur généreuse : sur un scan gris de photocopie, ce
 *     traitement fait passer la reconnaissance de « inexploitable » à
 *     « relisible ».
 *   - **Un modèle de vision** facture et découpe l'image en tuiles. Au-delà
 *     d'environ 1 400 px de large, on paie davantage sans lire mieux ; en JPEG
 *     plutôt qu'en PNG, la requête tient dans un ordre de grandeur raisonnable.
 *
 * POURQUOI UN PLAFOND DE PAGES
 * ----------------------------
 * L'OCR tourne dans une fonction serverless, qui a une durée maximale. Tesseract
 * demande quelques secondes par page, un modèle de vision autant. Sans plafond,
 * un enseignant qui déposerait un programme de 80 pages obtiendrait un délai
 * dépassé — c'est-à-dire une erreur technique illisible — au lieu d'un résultat
 * partiel accompagné de « seules les N premières pages ont été lues ».
 */

import sharp from "sharp";
import { getDocumentProxy, renderPageAsImage } from "unpdf";

/**
 * Pages lues au plus, par nature de document.
 *
 * L'écart n'est pas arbitraire : un programme officiel est long mais ne coûte
 * que du temps machine local, alors qu'une copie manuscrite passe par un modèle
 * facturé à l'image. Une copie de plus de quatre pages est de toute façon un cas
 * de figure rare pour une feuille d'exercices.
 */
export const PAGES_MAX_IMPRIME = 8;
export const PAGES_MAX_MANUSCRIT = 4;

/** Rendu à 2× : à l'échelle 1, un scan à 72 dpi est illisible pour Tesseract. */
const ECHELLE_RENDU = 2;

/** Largeurs cibles. Voir l'en-tête pour l'écart entre les deux. */
const LARGEUR_TESSERACT = 2000;
const LARGEUR_VISION = 1400;

/**
 * Le fichier est-il un PDF ?
 *
 * Sur la signature, pas sur l'extension ni le type MIME annoncé par le
 * navigateur : un enseignant qui photographie une copie envoie un `.jpg` qu'on
 * doit traiter comme une image, et un `.pdf` renommé n'est pas un PDF.
 */
export function estPdf(donnees: Uint8Array): boolean {
  const entete = new TextDecoder().decode(donnees.subarray(0, 1024));
  return entete.includes("%PDF-");
}

/**
 * Convertit les pages d'un PDF en images PNG.
 *
 * @returns une image par page lue, dans l'ordre, et le nombre total de pages du
 *   document — qui peut dépasser le nombre d'images rendues (voir `pagesMax`).
 */
export async function rendrePages(
  donnees: Uint8Array,
  pagesMax: number
): Promise<{ images: Uint8Array[]; pagesTotal: number; tronque: boolean }> {
  // pdf.js **détache** le tampon qu'on lui confie : sans copie, l'appelant se
  // retrouverait avec un `Uint8Array` vide s'il voulait relire le fichier
  // ensuite (ce que fait précisément l'import de programme, qui tente d'abord
  // l'extraction de texte).
  const document = await getDocumentProxy(new Uint8Array(donnees));
  const pagesTotal = document.numPages;
  const aLire = Math.min(pagesTotal, pagesMax);

  const images: Uint8Array[] = [];
  for (let page = 1; page <= aLire; page++) {
    const rendu = await renderPageAsImage(document, page, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: ECHELLE_RENDU,
    });
    images.push(new Uint8Array(rendu));
  }

  return { images, pagesTotal, tronque: aLire < pagesTotal };
}

/**
 * Images d'un document, quel qu'il soit — PDF ou photo.
 *
 * Point d'entrée unique des deux moteurs : l'appelant n'a pas à savoir ce que
 * l'enseignant a déposé.
 */
export async function imagesDuDocument(
  donnees: Uint8Array,
  pagesMax: number
): Promise<{ images: Uint8Array[]; pagesTotal: number; tronque: boolean }> {
  if (estPdf(donnees)) return rendrePages(donnees, pagesMax);
  return { images: [donnees], pagesTotal: 1, tronque: false };
}

/**
 * Prépare une image pour Tesseract.
 *
 * `rotate()` sans argument applique l'orientation EXIF : une photo prise en
 * paysage arrive parfois couchée, et Tesseract ne lit pas le texte à 90°.
 */
export async function preparerPourTesseract(image: Uint8Array): Promise<Buffer> {
  return sharp(image)
    .rotate()
    .grayscale()
    .normalize()
    .resize({ width: LARGEUR_TESSERACT, withoutEnlargement: true })
    .png()
    .toBuffer();
}

/** Prépare une image pour un modèle de vision, en URL de données. */
export async function preparerPourVision(image: Uint8Array): Promise<string> {
  const jpeg = await sharp(image)
    .rotate()
    .resize({ width: LARGEUR_VISION, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}
