import "server-only";
import type { Locale } from "@/lib/i18n";

// Dictionaries are dynamically imported per-locale and only ever run on the
// server, so translation files never ship to the client bundle.
const dictionaries = {
  en: () => import("./dictionaries/en.json").then((m) => m.default),
  ko: () => import("./dictionaries/ko.json").then((m) => m.default),
  ja: () => import("./dictionaries/ja.json").then((m) => m.default),
  zh: () => import("./dictionaries/zh.json").then((m) => m.default),
  es: () => import("./dictionaries/es.json").then((m) => m.default),
} as const;

// The English dictionary is the canonical shape every locale conforms to.
export type Dictionary = Awaited<ReturnType<(typeof dictionaries)["en"]>>;

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}
