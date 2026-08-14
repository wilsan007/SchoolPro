import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { EleveForm } from "@/components/eleves/EleveForm";
import { getClassesForTenant, getEleveForEdit, updateEleve } from "@/lib/actions/eleve";
import { getTranslations } from "next-intl/server";

export default async function ModifierElevePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const [te, tc] = await Promise.all([
    getTranslations("eleves"),
    getTranslations("common"),
  ]);

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
          initialData={{
            nom: eleve.nom,
            prenom: eleve.prenom,
            dateNaissance: eleve.dateNaissance,
            lieuNaissance: eleve.lieuNaissance,
            nationalite: eleve.nationalite,
            sexe: eleve.sexe,
            classeId: eleve.classeId ?? undefined,
            statut: eleve.statut,
            groupeSanguin: eleve.groupeSanguin,
            allergies: eleve.allergies,
            besoinsSpeciaux: eleve.besoinsSpeciaux,
            regime: eleve.regime as "interne" | "demi-pensionnaire" | "externe" | undefined,
            transport: eleve.transport,
            contactUrgenceNom: eleve.contactUrgenceNom,
            contactUrgencePhone: eleve.contactUrgencePhone,
            numeroBoursier: eleve.numeroBoursier,
            matricule: eleve.matricule,
            parentNom: eleve.parentNom,
            parentPrenom: eleve.parentPrenom,
            parentPhone: eleve.parentPhone,
            parentEmail: eleve.parentEmail,
            parentProfession: eleve.parentProfession,
            parentAdresse: eleve.parentAdresse,
            parentLien: eleve.parentLien,
            parentIsGardien: eleve.parentIsGardien,
          }}
          submitAction={updateEleve.bind(null, id)}
          submitLabel={tc("save")}
          title={te("editStudent")}
          backHref={`/eleves/${id}`}
        />
      </div>
    </div>
  );
}
