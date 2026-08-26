"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, XCircle, Clock, RefreshCw, Search, MessageCircle, Phone, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { envoyerRelance, confirmerReinscription } from "@/app/(dashboard)/parametres/reinscription/actions";

interface InvitationData {
  id: string;
  statut: string;
  dateInvitation: string;
  dateReponse: string | null;
  canal: string;
  parentPhone: string | null;
  parentEmail: string | null;
  nbRelances: number;
  decisionPromotion: string | null;
  eleve: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    statut: string;
    classe: { nom: string; niveau: string } | null;
    parents: Array<{
      parent: { nom: string; prenom: string; telephone: string | null; email: string | null };
    }>;
  };
}

const STATUT_CONFIG: Record<string, { color: string; icon: React.ElementType; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  INVITE: { color: "text-blue-600", icon: Clock, variant: "outline" },
  CONFIRME: { color: "text-green-600", icon: CheckCircle2, variant: "default" },
  REFUSE: { color: "text-red-600", icon: XCircle, variant: "destructive" },
  SANS_REPONSE: { color: "text-amber-600", icon: Clock, variant: "secondary" },
};

export function SuiviReinscriptions({
  invitations,
  isAdmin,
}: {
  invitations: InvitationData[];
  isAdmin: boolean;
}) {
  const t = useTranslations("reinscription");
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const filtered = invitations.filter((inv) => {
    const matchStatut = filter === "ALL" || inv.statut === filter;
    const matchSearch = !search ||
      `${inv.eleve.prenom} ${inv.eleve.nom}`.toLowerCase().includes(search.toLowerCase()) ||
      inv.eleve.matricule.toLowerCase().includes(search.toLowerCase());
    return matchStatut && matchSearch;
  });

  // Compteurs par statut
  const counts = {
    ALL: invitations.length,
    INVITE: invitations.filter((i) => i.statut === "INVITE").length,
    CONFIRME: invitations.filter((i) => i.statut === "CONFIRME").length,
    REFUSE: invitations.filter((i) => i.statut === "REFUSE").length,
    SANS_REPONSE: invitations.filter((i) => i.statut === "SANS_REPONSE").length,
  };

  async function handleRelance(invitationId: string) {
    startTransition(async () => {
      try {
        await envoyerRelance(invitationId);
        toast.success(t("relanceSent"));
        window.location.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      }
    });
  }

  async function handleConfirmer(invitationId: string, confirme: boolean) {
    startTransition(async () => {
      try {
        await confirmerReinscription(invitationId, confirme);
        toast.success(confirme ? t("reinscritConfirmed") : t("reinscritRefused"));
        window.location.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-1 flex-wrap">
          {Object.entries(counts).map(([statut, count]) => (
            <button
              key={statut}
              onClick={() => setFilter(statut)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium border transition-all",
                filter === statut
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-muted-foreground/20 text-muted-foreground hover:bg-muted/30"
              )}
            >
              {statut === "ALL" ? t("all") : t(`statutInv.${statut.toLowerCase()}`)}
              <span className="ml-1.5 opacity-60">({count})</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          {t("noInvitations")}
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto scrollbar-thin">
          {filtered.map((inv) => {
            const config = STATUT_CONFIG[inv.statut] ?? STATUT_CONFIG.INVITE;
            const StatutIcon = config.icon;
            const parent = inv.eleve.parents[0]?.parent;

            return (
              <div key={inv.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                {/* Avatar / initiales */}
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted shrink-0 text-sm font-medium">
                  {inv.eleve.prenom[0]}{inv.eleve.nom[0]}
                </div>

                {/* Infos élève */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{inv.eleve.prenom} {inv.eleve.nom}</span>
                    <span className="text-xs text-muted-foreground font-mono hidden sm:inline">{inv.eleve.matricule}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{inv.eleve.classe?.nom ?? "—"}</span>
                    {parent?.telephone && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{parent.telephone}</span>
                      </>
                    )}
                    {inv.nbRelances > 0 && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1 text-amber-600">
                          <RefreshCw className="h-3 w-3" />
                          {inv.nbRelances} {t("relances")}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Badge statut */}
                <Badge variant={config.variant} className="shrink-0 gap-1">
                  <StatutIcon className="h-3 w-3" />
                  {t(`statutInv.${inv.statut.toLowerCase()}`)}
                </Badge>

                {/* Actions */}
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    {(inv.statut === "INVITE" || inv.statut === "SANS_REPONSE") && (
                      <>
                        {inv.parentPhone && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => handleRelance(inv.id)}
                            disabled={isPending}
                            title={t("sendRelance")}
                          >
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-green-700 hover:bg-green-50"
                          onClick={() => handleConfirmer(inv.id, true)}
                          disabled={isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-red-700 hover:bg-red-50"
                          onClick={() => handleConfirmer(inv.id, false)}
                          disabled={isPending}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
