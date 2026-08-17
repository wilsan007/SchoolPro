"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, ArrowLeft, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface EleveGrille {
  eleveId: string;
  matricule: string;
  nom: string;
  prenom: string;
  noteId: string | null;
  valeur: number | null;
  commentaire: string;
}

interface Props {
  evaluation: any;
  initialGrille: EleveGrille[];
}

export function GrilleSaisie({ evaluation, initialGrille }: Props) {
  const t = useTranslations("evaluations");
  const [grille, setGrille] = useState<EleveGrille[]>(initialGrille);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function updateEleve(eleveId: string, field: "valeur" | "commentaire", value: any) {
    setGrille((prev) =>
      prev.map((e) => {
        if (e.eleveId === eleveId) {
          return { ...e, [field]: value };
        }
        return e;
      })
    );
  }

  async function handleSave() {
    startTransition(async () => {
      try {
        const payload = {
          notes: grille.map((g) => ({
            eleveId: g.eleveId,
            valeur: g.valeur !== null && !isNaN(Number(g.valeur)) ? Number(g.valeur) : null,
            commentaire: g.commentaire,
          })),
        };

        const res = await fetch(`/api/evaluations/${evaluation.id}/notes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || t("grilleSaveError"));
        }

        toast.success(t("grilleSaved"));
        router.refresh();
      } catch (error: any) {
        toast.error(error.message);
      }
    });
  }

  return (
    <div className="bg-card rounded-xl shadow-sm border overflow-hidden mt-6">
      <div className="bg-muted px-4 py-3 border-b flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h3 className="font-semibold text-foreground">{t("grilleTitle")}</h3>
        <Button onClick={handleSave} disabled={isPending} className="bg-yellow-500 hover:bg-yellow-600 text-white gap-2 shadow-sm h-8 w-full sm:w-auto">
          <Save className="h-4 w-4" />
          {isPending ? t("grilleSaving") : t("grilleSave")}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[640px]">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">{t("grilleColMatricule")}</th>
              <th className="px-4 py-3 font-semibold">{t("grilleColNom")}</th>
              <th className="px-4 py-3 font-semibold">{t("grilleColPrenom")}</th>
              <th className="px-4 py-3 font-semibold w-32">{t("grilleColNote")}</th>
              <th className="px-4 py-3 font-semibold">{t("grilleColComment")}</th>
              <th className="px-4 py-3 font-semibold text-center w-24">{t("grilleColActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {grille.map((eleve) => (
              <tr key={eleve.eleveId} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-2 font-mono text-muted-foreground">{eleve.matricule}</td>
                <td className="px-4 py-2 font-bold uppercase">{eleve.nom}</td>
                <td className="px-4 py-2 uppercase">{eleve.prenom}</td>
                <td className="px-4 py-2">
                  <Input
                    type="number"
                    min="0"
                    max="20"
                    step="0.25"
                    className="h-8 w-24"
                    value={eleve.valeur ?? ""}
                    onChange={(e) => updateEleve(eleve.eleveId, "valeur", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    className="h-8 w-full"
                    value={eleve.commentaire}
                    placeholder={t("grillePlaceholder")}
                    onChange={(e) => updateEleve(eleve.eleveId, "commentaire", e.target.value)}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <div className="flex justify-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7 bg-green-600 hover:bg-green-700 text-white border-none">
                      <Lock className="h-3 w-3" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-7 w-7 bg-red-600 hover:bg-red-700 text-white border-none">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
