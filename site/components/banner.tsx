import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { LangSwitcher } from "./lang-switcher";

export const GITHUB_URL = "https://github.com/DevScaryCat/aix";

// top-banner: pure-black strip with the wordmark, nav, the red repo callout
// (the 1996 "phone number" analog — red reserved for this + the hero CTA), and
// the language switcher.
export function Banner({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  return (
    <header className="bg-ink text-canvas">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <Link href={`/${lang}`} className="font-display text-[22px] leading-none text-canvas">
            aix
          </Link>
          <span className="hidden font-ui text-[11px] uppercase tracking-wide text-canvas/70 sm:inline">
            {dict.hero.tagline}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            href={`/${lang}/docs`}
            className="font-ui text-[12px] font-bold uppercase tracking-wide text-canvas underline-offset-2 hover:underline"
          >
            {dict.nav.docs}
          </Link>
          <a
            href={GITHUB_URL}
            className="font-mono text-[12px] font-bold text-primary underline-offset-2 hover:underline"
          >
            github ↗
          </a>
          <LangSwitcher current={lang} />
        </div>
      </div>
    </header>
  );
}
