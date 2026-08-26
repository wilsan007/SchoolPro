import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCheck, UserX, Calendar, TrendingUp, Users } from "lucide-react-native";
import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/useI18n";
import { cn, formatDate } from "@/lib/utils";

interface Invitation {
  id: string;
  statut: string;
  dateInvitation: string;
  dateReponse: string | null;
  canal: string | null;
  eleve: {
    id: string;
    nom: string;
    prenom: string;
    classe: { id: string; nom: string; niveau: string };
  };
  campagne: {
    id: string;
    libelle: string;
    anneeSource: string;
    anneeCible: string;
    statut: string;
    dateFin: string | null;
  };
}

interface Campagne {
  id: string;
  libelle: string;
  anneeSource: string;
  anneeCible: string;
  statut: string;
  etapeActuelle: string;
  nbElevesTotal: number;
  nbReinscrits: number;
  nbNonReinscrits: number;
  nbDiplomes: number;
  revenusPrevus: number | null;
  dateDebut: string;
  dateFin: string | null;
}

const STATUT_COLORS: Record<string, string> = {
  INVITE: "bg-blue-100 text-blue-700",
  SANS_REPONSE: "bg-gray-100 text-gray-700",
  CONFIRME: "bg-green-100 text-green-700",
  REFUSE: "bg-red-100 text-red-700",
};

export default function ReinscriptionScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery<{
    campagne?: Campagne | null;
    invitations: Invitation[];
  }>({
    queryKey: ["reinscription"],
    queryFn: () => apiFetch<{ campagne?: Campagne | null; invitations: Invitation[] }>(
      "/api/mobile/reinscription"
    ),
  });

  const confirmMutation = useMutation({
    mutationFn: (params: { invitationId: string; confirme: boolean }) =>
      apiFetch("/api/mobile/reinscription", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reinscription"] });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  function handleConfirm(invitation: Invitation, confirme: boolean) {
    const name = `${invitation.eleve.prenom} ${invitation.eleve.nom}`;
    Alert.alert(
      confirme ? t("reinscription.confirm") : t("reinscription.refuse"),
      confirme
        ? t("reinscription.confirmQuestion", { name })
        : t("reinscription.refuseQuestion", { name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.confirm"),
          onPress: () => {
            confirmMutation.mutate({ invitationId: invitation.id, confirme });
            Alert.alert(
              "",
              confirme ? t("reinscription.confirmed") : t("reinscription.refused")
            );
          },
        },
      ]
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  const campagne = data?.campagne;
  const invitations = data?.invitations ?? [];

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-3 pb-4 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">{t("reinscription.title")}</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Campagne stats (admin) */}
        {campagne && (
          <View className="bg-white rounded-2xl p-5 border border-gray-100 mb-4">
            <Text className="text-base font-bold text-gray-900 mb-1">{campagne.libelle}</Text>
            <Text className="text-xs text-gray-500 mb-3">
              {campagne.anneeSource} → {campagne.anneeCible}
            </Text>
            <View className="flex-row gap-3">
              <View className="flex-1 bg-gray-50 rounded-xl p-3">
                <Users size={18} color="#6b7280" />
                <Text className="text-lg font-bold text-gray-900 mt-1">{campagne.nbElevesTotal}</Text>
                <Text className="text-xs text-gray-500">{t("reinscription.students")}</Text>
              </View>
              <View className="flex-1 bg-green-50 rounded-xl p-3">
                <UserCheck size={18} color="#16a34a" />
                <Text className="text-lg font-bold text-green-700 mt-1">{campagne.nbReinscrits}</Text>
                <Text className="text-xs text-green-600">{t("reinscription.reinscrits")}</Text>
              </View>
              <View className="flex-1 bg-red-50 rounded-xl p-3">
                <UserX size={18} color="#dc2626" />
                <Text className="text-lg font-bold text-red-700 mt-1">{campagne.nbNonReinscrits}</Text>
                <Text className="text-xs text-red-600">{t("reinscription.nonReinscrits")}</Text>
              </View>
            </View>
            {campagne.dateFin && (
              <View className="flex-row items-center mt-3">
                <Calendar size={14} color="#6b7280" />
                <Text className="text-xs text-gray-500 ml-1">
                  {formatDate(campagne.dateFin)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Invitations */}
        {invitations.length ? (
          <View style={{ gap: 12 }}>
            {invitations.map((inv) => (
              <View
                key={inv.id}
                className="bg-white rounded-2xl p-4 border border-gray-100"
                style={{ shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 }}
              >
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-gray-900">
                      {inv.eleve.prenom} {inv.eleve.nom}
                    </Text>
                    <Text className="text-xs text-gray-500">{inv.eleve.classe.nom}</Text>
                  </View>
                  <View className={cn("px-2 py-1 rounded-full", STATUT_COLORS[inv.statut]?.split(" ")[0])}>
                    <Text className={cn("text-xs font-semibold", STATUT_COLORS[inv.statut]?.split(" ")[1])}>
                      {t(`reinscription.status${inv.statut}`)}
                    </Text>
                  </View>
                </View>

                {inv.campagne && (
                  <Text className="text-xs text-gray-500 mb-2">
                    {inv.campagne.libelle} · {inv.campagne.anneeSource} → {inv.campagne.anneeCible}
                  </Text>
                )}

                {/* Actions : seulement si pas encore répondu */}
                {(inv.statut === "INVITE" || inv.statut === "SANS_REPONSE") && (
                  <View className="flex-row gap-3 mt-2">
                    <Pressable
                      onPress={() => handleConfirm(inv, true)}
                      className="flex-1 h-10 rounded-xl bg-green-500 items-center justify-center active:opacity-70"
                    >
                      <View className="flex-row items-center">
                        <UserCheck size={16} color="white" />
                        <Text className="text-white font-semibold text-sm ml-1">
                          {t("reinscription.confirm")}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => handleConfirm(inv, false)}
                      className="flex-1 h-10 rounded-xl bg-red-50 border border-red-200 items-center justify-center active:opacity-70"
                    >
                      <View className="flex-row items-center">
                        <UserX size={16} color="#dc2626" />
                        <Text className="text-red-600 font-semibold text-sm ml-1">
                          {t("reinscription.refuse")}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        ) : (
          <View className="items-center py-20">
            <UserCheck size={48} color="#d1d5db" />
            <Text className="text-sm text-gray-400 mt-4">{t("reinscription.noInvitations")}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
