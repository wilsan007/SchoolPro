import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getBulletinAnnuelData } from "@/lib/pdf/bulletin-generator";
import { BulletinAnnuelPreview } from "@/components/bulletins/BulletinAnnuelPreview";
import { PrintButton } from "@/components/bulletins/PrintButton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { checkEleveAccess } from "@/lib/financial-guard";

export default async function BulletinAnnuelPage({
  params,
}: {
  params: Promise<{ eleveId: string; anneeId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { eleveId, anneeId } = await params;

  // Blocage financier : bloquer l'accès aux bulletins annuels pour les élèves exclus
  if (session.user.role === "PARENT" || session.user.role === "STUDENT") {
    const access = await checkEleveAccess(eleveId, session.user.tenantId);
    if (!access.allowed) {
      redirect("/acces-bloque");
    }
  }

  const data = await getBulletinAnnuelData(eleveId, anneeId, session.user.tenantId);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <p className="text-lg font-semibold text-gray-600 mb-4">
          Bulletin annuel introuvable. Veuillez d&apos;abord générer les bulletins trimestriels.
        </p>
        <Link href="/notes/bulletins">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Retour aux bulletins
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto mb-4 print:hidden">
        <Link href="/notes/bulletins">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
        </Link>
        <PrintButton />
      </div>
      <div className="flex justify-center px-4 sm:px-6 lg:px-8">
        <BulletinAnnuelPreview data={data} />
      </div>
    </div>
  );
}
