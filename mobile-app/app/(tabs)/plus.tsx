import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ClipboardCheck,
  Calendar,
  Shield,
  MessageCircle,
  BarChart3,
  type LucideIcon,
} from "lucide-react-native";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

interface MenuItem {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  route: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    title: "Faire l'appel",
    description: "Saisir les présences en classe",
    icon: ClipboardCheck,
    color: "bg-indigo-500",
    route: "/(tabs)/appel",
  },
  {
    title: "Emploi du temps",
    description: "Planning des cours et salles",
    icon: Calendar,
    color: "bg-blue-500",
    route: "/(tabs)/emploi-du-temps",
  },
  {
    title: "Vie scolaire",
    description: "Incidents et sanctions",
    icon: Shield,
    color: "bg-red-500",
    route: "/(tabs)/vie-scolaire",
  },
  {
    title: "Messages",
    description: "Communications avec parents",
    icon: MessageCircle,
    color: "bg-sky-500",
    route: "/(tabs)/messages",
  },
  {
    title: "Analytics",
    description: "Statistiques et rapports",
    icon: BarChart3,
    color: "bg-green-500",
    route: "/(tabs)/analytics",
  },
];

export default function PlusScreen() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-3 pb-4 border-b border-gray-100">
        <Text className="text-xs text-gray-500">Plus de modules</Text>
        <Text className="text-xl font-bold text-gray-900">Toutes les fonctions</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 20 }}
      >
        <View style={{ gap: 12 }}>
          {MENU_ITEMS.map((item) => (
            <Pressable
              key={item.title}
              onPress={() => router.push(item.route as any)}
              className="bg-white rounded-2xl p-4 border border-gray-100 flex-row items-center active:opacity-70"
              style={{ shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 }}
            >
              <View className={cn("w-12 h-12 rounded-xl items-center justify-center mr-4", item.color)}>
                <item.icon size={24} color="white" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-gray-900">{item.title}</Text>
                <Text className="text-sm text-gray-500 mt-0.5">{item.description}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
