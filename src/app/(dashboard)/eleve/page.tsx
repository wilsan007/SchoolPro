import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DossierEnfant } from "@/components/learnos/DossierEnfant";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { dossierEleve, eleveDeLUtilisateur } from "@/lib/learnos/dossier-eleve";

/**
 * Espace de l'élève.
 *
 * Même dossier que celui du parent, deux différences volontaires :
 *  - la **prochaine action** retenue est celle dont l'élève est responsable ;
 *  - la situation financière n'apparaît pas. Un impayé est une affaire entre
 *    l'établissement et la famille ; le faire porter à l'enfant serait une
 *    faute, pas un oubli.
 */
export default async function EleveEspacePage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("learnos.dossier"),
  ]);
  await guardPage(session);

  if (session!.user.role !== "STUDENT") redirect("/dashboard");

  const tenantId = session!.user.tenantId!;
  // Le périmètre relationnel résout l'élève : aucun identifiant ne transite
  // par l'URL, il n'y a donc rien à falsifier.
  const eleve = await eleveDeLUtilisateur(tenantId, session!.user);

  const entete = (
    <Header
      title={t("titreEleve")}
      subtitle={t("sousTitreEleve")}
      userName={session!.user.name}
      userAvatar={session!.user.image ?? undefined}
    />
  );

  if (!eleve) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {entete}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="font-medium">{t("aucunEleve")}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const dossier = await dossierEleve(tenantId, eleve.id, session!.user, {
    pourResponsable: "eleve",
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {entete}
      <div className="flex-1 space-y-6 overflow-y-auto p-6 scrollbar-thin">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">
            {eleve.prenom} {eleve.nom}
          </h2>
          {eleve.classe && <Badge variant="outline">{eleve.classe.nom}</Badge>}
        </div>

        {dossier && <DossierEnfant dossier={dossier} perspective="eleve" />}
      </div>
    </div>
  );
}
