"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { locales, localeNames, type Locale } from "@/lib/i18n";

// Switches locale while preserving the rest of the path. Lives on the black
// banner: the active locale is a yellow sticker, the others classic links.
export function LangSwitcher({ current }: { current: Locale }) {
  const pathname = usePathname();
  const rest = pathname.replace(/^\/[^/]+/, "");

  return (
    <nav aria-label="Language" className="flex flex-wrap items-center gap-1">
      {locales.map((l) => {
        const active = l === current;
        return (
          <Link
            key={l}
            href={`/${l}${rest}`}
            aria-current={active ? "true" : undefined}
            className={
              active
                ? "border border-ink bg-yellow px-1.5 py-0.5 font-ui text-[11px] font-bold text-ink"
                : "px-1.5 py-0.5 font-ui text-[11px] font-bold text-canvas underline underline-offset-2 hover:bg-canvas hover:text-ink"
            }
          >
            {localeNames[l]}
          </Link>
        );
      })}
    </nav>
  );
}
