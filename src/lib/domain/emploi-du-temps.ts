// ============================================================
// Affichage du numéro de niveau et fusion des créneaux (domaine pur)
// ============================================================
//
// Règle 7 AGENTS.md : logique métier pure, sans Prisma.
//
// niveauToNumero() : convertit un libellé de niveau en numéro
//   pour l'affichage à côté du nom de matière.
//
// fusionnerCreneauxAdjacents() : fusionne les créneaux qui se
//   suivent dans le temps (même jour, même matière, même prof,
//   même salle, heure de fin = heure de début du suivant).

/** Créneau minimal pour la fusion (champs nécessaires uniquement). */
export interface CreneauFusionnable {
  id: string;
  jour: string;
  heureDebut: string;
  heureFin: string;
  matiereNom: string;
  enseignantNom: string | null;
  salle: string | null;
}

/** Créneau fusionné (heureFin étendue, ids des créneaux source). */
export interface CreneauFusionne {
  ids: string[];
  jour: string;
  heureDebut: string;
  heureFin: string;
  matiereNom: string;
  enseignantNom: string | null;
  salle: string | null;
}

/**
 * Convertit un libellé de niveau en numéro pour l'affichage.
 *
 *   "1ère" → "1", "2ème" → "2", … "9ème" → "9"
 *   "Seconde" → "10", "Première" → "11", "Terminale" → "12"
 *   "Maternelle" → "0"
 *   Inconnu → "" (chaîne vide, pas d'affichage)
 */
export function niveauToNumero(niveau: string | null | undefined): string {
  if (!niveau) return "";
  const n = niveau.trim().toLowerCase();

  // "1ère", "2ème", "3ème", ... "9ème" (variants : 1ere, 2eme sans accent)
  // Accepte : ème, eme, ere (pour 1ère), er (pour 1er)
  const matchEme = n.match(/^(\d+)\s*(?:è|e)me?$/) ?? n.match(/^(\d+)\s*(?:è|e)re?$/);
  if (matchEme) return matchEme[1];

  // "Seconde" → 10
  if (n === "seconde") return "10";
  // "Première" → 11 (variants : premiere, 1ere sans accent déjà géré ci-dessus)
  if (n === "première" || n === "premiere") return "11";
  // "Terminale" → 12
  if (n === "terminale") return "12";
  // "Maternelle" → 0
  if (n === "maternelle") return "0";

  // Si c'est déjà un nombre pur, le retourner tel quel
  const matchNombre = n.match(/^(\d+)$/);
  if (matchNombre) return matchNombre[1];

  return "";
}

/**
 * Fusionne les créneaux adjacents d'une même journée.
 *
 * Conditions de fusion :
 *   - Même jour
 *   - Même matière (nom identique)
 *   - Heure de fin du précédent = heure de début du suivant (adjacence exacte)
 *   - Même enseignant (ou null pour les deux)
 *   - Même salle (ou null pour les deux)
 *
 * Les créneaux sont triés par heure de début, puis empilés.
 * Quand un créneau est adjacent au précédent et partage matière + prof + salle,
 * on étend heureFin du précédent au lieu d'ajouter un nouveau créneau.
 *
 * @param creneaux liste des créneaux d'une journée (ou multi-jours)
 * @returns créneaux fusionnés, triés par jour puis heure de début
 */
export function fusionnerCreneauxAdjacents<T extends CreneauFusionnable>(
  creneaux: T[],
): CreneauFusionne[] {
  // Grouper par jour
  const parJour = new Map<string, T[]>();
  for (const c of creneaux) {
    if (!parJour.has(c.jour)) parJour.set(c.jour, []);
    parJour.get(c.jour)!.push(c);
  }

  const result: CreneauFusionne[] = [];

  for (const [, jourCreneaux] of parJour) {
    // Trier par heure de début
    const sorted = [...jourCreneaux].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));

    const fusionnes: CreneauFusionne[] = [];

    for (const c of sorted) {
      const prev = fusionnes[fusionnes.length - 1];
      if (
        prev &&
        prev.heureFin === c.heureDebut && // adjacence exacte
        prev.matiereNom === c.matiereNom && // même matière
        prev.enseignantNom === c.enseignantNom && // même prof (ou null)
        prev.salle === c.salle // même salle (ou null)
      ) {
        // Fusion : étendre heureFin du précédent
        prev.heureFin = c.heureFin;
        prev.ids.push(c.id);
      } else {
        // Nouveau créneau fusionné
        fusionnes.push({
          ids: [c.id],
          jour: c.jour,
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
          matiereNom: c.matiereNom,
          enseignantNom: c.enseignantNom,
          salle: c.salle,
        });
      }
    }

    result.push(...fusionnes);
  }

  return result;
}
