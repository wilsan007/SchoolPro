import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { guardPage } from "@/lib/guard-page";
import { Header } from "@/components/layout/Header";
import { FournituresEnseignant } from "@/components/fournitures/FournituresEnseignant";
import {
  getNiveauxForEnseignant,
  getMatieresForEnseignant,
  getMesDemandesFournitures,
} from "@/lib/actions/fournitures";

export const metadata = {
  title: "Fournitures scolaires | EcolPro",
};

export default async function FournituresEnseignantPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");
  await guardPage(session, "curriculum:read");

  const [niveaux, matieres, demandes] = await Promise.all([
    getNiveauxForEnseignant(),
    getMatieresForEnseignant(),
    getMesDemandesFournitures(),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Fournitures scolaires"
        subtitle="Formulez vos besoins en fournitures et livres pour vos classes"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <FournituresEnseignant
          niveaux={niveaux}
          matieres={matieres.map((m) => ({ id: m.id, nom: m.nom }))}
          demandes={demandes.map((d) => ({
            id: d.id,
            niveau: d.niveau,
            matiereId: d.matiereId,
            matiere: d.matiere ? { nom: d.matiere.nom } : null,
            type: d.type,
            nom: d.nom,
            description: d.description,
            quantite: d.quantite,
            format: d.format,
            prixEstime: d.prixEstime,
            statut: d.statut,
            commentaireValidation: d.commentaireValidation,
            createdAt: d.createdAt,
          }))}
        />
      </div>
    </div>
  );
}
