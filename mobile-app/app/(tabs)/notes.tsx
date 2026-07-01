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
import { BookOpen } from "lucide-react-native";
import { apiFetch } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";

interface NoteItem {
  id: string;
  valeur: number;
  noteMax: number;
  coefficient: number;
  intitule: string | null;
  date: string;
  isPubliee: boolean;
  eleve: { id: string; nom: string; prenom: string };
  matiere: { id: string; nom: string; code: string; couleur: string | null; coefficient: number };
  classe: { id: string; nom: string } | null;
}

interface NotesResponse {
  notes: NoteItem[];
  matieres: Array<{ id: string; nom: string; code: string; couleur: string | null; coefficient: number }>;
  classes: Array<{ id: string; nom: string; niveau: string }>;
}

export default function NotesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [filterMatiere, setFilterMatiere] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<NotesResponse>({
    queryKey: ["notes"],
    queryFn: () => apiFetch<NotesResponse>("/api/mobile/notes"),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const filteredNotes = filterMatiere
    ? data?.notes.filter((n) => n.matiere.id === filterMatiere)
    : data?.notes;

  const renderNote = ({ item }: { item: NoteItem }) => {
    const sur20 = (item.valeur / item.noteMax) * 20;
    const isGood = sur20 >= 10;
    return (
      <View
        className="flex-row items-center bg-white px-4 py-3"
        style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
      >
        <View
          className="w-1 h-12 rounded-full mr-3"
          style={{ backgroundColor: item.matiere.couleur ?? "#4f46e5" }}
        />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-900">
            {item.eleve.prenom} {item.eleve.nom}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            {item.matiere.nom} · {item.intitule ?? "Note"} · {formatDate(item.date)}
          </Text>
        </View>
        <View className="items-end">
          <Text
            className={cn(
              "text-lg font-bold",
              isGood ? "text-green-600" : "text-red-600"
            )}
          >
            {item.valeur}/{item.noteMax}
          </Text>
          <Text className="text-xs text-gray-400">coef. {item.coefficient}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-3 pb-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Notes</Text>

        {/* Matière filter chips */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={data?.matieres ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingVertical: 8, gap: 8 }}
          renderItem={({ item: m }) => (
            <Pressable
              onPress={() => setFilterMatiere(filterMatiere === m.id ? null : m.id)}
              className={cn(
                "px-3 py-1.5 rounded-full border",
                filterMatiere === m.id
                  ? "bg-primary border-primary"
                  : "bg-white border-gray-200"
              )}
            >
              <Text
                className={cn(
                  "text-xs font-medium",
                  filterMatiere === m.id ? "text-white" : "text-gray-600"
                )}
              >
                {m.nom}
              </Text>
            </Pressable>
          )}
        />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : (
        <FlatList
          data={filteredNotes ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderNote}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View className="items-center py-20">
              <BookOpen size={40} color="#d1d5db" />
              <Text className="text-sm text-gray-400 mt-3">Aucune note</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
