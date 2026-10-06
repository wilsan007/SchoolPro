"use client";

import messages from "@/i18n/so.json";
import { I18nProvider } from "@/components/providers/I18nProvider";

/** Dictionnaire « so » — voir le commentaire de `dictionnaires/index.ts`. */
export default function DictionnaireSo({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale="so" messages={messages}>
      {children}
    </I18nProvider>
  );
}
