/**
 * Normalise un numéro de téléphone pour servir d'identifiant unique.
 *
 * Supprime espaces, tirets, parenthèses, points. Ajoute l'indicatif pays
 * si le numéro est local (≤ 9 chiffres). Par défaut Sénégal (+221) — le
 * pays par défaut du projet SchoolPro (cf. `Tenant.country = "SN"`).
 *
 * Exemples :
 *   "77 123 45 67"       → "221771234567"
 *   "+221 77 123 45 67"  → "221771234567"
 *   "00221771234567"     → "221771234567"
 *   "771234567"          → "221771234567"
 */
export function normalizePhone(phone: string, defaultCountryCode = "221"): string {
  let cleaned = phone.replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (cleaned.startsWith("00")) cleaned = cleaned.slice(2);
  // Indicatifs pays connus de la zone (Afrique de l'Ouest et Centrale)
  const knownPrefixes = ["221", "225", "223", "227", "228", "237", "253", "234", "212"];
  const startsWithKnown = knownPrefixes.some((p) => cleaned.startsWith(p));
  if (!startsWithKnown && /^\d{6,9}$/.test(cleaned)) {
    cleaned = defaultCountryCode + cleaned;
  }
  return cleaned;
}

/**
 * Valide qu'un numéro de téléphone a une longraisonnable (≥ 8 chiffres
 * après normalisation). Sert à écarter les num évidemment faux avant
 * d'en faire un identifiant de compte.
 */
export function isValidPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return /^\d{8,15}$/.test(normalized);
}
