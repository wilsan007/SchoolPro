/**
 * EcolPro — Analyse d'un import d'élèves
 * ======================================
 *
 * Lecture du fichier et construction d'un **plan d'import** : pour chaque
 * ligne, ce qui sera fait et pourquoi. Aucune écriture ici.
 *
 * Ce module est partagé par les deux étapes de l'import :
 *
 *   1. `/api/import/eleves/analyze` — produit le plan, n'écrit rien ;
 *   2. `/api/import/eleves`         — rejoue l'analyse et applique le plan,
 *                                      éventuellement amendé par l'utilisateur.
 *
 * Rejouer l'analyse à l'étape 2 n'est pas une redondance : c'est ce qui
 * garantit qu'on n'écrit jamais sur la foi d'un plan fabriqué côté client.
 * L'empreinte du fichier est vérifiée pour s'assurer qu'il s'agit bien du
 * fichier prévisualisé.
 */

import ExcelJS from "exceljs";
import { createHash } from "crypto";
import {
  classKey,
  estDateApproximative,
  identityKey,
  isSimilarIdentity,
  normalizeName,
} from "@/lib/eleve-identity";

// ------------------------------------------------------------
// Lecture du fichier
// ------------------------------------------------------------

export interface ParsedRow {
  /** Numéro de ligne dans le fichier, pour que l'utilisateur s'y retrouve. */
  ligne: number;
  nom: string;
  prenom: string;
  classe: string;
  niveau: string;
  sexe?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  matricule?: string;
  nationalite?: string;
  regime?: string;
  // Parents (2 blocs optionnels — un fichier sans ces colonnes reste valide)
  parent1?: ContactParentLu;
  parent2?: ContactParentLu;
}

/** Contact parent lu dans le fichier d'import (un bloc de colonnes). */
export interface ContactParentLu {
  nom: string;
  prenom?: string;
  telephone?: string;
  telephone2?: string;
  lien?: string; // PERE | MERE | TUTEUR | AUTRE
}

export function buildColumnMapping(headers: string[]): Record<string, string> {
  const find = (patterns: string[]): string | undefined =>
    headers.find((h) => patterns.some((p) => h.includes(p)));

  // Pour les blocs parent, on cherche les colonnes suffixées par 1/2 ou
  // préfixées par pere/mere/tuteur. On normalise les en-têtes pour la recherche.
  const findParent = (bloc: 1 | 2, patterns: string[]): string | undefined => {
    const suffix = bloc === 1 ? ["1", "_1", " 1"] : ["2", "_2", " 2"];
    // D'abord chercher avec suffixe explicite (telephone_parent1)
    const avecSuffix = headers.find((h) =>
      patterns.some((p) => h.includes(p)) && suffix.some((s) => h.includes(s))
    );
    if (avecSuffix) return avecSuffix;
    // Puis chercher par mot-clé de rôle (pere, mere, tuteur)
    const role = bloc === 1 ? ["pere", "père", "father"] : ["mere", "mère", "mother"];
    return headers.find((h) => role.some((r) => h.includes(r)) && patterns.some((p) => h.includes(p)));
  };

  return {
    nom: find(["nom", "lastname", "surname"]) ?? "nom",
    prenom: find(["prenom", "prénom", "firstname", "name"]) ?? "prenom",
    classe: find(["classe", "class"]) ?? "classe",
    niveau: find(["niveau", "level"]) ?? "niveau",
    sexe: find(["sexe", "gender", "genre"]) ?? "sexe",
    dateNaissance: find(["naissance", "birth", "dob", "date"]) ?? "datenaissance",
    lieuNaissance: find(["lieu", "birthplace", "place"]) ?? "lieunaissance",
    matricule: find(["matricule", "id", "registration"]) ?? "matricule",
    nationalite: find(["nationalite", "nationality", "pays", "country"]) ?? "nationalite",
    regime: find(["regime", "internat", "pension", "boarding"]) ?? "regime",
    // Bloc parent 1
    parent1Nom: findParent(1, ["nom", "lastname", "surname"]) ?? "",
    parent1Prenom: findParent(1, ["prenom", "prénom", "firstname", "name"]) ?? "",
    parent1Tel: findParent(1, ["telephone", "tel", "phone", "contact", "mobile", "portable"]) ?? "",
    parent1Tel2: findParent(1, ["telephone2", "tel2", "phone2", "contact2", "mobile2", "secondaire"]) ?? "",
    parent1Lien: findParent(1, ["lien", "relation", "type"]) ?? "",
    // Bloc parent 2
    parent2Nom: findParent(2, ["nom", "lastname", "surname"]) ?? "",
    parent2Prenom: findParent(2, ["prenom", "prénom", "firstname", "name"]) ?? "",
    parent2Tel: findParent(2, ["telephone", "tel", "phone", "contact", "mobile", "portable"]) ?? "",
    parent2Tel2: findParent(2, ["telephone2", "tel2", "phone2", "contact2", "mobile2", "secondaire"]) ?? "",
    parent2Lien: findParent(2, ["lien", "relation", "type"]) ?? "",
  };
}

/** Empreinte du contenu — sert à reconnaître un fichier déjà importé. */
export function fileHash(buffer: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(buffer)).digest("hex");
}

export interface ParseResult {
  rows: ParsedRow[];
  /** Lignes inexploitables : nom ou classe absents. */
  erreurs: { ligne: number; message: string }[];
  hash: string;
}

export async function parseElevesWorkbook(buffer: ArrayBuffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Aucune feuille trouvée dans le fichier");

  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").trim().toLowerCase();
  });
  const colMap = buildColumnMapping(headers);

  const rows: ParsedRow[] = [];
  const erreurs: { ligne: number; message: string }[] = [];

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const raw: Record<string, unknown> = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) raw[header] = cell.value;
    });

    const texte = (k: string) => {
      const v = raw[colMap[k]];
      if (v === null || v === undefined) return undefined;
      // Une cellule de date Excel arrive en objet Date.
      if (v instanceof Date) return v.toISOString();
      const s = String(v).trim();
      return s.length > 0 ? s : undefined;
    };

    const nomRaw = texte("nom");
    const prenomRaw = texte("prenom");
    const classe = texte("classe");

    if (!nomRaw) {
      erreurs.push({ ligne: i, message: "Nom manquant" });
      continue;
    }
    if (!classe) {
      erreurs.push({ ligne: i, message: `Classe manquante pour ${nomRaw}` });
      continue;
    }

    // Sans colonne prénom, on scinde le nom complet.
    // Convention locale : « Ahmed Omar Hassan » → prénom Ahmed, nom Omar Hassan.
    let nom = nomRaw;
    let prenom = prenomRaw;
    if (!prenom) {
      const parts = nomRaw.split(/\s+/);
      if (parts.length >= 2) {
        prenom = parts[0];
        nom = parts.slice(1).join(" ");
      } else {
        prenom = nomRaw;
        nom = nomRaw;
      }
    }

    rows.push({
      ligne: i,
      nom,
      prenom,
      classe,
      niveau: texte("niveau") ?? classe,
      sexe: texte("sexe")?.toUpperCase(),
      dateNaissance: texte("dateNaissance"),
      lieuNaissance: texte("lieuNaissance"),
      matricule: texte("matricule"),
      nationalite: texte("nationalite"),
      regime: texte("regime"),
      parent1: lireContactParent(texte, "parent1"),
      parent2: lireContactParent(texte, "parent2"),
    });
  }

  return { rows, erreurs, hash: fileHash(buffer) };
}

/** Lit un bloc de colonnes parent et ne renvoie un objet que si au moins
 *  un champ (nom ou téléphone) est présent. */
function lireContactParent(
  texte: (k: string) => string | undefined,
  prefix: "parent1" | "parent2"
): ContactParentLu | undefined {
  const nom = texte(`${prefix}Nom`);
  const prenom = texte(`${prefix}Prenom`);
  const telephone = texte(`${prefix}Tel`);
  const telephone2 = texte(`${prefix}Tel2`);
  const lien = texte(`${prefix}Lien`);
  if (!nom && !telephone && !prenom) return undefined;
  return {
    nom: nom ?? "",
    prenom: prenom || undefined,
    telephone: telephone || undefined,
    telephone2: telephone2 || undefined,
    lien: lien?.toUpperCase() || undefined,
  };
}

// ------------------------------------------------------------
// Analyse
// ------------------------------------------------------------

export type Verdict =
  /** Aucun rapprochement : élève inconnu. */
  | "NOUVEAU"
  /** Matricule déjà attribué dans l'établissement. */
  | "MATRICULE_EXISTANT"
  /** Même nom, prénom et date de naissance qu'une fiche existante. */
  | "DOUBLON_IDENTITE"
  /** Même nom, prénom et classe, sans date pour trancher. */
  | "DOUBLON_CLASSE"
  /** Orthographe très proche d'une fiche existante. */
  | "DOUBLON_APPROCHE"
  /** La même personne apparaît plusieurs fois dans le fichier. */
  | "DOUBLON_FICHIER"
  /** Ligne inexploitable en l'état. */
  | "ERREUR";

export type Action = "CREER" | "METTRE_A_JOUR" | "IGNORER";

export interface FicheExistante {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  dateNaissance: Date;
  classeNom: string | null;
  /**
   * Fiche archivée (soft delete). Elle participe quand même au
   * rapprochement : réimporter un élève archivé doit le restaurer, pas en
   * créer un second — et son matricule reste réservé.
   */
  archive: boolean;
}

export interface LignePlan {
  ligne: number;
  nom: string;
  prenom: string;
  classe: string;
  dateNaissance?: string;
  matricule?: string;
  verdict: Verdict;
  message: string;
  /** Action appliquée si l'utilisateur ne change rien. */
  action: Action;
  /**
   * Date au 1er janvier : très probablement une date de repli plutôt que la
   * date réelle. La ligne reste importable, mais l'administrateur doit
   * confirmer explicitement avant que l'import ne s'exécute.
   */
  dateApproximative?: boolean;
  /** Fiche existante rapprochée, s'il y en a une. */
  existant?: {
    id: string;
    matricule: string;
    nom: string;
    prenom: string;
    classe: string | null;
    archive: boolean;
  };
}

export interface PlanImport {
  hash: string;
  lignes: LignePlan[];
  resume: {
    total: number;
    aCreer: number;
    aMettreAJour: number;
    aIgnorer: number;
    doublons: number;
    erreurs: number;
    /** Lignes dont la date de naissance doit être validée par l'administrateur. */
    datesAConfirmer: number;
  };
  /** Import antérieur du même fichier, le cas échéant. */
  dejaImporte?: { date: string; par: string | null };
  classesInconnues: string[];
}

/** Date exploitable, ou `null` si la cellule est absente ou illisible. */
export function parseDate(value: string | undefined): Date | null {
  if (!value) return null;

  // JJ/MM/AAAA doit être testé AVANT le constructeur natif : celui-ci lit
  // « 05/04/2009 » à l'américaine (MM/JJ/AAAA) et renvoie le 4 mai au lieu du
  // 5 avril. Le défaut serait resté invisible pour les jours ≤ 12 et se
  // corrigerait tout seul au-delà — soit une date sur deux silencieusement
  // fausse, sans erreur.
  const fr = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (fr) {
    const jour = Number(fr[1]);
    const mois = Number(fr[2]);
    if (jour >= 1 && jour <= 31 && mois >= 1 && mois <= 12) {
      const d = new Date(Date.UTC(Number(fr[3]), mois - 1, jour));
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  // Formats sans ambiguïté : ISO (AAAA-MM-JJ) et dates natives d'Excel.
  const direct = new Date(value);
  return isNaN(direct.getTime()) ? null : direct;
}

/**
 * Construit le plan d'import.
 *
 * Ordre des rapprochements, du plus sûr au plus incertain — le premier qui
 * répond l'emporte, une ligne n'est jamais signalée deux fois.
 */
export function analyzeImport(
  rows: ParsedRow[],
  erreurs: { ligne: number; message: string }[],
  existants: FicheExistante[],
  classesConnues: Set<string>,
  hash: string
): PlanImport {
  const parMatricule = new Map(existants.map((e) => [e.matricule, e]));
  const parIdentite = new Map<string, FicheExistante>();
  const parClasse = new Map<string, FicheExistante>();
  for (const e of existants) {
    const idk = identityKey(e);
    if (!idk.endsWith("|")) parIdentite.set(idk, e);
    parClasse.set(classKey(e, e.classeNom), e);
  }

  const lignes: LignePlan[] = [];

  // Lignes rejetées à la lecture.
  for (const err of erreurs) {
    lignes.push({
      ligne: err.ligne,
      nom: "",
      prenom: "",
      classe: "",
      verdict: "ERREUR",
      message: err.message,
      action: "IGNORER",
    });
  }

  // Doublons internes au fichier : une même personne y figure deux fois.
  const vuesDansLeFichier = new Map<string, number>();

  const resume = (e: FicheExistante) => ({
    id: e.id,
    matricule: e.matricule,
    nom: e.nom,
    prenom: e.prenom,
    classe: e.classeNom,
    archive: e.archive,
  });

  /** Mention ajoutée au message quand la fiche rapprochée est archivée. */
  const suffixeArchive = (e: FicheExistante) =>
    e.archive ? " — fiche archivée, elle sera restaurée" : "";

  for (const row of rows) {
    const date = parseDate(row.dateNaissance);
    const base = {
      ligne: row.ligne,
      nom: row.nom,
      prenom: row.prenom,
      classe: row.classe,
      dateNaissance: date ? date.toISOString().slice(0, 10) : undefined,
      matricule: row.matricule,
      dateApproximative: estDateApproximative(date),
    };

    // La date de naissance conditionne toute identification fiable : sans
    // elle, on ne peut ni distinguer deux homonymes ni reconnaître un
    // réimport. On refuse la ligne plutôt que d'inventer une date par défaut
    // — c'est ce défaut qui a rendu 269 élèves indiscernables.
    if (!date) {
      lignes.push({
        ...base,
        verdict: "ERREUR",
        message: "Date de naissance absente ou illisible — colonne obligatoire",
        action: "IGNORER",
      });
      continue;
    }

    const cleFichier = identityKey({ nom: row.nom, prenom: row.prenom, dateNaissance: date });
    const premiereLigne = vuesDansLeFichier.get(cleFichier);
    if (premiereLigne !== undefined) {
      lignes.push({
        ...base,
        verdict: "DOUBLON_FICHIER",
        message: `Déjà présent ligne ${premiereLigne} du même fichier`,
        action: "IGNORER",
      });
      continue;
    }
    vuesDansLeFichier.set(cleFichier, row.ligne);

    // 1. Matricule — identifiant officiel, certitude.
    if (row.matricule && parMatricule.has(row.matricule)) {
      const e = parMatricule.get(row.matricule)!;
      lignes.push({
        ...base,
        verdict: "MATRICULE_EXISTANT",
        message: `Matricule déjà attribué à ${e.prenom} ${e.nom}${suffixeArchive(e)}`,
        action: "METTRE_A_JOUR",
        existant: resume(e),
      });
      continue;
    }

    // 2. Identité civile — très forte présomption, on met à jour plutôt que
    //    de créer une seconde fiche. C'est ce qui rend un réimport inoffensif.
    const parId = parIdentite.get(cleFichier);
    if (parId) {
      lignes.push({
        ...base,
        verdict: "DOUBLON_IDENTITE",
        message: `Déjà enregistré sous le matricule ${parId.matricule}${suffixeArchive(parId)}`,
        action: "METTRE_A_JOUR",
        existant: resume(parId),
      });
      continue;
    }

    // 3. Même nom, prénom et classe — forte, mais deux homonymes peuvent
    //    cohabiter : on ignore par défaut, l'utilisateur peut forcer.
    const parCl = parClasse.get(classKey(row, row.classe));
    if (parCl) {
      lignes.push({
        ...base,
        verdict: "DOUBLON_CLASSE",
        message: `Un élève de même nom existe déjà en ${row.classe} (${parCl.matricule})${suffixeArchive(parCl)}`,
        action: "IGNORER",
        existant: resume(parCl),
      });
      continue;
    }

    // 4. Orthographe proche — indice faible : on crée, mais on le signale.
    const proche = existants.find((e) => isSimilarIdentity(row, e));
    if (proche) {
      lignes.push({
        ...base,
        verdict: "DOUBLON_APPROCHE",
        message: `Orthographe proche de ${proche.prenom} ${proche.nom} (${proche.matricule}) — à vérifier`,
        action: "CREER",
        existant: resume(proche),
      });
      continue;
    }

    lignes.push({
      ...base,
      verdict: "NOUVEAU",
      message: classesConnues.has(normalizeName(row.classe))
        ? "Nouvel élève"
        : `Nouvel élève — la classe « ${row.classe} » sera créée`,
      action: "CREER",
    });
  }

  lignes.sort((a, b) => a.ligne - b.ligne);

  const classesInconnues = [
    ...new Set(
      rows.filter((r) => !classesConnues.has(normalizeName(r.classe))).map((r) => r.classe)
    ),
  ];

  return {
    hash,
    lignes,
    resume: {
      total: lignes.length,
      aCreer: lignes.filter((l) => l.action === "CREER").length,
      aMettreAJour: lignes.filter((l) => l.action === "METTRE_A_JOUR").length,
      aIgnorer: lignes.filter((l) => l.action === "IGNORER").length,
      doublons: lignes.filter((l) => l.verdict.startsWith("DOUBLON")).length,
      erreurs: lignes.filter((l) => l.verdict === "ERREUR").length,
      datesAConfirmer: lignes.filter((l) => l.dateApproximative && l.verdict !== "ERREUR").length,
    },
    classesInconnues,
  };
}

// ------------------------------------------------------------
// Matricules
// ------------------------------------------------------------

/**
 * Générateur de matricules pour une année donnée.
 *
 * L'ancienne implémentation partait de `count()` — l'effectif courant. Deux
 * conséquences : après une suppression, le compteur régresse et réattribue un
 * matricule déjà émis ; et à chaque réimport il repart plus haut, produisant
 * des matricules neufs qui échappaient au contrôle anti-doublon.
 *
 * On repart donc du dernier matricule **réellement émis**, fiches archivées
 * comprises : un numéro ne doit jamais être recyclé.
 */
export function matriculeGenerator(annee: number, dernierEmis: string | null) {
  const prefixe = `${annee}-`;
  let compteur = 0;
  if (dernierEmis?.startsWith(prefixe)) {
    const suffixe = parseInt(dernierEmis.slice(prefixe.length), 10);
    if (!isNaN(suffixe)) compteur = suffixe;
  }
  return () => {
    compteur++;
    return `${prefixe}${String(compteur).padStart(4, "0")}`;
  };
}
