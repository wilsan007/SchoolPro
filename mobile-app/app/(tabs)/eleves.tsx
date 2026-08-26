import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Search, ChevronRight, Users, ChevronDown, School } from "lucide-react-native";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/useI18n";
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

interface ClasseNode {
  id: string;
  nom: string;
  niveau: string;
  filiere: string | null;
  effectif: number;
}

interface NiveauNode {
  niveau: string;
  classes: ClasseNode[];
}

interface CategorieNode {
  categorie: string;
  niveaux: NiveauNode[];
}

interface HierarchieResponse {
  hierarchie: CategorieNode[];
}

export default function ElevesScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedClasseId, setSelectedClasseId] = useState<string | null>(null);
  const [showHierarchy, setShowHierarchy] = useState(false);

  // Fetch hierarchie classes
  const { data: hierarchieData } = useQuery<HierarchieResponse>({
    queryKey: ["classes-hierarchie"],
    queryFn: () => apiFetch<HierarchieResponse>("/api/mobile/classes-hierarchie"),
  });

  // Fetch eleves — filtered by classe if selected
  const { data, isLoading, refetch } = useQuery<ElevesResponse>({
    queryKey: ["eleves", search, selectedClasseId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (selectedClasseId) params.set("classeId", selectedClasseId);
      const qs = params.toString();
      return apiFetch<ElevesResponse>(`/api/mobile/eleves${qs ? `?${qs}` : ""}`);
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Find selected class name for display
  const selectedClasseName = useMemo(() => {
    if (!selectedClasseId || !hierarchieData) return null;
    for (const cat of hierarchieData.hierarchie) {
      for (const niv of cat.niveaux) {
        const found = niv.classes.find((c) => c.id === selectedClasseId);
        if (found) return found.nom;
      }
    }
    return null;
  }, [selectedClasseId, hierarchieData]);

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
          {item.matricule} · {item.classe?.nom ?? "—"}
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
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-gray-900">{t("tab.eleves")}</Text>
          {/* Class filter toggle */}
          <Pressable
            onPress={() => setShowHierarchy(!showHierarchy)}
            className="flex-row items-center bg-gray-100 rounded-lg px-3 py-1.5"
          >
            <School size={14} color="#4f46e5" />
            <Text className="text-xs font-medium text-gray-700 ml-1.5">
              {selectedClasseName ?? t("common.all")}
            </Text>
            <ChevronDown size={14} color="#9ca3af" />
          </Pressable>
        </View>
        {/* Search */}
        <View className="flex-row items-center bg-gray-100 rounded-xl px-3 mt-3">
          <Search size={18} color="#9ca3af" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t("common.search")}
            className="flex-1 h-10 ml-2 text-sm"
            autoCapitalize="none"
          />
          {selectedClasseId && (
            <Pressable
              onPress={() => setSelectedClasseId(null)}
              className="px-2 py-1 rounded-lg bg-gray-200"
            >
              <Text className="text-xs text-gray-600">✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Hierarchy filter — collapsible */}
      {showHierarchy && hierarchieData && (
        <View className="bg-white border-b border-gray-100 max-h-[300px]">
          <ScrollView nestedScrollEnabled>
            {/* "Toutes les classes" option */}
            <Pressable
              onPress={() => {
                setSelectedClasseId(null);
                setShowHierarchy(false);
              }}
              className="px-5 py-2.5"
              style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
            >
              <Text className={cn("text-sm", !selectedClasseId ? "font-bold text-primary" : "text-gray-700")}>
                {t("common.all")}
              </Text>
            </Pressable>

            {hierarchieData.hierarchie.map((cat) => (
              <View key={cat.categorie}>
                {/* Category header */}
                <View className="px-5 py-2 bg-gray-50">
                  <Text className="text-xs font-bold text-gray-500 uppercase">
                    {t(`classes.${cat.categorie.toLowerCase()}`)}
                  </Text>
                </View>
                {cat.niveaux.map((niv) => (
                  <View key={niv.niveau}>
                    <View className="px-5 py-1.5 bg-gray-50/50">
                      <Text className="text-xs font-semibold text-gray-600">{niv.niveau}</Text>
                    </View>
                    {niv.classes.map((classe) => (
                      <Pressable
                        key={classe.id}
                        onPress={() => {
                          setSelectedClasseId(classe.id);
                          setShowHierarchy(false);
                        }}
                        className="flex-row items-center px-8 py-2.5 active:opacity-70"
                        style={{ borderBottomWidth: 1, borderBottomColor: "#f9fafb" }}
                      >
                        <Text
                          className={cn(
                            "flex-1 text-sm",
                            selectedClasseId === classe.id ? "font-bold text-primary" : "text-gray-700"
                          )}
                        >
                          {classe.nom}
                        </Text>
                        <Text className="text-xs text-gray-400">
                          {classe.effectif} {t("classes.students")}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

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
                {t("common.none")}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
