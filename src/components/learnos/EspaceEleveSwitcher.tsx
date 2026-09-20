"use client";

import { useState, useTransition } from "react";
import { Loader2, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { choisirEleveEspaceAction } from "@/lib/actions/espace-eleve";

export interface EnfantBascule {
  id: string;
  prenom: string;
  nom: string;
  classe: string | null;
}

/**
 * Bascule d'élève dans l'espace STUDENT — comptes hybrides (parent+élève).
 *
 * Chaque chip incarne l'un des enfants du compte. Le choix traverse une
 * Server Action qui le revalide contre le périmètre familial côté serveur :
 * ce composant n'est qu'une interface, jamais une autorisation.
 *
 * Même patron que le RoleSwitcher : Server Action + `revalidatePath` +
 * `router.refresh()`, pour que le dossier, les compétences, l'évolution et
 * l'entraînement suivent le choix immédiatement.
 */
export function EspaceEleveSwitcher({
  enfants,
  actuel,
}: {
  enfants: EnfantBascule[];
  /** Fiche actuellement incarnée ; la chip correspondante est soulignée. */
  actuel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [enErreur, setEnErreur] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  const router = useRouter();
  const t = useTranslations("learnos.dossier");

  // Ne pas afficher si moins de 2 enfants : le sélecteur n'aurait rien à
  // proposer que la situation courante.
  if (enfants.length < 2) return null;

  function choisir(id: string) {
    if (isPending || id === actuel) return;
    setEnErreur(false);
    setEnCours(id);

    startTransition(async () => {
      try {
        const result = await choisirEleveEspaceAction(id);
        if (!result.success) {
          setEnErreur(true);
          setEnCours(null);
          return;
        }
        router.refresh();
      } catch {
        setEnErreur(true);
        setEnCours(null);
      }
    });
  }

  return (
    <nav
      aria-label={t("choisirEnfant")}
      className="flex flex-wrap items-center gap-2"
    >
      <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <UserCog className="h-3.5 w-3.5 text-accent/70" aria-hidden="true" />
        {t("choisirEnfant")}
      </span>
      <div className="flex flex-wrap gap-2">
        {enfants.map((e) => {
          const estActif = e.id === actuel;
          return (
            <button
              key={e.id}
              onClick={() => choisir(e.id)}
              disabled={isPending}
              aria-current={estActif ? "true" : undefined}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                estActif
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted",
                isPending && !estActif && "opacity-50"
              )}
            >
              {e.prenom} {e.nom}
              {e.classe && (
                <span className="ml-1.5 text-xs opacity-70">{e.classe}</span>
              )}
              {isPending && enCours === e.id && (
                <Loader2
                  className="ml-1.5 h-3.5 w-3.5 animate-spin inline"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
      {enErreur && (
        <p className="w-full text-xs text-destructive">
          {t("erreurBasculeEleve")}
        </p>
      )}
    </nav>
  );
}
