import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Clock, Users } from "lucide-react-native";
import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/useI18n";
import { cn, formatDate } from "@/lib/utils";

interface Seance {
  id: string;
  date: string;
  statut: string;
  contenu: string | null;
  semaine: number;
  dureePrevue: number;
  dureeReelle: number | null;
  rythme: string;
  presents: number | null;
  absents: number | null;
  classe: { id: string; nom: string; niveau: string };
  matiere: { id: string; nom: string; code: string; couleur: string | null };
  enseignant: { id: string; user: { name: string } } | null;
}

const STATUT_COLORS: Record<string, string> = {
  PLANIFIEE: "bg-blue-100 text-blue-700",
  EFFECTUEE: "bg-green-100 text-green-700",
  ANNULEE: "bg-red-100 text-red-700",
  REPORTEE: "bg-yellow-100 text-yellow-700",
};

export default function CahierJournalScreen() {
  const { t } = useI18n();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ seances: Seance[] }>({
    queryKey: ["cahier-journal"],
    queryFn: () => apiFetch<{ seances: Seance[] }>("/api/mobile/cahier-journal"),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-3 pb-4 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">{t("cahierJournal.title")}</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {data?.seances?.length ? (
          <View style={{ gap: 12 }}>
            {data.seances.map((seance) => (
              <View
                key={seance.id}
                className="bg-white rounded-2xl p-4 border border-gray-100"
                style={{ shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 }}
              >
                {/* Header : matière + statut */}
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center flex-1">
                    <View
                      className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                      style={{ backgroundColor: seance.matiere.couleur ?? "#4f46e5" }}
                    >
                      <BookOpen size={18} color="white" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-gray-900">{seance.matiere.nom}</Text>
                      <Text className="text-xs text-gray-500">{seance.classe.nom}</Text>
                    </View>
                  </View>
                  <View className={cn("px-2 py-1 rounded-full", STATUT_COLORS[seance.statut]?.split(" ")[0])}>
                    <Text className={cn("text-xs font-semibold", STATUT_COLORS[seance.statut]?.split(" ")[1])}>
                      {t(`cahierJournal.status${seance.statut}`)}
                    </Text>
                  </View>
                </View>

                {/* Date + semaine */}
                <View className="flex-row items-center gap-4 mb-2">
                  <View className="flex-row items-center">
                    <Clock size={14} color="#6b7280" />
                    <Text className="text-xs text-gray-500 ml-1">
                      {formatDate(seance.date)} · {t("cahierJournal.week")} {seance.semaine}
                    </Text>
                  </View>
                  {seance.presents !== null && (
                    <View className="flex-row items-center">
                      <Users size={14} color="#6b7280" />
                      <Text className="text-xs text-gray-500 ml-1">
                        {seance.presents} {t("cahierJournal.present")} · {seance.absents} {t("cahierJournal.absent")}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Contenu */}
                {seance.contenu && (
                  <Text className="text-sm text-gray-700" numberOfLines={3}>
                    {seance.contenu}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <View className="items-center py-20">
            <BookOpen size={48} color="#d1d5db" />
            <Text className="text-sm text-gray-400 mt-4">{t("cahierJournal.noSeances")}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
