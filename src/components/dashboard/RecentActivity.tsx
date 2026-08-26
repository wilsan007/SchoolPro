import { getTranslations } from "next-intl/server";
import { AccentCard, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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

export async function RecentActivity({ notes }: { notes: Note[] }) {
  const t = await getTranslations("dashboard");
  return (
    <AccentCard accent="emerald">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">{t("recentGrades")}</CardTitle>
        <Badge variant="emerald" className="text-xs">{t("latestCount", { count: notes.length })}</Badge>
      </CardHeader>
      <CardContent>
        {notes.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={t("noRecentGrades")}
            description="Les notes saisies récemment apparaîtront ici."
            accent="emerald"
            size="sm"
          />
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {notes.map((note) => (
              <div key={note.id} className="flex items-center gap-3 sm:gap-4">
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
                  <span className={`text-sm font-bold font-data ${getNoteColor(note.valeur, note.noteMax)}`}>
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
    </AccentCard>
  );
}
