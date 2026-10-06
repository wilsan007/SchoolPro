"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { LOCALE_CHANNEL, LOCALE_EVENT } from "@/lib/locale-sync";

const REFRESH_LOCK = "schoolpro-locale-refresh";
const REFRESH_TIMEOUT_MS = 60_000;

interface I18nProviderProps {
  locale: string;
  messages: AbstractIntlMessages;
  children: React.ReactNode;
}

/**
 * Fournisseur de traductions qui applique un changement de langue sans
 * attendre le serveur.
 *
 * Relancer le rendu serveur (`router.refresh()`) rejoue toutes les requêtes
 * de la page : sur une base distante, la page restait plusieurs dizaines de
 * secondes dans l'ancienne langue. Ici, le dictionnaire de la nouvelle langue
 * est chargé côté navigateur et appliqué aussitôt à tous les composants
 * client ; le rafraîchissement serveur suit en arrière-plan pour les textes
 * rendus côté serveur.
 *
 * Ce rafraîchissement est fait UN DOCUMENT À LA FOIS (Web Locks, partagé
 * entre le shell et les iframes) : rafraîchir toutes les fenêtres ouvertes en
 * même temps multipliait les requêtes simultanées et saturait le pool de
 * connexions (EMAXCONNSESSION), ce qui faisait planter les fenêtres.
 */
export function I18nProvider({ locale, messages, children }: I18nProviderProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Libère le verrou de rafraîchissement quand le rendu serveur est arrivé.
  const liberer = useRef<(() => void) | null>(null);
  const [override, setOverride] = useState<{ locale: string; messages: AbstractIntlMessages } | null>(null);
  // Dernière langue demandée : ignore le doublon (événement local + canal) et
  // une réponse de dictionnaire arrivée après un autre changement.
  const demandee = useRef(locale);

  useEffect(() => {
    async function appliquer(nouvelle: unknown) {
      if (typeof nouvelle !== "string" || nouvelle === demandee.current) return;
      demandee.current = nouvelle;
      try {
        const dict = (await import(`@/i18n/${nouvelle}.json`)).default as AbstractIntlMessages;
        if (demandee.current === nouvelle) setOverride({ locale: nouvelle, messages: dict });
      } catch {
        // Langue inconnue : le rafraîchissement serveur retombera sur le défaut.
      }
      const rafraichir = () =>
        new Promise<void>((resolve) => {
          // Une autre langue a été choisie entre-temps : son propre tour suit.
          if (demandee.current !== nouvelle) return resolve();
          const timer = setTimeout(resolve, REFRESH_TIMEOUT_MS);
          liberer.current = () => {
            clearTimeout(timer);
            resolve();
          };
          startTransition(() => router.refresh());
        });
      if (navigator.locks) await navigator.locks.request(REFRESH_LOCK, rafraichir);
      else await rafraichir();
    }

    const onEvent = (e: Event) => appliquer((e as CustomEvent).detail);
    window.addEventListener(LOCALE_EVENT, onEvent);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(LOCALE_CHANNEL);
    if (channel) channel.onmessage = (e) => appliquer(e.data);
    return () => {
      window.removeEventListener(LOCALE_EVENT, onEvent);
      channel?.close();
    };
  }, [router]);

  useEffect(() => {
    if (pending) return;
    liberer.current?.();
    liberer.current = null;
  }, [pending]);

  // Le serveur fait foi dès qu'il a rattrapé la langue demandée.
  const actif = override && override.locale !== locale ? override : { locale, messages };

  useEffect(() => {
    document.documentElement.lang = actif.locale;
  }, [actif.locale]);

  return (
    <NextIntlClientProvider locale={actif.locale} messages={actif.messages}>
      {children}
    </NextIntlClientProvider>
  );
}
