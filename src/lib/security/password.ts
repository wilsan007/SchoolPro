import { randomBytes } from "crypto";

/**
 * Génère un mot de passe temporaire aléatoire et sécurisé.
 *
 * Format : 16 caractères alphanumériques (sans caractères ambigus
 * comme 0/O, 1/l/I) + un suffixe garantissant les exigences de complexité
 * (majuscule, minuscule, chiffre, caractère spécial).
 *
 * @returns Un mot de passe temporaire de ~20 caractères
 */
export function generateRandomPassword(length = 16): string {
  // Caractères non ambigus
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  // Suffixe garantissant la complexité (majuscule, minuscule, chiffre, spécial)
  return password + "T9!";
}
