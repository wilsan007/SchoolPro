import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default async function NouveauElevePage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Inscrire un élève"
        subtitle="Créer une nouvelle fiche élève"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="mb-4">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/eleves">
              <ArrowLeft className="h-4 w-4" />
              Retour à la liste
            </Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Formulaire d&apos;inscription</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Le formulaire complet d&apos;inscription d&apos;un nouvel élève sera bientôt disponible ici.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
