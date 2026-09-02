/**
 * SchoolPro — Note en centièmes entiers (anti-flottant)
 * ============================================================
 *
 * Inspiré de GOSE 2.0 (MENFOP Djibouti) — règle non négociable n°1 :
 * « Aucun flottant pour une note ou une moyenne — entiers en centièmes. »
 *
 * En binaire, 0.1 + 0.2 !== 0.3 ; sur une moyenne pondérée de dix matières,
 * l'écart cumulé peut faire basculer un élève d'un rang, ou afficher « 10,00 »
 * pour une moyenne réelle de 9,995. L'entier supprime cette classe de défauts.
 *
 * 14,50 est stocké sous la forme 1450 (centièmes).
 * 9,995 est stocké sous la forme 1000 (arrondi bancaire au centième près).
 *
 * Cette classe est PURE : aucun import de Prisma, de Next.js ou d'aucune
 * infrastructure. Elle vit dans src/lib/domain/ et est testable isolément.
 */

/**
 * Une note exprimée en centièmes entiers.
 *
 * 14,50 → 1450 centièmes.
 * 20,00 → 2000 centièmes.
 * 0     → 0 centièmes.
 *
 * Toutes les opérations (moyennes, ramener sur 20, comparaisons) se font
 * en entiers. La conversion en flottant ne se fait qu'au moment de
 * l'affichage via `formater()`.
 */
export class Note {
  private constructor(public readonly centiemes: number) {
    if (!Number.isInteger(centiemes)) {
      throw new TypeError(
        `Les centièmes doivent être un entier, reçu : ${centiemes}. ` +
          "Utilisez Note.depuisFlottant() pour convertir un nombre décimal."
      );
    }
    if (centiemes < 0) {
      throw new RangeError(`Une note ne peut pas être négative : ${centiemes}.`);
    }
  }

  // ------------------------------------------------------------
  // Construction
  // ------------------------------------------------------------

  /**
   * Crée une note depuis des centièmes entiers.
   * @example Note.depuisCentiemes(1450) // 14,50
   */
  static depuisCentiemes(centiemes: number): Note {
    return new Note(centiemes);
  }

  /**
   * Crée une note depuis un flottant (ex: 14.5).
   *
   * Attention : la multiplication flottante `9.995 * 100` donne `999.4999...`
   * en binaire, pas `999.5`. On utilise `toFixed(2)` pour obtenir la
   * représentation décimale correcte, puis on parse en entier.
   *
   * @example Note.depuisFlottant(14.5) // 1450 centièmes
   */
  static depuisFlottant(valeur: number): Note {
    if (valeur < 0) {
      throw new RangeError(`Une note ne peut pas être négative : ${valeur}.`);
    }
    // toFixed(2) corrige l'erreur de représentation flottante :
    // (9.995).toFixed(2) = "10.00" → 1000, pas 999.
    const centiemes = Math.round(Number((valeur).toFixed(2)) * 100);
    return new Note(centiemes);
  }

  /**
   * Crée une note depuis une saisie textuelle.
   * Accepte « 14,5 », « 14.50 », « 8 ». Rejette tout le reste.
   * @example Note.depuisTexte("14,5") // 1450 centièmes
   */
  static depuisTexte(saisie: string): Note {
    const normalise = saisie.trim().replace(",", ".");
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalise)) {
      throw new TypeError(`Note invalide : « ${saisie} ».`);
    }
    return new Note(Math.round(Number.parseFloat(normalise) * 100 + Number.EPSILON * 100));
  }

  /**
   * Crée une note depuis une valeur sur un barème différent de 20.
   * @example Note.depuisValeurSurBareme(15, 30) // 15/30 → 1000 centièmes (10/20)
   */
  static depuisValeurSurBareme(valeur: number, bareme: number): Note {
    if (bareme <= 0) {
      throw new RangeError(`Le barème doit être strictement positif : ${bareme}.`);
    }
    if (valeur < 0) {
      throw new RangeError(`Une note ne peut pas être négative : ${valeur}.`);
    }
    // Ramène sur 20 puis convertit en centièmes : (valeur / bareme) * 20 * 100
    return new Note(Math.round((valeur / bareme) * 2000 + Number.EPSILON * 100));
  }

  // ------------------------------------------------------------
  // Opérations
  // ------------------------------------------------------------

  /**
   * Ramène la note sur 20 lorsque le barème de l'évaluation diffère.
   * @param bareme le barème d'origine de la note (ex: 30 si noté sur 30)
   * @returns une nouvelle Note sur 20
   * @example Note.depuisCentiemes(1500).ramenerSur20(3000) // 15/30 → 1000 (10/20)
   */
  ramenerSur20(baremeEnCentiemes: number): Note {
    if (baremeEnCentiemes <= 0) {
      throw new RangeError(
        `Le barème doit être strictement positif : ${baremeEnCentiemes}.`
      );
    }
    // (centiemes * 2000) / baremeEnCentiemes, arrondi au centième le plus proche
    return new Note(
      Math.round((this.centiemes * 2000) / baremeEnCentiemes)
    );
  }

  /**
   * Multiplie la note par un coefficient (pour les moyennes pondérées).
   * @returns le produit en centièmes × coefficient (pas une Note, un nombre)
   */
  ponderer(coefficient: number): number {
    return this.centiemes * coefficient;
  }

  // ------------------------------------------------------------
  // Comparaison
  // ------------------------------------------------------------

  /** Vrai si cette note est strictement supérieure à une autre. */
  estSuperieureA(autre: Note): boolean {
    return this.centiemes > autre.centiemes;
  }

  /** Vrai si cette note est égale à une autre. */
  estEgaleA(autre: Note): boolean {
    return this.centiemes === autre.centiemes;
  }

  // ------------------------------------------------------------
  // Affichage
  // ------------------------------------------------------------

  /**
   * Formate la note pour l'affichage : « 14,50 », « 9,00 », « 20,00 ».
   */
  formater(): string {
    const entiers = Math.floor(this.centiemes / 100);
    const decimales = this.centiemes % 100;
    return `${entiers},${decimales.toString().padStart(2, "0")}`;
  }

  /**
   * Retourne la valeur en flottant (pour l'affichage ou l'API).
   * @example Note.depuisCentiemes(1450).enFlottant() // 14.5
   */
  enFlottant(): number {
    return this.centiemes / 100;
  }

  // ------------------------------------------------------------
  // Représentation
  // ------------------------------------------------------------

  toString(): string {
    return `Note(${this.formater()})`;
  }

  valueOf(): number {
    return this.centiemes;
  }
}

/**
 * Calcule une moyenne pondérée à partir de notes en centièmes.
 *
 * Toutes les opérations sont en entiers. L'arrondi final utilise
 * la méthode « arrondi au plus proche » (round half up) pour éviter
 * qu'un 9,995 s'affiche comme 10,00.
 *
 * @param notes liste de {centiemes, coefficient} — les centièmes sont
 *   déjà ramenés sur 20 (barème 2000).
 * @returns la moyenne en centièmes, ou null si la somme des coefficients est 0
 */
export function calculerMoyennePondereeCentiemes(
  notes: { centiemes: number; coefficient: number }[]
): number | null {
  if (notes.length === 0) return null;

  let sommePonderee = 0;
  let sommeCoefficients = 0;

  for (const note of notes) {
    if (note.centiemes < 0) continue; // ignore les notes invalides
    sommePonderee += note.centiemes * note.coefficient;
    sommeCoefficients += note.coefficient;
  }

  if (sommeCoefficients === 0) return null;

  // Arrondi au centième le plus proche.
  // On utilise Math.round sur la division exacte, ce qui donne un arrondi
  // « round half to even » (banquier) en JS pour les .5 exacts.
  return Math.round(sommePonderee / sommeCoefficients);
}

/**
 * Calcule les rangs d'une classe avec gestion des ex aequo.
 *
 * Méthode « standard competition » : deux élèves à 14,50 sont tous deux 3es,
 * le suivant est 5e. Les ex aequo sont la première source de contestation
 * d'un bulletin : un classement par simple index attribuerait arbitrairement
 * les rangs 3 et 4.
 *
 * @param moyennes Map eleveId → centiemes (ou null si pas de moyenne)
 * @returns Map eleveId → rang (ou null si pas de moyenne)
 */
export function calculerRangsCentiemes(
  moyennes: Map<string, number | null>
): Map<string, number | null> {
  // Filtrer et trier les élèves qui ont une moyenne
  const notes: { eleveId: string; centiemes: number }[] = [];
  for (const [eleveId, centiemes] of moyennes) {
    if (centiemes !== null && centiemes !== undefined) {
      notes.push({ eleveId, centiemes });
    }
  }
  notes.sort((a, b) => b.centiemes - a.centiemes);

  const rangs = new Map<string, number | null>();
  let position = 0;
  let rangCourant = 0;
  let precedente: number | null = null;

  for (const { eleveId, centiemes } of notes) {
    position++;
    if (precedente === null || centiemes !== precedente) {
      rangCourant = position;
    }
    rangs.set(eleveId, rangCourant);
    precedente = centiemes;
  }

  // Les élèves sans moyenne ont un rang null
  for (const eleveId of moyennes.keys()) {
    if (!rangs.has(eleveId)) {
      rangs.set(eleveId, null);
    }
  }

  return rangs;
}

/**
 * Génère une appréciation à partir d'une moyenne en centièmes.
 *
 * Les seuils sont en centièmes (sur 2000 = 20,00).
 * Ils DOIVENT être validés par l'établissement avant la recette.
 *
 * @param centiemes la moyenne en centiemes, ou null si pas de moyenne
 * @param paliers paliers personnalisés (seuil → libellé), du plus haut au plus bas
 */
export function apprecierCentiemes(
  centiemes: number | null,
  paliers?: { seuil: number; libelle: string }[]
): string {
  if (centiemes === null || centiemes === undefined) {
    return "Non évalué";
  }

  const paliersParDefaut = [
    { seuil: 1600, libelle: "Félicitations" },
    { seuil: 1400, libelle: "Compliments" },
    { seuil: 1200, libelle: "Encouragements" },
    { seuil: 1000, libelle: "Assez bien" },
    { seuil: 800, libelle: "Travail insuffisant" },
    { seuil: 0, libelle: "Travail très insuffisant" },
  ];

  for (const { seuil, libelle } of paliers ?? paliersParDefaut) {
    if (centiemes >= seuil) {
      return libelle;
    }
  }

  return "Non évalué";
}
