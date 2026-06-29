"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, Users, CheckCheck, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Eleve {
  id: string;
  nom: string;
  prenom: string;
  photoUrl: string | null;
  sexe: string;
  matricule: string;
}

interface Classe {
  id: string;
  nom: string;
  niveau: string;
  eleves: Eleve[];
}

type Presence = "present" | "absent" | "retard" | null;

export function AppelInterface({
  classes,
  tenantId,
}: {
  classes: Classe[];
  tenantId: string;
}) {
  const [selectedClasseId, setSelectedClasseId] = useState<string>(
    classes[0]?.id ?? ""
  );
  const [presences, setPresences] = useState<Record<string, Presence>>({});
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);

  const selectedClasse = classes.find((c) => c.id === selectedClasseId);
  const eleves = selectedClasse?.eleves ?? [];

  const stats = {
    total: eleves.length,
    presents: Object.values(presences).filter((p) => p === "present").length,
    absents: Object.values(presences).filter((p) => p === "absent").length,
    retards: Object.values(presences).filter((p) => p === "retard").length,
    nonSaisis: eleves.filter((e) => !presences[e.id]).length,
  };

  function setPresence(eleveId: string, status: Presence) {
    setPresences((prev) => ({ ...prev, [eleveId]: status }));
  }

  function marquerTousPresents() {
    const all: Record<string, Presence> = {};
    eleves.forEach((e) => { all[e.id] = "present"; });
    setPresences(all);
  }

  function reset() {
    setPresences({});
    setSubmitted(false);
  }

  async function soumettre() {
    if (stats.nonSaisis > 0) {
      toast.warning(`${stats.nonSaisis} élève(s) non saisis`);
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/absences/appel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classeId: selectedClasseId,
            presences,
            date: new Date().toISOString(),
          }),
        });
        if (!res.ok) throw new Error();
        setSubmitted(true);
        toast.success("Appel enregistré avec succès !");
      } catch {
        toast.error("Erreur lors de l'enregistrement de l'appel");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Sélection de classe */}
      <div className="lg:col-span-1">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Classes</CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-0">
            <div className="space-y-1">
              {classes.map((classe) => (
                <button
                  key={classe.id}
                  onClick={() => { setSelectedClasseId(classe.id); setPresences({}); setSubmitted(false); }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    selectedClasseId === classe.id
                      ? "bg-primary text-white"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <span>{classe.nom}</span>
                  <Badge
                    variant={selectedClasseId === classe.id ? "outline" : "secondary"}
                    className={cn("text-xs", selectedClasseId === classe.id && "border-white/50 text-white")}
                  >
                    {classe.eleves.length}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Récap */}
        {eleves.length > 0 && (
          <Card className="mt-4">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold">Récapitulatif</p>
              {[
                { label: "Total", value: stats.total, color: "text-foreground" },
                { label: "Présents", value: stats.presents, color: "text-green-600 dark:text-green-400" },
                { label: "Absents", value: stats.absents, color: "text-red-500 dark:text-red-400" },
                { label: "Retards", value: stats.retards, color: "text-yellow-600 dark:text-yellow-400" },
                { label: "Non saisis", value: stats.nonSaisis, color: "text-muted-foreground" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Interface appel */}
      <div className="lg:col-span-3">
        {!selectedClasse ? (
          <Card className="h-64 flex items-center justify-center">
            <p className="text-muted-foreground">Sélectionnez une classe</p>
          </Card>
        ) : submitted ? (
          <Card className="h-64 flex flex-col items-center justify-center gap-4">
            <CheckCheck className="h-12 w-12 text-green-500" />
            <div className="text-center">
              <p className="text-lg font-semibold">Appel enregistré !</p>
              <p className="text-sm text-muted-foreground">
                {stats.presents} présents · {stats.absents} absents · {stats.retards} retards
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={reset} className="gap-2">
              <RotateCcw className="h-4 w-4" /> Refaire l'appel
            </Button>
          </Card>
        ) : (
          <Card>
            {/* En-tête */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="font-semibold">{selectedClasse.nom}</h2>
                <p className="text-sm text-muted-foreground">{eleves.length} élèves</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={marquerTousPresents}>
                  <Users className="h-4 w-4" />
                  Tous présents
                </Button>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={soumettre}
                  disabled={isPending}
                >
                  <CheckCheck className="h-4 w-4" />
                  {isPending ? "Enregistrement..." : "Valider l'appel"}
                </Button>
              </div>
            </div>

            {/* Grille élèves */}
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {eleves.map((eleve) => {
                const status = presences[eleve.id] ?? null;
                return (
                  <div
                    key={eleve.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border-2 transition-all",
                      status === "present" && "border-green-400 bg-green-50 dark:bg-green-900/10",
                      status === "absent" && "border-red-400 bg-red-50 dark:bg-red-900/10",
                      status === "retard" && "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10",
                      !status && "border-border bg-background hover:border-muted-foreground/30"
                    )}
                  >
                    <Avatar className="h-9 w-9 flex-shrink-0">
                      {eleve.photoUrl && <AvatarImage src={eleve.photoUrl} />}
                      <AvatarFallback className="text-xs bg-muted font-semibold">
                        {getInitials(`${eleve.prenom} ${eleve.nom}`)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {eleve.prenom} {eleve.nom}
                      </p>
                      <p className="text-xs text-muted-foreground">{eleve.matricule}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => setPresence(eleve.id, "present")}
                        title="Présent"
                        className={cn(
                          "p-1.5 rounded-lg transition-all",
                          status === "present"
                            ? "bg-green-500 text-white"
                            : "hover:bg-green-100 text-green-600 dark:hover:bg-green-900/30"
                        )}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPresence(eleve.id, "retard")}
                        title="Retard"
                        className={cn(
                          "p-1.5 rounded-lg transition-all",
                          status === "retard"
                            ? "bg-yellow-500 text-white"
                            : "hover:bg-yellow-100 text-yellow-600 dark:hover:bg-yellow-900/30"
                        )}
                      >
                        <Clock className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPresence(eleve.id, "absent")}
                        title="Absent"
                        className={cn(
                          "p-1.5 rounded-lg transition-all",
                          status === "absent"
                            ? "bg-red-500 text-white"
                            : "hover:bg-red-100 text-red-600 dark:hover:bg-red-900/30"
                        )}
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
