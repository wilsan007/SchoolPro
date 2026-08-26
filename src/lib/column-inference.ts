/**
 * Column Type Inference — déduction robuste du type et du rôle d'une colonne.
 *
 * Inspiré d'Airtable, Django admin et Google Sheets : on analyse à la fois
 * le **titre** de la colonne (header) et les **données** qu'elle contient
 * pour déduire son type sémantique et la mapper au champ attendu.
 *
 * Pipeline :
 *   1. lireFichier() → headers + rows bruts
 *   2. infererColonnes(headers, rows, typeImport) → mapping avec confiance
 *   3. Les fonctions analyser*() utilisent le mapping au lieu de deviner
 *
 * Avantages sur l'ancien `row["nom"] ?? row["Nom"]` :
 *   — détecte "Last Name", "Cognome", "إسم العائلة" par les données
 *   — distingue "date" (colonne date) de "dateNaissance" par le contenu
 *   — signale les colonnes ambiguës (confiance < seuil) à l'utilisateur
 *   — valide la cohérence (une colonne "email" doit contenir des emails)
 */

// ============================================================
// Types de colonnes inférables
// ============================================================

export type TypeColonne =
  | "TEXT"
  | "NOMBRE_ENTIER"
  | "NOMBRE_DECIMAL"
  | "DATE"
  | "EMAIL"
  | "TELEPHONE"
  | "BOOLEEN"
  | "ENUM"
  | "URL"
  | "NOM_PROPRE" // nom/prenom de personne
  | "IDENTIFIANT" // matricule, code
  | "HEURE" // HH:MM
  | "JOUR_SEMAINE"
  | "VIDE";

export interface ColonneInferee {
  /** Index de la colonne (0-based) dans le fichier source. */
  index: number;
  /** En-tête original tel que lu dans le fichier. */
  header: string;
  /** Type inféré par l'analyse des données. */
  type: TypeColonne;
  /** Champ cible auquel cette colonne a été mappée (ex: "nom", "email"). */
  champCible?: string;
  /** Score de confiance 0..1 pour le type inféré. */
  confianceType: number;
  /** Score de confiance 0..1 pour le mapping de champ. */
  confianceMapping: number;
  /** Valeurs distinctes échantillonnées (pour debug / UI). */
  exemples: string[];
  /** Nombre de valeurs non vides dans la colonne. */
  valeursNonVides: number;
  /** Nombre total de lignes échantillonnées. */
  totalLignes: number;
  /** Valeurs distinctes (pour ENUM). */
  valeursDistinctes?: string[];
  /** Avertissements (ex: "30% des emails sont invalides"). */
  avertissements?: string[];
}

export interface MappingColonnes {
  /** Map champCible → index de colonne. */
  champs: Record<string, number>;
  /** Toutes les colonnes analysées. */
  colonnes: ColonneInferee[];
  /** Champs obligatoires manquants. */
  champsManquants: string[];
  /** Champs mappés avec faible confiance. */
  champsIncertains: string[];
}

// ============================================================
// Détection de type par analyse des données
// ============================================================

const SAMPLE_SIZE = 50; // nombre de valeurs à échantillonner par colonne

/** Regex compilées (réutilisées pour la performance). */
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_PHONE = /^[+]?[\d\s().-]{6,}$/;
const RE_HEURE = /^\d{1,2}[:hH]\d{2}$/;
const RE_ENTIER = /^-?\d+$/;
const RE_DECIMAL = /^-?\d+[.,]\d+$/;
const RE_URL = /^https?:\/\/[^\s]+$/i;
const RE_BOOLEEN_FR = /^(oui|non|vrai|faux|true|false|0|1|yes|no)$/i;

const JOURS_SEMAINE = new Set([
  "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
  "lun", "mar", "mer", "jeu", "ven", "sam", "dim",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "mon", "tue", "wed", "thu", "fri", "sat", "sun",
]);

/** Détecte si une chaîne est une date dans un format courant. */
function estDate(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  // JJ/MM/AAAA ou JJ-MM-AAAA
  if (/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(s)) return true;
  // AAAA-MM-JJ (ISO)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  // AAAA/MM/JJ
  if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) return true;
  // Format Excel serial (nombre pur > 30000 = date probable)
  return false;
}

/** Détecte si une chaîne ressemble à un nom propre (mots capitalisés). */
function estNomPropre(v: string): boolean {
  const s = v.trim();
  if (!s || s.length < 2) return false;
  // Au moins un mot capitalisé, pas de chiffres, pas de caractères techniques
  const mots = s.split(/\s+/);
  if (mots.length === 0) return false;
  const auMoinsUnCap = mots.some((m) => /^[A-ZÀ-Ý]/.test(m));
  const pasDeChiffre = !/\d/.test(s);
  const pasDeTech = !/[@]/.test(s);
  return auMoinsUnCap && pasDeChiffre && pasDeTech;
}

/** Détecte si une chaîne est un identifiant (matricule, code). */
function estIdentifiant(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  // Patterns: ABC-2025-0001, MAT001, 12345-2025, etc.
  if (/^[A-Z]{2,5}[-]?\d{2,4}[-]?\d{0,4}$/i.test(s)) return true;
  if (/^\d{4,}-\d{3,4}$/i.test(s)) return true; // 2025-0001
  if (/^[A-Z]{3,6}\d{2,6}$/i.test(s)) return true; // MAT00123
  return false;
}

/** Compte les valeurs distinctes dans un échantillon. */
function valeursDistinctes(echantillon: string[]): string[] {
  const set = new Set(echantillon.map((v) => v.trim().toLowerCase()));
  return [...set].slice(0, 20); // limite pour ENUM
}

/**
 * Analyse une colonne et déduit son type à partir des données.
 * Retourne le type + un score de confiance (0..1).
 */
function detecterType(
  valeurs: string[]
): { type: TypeColonne; confiance: number; valeursDistinctes?: string[]; avertissements?: string[] } {
  const nonVides = valeurs.filter((v) => v.trim().length > 0);
  if (nonVides.length === 0) {
    return { type: "VIDE", confiance: 1 };
  }

  const total = nonVides.length;
  const compte = (pred: (v: string) => boolean) => nonVides.filter(pred).length;
  const ratio = (n: number) => n / total;

  // Échantillonner pour ENUM (si peu de valeurs distinctes)
  const distinctes = valeursDistinctes(nonVides);
  const avertissements: string[] = [];

  // Ordre de détection : du plus spécifique au plus général

  // 1. EMAIL — au moins 80% des valeurs sont des emails valides
  const emailRatio = ratio(compte((v) => RE_EMAIL.test(v.trim())));
  if (emailRatio >= 0.8) {
    if (emailRatio < 1) {
      avertissements.push(`${Math.round((1 - emailRatio) * 100)}% des valeurs ne sont pas des emails valides`);
    }
    return { type: "EMAIL", confiance: emailRatio, avertissements };
  }

  // 2. URL — au moins 80%
  const urlRatio = ratio(compte((v) => RE_URL.test(v.trim())));
  if (urlRatio >= 0.8) {
    return { type: "URL", confiance: urlRatio };
  }

  // 3. HEURE — HH:MM
  const heureRatio = ratio(compte((v) => RE_HEURE.test(v.trim())));
  if (heureRatio >= 0.8) {
    return { type: "HEURE", confiance: heureRatio };
  }

  // 4. JOUR_SEMAINE
  const jourRatio = ratio(compte((v) => JOURS_SEMAINE.has(v.trim().toLowerCase())));
  if (jourRatio >= 0.8) {
    return { type: "JOUR_SEMAINE", confiance: jourRatio };
  }

  // 5. DATE — au moins 70% (les dates peuvent avoir des formats mixtes)
  const dateRatio = ratio(compte(estDate));
  if (dateRatio >= 0.7) {
    return { type: "DATE", confiance: dateRatio };
  }

  // 6. BOOLEEN — oui/non, true/false, 0/1
  const boolRatio = ratio(compte((v) => RE_BOOLEEN_FR.test(v.trim())));
  if (boolRatio >= 0.9 && total >= 2) {
    return { type: "BOOLEEN", confiance: boolRatio };
  }

  // 7. TELEPHONE — au moins 70% (les téléphones peuvent avoir des formats variés)
  const telRatio = ratio(compte((v) => RE_PHONE.test(v.trim()) && !RE_EMAIL.test(v.trim())));
  if (telRatio >= 0.7) {
    return { type: "TELEPHONE", confiance: telRatio };
  }

  // 8. NOMBRE_DECIMAL
  const decimalRatio = ratio(compte((v) => RE_DECIMAL.test(v.trim())));
  if (decimalRatio >= 0.8) {
    return { type: "NOMBRE_DECIMAL", confiance: decimalRatio };
  }

  // 9. NOMBRE_ENTIER
  const entierRatio = ratio(compte((v) => RE_ENTIER.test(v.trim())));
  if (entierRatio >= 0.8) {
    // Mais si toutes les valeurs sont 0/1, c'est peut-être un booléen
    if (distinctes.length <= 2 && distinctes.every((d) => d === "0" || d === "1")) {
      return { type: "BOOLEEN", confiance: entierRatio * 0.9 };
    }
    return { type: "NOMBRE_ENTIER", confiance: entierRatio };
  }

  // 10. ENUM — peu de valeurs distinctes (< 10) et au moins 5 lignes
  if (total >= 5 && distinctes.length >= 2 && distinctes.length <= 10 && ratio(compte((v) => distinctes.includes(v.trim().toLowerCase()))) >= 0.95) {
    return { type: "ENUM", confiance: 0.85, valeursDistinctes: distinctes };
  }

  // 11. IDENTIFIANT — matricule, code
  const idRatio = ratio(compte(estIdentifiant));
  if (idRatio >= 0.7) {
    return { type: "IDENTIFIANT", confiance: idRatio };
  }

  // 12. NOM_PROPRE — la plupart des valeurs sont des noms capitalisés
  const nomRatio = ratio(compte(estNomPropre));
  if (nomRatio >= 0.7) {
    return { type: "NOM_PROPRE", confiance: nomRatio * 0.8 }; // 0.8 car c'est un type "faible"
  }

  // 13. TEXT — fallback
  return { type: "TEXT", confiance: 0.5 };
}

// ============================================================
// Détection de champ par analyse du header
// ============================================================

/** Normalise un header pour la comparaison (minuscules, sans accents). */
function normaliserHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/[^a-z0-9]/g, " ") // ponctuation → espaces
    .replace(/\s+/g, " ")
    .trim();
}

/** Mots-clés par champ, multilingues (fr/en/so/it). */
const MOTS_CLES_CHAMP: Record<string, string[]> = {
  nom: ["nom", "lastname", "surname", "cognome", "last name", "family name", "apellido"],
  prenom: ["prenom", "firstname", "name", "given name", "nome", "first name", "nombre"],
  classe: ["classe", "class", "classe_name", "group", "groupe", "sezione", "clase"],
  niveau: ["niveau", "level", "grade", "anno", "nivel", "annee_etude"],
  sexe: ["sexe", "gender", "genre", "sesso", "genero", "sex"],
  dateNaissance: ["naissance", "birth", "dob", "date of birth", "data nascita", "fecha nacimiento", "date naissance"],
  lieuNaissance: ["lieu", "birthplace", "place of birth", "luogo", "lugar nacimiento", "lieu naissance"],
  matricule: ["matricule", "matricola", "id", "registration", "student id", "numero", "numero eleve", "matricula"],
  nationalite: ["nationalite", "nationality", "pays", "country", "cittadinanza", "nacionalidad", "nazionalita"],
  regime: ["regime", "internat", "pension", "boarding", "regime", "pensione", "internado"],
  email: ["email", "mail", "courriel", "e-mail", "indirizzo email", "correo"],
  telephone: ["telephone", "tel", "phone", "contact", "mobile", "portable", "cellulare", "telefono", "celular"],
  matieres: ["matiere", "matieres", "subject", "subjects", "materia", "materie", "asignatura"],
  coefficient: ["coefficient", "coef", "weight", "peso", "ponderazione"],
  effectif: ["effectif", "size", "count", "nombre eleve", "numero eleve", "effettivo"],
  professeurPrincipal: ["professeur principal", "prof principal", "main teacher", "titulaire", "prof titulaire", "docente principale"],
  jour: ["jour", "day", "giorno", "dia"],
  heureDebut: ["heure debut", "heure_debut", "debut", "start", "start time", "ora inizio", "hora inicio", "heure d", "debut cours"],
  heureFin: ["heure fin", "heure_fin", "fin", "end", "end time", "ora fine", "hora fin", "fin cours"],
  etablissement: ["etablissement", "ecole", "school", "istituto", "escuela", "establishment"],
  relation: ["lien", "relation", "relationship", "type", "parente", "relazione", "parentesco", "lien parente"],
  code: ["code", "codice", "codigo", "short code", "abbreviation"],
  periode: ["periode", "trimestre", "period", "term", "semester", "semestre", "periodo", "trimestre"],
  adresse: ["adresse", "address", "indirizzo", "direccion", "rue", "via"],
  ville: ["ville", "city", "citta", "ciudad", "commune"],
};

/** Types préférés par champ (pour lever les ambiguïtés). */
const TYPE_PREFERE_CHAMP: Record<string, TypeColonne[]> = {
  nom: ["NOM_PROPRE", "TEXT"],
  prenom: ["NOM_PROPRE", "TEXT"],
  classe: ["TEXT", "NOM_PROPRE"],
  niveau: ["TEXT", "ENUM"],
  sexe: ["ENUM", "TEXT"],
  dateNaissance: ["DATE"],
  lieuNaissance: ["TEXT", "NOM_PROPRE"],
  matricule: ["IDENTIFIANT", "TEXT"],
  nationalite: ["TEXT", "ENUM"],
  regime: ["ENUM", "TEXT"],
  email: ["EMAIL"],
  telephone: ["TELEPHONE"],
  matieres: ["TEXT"],
  coefficient: ["NOMBRE_DECIMAL", "NOMBRE_ENTIER"],
  effectif: ["NOMBRE_ENTIER"],
  professeurPrincipal: ["NOM_PROPRE", "TEXT"],
  jour: ["JOUR_SEMAINE", "ENUM"],
  heureDebut: ["HEURE"],
  heureFin: ["HEURE"],
  etablissement: ["TEXT", "NOM_PROPRE"],
  relation: ["ENUM", "TEXT"],
  code: ["IDENTIFIANT", "TEXT"],
  periode: ["TEXT", "ENUM"],
  adresse: ["TEXT"],
  ville: ["TEXT", "NOM_PROPRE"],
};

/**
 * Score la correspondance entre un header et un champ.
 * Retourne un score 0..1.
 */
function scoreHeaderChamp(headerNorm: string, champ: string): number {
  const motsCles = MOTS_CLES_CHAMP[champ];
  if (!motsCles) return 0;

  let meilleurScore = 0;
  for (const mc of motsCles) {
    const mcNorm = normaliserHeader(mc);
    if (headerNorm === mcNorm) {
      return 1.0; // correspondance exacte
    }
    if (headerNorm.includes(mcNorm)) {
      // Score proportionnel à la longueur du mot-clé par rapport au header
      const score = mcNorm.length / headerNorm.length;
      if (score > meilleurScore) meilleurScore = score;
    }
    // Correspondance par mot (chaque mot du header est comparé)
    const headerMots = headerNorm.split(" ");
    for (const mot of headerMots) {
      if (mot === mcNorm) {
        if (0.9 > meilleurScore) meilleurScore = 0.9;
      }
      if (mot.length >= 4 && (mot.startsWith(mcNorm) || mcNorm.startsWith(mot))) {
        const score = Math.min(mot.length, mcNorm.length) / Math.max(mot.length, mcNorm.length) * 0.7;
        if (score > meilleurScore) meilleurScore = score;
      }
    }
  }
  return meilleurScore;
}

// ============================================================
// Inférence principale
// ============================================================

/** Schéma de champs attendus par type d'import. */
export const SCHEMA_IMPORT: Record<string, { champ: string; requis: boolean }[]> = {
  eleves: [
    { champ: "nom", requis: true },
    { champ: "prenom", requis: false },
    { champ: "classe", requis: true },
    { champ: "dateNaissance", requis: true },
    { champ: "sexe", requis: false },
    { champ: "matricule", requis: false },
    { champ: "lieuNaissance", requis: false },
    { champ: "nationalite", requis: false },
    { champ: "regime", requis: false },
    { champ: "email", requis: false },
    { champ: "telephone", requis: false },
  ],
  enseignants: [
    { champ: "nom", requis: true },
    { champ: "prenom", requis: true },
    { champ: "email", requis: false },
    { champ: "telephone", requis: false },
    { champ: "matieres", requis: false },
    { champ: "classe", requis: false }, // classes assignées
  ],
  classes: [
    { champ: "nom", requis: true },
    { champ: "niveau", requis: false },
    { champ: "effectif", requis: false },
    { champ: "professeurPrincipal", requis: false },
  ],
  matieres: [
    { champ: "nom", requis: true },
    { champ: "code", requis: false },
    { champ: "coefficient", requis: false },
  ],
  parents: [
    { champ: "nom", requis: true },
    { champ: "prenom", requis: false },
    { champ: "email", requis: false },
    { champ: "telephone", requis: false },
    { champ: "relation", requis: false },
  ],
  "edt-externes": [
    { champ: "nom", requis: true }, // nom enseignant
    { champ: "prenom", requis: false },
    { champ: "email", requis: false },
    { champ: "jour", requis: true },
    { champ: "heureDebut", requis: true },
    { champ: "heureFin", requis: true },
    { champ: "etablissement", requis: false },
    { champ: "matieres", requis: false },
    { champ: "periode", requis: false },
  ],
};

/**
 * Infère le type et le mapping de toutes les colonnes d'un fichier.
 *
 * @param headers En-têtes du fichier (ordre original)
 * @param rows Lignes de données (Record<header, value>)
 * @param typeImport Type d'import pour le schéma attendu
 * @returns Mapping complet avec scores de confiance
 */
export function infererColonnes(
  headers: string[],
  rows: Record<string, string>[],
  typeImport: string
): MappingColonnes {
  const schema = SCHEMA_IMPORT[typeImport] ?? [];
  const champsAttendus = schema.map((s) => s.champ);

  // 1. Analyser chaque colonne (type + exemples)
  const colonnes: ColonneInferee[] = headers.map((header, index) => {
    const valeurs = rows
      .slice(0, SAMPLE_SIZE)
      .map((r) => r[header] ?? "")
      .filter((v) => v !== undefined);

    const nonVides = valeurs.filter((v) => v.trim().length > 0);
    const { type, confiance, valeursDistinctes: distinctes, avertissements: avert } = detecterType(valeurs);

    return {
      index,
      header,
      type,
      confianceType: confiance,
      confianceMapping: 0,
      exemples: nonVides.slice(0, 3),
      valeursNonVides: nonVides.length,
      totalLignes: valeurs.length,
      valeursDistinctes: distinctes,
      avertissements: avert,
    };
  });

  // 2. Mapper chaque colonne au meilleur champ
  //    Score = 0.4 * scoreHeader + 0.4 * scoreType + 0.2 * bonusPosition
  const scores: Record<string, { index: number; score: number }[]> = {};

  for (const champ of champsAttendus) {
    scores[champ] = [];
    const typesPreferes = TYPE_PREFERE_CHAMP[champ] ?? [];

    for (const col of colonnes) {
      if (col.type === "VIDE") continue;

      const headerNorm = normaliserHeader(col.header);
      const scoreHeader = scoreHeaderChamp(headerNorm, champ);

      // Score de type : 1.0 si le type inféré est le type préféré, sinon décroissant
      let scoreType = 0.3; // baseline
      if (typesPreferes.length > 0) {
        const rang = typesPreferes.indexOf(col.type);
        if (rang === 0) scoreType = 1.0;
        else if (rang === 1) scoreType = 0.6;
        else if (rang >= 0) scoreType = 0.4;
        // Si le type inféré n'est pas dans les préférés mais le header matche fort,
        // on garde un score de type décent (le header peut avoir raison)
        if (scoreHeader >= 0.8 && rang < 0) scoreType = 0.5;
      }

      // Bonus de position : les premières colonnes sont souvent les plus importantes
      const bonusPosition = Math.max(0, 0.2 - col.index * 0.03);

      const scoreTotal = 0.4 * scoreHeader + 0.4 * scoreType + 0.2 * bonusPosition;

      if (scoreTotal > 0.15) {
        scores[champ].push({ index: col.index, score: scoreTotal });
      }
    }

    // Trier par score décroissant
    scores[champ].sort((a, b) => b.score - a.score);
  }

  // 3. Assigner les champs en résolvant les conflits
  //    (une colonne ne peut être mappée qu'à un seul champ)
  const champs: Record<string, number> = {};
  const colonnesUtilisees = new Set<number>();
  const champsIncertains: string[] = [];

  // Trier les champs par priorité : requis d'abord, puis par meilleur score disponible
  const champsOrdre = [...schema].sort((a, b) => {
    if (a.requis && !b.requis) return -1;
    if (!a.requis && b.requis) return 1;
    const bestA = scores[a.champ]?.[0]?.score ?? 0;
    const bestB = scores[b.champ]?.[0]?.score ?? 0;
    return bestB - bestA;
  });

  for (const { champ, requis } of champsOrdre) {
    const candidats = scores[champ] ?? [];
    // Prendre le meilleur candidat non encore utilisé
    const meilleur = candidats.find((c) => !colonnesUtilisees.has(c.index));

    if (meilleur) {
      champs[champ] = meilleur.index;
      colonnesUtilisees.add(meilleur.index);

      // Mettre à jour la colonne avec le champ cible et la confiance
      const col = colonnes[meilleur.index];
      col.champCible = champ;
      col.confianceMapping = meilleur.score;

      // Signaler si la confiance est faible
      if (meilleur.score < 0.5 && requis) {
        champsIncertains.push(champ);
      }
    }
  }

  // 4. Identifier les champs requis manquants
  const champsManquants = schema
    .filter((s) => s.requis && !(s.champ in champs))
    .map((s) => s.champ);

  return {
    champs,
    colonnes,
    champsManquants,
    champsIncertains,
  };
}

// ============================================================
// Accès aux valeurs via le mapping
// ============================================================

/**
 * Crée un accesseur de valeur basé sur le mapping inféré.
 * Permet aux fonctions analyser*() de lire les valeurs sans connaître
 * le nom exact des en-têtes.
 */
export function creerAccesseur(
  rows: Record<string, string>[],
  mapping: MappingColonnes
): (champ: string) => (row: Record<string, string>) => string {
  return (champ: string) => {
    const index = mapping.champs[champ];
    if (index === undefined) return () => "";
    // Les rows sont des Record<string, string> indexées par header.
    // On doit retrouver le header correspondant à l'index.
    return (row: Record<string, string>) => {
      const headers = Object.keys(row);
      const header = headers[index];
      return header ? (row[header] ?? "").trim() : "";
    };
  };
}

/**
 * Retourne la valeur d'un champ pour une ligne donnée, en utilisant
 * le mapping inféré. Version simplifiée pour usage direct.
 */
export function valeurChamp(
  row: Record<string, string>,
  headers: string[],
  mapping: MappingColonnes,
  champ: string
): string {
  const index = mapping.champs[champ];
  if (index === undefined) return "";
  const header = headers[index];
  return header ? (row[header] ?? "").trim() : "";
}

/**
 * Retourne toutes les valeurs d'un champ pour toutes les lignes.
 */
export function colonneChamp(
  rows: Record<string, string>[],
  headers: string[],
  mapping: MappingColonnes,
  champ: string
): string[] {
  return rows.map((r) => valeurChamp(r, headers, mapping, champ));
}

// ============================================================
// Labels pour l'UI
// ============================================================

export const LABEL_TYPE_COLONNE: Record<TypeColonne, string> = {
  TEXT: "Texte",
  NOMBRE_ENTIER: "Nombre entier",
  NOMBRE_DECIMAL: "Nombre décimal",
  DATE: "Date",
  EMAIL: "Email",
  TELEPHONE: "Téléphone",
  BOOLEEN: "Oui/Non",
  ENUM: "Énumération",
  URL: "URL",
  NOM_PROPRE: "Nom propre",
  IDENTIFIANT: "Identifiant",
  HEURE: "Heure",
  JOUR_SEMAINE: "Jour de semaine",
  VIDE: "Vide",
};

export const ICONE_TYPE_COLONNE: Record<TypeColonne, string> = {
  TEXT: "Aa",
  NOMBRE_ENTIER: "#",
  NOMBRE_DECIMAL: "#.#",
  DATE: "📅",
  EMAIL: "@",
  TELEPHONE: "☎",
  BOOLEEN: "✓",
  ENUM: "☰",
  URL: "🔗",
  NOM_PROPRE: "👤",
  IDENTIFIANT: "ID",
  HEURE: "⏰",
  JOUR_SEMAINE: "📆",
  VIDE: "—",
};
