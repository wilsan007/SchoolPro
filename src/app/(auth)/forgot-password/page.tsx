"use client";

import { useState, useTransition } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import TurnstileWidget from "@/components/security/TurnstileWidget";

export default function ForgotPasswordPage() {
  const t = useTranslations("forgotPassword");
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>("");

  const EmailSchema = z.object({
    email: z.string().email(t("invalidEmail")),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = EmailSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.flatten().fieldErrors.email?.[0] ?? null);
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, turnstileToken }),
        });
        if (!res.ok) throw new Error();
        setSuccess(true);
      } catch {
        setError(t("error"));
      }
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8 bg-background">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
        </div>

        {success ? (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground rounded-md border border-border bg-muted/50 p-4">
              {t("success")}
            </p>
            <Link
              href="/login"
              className="block text-center text-sm font-medium text-primary hover:underline"
            >
              {t("backToLogin")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="email">
                {t("email")}
              </label>
              <Input
                id="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={error ? "border-destructive" : ""}
                disabled={isPending}
                autoComplete="email"
                autoFocus
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

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
                  {t("sending")}
                </>
              ) : (
                t("submit")
              )}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t("backToLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
}
