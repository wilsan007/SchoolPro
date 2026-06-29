import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials, formatDate, getNoteColor } from "@/lib/utils";
import { BookOpen } from "lucide-react";

interface Note {
  id: string;
  valeur: number;
  noteMax: number;
  date: Date;
  type: string;
  intitule: string | null;
  eleve: { nom: string; prenom: string };
  matiere: { nom: string; couleur: string | null };
}

export function RecentActivity({ notes }: { notes: Note[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Notes récentes</CardTitle>
        <Badge variant="secondary" className="text-xs">{notes.length} dernières</Badge>
      </CardHeader>
      <CardContent>
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Aucune note saisie récemment</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <div key={note.id} className="flex items-center gap-4">
                <Avatar className="h-9 w-9 flex-shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {getInitials(`${note.eleve.prenom} ${note.eleve.nom}`)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {note.eleve.prenom} {note.eleve.nom}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: note.matiere.couleur ?? "#6b7280" }}
                    />
                    <p className="text-xs text-muted-foreground truncate">
                      {note.matiere.nom} — {note.intitule ?? note.type}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`text-sm font-bold ${getNoteColor(note.valeur, note.noteMax)}`}>
                    {note.valeur}/{note.noteMax}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(note.date, "dd/MM")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
