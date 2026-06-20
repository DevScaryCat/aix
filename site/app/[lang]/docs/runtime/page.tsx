import { isLocale, defaultLocale, type Locale } from "@/lib/i18n";
import { getDocs } from "../content";

export default async function Runtime({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : defaultLocale;
  const d = (await getDocs(locale)).runtime;

  return (
    <article className="space-y-4">
      <h1 className="font-display text-[30px] leading-none text-ink sm:text-[38px]">{d.title}</h1>
      <p className="font-body text-[14px] leading-[1.55] text-ink">{d.lead}</p>
      <ol className="list-decimal space-y-2 border border-ink bg-canvas py-3 pl-8 pr-4 font-body text-[14px] leading-[1.5] text-ink">
        {d.rules.map((r: string, i: number) => (
          <li key={i}>{r}</li>
        ))}
      </ol>
    </article>
  );
}
