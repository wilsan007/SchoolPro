import { useState, useMemo } from "react";
import { View, Text, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, MapPin, Users, ChevronRight, School } from "lucide-react-native";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface EmploiItem {
  id: string;
  jour: string;
  heureDebut: string;
  heureFin: string;
  classe: { id: string; nom: string; niveau: string };
  matiere: { nom: string; code: string; couleur: string | null };
  enseignant?: { id: string; user: { name: string } } | null;
  salle?: string | null;
}

interface ClasseItem {
  id: string;
  nom: string;
  niveau: string;
}

const JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];
const JOURS_COURTS: Record<string, string> = {
  LUNDI: "Lun",
  MARDI: "Mar",
  MERCREDI: "Mer",
  JEUDI: "Jeu",
  VENDREDI: "Ven",
  SAMEDI: "Sam",
};

// Mapping niveau → groupe
function getGroupe(niveau: string): string {
  const n = niveau.toUpperCase().trim();
  if (["TERMINALE", "PREMIERE", "SECONDE", "TLE", "1ERE", "2NDE"].some((k) => n.includes(k)))
    return "Lycée";
  if (["TROISIEME", "QUATRIEME", "CINQUIEME", "SIXIEME", "3EME", "4EME", "5EME", "6EME"].some((k) => n.includes(k)))
    return "Collège";
  if (["CM2", "CM1", "CE2", "CE1", "CP", "MATERNELLE", "PRESCOLAIRE"].some((k) => n.includes(k)))
    return "Primaire";
  return "Autre";
}

const GROUPES = ["Lycée", "Collège", "Primaire", "Autre"];
const GROUPE_COLORS: Record<string, string> = {
  "Lycée": "#7c3aed",
  "Collège": "#2563eb",
  "Primaire": "#059669",
  "Autre": "#6b7280",
};

export default function EmploiDuTempsScreen() {
  const [selectedGroupe, setSelectedGroupe] = useState<string | null>(null);
  const [selectedNiveau, setSelectedNiveau] = useState<string | null>(null);
  const [selectedClasseId, setSelectedClasseId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState("LUNDI");

  const { data: emploiData, isLoading: emploiLoading } = useQuery<{ emploi: EmploiItem[] }>({
    queryKey: ["emploi-du-temps"],
    queryFn: () => apiFetch<{ emploi: EmploiItem[] }>("/api/mobile/emploi-du-temps"),
  });

  const { data: classesData } = useQuery<{ classes: ClasseItem[] }>({
    queryKey: ["classes"],
    queryFn: () => apiFetch<{ classes: ClasseItem[] }>("/api/mobile/classes"),
  });

  const emploi = emploiData?.emploi ?? [];
  const classes = classesData?.classes ?? [];

  // Grouper les classes par groupe puis par niveau
  const classesByGroupe = useMemo(() => {
    const map: Record<string, Record<string, ClasseItem[]>> = {};
    for (const c of classes) {
      const g = getGroupe(c.niveau);
      if (!map[g]) map[g] = {};
      if (!map[g][c.niveau]) map[g][c.niveau] = [];
      map[g][c.niveau].push(c);
    }
    // Trier les classes dans chaque niveau
    for (const g of Object.keys(map)) {
      for (const n of Object.keys(map[g])) {
        map[g][n].sort((a, b) => a.nom.localeCompare(b.nom));
      }
    }
    return map;
  }, [classes]);

  // Niveaux du groupe sélectionné
  const niveauxDuGroupe = selectedGroupe
    ? Object.keys(classesByGroupe[selectedGroupe] ?? {}).sort()
    : [];

  // Classes du niveau sélectionné
  const classesDuNiveau = selectedGroupe && selectedNiveau
    ? classesByGroupe[selectedGroupe]?.[selectedNiveau] ?? []
    : [];

  // Cours de la classe sélectionnée
  const coursClasse = emploi.filter((e) => e.classe.id === selectedClasseId);
  const coursDuJour = coursClasse
    .filter((e) => e.jour === selectedDay)
    .sort((a, b) => a.heureDebut.localeCompare(b.heureFin));

  // Nom de la classe sélectionnée
  const selectedClasse = classes.find((c) => c.id === selectedClasseId);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-5 pt-3 pb-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Emploi du temps</Text>
        <Text className="text-xs text-gray-500 mt-0.5">
          {selectedClasse
            ? `Classe: ${selectedClasse.nom}`
            : "Sélectionnez une classe"}
        </Text>
      </View>

      {emploiLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {/* Étape 1: Sélection du groupe */}
          <Text className="text-xs font-bold text-gray-400 uppercase mb-2">1. Groupe</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {GROUPES.map((g) => {
              const isActive = selectedGroupe === g;
              const count = selectedGroupe === g ? Object.keys(classesByGroupe[g] ?? {}).length : 0;
              if (!classesByGroupe[g]) return null;
              return (
                <Pressable
                  key={g}
                  onPress={() => {
                    setSelectedGroupe(g);
                    setSelectedNiveau(null);
                    setSelectedClasseId(null);
                  }}
                  className={cn(
                    "px-4 py-2.5 rounded-xl flex-row items-center",
                    isActive ? "bg-white border-2" : "bg-white border border-gray-100"
                  )}
                  style={isActive ? { borderColor: GROUPE_COLORS[g] } : undefined}
                >
                  <View className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: GROUPE_COLORS[g] }} />
                  <Text className={cn("text-sm font-bold", isActive ? "text-gray-900" : "text-gray-600")}>
                    {g}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Étape 2: Sélection du niveau */}
          {selectedGroupe && (
            <>
              <Text className="text-xs font-bold text-gray-400 uppercase mb-2">2. Niveau</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {niveauxDuGroupe.map((n) => {
                  const isActive = selectedNiveau === n;
                  const count = classesByGroupe[selectedGroupe][n].length;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => {
                        setSelectedNiveau(n);
                        setSelectedClasseId(null);
                      }}
                      className={cn(
                        "px-4 py-2.5 rounded-xl",
                        isActive ? "bg-primary" : "bg-white border border-gray-100"
                      )}
                    >
                      <Text className={cn("text-sm font-bold", isActive ? "text-white" : "text-gray-700")}>
                        {n}
                      </Text>
                      <Text className={cn("text-xs mt-0.5", isActive ? "text-white/70" : "text-gray-400")}>
                        {count} classe{count > 1 ? "s" : ""}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* Étape 3: Sélection de la classe */}
          {selectedGroupe && selectedNiveau && (
            <>
              <Text className="text-xs font-bold text-gray-400 uppercase mb-2">3. Classe</Text>
              <View style={{ gap: 8 }} className="mb-4">
                {classesDuNiveau.map((c) => {
                  const isActive = selectedClasseId === c.id;
                  const nbCours = emploi.filter((e) => e.classe.id === c.id).length;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setSelectedClasseId(c.id)}
                      className={cn(
                        "flex-row items-center p-4 rounded-xl",
                        isActive ? "bg-primary" : "bg-white border border-gray-100"
                      )}
                    >
                      <View className={cn(
                        "w-10 h-10 rounded-lg items-center justify-center mr-3",
                        isActive ? "bg-white/20" : "bg-gray-100"
                      )}>
                        <School size={20} color={isActive ? "white" : "#6b7280"} />
                      </View>
                      <View className="flex-1">
                        <Text className={cn("text-base font-bold", isActive ? "text-white" : "text-gray-900")}>
                          {c.nom}
                        </Text>
                        <Text className={cn("text-xs mt-0.5", isActive ? "text-white/70" : "text-gray-500")}>
                          {nbCours} cours / semaine
                        </Text>
                      </View>
                      <ChevronRight size={20} color={isActive ? "white" : "#d1d5db"} />
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* Étape 4: Emploi du temps de la classe sélectionnée */}
          {selectedClasseId && (
            <View>
              {/* Sélecteur de jour */}
              <View className="flex-row bg-white rounded-xl p-1.5 mb-3 border border-gray-100">
                {JOURS.map((jour) => {
                  const hasCours = coursClasse.some((e) => e.jour === jour);
                  const isActive = selectedDay === jour;
                  return (
                    <Pressable
                      key={jour}
                      onPress={() => setSelectedDay(jour)}
                      className={cn(
                        "flex-1 py-2 rounded-lg items-center",
                        isActive ? "bg-primary" : "bg-transparent"
                      )}
                    >
                      <Text className={cn(
                        "text-xs font-bold",
                        isActive ? "text-white" : hasCours ? "text-gray-700" : "text-gray-300"
                      )}>
                        {JOURS_COURTS[jour]}
                      </Text>
                      {hasCours && (
                        <View className={cn(
                          "w-1.5 h-1.5 rounded-full mt-1",
                          isActive ? "bg-white" : "bg-primary"
                        )} />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              {/* Cours du jour */}
              {coursDuJour.length === 0 ? (
                <View className="items-center py-12">
                  <Calendar size={40} color="#d1d5db" />
                  <Text className="text-sm text-gray-400 mt-3">
                    Aucun cours le {selectedDay.toLowerCase()}
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {coursDuJour.map((c) => {
                    const color = c.matiere.couleur ?? "#4f46e5";
                    const enseignantNom = c.enseignant?.user?.name ?? null;
                    return (
                      <View
                        key={c.id}
                        className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
                        style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}
                      >
                        <View style={{ height: 4, backgroundColor: color }} />
                        <View className="p-4">
                          <View className="flex-row items-center mb-3">
                            <View className="bg-gray-100 rounded-lg px-3 py-2 mr-3 items-center justify-center" style={{ minWidth: 64 }}>
                              <Text className="text-sm font-bold text-gray-900">{c.heureDebut}</Text>
                              <Text className="text-xs text-gray-400">{c.heureFin}</Text>
                            </View>
                            <View className="flex-1">
                              <Text className="text-base font-bold text-gray-900">{c.matiere.nom}</Text>
                              <View className="flex-row items-center mt-1">
                                <View className="px-2 py-0.5 rounded-md mr-2" style={{ backgroundColor: color + "20" }}>
                                  <Text style={{ fontSize: 11, fontWeight: "600", color }}>{c.matiere.code}</Text>
                                </View>
                              </View>
                            </View>
                          </View>
                          <View className="flex-row gap-4">
                            {c.salle && (
                              <View className="flex-row items-center">
                                <MapPin size={14} color="#9ca3af" />
                                <Text className="text-xs text-gray-500 ml-1">Salle {c.salle}</Text>
                              </View>
                            )}
                            {enseignantNom && (
                              <View className="flex-row items-center">
                                <Users size={14} color="#9ca3af" />
                                <Text className="text-xs text-gray-500 ml-1">{enseignantNom}</Text>
                              </View>
                            )}
                            <View className="flex-row items-center">
                              <Clock size={14} color="#9ca3af" />
                              <Text className="text-xs text-gray-500 ml-1">{c.heureDebut}–{c.heureFin}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Message initial */}
          {!selectedGroupe && classes.length > 0 && (
            <View className="items-center py-12">
              <School size={48} color="#d1d5db" />
              <Text className="text-sm text-gray-400 mt-3 text-center">
                Choisissez un groupe pour commencer
              </Text>
            </View>
          )}

          {classes.length === 0 && (
            <View className="items-center py-12">
              <Calendar size={48} color="#d1d5db" />
              <Text className="text-sm text-gray-400 mt-3">Aucune classe disponible</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
