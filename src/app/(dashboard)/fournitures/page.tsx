import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { guardPage } from "@/lib/guard-page";
import { Header } from "@/components/layout/Header";
import { FournituresSecretariat } from "@/components/fournitures/FournituresSecretariat";
import {
  getAllDemandesFournitures,
  getClassesParNiveau,
} from "@/lib/actions/fournitures";

export const metadata = {
  title: "Fournitures scolaires — Compilation | EcolPro",
};

export default async function FournituresPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");
  await guardPage(session, "eleves:read");

  const [demandes, classesParNiveau] = await Promise.all([
    getAllDemandesFournitures(),
    getClassesParNiveau(),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Fournitures scolaires"
        subtitle="Compilez et publiez les listes de fournitures pour les classes"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <FournituresSecretariat
          demandes={demandes.map((d) => ({
            id: d.id,
            niveau: d.niveau,
            matiereId: d.matiereId,
            matiere: d.matiere ? { nom: d.matiere.nom } : null,
            enseignant: { user: { name: d.enseignant.user.name } },
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
          classesParNiveau={classesParNiveau}
        />
      </div>
    </div>
  );
}
