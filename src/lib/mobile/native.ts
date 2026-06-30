"use client";

/**
 * Pont natif Capacitor — EcolPro Mobile
 * ============================================================
 * Toutes les fonctions sont des no-op côté web : `Capacitor.isNativePlatform()`
 * renvoie `false` dans un navigateur, donc le même code tourne en web et en natif.
 * Les plugins natifs sont chargés en import dynamique pour ne pas alourdir le bundle web.
 */

import { Capacitor } from "@capacitor/core";

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getPlatform(): "ios" | "android" | "web" {
  try {
    return Capacitor.getPlatform() as "ios" | "android" | "web";
  } catch {
    return "web";
  }
}

/**
 * Initialise l'expérience native : barre de statut, splash screen,
 * et enregistrement aux notifications push (envoi du token au backend).
 */
export async function initNativeApp(): Promise<void> {
  if (!isNativePlatform()) return;

  // --- Barre de statut ---
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Light });
    if (getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: "#4f46e5" });
    }
  } catch (e) {
    console.warn("[Native] StatusBar indisponible", e);
  }

  // --- Masquer le splash après chargement ---
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch (e) {
    console.warn("[Native] SplashScreen indisponible", e);
  }

  // --- Bouton retour Android : ne pas quitter l'app à la racine ---
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else App.exitApp();
    });
  } catch (e) {
    console.warn("[Native] App plugin indisponible", e);
  }

  // --- Notifications push ---
  await registerPushNotifications();
}

/**
 * Demande la permission push, enregistre l'appareil et transmet le token
 * au backend pour le ciblage des notifications (canal PUSH du module Communication).
 */
export async function registerPushNotifications(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const perm = await PushNotifications.checkPermissions();
    let receive = perm.receive;
    if (receive === "prompt") {
      receive = (await PushNotifications.requestPermissions()).receive;
    }
    if (receive !== "granted") {
      console.info("[Native] Permission push refusée");
      return;
    }

    await PushNotifications.register();

    PushNotifications.addListener("registration", async (token) => {
      // Transmet le token APNs/FCM au backend, associé à l'utilisateur connecté.
      try {
        await fetch("/api/mobile/register-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.value, platform: getPlatform() }),
        });
      } catch (e) {
        console.warn("[Native] Échec envoi du token push", e);
      }
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.error("[Native] Erreur d'enregistrement push", err);
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      // Navigation en profondeur à l'ouverture d'une notif (ex: lien vers un bulletin).
      const url = action.notification.data?.url;
      if (url) window.location.href = url;
    });
  } catch (e) {
    console.warn("[Native] PushNotifications indisponible", e);
  }
}
