import dynamic from "next/dynamic";
import type { ReactNode } from "react";

/**
 * Fournisseurs de traductions, un par langue, chacun dans SON fichier
 * JavaScript.
 *
 * POURQUOI NE PAS PASSER `messages` EN PROP DEPUIS LE LAYOUT RACINE
 * Une prop passée d'un composant serveur à un composant client est sérialisée
 * dans le HTML de CHAQUE réponse. Le dictionnaire pèse ~250 Ko : chaque page,
 * et chaque fenêtre du workspace (une iframe = un document complet), le
 * retéléchargeait et le réanalysait, sans mise en cache possible puisque le
 * HTML est propre à l'utilisateur.
 *
 * Ici, chaque dictionnaire est importé par un composant client dédié : il part
 * dans un fichier statique au nom haché, que le navigateur garde en cache
 * (`immutable`) et ne retélécharge qu'après un déploiement. `dynamic()` isole
 * chaque langue dans son propre fichier — seule celle de l'utilisateur est
 * chargée.
 */
const DictionnaireFr = dynamic(() => import("./DictionnaireFr"));
const DictionnaireEn = dynamic(() => import("./DictionnaireEn"));
const DictionnaireSo = dynamic(() => import("./DictionnaireSo"));

/** Fournisseur de la langue demandée, le français à défaut. */
export function Dictionnaire({ locale, children }: { locale: string; children: ReactNode }) {
  if (locale === "en") return <DictionnaireEn>{children}</DictionnaireEn>;
  if (locale === "so") return <DictionnaireSo>{children}</DictionnaireSo>;
  return <DictionnaireFr>{children}</DictionnaireFr>;
}
