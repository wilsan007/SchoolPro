import { Tabs, Redirect } from "expo-router";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  BookOpen,
  Grid3x3,
} from "lucide-react-native";
import { useAuthStore } from "@/lib/auth-store";

export default function TabLayout() {
  const isSignedIn = useAuthStore((s) => s.isSignedIn);

  if (!isSignedIn) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#4f46e5",
        tabBarInactiveTintColor: "#9ca3af",
        tabBarStyle: {
          backgroundColor: "white",
          borderTopWidth: 1,
          borderTopColor: "#f3f4f6",
          paddingBottom: 4,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Accueil",
          tabBarIcon: ({ color }) => <LayoutDashboard size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="eleves"
        options={{
          title: "Élèves",
          tabBarIcon: ({ color }) => <Users size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="absences"
        options={{
          title: "Absences",
          tabBarIcon: ({ color }) => <ClipboardList size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: "Notes",
          tabBarIcon: ({ color }) => <BookOpen size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="plus"
        options={{
          title: "Plus",
          tabBarIcon: ({ color }) => <Grid3x3 size={22} color={color} />,
        }}
      />

      {/* Hidden tabs — accessible via "Plus" page */}
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="appel" options={{ href: null }} />
      <Tabs.Screen name="emploi-du-temps" options={{ href: null }} />
      <Tabs.Screen name="vie-scolaire" options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
    </Tabs>
  );
}
