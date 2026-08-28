/**
 * Sanitise une chaîne destinée à être intégrée dans un PDF.
 *
 * pdf-lib n'exécute pas de code, mais un texte trop long ou contenant
 * des caractères de contrôle peut altérer la mise en page ou causer
 * un DoS. Cette fonction borne la longueur et retire les caractères
 * problématiques.
 *
 * @param text Texte à sanitiser
 * @param maxLength Longueur maximale (défaut: 200 caractères)
 * @returns Texte sanitizé
 */
export function sanitizeForPdf(text: string, maxLength = 200): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // caractères de contrôle sauf \t \n \r
    .slice(0, maxLength);
}
