"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_CHANNEL } from "@/lib/locale-sync";

/**
 * Rafraîchit le document courant quand la langue change AILLEURS (shell du
 * workspace, iframe d'un module, autre onglet). Le document qui émet le
 * changement ne reçoit pas son propre message : il se rafraîchit lui-même.
 */
export function LocaleSync() {
  const router = useRouter();

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(LOCALE_CHANNEL);
    channel.onmessage = () => router.refresh();
    return () => channel.close();
  }, [router]);

  return null;
}
