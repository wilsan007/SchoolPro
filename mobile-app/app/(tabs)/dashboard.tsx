import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Users,
  ClipboardList,
  BookOpen,
  Calendar,
  GraduationCap,
  LogOut,
  Bell,
  TrendingUp,
  AlertCircle,
  Shield,
  MessageCircle,
  BarChart3,
  type LucideIcon,
} from "lucide-react-native";
import { useAuthStore } from "@/lib/auth-store";
import { apiFetch } from "@/lib/api";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { useState, useCallback } from "react";

interface DashboardData {
  stats: {
    totalEleves: number;
    totalClasses: number;
    totalAbsencesToday: number;
    totalNotes: number;
  };
  absencesRecentes: Array<{
    id: string;
    date: string;
    isRetard: boolean;
    statut: string;
    eleve: { id: string; nom: string; prenom: string; photoUrl: string | null };
  }>;
  notesRecentes: Array<{
    id: string;
    valeur: number;
    noteMax: number;
    intitule: string | null;
    date: string;
    eleve: { id: string; nom: string; prenom: string };
    matiere: { nom: string; code: string };
  }>;
  prochainsExamens: Array<{
    id: string;
    titre: string;
    date: string;
    classe: { nom: string };
    matiere: { nom: string };
  }>;
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  color: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 bg-white rounded-2xl p-4 border border-gray-100 active:opacity-70"
      style={{ shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 }}
    >
      <View className={cn("w-10 h-10 rounded-xl items-center justify-center mb-3", color)}>
        <Icon size={20} color="white" />
      </View>
      <Text className="text-2xl font-bold text-gray-900">{value}</Text>
      <Text className="text-xs text-gray-500 mt-0.5">{label}</Text>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<DashboardData>("/api/mobile/dashboard"),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-5 pt-3 pb-4 border-b border-gray-100">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs text-gray-500">{tenant?.name ?? "Mon École"}</Text>
            <Text className="text-xl font-bold text-gray-900">
              Bonjour, {user?.name?.split(" ")[0] ?? "Admin"} 👋
            </Text>
          </View>
          <View className="flex-row items-center gap-3">
            <Pressable className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
              <Bell size={20} color="#6b7280" />
            </Pressable>
            <Pressable
              onPress={() => signOut()}
              className="w-10 h-10 rounded-full bg-red-50 items-center justify-center"
            >
              <LogOut size={18} color="#ef4444" />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Stats */}
        <View className="flex-row gap-3 mb-5">
          <StatCard
            icon={Users}
            label="Élèves actifs"
            value={data?.stats.totalEleves ?? "—"}
            color="bg-violet-500"
            onPress={() => router.push("/(tabs)/eleves")}
          />
          <StatCard
            icon={ClipboardList}
            label="Absences aujourd'hui"
            value={data?.stats.totalAbsencesToday ?? "—"}
            color="bg-orange-500"
            onPress={() => router.push("/(tabs)/absences")}
          />
        </View>
        <View className="flex-row gap-3 mb-6">
          <StatCard
            icon={BookOpen}
            label="Notes saisies"
            value={data?.stats.totalNotes ?? "—"}
            color="bg-green-500"
            onPress={() => router.push("/(tabs)/notes")}
          />
          <StatCard
            icon={GraduationCap}
            label="Classes"
            value={data?.stats.totalClasses ?? "—"}
            color="bg-blue-500"
          />
        </View>

        {/* Absences récentes */}
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-base font-bold text-gray-900">
              Absences récentes
            </Text>
            <Pressable onPress={() => router.push("/(tabs)/absences")}>
              <Text className="text-sm text-primary">Voir tout</Text>
            </Pressable>
          </View>
          <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {data?.absencesRecentes?.length ? (
              data.absencesRecentes.map((a, i) => (
                <View
                  key={a.id}
                  className={cn(
                    "flex-row items-center px-4 py-3",
                    i > 0 && "border-t border-gray-50"
                  )}
                >
                  <View className="w-9 h-9 rounded-full bg-violet-100 items-center justify-center mr-3">
                    <Text className="text-xs font-bold text-violet-700">
                      {getInitials(`${a.eleve.prenom} ${a.eleve.nom}`)}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-900">
                      {a.eleve.prenom} {a.eleve.nom}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {formatDate(a.date)} · {a.isRetard ? "Retard" : "Absent"}
                    </Text>
                  </View>
                  <View
                    className={cn(
                      "px-2 py-0.5 rounded-full",
                      a.statut === "JUSTIFIEE"
                        ? "bg-green-100"
                        : a.statut === "INJUSTIFIEE"
                        ? "bg-red-100"
                        : "bg-yellow-100"
                    )}
                  >
                    <Text
                      className={cn(
                        "text-xs font-semibold",
                        a.statut === "JUSTIFIEE"
                          ? "text-green-700"
                          : a.statut === "INJUSTIFIEE"
                          ? "text-red-700"
                          : "text-yellow-700"
                      )}
                    >
                      {a.statut.replace("_", " ")}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View className="px-4 py-8 items-center">
                <Text className="text-sm text-gray-400">Aucune absence récente</Text>
              </View>
            )}
          </View>
        </View>

        {/* Notes récentes */}
        <View className="mb-6">
          <Text className="text-base font-bold text-gray-900 mb-3">
            Dernières notes
          </Text>
          <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {data?.notesRecentes?.length ? (
              data.notesRecentes.map((n, i) => (
                <View
                  key={n.id}
                  className={cn(
                    "flex-row items-center px-4 py-3",
                    i > 0 && "border-t border-gray-50"
                  )}
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-900">
                      {n.eleve.prenom} {n.eleve.nom}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {n.matiere.nom} · {n.intitule ?? "Note"}
                    </Text>
                  </View>
                  <Text
                    className={cn(
                      "text-base font-bold",
                      (n.valeur / n.noteMax) * 20 >= 10 ? "text-green-600" : "text-red-600"
                    )}
                  >
                    {n.valeur}/{n.noteMax}
                  </Text>
                </View>
              ))
            ) : (
              <View className="px-4 py-8 items-center">
                <Text className="text-sm text-gray-400">Aucune note récente</Text>
              </View>
            )}
          </View>
        </View>

        {/* Prochains examens */}
        <View className="mb-8">
          <Text className="text-base font-bold text-gray-900 mb-3">
            Prochains examens
          </Text>
          <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {data?.prochainsExamens?.length ? (
              data.prochainsExamens.map((e, i) => (
                <View
                  key={e.id}
                  className={cn(
                    "flex-row items-center px-4 py-3",
                    i > 0 && "border-t border-gray-50"
                  )}
                >
                  <View className="w-10 h-10 rounded-xl bg-yellow-100 items-center justify-center mr-3">
                    <GraduationCap size={18} color="#d97706" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-900">
                      {e.titre}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {e.classe.nom} · {e.matiere.nom} · {formatDate(e.date)}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View className="px-4 py-8 items-center">
                <Text className="text-sm text-gray-400">Aucun examen planifié</Text>
              </View>
            )}
          </View>
        </View>
        {/* Accès rapide */}
        <View className="mb-8">
          <Text className="text-base font-bold text-gray-900 mb-3">
            Accès rapide
          </Text>
          <View className="flex-row flex-wrap gap-3">
            <Pressable
              onPress={() => router.push("/(tabs)/emploi-du-temps")}
              className="bg-white rounded-2xl p-4 border border-gray-100 items-center active:opacity-70"
              style={{ width: "31%" }}
            >
              <Calendar size={22} color="#4f46e5" />
              <Text className="text-xs font-medium text-gray-700 mt-2">Emploi du temps</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/(tabs)/vie-scolaire")}
              className="bg-white rounded-2xl p-4 border border-gray-100 items-center active:opacity-70"
              style={{ width: "31%" }}
            >
              <Shield size={22} color="#ef4444" />
              <Text className="text-xs font-medium text-gray-700 mt-2">Vie scolaire</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/(tabs)/messages")}
              className="bg-white rounded-2xl p-4 border border-gray-100 items-center active:opacity-70"
              style={{ width: "31%" }}
            >
              <MessageCircle size={22} color="#0ea5e9" />
              <Text className="text-xs font-medium text-gray-700 mt-2">Messages</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/(tabs)/analytics")}
              className="bg-white rounded-2xl p-4 border border-gray-100 items-center active:opacity-70"
              style={{ width: "31%" }}
            >
              <BarChart3 size={22} color="#22c55e" />
              <Text className="text-xs font-medium text-gray-700 mt-2">Analytics</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
