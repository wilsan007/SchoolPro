"use client";

import { useEffect } from "react";
import { initNativeApp } from "@/lib/mobile/native";

/**
 * Initialise les capacités natives (Capacitor) au montage.
 * No-op total côté web — n'a d'effet que dans la coque iOS/Android.
 */
export function NativeProvider() {
  useEffect(() => {
    initNativeApp();
  }, []);

  return null;
}
