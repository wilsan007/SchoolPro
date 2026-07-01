import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eye, EyeOff, School } from "lucide-react-native";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

export default function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!email || !password) {
      setError("Veuillez remplir tous les champs");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await signIn(email, password);
      router.replace("/(tabs)/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View className="items-center mb-10">
            <View className="w-16 h-16 rounded-2xl bg-primary items-center justify-center mb-4">
              <School color="white" size={32} />
            </View>
            <Text className="text-2xl font-bold text-gray-900">EcolPro</Text>
            <Text className="text-sm text-gray-500 mt-1">
              Gestion scolaire intelligente
            </Text>
          </View>

          {/* Form */}
          <View className="w-full max-w-sm" style={{ gap: 16 }}>
            <Text className="text-xl font-bold text-gray-900 mb-2">
              Connexion
            </Text>

            {/* Email */}
            <View style={{ gap: 6 }}>
              <Text className="text-sm font-medium text-gray-700">
                Adresse email
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="admin@monecole.sn"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                className={cn(
                  "h-12 px-4 rounded-xl border border-gray-200 text-base",
                  error && !email && "border-red-400"
                )}
              />
            </View>

            {/* Password */}
            <View style={{ gap: 6 }}>
              <Text className="text-sm font-medium text-gray-700">
                Mot de passe
              </Text>
              <View className="relative">
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  className="h-12 px-4 pr-12 rounded-xl border border-gray-200 text-base"
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-0 bottom-0 justify-center"
                  hitSlop={8}
                >
                  {showPassword ? (
                    <EyeOff size={20} color="#9ca3af" />
                  ) : (
                    <Eye size={20} color="#9ca3af" />
                  )}
                </Pressable>
              </View>
            </View>

            {error && (
              <Text className="text-sm text-red-500">{error}</Text>
            )}

            {/* Submit */}
            <Pressable
              onPress={handleLogin}
              disabled={loading}
              className={cn(
                "h-12 rounded-xl items-center justify-center",
                loading ? "bg-primary/70" : "bg-primary"
              )}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  Se connecter
                </Text>
              )}
            </Pressable>

            {/* Demo accounts */}
            <View className="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <Text className="text-xs font-semibold text-gray-700 mb-2">
                Comptes de démonstration
              </Text>
              <Pressable
                onPress={() => {
                  setEmail("admin@lycee-demo.ecolpro.app");
                  setPassword("Demo@2026!");
                }}
                className="mb-2"
              >
                <Text className="text-xs text-primary font-medium">
                  Admin: admin@lycee-demo.ecolpro.app / Demo@2026!
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setEmail("enseignant@lycee-demo.ecolpro.app");
                  setPassword("Demo@2026!");
                }}
              >
                <Text className="text-xs text-primary font-medium">
                  Enseignant: enseignant@lycee-demo.ecolpro.app / Demo@2026!
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
