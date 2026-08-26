"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, GraduationCap, Calendar, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";

interface InvitationDetail {
  id: string;
  statut: string;
  campagne: { libelle: string; anneeCible: string; statut: string };
  eleve: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    statut: string;
    classe: { nom: string; niveau: string } | null;
  };
  dateInvitation: string;
  dateReponse: string | null;
}

export function ParentReinscriptionClient() {
  const t = useTranslations("reinscription");
  const searchParams = useSearchParams();
  const invitationId = searchParams.get("id");

  const [invitation, setInvitation] = useState<InvitationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    if (!invitationId) {
      setLoading(false);
      return;
    }
    fetch(`/api/reinscription/invitation/${invitationId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setInvitation(data);
      })
      .catch(() => {
        toast.error(t("invitationNotFound"));
      })
      .finally(() => setLoading(false));
  }, [invitationId, t]);

  async function handleResponse(confirme: boolean) {
    if (!invitationId) return;
    setResponding(true);
    try {
      const res = await fetch("/api/reinscription/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId, confirme }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "Erreur");
      toast.success(data.message);
      setInvitation((p) => p ? { ...p, statut: confirme ? "CONFIRME" : "REFUSE", dateReponse: new Date().toISOString() } : p);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setResponding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!invitationId || !invitation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium">{t("invitationNotFound")}</p>
        <p className="text-sm text-muted-foreground mt-1">{t("invitationNotFoundDesc")}</p>
      </div>
    );
  }

  const alreadyResponded = invitation.statut === "CONFIRME" || invitation.statut === "REFUSE";
  const campagneFermee = invitation.campagne.statut === "TERMINEE" || invitation.campagne.statut === "ANNULEE";

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Card className="border-primary/20">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
              <GraduationCap className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl">{t("parentTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{invitation.campagne.libelle}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Infos élève */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("student")}</span>
              <span className="font-medium">{invitation.eleve.prenom} {invitation.eleve.nom}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("class")}</span>
              <span className="text-sm">{invitation.eleve.classe?.nom ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("matricule")}</span>
              <span className="text-sm font-mono">{invitation.eleve.matricule}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("targetYear")}</span>
              <span className="text-sm font-medium">{invitation.campagne.anneeCible}</span>
            </div>
          </div>

          {/* Statut actuel */}
          {alreadyResponded && (
            <div className="text-center py-4">
              {invitation.statut === "CONFIRME" ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="h-12 w-12 text-green-600" />
                  <p className="font-medium text-green-700">{t("parentConfirmed")}</p>
                  <p className="text-sm text-muted-foreground">{t("parentConfirmedDesc")}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <XCircle className="h-12 w-12 text-red-600" />
                  <p className="font-medium text-red-700">{t("parentRefused")}</p>
                  <p className="text-sm text-muted-foreground">{t("parentRefusedDesc")}</p>
                </div>
              )}
              {invitation.dateReponse && (
                <p className="text-xs text-muted-foreground mt-3">
                  {t("responseDate")}: {new Date(invitation.dateReponse).toLocaleDateString("fr-FR")}
                </p>
              )}
            </div>
          )}

          {/* Campagne fermée */}
          {campagneFermee && !alreadyResponded && (
            <div className="text-center py-4">
              <AlertCircle className="h-12 w-12 text-amber-600 mx-auto mb-2" />
              <p className="font-medium">{t("campaignClosed")}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("campaignClosedDesc")}</p>
            </div>
          )}

          {/* Boutons de réponse */}
          {!alreadyResponded && !campagneFermee && (
            <div className="space-y-3">
              <p className="text-center text-sm font-medium">{t("parentQuestion")}</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => handleResponse(true)}
                  disabled={responding}
                  size="lg"
                  className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
                >
                  {responding ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                  {t("confirmReinscription")}
                </Button>
                <Button
                  onClick={() => handleResponse(false)}
                  disabled={responding}
                  size="lg"
                  variant="outline"
                  className="flex-1 gap-2 text-red-600 border-red-200 hover:bg-red-50"
                >
                  {responding ? <Loader2 className="h-5 w-5 animate-spin" /> : <XCircle className="h-5 w-5" />}
                  {t("refuseReinscription")}
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {t("parentDisclaimer")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
