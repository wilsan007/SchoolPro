import { View, Text, Pressable, Alert } from "react-native";
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
  type LucideIcon,
} from "lucide-react-native";
import { useAuthStore } from "@/lib/auth-store";
import { getInitials } from "@/lib/utils";

function MenuItem({
  icon: Icon,
  label,
  onPress,
  color = "#4f46e5",
}: {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-white px-4 py-3.5 active:opacity-70"
      style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
    >
      <Icon size={20} color={color} />
      <Text className="flex-1 text-sm font-medium text-gray-900 ml-3">
        {label}
      </Text>
      <ChevronRight size={18} color="#d1d5db" />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();

  function handleLogout() {
    Alert.alert("Déconnexion", "Voulez-vous vraiment vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Déconnecter",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-5 pt-3 pb-4 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Profil</Text>
      </View>

      <View className="flex-1">
        {/* User card */}
        <View className="bg-white mx-4 mt-4 rounded-2xl p-5 items-center border border-gray-100">
          <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-3">
            <Text className="text-2xl font-bold text-white">
              {user ? getInitials(user.name ?? user.email) : "?"}
            </Text>
          </View>
          <Text className="text-lg font-bold text-gray-900">
            {user?.name ?? "Utilisateur"}
          </Text>
          <Text className="text-sm text-gray-500 mt-0.5">{user?.email}</Text>
          {tenant && (
            <View className="flex-row items-center mt-3 px-3 py-1.5 rounded-full bg-primary/10">
              <School size={14} color="#4f46e5" />
              <Text className="text-xs font-semibold text-primary ml-1.5">
                {tenant.name}
              </Text>
            </View>
          )}
          <View className="px-3 py-1 rounded-full bg-gray-100 mt-2">
            <Text className="text-xs font-medium text-gray-600">
              {user?.role}
            </Text>
          </View>
        </View>

        {/* Menu */}
        <View className="mx-4 mt-6 rounded-2xl overflow-hidden border border-gray-100">
          <MenuItem icon={User} label="Informations personnelles" />
          <MenuItem icon={Bell} label="Notifications" />
          <MenuItem icon={Shield} label="Sécurité" />
          <MenuItem icon={Settings} label="Paramètres de l'application" />
        </View>

        <View className="mx-4 mt-4 rounded-2xl overflow-hidden border border-gray-100">
          <MenuItem icon={HelpCircle} label="Aide & Support" color="#6b7280" />
        </View>

        {/* Logout */}
        <View className="mx-4 mt-4 rounded-2xl overflow-hidden border border-red-100">
          <Pressable
            onPress={handleLogout}
            className="flex-row items-center bg-white px-4 py-3.5 active:opacity-70"
          >
            <LogOut size={20} color="#ef4444" />
            <Text className="flex-1 text-sm font-semibold text-red-600 ml-3">
              Se déconnecter
            </Text>
          </Pressable>
        </View>

        {/* Version */}
        <View className="items-center mt-8">
          <Text className="text-xs text-gray-400">EcolPro Mobile v1.0.0</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
