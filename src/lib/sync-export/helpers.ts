import ExcelJS from "exceljs";

// ============================================================
// TYPES
// ============================================================

export interface ExportOptions {
  includeBulletins?: boolean;
  includeNotes?: boolean;
  includeEmploiTemps?: boolean;
  includeExamens?: boolean;
  includePersonnel?: boolean;
  includeComptabilite?: boolean;
  includeAbsences?: boolean;
  includeParametres?: boolean;
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  fileCount: number;
  totalRows: number;
}

// ============================================================
// HELPERS COMMUNS
// ============================================================

export const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF4472C4" },
};

export const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 10,
};

export const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" as const },
  left: { style: "thin" as const },
  bottom: { style: "thin" as const },
  right: { style: "thin" as const },
};

/** Nettoie un nom pour un onglet Excel (max 31 chars, pas de caractères interdits). */
export function sanitizeSheetName(name: string): string {
  let cleaned = name.replace(/[/\\?*[\]:]/g, "-").trim();
  if (cleaned.length > 31) cleaned = cleaned.substring(0, 31);
  return cleaned || "Sans nom";
}

/** Crée une feuille avec en-têtes stylisées et auto-filtre. */
export function createStyledSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  columns: { header: string; key: string; width?: number }[]
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(sanitizeSheetName(sheetName), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width ?? 18,
  }));

  // Style en-tête
  const headerRow = sheet.getRow(1);
  headerRow.font = HEADER_FONT;
  headerRow.fill = HEADER_FILL;
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;

  // Auto-filtre
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  return sheet;
}

/** Ajoute des lignes à une feuille et applique les bordures. */
export function addRowsWithBorders(
  sheet: ExcelJS.Worksheet,
  rows: Record<string, any>[]
): void {
  for (const row of rows) {
    sheet.addRow(row);
  }
  // Bordures sur toutes les cellules
  for (let i = 1; i <= sheet.rowCount; i++) {
    const r = sheet.getRow(i);
    for (let j = 1; j <= sheet.columnCount; j++) {
      const cell = r.getCell(j);
      cell.border = THIN_BORDER;
      if (i > 1) {
        cell.alignment = { vertical: "middle", wrapText: true };
      }
    }
  }
}

/** Groupe des éléments par clé et retourne un Map. */
export function groupBy<T>(arr: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

/** Formate une date pour Excel. */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("fr-FR");
}

/** Formate une date+heure pour Excel. */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("fr-FR");
}
