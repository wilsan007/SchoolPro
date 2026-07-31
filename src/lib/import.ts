/**
 * EcolPro — Helper d'import réutilisable (CSV, Excel)
 * Utilise papaparse pour CSV et exceljs pour Excel.
 */

import Papa from "papaparse";
import ExcelJS from "exceljs";

export interface ImportResult<T> {
  rows: T[];
  errors: string[];
  totalRows: number;
}

/**
 * Parse un fichier CSV en tableau d'objets typés.
 * Côté navigateur (input file) ou serveur (Buffer).
 */
export function parseCsv<T extends Record<string, any>>(
  file: File | string,
  mapping: Record<string, string>
): Promise<ImportResult<T>> {
  return new Promise((resolve) => {
    const errors: string[] = [];

    Papa.parse(file as any, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errorsList = [
          ...(results.errors || []).map((e) => `Ligne ${e.row}: ${e.message}`),
          ...errors,
        ];
        const rows = (results.data as Record<string, any>[]).map((raw, i) => {
          const mapped: Record<string, any> = {};
          for (const [csvKey, modelKey] of Object.entries(mapping)) {
            mapped[modelKey] = raw[csvKey] ?? null;
          }
          return mapped as T;
        });
        resolve({ rows, errors: errorsList, totalRows: rows.length });
      },
      error: (err) => {
        resolve({ rows: [], errors: [err.message], totalRows: 0 });
      },
    });
  });
}

/**
 * Parse un fichier Excel (.xlsx) en tableau d'objets typés.
 * Côté navigateur (input file) — utilise exceljs en mode navigateur.
 */
export async function parseExcel<T extends Record<string, any>>(
  file: File,
  mapping: Record<string, string>
): Promise<ImportResult<T>> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], errors: ["Aucune feuille trouvée"], totalRows: 0 };
  }

  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").trim();
  });

  const rows: T[] = [];
  const errors: string[] = [];

  for (let i = 2; i <= sheet.rowCount; i++) {
    const raw: Record<string, any> = {};
    sheet.getRow(i).eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) raw[header] = cell.value;
    });

    const mapped: Record<string, any> = {};
    for (const [excelKey, modelKey] of Object.entries(mapping)) {
      mapped[modelKey] = raw[excelKey] ?? null;
    }
    rows.push(mapped as T);
  }

  return { rows, errors, totalRows: rows.length };
}
