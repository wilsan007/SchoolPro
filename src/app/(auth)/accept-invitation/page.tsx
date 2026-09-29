"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, MailCheck, AlertCircle, KeyRound } from "lucide-react";

/**
 * Page publique d'acceptation d'une invitation.
 * ============================================================
 * Aucune session n'existe à cet instant : le jeton du lien est la seule preuve
 * d'accès. La page se contente d'afficher ce que le serveur accepte de dire
 * (email MASQUÉ, rôle, établissement), puis de transmettre le mot de passe
 * choisi. Toute la validation — jeton, expiration, usage unique, complexité du
 * mot de passe — vit côté serveur (`@/lib/invitations-server`) : un contrôle
 * ici ne serait qu'un confort d'affichage, jamais une garantie.
 */

type Etat =
  | "chargement"
  | "pret"
  | "envoi"
  | "succes"
  | "token_manquant"
  | "jeton_inconnu"
  | "invitation_expiree"
  | "invitation_deja_acceptee"
  | "invitation_revoquee"
  | "email_deja_utilise"
  | "mot_de_passe_faible"
  | "rate_limited"
  | "erreur_inconnue";

interface InfoInvitation {
  etat: "VALIDE" | "EXPIREE" | "DEJA_ACCEPTEE" | "REVOQUEE";
  emailMasque: string;
  role: string | null;
  nom: string | null;
  siteNom: string | null;
}

/** Traduit l'état renvoyé par le serveur vers l'état d'affichage. */
function etatDepuisInfo(e: InfoInvitation["etat"]): Etat {
  if (e === "EXPIREE") return "invitation_expiree";
  if (e === "DEJA_ACCEPTEE") return "invitation_deja_acceptee";
  if (e === "REVOQUEE") return "invitation_revoquee";
  return "pret";
}

function FormulaireInvitation() {
  const t = useTranslations("invitation");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [etat, setEtat] = useState<Etat>("chargement");
  const [info, setInfo] = useState<InfoInvitation | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!token) {
      setEtat("token_manquant");
      return;
    }
    let annule = false;
    (async () => {
      try {
        const res = await fetch(`/api/auth/invitation?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (annule) return;
        if (!data.success) {
          setEtat((data.error as Etat) ?? "erreur_inconnue");
          return;
        }
        setInfo(data as InfoInvitation);
        setEtat(etatDepuisInfo((data as InfoInvitation).etat));
      } catch {
        if (!annule) setEtat("erreur_inconnue");
      }
    })();
    return () => {
      annule = true;
    };
  }, [token]);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    // Le serveur revalide de toute façon : ceci évite un aller-retour évitable.
    if (password !== confirmation) {
      setEtat("mot_de_passe_faible");
      return;
    }
    setEtat("envoi");
    try {
      const res = await fetch("/api/auth/invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      setEtat(data.success ? "succes" : ((data.error as Etat) ?? "erreur_inconnue"));
    } catch {
      setEtat("erreur_inconnue");
    }
  }

  const messageErreur: Partial<Record<Etat, string>> = {
    token_manquant: t("erreurs.tokenManquant"),
    jeton_inconnu: t("erreurs.jetonInconnu"),
    invitation_expiree: t("erreurs.expiree"),
    invitation_deja_acceptee: t("erreurs.dejaAcceptee"),
    invitation_revoquee: t("erreurs.revoquee"),
    email_deja_utilise: t("erreurs.emailDejaUtilise"),
    mot_de_passe_faible: t("erreurs.motDePasseFaible"),
    rate_limited: t("erreurs.rateLimited"),
    erreur_inconnue: t("erreurs.generique"),
  };

  // Extraits dans des constantes : `info?.x && <p>{info.x}</p>` ne rétrécit pas
  // le type de `info` à l'intérieur du JSX, TypeScript le sait nullable.
  const siteNom = info?.siteNom ?? null;
  const roleAffiche = info?.role ?? null;

  if (etat === "chargement") {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex items-center justify-center gap-2 py-10 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("chargement")}
        </CardContent>
      </Card>
    );
  }

  if (etat === "succes") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MailCheck className="h-5 w-5 text-emerald-600" />
            {t("succesTitre")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">{t("succesTexte")}</p>
          <Button asChild className="w-full">
            <Link href="/login">{t("allerConnexion")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (etat !== "pret" && etat !== "envoi") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            {t("titre")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            {messageErreur[etat] ?? t("erreurs.generique")}
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">{t("allerConnexion")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-5 w-5 text-blue-700" />
          {t("titre")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={soumettre} className="space-y-4">
          <p className="text-sm text-slate-600">
            {t("intro", { email: info?.emailMasque ?? "" })}
          </p>
          {siteNom && (
            <p className="text-sm text-slate-500">
              {t("etablissement", { nom: siteNom ?? "" })}
            </p>
          )}
          {roleAffiche && (
            <p className="text-sm text-slate-500">{t("role", { role: roleAffiche ?? "" })}</p>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">{t("motDePasse")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmation">{t("confirmation")}</Label>
            <Input
              id="confirmation"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
            />
          </div>

          <p className="text-xs text-slate-500">{t("reglesMotDePasse")}</p>

          {etat === "envoi" && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("envoiEnCours")}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={etat === "envoi"}>
            {t("valider")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AcceptInvitationPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Suspense>
        <FormulaireInvitation />
      </Suspense>
    </div>
  );
}
