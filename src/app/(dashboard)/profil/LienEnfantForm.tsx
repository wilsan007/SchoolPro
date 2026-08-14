"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus, Clock, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { demanderLienEnfant, getMesDemandesLien } from "@/lib/actions/lien-parent";
import { useEffect } from "react";

interface Demande {
  id: string;
  statut: "EN_ATTENTE" | "VALIDE" | "REFUSE";
  motifRefus: string | null;
  createdAt: Date;
  eleve: {
    nom: string;
    prenom: string;
    matricule: string;
    classe: { nom: string } | null;
    site: { nom: string } | null;
  };
}

export function LienEnfantForm() {
  const t = useTranslations("profil");
  const [matricule, setMatricule] = useState("");
  const [dateNaissance, setDateNaissance] = useState("");
  const [loading, setLoading] = useState(false);
  const [demandes, setDemandes] = useState<Demande[]>([]);

  useEffect(() => {
    loadDemandes();
  }, []);

  async function loadDemandes() {
    try {
      const result = await getMesDemandesLien();
      setDemandes(result as Demande[]);
    } catch {
      // Silencieux : pas de demandes ou erreur mineure
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await demanderLienEnfant({ matricule, dateNaissance });
      toast.success(t("lienDemandeCreated", { nom: result.eleve.nom, classe: result.eleve.classe }));
      setMatricule("");
      setDateNaissance("");
      loadDemandes();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("lienDemandeError"));
    } finally {
      setLoading(false);
    }
  }

  const statutIcon = (statut: Demande["statut"]) => {
    if (statut === "EN_ATTENTE") return <Clock className="h-4 w-4 text-amber-500" />;
    if (statut === "VALIDE") return <CheckCircle className="h-4 w-4 text-green-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const statutLabel = (statut: Demande["statut"]) => {
    if (statut === "EN_ATTENTE") return t("lienStatutAttente");
    if (statut === "VALIDE") return t("lienStatutValide");
    return t("lienStatutRefuse");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          {t("lienEnfantTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">{t("lienEnfantDesc")}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="matricule">{t("lienMatricule")}</Label>
              <Input
                id="matricule"
                value={matricule}
                onChange={(e) => setMatricule(e.target.value)}
                required
                placeholder="2026-0001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateNaissance">{t("lienDateNaissance")}</Label>
              <Input
                id="dateNaissance"
                type="date"
                value={dateNaissance}
                onChange={(e) => setDateNaissance(e.target.value)}
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {t("lienDemandeBtn")}
          </Button>
        </form>

        {demandes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">{t("lienMesDemandes")}</h4>
            <div className="space-y-2">
              {demandes.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    {statutIcon(d.statut)}
                    <div>
                      <p className="font-medium">
                        {d.eleve.prenom} {d.eleve.nom}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {d.eleve.classe?.nom ?? "—"} · {d.eleve.site?.nom ?? "—"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium">{statutLabel(d.statut)}</p>
                    {d.statut === "REFUSE" && d.motifRefus && (
                      <p className="text-xs text-red-500 mt-1">{d.motifRefus}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
