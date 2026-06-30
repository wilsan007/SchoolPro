import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { NotesOverview } from "@/components/notes/NotesOverview";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PenLine, FileText, Plus, ArrowLeft } from "lucide-react";
import { SaisieNotesSelectors } from "@/components/notes/SaisieNotesSelectors";
import { GrilleSaisie } from "@/components/evaluations/GrilleSaisie";

async function getNotesData(tenantId: string) {
  const [classes, matieres, statsNotes] = await Promise.all([
    prisma.classe.findMany({
      where: { tenantId },
      select: { id: true, nom: true, niveau: true },
      orderBy: { nom: "asc" },
    }),
    prisma.matiere.findMany({
      where: { tenantId },
      select: { id: true, nom: true, code: true, couleur: true, coefficient: true },
      orderBy: { nom: "asc" },
    }),
    prisma.note.groupBy({
      by: ["matiereId"],
      where: { tenantId },
      _avg: { valeur: true },
      _count: true,
    }),
  ]);

  return { classes, matieres, statsNotes };
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ classeId?: string; matiereId?: string; evaluationId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const { classeId, matiereId, evaluationId } = await searchParams;

  // Récupérer les classes et matières
  const { classes, matieres, statsNotes } = await getNotesData(tenantId);

  // Si classe et matière sont sélectionnées, on récupère les évaluations correspondantes
  let evaluations: any[] = [];
  if (classeId && matiereId) {
    evaluations = await prisma.evaluation.findMany({
      where: { tenantId, classeId, matiereId },
      select: { id: true, titre: true, type: true },
      orderBy: { date: "desc" },
    });
  }

  // Si tout est sélectionné, on récupère l'évaluation avec sa grille
  let evaluation: any = null;
  let grille: any[] = [];
  if (classeId && matiereId && evaluationId) {
    evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId, tenantId },
      include: {
        classe: { include: { eleves: { orderBy: { nom: 'asc' } } } },
        matiere: true,
        notes: true,
      }
    });

    if (evaluation) {
      grille = evaluation.classe.eleves.map((eleve: any) => {
        const existingNote = evaluation.notes.find((n: any) => n.eleveId === eleve.id);
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
    }
  }

  const matieresWithStats = matieres.map((m) => {
    const stat = statsNotes.find((s) => s.matiereId === m.id);
    return {
      ...m,
      moyenneClasse: stat?._avg.valeur ?? null,
      totalNotes: stat?._count ?? 0,
    };
  });

  const selectedMatiere = matieres.find(m => m.id === matiereId);
  const selectedClasse = classes.find(c => c.id === classeId);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Gestion des Notes"
        subtitle="Saisie rapide et calcul de moyennes"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        {/* Filtres de sélection en haut */}
        <SaisieNotesSelectors
          classes={classes}
          matieres={matieres}
          evaluations={evaluations}
          selectedClasseId={classeId}
          selectedMatiereId={matiereId}
          selectedEvaluationId={evaluationId}
        />

        {/* Affichage conditionnel de la Grille de Saisie, du Wizard ou de la Vue d'ensemble */}
        {evaluation ? (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-blue-50/50 p-4 rounded-xl border border-blue-100">
              <div>
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <PenLine className="h-5 w-5 text-blue-600" />
                  Saisie des notes - {evaluation.titre}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Examen pour la classe <strong>{evaluation.classe.nom}</strong> en <strong>{evaluation.matiere.nom.toUpperCase()}</strong>.
                </p>
              </div>
              <Link href="/notes">
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Retour
                </Button>
              </Link>
            </div>
            
            <GrilleSaisie evaluation={evaluation} initialGrille={grille} />
          </div>
        ) : (
          <>
            {/* Étape 1 : Si matière sélectionnée, mais pas de classe */}
            {matiereId && !classeId && (
              <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
                <div className="border-b pb-4">
                  <h2 className="text-lg font-bold text-gray-800">Saisie des notes : {selectedMatiere?.nom}</h2>
                  <p className="text-sm text-gray-500 mt-1">Veuillez sélectionner la classe pour laquelle vous souhaitez saisir les notes.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {classes.map((c) => (
                    <Link key={c.id} href={`/notes?matiereId=${matiereId}&classeId=${c.id}`}>
                      <div className="p-4 border rounded-xl hover:border-blue-500 hover:bg-blue-50/30 transition-all cursor-pointer flex flex-col justify-between h-28 shadow-sm">
                        <span className="font-bold text-gray-800 text-base">{c.nom}</span>
                        <span className="text-xs text-gray-500 uppercase font-semibold">{c.niveau ?? "Collège"}</span>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="flex justify-end pt-4 border-t">
                  <Link href="/notes">
                    <Button variant="outline">Annuler</Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Étape 2 : Si classe sélectionnée, mais pas de matière */}
            {classeId && !matiereId && (
              <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
                <div className="border-b pb-4">
                  <h2 className="text-lg font-bold text-gray-800">Saisie des notes : Classe {selectedClasse?.nom}</h2>
                  <p className="text-sm text-gray-500 mt-1">Veuillez sélectionner la matière.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {matieres.map((m) => (
                    <Link key={m.id} href={`/notes?classeId=${classeId}&matiereId=${m.id}`}>
                      <div className="p-4 border rounded-xl hover:border-blue-500 hover:bg-blue-50/30 transition-all cursor-pointer flex flex-col justify-between h-28 shadow-sm">
                        <span className="font-bold text-gray-800 text-base">{m.nom}</span>
                        <span className="text-xs text-gray-500 font-mono font-semibold uppercase">{m.code}</span>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="flex justify-end pt-4 border-t">
                  <Link href="/notes">
                    <Button variant="outline">Annuler</Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Étape 3 : Si classe + matière sélectionnés, mais pas d'évaluation */}
            {classeId && matiereId && !evaluationId && (
              <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
                <div className="border-b pb-4">
                  <h2 className="text-lg font-bold text-gray-800">
                    Saisie des notes : {selectedMatiere?.nom} en {selectedClasse?.nom}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">Veuillez sélectionner l'examen pour lequel saisir les notes.</p>
                </div>
                
                {evaluations.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {evaluations.map((ev) => (
                      <Link key={ev.id} href={`/notes?classeId=${classeId}&matiereId=${matiereId}&evaluationId=${ev.id}`}>
                        <div className="p-4 border rounded-xl hover:border-green-500 hover:bg-green-50/30 transition-all cursor-pointer flex flex-col justify-between h-28 shadow-sm">
                          <div>
                            <span className="font-bold text-gray-800 text-base block">{ev.titre}</span>
                            <span className="text-xs text-gray-500 block mt-1">Type: {ev.type}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-green-600 font-semibold uppercase">Sélectionner</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-xl text-center space-y-4">
                    <p className="text-yellow-800 font-medium">
                      Aucun examen n'a été planifié pour cette classe et cette matière.
                    </p>
                    <Link href="/evaluations">
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                        <Plus className="h-4 w-4" />
                        Planifier un examen
                      </Button>
                    </Link>
                  </div>
                )}
                
                <div className="flex justify-end pt-4 border-t">
                  <Link href="/notes">
                    <Button variant="outline">Annuler</Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Vue d'ensemble par matière */}
            {!classeId && !matiereId && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-2xl font-bold">{matieres.length}</p>
                      <p className="text-xs text-muted-foreground">Matières</p>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div>
                      <p className="text-2xl font-bold">{classes.length}</p>
                      <p className="text-xs text-muted-foreground">Classes</p>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div>
                      <p className="text-2xl font-bold">
                        {statsNotes.reduce((sum, s) => sum + s._count, 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">Notes saisies</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline" className="gap-2">
                      <Link href="/notes/bulletins">
                        <FileText className="h-4 w-4" />
                        Bulletins
                      </Link>
                    </Button>
                    <Button asChild size="sm" className="gap-2">
                      <Link href="/evaluations">
                        <Plus className="h-4 w-4" />
                        Planifier examen
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Vue d'ensemble par matière */}
                <NotesOverview matieres={matieresWithStats} classes={classes} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
