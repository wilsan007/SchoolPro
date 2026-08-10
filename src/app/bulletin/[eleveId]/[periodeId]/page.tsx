import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getBulletinData } from "@/lib/pdf/bulletin-generator";
import { BulletinPreview } from "@/components/bulletins/BulletinPreview";
import { PrintButton } from "@/components/bulletins/PrintButton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { checkEleveAccess } from "@/lib/financial-guard";

export default async function BulletinPage({
  params,
}: {
  params: Promise<{ eleveId: string; periodeId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { eleveId, periodeId } = await params;

  // Blocage financier : bloquer l'accès aux bulletins pour les élèves exclus
  if (session.user.role === "PARENT" || session.user.role === "STUDENT") {
    const access = await checkEleveAccess(eleveId, session.user.tenantId);
    if (!access.allowed) {
      redirect("/acces-bloque");
    }
  }

  const data = await getBulletinData(eleveId, periodeId, session.user.tenantId);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <p className="text-lg font-semibold text-gray-600 mb-4">
          Bulletin introuvable. Veuillez d&apos;abord générer les bulletins pour cette classe et cette période.
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
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-4xl mx-auto mb-4 flex justify-between items-center px-4 print:hidden">
        <Link href="/notes/bulletins">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
        </Link>
        <PrintButton />
      </div>
      <div className="flex justify-center">
        <BulletinPreview data={data} />
      </div>
    </div>
  );
}
