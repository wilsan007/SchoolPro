import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { siteFilterForRelation, siteFilterForModel } from "@/lib/site-filter";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GrilleSaisie } from "@/components/evaluations/GrilleSaisie";
import { CompetencesEvaluation } from "@/components/evaluations/CompetencesEvaluation";
import { guardPage } from "@/lib/guard-page";
import { roleHasPermission } from "@/lib/permissions";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

export default async function SaisieNotesPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth();
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const { id: evaluationId } = await params;
  const siteFilter = siteFilterForRelation(session.user, "classe");
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

  const evaluation = await prisma.evaluation.findFirst({
    where: { id: evaluationId, tenantId: session.user.tenantId, ...siteFilter, ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}) },
    include: {
      classe: {
        include: {
          eleves: { where: siteFilterForModel("eleve", session.user), orderBy: { nom: 'asc' } },
        },
      },
      matiere: true,
      notes: true,
    }
  });

  if (!evaluation) {
    redirect("/evaluations");
  }

  // `evaluations:write` couvre tous les rôles autorisés à saisir des notes :
  // SUPER_ADMIN, TENANT_ADMIN, PRINCIPAL, CLASS_TEACHER, TEACHER, SUBJECT_LEAD.
  // La liste hardcoded précédente oubliait SUBJECT_LEAD.
  const peutModifier = roleHasPermission(session.user.role as string, "evaluations:write");

  const grille = evaluation.classe.eleves.map(eleve => {
    const existingNote = evaluation.notes.find(n => n.eleveId === eleve.id);
    return {
      eleveId: eleve.id,
      matricule: eleve.matricule,
      nom: eleve.nom,
      prenom: eleve.prenom,
      noteId: existingNote?.id ?? null,
      valeur: existingNote?.valeur ?? null,
      commentaire: existingNote?.commentaire ?? "",
    };
  });

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 bg-gray-50 min-h-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-gray-100 p-4 rounded-xl border border-gray-200">
        <div className="flex items-center gap-3">
          <StarIcon />
          <h1 className="text-lg sm:text-xl font-bold text-gray-800">
            Gestion des notes - {evaluation.titre}
          </h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link href="/evaluations" className="w-full sm:w-auto">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2 shadow-sm border-none w-full sm:w-auto">
              <ArrowLeft className="h-4 w-4" />
              Retour à l&apos;examen
            </Button>
          </Link>
          <Button className="bg-green-600 hover:bg-green-700 text-white gap-2 shadow-sm border-none w-full sm:w-auto" disabled title="Export Excel à venir">
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mt-2 ml-1">
        Saisie et consultation des notes pour l&apos;examen &quot;{evaluation.titre}&quot; de la classe {evaluation.classe.nom} en {evaluation.matiere.nom.toUpperCase()}.
      </p>

      {/* Rattachement aux compétences — sans lui, les notes saisies ci-dessous
          ne produisent qu'une preuve de granularité « matière ». */}
      <div className="mt-4">
        <CompetencesEvaluation evaluationId={evaluationId} peutModifier={peutModifier} />
      </div>

      {/* Grid */}
      <GrilleSaisie evaluation={evaluation} initialGrille={grille} />
    </div>
  );
}

function StarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-gray-700">
      <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
    </svg>
  );
}
