"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText, ChevronDown } from "lucide-react";
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
    window.print();
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
              <Download className="h-4 w-4" />
              Imprimer / PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}
