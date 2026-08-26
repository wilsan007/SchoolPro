import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Lightbulb, AlertTriangle, TrendingUp, CheckCircle } from "lucide-react-native";
import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/useI18n";
import { cn } from "@/lib/utils";

interface Recommandation {
  id: string;
  type: string;
  priorite: string;
  statut: string;
  justification: string;
  actionSuggeree: string | null;
  competence: {
    id: string;
    nom: string;
    code: string;
    chapitre: { id: string; nom: string; matiere: { nom: string } };
  };
  classe: { id: string; nom: string; niveau: string } | null;
  eleve: { id: string; nom: string; prenom: string } | null;
  createdAt: string;
}

const PRIORITE_CONFIG: Record<string, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  OBLIGATOIRE: { icon: AlertTriangle, color: "#dc2626", bg: "bg-red-100" },
  RECOMMANDE: { icon: Lightbulb, color: "#d97706", bg: "bg-amber-100" },
  OPTIONNEL: { icon: TrendingUp, color: "#2563eb", bg: "bg-blue-100" },
  INFO: { icon: CheckCircle, color: "#16a34a", bg: "bg-green-100" },
};

export default function RecommandationsScreen() {
  const { t } = useI18n();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ recommandations: Recommandation[] }>({
    queryKey: ["recommandations"],
    queryFn: () => apiFetch<{ recommandations: Recommandation[] }>("/api/mobile/recommandations"),
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
        <Text className="text-xl font-bold text-gray-900">{t("recommandations.title")}</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {data?.recommandations?.length ? (
          <View style={{ gap: 12 }}>
            {data.recommandations.map((rec) => {
              const config = PRIORITE_CONFIG[rec.priorite] ?? PRIORITE_CONFIG.INFO;
              const Icon = config.icon;
              return (
                <View
                  key={rec.id}
                  className="bg-white rounded-2xl p-4 border border-gray-100"
                  style={{ shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 }}
                >
                  <View className="flex-row items-start mb-2">
                    <View className={cn("w-10 h-10 rounded-xl items-center justify-center mr-3", config.bg)}>
                      <Icon size={18} color={config.color} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-gray-900">
                        {rec.competence.nom}
                      </Text>
                      <Text className="text-xs text-gray-500">
                        {rec.competence.chapitre.matiere.nom} · {rec.competence.chapitre.nom}
                      </Text>
                    </View>
                  </View>

                  {rec.eleve && (
                    <Text className="text-xs text-gray-600 mb-1">
                      {t("recommandations.student")}: {rec.eleve.prenom} {rec.eleve.nom}
                    </Text>
                  )}
                  {rec.classe && (
                    <Text className="text-xs text-gray-600 mb-1">
                      {t("recommandations.class")}: {rec.classe.nom}
                    </Text>
                  )}

                  <Text className="text-sm text-gray-700 mt-1">
                    {rec.justification}
                  </Text>

                  {rec.actionSuggeree && (
                    <View className="mt-2 p-2 rounded-lg bg-indigo-50">
                      <Text className="text-xs text-indigo-700">
                        {t("recommandations.action")}: {rec.actionSuggeree}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <View className="items-center py-20">
            <Lightbulb size={48} color="#d1d5db" />
            <Text className="text-sm text-gray-400 mt-4">{t("recommandations.noData")}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
