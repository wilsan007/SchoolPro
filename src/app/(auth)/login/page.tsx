"use client";

import { useState, useTransition, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Loader2, School } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import TurnstileWidget from "@/components/security/TurnstileWidget";

// ─── Formulaire isolé dans un Suspense pour useSearchParams ───────────────────
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", totp: "" });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  /**
   * Le champ du second facteur n'apparaît qu'une fois le mot de passe
   * validé côté serveur. L'afficher d'emblée révélerait à un inconnu quels
   * comptes ont activé la double authentification — et donc lesquels ne
   * l'ont pas.
   */
  const [demande2FA, setDemande2FA] = useState(false);
  const [erreur2FA, setErreur2FA] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  // Le jeton Turnstile est à usage unique : après CHAQUE tentative de
  // connexion (même échouée), il est consommé côté Cloudflare. Incrémenter
  // cette clé remonte le widget → nouveau défi → nouveau jeton. Sans ce
  // reset, la 2e soumission (ex: après le code 2FA) échouait systématiquement.
  const [cleWidget, setCleWidget] = useState(0);
  const [turnstileErreur, setTurnstileErreur] = useState(false);
  const t = useTranslations("login");

  const LoginSchema = z.object({
    email: z.string().email(t("invalidEmail")),
    password: z.string().min(6, t("passwordTooShort")),
  });

  /** Jeton à usage unique : après chaque tentative, on repart d'un défi neuf. */
  function reinitialiserWidget() {
    setTurnstileToken("");
    setTurnstileErreur(false);
    setCleWidget((k) => k + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const parsed = LoginSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      });
      return;
    }

    // Ne pas consommer une tentative de rate-limit ni partir en « identifiants
    // incorrects » trompeur quand le défi anti-bot n'est pas prêt : bloquer
    // côté client, avec un message qui dit ce qui se passe vraiment.
    if (!turnstileToken) {
      if (turnstileErreur) {
        toast.error(t("turnstileBlocked"));
        reinitialiserWidget();
      } else {
        toast.warning(t("turnstilePending"));
      }
      return;
    }

    startTransition(async () => {
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        // Envoyé uniquement au second passage, quand le serveur l'a demandé.
        ...(demande2FA ? { totp: form.totp } : {}),
        // Jeton Turnstile (anti-bot). En dev sans sitekey, le widget envoie
        // "dev-bypass" et le serveur contourne la vérification.
        turnstileToken,
        redirect: false,
      });

      // NextAuth expose le code d'erreur tantôt en `code`, tantôt dans
      // `error` selon la version : on regarde les deux plutôt que de
      // dépendre d'un détail d'implémentation.
      const code = String(
        (result as { code?: string } | undefined)?.code ?? result?.error ?? ""
      );

      if (code.includes("2fa_requis")) {
        setDemande2FA(true);
        setErreur2FA(null);
        // Le jeton a été consommé par cette tentative : défi neuf pour le
        // second passage (soumission du code TOTP).
        reinitialiserWidget();
      } else if (code.includes("2fa_invalide")) {
        setDemande2FA(true);
        setErreur2FA(t("totpInvalide"));
        setForm((f) => ({ ...f, totp: "" }));
        reinitialiserWidget();
      } else if (code.includes("erreur_turnstile")) {
        setDemande2FA(false);
        toast.error(t("turnstileFailed"));
        reinitialiserWidget();
      } else if (result?.error) {
        setDemande2FA(false);
        toast.error(t("invalidCredentials"));
        // Mauvais mot de passe ou compte introuvable : le jeton a néanmoins
        // été consommé — sans reset, la tentative suivante échouait sur le
        // défi anti-bot (« token déjà utilisé ») avec le même message que
        // des identifiants invalides.
        reinitialiserWidget();
      } else {
        toast.success(t("signedIn"));
        router.push("/select-tenant");
        router.refresh();
      }
    });
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/40 bg-card/70 backdrop-blur-2xl shadow-[0_20px_60px_rgba(14,165,233,0.12),0_8px_24px_rgba(155,111,224,0.08)] px-8 py-10 sm:px-10 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          {t("subtitle")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="email">
            {t("email")}
          </label>
          <Input
            id="email"
            type="email"
            placeholder="admin@monecole.sn"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={errors.email ? "border-destructive" : ""}
            disabled={isPending}
            autoComplete="email"
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email}</p>
          )}
        </div>

        {/* Mot de passe */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium" htmlFor="password">
              {t("password")}
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              {t("forgotPassword")}
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={errors.password ? "border-destructive pr-10" : "pr-10"}
              disabled={isPending}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors rounded-lg p-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password}</p>
          )}
        </div>

        {/* Second facteur — affiché seulement quand le serveur le réclame */}
        {demande2FA && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="totp">
              {t("totpLabel")}
            </label>
            <Input
              id="totp"
              name="totp"
              /* `inputMode="text"` et non `numeric` : un code de secours
                 (XXXX-XXXX) contient des lettres, et un pavé numérique — iOS
                 comme Android — n'en propose aucune. Le champ ouvrait donc un
                 clavier incapable de saisir la seule issue disponible quand le
                 téléphone est perdu, ce qui revenait à fermer la porte de
                 secours. Le type reste `text` pour la même raison. */
              inputMode="text"
              autoComplete="one-time-code"
              autoFocus
              placeholder="123456"
              value={form.totp}
              onChange={(e) => setForm({ ...form, totp: e.target.value })}
              className={erreur2FA ? "border-destructive" : ""}
            />
            <p className="text-muted-foreground text-xs">
              {t("totpHint")}
            </p>
            {erreur2FA && (
              <p className="text-xs text-destructive">{erreur2FA}</p>
            )}
          </div>
        )}

        {/* Cloudflare Turnstile — défi anti-bot invisible.
            `key` : incrémentée après chaque tentative, remonte le widget pour
            obtenir un jeton neuf (l'ancien est consommé, même en cas d'échec). */}
        <TurnstileWidget
          key={cleWidget}
          onVerify={setTurnstileToken}
          onExpire={() => setTurnstileToken("")}
          onError={() => setTurnstileErreur(true)}
          className="flex justify-center"
        />

        <Button
          type="submit"
          className="w-full h-11 font-semibold"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t("signingIn")}
            </>
          ) : (
            t("signIn")
          )}
        </Button>
      </form>
    </div>
  );
}

// ─── Page principale avec Suspense (requis par Next.js 15 pour useSearchParams) ─
export default function LoginPage() {
  const t = useTranslations("login");

  return (
    <div className="min-h-screen flex bg-background">
      {/* Panneau gauche — gradient turquoise → violet (caché sur mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary via-[hsl(200,55%,42%)] to-accent">
        {/* Halo décoratif */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-[0_4px_16px_rgba(0,140,200,0.25)]">
              <School className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-display font-bold tracking-wide">SchoolPro</span>
          </div>
          <div className="max-w-md">
            <h2 className="text-4xl xl:text-5xl font-display font-bold leading-tight mb-4">
              {t("heroTitle")}
            </h2>
            <p className="text-white/80 text-lg leading-relaxed">
              {t("heroSubtitle")}
            </p>
          </div>
          <p className="text-white/60 text-sm">{t("copyright")}</p>
        </div>
      </div>

      {/* Panneau droit — formulaire glassmorphique */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8 bg-gradient-to-br from-background to-secondary/40">
        <Suspense fallback={
          <div className="flex items-center justify-center w-full h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
