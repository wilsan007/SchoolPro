import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Configuration Capacitor — EcolPro Mobile
 * ============================================================
 * L'application EcolPro est full-stack (server components + API + auth),
 * elle ne peut pas être exportée en statique. La coque native charge donc
 * l'application HÉBERGÉE via `server.url` et y ajoute les capacités natives
 * (notifications push, caméra, biométrie, statut réseau).
 *
 * Définir l'URL de production via la variable d'environnement CAP_SERVER_URL
 * avant `npx cap sync` :
 *   CAP_SERVER_URL=https://app.ecolpro.app npx cap sync
 */
const SERVER_URL = process.env.CAP_SERVER_URL ?? "https://app.ecolpro.app";

const config: CapacitorConfig = {
  appId: "app.ecolpro.mobile",
  appName: "EcolPro",
  // Dossier web de repli (page hors-ligne) embarqué dans le binaire.
  webDir: "mobile/www",
  server: {
    url: SERVER_URL,
    androidScheme: "https",
    // En prod, jamais de cleartext : on force HTTPS.
    cleartext: false,
    // Domaines autorisés à rester dans la webview (sinon ouverts dans le navigateur système).
    allowNavigation: [
      "*.ecolpro.app",
      "ecolpro.app",
    ],
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#ffffff",
  },
  android: {
    backgroundColor: "#ffffff",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#4f46e5",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
