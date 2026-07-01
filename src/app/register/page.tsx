import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-slate-950 dark:to-slate-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Créer votre espace EcolPro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Le formulaire d&apos;inscription en ligne sera bientôt disponible.
            Pour l&apos;instant, contactez l&apos;équipe EcolPro pour créer votre établissement.
          </p>
          <Button asChild variant="outline" className="w-full gap-2">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Retour à l&apos;accueil
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
