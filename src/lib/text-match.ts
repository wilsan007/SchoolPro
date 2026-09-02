/**
 * EcolPro — Recherche floue partagée (assistant IA + moteur de suggestion)
 * ============================================================
 * Tolère accents et abréviations : le modèle ou l'utilisateur écrivent
 * "maths" pour "Mathématiques", "1ere L" pour "1ère L", etc.
 */

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Substring dans un sens ou l'autre, ou préfixe commun d'au moins 3 caractères.
 */
export function fuzzyFind<T extends { nom: string }>(candidates: T[], needle: string): T[] {
  const n = normalizeText(needle);
  return candidates.filter((c) => {
    const nc = normalizeText(c.nom);
    if (nc.includes(n) || n.includes(nc)) return true;
    const prefixLen = Math.min(4, n.length, nc.length);
    return prefixLen >= 3 && n.slice(0, prefixLen) === nc.slice(0, prefixLen);
  });
}

/**
 * Recherche floue STRICTE — évite les faux positifs.
 *
 * Contraintes :
 *   - Needle ≥ 3 caractères (trop court = trop de bruit)
 *   - Préfixe commun ≥ 5 caractères (évite "EM" ≠ "EMT", "Graphisme" ≠ "Écriture")
 *   - Substring dans un sens ou l'autre (mais avec la contrainte de longueur)
 *
 * Utilisée pour le matching des matières à l'import d'emploi du temps,
 * où un faux positif est pire qu'un non-match (ça crée une matière erronée).
 */
export function fuzzyFindStrict<T extends { nom: string }>(candidates: T[], needle: string): T[] {
  const n = normalizeText(needle);
  if (n.length < 3) return []; // needle trop court = trop de bruit
  return candidates.filter((c) => {
    const nc = normalizeText(c.nom);
    // Substring : au moins un des deux contient l'autre
    if (nc.includes(n) || n.includes(nc)) return true;
    // Préfixe commun ≥ 5 caractères
    const prefixLen = Math.min(n.length, nc.length);
    return prefixLen >= 5 && n.slice(0, 5) === nc.slice(0, 5);
  });
}

/**
 * Normalise une heure exprimée de façon souple par le modèle ("8h", "8h30",
 * "8:00", "08:00") vers le format strict "HH:MM" attendu par la base.
 */
export function normalizeHeure(raw: string): string | null {
  const match = raw.trim().toLowerCase().match(/^(\d{1,2})\s*[h:]\s*(\d{1,2})?$/);
  if (!match) return null;
  const heures = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  if (heures < 0 || heures > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(heures).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
