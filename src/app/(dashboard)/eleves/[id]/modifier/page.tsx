import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { EleveForm } from "@/components/eleves/EleveForm";
import { getClassesForTenant, getEleveForEdit, updateEleve } from "@/lib/actions/eleve";

export default async function ModifierElevePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { id } = await params;
  const [classes, eleve] = await Promise.all([
    getClassesForTenant(),
    getEleveForEdit(id),
  ]);

  if (!eleve) notFound();

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={`Modifier ${eleve.prenom} ${eleve.nom}`}
        subtitle={eleve.matricule}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <EleveForm
          classes={classes}
          initialData={eleve}
          submitAction={updateEleve.bind(null, id)}
          submitLabel="Enregistrer"
          title="Modifier un élève"
          backHref={`/eleves/${id}`}
        />
      </div>
    </div>
  );
}
