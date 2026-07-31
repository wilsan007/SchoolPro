"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";

interface ImportSummary {
  totalRows: number;
  imported: number;
  skipped: number;
  structuresCreated: number;
  classesCreated: number;
  errors?: string[];
}

export function ImportElevesDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("import");
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import/eleves", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'import");
      }
      setResult(data.summary);
      toast.success(t("success"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setImporting(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      const ext = selected.name.split(".").pop()?.toLowerCase();
      if (ext !== "xlsx" && ext !== "xls") {
        toast.error(t("invalidFormat"));
        return;
      }
      setFile(selected);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              {t("title")}
            </h2>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">{t("description")}</p>

          {/* Format attendu */}
          <div className="rounded-lg border bg-muted/50 p-3 text-xs space-y-1">
            <p className="font-semibold">{t("expectedFormat")}</p>
            <p className="text-muted-foreground">{t("columns")}</p>
            <p className="text-muted-foreground mt-1">{t("nomFormat")}</p>
          </div>

          {/* Upload zone */}
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                <span className="font-medium">{file.name}</span>
                <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="h-8 w-8" />
                <p className="text-sm">{t("dropzone")}</p>
              </div>
            )}
          </div>

          {/* Résultat */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 rounded-lg border p-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-semibold">{result.imported}</p>
                    <p className="text-xs text-muted-foreground">{t("imported")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border p-3">
                  <AlertCircle className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="text-sm font-semibold">{result.skipped}</p>
                    <p className="text-xs text-muted-foreground">{t("skipped")}</p>
                  </div>
                </div>
              </div>

              {(result.structuresCreated > 0 || result.classesCreated > 0) && (
                <div className="rounded-lg border bg-primary/5 p-3 text-xs space-y-1">
                  <p className="font-semibold">{t("autoCreated")}</p>
                  {result.structuresCreated > 0 && (
                    <p>• {result.structuresCreated} {t("structuresCreated")}</p>
                  )}
                  {result.classesCreated > 0 && (
                    <p>• {result.classesCreated} {t("classesCreated")}</p>
                  )}
                </div>
              )}

              {result.errors && result.errors.length > 0 && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs space-y-1 max-h-32 overflow-y-auto">
                  <p className="font-semibold text-orange-800">{t("warnings")}</p>
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-orange-700">{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("close")}
            </Button>
            <Button
              size="sm"
              className="gap-2"
              onClick={handleImport}
              disabled={!file || importing}
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t("importButton")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
