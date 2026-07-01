import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Users, BookOpen, ClipboardList, Shield, TrendingUp, GraduationCap } from "lucide-react-native";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AnalyticsData {
  stats: {
    totalEleves: number;
    totalClasses: number;
    totalEnseignants: number;
    totalNotes: number;
    totalAbsences: number;
    totalIncidents: number;
  };
  elevesParClasse: Array<{ id: string; nom: string; niveau: string; effectif: number }>;
  notesParMatiere: Array<{ id: string; nom: string; code: string; couleur: string | null; count: number }>;
  moyennesParClasse: Array<{ classeId: string; classeNom: string; moyenne: number | null }>;
  absencesParMois: number;
}

function BigStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View className="bg-white rounded-2xl p-4 border border-gray-100 flex-1">
      <View className="w-10 h-10 rounded-xl items-center justify-center mb-2" style={{ backgroundColor: color + "15" }}>
        <Icon size={20} color={color} />
      </View>
      <Text className="text-2xl font-bold text-gray-900">{value}</Text>
      <Text className="text-xs text-gray-500 mt-0.5">{label}</Text>
    </View>
  );
}

function BarChart({ data, maxValue, color }: { data: Array<{ label: string; value: number }>; maxValue: number; color: string }) {
  return (
    <View className="mt-2">
      {data.map((item, i) => (
        <View key={i} className="flex-row items-center mb-2">
          <Text className="text-xs text-gray-600 w-20" numberOfLines={1}>{item.label}</Text>
          <View className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden">
            <View
              className="h-full rounded-md"
              style={{
                width: `${maxValue > 0 ? (item.value / maxValue) * 100 : 0}%`,
                backgroundColor: color,
                minWidth: item.value > 0 ? 8 : 0,
              }}
            />
          </View>
          <Text className="text-xs font-semibold text-gray-700 ml-2 w-8">{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function AnalyticsScreen() {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["analytics"],
    queryFn: () => apiFetch<AnalyticsData>("/api/mobile/analytics"),
  });

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator size="large" color="#4f46e5" />
      </SafeAreaView>
    );
  }

  if (!data) return null;

  const maxEffectif = Math.max(...data.elevesParClasse.map((c) => c.effectif), 1);
  const maxNotes = Math.max(...data.notesParMatiere.map((m) => m.count), 1);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-3 pb-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Analytics</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        {/* Big stats */}
        <View className="flex-row gap-3 mb-4">
          <BigStat icon={Users} label="Élèves" value={data.stats.totalEleves} color="#4f46e5" />
          <BigStat icon={GraduationCap} label="Classes" value={data.stats.totalClasses} color="#7c3aed" />
        </View>
        <View className="flex-row gap-3 mb-4">
          <BigStat icon={BookOpen} label="Notes" value={data.stats.totalNotes} color="#0ea5e9" />
          <BigStat icon={ClipboardList} label="Absences" value={data.stats.totalAbsences} color="#f59e0b" />
        </View>
        <View className="flex-row gap-3 mb-6">
          <BigStat icon={Shield} label="Incidents" value={data.stats.totalIncidents} color="#ef4444" />
          <BigStat icon={TrendingUp} label="Enseignants" value={data.stats.totalEnseignants} color="#22c55e" />
        </View>

        {/* Effectifs par classe */}
        <View className="bg-white rounded-2xl p-4 mb-4 border border-gray-100">
          <Text className="text-base font-bold text-gray-900 mb-1">Effectifs par classe</Text>
          <BarChart
            data={data.elevesParClasse.map((c) => ({ label: c.nom, value: c.effectif }))}
            maxValue={maxEffectif}
            color="#4f46e5"
          />
        </View>

        {/* Moyennes par classe */}
        <View className="bg-white rounded-2xl p-4 mb-4 border border-gray-100">
          <Text className="text-base font-bold text-gray-900 mb-3">Moyennes par classe</Text>
          {data.moyennesParClasse.map((m, i) => (
            <View key={i} className="flex-row items-center justify-between py-2" style={{ borderBottomWidth: i < data.moyennesParClasse.length - 1 ? 1 : 0, borderBottomColor: "#f3f4f6" }}>
              <Text className="text-sm text-gray-700">{m.classeNom}</Text>
              <Text className={cn("text-sm font-bold", m.moyenne !== null && m.moyenne >= 10 ? "text-green-600" : "text-red-600")}>
                {m.moyenne !== null ? m.moyenne.toFixed(2) : "—"} / 20
              </Text>
            </View>
          ))}
        </View>

        {/* Notes par matière */}
        <View className="bg-white rounded-2xl p-4 mb-4 border border-gray-100">
          <Text className="text-base font-bold text-gray-900 mb-1">Notes par matière</Text>
          <BarChart
            data={data.notesParMatiere.map((m) => ({ label: m.nom, value: m.count }))}
            maxValue={maxNotes}
            color="#0ea5e9"
          />
        </View>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
