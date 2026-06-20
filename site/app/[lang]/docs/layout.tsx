import { isLocale, defaultLocale, type Locale } from "@/lib/i18n";
import { getDocs } from "./content";
import { DocsSidebar } from "@/components/docs-sidebar";

export default async function DocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : defaultLocale;
  const docs = await getDocs(locale);

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[190px_1fr]">
      <aside className="md:sticky md:top-4 md:self-start">
        <DocsSidebar lang={locale} labels={docs.nav} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
