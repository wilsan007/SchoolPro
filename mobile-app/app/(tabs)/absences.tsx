import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Clock, XCircle, CheckCircle, AlertCircle } from "lucide-react-native";
import { apiFetch } from "@/lib/api";
import { cn, formatDate, getInitials } from "@/lib/utils";

interface AbsenceItem {
  id: string;
  date: string;
  isRetard: boolean;
  statut: string;
  motif: string | null;
  eleve: { id: string; nom: string; prenom: string; photoUrl: string | null };
}

interface AbsencesResponse {
  absences: AbsenceItem[];
  stats: {
    total: number;
    injustifiees: number;
    justifiees: number;
    enAttente: number;
    retards: number;
  };
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View className="flex-1 bg-white rounded-xl p-3 border border-gray-100">
      <Text className={cn("text-lg font-bold", color)}>{value}</Text>
      <Text className="text-xs text-gray-500 mt-0.5">{label}</Text>
    </View>
  );
}

export default function AbsencesScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery<AbsencesResponse>({
    queryKey: ["absences"],
    queryFn: () => apiFetch<AbsencesResponse>("/api/mobile/absences"),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const getStatutIcon = (statut: string, isRetard: boolean) => {
    if (isRetard) return <Clock size={16} color="#f59e0b" />;
    if (statut === "JUSTIFIEE") return <CheckCircle size={16} color="#22c55e" />;
    if (statut === "INJUSTIFIEE") return <XCircle size={16} color="#ef4444" />;
    return <AlertCircle size={16} color="#eab308" />;
  };

  const renderAbsence = ({ item }: { item: AbsenceItem }) => (
    <View
      className="flex-row items-center bg-white px-4 py-3"
      style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
    >
      <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-3">
        <Text className="text-xs font-bold text-orange-700">
          {getInitials(`${item.eleve.prenom} ${item.eleve.nom}`)}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-gray-900">
          {item.eleve.prenom} {item.eleve.nom}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5">
          {formatDate(item.date)}
          {item.motif ? ` · ${item.motif}` : ""}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        {getStatutIcon(item.statut, item.isRetard)}
        <Text
          className={cn(
            "text-xs font-semibold",
            item.isRetard
              ? "text-yellow-600"
              : item.statut === "JUSTIFIEE"
              ? "text-green-600"
              : item.statut === "INJUSTIFIEE"
              ? "text-red-600"
              : "text-yellow-600"
          )}
        >
          {item.isRetard ? "Retard" : item.statut.replace("_", " ")}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-3 pb-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Absences</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : (
        <FlatList
          data={data?.absences ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderAbsence}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            data ? (
              <View className="flex-row gap-2 px-5 py-3">
                <StatPill label="Justifiées" value={data.stats.justifiees} color="text-green-600" />
                <StatPill label="Injustifiées" value={data.stats.injustifiees} color="text-red-600" />
                <StatPill label="Retards" value={data.stats.retards} color="text-yellow-600" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="items-center py-20">
              <ClipboardList size={40} color="#d1d5db" />
              <Text className="text-sm text-gray-400 mt-3">Aucune absence</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
