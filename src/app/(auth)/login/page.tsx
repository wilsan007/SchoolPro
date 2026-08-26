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
  const t = useTranslations("login");

  const LoginSchema = z.object({
    email: z.string().email(t("invalidEmail")),
    password: z.string().min(6, t("passwordTooShort")),
  });

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
      } else if (code.includes("2fa_invalide")) {
        setDemande2FA(true);
        setErreur2FA("Code de vérification incorrect ou expiré.");
        setForm((f) => ({ ...f, totp: "" }));
      } else if (result?.error) {
        setDemande2FA(false);
        toast.error(t("invalidCredentials"));
      } else {
        toast.success(t("title") === "Sign In" ? "Signed in!" : "Connexion réussie !");
        router.push("/select-tenant");
        router.refresh();
      }
    });
  }

  return (
    <div className="w-full max-w-md rounded-[28px] border border-white/40 bg-card/70 backdrop-blur-2xl shadow-[0_20px_60px_rgba(14,165,233,0.12),0_8px_24px_rgba(155,111,224,0.08)] px-8 py-10 sm:px-10 sm:py-12">
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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
              Code de vérification
            </label>
            <Input
              id="totp"
              name="totp"
              /* inputMode numeric : ouvre le pavé numérique sur mobile.
                 Le type reste `text` car un code de secours contient un
                 tiret et des lettres. */
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="123456"
              value={form.totp}
              onChange={(e) => setForm({ ...form, totp: e.target.value })}
              className={erreur2FA ? "border-destructive" : ""}
            />
            <p className="text-muted-foreground text-xs">
              Code à 6 chiffres de votre application d&apos;authentification,
              ou l&apos;un de vos codes de secours.
            </p>
            {erreur2FA && (
              <p className="text-xs text-destructive">{erreur2FA}</p>
            )}
          </div>
        )}

        {/* Cloudflare Turnstile — défi anti-bot invisible */}
        <TurnstileWidget
          onVerify={setTurnstileToken}
          onExpire={() => setTurnstileToken("")}
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
  return (
    <div className="min-h-screen flex bg-background">
      {/* Panneau gauche — gradient turquoise → violet (caché sur mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary via-[hsl(200,55%,42%)] to-accent">
        {/* Halos décoratifs */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[28rem] h-[28rem] rounded-full bg-accent/30 blur-3xl" />
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-[0_4px_16px_rgba(0,140,200,0.3),0_0_20px_rgba(140,90,220,0.15)]">
              <School className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-display font-bold tracking-wide">SchoolPro</span>
          </div>
          <div className="max-w-md">
            <h2 className="text-4xl xl:text-5xl font-display font-bold leading-tight mb-4">
              La gestion scolaire de nouvelle génération
            </h2>
            <p className="text-white/80 text-lg leading-relaxed">
              Élèves, notes, absences, IA pédagogique LEARNOS — tout réuni dans une plateforme fluide et moderne.
            </p>
          </div>
          <p className="text-white/60 text-sm">© SchoolPro — Djibouti</p>
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
