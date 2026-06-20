import "server-only";
import type { Locale } from "@/lib/i18n";

// Docs content is its own module (separate from the marketing dictionary), one
// JSON per locale, server-only so translations never reach the client bundle.
const docs = {
  en: () => import("./content/en.json").then((m) => m.default),
  ko: () => import("./content/ko.json").then((m) => m.default),
  ja: () => import("./content/ja.json").then((m) => m.default),
  zh: () => import("./content/zh.json").then((m) => m.default),
  es: () => import("./content/es.json").then((m) => m.default),
} as const;

export type DocsContent = Awaited<ReturnType<(typeof docs)["en"]>>;

export async function getDocs(locale: Locale): Promise<DocsContent> {
  return docs[locale]();
}

// Ordered sidebar pages: slug (relative to /[lang]/docs) + nav label key.
export const DOCS_PAGES = [
  { slug: "", key: "overview" },
  { slug: "entities", key: "entities" },
  { slug: "routes", key: "routes" },
  { slug: "runtime", key: "runtime" },
  { slug: "errors", key: "errors" },
  { slug: "compare", key: "compare" },
] as const;
