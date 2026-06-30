import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GrilleSaisie } from "@/components/evaluations/GrilleSaisie";

export default async function SaisieNotesPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { id: evaluationId } = await params;
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId, tenantId: session.user.tenantId },
    include: {
      classe: { include: { eleves: { orderBy: { nom: 'asc' } } } },
      matiere: true,
      notes: true,
    }
  });

  if (!evaluation) {
    redirect("/evaluations");
  }

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
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Top Header */}
      <div className="flex justify-between items-center bg-gray-100 p-4 rounded-xl border border-gray-200">
        <div className="flex items-center gap-3">
          <StarIcon />
          <h1 className="text-xl font-bold text-gray-800">
            Gestion des notes - {evaluation.titre}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/evaluations">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2 shadow-sm border-none">
              <ArrowLeft className="h-4 w-4" />
              Retour à l'examen
            </Button>
          </Link>
          <Button className="bg-green-600 hover:bg-green-700 text-white gap-2 shadow-sm border-none">
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mt-2 ml-1">
        Saisie et consultation des notes pour l'examen "{evaluation.titre}" de la classe {evaluation.classe.nom} en {evaluation.matiere.nom.toUpperCase()}.
      </p>

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
