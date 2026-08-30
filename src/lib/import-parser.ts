import ExcelJS from "exceljs";
import Papa from "papaparse";
import JSZip from "jszip";
import { normalizeText, normalizeHeure } from "@/lib/text-match";
import { timeToMinutes, minutesToTime } from "@/lib/grid-config";

// ============================================================
// Parser multi-format d'emplois du temps
// ============================================================
//
// Formats de fichiers supportés :
//   .xlsx  → Excel (exceljs)
//   .csv   → CSV / texte tabulé (papaparse)
//   .txt   → idem CSV
//   .docx  → Word (jszip : extraction XML de word/document.xml)
//
// Deux représentations de données sont reconnues automatiquement :
//
//   FORMAT LISTE (round-trip avec l'export) — une ligne = un créneau :
//     Jour | Heure début | Heure fin | Matière | Classe | Enseignant | Salle
//
//   FORMAT GRILLE (tableau visuel) — une cellule = un créneau :
//     Horaire      | Lundi                    | Mardi          | ...
//     08:00-09:00  | Mathématiques / M. Ahmed | Français / Mme Fatima
//     Cellule = "Matière / Enseignant / Salle" (séparateurs : / | \n ; —)
//
// Détection automatique :
//   - colonne "Horaire/Heure/Créneau" + ≥ 2 colonnes de jours → grille
//   - colonnes "Jour + Heure début + Matière" → liste
//
// Détection intelligente du contenu :
//   - Récréation/Pause (recreation, pause, déjeuner, libre, break…) → ignoré
//   - Évaluation (evaluation, examen, devoir, composition…) → isEvaluation
//
// Snapping à la grille : les heures importées sont alignées sur les slots
// de la grille de la classe cible (arrondi inférieur pour le début,
// supérieur pour la fin).

/** Type de structure pour le snapping (10 ou 30 min). Importé en type seul. */
export type StructureTypeLike = "MATERNELLE" | "PRIMAIRE" | "COLLEGE" | "LYCEE" | string;

/** Jour canonique (enum Prisma Jour). */
export type Jour = "DIMANCHE" | "LUNDI" | "MARDI" | "MERCREDI" | "JEUDI" | "VENDREDI" | "SAMEDI";

/** Créneau brut extrait du fichier, avant matching avec la base. */
export interface RawCreneau {
  jour: Jour;
  heureDebut: string; // "08:00"
  heureFin: string; // "09:00"
  matiere: string; // nom brut (peut inclure un niveau : "Lecture 1")
  enseignant: string | null;
  salle: string | null;
  isEvaluation: boolean;
  isRecreation: boolean;
  /** Ligne/indice d'origine pour le débogage. */
  sourceLine?: number;
}

/** Résultat du parsing d'un fichier. */
export interface ParseResult {
  creneaux: RawCreneau[];
  /** Format détecté : "liste" | "grille" | "inconnu". */
  format: "liste" | "grille" | "inconnu";
  /** Métadonnées extraites du .docx (classe/année détectées dans le texte). */
  metaClasse: string | null;
  metaAnnee: string | null;
  /** Avertissements non bloquants. */
  warnings: string[];
}

// ------------------------------------------------------------
// Jours — détection depuis un libellé de colonne ou de cellule
// ------------------------------------------------------------

const JOUR_KEYWORDS: Record<Jour, string[]> = {
  DIMANCHE: ["dimanche", "dim", "sunday", "sun"],
  LUNDI: ["lundi", "lun", "monday", "mon"],
  MARDI: ["mardi", "mar", "tuesday", "tue"],
  MERCREDI: ["mercredi", "mer", "wednesday", "wed"],
  JEUDI: ["jeudi", "jeu", "thursday", "thu"],
  VENDREDI: ["vendredi", "ven", "friday", "fri"],
  SAMEDI: ["samedi", "sam", "saturday", "sat"],
};

const ALL_JOURS: Jour[] = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];

/** Résout un libellé de jour ("Lundi", "lun", "Monday") vers l'enum Jour. */
export function detectJour(libelle: string): Jour | null {
  const n = normalizeText(libelle);
  for (const jour of ALL_JOURS) {
    if (JOUR_KEYWORDS[jour].some((kw) => n === kw || n.startsWith(kw))) return jour;
  }
  return null;
}

// ------------------------------------------------------------
// Détection du type de contenu d'une cellule
// ------------------------------------------------------------

const RECREATION_KEYWORDS = [
  "recreation", "recree", "pause", "dejeuner", "libre", "break", "recess", "lunch", "rest", "intercours",
];
const EVALUATION_KEYWORDS = [
  "evaluation", "examen", "controle", "devoir", "composition", "interrogation", "test", "quiz",
];

/** "recreation" | "evaluation" | "cours" */
export type CellType = "recreation" | "evaluation" | "cours";

/** Détecte si une cellule est une récréation, une évaluation ou un cours. */
export function detectCellType(text: string): CellType {
  const n = normalizeText(text);
  if (!n) return "cours";
  if (RECREATION_KEYWORDS.some((kw) => n.includes(kw))) return "recreation";
  if (EVALUATION_KEYWORDS.some((kw) => n.includes(kw))) return "evaluation";
  return "cours";
}

// ------------------------------------------------------------
// Parsing du niveau de matière : "Lecture 1" → { nom: "Lecture", niveau: "1" }
// ------------------------------------------------------------

export function parseMatiereNiveau(text: string): { nom: string; niveau: string | null } {
  const trimmed = text.trim();
  // "Lecture 1" / "Lecture 2" / "Maths 3"
  const m = trimmed.match(/^(.+?)\s+(\d+)$/);
  if (m) return { nom: m[1].trim(), niveau: m[2] };
  return { nom: trimmed, niveau: null };
}

// ------------------------------------------------------------
// Snapping à la grille
// ------------------------------------------------------------

/**
 * Aligne une heure sur les slots de la grille.
 * @param time "HH:MM" (ou "8h", "8:00"… via normalizeHeure)
 * @param stepMinutes pas de la grille (10 ou 30)
 * @param direction "down" = arrondi inférieur (pour le début),
 *                  "up" = arrondi supérieur (pour la fin)
 */
export function snapTimeToGrid(
  time: string,
  stepMinutes: number,
  direction: "down" | "up",
): string {
  const normalized = normalizeHeure(time) ?? time;
  const total = timeToMinutes(normalized);
  const snapped =
    direction === "down"
      ? Math.floor(total / stepMinutes) * stepMinutes
      : Math.ceil(total / stepMinutes) * stepMinutes;
  return minutesToTime(snapped);
}

// ------------------------------------------------------------
// Parsing d'une plage horaire de cellule grille : "08:00-09:00" / "8h-9h"
// ------------------------------------------------------------

/** Extrait début/fin d'une plage "08:00-09:00" ou "8h - 9h30". */
export function parsePlageHoraire(plage: string): { debut: string; fin: string } | null {
  const parts = plage.split(/[-–—àa]/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const debut = normalizeHeure(parts[0]);
  const fin = normalizeHeure(parts[1]);
  if (!debut || !fin) return null;
  return { debut, fin };
}

// ------------------------------------------------------------
// Découpage d'une cellule grille : "Matière / Enseignant / Salle"
// ------------------------------------------------------------

const CELL_SEPARATORS = /\s*[\/|;\n—–]\s*/;

/** Découpe une cellule grille en [matière, enseignant?, salle?]. */
export function splitCelluleGrille(cell: string): { matiere: string; enseignant: string | null; salle: string | null } {
  const parts = cell.split(CELL_SEPARATORS).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { matiere: "", enseignant: null, salle: null };
  return {
    matiere: parts[0],
    enseignant: parts[1] ?? null,
    salle: parts[2] ?? null,
  };
}

// ------------------------------------------------------------
// Détection du format (liste vs grille)
// ------------------------------------------------------------

const HORAIRE_COL_KEYWORDS = ["horaire", "heure", "creneau", "horaires", "time", "slot", "plage"];
const JOUR_COL_KEYWORDS = ["jour", "day"];
const HEURE_DEBUT_KEYWORDS = ["heure debut", "heure de debut", "debut", "start", "heure d", "h debut"];
const HEURE_FIN_KEYWORDS = ["heure fin", "heure de fin", "fin", "end", "h fin"];
const MATIERE_COL_KEYWORDS = ["matiere", "subject", "discipline", "cours"];

function colMatches(header: string, keywords: string[]): boolean {
  const n = normalizeText(header);
  return keywords.some((kw) => n === kw || n.includes(kw));
}

/**
 * Détecte le format à partir de la ligne d'en-tête.
 * - grille : une colonne "Horaire/Heure/Créneau" + ≥ 2 colonnes de jours
 * - liste : colonnes "Jour" + "Heure début" + "Matière"
 */
export function detectFormat(headers: string[]): "liste" | "grille" | "inconnu" {
  const hasHoraireCol = headers.some((h) => colMatches(h, HORAIRE_COL_KEYWORDS));
  const dayColumns = headers.filter((h) => detectJour(h) !== null);
  const hasJourCol = headers.some((h) => colMatches(h, JOUR_COL_KEYWORDS));
  const hasHeureDebut = headers.some((h) => colMatches(h, HEURE_DEBUT_KEYWORDS));
  const hasMatiereCol = headers.some((h) => colMatches(h, MATIERE_COL_KEYWORDS));

  if (hasHoraireCol && dayColumns.length >= 2) return "grille";
  if (hasJourCol && hasHeureDebut && hasMatiereCol) return "liste";
  // Heuristique de repli : beaucoup de colonnes de jours → grille
  if (dayColumns.length >= 3) return "grille";
  return "inconnu";
}

// ------------------------------------------------------------
// Parsing format LISTE
// ------------------------------------------------------------

function parseListeFormat(rows: string[][]): RawCreneau[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => normalizeText(h));
  const findCol = (keywords: string[]): number =>
    headers.findIndex((h) => keywords.some((kw) => h === kw || h.includes(kw)));

  const idxJour = findCol(JOUR_COL_KEYWORDS);
  const idxDebut = findCol(HEURE_DEBUT_KEYWORDS);
  const idxFin = findCol(HEURE_FIN_KEYWORDS);
  const idxMatiere = findCol(MATIERE_COL_KEYWORDS);
  const idxEnseignant = headers.findIndex((h) => h.includes("enseignant") || h.includes("teacher") || h.includes("prof"));
  const idxSalle = headers.findIndex((h) => h === "salle" || h.includes("salle") || h.includes("room"));

  if (idxJour < 0 || idxDebut < 0 || idxMatiere < 0) return [];

  const creneaux: RawCreneau[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c.trim())) continue;
    const jourLibelle = row[idxJour] ?? "";
    const jour = detectJour(jourLibelle);
    if (!jour) continue;
    const debut = normalizeHeure(row[idxDebut] ?? "");
    const fin = idxFin >= 0 ? normalizeHeure(row[idxFin] ?? "") : null;
    if (!debut) continue;
    const matiereBrut = (row[idxMatiere] ?? "").trim();
    if (!matiereBrut) continue;
    const type = detectCellType(matiereBrut);
    if (type === "recreation") continue;
    creneaux.push({
      jour,
      heureDebut: debut,
      heureFin: fin ?? "",
      matiere: type === "evaluation" ? "Évaluation" : matiereBrut,
      enseignant: idxEnseignant >= 0 ? (row[idxEnseignant]?.trim() || null) : null,
      salle: idxSalle >= 0 ? (row[idxSalle]?.trim() || null) : null,
      isEvaluation: type === "evaluation",
      isRecreation: false,
      sourceLine: i + 1,
    });
  }
  return creneaux;
}

// ------------------------------------------------------------
// Parsing format GRILLE
// ------------------------------------------------------------

function parseGrilleFormat(rows: string[][]): RawCreneau[] {
  if (rows.length < 2) return [];
  const headers = rows[0];
  // Index de la colonne horaire
  const idxHoraire = headers.findIndex((h) => colMatches(h, HORAIRE_COL_KEYWORDS));
  if (idxHoraire < 0) return [];
  // Colonnes de jours : header → Jour
  const jourCols: { idx: number; jour: Jour }[] = [];
  headers.forEach((h, idx) => {
    if (idx === idxHoraire) return;
    const j = detectJour(h);
    if (j) jourCols.push({ idx, jour: j });
  });
  if (jourCols.length === 0) return [];

  const creneaux: RawCreneau[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c.trim())) continue;
    const plageRaw = row[idxHoraire] ?? "";
    const plage = parsePlageHoraire(plageRaw);
    if (!plage) continue;
    for (const { idx, jour } of jourCols) {
      const cell = (row[idx] ?? "").trim();
      if (!cell) continue;
      const type = detectCellType(cell);
      if (type === "recreation") continue;
      const { matiere, enseignant, salle } = splitCelluleGrille(cell);
      if (!matiere) continue;
      creneaux.push({
        jour,
        heureDebut: plage.debut,
        heureFin: plage.fin,
        matiere: type === "evaluation" ? "Évaluation" : matiere,
        enseignant,
        salle,
        isEvaluation: type === "evaluation",
        isRecreation: false,
        sourceLine: i + 1,
      });
    }
  }
  return creneaux;
}

// ------------------------------------------------------------
// Extraction de tableaux depuis le XML d'un .docx
// ------------------------------------------------------------

/** Extrait tous les <w:t> d'un fragment XML, concaténés. */
function extractTextFromXml(xml: string): string {
  const matches = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [];
  return matches.map((m) => m.replace(/<w:t[^>]*>/, "").replace(/<\/w:t>/, "")).join("");
}

/** Extrait le texte hors tables (pour les métadonnées : classe, année). */
function extractTextOutsideTables(xml: string): string {
  // Retire les <w:tbl>...</w:tbl> puis extrait le texte restant.
  const withoutTables = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, " ");
  return extractTextFromXml(withoutTables);
}

/** Extrait les tableaux d'un XML .docx en matrices de strings. */
function extractTablesFromXml(xml: string): string[][][] {
  const tables: string[][][] = [];
  const tblRegex = /<w:tbl>([\s\S]*?)<\/w:tbl>/g;
  let tblMatch: RegExpExecArray | null;
  while ((tblMatch = tblRegex.exec(xml)) !== null) {
    const tblContent = tblMatch[1];
    const rows: string[][] = [];
    const trRegex = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRegex.exec(tblContent)) !== null) {
      const trContent = trMatch[1];
      const cells: string[] = [];
      const tcRegex = /<w:tc[^>]*>([\s\S]*?)<\/w:tc>/g;
      let tcMatch: RegExpExecArray | null;
      while ((tcMatch = tcRegex.exec(trContent)) !== null) {
        cells.push(extractTextFromXml(tcMatch[1]).trim());
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables;
}

/** Détecte la classe et l'année dans un texte libre .docx. */
function detectMeta(text: string): { classe: string | null; annee: string | null } {
  const n = text;
  // "classe : 6ème A" / "classe: 6eme A" / "Classe : Terminale S"
  const classeMatch = n.match(/classe\s*[:\-]\s*([^\n\r,;]{2,40})/i);
  // "année scolaire : 2026-2027" / "annee scolaire 2026-2027"
  const anneeMatch = n.match(/ann[eé]e\s*scolaire\s*[:\-]?\s*(\d{4}\s*[-–]\s*\d{4})/i);
  return {
    classe: classeMatch ? classeMatch[1].trim() : null,
    annee: anneeMatch ? anneeMatch[1].replace(/\s+/g, "") : null,
  };
}

// ------------------------------------------------------------
// Parsing par format de fichier
// ------------------------------------------------------------

/** Convertit une matrice de cellules en rows[][] de strings. */
type RowMatrix = string[][];

async function parseExcel(buffer: Buffer): Promise<RowMatrix[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs déclare `load(buffer: Buffer)` avec le Buffer non-générique des
  // @types/node historiques ; avec @types/node ≥ 20, Buffer est devenu
  // générique (Buffer<ArrayBufferLike>) et n'est plus assignable statiquement
  // au type attendu, bien que ce soit le même objet au runtime. Cast `any`
  // justifié par friction de types tiers (règle 4 AGENTS.md) : l'objet est
  // bien un Buffer au runtime, aucune sûreté métier n'est perdue.
  await workbook.xlsx.load(buffer as unknown as never);
  const sheets: RowMatrix[] = [];
  for (const sheet of workbook.worksheets) {
    const rows: RowMatrix = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        values[colNumber - 1] = String(cell.value ?? "").trim();
      });
      // retire les colonnes vides de fin
      while (values.length > 0 && !values[values.length - 1]) values.pop();
      if (values.length > 0) rows.push(values);
    });
    if (rows.length > 0) sheets.push(rows);
  }
  return sheets;
}

function parseCsvText(text: string): RowMatrix[] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimiter: "" });
  const rows = (result.data as string[][]).map((r) => r.map((c) => c.trim()));
  return [rows.filter((r) => r.some((c) => c))];
}

async function parseDocx(buffer: Buffer): Promise<{
  sheets: RowMatrix[];
  metaClasse: string | null;
  metaAnnee: string | null;
}> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return { sheets: [], metaClasse: null, metaAnnee: null };
  const xml = await docFile.async("string");
  const meta = detectMeta(extractTextOutsideTables(xml));
  const tables = extractTablesFromXml(xml);
  // La table avec le plus de colonnes (en moyenne) est la grille horaire.
  const sheets = tables.map((t) => t);
  return { sheets, metaClasse: meta.classe, metaAnnee: meta.annee };
}

// ------------------------------------------------------------
// Point d'entrée principal
// ------------------------------------------------------------

/**
 * Parse un fichier d'emploi du temps et renvoie les créneaux bruts.
 *
 * @param buffer contenu du fichier
 * @param filename nom (pour détecter l'extension)
 * @param stepMinutes pas de grille pour le snapping (10 ou 30). Si null,
 *   pas de snapping (les heures sont conservées telles quelles, juste
 *   normalisées en "HH:MM").
 */
export async function parseEmploiFile(
  buffer: Buffer,
  filename: string,
  stepMinutes: number | null = null,
): Promise<ParseResult> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const warnings: string[] = [];
  let sheets: RowMatrix[] = [];
  let metaClasse: string | null = null;
  let metaAnnee: string | null = null;

  try {
    if (ext === "xlsx") {
      sheets = await parseExcel(buffer);
    } else if (ext === "csv" || ext === "txt") {
      sheets = parseCsvText(buffer.toString("utf-8"));
    } else if (ext === "docx" || ext === "doc") {
      const docx = await parseDocx(buffer);
      sheets = docx.sheets;
      metaClasse = docx.metaClasse;
      metaAnnee = docx.metaAnnee;
    } else {
      return {
        creneaux: [],
        format: "inconnu",
        metaClasse: null,
        metaAnnee: null,
        warnings: [`Format non supporté : .${ext} (acceptés : .xlsx, .csv, .txt, .docx)`],
      };
    }
  } catch (err) {
    return {
      creneaux: [],
      format: "inconnu",
      metaClasse: null,
      metaAnnee: null,
      warnings: [`Erreur de lecture du fichier : ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  if (sheets.length === 0) {
    return { creneaux: [], format: "inconnu", metaClasse, metaAnnee, warnings: ["Aucune donnée trouvée dans le fichier."] };
  }

  // Choisir la feuille/table la plus pertinente : celle dont l'en-tête
  // détecte un format connu. Pour .docx, parseDocx a déjà sélectionné les
  // tables ; on prend celle avec le plus de colonnes si plusieurs.
  let bestSheet = sheets[0];
  let bestFormat: "liste" | "grille" | "inconnu" = "inconnu";
  for (const sheet of sheets) {
    if (sheet.length === 0) continue;
    const fmt = detectFormat(sheet[0]);
    if (fmt !== "inconnu") {
      bestSheet = sheet;
      bestFormat = fmt;
      break;
    }
    // repli : la table avec le plus de colonnes
    const maxCols = Math.max(...sheet.map((r) => r.length));
    const bestMaxCols = Math.max(...bestSheet.map((r) => r.length));
    if (maxCols > bestMaxCols) bestSheet = sheet;
  }
  if (bestFormat === "inconnu") {
    bestFormat = detectFormat(bestSheet[0] ?? []);
  }

  let creneaux: RawCreneau[] = [];
  if (bestFormat === "liste") {
    creneaux = parseListeFormat(bestSheet);
  } else if (bestFormat === "grille") {
    creneaux = parseGrilleFormat(bestSheet);
  } else {
    // Tentative : essayer les deux parseurs sur la première feuille.
    const asListe = parseListeFormat(bestSheet);
    const asGrille = parseGrilleFormat(bestSheet);
    if (asGrille.length >= asListe.length && asGrille.length > 0) {
      creneaux = asGrille;
      bestFormat = "grille";
    } else if (asListe.length > 0) {
      creneaux = asListe;
      bestFormat = "liste";
    } else {
      warnings.push("Impossible de reconnaître la structure du tableau (ni format liste, ni format grille).");
    }
  }

  // Snapping à la grille si un pas est fourni.
  if (stepMinutes && creneaux.length > 0) {
    creneaux = creneaux.map((c) => ({
      ...c,
      heureDebut: snapTimeToGrid(c.heureDebut, stepMinutes, "down"),
      heureFin: c.heureFin ? snapTimeToGrid(c.heureFin, stepMinutes, "up") : c.heureFin,
    }));
  }

  if (creneaux.length === 0 && bestFormat !== "inconnu") {
    warnings.push("Aucun créneau exploitable extrait du fichier.");
  }

  return { creneaux, format: bestFormat, metaClasse, metaAnnee, warnings };
}
