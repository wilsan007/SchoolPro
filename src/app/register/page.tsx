import { RegisterForm } from "@/components/auth/RegisterForm";
import { getTranslations } from "next-intl/server";

export default async function RegisterPage() {
  const t = await getTranslations("login");
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-slate-950 dark:to-slate-900 p-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            {t("noAccount")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inscrivez votre établissement en quelques minutes. Essai gratuit de 30 jours.
          </p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}

