"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface ModeleInfo {
  type: string;
  icon: string;
  labelKey: string;
  descKey: string;
}

const MODELES: ModeleInfo[] = [
  { type: "eleves", icon: "🎒", labelKey: "eleves", descKey: "elevesDesc" },
  { type: "enseignants", icon: "👨‍🏫", labelKey: "enseignants", descKey: "enseignantsDesc" },
  { type: "personnel-admin", icon: "🏢", labelKey: "personnelAdmin", descKey: "personnelAdminDesc" },
  { type: "classes", icon: "🏫", labelKey: "classes", descKey: "classesDesc" },
  { type: "matieres", icon: "📚", labelKey: "matieres", descKey: "matieresDesc" },
  { type: "parents", icon: "👨‍👩‍👧", labelKey: "parents", descKey: "parentsDesc" },
  { type: "edt-externes", icon: "📅", labelKey: "edtExternes", descKey: "edtExternesDesc" },
];

// Types qui supportent l'import (apply) en plus du téléchargement de modèle
const TYPES_AVEC_IMPORT: Record<string, string> = {
  enseignants: "/api/import/enseignants/apply",
  "personnel-admin": "/api/import/personnel-admin/apply",
};

interface Props {
  canManage: boolean;
  siteId?: string | null;
}

export function ImportModelesTab({ canManage, siteId }: Props) {
  const t = useTranslations("importModeles");
  const [uploading, setUploading] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function downloadModele(type: string) {
    setDownloading(type);
    try {
      const res = await fetch(`/api/import/modele/${type}`);
      if (!res.ok) throw new Error("Erreur lors du téléchargement");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `modele_import_${type}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("downloaded"));
    } catch {
      toast.error(t("downloadError"));
    } finally {
      setDownloading(null);
    }
  }

  async function uploadFile(type: string, file: File) {
    setUploading(type);
    try {
      const endpoint = TYPES_AVEC_IMPORT[type];
      if (!endpoint) {
        toast.error(t("importNotSupported"));
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      if (siteId) formData.append("siteId", siteId);

      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "ENTETES_NON_CONFORMES") {
          toast.error(t("headersMismatch"), {
            description: data.message,
            duration: 8000,
          });
        } else {
          toast.error(data.message || data.error || t("importError"));
        }
        return;
      }

      const s = data.summary;
      toast.success(
        t("importSuccess", {
          created: s.created,
          updated: s.updated,
          errors: s.errors,
        }),
        {
          description: s.details?.slice(0, 3).join("\n"),
          duration: 6000,
        }
      );
    } catch {
      toast.error(t("importError"));
    } finally {
      setUploading(null);
      // Reset input
      if (fileInputRefs.current[type]) {
        fileInputRefs.current[type]!.value = "";
      }
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            {t("title")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MODELES.map((modele) => {
              const hasImport = !!TYPES_AVEC_IMPORT[modele.type];
              return (
                <div
                  key={modele.type}
                  className="flex flex-col gap-3 p-4 rounded-xl border bg-card hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">{modele.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{t(modele.labelKey)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t(modele.descKey)}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => downloadModele(modele.type)}
                      disabled={downloading === modele.type}
                    >
                      {downloading === modele.type ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      {t("download")}
                    </Button>

                    {canManage && hasImport && (
                      <>
                        <input
                          ref={(el) => { fileInputRefs.current[modele.type] = el; }}
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadFile(modele.type, f);
                          }}
                        />
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => fileInputRefs.current[modele.type]?.click()}
                          disabled={uploading === modele.type}
                        >
                          {uploading === modele.type ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          {t("import")}
                        </Button>
                      </>
                    )}
                  </div>

                  {hasImport ? (
                    <Badge variant="outline" className="text-[10px] w-fit gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      {t("importReady")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] w-fit gap-1">
                      <AlertCircle className="h-3 w-3 text-amber-500" />
                      {t("modelOnly")}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
            <p className="text-sm text-muted-foreground">
              <strong>{t("howToTitle")}</strong>
            </p>
            <ol className="mt-2 space-y-1 text-sm text-muted-foreground list-decimal list-inside">
              <li>{t("howTo1")}</li>
              <li>{t("howTo2")}</li>
              <li>{t("howTo3")}</li>
              <li>{t("howTo4")}</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
