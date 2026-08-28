import type { ModeleNiveaux } from "@prisma/client";

// ============================================================
// Systèmes de nommage des niveaux scolaires
// ============================================================
//
// Deux modèles coexistent :
//
//   ANNEES   (défaut, déjà en DB) :
//     1ère année → 2ème → 3ème → 4ème → 5ème → 6ème → 7ème → 8ème → 9ème
//     → Seconde → 1ère → Terminale
//
//   FRANCAIS :
//     CI → CP → CE1 → CE2 → CM1 → CM2
//     → 6ème → 5ème → 4ème → 3ème
//     → 2nde → 1ère → Terminale
//
// Le CI n'existe que dans le modèle FRANCAIS (il n'a pas d'équivalent
// dans le modèle ANNEES — c'est l'année "supplémentaire" du primaire
// français à 6 ans).
//
// Le champ `niveau` dans la table Classe stocke une valeur canonique
// (ex: "1", "2", "CI", "CP", "6eme", "Terminale"). La fonction
// `libelleNiveau()` convertit cette valeur brute en libellé d'affichage
// selon le modèle du tenant.

// ============================================================
// Table de mapping : valeur canonique → libellé par modèle
// ============================================================

/** Entrée de la table de mapping pour un niveau canonique. */
interface EntreeNiveau {
  /** Valeur stockée en DB (clé canonique, insensible à la casse). */
  canon: string;
  /** Libellé affiché en modèle ANNEES (null = n'existe pas dans ce modèle). */
  annees: string | null;
  /** Libellé affiché en modèle FRANCAIS (null = n'existe pas dans ce modèle). */
  francais: string | null;
  /** Groupe scolaire auquel appartient le niveau. */
  groupe: "Primaire" | "College" | "Lycee";
  /** Ordre relatif du niveau dans le cursus (1 = le plus tôt). */
  ordre: number;
}

const TABLE_NIVEAUX: EntreeNiveau[] = [
  // ── Primaire ──────────────────────────────────────────────
  // Modèle FRANCAIS : CI est l'année initiale (n'existe pas en ANNEES)
  { canon: "ci", annees: null, francais: "CI", groupe: "Primaire", ordre: 1 },
  { canon: "cp", annees: "1ère année", francais: "CP", groupe: "Primaire", ordre: 2 },
  { canon: "ce1", annees: "2ème année", francais: "CE1", groupe: "Primaire", ordre: 3 },
  { canon: "ce2", annees: "3ème année", francais: "CE2", groupe: "Primaire", ordre: 4 },
  { canon: "cm1", annees: "4ème année", francais: "CM1", groupe: "Primaire", ordre: 5 },
  { canon: "cm2", annees: "5ème année", francais: "CM2", groupe: "Primaire", ordre: 6 },
  // ── Collège ───────────────────────────────────────────────
  // Les deux modèles convergent à partir d'ici mais avec des libellés différents
  { canon: "6eme", annees: "6ème année", francais: "6ème", groupe: "College", ordre: 7 },
  { canon: "5eme", annees: "7ème année", francais: "5ème", groupe: "College", ordre: 8 },
  { canon: "4eme", annees: "8ème année", francais: "4ème", groupe: "College", ordre: 9 },
  { canon: "3eme", annees: "9ème année", francais: "3ème", groupe: "College", ordre: 10 },
  // ── Lycée ─────────────────────────────────────────────────
  // Identique dans les deux modèles
  { canon: "seconde", annees: "Seconde", francais: "2nde", groupe: "Lycee", ordre: 11 },
  { canon: "premiere", annees: "1ère", francais: "1ère", groupe: "Lycee", ordre: 12 },
  { canon: "terminale", annees: "Terminale", francais: "Terminale", groupe: "Lycee", ordre: 13 },
];

// ── Index pour recherche rapide ─────────────────────────────

/** Map canon (lowercase) → EntréeNiveau */
const INDEX_CANON = new Map<string, EntreeNiveau>();
for (const e of TABLE_NIVEAUX) INDEX_CANON.set(e.canon, e);

/**
 * Variantes acceptées pour chaque canon (insensible à la casse).
 * Permet de reconnaître "6ème", "6eme", "6e", "6éme", etc.
 */
const VARIANTES: Record<string, string> = {
  // CI
  ci: "ci",
  // CP
  cp: "cp",
  // CE1
  ce1: "ce1",
  // CE2
  ce2: "ce2",
  // CM1
  cm1: "cm1",
  // CM2
  cm2: "cm2",
  // 6ème
  "6eme": "6eme", "6ème": "6eme", "6e": "6eme", "6éme": "6eme", "6 eme": "6eme", "6 ème": "6eme",
  // 5ème
  "5eme": "5eme", "5ème": "5eme", "5e": "5eme", "5éme": "5eme", "5 eme": "5eme", "5 ème": "5eme",
  // 4ème
  "4eme": "4eme", "4ème": "4eme", "4e": "4eme", "4éme": "4eme", "4 eme": "4eme", "4 ème": "4eme",
  // 3ème
  "3eme": "3eme", "3ème": "3eme", "3e": "3eme", "3éme": "3eme", "3 eme": "3eme", "3 ème": "3eme",
  // Seconde
  seconde: "seconde", "2nde": "seconde", "2nd": "seconde",
  // Première
  premiere: "premiere", "première": "premiere", "1ere": "premiere", "1ère": "premiere",
  // Terminale
  terminale: "terminale", term: "terminale", tle: "terminale",
  // Format "NA" / "Neme annee" (modèle ANNEES court : 1A, 2A, …, 9A)
  "1a": "cp", "2a": "ce1", "3a": "ce2", "4a": "cm1", "5a": "cm2",
  "6a": "6eme", "7a": "5eme", "8a": "4eme", "9a": "3eme",
  // Format "N année" / "N an" / "Neme annee"
  "1ere annee": "cp", "1ère année": "cp", "1ereannée": "cp", "1èreannée": "cp",
  "2eme annee": "ce1", "2ème année": "ce1", "2emeannée": "ce1", "2èmeannée": "ce1",
  "3eme annee": "ce2", "3ème année": "ce2", "3emeannée": "ce2", "3èmeannée": "ce2",
  "4eme annee": "cm1", "4ème année": "cm1", "4emeannée": "cm1", "4èmeannée": "cm1",
  "5eme annee": "cm2", "5ème année": "cm2", "5emeannée": "cm2", "5èmeannée": "cm2",
  "6eme annee": "6eme", "6ème année": "6eme", "6emeannée": "6eme", "6èmeannée": "6eme",
  "7eme annee": "5eme", "7ème année": "5eme", "7emeannée": "5eme", "7èmeannée": "5eme",
  "8eme annee": "4eme", "8ème année": "4eme", "8emeannée": "4eme", "8èmeannée": "4eme",
  "9eme annee": "3eme", "9ème année": "3eme", "9emeannée": "3eme", "9èmeannée": "3eme",
};

/**
 * Normalise une valeur de niveau brute vers sa clé canonique.
 * Retourne null si la valeur n'est pas reconnue.
 */
export function normaliserNiveau(niveau: string): string | null {
  const n = niveau.trim().toLowerCase();
  if (!n) return null;

  // Recherche directe dans les variantes
  if (VARIANTES[n]) return VARIANTES[n];

  // Recherche dans le canon
  if (INDEX_CANON.has(n)) return n;

  // Extraction d'un numéro seul (1-9) → modèle ANNEES
  const numSeul = n.match(/^(\d)$/);
  if (numSeul) {
    const num = parseInt(numSeul[1]);
    const map: Record<number, string> = {
      1: "cp", 2: "ce1", 3: "ce2", 4: "cm1", 5: "cm2",
      6: "6eme", 7: "5eme", 8: "4eme", 9: "3eme",
    };
    return map[num] ?? null;
  }

  // Format "Neme" sans "année" (ex: "1ere", "2eme" seul)
  const numAnnee = n.match(/^(\d+)\s*(?:ere|ème|eme|e)?$/);
  if (numAnnee) {
    const num = parseInt(numAnnee[1]);
    if (num >= 1 && num <= 9) {
      const map: Record<number, string> = {
        1: "cp", 2: "ce1", 3: "ce2", 4: "cm1", 5: "cm2",
        6: "6eme", 7: "5eme", 8: "4eme", 9: "3eme",
      };
      return map[num] ?? null;
    }
  }

  return null;
}

// ============================================================
// Fonctions publiques
// ============================================================

/**
 * Retourne le libellé d'affichage d'un niveau selon le modèle du tenant.
 *
 * @param niveau  Valeur brute stockée en DB (ex: "6eme", "1", "CI")
 * @param modele  Modèle de nommage du tenant (ANNEES ou FRANCAIS)
 * @returns Libellé d'affichage (ex: "6ème année" ou "6ème")
 */
export function libelleNiveau(niveau: string, modele: ModeleNiveaux = "ANNEES"): string {
  const canon = normaliserNiveau(niveau);
  if (!canon) return niveau; // Non reconnu → retourner tel quel

  const entree = INDEX_CANON.get(canon);
  if (!entree) return niveau;

  const libelle = modele === "FRANCAIS" ? entree.francais : entree.annees;
  return libelle ?? niveau; // null = n'existe pas dans ce modèle → retourner tel quel
}

/**
 * Retourne le groupe scolaire d'un niveau (Primaire / College / Lycee).
 * Insensible au modèle de nommage.
 */
export function groupeNiveau(niveau: string): "Primaire" | "College" | "Lycee" | null {
  const canon = normaliserNiveau(niveau);
  if (!canon) return null;
  return INDEX_CANON.get(canon)?.groupe ?? null;
}

/**
 * Retourne l'ordre relatif d'un niveau dans le cursus (1 = le plus tôt).
 * Utile pour trier des niveaux dans l'ordre pédagogique.
 */
export function ordreNiveau(niveau: string): number {
  const canon = normaliserNiveau(niveau);
  if (!canon) return 999;
  return INDEX_CANON.get(canon)?.ordre ?? 999;
}

/**
 * Vérifie si un niveau existe dans le modèle donné.
 * (ex: "CI" n'existe pas en modèle ANNEES)
 */
export function niveauExisteDansModele(niveau: string, modele: ModeleNiveaux): boolean {
  const canon = normaliserNiveau(niveau);
  if (!canon) return false;
  const entree = INDEX_CANON.get(canon);
  if (!entree) return false;
  return modele === "FRANCAIS" ? entree.francais !== null : entree.annees !== null;
}

/**
 * Retourne la liste ordonnée des niveaux pour un modèle donné.
 * Utile pour générer des listes déroulantes ou valider des imports.
 */
export function listeNiveauxModele(modele: ModeleNiveaux): string[] {
  return TABLE_NIVEAUX
    .filter((e) => modele === "FRANCAIS" ? e.francais !== null : e.annees !== null)
    .sort((a, b) => a.ordre - b.ordre)
    .map((e) => modele === "FRANCAIS" ? e.francais! : e.annees!);
}

/**
 * Retourne la liste ordonnée des niveaux pour un groupe et un modèle donnés.
 * ex: listeNiveauxGroupe("Primaire", "FRANCAIS") → ["CI", "CP", "CE1", "CE2", "CM1", "CM2"]
 */
export function listeNiveauxGroupe(
  groupe: "Primaire" | "College" | "Lycee",
  modele: ModeleNiveaux,
): string[] {
  return TABLE_NIVEAUX
    .filter((e) => e.groupe === groupe && (modele === "FRANCAIS" ? e.francais !== null : e.annees !== null))
    .sort((a, b) => a.ordre - b.ordre)
    .map((e) => modele === "FRANCAIS" ? e.francais! : e.annees!);
}

/**
 * Compare deux niveaux pour un tri dans l'ordre pédagogique.
 * À utiliser avec Array.sort(comparerNiveaux).
 */
export function comparerNiveaux(a: string, b: string): number {
  return ordreNiveau(a) - ordreNiveau(b);
}
