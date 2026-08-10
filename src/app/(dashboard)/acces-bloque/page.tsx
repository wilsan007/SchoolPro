import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { checkUserFinancialBlock } from "@/lib/financial-guard";
import { Lock, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";

export default async function AccessBlockedPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("common"),
  ]);
  if (!session?.user) redirect("/login");
  if (!session.user.tenantId) redirect("/select-tenant");

  const block = await checkUserFinancialBlock(session.user.id, session.user.tenantId);

  if (!block.blocked) redirect("/dashboard");

  const message = block.messageKey ? t(block.messageKey, block.messageParams ?? {}) : "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <Lock className="h-8 w-8 text-red-600" />
          </div>

          <div>
            <h1 className="text-xl font-bold text-slate-900">{t("financialBlock.title")}</h1>
            <p className="text-sm text-slate-500 mt-1">{t("financialBlock.subtitle")}</p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 text-left">{message}</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-slate-400">
              {t("financialBlock.contactAdmin")}
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/api/auth/signout">{t("financialBlock.signout")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
