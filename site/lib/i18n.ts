// Locale config shared by proxy.ts (locale detection) and the UI.
// Kept free of `server-only` so the proxy (and client components) can import it.

export const locales = ["en", "ko", "ja", "zh", "es"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

// Names shown in the language switcher (each in its own language).
export const localeNames: Record<Locale, string> = {
  en: "English",
  ko: "한국어",
  ja: "日本語",
  zh: "中文",
  es: "Español",
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
