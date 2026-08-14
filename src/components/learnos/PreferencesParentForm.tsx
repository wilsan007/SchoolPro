"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { texteErreur } from "@/lib/erreurs-client";
import { cn } from "@/lib/utils";

export interface PreferencesParent {
  alertesActives: boolean;
  niveauMinimal: "INFO" | "ATTENTION" | "URGENT";
  langue: string | null;
  plafondHebdomadaire: number;
}

/**
 * Réglage des notifications par la famille.
 *
 * POURQUOI CET ÉCRAN EXISTE
 * Sans lui, la seule façon d'arrêter des messages non voulus est de bloquer
 * le numéro — et l'établissement perd alors aussi le canal des vraies
 * urgences. Le dire explicitement sous le bouton évite qu'on coupe tout par
 * réflexe : relever le seuil suffit le plus souvent.
 */
export function PreferencesParentForm({ initiales }: { initiales: PreferencesParent }) {
  const t = useTranslations("learnos.preferences");
  const tCommon = useTranslations("common");
  const tc = useTranslations("learnos.commun");
  const te = useTranslations("learnos.erreurs");
  const [prefs, setPrefs] = useState(initiales);
  const [enCours, demarrer] = useTransition();

  function enregistrer(patch: Partial<PreferencesParent>) {
    // Optimiste : le réglage bascule tout de suite, puis se corrige si le
    // serveur refuse. Attendre un aller-retour de 200 ms sur un interrupteur
    // donne l'impression que rien ne s'est passé.
    const avant = prefs;
    setPrefs((p) => ({ ...p, ...patch }));

    demarrer(async () => {
      try {
        const res = await fetch("/api/learnos/preferences-parent", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));
        setPrefs(data);
        toast.success(t("enregistre"));
      } catch (e) {
        setPrefs(avant);
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div>
          <h2 className="font-semibold">{t("titre")}</h2>
          <p className="text-sm text-muted-foreground">{t("sousTitre")}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("recevoir")}</p>
            <p className="text-xs text-muted-foreground">
              {t("recevoirAide", { n: prefs.plafondHebdomadaire })}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.alertesActives}
            disabled={enCours}
            onClick={() => enregistrer({ alertesActives: !prefs.alertesActives })}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              prefs.alertesActives
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-border hover:bg-muted"
            )}
          >
            {enCours ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : prefs.alertesActives ? (
              <Bell className="h-4 w-4" />
            ) : (
              <BellOff className="h-4 w-4" />
            )}
            {t(prefs.alertesActives ? "activees" : "desactivees")}
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pref-niveau">{t("seuil")}</Label>
            <Select
              value={prefs.niveauMinimal}
              disabled={!prefs.alertesActives || enCours}
              onValueChange={(v) =>
                enregistrer({ niveauMinimal: v as PreferencesParent["niveauMinimal"] })
              }
            >
              <SelectTrigger id="pref-niveau">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INFO">{t("seuil_INFO")}</SelectItem>
                <SelectItem value="ATTENTION">{t("seuil_ATTENTION")}</SelectItem>
                <SelectItem value="URGENT">{t("seuil_URGENT")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("seuilAide")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pref-langue">{t("langue")}</Label>
            <Select
              value={prefs.langue ?? "auto"}
              disabled={enCours}
              onValueChange={(v) => enregistrer({ langue: v === "auto" ? null : v })}
            >
              <SelectTrigger id="pref-langue">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("langue_auto")}</SelectItem>
                <SelectItem value="fr">{tCommon("french")}</SelectItem>
                <SelectItem value="en">{tCommon("english")}</SelectItem>
                <SelectItem value="so">{tCommon("somali")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("langueAide")}</p>
          </div>
        </div>

        {/* Dit explicitement, pour éviter qu'on coupe tout par réflexe. */}
        <p className="text-xs text-muted-foreground">{t("noteReponses")}</p>
      </CardContent>
    </Card>
  );
}
