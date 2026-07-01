"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface Eleve {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  dateNaissance: Date;
  sexe: string;
  statut: string;
  regime: string | null;
  classe: { nom: string; niveau: string } | null;
  parents: Array<{
    parent: { nom: string; prenom: string; phone: string };
  }>;
}

interface ElevesActionsProps {
  eleves: Eleve[];
}

export function ElevesActions({ eleves }: ElevesActionsProps) {
  function exportCSV() {
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

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eleves-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV}>
      <Download className="h-4 w-4" />
      Exporter
    </Button>
  );
}
