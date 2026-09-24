"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { texteErreur, type ReponseErreur, type Traducteur } from "@/lib/erreurs-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, ShieldAlert, Copy, Check } from "lucide-react";

/**
 * Configuration de la double authentification.
 *
 * Tous les textes viennent du namespace i18n `twoFactor` : l'écran de
 * sécurité est servi en fr/en/so comme le reste de l'application.
 *
 * Le QR code est généré côté serveur (le module qrcode n'est pas bundlé
 * côté client en mode compile). L'URI otpauth:// est aussi retournée pour
 * le lien direct sur mobile.
 */

/**
 * Codes signalant que le **code saisi** a été refusé.
 *
 * Le catalogue `learnos.erreurs` les traduit fidèlement (« Code TOTP
 * invalide », « Statut invalide », « Code de secours invalide »), mais un
 * constat d'échec ne dit pas quoi faire : la cause est presque toujours un
 * compte non enregistré dans l'application d'authentification, ou une horloge
 * de téléphone déréglée. On affiche donc la marche à suivre (`twoFactor
 * .codeRefuse`) plutôt que le constat.
 */
const CODES_SAISIE_REFUSEE = new Set([
  "TOTP_INVALIDE",
  "STATUT_INVALIDE",
  "CODE_SECOURS_INVALIDE",
]);

/**
 * Message à afficher pour un refus de `/api/auth/2fa`, par ordre de
 * préséance — chaque règle correspond à un cas réel du parcours :
 *
 *  1. **Code saisi refusé** → marche à suivre traduite (cf. ci-dessus).
 *  2. **`error: "rate_limited"`** → quota. Ce code stable est renvoyé tel quel
 *     par les interfaces d'API antérieures (sans champ `code`) : sans cette
 *     reconnaissance, l'utilisateur lisait `rate_limited` à l'écran.
 *  3. **Panne serveur avec `detail`** → la cause réelle, plus utile que la
 *     traduction générique « Erreur serveur ».
 *  4. **Sinon** → traduction du code stable, à défaut le repli français du
 *     serveur, à défaut un message générique localisé.
 *
 * La résolution est centralisée ici, et non dans chaque `catch` : trois
 * gestionnaires d'erreur divergents, c'était trois comportements différents
 * pour la même réponse serveur.
 */
function messageErreur2FA(
  data: ReponseErreur | null,
  te: Traducteur,
  t: (cle: string) => string,
  tCommon: (cle: string) => string
): string {
  if (data?.code && CODES_SAISIE_REFUSEE.has(data.code)) return t("codeRefuse");
  if (data?.error === "rate_limited") return tCommon("security.rateLimited");
  if (data?.code === "ERREUR_SERVEUR" && data.detail) return data.detail;
  return texteErreur(data, te, tCommon("errorOperation"));
}

interface Props {
  actifInitial: boolean;
  derniereVerification: string | null;
  obligatoire: boolean;
}

interface SetupData {
  qrCodeUri: string;
  qrCodeDataUrl: string;
  secretBase32: string;
  backupCodes: string[];
}

export function DeuxFacteursPanel({ actifInitial, derniereVerification, obligatoire }: Props) {
  const t = useTranslations("twoFactor");
  const tCommon = useTranslations("common");
  // Les codes d'erreur du catalogue vivent dans `learnos.erreurs`, seul
  // espace de traduction des erreurs d'API (voir `erreurs-api.test.ts`).
  const te = useTranslations("learnos.erreurs");
  const locale = useLocale();
  const [actif, setActif] = useState(actifInitial);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [copie, setCopie] = useState(false);
  const [codesArchives, setCodesArchives] = useState(false);

  async function appeler(action: string, corps: Record<string, string> = {}) {
    const res = await fetch("/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...corps }),
    });
    const data = await res.json().catch((e) => {
      console.warn("[non-fatal]", e);
      return null;
    });
    if (!res.ok) {
      // Message résolu en un seul endroit (cf. `messageErreur2FA`) : adapter
      // l'affichage au code stable du catalogue, sans jamais reconnaître le
      // contenu d'un message, qui dépend de la langue et de la formulation.
      throw new Error(
        messageErreur2FA(
          data,
          te,
          (cle) => t(cle),
          (cle) => tCommon(cle)
        )
      );
    }
    return data;
  }

  async function demarrer() {
    setEnCours(true);
    try {
      setSetup(await appeler("setup"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setEnCours(false);
    }
  }

  async function confirmer() {
    setEnCours(true);
    try {
      await appeler("verify", { token: code.trim() });
      setActif(true);
      setSetup(null);
      setCode("");
      toast.success(t("activee"));
    } catch (e) {
      // Le message est déjà résolu et localisé par `appeler()`, y compris la
      // marche à suivre quand le code saisi est refusé (cf. `messageErreur2FA`).
      toast.error(e instanceof Error && e.message ? e.message : tCommon("errorOperation"));
    } finally {
      setEnCours(false);
    }
  }

  async function desactiver() {
    // Un code valide est exigé côté serveur : une session volée ne doit pas
    // suffire à retirer la protection. On le demande donc ici aussi.
    const saisi = prompt(t("confirmerDesactivation"));
    if (!saisi) return;
    setEnCours(true);
    try {
      await appeler("disable", { token: saisi.trim() });
      setActif(false);
      toast.success(t("desactivee"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tCommon("errorOperation"));
    } finally {
      setEnCours(false);
    }
  }

  // ─── Déjà active ────────────────────────────────────────────────────────
  if (actif && !setup) {
    return (
      <section className="rounded-lg border p-5 space-y-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="font-semibold">{t("statutActif")}</h2>
            <p className="text-muted-foreground text-sm mt-1">
              {t("activeDesc")}
            </p>
            {derniereVerification && (
              <p className="text-muted-foreground text-xs mt-2">
                {t("derniereVerification", {
                  date: new Date(derniereVerification).toLocaleString(locale),
                })}
              </p>
            )}
          </div>
        </div>
        {obligatoire ? (
          <p className="text-muted-foreground text-xs border-l-2 pl-3">
            {t("obligatoireNote")}
          </p>
        ) : (
          <Button variant="outline" onClick={desactiver} disabled={enCours}>
            {enCours && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t("desactiver")}
          </Button>
        )}
      </section>
    );
  }

  // ─── Configuration en cours ─────────────────────────────────────────────
  if (setup) {
    return (
      <section className="rounded-lg border p-5 space-y-5">
        <h2 className="font-semibold">{t("configurerTitre")}</h2>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("etape1Titre")}</p>
          <p className="text-muted-foreground text-sm">{t("etape1Desc")}</p>
          <p className="text-muted-foreground text-xs border-l-2 pl-3">
            {t("etape1Note")}
          </p>
          {setup.qrCodeDataUrl && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setup.qrCodeDataUrl}
                alt={t("scannerQR")}
                className="rounded-lg border"
                width={256}
                height={256}
              />
            </div>
          )}
          <a
            href={setup.qrCodeUri}
            className="inline-block text-sm underline underline-offset-4"
          >
            {t("ouvrirApp")}
          </a>
          <p className="text-muted-foreground text-sm">{t("saisieManuelle")}</p>
          <div className="flex items-center gap-2">
            <code className="bg-muted rounded px-3 py-2 text-sm font-mono break-all flex-1">
              {setup.secretBase32}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={copie ? t("cleCopiee") : t("copierCle")}
              onClick={() => {
                navigator.clipboard.writeText(setup.secretBase32);
                setCopie(true);
                setTimeout(() => setCopie(false), 2000);
              }}
            >
              {copie ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{t("typeCle")}</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("etape2Titre")}</p>
          <p className="text-muted-foreground text-sm">{t("codesSecoursInfo")}</p>
          <p className="text-muted-foreground text-xs border-l-2 pl-3">
            {t("codesSecoursNote")}
          </p>
          <div
            role="group"
            aria-label={t("codesSecours")}
            className="bg-muted rounded p-3 grid grid-cols-2 gap-1.5 font-mono text-sm"
          >
            {setup.backupCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={codesArchives}
              onChange={(e) => setCodesArchives(e.target.checked)}
            />
            {t("codesArchives")}
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("etape3Titre")}</p>
          <p className="text-muted-foreground text-sm">{t("etape3Desc")}</p>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={t("entrerCode")}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="max-w-[12rem]"
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={confirmer}
            disabled={enCours || code.trim().length < 6 || !codesArchives}
          >
            {enCours && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t("verifier")}
          </Button>
          <Button variant="outline" onClick={() => setSetup(null)} disabled={enCours}>
            {tCommon("cancel")}
          </Button>
        </div>
      </section>
    );
  }

  // ─── Inactive ───────────────────────────────────────────────────────────
  return (
    <section className="rounded-lg border p-5 space-y-4">
      <div className="flex items-start gap-3">
        <ShieldAlert
          className={`h-5 w-5 mt-0.5 shrink-0 ${obligatoire ? "text-destructive" : "text-amber-600"}`}
        />
        <div>
          <h2 className="font-semibold">{t("statutInactif")}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {obligatoire ? t("inactifObligatoire") : t("inactifDesc")}
          </p>
        </div>
      </div>
      <Button onClick={demarrer} disabled={enCours}>
        {enCours && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        {t("activer")}
      </Button>
    </section>
  );
}
