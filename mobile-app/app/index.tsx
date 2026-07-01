import { Redirect } from "expo-router";
import { useAuthStore } from "@/lib/auth-store";

export default function Index() {
  const isSignedIn = useAuthStore((s) => s.isSignedIn);

  if (isSignedIn) {
    return <Redirect href="/(tabs)/dashboard" />;
  }
  return <Redirect href="/login" />;
}
