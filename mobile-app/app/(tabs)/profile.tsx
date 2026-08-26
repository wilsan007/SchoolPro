import {
  View,
  Text,
  Pressable,
  Alert,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  User,
  Settings,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  School,
  Shield,
  Clock,
  Globe,
  type LucideIcon,
} from "lucide-react-native";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth-store";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/useI18n";
import { getInitials } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";

function MenuItem({
  icon: Icon,
  label,
  onPress,
  color = "#4f46e5",
  rightLabel,
}: {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
  color?: string;
  rightLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-white px-4 py-3.5 active:opacity-70"
      style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
    >
      <Icon size={20} color={color} />
      <Text className="flex-1 text-sm font-medium text-gray-900 ml-3">{label}</Text>
      {rightLabel && (
        <Text className="text-xs text-gray-500 mr-2">{rightLabel}</Text>
      )}
      <ChevronRight size={18} color="#d1d5db" />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();
  const { t, locale, changeLocale } = useI18n();
  const queryClient = useQueryClient();

  // Time Machine
  const [showTimeMachine, setShowTimeMachine] = useState(false);
  const [demoDate, setDemoDate] = useState("");

  const { data: timeMachineData, refetch: refetchTM } = useQuery<{
    autorise: boolean;
    enabled: boolean;
    date: string | null;
    realNow: string;
  }>({
    queryKey: ["demo-now"],
    queryFn: () => apiFetch("/api/mobile/demo-now"),
    refetchOnMount: true,
  });

  const setDemoMutation = useMutation({
    mutationFn: (date: string) =>
      apiFetch("/api/mobile/demo-now", {
        method: "POST",
        body: JSON.stringify({ date }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demo-now"] });
      // Invalider toutes les queries pour recharger avec la nouvelle date
      queryClient.invalidateQueries();
      setShowTimeMachine(false);
      Alert.alert("", t("profile.timeMachineEnabled"));
    },
    onError: (e: unknown) => {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : "Erreur");
    },
  });

  const clearDemoMutation = useMutation({
    mutationFn: () => apiFetch("/api/mobile/demo-now", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({});
      Alert.alert("", t("profile.timeMachineDisabled"));
    },
  });

  function handleLogout() {
    Alert.alert(t("profile.logout"), t("profile.logoutConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profile.logoutButton"),
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  }

  function handleLanguageChange(newLocale: Locale) {
    Alert.alert(t("common.language"), newLocale, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.confirm"),
        onPress: () => changeLocale(newLocale),
      },
    ]);
  }

  const tmEnabled = timeMachineData?.enabled ?? false;
  const tmDate = timeMachineData?.date ?? null;
  const tmAutorise = timeMachineData?.autorise ?? false;

  const localeLabels: Record<Locale, string> = {
    fr: "Français",
    en: "English",
    so: "Soomaali",
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-5 pt-3 pb-4 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">{t("profile.title")}</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* User card */}
        <View className="bg-white mx-4 mt-4 rounded-2xl p-5 items-center border border-gray-100">
          <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-3">
            <Text className="text-2xl font-bold text-white">
              {user ? getInitials(user.name ?? user.email) : "?"}
            </Text>
          </View>
          <Text className="text-lg font-bold text-gray-900">{user?.name ?? "Utilisateur"}</Text>
          <Text className="text-sm text-gray-500 mt-0.5">{user?.email}</Text>
          {tenant && (
            <View className="flex-row items-center mt-3 px-3 py-1.5 rounded-full bg-primary/10">
              <School size={14} color="#4f46e5" />
              <Text className="text-xs font-semibold text-primary ml-1.5">{tenant.name}</Text>
            </View>
          )}
          <View className="px-3 py-1 rounded-full bg-gray-100 mt-2">
            <Text className="text-xs font-medium text-gray-600">{user?.role}</Text>
          </View>
        </View>

        {/* Language selector */}
        <View className="mx-4 mt-6 rounded-2xl overflow-hidden border border-gray-100">
          <View className="bg-white px-4 py-3.5 flex-row items-center" style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
            <Globe size={20} color="#4f46e5" />
            <Text className="flex-1 text-sm font-medium text-gray-900 ml-3">{t("profile.language")}</Text>
            <Text className="text-xs text-gray-500 mr-2">{localeLabels[locale]}</Text>
          </View>
          {(Object.keys(localeLabels) as Locale[]).map((l) => (
            <Pressable
              key={l}
              onPress={() => handleLanguageChange(l)}
              className="bg-white px-4 py-3 flex-row items-center justify-between active:opacity-70"
              style={{ borderBottomWidth: 1, borderBottomColor: "#f9fafb" }}
            >
              <Text className="text-sm text-gray-700">{localeLabels[l]}</Text>
              {locale === l && <Text className="text-xs text-primary font-semibold">✓</Text>}
            </Pressable>
          ))}
        </View>

        {/* Time Machine (admin only) */}
        {tmAutorise && (
          <View className="mx-4 mt-4 rounded-2xl overflow-hidden border border-gray-100">
            <View className="bg-white px-4 py-3.5 flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <Clock size={20} color="#4f46e5" />
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-medium text-gray-900">{t("profile.timeMachine")}</Text>
                  <Text className="text-xs text-gray-500">{t("profile.timeMachineDesc")}</Text>
                </View>
              </View>
              <View
                className={`px-2 py-1 rounded-full ${tmEnabled ? "bg-green-100" : "bg-gray-100"}`}
              >
                <Text className={`text-xs font-semibold ${tmEnabled ? "text-green-700" : "text-gray-500"}`}>
                  {tmEnabled ? t("profile.timeMachineEnabled") : t("profile.timeMachineDisabled")}
                </Text>
              </View>
            </View>
            {tmEnabled && tmDate && (
              <View className="bg-gray-50 px-4 py-2">
                <Text className="text-xs text-gray-600">
                  {t("profile.timeMachineCurrent")}: {new Date(tmDate).toLocaleDateString()}
                </Text>
              </View>
            )}
            <View className="flex-row gap-2 px-4 py-3 bg-white">
              <Pressable
                onPress={() => {
                  setDemoDate(tmDate ?? new Date().toISOString().slice(0, 10));
                  setShowTimeMachine(true);
                }}
                className="flex-1 h-9 rounded-lg bg-primary items-center justify-center active:opacity-70"
              >
                <Text className="text-white font-semibold text-xs">{t("profile.timeMachineSet")}</Text>
              </Pressable>
              {tmEnabled && (
                <Pressable
                  onPress={() => clearDemoMutation.mutate()}
                  className="flex-1 h-9 rounded-lg bg-gray-100 items-center justify-center active:opacity-70"
                >
                  <Text className="text-gray-700 font-semibold text-xs">{t("profile.timeMachineClear")}</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* Menu */}
        <View className="mx-4 mt-6 rounded-2xl overflow-hidden border border-gray-100">
          <MenuItem icon={User} label={t("profile.personalInfo")} />
          <MenuItem icon={Bell} label={t("profile.notifications")} />
          <MenuItem icon={Shield} label={t("profile.security")} />
          <MenuItem icon={Settings} label={t("profile.settings")} />
        </View>

        <View className="mx-4 mt-4 rounded-2xl overflow-hidden border border-gray-100">
          <MenuItem icon={HelpCircle} label={t("profile.help")} color="#6b7280" />
        </View>

        {/* Logout */}
        <View className="mx-4 mt-4 rounded-2xl overflow-hidden border border-red-100">
          <Pressable
            onPress={handleLogout}
            className="flex-row items-center bg-white px-4 py-3.5 active:opacity-70"
          >
            <LogOut size={20} color="#ef4444" />
            <Text className="flex-1 text-sm font-semibold text-red-600 ml-3">
              {t("profile.logout")}
            </Text>
          </Pressable>
        </View>

        {/* Version */}
        <View className="items-center mt-8">
          <Text className="text-xs text-gray-400">EcolPro Mobile v1.0.0</Text>
        </View>
      </ScrollView>

      {/* Time Machine Modal */}
      <Modal visible={showTimeMachine} transparent animationType="fade" onRequestClose={() => setShowTimeMachine(false)}>
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <Text className="text-lg font-bold text-gray-900 mb-1">{t("profile.timeMachine")}</Text>
            <Text className="text-sm text-gray-500 mb-4">{t("profile.timeMachineDesc")}</Text>

            <Text className="text-sm font-medium text-gray-700 mb-2">Date (YYYY-MM-DD)</Text>
            <TextInput
              value={demoDate}
              onChangeText={setDemoDate}
              placeholder="2026-03-16"
              className="h-12 px-4 rounded-xl border border-gray-200 text-base mb-4"
              keyboardType="default"
            />

            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setShowTimeMachine(false)}
                className="flex-1 h-11 rounded-xl bg-gray-100 items-center justify-center"
              >
                <Text className="text-gray-700 font-semibold text-sm">{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  // Convertir en ISO
                  const d = new Date(demoDate + "T12:00:00");
                  if (!isNaN(d.getTime())) {
                    setDemoMutation.mutate(d.toISOString());
                  } else {
                    Alert.alert(t("common.error"), "Date invalide");
                  }
                }}
                disabled={setDemoMutation.isPending}
                className="flex-1 h-11 rounded-xl bg-primary items-center justify-center"
              >
                {setDemoMutation.isPending ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text className="text-white font-semibold text-sm">{t("common.confirm")}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
