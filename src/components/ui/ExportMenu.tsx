"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText, ChevronDown, Printer } from "lucide-react";
import { exportToExcel, exportToCsv, type ExportColumn } from "@/lib/export";

interface ExportMenuProps<T extends Record<string, any>> {
  rows: T[];
  columns: ExportColumn<T>[];
  filename: string;
  disabled?: boolean;
}

export function ExportMenu<T extends Record<string, any>>({
  rows,
  columns,
  filename,
  disabled,
}: ExportMenuProps<T>) {
  const [open, setOpen] = useState(false);

  async function handleExcel() {
    setOpen(false);
    await exportToExcel(rows, columns, filename);
  }

  function handleCsv() {
    setOpen(false);
    exportToCsv(rows, columns, filename);
  }

  function handlePrint() {
    setOpen(false);
    const w = window.open("", "_blank");
    if (!w) return;

    const headers = columns.map((c) => `<th style="padding:8px;border-bottom:2px solid #e5e7eb;text-align:left;font-size:12px;background:#f9fafb">${c.header}</th>`).join("");
    const body = rows
      .map((row) => {
        const cells = columns
          .map((col) => {
            const raw = row[col.key];
            const value = col.format ? col.format(raw, row) : (raw ?? "");
            return `<td style="padding:8px;border-bottom:1px solid #f3f4f6;font-size:12px">${value}</td>`;
          })
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${filename}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; color: #111827; }
    h1 { font-size: 18px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    .print-btn { display: block; margin: 16px auto; padding: 10px 24px; background: #1e40af; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
    .print-btn:hover { background: #1e3a8a; }
    @media print { .print-btn { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${filename}</h1>
  <table>
    <thead><tr>${headers}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  <button class="print-btn" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
</body>
</html>`;

    w.document.write(html);
    w.document.close();
    w.focus();
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={disabled || rows.length === 0}
        onClick={() => setOpen(!open)}
      >
        <Download className="h-4 w-4" />
        Exporter
        <ChevronDown className="h-3 w-3" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-44 bg-popover border rounded-lg shadow-lg py-1 z-50">
            <button
              onClick={handleExcel}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-600" />
              Excel (.xlsx)
            </button>
            <button
              onClick={handleCsv}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <FileText className="h-4 w-4 text-blue-600" />
              CSV
            </button>
            <div className="border-t my-1" />
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <Printer className="h-4 w-4" />
              Imprimer / PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}
