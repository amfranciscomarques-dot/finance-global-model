'use client';

// Client-side i18n. next-intl drives the `useTranslations` API, but we feed it
// locale + messages from React state (not server config / routing), so the
// language toggle switches instantly with no navigation or reload. The choice
// is persisted to localStorage; default is English.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import en from './messages/en.json';
import pt from './messages/pt.json';

export type Locale = 'en' | 'pt';

const MESSAGES = { en, pt } as const;
const STORAGE_KEY = 'cfx-locale';

type LocaleContextValue = { locale: Locale; setLocale: (l: Locale) => void };
const LocaleContext = createContext<LocaleContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Always render `en` on the server and first client paint to keep hydration
  // stable; the stored preference is applied in an effect right after mount.
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'pt') setLocaleState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable — keep the in-memory choice */
    }
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Europe/Lisbon">
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useLocaleSwitcher(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocaleSwitcher must be used within <I18nProvider>');
  return ctx;
}

/** App locale → BCP-47 tag for `toLocaleDateString` / `Intl` date formatting. */
export function dateLocale(locale: Locale): string {
  return locale === 'pt' ? 'pt-PT' : 'en-US';
}
