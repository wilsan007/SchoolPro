import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Calendar } from "lucide-react-native";
import { apiFetch } from "@/lib/api";

interface EmploiItem {
  id: string;
  jour: string;
  heureDebut: string;
  heureFin: string;
  classe: { nom: string };
  matiere: { nom: string; code: string; couleur: string | null };
  enseignant?: { nom: string; prenom: string } | null;
  salle?: string | null;
}

const JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];

export default function EmploiDuTempsScreen() {
  const { data, isLoading } = useQuery<{ emploi: EmploiItem[] }>({
    queryKey: ["emploi-du-temps"],
    queryFn: () => apiFetch<{ emploi: EmploiItem[] }>("/api/mobile/emploi-du-temps"),
  });

  const emploi = data?.emploi ?? [];

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-3 pb-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Emploi du temps</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : emploi.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Calendar size={40} color="#d1d5db" />
          <Text className="text-sm text-gray-400 mt-3">Aucun cours planifié</Text>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
          {JOURS.map((jour) => {
            const cours = emploi
              .filter((e) => e.jour === jour)
              .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
            if (cours.length === 0) return null;
            return (
              <View key={jour} className="mb-5">
                <Text className="text-sm font-bold text-gray-700 uppercase mb-2">
                  {jour}
                </Text>
                {cours.map((c) => (
                  <View
                    key={c.id}
                    className="flex-row bg-white rounded-xl p-3 mb-2 border border-gray-100"
                  >
                    <View
                      className="w-1.5 rounded-full mr-3"
                      style={{ backgroundColor: c.matiere.couleur ?? "#4f46e5" }}
                    />
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-gray-900">
                        {c.matiere.nom}
                      </Text>
                      <Text className="text-xs text-gray-500 mt-0.5">
                        {c.heureDebut} - {c.heureFin} · {c.classe.nom}
                        {c.salle ? ` · Salle ${c.salle}` : ""}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
