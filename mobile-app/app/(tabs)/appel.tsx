import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  CheckCheck,
  RotateCcw,
  ChevronRight,
} from "lucide-react-native";
import { apiFetch } from "@/lib/api";
import { cn, getInitials } from "@/lib/utils";

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

export default function AppelScreen() {
  const { data, isLoading, refetch } = useQuery<{ classes: Classe[] }>({
    queryKey: ["mobile-classes"],
    queryFn: () => apiFetch<{ classes: Classe[] }>("/api/mobile/classes"),
  });

  const [selectedClasseId, setSelectedClasseId] = useState<string | null>(null);
  const [presences, setPresences] = useState<Record<string, Presence>>({});
  const [submitted, setSubmitted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const classes = data?.classes ?? [];
  const selectedClasse = classes.find((c) => c.id === selectedClasseId);
  const eleves = selectedClasse?.eleves ?? [];

  const stats = {
    total: eleves.length,
    presents: Object.values(presences).filter((p) => p === "present").length,
    absents: Object.values(presences).filter((p) => p === "absent").length,
    retards: Object.values(presences).filter((p) => p === "retard").length,
    nonSaisis: eleves.filter((e) => !presences[e.id]).length,
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

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

  function selectClasse(classeId: string) {
    setSelectedClasseId(classeId);
    setPresences({});
    setSubmitted(false);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      return apiFetch("/api/mobile/appel", {
        method: "POST",
        body: JSON.stringify({
          classeId: selectedClasseId,
          presences,
          date: new Date().toISOString(),
        }),
      });
    },
    onSuccess: () => {
      setSubmitted(true);
    },
  });

  function soumettre() {
    if (stats.nonSaisis > 0) return;
    mutation.mutate();
  }

  // Class selection view
  if (!selectedClasseId) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="bg-white px-5 pt-3 pb-3 border-b border-gray-100">
          <Text className="text-xl font-bold text-gray-900">Faire l'appel</Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            Sélectionnez une classe
          </Text>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#4f46e5" />
          </View>
        ) : (
          <FlatList
            data={classes}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => selectClasse(item.id)}
                className="flex-row items-center bg-white px-4 py-4 active:bg-gray-50"
                style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
              >
                <View className="w-11 h-11 rounded-xl bg-indigo-100 items-center justify-center mr-3">
                  <Users size={20} color="#4f46e5" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-gray-900">
                    {item.nom}
                  </Text>
                  <Text className="text-xs text-gray-500 mt-0.5">
                    {item.eleves.length} élèves · {item.niveau}
                  </Text>
                </View>
                <ChevronRight size={20} color="#d1d5db" />
              </Pressable>
            )}
            ListEmptyComponent={
              <View className="items-center py-20">
                <Users size={40} color="#d1d5db" />
                <Text className="text-sm text-gray-400 mt-3">
                  Aucune classe disponible
                </Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    );
  }

  // Submitted view
  if (submitted) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="bg-white px-5 pt-3 pb-3 border-b border-gray-100">
          <Text className="text-xl font-bold text-gray-900">Appel enregistré</Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-20 h-20 rounded-full bg-green-100 items-center justify-center mb-4">
            <CheckCheck size={40} color="#22c55e" />
          </View>
          <Text className="text-lg font-semibold text-gray-900 mb-1">
            Appel terminé !
          </Text>
          <Text className="text-sm text-gray-500 mb-6">
            {stats.presents} présents · {stats.absents} absents · {stats.retards} retards
          </Text>
          <Pressable
            onPress={reset}
            className="flex-row items-center gap-2 px-5 py-3 bg-white rounded-xl border border-gray-200 active:bg-gray-50"
          >
            <RotateCcw size={18} color="#6b7280" />
            <Text className="text-sm font-medium text-gray-700">Refaire l'appel</Text>
          </Pressable>
          <Pressable
            onPress={() => setSelectedClasseId(null)}
            className="mt-3 px-5 py-3 active:opacity-70"
          >
            <Text className="text-sm text-indigo-600 font-medium">
              Changer de classe
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Attendance taking view
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-3 pb-3 border-b border-gray-100">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xl font-bold text-gray-900">
              {selectedClasse?.nom}
            </Text>
            <Text className="text-sm text-gray-500 mt-0.5">
              {eleves.length} élèves
            </Text>
          </View>
          <Pressable
            onPress={() => setSelectedClasseId(null)}
            className="px-3 py-1.5 rounded-lg bg-gray-100 active:bg-gray-200"
          >
            <Text className="text-xs font-medium text-gray-600">Changer</Text>
          </Pressable>
        </View>
      </View>

      {/* Stats bar */}
      <View className="flex-row px-4 py-3 gap-2">
        <View className="flex-1 bg-white rounded-lg p-2 border border-gray-100">
          <Text className="text-sm font-bold text-green-600">{stats.presents}</Text>
          <Text className="text-[10px] text-gray-500">Présents</Text>
        </View>
        <View className="flex-1 bg-white rounded-lg p-2 border border-gray-100">
          <Text className="text-sm font-bold text-red-600">{stats.absents}</Text>
          <Text className="text-[10px] text-gray-500">Absents</Text>
        </View>
        <View className="flex-1 bg-white rounded-lg p-2 border border-gray-100">
          <Text className="text-sm font-bold text-yellow-600">{stats.retards}</Text>
          <Text className="text-[10px] text-gray-500">Retards</Text>
        </View>
        <View className="flex-1 bg-white rounded-lg p-2 border border-gray-100">
          <Text className="text-sm font-bold text-gray-400">{stats.nonSaisis}</Text>
          <Text className="text-[10px] text-gray-500">Restant</Text>
        </View>
      </View>

      {/* Quick actions */}
      <View className="flex-row px-4 pb-2 gap-2">
        <Pressable
          onPress={marquerTousPresents}
          className="flex-1 flex-row items-center justify-center gap-2 py-2.5 bg-indigo-100 rounded-xl active:bg-indigo-200"
        >
          <Users size={16} color="#4f46e5" />
          <Text className="text-xs font-semibold text-indigo-700">
            Tous présents
          </Text>
        </Pressable>
      </View>

      {/* Student list */}
      <FlatList
        data={eleves}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 pb-4"
        renderItem={({ item }) => {
          const status = presences[item.id] ?? null;
          return (
            <View
              className={cn(
                "flex-row items-center p-3 rounded-xl border-2 mb-2",
                status === "present" && "border-green-400 bg-green-50",
                status === "absent" && "border-red-400 bg-red-50",
                status === "retard" && "border-yellow-400 bg-yellow-50",
                !status && "border-gray-200 bg-white"
              )}
            >
              <View
                className={cn(
                  "w-9 h-9 rounded-full items-center justify-center mr-3",
                  item.sexe === "F" ? "bg-pink-100" : "bg-blue-100"
                )}
              >
                <Text
                  className={cn(
                    "text-xs font-bold",
                    item.sexe === "F" ? "text-pink-700" : "text-blue-700"
                  )}
                >
                  {getInitials(`${item.prenom} ${item.nom}`)}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-gray-900">
                  {item.prenom} {item.nom}
                </Text>
                <Text className="text-xs text-gray-400">{item.matricule}</Text>
              </View>
              <View className="flex-row gap-1">
                <Pressable
                  onPress={() => setPresence(item.id, "present")}
                  className={cn(
                    "p-2 rounded-lg",
                    status === "present"
                      ? "bg-green-500"
                      : "bg-gray-100 active:bg-green-100"
                  )}
                >
                  <CheckCircle2
                    size={18}
                    color={status === "present" ? "#fff" : "#22c55e"}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setPresence(item.id, "retard")}
                  className={cn(
                    "p-2 rounded-lg",
                    status === "retard"
                      ? "bg-yellow-500"
                      : "bg-gray-100 active:bg-yellow-100"
                  )}
                >
                  <Clock
                    size={18}
                    color={status === "retard" ? "#fff" : "#f59e0b"}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setPresence(item.id, "absent")}
                  className={cn(
                    "p-2 rounded-lg",
                    status === "absent"
                      ? "bg-red-500"
                      : "bg-gray-100 active:bg-red-100"
                  )}
                >
                  <XCircle
                    size={18}
                    color={status === "absent" ? "#fff" : "#ef4444"}
                  />
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      {/* Submit button */}
      {stats.nonSaisis === 0 && (
        <View className="px-4 pb-6">
          <Pressable
            onPress={soumettre}
            disabled={mutation.isPending}
            className={cn(
              "flex-row items-center justify-center gap-2 py-4 rounded-xl",
              mutation.isPending ? "bg-indigo-300" : "bg-indigo-600 active:bg-indigo-700"
            )}
          >
            {mutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <CheckCheck size={20} color="#fff" />
                <Text className="text-base font-semibold text-white">
                  Valider l'appel
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      {stats.nonSaisis > 0 && (
        <View className="px-4 pb-6">
          <View className="flex-row items-center justify-center gap-2 py-3 rounded-xl bg-gray-100">
            <Text className="text-sm text-gray-500">
              {stats.nonSaisis} élève(s) restant(s) à saisir
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
