import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Shield, AlertTriangle, CheckCircle, Clock } from "lucide-react-native";
import { apiFetch } from "@/lib/api";
import { cn, formatDate, getInitials } from "@/lib/utils";

interface IncidentItem {
  id: string;
  type: string;
  statut: string;
  gravite: number;
  description: string;
  lieu: string | null;
  date: string;
  eleve: { id: string; nom: string; prenom: string; photoUrl: string | null };
  rapportePar: { id: true; name: true } | null;
}

interface IncidentsResponse {
  incidents: IncidentItem[];
  stats: { total: number; enAttente: number; resolus: number; graves: number };
}

const GRAVITE_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Léger" },
  2: { bg: "bg-orange-100", text: "text-orange-700", label: "Moyen" },
  3: { bg: "bg-red-100", text: "text-red-700", label: "Grave" },
};

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Shield; label: string; value: number; color: string }) {
  return (
    <View className="flex-1 bg-white rounded-xl p-3 border border-gray-100">
      <Icon size={18} color={color} />
      <Text className="text-lg font-bold text-gray-900 mt-1">{value}</Text>
      <Text className="text-xs text-gray-500">{label}</Text>
    </View>
  );
}

export default function VieScolaireScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery<IncidentsResponse>({
    queryKey: ["incidents"],
    queryFn: () => apiFetch<IncidentsResponse>("/api/mobile/incidents"),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const getStatutIcon = (statut: string) => {
    if (statut === "RESOLU") return <CheckCircle size={14} color="#22c55e" />;
    if (statut === "OUVERT") return <AlertTriangle size={14} color="#ef4444" />;
    return <Clock size={14} color="#f59e0b" />;
  };

  const renderIncident = ({ item }: { item: IncidentItem }) => {
    const grav = GRAVITE_COLORS[item.gravite] ?? GRAVITE_COLORS[1];
    return (
      <View
        className="flex-row items-center bg-white px-4 py-3"
        style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
      >
        <View className="w-10 h-10 rounded-full bg-red-50 items-center justify-center mr-3">
          <Text className="text-xs font-bold text-red-700">
            {getInitials(`${item.eleve.prenom} ${item.eleve.nom}`)}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-900">
            {item.eleve.prenom} {item.eleve.nom}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={2}>
            {item.type.replace(/_/g, " ")} · {formatDate(item.date)}
          </Text>
          <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
            {item.description}
          </Text>
        </View>
        <View className="items-end gap-1">
          <View className={cn("px-2 py-0.5 rounded-full", grav.bg)}>
            <Text className={cn("text-xs font-semibold", grav.text)}>{grav.label}</Text>
          </View>
          <View className="flex-row items-center gap-1">
            {getStatutIcon(item.statut)}
            <Text className="text-xs text-gray-500">{item.statut.replace(/_/g, " ")}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-3 pb-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Vie scolaire</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : (
        <FlatList
          data={data?.incidents ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderIncident}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            data ? (
              <View className="flex-row gap-2 px-5 py-3">
                <StatCard icon={Shield} label="Total" value={data.stats.total} color="#4f46e5" />
                <StatCard icon={Clock} label="En cours" value={data.stats.enAttente} color="#f59e0b" />
                <StatCard icon={AlertTriangle} label="Graves" value={data.stats.graves} color="#ef4444" />
                <StatCard icon={CheckCircle} label="Résolus" value={data.stats.resolus} color="#22c55e" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="items-center py-20">
              <Shield size={40} color="#d1d5db" />
              <Text className="text-sm text-gray-400 mt-3">Aucun incident</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
