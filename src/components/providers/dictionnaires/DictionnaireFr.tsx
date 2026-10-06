"use client";

import messages from "@/i18n/fr.json";
import { I18nProvider } from "@/components/providers/I18nProvider";

/** Dictionnaire « fr » — voir le commentaire de `dictionnaires/index.ts`. */
export default function DictionnaireFr({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale="fr" messages={messages}>
      {children}
    </I18nProvider>
  );
}
