import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Search, ChevronRight, Users } from "lucide-react-native";
import { apiFetch } from "@/lib/api";
import { cn, getInitials } from "@/lib/utils";

interface EleveItem {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  photoUrl: string | null;
  statut: string;
  classe: { id: string; nom: string; niveau: string } | null;
}

interface ElevesResponse {
  eleves: EleveItem[];
}

export default function ElevesScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery<ElevesResponse>({
    queryKey: ["eleves", search],
    queryFn: () =>
      apiFetch<ElevesResponse>(
        `/api/mobile/eleves${search ? `?q=${encodeURIComponent(search)}` : ""}`
      ),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderEleve = ({ item }: { item: EleveItem }) => (
    <Pressable
      onPress={() => router.push(`/eleve/${item.id}`)}
      className="flex-row items-center bg-white px-4 py-3 active:opacity-70"
      style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
    >
      <View className="w-11 h-11 rounded-full bg-violet-100 items-center justify-center mr-3">
        <Text className="text-sm font-bold text-violet-700">
          {getInitials(`${item.prenom} ${item.nom}`)}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-gray-900">
          {item.prenom} {item.nom}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5">
          {item.matricule} · {item.classe?.nom ?? "Sans classe"}
        </Text>
      </View>
      {item.statut !== "ACTIF" && (
        <View className="px-2 py-0.5 rounded-full bg-orange-100 mr-2">
          <Text className="text-xs font-semibold text-orange-700">
            {item.statut}
          </Text>
        </View>
      )}
      <ChevronRight size={18} color="#d1d5db" />
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-5 pt-3 pb-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Élèves</Text>
        {/* Search */}
        <View className="flex-row items-center bg-gray-100 rounded-xl px-3 mt-3">
          <Search size={18} color="#9ca3af" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher par nom, matricule..."
            className="flex-1 h-10 ml-2 text-sm"
            autoCapitalize="none"
          />
        </View>
      </View>

      {/* List */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : (
        <FlatList
          data={data?.eleves ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderEleve}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={{ paddingVertical: 8 }}
          ListEmptyComponent={
            <View className="items-center py-20">
              <Users size={40} color="#d1d5db" />
              <Text className="text-sm text-gray-400 mt-3">
                Aucun élève trouvé
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
