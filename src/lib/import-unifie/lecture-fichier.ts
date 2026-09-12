import ExcelJS from "exceljs";
import { createHash } from "crypto";
import { type FichierLu } from "./types";

/**
 * Lit un fichier Excel ou CSV et retourne les en-têtes + lignes brutes.
 */
export async function lireFichier(
  buffer: Buffer,
  mimeType: string
): Promise<FichierLu> {
  const wb = new ExcelJS.Workbook();

  if (mimeType.includes("csv") || mimeType.includes("text/plain")) {
    // ExcelJS CSV loading via read stream
    const { Readable } = await import("stream");
    const stream = Readable.from([buffer.toString("utf-8")]);
    await wb.csv.read(stream);
  } else {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  }

  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  const headers: string[] = [];
  const rows: Record<string, string>[] = [];

  // Première ligne = en-têtes
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").trim();
  });

  // Lignes de données
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj: Record<string, string> = {};
    let hasData = false;

    headers.forEach((header, i) => {
      if (!header) return;
      const cell = row.getCell(i + 1);
      const value = String(cell.value ?? "").trim();
      obj[header] = value;
      if (value) hasData = true;
    });

    if (hasData) rows.push(obj);
  }

  return { headers, rows };
}

/** Calcule l'empreinte SHA-256 d'un fichier. */
export function empreinteFichier(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
