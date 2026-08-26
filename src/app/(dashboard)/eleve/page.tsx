import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DossierEnfant } from "@/components/learnos/DossierEnfant";
import { EvolutionEleve } from "@/components/learnos/EvolutionEleve";
import { CompetencesEleve } from "@/components/learnos/CompetencesEleve";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { dossierEleve, eleveDeLUtilisateur } from "@/lib/learnos/dossier-eleve";
import { getDemoNow } from "@/lib/demo-now";

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
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
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
    maintenant: await getDemoNow(),
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {entete}
      <div className="flex-1 space-y-6 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg sm:text-xl font-semibold truncate">
            {eleve.prenom} {eleve.nom}
          </h2>
          {eleve.classe && <Badge variant="outline">{eleve.classe.nom}</Badge>}
        </div>

        {dossier && <DossierEnfant dossier={dossier} perspective="eleve" />}

        {/* Détail des compétences par matière (LEARNOS) */}
        <CompetencesEleve eleveId={eleve.id} />

        {/* Évolution annuelle : prédictions vs réalité, trajectoire, bulletins */}
        <EvolutionEleve eleveId={eleve.id} />
      </div>
    </div>
  );
}
