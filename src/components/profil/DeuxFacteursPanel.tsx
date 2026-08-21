"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, ShieldAlert, Copy, Check } from "lucide-react";

/**
 * Configuration de la double authentification.
 *
 * POURQUOI PAS DE QR CODE
 * Aucune bibliothèque de génération de QR n'est présente dans le projet,
 * et en ajouter une pour ce seul écran reviendrait à élargir la surface de
 * dépendances au beau milieu d'un chantier de sécurité. Deux voies sont
 * donc proposées, toutes deux universelles :
 *   - sur téléphone, le lien `otpauth://` ouvre directement l'application
 *     d'authentification, sans rien saisir ;
 *   - sur ordinateur, la clé se copie et se colle dans « saisie manuelle »,
 *     que proposent Google Authenticator, Authy, 1Password, Bitwarden et
 *     Aegis.
 * Un QR code pourra être ajouté plus tard ; il n'est pas nécessaire au
 * fonctionnement.
 */

interface Props {
  actifInitial: boolean;
  derniereVerification: string | null;
  obligatoire: boolean;
}

interface SetupData {
  qrCodeUri: string;
  secretBase32: string;
  backupCodes: string[];
}

export function DeuxFacteursPanel({ actifInitial, derniereVerification, obligatoire }: Props) {
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
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message ?? "Opération impossible");
    return data;
  }

  async function demarrer() {
    setEnCours(true);
    try {
      setSetup(await appeler("setup"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
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
      toast.success("Double authentification activée.");
    } catch {
      toast.error("Code incorrect. Vérifier l'heure du téléphone, puis réessayer.");
    } finally {
      setEnCours(false);
    }
  }

  async function desactiver() {
    // Un code valide est exigé côté serveur : une session volée ne doit pas
    // suffire à retirer la protection. On le demande donc ici aussi.
    const saisi = prompt(
      "Désactiver la double authentification ?\n\nLe compte ne sera plus protégé que par son mot de passe.\nSaisir un code de votre application pour confirmer :"
    );
    if (!saisi) return;
    setEnCours(true);
    try {
      await appeler("disable", { token: saisi.trim() });
      setActif(false);
      toast.success("Double authentification désactivée.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Code incorrect");
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
            <h2 className="font-semibold">Double authentification active</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Un code à usage unique est demandé à chaque connexion. Un mot de
              passe volé ne suffit plus à entrer dans le compte.
            </p>
            {derniereVerification && (
              <p className="text-muted-foreground text-xs mt-2">
                Dernière vérification :{" "}
                {new Date(derniereVerification).toLocaleString("fr-FR")}
              </p>
            )}
          </div>
        </div>
        {obligatoire ? (
          <p className="text-muted-foreground text-xs border-l-2 pl-3">
            Ce rôle donne accès à l&apos;ensemble des données de
            l&apos;établissement : la double authentification y est
            obligatoire et ne peut pas être désactivée.
          </p>
        ) : (
          <Button variant="outline" onClick={desactiver} disabled={enCours}>
            {enCours && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Désactiver
          </Button>
        )}
      </section>
    );
  }

  // ─── Configuration en cours ─────────────────────────────────────────────
  if (setup) {
    return (
      <section className="rounded-lg border p-5 space-y-5">
        <h2 className="font-semibold">Configurer la double authentification</h2>

        <div className="space-y-2">
          <p className="text-sm font-medium">1. Enregistrer le compte</p>
          <a
            href={setup.qrCodeUri}
            className="inline-block text-sm underline underline-offset-4 sm:hidden"
          >
            Ouvrir mon application d&apos;authentification
          </a>
          <p className="text-muted-foreground text-sm">
            Sur ordinateur, choisir « saisie manuelle » dans
            l&apos;application et coller cette clé :
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-muted rounded px-3 py-2 text-sm font-mono break-all flex-1">
              {setup.secretBase32}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(setup.secretBase32);
                setCopie(true);
                setTimeout(() => setCopie(false), 2000);
              }}
            >
              {copie ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">2. Mettre les codes de secours à l&apos;abri</p>
          <p className="text-muted-foreground text-sm">
            Ils sont affichés <strong>une seule fois</strong>. Sans eux, un
            téléphone perdu ou réinitialisé signifie un compte inaccessible.
            Chaque code ne sert qu&apos;une fois.
          </p>
          <div className="bg-muted rounded p-3 grid grid-cols-2 gap-1.5 font-mono text-sm">
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
            J&apos;ai enregistré ces codes en lieu sûr
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">3. Confirmer avec un premier code</p>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
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
            Activer
          </Button>
          <Button variant="outline" onClick={() => setSetup(null)} disabled={enCours}>
            Annuler
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
          <h2 className="font-semibold">Double authentification inactive</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {obligatoire
              ? "Ce rôle donne accès aux dossiers des élèves et aux données financières de l'établissement. Un mot de passe seul ne suffit pas à protéger ces données : la double authentification est obligatoire."
              : "Ajoute un code à usage unique à la connexion. Un mot de passe volé ne suffit alors plus à entrer dans le compte."}
          </p>
        </div>
      </div>
      <Button onClick={demarrer} disabled={enCours}>
        {enCours && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Configurer maintenant
      </Button>
    </section>
  );
}
