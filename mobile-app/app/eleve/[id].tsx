import { View, Text, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, router } from "expo-router";
import { ChevronLeft, BookOpen, ClipboardList, Shield, Phone, type LucideIcon } from "lucide-react-native";
import { apiFetch } from "@/lib/api";
import { cn, formatDate, getInitials, calculerMoyenne } from "@/lib/utils";

interface EleveDetail {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  lieuNaissance: string | null;
  sexe: string;
  photoUrl: string | null;
  statut: string;
  classe: { id: string; nom: string; niveau: string } | null;
  parents: Array<{
    isGardien: boolean;
    parent: {
      id: string;
      nom: string;
      prenom: string;
      phone: string | null;
      phone2: string | null;
      email: string | null;
      profession: string | null;
    };
  }>;
  notes: Array<{
    id: string;
    valeur: number;
    noteMax: number;
    coefficient: number;
    intitule: string | null;
    date: string;
    matiere: { nom: string; code: string; couleur: string | null; coefficient: number };
  }>;
  absences: Array<{
    id: string;
    date: string;
    isRetard: boolean;
    statut: string;
    motif: string | null;
  }>;
  incidents: Array<{
    id: string;
    date: string;
    type: string;
    description: string;
    gravite: number;
    statut: string;
  }>;
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl p-4 mb-4 border border-gray-100">
      <View className="flex-row items-center mb-3">
        <Icon size={18} color="#4f46e5" />
        <Text className="text-base font-bold text-gray-900 ml-2">{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function EleveDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isLoading } = useQuery<{ eleve: EleveDetail }>({
    queryKey: ["eleve", id],
    queryFn: () => apiFetch<{ eleve: EleveDetail }>(`/api/mobile/eleves/${id}`),
  });

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator size="large" color="#4f46e5" />
      </SafeAreaView>
    );
  }

  const eleve = data?.eleve;
  if (!eleve) return null;

  const moyenne = calculerMoyenne(
    eleve.notes.map((n) => ({ valeur: n.valeur, noteMax: n.noteMax, coefficient: n.coefficient }))
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-4 pt-3 pb-4 border-b border-gray-100">
        <View className="flex-row items-center">
          <Pressable onPress={() => router.back()} hitSlop={8} className="mr-3">
            <ChevronLeft size={24} color="#4f46e5" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-lg font-bold text-gray-900">
              {eleve.prenom} {eleve.nom}
            </Text>
            <Text className="text-xs text-gray-500">
              {eleve.matricule} · {eleve.classe?.nom ?? "Sans classe"}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        {/* Profile card */}
        <View className="bg-white rounded-2xl p-5 mb-4 border border-gray-100 items-center">
          <View className="w-20 h-20 rounded-full bg-violet-100 items-center justify-center mb-3">
            <Text className="text-2xl font-bold text-violet-700">
              {getInitials(`${eleve.prenom} ${eleve.nom}`)}
            </Text>
          </View>
          <Text className="text-xl font-bold text-gray-900">
            {eleve.prenom} {eleve.nom}
          </Text>
          <Text className="text-sm text-gray-500 mt-1">
            {eleve.sexe === "M" ? "Garçon" : "Fille"} · Né(e) le {formatDate(eleve.dateNaissance)}
          </Text>
          <View className="flex-row gap-3 mt-4">
            <View className="items-center">
              <Text className="text-2xl font-bold text-primary">
                {moyenne ? moyenne.toFixed(2) : "—"}
              </Text>
              <Text className="text-xs text-gray-500">Moyenne</Text>
            </View>
            <View className="w-px bg-gray-200" />
            <View className="items-center">
              <Text className="text-2xl font-bold text-orange-500">
                {eleve.absences.length}
              </Text>
              <Text className="text-xs text-gray-500">Absences</Text>
            </View>
            <View className="w-px bg-gray-200" />
            <View className="items-center">
              <Text className="text-2xl font-bold text-red-500">
                {eleve.incidents.length}
              </Text>
              <Text className="text-xs text-gray-500">Incidents</Text>
            </View>
          </View>
        </View>

        {/* Parents */}
        {eleve.parents.length > 0 && (
          <SectionCard title="Parents / Tuteurs" icon={Phone}>
            {eleve.parents.map((p, i) => (
              <View key={p.parent.id} className={cn(i > 0 && "mt-3 pt-3 border-t border-gray-50")}>
                <View className="flex-row items-center">
                  <Text className="text-sm font-semibold text-gray-900">
                    {p.parent.prenom} {p.parent.nom}
                  </Text>
                  {p.isGardien && (
                    <View className="ml-2 px-2 py-0.5 rounded-full bg-primary/10">
                      <Text className="text-xs font-semibold text-primary">Gardien</Text>
                    </View>
                  )}
                </View>
                {p.parent.phone && (
                  <Text className="text-xs text-gray-500 mt-1">📞 {p.parent.phone}</Text>
                )}
                {p.parent.email && (
                  <Text className="text-xs text-gray-500">✉️ {p.parent.email}</Text>
                )}
                {p.parent.profession && (
                  <Text className="text-xs text-gray-400 mt-0.5">{p.parent.profession}</Text>
                )}
              </View>
            ))}
          </SectionCard>
        )}

        {/* Notes */}
        {eleve.notes.length > 0 && (
          <SectionCard title="Notes récentes" icon={BookOpen}>
            {eleve.notes.slice(0, 8).map((n, i) => (
              <View key={n.id} className={cn("flex-row items-center", i > 0 && "mt-2 pt-2 border-t border-gray-50")}>
                <View className="w-1 h-8 rounded-full mr-2" style={{ backgroundColor: n.matiere.couleur ?? "#4f46e5" }} />
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-900">{n.matiere.nom}</Text>
                  <Text className="text-xs text-gray-500">{n.intitule ?? "Note"} · {formatDate(n.date)}</Text>
                </View>
                <Text className={cn("text-base font-bold", (n.valeur / n.noteMax) * 20 >= 10 ? "text-green-600" : "text-red-600")}>
                  {n.valeur}/{n.noteMax}
                </Text>
              </View>
            ))}
          </SectionCard>
        )}

        {/* Absences */}
        {eleve.absences.length > 0 && (
          <SectionCard title="Absences" icon={ClipboardList}>
            {eleve.absences.map((a, i) => (
              <View key={a.id} className={cn("flex-row items-center", i > 0 && "mt-2 pt-2 border-t border-gray-50")}>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-900">{formatDate(a.date)}</Text>
                  <Text className="text-xs text-gray-500">{a.isRetard ? "Retard" : a.statut.replace("_", " ")}{a.motif ? ` · ${a.motif}` : ""}</Text>
                </View>
              </View>
            ))}
          </SectionCard>
        )}

        {/* Incidents */}
        {eleve.incidents.length > 0 && (
          <SectionCard title="Discipline" icon={Shield}>
            {eleve.incidents.map((inc, i) => (
              <View key={inc.id} className={cn(i > 0 && "mt-2 pt-2 border-t border-gray-50")}>
                <View className="flex-row items-center">
                  <Text className="text-sm font-medium text-gray-900 flex-1">{inc.type}</Text>
                  <View className={cn("px-2 py-0.5 rounded-full", inc.gravite >= 3 ? "bg-red-100" : inc.gravite === 2 ? "bg-orange-100" : "bg-yellow-100")}>
                    <Text className={cn("text-xs font-semibold", inc.gravite >= 3 ? "text-red-700" : inc.gravite === 2 ? "text-orange-700" : "text-yellow-700")}>
                      Gravité {inc.gravite}
                    </Text>
                  </View>
                </View>
                <Text className="text-xs text-gray-500 mt-0.5">{formatDate(inc.date)} · {inc.description}</Text>
              </View>
            ))}
          </SectionCard>
        )}

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
