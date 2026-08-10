/**
 * EcolPro — Identité d'un élève et détection des doublons
 * =======================================================
 *
 * Source unique de vérité pour répondre à « ces deux fiches désignent-elles
 * la même personne ? ». Utilisée à l'import (avant écriture) et par l'écran
 * de contrôle des doublons.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * L'import ne comparait que le matricule. Or quand le fichier n'en fournit
 * pas, le matricule est fabriqué — donc toujours neuf, donc jamais en
 * collision. Résultat : 17 réimports d'un même fichier ont créé 78 fiches en
 * double sans qu'aucun contrôle ne se déclenche. La contrainte
 * `@@unique([tenantId, matricule])` a parfaitement joué son rôle : elle
 * protège le matricule, pas la personne.
 *
 * NIVEAUX DE CERTITUDE
 * --------------------
 * Aucun critère unique ne suffit. On raisonne par degrés :
 *
 *   MATRICULE  identifiant officiel          → certitude, on bloque
 *   IDENTITE   nom + prénom + naissance      → très forte, on fait confirmer
 *   CLASSE     nom + prénom + classe         → forte, on avertit
 *   APPROCHE   ressemblance orthographique   → indicative, on signale
 *
 * Les homonymes existent réellement — jumeaux d'une même classe, patronymes
 * fréquents. Sauf pour le matricule, on AVERTIT sans jamais rejeter d'office :
 * c'est à l'utilisateur de trancher.
 */

/** Niveau de certitude d'un rapprochement, du plus sûr au plus incertain. */
export type MatchLevel = "MATRICULE" | "IDENTITE" | "CLASSE" | "APPROCHE";

export const MATCH_LABELS: Record<MatchLevel, string> = {
  MATRICULE: "Matricule identique",
  IDENTITE: "Même nom, prénom et date de naissance",
  CLASSE: "Même nom, prénom et classe",
  APPROCHE: "Orthographe très proche",
};

/** Le rapprochement justifie-t-il un blocage, ou seulement un avertissement ? */
export function isBlocking(level: MatchLevel): boolean {
  return level === "MATRICULE";
}

// ------------------------------------------------------------
// Normalisation
// ------------------------------------------------------------

/**
 * Forme comparable d'un nom : sans accent, sans casse, sans ponctuation
 * décorative, espaces réduits.
 *
 * « DIALLO », « Diallo », « Diàllo  » et « D I A L L O » ne doivent pas
 * produire trois élèves différents.
 */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`-]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Date en `AAAA-MM-JJ`, ou chaîne vide si absente. */
export function normalizeDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * Le strict nécessaire pour identifier une personne.
 *
 * Volontairement sans champ `classe` : la classe est passée séparément à
 * `classKey`. Sans cela, toute fiche portant une relation `classe: { nom }`
 * entrerait en conflit de types avec ce contrat.
 */
export interface Identite {
  nom: string;
  prenom: string;
  dateNaissance?: Date | string | null;
}

/**
 * Clé d'identité civile : nom + prénom + date de naissance.
 *
 * Le couple (nom, prénom) est trié avant concaténation : les fichiers Excel
 * intervertissent fréquemment les deux colonnes, et « MOHAMED Adoch » doit
 * se rapprocher de « Adoch MOHAMED ».
 */
export function identityKey(e: Identite): string {
  const parts = [normalizeName(e.nom), normalizeName(e.prenom)].sort();
  return `${parts.join("|")}|${normalizeDate(e.dateNaissance)}`;
}

/**
 * Clé de repli quand la date de naissance manque : nom + prénom + classe.
 * Moins sûre — deux homonymes d'une même classe la partagent — d'où un
 * simple avertissement.
 */
export function classKey(e: Identite, classe: string | null | undefined): string {
  const parts = [normalizeName(e.nom), normalizeName(e.prenom)].sort();
  return `${parts.join("|")}|${normalizeName(classe ?? "")}`;
}

/** Nom complet normalisé, sans date ni classe — base du rapprochement approché. */
export function nameKey(e: Pick<Identite, "nom" | "prenom">): string {
  return [normalizeName(e.nom), normalizeName(e.prenom)].sort().join(" ");
}

// ------------------------------------------------------------
// Rapprochement approché
// ------------------------------------------------------------

/** Distance d'édition de Levenshtein, bornée pour rester peu coûteuse. */
function levenshtein(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    let ligneMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = temp;
      if (prev[j] < ligneMin) ligneMin = prev[j];
    }
    // Sortie anticipée : plus aucune valeur ne peut redescendre sous `max`.
    if (ligneMin > max) return max + 1;
  }
  return prev[b.length];
}

/**
 * `true` si deux noms sont assez proches pour mériter un signalement.
 *
 * Le seuil est proportionnel à la longueur : une lettre d'écart sur un nom
 * court est significative, sur un nom long elle ne l'est pas.
 */
export function isSimilarName(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const seuil = Math.min(3, Math.max(1, Math.floor(Math.min(a.length, b.length) / 5)));
  return levenshtein(a, b, seuil) <= seuil;
}

/**
 * Deux fiches désignent-elles plausiblement la même personne, à
 * l'orthographe près ?
 *
 * Le nom et le prénom sont comparés **séparément**, et les deux doivent
 * concorder. Comparer les identités concaténées produisait des faux positifs
 * systématiques là où les patronymes sont longs et partagés en fratrie :
 * « SAID AHMED MOHAMED » et « KHALID AHMED MOHAMED » sont deux élèves
 * différents, mais leurs chaînes complètes ne diffèrent que de trois
 * caractères sur vingt.
 *
 * L'inversion des colonnes nom/prénom reste tolérée.
 */
export function isSimilarIdentity(a: Identite, b: Identite): boolean {
  // Ancrage sur la date de naissance : sans elle, le rapprochement approché
  // est ingérable là où les patronymes sont partagés en fratrie. Sur les
  // données réelles, 21 noms de famille sont communs à plusieurs élèves —
  // « SAID AHMED MOHAMED » et « KHALID AHMED MOHAMED » sont deux personnes,
  // et seules leurs dates de naissance le disent sans ambiguïté.
  const dateA = normalizeDate(a.dateNaissance);
  const dateB = normalizeDate(b.dateNaissance);
  if (!dateA || !dateB || dateA !== dateB) return false;

  const aNom = normalizeName(a.nom);
  const aPrenom = normalizeName(a.prenom);
  const bNom = normalizeName(b.nom);
  const bPrenom = normalizeName(b.prenom);

  // Une identité strictement égale relève du niveau IDENTITE, pas d'ici.
  const memeSens = isSimilarName(aNom, bNom) && isSimilarName(aPrenom, bPrenom);
  const inverse = isSimilarName(aNom, bPrenom) && isSimilarName(aPrenom, bNom);
  return memeSens || inverse;
}

// ------------------------------------------------------------
// Détection sur un ensemble de fiches
// ------------------------------------------------------------

export interface FicheEleve {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  dateNaissance: Date;
  classe?: { nom: string } | null;
}

export interface GroupeDoublons<T> {
  level: MatchLevel;
  cle: string;
  fiches: T[];
}

/**
 * Regroupe les fiches qui désignent vraisemblablement la même personne.
 *
 * Un même élève n'est signalé qu'une fois, au niveau de certitude le plus
 * élevé : inutile de le remonter aussi en « orthographe proche » s'il a déjà
 * été apparié sur l'identité civile.
 */
export function detectDuplicates<T extends FicheEleve>(fiches: T[]): GroupeDoublons<T>[] {
  const groupes: GroupeDoublons<T>[] = [];
  const dejaApparie = new Set<string>();

  const regrouper = (level: MatchLevel, cleDe: (f: T) => string) => {
    const parCle = new Map<string, T[]>();
    for (const f of fiches) {
      if (dejaApparie.has(f.id)) continue;
      const cle = cleDe(f);
      // Une clé incomplète (date absente, par exemple) n'apparie rien.
      if (!cle || cle.endsWith("|")) continue;
      if (!parCle.has(cle)) parCle.set(cle, []);
      parCle.get(cle)!.push(f);
    }
    for (const [cle, groupe] of parCle) {
      if (groupe.length < 2) continue;
      groupes.push({ level, cle, fiches: groupe });
      for (const f of groupe) dejaApparie.add(f.id);
    }
  };

  regrouper("IDENTITE", (f) => identityKey(f));
  regrouper("CLASSE", (f) => classKey(f, f.classe?.nom));

  // Rapprochement approché : comparaison deux à deux sur ce qui reste.
  const restants = fiches.filter((f) => !dejaApparie.has(f.id));
  for (let i = 0; i < restants.length; i++) {
    if (dejaApparie.has(restants[i].id)) continue;
    const proches = [restants[i]];
    for (let j = i + 1; j < restants.length; j++) {
      if (dejaApparie.has(restants[j].id)) continue;
      if (isSimilarIdentity(restants[i], restants[j])) {
        proches.push(restants[j]);
      }
    }
    if (proches.length > 1) {
      groupes.push({ level: "APPROCHE", cle: nameKey(restants[i]), fiches: proches });
      for (const f of proches) dejaApparie.add(f.id);
    }
  }

  return groupes;
}
