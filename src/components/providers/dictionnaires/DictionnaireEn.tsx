"use client";

import messages from "@/i18n/en.json";
import { I18nProvider } from "@/components/providers/I18nProvider";

/** Dictionnaire « en » — voir le commentaire de `dictionnaires/index.ts`. */
export default function DictionnaireEn({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale="en" messages={messages}>
      {children}
    </I18nProvider>
  );
}
