"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n";

const PAGES = [
  { slug: "", key: "overview" },
  { slug: "entities", key: "entities" },
  { slug: "routes", key: "routes" },
  { slug: "runtime", key: "runtime" },
  { slug: "errors", key: "errors" },
  { slug: "compare", key: "compare" },
] as const;

export function DocsSidebar({
  lang,
  labels,
}: {
  lang: Locale;
  labels: Record<string, string>;
}) {
  const pathname = usePathname();
  const base = `/${lang}/docs`;
  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:gap-0 md:overflow-visible md:pb-0">
      {PAGES.map((p) => {
        const href = p.slug ? `${base}/${p.slug}` : base;
        const active = pathname === href;
        return (
          <Link
            key={p.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              "shrink-0 whitespace-nowrap border border-ink px-3 py-1.5 font-ui text-[12px] font-bold uppercase tracking-wide md:border-0 md:border-l-4 md:py-1.5 " +
              (active
                ? "bg-ink text-canvas md:bg-transparent md:border-l-ink md:text-ink md:underline"
                : "bg-canvas text-ink md:border-l-transparent md:text-ink/70 hover:md:text-ink")
            }
          >
            {labels[p.key] ?? p.key}
          </Link>
        );
      })}
    </nav>
  );
}
