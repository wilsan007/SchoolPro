/**
 * EcolPro / LEARNOS — Traduction hors contexte de requête
 * =======================================================
 *
 * POURQUOI PAS `getTranslations`
 * ------------------------------
 * `getTranslations` de next-intl résout la langue depuis la requête en cours
 * (cookie `NEXT_LOCALE`). Deux problèmes pour nos traitements de fond :
 *
 *   1. **Il n'y a pas de requête.** Un cron qui vide la file d'alertes, un
 *      script de validation : aucun cookie, aucun contexte. L'appel échoue.
 *   2. **Ce n'est pas la bonne langue.** Même dans un webhook, la langue à
 *      utiliser est celle de la **famille destinataire**, pas celle du cookie
 *      de l'appelant — qui est ici Meta, pas un humain.
 *
 * Ce module charge les messages directement et construit un traducteur pour
 * une langue explicite. Même comportement ICU (pluriels, interpolation), sans
 * dépendance au cycle de requête.
 */

import { createTranslator } from "next-intl";

/** Langues réellement servies. Toute autre valeur retombe sur le français. */
export const LANGUES = ["fr", "en", "so"] as const;
export type LangueServie = (typeof LANGUES)[number];

/** Les fichiers de messages sont volumineux : on ne les charge qu'une fois. */
const cache = new Map<string, Record<string, unknown>>();

export function normaliserLangue(langue: string | null | undefined): LangueServie {
  return LANGUES.includes(langue as LangueServie) ? (langue as LangueServie) : "fr";
}

async function messagesDe(langue: LangueServie): Promise<Record<string, unknown>> {
  const enCache = cache.get(langue);
  if (enCache) return enCache;

  // Import dynamique plutôt que trois `import` statiques : seule la langue
  // réellement demandée entre en mémoire, et les routes qui ne traduisent
  // rien n'embarquent aucun fichier.
  const charges = (await import(`@/i18n/${langue}.json`)).default as Record<string, unknown>;
  cache.set(langue, charges);
  return charges;
}

/** Traducteur minimal — même signature que celui de next-intl. */
export type Traduire = (
  cle: string,
  params?: Record<string, string | number>
) => string;

/**
 * Traducteur pour une langue et un espace de noms donnés.
 *
 * @param langue `null` ou une valeur inconnue retombe sur le français plutôt
 *        que d'échouer : une alerte non envoyée coûte plus cher qu'une alerte
 *        envoyée dans la mauvaise langue.
 */
export async function traducteurPour(
  langue: string | null | undefined,
  namespace: string
): Promise<Traduire> {
  const locale = normaliserLangue(langue);
  const messages = await messagesDe(locale);
  const t = createTranslator({ locale, messages, namespace });
  return (cle, params) => t(cle as never, params as never);
}
