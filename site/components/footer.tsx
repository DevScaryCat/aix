import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { GITHUB_URL } from "./banner";

// footer-band: icon-label nav (text-only here), classic-blue links, and the
// small-print row in Times Roman.
export function Footer({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  return (
    <footer className="mt-auto border-t border-ink bg-canvas">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Link href={`/${lang}`} className="prose-link font-ui text-[12px] font-bold uppercase">
            {dict.nav.home}
          </Link>
          <Link href={`/${lang}/docs`} className="prose-link font-ui text-[12px] font-bold uppercase">
            {dict.nav.docs}
          </Link>
          <a href={GITHUB_URL} className="prose-link font-ui text-[12px] font-bold uppercase">
            {dict.nav.github}
          </a>
        </nav>
        <p className="mt-3 max-w-2xl font-body text-[13px] leading-[1.5] text-ink">
          {dict.footer.tagline}
        </p>
        <p className="mt-2 font-mono text-[11px] text-ink/60">
          {dict.footer.builtWith} · {dict.footer.license} · {dict.footer.designNote}
        </p>
      </div>
    </footer>
  );
}
