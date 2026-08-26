import { useState, useEffect, useCallback } from "react";
import { t as translate, getLocale, setLocale, initLocale, type Locale } from "./i18n";

/**
 * Hook React pour la traduction dans les composants mobiles.
 *
 * Usage :
 *   const { t, locale, changeLocale } = useI18n();
 *   <Text>{t("dashboard.hello")}</Text>
 */
export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>(getLocale());

  useEffect(() => {
    initLocale().then(() => {
      setLocaleState(getLocale());
    });
  }, []);

  const changeLocale = useCallback(async (newLocale: Locale) => {
    await setLocale(newLocale);
    setLocaleState(newLocale);
  }, []);

  // Force le re-render quand la locale change
  const t = useCallback(
    (key: string, params?: Record<string, string>) => translate(key, params),
    [locale], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { t, locale, changeLocale };
}
