"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, XCircle, Clock, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  getDemandesLienEnAttente,
  validerDemandeLien,
  refuserDemandeLien,
} from "@/lib/actions/lien-parent";
import type { LienParente } from "@prisma/client";

interface Demande {
  id: string;
  matriculeSaisi: string;
  createdAt: Date;
  parent: {
    id: string;
    nom: string;
    prenom: string;
    phone: string;
    email: string | null;
  };
  eleve: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    dateNaissance: Date;
    classe: { nom: string } | null;
    site: { nom: string } | null;
  };
}

export function DemandesLienAdmin() {
  const t = useTranslations("admin");
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [loading, setLoading] = useState(true);
  const [traitement, setTraitement] = useState<string | null>(null);
  const [motifRefus, setMotifRefus] = useState<Record<string, string>>({});

  useEffect(() => {
    loadDemandes();
  }, []);

  async function loadDemandes() {
    setLoading(true);
    try {
      const result = await getDemandesLienEnAttente();
      setDemandes(result as Demande[]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function handleValider(demandeId: string, lien: LienParente) {
    setTraitement(demandeId);
    try {
      await validerDemandeLien(demandeId, lien);
      toast.success(t("demandeValidee"));
      loadDemandes();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setTraitement(null);
    }
  }

  async function handleRefuser(demandeId: string) {
    const motif = motifRefus[demandeId] || "Non spécifié";
    setTraitement(demandeId);
    try {
      await refuserDemandeLien(demandeId, motif);
      toast.success(t("demandeRefusee"));
      loadDemandes();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setTraitement(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (demandes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Clock className="h-12 w-12 mb-3 opacity-50" />
          <p>{t("aucuneDemandeLien")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {demandes.map((d) => (
        <Card key={d.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                {d.parent.prenom} {d.parent.nom}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {new Date(d.createdAt).toLocaleDateString("fr-FR")}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("demandeParent")}</p>
                <p className="font-medium">{d.parent.prenom} {d.parent.nom}</p>
                <p className="text-xs">{d.parent.phone}</p>
                {d.parent.email && <p className="text-xs">{d.parent.email}</p>}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("demandeEleve")}</p>
                <p className="font-medium">{d.eleve.prenom} {d.eleve.nom}</p>
                <p className="text-xs">Matricule : {d.eleve.matricule}</p>
                <p className="text-xs">Classe : {d.eleve.classe?.nom ?? "—"}</p>
                <p className="text-xs">Site : {d.eleve.site?.nom ?? "—"}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 pt-2 border-t">
              <div className="flex-1 space-y-2">
                <Label className="text-xs">{t("motifRefus")}</Label>
                <Input
                  value={motifRefus[d.id] || ""}
                  onChange={(e) =>
                    setMotifRefus({ ...motifRefus, [d.id]: e.target.value })
                  }
                  placeholder={t("motifRefusPlaceholder")}
                  className="h-8 text-sm"
                />
              </div>
              <Button
                size="sm"
                variant="default"
                disabled={traitement === d.id}
                onClick={() => handleValider(d.id, "TUTEUR")}
                className="gap-1 w-full sm:w-auto"
              >
                {traitement === d.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                {t("valider")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={traitement === d.id}
                onClick={() => handleRefuser(d.id)}
                className="gap-1 w-full sm:w-auto"
              >
                <XCircle className="h-4 w-4" />
                {t("refuser")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
