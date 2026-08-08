"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { exportExcelMultiSheetBuffer, type ExportColumn } from "@/lib/export";

interface Eleve {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  sexe: string;
  statut: string;
  regime: string | null;
  classe: { nom: string; niveau: string } | null;
  parents: Array<{
    parent: { nom: string; prenom: string; phone: string };
  }>;
}

interface ElevesActionsProps {
  q?: string;
  classeId?: string;
  statut?: string;
}

export function ElevesActions({ q, classeId, statut }: ElevesActionsProps) {
  const t = useTranslations("eleves");
  const tCommon = useTranslations("common");
  const [loading, setLoading] = useState(false);

  async function exportExcel() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ export: "true" });
      if (q) params.set("q", q);
      if (classeId) params.set("classeId", classeId);
      if (statut) params.set("statut", statut);

      const res = await fetch(`/api/eleves?${params.toString()}`);
      if (!res.ok) throw new Error(t("exportFailed"));
      const { eleves }: { eleves: Eleve[] } = await res.json();

      // Préparer les lignes avec une colonne `classeNom` pour le regroupement
      const rows = eleves.map((e, i) => ({
        index: i + 1,
        ...e,
        classeNom: e.classe?.nom ?? "Sans classe",
        niveauNom: e.classe?.niveau ?? "",
        parentNom: e.parents[0]?.parent ? `${e.parents[0].parent.prenom} ${e.parents[0].parent.nom}` : "",
        parentPhone: e.parents[0]?.parent.phone ?? "",
        naissance: new Date(e.dateNaissance).toLocaleDateString("fr-FR"),
      }));

      const columns: ExportColumn<(typeof rows)[number]>[] = [
        { header: "#", key: "index", width: 5 },
        { header: "Prénom", key: "prenom", width: 20 },
        { header: "Nom", key: "nom", width: 20 },
        { header: "Matricule", key: "matricule", width: 15 },
        { header: "Classe", key: "classeNom", width: 18 },
        { header: "Niveau", key: "niveauNom", width: 12 },
        { header: "Naissance", key: "naissance", width: 14 },
        { header: "Parent", key: "parentNom", width: 25 },
        { header: "Téléphone", key: "parentPhone", width: 15 },
        { header: "Statut", key: "statut", width: 12 },
        { header: "Sexe", key: "sexe", width: 8 },
        { header: "Régime", key: "regime", width: 15, format: (v: string) => v ?? "externe" },
      ];

      const buffer = await exportExcelMultiSheetBuffer(rows, columns, "classeNom");
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eleves-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" className="gap-2" onClick={exportExcel} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {tCommon("export")}
    </Button>
  );
}
