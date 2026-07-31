"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

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

  async function exportCSV() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ export: "true" });
      if (q) params.set("q", q);
      if (classeId) params.set("classeId", classeId);
      if (statut) params.set("statut", statut);

      const res = await fetch(`/api/eleves?${params.toString()}`);
      if (!res.ok) throw new Error(t("exportFailed"));
      const { eleves }: { eleves: Eleve[] } = await res.json();

      const headers = ["#", "Prénom", "Nom", "Matricule", "Classe", "Niveau", "Naissance", "Parent", "Téléphone", "Statut", "Sexe", "Régime"];
      const rows = eleves.map((e, i) => [
        i + 1,
        e.prenom,
        e.nom,
        e.matricule,
        e.classe?.nom ?? "",
        e.classe?.niveau ?? "",
        new Date(e.dateNaissance).toLocaleDateString("fr-FR"),
        e.parents[0]?.parent ? `${e.parents[0].parent.prenom} ${e.parents[0].parent.nom}` : "",
        e.parents[0]?.parent.phone ?? "",
        e.statut,
        e.sexe,
        e.regime ?? "externe",
      ]);

      const csv = [headers, ...rows]
        .map((row) =>
          row
            .map((cell) => {
              const value = String(cell ?? "").replace(/"/g, '""');
              return value.includes(",") || value.includes('"') || value.includes("\n") ? `"${value}"` : value;
            })
            .join(",")
        )
        .join("\n");

      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eleves-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {tCommon("export")}
    </Button>
  );
}
