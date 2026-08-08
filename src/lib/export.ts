/**
 * EcolPro — Helper d'export réutilisable (Excel, CSV, PDF)
 * Utilisé par ExportMenu.tsx et les routes API d'export.
 */

import ExcelJS from "exceljs";

export interface ExportColumn<T> {
  header: string;
  key: keyof T & string;
  width?: number;
  format?: (value: any, row: T) => string;
}

/**
 * Exporte un tableau de données en fichier Excel (.xlsx) et déclenche le téléchargement côté navigateur.
 * Côté serveur (route API), utilise `exportExcelBuffer` à la place.
 */
export async function exportToExcel<T extends Record<string, any>>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string
): Promise<void> {
  const buffer = await exportExcelBuffer(rows, columns);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, `${filename}.xlsx`);
}

/**
 * Génère un buffer Excel (pour usage côté serveur / route API).
 */
export async function exportExcelBuffer<T extends Record<string, any>>(
  rows: T[],
  columns: ExportColumn<T>[]
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Export");

  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width ?? 18,
  }));

  // En-tête en gras
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

  for (const row of rows) {
    const excelRow = sheet.addRow({});
    for (const col of columns) {
      const rawValue = row[col.key];
      excelRow.getCell(col.key).value = col.format ? col.format(rawValue, row) : (rawValue ?? "");
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * Génère un buffer Excel multi-feuilles — une feuille par groupe.
 * Chaque groupe est identifié par sa clé `groupKey` (ex: nom de la classe).
 */
export async function exportExcelMultiSheetBuffer<T extends Record<string, any>>(
  rows: T[],
  columns: ExportColumn<T>[],
  groupKey: keyof T & string,
  options?: { sheetNameLabel?: (value: any, row: T) => string }
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();

  // Grouper les lignes par valeur de groupKey
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const rawValue = row[groupKey];
    const label = options?.sheetNameLabel ? options.sheetNameLabel(rawValue, row) : String(rawValue ?? "Sans classe");
    const safeName = sanitizeSheetName(label);
    if (!groups.has(safeName)) {
      groups.set(safeName, []);
    }
    groups.get(safeName)!.push(row);
  }

  // Si un seul groupe ou aucun, créer au moins une feuille
  if (groups.size === 0) {
    const sheet = workbook.addWorksheet("Aucune donnée");
    sheet.getCell("A1").value = "Aucune donnée à exporter";
  }

  for (const [sheetName, groupRows] of groups) {
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width ?? 18,
    }));

    // En-tête en gras
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

    for (const row of groupRows) {
      const excelRow = sheet.addRow({});
      for (const col of columns) {
        const rawValue = row[col.key];
        excelRow.getCell(col.key).value = col.format ? col.format(rawValue, row) : (rawValue ?? "");
      }
    }

    // Auto-filtre sur l'en-tête
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * Nettoie un nom pour qu'il soit valide comme nom de feuille Excel.
 * Excel limite à 31 caractères et interdit : \ / ? * [ ] :
 */
function sanitizeSheetName(name: string): string {
  let cleaned = name.replace(/[/\\?*[\]:]/g, "-").trim();
  if (cleaned.length > 31) {
    cleaned = cleaned.substring(0, 31);
  }
  return cleaned || "Sans nom";
}

/**
 * Exporte en CSV (côté navigateur).
 */
export function exportToCsv<T extends Record<string, any>>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string
): void {
  const headers = columns.map((c) => c.header);
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const value = col.format ? col.format(row[col.key], row) : (row[col.key] ?? "");
        const str = String(value).replace(/"/g, '""');
        return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str}"` : str;
      })
      .join(",")
  );

  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${filename}.csv`);
}

/**
 * Déclenche le téléchargement d'un blob côté navigateur.
 */
function triggerDownload(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
