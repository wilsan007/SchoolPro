"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { changePassword } from "@/lib/actions/profil";

/**
 * Traduit un code d'erreur renvoyé par `changePassword` en message localisé.
 *
 * L'action serveur renvoie des codes stables (ex. `PASSWORD_TOO_SHORT`) pour
 * rester indépendante de la locale — on les mappe ici sur les clés i18n.
 */
function traduireErreur(
  message: string,
  tPwd: (k: string) => string,
  tProfil: (k: string) => string
): string {
  // L'action peut renvoyer plusieurs codes séparés par des virgules
  // (ex. `PASSWORD_TOO_SHORT,PASSWORD_MISSING_UPPERCASE`). On traduit le
  // premier code reconnu — c'est la règle la plus prioritaire.
  const codes = message.split(",");
  const map: Record<string, string> = {
    PASSWORD_TOO_SHORT: tPwd("tooShort"),
    PASSWORD_MISSING_UPPERCASE: tPwd("missingUppercase"),
    PASSWORD_MISSING_LOWERCASE: tPwd("missingLowercase"),
    PASSWORD_MISSING_NUMBER: tPwd("missingNumber"),
    PASSWORD_MISSING_SPECIAL: tPwd("missingSpecial"),
    PASSWORD_DONT_MATCH: tPwd("dontMatch"),
    PASSWORD_SAME_AS_OLD: tPwd("sameAsOld"),
    WRONG_CURRENT_PASSWORD: tPwd("wrongCurrent"),
    PASSWORD_CURRENT_REQUIRED: tProfil("currentPassword") + " — requis",
    PASSWORD_NEW_REQUIRED: tProfil("newPassword") + " — requis",
    PASSWORD_CONFIRM_REQUIRED: tProfil("confirmPassword") + " — requis",
    NON_AUTORISE: tProfil("passwordError"),
    UTILISATEUR_INTROUVABLE: tProfil("passwordError"),
  };
  for (const code of codes) {
    const trimmed = code.trim();
    if (map[trimmed]) return map[trimmed];
  }
  // Repli : message brut (français serveur) si le code n'est pas reconnu.
  return message;
}

export function ChangePasswordForm({ mustChange }: { mustChange: boolean }) {
  const t = useTranslations("profil");
  const tPwd = useTranslations("common.password");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);
    try {
      await changePassword({ currentPassword, newPassword, confirmPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(t("passwordChanged"));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("passwordError");
      toast.error(traduireErreur(message, tPwd, t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className={mustChange ? "border-orange-300" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          {t("changePassword")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {mustChange && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30 p-3 text-sm text-orange-700 dark:text-orange-300">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{t("mustChangeTitle")}</p>
              <p className="mt-1">{t("mustChangeDesc")}</p>
            </div>
          </div>
        )}

        {success && !mustChange && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 p-3 text-sm text-green-700 dark:text-green-300">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <p>{t("passwordChanged")}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">{t("newPassword")}</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">{tPwd("requirements")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {t("changePasswordBtn")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
