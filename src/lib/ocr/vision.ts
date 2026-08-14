/**
 * EcolPro / LEARNOS — OCR par modèle de vision
 * ============================================
 *
 * Lit ce que Tesseract ne sait pas lire : l'**écriture manuscrite**. C'est le cas
 * de tout ce qui compte ici — l'énoncé qu'un enseignant a écrit au stylo, la
 * copie de l'élève, et surtout les annotations de correction dans la marge
 * (« 3/5 », « 1,5 », « ✓ »).
 *
 * CE MODULE NE FAIT QUE TRANSCRIRE
 * --------------------------------
 * Il ne comprend pas, ne note pas, ne décide pas : il rend du texte. L'analyse
 * de ce texte (quels exercices, quelles notes, quel élève) est faite ailleurs,
 * par des fonctions pures et testables (`copies-papier.ts`). Cette séparation
 * n'est pas cosmétique : elle est ce qui permet de tester la validation d'une
 * notation sans appeler de modèle, et de rejouer une analyse sur une
 * transcription déjà obtenue sans repayer la lecture.
 *
 * UNE REQUÊTE PAR PAGE
 * --------------------
 * Les fournisseurs plafonnent le nombre d'images par message (cinq chez Groq,
 * une chez certains backends OpenRouter) et le dépassement se manifeste par une
 * page silencieusement ignorée — le pire des échecs, puisqu'il ressemble à une
 * page blanche. Une page par requête coûte le même nombre de jetons d'image et
 * reste correct partout.
 */

import { availableProviders, routeAi } from "@/lib/ai/router";
import { preparerPourVision } from "@/lib/ocr/pages";
import { MARQUE_ILLISIBLE } from "@/lib/ocr/texte";

/** Version du prompt de transcription — entre dans le cache et le journal. */
export const VERSION_PROMPT_VISION = "ocr-vision-v1";

const CONSIGNE_SYSTEME =
  "Tu transcris fidèlement le contenu d'une page scannée ou photographiée, " +
  "manuscrite ou imprimée.\n" +
  "- Rends UNIQUEMENT le texte de la page, dans l'ordre de lecture.\n" +
  "- Conserve les numéros d'exercice, les barèmes et les annotations de " +
  "correction (par exemple « 3/5 », « -1 », « 12,5/20 »), y compris celles " +
  `écrites dans la marge ou en rouge.\n` +
  `- N'invente RIEN. Écris ${MARQUE_ILLISIBLE} à la place de ce que tu ne ` +
  "déchiffres pas avec certitude.\n" +
  "- N'ajoute ni commentaire, ni titre, ni explication sur ce que tu vois.";

export interface ContexteVision {
  tenantId: string;
  siteId?: string | null;
  /** Action journalisée dans `AiDecisionLog`, ex. "copie.transcrire". */
  action: string;
  /** Entité concernée (feuilleId, matiereId…) pour remonter à la source. */
  inputRef?: string | null;
  actorId?: string | null;
}

/** Un modèle capable de lire des images est-il configuré ? */
export function visionDisponible(): boolean {
  return availableProviders(false, true).length > 0;
}

export interface LectureVision {
  texte: string;
  modele: string | null;
  pagesLues: number;
}

/**
 * Transcrit une suite d'images.
 *
 * @param consigne Précision propre au document (« cette page est une copie
 *   corrigée »), ajoutée à la consigne générale. Elle aide le modèle à savoir
 *   quoi ne pas omettre, sans jamais lui demander d'interpréter.
 */
export async function lireParVision(
  images: Uint8Array[],
  contexte: ContexteVision,
  consigne?: string
): Promise<LectureVision> {
  const pages: string[] = [];
  let modele: string | null = null;

  for (const [index, image] of images.entries()) {
    const url = await preparerPourVision(image);

    const resultat = await routeAi(
      {
        complexity: "complex",
        promptVersion: VERSION_PROMPT_VISION,
        action: contexte.action,
        tenantId: contexte.tenantId,
        siteId: contexte.siteId,
        inputRef: contexte.inputRef,
        actorId: contexte.actorId,
      },
      [
        { role: "system", content: CONSIGNE_SYSTEME },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Page ${index + 1} sur ${images.length}.` +
                (consigne ? `\n${consigne}` : ""),
            },
            { type: "image_url", image_url: { url } },
          ],
        },
      ],
      // Température nulle : une transcription n'a pas à varier d'un appel à
      // l'autre, et toute « créativité » ici est une erreur de lecture.
      { temperature: 0, maxTokens: 2000 }
    );

    pages.push((resultat.content ?? "").trim());
    modele = resultat.meta.modelName;
  }

  return { texte: pages.join("\n"), modele, pagesLues: pages.length };
}
