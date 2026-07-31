"use client";

import { useState, useTransition, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { School, Eye, EyeOff, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

const LoginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Mot de passe trop court"),
});

// ─── Formulaire isolé dans un Suspense pour useSearchParams ───────────────────
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const t = useTranslations("login");

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
        redirect: false,
      });

      if (result?.error) {
        toast.error(t("title") === "Sign In" ? "Invalid email or password" : "Email ou mot de passe incorrect");
      } else {
        toast.success(t("title") === "Sign In" ? "Signed in!" : "Connexion réussie !");
        router.push("/select-tenant");
        router.refresh();
      }
    });
  }

  return (
    <div className="w-full max-w-md">
      {/* Logo mobile */}
      <div className="flex items-center gap-3 mb-8 lg:hidden">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
          <School className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-bold">EcolPro</span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
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

      {/* Démo */}
      <div className="mt-6 p-4 rounded-xl bg-muted border border-border">
        <p className="text-xs font-semibold text-foreground mb-2">🎓 Comptes de test disponibles</p>
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="font-mono space-y-0.5">
            <p className="font-semibold text-foreground">Directeur (Ilyas Aden) :</p>
            <p>admin@lycee-demo.ecolpro.app</p>
            <p>Demo@2026!</p>
          </div>
          <div className="font-mono space-y-0.5 border-t pt-2">
            <p className="font-semibold text-foreground">Super Admin (Mariam) :</p>
            <p>superadmin@ecolpro.app</p>
            <p>Demo@2026!</p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={() => setForm({ email: "admin@lycee-demo.ecolpro.app", password: "Demo@2026!" })}
          >
            Directeur
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={() => setForm({ email: "superadmin@ecolpro.app", password: "Demo@2026!" })}
          >
            Super Admin
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale avec Suspense (requis par Next.js 15 pour useSearchParams) ─
export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      {/* Panneau gauche — Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
            <School className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-indigo-200 to-purple-200 bg-clip-text text-transparent">EcolPro</span>
        </div>
        <div>
          <blockquote className="text-2xl font-light leading-relaxed text-white/90">
            &ldquo;La plateforme de gestion scolaire la plus moderne d&apos;Afrique. Élèves, absences, notes — tout en un.&rdquo;
          </blockquote>
          <div className="mt-8 flex items-center gap-4">
            <div className="flex -space-x-2">
              {["MK", "FD", "AB", "OS"].map((init) => (
                <div key={init} className="w-8 h-8 rounded-full bg-indigo-500/40 border-2 border-slate-900 flex items-center justify-center text-xs font-semibold">
                  {init}
                </div>
              ))}
            </div>
            <p className="text-sm text-white/70">
              Rejoignez plus de <strong className="text-white">500+ établissements</strong>
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6 text-center">
          {[
            { label: "Élèves gérés", value: "150+" },
            { label: "Établissements", value: "3" },
            { label: "Pays", value: "2" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-2xl font-bold text-indigo-400">{stat.value}</p>
              <p className="text-xs text-white/50 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Panneau droit — Formulaire */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
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
