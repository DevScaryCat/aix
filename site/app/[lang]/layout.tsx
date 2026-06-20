import type { Metadata } from "next";
import "../globals.css";
import { locales, isLocale, defaultLocale, type Locale } from "@/lib/i18n";
import { getDictionary } from "./dictionaries";
import { Banner } from "@/components/banner";
import { Footer } from "@/components/footer";

// Pre-render all five locales; reject anything else with a 404 (no SSR for
// unknown locales).
export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : defaultLocale;
  const dict = await getDictionary(locale);
  return {
    title: dict.meta.title,
    description: dict.meta.description,
  };
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : defaultLocale;
  const dict = await getDictionary(locale);

  return (
    <html lang={locale}>
      <body className="bg-ink">
        {/* The literal black page frame — Dell 1996's single most identifiable chrome. */}
        <div className="flex min-h-screen flex-col border-[6px] border-ink bg-canvas sm:border-8">
          <Banner lang={locale} dict={dict} />
          <main className="flex-1">{children}</main>
          <Footer lang={locale} dict={dict} />
        </div>
      </body>
    </html>
  );
}
