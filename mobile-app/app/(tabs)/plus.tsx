import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ClipboardCheck,
  Calendar,
  Shield,
  MessageCircle,
  BarChart3,
  BookOpen,
  Lightbulb,
  UserCheck,
  type LucideIcon,
} from "lucide-react-native";
import { useI18n } from "@/lib/useI18n";
import { cn } from "@/lib/utils";

interface MenuItem {
  titleKey: string;
  descKey: string;
  icon: LucideIcon;
  color: string;
  route: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    titleKey: "plus.appel",
    descKey: "plus.appelDesc",
    icon: ClipboardCheck,
    color: "bg-indigo-500",
    route: "/(tabs)/appel",
  },
  {
    titleKey: "plus.timetable",
    descKey: "plus.timetableDesc",
    icon: Calendar,
    color: "bg-blue-500",
    route: "/(tabs)/emploi-du-temps",
  },
  {
    titleKey: "plus.vieScolaire",
    descKey: "plus.vieScolaireDesc",
    icon: Shield,
    color: "bg-red-500",
    route: "/(tabs)/vie-scolaire",
  },
  {
    titleKey: "plus.messages",
    descKey: "plus.messagesDesc",
    icon: MessageCircle,
    color: "bg-sky-500",
    route: "/(tabs)/messages",
  },
  {
    titleKey: "plus.analytics",
    descKey: "plus.analyticsDesc",
    icon: BarChart3,
    color: "bg-green-500",
    route: "/(tabs)/analytics",
  },
  {
    titleKey: "plus.cahierJournal",
    descKey: "plus.cahierJournalDesc",
    icon: BookOpen,
    color: "bg-violet-500",
    route: "/(tabs)/cahier-journal",
  },
  {
    titleKey: "plus.recommandations",
    descKey: "plus.recommandationsDesc",
    icon: Lightbulb,
    color: "bg-amber-500",
    route: "/(tabs)/recommandations",
  },
  {
    titleKey: "plus.reinscription",
    descKey: "plus.reinscriptionDesc",
    icon: UserCheck,
    color: "bg-teal-500",
    route: "/(tabs)/reinscription",
  },
];

export default function PlusScreen() {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-3 pb-4 border-b border-gray-100">
        <Text className="text-xs text-gray-500">{t("plus.subtitle")}</Text>
        <Text className="text-xl font-bold text-gray-900">{t("plus.title")}</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 20 }}
      >
        <View style={{ gap: 12 }}>
          {MENU_ITEMS.map((item) => (
            <Pressable
              key={item.titleKey}
              onPress={() => router.push(item.route as any)}
              className="bg-white rounded-2xl p-4 border border-gray-100 flex-row items-center active:opacity-70"
              style={{ shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 }}
            >
              <View className={cn("w-12 h-12 rounded-xl items-center justify-center mr-4", item.color)}>
                <item.icon size={24} color="white" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-gray-900">{t(item.titleKey)}</Text>
                <Text className="text-sm text-gray-500 mt-0.5">{t(item.descKey)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
