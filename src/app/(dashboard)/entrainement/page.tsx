import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { guardPage } from "@/lib/guard-page";
import { SeanceEntrainement } from "@/components/learnos/SeanceEntrainement";

/**
 * Entraînement autonome de l'élève.
 *
 * Écran délibérément nu : un exercice à la fois, rien autour. Un tableau de
 * bord ici — statistiques, séries, classement — déplacerait l'attention du
 * travail vers le score, alors que c'est précisément le score qui compte le
 * moins dans ce dispositif (cf. `FIABILITE_PAR_TYPE.AUTO_ENTRAINEMENT`).
 *
 * Le composant ne reçoit pas d'`eleveId` : pour un élève, la séance est la
 * sienne, résolue serveur depuis la session. Un identifiant passé en propriété
 * serait un identifiant modifiable.
 */
export default async function EntrainementPage() {
  const [session, t] = await Promise.all([auth(), getTranslations("learnos.entrainement")]);
  await guardPage(session);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titre")}
        subtitle={t("sousTitre")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="max-w-2xl mx-auto">
          <SeanceEntrainement />
        </div>
      </div>
    </div>
  );
}
