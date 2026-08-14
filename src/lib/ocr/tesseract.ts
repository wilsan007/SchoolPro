/**
 * EcolPro / LEARNOS — OCR local (Tesseract)
 * =========================================
 *
 * Lit les documents **imprimés** : programmes officiels photocopiés puis
 * scannés, énoncés tapés à la machine ou à l'ordinateur.
 *
 * POURQUOI CE MOTEUR-LÀ POUR CE CAS-LÀ
 * ------------------------------------
 * Tesseract tourne en local, gratuitement, sans quota et sans qu'aucune page ne
 * quitte l'établissement. Sur de l'imprimé, il fait le travail. Sur de
 * l'écriture manuscrite, il ne le fait pas — et ce n'est pas une question de
 * réglage : il a été entraîné sur des caractères typographiques. C'est pourquoi
 * les copies d'élèves passent par un modèle de vision (`vision.ts`), et pourquoi
 * l'aiguillage entre les deux est explicite (`index.ts`) plutôt que deviné.
 *
 * DEUX POINTS D'INSTALLATION À CONNAÎTRE
 * -------------------------------------
 * **Les données de langue se téléchargent au premier appel** (`fra.traineddata`,
 * ~1,4 Mo) depuis tessdata.projectnaptha.com, puis sont mises en cache dans
 * `OCR_CACHE_PATH`. Un établissement hors ligne renseigne `OCR_LANG_PATH` vers
 * un dossier contenant le fichier — sans quoi le premier scan échoue là où tout
 * le reste fonctionne.
 *
 * **Le cache doit être inscriptible.** En serverless, le système de fichiers est
 * en lecture seule sauf `/tmp` : c'est la valeur par défaut retenue ici. Laisser
 * la valeur par défaut de la bibliothèque (le répertoire courant) produirait une
 * erreur d'écriture à chaque appel.
 */

import { tmpdir } from "node:os";
import { createWorker, type Worker } from "tesseract.js";
import { preparerPourTesseract } from "@/lib/ocr/pages";

/** Langues reconnues. Plusieurs se cumulent : `"fra+ara"`. */
const LANGUES = process.env.OCR_LANGUES ?? "fra";

/**
 * En deçà de cette confiance moyenne, la lecture n'est pas exploitable.
 *
 * Tesseract rend une confiance par page (0–100). Sur un scan penché, taché ou
 * trop clair, elle s'effondre — et le texte produit est un mélange de mots
 * plausibles et de bouillie. Le seuil ne sert pas à masquer l'échec : il sert à
 * le **déclarer**, pour que l'appelant tente le modèle de vision ou dise
 * clairement à l'enseignant que ce document-là n'est pas lisible.
 */
export const CONFIANCE_MINIMALE = 0.55;

/** Le moteur local est-il utilisable ? `OCR_TESSERACT=off` le désactive. */
export function tesseractDisponible(): boolean {
  return process.env.OCR_TESSERACT !== "off";
}

export interface LectureTesseract {
  texte: string;
  /** Confiance moyenne 0..1, pondérée par la quantité de texte de chaque page. */
  confiance: number;
  pagesLues: number;
}

async function ouvrirWorker(): Promise<Worker> {
  return createWorker(LANGUES, 1, {
    cachePath: process.env.OCR_CACHE_PATH ?? tmpdir(),
    // `langPath` n'est passé que s'il est configuré : la bibliothèque retombe
    // sinon sur son CDN, et lui transmettre `undefined` désactiverait ce repli.
    ...(process.env.OCR_LANG_PATH ? { langPath: process.env.OCR_LANG_PATH } : {}),
  });
}

/**
 * Lit une suite d'images imprimées.
 *
 * Un seul worker pour toutes les pages : son démarrage (chargement du WASM et
 * des données de langue) coûte plus cher que la reconnaissance elle-même. Il est
 * terminé dans un `finally` — un worker laissé vivant retient un thread et de la
 * mémoire pour toute la durée de vie du processus.
 */
export async function lireImprime(images: Uint8Array[]): Promise<LectureTesseract> {
  if (images.length === 0) return { texte: "", confiance: 0, pagesLues: 0 };

  const worker = await ouvrirWorker();
  try {
    const pages: { texte: string; confiance: number }[] = [];

    for (const image of images) {
      const prete = await preparerPourTesseract(image);
      const { data } = await worker.recognize(prete);
      pages.push({
        texte: (data.text ?? "").trim(),
        confiance: Math.min(1, Math.max(0, (data.confidence ?? 0) / 100)),
      });
    }

    // Pondération par la longueur : une page de garde presque vide, reconnue
    // avec 30 % de confiance, ne doit pas faire chuter la moyenne d'un document
    // de huit pages par ailleurs bien lues.
    const total = pages.reduce((n, p) => n + p.texte.length, 0);
    const confiance =
      total > 0
        ? pages.reduce((n, p) => n + p.confiance * p.texte.length, 0) / total
        : 0;

    return {
      texte: pages.map((p) => p.texte).join("\n"),
      confiance,
      pagesLues: pages.length,
    };
  } finally {
    await worker.terminate().catch(() => {});
  }
}
